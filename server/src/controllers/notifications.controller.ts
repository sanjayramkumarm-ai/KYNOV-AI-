import type { Request, Response } from 'express';
import { Notification, Task } from '../models';
import { asyncHandler } from '../utils/asyncHandler';
import { ok, pageMeta, parsePagination } from '../utils/http';
import { ApiError } from '../utils/ApiError';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, skip } = parsePagination(req.query as Record<string, unknown>, { page: 1, limit: 25, maxLimit: 50 });

  // Materialise due reminders as notifications on read (no background worker needed).
  const now = new Date();
  const dueReminders = await Task.find({
    user: req.user!.id,
    status: 'todo',
    remindAt: { $lte: now },
    reminderSent: false,
  }).lean();
  if (dueReminders.length) {
    await Notification.insertMany(
      dueReminders.map((t) => ({
        user: req.user!.id,
        type: 'reminder' as const,
        title: `Reminder: ${t.title}`,
        body: t.dueAt ? `Due ${new Date(t.dueAt).toLocaleString('en-GB')}` : 'Task reminder',
        link: '/tasks',
        meta: { taskId: String(t._id) },
      })),
    );
    await Task.updateMany({ _id: { $in: dueReminders.map((t) => t._id) } }, { $set: { reminderSent: true } });
  }

  const filter = { user: req.user!.id };
  const [docs, total, unread] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ ...filter, read: false }),
  ]);
  return ok(res, { notifications: docs.map((d) => ({ ...d, id: String(d._id) })), unread }, 200, pageMeta(total, page, limit));
});

export const markRead = asyncHandler(async (req: Request, res: Response) => {
  const doc = await Notification.findOneAndUpdate(
    { _id: req.params.id, user: req.user!.id },
    { $set: { read: true } },
    { new: true },
  );
  if (!doc) throw ApiError.notFound('Notification not found.');
  return ok(res, { id: String(doc._id), read: true });
});

export const markAllRead = asyncHandler(async (req: Request, res: Response) => {
  const result = await Notification.updateMany({ user: req.user!.id, read: false }, { $set: { read: true } });
  return ok(res, { updated: result.modifiedCount });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const doc = await Notification.findOneAndDelete({ _id: req.params.id, user: req.user!.id });
  if (!doc) throw ApiError.notFound('Notification not found.');
  return ok(res, { id: String(doc._id) });
});
