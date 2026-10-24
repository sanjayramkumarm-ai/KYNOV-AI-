import { Schema, model, type Document, type Types } from 'mongoose';

export interface NotificationDoc extends Document<Types.ObjectId> {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  type: 'system' | 'file' | 'email' | 'task' | 'ai' | 'reminder';
  title: string;
  body?: string;
  link?: string;
  read: boolean;
  meta?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<NotificationDoc>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['system', 'file', 'email', 'task', 'ai', 'reminder'], default: 'system' },
    title: { type: String, required: true, maxlength: 200 },
    body: { type: String, maxlength: 1000 },
    link: String,
    read: { type: Boolean, default: false },
    meta: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, read: 1 });

export const Notification = model<NotificationDoc>('Notification', notificationSchema);
