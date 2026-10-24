import {
  File as FileIconBase,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileType2,
  Presentation,
} from 'lucide-react';

const MAP: Record<string, { Icon: typeof FileText; className: string }> = {
  pdf: { Icon: FileType2, className: 'text-rose-300 bg-rose-500/10 border-rose-400/25' },
  doc: { Icon: FileText, className: 'text-sky-300 bg-sky-500/10 border-sky-400/25' },
  docx: { Icon: FileText, className: 'text-sky-300 bg-sky-500/10 border-sky-400/25' },
  rtf: { Icon: FileText, className: 'text-sky-300 bg-sky-500/10 border-sky-400/25' },
  txt: { Icon: FileText, className: 'text-slate-300 bg-slate-400/10 border-slate-300/25' },
  md: { Icon: FileText, className: 'text-slate-300 bg-slate-400/10 border-slate-300/25' },
  json: { Icon: FileText, className: 'text-amber-300 bg-amber-500/10 border-amber-400/25' },
  csv: { Icon: FileSpreadsheet, className: 'text-emerald-300 bg-emerald-500/10 border-emerald-400/25' },
  xls: { Icon: FileSpreadsheet, className: 'text-emerald-300 bg-emerald-500/10 border-emerald-400/25' },
  xlsx: { Icon: FileSpreadsheet, className: 'text-emerald-300 bg-emerald-500/10 border-emerald-400/25' },
  ppt: { Icon: Presentation, className: 'text-orange-300 bg-orange-500/10 border-orange-400/25' },
  pptx: { Icon: Presentation, className: 'text-orange-300 bg-orange-500/10 border-orange-400/25' },
  png: { Icon: FileImage, className: 'text-violet-300 bg-violet-500/10 border-violet-400/25' },
  jpg: { Icon: FileImage, className: 'text-violet-300 bg-violet-500/10 border-violet-400/25' },
  jpeg: { Icon: FileImage, className: 'text-violet-300 bg-violet-500/10 border-violet-400/25' },
  webp: { Icon: FileImage, className: 'text-violet-300 bg-violet-500/10 border-violet-400/25' },
  gif: { Icon: FileImage, className: 'text-violet-300 bg-violet-500/10 border-violet-400/25' },
  svg: { Icon: FileImage, className: 'text-violet-300 bg-violet-500/10 border-violet-400/25' },
  bmp: { Icon: FileImage, className: 'text-violet-300 bg-violet-500/10 border-violet-400/25' },
  zip: { Icon: FileArchive, className: 'text-yellow-300 bg-yellow-500/10 border-yellow-400/25' },
};

export function FileTypeBadge({ ext, size = 'md' }: { ext: string; size?: 'sm' | 'md' | 'lg' }) {
  const entry = MAP[ext?.toLowerCase()] ?? { Icon: FileIconBase, className: 'text-slate-300 bg-slate-400/10 border-slate-300/25' };
  const { Icon, className } = entry;
  const box = size === 'sm' ? 'h-8 w-8 rounded-lg' : size === 'lg' ? 'h-14 w-14 rounded-2xl' : 'h-10 w-10 rounded-xl';
  const icon = size === 'sm' ? 'h-4 w-4' : size === 'lg' ? 'h-7 w-7' : 'h-5 w-5';
  return (
    <span className={`grid shrink-0 place-items-center border ${box} ${className}`} title={`${ext.toUpperCase()} file`}>
      <Icon className={icon} aria-hidden />
    </span>
  );
}

export function formatBytes(bytes = 0): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** i;
  return `${value >= 10 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}
