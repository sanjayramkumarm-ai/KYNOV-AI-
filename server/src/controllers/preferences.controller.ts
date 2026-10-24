import type { Request, Response } from 'express';
import { UserPreference } from '../models';
import { asyncHandler } from '../utils/asyncHandler';
import { ok } from '../utils/http';

export const get = asyncHandler(async (req: Request, res: Response) => {
  const prefs = await UserPreference.findOneAndUpdate(
    { user: req.user!.id },
    { $setOnInsert: { user: req.user!.id } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  return ok(res, { preferences: prefs });
});

/** Deep-merges the provided sections so partial updates are safe. */
export const update = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as Record<string, any>;
  const set: Record<string, unknown> = {};
  for (const [section, value] of Object.entries(body)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [k, v] of Object.entries(value)) set[`${section}.${k}`] = v;
    } else {
      set[section] = value;
    }
  }
  const prefs = await UserPreference.findOneAndUpdate(
    { user: req.user!.id },
    { $set: set, $setOnInsert: { user: req.user!.id } },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  );
  return ok(res, { preferences: prefs });
});
