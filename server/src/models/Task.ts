import { Schema, model, type Document, type Types } from 'mongoose';

export interface TaskDoc extends Document<Types.ObjectId> {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  title: string;
  notes?: string;
  dueAt?: Date | null;
  remindAt?: Date | null;
  priority: 'low' | 'medium' | 'high';
  status: 'todo' | 'done';
  completedAt?: Date | null;
  source: {
    type: 'manual' | 'email' | 'file' | 'ai';
    refId?: string;
    label?: string;
  };
  tags: string[];
  reminderSent: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const taskSchema = new Schema<TaskDoc>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    notes: { type: String, maxlength: 4000 },
    dueAt: { type: Date, default: null },
    remindAt: { type: Date, default: null },
    priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    status: { type: String, enum: ['todo', 'done'], default: 'todo' },
    completedAt: { type: Date, default: null },
    source: {
      type: { type: String, enum: ['manual', 'email', 'file', 'ai'], default: 'manual' },
      refId: String,
      label: String,
    },
    tags: { type: [String], default: [] },
    reminderSent: { type: Boolean, default: false },
  },
  { timestamps: true },
);

taskSchema.index({ user: 1, status: 1, dueAt: 1 });
taskSchema.index({ user: 1, remindAt: 1, reminderSent: 1 });

export const Task = model<TaskDoc>('Task', taskSchema);
