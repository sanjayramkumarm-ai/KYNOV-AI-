import { Schema, model, type Document, type Types } from 'mongoose';

export interface SourceRef {
  type: 'file' | 'email';
  id: string;
  name: string;
  page?: number;
  section?: string;
  snippet?: string;
  score?: number;
  meta?: Record<string, unknown>;
}

export interface MessageDoc extends Document<Types.ObjectId> {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  conversation: Types.ObjectId;
  role: 'user' | 'assistant' | 'system';
  content: string;
  intent?: string;
  sources: SourceRef[];
  attachments: SourceRef[];
  suggestedTasks?: { title: string; dueAt?: Date; notes?: string }[];
  modelName?: string;
  latencyMs?: number;
  createdAt: Date;
  updatedAt: Date;
}

const sourceSchema = new Schema<SourceRef>(
  {
    type: { type: String, enum: ['file', 'email'], required: true },
    id: { type: String, required: true },
    name: { type: String, required: true },
    page: Number,
    section: String,
    snippet: String,
    score: Number,
    meta: { type: Schema.Types.Mixed },
  },
  { _id: false },
);

const messageSchema = new Schema<MessageDoc>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    conversation: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
    role: { type: String, enum: ['user', 'assistant', 'system'], required: true },
    content: { type: String, required: true, maxlength: 40_000 },
    intent: String,
    sources: { type: [sourceSchema], default: [] },
    attachments: { type: [sourceSchema], default: [] },
    suggestedTasks: [
      {
        title: String,
        dueAt: Date,
        notes: String,
        _id: false,
      },
    ],
    modelName: String,
    latencyMs: Number,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

messageSchema.index({ conversation: 1, createdAt: 1 });
messageSchema.index({ user: 1, createdAt: -1 });

export const Message = model<MessageDoc>('Message', messageSchema);
