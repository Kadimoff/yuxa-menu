import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyCookie from '@fastify/cookie';
import fastifyMultipart from '@fastify/multipart';
import fastifyCompress from '@fastify/compress';
import fs from 'node:fs';
import path from 'node:path';
import { openDb, type DB } from './db.js';
import { upsertAdmin } from './auth.js';
import { publicRoutes } from './routes/public.js';
import { adminRoutes } from './routes/admin.js';
import { MAX_UPLOAD_BYTES } from './images.js';
import { nightlyBackup } from './backup.js';
import { seedIfEmpty } from './seed.js';
import { registerWaiter } from './modules/waiter/index.js';

export interface AppOptions {
  dataDir: string;
  webDir?: string; // vite build çıxışı (dist)
  seedImgDir?: string;
  seed?: boolean;
  cookieSecure?: boolean;
  logger?: boolean;
  loginMax?: number;
  nightly?: boolean;
}

declare module 'fastify' {
  interface FastifyInstance { db: DB; opts: Required<Pick<AppOptions, 'dataDir'>> & AppOptions }
}

export async function buildApp(o: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: o.logger ?? false, trustProxy: true, bodyLimit: 1024 * 1024 });
  const db = openDb(o.dataDir);
  app.decorate('db', db);
  app.decorate('opts', o);
  app.addHook('onClose', async () => db.close());

  if (process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD_HASH?.startsWith('scrypt$')) {
    upsertAdmin(db, process.env.ADMIN_USERNAME, process.env.ADMIN_PASSWORD_HASH);
  }
  if (o.seed !== false) await seedIfEmpty(db, o.dataDir, o.seedImgDir ?? path.resolve('seed/img'));

  await app.register(fastifyCompress, { global: true, threshold: 1024, encodings: ['br', 'gzip'], brotliOptions: { params: { 1: 5 } } as never });
  await app.register(fastifyCookie);
  await app.register(fastifyMultipart, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 5 } });

  app.addHook('onSend', async (req, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'same-origin');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    const ct = String(reply.getHeader('content-type') ?? '');
    if (ct.startsWith('text/html')) {
      reply.header('Content-Security-Policy',
        "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    }
    return payload;
  });

  app.setNotFoundHandler((req, reply) => {
    reply.code(404).send({ error: 'not_found' });
  });
  app.setErrorHandler((err: Error & { statusCode?: number; code?: string }, req, reply) => {
    const code = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
    if (code >= 500) req.log.error(err);
    reply.code(code).send({ error: code === 413 ? 'too_large' : code >= 500 ? 'server_error' : (err.code ?? 'bad_request') });
  });

  const uploads = path.join(o.dataDir, 'uploads');
  fs.mkdirSync(uploads, { recursive: true });
  await app.register(fastifyStatic, {
    root: uploads, prefix: '/media/', decorateReply: false, index: false, dotfiles: 'deny',
    immutable: true, maxAge: '365d', cacheControl: true,
  });

  await app.register(publicRoutes);
  await app.register(adminRoutes, { prefix: '/api/admin' });
  await app.register(registerWaiter); // hələlik heç nə qeydiyyata salmır

  const web = o.webDir;
  if (web && fs.existsSync(web)) {
    await app.register(fastifyStatic, {
      root: web, prefix: '/', index: false, wildcard: true, dotfiles: 'deny',
      setHeaders(res, file) {
        if (file.includes(`${path.sep}assets${path.sep}`) || file.includes(`${path.sep}fonts${path.sep}`)) {
          res.header('Cache-Control', 'public, max-age=31536000, immutable');
        } else res.header('Cache-Control', 'no-cache');
      },
    });
    const sendHtml = (file: string) => (_req: FastifyRequest, reply: FastifyReply) =>
      reply.header('Cache-Control', 'no-cache').type('text/html; charset=utf-8').send(fs.readFileSync(path.join(web, file)));
    app.get('/', sendHtml('index.html'));
    app.get('/m/:table', sendHtml('index.html'));
    app.get('/admin', sendHtml('admin/index.html'));
    app.get('/admin/', sendHtml('admin/index.html'));
  }

  app.get('/healthz', async () => ({ ok: true }));

  if (o.nightly) {
    const tick = () => nightlyBackup(db, o.dataDir).then((f) => f && app.log.info({ f }, 'nightly backup')).catch((e) => app.log.error(e));
    const t = setInterval(tick, 30 * 60 * 1000); t.unref();
    setTimeout(tick, 10_000).unref();
  }
  return app;
}
