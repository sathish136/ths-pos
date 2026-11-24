/**
 * Shared demo session across Captain / Cashier / Kitchen devices.
 * Also issues unique ticket numbers so tablets cannot mint the same #046.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Connect, Plugin, PreviewServer, ViteDevServer } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { mergeSessionBlobs, type MergeBlob } from './src/lib/session-merge';
import { mergeExtras, readonlySales } from './src/lib/extras';
import {
  createAttachmentStore,
  publicStorageStatus,
  readStorageConfig,
  writeStorageConfig,
  type AttachmentStore,
} from './vite-plugin-attachments';

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const READONLY_ROUTE = '/api/readonly/sales';
const ATTACH_ROUTE = '/api/attachments';

const SESSION_ROUTE = '/api/demo-session';
const SEQ_ROUTE = '/api/demo-ticket-seq';

function pathOnly(url: string | undefined): string {
  return (url || '').split('?')[0] ?? '';
}

function matches(url: string | undefined, route: string): boolean {
  const p = pathOnly(url);
  return p === route || p.endsWith(route);
}

function maxTicketInBlob(blob: MergeBlob): number {
  let max = Number(blob.ticketSeq ?? 0) || 0;
  const consider = (n: unknown) => {
    const v = Number.parseInt(String(n ?? ''), 10);
    if (!Number.isNaN(v)) max = Math.max(max, v);
  };
  consider(blob.ticketSeq);
  const book = blob.ticketBook;
  if (book && typeof book === 'object') {
    for (const t of Object.values(book as Record<string, { number?: string }>)) consider(t?.number);
  }
  if (Array.isArray(blob.dayOrders)) {
    for (const t of blob.dayOrders as Array<{ number?: string }>) consider(t?.number);
  }
  const kb = blob.kitchenBoard;
  if (kb && typeof kb === 'object') {
    for (const t of Object.values(kb as Record<string, { number?: string }>)) consider(t?.number);
  }
  return max;
}

export function demoSyncPlugin(dataDir: string): Plugin {
  const filePath = path.join(dataDir, '.demo-session.json');
  let blob: MergeBlob = {};

  try {
    if (fs.existsSync(filePath)) {
      blob = JSON.parse(fs.readFileSync(filePath, 'utf8')) as MergeBlob;
    }
  } catch {
    blob = {};
  }

  function persist(next: MergeBlob) {
    blob = next;
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(next));
    } catch {
      /* ignore disk errors — memory still serves peers */
    }
  }

  let store: AttachmentStore = createAttachmentStore(dataDir);

  function safeName(raw: string): string {
    const base = path.basename(raw).replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^\.+/, '');
    return base.slice(0, 120) || 'file';
  }

  function sendJson(res: ServerResponse, status: number, body: unknown) {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
  }

  /** Read-only sales API, attachment store. Returns true when the request was handled. */
  function handleExtraRoutes(req: IncomingMessage, res: ServerResponse): boolean {
    const p = pathOnly(req.url);

    if (p === READONLY_ROUTE || p.endsWith(READONLY_ROUTE)) {
      res.setHeader('Cache-Control', 'no-store');
      if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        sendJson(res, 405, { error: 'read-only API: GET only' });
        return true;
      }
      const token = mergeExtras(blob.extras).apiToken;
      if (!token || String(req.headers.authorization ?? '') !== `Bearer ${token}`) {
        sendJson(res, 401, { error: 'missing or invalid Bearer token' });
        return true;
      }
      const sales = Array.isArray(blob.sales) ? (blob.sales as Array<Record<string, unknown>>) : [];
      sendJson(res, 200, { count: sales.length, sales: readonlySales(sales) });
      return true;
    }

    return false;
  }

  function isAttachmentRoute(url: string | undefined): boolean {
    const p = pathOnly(url);
    const i = p.indexOf(ATTACH_ROUTE);
    if (i === -1) return false;
    const rest = p.slice(i + ATTACH_ROUTE.length);
    return rest === '' || rest.startsWith('/');
  }

  function readBody(req: IncomingMessage, limit: number): Promise<Buffer | null> {
    return new Promise((resolve) => {
      const chunks: Buffer[] = [];
      let size = 0;
      req.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > limit) {
          resolve(null);
          req.resume();
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', () => resolve(null));
    });
  }

  /** Attachments: list, upload (?name=), download (/<name>), storage provider (/storage). */
  async function handleAttachments(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const p = pathOnly(req.url);
    const rest = p.slice(p.indexOf(ATTACH_ROUTE) + ATTACH_ROUTE.length);
    res.setHeader('Cache-Control', 'no-store');

    if (rest === '/storage' && req.method === 'GET') {
      sendJson(res, 200, { ...publicStorageStatus(readStorageConfig(dataDir)), provider: store.provider });
      return;
    }
    if (rest === '/storage' && req.method === 'PUT') {
      const body = await readBody(req, 64 * 1024);
      if (!body) {
        sendJson(res, 413, { error: 'body too large' });
        return;
      }
      try {
        const parsed = JSON.parse(body.toString('utf8') || '{}') as {
          provider?: 'local' | 's3';
          endpoint?: string;
          region?: string;
          bucket?: string;
          prefix?: string;
          accessKeyId?: string;
          secretAccessKey?: string;
        };
        if (parsed.provider === 's3') {
          const merged = writeStorageConfig(dataDir, {
            provider: 's3',
            endpoint: parsed.endpoint,
            region: parsed.region,
            bucket: parsed.bucket,
            prefix: parsed.prefix,
            accessKeyId: parsed.accessKeyId,
            secretAccessKey: parsed.secretAccessKey,
          });
          const status = publicStorageStatus(merged);
          if (!status.configured) {
            sendJson(res, 400, { error: 'S3 needs endpoint, bucket, access key and secret', ...status });
            return;
          }
          store = createAttachmentStore(dataDir);
          sendJson(res, 200, { ...status, provider: store.provider });
          return;
        }
        const merged = writeStorageConfig(dataDir, { provider: 'local' });
        store = createAttachmentStore(dataDir);
        sendJson(res, 200, { ...publicStorageStatus(merged), provider: store.provider });
      } catch (err) {
        sendJson(res, 400, { error: err instanceof Error ? err.message : 'bad storage config' });
      }
      return;
    }
    if (rest === '' && req.method === 'GET') {
      sendJson(res, 200, await store.list());
      return;
    }
    if (rest === '' && req.method === 'POST') {
      const name = safeName(new URL(req.url ?? '', 'http://localhost').searchParams.get('name') ?? '');
      const body = await readBody(req, MAX_ATTACHMENT_BYTES);
      if (!body) {
        sendJson(res, 413, { error: 'file larger than 25 MB' });
        return;
      }
      try {
        await store.put(name, body);
        sendJson(res, 200, { name, size: body.length });
      } catch (err) {
        sendJson(res, 502, { error: err instanceof Error ? err.message : 'could not save file' });
      }
      return;
    }
    if (rest.startsWith('/') && req.method === 'GET') {
      const name = safeName(decodeURIComponent(rest.slice(1)));
      const body = await store.get(name);
      if (!body) {
        sendJson(res, 404, { error: 'not found' });
        return;
      }
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
      res.end(body);
      return;
    }
    sendJson(res, 405, { error: 'method not allowed' });
  }

  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    if (isAttachmentRoute(req.url)) {
      handleAttachments(req, res).catch((err: unknown) =>
        sendJson(res, 500, { error: err instanceof Error ? err.message : 'attachment error' }),
      );
      return;
    }
    if (handleExtraRoutes(req, res)) return;
    const isSession = matches(req.url, SESSION_ROUTE);
    const isSeq = matches(req.url, SEQ_ROUTE);
    if (!isSession && !isSeq) {
      next();
      return;
    }

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    if (isSeq) {
      if (req.method === 'GET' || req.method === 'POST') {
        const chunks: Buffer[] = [];
        const finish = (floor = 0) => {
          const next = Math.max(maxTicketInBlob(blob), floor) + 1;
          persist({
            ...blob,
            ticketSeq: next,
            rev: Math.max(Number(blob.rev ?? 0) + 1, Date.now()),
          });
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ number: next, ticketSeq: next }));
        };
        if (req.method === 'GET') {
          finish(0);
          return;
        }
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => {
          try {
            const raw = Buffer.concat(chunks).toString('utf8');
            const parsed = raw ? (JSON.parse(raw) as { floor?: number }) : {};
            finish(Number(parsed.floor ?? 0) || 0);
          } catch {
            finish(0);
          }
        });
        return;
      }
      next();
      return;
    }

    if (req.method === 'GET') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(blob ?? {}));
      return;
    }

    if (req.method === 'PUT' || req.method === 'POST') {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });
      req.on('end', () => {
        try {
          const raw = Buffer.concat(chunks).toString('utf8');
          const parsed = JSON.parse(raw || '{}') as MergeBlob;
          const merged = mergeSessionBlobs(blob, parsed);
          // Never let ticketSeq go backwards.
          merged.ticketSeq = Math.max(
            maxTicketInBlob(blob),
            maxTicketInBlob(merged),
            Number(parsed.ticketSeq ?? 0) || 0,
          );
          persist(merged);
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(blob ?? {}));
        } catch {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'bad json' }));
        }
      });
      return;
    }

    next();
  };

  function attach(server: ViteDevServer | PreviewServer) {
    server.middlewares.use(middleware);
  }

  return {
    name: 'ury-demo-sync',
    configureServer: attach,
    configurePreviewServer: attach,
  };
}
