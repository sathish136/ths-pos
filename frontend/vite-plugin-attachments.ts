/**
 * Attachment storage for the POS dev/preview server.
 *  - local (default): files on the POS server disk under <dataDir>/.demo-session-data/attachments
 *  - s3: any S3-compatible bucket (AWS S3, MinIO, Cloudflare R2, Wasabi, Backblaze B2 S3 API, …)
 *    configured with environment variables, never stored in the shared session:
 *      POS_STORAGE=s3
 *      POS_S3_ENDPOINT=https://s3.ap-south-1.amazonaws.com   (or your provider's S3 endpoint)
 *      POS_S3_REGION=ap-south-1
 *      POS_S3_BUCKET=my-restaurant-docs
 *      POS_S3_ACCESS_KEY_ID=...
 *      POS_S3_SECRET_ACCESS_KEY=...
 *      POS_S3_PREFIX=ury-pos/attachments/          (optional)
 *  Requests are signed with AWS Signature V4 (path-style addressing).
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash, createHmac } from 'node:crypto';

export type StoredFile = { name: string; size: number; modified: number };

export type AttachmentStore = {
  provider: 'local' | 's3';
  list(): Promise<StoredFile[]>;
  put(name: string, body: Buffer): Promise<void>;
  get(name: string): Promise<Buffer | null>;
};

export type S3Config = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  prefix: string;
};

const sha256Hex = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');
const hmac = (key: Buffer | string, data: string) => createHmac('sha256', key).update(data, 'utf8').digest();

/** RFC 3986 encoding as required by SigV4 (encodes !'()* too). */
export function encodeRfc3986(s: string): string {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** Canonical query string: keys and values encoded, sorted by key then value. */
export function canonicalQuery(params: [string, string][]): string {
  return params
    .map(([k, v]) => [encodeRfc3986(k), encodeRfc3986(v)] as const)
    .sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0) : a[0] < b[0] ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
}

/** Pure SigV4 signer for S3 (exported so it can be checked against AWS's published test vectors). */
export function signV4(input: {
  method: string;
  host: string;
  /** Canonical (already encoded) URI path, e.g. /bucket/key.txt */
  canonicalUri: string;
  query?: [string, string][];
  headers?: Record<string, string>;
  body?: Buffer;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  amzDate: string; // YYYYMMDDTHHMMSSZ
  /** Pre-computed body hash; defaults to SHA-256 of body */
  payloadHash?: string;
}): { query: string; headers: Record<string, string>; authorization: string } {
  const dateStamp = input.amzDate.slice(0, 8);
  const payloadHash = input.payloadHash ?? sha256Hex(input.body ?? Buffer.alloc(0));
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries({ ...(input.headers ?? {}), 'x-amz-content-sha256': payloadHash, 'x-amz-date': input.amzDate })) {
    headers[k.toLowerCase()] = String(v).trim();
  }
  headers.host = input.host;
  const signedKeys = Object.keys(headers).sort();
  const canonicalHeaders = signedKeys.map((k) => `${k}:${headers[k]}\n`).join('');
  const signedHeaders = signedKeys.join(';');
  const query = canonicalQuery(input.query ?? []);
  const canonicalRequest = [input.method, input.canonicalUri, query, canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = `${dateStamp}/${input.region}/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', input.amzDate, scope, sha256Hex(canonicalRequest)].join('\n');
  const kDate = hmac(`AWS4${input.secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, input.region);
  const kService = hmac(kRegion, 's3');
  const kSigning = hmac(kService, 'aws4_request');
  const signature = createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');
  const authorization = `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return { query, headers: { ...headers, authorization }, authorization };
}

function s3Config(): S3Config | null {
  const env = process.env;
  if (env.POS_STORAGE !== 's3') return null;
  const endpoint = env.POS_S3_ENDPOINT ?? '';
  const bucket = env.POS_S3_BUCKET ?? '';
  const accessKeyId = env.POS_S3_ACCESS_KEY_ID ?? '';
  const secretAccessKey = env.POS_S3_SECRET_ACCESS_KEY ?? '';
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;
  return {
    endpoint: endpoint.replace(/\/+$/, ''),
    region: env.POS_S3_REGION || 'us-east-1',
    bucket,
    accessKeyId,
    secretAccessKey,
    prefix: env.POS_S3_PREFIX ?? 'ury-pos/attachments/',
  };
}

async function s3Request(
  cfg: S3Config,
  method: string,
  key: string | null,
  query: [string, string][],
  body?: Buffer,
): Promise<{ status: number; body: Buffer }> {
  const url = new URL(cfg.endpoint);
  const segments = [cfg.bucket, ...(key ? key.split('/') : [])].map(encodeRfc3986);
  const canonicalUri = `/${segments.join('/')}`;
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const signed = signV4({
    method,
    host: url.host,
    canonicalUri,
    query,
    body,
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    region: cfg.region,
    amzDate,
    headers: body ? { 'content-type': 'application/octet-stream' } : {},
  });
  const headers: Record<string, string> = { ...signed.headers };
  delete headers.host; // fetch sets Host itself
  const res = await fetch(`${url.origin}${canonicalUri}${signed.query ? `?${signed.query}` : ''}`, {
    method,
    headers,
    body: body ? new Uint8Array(body) : undefined,
  });
  return { status: res.status, body: Buffer.from(await res.arrayBuffer()) };
}

function s3Store(cfg: S3Config): AttachmentStore {
  const keyFor = (name: string) => `${cfg.prefix}${name}`;
  return {
    provider: 's3',
    async list() {
      const res = await s3Request(cfg, 'GET', null, [
        ['list-type', '2'],
        ['prefix', cfg.prefix],
      ]);
      if (res.status !== 200) throw new Error(`S3 list failed (${res.status})`);
      const xml = res.body.toString('utf8');
      const files: StoredFile[] = [];
      for (const block of xml.split('<Contents>').slice(1)) {
        const key = /<Key>([^<]+)<\/Key>/.exec(block)?.[1] ?? '';
        const size = Number(/<Size>(\d+)<\/Size>/.exec(block)?.[1] ?? 0);
        const modified = Date.parse(/<LastModified>([^<]+)<\/LastModified>/.exec(block)?.[1] ?? '') || 0;
        const name = key.startsWith(cfg.prefix) ? key.slice(cfg.prefix.length) : key;
        if (name) files.push({ name, size, modified });
      }
      return files;
    },
    async put(name, body) {
      const res = await s3Request(cfg, 'PUT', keyFor(name), [], body);
      if (res.status >= 300) throw new Error(`S3 upload failed (${res.status})`);
    },
    async get(name) {
      const res = await s3Request(cfg, 'GET', keyFor(name), []);
      if (res.status === 404) return null;
      if (res.status !== 200) throw new Error(`S3 download failed (${res.status})`);
      return res.body;
    },
  };
}

function localStore(dir: string): AttachmentStore {
  return {
    provider: 'local',
    async list() {
      fs.mkdirSync(dir, { recursive: true });
      return fs.readdirSync(dir).map((name) => {
        const st = fs.statSync(path.join(dir, name));
        return { name, size: st.size, modified: st.mtimeMs };
      });
    },
    async put(name, body) {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, name), body);
    },
    async get(name) {
      const full = path.join(dir, name);
      return fs.existsSync(full) ? fs.readFileSync(full) : null;
    },
  };
}

export type StorageConfigFile = {
  provider: 'local' | 's3';
  endpoint?: string;
  region?: string;
  bucket?: string;
  prefix?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
};

export function storageConfigPath(dataDir: string): string {
  return path.join(dataDir, '.demo-session-data', 'storage.json');
}

export function readStorageConfig(dataDir: string): StorageConfigFile {
  const file = storageConfigPath(dataDir);
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8')) as StorageConfigFile;
    }
  } catch {
    /* ignore */
  }
  const envCfg = s3Config();
  if (envCfg) {
    return {
      provider: 's3',
      endpoint: envCfg.endpoint,
      region: envCfg.region,
      bucket: envCfg.bucket,
      prefix: envCfg.prefix,
      accessKeyId: envCfg.accessKeyId,
      secretAccessKey: envCfg.secretAccessKey,
    };
  }
  return { provider: 'local' };
}

export function writeStorageConfig(dataDir: string, next: StorageConfigFile): StorageConfigFile {
  const file = storageConfigPath(dataDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const prev = readStorageConfig(dataDir);
  const merged: StorageConfigFile = {
    ...prev,
    ...next,
    accessKeyId: next.accessKeyId || prev.accessKeyId,
    secretAccessKey: next.secretAccessKey || prev.secretAccessKey,
  };
  if (merged.provider !== 's3') {
    merged.provider = 'local';
  }
  fs.writeFileSync(file, JSON.stringify(merged, null, 2));
  return merged;
}

export function publicStorageStatus(cfg: StorageConfigFile) {
  return {
    provider: cfg.provider,
    endpoint: cfg.endpoint ?? '',
    region: cfg.region ?? '',
    bucket: cfg.bucket ?? '',
    prefix: cfg.prefix ?? 'ury-pos/attachments/',
    configured: cfg.provider === 'local' || Boolean(cfg.accessKeyId && cfg.secretAccessKey && cfg.bucket && cfg.endpoint),
  };
}

function storeFromConfig(dataDir: string, cfg: StorageConfigFile): AttachmentStore {
  if (
    cfg.provider === 's3' &&
    cfg.endpoint &&
    cfg.bucket &&
    cfg.accessKeyId &&
    cfg.secretAccessKey
  ) {
    return s3Store({
      endpoint: cfg.endpoint.replace(/\/+$/, ''),
      region: cfg.region || 'us-east-1',
      bucket: cfg.bucket,
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
      prefix: cfg.prefix ?? 'ury-pos/attachments/',
    });
  }
  return localStore(path.join(dataDir, '.demo-session-data', 'attachments'));
}

/** Store selected by Admin storage settings file, then environment, else local disk. */
export function createAttachmentStore(dataDir: string): AttachmentStore {
  return storeFromConfig(dataDir, readStorageConfig(dataDir));
}

export function recreateAttachmentStore(dataDir: string): AttachmentStore {
  return createAttachmentStore(dataDir);
}
