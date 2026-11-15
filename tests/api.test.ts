import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { jpeg, login, makeApp, multipart, PW } from './helpers.js';
import { nightlyBackup } from '../server/backup.js';
import { fold } from '../web/src/shared/catalog.js';
import { hashPassword, verifyPassword } from '../server/auth.js';

let ctx: Awaited<ReturnType<typeof makeApp>>;
beforeAll(async () => { ctx = await makeApp({ loginMax: 3 }); });
afterAll(async () => { await ctx.app.close(); fs.rmSync(ctx.dataDir, { recursive: true, force: true }); });

describe('public menu', () => {
  it('returns seeded sample menu with ETag and 304', async () => {
    const r = await ctx.app.inject('/api/menu');
    expect(r.statusCode).toBe(200);
    const m = r.json();
    expect(m.categories.length).toBe(7);
    expect(m.items.length).toBe(27);
    expect(m.settings.waiter_enabled).toBe(false);
    expect(m.settings.sample_notice).toBe(true);
    expect(m.items.some((i: { image: string | null }) => i.image)).toBe(true);
    const etag = r.headers.etag as string;
    expect(etag).toMatch(/^W\/"m\d+"$/);
    const r2 = await ctx.app.inject({ url: '/api/menu', headers: { 'if-none-match': etag } });
    expect(r2.statusCode).toBe(304);
  });
  it('compresses JSON with brotli/gzip', async () => {
    const r = await ctx.app.inject({ url: '/api/menu', headers: { 'accept-encoding': 'br, gzip' } });
    expect(['br', 'gzip']).toContain(r.headers['content-encoding']);
  });
  it('serves processed seed images, blocks traversal', async () => {
    const m = (await ctx.app.inject('/api/menu')).json();
    const img = m.items.find((i: { image: string | null }) => i.image).image;
    for (const w of [240, 480, 720, 1200]) expect((await ctx.app.inject(`/media/${img}-${w}.webp`)).statusCode).toBe(200);
    for (const u of ['/media/../yuxa.db', '/media/..%2fyuxa.db', '/media/%2e%2e/yuxa.db', '/media/..%5cyuxa.db']) {
      const r = await ctx.app.inject(u);
      expect(r.statusCode, u).not.toBe(200);
      expect(r.body).not.toContain('SQLite');
    }
  });
});

describe('auth', () => {
  it('scrypt hash roundtrip', () => {
    const h = hashPassword('salam-dünya-123');
    expect(verifyPassword('salam-dünya-123', h)).toBe(true);
    expect(verifyPassword('salam-dunya-123', h)).toBe(false);
  });
  it('rejects admin API without session', async () => {
    expect((await ctx.app.inject('/api/admin/data')).statusCode).toBe(401);
    expect((await ctx.app.inject('/api/admin/me')).json()).toEqual({ auth: false });
    expect((await ctx.app.inject({ method: 'POST', url: '/api/admin/items', payload: {} })).statusCode).toBe(401);
  });
  it('sets httpOnly secure strict cookie', async () => {
    const r = await ctx.app.inject({ method: 'POST', url: '/api/admin/login', payload: { username: 'admin', password: PW } });
    const c = String(r.headers['set-cookie']);
    expect(c).toMatch(/HttpOnly/i); expect(c).toMatch(/Secure/i); expect(c).toMatch(/SameSite=Strict/i);
    expect(r.body).not.toContain('pass_hash');
  });
  it('rate limits failed logins', async () => {
    const bad = () => ctx.app.inject({ method: 'POST', url: '/api/admin/login', payload: { username: 'mallory', password: 'x' }, remoteAddress: '10.9.9.9' });
    expect((await bad()).statusCode).toBe(401);
    expect((await bad()).statusCode).toBe(401);
    expect((await bad()).statusCode).toBe(401);
    const r = await bad();
    expect(r.statusCode).toBe(429);
    expect(Number(r.headers['retry-after'])).toBeGreaterThan(0);
  });
  it('requires CSRF token and same origin for mutations', async () => {
    const { cookie, csrf } = await login(ctx.app);
    const p = { method: 'PATCH' as const, url: '/api/admin/items/1', payload: { available: false } };
    expect((await ctx.app.inject({ ...p, headers: { cookie } })).statusCode).toBe(403);
    expect((await ctx.app.inject({ ...p, headers: { cookie, 'x-csrf-token': 'wrong' } })).statusCode).toBe(403);
    expect((await ctx.app.inject({ ...p, headers: { cookie, 'x-csrf-token': csrf, origin: 'https://evil.example' } })).statusCode).toBe(403);
    expect((await ctx.app.inject({ ...p, headers: { cookie, 'x-csrf-token': csrf } })).statusCode).toBe(200);
    await ctx.app.inject({ ...p, payload: { available: true }, headers: { cookie, 'x-csrf-token': csrf } });
  });
  it('logout invalidates session', async () => {
    const { h, cookie } = await login(ctx.app);
    expect((await ctx.app.inject({ method: 'POST', url: '/api/admin/logout', headers: h })).statusCode).toBe(200);
    expect((await ctx.app.inject({ url: '/api/admin/me', headers: { cookie } })).json().auth).toBe(false);
    expect((await ctx.app.inject({ url: '/api/admin/data', headers: { cookie } })).statusCode).toBe(401);
  });
  it('password change validates and keeps current session', async () => {
    const { h } = await login(ctx.app);
    expect((await ctx.app.inject({ method: 'POST', url: '/api/admin/password', headers: h, payload: { current: 'yanlis', next: 'yeni-parol-1234' } })).statusCode).toBe(400);
    expect((await ctx.app.inject({ method: 'POST', url: '/api/admin/password', headers: h, payload: { current: PW, next: 'qısa' } })).statusCode).toBe(400);
    expect((await ctx.app.inject({ method: 'POST', url: '/api/admin/password', headers: h, payload: { current: PW, next: PW } })).statusCode).toBe(200);
    expect((await ctx.app.inject({ url: '/api/admin/me', headers: h })).statusCode).toBe(200);
  });
});

describe('admin CRUD', () => {
  it('creates, edits, quick-patches and deletes an item; menu reflects it; audit logs it', async () => {
    const { h } = await login(ctx.app);
    const data = (await ctx.app.inject({ url: '/api/admin/data', headers: h })).json();
    const cat = data.categories[0].id;
    const v0 = (await ctx.app.inject('/api/menu')).headers.etag;
    const body = { category_id: cat, name: { az: 'Test qutabı', en: 'Test', ru: '' }, price: 350, portion: '1 əd',
      features: ['veg', 'nope'], allergens: ['gluten', 'bogus'], variants: [], addons: [{ name: { az: 'Qatıq' }, price: 100 }] };
    const c = await ctx.app.inject({ method: 'POST', url: '/api/admin/items', headers: h, payload: body });
    expect(c.statusCode).toBe(200);
    const it0 = c.json();
    expect(it0.features).toEqual(['veg']);
    expect(it0.allergens).toEqual(['gluten']);
    expect(it0.addons[0].price).toBe(100);
    const p = await ctx.app.inject({ method: 'PATCH', url: `/api/admin/items/${it0.id}`, headers: h, payload: { price: 420, available: false } });
    expect(p.json().price).toBe(420);
    const menu = await ctx.app.inject('/api/menu');
    expect(menu.headers.etag).not.toBe(v0);
    const mi = menu.json().items.find((i: { id: number }) => i.id === it0.id);
    expect(mi.price).toBe(420); expect(mi.available).toBe(false);
    await ctx.app.inject({ method: 'PATCH', url: `/api/admin/items/${it0.id}`, headers: h, payload: { visible: false } });
    expect((await ctx.app.inject('/api/menu')).json().items.find((i: { id: number }) => i.id === it0.id)).toBeUndefined();
    const bad = await ctx.app.inject({ method: 'POST', url: '/api/admin/items', headers: h, payload: { ...body, price: -5 } });
    expect(bad.statusCode).toBe(400);
    const noName = await ctx.app.inject({ method: 'POST', url: '/api/admin/items', headers: h, payload: { ...body, name: { az: '' } } });
    expect(noName.json().error).toBe('name_required');
    expect((await ctx.app.inject({ method: 'DELETE', url: `/api/admin/items/${it0.id}`, headers: h })).statusCode).toBe(200);
    const audit = (await ctx.app.inject({ url: '/api/admin/audit', headers: h })).json();
    expect(audit.some((a: { action: string; entity: string }) => a.action === 'create' && a.entity === 'item')).toBe(true);
    expect(audit.some((a: { action: string }) => a.action === 'patch')).toBe(true);
  });
  it('variant price becomes base price', async () => {
    const { h } = await login(ctx.app);
    const cat = (await ctx.app.inject({ url: '/api/admin/data', headers: h })).json().categories[0].id;
    const r = await ctx.app.inject({ method: 'POST', url: '/api/admin/items', headers: h, payload: {
      category_id: cat, name: { az: 'Variantlı' }, price: 1, variants: [{ name: { az: 'Kiçik' }, price: 500 }, { name: { az: 'Böyük' }, price: 800 }] } });
    expect(r.json().price).toBe(500);
    expect(r.json().variants.length).toBe(2);
  });
  it('categories: create, reorder, hide, refuse non-empty delete', async () => {
    const { h } = await login(ctx.app);
    const c = (await ctx.app.inject({ method: 'POST', url: '/api/admin/categories', headers: h, payload: { name: { az: 'Kabablar', en: 'Kebabs', ru: 'Кебабы' } } })).json();
    const cats = (await ctx.app.inject({ url: '/api/admin/data', headers: h })).json().categories;
    const ids = [c.id, ...cats.filter((x: { id: number }) => x.id !== c.id).map((x: { id: number }) => x.id)];
    expect((await ctx.app.inject({ method: 'POST', url: '/api/admin/categories/reorder', headers: h, payload: { ids } })).statusCode).toBe(200);
    const after = (await ctx.app.inject({ url: '/api/admin/data', headers: h })).json().categories;
    expect(after[0].id).toBe(c.id);
    // boş kateqoriya menyuda görünür (gizli deyil), sonra gizlədilir
    await ctx.app.inject({ method: 'PUT', url: `/api/admin/categories/${c.id}`, headers: h, payload: { name: { az: 'Kabablar' }, hidden: true } });
    expect((await ctx.app.inject('/api/menu')).json().categories.some((x: { id: number }) => x.id === c.id)).toBe(false);
    expect((await ctx.app.inject({ method: 'DELETE', url: `/api/admin/categories/${cats[0].id}`, headers: h })).statusCode).toBe(409);
    expect((await ctx.app.inject({ method: 'DELETE', url: `/api/admin/categories/${c.id}`, headers: h })).statusCode).toBe(200);
    expect((await ctx.app.inject({ method: 'POST', url: '/api/admin/categories/reorder', headers: h, payload: { ids: ['1;DROP'] } })).statusCode).toBe(400);
  });
  it('features: create with icon/color, delete removes from items', async () => {
    const { h } = await login(ctx.app);
    const f = (await ctx.app.inject({ method: 'POST', url: '/api/admin/features', headers: h, payload: { name: { az: 'Uşaqlar üçün' }, icon: 'child', color: '#f9a8d4' } })).json();
    expect(f.icon).toBe('child');
    const x = (await ctx.app.inject({ method: 'POST', url: '/api/admin/features', headers: h, payload: { name: { az: 'X' }, icon: '<script>', color: 'red' } })).json();
    expect(x.icon).toBe('star'); expect(x.color).toBe('#c4b5fd');
    const items = (await ctx.app.inject({ url: '/api/admin/data', headers: h })).json().items;
    const it0 = items[0];
    await ctx.app.inject({ method: 'PUT', url: `/api/admin/items/${it0.id}`, headers: h, payload: { ...it0, features: [...it0.features, f.key] } });
    await ctx.app.inject({ method: 'DELETE', url: `/api/admin/features/${f.id}`, headers: h });
    const again = (await ctx.app.inject({ url: '/api/admin/data', headers: h })).json().items.find((i: { id: number }) => i.id === it0.id);
    expect(again.features).not.toContain(f.key);
  });
  it('tables + QR svg/png', async () => {
    const { h } = await login(ctx.app);
    const t = (await ctx.app.inject({ method: 'POST', url: '/api/admin/tables', headers: h, payload: { code: 'teras-1', name: 'Teras 1' } })).json();
    expect((await ctx.app.inject({ method: 'POST', url: '/api/admin/tables', headers: h, payload: { code: 'teras-1' } })).statusCode).toBe(409);
    expect((await ctx.app.inject({ method: 'POST', url: '/api/admin/tables', headers: h, payload: { code: '../x' } })).statusCode).toBe(400);
    const svg = await ctx.app.inject({ url: `/api/admin/tables/${t.id}/qr.svg`, headers: h });
    expect(svg.headers['content-type']).toContain('image/svg+xml');
    expect(svg.body).toContain('<svg');
    const png = await ctx.app.inject({ url: `/api/admin/tables/${t.id}/qr.png?download`, headers: h });
    expect(png.headers['content-disposition']).toContain('attachment');
    expect(png.rawPayload.subarray(1, 4).toString()).toBe('PNG');
  });
  it('settings: validation, waiter flag cannot be enabled', async () => {
    const { h } = await login(ctx.app);
    const r = await ctx.app.inject({ method: 'PUT', url: '/api/admin/settings', headers: h, payload: {
      venue_name: 'Yuxa Evi', service_percent: 12, waiter_enabled: true, accent: 'hacker', public_url: 'javascript:alert(1)',
      hours: { mon: { open: '09:00', close: '25:00', closed: false }, sun: { closed: true } } } });
    const s = r.json();
    expect(s.venue_name).toBe('Yuxa Evi'); expect(s.service_percent).toBe(12);
    expect(s.waiter_enabled).toBe(false); expect(s.accent).toBe('violet');
    expect(s.public_url).toBe('https://yuxa.az');
    expect(s.hours.mon.open).toBe('09:00'); expect(s.hours.mon.close).toBe('23:00'); expect(s.hours.sun.closed).toBe(true);
    expect((await ctx.app.inject('/api/menu')).json().settings.venue_name).toBe('Yuxa Evi');
  });
});

describe('image upload', () => {
  it('accepts jpeg, strips EXIF, makes 4 webp sizes', async () => {
    const { h } = await login(ctx.app);
    const mp = multipart('file', 'photo.jpg', 'image/jpeg', await jpeg(1600, 1200));
    const r = await ctx.app.inject({ method: 'POST', url: '/api/admin/upload', headers: { ...h, ...mp.headers }, payload: mp.body });
    expect(r.statusCode).toBe(200);
    const { id } = r.json();
    for (const w of [240, 480, 720, 1200]) {
      const f = path.join(ctx.dataDir, 'uploads', `${id}-${w}.webp`);
      const m = await sharp(f).metadata();
      expect(m.format).toBe('webp'); expect(m.width).toBeLessThanOrEqual(w); expect(m.exif).toBeUndefined();
    }
  });
  it('rejects non-images even with image mime / name', async () => {
    const { h } = await login(ctx.app);
    const mp = multipart('file', 'evil.jpg', 'image/jpeg', Buffer.from('<?php system($_GET[1]); ?>'.repeat(20)));
    const r = await ctx.app.inject({ method: 'POST', url: '/api/admin/upload', headers: { ...h, ...mp.headers }, payload: mp.body });
    expect(r.statusCode).toBe(415);
    const svg = multipart('file', 'x.svg', 'image/svg+xml', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><script>alert(1)</script></svg>'));
    expect((await ctx.app.inject({ method: 'POST', url: '/api/admin/upload', headers: { ...h, ...svg.headers }, payload: svg.body })).statusCode).toBe(415);
  });
  it('rejects too large and too small files', async () => {
    const { h } = await login(ctx.app);
    const big = multipart('file', 'big.jpg', 'image/jpeg', Buffer.alloc(9 * 1024 * 1024, 1));
    expect((await ctx.app.inject({ method: 'POST', url: '/api/admin/upload', headers: { ...h, ...big.headers }, payload: big.body })).statusCode).toBe(413);
    const tiny = multipart('file', 't.jpg', 'image/jpeg', await jpeg(50, 50));
    expect((await ctx.app.inject({ method: 'POST', url: '/api/admin/upload', headers: { ...h, ...tiny.headers }, payload: tiny.body })).statusCode).toBe(415);
  });
  it('path traversal in filename is ignored, image id must be safe on save', async () => {
    const { h } = await login(ctx.app);
    const mp = multipart('file', '../../../etc/passwd.jpg', 'image/jpeg', await jpeg());
    const r = await ctx.app.inject({ method: 'POST', url: '/api/admin/upload', headers: { ...h, ...mp.headers }, payload: mp.body });
    expect(r.json().id).toMatch(/^[a-f0-9]{16}$/);
    const cat = (await ctx.app.inject({ url: '/api/admin/data', headers: h })).json().categories[0].id;
    const bad = await ctx.app.inject({ method: 'POST', url: '/api/admin/items', headers: h, payload: { category_id: cat, name: { az: 'x' }, price: 1, image: '../../yuxa' } });
    expect(bad.statusCode).toBe(400);
  });
});

describe('backup', () => {
  it('downloads a zip containing the database and uploads', async () => {
    const { h } = await login(ctx.app);
    const r = await ctx.app.inject({ url: '/api/admin/backup', headers: h });
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toContain('application/zip');
    const buf = r.rawPayload;
    expect(buf.subarray(0, 2).toString()).toBe('PK');
    expect(buf.includes(Buffer.from('yuxa.db'))).toBe(true);
    expect(buf.includes(Buffer.from('uploads/'))).toBe(true);
  });
  it('nightly backup runs once per day after 03:00 and rotates', async () => {
    const d = new Date(); d.setHours(4, 0, 0, 0);
    const f = await nightlyBackup(ctx.app.db, ctx.dataDir, 2, d);
    expect(f && fs.existsSync(f)).toBe(true);
    expect(await nightlyBackup(ctx.app.db, ctx.dataDir, 2, d)).toBeNull();
    const early = new Date(d); early.setDate(early.getDate() + 1); early.setHours(1);
    expect(await nightlyBackup(ctx.app.db, ctx.dataDir, 2, early)).toBeNull();
    for (let i = 1; i <= 3; i++) { const n = new Date(d); n.setDate(n.getDate() + i); await nightlyBackup(ctx.app.db, ctx.dataDir, 2, n); }
    expect(fs.readdirSync(path.join(ctx.dataDir, 'backups')).length).toBe(2);
  });
});

describe('search folding', () => {
  it('matches without diacritics', () => {
    expect(fold('Toyuq çığırtması')).toContain(fold('cigirtma'));
    expect(fold('Düşbərə')).toBe('dusbere');
    expect(fold('İsti yeməklər')).toBe('isti yemekler');
    expect(fold('Ёжик')).toBe('ежик');
  });
});
