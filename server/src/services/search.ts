import mongoose from 'mongoose';
import { emailSearchFilter, type EmailSearchHit } from './emailSearch';
import { KynovFile } from '../models';
import { escapeRegex } from '../utils/http';
import { clamp, stem, tokenize } from '../utils/text';
import { searchFileChunks } from './vector';

export interface FileSearchFilters {
  folderId?: string | null;
  ext?: string[];
  from?: Date;
  to?: Date;
  tags?: string[];
  favorite?: boolean;
  limit?: number;
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
  previewKind: string;
  status: string;
  summary?: string;
  pageCount?: number;
  createdAt: Date;
  updatedAt: Date;
  score: number;
  reason: string;
  snippet?: string;
  page?: number;
  matchType: 'filename' | 'content' | 'tag' | 'summary' | 'recent' | 'filter';
}

export interface EmailSearchQuery {
  text?: string;
  from?: string;
  subject?: string;
  fromDate?: Date;
  toDate?: Date;
  hasAttachments?: boolean;
  unreadOnly?: boolean;
  limit?: number;
}

/** Pull the meaningful terms out of a natural-language query. */
export function queryTerms(query: string, stopExtra: string[] = []): string[] {
  const extra = new Set(stopExtra.map((s) => s.toLowerCase()));
  return [...new Set(tokenize(query).filter((t) => !extra.has(t)))];
}

function nameScore(name: string, terms: string[]): { score: number; matched: string[] } {
  if (!terms.length) return { score: 0, matched: [] };
  const hay = name.toLowerCase();
  const matched = terms.filter((t) => hay.includes(t) || hay.includes(stem(t)));
  if (!matched.length) return { score: 0, matched };
  const all = matched.length === terms.length;
  return { score: all ? 0.62 : 0.3 * (matched.length / terms.length), matched };
}

/**
 * File search = metadata match ∪ semantic/lexical chunk match, scored together.
 * Always scoped to the authenticated user; soft-deleted files are excluded.
 */
export async function searchFiles(
  userId: string,
  query: string,
  filters: FileSearchFilters = {},
): Promise<{ results: FileSearchHit[]; terms: string[]; scanned: number }> {
  const limit = Math.min(50, filters.limit ?? 12);
  const terms = queryTerms(query, ['file', 'files', 'document', 'documents', 'the', 'my', 'about', 'related']);

  const base: Record<string, unknown> = { user: new mongoose.Types.ObjectId(userId), deletedAt: null };
  if (filters.folderId !== undefined && filters.folderId !== null) {
    base.folder = filters.folderId === 'root' ? null : new mongoose.Types.ObjectId(filters.folderId);
  }
  if (filters.ext?.length) base.ext = { $in: filters.ext.map((e) => e.toLowerCase().replace('.', '')) };
  if (filters.favorite) base.favorite = true;
  if (filters.tags?.length) base.tags = { $in: filters.tags };
  if (filters.from || filters.to) {
    base.createdAt = {
      ...(filters.from ? { $gte: filters.from } : {}),
      ...(filters.to ? { $lte: filters.to } : {}),
    };
  }

  // Metadata candidates: filename / tags / summary / keywords via case-insensitive regex.
  let metaFiles: any[] = [];
  if (terms.length) {
    const rx = terms.map((t) => new RegExp(escapeRegex(t), 'i'));
    metaFiles = await KynovFile.find({
      ...base,
      $or: [
        ...rx.map((r) => ({ name: r })),
        ...rx.map((r) => ({ tags: r })),
        ...rx.map((r) => ({ summary: r })),
        ...rx.map((r) => ({ keywords: r })),
      ],
    })
      .sort({ updatedAt: -1 })
      .limit(80)
      .lean();
  }

  // Content candidates from the vector/lexical index.
  const chunkHits = terms.length ? await searchFileChunks(userId, query, { topK: 12 }) : [];
  const chunkByFile = new Map(chunkHits.map((c) => [c.fileId, c]));

  const allIds = new Set<string>([...metaFiles.map((f) => String(f._id)), ...chunkByFile.keys()]);
  let docs = await KynovFile.find({ ...base, _id: { $in: [...allIds].map((id) => new mongoose.Types.ObjectId(id)) } }).lean();

  // Nothing matched but a date/type filter was supplied → show filtered files, newest first.
  if (!docs.length && (filters.from || filters.to || filters.ext?.length || filters.tags?.length || filters.favorite)) {
    docs = await KynovFile.find(base).sort({ createdAt: -1 }).limit(limit).lean();
  }
  // No query at all → "recent files".
  if (!docs.length && !terms.length) {
    docs = await KynovFile.find(base).sort({ createdAt: -1 }).limit(limit).lean();
  }

  const now = Date.now();
  const results: FileSearchHit[] = docs.map((file) => {
    const nameHit = nameScore(file.name, terms);
    const tagMatch = terms.find((t) => (file.tags ?? []).some((tag: string) => tag.toLowerCase().includes(t)));
    const chunk = chunkByFile.get(String(file._id));

    let score = nameHit.score;
    let reason = '';
    let matchType: FileSearchHit['matchType'] = 'recent';
    let snippet = file.summary || file.preview || undefined;
    let page: number | undefined;

    if (nameHit.matched.length) {
      reason = `Filename matches “${nameHit.matched.join(', ')}”`;
      matchType = 'filename';
    }
    if (tagMatch) {
      score = Math.max(score, 0.42);
      reason = reason || `Tagged “${tagMatch}”`;
      matchType = matchType === 'filename' ? 'filename' : 'tag';
    }
    if (chunk) {
      const contentBoost = chunk.score * 0.9;
      if (contentBoost >= score) {
        score = contentBoost;
        matchType = 'content';
        snippet = clamp(chunk.text, 320);
        page = chunk.page;
        reason = chunk.page
          ? `Content matches on page ${chunk.page}`
          : 'Content matches your question';
      }
      if (nameHit.matched.length && chunk.score > 0.2) {
        reason = `Filename and content both match${chunk.page ? ` (page ${chunk.page})` : ''}`;
      }
    }
    if (!reason && file.summary && terms.some((t) => file.summary!.toLowerCase().includes(t))) {
      score = Math.max(score, 0.3);
      reason = 'AI summary mentions your keywords';
      matchType = 'summary';
    }
    if (!reason) {
      reason = terms.length ? 'Matches your filters' : 'Recently uploaded';
      matchType = 'filter';
    }
    // gentle recency tiebreak (max +0.05 for files from today)
    const ageDays = (now - new Date(file.createdAt).getTime()) / 86_400_000;
    score += Math.max(0, 0.05 - ageDays * 0.001);

    return {
      id: String(file._id),
      name: file.name,
      ext: file.ext,
      mimeType: file.mimeType,
      size: file.size,
      folderId: file.folder ? String(file.folder) : null,
      tags: file.tags ?? [],
      favorite: Boolean(file.favorite),
      previewKind: file.previewKind,
      status: file.status,
      summary: file.summary,
      pageCount: file.pageCount,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
      score: Number(score.toFixed(4)),
      reason,
      snippet,
      page,
      matchType,
    };
  });

  results.sort((a, b) => b.score - a.score || +new Date(b.createdAt) - +new Date(a.createdAt));
  return { results: mergeDuplicates(results).slice(0, limit), terms, scanned: docs.length };
}

function mergeDuplicates(hits: FileSearchHit[]): FileSearchHit[] {
  const seen = new Set<string>();
  return hits.filter((h) => (seen.has(h.id) ? false : (seen.add(h.id), true)));
}

export async function searchEmails(userId: string, q: EmailSearchQuery): Promise<{ results: EmailSearchHit[] }> {
  return emailSearchFilter(userId, q);
}

/** Unified Smart Search across files and authorized cached email metadata. */
export async function unifiedSearch(
  userId: string,
  query: string,
  opts: { scope?: 'all' | 'files' | 'emails'; filters?: FileSearchFilters; email?: Omit<EmailSearchQuery, 'text'>; limit?: number } = {},
) {
  const scope = opts.scope ?? 'all';
  const limit = opts.limit ?? 20;
  const [fileRes, emailRes] = await Promise.all([
    scope === 'emails'
      ? Promise.resolve({ results: [] as FileSearchHit[], terms: queryTerms(query), scanned: 0 })
      : searchFiles(userId, query, { ...opts.filters, limit }),
    scope === 'files'
      ? Promise.resolve({ results: [] as EmailSearchHit[] })
      : searchEmails(userId, { ...opts.email, text: query, limit }),
  ]);
  return { query, files: fileRes.results, emails: emailRes.results, terms: fileRes.terms };
}
