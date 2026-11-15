// Uçdan-uca yoxlama: müştəri menyusu + admin panel. İşlətmək: server 127.0.0.1:8787-də işləyərkən `npm run e2e`.
import { launch, newPage, BASE, sleep, shot, overflow, fontFallbacks, readSecret } from './lib.mjs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const sharp = require('sharp');
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const results = [];
let failed = 0;
const ok = (name, cond, extra = '') => { results.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`); if (!cond) failed++; };
const SNAP = process.env.NOSHOT ? null : true;
const FONT_SEL = ['h1', '.tab', '.it h3', '.it-d', '.price', '.chip span', '.dk-l', '.cat-h p', '.sec-t'];
const text = (p, sel) => p.$eval(sel, (e) => e.textContent.trim()).catch(() => '');
const waitText = async (p, sel, t, ms = 4000) => { try { await p.waitForFunction((s, x) => [...document.querySelectorAll(s)].some((e) => e.textContent.includes(x)), { timeout: ms }, sel, t); return true; } catch { return false; } };

const b = await launch();

/* ================= MÜŞTƏRİ ================= */
async function customer(width, theme, snap) {
  const tag = `${width}/${theme}`;
  const p = await newPage(b, { width, theme });
  await p.goto(`${BASE}/m/7`, { waitUntil: 'networkidle0' });
  await sleep(300);
  ok(`[${tag}] menyu açılır`, (await p.$$('.it')).length >= 25, `${(await p.$$('.it')).length} məhsul`);
  ok(`[${tag}] masa nömrəsi`, (await text(p, '#tableChip')).includes('7'));
  ok(`[${tag}] açıq/bağlı nişanı`, /Açıqdır|Bağlıdır/.test(await text(p, '#heroMeta')));
  if (snap) await shot(p, `menu-hero-${theme}`);
  let o = await overflow(p); ok(`[${tag}] üfüqi daşma yoxdur (menyu)`, o.scrollWidth <= width && !o.bad.length, o.bad.join(';'));
  const ff = await fontFallbacks(p, FONT_SEL); ok(`[${tag}] şrift fallback yoxdur (AZ)`, !ff.length, ff.join('; '));

  // tab
  const tabs = await p.$$eval('.tab', (t) => t.map((x) => x.textContent));
  const idx = tabs.indexOf('Şorbalar');
  await (await p.$$('.tab'))[idx].click(); await sleep(900);
  const pos = await p.evaluate(() => {
    const s = [...document.querySelectorAll('.cat')].find((c) => c.querySelector('h2 span').textContent === 'Şorbalar');
    return { top: s.querySelector('h2').getBoundingClientRect().top, bar: document.querySelector('#tabs').getBoundingClientRect().bottom, active: document.querySelector('.tab.on')?.textContent };
  });
  ok(`[${tag}] tab bölməyə keçir, başlıq sticky barın altında`, pos.top >= pos.bar - 2 && pos.top < pos.bar + 80 && pos.active === 'Şorbalar', JSON.stringify(pos));
  if (snap) { await p.evaluate(() => scrollBy(0, -40)); await sleep(400); await shot(p, `menu-category-${theme}`); }

  // axtarış
  await p.click('[data-slot=search]'); await sleep(400);
  await p.type('#q', 'cigirtma'); await sleep(250);
  ok(`[${tag}] diakritiksiz axtarış (cigirtma → çığırtma)`, (await text(p, '#sres')).includes('çığırtma'));
  await p.$eval('#q', (e) => { e.value = ''; }); await p.type('#q', 'dus'); await sleep(250);
  ok(`[${tag}] axtarış: "dus" → Düşbərə`, (await text(p, '#sres')).includes('Düşbərə'));
  if (snap) await shot(p, `menu-search-${theme}`);
  o = await overflow(p); ok(`[${tag}] üfüqi daşma yoxdur (axtarış)`, !o.bad.length, o.bad.join(';'));
  await p.click('[data-slot=menu]'); await sleep(450);

  // məhsul pəncərəsi + variant + əlavə
  await p.evaluate(() => [...document.querySelectorAll('.it')].find((e) => e.querySelector('h3').textContent === 'Lülə kabab').click());
  await sleep(600);
  ok(`[${tag}] məhsul pəncərəsi açılır`, await p.$eval('#sheet', (e) => e.classList.contains('open')));
  await p.evaluate(() => [...document.querySelectorAll('[data-var]')].find((e) => e.textContent.includes('Toyuq')).click());
  await p.evaluate(() => [...document.querySelectorAll('[data-addon]')].find((e) => e.textContent.includes('lavaş')).click());
  await p.click('[data-q="1"]');
  const sum = await text(p, '#shSum');
  ok(`[${tag}] variant + əlavə + say qiyməti (2 × 10,50)`, sum.replace(/\s/g, '') === '21₼', sum);
  if (snap) { await p.$eval('#sheet', (e) => { e.scrollTop = 0; }); await sleep(200); await shot(p, `menu-item-sheet-${theme}`); }
  await p.click('#shAdd'); await sleep(600);
  ok(`[${tag}] səbət nişanı 2`, (await text(p, '#badge')) === '2');
  // yoxdur: səbətə əlavə düyməsi yoxdur
  const naHasAdd = await p.evaluate(() => { const e = [...document.querySelectorAll('.it')].find((x) => x.querySelector('h3').textContent === 'Sac içi'); return { na: e.classList.contains('na'), add: !!e.querySelector('.add') }; });
  ok(`[${tag}] "hal-hazırda yoxdur" məhsulu əlavə olunmur`, naHasAdd.na && !naHasAdd.add);
  // sürətli +
  await p.evaluate(() => [...document.querySelectorAll('.it')].find((e) => e.querySelector('h3').textContent === 'Göyərtili qutab').querySelector('.add').click());
  await sleep(300);
  ok(`[${tag}] sürətli əlavə: nişan 3`, (await text(p, '#badge')) === '3');

  // səbət
  await p.click('[data-slot=cart]'); await sleep(450);
  ok(`[${tag}] səbətdə 2 sətir`, (await p.$$('.ln')).length === 2);
  await p.click('.ln [data-note]'); await sleep(100);
  await p.type('.note-in', 'soğansız'); await p.keyboard.press('Enter'); await sleep(200);
  const tot = await p.$eval('.sum .tot b', (e) => e.textContent.replace(/\s/g, ''));
  ok(`[${tag}] cəm + 10% xidmət (22,80 + 2,28)`, tot === '25,08₼', tot);
  if (snap) { await sleep(1700); await shot(p, `menu-cart-${theme}`); }
  o = await overflow(p); ok(`[${tag}] üfüqi daşma yoxdur (səbət)`, !o.bad.length, o.bad.join(';'));
  await p.click('#showBtn'); await sleep(450);
  const sw = await text(p, '#show');
  ok(`[${tag}] "Ofisianta göstər": masa, qeyd, cəm`, sw.includes('Masa') && sw.includes('7') && sw.includes('soğansız') && sw.replace(/\s/g, '').includes('25,08₼'));
  if (snap) await shot(p, `menu-show-waiter-${theme}`);
  await p.click('#show [data-close]'); await sleep(350);
  ok(`[${tag}] göstər ekranı bağlanır`, !(await p.$eval('#show', (e) => e.classList.contains('open'))));
  // persist
  await p.reload({ waitUntil: 'networkidle0' }); await sleep(200);
  ok(`[${tag}] səbət localStorage-da qalır`, (await text(p, '#badge')) === '3');

  // məkan və dil
  await p.click('[data-slot=info]'); await sleep(400);
  if (snap) await shot(p, `menu-info-${theme}`);
  await p.$eval('#v-info', (v) => { v.scrollTop = v.scrollHeight; }); await sleep(200);
  await p.click('#v-info [data-setlang=ru]'); await sleep(300);
  await p.click('[data-slot=menu]'); await sleep(400);
  ok(`[${tag}] dil RU`, (await p.$$eval('.tab', (t) => t.map((x) => x.textContent))).includes('Супы'));
  const ffr = await fontFallbacks(p, FONT_SEL); ok(`[${tag}] şrift fallback yoxdur (RU/kiril)`, !ffr.length, ffr.join('; '));
  await p.evaluate(() => scrollTo(0, 0)); await sleep(300);
  await p.click('#langBtn'); await sleep(150); await p.click('#langPop [data-setlang=en]'); await sleep(300);
  ok(`[${tag}] dil EN`, (await text(p, '.dk[data-slot=cart] .dk-l')) === 'Cart');
  await p.click('#langBtn'); await sleep(150); await p.click('#langPop [data-setlang=az]'); await sleep(300);
  // tema
  const before = await p.$eval('html', (e) => e.dataset.theme);
  await p.click('#themeBtn'); await sleep(200);
  const after = await p.$eval('html', (e) => e.dataset.theme);
  ok(`[${tag}] tema dəyişir`, before !== after);
  await p.click('#themeBtn');
  // ofisiant slotu gizlidir
  ok(`[${tag}] ofisiant slotu söndürülüb`, !(await p.$('[data-slot=waiter]')));
  ok(`[${tag}] konsol xətası yoxdur`, !p.errors.length, p.errors.join(' | '));
  await p.evaluate(() => localStorage.clear());
  await p.context_.close();
}

for (const w of [390, 360]) for (const t of ['dark', 'light']) await customer(w, t, w === 390);

/* ---- offline ---- */
{
  const p = await newPage(b, { theme: 'dark' });
  await p.goto(`${BASE}/m/3`, { waitUntil: 'networkidle0' });
  await p.waitForFunction(() => navigator.serviceWorker?.controller || navigator.serviceWorker?.ready.then(() => true), { timeout: 8000 }).catch(() => {});
  await p.evaluate(async () => { await navigator.serviceWorker.ready; });
  await p.reload({ waitUntil: 'networkidle0' }); // SW indi idarə edir; şəkillər "warm" ilə cache olunur
  await sleep(2500);
  await p.setOfflineMode(true);
  await p.reload({ waitUntil: 'domcontentloaded' }); await sleep(1500);
  const n = (await p.$$('.it')).length;
  const imgs = await p.$$eval('.hero-img, .fc-img', (a) => a.map((i) => i.complete && i.naturalWidth > 0));
  ok('[offline] service worker ilə ikinci açılış: menyu', n >= 25, `${n} məhsul`);
  ok('[offline] şəkillər cache-dən', imgs.length > 0 && imgs.every(Boolean), JSON.stringify(imgs));
  ok('[offline] masa nömrəsi', (await text(p, '#tableChip')).includes('3'));
  await p.setOfflineMode(false);
  await p.context_.close();
}

/* ================= ADMİN ================= */
const { user, pass } = readSecret();
const tmpImg = path.join(os.tmpdir(), `yuxa-e2e-${Date.now()}.jpg`);
await sharp(fs.readFileSync('seed/img/salad.webp')).rotate(90).jpeg({ quality: 85 }).toFile(tmpImg);
{
  const p = await newPage(b, { width: 390 });
  await p.goto(`${BASE}/admin`, { waitUntil: 'networkidle0' });
  if (SNAP) await shot(p, 'admin-login');
  await p.type('[name=username]', user); await p.type('[name=password]', 'yanlış-parol');
  await p.click('button[type=submit]'); await sleep(500);
  ok('[admin] yanlış parol rədd olunur', (await text(p, '#loginErr')).includes('yanlış'));
  p.errors = p.errors.filter((e) => !e.includes('status of 401')); // yanlış parol üçün gözlənilən 401
  await p.$eval('[name=password]', (e) => { e.value = ''; });
  await p.type('[name=password]', pass); await p.click('button[type=submit]');
  await p.waitForSelector('.adm', { timeout: 5000 });
  ok('[admin] giriş', (await text(p, '.ah h1')) === 'Məhsullar');
  if (SNAP) await shot(p, 'admin-products');
  const o = await overflow(p); ok('[admin] üfüqi daşma yoxdur (məhsullar)', !o.bad.length, o.bad.join(';'));

  // yeni məhsul (foto ilə)
  await p.goto(`${BASE}/admin#/item/new`, { waitUntil: 'networkidle0' }); await sleep(300);
  await p.type('[name="name.az"]', 'E2E göbələk şorbası');
  await p.click('[data-ltabs] [data-l=en]'); await p.type('[name="name.en"]', 'E2E mushroom soup');
  await p.click('[data-ltabs] [data-l=az]');
  await p.type('[name="description.az"]', 'Meşə göbələyi, qaymaq');
  await p.type('[name=price]', '7,50'); await p.type('[name=portion]', '350 ml');
  const soupId = await p.$$eval('[name=category_id] option', (o) => o.find((x) => x.textContent === 'Şorbalar').value);
  await p.select('[name=category_id]', soupId);
  await p.click('#feats [data-f=new]');
  const fileInput = await p.$('#file'); await fileInput.uploadFile(tmpImg);
  await p.waitForSelector('#photo img', { timeout: 15000 });
  ok('[admin] foto yüklənir', !!(await p.$('#photo img')));
  await p.click('#save');
  await p.waitForFunction(() => location.hash === '#/items', { timeout: 5000 });
  ok('[admin] məhsul yaradıldı', await waitText(p, '.row-tx b', 'E2E göbələk şorbası'));

  // müştəri menyusunda görünür
  const c = await newPage(b, { width: 390 });
  await c.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
  const cust = await c.evaluate(() => { const e = [...document.querySelectorAll('.it')].find((x) => x.querySelector('h3').textContent === 'E2E göbələk şorbası'); return e ? { price: e.querySelector('.price').textContent, img: !!e.querySelector('img') } : null; });
  ok('[admin→menyu] yeni məhsul şəkli ilə görünür', cust && cust.price.replace(/\s/g, '') === '7,50₼' && cust.img, JSON.stringify(cust));

  // sürətli qiymət dəyişmə
  await p.evaluate(() => [...document.querySelectorAll('.row')].find((r) => r.querySelector('.row-tx b').textContent === 'Göyərtili qutab').querySelector('.price-btn').click());
  await p.waitForSelector('.price-edit input');
  await p.$eval('.price-edit input', (e) => { e.value = ''; });
  await p.type('.price-edit input', '2,20'); await p.keyboard.press('Enter');
  await sleep(700);
  await c.reload({ waitUntil: 'networkidle0' });
  const qp = await c.evaluate(() => [...document.querySelectorAll('.it')].find((x) => x.querySelector('h3').textContent === 'Göyərtili qutab').querySelector('.price')?.textContent);
  ok('[admin→menyu] qiymət dəyişməsi dərhal görünür', qp?.replace(/\s/g, '') === '2,20₼', qp);

  // yoxdur keçidi
  await p.evaluate(() => [...document.querySelectorAll('.row')].find((r) => r.querySelector('.row-tx b').textContent === 'Göyərtili qutab').querySelector('[data-avail]').click());
  await sleep(700);
  await c.reload({ waitUntil: 'networkidle0' });
  const na = await c.evaluate(() => { const e = [...document.querySelectorAll('.it')].find((x) => x.querySelector('h3').textContent === 'Göyərtili qutab'); return e.classList.contains('na') && e.textContent.includes('Hal-hazırda yoxdur'); });
  ok('[admin→menyu] "hal-hazırda yoxdur" keçidi', na);
  await p.evaluate(() => [...document.querySelectorAll('.row')].find((r) => r.querySelector('.row-tx b').textContent === 'Göyərtili qutab').querySelector('[data-avail]').click());
  await sleep(500);

  // kateqoriya sırası: sürüklə
  await p.goto(`${BASE}/admin#/categories`, { waitUntil: 'networkidle0' }); await sleep(300);
  if (SNAP) await shot(p, 'admin-categories');
  const order0 = await p.$$eval('#clist .row-tx b', (e) => e.map((x) => x.textContent));
  const g = await p.$$('#clist .grip');
  const b0 = await g[0].boundingBox(); const b1 = await g[1].boundingBox();
  await p.mouse.move(b0.x + b0.width / 2, b0.y + b0.height / 2); await p.mouse.down();
  for (let i = 1; i <= 8; i++) { await p.mouse.move(b0.x + b0.width / 2, b0.y + b0.height / 2 + ((b1.y - b0.y + 40) * i) / 8); await sleep(30); }
  await p.mouse.up(); await sleep(800);
  const order1 = await p.$$eval('#clist .row-tx b', (e) => e.map((x) => x.textContent));
  ok('[admin] kateqoriya sürüklə-sırala', order1[1] === order0[0] && order1[0] === order0[1], order1.slice(0, 3).join(','));
  await c.reload({ waitUntil: 'networkidle0' });
  const tabs = await c.$$eval('.tab', (t) => t.map((x) => x.textContent));
  ok('[admin→menyu] tab sırası dəyişdi', tabs[0] === order0[1] && tabs[1] === order0[0], tabs.slice(0, 2).join(','));

  if (SNAP) {
    const lid = await p.evaluate(async () => (await (await fetch('/api/admin/data')).json()).items.find((i) => i.name.az === 'Lülə kabab').id);
    await p.goto(`${BASE}/admin#/item/${lid}`, { waitUntil: 'networkidle0' }); await sleep(500);
    await shot(p, 'admin-product-edit');
    await p.evaluate(() => document.querySelector('#ov').scrollIntoView({ block: 'center' })); await sleep(300);
    await shot(p, 'admin-product-edit-options');
  }
  // özəlliklər
  await p.goto(`${BASE}/admin#/features`, { waitUntil: 'networkidle0' }); await sleep(300);
  if (SNAP) await shot(p, 'admin-features');

  // masalar və çap
  await p.goto(`${BASE}/admin#/tables`, { waitUntil: 'networkidle0' }); await sleep(800);
  if (SNAP) await shot(p, 'admin-tables-qr');
  await p.goto(`${BASE}/admin#/print`, { waitUntil: 'networkidle0' }); await p.waitForSelector('.tc svg', { timeout: 8000 });
  const nCards = (await p.$$('.tc')).length; const nTables = await p.evaluate(async () => (await (await fetch('/api/admin/data')).json()).tables.length);
  ok('[admin] QR çap səhifəsi: hər masa üçün kart', nCards === nTables && nCards > 0, `${nCards}/${nTables}`);
  if (SNAP) {
    await shot(p, 'admin-print');
    const card = await p.$('.tc'); await p.setViewport({ width: 900, height: 1200, deviceScaleFactor: 2 }); await sleep(300);
    await (await p.$('.tc')).screenshot({ path: 'shots/admin-print-card.png' }); void card;
    await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  }
  // parametrlər
  await p.goto(`${BASE}/admin#/settings`, { waitUntil: 'networkidle0' }); await sleep(800);
  if (SNAP) await shot(p, 'admin-settings');
  ok('[admin] ofisiant keçidi söndürülüb və deaktivdir', await p.$eval('.soon input', (e) => e.disabled && !e.checked));
  const o2 = await overflow(p); ok('[admin] üfüqi daşma yoxdur (parametrlər)', !o2.bad.length, o2.bad.join(';'));
  const ffa = await fontFallbacks(p, ['h1', 'h2', '.fld > span', '.tgl b', '.tgl small', '.tb a span']); ok('[admin] şrift fallback yoxdur', !ffa.length, ffa.join('; '));

  // təmizlik: nümunə vəziyyətini bərpa et
  await p.evaluate(async (o0) => {
    const csrf = (await (await fetch('/api/admin/me')).json()).csrf;
    const h = { 'content-type': 'application/json', 'x-csrf-token': csrf };
    const d = await (await fetch('/api/admin/data')).json();
    const ids = o0.map((n) => d.categories.find((c) => c.name.az === n).id).concat(d.categories.filter((c) => !o0.includes(c.name.az)).map((c) => c.id));
    await fetch('/api/admin/categories/reorder', { method: 'POST', headers: h, body: JSON.stringify({ ids }) });
    for (const it of d.items.filter((i) => i.name.az.startsWith('E2E '))) await fetch(`/api/admin/items/${it.id}`, { method: 'DELETE', headers: { 'x-csrf-token': csrf } });
    const q = d.items.find((i) => i.name.az === 'Göyərtili qutab');
    await fetch(`/api/admin/items/${q.id}`, { method: 'PATCH', headers: h, body: JSON.stringify({ price: 180, available: true }) });
  }, order0);
  ok('[admin] konsol xətası yoxdur', !p.errors.length, p.errors.join(' | '));
  ok('[admin→menyu] müştəri konsol xətası yoxdur', !c.errors.length, c.errors.join(' | '));
  await p.context_.close(); await c.context_.close();
}
fs.rmSync(tmpImg, { force: true });

// admin 360 px
{
  const p = await newPage(b, { width: 360 });
  await p.goto(`${BASE}/admin`, { waitUntil: 'networkidle0' });
  await p.type('[name=username]', user); await p.type('[name=password]', pass); await p.click('button[type=submit]');
  await p.waitForSelector('.adm');
  for (const r of ['items', 'item/1', 'categories', 'features', 'tables', 'settings']) {
    await p.goto(`${BASE}/admin#/${r}`, { waitUntil: 'networkidle0' }); await sleep(400);
    const o = await overflow(p); ok(`[admin 360] daşma yoxdur: ${r}`, o.scrollWidth <= 360 && !o.bad.length, o.bad.join(';'));
  }
  ok('[admin 360] konsol xətası yoxdur', !p.errors.length, p.errors.join(' | '));
  await p.context_.close();
}

await b.close();
console.log(results.join('\n'));
console.log(`\n${results.length - failed}/${results.length} keçdi`);
process.exit(failed ? 1 : 0);
