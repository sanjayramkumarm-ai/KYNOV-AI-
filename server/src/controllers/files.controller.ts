import fs from 'node:fs';
import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { FileChunk, Folder, KynovFile, User } from '../models';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { ok, pageMeta, parsePagination, escapeRegex } from '../utils/http';
import { features } from '../config/features';
import { env } from '../config/env';
import { getStorage, storageStatus } from '../services/storage';
import {
  deleteFilePermanently,
  readFileBuffer,
  restoreFile,
  softDeleteFile,
  storageSummary,
  storeUpload,
  fileCounts,
} from '../services/files';
import { extractText } from '../services/extract';
import { indexFileText, removeFileIndex } from '../services/vector';
import { summariseText } from '../services/rag';
import { logger } from '../utils/logger';

async function assertFolderOwnership(userId: string, folderId?: string | null) {
  if (!folderId) return null;
  const folder = await Folder.findOne({ _id: folderId, user: userId }).lean();
  if (!folder) throw ApiError.badRequest('That folder does not exist in your workspace.');
  return folder;
}

async function findOwnedFile(userId: string, fileId: string, opts: { includeTrash?: boolean } = {}) {
  if (!mongoose.isValidObjectId(fileId)) throw ApiError.badRequest('Invalid file id.');
  const file = await KynovFile.findOne({
    _id: fileId,
    user: userId,
    ...(opts.includeTrash ? {} : { deletedAt: null }),
  });
  if (!file) throw ApiError.notFound('File not found in your workspace.');
  return file;
}

export const list = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const q = req.query as Record<string, string | undefined>;
  const { page, limit, skip } = parsePagination(q);

  const filter: Record<string, unknown> = { user: userId, deletedAt: null };
  if (q.folder === 'root') filter.folder = null;
  else if (q.folder && q.folder !== 'all') filter.folder = q.folder;
  if (q.ext) filter.ext = { $in: q.ext.split(',').map((e) => e.trim().toLowerCase().replace('.', '')) };
  if (q.tag) filter.tags = q.tag.toLowerCase();
  if (q.favorite === 'true') filter.favorite = true;
  if (q.status && q.status !== 'all') filter.status = q.status;
  if (q.q) {
    const rx = new RegExp(escapeRegex(q.q), 'i');
    filter.$or = [{ name: rx }, { tags: rx }, { summary: rx }, { keywords: rx }];
  }

  const sortMap: Record<string, Record<string, 1 | -1>> = {
    recent: { createdAt: -1 },
    oldest: { createdAt: 1 },
    name: { name: 1 },
    size: { size: -1 },
  };
  const sort = sortMap[q.sort ?? 'recent'] ?? sortMap.recent;

  const [docs, total, folderDocs] = await Promise.all([
    KynovFile.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    KynovFile.countDocuments(filter),
    Folder.find({ user: userId }).sort({ name: 1 }).lean(),
  ]);

  return ok(
    res,
    {
      files: docs.map((d) => ({ ...d, id: String(d._id) })),
      folders: folderDocs.map((f) => ({ ...f, id: String(f._id) })),
      storage: storageSummary(),
      maxFileSizeMb: env.MAX_FILE_SIZE_MB,
    },
    200,
    pageMeta(total, page, limit),
  );
});

export const upload = asyncHandler(async (req: Request, res: Response) => {
  // Multer with .fields() returns { file: [...], files: [...] }
  const raw = req.files as Record<string, Express.Multer.File[]> | Express.Multer.File[] | undefined;
  const files: Express.Multer.File[] = Array.isArray(raw)
    ? raw
    : raw
      ? [...(raw.file ?? []), ...(raw.files ?? [])]
      : req.file
        ? [req.file]
        : [];
  if (!files.length) throw ApiError.badRequest('Attach at least one file to upload.');
  await assertFolderOwnership(req.user!.id, req.body.folder || null);

  const tags = String(req.body.tags ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  const created = [];
  const failed: { name: string; message: string }[] = [];
  for (const file of files) {
    try {
      const doc = await storeUpload({
        userId: req.user!.id,
        buffer: file.buffer,
        originalName: file.originalname,
        mimeType: file.mimetype,
        folderId: req.body.folder || null,
        tags,
      });
      created.push({
        id: String(doc._id),
        name: doc.name,
        ext: doc.ext,
        size: doc.size,
        status: doc.status,
        textExtracted: doc.textExtracted,
        pageCount: doc.pageCount,
        previewKind: doc.previewKind,
        note: doc.extractionError,
      });
    } catch (err: any) {
      logger.warn(`Upload failed for ${file.originalname}: ${err?.message}`);
      failed.push({ name: file.originalname, message: err?.message ?? 'Upload failed' });
    }
  }

  if (!created.length) {
    throw new ApiError(400, failed[0]?.message ?? 'Upload failed.', 'BAD_REQUEST', { failed });
  }
  return ok(res, { uploaded: created, failed }, 201);
});

export const detail = asyncHandler(async (req: Request, res: Response) => {
  const file = await findOwnedFile(req.user!.id, req.params.id);
  const chunkCount = await FileChunk.countDocuments({ file: file._id, user: req.user!.id });
  return ok(res, {
    file: { ...file.toObject(), id: String(file._id) },
    chunks: chunkCount,
    downloadUrl: `/api/files/${file._id}/content?download=1`,
    viewUrl: `/api/files/${file._id}/content`,
  });
});

/** Streams the stored object. Access is checked against ownership on every hit. */
export const content = asyncHandler(async (req: Request, res: Response) => {
  const file = await findOwnedFile(req.user!.id, req.params.id);
  const storage = getStorage();
  const download = req.query.download === '1';
  const inlineSafe = ['application/pdf', 'text/plain', 'text/markdown', 'text/csv', 'application/json'].includes(file.mimeType) ||
    file.mimeType.startsWith('image/');

  res.setHeader('Content-Type', inlineSafe ? file.mimeType : 'application/octet-stream');
  res.setHeader(
    'Content-Disposition',
    `${download || !inlineSafe ? 'attachment' : 'inline'}; filename="${encodeURIComponent(file.name)}"`,
  );
  res.setHeader('Cache-Control', 'private, max-age=60');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'");

  await KynovFile.updateOne({ _id: file._id }, { $set: { lastAccessedAt: new Date() }, $inc: { accessCount: 1 } });

  const stream = await storage.getStream(file.storage.key);
  stream.on('error', (err) => {
    logger.error('Storage stream error', err);
    if (!res.headersSent) res.status(502).end();
    else res.end();
  });
  stream.pipe(res);
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const file = await findOwnedFile(req.user!.id, req.params.id);
  const { name, folder, tags, favorite } = req.body as any;

  if (folder !== undefined && folder !== null) await assertFolderOwnership(req.user!.id, folder);

  if (name && name !== file.name) {
    // Keep the real extension so the preview + extraction logic stay correct.
    const ext = `.${file.ext}`;
    file.name = name.toLowerCase().endsWith(ext) ? name.slice(0, 255) : `${name}${ext}`.slice(0, 255);
    await FileChunk.updateMany({ file: file._id }, { $set: { fileName: file.name } });
  }
  if (folder !== undefined) file.folder = folder ? new mongoose.Types.ObjectId(folder) : null;
  if (tags !== undefined) file.tags = (tags as string[]).map((t) => t.toLowerCase().slice(0, 40)).slice(0, 12);
  if (favorite !== undefined) file.favorite = Boolean(favorite);

  await file.save();
  return ok(res, { file: { ...file.toObject(), id: String(file._id) } });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const permanent = req.query.permanent === 'true';
  if (permanent) {
    const result = await deleteFilePermanently(req.user!.id, req.params.id);
    return ok(res, { ...result, permanent: true });
  }
  const file = await softDeleteFile(req.user!.id, req.params.id);
  return ok(res, { id: String(file._id), name: file.name, permanent: false, message: 'Moved to trash. Restore it any time.' });
});

export const restore = asyncHandler(async (req: Request, res: Response) => {
  const file = await restoreFile(req.user!.id, req.params.id);
  return ok(res, { file: { ...file.toObject(), id: String(file._id) }, message: 'File restored and re-indexed.' });
});

export const trash = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, skip } = parsePagination(req.query as Record<string, unknown>);
  const filter = { user: req.user!.id, deletedAt: { $ne: null } };
  const [docs, total] = await Promise.all([
    KynovFile.find(filter).sort({ deletedAt: -1 }).skip(skip).limit(limit).lean(),
    KynovFile.countDocuments(filter),
  ]);
  return ok(res, docs.map((d) => ({ ...d, id: String(d._id) })), 200, pageMeta(total, page, limit));
});

export const emptyTrash = asyncHandler(async (req: Request, res: Response) => {
  const docs = await KynovFile.find({ user: req.user!.id, deletedAt: { $ne: null } }).select('_id').lean();
  for (const doc of docs) {
    await deleteFilePermanently(req.user!.id, String(doc._id)).catch(() => undefined);
  }
  return ok(res, { removed: docs.length });
});

/** Re-extract text and rebuild embeddings for one file. */
export const reindex = asyncHandler(async (req: Request, res: Response) => {
  const file = await findOwnedFile(req.user!.id, req.params.id);
  const buffer = await readFileBuffer(file);
  const extraction = await extractText(buffer, file.ext, file.mimeType);
  await removeFileIndex(String(file._id), req.user!.id);

  if (!extraction.supported || extraction.text.trim().length < 20) {
    file.textExtracted = false;
    file.extractionError = extraction.note ?? 'No readable text found in this file.';
    file.status = 'ready';
    await file.save();
    return ok(res, { indexed: 0, note: file.extractionError });
  }
  const indexed = await indexFileText({
    fileId: String(file._id),
    userId: req.user!.id,
    fileName: file.name,
    text: extraction.text,
  });
  file.textExtracted = indexed.chunks > 0;
  file.textLength = extraction.text.length;
  file.pageCount = extraction.pageCount;
  file.preview = extraction.text.replace(/\s+/g, ' ').slice(0, 600);
  file.extractionError = undefined;
  file.status = 'ready';
  await file.save();
  return ok(res, { indexed: indexed.chunks, strategy: indexed.strategy, model: indexed.model });
});

export const summarize = asyncHandler(async (req: Request, res: Response) => {
  const file = await findOwnedFile(req.user!.id, req.params.id);
  if (!features.ai) {
    throw ApiError.notConfigured(
      'AI summaries need an AI provider. Add AI_API_KEY to server/.env and restart the API.',
      { envVar: 'AI_API_KEY' },
    );
  }
  const chunks = await FileChunk.find({ file: file._id, user: req.user!.id }).sort({ chunkIndex: 1 }).limit(20).lean();
  const text = chunks.map((c) => c.text).join('\n\n');
  if (!text.trim()) {
    throw ApiError.badRequest('No readable text in this file yet. Run “Re-index” first, or use a text-based document.');
  }
  const { summary, keywords } = await summariseText(text, 'file');
  file.summary = summary;
  file.keywords = keywords;
  await file.save();
  return ok(res, { summary, keywords });
});

export const storage = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findById(req.user!.id).select('storageUsed storageQuota').lean();
  const counts = await fileCounts(req.user!.id);
  return ok(res, {
    ...storageStatus(),
    usedBytes: user?.storageUsed ?? 0,
    quotaBytes: user?.storageQuota ?? 0,
    percent: user?.storageQuota ? Math.min(100, Math.round(((user.storageUsed ?? 0) / user.storageQuota) * 100)) : 0,
    fileCount: counts.files,
    chunkCount: counts.chunks,
    byExt: await KynovFile.aggregate([
      { $match: { user: new mongoose.Types.ObjectId(req.user!.id), deletedAt: null } },
      { $group: { _id: '$ext', count: { $sum: 1 }, bytes: { $sum: '$size' } } },
      { $sort: { count: -1 } },
    ]),
  });
});

export const recent = asyncHandler(async (req: Request, res: Response) => {
  const limit = Math.min(20, Number(req.query.limit) || 6);
  const [recentFiles, frequent] = await Promise.all([
    KynovFile.find({ user: req.user!.id, deletedAt: null }).sort({ createdAt: -1 }).limit(limit).lean(),
    KynovFile.find({ user: req.user!.id, deletedAt: null, accessCount: { $gt: 0 } })
      .sort({ accessCount: -1, lastAccessedAt: -1 })
      .limit(limit)
      .lean(),
  ]);
  return ok(res, {
    recent: recentFiles.map((d) => ({ ...d, id: String(d._id) })),
    frequent: frequent.map((d) => ({ ...d, id: String(d._id) })),
  });
});

export const allowedTypes = asyncHandler(async (_req: Request, res: Response) => {
  return ok(res, { extensions: KynovFile.schema.path('ext') ? undefined : undefined, maxFileSizeMb: env.MAX_FILE_SIZE_MB });
});
