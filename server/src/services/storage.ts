import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { env } from '../config/env';
import { features } from '../config/features';
import { ApiError } from '../utils/ApiError';
import { logger } from '../utils/logger';

export interface StoredObject {
  driver: 'local' | 's3';
  key: string;
  bucket?: string;
  etag?: string;
}

export interface StorageAdapter {
  readonly driver: 'local' | 's3';
  put(key: string, body: Buffer, contentType: string): Promise<StoredObject>;
  getStream(key: string): Promise<Readable>;
  getBuffer(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

/** Key layout: users/<userId>/<yyyy>/<mm>/<uuid>.<ext> — never user supplied. */
export function buildStorageKey(userId: string, ext: string) {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `users/${userId}/${yyyy}/${mm}/${crypto.randomUUID()}.${ext.replace(/[^a-z0-9]/gi, '').toLowerCase()}`;
}

class LocalStorage implements StorageAdapter {
  readonly driver = 'local' as const;
  constructor(private root: string) {
    fs.mkdirSync(this.root, { recursive: true });
  }
  private resolve(key: string) {
    const full = path.resolve(this.root, key);
    // Prevent path traversal outside the storage root.
    if (!full.startsWith(path.resolve(this.root) + path.sep)) {
      throw ApiError.forbidden('Invalid storage key.');
    }
    return full;
  }
  async put(key: string, body: Buffer): Promise<StoredObject> {
    const full = this.resolve(key);
    await fsp.mkdir(path.dirname(full), { recursive: true });
    await fsp.writeFile(full, body);
    return { driver: 'local', key };
  }
  async getStream(key: string) {
    const full = this.resolve(key);
    if (!fs.existsSync(full)) throw ApiError.notFound('The stored file is missing.');
    return fs.createReadStream(full);
  }
  async getBuffer(key: string) {
    const full = this.resolve(key);
    if (!fs.existsSync(full)) throw ApiError.notFound('The stored file is missing.');
    return fsp.readFile(full);
  }
  async remove(key: string) {
    await fsp.rm(this.resolve(key), { force: true });
  }
  async exists(key: string) {
    return fs.existsSync(this.resolve(key));
  }
}

class S3Storage implements StorageAdapter {
  readonly driver = 's3' as const;
  private client: any;
  private sdk: any;
  constructor(private bucket: string, private region: string) {}

  private async init() {
    if (this.client) return;
    const { S3Client } = await import('@aws-sdk/client-s3');
    this.sdk = await import('@aws-sdk/client-s3');
    this.client = new S3Client({
      region: this.region,
      ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT, forcePathStyle: env.S3_FORCE_PATH_STYLE } : {}),
      credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      },
    });
  }

  async put(key: string, body: Buffer, contentType: string): Promise<StoredObject> {
    await this.init();
    const res = await this.client.send(
      new this.sdk.PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ServerSideEncryption: 'AES256',
      }),
    );
    return { driver: 's3', key, bucket: this.bucket, etag: res.ETag };
  }

  async getStream(key: string) {
    await this.init();
    try {
      const res = await this.client.send(new this.sdk.GetObjectCommand({ Bucket: this.bucket, Key: key }));
      return res.Body as Readable;
    } catch (err: any) {
      logger.error('S3 get failed', err?.message);
      throw ApiError.notFound('The stored file is missing.');
    }
  }

  async getBuffer(key: string) {
    const stream = await this.getStream(key);
    const parts: Buffer[] = [];
    for await (const chunk of stream as AsyncIterable<Buffer>) parts.push(Buffer.from(chunk));
    return Buffer.concat(parts);
  }

  async remove(key: string) {
    await this.init();
    await this.client.send(new this.sdk.DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async exists(key: string) {
    await this.init();
    try {
      await this.client.send(new this.sdk.HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }
}

let adapter: StorageAdapter | null = null;

export function getStorage(): StorageAdapter {
  if (adapter) return adapter;
  if (features.s3) {
    adapter = new S3Storage(env.S3_BUCKET, env.AWS_REGION);
    logger.info(`Storage driver: S3 (${env.S3_BUCKET} @ ${env.AWS_REGION})`);
  } else {
    if (env.STORAGE_DRIVER === 's3') {
      logger.warn('STORAGE_DRIVER=s3 but S3 credentials are incomplete — falling back to local disk storage.');
    }
    adapter = new LocalStorage(env.LOCAL_STORAGE_DIR);
    logger.info(`Storage driver: local (${env.LOCAL_STORAGE_DIR})`);
  }
  return adapter;
}

export function storageStatus() {
  return {
    driver: getStorage().driver,
    configured: features.s3 || true,
    maxFileSizeMb: env.MAX_FILE_SIZE_MB,
    note: features.s3
      ? 'Files are stored in your Amazon S3 bucket with server-side encryption.'
      : 'Files are stored on the API server disk. Set STORAGE_DRIVER=s3 plus AWS credentials for cloud object storage.',
  };
}
