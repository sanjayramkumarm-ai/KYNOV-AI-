import crypto from 'node:crypto';
import { env } from '../config/env';

/**
 * AES-256-GCM envelope encryption for third-party tokens (Google refresh tokens).
 * Tokens are never returned to the client and never stored in plaintext.
 */
function key(): Buffer {
  const raw = env.TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    if (env.isProd) {
      throw new Error('[crypto] TOKEN_ENCRYPTION_KEY is required in production to protect OAuth tokens.');
    }
    // Dev-only deterministic key derived from the JWT secret so restarts keep tokens readable.
    return crypto.createHash('sha256').update(`dev-token-key:${env.JWT_REFRESH_SECRET}`).digest();
  }
  const buf = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (buf.length !== 32) throw new Error('[crypto] TOKEN_ENCRYPTION_KEY must be 32 bytes (hex or base64).');
  return buf;
}

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${enc.toString('base64url')}`;
}

export function decryptSecret(payload: string): string {
  const [version, ivB64, tagB64, dataB64] = payload.split('.');
  if (version !== 'v1' || !ivB64 || !tagB64 || !dataB64) throw new Error('Malformed encrypted token');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB64, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64url')), decipher.final()]).toString('utf8');
}

export const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex');
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
