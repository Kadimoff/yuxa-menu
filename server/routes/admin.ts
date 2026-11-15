import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import QRCode from 'qrcode';
import {
  audit, bumpVersion, listCategories, listFeatures, listItems, listTables,
  rowToItem, type DB, type L3, type Option,
} from '../db.js';
import {
  AttemptLimiter, createSession, destroyAllSessions, destroySession, getSession,
  hashPassword, safeEqual, verifyPassword, type Session,
} from '../auth.js';
import { getSettings, saveSettings } from '../settings.js';
import { ImageError, processImage, removeImage } from '../images.js';
import { createBackupZip } from '../backup.js';
import { ALLERGENS, ICONS } from '../../web/src/shared/catalog.js';

export const COOKIE = 'yx_sid';

declare module 'fastify' {
  interface FastifyRequest { admin?: Session; sid?: string }
}

class Bad extends Error { statusCode = 400; constructor(public code: string) { super(code); } }

const s = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const l3 = (v: unknown, max = 500): L3 => {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  return { az: s(o.az, max), en: s(o.en, max), ru: s(o.ru, max) };
};
const money = (v: unknown): number => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 10_000_000) throw new Bad('bad_price');
  return Math.round(v);
};
const imageId = (v: unknown): string | null => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v !== 'string' || !/^[a-z0-9]{6,40}$/.test(v)) throw new Bad('bad_image');
  return v;
};
const options = (v: unknown): Option[] => {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 20).map((o, i) => {
    const r = (o ?? {}) as Record<string, unknown>;
    const name = l3(r.name, 60);
    if (!name.az) throw new Bad('option_name');
    const id = s(r.id, 30).replace(/[^a-z0-9_-]/gi, '') || `o${i + 1}`;
    return { id, name, price: money(r.price) };
  });
};

function itemFromBody(db: DB, b: Record<string, unknown>) {
  const name = l3(b.name, 80);
  if (!name.az) throw new Bad('name_required');
  const catId = Number(b.category_id);
  if (!db.prepare('SELECT 1 FROM categories WHERE id=?').get(catId)) throw new Bad('bad_category');
  const featKeys = new Set(listFeatures(db).map((f) => f.key));
  const features = (Array.isArray(b.features) ? b.features : []).filter((k): k is string => typeof k === 'string' && featKeys.has(k));
  const allergens = (Array.isArray(b.allergens) ? b.allergens : []).filter((k): k is string => typeof k === 'string' && k in ALLERGENS);
  const prep = b.prep_min === null || b.prep_min === undefined || b.prep_min === '' ? null : Number(b.prep_min);
  if (prep !== null && (!Number.isInteger(prep) || prep < 0 || prep > 600)) throw new Bad('bad_prep');
  const variants = options(b.variants);
  return {
    category_id: catId, name, description: l3(b.description), ingredients: l3(b.ingredients),
    price: variants.length ? variants[0].price : money(b.price), portion: s(b.portion, 30), prep_min: prep,
    image: imageId(b.image), features: [...new Set(features)], allergens: [...new Set(allergens)],
    variants, addons: options(b.addons),
    featured: !!b.featured, visible: b.visible !== false, available: b.available !== false,
  };
}

export async function adminRoutes(app: FastifyInstance) {
  const db = app.db;
  const limiter = new AttemptLimiter(app.opts.loginMax ?? 5, 15 * 60 * 1000);
  const ipLimiter = new AttemptLimiter((app.opts.loginMax ?? 5) * 4, 15 * 60 * 1000);
  const uploads = path.join(app.opts.dataDir, 'uploads');
  const secure = app.opts.cookieSecure ?? true;

  const cookieOpts = { path: '/', httpOnly: true, sameSite: 'strict' as const, secure, maxAge: 7 * 24 * 3600 };

  // --- auth hook: /login xaricində hamısı sessiya, dəyişdirən sorğular CSRF tələb edir
  app.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
    const route = req.routeOptions.url ?? '';
    if (route.endsWith('/login')) return;
    const sid = req.cookies[COOKIE];
    const sess = getSession(db, sid);
    // /me sessiyasız da 200 qaytarır ki, giriş ekranı brauzer konsolunda 401 xətası yaratmasın
    if (!sess && route.endsWith('/me') && req.method === 'GET') return reply.send({ auth: false });
    if (!sess) return reply.code(401).send({ error: 'unauthorized' });
    req.admin = sess; req.sid = sid;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const tok = String(req.headers['x-csrf-token'] ?? '');
      if (!tok || !safeEqual(tok, sess.csrf)) return reply.code(403).send({ error: 'csrf' });
      const origin = req.headers.origin;
      if (origin && new URL(origin).host !== req.headers.host) return reply.code(403).send({ error: 'origin' });
    }
  });

  const log = (req: FastifyRequest, action: string, entity: string, id: number | string | null, detail?: unknown) => {
    audit(db, req.admin?.username ?? '?', action, entity, id, detail);
    bumpVersion(db);
  };

  app.post('/login', async (req, reply) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const username = s(b.username, 60).toLowerCase();
    const password = typeof b.password === 'string' ? b.password.slice(0, 200) : '';
    const key = `${req.ip}|${username}`;
    const wait = Math.max(limiter.blocked(key), ipLimiter.blocked(req.ip));
    if (wait) return reply.code(429).header('Retry-After', String(wait)).send({ error: 'rate_limited', retry_after: wait });
    const row = db.prepare('SELECT id, pass_hash FROM admins WHERE username = ?').get(username) as { id: number; pass_hash: string } | undefined;
    // eyni vaxt sərf etmək üçün mövcud olmayan istifadəçidə də hash yoxlanır
    const ok = verifyPassword(password, row?.pass_hash ?? 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=') && !!row;
    if (!ok || !row) {
      limiter.fail(key); ipLimiter.fail(req.ip);
      return reply.code(401).send({ error: 'bad_credentials' });
    }
    limiter.reset(key);
    const { token, csrf } = createSession(db, row.id);
    audit(db, username, 'login', 'admin', row.id);
    reply.setCookie(COOKIE, token, cookieOpts);
    return { ok: true, username, csrf };
  });

  app.post('/logout', async (req, reply) => {
    destroySession(db, req.sid);
    reply.clearCookie(COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/me', async (req) => ({ auth: true, username: req.admin!.username, csrf: req.admin!.csrf }));

  app.post('/password', async (req, reply) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const row = db.prepare('SELECT pass_hash FROM admins WHERE id=?').get(req.admin!.admin_id) as { pass_hash: string };
    if (typeof b.current !== 'string' || !verifyPassword(b.current, row.pass_hash)) return reply.code(400).send({ error: 'bad_current' });
    if (typeof b.next !== 'string' || b.next.length < 10 || b.next.length > 200) return reply.code(400).send({ error: 'weak_password' });
    db.prepare('UPDATE admins SET pass_hash=? WHERE id=?').run(hashPassword(b.next), req.admin!.admin_id);
    destroyAllSessions(db, req.admin!.admin_id, req.sid);
    audit(db, req.admin!.username, 'password', 'admin', req.admin!.admin_id);
    return { ok: true };
  });

  // --- bütün admin datası bir sorğuda
  app.get('/data', async () => ({
    items: listItems(db), categories: listCategories(db), features: listFeatures(db),
    tables: listTables(db), settings: getSettings(db), allergens: ALLERGENS, icons: Object.keys(ICONS),
  }));

  // --- Məhsullar
  const saveItem = (id: number | null, d: ReturnType<typeof itemFromBody>) => {
    const cols = [d.category_id, JSON.stringify(d.name), JSON.stringify(d.description), JSON.stringify(d.ingredients),
      d.price, d.portion, d.prep_min, d.image, JSON.stringify(d.features), JSON.stringify(d.allergens),
      JSON.stringify(d.variants), JSON.stringify(d.addons), d.featured ? 1 : 0, d.visible ? 1 : 0, d.available ? 1 : 0];
    if (id === null) {
      const max = (db.prepare('SELECT COALESCE(MAX(sort),-1)+1 m FROM items WHERE category_id=?').get(d.category_id) as { m: number }).m;
      return Number(db.prepare(`INSERT INTO items(category_id,name,description,ingredients,price,portion,prep_min,image,features,allergens,variants,addons,featured,visible,available,sort)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(...cols, max).lastInsertRowid);
    }
    db.prepare(`UPDATE items SET category_id=?,name=?,description=?,ingredients=?,price=?,portion=?,prep_min=?,image=?,features=?,allergens=?,variants=?,addons=?,featured=?,visible=?,available=?,updated_at=datetime('now') WHERE id=?`)
      .run(...cols, id);
    return id;
  };
  const getItem = (id: number) => {
    const r = db.prepare('SELECT * FROM items WHERE id=?').get(id);
    return r ? rowToItem(r) : null;
  };

  app.post('/items', async (req) => {
    const d = itemFromBody(db, (req.body ?? {}) as Record<string, unknown>);
    const id = saveItem(null, d);
    log(req, 'create', 'item', id, { name: d.name.az, price: d.price });
    return getItem(id);
  });
  app.put<{ Params: { id: string } }>('/items/:id', async (req, reply) => {
    const id = Number(req.params.id);
    const old = getItem(id);
    if (!old) return reply.code(404).send({ error: 'not_found' });
    const d = itemFromBody(db, (req.body ?? {}) as Record<string, unknown>);
    saveItem(id, d);
    if (old.image && old.image !== d.image && !db.prepare('SELECT 1 FROM items WHERE image=?').get(old.image)) removeImage(uploads, old.image);
    const changed = Object.keys(d).filter((k) => JSON.stringify((old as unknown as Record<string, unknown>)[k]) !== JSON.stringify((d as Record<string, unknown>)[k]));
    log(req, 'update', 'item', id, { name: d.name.az, changed });
    return getItem(id);
  });
  // tez dəyişmə: qiymət, mövcudluq, görünmə, sevilən
  app.patch<{ Params: { id: string } }>('/items/:id', async (req, reply) => {
    const id = Number(req.params.id);
    const old = getItem(id);
    if (!old) return reply.code(404).send({ error: 'not_found' });
    const b = (req.body ?? {}) as Record<string, unknown>;
    const ch: Record<string, unknown> = {};
    if ('price' in b) {
      const p = money(b.price);
      if (old.variants.length) {
        const v = old.variants.map((x, i) => (i === 0 ? { ...x, price: p } : x));
        db.prepare('UPDATE items SET variants=? WHERE id=?').run(JSON.stringify(v), id);
      }
      db.prepare('UPDATE items SET price=? WHERE id=?').run(p, id); ch.price = [old.price, p];
    }
    for (const k of ['available', 'visible', 'featured'] as const) {
      if (k in b) { db.prepare(`UPDATE items SET ${k}=? WHERE id=?`).run(b[k] ? 1 : 0, id); ch[k] = !!b[k]; }
    }
    if (!Object.keys(ch).length) return reply.code(400).send({ error: 'nothing_to_change' });
    db.prepare("UPDATE items SET updated_at=datetime('now') WHERE id=?").run(id);
    log(req, 'patch', 'item', id, { name: old.name.az, ...ch });
    return getItem(id);
  });
  app.delete<{ Params: { id: string } }>('/items/:id', async (req, reply) => {
    const id = Number(req.params.id);
    const old = getItem(id);
    if (!old) return reply.code(404).send({ error: 'not_found' });
    db.prepare('DELETE FROM items WHERE id=?').run(id);
    if (old.image && !db.prepare('SELECT 1 FROM items WHERE image=?').get(old.image)) removeImage(uploads, old.image);
    log(req, 'delete', 'item', id, { name: old.name.az });
    return { ok: true };
  });
  const reorder = (table: string) => async (req: FastifyRequest) => {
    const ids = ((req.body ?? {}) as { ids?: unknown }).ids;
    if (!Array.isArray(ids) || ids.length > 1000 || !ids.every((x) => Number.isInteger(x))) throw new Bad('bad_ids');
    const st = db.prepare(`UPDATE ${table} SET sort=? WHERE id=?`);
    db.transaction(() => ids.forEach((id, i) => st.run(i, id)))();
    log(req, 'reorder', table.replace(/_$/, ''), null, { ids });
    return { ok: true };
  };
  app.post('/items/reorder', reorder('items'));

  // --- Kateqoriyalar
  app.post('/categories', async (req) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const name = l3(b.name, 60); if (!name.az) throw new Bad('name_required');
    const max = (db.prepare('SELECT COALESCE(MAX(sort),-1)+1 m FROM categories').get() as { m: number }).m;
    const id = Number(db.prepare('INSERT INTO categories(name,note,sort,hidden) VALUES (?,?,?,?)')
      .run(JSON.stringify(name), JSON.stringify(l3(b.note, 200)), max, b.hidden ? 1 : 0).lastInsertRowid);
    log(req, 'create', 'category', id, { name: name.az });
    return listCategories(db).find((c) => c.id === id);
  });
  app.put<{ Params: { id: string } }>('/categories/:id', async (req, reply) => {
    const id = Number(req.params.id);
    const b = (req.body ?? {}) as Record<string, unknown>;
    const name = l3(b.name, 60); if (!name.az) throw new Bad('name_required');
    const r = db.prepare('UPDATE categories SET name=?, note=?, hidden=? WHERE id=?').run(JSON.stringify(name), JSON.stringify(l3(b.note, 200)), b.hidden ? 1 : 0, id);
    if (!r.changes) return reply.code(404).send({ error: 'not_found' });
    log(req, 'update', 'category', id, { name: name.az, hidden: !!b.hidden });
    return listCategories(db).find((c) => c.id === id);
  });
  app.delete<{ Params: { id: string } }>('/categories/:id', async (req, reply) => {
    const id = Number(req.params.id);
    const n = (db.prepare('SELECT COUNT(*) c FROM items WHERE category_id=?').get(id) as { c: number }).c;
    if (n) return reply.code(409).send({ error: 'category_not_empty', count: n });
    db.prepare('DELETE FROM categories WHERE id=?').run(id);
    log(req, 'delete', 'category', id);
    return { ok: true };
  });
  app.post('/categories/reorder', reorder('categories'));

  // --- Özəlliklər
  const featBody = (b: Record<string, unknown>) => {
    const name = l3(b.name, 40); if (!name.az) throw new Bad('name_required');
    const icon = typeof b.icon === 'string' && b.icon in ICONS ? b.icon : 'star';
    const color = typeof b.color === 'string' && /^#[0-9a-f]{6}$/i.test(b.color) ? b.color : '#c4b5fd';
    return { name, icon, color };
  };
  app.post('/features', async (req) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const f = featBody(b);
    const key = `f${Date.now().toString(36)}`;
    const max = (db.prepare('SELECT COALESCE(MAX(sort),-1)+1 m FROM features').get() as { m: number }).m;
    const id = Number(db.prepare('INSERT INTO features(key,name,icon,color,sort) VALUES (?,?,?,?,?)').run(key, JSON.stringify(f.name), f.icon, f.color, max).lastInsertRowid);
    log(req, 'create', 'feature', id, { name: f.name.az });
    return listFeatures(db).find((x) => x.id === id);
  });
  app.put<{ Params: { id: string } }>('/features/:id', async (req, reply) => {
    const id = Number(req.params.id);
    const f = featBody((req.body ?? {}) as Record<string, unknown>);
    const r = db.prepare('UPDATE features SET name=?, icon=?, color=? WHERE id=?').run(JSON.stringify(f.name), f.icon, f.color, id);
    if (!r.changes) return reply.code(404).send({ error: 'not_found' });
    log(req, 'update', 'feature', id, { name: f.name.az });
    return listFeatures(db).find((x) => x.id === id);
  });
  app.delete<{ Params: { id: string } }>('/features/:id', async (req, reply) => {
    const id = Number(req.params.id);
    const f = listFeatures(db).find((x) => x.id === id);
    if (!f) return reply.code(404).send({ error: 'not_found' });
    db.transaction(() => {
      db.prepare('DELETE FROM features WHERE id=?').run(id);
      for (const it of listItems(db).filter((i) => i.features.includes(f.key))) {
        db.prepare('UPDATE items SET features=? WHERE id=?').run(JSON.stringify(it.features.filter((k) => k !== f.key)), it.id);
      }
    })();
    log(req, 'delete', 'feature', id, { name: f.name.az });
    return { ok: true };
  });

  // --- Masalar
  const tableBody = (b: Record<string, unknown>) => {
    const code = s(b.code, 20).toLowerCase();
    if (!/^[a-z0-9-]{1,20}$/.test(code)) throw new Bad('bad_code');
    const name = s(b.name, 40) || `Masa ${code}`;
    return { code, name };
  };
  app.post('/tables', async (req, reply) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    if (typeof b.count === 'number') { // toplu: 1..N
      const n = Math.min(200, Math.max(1, Math.floor(b.count)));
      const ins = db.prepare('INSERT OR IGNORE INTO tables_(code,name,sort) VALUES (?,?,?)');
      db.transaction(() => { for (let i = 1; i <= n; i++) ins.run(String(i), `Masa ${i}`, i); })();
      log(req, 'bulk_create', 'table', null, { count: n });
      return listTables(db);
    }
    const t = tableBody(b);
    if (db.prepare('SELECT 1 FROM tables_ WHERE code=?').get(t.code)) return reply.code(409).send({ error: 'code_exists' });
    const max = (db.prepare('SELECT COALESCE(MAX(sort),0)+1 m FROM tables_').get() as { m: number }).m;
    const id = Number(db.prepare('INSERT INTO tables_(code,name,sort) VALUES (?,?,?)').run(t.code, t.name, max).lastInsertRowid);
    log(req, 'create', 'table', id, t);
    return listTables(db).find((x) => x.id === id);
  });
  app.put<{ Params: { id: string } }>('/tables/:id', async (req, reply) => {
    const id = Number(req.params.id);
    const t = tableBody((req.body ?? {}) as Record<string, unknown>);
    const dup = db.prepare('SELECT id FROM tables_ WHERE code=? AND id!=?').get(t.code, id);
    if (dup) return reply.code(409).send({ error: 'code_exists' });
    const r = db.prepare('UPDATE tables_ SET code=?, name=? WHERE id=?').run(t.code, t.name, id);
    if (!r.changes) return reply.code(404).send({ error: 'not_found' });
    log(req, 'update', 'table', id, t);
    return listTables(db).find((x) => x.id === id);
  });
  app.delete<{ Params: { id: string } }>('/tables/:id', async (req) => {
    db.prepare('DELETE FROM tables_ WHERE id=?').run(Number(req.params.id));
    log(req, 'delete', 'table', Number(req.params.id));
    return { ok: true };
  });
  app.get<{ Params: { id: string; fmt: string } }>('/tables/:id/qr.:fmt', async (req, reply) => {
    const t = listTables(db).find((x) => x.id === Number(req.params.id));
    if (!t) return reply.code(404).send({ error: 'not_found' });
    const url = `${getSettings(db).public_url}/m/${encodeURIComponent(t.code)}`;
    const fname = `yuxa-${t.code}`;
    const opt = { errorCorrectionLevel: 'M' as const, margin: 1, color: { dark: '#1a1030', light: '#ffffff' } };
    if (req.params.fmt === 'svg') {
      const svg = await QRCode.toString(url, { ...opt, type: 'svg' });
      return reply.type('image/svg+xml').header('Content-Disposition', `${'download' in (req.query as object) ? 'attachment' : 'inline'}; filename="${fname}.svg"`).send(svg);
    }
    if (req.params.fmt === 'png') {
      const png = await QRCode.toBuffer(url, { ...opt, type: 'png', width: 1024 });
      return reply.type('image/png').header('Content-Disposition', `${'download' in (req.query as object) ? 'attachment' : 'inline'}; filename="${fname}.png"`).send(png);
    }
    return reply.code(404).send({ error: 'not_found' });
  });

  // --- Parametrlər
  app.put('/settings', async (req) => {
    const changed = saveSettings(db, (req.body ?? {}) as Record<string, unknown>);
    log(req, 'update', 'settings', null, { changed });
    return getSettings(db);
  });

  // --- Şəkil yükləmə
  app.post('/upload', async (req, reply) => {
    if (!req.isMultipart()) return reply.code(415).send({ error: 'multipart_required' });
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: 'no_file' });
    let buf: Buffer;
    try { buf = await file.toBuffer(); } catch { return reply.code(413).send({ error: 'too_large' }); }
    if (file.file.truncated) return reply.code(413).send({ error: 'too_large' });
    try {
      const img = await processImage(buf, uploads);
      audit(db, req.admin!.username, 'upload', 'image', img.id, { bytes: buf.length });
      return img;
    } catch (e) {
      if (e instanceof ImageError) return reply.code(e.code === 'too_large' ? 413 : 415).send({ error: e.code });
      throw e;
    }
  });

  // --- Backup və audit
  app.get('/backup', async (req, reply) => {
    const tmp = path.join(os.tmpdir(), `yuxa-dl-${process.pid}-${Date.now()}.zip`);
    await createBackupZip(db, app.opts.dataDir, tmp);
    audit(db, req.admin!.username, 'download', 'backup', null);
    const stream = fs.createReadStream(tmp);
    stream.on('close', () => fs.rmSync(tmp, { force: true }));
    const day = new Date().toISOString().slice(0, 10);
    return reply.type('application/zip').header('Content-Disposition', `attachment; filename="yuxa-backup-${day}.zip"`).send(stream);
  });
  app.get('/backups', async () => {
    const dir = path.join(app.opts.dataDir, 'backups');
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter((f) => f.endsWith('.zip')).sort().reverse()
      .map((f) => ({ file: f, bytes: fs.statSync(path.join(dir, f)).size }));
  });
  app.get('/audit', async () =>
    db.prepare('SELECT id, at, admin, action, entity, entity_id, detail FROM audit ORDER BY id DESC LIMIT 200').all());
}
