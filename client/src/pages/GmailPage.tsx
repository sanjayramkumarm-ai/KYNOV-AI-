import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  Inbox,
  Loader2,
  ListChecks,
  Mail,
  Paperclip,
  Plug,
  RefreshCw,
  Reply,
  Search,
  Send,
  Sparkles,
  Unplug,
} from 'lucide-react';
import { gmailApi, tasksApi } from '../services/endpoints';
import { ApiError, gmailAttachmentUrl } from '../services/api';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import type { GmailFullMessage, GmailMessageSummary, GoogleStatus, SuggestedTask } from '../types';
import { SetupNotice } from '../components/ui/SetupNotice';
import { EmptyState } from '../components/ui/EmptyState';
import { SkeletonRows } from '../components/ui/Spinner';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { formatBytes } from '../components/common/FileIcon';
import { formatDate, formatTime, relativeDue, timeAgo } from '../utils/format';
import { Markdownish } from '../components/common/Markdownish';

export default function GmailPage() {
  const { messageId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { success, error: toastError, info } = useToast();
  const { features, setGoogle } = useAuth();

  const [status, setStatus] = useState<GoogleStatus | null>(null);
  const [messages, setMessages] = useState<GmailMessageSummary[]>([]);
  const [nextToken, setNextToken] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [selected, setSelected] = useState<GmailFullMessage | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [summary, setSummary] = useState<{ summary: string | null; notice?: string; configured: boolean } | null>(null);
  const [summaryBusy, setSummaryBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestedTask[] | null>(null);
  const [suggestBusy, setSuggestBusy] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const [reply, setReply] = useState({ to: '', cc: '', subject: '', body: '', threadId: '' });
  const [draftBusy, setDraftBusy] = useState(false);
  const [sendBusy, setSendBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);

  const oauthError = params.get('error');

  const loadStatus = async () => {
    try {
      const { data } = await gmailApi.status();
      setStatus(data);
      setGoogle(data);
      if (data.connected) await loadInbox('', false);
      else setLoading(false);
    } catch (err) {
      setLoading(false);
      if (err instanceof ApiError) toastError('Could not read Gmail status', err.message);
    }
  };

  const loadInbox = async (q: string, append: boolean, pageToken?: string) => {
    setLoading(true);
    try {
      const { data } = await gmailApi.inbox({ q: q || undefined, unreadOnly, maxResults: 20, pageToken });
      setMessages((prev) => (append ? [...prev, ...data.messages] : data.messages));
      setNextToken(data.nextPageToken);
      setNotice(data.notice ?? null);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not load your inbox.';
      setNotice(message);
      toastError('Inbox error', message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!messageId) {
      setSelected(null);
      setSummary(null);
      return;
    }
    let alive = true;
    setDetailLoading(true);
    setDetailError(null);
    setSummary(null);
    gmailApi
      .message(messageId)
      .then(({ data }) => alive && setSelected(data))
      .catch((err) => alive && setDetailError(err instanceof ApiError ? err.message : 'Could not open this message.'))
      .finally(() => alive && setDetailLoading(false));
    return () => {
      alive = false;
    };
  }, [messageId]);

  const connect = async (mode: 'read' | 'send' = 'read') => {
    setConnecting(true);
    try {
      const { data } = await gmailApi.connectUrl(mode);
      window.location.href = data.url;
    } catch (err) {
      setConnecting(false);
      toastError('Cannot start Google connection', err instanceof ApiError ? err.message : 'Unknown error');
    }
  };

  const disconnect = async () => {
    const { data } = await gmailApi.disconnect();
    success('Google disconnected', data.message);
    setStatus((prev) => (prev ? { ...prev, connected: false, email: null } : prev));
    setGoogle(null);
    setMessages([]);
    setSelected(null);
    navigate('/gmail');
  };

  const summarize = async () => {
    if (!messageId) return;
    setSummaryBusy(true);
    try {
      const { data } = await gmailApi.summarize(messageId);
      setSummary({ summary: data.summary, notice: data.notice, configured: data.configured });
    } catch (err) {
      toastError('Summary failed', err instanceof ApiError ? err.message : 'Unknown error');
    } finally {
      setSummaryBusy(false);
    }
  };

  const extractTasks = async () => {
    if (!messageId) return;
    setSuggestBusy(true);
    setSuggestOpen(true);
    try {
      const { data } = await gmailApi.tasks(messageId);
      setSuggestions(data.suggestions);
    } catch (err) {
      setSuggestions([]);
      toastError(
        err instanceof ApiError && err.isNotConfigured ? 'AI not configured' : 'Could not extract tasks',
        err instanceof ApiError ? err.message : 'Unknown error',
      );
    } finally {
      setSuggestBusy(false);
    }
  };

  const saveTask = async (task: SuggestedTask) => {
    await tasksApi.create({
      title: task.title,
      dueAt: task.dueAt ?? null,
      notes: task.notes,
      priority: task.priority ?? 'medium',
      source: (task.source as any) ?? { type: 'email', refId: messageId, label: selected?.subject },
    });
    success('Task created', task.title);
    setSuggestions((prev) => prev?.filter((t) => t.title !== task.title) ?? null);
  };

  const draftReply = async () => {
    if (!messageId || !selected) return;
    setDraftBusy(true);
    setReplyOpen(true);
    setConfirmed(false);
    setReply({ to: selected.from.email, cc: '', subject: `Re: ${selected.subject}`, body: '', threadId: selected.threadId });
    try {
      const { data } = await gmailApi.draftReply(messageId, { tone: 'professional' });
      setReply({ to: data.to, cc: '', subject: data.subject, body: data.body, threadId: data.threadId });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not draft a reply.';
      toastError(err instanceof ApiError && err.isNotConfigured ? 'AI not configured' : 'Draft failed', message);
    } finally {
      setDraftBusy(false);
    }
  };

  const send = async () => {
    if (!confirmed) return;
    setSendBusy(true);
    try {
      await gmailApi.send({ ...reply, confirmed: true });
      success('Email sent', `Your reply to ${reply.to} is on its way.`);
      setReplyOpen(false);
      setConfirmed(false);
    } catch (err) {
      toastError('Send failed', err instanceof ApiError ? err.message : 'Unknown error');
    } finally {
      setSendBusy(false);
    }
  };

  /* ── Not configured ── */
  if (status && !status.configured) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4">
        <h1 className="font-display text-2xl font-semibold">Gmail Inbox</h1>
        <SetupNotice
          title="Gmail integration is not configured yet"
          message="KYNOV reads Gmail only through the official Gmail API with your explicit consent. To enable it, create an OAuth 2.0 Client ID in Google Cloud, enable the Gmail API, and add the credentials to the server environment."
          envVars={['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI']}
          steps={[
            'Google Cloud Console → APIs & Services → Enable “Gmail API”.',
            'OAuth consent screen → add your account as a test user.',
            'Credentials → Create OAuth client ID (Web application).',
            `Authorised redirect URI: ${window.location.origin.replace(/:\d+$/, ':4000')}/api/gmail/oauth/callback`,
            'Paste the client ID and secret into server/.env and restart the API.',
          ]}
        />
        <p className="text-[11px] leading-relaxed text-muted">
          Nothing on this page is simulated. Until credentials exist, no email data is fetched or displayed.
        </p>
      </div>
    );
  }

  /* ── Configured but not connected ── */
  if (status && status.configured && !status.connected) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4">
        <h1 className="font-display text-2xl font-semibold">Gmail Inbox</h1>
        {oauthError && (
          <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-xs text-rose-200">
            <AlertTriangle className="mr-1 inline h-3.5 w-3.5" /> {oauthError}
          </div>
        )}
        <div className="panel p-6 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-cyan-400/25 bg-cyan-400/10 text-cyan-300">
            <Mail className="h-6 w-6" />
          </span>
          <h2 className="mt-4 font-display text-lg font-semibold">Connect your Google account</h2>
          <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-muted">
            KYNOV requests <strong className="text-content">read-only Gmail access</strong> plus your basic profile. We never
            see your Google password, tokens stay encrypted on the server, and you can revoke access at any time.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <button type="button" className="btn-primary" onClick={() => connect('read')} disabled={connecting}>
              {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
              Connect Gmail (read-only)
            </button>
            <button type="button" className="btn-secondary" onClick={() => connect('send')} disabled={connecting}>
              <Send className="h-4 w-4" /> Connect with sending enabled
            </button>
          </div>
          <ul className="mx-auto mt-5 max-w-md space-y-1.5 text-left text-[11px] text-muted">
            <li>• <span className="text-content">gmail.readonly</span> — read messages, threads and attachments you can already see.</li>
            <li>• <span className="text-content">gmail.send</span> — optional, requested only if you pick sending, and every send requires your confirmation.</li>
            <li>• Cached metadata is scoped to your account and never shared.</li>
          </ul>
        </div>
        {features && !features.gmail && (
          <p className="text-[11px] text-amber-200">Google credentials are missing on the server, so the connect buttons will fail.</p>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Gmail Inbox</h1>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
            <CheckCircle2 className="h-3 w-3 text-emerald-400" />
            {status?.email} · {status?.canSend ? 'read + send' : 'read-only'} access
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!status?.canSend && (
            <button type="button" className="btn-secondary btn-sm" onClick={() => connect('send')}>
              <Send className="h-3.5 w-3.5" /> Enable sending
            </button>
          )}
          <button type="button" className="btn-secondary btn-sm" onClick={() => loadInbox(query, false)}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
          <button type="button" className="btn-danger btn-sm" onClick={() => setDisconnectOpen(true)}>
            <Unplug className="h-3.5 w-3.5" /> Disconnect
          </button>
        </div>
      </header>

      {oauthError && (
        <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-xs text-rose-200">
          <AlertTriangle className="mr-1 inline h-3.5 w-3.5" /> {oauthError}
        </div>
      )}
      {notice && (
        <div className="rounded-xl border border-amber-400/25 bg-amber-500/[0.07] p-3 text-xs text-amber-200">{notice}</div>
      )}

      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        {/* Message list */}
        <section className="panel flex max-h-[calc(100vh-14rem)] flex-col overflow-hidden">
          <form
            className="border-b p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void loadInbox(query, false);
            }}
          >
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
              <input
                className="input py-2 pl-9"
                placeholder="Search mail (from:, subject:, date)…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search Gmail"
              />
            </div>
            <label className="mt-2 flex items-center gap-1.5 text-[11px] text-muted">
              <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} className="h-3 w-3 rounded border-white/20 bg-ink-900" />
              Unread only
            </label>
          </form>

          <div className="flex-1 overflow-y-auto">
            {loading && messages.length === 0 ? (
              <div className="p-3">
                <SkeletonRows rows={5} className="h-16" />
              </div>
            ) : messages.length === 0 ? (
              <div className="p-3">
                <EmptyState icon={Inbox} compact title="No messages" description="Nothing matches this filter in your inbox." />
              </div>
            ) : (
              <ul>
                {messages.map((m) => (
                  <li key={m.gmailId}>
                    <button
                      type="button"
                      onClick={() => navigate(`/gmail/${m.gmailId}`)}
                      className={`w-full border-b px-3 py-2.5 text-left transition hover:bg-ink-800/60 ${
                        messageId === m.gmailId ? 'bg-violet-500/10' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className={`truncate text-xs ${m.unread ? 'font-semibold text-content' : 'text-content/80'}`}>
                          {m.from.name || m.from.email}
                        </p>
                        <span className="shrink-0 text-[10px] text-muted">{timeAgo(m.date)}</span>
                      </div>
                      <p className={`mt-0.5 truncate text-[11px] ${m.unread ? 'text-content' : 'text-muted'}`}>{m.subject}</p>
                      <p className="mt-0.5 line-clamp-2 text-[10px] text-muted/80">{m.snippet}</p>
                      {m.hasAttachments && (
                        <span className="mt-1 inline-flex items-center gap-1 text-[10px] text-cyan-300">
                          <Paperclip className="h-2.5 w-2.5" /> attachment
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {nextToken && (
              <button
                type="button"
                className="btn-ghost btn-sm w-full justify-center border-t"
                onClick={() => loadInbox(query, true, nextToken)}
                disabled={loading}
              >
                {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : null} Load more
              </button>
            )}
          </div>
        </section>

        {/* Message detail */}
        <section className="panel flex min-h-[420px] flex-col overflow-hidden">
          {!messageId ? (
            <div className="grid flex-1 place-items-center p-6">
              <EmptyState icon={Mail} title="Select a message" description="Choose an email to read it, summarise it, extract deadlines or draft a reply." />
            </div>
          ) : detailLoading ? (
            <div className="flex flex-1 items-center justify-center text-muted">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Opening message…
            </div>
          ) : detailError ? (
            <div className="p-6">
              <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-4 text-xs text-rose-200">{detailError}</div>
              <button type="button" className="btn-secondary btn-sm mt-3" onClick={() => navigate('/gmail')}>
                <ArrowLeft className="h-3.5 w-3.5" /> Back to inbox
              </button>
            </div>
          ) : selected ? (
            <>
              <header className="border-b p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="font-display text-lg font-semibold leading-snug">{selected.subject}</h2>
                    <p className="mt-1 text-[11px] text-muted">
                      From <span className="text-content">{selected.from.name || selected.from.email}</span> &lt;{selected.from.email}&gt;
                    </p>
                    <p className="text-[11px] text-muted">
                      To {selected.to.join(', ')} · {formatDate(selected.date, true)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button type="button" className="btn-secondary btn-sm" onClick={summarize} disabled={summaryBusy}>
                      {summaryBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} Summarise
                    </button>
                    <button type="button" className="btn-secondary btn-sm" onClick={extractTasks}>
                      <ListChecks className="h-3 w-3" /> Tasks
                    </button>
                    <button type="button" className="btn-primary btn-sm" onClick={draftReply} disabled={!status?.canSend && false}>
                      <Reply className="h-3 w-3" /> Reply with AI
                    </button>
                  </div>
                </div>
              </header>

              <div className="flex-1 overflow-y-auto p-4">
                {summary && (
                  <div className="mb-4 rounded-xl border border-violet-400/25 bg-violet-500/[0.07] p-3">
                    <p className="text-[10px] uppercase tracking-wider text-violet-300">AI summary</p>
                    {summary.summary ? (
                      <div className="mt-1">
                        <Markdownish content={summary.summary} />
                      </div>
                    ) : (
                      <p className="mt-1 text-[11px] text-muted">{summary.notice ?? 'Summary unavailable.'}</p>
                    )}
                  </div>
                )}

                <pre className="whitespace-pre-wrap break-words font-sans text-[13px] leading-relaxed text-content/90">{selected.bodyText}</pre>

                {selected.attachments.length > 0 && (
                  <div className="mt-5">
                    <p className="text-[10px] uppercase tracking-wider text-muted">Attachments</p>
                    <ul className="mt-2 space-y-1.5">
                      {selected.attachments.map((a) => (
                        <li key={a.attachmentId} className="flex items-center justify-between gap-2 rounded-lg border bg-ink-900/60 px-3 py-2">
                          <span className="inline-flex min-w-0 items-center gap-2">
                            <Paperclip className="h-3.5 w-3.5 shrink-0 text-cyan-300" />
                            <span className="truncate text-[11px] text-content">{a.filename}</span>
                            <span className="shrink-0 text-[10px] text-muted">{formatBytes(a.size)}</span>
                          </span>
                          <a
                            className="btn-ghost btn-sm shrink-0"
                            href={gmailAttachmentUrl(selected.gmailId, a.attachmentId, a.filename, a.mimeType)}
                          >
                            <Download className="h-3 w-3" /> Download
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </section>
      </div>

      {/* Suggested tasks */}
      <Modal open={suggestOpen} onClose={() => setSuggestOpen(false)} title="Extract tasks from this email" description="Review each suggestion before saving it." size="md">
        {suggestBusy ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Reading the email…
          </div>
        ) : suggestions && suggestions.length > 0 ? (
          <ul className="space-y-2">
            {suggestions.map((s) => {
              const due = relativeDue(s.dueAt);
              return (
                <li key={s.title} className="flex items-start justify-between gap-3 rounded-xl border bg-ink-900/60 p-3">
                  <div className="min-w-0">
                    <p className="text-xs text-content">{s.title}</p>
                    <p className="mt-0.5 text-[10px] text-muted">
                      {due.label} · {s.priority ?? 'medium'} priority
                    </p>
                  </div>
                  <button type="button" className="btn-primary btn-sm shrink-0" onClick={() => saveTask(s)}>
                    Add
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="py-6 text-center text-xs text-muted">No actionable tasks were found in this email.</p>
        )}
      </Modal>

      {/* Reply / send */}
      <Modal
        open={replyOpen}
        onClose={() => setReplyOpen(false)}
        title="Review and send reply"
        description="Check every field — nothing is sent until you confirm."
        size="lg"
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setReplyOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={send} disabled={!confirmed || sendBusy || !reply.to || !reply.body}>
              {sendBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send email
            </button>
          </>
        }
      >
        {draftBusy ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Drafting a reply…
          </div>
        ) : (
          <div className="space-y-3">
            {!status?.canSend && (
              <div className="rounded-xl border border-amber-400/25 bg-amber-500/[0.07] p-3 text-[11px] text-amber-200">
                Sending needs the extra <code>gmail.send</code> permission. Use “Enable sending” first — KYNOV will ask Google
                for that single scope.
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="to">To</label>
                <input id="to" className="input" value={reply.to} onChange={(e) => setReply({ ...reply, to: e.target.value })} />
              </div>
              <div>
                <label className="label" htmlFor="cc">Cc (optional)</label>
                <input id="cc" className="input" value={reply.cc} onChange={(e) => setReply({ ...reply, cc: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="subject">Subject</label>
              <input id="subject" className="input" value={reply.subject} onChange={(e) => setReply({ ...reply, subject: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="body">Message</label>
              <textarea
                id="body"
                className="input min-h-[180px] resize-y font-sans text-[13px] leading-relaxed"
                value={reply.body}
                onChange={(e) => setReply({ ...reply, body: e.target.value })}
              />
            </div>
            <label className="flex items-start gap-2 rounded-xl border border-cyan-400/25 bg-cyan-400/[0.06] p-3 text-[11px] text-content/90">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 rounded border-white/20 bg-ink-900"
              />
              I have reviewed the recipient, subject and message. Send this email from my Gmail account.
            </label>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={disconnectOpen}
        title="Disconnect Google account"
        message="KYNOV will revoke its access token at Google and delete its stored credentials. Cached email metadata is kept until you delete those messages or your account."
        confirmLabel="Disconnect"
        destructive
        onConfirm={disconnect}
        onClose={() => setDisconnectOpen(false)}
      />
    </div>
  );
}
