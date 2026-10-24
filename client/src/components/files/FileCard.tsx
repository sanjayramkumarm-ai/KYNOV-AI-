import { Download, Eye, MoreVertical, Pencil, Star, Trash2, FolderInput, Sparkles, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { KynovFile } from '../../types';
import { FileTypeBadge, formatBytes } from '../common/FileIcon';
import { formatDate, timeAgo } from '../../utils/format';

interface Props {
  file: KynovFile;
  view: 'grid' | 'list';
  onPreview: (file: KynovFile) => void;
  onDownload: (file: KynovFile) => void;
  onRename: (file: KynovFile) => void;
  onMove: (file: KynovFile) => void;
  onToggleFavorite: (file: KynovFile) => void;
  onDelete: (file: KynovFile) => void;
  onReindex?: (file: KynovFile) => void;
  onSummarize?: (file: KynovFile) => void;
  onAsk?: (file: KynovFile) => void;
}

export function FileCard({ file, view, onPreview, onDownload, onRename, onMove, onToggleFavorite, onDelete, onReindex, onSummarize, onAsk }: Props) {
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const actions = [
    { label: 'Preview', icon: Eye, run: () => onPreview(file) },
    { label: 'Download', icon: Download, run: () => onDownload(file) },
    { label: file.favorite ? 'Remove favourite' : 'Add to favourites', icon: Star, run: () => onToggleFavorite(file) },
    { label: 'Rename', icon: Pencil, run: () => onRename(file) },
    { label: 'Move to folder', icon: FolderInput, run: () => onMove(file) },
    ...(onAsk ? [{ label: 'Ask AI about this file', icon: Sparkles, run: () => onAsk(file) }] : []),
    ...(onSummarize ? [{ label: 'Generate AI summary', icon: Sparkles, run: () => onSummarize(file) }] : []),
    ...(onReindex ? [{ label: 'Re-index for search', icon: RefreshCw, run: () => onReindex(file) }] : []),
    { label: 'Delete', icon: Trash2, run: () => onDelete(file), danger: true },
  ];

  if (view === 'list') {
    return (
      <div className="group flex items-center gap-3 rounded-xl border bg-ink-900/50 px-3 py-2.5 transition hover:border-cyan-400/25 hover:bg-ink-850">
        <button type="button" onClick={() => onPreview(file)} className="shrink-0" aria-label={`Preview ${file.name}`}>
          <FileTypeBadge ext={file.ext} size="sm" />
        </button>
        <button type="button" onClick={() => onPreview(file)} className="min-w-0 flex-1 text-left">
          <p className="truncate text-sm text-content">{file.name}</p>
          <p className="truncate text-[11px] text-muted">
            {formatBytes(file.size)} · {formatDate(file.createdAt)}
            {file.textExtracted ? ' · indexed' : ' · not indexed'}
            {file.tags?.length ? ` · #${file.tags.join(' #')}` : ''}
          </p>
        </button>
        {file.favorite && <Star className="h-3.5 w-3.5 shrink-0 fill-amber-300 text-amber-300" aria-label="Favourite" />}
        <div className="flex items-center gap-1" ref={ref}>
          <button type="button" className="btn-ghost btn-sm hidden sm:inline-flex" onClick={() => onPreview(file)}>
            Open
          </button>
          <button
            type="button"
            onClick={() => setMenu((v) => !v)}
            className="rounded-lg p-1.5 text-muted hover:bg-ink-800 hover:text-content"
            aria-label={`More actions for ${file.name}`}
            aria-expanded={menu}
          >
            <MoreVertical className="h-4 w-4" />
          </button>
          {menu && <ActionMenu actions={actions} onClose={() => setMenu(false)} />}
        </div>
      </div>
    );
  }

  return (
    <div className="group relative flex flex-col gap-3 rounded-2xl border bg-ink-900/60 p-4 transition hover:-translate-y-0.5 hover:border-cyan-400/25 hover:shadow-glow">
      <div className="flex items-start justify-between">
        <button type="button" onClick={() => onPreview(file)} aria-label={`Preview ${file.name}`}>
          <FileTypeBadge ext={file.ext} size="lg" />
        </button>
        <div className="flex items-center gap-1" ref={ref}>
          <button
            type="button"
            onClick={() => onToggleFavorite(file)}
            className={`rounded-lg p-1.5 transition ${file.favorite ? 'text-amber-300' : 'text-muted opacity-0 group-hover:opacity-100 hover:text-amber-300'}`}
            aria-label={file.favorite ? 'Remove from favourites' : 'Add to favourites'}
          >
            <Star className={`h-4 w-4 ${file.favorite ? 'fill-amber-300' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() => setMenu((v) => !v)}
            className="rounded-lg p-1.5 text-muted hover:bg-ink-800 hover:text-content"
            aria-label={`More actions for ${file.name}`}
            aria-expanded={menu}
          >
            <MoreVertical className="h-4 w-4" />
          </button>
          {menu && <ActionMenu actions={actions} onClose={() => setMenu(false)} />}
        </div>
      </div>

      <button type="button" onClick={() => onPreview(file)} className="min-w-0 text-left">
        <p className="truncate text-sm font-medium text-content" title={file.name}>
          {file.name}
        </p>
        <p className="mt-0.5 text-[11px] text-muted">
          {formatBytes(file.size)} · {timeAgo(file.createdAt)}
        </p>
        {file.summary ? (
          <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-muted">{file.summary}</p>
        ) : (
          <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-muted/70">
            {file.textExtracted ? `${(file.textLength ?? 0).toLocaleString()} characters indexed` : file.extractionError ?? 'Metadata only'}
          </p>
        )}
      </button>

      <div className="mt-auto flex flex-wrap items-center gap-1.5">
        <span className={`chip ${file.textExtracted ? 'chip-active' : ''}`}>{file.textExtracted ? 'Searchable' : 'No text'}</span>
        {file.pageCount ? <span className="chip">{file.pageCount}p</span> : null}
        {file.tags?.slice(0, 2).map((t) => (
          <span key={t} className="chip">
            #{t}
          </span>
        ))}
      </div>
    </div>
  );
}

function ActionMenu({ actions, onClose }: { actions: { label: string; icon: any; run: () => void; danger?: boolean }[]; onClose: () => void }) {
  return (
    <div className="absolute right-0 top-9 z-20 w-56 overflow-hidden rounded-xl border bg-ink-900/98 py-1 shadow-panel backdrop-blur-xl">
      {actions.map(({ label, icon: Icon, run, danger }) => (
        <button
          key={label}
          type="button"
          onClick={() => {
            run();
            onClose();
          }}
          className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition hover:bg-ink-800 ${
            danger ? 'text-rose-300' : 'text-muted hover:text-content'
          }`}
        >
          <Icon className="h-3.5 w-3.5" /> {label}
        </button>
      ))}
    </div>
  );
}
