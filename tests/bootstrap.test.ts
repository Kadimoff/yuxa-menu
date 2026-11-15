import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../server/app.js';
import { hashPassword, verifyPassword } from '../server/auth.js';

const keys = ['ADMIN_USERNAME', 'ADMIN_PASSWORD_HASH', 'ADMIN_PASSWORD_HASH_B64'] as const;
afterEach(() => { for (const k of keys) delete process.env[k]; });

async function boot(dataDir: string) {
  const app = await buildApp({ dataDir, seed: false, cookieSecure: true });
  const row = app.db.prepare('SELECT pass_hash FROM admins WHERE username = ?').get('boss') as { pass_hash: string } | undefined;
  await app.close();
  return row?.pass_hash;
}

describe('admin bootstrap from env', () => {
  it('creates the admin from a base64 hash (compose-safe) and never overwrites it later', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yuxa-boot-'));
    process.env.ADMIN_USERNAME = 'boss';
    process.env.ADMIN_PASSWORD_HASH_B64 = Buffer.from(hashPassword('first-password-1')).toString('base64');
    const h1 = await boot(dataDir);
    expect(h1 && verifyPassword('first-password-1', h1)).toBe(true);

    // a different env hash on the next start must not replace the existing admin's password
    process.env.ADMIN_PASSWORD_HASH_B64 = Buffer.from(hashPassword('second-password-2')).toString('base64');
    const h2 = await boot(dataDir);
    expect(h2).toBe(h1);
  });

  it('accepts a plain ADMIN_PASSWORD_HASH and ignores garbage', async () => {
    const d1 = fs.mkdtempSync(path.join(os.tmpdir(), 'yuxa-boot-'));
    process.env.ADMIN_USERNAME = 'boss';
    process.env.ADMIN_PASSWORD_HASH = hashPassword('plain-password-3');
    const h = await boot(d1);
    expect(h && verifyPassword('plain-password-3', h)).toBe(true);

    const d2 = fs.mkdtempSync(path.join(os.tmpdir(), 'yuxa-boot-'));
    delete process.env.ADMIN_PASSWORD_HASH;
    process.env.ADMIN_PASSWORD_HASH_B64 = Buffer.from('not-a-hash').toString('base64');
    expect(await boot(d2)).toBeUndefined();
  });
});
