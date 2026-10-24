import { google } from 'googleapis';
import { EmailCache } from '../models';
import { ApiError } from '../utils/ApiError';
import { clamp } from '../utils/text';
import { getAuthorizedClient, GMAIL_SEND_SCOPE, GMAIL_READ_SCOPES } from './google';
import { User } from '../models';
import { logger } from '../utils/logger';

export interface GmailSummary {
  gmailId: string;
  threadId: string;
  subject: string;
  from: { name?: string; email: string };
  to: string[];
  snippet: string;
  date: Date;
  unread: boolean;
  hasAttachments: boolean;
  labels: string[];
}

export interface GmailAttachment {
  filename: string;
  mimeType: string;
  size: number;
  attachmentId: string;
}

export interface GmailFullMessage extends GmailSummary {
  bodyText: string;
  bodyHtml?: string;
  attachments: GmailAttachment[];
  headers: Record<string, string>;
}

async function gmailFor(userId: string) {
  const auth = await getAuthorizedClient(userId);
  return google.gmail({ version: 'v1', auth });
}

async function requireScope(userId: string, scope: string, humanName: string) {
  const user = await User.findById(userId).lean();
  if (!user?.google?.connected) {
    throw ApiError.forbidden('Gmail is not connected. Connect your Google account in Settings → Integrations.');
  }
  if (!user.google.scopes?.includes(scope)) {
    throw new ApiError(
      403,
      `KYNOV does not have the “${humanName}” permission yet. Enable it from Settings → Integrations: KYNOV will ask Google for the extra scope only when you switch the feature on.`,
      'FORBIDDEN',
      { missingScope: scope },
    );
  }
}

function headerMap(headers: { name?: string | null; value?: string | null }[] = []) {
  const map: Record<string, string> = {};
  for (const h of headers) if (h.name) map[h.name.toLowerCase()] = h.value ?? '';
  return map;
}

function parseAddress(raw: string): { name?: string; email: string } {
  if (!raw) return { email: 'unknown' };
  const m = /^(.*?)<([^>]+)>/.exec(raw);
  if (m) return { name: m[1].trim().replace(/^"|"$/g, '') || undefined, email: m[2].trim().toLowerCase() };
  return { email: raw.trim().toLowerCase() };
}

function decodeB64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

function stripHtml(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

interface ParsedPart {
  text: string;
  html: string;
  attachments: GmailAttachment[];
}

function walkParts(part: any, acc: ParsedPart) {
  if (!part) return;
  const mime = part.mimeType ?? '';
  const body = part.body;
  if (part.filename && body?.attachmentId) {
    acc.attachments.push({
      filename: part.filename,
      mimeType: mime || 'application/octet-stream',
      size: body.size ?? 0,
      attachmentId: body.attachmentId,
    });
  } else if (body?.data) {
    const decoded = decodeB64Url(body.data);
    if (mime === 'text/plain') acc.text += `${decoded}\n`;
    else if (mime === 'text/html') acc.html += `${decoded}\n`;
  }
  for (const child of part.parts ?? []) walkParts(child, acc);
}

function toSummary(msg: any): GmailSummary {
  const headers = headerMap(msg.payload?.headers);
  const from = parseAddress(headers.from ?? '');
  const to = (headers.to ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const labelIds: string[] = msg.labelIds ?? [];
  const hasAttachments = Boolean(
    (msg.payload?.parts ?? []).some((p: any) => p.filename && p.body?.attachmentId) || msg.payload?.filename,
  );
  return {
    gmailId: msg.id,
    threadId: msg.threadId,
    subject: headers.subject || '(no subject)',
    from,
    to,
    snippet: clamp(msg.snippet ?? '', 300),
    date: new Date(Number(msg.internalDate ?? Date.now())),
    unread: labelIds.includes('UNREAD'),
    hasAttachments,
    labels: labelIds,
  };
}

async function cacheSummary(userId: string, summary: GmailSummary) {
  await EmailCache.updateOne(
    { user: userId, gmailId: summary.gmailId },
    {
      $set: {
        threadId: summary.threadId,
        subject: summary.subject,
        from: summary.from,
        to: summary.to,
        snippet: summary.snippet,
        internalDate: summary.date,
        labelIds: summary.labels,
        hasAttachments: summary.hasAttachments,
        unread: summary.unread,
      },
    },
    { upsert: true },
  ).catch((err) => logger.warn('EmailCache upsert failed', err));
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const workers = new Array(Math.min(limit, items.length || 1)).fill(0).map(async () => {
    while (cursor < items.length) {
      const index = cursor++;
      out[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return out;
}

export interface ListOptions {
  q?: string;
  maxResults?: number;
  pageToken?: string;
  labelIds?: string[];
  includeRead?: boolean;
}

/** List inbox messages (metadata only) and mirror them into EmailCache. */
export async function listMessages(userId: string, opts: ListOptions = {}) {
  const gmail = await gmailFor(userId);
  await requireScope(userId, GMAIL_READ_SCOPES[0], 'read your Gmail');
  const maxResults = Math.min(50, Math.max(1, opts.maxResults ?? 20));

  try {
    const list = await gmail.users.messages.list({
      userId: 'me',
      maxResults,
      q: opts.q || undefined,
      pageToken: opts.pageToken || undefined,
      labelIds: opts.labelIds ?? ['INBOX'],
    });

    const ids = (list.data.messages ?? []).map((m) => m.id!).filter(Boolean);
    const messages = await mapLimit(ids, 8, async (id) => {
      const full = await gmail.users.messages.get({
        userId: 'me',
        id,
        format: 'metadata',
        metadataHeaders: ['Subject', 'From', 'To', 'Date'],
      });
      return toSummary(full.data);
    });

    const filtered = opts.includeRead === false ? messages.filter((m) => m.unread) : messages;
    await Promise.all(filtered.map((m) => cacheSummary(userId, m)));

    return {
      messages: filtered,
      nextPageToken: list.data.nextPageToken ?? null,
      resultSizeEstimate: list.data.resultSizeEstimate ?? filtered.length,
    };
  } catch (err: any) {
    throw translateGmailError(err);
  }
}

export async function searchMessages(userId: string, opts: { q: string; maxResults?: number }) {
  return listMessages(userId, { q: opts.q, maxResults: opts.maxResults ?? 20, labelIds: undefined });
}

/** Fetch one message in full, strip HTML, cache the plain text for AI use. */
export async function getMessage(userId: string, gmailId: string): Promise<GmailFullMessage> {
  const gmail = await gmailFor(userId);
  await requireScope(userId, GMAIL_READ_SCOPES[0], 'read your Gmail');
  try {
    const res = await gmail.users.messages.get({ userId: 'me', id: gmailId, format: 'full' });
    const summary = toSummary(res.data);
    const acc: ParsedPart = { text: '', html: '', attachments: [] };
    walkParts(res.data.payload, acc);
    const bodyText = (acc.text.trim() || stripHtml(acc.html) || summary.snippet).slice(0, 60_000);
    const headers = headerMap(res.data.payload?.headers);

    await EmailCache.updateOne(
      { user: userId, gmailId },
      {
        $set: {
          threadId: summary.threadId,
          subject: summary.subject,
          from: summary.from,
          to: summary.to,
          snippet: summary.snippet,
          internalDate: summary.date,
          labelIds: summary.labels,
          hasAttachments: summary.hasAttachments || acc.attachments.length > 0,
          unread: summary.unread,
          bodyText,
          bodyFetchedAt: new Date(),
          searchText: `${summary.subject} ${bodyText}`.slice(0, 20_000),
        },
      },
      { upsert: true },
    );

    return {
      ...summary,
      bodyText,
      bodyHtml: acc.html ? acc.html.slice(0, 200_000) : undefined,
      attachments: acc.attachments,
      headers,
    };
  } catch (err: any) {
    throw translateGmailError(err);
  }
}

export async function getAttachment(userId: string, gmailId: string, attachmentId: string) {
  const gmail = await gmailFor(userId);
  await requireScope(userId, GMAIL_READ_SCOPES[0], 'read your Gmail');
  try {
    const res = await gmail.users.messages.attachments.get({ userId: 'me', messageId: gmailId, id: attachmentId });
    if (!res.data.data) throw ApiError.notFound('Attachment content is unavailable.');
    return Buffer.from(res.data.data.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  } catch (err: any) {
    throw translateGmailError(err);
  }
}

function buildRawMessage(params: { to: string; cc?: string; subject: string; body: string; inReplyTo?: string; references?: string }) {
  const lines = [
    `To: ${params.to}`,
    ...(params.cc ? [`Cc: ${params.cc}`] : []),
    `Subject: ${encodeHeader(params.subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    ...(params.inReplyTo ? [`In-Reply-To: ${params.inReplyTo}`, `References: ${params.references ?? params.inReplyTo}`] : []),
  ];
  const encoded = Buffer.from(params.body, 'utf8')
    .toString('base64')
    .replace(/(.{76})/g, '$1\r\n');
  return Buffer.from(`${lines.join('\r\n')}\r\n\r\n${encoded}`, 'utf8').toString('base64url');
}

function encodeHeader(value: string) {
  // eslint-disable-next-line no-control-regex
  return /^[\x20-\x7E]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

/** Sending is only ever called after the user reviews and confirms in the UI. */
export async function sendMessage(
  userId: string,
  params: { to: string; cc?: string; subject: string; body: string; threadId?: string },
) {
  const gmail = await gmailFor(userId);
  await requireScope(userId, GMAIL_SEND_SCOPE, 'send email on your behalf');
  try {
    const raw = buildRawMessage(params);
    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw, ...(params.threadId ? { threadId: params.threadId } : {}) },
    });
    return { id: res.data.id!, threadId: res.data.threadId!, labelIds: res.data.labelIds ?? [] };
  } catch (err: any) {
    throw translateGmailError(err);
  }
}

export async function gmailProfile(userId: string) {
  const gmail = await gmailFor(userId);
  const res = await gmail.users.getProfile({ userId: 'me' });
  return { email: res.data.emailAddress, messagesTotal: res.data.messagesTotal, threadsTotal: res.data.threadsTotal };
}

function translateGmailError(err: any): ApiError {
  const status = err?.response?.status ?? err?.code ?? 500;
  const message: string = err?.response?.data?.error?.message ?? err?.message ?? 'Gmail request failed';
  if (status === 401) {
    return new ApiError(401, 'Google rejected the stored credentials. Reconnect your Google account in Settings.', 'INTEGRATION_ERROR');
  }
  if (status === 403) {
    return new ApiError(
      403,
      `Gmail denied access: ${message}. Check that the Gmail API is enabled and the required scope was granted.`,
      'INTEGRATION_ERROR',
    );
  }
  if (status === 429) {
    return new ApiError(429, 'Gmail rate limit reached. Please retry in a few seconds.', 'RATE_LIMITED');
  }
  return new ApiError(502, `Gmail error: ${message}`, 'INTEGRATION_ERROR');
}
