// Dizayn baxışı üçün sürətli ekran şəkilləri (shots/tmp)
import { launch, newPage, BASE, sleep, overflow } from './lib.mjs';
import path from 'node:path';
import fs from 'node:fs';
const OUT = path.resolve('shots/tmp'); fs.mkdirSync(OUT, { recursive: true });
const b = await launch();
for (const theme of (process.argv[2] ?? 'dark,light').split(',')) {
  const p = await newPage(b, { theme });
  await p.goto(`${BASE}/m/7?shot=1`, { waitUntil: 'networkidle0' });
  await sleep(500);
  await p.screenshot({ path: `${OUT}/${theme}-1.png` });
  await p.evaluate(() => scrollTo(0, 560)); await sleep(600);
  await p.screenshot({ path: `${OUT}/${theme}-2.png` });
  await p.evaluate(() => scrollTo(0, 1500)); await sleep(600);
  await p.screenshot({ path: `${OUT}/${theme}-3.png` });
  await p.evaluate(() => document.querySelector('.it[data-id="15"]').click());
  await sleep(700);
  await p.screenshot({ path: `${OUT}/${theme}-sheet.png` });
  console.log(theme, JSON.stringify(await overflow(p)), p.errors);
}
await b.close();
