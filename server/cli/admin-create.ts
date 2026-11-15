/**
 * İlk admini yaradır və ya parolunu yeniləyir.
 *   npm run admin:create -- <istifadəçi>     (parol stdin-dən oxunur)
 *   npm run admin:create -- --hash           (yalnız ADMIN_PASSWORD_HASH üçün hash çap edir)
 */
import path from 'node:path';
import { openDb } from '../db.js';
import { hashPassword, upsertAdmin } from '../auth.js';

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) process.stderr.write('Parol (ən azı 10 simvol), sonra Enter: ');
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) {
    chunks.push(c as Buffer);
    if (process.stdin.isTTY && String(c).includes('\n')) break;
  }
  return Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');
}

const args = process.argv.slice(2);
const pw = await readStdin();
if (pw.length < 10) { console.error('Parol ən azı 10 simvol olmalıdır'); process.exit(1); }
if (args.includes('--hash')) {
  console.log(hashPassword(pw));
} else {
  const user = (args[0] ?? 'admin').toLowerCase();
  const db = openDb(path.resolve(process.env.DATA_DIR ?? 'data'));
  upsertAdmin(db, user, hashPassword(pw));
  db.close();
  console.error(`Admin hazırdır: ${user}`);
}
