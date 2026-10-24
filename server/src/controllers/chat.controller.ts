import type { Request, Response } from 'express';
import { Conversation, Message } from '../models';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { ok, pageMeta, parsePagination } from '../utils/http';
import { answerQuestion } from '../services/rag';
import type { LlmMessage } from '../services/llm';
import { features } from '../config/features';
import { logger } from '../utils/logger';

function deriveTitle(text: string) {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > 60 ? `${clean.slice(0, 57).trimEnd()}…` : clean || 'New conversation';
}

export const listConversations = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, skip } = parsePagination(req.query as Record<string, unknown>);
  const filter = { user: req.user!.id, archived: false };
  const [docs, total] = await Promise.all([
    Conversation.find(filter).sort({ pinned: -1, lastMessageAt: -1 }).skip(skip).limit(limit).lean(),
    Conversation.countDocuments(filter),
  ]);
  return ok(res, docs.map((d) => ({ ...d, id: String(d._id) })), 200, pageMeta(total, page, limit));
});

export const createConversation = asyncHandler(async (req: Request, res: Response) => {
  const conv = await Conversation.create({ user: req.user!.id, title: req.body.title || 'New conversation' });
  return ok(res, { conversation: { ...conv.toObject(), id: String(conv._id) }, messages: [] }, 201);
});

export const getConversation = asyncHandler(async (req: Request, res: Response) => {
  // Ownership is part of the query, never a post-fetch check.
  const conv = await Conversation.findOne({ _id: req.params.id, user: req.user!.id }).lean();
  if (!conv) throw ApiError.notFound('Conversation not found.');
  const messages = await Message.find({ conversation: conv._id, user: req.user!.id }).sort({ createdAt: 1 }).lean();
  return ok(res, {
    conversation: { ...conv, id: String(conv._id) },
    messages: messages.map((m) => ({ ...m, id: String(m._id) })),
  });
});

export const updateConversation = asyncHandler(async (req: Request, res: Response) => {
  const { title, pinned, archived } = req.body as any;
  const conv = await Conversation.findOneAndUpdate(
    { _id: req.params.id, user: req.user!.id },
    { $set: { ...(title ? { title } : {}), ...(pinned !== undefined ? { pinned } : {}), ...(archived !== undefined ? { archived } : {}) } },
    { new: true },
  );
  if (!conv) throw ApiError.notFound('Conversation not found.');
  return ok(res, { conversation: { ...conv.toObject(), id: String(conv._id) } });
});

export const deleteConversation = asyncHandler(async (req: Request, res: Response) => {
  const conv = await Conversation.findOneAndDelete({ _id: req.params.id, user: req.user!.id });
  if (!conv) throw ApiError.notFound('Conversation not found.');
  await Message.deleteMany({ conversation: conv._id, user: req.user!.id });
  return ok(res, { id: String(conv._id), message: 'Conversation deleted.' });
});

/** One chat turn: persist → RAG → persist → return both messages. */
export const sendMessageHandler = asyncHandler(async (req: Request, res: Response) => {
  const { conversationId, message, fileId, includeEmails } = req.body as {
    conversationId?: string;
    message: string;
    fileId?: string;
    includeEmails?: boolean;
  };
  const userId = req.user!.id;

  let conv = conversationId ? await Conversation.findOne({ _id: conversationId, user: userId }) : null;
  let isNew = false;
  if (conversationId && !conv) throw ApiError.notFound('Conversation not found.');
  if (!conv) {
    conv = await Conversation.create({ user: userId, title: deriveTitle(message) });
    isNew = true;
  }

  const userMessage = await Message.create({
    user: userId,
    conversation: conv._id,
    role: 'user',
    content: message,
    ...(fileId ? { attachments: [] } : {}),
  });

  const history = await Message.find({ conversation: conv._id, user: userId, role: { $in: ['user', 'assistant'] }, _id: { $ne: userMessage._id } })
    .sort({ createdAt: -1 })
    .limit(8)
    .lean();

  const llmHistory: LlmMessage[] = history
    .reverse()
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content.slice(0, 4000) }));

  let answer;
  try {
    answer = await answerQuestion({ userId, question: message, history: llmHistory, includeEmails, fileId });
  } catch (err: any) {
    // Keep the user's message so nothing is silently lost, then surface the error.
    await Message.create({
      user: userId,
      conversation: conv._id,
      role: 'assistant',
      content:
        err?.code === 'FEATURE_NOT_CONFIGURED'
          ? 'AI generation is not configured yet, so I could not answer this one. Retrieval and file search still work — ask me to find a file, or add AI_API_KEY to server/.env.'
          : `I could not answer that: ${err?.message ?? 'unknown error'}`,
      modelName: 'error',
    }).catch(() => undefined);
    throw err;
  }

  const assistantMessage = await Message.create({
    user: userId,
    conversation: conv._id,
    role: 'assistant',
    content: answer.answer,
    intent: answer.intent,
    sources: answer.sources as any,
    attachments: answer.attachments as any,
    modelName: answer.model,
    latencyMs: answer.latencyMs,
  });

  if (isNew && conv.title === 'New conversation') {
    conv.title = deriveTitle(message);
  }
  conv.messageCount += 2;
  conv.lastMessageAt = new Date();
  await conv.save();

  logger.debug(`Chat turn in ${conv._id} (${answer.intent}/${answer.mode}) in ${answer.latencyMs}ms`);

  return ok(
    res,
    {
      conversation: { ...conv.toObject(), id: String(conv._id) },
      userMessage: { ...userMessage.toObject(), id: String(userMessage._id) },
      assistantMessage: { ...assistantMessage.toObject(), id: String(assistantMessage._id) },
      mode: answer.mode,
      notice: answer.notice,
      files: answer.files,
    },
    201,
  );
});

/** Ad-hoc question without persisting a conversation (used by Smart Search). */
export const ask = asyncHandler(async (req: Request, res: Response) => {
  const { question, fileId, includeEmails } = req.body as { question: string; fileId?: string; includeEmails?: boolean };
  const answer = await answerQuestion({ userId: req.user!.id, question, fileId, includeEmails });
  return ok(res, { ...answer, aiConfigured: features.ai });
});
