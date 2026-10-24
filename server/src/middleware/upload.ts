import multer from 'multer';
import path from 'node:path';
import { env } from '../config/env';
import { ALLOWED_EXTENSIONS } from '../models/KynovFile';
import { ApiError } from '../utils/ApiError';

const ALLOWED_MIME_PREFIXES = ['image/', 'text/'];
const ALLOWED_MIME_EXACT = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/json',
  'application/rtf',
  'application/octet-stream', // browsers send this for some office/zip variants
  'application/zip',
  'application/x-zip-compressed',
]);

const allowedExt = new Set<string>(ALLOWED_EXTENSIONS as unknown as string[]);

export function isAllowedFile(originalName: string, mimetype: string): { ok: boolean; reason?: string } {
  const ext = path.extname(originalName).replace('.', '').toLowerCase();
  if (!ext) return { ok: false, reason: 'File has no extension.' };
  if (!allowedExt.has(ext)) return { ok: false, reason: `.${ext} files are not supported.` };
  const mimeOk = ALLOWED_MIME_EXACT.has(mimetype) || ALLOWED_MIME_PREFIXES.some((p) => mimetype.startsWith(p));
  if (!mimeOk) return { ok: false, reason: `Content type ${mimetype} is not allowed.` };
  return { ok: true };
}

/**
 * Multer keeps the upload in memory (bounded by MAX_FILE_SIZE_MB) so we can
 * checksum it and stream it straight to object storage without touching disk.
 */
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.MAX_FILE_SIZE_MB * 1024 * 1024,
    files: 10,
    fields: 20,
  },
  fileFilter: (_req, file, cb) => {
    // Multer decodes the filename as latin1 for non-ASCII names.
    const name = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const check = isAllowedFile(name, file.mimetype);
    if (!check.ok) return cb(ApiError.badRequest(check.reason ?? 'Unsupported file type.'));
    cb(null, true);
  },
});

/**
 * Accepts both `file` (single) and `files` (multi) field names.
 * The controller normalises either shape from req.files.
 */
export const uploadFields = upload.fields([
  { name: 'file', maxCount: 1 },
  { name: 'files', maxCount: 10 },
]);
export const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
}).single('avatar');
