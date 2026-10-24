import mongoose from 'mongoose';
import { EmailCache } from '../models';
import { escapeRegex } from '../utils/http';
import { clamp, stem, tokenize } from '../utils/text';

export interface EmailSearchHit {
  id: string;
  gmailId: string;
  threadId: string;
  subject: string;
  from: { name?: string; email: string };
  to: string[];
  snippet: string;
  date: Date;
  unread: boolean;
  hasAttachments: boolean;
  score: number;
  reason: string;
  matchType: 'subject' | 'sender' | 'body' | 'date' | 'filter';
}

export interface EmailSearchArgs {
  text?: string;
  from?: string;
  subject?: string;
  fromDate?: Date;
  toDate?: Date;
  hasAttachments?: boolean;
  unreadOnly?: boolean;
  limit?: number;
}

/**
 * Searches the per-user EmailCache (metadata, plus bodies the user has opened).
 * Always scoped by `user`, so cached mail never leaks between accounts.
 */
export async function emailSearchFilter(
  userId: string,
  q: EmailSearchArgs,
): Promise<{ results: EmailSearchHit[] }> {
  const limit = Math.min(50, q.limit ?? 15);
  const filter: Record<string, unknown> = { user: new mongoose.Types.ObjectId(userId) };

  if (q.fromDate || q.toDate) {
    filter.internalDate = {
      ...(q.fromDate ? { $gte: q.fromDate } : {}),
      ...(q.toDate ? { $lte: q.toDate } : {}),
    };
  }
  if (q.hasAttachments) filter.hasAttachments = true;
  if (q.unreadOnly) filter.unread = true;
  if (q.from?.trim()) {
    const rx = new RegExp(escapeRegex(q.from.trim()), 'i');
    filter.$or = [{ 'from.email': rx }, { 'from.name': rx }];
  }
  if (q.subject?.trim()) {
    filter.subject = new RegExp(escapeRegex(q.subject.trim()), 'i');
  }

  const terms = tokenize(q.text ?? '').filter(
    (t) => !['email', 'emails', 'mail', 'message', 'messages', 'inbox'].includes(t),
  );
  if (terms.length) {
    const rx = terms.map((t) => new RegExp(escapeRegex(t), 'i'));
    const termClauses = [
      ...rx.map((r) => ({ subject: r })),
      ...rx.map((r) => ({ snippet: r })),
      ...rx.map((r) => ({ bodyText: r })),
      ...rx.map((r) => ({ 'from.name': r })),
      ...rx.map((r) => ({ 'from.email': r })),
      ...rx.map((r) => ({ searchText: r })),
    ];
    filter.$and = [{ $or: termClauses }];
  }

  const docs = await EmailCache.find(filter).sort({ internalDate: -1 }).limit(Math.max(limit * 3, 30)).lean();

  const hits: EmailSearchHit[] = docs.map((doc) => {
    const subject = (doc.subject || '').toLowerCase();
    const body = ((doc.bodyText || '') + ' ' + (doc.snippet || '') + ' ' + (doc.searchText || '')).toLowerCase();
    const sender = `${doc.from?.name ?? ''} ${doc.from?.email ?? ''}`.toLowerCase();

    let score = 0.08;
    let matchType: EmailSearchHit['matchType'] = 'date';
    let reason = 'Matches your date/type filters';
    const stems = new Set(tokenize(body).map(stem));

    let subjectHits = 0;
    let bodyHits = 0;
    let senderHits = 0;
    for (const t of terms) {
      if (subject.includes(t)) subjectHits++;
      if (stems.has(stem(t)) || body.includes(t)) bodyHits++;
      if (sender.includes(t)) senderHits++;
    }
    if (subjectHits) {
      score += 0.5 * (subjectHits / terms.length);
      matchType = 'subject';
      reason = 'Subject matches your question';
    }
    if (senderHits) {
      score += 0.35 * (senderHits / terms.length);
      if (matchType !== 'subject') {
        matchType = 'sender';
        reason = `Sender matches “${doc.from?.name || doc.from?.email}”`;
      }
    }
    if (bodyHits) {
      score += 0.3 * (bodyHits / terms.length);
      if (matchType === 'date') {
        matchType = 'body';
        reason = 'Message content matches your question';
      }
    }

    return {
      id: String(doc._id),
      gmailId: doc.gmailId,
      threadId: doc.threadId,
      subject: doc.subject || '(no subject)',
      from: { name: doc.from?.name, email: doc.from?.email ?? '' },
      to: doc.to ?? [],
      snippet: clamp(doc.snippet || doc.bodyText || '', 220),
      date: doc.internalDate,
      unread: Boolean(doc.unread),
      hasAttachments: Boolean(doc.hasAttachments),
      score: Number(score.toFixed(4)),
      reason,
      matchType,
    };
  });

  hits.sort((a, b) => b.score - a.score || +new Date(b.date) - +new Date(a.date));
  return { results: hits.slice(0, limit) };
}
