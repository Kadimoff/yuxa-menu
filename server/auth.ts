import crypto from 'node:crypto';
import type { DB } from './db.js';

const N = 16384, R = 8, P = 1, KEYLEN = 32;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, KEYLEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, 'base64');
  let got: Buffer;
  try {
    got = crypto.scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length, {
      N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024,
    });
  } catch { return false; }
  return got.length === expected.length && crypto.timingSafeEqual(got, expected);
}

const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
export const SESSION_TTL_MS = 7 * 24 * 3600 * 1000;

export interface Session { admin_id: number; username: string; csrf: string }

export function createSession(db: DB, adminId: number): { token: string; csrf: string } {
  const token = crypto.randomBytes(32).toString('base64url');
  const csrf = crypto.randomBytes(24).toString('base64url');
  const now = Date.now();
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now);
  db.prepare('INSERT INTO sessions(id, admin_id, csrf, created_at, expires_at) VALUES (?,?,?,?,?)')
    .run(sha(token), adminId, csrf, now, now + SESSION_TTL_MS);
  return { token, csrf };
}

export function getSession(db: DB, token: string | undefined): Session | null {
  if (!token || token.length > 100) return null;
  const row = db.prepare(`SELECT s.admin_id, s.csrf, s.expires_at, a.username FROM sessions s
    JOIN admins a ON a.id = s.admin_id WHERE s.id = ?`).get(sha(token)) as
    { admin_id: number; csrf: string; expires_at: number; username: string } | undefined;
  if (!row || row.expires_at < Date.now()) return null;
  return { admin_id: row.admin_id, username: row.username, csrf: row.csrf };
}

export function destroySession(db: DB, token: string | undefined) {
  if (token) db.prepare('DELETE FROM sessions WHERE id = ?').run(sha(token));
}
export function destroyAllSessions(db: DB, adminId: number, exceptToken?: string) {
  db.prepare('DELETE FROM sessions WHERE admin_id = ? AND id != ?').run(adminId, exceptToken ? sha(exceptToken) : '');
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** Sadə yaddaşda limit: açar başına pəncərədə maksimum uğursuz cəhd. */
export class AttemptLimiter {
  private hits = new Map<string, number[]>();
  constructor(private max: number, private windowMs: number) {}
  blocked(key: string): number {
    const now = Date.now();
    const arr = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    this.hits.set(key, arr);
    if (arr.length >= this.max) return Math.ceil((arr[0] + this.windowMs - now) / 1000);
    return 0;
  }
  fail(key: string) { const a = this.hits.get(key) ?? []; a.push(Date.now()); this.hits.set(key, a); }
  reset(key: string) { this.hits.delete(key); }
}

export function upsertAdmin(db: DB, username: string, passHash: string) {
  db.prepare(`INSERT INTO admins(username, pass_hash) VALUES (?, ?)
    ON CONFLICT(username) DO UPDATE SET pass_hash = excluded.pass_hash`).run(username, passHash);
}
