import { env } from '../config/env';
import { features } from '../config/features';
import { ApiError } from '../utils/ApiError';
import { logger } from '../utils/logger';

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
  timeoutMs?: number;
  model?: string;
}

export interface ChatResult {
  content: string;
  model: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

export const AI_SETUP_MESSAGE =
  'AI is not configured. Add AI_API_KEY (and optionally AI_BASE_URL, AI_CHAT_MODEL) to server/.env, then restart the API. ' +
  'Retrieval, file search and email search keep working without it.';

function assertConfigured() {
  if (!features.ai) throw ApiError.notConfigured(AI_SETUP_MESSAGE, { envVar: 'AI_API_KEY' });
}

/** OpenAI-compatible chat completion (OpenAI, Azure, Groq, OpenRouter, Ollama…). */
export async function chatComplete(messages: LlmMessage[], opts: ChatOptions = {}): Promise<ChatResult> {
  assertConfigured();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 60_000);
  const model = opts.model ?? env.AI_CHAT_MODEL;
  try {
    const res = await fetch(`${env.AI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.AI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: opts.temperature ?? 0.3,
        max_tokens: opts.maxTokens ?? 1200,
        ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      logger.error(`LLM request failed ${res.status}: ${detail.slice(0, 400)}`);
      throw ApiError.integration(
        `The AI provider rejected the request (HTTP ${res.status}). Check AI_API_KEY, AI_BASE_URL and AI_CHAT_MODEL.`,
        { status: res.status },
      );
    }

    const json = (await res.json()) as any;
    const content = json?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      throw ApiError.integration('The AI provider returned an empty response. Please retry.');
    }
    return { content: content.trim(), model: json.model ?? model, usage: json.usage };
  } catch (err: any) {
    if (err instanceof ApiError) throw err;
    if (err?.name === 'AbortError') throw ApiError.integration('The AI provider timed out. Please try again.');
    throw ApiError.integration(`Could not reach the AI provider: ${err?.message ?? 'network error'}`);
  } finally {
    clearTimeout(timer);
  }
}

/** JSON-mode helper with a safe parse + single repair attempt. */
export async function chatJson<T>(messages: LlmMessage[], opts: ChatOptions = {}): Promise<T> {
  const first = await chatComplete(messages, { ...opts, json: true, temperature: opts.temperature ?? 0.1 });
  try {
    return JSON.parse(stripFences(first.content)) as T;
  } catch {
    const repaired = await chatComplete(
      [...messages, { role: 'assistant', content: first.content }, { role: 'user', content: 'Return ONLY valid JSON. No prose, no markdown fences.' }],
      { ...opts, json: true, temperature: 0 },
    );
    return JSON.parse(stripFences(repaired.content)) as T;
  }
}

export function stripFences(text: string): string {
  return text
    .replace(/^\s*```(?:json)?/i, '')
    .replace(/```\s*$/i, '')
    .trim();
}

export function isAiConfigured() {
  return features.ai;
}
