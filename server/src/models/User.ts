import { Schema, model, type Document, type Types } from 'mongoose';

export interface GoogleConnection {
  connected: boolean;
  email?: string;
  name?: string;
  scopes: string[];
  accessToken?: string; // AES-256-GCM envelope (never returned to clients)
  refreshToken?: string; // AES-256-GCM envelope
  expiryDate?: number;
  connectedAt?: Date;
  lastSyncedAt?: Date;
}

export interface RefreshSession {
  tokenHash: string;
  userAgent?: string;
  ip?: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface UserDoc extends Document<Types.ObjectId> {
  _id: Types.ObjectId;
  email: string;
  name: string;
  passwordHash?: string;
  avatarUrl?: string;
  authProvider: 'local' | 'google' | 'both';
  googleId?: string;
  emailVerified: boolean;
  role: 'user' | 'admin';
  google: GoogleConnection;
  sessions: RefreshSession[];
  storageUsed: number;
  storageQuota: number;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const googleSchema = new Schema<GoogleConnection>(
  {
    connected: { type: Boolean, default: false },
    email: String,
    name: String,
    scopes: { type: [String], default: [] },
    accessToken: { type: String, select: false },
    refreshToken: { type: String, select: false },
    expiryDate: Number,
    connectedAt: Date,
    lastSyncedAt: Date,
  },
  { _id: false },
);

const sessionSchema = new Schema<RefreshSession>(
  {
    tokenHash: { type: String, required: true },
    userAgent: String,
    ip: String,
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
  },
  { _id: false },
);

const userSchema = new Schema<UserDoc>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    passwordHash: { type: String, select: false },
    avatarUrl: { type: String, maxlength: 500 },
    authProvider: { type: String, enum: ['local', 'google', 'both'], default: 'local' },
    googleId: { type: String, index: true, sparse: true },
    emailVerified: { type: Boolean, default: false },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    google: { type: googleSchema, default: () => ({ connected: false, scopes: [] }) },
    sessions: { type: [sessionSchema], default: [] },
    storageUsed: { type: Number, default: 0, min: 0 },
    storageQuota: { type: Number, default: 5 * 1024 * 1024 * 1024 },
    lastLoginAt: Date,
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: Record<string, any>) => {
        delete ret.passwordHash;
        delete ret.sessions;
        delete ret.__v;
        if (ret.google) {
          delete ret.google.accessToken;
          delete ret.google.refreshToken;
        }
        return ret;
      },
    },
  },
);

userSchema.index({ createdAt: -1 });

userSchema.virtual('storagePercent').get(function (this: UserDoc) {
  if (!this.storageQuota) return 0;
  return Math.min(100, Math.round((this.storageUsed / this.storageQuota) * 100));
});

export const User = model<UserDoc>('User', userSchema);
