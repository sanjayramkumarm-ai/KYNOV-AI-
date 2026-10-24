import { CloudUpload, FileUp, X } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { filesApi } from '../../services/endpoints';
import { ApiError } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { Spinner } from '../ui/Spinner';
import { formatBytes } from '../common/FileIcon';

const ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.txt,.md,.json,.rtf,.png,.jpg,.jpeg,.webp,.gif,.svg,.bmp,.zip';

interface Props {
  folder?: string | null;
  maxFileSizeMb?: number;
  onUploaded?: () => void;
  compact?: boolean;
}

export function UploadDropzone({ folder, maxFileSizeMb = 25, onUploaded, compact }: Props) {
  const [dragging, setDragging] = useState(false);
  const [queue, setQueue] = useState<{ file: File; id: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progressLabel, setProgressLabel] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const { success, error: toastError } = useToast();

  const addFiles = useCallback(
    (list: FileList | File[]) => {
      const next = [...list].filter((f) => f.size > 0);
      const tooBig = next.filter((f) => f.size > maxFileSizeMb * 1024 * 1024);
      if (tooBig.length) {
        toastError('File too large', `${tooBig.map((f) => f.name).join(', ')} exceeds the ${maxFileSizeMb} MB limit.`);
      }
      const allowed = next.filter((f) => f.size <= maxFileSizeMb * 1024 * 1024);
      setQueue((prev) => [...prev, ...allowed.map((file) => ({ file, id: `${file.name}-${file.size}-${Math.random()}` }))].slice(0, 10));
    },
    [maxFileSizeMb, toastError],
  );

  const upload = async () => {
    if (!queue.length) return;
    setUploading(true);
    try {
      const { data } = await filesApi.upload(
        queue.map((q) => q.file),
        { folder, tags: [] },
      );
      const ok = data.uploaded ?? [];
      const bad = data.failed ?? [];
      if (ok.length) {
        success(
          `Uploaded ${ok.length} file${ok.length > 1 ? 's' : ''}`,
          ok.some((f) => f.textExtracted) ? 'Text extracted — searchable by KYNOV AI.' : 'Stored. Metadata is searchable.',
        );
      }
      if (bad.length) toastError('Some files were not uploaded', bad.map((b) => `${b.name}: ${b.message}`).join(' · '));
      setQueue([]);
      onUploaded?.();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Upload failed.';
      toastError('Upload failed', message);
    } finally {
      setUploading(false);
      setProgressLabel('');
    }
  };

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
        }}
        role="button"
        tabIndex={0}
        aria-label="Upload files by drag and drop or browse"
        className={`group cursor-pointer rounded-2xl border-2 border-dashed transition ${compact ? 'p-4' : 'p-8'} ${
          dragging ? 'border-cyan-400/60 bg-cyan-400/[0.07]' : 'border-white/12 hover:border-cyan-400/40 hover:bg-ink-900/60'
        }`}
      >
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="grid h-11 w-11 place-items-center rounded-xl border border-cyan-400/25 bg-cyan-400/10 text-cyan-300 transition group-hover:scale-105">
            {dragging ? <FileUp className="h-5 w-5" /> : <CloudUpload className="h-5 w-5" />}
          </span>
          <p className="text-sm font-medium text-content">
            {dragging ? 'Drop to upload' : 'Drag files here or click to browse'}
          </p>
          <p className="text-[11px] text-muted">
            PDF, Word, Excel, PowerPoint, images, text · up to {maxFileSizeMb} MB each
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {queue.length > 0 && (
        <div className="space-y-2 rounded-xl border bg-ink-900/60 p-3">
          {queue.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="min-w-0 flex-1 truncate text-content/90">{item.file.name}</span>
              <span className="text-muted">{formatBytes(item.file.size)}</span>
              <button
                type="button"
                onClick={() => setQueue((prev) => prev.filter((q) => q.id !== item.id))}
                className="rounded p-1 text-muted hover:text-rose-300"
                aria-label={`Remove ${item.file.name}`}
                disabled={uploading}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <div className="flex items-center justify-between gap-2 pt-1">
            <p className="text-[11px] text-muted">{progressLabel}</p>
            <div className="flex gap-2">
              <button type="button" className="btn-ghost btn-sm" onClick={() => setQueue([])} disabled={uploading}>
                Clear
              </button>
              <button type="button" className="btn-primary btn-sm" onClick={upload} disabled={uploading}>
                {uploading ? <Spinner className="h-3 w-3" /> : <CloudUpload className="h-3.5 w-3.5" />}
                Upload {queue.length}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
