import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Circle,
  Filter,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  Pencil,
  Link2,
} from 'lucide-react';
import { filesApi, tasksApi } from '../services/endpoints';
import { ApiError } from '../services/api';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import type { KynovFile, SuggestedTask, Task } from '../types';
import { EmptyState } from '../components/ui/EmptyState';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { SkeletonRows } from '../components/ui/Spinner';
import { formatDate, relativeDue, toDateTimeLocal } from '../utils/format';

type FilterKey = 'all' | 'today' | 'upcoming' | 'overdue' | 'done';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All open' },
  { key: 'today', label: 'Today' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'done', label: 'Completed' },
];

const PRIORITY_STYLE: Record<string, string> = {
  high: 'border-rose-400/30 bg-rose-500/10 text-rose-300',
  medium: 'border-amber-400/30 bg-amber-500/10 text-amber-300',
  low: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300',
};

export default function TasksPage() {
  const { success, error: toastError } = useToast();
  const { features } = useAuth();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [counts, setCounts] = useState({ todo: 0, done: 0, overdue: 0 });
  const [filter, setFilter] = useState<FilterKey>('all');
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<{ title: string; notes: string; dueAt: string; priority: 'low' | 'medium' | 'high' }>({
    title: '',
    notes: '',
    dueAt: '',
    priority: 'medium',
  });
  const [creating, setCreating] = useState(false);
  const [editTarget, setEditTarget] = useState<Task | null>(null);
  const [editForm, setEditForm] = useState({ title: '', notes: '', dueAt: '', priority: 'medium' as Task['priority'] });
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  const [extractOpen, setExtractOpen] = useState(false);
  const [files, setFiles] = useState<KynovFile[]>([]);
  const [selectedFile, setSelectedFile] = useState('');
  const [suggestions, setSuggestions] = useState<SuggestedTask[] | null>(null);
  const [extractBusy, setExtractBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const params =
        filter === 'done'
          ? { status: 'done' }
          : filter === 'all'
            ? { status: 'todo' }
            : { status: 'todo', filter };
      const { data } = await tasksApi.list(params);
      setTasks(data.tasks);
      setCounts(data.counts);
    } catch (err) {
      toastError('Could not load tasks', err instanceof ApiError ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setCreating(true);
    try {
      await tasksApi.create({
        title: form.title.trim(),
        notes: form.notes.trim() || undefined,
        dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null,
        priority: form.priority,
        source: { type: 'manual' },
      });
      setForm({ title: '', notes: '', dueAt: '', priority: 'medium' });
      success('Task created');
      void load();
    } catch (err) {
      toastError('Could not create task', err instanceof ApiError ? err.message : 'Unknown error');
    } finally {
      setCreating(false);
    }
  };

  const toggle = async (task: Task) => {
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: task.status === 'done' ? 'todo' : 'done' } : t)));
    try {
      await tasksApi.update(task.id, { completed: task.status !== 'done' });
      void load();
    } catch (err) {
      toastError('Could not update task', err instanceof ApiError ? err.message : 'Unknown error');
      void load();
    }
  };

  const saveEdit = async () => {
    if (!editTarget) return;
    try {
      await tasksApi.update(editTarget.id, {
        title: editForm.title.trim(),
        notes: editForm.notes.trim() || undefined,
        dueAt: editForm.dueAt ? new Date(editForm.dueAt).toISOString() : null,
        priority: editForm.priority,
      } as any);
      success('Task updated');
      setEditTarget(null);
      void load();
    } catch (err) {
      toastError('Could not update task', err instanceof ApiError ? err.message : 'Unknown error');
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    await tasksApi.remove(deleteTarget.id);
    success('Task deleted');
    void load();
  };

  const openExtract = async () => {
    setExtractOpen(true);
    setSuggestions(null);
    try {
      const { data } = await filesApi.list({ limit: 50, sort: 'recent' });
      setFiles(data.files.filter((f) => f.textExtracted));
    } catch {
      setFiles([]);
    }
  };

  const runExtract = async () => {
    if (!selectedFile) return;
    setExtractBusy(true);
    try {
      const { data } = await tasksApi.suggestions({ fileId: selectedFile });
      setSuggestions(data.suggestions);
    } catch (err) {
      setSuggestions([]);
      toastError(
        err instanceof ApiError && err.isNotConfigured ? 'AI not configured' : 'Could not extract tasks',
        err instanceof ApiError ? err.message : 'Unknown error',
      );
    } finally {
      setExtractBusy(false);
    }
  };

  const acceptSuggestion = async (s: SuggestedTask) => {
    const file = files.find((f) => f.id === selectedFile);
    await tasksApi.create({
      title: s.title,
      notes: s.notes,
      dueAt: s.dueAt ?? null,
      priority: s.priority ?? 'medium',
      source: { type: 'file', refId: selectedFile, label: file?.name },
    });
    success('Task added', s.title);
    setSuggestions((prev) => prev?.filter((t) => t.title !== s.title) ?? null);
    void load();
  };

  const grouped = useMemo(() => {
    const overdue = tasks.filter((t) => t.status === 'todo' && t.dueAt && new Date(t.dueAt) < new Date());
    const rest = tasks.filter((t) => !(t.status === 'todo' && t.dueAt && new Date(t.dueAt) < new Date()));
    return { overdue, rest };
  }, [tasks]);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Tasks & Reminders</h1>
          <p className="mt-1 text-xs text-muted">
            {counts.todo} open · {counts.done} completed
            {counts.overdue > 0 ? ` · ${counts.overdue} overdue` : ''}
          </p>
        </div>
        <button type="button" className="btn-secondary btn-sm" onClick={openExtract}>
          <Sparkles className="h-3.5 w-3.5" /> Extract from document
        </button>
      </header>

      {/* Create */}
      <form onSubmit={create} className="panel space-y-3 p-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            className="input flex-1"
            placeholder="Add a task — e.g. Submit college project report"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            aria-label="Task title"
          />
          <button type="submit" className="btn-primary" disabled={creating || !form.title.trim()}>
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add task
          </button>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="task-due">Due date & time</label>
            <input
              id="task-due"
              type="datetime-local"
              className="input py-2"
              value={form.dueAt}
              onChange={(e) => setForm({ ...form, dueAt: e.target.value })}
            />
          </div>
          <div>
            <label className="label" htmlFor="task-priority">Priority</label>
            <select
              id="task-priority"
              className="input py-2"
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value as any })}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="task-notes">Notes (optional)</label>
            <input id="task-notes" className="input py-2" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-1.5">
        <Filter className="h-3.5 w-3.5 text-muted" />
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`chip transition ${filter === f.key ? 'chip-active' : 'hover:text-content'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="panel p-4">
          <SkeletonRows rows={4} className="h-14" />
        </div>
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="Nothing here"
          description={filter === 'done' ? 'Completed tasks will appear here.' : 'Add a task above, or extract deadlines from one of your documents.'}
        />
      ) : (
        <div className="space-y-4">
          {grouped.overdue.length > 0 && (
            <section>
              <h2 className="mb-2 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-rose-300">
                <AlertTriangle className="h-3 w-3" /> Overdue
              </h2>
              <ul className="space-y-2">
                {grouped.overdue.map((task) => (
                  <TaskRow key={task.id} task={task} onToggle={toggle} onEdit={(t) => { setEditTarget(t); setEditForm({ title: t.title, notes: t.notes ?? '', dueAt: toDateTimeLocal(t.dueAt), priority: t.priority }); }} onDelete={setDeleteTarget} />
                ))}
              </ul>
            </section>
          )}
          {grouped.rest.length > 0 && (
            <section>
              <h2 className="mb-2 text-[10px] uppercase tracking-wider text-muted">{filter === 'done' ? 'Completed' : 'Tasks'}</h2>
              <ul className="space-y-2">
                {grouped.rest.map((task) => (
                  <TaskRow key={task.id} task={task} onToggle={toggle} onEdit={(t) => { setEditTarget(t); setEditForm({ title: t.title, notes: t.notes ?? '', dueAt: toDateTimeLocal(t.dueAt), priority: t.priority }); }} onDelete={setDeleteTarget} />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      <Modal
        open={Boolean(editTarget)}
        onClose={() => setEditTarget(null)}
        title="Edit task"
        size="sm"
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setEditTarget(null)}>Cancel</button>
            <button type="button" className="btn-primary" onClick={saveEdit} disabled={!editForm.title.trim()}>Save</button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="label" htmlFor="edit-title">Title</label>
            <input id="edit-title" className="input" value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="edit-notes">Notes</label>
            <textarea id="edit-notes" className="input min-h-[70px]" value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label" htmlFor="edit-due">Due</label>
              <input id="edit-due" type="datetime-local" className="input" value={editForm.dueAt} onChange={(e) => setEditForm({ ...editForm, dueAt: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="edit-priority">Priority</label>
              <select id="edit-priority" className="input" value={editForm.priority} onChange={(e) => setEditForm({ ...editForm, priority: e.target.value as any })}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>
        </div>
      </Modal>

      <Modal open={extractOpen} onClose={() => setExtractOpen(false)} title="Extract tasks from a document" description="KYNOV reads the extracted text and suggests tasks. Nothing is saved until you add it." size="md">
        {features && !features.ai ? (
          <div className="rounded-xl border border-amber-400/25 bg-amber-500/[0.07] p-4 text-xs text-amber-200">
            Task extraction needs an AI provider. Add <code>AI_API_KEY</code> to server/.env and restart the API. You can still
            create tasks manually.
          </div>
        ) : (
          <>
            <label className="label" htmlFor="extract-file">Document</label>
            <div className="flex gap-2">
              <select id="extract-file" className="input" value={selectedFile} onChange={(e) => setSelectedFile(e.target.value)}>
                <option value="">Select a searchable file…</option>
                {files.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
              <button type="button" className="btn-primary shrink-0" onClick={runExtract} disabled={!selectedFile || extractBusy}>
                {extractBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Extract
              </button>
            </div>
            {files.length === 0 && <p className="mt-2 text-[11px] text-muted">No searchable files yet. Upload and index a document first.</p>}

            {suggestions && (
              <div className="mt-4 space-y-2">
                {suggestions.length === 0 ? (
                  <p className="text-xs text-muted">No actionable tasks were found in that document.</p>
                ) : (
                  suggestions.map((s) => {
                    const due = relativeDue(s.dueAt);
                    return (
                      <div key={s.title} className="flex items-start justify-between gap-3 rounded-xl border bg-ink-900/60 p-3">
                        <div className="min-w-0">
                          <p className="text-xs text-content">{s.title}</p>
                          <p className="mt-0.5 text-[10px] text-muted">{due.label}</p>
                        </div>
                        <button type="button" className="btn-primary btn-sm shrink-0" onClick={() => acceptSuggestion(s)}>
                          Add
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete task"
        message={`“${deleteTarget?.title}” will be removed permanently.`}
        confirmLabel="Delete"
        destructive
        onConfirm={remove}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}

function TaskRow({
  task,
  onToggle,
  onEdit,
  onDelete,
}: {
  task: Task;
  onToggle: (t: Task) => void;
  onEdit: (t: Task) => void;
  onDelete: (t: Task) => void;
}) {
  const due = relativeDue(task.dueAt);
  const done = task.status === 'done';
  return (
    <li className={`group flex items-start gap-3 rounded-xl border bg-ink-900/50 p-3 transition hover:border-cyan-400/20 ${done ? 'opacity-60' : ''}`}>
      <button type="button" onClick={() => onToggle(task)} className="mt-0.5 shrink-0" aria-label={done ? 'Mark as not done' : 'Mark as done'}>
        {done ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : <Circle className="h-4 w-4 text-muted hover:text-cyan-300" />}
      </button>
      <div className="min-w-0 flex-1">
        <p className={`text-sm ${done ? 'text-muted line-through' : 'text-content'}`}>{task.title}</p>
        {task.notes && <p className="mt-0.5 text-[11px] text-muted">{task.notes}</p>}
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span className={`chip ${PRIORITY_STYLE[task.priority]}`}>{task.priority}</span>
          {task.dueAt && (
            <span className={`chip ${due.tone === 'overdue' ? 'border-rose-400/30 text-rose-300' : ''}`}>{due.label}</span>
          )}
          {task.source?.label && (
            <span className="chip">
              <Link2 className="h-2.5 w-2.5" /> {task.source.label.slice(0, 28)}
            </span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 gap-1 opacity-0 transition group-hover:opacity-100">
        <button type="button" className="rounded p-1.5 text-muted hover:text-content" onClick={() => onEdit(task)} aria-label="Edit task">
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button type="button" className="rounded p-1.5 text-muted hover:text-rose-300" onClick={() => onDelete(task)} aria-label="Delete task">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  );
}
