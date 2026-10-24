import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, Filter, Loader2, Mail, Search, Sparkles, X } from 'lucide-react';
import { chatApi, searchApi } from '../services/endpoints';
import { ApiError } from '../services/api';
import { useToast } from '../context/ToastContext';
import type { AskResponse, SearchResponse } from '../types';
import { FileResultCard } from '../components/files/FileResultCard';
import { FilePreviewModal } from '../components/files/FilePreviewModal';
import { Markdownish } from '../components/common/Markdownish';
import { EmptyState } from '../components/ui/EmptyState';
import { SkeletonRows } from '../components/ui/Spinner';
import { useDebounce } from '../hooks/useDebounce';
import { formatDate, timeAgo } from '../utils/format';
import { fileContentUrl } from '../services/api';

const EXAMPLES = [
  'Find my resume',
  'Open the PDF about artificial intelligence',
  'Find the email sent by my professor last week',
  'Show my latest college project',
  'Find all documents related to my internship',
  'Which email contains the meeting date?',
];

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { error: toastError } = useToast();

  const [query, setQuery] = useState(params.get('q') ?? '');
  const debounced = useDebounce(query, 350);
  const [scope, setScope] = useState<'all' | 'files' | 'emails'>((params.get('scope') as any) ?? 'all');
  const [ext, setExt] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sender, setSender] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [answer, setAnswer] = useState<AskResponse | null>(null);
  const [asking, setAsking] = useState(false);

  const run = async (q: string) => {
    if (!q.trim() && !ext && !from && !to && !sender) {
      setResult(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data } = await searchApi.unified({
        q: q.trim() || undefined,
        scope,
        ext: ext || undefined,
        from: from || undefined,
        to: to || undefined,
        sender: sender || undefined,
        limit: 20,
      });
      setResult(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Search failed.');
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void run(debounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, scope, ext, from, to, sender]);

  useEffect(() => {
    if (params.get('q')) setQuery(params.get('q')!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const askAi = async () => {
    const question = query.trim() || 'Summarise what you can find in my workspace.';
    setAsking(true);
    try {
      const { data } = await chatApi.ask({ question });
      setAnswer(data);
    } catch (err) {
      toastError('AI request failed', err instanceof ApiError ? err.message : 'Unknown error');
    } finally {
      setAsking(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setParams({ q: query });
    void run(query);
  };

  const clearFilters = () => {
    setExt('');
    setFrom('');
    setTo('');
    setSender('');
    setScope('all');
  };

  const activeFilters = [ext, from, to, sender].filter(Boolean).length;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <header>
        <h1 className="font-display text-2xl font-semibold">Smart Search</h1>
        <p className="mt-1 text-xs text-muted">
          One query across your files and authorised email. Results are ranked by meaning, filename, tags and date.
        </p>
      </header>

      <form onSubmit={submit} className="panel space-y-3 p-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
            <input
              className="input py-3 pl-9"
              placeholder="Find my resume, the PDF about AI, emails from my professor last week…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Smart search query"
              autoFocus
            />
          </div>
          <button type="submit" className="btn-primary px-5 py-3">
            <Search className="h-4 w-4" /> Search
          </button>
          <button type="button" className="btn-secondary px-4 py-3" onClick={() => void askAi()} disabled={asking}>
            {asking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Ask AI
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(['all', 'files', 'emails'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setScope(s)}
              className={`chip transition ${scope === s ? 'chip-active' : 'hover:text-content'}`}
            >
              {s === 'all' ? 'Everything' : s === 'files' ? 'Files only' : 'Emails only'}
            </button>
          ))}
          <span className="mx-1 h-4 w-px bg-white/10" />
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className={`chip transition ${showFilters || activeFilters ? 'chip-active' : ''}`}
            aria-expanded={showFilters}
          >
            <Filter className="h-3 w-3" /> Filters{activeFilters ? ` (${activeFilters})` : ''}
          </button>
          {activeFilters > 0 && (
            <button type="button" onClick={clearFilters} className="chip hover:text-content">
              <X className="h-3 w-3" /> Clear
            </button>
          )}
        </div>

        {showFilters && (
          <div className="grid gap-2 border-t pt-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="label" htmlFor="f-ext">File type</label>
              <select id="f-ext" className="input py-2" value={ext} onChange={(e) => setExt(e.target.value)}>
                <option value="">Any type</option>
                <option value="pdf">PDF</option>
                <option value="docx,doc">Word</option>
                <option value="xlsx,xls,csv">Spreadsheet</option>
                <option value="pptx,ppt">Presentation</option>
                <option value="png,jpg,jpeg,webp">Image</option>
                <option value="txt,md,json">Text</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="f-from">From date</label>
              <input id="f-from" type="date" className="input py-2" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="f-to">To date</label>
              <input id="f-to" type="date" className="input py-2" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="f-sender">Email sender</label>
              <input id="f-sender" className="input py-2" placeholder="professor@university.edu" value={sender} onChange={(e) => setSender(e.target.value)} />
            </div>
          </div>
        )}
      </form>

      {!result && !loading && (
        <div className="panel p-5">
          <p className="text-[10px] uppercase tracking-wider text-muted">Try a natural-language query</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {EXAMPLES.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => {
                  setQuery(e);
                  setParams({ q: e });
                  void run(e);
                }}
                className="rounded-xl border bg-ink-900/50 px-3 py-2 text-left text-[11px] text-muted transition hover:border-cyan-400/30 hover:text-content"
              >
                {e}
              </button>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-muted">
            Date phrases like “yesterday”, “last week” or “in March” are understood automatically.
          </p>
        </div>
      )}

      {answer && (
        <section className="panel border-violet-400/25 p-4">
          <div className="flex items-center justify-between">
            <p className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-violet-300">
              <Sparkles className="h-3 w-3" /> {answer.mode === 'ai' ? 'AI answer' : 'Retrieval summary'}
            </p>
            <button type="button" onClick={() => setAnswer(null)} className="text-muted hover:text-content" aria-label="Dismiss answer">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mt-2">
            <Markdownish content={answer.answer} />
          </div>
          {answer.sources.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {answer.sources.slice(0, 6).map((s) => (
                <span key={`${s.type}-${s.id}`} className="chip">
                  {s.type === 'file' ? '📄' : '✉️'} {s.name}
                  {s.page ? ` · p${s.page}` : ''}
                </span>
              ))}
            </div>
          )}
          {answer.notice && <p className="mt-2 text-[10px] text-amber-200">{answer.notice}</p>}
        </section>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-xs text-rose-200">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5" /> {error}
        </div>
      )}

      {loading ? (
        <div className="panel p-4">
          <SkeletonRows rows={4} className="h-20" />
        </div>
      ) : result ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
            <span>
              {result.counts.files} file{result.counts.files === 1 ? '' : 's'} · {result.counts.emails} email
              {result.counts.emails === 1 ? '' : 's'}
              {result.dateRange?.label ? ` · filtered to ${result.dateRange.label}` : ''}
            </span>
            {!result.gmailConnected && <span>Gmail not connected — email results skipped.</span>}
          </div>

          {result.files.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-[10px] uppercase tracking-wider text-muted">Files</h2>
              {result.files.map((f) => (
                <FileResultCard
                  key={f.id}
                  hit={f}
                  onOpen={(hit) => navigate(`/files/${hit.id}`)}
                  onDownload={(hit) => {
                    window.location.href = fileContentUrl(hit.id, true);
                  }}
                />
              ))}
            </section>
          )}

          {result.emails.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-[10px] uppercase tracking-wider text-muted">Emails</h2>
              {result.emails.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => navigate(`/gmail/${m.gmailId}`)}
                  className="flex w-full items-start gap-3 rounded-xl border bg-ink-900/60 p-3 text-left transition hover:border-cyan-400/30"
                >
                  <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-cyan-400/25 bg-cyan-400/10 text-cyan-300">
                    <Mail className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm text-content">{m.subject}</span>
                      <span className="text-[10px] text-muted">{timeAgo(m.date)}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-muted">
                      {m.from.name || m.from.email} · {formatDate(m.date)}
                    </span>
                    <span className="mt-1 block line-clamp-2 text-[11px] text-muted/80">{m.snippet}</span>
                    <span className="mt-1.5 inline-block rounded bg-cyan-400/[0.07] px-1.5 py-0.5 text-[10px] text-cyan-300">{m.reason}</span>
                  </span>
                </button>
              ))}
            </section>
          )}

          {result.files.length === 0 && result.emails.length === 0 && (
            <EmptyState
              icon={Search}
              title="No matches"
              description={`Nothing in your workspace matches “${result.query}”. Try different keywords, remove filters, or upload the document so its contents can be indexed.`}
            />
          )}
        </div>
      ) : null}

      <FilePreviewModal fileId={previewId} onClose={() => setPreviewId(null)} onOpenFull={(f) => navigate(`/files/${f.id}`)} />
    </div>
  );
}
