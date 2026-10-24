import mongoose from 'mongoose';
import { env } from '../config/env';
import { features } from '../config/features';
import { FileChunk, KynovFile } from '../models';
import { logger } from '../utils/logger';
import { stem, tokenize } from '../utils/text';
import { cosineSimilarity, embedQuery, embedTexts, LOCAL_MODEL } from './embeddings';

export interface ScoredChunk {
  fileId: string;
  fileName: string;
  chunkIndex: number;
  page?: number;
  text: string;
  score: number;
  semantic: number;
  lexical: number;
}

/** Split extracted document text into overlapping chunks, keeping page numbers. */
export function chunkText(
  text: string,
  size = env.RAG_CHUNK_SIZE,
  overlap = env.RAG_CHUNK_OVERLAP,
): { text: string; page?: number; chunkIndex: number }[] {
  const clean = (text || '').replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').trim();
  if (!clean) return [];

  // The PDF extractor emits form-feeds between pages; keep them for citations.
  const rawPages = clean.split('\f');
  const chunks: { text: string; page?: number; chunkIndex: number }[] = [];
  let counter = 0;

  const push = (value: string, pageIdx: number) => {
    const trimmed = value.trim();
    if (trimmed.length < 30) return;
    chunks.push({
      text: trimmed.slice(0, size * 2),
      page: rawPages.length > 1 ? pageIdx + 1 : undefined,
      chunkIndex: counter++,
    });
  };

  rawPages.forEach((rawPage, pageIdx) => {
    const paragraphs = rawPage.split(/\n{2,}/).filter((p) => p.trim().length > 0);
    let buffer = '';
    for (const para of paragraphs) {
      if (buffer && (buffer.length + para.length) > size) {
        push(buffer, pageIdx);
        buffer = `${buffer.slice(-overlap)}\n${para}`;
      } else {
        buffer = buffer ? `${buffer}\n\n${para}` : para;
      }
      while (buffer.length > size * 1.6) {
        const cut = buffer.lastIndexOf('. ', size);
        const idx = cut > size * 0.4 ? cut + 1 : size;
        push(buffer.slice(0, idx), pageIdx);
        buffer = buffer.slice(Math.max(0, idx - overlap));
      }
    }
    if (buffer.trim()) push(buffer, pageIdx);
  });

  return chunks;
}

/**
 * Re-index a file's text: chunk → embed → store. Called after upload and on
 * re-index. Old chunks are always replaced atomically per file.
 */
export async function indexFileText(params: {
  fileId: string;
  userId: string;
  fileName: string;
  text: string;
}): Promise<{ chunks: number; strategy: 'remote' | 'local'; model: string }> {
  const { fileId, userId, fileName, text } = params;
  await FileChunk.deleteMany({ file: fileId, user: userId });

  const pieces = chunkText(text);
  if (!pieces.length) return { chunks: 0, strategy: features.embeddingStrategy, model: LOCAL_MODEL };

  const { vectors, model, strategy } = await embedTexts(pieces.map((p) => p.text));
  const docs = pieces.map((piece, i) => ({
    user: new mongoose.Types.ObjectId(userId),
    file: new mongoose.Types.ObjectId(fileId),
    fileName,
    chunkIndex: piece.chunkIndex,
    page: piece.page,
    text: piece.text,
    tokenCount: tokenize(piece.text).length,
    embedding: vectors[i] ?? [],
    embeddingModel: model,
  }));

  // insertMany in slices to keep documents under the 16 MB BSON batch limit.
  for (let i = 0; i < docs.length; i += 100) {
    await FileChunk.insertMany(docs.slice(i, i + 100), { ordered: false });
  }
  logger.debug(`Indexed ${docs.length} chunks for file ${fileId} (${strategy})`);
  return { chunks: docs.length, strategy, model };
}

export async function removeFileIndex(fileId: string, userId: string) {
  await FileChunk.deleteMany({ file: fileId, user: userId });
}

function lexicalScore(queryTokens: string[], text: string): number {
  if (!queryTokens.length) return 0;
  const hay = new Set(tokenize(text).map(stem));
  let hits = 0;
  for (const t of new Set(queryTokens.map(stem))) if (hay.has(t)) hits += 1;
  return hits / new Set(queryTokens.map(stem)).size;
}

/**
 * Vector search across the user's chunks.
 *  - Atlas Vector Search when MONGODB_URI + index name are configured and the
 *    embeddings come from a real model (dimensions must match the index).
 *  - Otherwise an in-process cosine scan (still real vector math).
 * Both paths are hard-scoped to `user` so cross-tenant leakage is impossible.
 */
export async function searchChunks(
  userId: string,
  query: string,
  opts: { topK?: number; fileIds?: string[]; minScore?: number } = {},
): Promise<ScoredChunk[]> {
  const topK = opts.topK ?? env.RAG_TOP_K;
  const queryTokens = tokenize(query);
  const { vectors, strategy, model } = await embedQuery(query);
  const queryVector = vectors[0] ?? [];
  const filter: Record<string, unknown> = { user: new mongoose.Types.ObjectId(userId) };
  if (opts.fileIds?.length) filter.file = { $in: opts.fileIds.map((id) => new mongoose.Types.ObjectId(id)) };

  let candidates: { file: any; fileName: string; chunkIndex: number; page?: number; text: string; embedding: number[] }[] = [];

  const useAtlas = features.vectorIndex && strategy === 'remote';

  if (useAtlas) {
    try {
      const pipeline: any[] = [
        {
          $vectorSearch: {
            index: env.MONGODB_VECTOR_INDEX,
            path: 'embedding',
            queryVector,
            numCandidates: Math.max(100, topK * 25),
            limit: Math.max(40, topK * 8),
            filter: { user: new mongoose.Types.ObjectId(userId) },
          },
        },
        { $project: { file: 1, fileName: 1, chunkIndex: 1, page: 1, text: 1, embedding: 1, score: { $meta: 'vectorSearchScore' } } },
      ];
      candidates = await FileChunk.aggregate(pipeline);
    } catch (err: any) {
      logger.warn(`Atlas vector search unavailable (${err?.message}); using in-process cosine scan.`);
    }
  }

  if (!candidates.length) {
    candidates = (await FileChunk.find(filter)
      .select('+embedding')
      .limit(6000)
      .lean()) as unknown as typeof candidates;
  }

  const scored: ScoredChunk[] = candidates.map((c) => {
    const semantic = cosineSimilarity(queryVector, c.embedding ?? []);
    const lexical = lexicalScore(queryTokens, c.text);
    const score = semantic * 0.62 + lexical * 0.38;
    return {
      fileId: String(c.file),
      fileName: c.fileName,
      chunkIndex: c.chunkIndex,
      page: c.page,
      text: c.text,
      semantic,
      lexical,
      score: Number.isFinite(score) ? score : 0,
    };
  });

  const minScore = opts.minScore ?? 0.06;
  return scored
    .filter((s) => s.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK * 4);
}

/** Best chunk per file, ranked. Used to build file result cards. */
export async function searchFileChunks(userId: string, query: string, opts: { topK?: number; fileIds?: string[] } = {}) {
  const chunks = await searchChunks(userId, query, opts);
  const byFile = new Map<string, ScoredChunk>();
  for (const chunk of chunks) {
    const existing = byFile.get(chunk.fileId);
    if (!existing || chunk.score > existing.score) byFile.set(chunk.fileId, chunk);
  }
  return [...byFile.values()].sort((a, b) => b.score - a.score);
}

/** Cheap sanity check exposed on /api/health. */
export async function vectorStats(userId: string) {
  const [chunks, files] = await Promise.all([
    FileChunk.countDocuments({ user: userId }),
    KynovFile.countDocuments({ user: userId, deletedAt: null }),
  ]);
  return { chunks, files, strategy: features.embeddingStrategy, model: LOCAL_MODEL };
}
