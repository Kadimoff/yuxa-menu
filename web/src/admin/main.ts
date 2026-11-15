import '../shared/base.css';
import './admin.css';
import { FEATURE_COLORS, ICONS, fold, type L3 } from '../shared/catalog.js';
import { esc, fmtMoney, ic, img } from '../shared/icons.js';

/* ---------- tiplər ---------- */
interface Option { id: string; name: L3; price: number }
interface Item {
  id: number; category_id: number; name: L3; description: L3; ingredients: L3; price: number; portion: string;
  prep_min: number | null; image: string | null; features: string[]; allergens: string[]; variants: Option[]; addons: Option[];
  featured: boolean; visible: boolean; available: boolean; sort: number; updated_at: string;
}
interface Category { id: number; name: L3; note: L3; sort: number; hidden: boolean }
interface Feature { id: number; key: string; name: L3; icon: string; color: string; sort: number }
interface Table { id: number; code: string; name: string; sort: number }
interface DayHours { open: string; close: string; closed: boolean }
interface Settings {
  venue_name: string; tagline: L3; address: L3; phone: string; wifi_name: string; wifi_password: string; instagram: string;
  hours: Record<string, DayHours>; timezone: string; service_percent: number; currency: string; default_theme: 'dark' | 'light';
  accent: string; logo: string | null; hero_image: string | null; public_url: string; sample_notice: boolean; waiter_enabled: boolean;
}
interface Data { items: Item[]; categories: Category[]; features: Feature[]; tables: Table[]; settings: Settings; allergens: Record<string, L3>; icons: string[] }

const app = document.getElementById('app')!;
const html = document.documentElement;
let D: Data;
let csrf = '';
let me = '';
const $ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector(s) as T;
const $$ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => [...r.querySelectorAll(s)] as T[];
const money = (q: number) => fmtMoney(q, D?.settings.currency || '₼');
const toInput = (q: number) => (q / 100).toFixed(2).replace(/\.00$/, '').replace('.', ',');
const parseMoney = (s: string): number | null => {
  const v = Number(s.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(v) && v >= 0 && v < 100000 ? Math.round(v * 100) : null;
};
const L = (o: Partial<L3> = {}): L3 => ({ az: o.az ?? '', en: o.en ?? '', ru: o.ru ?? '' });
const DAYS: [string, string][] = [['mon', 'Bazar ertəsi'], ['tue', 'Çərşənbə axşamı'], ['wed', 'Çərşənbə'], ['thu', 'Cümə axşamı'], ['fri', 'Cümə'], ['sat', 'Şənbə'], ['sun', 'Bazar']];
const ACCENTS: [string, string, string][] = [['violet', '#8b5cf6', '#d946ef'], ['plum', '#7c3aed', '#ec4899'], ['orchid', '#a855f7', '#f472b6'], ['indigo', '#6366f1', '#a855f7'], ['amber', '#8b5cf6', '#f59e0b']];
const ERR: Record<string, string> = {
  bad_credentials: 'İstifadəçi adı və ya parol yanlışdır', rate_limited: 'Çox cəhd oldu. Bir az sonra yenidən yoxlayın',
  name_required: 'Azərbaycanca ad mütləqdir', bad_price: 'Qiymət düzgün deyil', bad_category: 'Kateqoriya seçin',
  bad_type: 'Bu fayl şəkil deyil. JPG, PNG, WEBP və ya HEIC seçin', too_large: 'Şəkil 8 MB-dan böyük olmamalıdır',
  too_small: 'Şəkil çox kiçikdir (ən azı 200 piksel)', category_not_empty: 'Kateqoriyada məhsul var. Əvvəlcə onları köçürün',
  code_exists: 'Bu kodla masa artıq var', bad_code: 'Kod yalnız hərf, rəqəm və tire ola bilər', bad_current: 'Hazırkı parol yanlışdır',
  weak_password: 'Yeni parol ən azı 10 simvol olmalıdır', option_name: 'Variant adı boş ola bilməz', csrf: 'Sessiya köhnəlib, səhifəni yeniləyin',
  unauthorized: 'Yenidən daxil olun', server_error: 'Serverdə xəta baş verdi',
};

/* ---------- API ---------- */
class ApiError extends Error { constructor(public status: number, public code: string) { super(code); } }
async function api<T = unknown>(method: string, url: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (method !== 'GET') headers['x-csrf-token'] = csrf;
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  const r = await fetch(`/api/admin${url}`, { method, headers, body: payload, credentials: 'same-origin' });
  if (r.status === 401 && !url.endsWith('/login')) { renderLogin(); throw new ApiError(401, 'unauthorized'); }
  const j = r.headers.get('content-type')?.includes('json') ? await r.json() : null;
  if (!r.ok) throw new ApiError(r.status, j?.error ?? 'server_error');
  return j as T;
}
const errText = (e: unknown) => (e instanceof ApiError ? ERR[e.code] ?? `Xəta: ${e.code}` : 'Bağlantı xətası');
async function reload() { D = await api<Data>('GET', '/data'); }

/* ---------- toast ---------- */
let tt = 0;
function toast(msg: string, bad = false) {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.append(t); }
  t.textContent = msg; t.classList.toggle('bad', bad); t.classList.add('on');
  clearTimeout(tt); tt = window.setTimeout(() => t.classList.remove('on'), 2200);
}

/* ---------- giriş ---------- */
function renderLogin(msg = '') {
  app.innerHTML = `<div class="login">
    <form class="login-card" id="loginForm" autocomplete="on">
      <div class="lg-mark">${ic('book')}</div>
      <h1>Yuxa idarəetmə</h1>
      <p class="muted">Menyunu, qiymətləri və masaları buradan idarə edin.</p>
      <label class="fld"><span>İstifadəçi adı</span><input name="username" autocomplete="username" autocapitalize="none" required></label>
      <label class="fld"><span>Parol</span><input name="password" type="password" autocomplete="current-password" required></label>
      <p class="err" id="loginErr" role="alert">${esc(msg)}</p>
      <button class="btn btn-grad big" type="submit">Daxil ol</button>
    </form></div>`;
  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target as HTMLFormElement);
    const btn = $('#loginForm button[type=submit]') as HTMLButtonElement; btn.disabled = true;
    try {
      const r = await api<{ csrf: string; username: string }>('POST', '/login', { username: f.get('username'), password: f.get('password') });
      csrf = r.csrf; me = r.username;
      await reload(); route();
    } catch (err) { $('#loginErr').textContent = errText(err); btn.disabled = false; }
  });
}

/* ---------- qabıq və marşrut ---------- */
const TABS: [string, string, string][] = [['items', 'Məhsullar', 'book'], ['categories', 'Kateqoriya', 'grid'], ['features', 'Özəlliklər', 'tag'], ['tables', 'Masalar', 'qr'], ['settings', 'Parametrlər', 'gear']];
function frame(tab: string, title: string, body: string, opts: { back?: string; action?: string } = {}) {
  app.innerHTML = `<div class="adm">
    <header class="ah glass">
      ${opts.back ? `<a class="icon-btn" href="${opts.back}" aria-label="Geri">${ic('back')}</a>` : `<div class="ah-brand"><span class="mk">${esc(D.settings.venue_name.slice(0, 1))}</span></div>`}
      <h1>${esc(title)}</h1>
      <div class="ah-r">${opts.action ?? `<a class="icon-btn" href="/" target="_blank" rel="noopener" aria-label="Menyuya bax" title="Menyuya bax">${ic('external')}</a>`}</div>
    </header>
    ${D.settings.sample_notice && !opts.back ? `<div class="sample-bar">${ic('info')}<span>Bu, <b>nümunə menyudur</b>: yeməklər, qiymətlər və şəkillər dizayn üçündür. Real məhsulları əlavə edin, nümunələri silin. Bildirişi Parametrlərdə söndürə bilərsiniz.</span></div>` : ''}
    <main class="am">${body}</main>
    ${opts.back ? '' : `<nav class="tb glass">${TABS.map(([k, l, i]) => `<a href="#/${k}" class="${k === tab ? 'on' : ''}">${ic(i)}<span>${l}</span></a>`).join('')}</nav>`}
  </div>`;
}

function route() {
  if (!D) return;
  const h = location.hash.replace(/^#\/?/, '') || 'items';
  const [p, a] = h.split('/');
  html.dataset.accent = D.settings.accent || 'violet';
  document.body.classList.toggle('print-mode', p === 'print');
  window.scrollTo(0, 0);
  if (p === 'items') return pageItems();
  if (p === 'item') return pageItem(a === 'new' ? null : Number(a));
  if (p === 'categories') return pageCategories();
  if (p === 'features') return pageFeatures();
  if (p === 'tables') return pageTables();
  if (p === 'print') return pagePrint();
  if (p === 'settings') return pageSettings();
  location.hash = '#/items';
}
window.addEventListener('hashchange', route);

/* ---------- sürüklə-sırala ---------- */
function sortable(list: HTMLElement, onEnd: (ids: number[]) => void) {
  list.addEventListener('pointerdown', (e) => {
    const handle = (e.target as HTMLElement).closest('.grip');
    if (!handle || !list.contains(handle)) return;
    const row = handle.closest<HTMLElement>('[data-sid]')!;
    e.preventDefault();
    row.classList.add('dragging');
    const rowsNow = () => [...list.querySelectorAll<HTMLElement>(':scope > [data-sid]')];
    const before = rowsNow().map((c) => c.dataset.sid).join();
    const move = (ev: PointerEvent) => {
      ev.preventDefault();
      const sibs = rowsNow().filter((x) => x !== row);
      const after = sibs.find((s) => { const r = s.getBoundingClientRect(); return ev.clientY < r.top + r.height / 2; });
      if (after) { if (row.nextElementSibling !== after) list.insertBefore(row, after); } else if (list.lastElementChild !== row) list.append(row);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      row.classList.remove('dragging');
      const ids = rowsNow().map((c) => Number(c.dataset.sid)).filter((n) => Number.isInteger(n) && n > 0);
      if (ids.map(String).join() !== before) onEnd(ids);
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  });
}

/* ---------- Məhsullar ---------- */
let itemFilter = { q: '', cat: 0 };
function pageItems() {
  const cats = D.categories;
  frame('items', 'Məhsullar', `
    <div class="toolbar">
      <label class="search">${ic('search')}<input id="iq" type="search" placeholder="Məhsul axtarın" value="${esc(itemFilter.q)}"></label>
      <div class="fchips" id="catf"><button data-c="0" class="${itemFilter.cat === 0 ? 'on' : ''}">Hamısı <i>${D.items.length}</i></button>${cats.map((c) => `<button data-c="${c.id}" class="${itemFilter.cat === c.id ? 'on' : ''}">${esc(c.name.az)} <i>${D.items.filter((i) => i.category_id === c.id).length}</i></button>`).join('')}</div>
    </div>
    <div id="ilist"></div>
    <a class="fab btn-grad" href="#/item/new">${ic('plus')}<span>Yeni məhsul</span></a>`);
  const draw = () => {
    const q = fold(itemFilter.q.trim());
    const groups = cats.filter((c) => !itemFilter.cat || c.id === itemFilter.cat).map((c) => {
      const its = D.items.filter((i) => i.category_id === c.id && (!q || fold(`${i.name.az} ${i.name.en} ${i.name.ru}`).includes(q)));
      if (!its.length && q) return '';
      return `<section class="grp"><h2>${esc(c.name.az)}${c.hidden ? ' <span class="tag-muted">gizli</span>' : ''}</h2>
        <div class="rows" data-cat="${c.id}">${its.map(itemRow).join('') || '<p class="muted pad">Bu kateqoriyada məhsul yoxdur</p>'}</div></section>`;
    }).join('');
    $('#ilist').innerHTML = groups || '<div class="empty-a"><p>Heç nə tapılmadı</p></div>';
    $$('.rows', $('#ilist')).forEach((r) => { if (!q) sortable(r, async (ids) => { try { await api('POST', '/items/reorder', { ids }); await reload(); toast('Sıra yadda saxlandı'); } catch (e) { toast(errText(e), true); } }); });
  };
  draw();
  $('#iq').addEventListener('input', (e) => { itemFilter.q = (e.target as HTMLInputElement).value; draw(); });
  $('#catf').addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-c]'); if (!b) return; itemFilter.cat = Number(b.dataset.c); pageItems(); });
  $('#ilist').addEventListener('click', onItemListClick);
}
function itemRow(i: Item) {
  return `<div class="row${i.available ? '' : ' na'}${i.visible ? '' : ' hid'}" data-sid="${i.id}">
    <button class="grip" aria-label="Sürüklə">${ic('grip')}</button>
    <a class="row-main" href="#/item/${i.id}">
      <span class="th">${i.image ? `<img src="${img(i.image, 240)}" alt="" loading="lazy">` : ic('image')}</span>
      <span class="row-tx"><b>${esc(i.name.az)}</b><small>${[i.featured ? '★ sevilən' : '', !i.visible ? 'gizli' : '', i.variants.length ? `${i.variants.length} variant` : '', i.portion].filter(Boolean).map(esc).join(', ')}</small></span>
    </a>
    <button class="price-btn" data-price="${i.id}" aria-label="Qiyməti dəyiş">${esc(money(i.price))}</button>
    <label class="sw" title="Mövcuddur"><input type="checkbox" data-avail="${i.id}" ${i.available ? 'checked' : ''}><span></span></label>
  </div>`;
}
async function onItemListClick(e: Event) {
  const t = e.target as HTMLElement;
  const pb = t.closest<HTMLElement>('[data-price]');
  if (pb) {
    const id = Number(pb.dataset.price); const it = D.items.find((x) => x.id === id)!;
    const w = document.createElement('span'); w.className = 'price-edit';
    w.innerHTML = `<input inputmode="decimal" value="${toInput(it.price)}" aria-label="Yeni qiymət"><button aria-label="Yadda saxla">${ic('check')}</button>`;
    pb.replaceWith(w);
    const inp = w.querySelector('input')!; inp.focus(); inp.select();
    const save = async () => {
      const p = parseMoney(inp.value);
      if (p === null) { toast('Qiymət düzgün deyil', true); return; }
      try { await api('PATCH', `/items/${id}`, { price: p }); await reload(); toast(`Qiymət yeniləndi: ${money(p)}`); } catch (er) { toast(errText(er), true); }
      pageItems();
    };
    inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') void save(); if (ev.key === 'Escape') pageItems(); });
    w.querySelector('button')!.addEventListener('click', () => void save());
    return;
  }
  const av = t.closest<HTMLInputElement>('[data-avail]');
  if (av) {
    const id = Number(av.dataset.avail);
    try {
      await api('PATCH', `/items/${id}`, { available: av.checked }); await reload();
      av.closest('.row')?.classList.toggle('na', !av.checked);
      toast(av.checked ? 'Məhsul yenidən mövcuddur' : 'Hal-hazırda yoxdur kimi göstərilir');
    } catch (er) { av.checked = !av.checked; toast(errText(er), true); }
  }
}

/* ---------- Məhsul redaktoru ---------- */
function langTabs(id: string) {
  return `<div class="seg ltabs" data-ltabs="${id}"><button type="button" data-l="az" class="on">AZ</button><button type="button" data-l="en">EN</button><button type="button" data-l="ru">RU</button></div>`;
}
function l3Fields(name: string, label: string, v: L3, area = false, ph = '') {
  return ['az', 'en', 'ru'].map((l) => `<label class="fld" data-lang="${l}" ${l === 'az' ? '' : 'hidden'}><span>${label} <em>${l.toUpperCase()}</em>${l !== 'az' ? ' <small>boş qalsa AZ göstərilir</small>' : ''}</span>
    ${area ? `<textarea name="${name}.${l}" rows="3" placeholder="${esc(ph)}">${esc(v[l as keyof L3])}</textarea>` : `<input name="${name}.${l}" value="${esc(v[l as keyof L3])}" placeholder="${esc(ph)}">`}</label>`).join('');
}
function optRow(kind: 'v' | 'a', o: Option) {
  return `<div class="optrow" data-kind="${kind}" data-oid="${esc(o.id)}">
    <input class="o-az" placeholder="${kind === 'v' ? 'Məs. Böyük porsiya' : 'Məs. Əlavə pendir'}" value="${esc(o.name.az)}" aria-label="Ad AZ">
    <label class="o-price"><input inputmode="decimal" value="${o.price || o.name.az ? toInput(o.price) : ''}" placeholder="0" aria-label="Qiymət"><span>₼</span></label>
    <button type="button" class="icon-btn sm" data-rm aria-label="Sil">${ic('close')}</button>
    <input class="o-en" placeholder="EN" value="${esc(o.name.en)}" aria-label="Ad EN"><input class="o-ru" placeholder="RU" value="${esc(o.name.ru)}" aria-label="Ad RU">
  </div>`;
}
function pageItem(id: number | null) {
  const it: Item = id ? D.items.find((x) => x.id === id)! : {
    id: 0, category_id: itemFilter.cat || D.categories[0]?.id || 0, name: L(), description: L(), ingredients: L(), price: 0, portion: '', prep_min: null,
    image: null, features: [], allergens: [], variants: [], addons: [], featured: false, visible: true, available: true, sort: 0, updated_at: '',
  };
  if (id && !it) { location.hash = '#/items'; return; }
  let image = it.image;
  frame('items', id ? 'Məhsulu redaktə et' : 'Yeni məhsul', `
    <form id="itf" class="form" novalidate>
      <section class="card">
        <div class="photo" id="photo">${photoInner(image)}</div>
        <input type="file" id="file" accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif" hidden>
      </section>
      <section class="card">
        <div class="card-h"><h2>Ad və təsvir</h2>${langTabs('t')}</div>
        ${l3Fields('name', 'Ad', it.name, false, 'Məs. Göyərtili qutab')}
        ${l3Fields('description', 'Qısa təsvir', it.description, true, 'Menyuda adın altında görünür')}
        ${l3Fields('ingredients', 'Tərkibi', it.ingredients, true, 'Məhsul pəncərəsində görünür')}
      </section>
      <section class="card grid2">
        <label class="fld"><span>Qiymət, ₼</span><input name="price" inputmode="decimal" value="${it.price ? toInput(it.price) : ''}" placeholder="0" ${it.variants.length ? 'disabled' : ''}></label>
        <label class="fld"><span>Porsiya</span><input name="portion" value="${esc(it.portion)}" placeholder="250 q, 1 əd, 300 ml"></label>
        <label class="fld"><span>Hazırlanma, dəq</span><input name="prep_min" inputmode="numeric" value="${it.prep_min ?? ''}" placeholder="15"></label>
        <label class="fld"><span>Kateqoriya</span><select name="category_id">${D.categories.map((c) => `<option value="${c.id}" ${c.id === it.category_id ? 'selected' : ''}>${esc(c.name.az)}</option>`).join('')}</select></label>
        ${it.variants.length ? '<p class="muted small span2">Variant olduqda əsas qiymət birinci variantın qiymətidir.</p>' : ''}
      </section>
      <section class="card">
        <div class="card-h"><h2>Görünüş</h2></div>
        <label class="tgl"><span><b>Mövcuddur</b><small>Söndürsəniz menyuda "Hal-hazırda yoxdur" yazılır, səbətə əlavə olunmur</small></span><span class="sw"><input type="checkbox" name="available" ${it.available ? 'checked' : ''}><span></span></span></label>
        <label class="tgl"><span><b>Ən çox sevilənlər</b><small>Menyunun yuxarısındakı şəkilli siyahıda göstərilir</small></span><span class="sw"><input type="checkbox" name="featured" ${it.featured ? 'checked' : ''}><span></span></span></label>
        <label class="tgl"><span><b>Menyuda görünür</b><small>Gizli məhsullar yalnız burada qalır</small></span><span class="sw"><input type="checkbox" name="visible" ${it.visible ? 'checked' : ''}><span></span></span></label>
      </section>
      <section class="card">
        <div class="card-h"><h2>Özəlliklər</h2><a class="link" href="#/features">İdarə et</a></div>
        <div class="pick" id="feats">${D.features.map((f) => `<button type="button" class="pk${it.features.includes(f.key) ? ' on' : ''}" data-f="${esc(f.key)}" style="--c:${esc(f.color)}">${ic(f.icon)}${esc(f.name.az)}</button>`).join('')}</div>
      </section>
      <section class="card">
        <div class="card-h"><h2>Allergenlər</h2></div>
        <div class="pick" id="algs">${Object.entries(D.allergens).map(([k, v]) => `<button type="button" class="pk plain${it.allergens.includes(k) ? ' on' : ''}" data-a="${k}">${esc(v.az)}</button>`).join('')}</div>
      </section>
      <section class="card">
        <div class="card-h"><h2>Variantlar</h2><button type="button" class="link" data-addopt="v">${ic('plus')}Əlavə et</button></div>
        <p class="muted small">Məsələn kiçik və böyük porsiya. Hər birinin öz qiyməti olur, müştəri birini seçir.</p>
        <div class="opts" id="ov">${it.variants.map((o) => optRow('v', o)).join('')}</div>
      </section>
      <section class="card">
        <div class="card-h"><h2>Əlavələr</h2><button type="button" class="link" data-addopt="a">${ic('plus')}Əlavə et</button></div>
        <p class="muted small">Müştəri istəsə seçir, qiymət üstünə gəlir.</p>
        <div class="opts" id="oa">${it.addons.map((o) => optRow('a', o)).join('')}</div>
      </section>
      ${id ? `<button type="button" class="btn danger-btn" id="del">${ic('trash')}Məhsulu sil</button>` : ''}
      <div class="savebar"><button type="submit" class="btn btn-grad big" id="save">${ic('check')}Yadda saxla</button></div>
    </form>`, { back: '#/items', action: id ? `<a class="icon-btn" href="/#item-${id}" target="_blank" rel="noopener" aria-label="Menyuda bax">${ic('external')}</a>` : '' });

  const form = $('#itf') as HTMLFormElement;
  bindLangTabs(form);
  const photo = $('#photo'); const file = $('#file') as HTMLInputElement;
  photo.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('[data-rmimg]')) { image = null; photo.innerHTML = photoInner(null); return; }
    file.click();
  });
  file.addEventListener('change', async () => {
    const f = file.files?.[0]; if (!f) return;
    photo.classList.add('busy'); photo.innerHTML = `<div class="ph-empty"><span class="spin"></span><b>Şəkil hazırlanır…</b></div>`;
    try {
      const fd = new FormData(); fd.append('file', f);
      const r = await api<{ id: string }>('POST', '/upload', fd);
      image = r.id; photo.innerHTML = photoInner(image); toast('Şəkil yükləndi');
    } catch (e) { photo.innerHTML = photoInner(image); toast(errText(e), true); }
    photo.classList.remove('busy'); file.value = '';
  });
  $('#feats').addEventListener('click', (e) => (e.target as HTMLElement).closest('.pk')?.classList.toggle('on'));
  $('#algs').addEventListener('click', (e) => (e.target as HTMLElement).closest('.pk')?.classList.toggle('on'));
  form.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const add = t.closest<HTMLElement>('[data-addopt]');
    if (add) {
      const k = add.dataset.addopt as 'v' | 'a';
      $(k === 'v' ? '#ov' : '#oa').insertAdjacentHTML('beforeend', optRow(k, { id: `o${Date.now().toString(36)}`, name: L(), price: 0 }));
      ($$(`#${k === 'v' ? 'ov' : 'oa'} .o-az`).pop() as HTMLInputElement).focus();
      syncPrice(); return;
    }
    if (t.closest('[data-rm]')) { t.closest('.optrow')?.remove(); syncPrice(); }
  });
  const syncPrice = () => { (form.elements.namedItem('price') as HTMLInputElement).disabled = $$('#ov .optrow').length > 0; };
  $('#del')?.addEventListener('click', async () => {
    if (!confirm(`"${it.name.az}" silinsin?`)) return;
    try { await api('DELETE', `/items/${id}`); await reload(); toast('Məhsul silindi'); location.hash = '#/items'; } catch (e) { toast(errText(e), true); }
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const g = (n: string) => (form.elements.namedItem(n) as HTMLInputElement | null)?.value ?? '';
    const l3v = (n: string): L3 => ({ az: g(`${n}.az`), en: g(`${n}.en`), ru: g(`${n}.ru`) });
    const opts = (sel: string): Option[] | null => {
      const out: Option[] = [];
      for (const r of $$(sel)) {
        const az = (r.querySelector('.o-az') as HTMLInputElement).value.trim();
        const pr = parseMoney((r.querySelector('.o-price input') as HTMLInputElement).value || '0');
        if (!az) continue;
        if (pr === null) { toast(`"${az}" üçün qiymət düzgün deyil`, true); return null; }
        out.push({ id: r.dataset.oid!, price: pr, name: { az, en: (r.querySelector('.o-en') as HTMLInputElement).value, ru: (r.querySelector('.o-ru') as HTMLInputElement).value } });
      }
      return out;
    };
    const variants = opts('#ov .optrow'); const addons = opts('#oa .optrow');
    if (!variants || !addons) return;
    const price = variants.length ? variants[0].price : parseMoney(g('price'));
    if (!l3v('name').az.trim()) { toast(ERR.name_required, true); ($('[name="name.az"]') as HTMLInputElement).focus(); return; }
    if (price === null || g('price') === '' && !variants.length) { toast('Qiyməti yazın', true); ($('[name=price]') as HTMLInputElement).focus(); return; }
    const chk = (n: string) => (form.elements.namedItem(n) as HTMLInputElement).checked;
    const body = {
      category_id: Number(g('category_id')), name: l3v('name'), description: l3v('description'), ingredients: l3v('ingredients'),
      price, portion: g('portion'), prep_min: g('prep_min') ? Number(g('prep_min')) : null, image,
      features: $$('#feats .pk.on').map((b) => b.dataset.f), allergens: $$('#algs .pk.on').map((b) => b.dataset.a),
      variants, addons, available: chk('available'), featured: chk('featured'), visible: chk('visible'),
    };
    const btn = $('#save') as HTMLButtonElement; btn.disabled = true;
    try {
      const r = await api<Item>(id ? 'PUT' : 'POST', id ? `/items/${id}` : '/items', body);
      await reload(); toast(id ? 'Dəyişikliklər yadda saxlandı' : 'Məhsul yaradıldı');
      itemFilter.cat = 0;
      location.hash = '#/items';
      void r;
    } catch (er) { toast(errText(er), true); btn.disabled = false; }
  });
}
function photoInner(id: string | null) {
  return id ? `<img src="${img(id, 720)}" alt=""><div class="ph-act"><span class="chip-btn">${ic('image')}Dəyiş</span><button type="button" class="chip-btn" data-rmimg>${ic('trash')}Sil</button></div>`
    : `<div class="ph-empty">${ic('image')}<b>Foto əlavə edin</b><small>JPG, PNG, WEBP və ya HEIC, 8 MB-a qədər. Avtomatik kiçildilir.</small></div>`;
}
function bindLangTabs(root: HTMLElement) {
  root.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-ltabs] [data-l]'); if (!b) return;
    const card = b.closest('.card, .modal')!; const l = b.dataset.l!;
    $$('[data-l]', b.parentElement!).forEach((x) => x.classList.toggle('on', x === b));
    $$('.fld[data-lang]', card).forEach((f) => { f.hidden = f.dataset.lang !== l; });
  });
}

/* ---------- modal ---------- */
function modal(title: string, body: string, onSave: (root: HTMLElement) => Promise<boolean | void>, extra = '') {
  const m = document.createElement('div'); m.className = 'mwrap';
  m.innerHTML = `<div class="mscrim"></div><form class="modal" novalidate><div class="m-h"><h2>${esc(title)}</h2><button type="button" class="icon-btn" data-x aria-label="Bağla">${ic('close')}</button></div>
    <div class="m-b">${body}</div><div class="m-f">${extra}<button type="submit" class="btn btn-grad big">${ic('check')}Yadda saxla</button></div></form>`;
  document.body.append(m); html.classList.add('lock');
  requestAnimationFrame(() => m.classList.add('open'));
  const close = () => { m.remove(); html.classList.remove('lock'); };
  m.querySelector('.mscrim')!.addEventListener('click', close);
  m.querySelector('[data-x]')!.addEventListener('click', close);
  const f = m.querySelector('form')!;
  bindLangTabs(f);
  f.addEventListener('submit', async (e) => { e.preventDefault(); try { if ((await onSave(f)) !== false) close(); } catch (er) { toast(errText(er), true); } });
  return { root: f, close };
}
const val = (root: HTMLElement, n: string) => (root.querySelector(`[name="${n}"]`) as HTMLInputElement | null)?.value ?? '';
const l3Of = (root: HTMLElement, n: string): L3 => ({ az: val(root, `${n}.az`), en: val(root, `${n}.en`), ru: val(root, `${n}.ru`) });

/* ---------- Kateqoriyalar ---------- */
function pageCategories() {
  frame('categories', 'Kateqoriyalar', `
    <p class="muted lead-a">Sıranı dəyişmək üçün solundakı tutacaqdan sürükləyin. Menyudakı tablar bu sıra ilə düzülür.</p>
    <div class="rows card flush" id="clist">${D.categories.map((c) => {
      const n = D.items.filter((i) => i.category_id === c.id).length;
      return `<div class="row${c.hidden ? ' hid' : ''}" data-sid="${c.id}"><button class="grip" aria-label="Sürüklə">${ic('grip')}</button>
        <button class="row-main" data-edit="${c.id}"><span class="row-tx"><b>${esc(c.name.az)}</b><small>${n} məhsul${c.name.en ? `, ${esc(c.name.en)}` : ''}${c.name.ru ? `, ${esc(c.name.ru)}` : ''}</small></span></button>
        <button class="icon-btn" data-hide="${c.id}" aria-label="${c.hidden ? 'Göstər' : 'Gizlət'}" title="${c.hidden ? 'Gizlidir' : 'Görünür'}">${ic(c.hidden ? 'eyeoff' : 'eye')}</button></div>`;
    }).join('')}</div>
    <button class="fab btn-grad" id="addCat">${ic('plus')}<span>Yeni kateqoriya</span></button>`);
  sortable($('#clist'), async (ids) => { try { await api('POST', '/categories/reorder', { ids }); await reload(); toast('Sıra yadda saxlandı'); } catch (e) { toast(errText(e), true); } });
  const edit = (c: Category | null) => {
    const v = c ?? { id: 0, name: L(), note: L(), sort: 0, hidden: false };
    modal(c ? 'Kateqoriyanı redaktə et' : 'Yeni kateqoriya', `<div class="card-h tight">${langTabs('c')}</div>
      ${l3Fields('name', 'Ad', v.name, false, 'Məs. Şorbalar')}${l3Fields('note', 'Qısa qeyd', v.note, true, 'Başlığın altında görünür (istəyə görə)')}
      <label class="tgl"><span><b>Gizli</b><small>Menyuda göstərilmir</small></span><span class="sw"><input type="checkbox" name="hidden" ${v.hidden ? 'checked' : ''}><span></span></span></label>`,
    async (root) => {
      const body = { name: l3Of(root, 'name'), note: l3Of(root, 'note'), hidden: (root.querySelector('[name=hidden]') as HTMLInputElement).checked };
      await api(c ? 'PUT' : 'POST', c ? `/categories/${c.id}` : '/categories', body);
      await reload(); toast('Yadda saxlandı'); pageCategories();
    }, c ? `<button type="button" class="btn ghost" id="delCat">${ic('trash')}Sil</button>` : '');
    $('#delCat')?.addEventListener('click', async () => {
      if (!confirm('Kateqoriya silinsin?')) return;
      try { await api('DELETE', `/categories/${c!.id}`); await reload(); $('.mwrap')?.remove(); html.classList.remove('lock'); toast('Silindi'); pageCategories(); } catch (e) { toast(errText(e), true); }
    });
  };
  $('#addCat').addEventListener('click', () => edit(null));
  $('#clist').addEventListener('click', async (e) => {
    const t = e.target as HTMLElement;
    const ed = t.closest<HTMLElement>('[data-edit]'); if (ed) { edit(D.categories.find((c) => c.id === Number(ed.dataset.edit))!); return; }
    const hd = t.closest<HTMLElement>('[data-hide]');
    if (hd) {
      const c = D.categories.find((x) => x.id === Number(hd.dataset.hide))!;
      try { await api('PUT', `/categories/${c.id}`, { ...c, hidden: !c.hidden }); await reload(); toast(c.hidden ? 'Kateqoriya görünür' : 'Kateqoriya gizlədildi'); pageCategories(); } catch (er) { toast(errText(er), true); }
    }
  });
}

/* ---------- Özəlliklər ---------- */
function pageFeatures() {
  frame('features', 'Özəlliklər', `
    <p class="muted lead-a">Məhsulların yanında görünən nişanlar: vegetarian, acılı, yeni və s. Hər biri üçün ikon və rəng seçin.</p>
    <div class="rows card flush" id="flist">${D.features.map((f) => {
      const n = D.items.filter((i) => i.features.includes(f.key)).length;
      return `<div class="row" data-fid="${f.id}"><button class="row-main" data-edit="${f.id}">
        <span class="fbadge" style="--c:${esc(f.color)}">${ic(f.icon)}</span>
        <span class="row-tx"><b>${esc(f.name.az)}</b><small>${n} məhsulda${f.name.en ? `, ${esc(f.name.en)}` : ''}${f.name.ru ? `, ${esc(f.name.ru)}` : ''}</small></span></button>
        <span class="chev">${ic('edit')}</span></div>`;
    }).join('')}</div>
    <button class="fab btn-grad" id="addF">${ic('plus')}<span>Yeni özəllik</span></button>`);
  const edit = (f: Feature | null) => {
    const v = f ?? { id: 0, key: '', name: L(), icon: 'star', color: FEATURE_COLORS[3], sort: 0 };
    modal(f ? 'Özəlliyi redaktə et' : 'Yeni özəllik', `<div class="card-h tight">${langTabs('f')}</div>${l3Fields('name', 'Ad', v.name, false, 'Məs. Uşaqlar üçün')}
      <div class="fld"><span>İkon</span><div class="icons" id="icPick">${Object.keys(ICONS).map((k) => `<button type="button" data-ic="${k}" class="${k === v.icon ? 'on' : ''}" aria-label="${k}">${ic(k)}</button>`).join('')}</div></div>
      <div class="fld"><span>Rəng</span><div class="colors" id="coPick">${FEATURE_COLORS.map((c) => `<button type="button" data-co="${c}" class="${c === v.color ? 'on' : ''}" style="--c:${c}" aria-label="${c}"></button>`).join('')}</div></div>
      <div class="fld"><span>Görünüşü</span><div class="preview-chip" id="fprev"></div></div>`,
    async (root) => {
      const body = { name: l3Of(root, 'name'), icon: $('#icPick .on', root)?.dataset.ic ?? 'star', color: $('#coPick .on', root)?.dataset.co ?? FEATURE_COLORS[0] };
      await api(f ? 'PUT' : 'POST', f ? `/features/${f.id}` : '/features', body);
      await reload(); toast('Yadda saxlandı'); pageFeatures();
    }, f ? `<button type="button" class="btn ghost" id="delF">${ic('trash')}Sil</button>` : '');
    const prev = () => {
      const i = $('#icPick .on')?.dataset.ic ?? 'star'; const c = $('#coPick .on')?.dataset.co ?? '#c4b5fd';
      $('#fprev').innerHTML = `<span class="chip" style="--c:${c}">${ic(i)}<span>${esc(val($('.modal'), 'name.az') || 'Özəllik')}</span></span>`;
    };
    prev();
    $('.modal').addEventListener('input', prev);
    $('#icPick').addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest('button'); if (!b) return; $$('#icPick button').forEach((x) => x.classList.toggle('on', x === b)); prev(); });
    $('#coPick').addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest('button'); if (!b) return; $$('#coPick button').forEach((x) => x.classList.toggle('on', x === b)); prev(); });
    $('#delF')?.addEventListener('click', async () => {
      if (!confirm('Özəllik silinsin? Məhsullardan da götürüləcək.')) return;
      try { await api('DELETE', `/features/${f!.id}`); await reload(); $('.mwrap')?.remove(); html.classList.remove('lock'); toast('Silindi'); pageFeatures(); } catch (e) { toast(errText(e), true); }
    });
  };
  $('#addF').addEventListener('click', () => edit(null));
  $('#flist').addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-edit]'); if (b) edit(D.features.find((f) => f.id === Number(b.dataset.edit))!); });
}

/* ---------- Masalar və QR ---------- */
function pageTables() {
  const base = D.settings.public_url;
  frame('tables', 'Masalar və QR', `
    <section class="card qr-hero">
      <div><h2>Stol kartları</h2><p class="muted small">Hər masa üçün ayrıca QR. Müştəri oxudanda menyu həmin masa nömrəsi ilə açılır.</p></div>
      <a class="btn btn-grad" href="#/print">${ic('print')}Çap səhifəsi</a>
    </section>
    <section class="card bulk">
      <label class="fld"><span>Masa sayı</span><input id="bulkN" inputmode="numeric" value="${D.tables.length || 10}"></label>
      <button class="btn ghost" id="bulk">1-dən bu saya qədər yarat</button>
    </section>
    <div class="tgrid" id="tlist">${D.tables.map((t) => `<div class="tcard" data-tid="${t.id}">
      <img class="tqr" src="/api/admin/tables/${t.id}/qr.svg" alt="QR ${esc(t.name)}" loading="lazy">
      <div class="tmeta"><b>${esc(t.name)}</b><small>${esc(base.replace(/^https?:\/\//, ''))}/m/${esc(t.code)}</small></div>
      <div class="tact"><a class="chip-btn" href="/api/admin/tables/${t.id}/qr.png?download" download>${ic('download')}PNG</a><a class="chip-btn" href="/api/admin/tables/${t.id}/qr.svg?download" download>${ic('download')}SVG</a><button class="icon-btn sm" data-tedit="${t.id}" aria-label="Redaktə">${ic('edit')}</button></div>
    </div>`).join('')}</div>
    <button class="fab btn-grad" id="addT">${ic('plus')}<span>Yeni masa</span></button>`);
  $('#bulk').addEventListener('click', async () => {
    const n = Number(($('#bulkN') as HTMLInputElement).value);
    if (!Number.isInteger(n) || n < 1 || n > 200) { toast('1 ilə 200 arası say yazın', true); return; }
    try { await api('POST', '/tables', { count: n }); await reload(); toast('Masalar hazırdır'); pageTables(); } catch (e) { toast(errText(e), true); }
  });
  const edit = (t: Table | null) => {
    modal(t ? 'Masanı redaktə et' : 'Yeni masa', `<label class="fld"><span>Ad</span><input name="name" value="${esc(t?.name ?? '')}" placeholder="Məs. Teras 3"></label>
      <label class="fld"><span>Kod (linkdə görünür)</span><input name="code" value="${esc(t?.code ?? '')}" placeholder="Məs. t3" autocapitalize="none"></label>
      <p class="muted small">Kod dəyişsə, köhnə QR artıq bu masanı göstərməyəcək.</p>`,
    async (root) => {
      await api(t ? 'PUT' : 'POST', t ? `/tables/${t.id}` : '/tables', { name: val(root, 'name'), code: val(root, 'code') });
      await reload(); toast('Yadda saxlandı'); pageTables();
    }, t ? `<button type="button" class="btn ghost" id="delT">${ic('trash')}Sil</button>` : '');
    $('#delT')?.addEventListener('click', async () => {
      if (!confirm('Masa silinsin?')) return;
      try { await api('DELETE', `/tables/${t!.id}`); await reload(); $('.mwrap')?.remove(); html.classList.remove('lock'); toast('Silindi'); pageTables(); } catch (e) { toast(errText(e), true); }
    });
  };
  $('#addT').addEventListener('click', () => edit(null));
  $('#tlist').addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-tedit]'); if (b) edit(D.tables.find((t) => t.id === Number(b.dataset.tedit))!); });
}

/* ---------- Çap səhifəsi ---------- */
let printStyle: 'dark' | 'light' = 'dark';
async function pagePrint() {
  const s = D.settings;
  app.innerHTML = `<div class="print-bar glass"><a class="icon-btn" href="#/tables" aria-label="Geri">${ic('back')}</a><b>Stol kartları</b>
      <div class="seg" id="pstyle"><button data-s="dark" class="${printStyle === 'dark' ? 'on' : ''}">Tünd</button><button data-s="light" class="${printStyle === 'light' ? 'on' : ''}">Açıq</button></div>
      <button class="btn btn-grad" id="doPrint">${ic('print')}Çap et</button></div>
    <div class="sheets ${printStyle}" id="sheets"><p class="muted pad">QR kodlar hazırlanır…</p></div>`;
  $('#doPrint').addEventListener('click', () => window.print());
  $('#pstyle').addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-s]'); if (!b) return; printStyle = b.dataset.s as 'dark' | 'light'; void pagePrint(); });
  const svgs = await Promise.all(D.tables.map((t) => fetch(`/api/admin/tables/${t.id}/qr.svg`, { credentials: 'same-origin' }).then((r) => r.text())));
  const host = s.public_url.replace(/^https?:\/\//, '');
  const cards = D.tables.map((t, i) => `<article class="tc">
      <div class="tc-glow"></div>
      <header class="tc-h"><span class="tc-mk">${s.logo ? `<img src="${img(s.logo, 240)}" alt="">` : esc(s.venue_name.slice(0, 1))}</span><b>${esc(s.venue_name)}</b></header>
      <div class="tc-main"><p class="tc-k">Menyuya baxın</p><p class="tc-s">Kameranı QR koda tutun</p>
        <div class="tc-qr">${svgs[i].replace(/<\?xml[^>]*>/, '')}</div></div>
      <footer class="tc-f"><span class="tc-t"><small>Masa</small><b>${esc(t.name.replace(/^Masa\s*/i, ''))}</b></span><span class="tc-u">${esc(host)}</span></footer>
    </article>`);
  const pages: string[] = [];
  for (let i = 0; i < cards.length; i += 4) pages.push(`<section class="a4">${cards.slice(i, i + 4).join('')}</section>`);
  $('#sheets').innerHTML = pages.join('') || '<p class="muted pad">Əvvəlcə masa əlavə edin</p>';
}

/* ---------- Parametrlər ---------- */
function pageSettings() {
  const s = D.settings;
  let logo = s.logo, hero = s.hero_image;
  frame('settings', 'Parametrlər', `
    <form id="sf" class="form" novalidate>
      <section class="card">
        <div class="card-h"><h2>Məkan</h2>${langTabs('s')}</div>
        <label class="fld"><span>Məkanın adı</span><input name="venue_name" value="${esc(s.venue_name)}" maxlength="60"></label>
        ${l3Fields('tagline', 'Qısa təsvir', s.tagline, true)}
        ${l3Fields('address', 'Ünvan', s.address)}
        <div class="grid2">
          <label class="fld"><span>Telefon</span><input name="phone" value="${esc(s.phone)}" inputmode="tel"></label>
          <label class="fld"><span>Instagram</span><input name="instagram" value="${esc(s.instagram)}" placeholder="@yuxa"></label>
          <label class="fld"><span>Wi-Fi adı</span><input name="wifi_name" value="${esc(s.wifi_name)}"></label>
          <label class="fld"><span>Wi-Fi parolu</span><input name="wifi_password" value="${esc(s.wifi_password)}" autocomplete="off"></label>
        </div>
        <label class="fld"><span>Saytın ünvanı (QR üçün)</span><input name="public_url" value="${esc(s.public_url)}" inputmode="url"></label>
      </section>
      <section class="card">
        <div class="card-h"><h2>Görünüş</h2></div>
        <div class="imgs2">
          <div class="fld"><span>Loqo</span><div class="photo sm" id="logoBox">${miniPhoto(logo)}</div></div>
          <div class="fld"><span>Örtük şəkli</span><div class="photo sm wide" id="heroBox">${miniPhoto(hero)}</div></div>
        </div>
        <input type="file" id="sfile" accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif" hidden>
        <div class="fld"><span>Standart tema</span><div class="seg" id="dtheme"><button type="button" data-v="dark" class="${s.default_theme === 'dark' ? 'on' : ''}">${ic('moon')}Tünd</button><button type="button" data-v="light" class="${s.default_theme === 'light' ? 'on' : ''}">${ic('sun')}Açıq</button></div></div>
        <div class="fld"><span>Aksent rəngi</span><div class="accents" id="acc">${ACCENTS.map(([k, a, b]) => `<button type="button" data-v="${k}" class="${s.accent === k ? 'on' : ''}" style="--x:${a};--y:${b}" aria-label="${k}"></button>`).join('')}</div></div>
        <label class="tgl"><span><b>Nümunə menyu bildirişi</b><small>Real menyu hazır olanda söndürün</small></span><span class="sw"><input type="checkbox" name="sample_notice" ${s.sample_notice ? 'checked' : ''}><span></span></span></label>
      </section>
      <section class="card">
        <div class="card-h"><h2>İş saatları</h2></div>
        <p class="muted small">Menyuda "Açıqdır" və ya "Bağlıdır" bu saatlara görə avtomatik yazılır. Gecə yarısından sonra bağlanırsa, bağlanma saatını kiçik yazın (məs. 02:00).</p>
        <div class="hours-a">${DAYS.map(([k, l]) => { const h = s.hours[k]; return `<div class="hr${h.closed ? ' off' : ''}" data-day="${k}"><b>${l}</b>
          <input type="time" name="h.${k}.open" value="${h.open}" aria-label="${l} açılış"><input type="time" name="h.${k}.close" value="${h.close}" aria-label="${l} bağlanış">
          <label class="sw" title="Açıqdır"><input type="checkbox" name="h.${k}.on" ${h.closed ? '' : 'checked'}><span></span></label></div>`; }).join('')}</div>
      </section>
      <section class="card grid2">
        <label class="fld"><span>Xidmət haqqı, %</span><input name="service_percent" inputmode="decimal" value="${s.service_percent}"></label>
        <label class="fld"><span>Valyuta</span><input name="currency" value="${esc(s.currency)}" maxlength="4"></label>
      </section>
      <section class="card soon">
        <label class="tgl"><span><b>Ofisiant funksiyaları <i class="soon-tag">tezliklə</i></b><small>Sifarişi masadan birbaşa göndərmək, ofisiantı çağırmaq və ofisiant paneli. Növbəti mərhələdə aktiv olacaq.</small></span><span class="sw"><input type="checkbox" disabled><span></span></span></label>
      </section>
      <div class="savebar"><button type="submit" class="btn btn-grad big">${ic('check')}Yadda saxla</button></div>
    </form>
    <section class="card" id="pwCard">
      <div class="card-h"><h2>Şifrəni dəyiş</h2></div>
      <form id="pwf" class="form tight" novalidate>
        <input type="text" name="username" value="${esc(me)}" autocomplete="username" hidden>
        <label class="fld"><span>Hazırkı parol</span><input type="password" name="current" autocomplete="current-password"></label>
        <label class="fld"><span>Yeni parol (ən azı 10 simvol)</span><input type="password" name="next" autocomplete="new-password"></label>
        <button class="btn ghost" type="submit">Parolu yenilə</button>
      </form>
    </section>
    <section class="card">
      <div class="card-h"><h2>Ehtiyat nüsxə</h2></div>
      <p class="muted small">Baza və bütün şəkillər bir zip faylında. Server hər gecə avtomatik nüsxə də saxlayır.</p>
      <a class="btn ghost" href="/api/admin/backup" download>${ic('download')}İndi yüklə</a>
      <div id="bks" class="bks"></div>
    </section>
    <section class="card">
      <div class="card-h"><h2>Son dəyişikliklər</h2></div>
      <div id="audit" class="audit"><p class="muted small">Yüklənir…</p></div>
    </section>
    <button class="btn ghost wide" id="logout">${ic('logout')}Çıxış</button>`);

  const form = $('#sf') as HTMLFormElement;
  bindLangTabs(form);
  let target: 'logo' | 'hero' = 'hero';
  const sfile = $('#sfile') as HTMLInputElement;
  const pick = (t: 'logo' | 'hero') => (e: Event) => {
    if ((e.target as HTMLElement).closest('[data-rmimg]')) { if (t === 'logo') logo = null; else hero = null; $(t === 'logo' ? '#logoBox' : '#heroBox').innerHTML = miniPhoto(null); return; }
    target = t; sfile.click();
  };
  $('#logoBox').addEventListener('click', pick('logo'));
  $('#heroBox').addEventListener('click', pick('hero'));
  sfile.addEventListener('change', async () => {
    const f = sfile.files?.[0]; if (!f) return;
    const box = $(target === 'logo' ? '#logoBox' : '#heroBox'); box.innerHTML = '<div class="ph-empty"><span class="spin"></span></div>';
    try { const fd = new FormData(); fd.append('file', f); const r = await api<{ id: string }>('POST', '/upload', fd); if (target === 'logo') logo = r.id; else hero = r.id; box.innerHTML = miniPhoto(r.id); toast('Şəkil yükləndi. Yadda saxlamağı unutmayın'); } catch (e) { box.innerHTML = miniPhoto(target === 'logo' ? logo : hero); toast(errText(e), true); }
    sfile.value = '';
  });
  const segPick = (sel: string) => $(sel).addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest('button'); if (!b) return; $$(`${sel} button`).forEach((x) => x.classList.toggle('on', x === b)); });
  segPick('#dtheme'); segPick('#acc');
  $('#acc').addEventListener('click', () => { html.dataset.accent = $('#acc .on')?.dataset.v ?? 'violet'; });
  form.addEventListener('change', (e) => { const t = e.target as HTMLInputElement; if (t.name?.endsWith('.on')) t.closest('.hr')?.classList.toggle('off', !t.checked); });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const g = (n: string) => (form.elements.namedItem(n) as HTMLInputElement).value;
    const hours: Record<string, DayHours> = {};
    for (const [k] of DAYS) hours[k] = { open: g(`h.${k}.open`), close: g(`h.${k}.close`), closed: !(form.elements.namedItem(`h.${k}.on`) as HTMLInputElement).checked };
    const sp = Number(g('service_percent').replace(',', '.'));
    if (!Number.isFinite(sp) || sp < 0 || sp > 30) { toast('Xidmət haqqı 0 ilə 30 arası olmalıdır', true); return; }
    const body = {
      venue_name: g('venue_name'), tagline: l3Of(form, 'tagline'), address: l3Of(form, 'address'), phone: g('phone'), instagram: g('instagram'),
      wifi_name: g('wifi_name'), wifi_password: g('wifi_password'), public_url: g('public_url'), service_percent: sp, currency: g('currency'),
      default_theme: $('#dtheme .on')?.dataset.v, accent: $('#acc .on')?.dataset.v, logo, hero_image: hero, hours,
      sample_notice: (form.elements.namedItem('sample_notice') as HTMLInputElement).checked,
    };
    try { await api('PUT', '/settings', body); await reload(); toast('Parametrlər yadda saxlandı'); pageSettings(); } catch (er) { toast(errText(er), true); }
  });
  $('#pwf').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.target as HTMLFormElement;
    try { await api('POST', '/password', { current: val(f, 'current'), next: val(f, 'next') }); f.reset(); toast('Parol yeniləndi. Digər cihazlardan çıxış edildi'); } catch (er) { toast(errText(er), true); }
  });
  $('#logout').addEventListener('click', async () => { try { await api('POST', '/logout'); } catch { /* */ } csrf = ''; renderLogin(); });
  void (async () => {
    try {
      const [b, a] = await Promise.all([api<{ file: string; bytes: number }[]>('GET', '/backups'), api<{ at: string; admin: string; action: string; entity: string; detail: string | null }[]>('GET', '/audit')]);
      $('#bks').innerHTML = b.length ? `<p class="muted small">Avtomatik nüsxələr serverdə: ${b.slice(0, 5).map((x) => `${esc(x.file)} (${Math.round(x.bytes / 1024)} KB)`).join(', ')}</p>` : '';
      const AN: Record<string, string> = { create: 'yaratdı', update: 'dəyişdi', patch: 'tez dəyişdi', delete: 'sildi', reorder: 'sıraladı', login: 'daxil oldu', upload: 'şəkil yüklədi', download: 'nüsxə yüklədi', password: 'parolu dəyişdi', bulk_create: 'masalar yaratdı' };
      const EN: Record<string, string> = { item: 'məhsul', category: 'kateqoriya', feature: 'özəllik', table: 'masa', settings: 'parametrlər', items: 'məhsullar', categories: 'kateqoriyalar', admin: '', image: '', backup: '' };
      $('#audit').innerHTML = a.slice(0, 25).map((x) => {
        let d = ''; try { const j = JSON.parse(x.detail ?? '{}'); d = j.name ?? (j.changed ? j.changed.join(', ') : ''); if (j.price) d += ` ${Array.isArray(j.price) ? `${money(j.price[0])} → ${money(j.price[1])}` : money(j.price)}`; } catch { /* */ }
        return `<div class="au"><time>${esc(x.at.slice(5, 16).replace('T', ' '))}</time><span><b>${esc(x.admin)}</b> ${esc(AN[x.action] ?? x.action)} ${esc(EN[x.entity] ?? x.entity)} <em>${esc(d)}</em></span></div>`;
      }).join('') || '<p class="muted small">Hələ dəyişiklik yoxdur</p>';
    } catch { /* */ }
  })();
}
function miniPhoto(id: string | null) {
  return id ? `<img src="${img(id, 720)}" alt=""><div class="ph-act"><button type="button" class="chip-btn" data-rmimg>${ic('trash')}</button></div>` : `<div class="ph-empty">${ic('image')}<small>Yüklə</small></div>`;
}

/* ---------- başlanğıc ---------- */
async function boot() {
  try {
    const m = await fetch('/api/admin/me', { credentials: 'same-origin' });
    const j = m.ok ? await m.json() : { auth: false };
    if (!j.auth) { renderLogin(); return; }
    csrf = j.csrf; me = j.username;
    await reload(); route();
  } catch { renderLogin('Serverə qoşulmaq olmadı'); }
}
void boot();
