export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

export function parsePagination(query: Record<string, unknown>, defaults = { page: 1, limit: 20, maxLimit: 100 }) {
  const page = Math.max(1, Number(query.page) || defaults.page);
  const limit = Math.min(defaults.maxLimit, Math.max(1, Number(query.limit) || defaults.limit));
  return { page, limit, skip: (page - 1) * limit };
}

export function pageMeta(total: number, page: number, limit: number): PageMeta {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return { page, limit, total, totalPages, hasMore: page < totalPages };
}

export function ok<T>(res: import('express').Response, data: T, status = 200, meta?: PageMeta) {
  return res.status(status).json({ success: true, data, ...(meta ? { meta } : {}) });
}

export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
