import type { Request, Response } from 'express';
import { ok } from '../utils/http';
import { asyncHandler } from '../utils/asyncHandler';
import { searchFiles } from '../services/search';
import { emailSearchFilter } from '../services/emailSearch';
import { searchChunks } from '../services/vector';
import { features } from '../config/features';
import { parseDateRange, stripDatePhrases } from '../utils/dateParse';
import { User } from '../models';

function buildFilters(q: Record<string, string | undefined>) {
  const range = q.from || q.to ? { from: q.from ? new Date(q.from) : undefined, to: q.to ? new Date(q.to) : undefined } : parseDateRange(q.q ?? '');
  return {
    folderId: q.folder && q.folder !== 'all' ? q.folder : undefined,
    ext: q.ext ? q.ext.split(',').map((e) => e.trim()) : undefined,
    tags: q.tag ? [q.tag] : undefined,
    favorite: q.favorite === 'true' ? true : undefined,
    from: range?.from,
    to: range?.to,
  };
}

export const unified = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query as Record<string, string | undefined>;
  const user = await User.findById(req.user!.id).select('google').lean();
  const gmailConnected = Boolean(user?.google?.connected);
  const scope = (q.scope ?? q.type ?? 'all') as 'all' | 'files' | 'emails';
  const query = q.q?.trim() ?? '';
  const range = parseDateRange(query);
  const cleaned = stripDatePhrases(query) || query;
  const limit = Math.min(50, Number(q.limit) || 20);

  const [files, emails] = await Promise.all([
    scope === 'emails'
      ? Promise.resolve({ results: [] as any[] })
      : searchFiles(req.user!.id, cleaned, { ...buildFilters(q), limit }),
    scope === 'files' || !gmailConnected
      ? Promise.resolve({ results: [] as any[] })
      : emailSearchFilter(req.user!.id, {
          text: cleaned,
          from: q.sender,
          subject: q.subject,
          fromDate: range?.from,
          toDate: range?.to,
          limit,
        }),
  ]);

  return ok(res, {
    query,
    scope,
    dateRange: range,
    files: files.results,
    emails: emails.results,
    counts: { files: files.results.length, emails: emails.results.length },
    gmailConnected,
    aiConfigured: features.ai,
  });
});

export const filesOnly = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query as Record<string, string | undefined>;
  const result = await searchFiles(req.user!.id, stripDatePhrases(q.q ?? '') || (q.q ?? ''), {
    ...buildFilters(q),
    limit: Math.min(50, Number(q.limit) || 20),
  });
  return ok(res, result);
});

export const emailsOnly = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query as Record<string, string | undefined>;
  const result = await emailSearchFilter(req.user!.id, {
    text: q.q,
    from: q.sender,
    subject: q.subject,
    fromDate: q.from ? new Date(q.from) : undefined,
    toDate: q.to ? new Date(q.to) : undefined,
    limit: Math.min(50, Number(q.limit) || 20),
  });
  return ok(res, result);
});

/** Debug/inspection endpoint: raw chunk-level retrieval scores. */
export const semantic = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query as Record<string, string | undefined>;
  const chunks = await searchChunks(req.user!.id, q.q ?? '', { topK: Math.min(30, Number(q.limit) || 8) });
  return ok(res, { chunks, strategy: features.embeddingStrategy });
});
