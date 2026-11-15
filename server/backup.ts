import { ZipArchive } from 'archiver';
import fs from 'node:fs';
import path from 'node:path';
import type { DB } from './db.js';

/** Bazanın ardıcıl surətini (online backup) və şəkilləri zip-ə yazır. */
export async function createBackupZip(db: DB, dataDir: string, outFile: string): Promise<string> {
  const tmpDb = path.join(dataDir, `.backup-${process.pid}-${Date.now()}.db`);
  await db.backup(tmpDb);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  try {
    await new Promise<void>((resolve, reject) => {
      const out = fs.createWriteStream(outFile);
      const zip = new ZipArchive({ zlib: { level: 6 } });
      out.on('close', () => resolve());
      zip.on('error', reject);
      out.on('error', reject);
      zip.pipe(out);
      zip.file(tmpDb, { name: 'yuxa.db' });
      const up = path.join(dataDir, 'uploads');
      if (fs.existsSync(up)) zip.directory(up, 'uploads');
      zip.append(JSON.stringify({ created: new Date().toISOString(), app: 'yuxa-menu' }, null, 2), { name: 'backup.json' });
      void zip.finalize();
    });
  } finally {
    fs.rmSync(tmpDb, { force: true });
  }
  return outFile;
}

const stamp = (d: Date) => d.toISOString().slice(0, 10);

/** Gündə bir dəfə (03:00-dan sonra) backups/ qovluğuna zip yazır, son `keep` faylı saxlayır. */
export async function nightlyBackup(db: DB, dataDir: string, keep = 14, now = new Date()): Promise<string | null> {
  const dir = path.join(dataDir, 'backups');
  const file = path.join(dir, `yuxa-${stamp(now)}.zip`);
  if (now.getHours() < 3 || fs.existsSync(file)) return null;
  await createBackupZip(db, dataDir, file);
  const all = fs.readdirSync(dir).filter((f) => /^yuxa-\d{4}-\d{2}-\d{2}\.zip$/.test(f)).sort();
  for (const old of all.slice(0, Math.max(0, all.length - keep))) fs.rmSync(path.join(dir, old), { force: true });
  return file;
}
