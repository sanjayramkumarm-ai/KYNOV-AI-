import { Schema, model, type Document, type Types } from 'mongoose';

export interface ConversationDoc extends Document<Types.ObjectId> {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  title: string;
  pinned: boolean;
  archived: boolean;
  messageCount: number;
  lastMessageAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const conversationSchema = new Schema<ConversationDoc>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, default: 'New conversation', trim: true, maxlength: 120 },
    pinned: { type: Boolean, default: false },
    archived: { type: Boolean, default: false },
    messageCount: { type: Number, default: 0 },
    lastMessageAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

conversationSchema.index({ user: 1, lastMessageAt: -1 });
conversationSchema.index({ user: 1, pinned: -1, lastMessageAt: -1 });

export const Conversation = model<ConversationDoc>('Conversation', conversationSchema);
