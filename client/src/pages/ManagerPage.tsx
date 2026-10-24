import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Copy,
  Database,
  FolderTree,
  HardDrive,
  Loader2,
  RefreshCw,
  Sparkles,
  TrendingUp,
  FileQuestion,
} from 'lucide-react';
import { filesApi, foldersApi } from '../services/endpoints';
import { ApiError } from '../services/api';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import type { Folder, KynovFile, StorageInfo } from '../types';
import { FileTypeBadge, formatBytes } from '../components/common/FileIcon';
import { SkeletonRows } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import { timeAgo } from '../utils/format';

export default function ManagerPage() {
  const navigate = useNavigate();
  const { success, error: toastError, info } = useToast();
  const { features } = useAuth();

  const [files, setFiles] = useState<KynovFile[]>([]);
  const [frequent, setFrequent] = useState<KynovFile[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [reindexing, setReindexing] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const load = async () => {
    setLoading(true);
    try {
      const [listRes, recentRes, folderRes, storageRes] = await Promise.all([
        filesApi.list({ limit: 100, sort: 'size' }),
        filesApi.recent(12),
        foldersApi.list(),
        filesApi.storage(),
      ]);
      setFiles(listRes.data.files);
      setFrequent(recentRes.data.frequent);
      setFolders(folderRes.data.folders);
      setStorage(storageRes.data);
    } catch (err) {
      toastError('Could not load manager data', err instanceof ApiError ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const indexed = files.filter((f) => f.textExtracted);
  const unindexed = files.filter((f) => !f.textExtracted);
  const largest = useMemo(() => [...files].sort((a, b) => b.size - a.size).slice(0, 5), [files]);
  const duplicates = useMemo(() => {
    const map = new Map<string, KynovFile[]>();
    for (const f of files) {
      const key = `${f.name.toLowerCase()}::${f.size}`;
      map.set(key, [...(map.get(key) ?? []), f]);
    }
    return [...map.values()].filter((group) => group.length > 1);
  }, [files]);

  const runReindexAll = async () => {
    const targets = unindexed.filter((f) => ['pdf', 'docx', 'xlsx', 'xls', 'csv', 'pptx', 'txt', 'md', 'json', 'rtf'].includes(f.ext));
    if (!targets.length) {
      info('Nothing to re-index', 'Every readable file is already searchable.');
      return;
    }
    setReindexing(true);
    setProgress({ done: 0, total: targets.length });
    let ok = 0;
    for (const file of targets) {
      try {
        const { data } = await filesApi.reindex(file.id);
        if (data.indexed > 0) ok += 1;
      } catch {
        /* continue with the rest */
      }
      setProgress((p) => ({ ...p, done: p.done + 1 }));
    }
    setReindexing(false);
    success('Re-index complete', `${ok} of ${targets.length} files are now searchable.`);
    void load();
  };

  const byExt = storage?.byExt ?? [];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      <header>
        <h1 className="font-display text-2xl font-semibold">Intelligent File Manager</h1>
        <p className="mt-1 text-xs text-muted">
          Health of your index, storage breakdown and the files KYNOV can (and cannot) read.
        </p>
      </header>

      {loading ? (
        <div className="panel p-4">
          <SkeletonRows rows={5} className="h-20" />
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard icon={HardDrive} label="Storage used" value={formatBytes(storage?.usedBytes ?? 0)} hint={`${storage?.percent ?? 0}% of ${formatBytes(storage?.quotaBytes ?? 0)}`} accent="emerald" />
            <MetricCard icon={CheckCircle2} label="Searchable files" value={`${indexed.length}`} hint={`${storage?.chunkCount ?? 0} embedded chunks`} accent="cyan" />
            <MetricCard icon={FileQuestion} label="Not indexed" value={`${unindexed.length}`} hint="Images, archives or legacy formats" accent="amber" />
            <MetricCard icon={FolderTree} label="Folders" value={`${folders.length}`} hint={`${storage?.fileCount ?? files.length} files total`} accent="violet" />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Storage breakdown */}
            <section className="panel p-5">
              <h2 className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted">
                <BarChart3 className="h-3 w-3" /> Storage by file type
              </h2>
              {byExt.length === 0 ? (
                <p className="mt-3 text-xs text-muted">No files stored yet.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {byExt.slice(0, 7).map((entry) => {
                    const max = Math.max(...byExt.map((e) => e.bytes), 1);
                    return (
                      <li key={entry._id}>
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="inline-flex items-center gap-1.5">
                            <FileTypeBadge ext={entry._id} size="sm" />
                            <span className="uppercase text-content">{entry._id}</span>
                            <span className="text-muted">· {entry.count} file{entry.count === 1 ? '' : 's'}</span>
                          </span>
                          <span className="text-muted">{formatBytes(entry.bytes)}</span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                          <div className="h-full rounded-full bg-gradient-to-r from-violet-400 to-cyan-400" style={{ width: `${Math.max(3, (entry.bytes / max) * 100)}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              <div className="mt-4 rounded-xl border bg-ink-900/60 p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted">Storage driver</p>
                <p className="mt-1 text-xs text-content">
                  {storage?.driver === 's3' ? 'Amazon S3 (server-side encrypted)' : 'Local disk (development)'}
                </p>
                <p className="mt-1 text-[10px] leading-relaxed text-muted">{storage?.note}</p>
              </div>
            </section>

            {/* Index health */}
            <section className="panel p-5">
              <h2 className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted">
                <Database className="h-3 w-3" /> Semantic index
              </h2>
              <dl className="mt-3 space-y-2 text-[11px]">
                <Row label="Embedding strategy" value={features?.embeddings === 'remote' ? 'Provider model' : 'Local hashed vectors'} />
                <Row label="Vector search" value={features?.vectorSearch === 'atlas' ? 'MongoDB Atlas Vector Search' : 'In-process cosine scan'} />
                <Row label="Chat model" value={features?.chatModel ?? 'Not configured'} />
                <Row label="Indexed chunks" value={String(storage?.chunkCount ?? 0)} />
              </dl>

              {unindexed.length > 0 && (
                <div className="mt-3 rounded-xl border border-amber-400/25 bg-amber-500/[0.06] p-3">
                  <p className="flex items-start gap-1.5 text-[11px] text-amber-200">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                    {unindexed.length} file{unindexed.length === 1 ? '' : 's'} cannot be read by the AI (no extractable text).
                  </p>
                  <ul className="mt-1.5 max-h-24 space-y-0.5 overflow-y-auto">
                    {unindexed.slice(0, 8).map((f) => (
                      <li key={f.id} className="truncate text-[10px] text-muted">
                        {f.name} — {f.extractionError?.slice(0, 60) ?? 'no text'}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <button type="button" className="btn-primary btn-sm mt-3 w-full justify-center" onClick={runReindexAll} disabled={reindexing}>
                {reindexing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                {reindexing ? `Re-indexing ${progress.done}/${progress.total}…` : 'Re-index readable files'}
              </button>
            </section>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="panel p-5">
              <h2 className="text-[10px] uppercase tracking-wider text-muted">Largest files</h2>
              {largest.length === 0 ? (
                <p className="mt-3 text-xs text-muted">No files yet.</p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {largest.map((f) => (
                    <li key={f.id}>
                      <button type="button" onClick={() => navigate(`/files/${f.id}`)} className="flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-left transition hover:bg-ink-800/60">
                        <FileTypeBadge ext={f.ext} size="sm" />
                        <span className="min-w-0 flex-1 truncate text-[11px] text-content">{f.name}</span>
                        <span className="text-[10px] text-muted">{formatBytes(f.size)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="panel p-5">
              <h2 className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted">
                <TrendingUp className="h-3 w-3" /> Frequently accessed
              </h2>
              {frequent.length === 0 ? (
                <p className="mt-3 text-xs text-muted">Open a few files and they will appear here.</p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {frequent.slice(0, 5).map((f) => (
                    <li key={f.id}>
                      <button type="button" onClick={() => navigate(`/files/${f.id}`)} className="flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-left transition hover:bg-ink-800/60">
                        <FileTypeBadge ext={f.ext} size="sm" />
                        <span className="min-w-0 flex-1 truncate text-[11px] text-content">{f.name}</span>
                        <span className="text-[10px] text-muted">{f.accessCount ?? 0} opens · {timeAgo(f.lastAccessedAt)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section className="panel p-5">
            <h2 className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted">
              <Copy className="h-3 w-3" /> Possible duplicates
            </h2>
            {duplicates.length === 0 ? (
              <p className="mt-2 text-xs text-muted">No duplicate filenames with identical sizes were found.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {duplicates.slice(0, 5).map((group) => (
                  <li key={group[0].name + group[0].size} className="rounded-xl border bg-ink-900/50 p-2.5">
                    <p className="text-[11px] text-content">
                      {group[0].name} <span className="text-muted">· {formatBytes(group[0].size)} · {group.length} copies</span>
                    </p>
                    <p className="mt-0.5 text-[10px] text-muted">Compare before deleting — same name and size does not always mean identical content.</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel p-5">
            <h2 className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted">
              <FolderTree className="h-3 w-3" /> Folder overview
            </h2>
            {folders.length === 0 ? (
              <EmptyState compact icon={FolderTree} title="No folders yet" description="Create folders from the Files page to organise your workspace." />
            ) : (
              <div className="mt-2 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                {folders.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => navigate(`/files?folder=${f.id}`)}
                    className="flex items-center justify-between rounded-lg border bg-ink-900/50 px-2.5 py-2 text-left transition hover:border-cyan-400/25"
                  >
                    <span className="min-w-0 truncate text-[11px] text-content">{f.path}</span>
                    <span className="shrink-0 text-[10px] text-muted">{f.fileCount ?? 0} · {formatBytes(f.size ?? 0)}</span>
                  </button>
                ))}
              </div>
            )}
          </section>

          {!features?.ai && (
            <div className="rounded-xl border border-amber-400/25 bg-amber-500/[0.07] p-4 text-[11px] leading-relaxed text-amber-200">
              <Sparkles className="mr-1 inline h-3.5 w-3.5" /> AI summaries, keyword generation and task extraction stay disabled
              until <code>AI_API_KEY</code> is configured. Indexing, retrieval and search keep working with local embeddings.
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, hint, accent }: { icon: any; label: string; value: string; hint: string; accent: 'emerald' | 'cyan' | 'amber' | 'violet' }) {
  const styles: Record<string, string> = {
    emerald: 'text-emerald-300 border-emerald-400/20 from-emerald-400/15',
    cyan: 'text-cyan-300 border-cyan-400/20 from-cyan-400/15',
    amber: 'text-amber-300 border-amber-400/20 from-amber-400/15',
    violet: 'text-violet-300 border-violet-400/20 from-violet-400/15',
  };
  return (
    <div className="panel flex items-center gap-3 p-4">
      <span className={`grid h-10 w-10 place-items-center rounded-xl border bg-gradient-to-br to-transparent ${styles[accent]}`}>
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-[10px] uppercase tracking-wider text-muted">{label}</span>
        <span className="block font-display text-lg font-semibold text-content">{value}</span>
        <span className="block truncate text-[10px] text-muted">{hint}</span>
      </span>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-white/5 pb-1.5">
      <dt className="text-muted">{label}</dt>
      <dd className="truncate text-right text-content">{value}</dd>
    </div>
  );
}
