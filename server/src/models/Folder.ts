import { Schema, model, type Document, type Types } from 'mongoose';

export interface FolderDoc extends Document<Types.ObjectId> {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  name: string;
  parent: Types.ObjectId | null;
  path: string; // materialised path e.g. /Projects/AI
  color?: string;
  createdAt: Date;
  updatedAt: Date;
}

const folderSchema = new Schema<FolderDoc>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    parent: { type: Schema.Types.ObjectId, ref: 'Folder', default: null },
    path: { type: String, required: true, default: '/' },
    color: { type: String, maxlength: 20 },
  },
  { timestamps: true },
);

folderSchema.index({ user: 1, parent: 1, name: 1 }, { unique: true });
folderSchema.index({ user: 1, path: 1 });

export const Folder = model<FolderDoc>('Folder', folderSchema);
