import { api } from './api';
import type {
  AskResponse,
  AuthPayload,
  ChatMessage,
  Conversation,
  EmailSearchHit,
  FeatureFlags,
  FileSearchHit,
  Folder,
  GmailFullMessage,
  GoogleStatus,
  InboxResponse,
  KynovFile,
  Notification,
  Preferences,
  SearchResponse,
  StorageInfo,
  SuggestedTask,
  Task,
  User,
  VoiceCommandResult,
} from '../types';

/* ── Auth ─────────────────────────────────────────────────────── */
export const authApi = {
  signup: (body: { name: string; email: string; password: string }) => api.post<AuthPayload>('/api/auth/signup', body),
  login: (body: { email: string; password: string }) => api.post<AuthPayload>('/api/auth/login', body),
  logout: () => api.post<{ message: string }>('/api/auth/logout'),
  me: () => api.get<AuthPayload>('/api/auth/me'),
  updateProfile: (body: { name?: string; avatarUrl?: string | null }) => api.patch<{ user: User }>('/api/auth/me', body),
  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    api.post<{ message: string }>('/api/auth/change-password', body),
  deleteAccount: (body: { confirm: 'DELETE'; password?: string }) =>
    api.del<{ message: string }>('/api/auth/me', body),
  googleSignInUrl: () => api.get<{ url: string }>('/api/auth/google/start'),
};

/* ── Files & folders ──────────────────────────────────────────── */
export const filesApi = {
  list: (params: Record<string, string | number | undefined> = {}) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') qs.set(k, String(v));
    return api.get<{ files: KynovFile[]; folders: Folder[]; storage: any; maxFileSizeMb: number }>(
      `/api/files?${qs.toString()}`,
    );
  },
  detail: (id: string) => api.get<{ file: KynovFile; chunks: number; downloadUrl: string; viewUrl: string }>(`/api/files/${id}`),
  upload: (files: File[], opts: { folder?: string | null; tags?: string[] } = {}) => {
    const fd = new FormData();
    for (const f of files) fd.append('files', f);
    if (opts.folder) fd.set('folder', opts.folder);
    if (opts.tags?.length) fd.set('tags', opts.tags.join(','));
    return api.upload<{
      uploaded: { id: string; name: string; ext: string; size: number; status: string; textExtracted: boolean; note?: string }[];
      failed: { name: string; message: string }[];
    }>('/api/files', fd);
  },
  update: (id: string, body: { name?: string; folder?: string | null; tags?: string[]; favorite?: boolean }) =>
    api.patch<{ file: KynovFile }>(`/api/files/${id}`, body),
  remove: (id: string, permanent = false) =>
    api.del<{ id: string; name?: string; permanent?: boolean; message?: string }>(`/api/files/${id}${permanent ? '?permanent=true' : ''}`),
  restore: (id: string) => api.post<{ file: KynovFile; message: string }>(`/api/files/${id}/restore`),
  reindex: (id: string) => api.post<{ indexed: number; note?: string; strategy?: string }>(`/api/files/${id}/reindex`),
  summarize: (id: string) => api.post<{ summary: string; keywords: string[] }>(`/api/files/${id}/summarize`),
  storage: () => api.get<StorageInfo>('/api/files/storage'),
  recent: (limit = 6) =>
    api.get<{ recent: KynovFile[]; frequent: KynovFile[] }>(`/api/files/recent?limit=${limit}`),
  trash: () => api.get<KynovFile[]>('/api/files/trash'),
  emptyTrash: () => api.del<{ removed: number }>('/api/files/trash'),
};

export const foldersApi = {
  list: () => api.get<{ folders: Folder[]; tree: Folder[]; rootFileCount: number }>('/api/folders'),
  create: (body: { name: string; parent?: string | null; color?: string }) => api.post<{ folder: Folder }>('/api/folders', body),
  update: (id: string, body: { name?: string; parent?: string | null; color?: string }) =>
    api.patch<{ folder: Folder }>(`/api/folders/${id}`, body),
  remove: (id: string, recursive = false) =>
    api.del<{ message: string }>(`/api/folders/${id}${recursive ? '?recursive=true' : ''}`),
};

/* ── Chat / RAG ───────────────────────────────────────────────── */
export const chatApi = {
  conversations: () => api.get<Conversation[]>('/api/chat/conversations?limit=50'),
  createConversation: (title?: string) => api.post<{ conversation: Conversation; messages: ChatMessage[] }>('/api/chat/conversations', { title }),
  get: (id: string) => api.get<{ conversation: Conversation; messages: ChatMessage[] }>(`/api/chat/conversations/${id}`),
  update: (id: string, body: { title?: string; pinned?: boolean; archived?: boolean }) =>
    api.patch<{ conversation: Conversation }>(`/api/chat/conversations/${id}`, body),
  remove: (id: string) => api.del<{ id: string; message: string }>(`/api/chat/conversations/${id}`),
  send: (body: { conversationId?: string; message: string; fileId?: string; includeEmails?: boolean }) =>
    api.post<{
      conversation: Conversation;
      userMessage: ChatMessage;
      assistantMessage: ChatMessage;
      mode: 'ai' | 'retrieval';
      notice?: string;
      files: FileSearchHit[];
    }>('/api/chat/message', body),
  ask: (body: { question: string; fileId?: string; includeEmails?: boolean }) => api.post<AskResponse>('/api/chat/ask', body),
};

/* ── Search ───────────────────────────────────────────────────── */
export const searchApi = {
  unified: (params: Record<string, string | number | undefined>) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') qs.set(k, String(v));
    return api.get<SearchResponse>(`/api/search?${qs.toString()}`);
  },
  files: (params: Record<string, string | number | undefined>) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') qs.set(k, String(v));
    return api.get<{ results: FileSearchHit[]; terms: string[]; scanned: number }>(`/api/search/files?${qs.toString()}`);
  },
};

/* ── Gmail ────────────────────────────────────────────────────── */
export const gmailApi = {
  status: () => api.get<GoogleStatus>('/api/gmail/status'),
  connectUrl: (mode: 'read' | 'send' = 'read') => api.get<{ url: string; scopes: string[] }>(`/api/gmail/oauth/start?mode=${mode}`),
  disconnect: () => api.post<{ connected: boolean; revoked: boolean; message: string }>('/api/gmail/disconnect'),
  inbox: (params: { q?: string; pageToken?: string; maxResults?: number; unreadOnly?: boolean } = {}) => {
    const qs = new URLSearchParams();
    if (params.q) qs.set('q', params.q);
    if (params.pageToken) qs.set('pageToken', params.pageToken);
    if (params.maxResults) qs.set('maxResults', String(params.maxResults));
    if (params.unreadOnly) qs.set('unreadOnly', 'true');
    return api.get<InboxResponse>(`/api/gmail/inbox?${qs.toString()}`);
  },
  search: (params: { q?: string; sender?: string; subject?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') qs.set(k, String(v));
    return api.get<{
      connected: boolean;
      results: (EmailSearchHit & { source?: string })[];
      cached: EmailSearchHit[];
      liveError?: string | null;
    }>(`/api/gmail/search?${qs.toString()}`);
  },
  message: (id: string) => api.get<GmailFullMessage>(`/api/gmail/messages/${id}`),
  summarize: (id: string) =>
    api.get<{ configured: boolean; summary: string | null; keywords?: string[]; notice?: string; bodyText: string }>(
      `/api/gmail/messages/${id}/summary`,
    ),
  tasks: (id: string) =>
    api.get<{ suggestions: SuggestedTask[]; message: string }>(`/api/gmail/messages/${id}/tasks`),
  draftReply: (id: string, body: { instruction?: string; tone?: string }) =>
    api.post<{ to: string; subject: string; body: string; threadId: string; model?: string }>(
      `/api/gmail/messages/${id}/draft-reply`,
      body,
    ),
  send: (body: { to: string; cc?: string; subject: string; body: string; threadId?: string; confirmed: true }) =>
    api.post<{ id: string; threadId: string }>('/api/gmail/send', body),
};

/* ── Tasks & notifications ────────────────────────────────────── */
export const tasksApi = {
  list: (params: { status?: string; filter?: string; q?: string } = {}) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) qs.set(k, String(v));
    return api.get<{ tasks: Task[]; counts: { todo: number; done: number; overdue: number } }>(`/api/tasks?${qs.toString()}`);
  },
  upcoming: () => api.get<{ upcoming: Task[]; overdue: Task[] }>('/api/tasks/upcoming'),
  create: (body: Partial<Task> & { title: string }) => api.post<{ task: Task }>('/api/tasks', body),
  update: (id: string, body: Partial<Task> & { completed?: boolean }) => api.patch<{ task: Task }>(`/api/tasks/${id}`, body),
  remove: (id: string) => api.del<{ id: string }>(`/api/tasks/${id}`),
  suggestions: (params: { fileId?: string; gmailId?: string }) => {
    const qs = new URLSearchParams();
    if (params.fileId) qs.set('fileId', params.fileId);
    if (params.gmailId) qs.set('gmailId', params.gmailId);
    return api.get<{ source: { type: string; refId: string; label: string }; suggestions: SuggestedTask[] }>(
      `/api/tasks/suggestions?${qs.toString()}`,
    );
  },
};

export const notificationsApi = {
  list: () => api.get<{ notifications: Notification[]; unread: number }>('/api/notifications?limit=25'),
  markRead: (id: string) => api.post<{ id: string }>(`/api/notifications/${id}/read`),
  markAllRead: () => api.post<{ updated: number }>('/api/notifications/read-all'),
  remove: (id: string) => api.del<{ id: string }>(`/api/notifications/${id}`),
};

/* ── Preferences & voice ──────────────────────────────────────── */
export const preferencesApi = {
  get: () => api.get<{ preferences: Preferences }>('/api/preferences'),
  update: (body: DeepPartial<Preferences>) => api.put<{ preferences: Preferences }>('/api/preferences', body),
};

export const voiceApi = {
  command: (transcript: string) => api.post<VoiceCommandResult>('/api/voice/command', { transcript }),
};

export const metaApi = {
  features: () => api.get<FeatureFlags>('/api/meta/features'),
  config: () => api.get<{ features: FeatureFlags; storage: StorageInfo; rag: any }>('/api/config'),
};

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };
