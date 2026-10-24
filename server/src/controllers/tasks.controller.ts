import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { FileChunk, KynovFile, Task } from '../models';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { ok, pageMeta, parsePagination, escapeRegex } from '../utils/http';
import { extractTasks } from '../services/taskExtract';
import { getMessage } from '../services/gmail';
import { notify } from '../services/notifications';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query as Record<string, string | undefined>;
  const { page, limit, skip } = parsePagination(q, { page: 1, limit: 50, maxLimit: 100 });
  const now = new Date();
  const filter: Record<string, any> = { user: req.user!.id };

  if (q.status && q.status !== 'all') filter.status = q.status;
  if (q.q) filter.title = new RegExp(escapeRegex(q.q), 'i');

  switch (q.filter) {
    case 'upcoming':
      filter.status = 'todo';
      filter.dueAt = { $gte: now };
      break;
    case 'overdue':
      filter.status = 'todo';
      filter.dueAt = { $lt: now };
      break;
    case 'today': {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      filter.status = 'todo';
      filter.dueAt = { $gte: start, $lt: end };
      break;
    }
    default:
      break;
  }

  const [docs, total, counts] = await Promise.all([
    Task.find(filter).sort({ status: 1, dueAt: 1, createdAt: -1 }).skip(skip).limit(limit).lean(),
    Task.countDocuments(filter),
    Task.aggregate([
      { $match: { user: new mongoose.Types.ObjectId(req.user!.id) } },
      {
        $group: {
          _id: null,
          todo: { $sum: { $cond: [{ $eq: ['$status', 'todo'] }, 1, 0] } },
          done: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } },
          overdue: {
            $sum: {
              $cond: [{ $and: [{ $eq: ['$status', 'todo'] }, { $lt: ['$dueAt', now] }, { $ne: ['$dueAt', null] }] }, 1, 0],
            },
          },
        },
      },
    ]),
  ]);

  return ok(
    res,
    {
      tasks: docs.map((d) => ({ ...d, id: String(d._id) })),
      counts: counts[0] ?? { todo: 0, done: 0, overdue: 0 },
    },
    200,
    pageMeta(total, page, limit),
  );
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as any;
  const task = await Task.create({
    user: req.user!.id,
    title: body.title,
    notes: body.notes,
    dueAt: body.dueAt ? new Date(body.dueAt) : null,
    remindAt: body.remindAt ? new Date(body.remindAt) : null,
    priority: body.priority ?? 'medium',
    status: body.status ?? 'todo',
    tags: body.tags ?? [],
    source: body.source ?? { type: 'manual' },
  });
  await notify({
    userId: req.user!.id,
    type: 'task',
    title: `Task created: ${task.title}`,
    body: task.dueAt ? `Due ${new Date(task.dueAt).toLocaleString('en-GB')}` : 'No due date',
    link: '/tasks',
  });
  return ok(res, { task: { ...task.toObject(), id: String(task._id) } }, 201);
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as any;
  const patch: Record<string, unknown> = {};
  for (const key of ['title', 'notes', 'priority', 'tags']) if (body[key] !== undefined) patch[key] = body[key];
  if (body.dueAt !== undefined) patch.dueAt = body.dueAt ? new Date(body.dueAt) : null;
  if (body.remindAt !== undefined) patch.remindAt = body.remindAt ? new Date(body.remindAt) : null;
  if (body.status !== undefined) {
    patch.status = body.status;
    patch.completedAt = body.status === 'done' ? new Date() : null;
  }
  if (body.completed !== undefined) {
    patch.status = body.completed ? 'done' : 'todo';
    patch.completedAt = body.completed ? new Date() : null;
  }

  const task = await Task.findOneAndUpdate({ _id: req.params.id, user: req.user!.id }, { $set: patch }, { new: true, runValidators: true });
  if (!task) throw ApiError.notFound('Task not found.');
  return ok(res, { task: { ...task.toObject(), id: String(task._id) } });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const task = await Task.findOneAndDelete({ _id: req.params.id, user: req.user!.id });
  if (!task) throw ApiError.notFound('Task not found.');
  return ok(res, { id: String(task._id) });
});

export const upcoming = asyncHandler(async (req: Request, res: Response) => {
  const now = new Date();
  const in7 = new Date(now.getTime() + 7 * 86_400_000);
  const [next, overdue] = await Promise.all([
    Task.find({ user: req.user!.id, status: 'todo', dueAt: { $gte: now, $lte: in7 } }).sort({ dueAt: 1 }).limit(6).lean(),
    Task.find({ user: req.user!.id, status: 'todo', dueAt: { $lt: now } }).sort({ dueAt: 1 }).limit(6).lean(),
  ]);
  return ok(res, {
    upcoming: next.map((d) => ({ ...d, id: String(d._id) })),
    overdue: overdue.map((d) => ({ ...d, id: String(d._id) })),
  });
});

/** AI-suggested tasks from a document or email. Nothing is saved until confirmed. */
export const suggestions = asyncHandler(async (req: Request, res: Response) => {
  const { fileId, gmailId } = req.query as Record<string, string | undefined>;
  if (!fileId && !gmailId) throw ApiError.badRequest('Provide fileId or gmailId.');

  if (fileId) {
    const file = await KynovFile.findOne({ _id: fileId, user: req.user!.id, deletedAt: null }).lean();
    if (!file) throw ApiError.notFound('File not found.');
    const chunks = await FileChunk.find({ file: file._id, user: req.user!.id }).sort({ chunkIndex: 1 }).limit(20).lean();
    const text = chunks.map((c) => c.text).join('\n\n');
    if (!text.trim()) throw ApiError.badRequest('This file has no readable text to scan for tasks.');
    const tasks = await extractTasks(text, { sourceLabel: `File: ${file.name}` });
    return ok(res, {
      source: { type: 'file', refId: String(file._id), label: file.name },
      suggestions: tasks,
    });
  }

  const msg = await getMessage(req.user!.id, gmailId!);
  const tasks = await extractTasks(msg.bodyText, { sourceLabel: `Email: ${msg.subject}` });
  return ok(res, {
    source: { type: 'email', refId: msg.gmailId, label: msg.subject },
    suggestions: tasks,
  });
});
