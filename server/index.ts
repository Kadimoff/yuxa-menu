import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, here.includes(`${path.sep}dist-server${path.sep}`) ? '../..' : '..');
const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? '127.0.0.1';

const app = await buildApp({
  dataDir: path.resolve(process.env.DATA_DIR ?? path.join(root, 'data')),
  webDir: path.join(root, 'dist'),
  seedImgDir: path.join(root, 'seed/img'),
  cookieSecure: process.env.COOKIE_SECURE !== '0',
  logger: true,
  nightly: process.env.NIGHTLY_BACKUP !== '0',
});

const stop = async () => { await app.close(); process.exit(0); };
process.on('SIGTERM', stop);
process.on('SIGINT', stop);

await app.listen({ port, host });
