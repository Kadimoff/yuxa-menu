// Lokal təmizlik: E2E qalıqlarını silir və kateqoriya sırasını id-yə görə bərpa edir. Parol çap olunmur.
import { BASE, readSecret } from './lib.mjs';
const { user, pass } = readSecret();
const r = await fetch(`${BASE}/api/admin/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: user, password: pass }) });
if (!r.ok) { console.error('login failed', r.status); process.exit(1); }
const cookie = r.headers.get('set-cookie').split(';')[0];
const { csrf } = await r.json();
const h = { cookie, 'x-csrf-token': csrf };
const d = await (await fetch(`${BASE}/api/admin/data`, { headers: h })).json();
let n = 0;
for (const it of d.items.filter((i) => i.name.az.startsWith('E2E '))) { await fetch(`${BASE}/api/admin/items/${it.id}`, { method: 'DELETE', headers: h }); n++; }
const ids = [...d.categories].sort((a, b) => a.id - b.id).map((c) => c.id);
await fetch(`${BASE}/api/admin/categories/reorder`, { method: 'POST', headers: { ...h, 'content-type': 'application/json' }, body: JSON.stringify({ ids }) });
await fetch(`${BASE}/api/admin/logout`, { method: 'POST', headers: h });
console.log(`silindi: ${n}, kateqoriyalar: ${ids.join(',')}`);
