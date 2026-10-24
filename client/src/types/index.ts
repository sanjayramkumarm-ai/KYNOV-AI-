/* ─────────────────────────── Domain types ─────────────────────────── */

export interface User {
  _id: string;
  id?: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  authProvider: 'local' | 'google' | 'both';
  emailVerified: boolean;
  role: 'user' | 'admin';
  storageUsed: number;
  storageQuota: number;
  createdAt: string;
  lastLoginAt?: string;
}

export interface VoicePrefs {
  enabled: boolean;
  voiceURI?: string | null;
  lang: string;
  rate: number;
  pitch: number;
  autoSpeak: boolean;
  wakeWordEnabled: boolean;
}

export interface Preferences {
  _id?: string;
  theme: 'dark' | 'light' | 'system';
  accent: string;
  voice: VoicePrefs;
  notifications: {
    inApp: boolean;
    reminders: boolean;
    reminderLeadMinutes: number;
    emailDigest: boolean;
  };
  search: { includeEmails: boolean; topK: number };
  formatting: { density: 'comfortable' | 'compact' };
}

export interface FeatureFlags {
  ai: boolean;
  embeddings: 'remote' | 'local';
  gmail: boolean;
  googleSignIn: boolean;
  storageDriver: 'local' | 's3';
  vectorSearch: 'atlas' | 'in-process';
  chatModel: string | null;
  maxFileSizeMb: number;
}

export interface GoogleStatus {
  configured: boolean;
  connected: boolean;
  email: string | null;
  name?: string | null;
  scopes: string[];
  canSend: boolean;
  canRead?: boolean;
  connectedAt?: string | null;
  lastSyncedAt?: string | null;
  notice?: string;
  env?: { configured: boolean; requires: string[] };
}

export type PreviewKind = 'pdf' | 'image' | 'text' | 'office' | 'archive' | 'none';
export type FileStatus = 'uploading' | 'processing' | 'ready' | 'failed';

export interface KynovFile {
  _id: string;
  id: string;
  name: string;
  originalName: string;
  ext: string;
  mimeType: string;
  size: number;
  folder: string | null;
  folderId?: string | null;
  tags: string[];
  favorite: boolean;
  status: FileStatus;
  previewKind: PreviewKind;
  textExtracted: boolean;
  textLength?: number;
  pageCount?: number;
  preview?: string;
  summary?: string;
  keywords?: string[];
  extractionError?: string;
  accessCount?: number;
  lastAccessedAt?: string;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Folder {
  _id?: string;
  id: string;
  name: string;
  parent: string | null;
  path: string;
  color?: string;
  fileCount?: number;
  size?: number;
  children?: Folder[];
  depth?: number;
}

export interface StorageInfo {
  driver: 'local' | 's3';
  configured?: boolean;
  maxFileSizeMb: number;
  note?: string;
  usedBytes: number;
  quotaBytes: number;
  percent: number;
  fileCount: number;
  chunkCount?: number;
  byExt?: { _id: string; count: number; bytes: number }[];
}

export type SourceType = 'file' | 'email';

export interface SourceRef {
  type: SourceType;
  id: string;
  name: string;
  page?: number;
  section?: string;
  snippet?: string;
  score?: number;
  meta?: Record<string, any>;
}

export interface ChatMessage {
  _id?: string;
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  intent?: string;
  sources: SourceRef[];
  attachments: SourceRef[];
  modelName?: string;
  latencyMs?: number;
  createdAt: string;
}

export interface Conversation {
  _id?: string;
  id: string;
  title: string;
  pinned: boolean;
  archived: boolean;
  messageCount: number;
  lastMessageAt: string;
  createdAt: string;
}

export interface FileSearchHit {
  id: string;
  name: string;
  ext: string;
  mimeType: string;
  size: number;
  folderId: string | null;
  tags: string[];
  favorite: boolean;
  previewKind: PreviewKind;
  status: FileStatus;
  summary?: string;
  pageCount?: number;
  createdAt: string;
  updatedAt: string;
  score: number;
  reason: string;
  snippet?: string;
  page?: number;
  matchType: 'filename' | 'content' | 'tag' | 'summary' | 'recent' | 'filter';
}

export interface EmailSearchHit {
  id: string;
  gmailId: string;
  threadId: string;
  subject: string;
  from: { name?: string; email: string };
  to: string[];
  snippet: string;
  date: string;
  unread: boolean;
  hasAttachments: boolean;
  score: number;
  reason: string;
  matchType: 'subject' | 'sender' | 'body' | 'date' | 'filter';
}

export interface SearchResponse {
  query: string;
  scope: 'all' | 'files' | 'emails';
  dateRange: { from?: string; to?: string; label?: string } | null;
  files: FileSearchHit[];
  emails: EmailSearchHit[];
  counts: { files: number; emails: number };
  gmailConnected: boolean;
  aiConfigured: boolean;
}

export interface AskResponse {
  answer: string;
  intent: string;
  mode: 'ai' | 'retrieval';
  sources: SourceRef[];
  attachments: SourceRef[];
  files: FileSearchHit[];
  model?: string;
  latencyMs: number;
  notice?: string;
  aiConfigured?: boolean;
}

export interface Task {
  _id?: string;
  id: string;
  title: string;
  notes?: string;
  dueAt?: string | null;
  remindAt?: string | null;
  priority: 'low' | 'medium' | 'high';
  status: 'todo' | 'done';
  completedAt?: string | null;
  source: { type: 'manual' | 'email' | 'file' | 'ai'; refId?: string; label?: string };
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Notification {
  id: string;
  type: 'system' | 'file' | 'email' | 'task' | 'ai' | 'reminder';
  title: string;
  body?: string;
  link?: string;
  read: boolean;
  createdAt: string;
}

export interface GmailMessageSummary {
  gmailId: string;
  threadId: string;
  subject: string;
  from: { name?: string; email: string };
  to: string[];
  snippet: string;
  date: string;
  unread: boolean;
  hasAttachments: boolean;
  labels?: string[];
  source?: 'gmail' | 'cache';
}

export interface GmailAttachment {
  filename: string;
  mimeType: string;
  size: number;
  attachmentId: string;
}

export interface GmailFullMessage extends GmailMessageSummary {
  bodyText: string;
  bodyHtml?: string;
  attachments: GmailAttachment[];
  headers: Record<string, string>;
}

export interface InboxResponse {
  connected: boolean;
  configured: boolean;
  messages: GmailMessageSummary[];
  nextPageToken: string | null;
  notice?: string;
  resultSizeEstimate?: number;
}

export interface VoiceCommandResult {
  transcript: string;
  action: { type: string; route?: string; query?: string };
  spoken: string;
  results:
    | {
        files?: FileSearchHit[];
        emails?: EmailSearchHit[];
        route?: string;
        answer?: string;
        sources?: SourceRef[];
        mode?: string;
        suggestedTask?: { title: string };
      }
    | null;
  aiConfigured?: boolean;
}

export interface SuggestedTask {
  title: string;
  dueAt?: string;
  notes?: string;
  priority?: 'low' | 'medium' | 'high';
  source?: { type: string; refId?: string; label?: string };
}

export interface AuthPayload {
  user: User;
  preferences: Preferences;
  features: FeatureFlags;
  google: {
    configured: boolean;
    connected: boolean;
    email: string | null;
    scopes: string[];
    canSend: boolean;
  };
}

export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  meta?: { page: number; limit: number; total: number; totalPages: number; hasMore: boolean };
}
