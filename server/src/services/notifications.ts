import { Notification } from '../models';
import { logger } from '../utils/logger';

export async function notify(params: {
  userId: string;
  type?: 'system' | 'file' | 'email' | 'task' | 'ai' | 'reminder';
  title: string;
  body?: string;
  link?: string;
  meta?: Record<string, unknown>;
}) {
  try {
    return await Notification.create({
      user: params.userId,
      type: params.type ?? 'system',
      title: params.title.slice(0, 200),
      body: params.body?.slice(0, 1000),
      link: params.link,
      meta: params.meta,
    });
  } catch (err) {
    logger.warn('Could not create notification', err);
    return null;
  }
}
