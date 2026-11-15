import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
export const puppeteer = require('/home/hermes/.hermes/tools/shotkit/node_modules/puppeteer-core');
export const BASE = process.env.BASE ?? 'http://127.0.0.1:8787';
export const SHOTS = path.resolve(process.env.SHOTS ?? 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

export async function launch() {
  return puppeteer.launch({
    executablePath: '/home/hermes/.hermes/tools/chromium-1208/chrome-linux64/chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none', '--lang=az'],
  });
}

export function readSecret() {
  const f = path.join(process.env.HOME, '.hermes/secrets/yuxa-admin.env');
  const env = Object.fromEntries(fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
  return { user: env.ADMIN_USERNAME, pass: env.ADMIN_PASSWORD };
}

/** Səhifə + konsol xətası toplayıcı. */
export async function newPage(browser, { width = 390, height = 844, theme, ctx } = {}) {
  const context = ctx ?? (await browser.createBrowserContext());
  const page = await context.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  page.errors = [];
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => page.errors.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => { const u = r.url(); if (!u.includes('/sw.js') && r.failure()?.errorText !== 'net::ERR_ABORTED') page.errors.push(`requestfailed: ${u} ${r.failure()?.errorText}`); });
  if (theme) await page.evaluateOnNewDocument((t) => { try { localStorage.setItem('yx.theme', t); } catch {} }, theme);
  page.context_ = context;
  return page;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function shot(page, name) {
  const f = path.join(SHOTS, `${name}.png`);
  await page.screenshot({ path: f });
  return f;
}

/** Üfüqi daşma: scrollWidth və sağ kənarı viewport-dan çıxan elementlər. */
export async function overflow(page) {
  return page.evaluate(() => {
    const W = document.documentElement.clientWidth;
    const bad = [];
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      if (cs.position === 'fixed' && cs.visibility === 'hidden') continue;
      if (el.closest('.rail, .tabs-in, .fchips, [aria-hidden=true], .sheet:not(.open), .view:not(.open), .show:not(.open), .lang-pop:not(.open)')) continue;
      const r = el.getBoundingClientRect();
      if (r.width && r.right > W + 1) bad.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')} right=${Math.round(r.right)}`);
    }
    return { scrollWidth: document.documentElement.scrollWidth, W, bad: bad.slice(0, 8) };
  });
}

/** CDP ilə şrift fallback yoxlaması: Onest-dən başqa platform şrifti istifadə olunursa qaytarır. */
export async function fontFallbacks(page, selectors) {
  const client = await page.createCDPSession();
  await client.send('DOM.enable'); await client.send('CSS.enable');
  const { root } = await client.send('DOM.getDocument', { depth: -1 });
  const out = [];
  for (const sel of selectors) {
    const { nodeIds } = await client.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: sel });
    for (const nodeId of nodeIds.slice(0, 40)) {
      try {
        const { fonts } = await client.send('CSS.getPlatformFontsForNode', { nodeId });
        for (const f of fonts) if (!/Onest/i.test(f.familyName)) out.push(`${sel}: ${f.familyName} (${f.glyphCount})`);
      } catch { /* text yoxdur */ }
    }
  }
  await client.detach();
  return [...new Set(out)];
}
