// İlk ekranın ölçüsü (soyuq yükləmə, 390 px): transfer baytları
import { launch, newPage, BASE, sleep } from './lib.mjs';
const b = await launch();
const p = await newPage(b, { width: 390, theme: 'dark' });
const c = await p.createCDPSession(); await c.send('Network.enable'); await c.send('Network.setCacheDisabled', { cacheDisabled: true });
const sizes = new Map(); const urls = new Map();
c.on('Network.responseReceived', (e) => urls.set(e.requestId, e.response.url));
c.on('Network.loadingFinished', (e) => sizes.set(e.requestId, e.encodedDataLength));
const t0 = Date.now();
await p.goto(`${BASE}/m/7`, { waitUntil: 'networkidle0' }); await sleep(800);
const total = [...sizes.values()].reduce((a, b) => a + b, 0);
const rows = [...sizes].map(([id, n]) => [urls.get(id)?.replace(BASE, '') ?? id, n]).sort((a, b) => b[1] - a[1]);
console.log(rows.slice(0, 12).map(([u, n]) => `${(n / 1024).toFixed(1).padStart(6)} KB  ${u}`).join('\n'));
console.log(`CƏMİ: ${(total / 1024).toFixed(1)} KB, ${sizes.size} sorğu, ${Date.now() - t0} ms`);
const perf = await p.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; const fcp = performance.getEntriesByName('first-contentful-paint')[0]; return { dcl: Math.round(n.domContentLoadedEventEnd), fcp: Math.round(fcp?.startTime ?? 0) }; });
console.log(perf);
await b.close();
