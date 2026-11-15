import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export type DB = Database.Database;

export interface L3 { az: string; en: string; ru: string }
export interface Option { id: string; name: L3; price: number }

export interface Item {
  id: number;
  category_id: number;
  name: L3;
  description: L3;
  ingredients: L3;
  price: number; // qəpik
  portion: string;
  prep_min: number | null;
  image: string | null;
  features: string[];
  allergens: string[];
  variants: Option[];
  addons: Option[];
  featured: boolean;
  visible: boolean;
  available: boolean;
  sort: number;
  updated_at: string;
}

export interface Category { id: number; name: L3; note: L3; sort: number; hidden: boolean }
export interface Feature { id: number; key: string; name: L3; icon: string; color: string; sort: number }
export interface TableRow { id: number; code: string; name: string; sort: number }

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL, note TEXT NOT NULL DEFAULT '{}',
  sort INTEGER NOT NULL DEFAULT 0, hidden INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS features (
  id INTEGER PRIMARY KEY, key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL, icon TEXT NOT NULL DEFAULT 'star', color TEXT NOT NULL DEFAULT '#a78bfa',
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '{}', ingredients TEXT NOT NULL DEFAULT '{}',
  price INTEGER NOT NULL, portion TEXT NOT NULL DEFAULT '', prep_min INTEGER,
  image TEXT, features TEXT NOT NULL DEFAULT '[]', allergens TEXT NOT NULL DEFAULT '[]',
  variants TEXT NOT NULL DEFAULT '[]', addons TEXT NOT NULL DEFAULT '[]',
  featured INTEGER NOT NULL DEFAULT 0, visible INTEGER NOT NULL DEFAULT 1, available INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS items_cat ON items(category_id, sort);
CREATE TABLE IF NOT EXISTS tables_ (
  id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, pass_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  csrf TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY, at TEXT NOT NULL DEFAULT (datetime('now')), admin TEXT NOT NULL,
  action TEXT NOT NULL, entity TEXT NOT NULL, entity_id TEXT, detail TEXT
);
`;

export function openDb(dataDir: string): DB {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new Database(path.join(dataDir, 'yuxa.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 3000');
  db.exec(SCHEMA);
  const v = db.prepare("SELECT value FROM meta WHERE key='version'").get() as { value: string } | undefined;
  if (!v) db.prepare("INSERT INTO meta(key,value) VALUES('version','1')").run();
  return db;
}

export const j = <T>(s: string | null | undefined, d: T): T => {
  if (!s) return d;
  try { return JSON.parse(s) as T; } catch { return d; }
};
const l3 = (s: string): L3 => ({ az: '', en: '', ru: '', ...j<Partial<L3>>(s, {}) });

export function bumpVersion(db: DB): number {
  db.prepare("UPDATE meta SET value = CAST(value AS INTEGER) + 1 WHERE key='version'").run();
  return menuVersion(db);
}
export function menuVersion(db: DB): number {
  return Number((db.prepare("SELECT value FROM meta WHERE key='version'").get() as { value: string }).value);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function rowToItem(r: any): Item {
  return {
    id: r.id, category_id: r.category_id,
    name: l3(r.name), description: l3(r.description), ingredients: l3(r.ingredients),
    price: r.price, portion: r.portion, prep_min: r.prep_min, image: r.image,
    features: j(r.features, []), allergens: j(r.allergens, []),
    variants: j(r.variants, []), addons: j(r.addons, []),
    featured: !!r.featured, visible: !!r.visible, available: !!r.available,
    sort: r.sort, updated_at: r.updated_at,
  };
}
export function rowToCategory(r: any): Category {
  return { id: r.id, name: l3(r.name), note: l3(r.note), sort: r.sort, hidden: !!r.hidden };
}
export function rowToFeature(r: any): Feature {
  return { id: r.id, key: r.key, name: l3(r.name), icon: r.icon, color: r.color, sort: r.sort };
}

export const listItems = (db: DB) =>
  (db.prepare('SELECT * FROM items ORDER BY sort, id').all() as any[]).map(rowToItem);
export const listCategories = (db: DB) =>
  (db.prepare('SELECT * FROM categories ORDER BY sort, id').all() as any[]).map(rowToCategory);
export const listFeatures = (db: DB) =>
  (db.prepare('SELECT * FROM features ORDER BY sort, id').all() as any[]).map(rowToFeature);
export const listTables = (db: DB) =>
  db.prepare('SELECT id, code, name, sort FROM tables_ ORDER BY sort, id').all() as TableRow[];

export function audit(db: DB, admin: string, action: string, entity: string, entityId: string | number | null, detail?: unknown) {
  db.prepare('INSERT INTO audit(admin, action, entity, entity_id, detail) VALUES (?,?,?,?,?)')
    .run(admin, action, entity, entityId == null ? null : String(entityId), detail === undefined ? null : JSON.stringify(detail).slice(0, 2000));
}
