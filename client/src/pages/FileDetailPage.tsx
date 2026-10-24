import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Download,
  ExternalLink,
  FileText,
  ListChecks,
  Loader2,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { chatApi, filesApi, tasksApi } from '../services/endpoints';
import { ApiError, fileContentUrl } from '../services/api';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import type { AskResponse, KynovFile, SuggestedTask } from '../types';
import { FileTypeBadge, formatBytes } from '../components/common/FileIcon';
import { Markdownish } from '../components/common/Markdownish';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Spinner } from '../components/ui/Spinner';
import { formatDate, relativeDue } from '../utils/format';

export default function FileDetailPage() {
  const { fileId } = useParams();
  const navigate = useNavigate();
  const { success, error: toastError, info } = useToast();
  const { features } = useAuth();

  const [file, setFile] = useState<KynovFile | null>(null);
  const [chunks, setChunks] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<AskResponse | null>(null);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestedTask[] | null>(null);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestBusy, setSuggestBusy] = useState(false);

  const load = async () => {
    if (!fileId) return;
    setLoading(true);
    try {
      const { data } = await filesApi.detail(fileId);
      setFile(data.file);
      setChunks(data.chunks);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load this file.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId]);

  const ask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fileId || !question.trim()) return;
    setAsking(true);
    try {
      const { data } = await chatApi.ask({ question: question.trim(), fileId, includeEmails: false });
      setAnswer(data);
      setQuestion('');
    } catch (err) {
      toastError('Could not answer', err instanceof ApiError ? err.message : 'Unknown error');
    } finally {
      setAsking(false);
    }
  };

  const reindex = async () => {
    if (!fileId) return;
    setBusy('reindex');
    try {
      const { data } = await filesApi.reindex(fileId);
      if (data.indexed) success('Re-indexed', `${data.indexed} chunks embedded (${data.strategy ?? 'local'}).`);
      else toastError('Nothing to index', data.note ?? 'No extractable text found.');
      await load();
    } catch (err) {
      toastError('Re-index failed', err instanceof ApiError ? err.message : 'Unknown error');
    } finally {
      setBusy(null);
    }
  };

  const summarize = async () => {
    if (!fileId) return;
    setBusy('summary');
    try {
      const { data } = await filesApi.summarize(fileId);
      success('Summary generated');
      setFile((prev) => (prev ? { ...prev, summary: data.summary, keywords: data.keywords } : prev));
    } catch (err) {
      toastError(err instanceof ApiError && err.isNotConfigured ? 'AI not configured' : 'Summary failed', err instanceof ApiError ? err.message : 'Unknown error');
    } finally {
      setBusy(null);
    }
  };

  const extractTasks = async () => {
    if (!fileId) return;
    setSuggestBusy(true);
    setSuggestOpen(true);
    try {
      const { data } = await tasksApi.suggestions({ fileId });
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

  const saveSuggestion = async (task: SuggestedTask) => {
    try {
      await tasksApi.create({
        title: task.title,
        dueAt: task.dueAt ?? null,
        notes: task.notes,
        priority: task.priority ?? 'medium',
        source: { type: 'file', refId: fileId, label: file?.name },
      });
      success('Task created', task.title);
      setSuggestions((prev) => prev?.filter((t) => t.title !== task.title) ?? null);
    } catch (err) {
      toastError('Could not create task', err instanceof ApiError ? err.message : 'Unknown error');
    }
  };

  const doDelete = async () => {
    if (!fileId) return;
    await filesApi.remove(fileId);
    info('File moved to trash');
    navigate('/files');
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading file…
      </div>
    );
  }

  if (error || !file) {
    return (
      <div className="mx-auto max-w-xl">
        <div className="panel p-6 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-amber-300" />
          <p className="mt-3 text-sm text-content">{error ?? 'File not found.'}</p>
          <Link to="/files" className="btn-secondary mt-4 inline-flex">
            <ArrowLeft className="h-4 w-4" /> Back to files
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      <button type="button" onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-content">
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </button>

      <header className="panel flex flex-wrap items-start justify-between gap-4 p-5">
        <div className="flex min-w-0 gap-3">
          <FileTypeBadge ext={file.ext} size="lg" />
          <div className="min-w-0">
            <h1 className="truncate font-display text-xl font-semibold">{file.name}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-muted">
              <span className="uppercase">{file.ext}</span>
              <span>·</span>
              <span>{formatBytes(file.size)}</span>
              <span>·</span>
              <span>uploaded {formatDate(file.createdAt, true)}</span>
              {file.pageCount ? (
                <>
                  <span>·</span>
                  <span>{file.pageCount} pages</span>
                </>
              ) : null}
              <span>·</span>
              <span>{chunks} indexed chunks</span>
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className={`chip ${file.textExtracted ? 'chip-active' : ''}`}>{file.textExtracted ? 'Searchable by AI' : 'No extractable text'}</span>
              {file.favorite && <span className="chip border-amber-400/30 text-amber-300">Favourite</span>}
              {file.tags.map((t) => (
                <span key={t} className="chip">
                  #{t}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <a className="btn-primary btn-sm" href={fileContentUrl(file.id, true)} download>
            <Download className="h-3.5 w-3.5" /> Download
          </a>
          <a className="btn-secondary btn-sm" href={fileContentUrl(file.id)} target="_blank" rel="noreferrer">
            <ExternalLink className="h-3.5 w-3.5" /> Open raw
          </a>
          <button type="button" className="btn-secondary btn-sm" onClick={reindex} disabled={busy === 'reindex'}>
            {busy === 'reindex' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Re-index
          </button>
          <button type="button" className="btn-danger btn-sm" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </button>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
        <section className="panel overflow-hidden">
          <div className="border-b px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted">Preview</div>
          <div className="p-3">
            {file.previewKind === 'pdf' && <iframe src={fileContentUrl(file.id)} title={file.name} className="h-[520px] w-full rounded-lg border bg-white" />}
            {file.previewKind === 'image' && (
              <img src={fileContentUrl(file.id)} alt={file.name} className="max-h-[520px] w-full rounded-lg border object-contain" />
            )}
            {file.previewKind === 'text' && <TextPreview file={file} />}
            {(file.previewKind === 'office' || file.previewKind === 'archive' || file.previewKind === 'none') && (
              <div className="rounded-xl border border-amber-400/25 bg-amber-500/[0.06] p-5 text-xs text-muted">
                <p className="font-medium text-content">Preview not available for {file.ext.toUpperCase()}</p>
                <p className="mt-1 leading-relaxed">Download the file to open it locally. AI search still works when text could be extracted.</p>
                <a className="btn-secondary btn-sm mt-3" href={fileContentUrl(file.id, true)} download>
                  <Download className="h-3.5 w-3.5" /> Download
                </a>
              </div>
            )}
          </div>
        </section>

        <div className="space-y-4">
          <section className="panel p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-medium uppercase tracking-wider text-muted">AI summary</h2>
              <button type="button" className="btn-ghost btn-sm" onClick={summarize} disabled={busy === 'summary' || !file.textExtracted}>
                {busy === 'summary' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                {file.summary ? 'Regenerate' : 'Generate'}
              </button>
            </div>
            {file.summary ? (
              <p className="mt-2 text-xs leading-relaxed text-content/90">{file.summary}</p>
            ) : (
              <p className="mt-2 text-[11px] leading-relaxed text-muted">
                {file.textExtracted
                  ? features?.ai
                    ? 'No summary yet. Generate one to see keywords and a quick overview.'
                    : 'Add AI_API_KEY on the server to enable summaries.'
                  : 'This file has no extractable text, so it cannot be summarised.'}
              </p>
            )}
            {file.keywords?.length ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {file.keywords.map((k) => (
                  <span key={k} className="chip">
                    {k}
                  </span>
                ))}
              </div>
            ) : null}
            <button type="button" className="btn-secondary btn-sm mt-3 w-full justify-center" onClick={extractTasks} disabled={!file.textExtracted}>
              <ListChecks className="h-3.5 w-3.5" /> Extract tasks & deadlines
            </button>
          </section>

          <section className="panel p-4">
            <h2 className="text-xs font-medium uppercase tracking-wider text-muted">Ask about this document</h2>
            <form onSubmit={ask} className="mt-2 space-y-2">
              <textarea
                className="input min-h-[72px] resize-y"
                placeholder="What is the deadline mentioned in this document?"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                aria-label="Ask a question about this document"
              />
              <button type="submit" className="btn-primary btn-sm w-full justify-center" disabled={asking || !question.trim()}>
                {asking ? <Spinner className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />} Ask KYNOV
              </button>
            </form>

            {answer && (
              <div className="mt-3 rounded-xl border border-cyan-400/20 bg-cyan-400/[0.05] p-3">
                <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-cyan-300">
                  <span>{answer.mode === 'ai' ? 'AI answer' : 'Retrieval result'}</span>
                  <span>{answer.latencyMs} ms</span>
                </div>
                <div className="mt-1.5">
                  <Markdownish content={answer.answer} />
                </div>
                {answer.sources.length > 0 && (
                  <p className="mt-2 text-[10px] text-muted">
                    Sources: {answer.sources.map((s) => `${s.name}${s.page ? ` (page ${s.page})` : ''}`).join(', ')}
                  </p>
                )}
              </div>
            )}
          </section>

          {file.extractionError && (
            <section className="panel p-4">
              <h2 className="text-xs font-medium uppercase tracking-wider text-muted">Extraction note</h2>
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted">{file.extractionError}</p>
            </section>
          )}
        </div>
      </div>

      <div className="flex justify-center">
        <Link to={`/chat?q=${encodeURIComponent(`Summarise ${file.name}`)}`} className="btn-secondary btn-sm">
          <FileText className="h-3.5 w-3.5" /> Continue this in AI chat
        </Link>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        title="Move file to trash"
        message={`${file.name} will be removed from search and AI answers until you restore it.`}
        confirmLabel="Move to trash"
        destructive
        onConfirm={doDelete}
        onClose={() => setDeleteOpen(false)}
      />

      <Modal
        open={suggestOpen}
        onClose={() => setSuggestOpen(false)}
        title="Suggested tasks"
        description="KYNOV proposed these from the document. Nothing is saved until you add it."
        size="md"
      >
        {suggestBusy ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Reading the document…
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
                    {s.notes && <p className="mt-1 text-[10px] text-muted/80">{s.notes}</p>}
                  </div>
                  <button type="button" className="btn-primary btn-sm shrink-0" onClick={() => saveSuggestion(s)}>
                    Add
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="py-6 text-center text-xs text-muted">No actionable tasks or deadlines were found in this document.</p>
        )}
      </Modal>
    </div>
  );
}

function TextPreview({ file }: { file: KynovFile }) {
  const [text, setText] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    fetch(fileContentUrl(file.id), { credentials: 'include' })
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((t) => setText(t.slice(0, 200_000)))
      .catch((e) => setErr(e.message));
  }, [file.id]);

  if (err) return <p className="text-xs text-rose-300">Could not load text: {err}</p>;
  if (text === null) return <div className="skeleton h-48 w-full" />;
  return <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap rounded-lg border bg-ink-950/70 p-4 font-mono text-[12px] leading-relaxed">{text}</pre>;
}
