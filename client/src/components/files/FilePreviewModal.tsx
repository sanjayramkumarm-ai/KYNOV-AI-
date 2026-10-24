import { AlertTriangle, Download, ExternalLink, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { fileContentUrl, ApiError } from '../../services/api';
import { filesApi } from '../../services/endpoints';
import type { KynovFile } from '../../types';
import { formatBytes } from '../common/FileIcon';
import { formatDate } from '../../utils/format';

interface Props {
  fileId: string | null;
  onClose: () => void;
  onOpenFull?: (file: KynovFile) => void;
}

/**
 * Renders real file content from the authenticated API (never a mock).
 * PDFs and images stream inline; text is loaded and shown; Office files are
 * offered as a download because browsers cannot render them reliably inline.
 */
export function FilePreviewModal({ fileId, onClose, onOpenFull }: Props) {
  const [file, setFile] = useState<KynovFile | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!fileId) {
      setFile(null);
      setText(null);
      setError(null);
      return;
    }
    let alive = true;
    setLoading(true);
    setError(null);
    setText(null);

    filesApi
      .detail(fileId)
      .then(async ({ data }) => {
        if (!alive) return;
        setFile(data.file);
        if (data.file.previewKind === 'text') {
          const res = await fetch(fileContentUrl(data.file.id), { credentials: 'include' });
          if (!res.ok) throw new Error(`Could not load file content (${res.status}).`);
          const body = await res.text();
          if (alive) setText(body.slice(0, 200_000));
        }
      })
      .catch((err) => {
        if (alive) setError(err instanceof ApiError ? err.message : 'Could not load this file.');
      })
      .finally(() => alive && setLoading(false));

    return () => {
      alive = false;
    };
  }, [fileId]);

  return (
    <Modal open={Boolean(fileId)} onClose={onClose} size="xl" title={file?.name ?? 'File preview'} description={file ? `${file.ext.toUpperCase()} · ${formatBytes(file.size)} · uploaded ${formatDate(file.createdAt)}` : undefined}
      footer={
        file ? (
          <>
            {onOpenFull && (
              <button type="button" className="btn-secondary btn-sm" onClick={() => onOpenFull(file)}>
                <ExternalLink className="h-3.5 w-3.5" /> Details
              </button>
            )}
            <a className="btn-primary btn-sm" href={fileContentUrl(file.id, true)} download>
              <Download className="h-3.5 w-3.5" /> Download
            </a>
          </>
        ) : null
      }
    >
      {loading && (
        <div className="flex h-64 items-center justify-center text-muted">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading file…
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-200">
          <AlertTriangle className="mt-0.5 h-4 w-4" /> {error}
        </div>
      )}

      {file && !loading && !error && (
        <>
          {file.previewKind === 'pdf' && (
            <iframe
              src={fileContentUrl(file.id)}
              title={file.name}
              className="h-[70vh] w-full rounded-xl border bg-white"
            />
          )}

          {file.previewKind === 'image' && (
            <div className="grid max-h-[70vh] place-items-center overflow-auto rounded-xl border bg-black/30 p-3">
              <img src={fileContentUrl(file.id)} alt={file.name} className="max-h-[66vh] w-auto rounded-lg object-contain" />
            </div>
          )}

          {file.previewKind === 'text' && (
            <pre className="max-h-[65vh] overflow-auto whitespace-pre-wrap rounded-xl border bg-ink-950/80 p-4 font-mono text-[12px] leading-relaxed text-content/90">
              {text ?? 'No text content.'}
            </pre>
          )}

          {(file.previewKind === 'office' || file.previewKind === 'archive' || file.previewKind === 'none') && (
            <div className="rounded-xl border border-amber-400/25 bg-amber-500/[0.06] p-5 text-sm text-muted">
              <p className="flex items-center gap-2 font-medium text-content">
                <AlertTriangle className="h-4 w-4 text-amber-300" /> In-browser preview is not available for {file.ext.toUpperCase()} files
              </p>
              <p className="mt-1.5 text-xs leading-relaxed">
                Download the file to open it in the right application. AI search still works if text could be extracted.
              </p>
              <a className="btn-secondary btn-sm mt-3" href={fileContentUrl(file.id, true)} download>
                <Download className="h-3.5 w-3.5" /> Download {file.name}
              </a>
            </div>
          )}

          {file.summary && (
            <div className="mt-4 rounded-xl border border-violet-400/20 bg-violet-500/[0.06] p-4">
              <p className="text-[11px] font-medium uppercase tracking-wider text-violet-300">AI summary</p>
              <p className="mt-1 text-xs leading-relaxed text-content/90">{file.summary}</p>
              {file.keywords?.length ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {file.keywords.map((k) => (
                    <span key={k} className="chip">
                      {k}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          )}

          {!file.textExtracted && file.extractionError && (
            <p className="mt-3 rounded-lg border border-white/10 bg-ink-900/60 p-3 text-[11px] text-muted">
              Text extraction: {file.extractionError}
            </p>
          )}
        </>
      )}
    </Modal>
  );
}
