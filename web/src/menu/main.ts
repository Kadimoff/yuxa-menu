import '../shared/base.css';
import './menu.css';
import { fold, type L3, type Lang } from '../shared/catalog.js';
import { esc, fmtMoney, ic, img } from '../shared/icons.js';
import { DICT, type Dict } from './i18n.js';

/* ---------- tiplər ---------- */
interface Option { id: string; name: L3; price: number }
interface Item {
  id: number; category_id: number; name: L3; description: L3; ingredients: L3; price: number; portion: string;
  prep_min: number | null; image: string | null; features: string[]; allergens: string[];
  variants: Option[]; addons: Option[]; featured: boolean; available: boolean; sort: number;
}
interface Category { id: number; name: L3; note: L3; sort: number }
interface Feature { id: number; key: string; name: L3; icon: string; color: string }
interface DayHours { open: string; close: string; closed: boolean }
interface Settings {
  venue_name: string; tagline: L3; address: L3; phone: string; wifi_name: string; wifi_password: string; instagram: string;
  hours: Record<string, DayHours>; timezone: string; service_percent: number; currency: string;
  default_theme: 'dark' | 'light'; accent: string; logo: string | null; hero_image: string | null;
  sample_notice: boolean; waiter_enabled: boolean;
}
interface Menu {
  version: number; settings: Settings; categories: Category[]; features: Feature[];
  allergens: Record<string, L3>; tables: { code: string; name: string }[]; items: Item[];
}
interface Line { k: string; id: number; v: string | null; a: string[]; q: number; n: string }

/* ---------- vəziyyət ---------- */
const LANGS: Lang[] = ['az', 'en', 'ru'];
const html = document.documentElement;
const app = document.getElementById('app')!;
let M: Menu;
let lang: Lang = (LANGS as string[]).includes(localStorage.getItem('yx.lang') ?? '') ? (localStorage.getItem('yx.lang') as Lang) : 'az';
let T: Dict = DICT[lang];
const qs = new URLSearchParams(location.search);
const pathTable = location.pathname.match(/^\/m\/([^/]+)\/?$/)?.[1];
let table = decodeURIComponent(pathTable ?? qs.get('masa') ?? localStorage.getItem('yx.table') ?? '').slice(0, 20);
if (table) localStorage.setItem('yx.table', table);
const SHOT = qs.has('shot');
if (SHOT) html.classList.add('shot');

let cart: Line[] = [];
const cartKey = () => `yx.cart:${table || '-'}`;
const loadCart = () => { try { cart = JSON.parse(localStorage.getItem(cartKey()) ?? '[]'); } catch { cart = []; } };
const saveCart = () => localStorage.setItem(cartKey(), JSON.stringify(cart));
loadCart();

/** Gələcək ofisiant funksiyaları üçün nav slotları. `waiter` yalnız settings.waiter_enabled olanda görünür. */
const NAV_SLOTS = ['menu', 'search', 'cart', 'info', 'waiter'] as const;
type Slot = (typeof NAV_SLOTS)[number];

const $ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector(s) as T;
const $$ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => [...r.querySelectorAll(s)] as T[];
const tr = (o: L3 | undefined) => (o ? o[lang] || o.az : '');
const money = (q: number) => fmtMoney(q, M?.settings.currency || '₼');
const fromPrice = (q: number) => (lang === 'az' ? `${money(q)}-dan` : lang === 'en' ? `from ${money(q)}` : `от ${money(q)}`);
const byId = new Map<number, Item>();
const featByKey = new Map<string, Feature>();

function portion(p: string) {
  if (!p || lang === 'az') return p;
  return p.replace(/(\d+(?:[.,]\d+)?)\s*(əd|q|ml|nəfər|kq|l)\b/u, (_m, n, u) => `${n} ${T.units[u] ?? u}`);
}

/* ---------- açıq/bağlı ---------- */
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
function nowIn(tz: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date()).map((x) => [x.type, x.value]));
  const wd = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(p.weekday);
  return { day: wd, min: Number(p.hour) * 60 + Number(p.minute) };
}
const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
function openState(): { open: boolean; text: string } {
  const s = M.settings; const { day, min } = nowIn(s.timezone || 'Asia/Baku');
  const h = (d: number) => s.hours[DAY_KEYS[(d + 7) % 7]];
  const y = h(day - 1);
  if (y && !y.closed && toMin(y.close) <= toMin(y.open) && min < toMin(y.close)) return { open: true, text: T.until(y.close) };
  const t = h(day);
  if (t && !t.closed) {
    const o = toMin(t.open), c = toMin(t.close);
    const overnight = c <= o;
    if (min >= o && (overnight || min < c)) return { open: true, text: T.until(t.close) };
    if (min < o) return { open: false, text: T.opens(t.open) };
  }
  for (let i = 1; i <= 7; i++) {
    const n = h(day + i);
    if (n && !n.closed) return { open: false, text: i === 1 ? T.opensDay(T.tomorrow, n.open) : T.opensDay(T.day[(day + i) % 7], n.open) };
  }
  return { open: false, text: '' };
}

/* ---------- qiymət hesabı ---------- */
const lineKey = (id: number, v: string | null, a: string[]) => `${id}|${v ?? ''}|${[...a].sort().join(',')}`;
function unitPrice(l: { id: number; v: string | null; a: string[] }): number | null {
  const it = byId.get(l.id); if (!it || !it.available) return null;
  const base = l.v ? it.variants.find((x) => x.id === l.v)?.price ?? null : it.price;
  if (base === null) return null;
  return base + l.a.reduce((s, id) => s + (it.addons.find((x) => x.id === id)?.price ?? 0), 0);
}
function totals() {
  let sub = 0, n = 0;
  for (const l of cart) { const u = unitPrice(l); if (u !== null) { sub += u * l.q; n += l.q; } }
  const service = Math.round((sub * (M.settings.service_percent || 0)) / 100);
  return { sub, service, total: sub + service, n };
}
const minPrice = (it: Item) => (it.variants.length ? Math.min(...it.variants.map((v) => v.price)) : it.price);

/* ---------- HTML parçaları ---------- */
function chip(k: string, small = false) {
  const f = featByKey.get(k); if (!f) return '';
  return `<span class="chip${small ? ' sm' : ''}" style="--c:${esc(f.color)}">${ic(f.icon, 'ico')}<span>${esc(tr(f.name))}</span></span>`;
}
function priceHtml(it: Item) {
  return it.variants.length > 1 ? `<span class="price">${esc(fromPrice(minPrice(it)))}</span>` : `<span class="price">${esc(money(it.price))}</span>`;
}
function picture(id: string | null, sizes: string, cls: string, eager = false, alt = '') {
  if (!id) return '';
  return `<img class="${cls}" src="${img(id, 720)}" srcset="${img(id, 240)} 240w, ${img(id, 480)} 480w, ${img(id, 720)} 720w, ${img(id, 1200)} 1200w" sizes="${sizes}" alt="${esc(alt)}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`;
}
function itemCard(it: Item) {
  const na = !it.available;
  const d = tr(it.description);
  return `<article class="it${na ? ' na' : ''}${it.image ? '' : ' nophoto'}" data-id="${it.id}" tabindex="0" role="button" aria-label="${esc(tr(it.name))}">
    <div class="it-tx">
      <h3>${esc(tr(it.name))}</h3>
      ${d ? `<p class="it-d">${esc(d)}</p>` : ''}
      ${it.features.length ? `<div class="chips">${it.features.map((k) => chip(k, true)).join('')}</div>` : ''}
      <div class="it-ft">${na ? `<span class="na-l">${esc(T.unavailable)}</span>` : priceHtml(it)}${it.portion ? `<span class="por">${esc(portion(it.portion))}</span>` : ''}</div>
    </div>
    ${it.image ? `<div class="it-ph">${picture(it.image, '112px', 'ph', false, '')}</div>` : ''}
    ${na ? '' : `<button class="add" data-add="${it.id}" aria-label="${esc(T.add)}">${ic('plus')}</button>`}
  </article>`;
}

/* ---------- qabıq ---------- */
function shell() {
  const s = M.settings;
  app.innerHTML = `
  <header class="hero" id="top">
    <div class="hero-media">${s.hero_image ? picture(s.hero_image, '100vw', 'hero-img', true, s.venue_name) : ''}</div>
    <div class="hero-shade"></div>
    <div class="topbar">
      <div class="brand">${s.logo ? `<img src="${img(s.logo, 240)}" alt="">` : `<span class="mark">${esc(s.venue_name.slice(0, 1))}</span>`}</div>
      <div class="tb-r">
        <div class="lang-wrap"><button class="pill glass" id="langBtn" aria-haspopup="true" aria-expanded="false">${ic('globe')}<span id="langCur"></span></button>
          <div class="lang-pop glass" id="langPop" role="menu">${LANGS.map((l) => `<button role="menuitemradio" data-setlang="${l}">${{ az: 'Azərbaycanca', en: 'English', ru: 'Русский' }[l]}</button>`).join('')}</div></div>
        <button class="pill glass icon" id="themeBtn" aria-label="Tema"></button>
      </div>
    </div>
    <div class="hero-body">
      <div class="hero-meta" id="heroMeta"></div>
      <h1 class="grad-text" id="venue"></h1>
      <p class="lead" id="lead"></p>
    </div>
  </header>
  <nav class="tabs" id="tabs" aria-label="Kateqoriyalar"><div class="tabs-in" id="tabsIn"><i class="ink" id="ink"></i></div></nav>
  <main class="main" id="main"></main>
  <nav class="dock glass" id="dock" aria-label="Naviqasiya"></nav>
  <section class="view" id="v-search" aria-hidden="true"></section>
  <section class="view" id="v-cart" aria-hidden="true"></section>
  <section class="view" id="v-info" aria-hidden="true"></section>
  <div class="scrim" id="scrim"></div>
  <div class="sheet" id="sheet" role="dialog" aria-modal="true" aria-hidden="true"></div>
  <div class="show" id="show" role="dialog" aria-modal="true" aria-hidden="true"></div>
  <div class="toast" id="toast" role="status" aria-live="polite"></div>`;
  bindShell();
}

function renderHero() {
  const s = M.settings;
  html.lang = lang;
  document.title = `${s.venue_name} menyu`;
  $('#venue').textContent = s.venue_name;
  $('#lead').textContent = tr(s.tagline);
  const st = openState();
  const tname = table ? (M.tables.find((t) => t.code === table)?.name.replace(/^Masa\s*/i, '') ?? table) : '';
  $('#heroMeta').innerHTML = `<span class="meta-chip glass ${st.open ? 'on' : 'off'}"><i class="dot"></i><b>${esc(st.open ? T.open : T.closed)}</b>${st.text ? `<span>${esc(st.text)}</span>` : ''}</span>
    ${table ? `<span class="meta-chip glass" id="tableChip">${ic('table')}<b>${esc(T.table)} ${esc(tname)}</b></span>` : ''}`;
  $('#langCur').textContent = lang.toUpperCase();
  $$('#langPop button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.setlang === lang)));
  $('#themeBtn').innerHTML = ic(html.dataset.theme === 'dark' ? 'sun' : 'moon');
}

function visibleCats() {
  return M.categories.filter((c) => M.items.some((i) => i.category_id === c.id));
}

function renderMain() {
  const cats = visibleCats();
  $('#tabsIn').innerHTML = `<i class="ink" id="ink"></i>` + cats.map((c) => `<button class="tab" data-cat="${c.id}">${esc(tr(c.name))}</button>`).join('');
  const fav = M.items.filter((i) => i.featured && i.available);
  const favHtml = fav.length ? `<section class="fav" aria-labelledby="favT">
      <h2 id="favT" class="sec-t">${esc(T.featured)}</h2>
      <div class="rail">${fav.map((it) => `<button class="fc" data-id="${it.id}">
        ${it.image ? picture(it.image, '232px', 'fc-img', false, '') : '<span class="fc-img ph-empty"></span>'}
        <span class="fc-sh"></span>
        ${it.features[0] ? `<span class="fc-tag">${chip(it.features[0], true)}</span>` : ''}
        <span class="fc-tx"><b>${esc(tr(it.name))}</b><span>${esc(it.variants.length > 1 ? fromPrice(minPrice(it)) : money(it.price))}</span></span>
      </button>`).join('')}</div></section>` : '';
  const secs = cats.map((c) => {
    const items = M.items.filter((i) => i.category_id === c.id);
    const note = tr(c.note);
    return `<section class="cat" id="c-${c.id}" data-cat="${c.id}">
      <header class="cat-h"><h2 class="sec-t"><span>${esc(tr(c.name))}</span><small>${items.length}</small></h2>${note ? `<p>${esc(note)}</p>` : ''}</header>
      <div class="list">${items.map(itemCard).join('')}</div></section>`;
  }).join('');
  const s = M.settings;
  $('#main').innerHTML = favHtml + secs + `<footer class="foot">
    <div class="foot-brand"><b>${esc(s.venue_name)}</b><span>${esc(tr(s.address))}</span></div>
    ${s.sample_notice ? `<p class="sample">${esc(T.sample)}</p>` : ''}
  </footer>`;
  setupSpy();
}

function renderDock() {
  const { n } = totals();
  const slots: Slot[] = NAV_SLOTS.filter((x) => x !== 'waiter' || M.settings.waiter_enabled);
  const icons: Record<Slot, string> = { menu: 'book', search: 'search', cart: 'bag', info: 'info', waiter: 'bell' };
  $('#dock').innerHTML = slots.map((sl) => `<button class="dk${current === sl ? ' on' : ''}" data-slot="${sl}" ${sl === 'waiter' ? 'disabled' : ''} aria-label="${esc(T[sl])}">
      <span class="dk-i">${ic(icons[sl])}${sl === 'cart' && n ? `<i class="badge" id="badge">${n}</i>` : ''}</span><span class="dk-l">${esc(T[sl])}</span></button>`).join('');
}

function renderAll() {
  T = DICT[lang];
  renderHero(); renderMain(); renderDock();
  if (current === 'cart') renderCart();
  if (current === 'search') renderSearch(true);
  if (current === 'info') renderInfo();
}

/* ---------- scroll spy ---------- */
let spyRaf = 0;
function setupSpy() {
  const onScroll = () => {
    cancelAnimationFrame(spyRaf);
    spyRaf = requestAnimationFrame(() => {
      const off = $('#tabs').offsetHeight + Math.min(160, innerHeight * 0.22);
      let act: string | null = null;
      for (const s of $$('.cat')) if (s.getBoundingClientRect().top - off <= 0) act = s.dataset.cat!;
      if (!act) act = $$('.cat')[0]?.dataset.cat ?? null;
      setActiveTab(act);
      $('#tabs').classList.toggle('stuck', $('#tabs').getBoundingClientRect().top <= 0.5);
    });
  };
  window.onscroll = onScroll; onScroll();
}
let activeTab: string | null = null;
function setActiveTab(id: string | null, force = false) {
  if (id === activeTab && !force) return;
  activeTab = id;
  const btn = $(`.tab[data-cat="${id}"]`); const ink = $('#ink'); const wrap = $('#tabsIn');
  $$('.tab').forEach((b) => b.classList.toggle('on', b === btn));
  if (!btn || !ink) return;
  ink.style.width = `${btn.offsetWidth}px`;
  ink.style.transform = `translateX(${btn.offsetLeft}px)`;
  wrap.scrollTo({ left: btn.offsetLeft - (wrap.clientWidth - btn.offsetWidth) / 2, behavior: force ? 'auto' : 'smooth' });
}
function goToCat(id: string) {
  const s = $(`#c-${id}`); if (!s) return;
  const top = s.getBoundingClientRect().top + scrollY - $('#tabs').offsetHeight - 8;
  scrollTo({ top, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  setActiveTab(id);
}

/* ---------- qatlar və tarixçə ---------- */
type View = 'menu' | 'search' | 'cart' | 'info';
let current: View = 'menu';
const stack: string[] = [];
const SID = Math.random().toString(36).slice(2);
history.replaceState({ d: 0, s: SID }, '');
function push(id: string) { stack.push(id); history.pushState({ d: stack.length, s: SID }, ''); }
function lock() { html.classList.toggle('lock', stack.some((x) => x === 'sheet' || x === 'show') || current !== 'menu'); }
window.addEventListener('popstate', (e) => {
  const st = e.state as { d?: number; s?: string } | null;
  const depth = st?.s === SID ? st.d ?? 0 : 0;
  while (stack.length > depth) hideLayer(stack.pop()!);
  lock();
});
function hideLayer(id: string) {
  if (id === 'sheet') { $('#sheet').classList.remove('open'); $('#sheet').setAttribute('aria-hidden', 'true'); $('#scrim').classList.remove('open'); }
  else if (id === 'show') { $('#show').classList.remove('open'); $('#show').setAttribute('aria-hidden', 'true'); releaseWake(); }
  else if (id === 'view') { showView('menu'); }
}
function closeTop() { if (stack.length) history.back(); }

function showView(v: View) {
  current = v;
  for (const x of ['search', 'cart', 'info']) {
    const el = $(`#v-${x}`); const on = x === v;
    el.classList.toggle('open', on); el.setAttribute('aria-hidden', String(!on));
  }
  renderDock(); lock();
}
function setView(v: View) {
  if (v === current) { if (v === 'menu') scrollTo({ top: 0, behavior: 'smooth' }); return; }
  // açıq sheet/show varsa bağla
  if (v === 'menu') { if (stack.length) history.go(-stack.length); else showView('menu'); return; }
  if (current === 'menu') push('view');
  showView(v);
  if (v === 'cart') renderCart();
  if (v === 'search') { renderSearch(); }
  if (v === 'info') renderInfo();
  $(`#v-${v}`).scrollTop = 0;
}

/* ---------- məhsul pəncərəsi ---------- */
let sheetState: { it: Item; v: string | null; a: Set<string>; q: number } | null = null;
function openSheet(id: number) {
  const it = byId.get(id); if (!it) return;
  sheetState = { it, v: it.variants[0]?.id ?? null, a: new Set(), q: 1 };
  renderSheet();
  const sh = $('#sheet');
  sh.scrollTop = 0;
  requestAnimationFrame(() => { sh.classList.add('open'); $('#scrim').classList.add('open'); });
  sh.setAttribute('aria-hidden', 'false');
  push('sheet'); lock();
}
function sheetTotal() {
  if (!sheetState) return 0;
  const u = unitPrice({ id: sheetState.it.id, v: sheetState.v, a: [...sheetState.a] }) ?? 0;
  return u * sheetState.q;
}
function renderSheet() {
  const st = sheetState!; const it = st.it; const na = !it.available;
  const ing = tr(it.ingredients); const d = tr(it.description);
  const facts = [it.portion ? `<span class="fact">${ic('scale')}${esc(portion(it.portion))}</span>` : '', it.prep_min ? `<span class="fact">${ic('clock')}${it.prep_min} ${esc(T.min)}</span>` : ''].join('');
  $('#sheet').innerHTML = `<div class="sh-grab" aria-hidden="true"></div>
    <button class="sh-x glass" data-close aria-label="${esc(T.close)}">${ic('close')}</button>
    ${it.image ? `<div class="sh-media">${picture(it.image, '(min-width: 560px) 560px, 100vw', 'sh-img', true, tr(it.name))}</div>` : '<div class="sh-media empty"></div>'}
    <div class="sh-body">
      <h2 class="sh-t">${esc(tr(it.name))}</h2>
      ${facts ? `<div class="facts">${facts}</div>` : ''}
      ${it.features.length ? `<div class="chips">${it.features.map((k) => chip(k)).join('')}</div>` : ''}
      ${d ? `<p class="sh-d">${esc(d)}</p>` : ''}
      ${ing ? `<div class="sh-block"><h3>${esc(T.ingredients)}</h3><p>${esc(ing)}</p></div>` : ''}
      ${it.allergens.length ? `<div class="sh-block"><h3>${esc(T.allergens)}</h3><div class="alg">${it.allergens.map((a) => `<span>${esc(tr(M.allergens[a]))}</span>`).join('')}</div></div>` : ''}
      ${it.variants.length ? `<div class="sh-block"><h3>${esc(T.size)}</h3><div class="opts" role="radiogroup">${it.variants.map((v) => `
        <button class="opt${st.v === v.id ? ' on' : ''}" role="radio" aria-checked="${st.v === v.id}" data-var="${esc(v.id)}"><span class="o-r"></span><span class="o-n">${esc(tr(v.name))}</span><span class="o-p">${esc(money(v.price))}</span></button>`).join('')}</div></div>` : ''}
      ${it.addons.length ? `<div class="sh-block"><h3>${esc(T.extras)}</h3><div class="opts">${it.addons.map((a) => `
        <button class="opt chk${st.a.has(a.id) ? ' on' : ''}" role="checkbox" aria-checked="${st.a.has(a.id)}" data-addon="${esc(a.id)}"><span class="o-r">${ic('check')}</span><span class="o-n">${esc(tr(a.name))}</span><span class="o-p">+${esc(money(a.price))}</span></button>`).join('')}</div></div>` : ''}
    </div>
    <div class="sh-foot">
      ${na ? `<div class="na-big">${esc(T.unavailable)}</div>` : `
      <div class="stepper" aria-label="${esc(T.qty)}"><button data-q="-1" aria-label="-">${ic('minus')}</button><output id="shQ">${st.q}</output><button data-q="1" aria-label="+">${ic('plus')}</button></div>
      <button class="cta btn-grad" id="shAdd"><span>${esc(T.add)}</span><b id="shSum">${esc(money(sheetTotal()))}</b></button>`}
    </div>`;
}

/* ---------- səbət ---------- */
function addToCart(id: number, v: string | null, a: string[], q: number) {
  const it = byId.get(id); if (!it || !it.available) return;
  const k = lineKey(id, v, a);
  const ex = cart.find((l) => l.k === k);
  if (ex) ex.q = Math.min(99, ex.q + q); else cart.push({ k, id, v, a: [...a].sort(), q, n: '' });
  saveCart(); renderDock();
  const b = $('#badge'); if (b) { b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); }
  toast(T.added);
}
function lineLabel(l: Line) {
  const it = byId.get(l.id);
  const v = l.v && it ? it.variants.find((x) => x.id === l.v) : null;
  const ad = it ? l.a.map((id) => it.addons.find((x) => x.id === id)).filter(Boolean) as Option[] : [];
  return { it, v, ad };
}
function renderCart() {
  const el = $('#v-cart');
  const t = totals();
  const tname = table ? `${T.table} ${M.tables.find((x) => x.code === table)?.name.replace(/^Masa\s*/i, '') ?? table}` : '';
  if (!cart.length) {
    el.innerHTML = `<div class="v-head"><h2>${esc(T.cartTitle)}</h2>${tname ? `<span class="meta-chip glass">${ic('table')}<b>${esc(tname)}</b></span>` : ''}</div>
      <div class="empty"><div class="empty-ic">${ic('bag')}</div><h3>${esc(T.cartEmpty)}</h3><p>${esc(T.cartEmptySub)}</p><button class="ghost-btn" data-view="menu">${esc(T.toMenu)}</button></div>`;
    return;
  }
  el.innerHTML = `<div class="v-head"><h2>${esc(T.cartTitle)}</h2>${tname ? `<span class="meta-chip glass">${ic('table')}<b>${esc(tname)}</b></span>` : ''}</div>
    <div class="lines">${cart.map((l) => {
      const { it, v, ad } = lineLabel(l); const u = unitPrice(l);
      if (!it) return '';
      return `<div class="ln${u === null ? ' gone' : ''}" data-k="${esc(l.k)}">
        <div class="ln-ph">${it.image ? `<img src="${img(it.image, 240)}" alt="" loading="lazy">` : ''}</div>
        <div class="ln-m">
          <b class="ln-n">${esc(tr(it.name))}</b>
          ${v || ad.length ? `<span class="ln-o">${[v ? tr(v.name) : '', ...ad.map((x) => `+ ${tr(x.name)}`)].filter(Boolean).map(esc).join(', ')}</span>` : ''}
          ${u === null ? `<span class="ln-o warn">${esc(T.gone)}</span>` : ''}
          <div class="ln-note">${l.n ? `<button class="note-v" data-note>${ic('note')}<span>${esc(l.n)}</span></button>` : `<button class="note-add" data-note>${ic('note')}<span>${esc(T.addNote)}</span></button>`}</div>
        </div>
        <div class="ln-r">
          <b class="ln-p">${u === null ? '' : esc(money(u * l.q))}</b>
          <div class="stepper sm"><button data-lq="-1" aria-label="-">${ic(l.q === 1 ? 'trash' : 'minus')}</button><output>${l.q}</output><button data-lq="1" aria-label="+" ${u === null ? 'disabled' : ''}>${ic('plus')}</button></div>
        </div>
      </div>`;
    }).join('')}</div>
    <div class="sum glass-card">
      <div><span>${esc(T.subtotal)}</span><b>${esc(money(t.sub))}</b></div>
      ${M.settings.service_percent ? `<div><span>${esc(T.service(M.settings.service_percent))}</span><b>${esc(money(t.service))}</b></div>` : ''}
      <div class="tot"><span>${esc(T.total)}</span><b>${esc(money(t.total))}</b></div>
    </div>
    <p class="hint">${esc(T.showHint)}</p>
    <button class="ghost-btn danger" id="clearCart">${ic('trash')}${esc(T.clear)}</button>
    <div class="cart-cta"><button class="cta btn-grad" id="showBtn" ${t.n ? '' : 'disabled'}><span>${esc(T.showWaiter)}</span><b>${esc(money(t.total))}</b></button></div>`;
}

function openShow() {
  const t = totals();
  const tname = table ? (M.tables.find((x) => x.code === table)?.name.replace(/^Masa\s*/i, '') ?? table) : '';
  const time = new Intl.DateTimeFormat('az', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: M.settings.timezone || 'Asia/Baku' }).format(new Date());
  $('#show').innerHTML = `<div class="show-in">
    <div class="show-top"><div><span class="show-k"><span>${esc(T.order)}</span><span>${esc(time)}</span></span>
      <div class="show-table">${tname ? `${esc(T.table)} <b class="grad-text">${esc(tname)}</b>` : esc(M.settings.venue_name)}</div></div>
      <button class="sh-x glass" data-close aria-label="${esc(T.close)}">${ic('close')}</button></div>
    <ol class="show-list">${cart.filter((l) => unitPrice(l) !== null).map((l) => {
      const { it, v, ad } = lineLabel(l);
      return `<li><span class="sq">${l.q}×</span><div><b>${esc(tr(it!.name))}${v ? ` <em>${esc(tr(v.name))}</em>` : ''}</b>
        ${ad.length ? `<span>${ad.map((x) => `+ ${esc(tr(x.name))}`).join('<br>')}</span>` : ''}
        ${l.n ? `<span class="sn">${ic('note')}${esc(l.n)}</span>` : ''}</div></li>`;
    }).join('')}</ol>
    <div class="show-tot"><span>${esc(T.items(t.n))}${M.settings.service_percent ? `, ${esc(T.service(M.settings.service_percent).toLowerCase())}` : ''}</span><b>${esc(money(t.total))}</b></div>
  </div>`;
  $('#show').classList.add('open'); $('#show').setAttribute('aria-hidden', 'false');
  push('show'); lock(); keepAwake();
}
let wake: { release(): Promise<void> } | null = null;
async function keepAwake() { try { wake = await (navigator as Navigator & { wakeLock?: { request(t: string): Promise<{ release(): Promise<void> }> } }).wakeLock?.request('screen') ?? null; } catch { wake = null; } }
function releaseWake() { void wake?.release().catch(() => {}); wake = null; }

/* ---------- axtarış ---------- */
const searchIndex = () => M.items.map((it) => ({
  it, hay: fold([it.name.az, it.name.en, it.name.ru, it.description.az, it.description.en, it.description.ru, it.ingredients.az].join(' ')),
}));
let idx: ReturnType<typeof searchIndex> = [];
function renderSearch(keep = false) {
  const el = $('#v-search');
  const prev = keep ? ($('#q', el) as HTMLInputElement | null)?.value ?? '' : '';
  el.innerHTML = `<div class="v-head search-h"><label class="field glass">${ic('search')}<input id="q" type="search" enterkeyhint="search" autocomplete="off" placeholder="${esc(T.searchPh)}" aria-label="${esc(T.search)}"></label></div>
    <div id="sres"></div>`;
  const q = $('#q', el) as HTMLInputElement;
  q.value = prev;
  q.addEventListener('input', () => runSearch(q.value));
  runSearch(prev);
  if (!keep && !SHOT) setTimeout(() => q.focus({ preventScroll: true }), 260);
}
function runSearch(raw: string) {
  const box = $('#sres'); const q = fold(raw.trim());
  if (!q) {
    box.innerHTML = `<p class="s-hint">${esc(T.searchHint)}</p><div class="s-cats">${visibleCats().map((c) => `<button class="s-cat" data-goto="${c.id}">${esc(tr(c.name))}</button>`).join('')}</div>`;
    return;
  }
  const words = q.split(/\s+/);
  const res = idx.filter((x) => words.every((w) => x.hay.includes(w))).map((x) => x.it);
  box.innerHTML = res.length ? `<div class="list">${res.map(itemCard).join('')}</div>` : `<div class="empty sm"><div class="empty-ic">${ic('search')}</div><p>${esc(T.noResults)}</p></div>`;
}

/* ---------- məkan ---------- */
function renderInfo() {
  const s = M.settings; const { day } = nowIn(s.timezone || 'Asia/Baku');
  const st = openState();
  $('#v-info').innerHTML = `<div class="v-head"><h2>${esc(s.venue_name)}</h2><span class="meta-chip glass ${st.open ? 'on' : 'off'}"><i class="dot"></i><b>${esc(st.open ? T.open : T.closed)}</b></span></div>
    <div class="info-card glass-card">
      ${tr(s.address) ? `<a class="info-row" href="https://maps.google.com/?q=${encodeURIComponent(tr(s.address))}" target="_blank" rel="noopener">${ic('pin')}<span><small>${esc(T.address)}</small>${esc(tr(s.address))}</span></a>` : ''}
      ${s.phone ? `<a class="info-row" href="tel:${esc(s.phone.replace(/[^\d+]/g, ''))}">${ic('phone')}<span><small>${esc(T.phone)}</small>${esc(s.phone)}</span></a>` : ''}
      ${s.wifi_name ? `<div class="info-row">${ic('wifi')}<span><small>${esc(T.wifi)}</small>${esc(s.wifi_name)}${s.wifi_password ? `<br><small>${esc(T.password)}</small>${esc(s.wifi_password)}` : ''}</span>${s.wifi_password ? `<button class="mini" data-copy="${esc(s.wifi_password)}">${ic('copy')}<span class="sr">${esc(T.copy)}</span></button>` : ''}</div>` : ''}
    </div>
    <h3 class="v-sub">${esc(T.hours)}</h3>
    <div class="hours glass-card">${DAY_KEYS.map((k, i) => { const h = s.hours[k]; return `<div class="${i === day ? 'today' : ''}"><span>${esc(T.day[i])}</span><b>${h?.closed ? esc(T.dayClosed) : `${esc(h?.open)}-${esc(h?.close)}`}</b></div>`; }).join('')}</div>
    <h3 class="v-sub">${esc(T.legend)}</h3>
    <div class="chips legend">${M.features.map((f) => chip(f.key)).join('')}</div>
    <div class="prefs">
      <div class="seg" role="radiogroup" aria-label="${esc(T.lang)}">${LANGS.map((l) => `<button data-setlang="${l}" class="${l === lang ? 'on' : ''}" role="radio" aria-checked="${l === lang}">${l.toUpperCase()}</button>`).join('')}</div>
      <div class="seg" role="radiogroup" aria-label="${esc(T.theme)}"><button data-settheme="dark" class="${html.dataset.theme === 'dark' ? 'on' : ''}" aria-label="dark">${ic('moon')}</button><button data-settheme="light" class="${html.dataset.theme === 'light' ? 'on' : ''}" aria-label="light">${ic('sun')}</button></div>
    </div>
    ${s.sample_notice ? `<p class="sample">${esc(T.sample)}</p>` : ''}`;
}

/* ---------- köməkçilər ---------- */
let toastT = 0;
function toast(msg: string) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toastT); toastT = window.setTimeout(() => t.classList.remove('on'), 1600);
}
function setLang(l: Lang) {
  lang = l; localStorage.setItem('yx.lang', l); idx = searchIndex();
  $('#langPop')?.classList.remove('open');
  renderAll(); setActiveTab(activeTab, true);
}
function setTheme(t: 'dark' | 'light') {
  html.dataset.theme = t; localStorage.setItem('yx.theme', t);
  $('meta[name=theme-color]')?.setAttribute('content', t === 'dark' ? '#0c0716' : '#f8f6fd');
  renderHero(); if (current === 'info') renderInfo();
}

function bindShell() {
  app.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const c = (s: string) => t.closest<HTMLElement>(s);
    let x: HTMLElement | null;
    if ((x = c('[data-close]'))) { closeTop(); return; }
    if ((x = c('#langBtn'))) { const p = $('#langPop'); const o = !p.classList.contains('open'); p.classList.toggle('open', o); x.setAttribute('aria-expanded', String(o)); return; }
    if ((x = c('[data-setlang]'))) { setLang(x.dataset.setlang as Lang); return; }
    $('#langPop')?.classList.remove('open');
    if ((x = c('#themeBtn'))) { setTheme(html.dataset.theme === 'dark' ? 'light' : 'dark'); return; }
    if ((x = c('[data-settheme]'))) { setTheme(x.dataset.settheme as 'dark' | 'light'); return; }
    if ((x = c('.tab'))) { goToCat(x.dataset.cat!); return; }
    if ((x = c('[data-goto]'))) { const id = x.dataset.goto!; setView('menu'); setTimeout(() => goToCat(id), 60); return; }
    if ((x = c('[data-slot]'))) { const sl = x.dataset.slot as Slot; if (sl !== 'waiter') setView(sl as View); return; }
    if ((x = c('[data-view]'))) { setView(x.dataset.view as View); return; }
    if ((x = c('[data-add]'))) {
      const it = byId.get(Number(x.dataset.add))!;
      if (it.variants.length || it.addons.length) openSheet(it.id); else addToCart(it.id, null, [], 1);
      return;
    }
    if ((x = c('.it, .fc'))) { openSheet(Number(x.dataset.id)); return; }
    // sheet
    if ((x = c('[data-var]')) && sheetState) { sheetState.v = x.dataset.var!; renderSheet(); return; }
    if ((x = c('[data-addon]')) && sheetState) { const id = x.dataset.addon!; if (sheetState.a.has(id)) sheetState.a.delete(id); else sheetState.a.add(id); renderSheet(); return; }
    if ((x = c('[data-q]')) && sheetState) { sheetState.q = Math.max(1, Math.min(99, sheetState.q + Number(x.dataset.q))); $('#shQ').textContent = String(sheetState.q); $('#shSum').textContent = money(sheetTotal()); return; }
    if ((x = c('#shAdd')) && sheetState) { addToCart(sheetState.it.id, sheetState.v, [...sheetState.a], sheetState.q); closeTop(); return; }
    // səbət
    if ((x = c('[data-lq]'))) {
      const k = x.closest<HTMLElement>('.ln')!.dataset.k!; const l = cart.find((y) => y.k === k); if (!l) return;
      l.q += Number(x.dataset.lq); if (l.q <= 0) cart = cart.filter((y) => y !== l);
      saveCart(); renderCart(); renderDock(); return;
    }
    if ((x = c('[data-note]'))) {
      const row = x.closest<HTMLElement>('.ln')!; const l = cart.find((y) => y.k === row.dataset.k); if (!l) return;
      const box = x.closest<HTMLElement>('.ln-note')!;
      box.innerHTML = `<input class="note-in" maxlength="120" placeholder="${esc(T.notePh)}" value="${esc(l.n)}" aria-label="${esc(T.note)}">`;
      const inp = box.querySelector('input')!; inp.focus();
      const done = () => { l.n = inp.value.trim().slice(0, 120); saveCart(); renderCart(); };
      inp.addEventListener('blur', done, { once: true });
      inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') inp.blur(); });
      return;
    }
    if ((x = c('#clearCart'))) { if (SHOT || confirm(T.clearAsk)) { cart = []; saveCart(); renderCart(); renderDock(); } return; }
    if ((x = c('#showBtn'))) { openShow(); return; }
    if ((x = c('[data-copy]'))) { void navigator.clipboard?.writeText(x.dataset.copy!).then(() => toast(T.copied)); return; }
  });
  $('#scrim').addEventListener('click', closeTop);
  app.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    if ((e.key === 'Enter' || e.key === ' ') && t.matches('.it')) { e.preventDefault(); openSheet(Number(t.dataset.id)); }
    if (e.key === 'Escape' && stack.length) closeTop();
  });
  // sheet-i aşağı çəkib bağlamaq
  const sh = $('#sheet'); let y0 = 0, dy = 0, drag = false;
  sh.addEventListener('touchstart', (e) => { if (sh.scrollTop > 0) return; drag = true; y0 = e.touches[0].clientY; dy = 0; }, { passive: true });
  sh.addEventListener('touchmove', (e) => { if (!drag) return; dy = Math.max(0, e.touches[0].clientY - y0); sh.style.transform = dy ? `translateY(${dy}px)` : ''; }, { passive: true });
  sh.addEventListener('touchend', () => { if (!drag) return; drag = false; sh.style.transform = ''; if (dy > 110) closeTop(); });
}

/* ---------- yükləmə ---------- */
function applyMenu(m: Menu) {
  M = m;
  byId.clear(); m.items.forEach((i) => byId.set(i.id, i));
  featByKey.clear(); m.features.forEach((f) => featByKey.set(f.key, f));
  html.dataset.accent = m.settings.accent || 'violet';
  localStorage.setItem('yx.accent', html.dataset.accent);
  localStorage.setItem('yx.dtheme', m.settings.default_theme);
  if (!localStorage.getItem('yx.theme')) html.dataset.theme = m.settings.default_theme;
  idx = searchIndex();
}

async function fetchMenu(): Promise<{ m: Menu; offline: boolean }> {
  try {
    const r = await fetch('/api/menu', { credentials: 'same-origin' });
    if (!r.ok) throw new Error(String(r.status));
    const m = (await r.json()) as Menu;
    try { localStorage.setItem('yx.menu', JSON.stringify(m)); } catch { /* dolu ola bilər */ }
    return { m, offline: r.headers.get('x-yx-cache') === 'offline' };
  } catch {
    const c = localStorage.getItem('yx.menu');
    if (c) return { m: JSON.parse(c) as Menu, offline: true };
    throw new Error('no menu');
  }
}

async function boot() {
  try {
    const { m, offline } = await fetchMenu();
    applyMenu(m);
    shell(); renderAll();
    if (offline) setTimeout(() => toast(T.offline), 400);
    if (location.hash.startsWith('#item-')) openSheet(Number(location.hash.slice(6)));
  } catch {
    app.innerHTML = `<div class="empty boot-err"><div class="empty-ic">${ic('cloud')}</div><h3>${esc(T.loadErr)}</h3><button class="ghost-btn" id="retry">${esc(T.retry)}</button></div>`;
    $('#retry')?.addEventListener('click', () => location.reload());
    return;
  }
  // tab dəyişiminə qayıdanda (məs. admin dəyişdi) menyunu yenilə
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible') return;
    try {
      const r = await fetch('/api/menu'); if (!r.ok) return;
      const m = (await r.json()) as Menu; if (m.version === M.version) return;
      localStorage.setItem('yx.menu', JSON.stringify(m));
      applyMenu(m); renderAll(); setActiveTab(activeTab, true);
    } catch { /* offline */ }
  });
  if ('serviceWorker' in navigator && !SHOT) {
    navigator.serviceWorker.register('/sw.js').then(async (reg) => {
      await navigator.serviceWorker.ready;
      const urls = new Set<string>();
      for (const it of M.items) if (it.image) { urls.add(img(it.image, 240)); urls.add(img(it.image, 720)); }
      if (M.settings.hero_image) { urls.add(img(M.settings.hero_image, 720)); urls.add(img(M.settings.hero_image, 1200)); }
      (reg.active ?? navigator.serviceWorker.controller)?.postMessage({ type: 'warm', urls: [...urls] });
    }).catch(() => {});
  }
}
void boot();
