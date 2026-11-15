import path from 'node:path';
import { openDb } from '../db.js';
import { createBackupZip } from '../backup.js';

const dataDir = path.resolve(process.env.DATA_DIR ?? 'data');
const db = openDb(dataDir);
const out = path.join(dataDir, 'backups', `yuxa-manual-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`);
await createBackupZip(db, dataDir, out);
db.close();
console.log(out);
