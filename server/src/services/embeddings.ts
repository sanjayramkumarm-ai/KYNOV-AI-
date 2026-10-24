import crypto from 'node:crypto';
import { env } from '../config/env';
import { features } from '../config/features';
import { logger } from '../utils/logger';
import { normaliseForEmbedding } from '../utils/text';

export const LOCAL_MODEL = `kynov-local-hash-${env.LOCAL_EMBEDDING_DIM}`;

export interface EmbeddingResult {
  vectors: number[][];
  model: string;
  strategy: 'remote' | 'local';
}

function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Deterministic local embedder (feature-hashing / random-projection of token
 * uni+bigrams). This is a real vector representation — it powers semantic
 * ranking, cosine similarity and dedup without any external API — but it is
 * lexical-semantic only. Configure AI_API_KEY for model-grade embeddings.
 */
export function localEmbed(text: string): number[] {
  const dim = env.LOCAL_EMBEDDING_DIM;
  const vec = new Array<number>(dim).fill(0);
  const tokens = normaliseForEmbedding(text);
  if (!tokens.length) return vec;

  const counts = new Map<string, number>();
  for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);

  for (const [token, count] of counts) {
    const h = fnv1a(token);
    const idx = h % dim;
    const sign = (h >>> 20) & 1 ? -1 : 1;
    // sublinear tf, idf-ish boost for longer tokens
    const weight = sign * (1 + Math.log(count)) * (1 + Math.min(token.length, 16) / 16);
    vec[idx] += weight;
    // second, rotated bucket reduces collision impact
    const idx2 = fnv1a(`${token}#2`) % dim;
    vec[idx2] += weight * 0.5;
  }

  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  return vec.map((v) => Number((v / norm).toFixed(6)));
}

async function remoteEmbed(texts: string[]): Promise<EmbeddingResult> {
  const vectors: number[][] = [];
  const batchSize = 64;
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45_000);
    try {
      const res = await fetch(`${env.AI_BASE_URL}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.AI_API_KEY}`,
        },
        body: JSON.stringify({ model: env.AI_EMBEDDING_MODEL, input: batch }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`Embeddings API ${res.status}: ${detail.slice(0, 300)}`);
      }
      const json = (await res.json()) as { data: { embedding: number[] }[] };
      if (!Array.isArray(json.data) || json.data.length !== batch.length) {
        throw new Error('Embeddings API returned an unexpected payload.');
      }
      for (const item of json.data) vectors.push(item.embedding);
    } finally {
      clearTimeout(timer);
    }
  }
  return { vectors, model: env.AI_EMBEDDING_MODEL, strategy: 'remote' };
}

export async function embedTexts(texts: string[]): Promise<EmbeddingResult> {
  if (!texts.length) return { vectors: [], model: LOCAL_MODEL, strategy: 'local' };
  if (features.remoteEmbeddings) {
    try {
      return await remoteEmbed(texts);
    } catch (err: any) {
      logger.warn(`Remote embeddings failed (${err?.message}); falling back to the local embedder for this request.`);
    }
  }
  return { vectors: texts.map(localEmbed), model: LOCAL_MODEL, strategy: 'local' };
}

export async function embedQuery(query: string): Promise<EmbeddingResult> {
  return embedTexts([query]);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Random-ish but stable string id helper (used in cache keys). */
export const hashKey = (s: string) => crypto.createHash('sha1').update(s).digest('hex');
