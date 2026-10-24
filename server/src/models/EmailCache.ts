import { Schema, model, type Document, type Types } from 'mongoose';

/**
 * Metadata-only cache of Gmail messages the user has explicitly opened or
 * searched. Bodies are cached briefly to keep AI summaries fast and to avoid
 * hammering the Gmail API; nothing is cached until the user connects Gmail and
 * consents to the read-only scope. Mirrored mail is never shared across users.
 */
export interface EmailCacheDoc extends Document<Types.ObjectId> {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  gmailId: string;
  threadId: string;
  subject: string;
  from: { name?: string; email: string };
  to: string[];
  snippet: string;
  internalDate: Date;
  labelIds: string[];
  hasAttachments: boolean;
  unread: boolean;
  bodyText?: string;
  bodyFetchedAt?: Date;
  searchText?: string;
  updatedAt: Date;
}

const emailCacheSchema = new Schema<EmailCacheDoc>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    gmailId: { type: String, required: true },
    threadId: { type: String, required: true },
    subject: { type: String, default: '(no subject)', maxlength: 500 },
    from: {
      name: String,
      email: { type: String, required: true, lowercase: true },
    },
    to: { type: [String], default: [] },
    snippet: { type: String, maxlength: 1000 },
    internalDate: { type: Date, required: true },
    labelIds: { type: [String], default: [] },
    hasAttachments: { type: Boolean, default: false },
    unread: { type: Boolean, default: false },
    bodyText: String,
    bodyFetchedAt: Date,
    searchText: String,
  },
  { timestamps: true },
);

emailCacheSchema.index({ user: 1, gmailId: 1 }, { unique: true });
emailCacheSchema.index({ user: 1, internalDate: -1 });
emailCacheSchema.index({ user: 1, 'from.email': 1 });

export const EmailCache = model<EmailCacheDoc>('EmailCache', emailCacheSchema);
