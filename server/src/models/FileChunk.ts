import { Schema, model, type Document, type Types } from 'mongoose';

/**
 * Extracted text chunks + their vector embeddings. This is the collection an
 * Atlas Vector Search index is created on (field: `embedding`, numDimensions
 * must equal the embedding dimension used by your provider).
 */
export interface FileChunkDoc extends Document<Types.ObjectId> {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  file: Types.ObjectId;
  fileName: string;
  chunkIndex: number;
  page?: number;
  section?: string;
  text: string;
  tokenCount: number;
  embedding: number[];
  embeddingModel: string;
  createdAt: Date;
}

const chunkSchema = new Schema<FileChunkDoc>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    file: { type: Schema.Types.ObjectId, ref: 'File', required: true, index: true },
    fileName: { type: String, required: true },
    chunkIndex: { type: Number, required: true },
    page: Number,
    section: String,
    text: { type: String, required: true },
    tokenCount: { type: Number, default: 0 },
    embedding: { type: [Number], required: true, select: false },
    embeddingModel: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

chunkSchema.index({ user: 1, file: 1, chunkIndex: 1 }, { unique: true });
chunkSchema.index({ user: 1, createdAt: -1 });

export const FileChunk = model<FileChunkDoc>('FileChunk', chunkSchema);
