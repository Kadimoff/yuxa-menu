import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { buildApp } from '../server/app.js';
import { hashPassword, upsertAdmin } from '../server/auth.js';

export const PW = 'test-parol-12345';

export async function makeApp(extra: Record<string, unknown> = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yuxa-test-'));
  const app = await buildApp({ dataDir, seedImgDir: path.resolve('seed/img'), cookieSecure: true, ...extra });
  upsertAdmin(app.db, 'admin', hashPassword(PW));
  return { app, dataDir };
}

export async function login(app: Awaited<ReturnType<typeof makeApp>>['app']) {
  const r = await app.inject({ method: 'POST', url: '/api/admin/login', payload: { username: 'admin', password: PW } });
  if (r.statusCode !== 200) throw new Error(`login ${r.statusCode} ${r.body}`);
  const cookie = String(r.headers['set-cookie']).split(';')[0];
  const csrf = r.json().csrf as string;
  return { cookie, csrf, h: { cookie, 'x-csrf-token': csrf } };
}

export async function jpeg(w = 800, h = 600): Promise<Buffer> {
  return sharp({ create: { width: w, height: h, channels: 3, background: { r: 120, g: 60, b: 200 } } })
    .jpeg().withMetadata({ exif: { IFD0: { Copyright: 'secret-gps', Artist: 'tester' } } }).toBuffer();
}

export function multipart(name: string, filename: string, type: string, buf: Buffer) {
  const boundary = '----yuxa' + Math.random().toString(16).slice(2);
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`),
    buf, Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { body, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}
