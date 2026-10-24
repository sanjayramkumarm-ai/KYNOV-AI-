import { Download, Eye, FileSearch, Sparkles } from 'lucide-react';
import type { FileSearchHit } from '../../types';
import { FileTypeBadge, formatBytes } from '../common/FileIcon';
import { formatDate } from '../../utils/format';

interface Props {
  hit: FileSearchHit;
  onOpen?: (hit: FileSearchHit) => void;
  onDownload?: (hit: FileSearchHit) => void;
  compact?: boolean;
}

export function FileResultCard({ hit, onOpen, onDownload, compact }: Props) {
  return (
    <div className={`group rounded-xl border bg-ink-900/60 p-3 transition hover:border-cyan-400/30 hover:bg-ink-850 ${compact ? '' : 'sm:p-4'}`}>
      <div className="flex items-start gap-3">
        <FileTypeBadge ext={hit.ext} size={compact ? 'sm' : 'md'} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="truncate text-sm font-medium text-content">{hit.name}</h4>
            {hit.favorite && <span className="chip border-amber-400/30 bg-amber-400/10 text-amber-300">★</span>}
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted">
            <span className="uppercase">{hit.ext}</span>
            <span aria-hidden>·</span>
            <span>{formatBytes(hit.size)}</span>
            <span aria-hidden>·</span>
            <span>{formatDate(hit.createdAt)}</span>
            {hit.page ? (
              <>
                <span aria-hidden>·</span>
                <span>page {hit.page}</span>
              </>
            ) : null}
          </p>
          <p className="mt-1.5 inline-flex items-start gap-1 rounded-md bg-cyan-400/[0.07] px-1.5 py-0.5 text-[11px] text-cyan-300">
            <FileSearch className="mt-0.5 h-3 w-3 shrink-0" aria-hidden /> {hit.reason}
          </p>
          {hit.snippet && (
            <p className="mt-1.5 line-clamp-3 text-[11px] leading-relaxed text-muted">
              <Sparkles className="mr-1 inline h-3 w-3 text-violet-300" aria-hidden />
              {hit.snippet}
            </p>
          )}
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <button type="button" className="btn-secondary btn-sm" onClick={() => onOpen?.(hit)}>
              <Eye className="h-3 w-3" /> Open
            </button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => onDownload?.(hit)}>
              <Download className="h-3 w-3" /> Download
            </button>
            {hit.tags?.slice(0, 3).map((t) => (
              <span key={t} className="chip">
                #{t}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
