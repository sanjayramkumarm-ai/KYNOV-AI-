import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Folder, KynovFile } from '../models';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { ok } from '../utils/http';

interface FolderNode { id: string; depth: number; children: FolderNode[]; [key: string]: unknown }
function buildTree(nodes: any[], parent: string | null = null, depth = 0): FolderNode[] {
  return nodes
    .filter((n) => String(n.parent ?? 'null') === String(parent ?? 'null'))
    .map((n) => ({
      ...n,
      id: String(n._id),
      depth,
      children: buildTree(nodes, String(n._id), depth + 1),
    }));
}

export const list = asyncHandler(async (req: Request, res: Response) => {
  const folders = await Folder.find({ user: req.user!.id }).sort({ name: 1 }).lean();
  const counts = await KynovFile.aggregate([
    { $match: { user: new mongoose.Types.ObjectId(req.user!.id), deletedAt: null } },
    { $group: { _id: '$folder', count: { $sum: 1 }, bytes: { $sum: '$size' } } },
  ]);
  const countMap = new Map(counts.map((c) => [String(c._id ?? 'root'), { count: c.count, bytes: c.bytes }]));
  const plain = folders.map((f) => ({
    ...f,
    id: String(f._id),
    parent: f.parent ? String(f.parent) : null,
    fileCount: countMap.get(String(f._id))?.count ?? 0,
    size: countMap.get(String(f._id))?.bytes ?? 0,
  }));
  return ok(res, {
    folders: plain,
    tree: buildTree(plain),
    rootFileCount: countMap.get('root')?.count ?? 0,
  });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const { name, parent, color } = req.body as { name: string; parent?: string | null; color?: string };
  let parentDoc = null;
  if (parent) {
    parentDoc = await Folder.findOne({ _id: parent, user: req.user!.id }).lean();
    if (!parentDoc) throw ApiError.badRequest('Parent folder not found.');
  }
  const path = `${parentDoc?.path ?? ''}/${name}`.replace(/\/+/g, '/');
  const exists = await Folder.findOne({ user: req.user!.id, parent: parent ? parent : null, name }).lean();
  if (exists) throw ApiError.conflict('A folder with that name already exists here.');
  const folder = await Folder.create({ user: req.user!.id, name, parent: parent || null, path, color });
  return ok(res, { folder: { ...folder.toObject(), id: String(folder._id), fileCount: 0 } }, 201);
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const { name, parent, color } = req.body as { name?: string; parent?: string | null; color?: string };
  const folder = await Folder.findOne({ _id: req.params.id, user: req.user!.id });
  if (!folder) throw ApiError.notFound('Folder not found.');

  if (parent !== undefined && String(parent ?? '') !== String(folder.parent ?? '')) {
    if (parent && String(parent) === String(folder._id)) throw ApiError.badRequest('A folder cannot be moved inside itself.');
    if (parent) {
      const target = await Folder.findOne({ _id: parent, user: req.user!.id }).lean();
      if (!target) throw ApiError.badRequest('Target folder not found.');
      if (target.path.startsWith(folder.path)) throw ApiError.badRequest('Cannot move a folder into its own subfolder.');
    }
    folder.parent = parent ? new mongoose.Types.ObjectId(parent) : null;
  }
  if (name) folder.name = name;
  if (color) folder.color = color;

  const parentDoc = folder.parent ? await Folder.findById(folder.parent).lean() : null;
  const oldPath = folder.path;
  folder.path = `${parentDoc?.path ?? ''}/${folder.name}`.replace(/\/+/g, '/');
  await folder.save();

  if (oldPath !== folder.path) {
    const children = await Folder.find({ user: req.user!.id, path: new RegExp(`^${oldPath}/`) }).lean();
    for (const child of children) {
      await Folder.updateOne(
        { _id: child._id },
        { $set: { path: child.path.replace(oldPath, folder.path) } },
      );
    }
  }
  return ok(res, { folder: { ...folder.toObject(), id: String(folder._id) } });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const folder = await Folder.findOne({ _id: req.params.id, user: req.user!.id }).lean();
  if (!folder) throw ApiError.notFound('Folder not found.');
  const [childFolders, childFiles] = await Promise.all([
    Folder.countDocuments({ user: req.user!.id, parent: folder._id }),
    KynovFile.countDocuments({ user: req.user!.id, folder: folder._id, deletedAt: null }),
  ]);
  const recursive = req.query.recursive === 'true';
  if ((childFolders || childFiles) && !recursive) {
    throw new ApiError(
      409,
      `This folder is not empty (${childFiles} file${childFiles === 1 ? '' : 's'}, ${childFolders} subfolder${childFolders === 1 ? '' : 's'}). Move its contents first or delete recursively.`,
      'CONFLICT',
      { childFiles, childFolders },
    );
  }
  // Move contents up to the parent rather than destroying user data.
  await KynovFile.updateMany({ user: req.user!.id, folder: folder._id }, { $set: { folder: folder.parent ?? null } });
  await Folder.updateMany({ user: req.user!.id, parent: folder._id }, { $set: { parent: folder.parent ?? null } });
  await Folder.deleteOne({ _id: folder._id });
  return ok(res, { id: String(folder._id), message: 'Folder deleted. Its contents were moved up one level.' });
});
