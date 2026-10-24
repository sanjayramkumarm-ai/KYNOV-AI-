import { Schema, model, type Document, type Types } from 'mongoose';

export const ALLOWED_EXTENSIONS = [
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'csv',
  'ppt',
  'pptx',
  'txt',
  'md',
  'json',
  'rtf',
  'png',
  'jpg',
  'jpeg',
  'webp',
  'gif',
  'svg',
  'bmp',
  'zip',
] as const;

export type FileStatus = 'uploading' | 'processing' | 'ready' | 'failed';
export type PreviewKind = 'pdf' | 'image' | 'text' | 'office' | 'archive' | 'none';

export interface KynovFileDoc extends Document<Types.ObjectId> {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  folder: Types.ObjectId | null;
  name: string;
  originalName: string;
  ext: string;
  mimeType: string;
  size: number;
  storage: { driver: 'local' | 's3'; key: string; bucket?: string; etag?: string };
  checksum: string;
  tags: string[];
  favorite: boolean;
  status: FileStatus;
  previewKind: PreviewKind;
  textExtracted: boolean;
  textLength: number;
  pageCount?: number;
  preview?: string;
  summary?: string;
  keywords: string[];
  extractionError?: string;
  lastAccessedAt?: Date;
  accessCount: number;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const fileSchema = new Schema<KynovFileDoc>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    folder: { type: Schema.Types.ObjectId, ref: 'Folder', default: null },
    name: { type: String, required: true, trim: true, maxlength: 255 },
    originalName: { type: String, required: true, trim: true },
    ext: { type: String, required: true, lowercase: true, index: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true, min: 0 },
    storage: {
      driver: { type: String, enum: ['local', 's3'], required: true },
      key: { type: String, required: true },
      bucket: String,
      etag: String,
    },
    checksum: { type: String, required: true },
    tags: { type: [String], default: [], index: true },
    favorite: { type: Boolean, default: false },
    status: { type: String, enum: ['uploading', 'processing', 'ready', 'failed'], default: 'processing' },
    previewKind: { type: String, enum: ['pdf', 'image', 'text', 'office', 'archive', 'none'], default: 'none' },
    textExtracted: { type: Boolean, default: false },
    textLength: { type: Number, default: 0 },
    pageCount: Number,
    preview: { type: String, maxlength: 4000 },
    summary: { type: String, maxlength: 4000 },
    keywords: { type: [String], default: [] },
    extractionError: String,
    lastAccessedAt: Date,
    accessCount: { type: Number, default: 0 },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

fileSchema.index({ user: 1, folder: 1, deletedAt: 1 });
fileSchema.index({ user: 1, createdAt: -1 });
fileSchema.index({ user: 1, name: 1 });
fileSchema.index({ user: 1, favorite: 1 });
fileSchema.index({ user: 1, tags: 1 });
fileSchema.index({ name: 'text', tags: 'text', summary: 'text', keywords: 'text' }, { name: 'kynov_file_text' });

fileSchema.virtual('id').get(function (this: KynovFileDoc) {
  return this._id.toString();
});

export const KynovFile = model<KynovFileDoc>('File', fileSchema);
