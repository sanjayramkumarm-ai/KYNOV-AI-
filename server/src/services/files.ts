import crypto from 'node:crypto';
import path from 'node:path';
import mongoose from 'mongoose';
import { FileChunk, KynovFile, User, type KynovFileDoc } from '../models';
import { env } from '../config/env';
import { features } from '../config/features';
import { ApiError } from '../utils/ApiError';
import { logger } from '../utils/logger';
import { clamp } from '../utils/text';
import { extractText } from './extract';
import { buildStorageKey, getStorage } from './storage';
import { indexFileText, removeFileIndex } from './vector';
import { summariseText } from './rag';
import { notify } from './notifications';

const PREVIEW_KIND: Record<string, 'pdf' | 'image' | 'text' | 'office' | 'archive' | 'none'> = {
  pdf: 'pdf',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  webp: 'image',
  gif: 'image',
  bmp: 'image',
  svg: 'image',
  txt: 'text',
  md: 'text',
  json: 'text',
  csv: 'text',
  rtf: 'text',
  doc: 'office',
  docx: 'office',
  xls: 'office',
  xlsx: 'office',
  ppt: 'office',
  pptx: 'office',
  zip: 'archive',
};

const ENFORCE_QUOTA = true;

export async function ensureStorageCapacity(userId: string, incomingBytes: number) {
  if (!ENFORCE_QUOTA) return;
  const user = await User.findById(userId).select('storageUsed storageQuota');
  if (!user) throw ApiError.notFound('Account not found.');
  if (user.storageUsed + incomingBytes > user.storageQuota) {
    const gb = (user.storageQuota / 1024 ** 3).toFixed(1);
    throw new ApiError(
      413,
      `This upload would exceed your ${gb} GB storage quota. Delete some files or raise the quota.`,
      'PAYLOAD_TOO_LARGE',
    );
  }
}

/**
 * Upload pipeline: quota check → object storage → metadata → text extraction →
 * chunk + embed → (optional) AI summary. File bytes never touch MongoDB.
 */
export async function storeUpload(params: {
  userId: string;
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  folderId?: string | null;
  tags?: string[];
}) {
  const { userId, buffer } = params;
  const originalName = Buffer.from(params.originalName, 'latin1').toString('utf8');
  const ext = path.extname(originalName).replace('.', '').toLowerCase();
  if (!ext) throw ApiError.badRequest('File has no extension.');

  await ensureStorageCapacity(userId, buffer.length);

  const storageKey = buildStorageKey(userId, ext);
  const storage = getStorage();
  const stored = await storage.put(storageKey, buffer, params.mimeType);
  const checksum = crypto.createHash('sha256').update(buffer).digest('hex');

  const file = await KynovFile.create({
    user: userId,
    folder: params.folderId ? new mongoose.Types.ObjectId(params.folderId) : null,
    name: originalName.slice(0, 255),
    originalName: originalName.slice(0, 255),
    ext,
    mimeType: params.mimeType || 'application/octet-stream',
    size: buffer.length,
    storage: { driver: stored.driver, key: stored.key, bucket: stored.bucket, etag: stored.etag },
    checksum,
    tags: (params.tags ?? []).map((t) => t.toLowerCase().slice(0, 40)).slice(0, 12),
    status: 'processing',
    previewKind: PREVIEW_KIND[ext] ?? 'none',
  });

  await User.updateOne({ _id: userId }, { $inc: { storageUsed: buffer.length } });

  // Text extraction + embedding (synchronous so the file is instantly searchable)
  try {
    const extraction = await extractText(buffer, ext, params.mimeType);
    const text = extraction.text ?? '';
    if (extraction.supported && text.trim().length > 20) {
      const indexed = await indexFileText({
        fileId: String(file._id),
        userId,
        fileName: file.name,
        text,
      });
      file.textExtracted = indexed.chunks > 0;
      file.textLength = text.length;
      file.pageCount = extraction.pageCount;
      file.preview = clamp(text, 600);
      file.status = 'ready';
      await file.save();
      // AI summary runs in the background so the upload response stays fast.
      if (features.ai) void generateSummary(file, text);
    } else {
      file.status = 'ready';
      file.extractionError = extraction.note;
      file.textExtracted = false;
      await file.save();
    }
  } catch (err: any) {
    logger.error(`Processing failed for file ${file._id}`, err);
    file.status = 'failed';
    file.extractionError = err?.message?.slice(0, 500) ?? 'Processing failed';
    await file.save();
  }

  await notify({
    userId,
    type: 'file',
    title: `Uploaded ${file.name}`,
    body: file.textExtracted
      ? 'Text extracted and indexed for AI search.'
      : file.extractionError ?? 'Stored. Metadata is searchable.',
    link: `/files?file=${file._id}`,
  });

  return file;
}

export async function generateSummary(file: KynovFileDoc, text: string) {
  try {
    const { summary, keywords } = await summariseText(text, 'file');
    file.summary = summary;
    file.keywords = keywords;
    await file.save();
  } catch (err: any) {
    logger.warn(`Summary generation skipped for ${file.name}: ${err?.message}`);
  }
}

export async function deleteFilePermanently(userId: string, fileId: string) {
  const file = await KynovFile.findOne({ _id: fileId, user: userId });
  if (!file) throw ApiError.notFound('File not found.');
  const storage = getStorage();
  await storage.remove(file.storage.key).catch((err) => logger.warn('Storage delete failed', err));
  await removeFileIndex(String(file._id), userId);
  await file.deleteOne();
  await User.updateOne({ _id: userId }, { $inc: { storageUsed: -file.size } }).catch(() => undefined);
  return { id: fileId, name: file.name };
}

export async function softDeleteFile(userId: string, fileId: string) {
  const file = await KynovFile.findOneAndUpdate(
    { _id: fileId, user: userId, deletedAt: null },
    { $set: { deletedAt: new Date() } },
    { new: true },
  );
  if (!file) throw ApiError.notFound('File not found.');
  await removeFileIndex(String(file._id), userId);
  return file;
}

export async function restoreFile(userId: string, fileId: string) {
  const file = await KynovFile.findOneAndUpdate(
    { _id: fileId, user: userId, deletedAt: { $ne: null } },
    { $set: { deletedAt: null } },
    { new: true },
  );
  if (!file) throw ApiError.notFound('File not found in trash.');
  if (file.textExtracted) {
    const buffer = await getStorage().getBuffer(file.storage.key);
    const extraction = await extractText(buffer, file.ext, file.mimeType);
    if (extraction.text) {
      await indexFileText({ fileId: String(file._id), userId, fileName: file.name, text: extraction.text });
    }
  }
  return file;
}

export async function readFileBuffer(file: KynovFileDoc) {
  return getStorage().getBuffer(file.storage.key);
}

export function filePublicUrl(file: KynovFileDoc) {
  return `/api/files/${file._id}/content`;
}

export function storageSummary() {
  return { driver: getStorage().driver, maxFileSizeMb: env.MAX_FILE_SIZE_MB };
}

export async function fileCounts(userId: string) {
  const [files, chunks, agg] = await Promise.all([
    KynovFile.countDocuments({ user: userId, deletedAt: null }),
    FileChunk.countDocuments({ user: userId }),
    KynovFile.aggregate([{ $match: { user: new mongoose.Types.ObjectId(userId), deletedAt: null } }, { $group: { _id: null, bytes: { $sum: '$size' } } }]),
  ]);
  return { files, chunks, bytes: agg[0]?.bytes ?? 0 };
}
