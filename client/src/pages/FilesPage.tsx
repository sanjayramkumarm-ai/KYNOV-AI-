import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ChevronRight,
  FolderPlus,
  Folder as FolderIcon,
  Grid2x2,
  List,
  Loader2,
  Pencil,
  RefreshCw,
  Search,
  Star,
  Trash2,
  Upload,
  X,
  FolderOpen,
  AlertTriangle,
} from 'lucide-react';
import { filesApi, foldersApi } from '../services/endpoints';
import { ApiError } from '../services/api';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import type { Folder, KynovFile } from '../types';
import { FileCard } from '../components/files/FileCard';
import { FilePreviewModal } from '../components/files/FilePreviewModal';
import { UploadDropzone } from '../components/files/UploadDropzone';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState } from '../components/ui/EmptyState';
import { SkeletonRows } from '../components/ui/Spinner';
import { formatBytes } from '../components/common/FileIcon';
import { useDebounce } from '../hooks/useDebounce';

const EXT_FILTERS = [
  { label: 'All types', value: '' },
  { label: 'PDF', value: 'pdf' },
  { label: 'Word', value: 'docx,doc' },
  { label: 'Excel', value: 'xlsx,xls,csv' },
  { label: 'Slides', value: 'pptx,ppt' },
  { label: 'Images', value: 'png,jpg,jpeg,webp,gif,svg' },
  { label: 'Text', value: 'txt,md,json' },
];

export default function FilesPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { success, error: toastError } = useToast();
  const { features } = useAuth();

  const [files, setFiles] = useState<KynovFile[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<{ total: number; page: number; totalPages: number }>({ total: 0, page: 1, totalPages: 1 });
  const [storage, setStorage] = useState<{ usedBytes: number; quotaBytes: number; percent: number; fileCount: number; driver: string } | null>(null);

  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 300);
  const [ext, setExt] = useState('');
  const [sort, setSort] = useState('recent');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [folderId, setFolderId] = useState<string>(params.get('folder') ?? 'all');
  const [page, setPage] = useState(1);
  const [trashMode, setTrashMode] = useState(false);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(params.get('file'));
  const [renameTarget, setRenameTarget] = useState<KynovFile | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [moveTarget, setMoveTarget] = useState<KynovFile | null>(null);
  const [moveFolder, setMoveFolder] = useState<string>('');
  const [deleteTarget, setDeleteTarget] = useState<KynovFile | null>(null);
  const [folderModal, setFolderModal] = useState<{ mode: 'create' | 'rename'; folder?: Folder } | null>(null);
  const [folderName, setFolderName] = useState('');
  const [folderDelete, setFolderDelete] = useState<Folder | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (trashMode) {
        const { data } = await filesApi.trash();
        setFiles(data);
        setMeta({ total: data.length, page: 1, totalPages: 1 });
      } else {
        const { data, meta: pageMeta } = await filesApi.list({
          folder: folderId,
          q: debouncedQuery || undefined,
          ext: ext || undefined,
          sort,
          page,
          limit: 24,
          favorite: favoriteOnly ? 'true' : undefined,
        });
        setFiles(data.files ?? []);
        setFolders(data.folders ?? []);
        setMeta({ total: pageMeta?.total ?? 0, page: pageMeta?.page ?? 1, totalPages: pageMeta?.totalPages ?? 1 });
      }
      const storageRes = await filesApi.storage();
      setStorage(storageRes.data);
    } catch (err) {
      toastError('Could not load files', err instanceof ApiError ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderId, debouncedQuery, ext, sort, page, favoriteOnly, trashMode]);

  useEffect(() => {
    void load();
  }, [load]);

  const refreshFolders = async () => {
    const { data } = await foldersApi.list();
    setFolders(data.folders);
  };

  const download = (file: KynovFile) => {
    window.location.href = `/api/files/${file.id}/content?download=1`;
  };

  const toggleFavorite = async (file: KynovFile) => {
    try {
      await filesApi.update(file.id, { favorite: !file.favorite });
      setFiles((prev) => prev.map((f) => (f.id === file.id ? { ...f, favorite: !f.favorite } : f)));
    } catch (err) {
      toastError('Could not update favourites', err instanceof ApiError ? err.message : 'Unknown error');
    }
  };

  const doRename = async () => {
    if (!renameTarget) return;
    try {
      await filesApi.update(renameTarget.id, { name: renameValue.trim() });
      success('File renamed');
      setRenameTarget(null);
      void load();
    } catch (err) {
      toastError('Rename failed', err instanceof ApiError ? err.message : 'Unknown error');
    }
  };

  const doMove = async () => {
    if (!moveTarget) return;
    try {
      await filesApi.update(moveTarget.id, { folder: moveFolder || null });
      success('File moved');
      setMoveTarget(null);
      void load();
    } catch (err) {
      toastError('Move failed', err instanceof ApiError ? err.message : 'Unknown error');
    }
  };

  const doDelete = async () => {
    if (!deleteTarget) return;
    try {
      if (trashMode) {
        await filesApi.remove(deleteTarget.id, true);
        success('File deleted permanently');
      } else {
        await filesApi.remove(deleteTarget.id);
        success('Moved to trash', 'You can restore it from the Trash view.');
      }
      void load();
    } catch (err) {
      toastError('Delete failed', err instanceof ApiError ? err.message : 'Unknown error');
    }
  };

  const reindex = async (file: KynovFile) => {
    setBusyId(file.id);
    try {
      const { data } = await filesApi.reindex(file.id);
      if (data.indexed > 0) success('Re-indexed', `${data.indexed} chunks embedded for semantic search.`);
      else toastError('Nothing to index', data.note ?? 'This file has no extractable text.');
      void load();
    } catch (err) {
      toastError('Re-index failed', err instanceof ApiError ? err.message : 'Unknown error');
    } finally {
      setBusyId(null);
    }
  };

  const summarize = async (file: KynovFile) => {
    setBusyId(file.id);
    try {
      const { data } = await filesApi.summarize(file.id);
      success('Summary ready', data.summary.slice(0, 140));
      void load();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Unknown error';
      toastError(err instanceof ApiError && err.isNotConfigured ? 'AI not configured' : 'Summary failed', message);
    } finally {
      setBusyId(null);
    }
  };

  const saveFolder = async () => {
    if (!folderName.trim() || !folderModal) return;
    try {
      if (folderModal.mode === 'create') {
        await foldersApi.create({ name: folderName.trim(), parent: folderId !== 'all' && folderId !== 'root' ? folderId : null });
        success('Folder created');
      } else if (folderModal.folder) {
        await foldersApi.update(folderModal.folder.id, { name: folderName.trim() });
        success('Folder renamed');
      }
      setFolderModal(null);
      setFolderName('');
      await refreshFolders();
      void load();
    } catch (err) {
      toastError('Folder action failed', err instanceof ApiError ? err.message : 'Unknown error');
    }
  };

  const removeFolder = async () => {
    if (!folderDelete) return;
    try {
      const { data } = await foldersApi.remove(folderDelete.id, true);
      success('Folder removed', data.message);
      setFolderDelete(null);
      await refreshFolders();
      if (folderId === folderDelete.id) setFolderId('all');
      void load();
    } catch (err) {
      toastError('Could not delete folder', err instanceof ApiError ? err.message : 'Unknown error');
    }
  };

  const sortedFolders = useMemo(() => [...folders].sort((a, b) => a.path.localeCompare(b.path)), [folders]);
  const currentFolder = folders.find((f) => f.id === folderId);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">{trashMode ? 'Trash' : 'My Files'}</h1>
          <p className="mt-1 text-xs text-muted">
            {storage
              ? `${storage.fileCount} files · ${formatBytes(storage.usedBytes)} of ${formatBytes(storage.quotaBytes)} used · ${storage.driver} storage`
              : 'Loading storage…'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={`btn-secondary btn-sm ${trashMode ? 'border-cyan-400/40 text-cyan-300' : ''}`}
            onClick={() => setTrashMode((v) => !v)}
          >
            <Trash2 className="h-3.5 w-3.5" /> {trashMode ? 'Back to files' : 'Trash'}
          </button>
          {!trashMode && (
            <>
              <button type="button" className="btn-secondary btn-sm" onClick={() => { setFolderModal({ mode: 'create' }); setFolderName(''); }}>
                <FolderPlus className="h-3.5 w-3.5" /> New folder
              </button>
              <button type="button" className="btn-primary btn-sm" onClick={() => setUploadOpen(true)}>
                <Upload className="h-3.5 w-3.5" /> Upload
              </button>
            </>
          )}
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        {/* Folders */}
        <aside className="panel h-fit p-3">
          <p className="px-1 pb-2 text-[10px] uppercase tracking-wider text-muted">Folders</p>
          <div className="space-y-0.5">
            <FolderRow
              active={folderId === 'all'}
              label="All files"
              icon={<FolderOpen className="h-3.5 w-3.5" />}
              count={meta.total}
              onClick={() => {
                setFolderId('all');
                setPage(1);
              }}
            />
            <FolderRow
              active={folderId === 'root'}
              label="Unfiled"
              icon={<FolderIcon className="h-3.5 w-3.5" />}
              onClick={() => {
                setFolderId('root');
                setPage(1);
              }}
            />
            {sortedFolders.map((folder) => (
              <div key={folder.id} className="group flex items-center">
                <button
                  type="button"
                  onClick={() => {
                    setFolderId(folder.id);
                    setPage(1);
                    setParams({ folder: folder.id });
                  }}
                  className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] transition ${
                    folderId === folder.id ? 'bg-violet-500/15 text-content' : 'text-muted hover:bg-ink-800/60 hover:text-content'
                  }`}
                  style={{ paddingLeft: 8 + Math.max(0, (folder.path.match(/\//g)?.length ?? 1) - 1) * 10 }}
                >
                  <FolderIcon className="h-3.5 w-3.5 shrink-0 text-violet-300" />
                  <span className="truncate">{folder.name}</span>
                  {typeof folder.fileCount === 'number' && folder.fileCount > 0 && (
                    <span className="ml-auto shrink-0 text-[10px] text-muted">{folder.fileCount}</span>
                  )}
                </button>
                <div className="flex shrink-0 opacity-0 transition group-hover:opacity-100">
                  <button
                    type="button"
                    aria-label={`Rename ${folder.name}`}
                    className="rounded p-1 text-muted hover:text-content"
                    onClick={() => {
                      setFolderModal({ mode: 'rename', folder });
                      setFolderName(folder.name);
                    }}
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${folder.name}`}
                    className="rounded p-1 text-muted hover:text-rose-300"
                    onClick={() => setFolderDelete(folder)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
            {sortedFolders.length === 0 && <p className="px-2 py-2 text-[11px] text-muted">No folders yet.</p>}
          </div>

          <div className="mt-4 border-t pt-3">
            <p className="px-1 pb-1.5 text-[10px] uppercase tracking-wider text-muted">Storage</p>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-400 to-cyan-400"
                style={{ width: `${Math.max(2, storage?.percent ?? 0)}%` }}
              />
            </div>
            <p className="mt-1.5 px-1 text-[10px] text-muted">
              {storage ? `${formatBytes(storage.usedBytes)} / ${formatBytes(storage.quotaBytes)}` : '—'}
            </p>
          </div>
        </aside>

        {/* Files area */}
        <section className="space-y-3">
          <div className="panel flex flex-wrap items-center gap-2 p-3">
            <div className="relative min-w-[180px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
              <input
                className="input py-2 pl-9"
                placeholder="Search by filename, tag or summary…"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                aria-label="Filter files"
              />
            </div>
            <select className="input w-auto py-2" value={ext} onChange={(e) => { setExt(e.target.value); setPage(1); }} aria-label="Filter by type">
              {EXT_FILTERS.map((f) => (
                <option key={f.label} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
            <select className="input w-auto py-2" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort files">
              <option value="recent">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="name">Name A→Z</option>
              <option value="size">Largest first</option>
            </select>
            <button
              type="button"
              onClick={() => setFavoriteOnly((v) => !v)}
              className={`btn-secondary btn-sm ${favoriteOnly ? 'border-amber-400/40 text-amber-300' : ''}`}
              aria-pressed={favoriteOnly}
            >
              <Star className={`h-3.5 w-3.5 ${favoriteOnly ? 'fill-amber-300' : ''}`} /> Favourites
            </button>
            <div className="flex overflow-hidden rounded-lg border">
              <button
                type="button"
                onClick={() => setView('grid')}
                className={`p-1.5 ${view === 'grid' ? 'bg-ink-800 text-content' : 'text-muted'}`}
                aria-label="Grid view"
                aria-pressed={view === 'grid'}
              >
                <Grid2x2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setView('list')}
                className={`p-1.5 ${view === 'list' ? 'bg-ink-800 text-content' : 'text-muted'}`}
                aria-label="List view"
                aria-pressed={view === 'list'}
              >
                <List className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {currentFolder && !trashMode && (
            <div className="flex items-center gap-1.5 px-1 text-[11px] text-muted">
              <button type="button" onClick={() => setFolderId('all')} className="hover:text-content">
                All files
              </button>
              <ChevronRight className="h-3 w-3" />
              <span className="text-content">{currentFolder.path}</span>
            </div>
          )}

          {loading ? (
            <SkeletonRows rows={5} className="h-24" />
          ) : files.length === 0 ? (
            <EmptyState
              icon={trashMode ? Trash2 : Upload}
              title={trashMode ? 'Trash is empty' : query ? 'No files match that search' : 'No files here yet'}
              description={
                trashMode
                  ? 'Deleted files land here and can be restored for as long as you keep them.'
                  : query
                    ? 'Try a different keyword, or clear the filters.'
                    : 'Drag and drop a document, or click Upload to browse. Supported: PDF, Word, Excel, PowerPoint, images and text.'
              }
              action={
                !trashMode ? (
                  <button type="button" className="btn-primary btn-sm" onClick={() => setUploadOpen(true)}>
                    <Upload className="h-3.5 w-3.5" /> Upload files
                  </button>
                ) : undefined
              }
            />
          ) : view === 'grid' ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {files.map((file) => (
                <div key={file.id} className={busyId === file.id ? 'opacity-60' : ''}>
                  <FileCard
                    file={file}
                    view="grid"
                    onPreview={(f) => setPreviewId(f.id)}
                    onDownload={download}
                    onRename={(f) => {
                      setRenameTarget(f);
                      setRenameValue(f.name.replace(new RegExp(`\\.${f.ext}$`, 'i'), ''));
                    }}
                    onMove={(f) => {
                      setMoveTarget(f);
                      setMoveFolder(f.folder ?? '');
                    }}
                    onToggleFavorite={toggleFavorite}
                    onDelete={(f) => setDeleteTarget(f)}
                    onReindex={reindex}
                    onSummarize={features?.ai ? summarize : undefined}
                    onAsk={(f) => navigate(`/files/${f.id}`)}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {files.map((file) => (
                <div key={file.id} className={busyId === file.id ? 'opacity-60' : ''}>
                  <FileCard
                    file={file}
                    view="list"
                    onPreview={(f) => setPreviewId(f.id)}
                    onDownload={download}
                    onRename={(f) => {
                      setRenameTarget(f);
                      setRenameValue(f.name.replace(new RegExp(`\\.${f.ext}$`, 'i'), ''));
                    }}
                    onMove={(f) => {
                      setMoveTarget(f);
                      setMoveFolder(f.folder ?? '');
                    }}
                    onToggleFavorite={toggleFavorite}
                    onDelete={(f) => setDeleteTarget(f)}
                    onReindex={reindex}
                    onSummarize={features?.ai ? summarize : undefined}
                    onAsk={(f) => navigate(`/files/${f.id}`)}
                  />
                </div>
              ))}
            </div>
          )}

          {busyId && (
            <p className="flex items-center gap-2 px-1 text-[11px] text-cyan-300">
              <Loader2 className="h-3 w-3 animate-spin" /> Working on your file…
            </p>
          )}

          {meta.totalPages > 1 && !trashMode && (
            <div className="flex items-center justify-between px-1 pt-2 text-[11px] text-muted">
              <span>
                Page {meta.page} of {meta.totalPages} · {meta.total} files
              </span>
              <div className="flex gap-2">
                <button type="button" className="btn-secondary btn-sm" disabled={meta.page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </button>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  disabled={meta.page >= meta.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {trashMode && files.length > 0 && (
            <div className="flex items-center justify-between rounded-xl border border-amber-400/20 bg-amber-500/[0.05] px-3 py-2">
              <p className="text-[11px] text-amber-200">
                <AlertTriangle className="mr-1 inline h-3 w-3" /> Files in trash are hidden from search and AI answers.
              </p>
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={async () => {
                  await filesApi.emptyTrash();
                  success('Trash emptied');
                  void load();
                }}
              >
                Empty trash
              </button>
            </div>
          )}
        </section>
      </div>

      <Modal open={uploadOpen} onClose={() => setUploadOpen(false)} title="Upload files" size="lg" description={`Max ${features?.maxFileSizeMb ?? 25} MB per file · text is extracted automatically`}>
        <UploadDropzone
          folder={folderId !== 'all' && folderId !== 'root' ? folderId : null}
          maxFileSizeMb={features?.maxFileSizeMb ?? 25}
          onUploaded={() => {
            setUploadOpen(false);
            void load();
          }}
        />
      </Modal>

      <Modal
        open={Boolean(renameTarget)}
        onClose={() => setRenameTarget(null)}
        title="Rename file"
        size="sm"
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setRenameTarget(null)}>Cancel</button>
            <button type="button" className="btn-primary" onClick={doRename} disabled={!renameValue.trim()}>Save</button>
          </>
        }
      >
        <div>
          <label className="label" htmlFor="rename">File name</label>
          <div className="flex items-center gap-2">
            <input id="rename" className="input" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} autoFocus />
            <span className="text-xs text-muted">.{renameTarget?.ext}</span>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(moveTarget)}
        onClose={() => setMoveTarget(null)}
        title="Move file"
        size="sm"
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setMoveTarget(null)}>Cancel</button>
            <button type="button" className="btn-primary" onClick={doMove}>Move</button>
          </>
        }
      >
        <label className="label" htmlFor="move-folder">Destination</label>
        <select id="move-folder" className="input" value={moveFolder} onChange={(e) => setMoveFolder(e.target.value)}>
          <option value="">Unfiled (root)</option>
          {sortedFolders.map((f) => (
            <option key={f.id} value={f.id}>
              {f.path}
            </option>
          ))}
        </select>
      </Modal>

      <Modal
        open={Boolean(folderModal)}
        onClose={() => setFolderModal(null)}
        title={folderModal?.mode === 'rename' ? 'Rename folder' : 'New folder'}
        size="sm"
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setFolderModal(null)}>Cancel</button>
            <button type="button" className="btn-primary" onClick={saveFolder} disabled={!folderName.trim()}>
              {folderModal?.mode === 'rename' ? 'Save' : 'Create'}
            </button>
          </>
        }
      >
        <label className="label" htmlFor="folder-name">Folder name</label>
        <input id="folder-name" className="input" value={folderName} onChange={(e) => setFolderName(e.target.value)} autoFocus placeholder="College Project" />
        {folderModal?.mode === 'create' && folderId !== 'all' && folderId !== 'root' && (
          <p className="mt-2 text-[11px] text-muted">Created inside {currentFolder?.path}</p>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={trashMode ? 'Delete permanently' : 'Move file to trash'}
        message={
          trashMode
            ? `${deleteTarget?.name} and its indexed text will be removed permanently. This cannot be undone.`
            : `${deleteTarget?.name} will move to trash and be excluded from search until restored.`
        }
        confirmLabel={trashMode ? 'Delete forever' : 'Move to trash'}
        destructive
        onConfirm={doDelete}
        onClose={() => setDeleteTarget(null)}
      />

      <ConfirmDialog
        open={Boolean(folderDelete)}
        title="Delete folder"
        message={`${folderDelete?.name} will be removed. Any files inside move up one level — nothing is deleted.`}
        confirmLabel="Delete folder"
        destructive
        onConfirm={removeFolder}
        onClose={() => setFolderDelete(null)}
      />

      <FilePreviewModal
        fileId={previewId}
        onClose={() => {
          setPreviewId(null);
          if (params.get('file')) setParams({});
        }}
        onOpenFull={(f) => navigate(`/files/${f.id}`)}
      />
    </div>
  );
}

function FolderRow({
  active,
  label,
  icon,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: React.ReactNode;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] transition ${
        active ? 'bg-violet-500/15 text-content' : 'text-muted hover:bg-ink-800/60 hover:text-content'
      }`}
    >
      <span className="text-violet-300">{icon}</span>
      <span className="truncate">{label}</span>
      {typeof count === 'number' && <span className="ml-auto text-[10px] text-muted">{count}</span>}
    </button>
  );
}
