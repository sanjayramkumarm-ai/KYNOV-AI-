import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ok } from '../utils/http';
import { handleVoiceCommand, parseVoiceCommand } from '../services/voice';
import { features } from '../config/features';

export const command = asyncHandler(async (req: Request, res: Response) => {
  const { transcript, includeEmails } = req.body as { transcript: string; includeEmails?: boolean };
  const result = await handleVoiceCommand(req.user!.id, transcript, { includeEmails });
  return ok(res, { ...result, aiConfigured: features.ai });
});

export const parseOnly = asyncHandler(async (req: Request, res: Response) => {
  const transcript = String(req.query.transcript ?? '');
  return ok(res, parseVoiceCommand(transcript));
});
