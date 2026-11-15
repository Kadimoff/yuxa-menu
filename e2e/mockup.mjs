// Telefon maketi kompozisiyası: shots/*.png -> shots/mockup-*.png (1800x1350)
import { launch, sleep } from './lib.mjs';
import fs from 'node:fs';
import path from 'node:path';
const S = path.resolve('shots');
const font = (f) => `data:font/woff2;base64,${fs.readFileSync(`web/public/fonts/${f}`).toString('base64')}`;
const uri = (f) => `data:image/png;base64,${fs.readFileSync(path.join(S, f)).toString('base64')}`;

function page(title, sub, shots) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  @font-face{font-family:Onest;src:url(${font('Onest-latin.woff2')}) format('woff2');font-weight:400 800;unicode-range:U+0000-00FF,U+0131,U+2000-206F}
  @font-face{font-family:Onest;src:url(${font('Onest-latin-ext.woff2')}) format('woff2');font-weight:400 800;unicode-range:U+0100-02BA,U+20A0-20C0}
  *{box-sizing:border-box;margin:0}
  body{width:1800px;height:1350px;overflow:hidden;font-family:Onest;color:#fff;position:relative;
    background:radial-gradient(900px 700px at 85% 0%,rgba(217,70,239,.32),transparent 60%),radial-gradient(1000px 800px at 5% 100%,rgba(139,92,246,.42),transparent 60%),linear-gradient(160deg,#1c0f36,#0c0716 60%)}
  .grain{position:absolute;inset:0;opacity:.07;background-image:radial-gradient(rgba(255,255,255,.6) 1px,transparent 1px);background-size:3px 3px}
  .head{position:absolute;left:110px;top:96px}
  .head b{display:block;font-size:76px;font-weight:800;letter-spacing:-.035em;line-height:1;background:linear-gradient(100deg,#fff 30%,#d8c7ff 70%,#f0abfc);-webkit-background-clip:text;color:transparent}
  .head span{display:block;margin-top:18px;font-size:28px;color:rgba(255,255,255,.66);max-width:640px;line-height:1.35}
  .phones{position:absolute;left:0;right:0;bottom:-60px;height:1080px}
  .ph{position:absolute;width:432px;height:936px;border-radius:64px;padding:14px;background:linear-gradient(160deg,#3a2a5a,#120a22);box-shadow:0 60px 120px -30px rgba(0,0,0,.8),0 0 0 2px rgba(255,255,255,.08) inset,0 0 80px -20px rgba(168,85,247,.5)}
  .ph img{width:100%;height:100%;object-fit:cover;object-position:top;border-radius:52px;display:block}
  .ph::after{content:"";position:absolute;top:28px;left:50%;width:120px;height:34px;margin-left:-60px;border-radius:20px;background:#05020a}
  .p1{left:300px;top:190px;transform:rotate(-7deg)}
  .p2{left:684px;top:60px;z-index:2;transform:scale(1.06)}
  .p3{left:1068px;top:190px;transform:rotate(7deg)}
  </style></head><body><div class="grain"></div>
  <div class="head"><b>${title}</b><span>${sub}</span></div>
  <div class="phones">${shots.map((s, i) => `<div class="ph p${i + 1}"><img src="${uri(s)}"></div>`).join('')}</div>
  </body></html>`;
}

const b = await launch();
const p = await b.newPage();
await p.setViewport({ width: 1800, height: 1350, deviceScaleFactor: 1 });
const jobs = [
  ['mockup-menu.png', 'Yuxa QR menyu', 'Masadan oxudun, seçin, ofisianta göstərin.', ['menu-category-dark.png', 'menu-hero-dark.png', 'menu-item-sheet-dark.png']],
  ['mockup-cart.png', 'Səbət və sifariş kartı', 'Qeydlər, xidmət haqqı və ofisiant üçün böyük şriftli kart.', ['menu-cart-dark.png', 'menu-show-waiter-dark.png', 'menu-hero-light.png']],
  ['mockup-admin.png', 'İdarəetmə paneli', 'Məhsul, qiymət, foto, masa QR kodları telefondan.', ['admin-products.png', 'admin-product-edit.png', 'admin-tables-qr.png']],
];
for (const [out, t, s, shots] of jobs) {
  await p.setContent(page(t, s, shots), { waitUntil: 'load' });
  await sleep(300);
  await p.screenshot({ path: path.join(S, out) });
  console.log(path.join(S, out));
}
await b.close();
