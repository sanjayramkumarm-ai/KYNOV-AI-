import { Schema, model, type Document, type Types } from 'mongoose';

export interface UserPreferenceDoc extends Document<Types.ObjectId> {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  theme: 'dark' | 'light' | 'system';
  accent: string;
  voice: {
    enabled: boolean;
    voiceURI?: string;
    lang: string;
    rate: number;
    pitch: number;
    autoSpeak: boolean;
    wakeWordEnabled: boolean;
  };
  notifications: {
    inApp: boolean;
    reminders: boolean;
    reminderLeadMinutes: number;
    emailDigest: boolean;
  };
  search: { includeEmails: boolean; topK: number };
  formatting: { density: 'comfortable' | 'compact' };
}

const prefSchema = new Schema<UserPreferenceDoc>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    theme: { type: String, enum: ['dark', 'light', 'system'], default: 'dark' },
    accent: { type: String, default: 'cyan' },
    voice: {
      enabled: { type: Boolean, default: true },
      voiceURI: String,
      lang: { type: String, default: 'en-IN' },
      rate: { type: Number, default: 1, min: 0.5, max: 2 },
      pitch: { type: Number, default: 1, min: 0, max: 2 },
      autoSpeak: { type: Boolean, default: true },
      wakeWordEnabled: { type: Boolean, default: false },
    },
    notifications: {
      inApp: { type: Boolean, default: true },
      reminders: { type: Boolean, default: true },
      reminderLeadMinutes: { type: Number, default: 15 },
      emailDigest: { type: Boolean, default: false },
    },
    search: {
      includeEmails: { type: Boolean, default: true },
      topK: { type: Number, default: 8, min: 3, max: 30 },
    },
    formatting: { density: { type: String, enum: ['comfortable', 'compact'], default: 'comfortable' } },
  },
  { timestamps: true },
);

export const UserPreference = model<UserPreferenceDoc>('UserPreference', prefSchema);
