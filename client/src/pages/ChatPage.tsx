import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowDownToLine,
  FileText,
  Mail,
  MessageSquarePlus,
  MoreHorizontal,
  Pencil,
  Pin,
  Send,
  Sparkles,
  Trash2,
  X,
  Mic,
  Loader2,
  AlertCircle,
  Paperclip,
} from 'lucide-react';
import { chatApi, filesApi } from '../services/endpoints';
import { ApiError, fileContentUrl } from '../services/api';
import type { ChatMessage, Conversation, KynovFile, SourceRef } from '../types';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Markdownish } from '../components/common/Markdownish';
import { FilePreviewModal } from '../components/files/FilePreviewModal';
import { FileTypeBadge, formatBytes } from '../components/common/FileIcon';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState } from '../components/ui/EmptyState';
import { Spinner } from '../components/ui/Spinner';
import { timeAgo, formatTime } from '../utils/format';

const QUICK_PROMPTS = [
  'Find my college project PDF.',
  'Show the file I uploaded yesterday.',
  'Summarize my project report.',
  'Which document contains my project abstract?',
  'Search my files for MongoDB notes.',
  'Find the deadline mentioned in my document.',
  'Find the email about my college fees.',
];

export default function ChatPage() {
  const { conversationId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { features } = useAuth();
  const { error: toastError, info } = useToast();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeId, setActiveId] = useState<string | null>(conversationId ?? null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [mode, setMode] = useState<'ai' | 'retrieval' | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [files, setFiles] = useState<KynovFile[]>([]);
  const [scopedFile, setScopedFile] = useState<KynovFile | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Conversation | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Conversation | null>(null);
  const [includeEmails, setIncludeEmails] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const autoSent = useRef(false);

  const loadConversations = async () => {
    try {
      const { data } = await chatApi.conversations();
      setConversations(data);
    } catch (err) {
      if (err instanceof ApiError) toastError('Could not load conversations', err.message);
    }
  };

  useEffect(() => {
    void loadConversations();
    filesApi
      .list({ limit: 60, sort: 'recent' })
      .then(({ data }) => setFiles(data.files ?? []))
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setActiveId(conversationId ?? null);
    if (!conversationId) {
      setMessages([]);
      return;
    }
    let alive = true;
    setLoadingMessages(true);
    chatApi
      .get(conversationId)
      .then(({ data }) => {
        if (!alive) return;
        setMessages(data.messages);
        setActiveId(data.conversation.id);
      })
      .catch((err) => {
        if (alive) {
          toastError('Could not open conversation', err instanceof ApiError ? err.message : 'Unknown error');
          navigate('/chat', { replace: true });
        }
      })
      .finally(() => alive && setLoadingMessages(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, sending]);

  const send = async (text: string, file?: KynovFile | null) => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setNotice(null);

    const optimistic: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: body,
      sources: [],
      attachments: [],
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setInput('');

    try {
      const { data } = await chatApi.send({
        conversationId: activeId ?? undefined,
        message: body,
        includeEmails,
        ...(file ? { fileId: file.id } : {}),
      });
      setMessages((prev) => [...prev.filter((m) => m.id !== optimistic.id), data.userMessage, data.assistantMessage]);
      setMode(data.mode);
      setNotice(data.notice ?? null);
      if (!activeId) {
        setActiveId(data.conversation.id);
        navigate(`/chat/${data.conversation.id}`, { replace: true });
        void loadConversations();
      } else {
        void loadConversations();
      }
      setScopedFile(null);
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      const message = err instanceof ApiError ? err.message : 'Could not send your message.';
      toastError('Message failed', message);
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: `⚠️ ${message}`,
          sources: [],
          attachments: [],
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  };

  // Auto-send a question passed via ?q= from the dashboard / search / voice pages.
  useEffect(() => {
    const q = searchParams.get('q');
    if (!q || autoSent.current || sending) return;
    autoSent.current = true;
    setSearchParams({}, { replace: true });
    void send(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const newChat = () => {
    setActiveId(null);
    setMessages([]);
    setNotice(null);
    setMode(null);
    navigate('/chat');
    setSidebarOpen(false);
    textareaRef.current?.focus();
  };

  const doRename = async () => {
    if (!renameTarget) return;
    try {
      await chatApi.update(renameTarget.id, { title: renameValue.trim() });
      await loadConversations();
      info('Conversation renamed');
    } catch (err) {
      toastError('Rename failed', err instanceof ApiError ? err.message : 'Unknown error');
    } finally {
      setRenameTarget(null);
    }
  };

  const doDelete = async () => {
    if (!deleteTarget) return;
    await chatApi.remove(deleteTarget.id);
    await loadConversations();
    if (activeId === deleteTarget.id) newChat();
    info('Conversation deleted');
  };

  const grouped = useMemo(() => {
    const pinned = conversations.filter((c) => c.pinned);
    const rest = conversations.filter((c) => !c.pinned);
    return { pinned, rest };
  }, [conversations]);

  return (
    <div className="mx-auto flex h-[calc(100vh-9rem)] w-full max-w-7xl gap-4">
      {/* Conversation sidebar */}
      <aside
        className={`panel w-full shrink-0 flex-col overflow-hidden p-3 lg:flex lg:w-72 ${
          sidebarOpen ? 'absolute inset-x-4 top-20 z-30 flex max-h-[70vh]' : 'hidden'
        }`}
        aria-label="Conversation history"
      >
        <button type="button" className="btn-primary w-full justify-center" onClick={newChat}>
          <MessageSquarePlus className="h-4 w-4" /> New chat
        </button>
        <div className="mt-3 flex-1 space-y-3 overflow-y-auto pr-1">
          {[['Pinned', grouped.pinned], ['History', grouped.rest]] .map(([label, list]) => {
            const items = list as Conversation[];
            if (!items.length) return null;
            return (
              <div key={label as string}>
                <p className="px-1 pb-1 text-[10px] uppercase tracking-wider text-muted">{label as string}</p>
                {items.map((c) => (
                  <div
                    key={c.id}
                    className={`group mb-1 flex items-center gap-1 rounded-lg px-2 py-2 transition ${
                      activeId === c.id ? 'bg-violet-500/15' : 'hover:bg-ink-800/60'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        navigate(`/chat/${c.id}`);
                        setSidebarOpen(false);
                      }}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="truncate text-xs text-content">{c.title}</p>
                      <p className="text-[10px] text-muted">{timeAgo(c.lastMessageAt)}</p>
                    </button>
                    <div className="flex shrink-0 opacity-0 transition group-hover:opacity-100">
                      <button
                        type="button"
                        className="rounded p-1 text-muted hover:text-content"
                        onClick={async () => {
                          await chatApi.update(c.id, { pinned: !c.pinned });
                          void loadConversations();
                        }}
                        aria-label={c.pinned ? 'Unpin conversation' : 'Pin conversation'}
                      >
                        <Pin className={`h-3 w-3 ${c.pinned ? 'fill-cyan-300 text-cyan-300' : ''}`} />
                      </button>
                      <button
                        type="button"
                        className="rounded p-1 text-muted hover:text-content"
                        onClick={() => {
                          setRenameTarget(c);
                          setRenameValue(c.title);
                        }}
                        aria-label="Rename conversation"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        className="rounded p-1 text-muted hover:text-rose-300"
                        onClick={() => setDeleteTarget(c)}
                        aria-label="Delete conversation"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
          {conversations.length === 0 && <p className="px-1 py-6 text-center text-[11px] text-muted">No conversations yet.</p>}
        </div>
      </aside>

      {/* Chat area */}
      <section className="panel flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <button type="button" className="btn-ghost btn-sm lg:hidden" onClick={() => setSidebarOpen((v) => !v)} aria-label="Toggle history">
              <MoreHorizontal className="h-4 w-4" />
            </button>
            <Sparkles className="h-4 w-4 shrink-0 text-violet-300" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {conversations.find((c) => c.id === activeId)?.title ?? 'New conversation'}
              </p>
              <p className="truncate text-[10px] text-muted">
                {mode === 'retrieval'
                  ? 'Retrieval mode · no AI provider key'
                  : features?.ai
                    ? `AI answers · ${features.chatModel}`
                    : 'AI provider not configured'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="hidden cursor-pointer items-center gap-1.5 text-[11px] text-muted sm:flex">
              <input
                type="checkbox"
                checked={includeEmails}
                onChange={(e) => setIncludeEmails(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-white/20 bg-ink-900"
              />
              Include email
            </label>
            <Link to="/voice" className="btn-ghost btn-sm" aria-label="Switch to voice">
              <Mic className="h-3.5 w-3.5" />
            </Link>
          </div>
        </header>

        {notice && (
          <div className="flex items-start gap-2 border-b border-amber-400/20 bg-amber-500/[0.07] px-4 py-2 text-[11px] text-amber-200">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="flex-1">{notice}</span>
            <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss notice">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-5">
          {loadingMessages && (
            <div className="flex justify-center py-8 text-muted">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          )}

          {!loadingMessages && messages.length === 0 && (
            <div className="mx-auto max-w-xl py-6">
              <EmptyState
                icon={Sparkles}
                title="Ask anything about your workspace"
                description="KYNOV searches your files by meaning and shows the exact documents it used. If it cannot find something, it says so."
              />
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {QUICK_PROMPTS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => void send(p)}
                    className="rounded-xl border bg-ink-900/50 px-3 py-2 text-left text-[11px] text-muted transition hover:border-cyan-400/30 hover:text-content"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          <AnimatePresence initial={false}>
            {messages.map((m) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : ''}`}
              >
                {m.role === 'assistant' && (
                  <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-cyan-400">
                    <Sparkles className="h-3.5 w-3.5 text-white" />
                  </span>
                )}
                <div className={`min-w-0 max-w-[85%] ${m.role === 'user' ? 'order-first' : ''}`}>
                  <div
                    className={`rounded-2xl border px-4 py-3 ${
                      m.role === 'user'
                        ? 'rounded-br-md border-violet-400/25 bg-violet-500/15 text-content'
                        : 'rounded-bl-md bg-ink-900/70'
                    }`}
                  >
                    <Markdownish content={m.content} />
                  </div>

                  {m.attachments?.length > 0 && (
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {m.attachments.map((a) => (
                        <AttachmentCard key={`${a.type}-${a.id}`} source={a} onPreview={setPreviewId} />
                      ))}
                    </div>
                  )}

                  {m.sources?.some((s) => s.type === 'email') && (
                    <div className="mt-2 space-y-1.5">
                      {m.sources
                        .filter((s) => s.type === 'email')
                        .map((s) => (
                          <Link
                            key={s.id}
                            to={`/gmail/${s.meta?.gmailId ?? s.id}`}
                            className="flex items-start gap-2 rounded-lg border bg-ink-900/50 px-3 py-2 transition hover:border-cyan-400/30"
                          >
                            <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-300" />
                            <span className="min-w-0">
                              <span className="block truncate text-[11px] text-content">{s.name}</span>
                              <span className="block truncate text-[10px] text-muted">
                                {s.meta?.from?.name ?? s.meta?.from?.email} · {s.snippet?.slice(0, 90)}
                              </span>
                            </span>
                          </Link>
                        ))}
                    </div>
                  )}

                  <div className={`mt-1 flex items-center gap-2 text-[10px] text-muted ${m.role === 'user' ? 'justify-end' : ''}`}>
                    <span>{formatTime(m.createdAt)}</span>
                    {m.intent && <span className="chip py-0">{m.intent.replace(/_/g, ' ')}</span>}
                    {typeof m.latencyMs === 'number' && <span>{m.latencyMs} ms</span>}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {sending && (
            <div className="flex items-center gap-3">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-cyan-400">
                <Sparkles className="h-3.5 w-3.5 text-white" />
              </span>
              <div className="flex items-center gap-1.5 rounded-2xl border bg-ink-900/70 px-4 py-3">
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="h-1.5 w-1.5 rounded-full bg-cyan-300"
                    animate={{ opacity: [0.25, 1, 0.25] }}
                    transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.15 }}
                  />
                ))}
                <span className="ml-1 text-[11px] text-muted">Searching your workspace…</span>
              </div>
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="border-t px-3 py-3 sm:px-4">
          {scopedFile && (
            <div className="mb-2 flex items-center gap-2 rounded-lg border border-cyan-400/25 bg-cyan-400/[0.07] px-2.5 py-1.5">
              <FileText className="h-3.5 w-3.5 text-cyan-300" />
              <span className="min-w-0 flex-1 truncate text-[11px] text-content">Asking about {scopedFile.name}</span>
              <button type="button" onClick={() => setScopedFile(null)} aria-label="Remove file scope">
                <X className="h-3.5 w-3.5 text-muted hover:text-content" />
              </button>
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(input, scopedFile);
            }}
            className="flex items-end gap-2"
          >
            <button type="button" className="btn-ghost btn-sm mb-1" onClick={() => setPickerOpen(true)} aria-label="Attach a file to this question">
              <Paperclip className="h-4 w-4" />
            </button>
            <div className="relative flex-1">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void send(input, scopedFile);
                  }
                }}
                rows={1}
                placeholder="Ask about your files, emails or deadlines…"
                className="input max-h-40 min-h-[46px] resize-y py-3 pr-3"
                aria-label="Message KYNOV AI"
              />
            </div>
            <button type="submit" className="btn-primary mb-0.5 h-[46px] px-4" disabled={sending || !input.trim()}>
              {sending ? <Spinner className="h-4 w-4" /> : <Send className="h-4 w-4" />}
              <span className="sr-only">Send message</span>
            </button>
          </form>
          <p className="mt-1.5 text-center text-[10px] text-muted">
            KYNOV answers only from your own files and authorised email. Document contents are treated as data, never as
            instructions.
          </p>
        </div>
      </section>

      {/* File picker */}
      <Modal open={pickerOpen} onClose={() => setPickerOpen(false)} title="Ask about a specific file" size="md">
        <div className="max-h-[50vh] space-y-1.5 overflow-y-auto">
          {files.length === 0 && <p className="py-6 text-center text-xs text-muted">No files yet. Upload one first.</p>}
          {files.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => {
                setScopedFile(f);
                setPickerOpen(false);
              }}
              className="flex w-full items-center gap-2.5 rounded-lg border bg-ink-900/50 px-3 py-2 text-left transition hover:border-cyan-400/30"
            >
              <FileTypeBadge ext={f.ext} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs text-content">{f.name}</span>
                <span className="block text-[10px] text-muted">{formatBytes(f.size)} · {f.textExtracted ? 'searchable' : 'no text'}</span>
              </span>
            </button>
          ))}
        </div>
      </Modal>

      <Modal
        open={Boolean(renameTarget)}
        onClose={() => setRenameTarget(null)}
        title="Rename conversation"
        size="sm"
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setRenameTarget(null)}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={doRename} disabled={!renameValue.trim()}>
              Save
            </button>
          </>
        }
      >
        <input className="input" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} autoFocus aria-label="Conversation title" />
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete conversation"
        message="This removes the thread and every message in it. Your files are not affected."
        confirmLabel="Delete"
        destructive
        onConfirm={doDelete}
        onClose={() => setDeleteTarget(null)}
      />

      <FilePreviewModal fileId={previewId} onClose={() => setPreviewId(null)} onOpenFull={(f) => navigate(`/files/${f.id}`)} />
    </div>
  );
}

function AttachmentCard({ source, onPreview }: { source: SourceRef; onPreview: (id: string) => void }) {
  const ext = String(source.meta?.ext ?? source.name.split('.').pop() ?? 'file');
  return (
    <div className="rounded-xl border border-cyan-400/20 bg-ink-900/70 p-2.5">
      <div className="flex items-start gap-2">
        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-medium text-content" title={source.name}>
            {source.name}
          </p>
          <p className="text-[10px] text-muted">
            {String(ext).toUpperCase()}
            {source.meta?.createdAt ? ` · ${new Date(source.meta.createdAt).toLocaleDateString('en-GB')}` : ''}
            {source.page ? ` · page ${source.page}` : ''}
          </p>
          {source.meta?.reason && <p className="mt-0.5 text-[10px] text-cyan-300/90">{String(source.meta.reason)}</p>}
        </div>
      </div>
      <div className="mt-2 flex gap-1.5">
        <button type="button" className="btn-secondary btn-sm flex-1 justify-center" onClick={() => onPreview(source.id)}>
          Open
        </button>
        <a className="btn-ghost btn-sm flex-1 justify-center" href={fileContentUrl(source.id, true)} download>
          <ArrowDownToLine className="h-3 w-3" /> Get
        </a>
      </div>
    </div>
  );
}
