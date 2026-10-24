import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Bell,
  CheckCircle2,
  Clock,
  Files,
  HardDrive,
  Mail,
  Mic,
  Plus,
  Search,
  Sparkles,
  ListChecks,
  Upload,
  MessageSquare,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { chatApi, filesApi, gmailApi, notificationsApi, tasksApi } from '../services/endpoints';
import type { Conversation, KynovFile, Notification, StorageInfo, Task, GoogleStatus } from '../types';
import { greeting, relativeDue, timeAgo } from '../utils/format';
import { StatCard } from '../components/common/StatCard';
import { FileTypeBadge, formatBytes } from '../components/common/FileIcon';
import { FilePreviewModal } from '../components/files/FilePreviewModal';
import { UploadDropzone } from '../components/files/UploadDropzone';
import { Modal } from '../components/ui/Modal';
import { EmptyState } from '../components/ui/EmptyState';
import { SetupNotice } from '../components/ui/SetupNotice';
import { SkeletonRows } from '../components/ui/Spinner';
import { AiOrb } from '../components/common/AiOrb';
import { fileContentUrl } from '../services/api';

export default function DashboardPage() {
  const { user, features } = useAuth();
  const { error: toastError } = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [recent, setRecent] = useState<KynovFile[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [tasks, setTasks] = useState<{ upcoming: Task[]; overdue: Task[] }>({ upcoming: [], overdue: [] });
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [google, setGoogle] = useState<GoogleStatus | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [ask, setAsk] = useState('');
  const [previewId, setPreviewId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const results = await Promise.allSettled([
      filesApi.recent(6),
      chatApi.conversations(),
      tasksApi.upcoming(),
      filesApi.storage(),
      gmailApi.status(),
      notificationsApi.list(),
    ]);
    if (results[0].status === 'fulfilled') setRecent(results[0].value.data.recent ?? []);
    if (results[1].status === 'fulfilled') setConversations(results[1].value.data.slice(0, 5));
    if (results[2].status === 'fulfilled') setTasks(results[2].value.data);
    if (results[3].status === 'fulfilled') setStorage(results[3].value.data);
    if (results[4].status === 'fulfilled') setGoogle(results[4].value.data);
    if (results[5].status === 'fulfilled') setNotifications(results[5].value.data.notifications.slice(0, 6));
    const failed = results.find((r) => r.status === 'rejected');
    if (failed && failed.status === 'rejected') toastError('Some widgets could not load', String(failed.reason?.message ?? failed.reason));
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitAsk = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ask.trim()) return;
    navigate(`/chat?q=${encodeURIComponent(ask.trim())}`);
  };

  const openTaskCount = tasks.upcoming.length + tasks.overdue.length;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      {params.get('welcome') === '1' && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
          <SetupNotice
            tone="info"
            title={`Welcome to KYNOV AI, ${user?.name?.split(' ')[0] ?? 'friend'}`}
            message="Your private workspace is live. Upload a document to enable AI answers grounded in your own files."
            action={
              <button type="button" className="btn-primary btn-sm" onClick={() => setUploadOpen(true)}>
                <Upload className="h-3.5 w-3.5" /> Upload your first file
              </button>
            }
          />
        </motion.div>
      )}

      {/* Hero / greeting */}
      <section className="panel relative overflow-hidden p-6 sm:p-8">
        <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-violet-500/20 blur-3xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.2em] text-cyan-300/80">KYNOV workspace</p>
            <h1 className="mt-2 font-display text-2xl font-semibold leading-tight sm:text-3xl">
              {greeting()}, {user?.name?.split(' ')[0] ?? 'there'}! <span className="text-muted">How can I help you today?</span>
            </h1>
            <p className="mt-2 max-w-xl text-sm text-muted">
              Ask about your documents, search your inbox, or speak a command. Every answer links back to the file it came
              from.
            </p>

            <form onSubmit={submitAsk} className="mt-5 flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
                <input
                  className="input py-3 pl-9"
                  placeholder="Find my college project PDF…"
                  value={ask}
                  onChange={(e) => setAsk(e.target.value)}
                  aria-label="Ask KYNOV AI"
                />
              </div>
              <button type="submit" className="btn-primary px-5 py-3">
                <Sparkles className="h-4 w-4" /> Ask KYNOV
              </button>
            </form>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {['Find my resume', 'Summarise my project report', 'Emails about fees', 'Deadlines this week'].map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => navigate(`/chat?q=${encodeURIComponent(q)}`)}
                  className="chip transition hover:border-cyan-400/40 hover:text-cyan-300"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-center gap-3 lg:w-56">
            <button
              type="button"
              onClick={() => navigate('/voice')}
              className="group flex flex-col items-center gap-2 rounded-2xl border bg-ink-900/50 p-4 transition hover:border-cyan-400/30 hover:shadow-glow-cyan"
              aria-label="Open the voice assistant"
            >
              <AiOrb state="idle" size={96} bars />
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-cyan-300">
                <Mic className="h-3.5 w-3.5" /> Tap to speak
              </span>
            </button>
            <button type="button" className="btn-secondary w-full justify-center" onClick={() => setUploadOpen(true)}>
              <Plus className="h-4 w-4" /> Quick upload
            </button>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Files} label="Files" value={storage?.fileCount ?? recent.length} hint={storage ? `${storage.chunkCount ?? 0} searchable chunks` : undefined} accent="violet" onClick={() => navigate('/files')} />
        <StatCard icon={MessageSquare} label="Conversations" value={conversations.length} hint="AI chat history" accent="cyan" onClick={() => navigate('/chat')} />
        <StatCard icon={ListChecks} label="Open tasks" value={openTaskCount} hint={tasks.overdue.length ? `${tasks.overdue.length} overdue` : 'All on track'} accent="amber" onClick={() => navigate('/tasks')} />
        <StatCard
          icon={HardDrive}
          label="Storage"
          value={storage ? `${storage.percent}%` : '—'}
          hint={storage ? `${formatBytes(storage.usedBytes)} of ${formatBytes(storage.quotaBytes)}` : undefined}
          accent="emerald"
          onClick={() => navigate('/manager')}
        />
      </section>

      <div className="grid gap-4 xl:grid-cols-3">
        {/* Recent files */}
        <section className="panel p-5 xl:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-muted">Recent files</h2>
            <Link to="/files" className="inline-flex items-center gap-1 text-[11px] text-cyan-300 hover:underline">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {loading ? (
            <SkeletonRows rows={3} className="h-14" />
          ) : recent.length === 0 ? (
            <EmptyState
              icon={Upload}
              title="No files yet"
              description="Upload a PDF, Word document, spreadsheet or image to start building your searchable workspace."
              action={
                <button type="button" className="btn-primary btn-sm" onClick={() => setUploadOpen(true)}>
                  Upload a file
                </button>
              }
            />
          ) : (
            <ul className="space-y-2">
              {recent.map((file) => (
                <li key={file.id}>
                  <div className="flex items-center gap-3 rounded-xl border bg-ink-900/40 p-2.5 transition hover:border-cyan-400/25">
                    <button type="button" onClick={() => setPreviewId(file.id)} aria-label={`Preview ${file.name}`}>
                      <FileTypeBadge ext={file.ext} size="sm" />
                    </button>
                    <button type="button" onClick={() => setPreviewId(file.id)} className="min-w-0 flex-1 text-left">
                      <p className="truncate text-sm text-content">{file.name}</p>
                      <p className="text-[11px] text-muted">
                        {formatBytes(file.size)} · {timeAgo(file.createdAt)} {file.textExtracted ? '· indexed' : ''}
                      </p>
                    </button>
                    <a
                      href={fileContentUrl(file.id, true)}
                      className="btn-ghost btn-sm hidden sm:inline-flex"
                      onClick={(e) => e.stopPropagation()}
                      download
                    >
                      Download
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Right column */}
        <div className="space-y-4">
          {/* Gmail status */}
          <section className="panel p-5">
            <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wider text-muted">Connected Gmail</h2>
            {google?.connected ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  <p className="truncate text-sm text-content">{google.email}</p>
                </div>
                <p className="text-[11px] text-muted">
                  {google.canSend ? 'Read + send permissions granted.' : 'Read-only access. Sending needs one extra permission.'}
                </p>
                <Link to="/gmail" className="btn-secondary btn-sm w-full justify-center">
                  <Mail className="h-3.5 w-3.5" /> Open inbox
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-content">No Google account connected</p>
                <p className="text-[11px] leading-relaxed text-muted">
                  {google?.configured
                    ? 'Connect Gmail to read, search and summarise authorised email inside KYNOV.'
                    : 'Server-side Google OAuth is not configured yet. Add the Google credentials to enable this panel.'}
                </p>
                <Link to="/settings" className="btn-secondary btn-sm w-full justify-center">
                  Configure integration
                </Link>
              </div>
            )}
          </section>

          {/* Tasks */}
          <section className="panel p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-muted">Reminders</h2>
              <Link to="/tasks" className="text-[11px] text-cyan-300 hover:underline">
                All tasks
              </Link>
            </div>
            {loading ? (
              <SkeletonRows rows={2} className="h-10" />
            ) : openTaskCount === 0 ? (
              <p className="text-xs text-muted">Nothing due. Create a task or extract deadlines from a document.</p>
            ) : (
              <ul className="space-y-2">
                {[...tasks.overdue, ...tasks.upcoming].slice(0, 4).map((task) => {
                  const due = relativeDue(task.dueAt);
                  return (
                    <li key={task.id} className="flex items-start gap-2 rounded-lg border bg-ink-900/40 p-2">
                      {due.tone === 'overdue' ? (
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-300" />
                      ) : (
                        <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-300" />
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-xs text-content">{task.title}</p>
                        <p className={`text-[10px] ${due.tone === 'overdue' ? 'text-rose-300' : 'text-muted'}`}>{due.label}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Activity */}
          <section className="panel p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-muted">Activity</h2>
              <Bell className="h-3.5 w-3.5 text-muted" />
            </div>
            {loading ? (
              <SkeletonRows rows={3} className="h-8" />
            ) : notifications.length === 0 ? (
              <p className="text-xs text-muted">Activity from uploads, tasks and emails appears here.</p>
            ) : (
              <ul className="space-y-2.5">
                {notifications.map((n) => (
                  <li key={n.id} className="flex items-start gap-2">
                    <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${n.read ? 'bg-white/20' : 'bg-cyan-400'}`} />
                    <div className="min-w-0">
                      <p className="truncate text-xs text-content/90">{n.title}</p>
                      <p className="text-[10px] text-muted">{timeAgo(n.createdAt)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {/* Recent conversations */}
      <section className="panel p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-muted">Recent conversations</h2>
          <Link to="/chat" className="inline-flex items-center gap-1 text-[11px] text-cyan-300 hover:underline">
            Open chat <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        {loading ? (
          <SkeletonRows rows={2} className="h-12" />
        ) : conversations.length === 0 ? (
          <EmptyState
            compact
            icon={Sparkles}
            title="No conversations yet"
            description="Ask KYNOV about a document, an email or a deadline to start a thread."
            action={
              <Link to="/chat" className="btn-primary btn-sm">
                Start a conversation
              </Link>
            }
          />
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {conversations.map((c) => (
              <Link
                key={c.id}
                to={`/chat/${c.id}`}
                className="flex items-start gap-2.5 rounded-xl border bg-ink-900/40 p-3 transition hover:border-cyan-400/25 hover:bg-ink-850"
              >
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-300" />
                <div className="min-w-0">
                  <p className="truncate text-xs text-content">{c.title}</p>
                  <p className="text-[10px] text-muted">
                    {c.messageCount} messages · {timeAgo(c.lastMessageAt)}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {features && !features.ai && (
        <SetupNotice
          title="AI answers are running in retrieval-only mode"
          message="File and email search, previews and citations all work. Written answers, summaries and email drafting unlock when you add an AI provider key."
          envVars={['AI_API_KEY', 'AI_BASE_URL', 'AI_CHAT_MODEL']}
          steps={['Copy .env.example to server/.env', 'Paste an OpenAI-compatible API key', 'Restart the API — no client rebuild needed']}
        />
      )}

      <Modal open={uploadOpen} onClose={() => setUploadOpen(false)} title="Upload files" description="Documents are stored in object storage and indexed for search." size="lg">
        <UploadDropzone
          maxFileSizeMb={features?.maxFileSizeMb ?? 25}
          onUploaded={() => {
            void load();
            setUploadOpen(false);
          }}
        />
      </Modal>

      <FilePreviewModal fileId={previewId} onClose={() => setPreviewId(null)} onOpenFull={(f) => navigate(`/files/${f.id}`)} />
    </div>
  );
}
