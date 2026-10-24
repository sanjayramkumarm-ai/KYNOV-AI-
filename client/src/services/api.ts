/**
 * Typed fetch wrapper.
 *  - sends cookies (httpOnly session) with every request
 *  - adds the X-Requested-With CSRF header on unsafe methods
 *  - transparently refreshes an expired access token once, then retries
 *  - normalises every error into ApiError { status, code, message, details }
 */
const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') ?? '';

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, message: string, code = 'INTERNAL', details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  get isNotConfigured() {
    return this.code === 'FEATURE_NOT_CONFIGURED' || this.status === 503;
  }
  get isAuth() {
    return this.status === 401;
  }
}

type Options = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  formData?: FormData;
  signal?: AbortSignal;
  skipRefresh?: boolean;
};

let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_BASE}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-Requested-With': 'kynov-web' },
    })
      .then((r) => r.ok)
      .catch(() => false)
      .finally(() => {
        setTimeout(() => (refreshPromise = null), 50);
      });
  }
  return refreshPromise;
}

export async function request<T>(path: string, options: Options = {}): Promise<{ data: T; meta?: any }> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = { 'X-Requested-With': 'kynov-web' };
  let body: BodyInit | undefined;

  if (options.formData) {
    body = options.formData;
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  const doFetch = async (): Promise<Response> =>
    fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body,
      credentials: 'include',
      signal: options.signal,
    });

  let res = await doFetch();

  if (res.status === 401 && !options.skipRefresh && !path.startsWith('/api/auth/')) {
    const refreshed = await tryRefresh();
    if (refreshed) res = await doFetch();
  }

  const text = await res.text();
  let payload: any = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!res.ok) {
    const err = payload?.error;
    throw new ApiError(
      res.status,
      err?.message ?? `Request failed (${res.status} ${res.statusText})`,
      err?.code ?? 'INTERNAL',
      err?.details,
    );
  }

  return { data: (payload?.data ?? null) as T, meta: payload?.meta };
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { signal }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  del: <T>(path: string, body?: unknown) => request<T>(path, { method: 'DELETE', body }),
  upload: <T>(path: string, formData: FormData, signal?: AbortSignal) =>
    request<T>(path, { method: 'POST', formData, signal }),
};

/** Direct content URL for previews/downloads (cookie-authenticated). */
export const fileContentUrl = (id: string, download = false) =>
  `${API_BASE}/api/files/${id}/content${download ? '?download=1' : ''}`;

export const gmailAttachmentUrl = (messageId: string, attachmentId: string, filename: string, mime: string) =>
  `${API_BASE}/api/gmail/messages/${messageId}/attachment/${attachmentId}?filename=${encodeURIComponent(filename)}&mime=${encodeURIComponent(mime)}`;

export const API_ORIGIN = API_BASE;
