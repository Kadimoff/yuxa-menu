# Yuxa QR menyu

Restoran üçün QR menyu: müştəri masadakı QR-ı oxudur, menyuya baxır, səbət yığır və səbəti ofisianta telefondan göstərir. Arxada mobil üçün admin panel var: məhsullar, qiymətlər, özəlliklər, kateqoriyalar, şəkillər, masalar və QR kartları, parametrlər.

> Bazadakı yeməklər, qiymətlər və şəkillər **nümunədir** (`server/seed.ts`). Admin paneldə və menyunun altında bu barədə bildiriş görünür. Parametrlərdən söndürülür.

## Stack və niyə

| Hissə | Seçim | Səbəb |
| --- | --- | --- |
| Dil | TypeScript (server və frontend) | Bir dil, ortaq tiplər və kataloq (`web/src/shared`). |
| Server | Node 22 + Fastify | Sürətli, kiçik, plugin-lərlə cookie/multipart/static hazırdır. |
| Baza | SQLite (better-sqlite3, WAL) | Bir restoran üçün tək fayl baza kifayətdir: server, backup və köçürmə sadədir. Ayrı DB serveri lazım deyil. |
| Şəkillər | sharp | Yükləmədə məzmuna görə yoxlanır, EXIF silinir, 240/720/1200 webp yaradılır. |
| Frontend | Vite + vanilla TS, iki giriş: menyu və admin | Framework yoxdur, menyu JS-i ~11 KB gzip. Zəif Wi-Fi-də tez açılır. |
| Offline | Service worker | Menyu JSON və şəkillər cache-də qalır, internet kəsiləndə də açılır. |
| Deploy | Bir proses, bir port, Dockerfile + compose | Coolify-a birbaşa verilir. |

## İşə salma (lokal)

```bash
export PATH=/home/hermes/.hermes/tools/node-v22.23.4-linux-x64/bin:$PATH
npm install --ignore-scripts          # better-sqlite3 prebuild-i runtime-da yüklənir
npm run build                         # dist/ (frontend) + dist-server/ (server)
printf '%s' "$PAROL" | npm run admin:create -- admin   # ilk admin, parol stdin-dən
HOST=127.0.0.1 PORT=8787 npm start    # http://127.0.0.1:8787  və  /admin
```

Lokal yoxlama üçün admin məlumatı: `~/.hermes/secrets/yuxa-admin.env` (chmod 600).
`http://` üzərində lokal işlədəndə `127.0.0.1` istifadə edin (Secure cookie Chrome-da localhost üçün işləyir). Başqa HTTP host-da test üçün `COOKIE_SECURE=0`.

Mühit dəyişənləri: `PORT` (8787), `HOST` (127.0.0.1), `DATA_DIR` (`./data`), `COOKIE_SECURE` (1), `NIGHTLY_BACKUP` (1), `ADMIN_USERNAME` + `ADMIN_PASSWORD_HASH_B64` (base64, compose `$` təhlükəsiz; yalnız admin yoxdursa yaradılır) (hash: `printf '%s' "$PAROL" | npm run admin:create -- --hash | base64 -w0`).

## Yoxlama

```bash
npm run typecheck && npm test && npm run build
npm run e2e        # server 127.0.0.1:8787-də işləyərkən; ekran şəkilləri shots/-a yazılır
node e2e/mockup.mjs  # telefon maketləri (shots/mockup-*.png)
node e2e/cleanup.mjs # e2e qalıqlarını silir
```

- `tests/api.test.ts` (vitest, 22 test): menyu + ETag/304, seed, auth (scrypt, cookie bayraqları, rate limit, logout, parol dəyişmə), CSRF və Origin, CRUD (məhsul, variant, kateqoriya sırası, özəllik, masa, QR), parametr validasiyası (ofisiant bayrağı açılmır), şəkil yükləmə (EXIF silinir, yanlış tip/SVG/PHP, böyük/kiçik fayl, path traversal), backup zip və gecəlik rotasiya, diakritiksiz axtarış.
- `e2e/run.mjs` (puppeteer, 130 yoxlama): 390 və 360 px, tünd və açıq tema; menyu, tab, axtarış ("cigirtma" → "çığırtma"), məhsul pəncərəsi, variant + əlavə, səbət, qeyd, xidmət haqqı, "Ofisianta göstər", dil AZ/EN/RU, tema, offline ikinci açılış; admin: giriş, foto ilə məhsul yaratma, sürətli qiymət, "yoxdur" keçidi, kateqoriya sürüklə-sırala, QR çap səhifəsi. Hər ekranda konsol xətası 0, üfüqi daşma 0, şrift fallback 0 (CDP `CSS.getPlatformFontsForNode`).

## Struktur

```
server/            Fastify app, SQLite, auth, şəkil, backup, seed
  routes/public.ts   GET /api/menu (ETag)
  routes/admin.ts    /api/admin/* (sessiya + CSRF)
  modules/waiter/    ofisiant modulu üçün yer (söndürülüb, plan README-də)
  cli/               admin-create, backup
web/
  index.html, src/menu/   müştəri menyusu
  admin/, src/admin/      admin panel
  src/shared/             şriftlər, tokenlər, ikonlar, kataloq
  public/                 sw.js, Onest woff2 (latin, latin-ext, kiril), manifest
seed/img/          nümunə şəkillər (Higgsfield)
tests/, e2e/       vitest və puppeteer
```

## Dizayn

- Tünd bənövşəyi əsas tema (#0c0716 fon, bənövşəyi→fuksiya gradient), açıq tema (lavanda-ağ fon, eyni aksent). Aksent admin-dən dəyişir (5 variant).
- Şrift: **Onest** hər yerdə (başlıqlar 750-800 çəki). ə, Ə, ₼ və kiril qlifləri yoxlanıb, şriftlər öz serverimizdən verilir.
- Şüşə effekti yalnız şəkil və məzmun üzərində üzən elementlərdə: aşağı navbar, sticky tablar, hero çipləri.
- Slop yoxlaması (10 əlamət): 1-2 (bənövşəyi gradient) sahibin istəyidir; 7 (boş səbət ikonu başlıq üstündə) yalnız boş vəziyyətdə; qalanları yoxdur. Kompozisiya "Explore" səthi: foto hero, sticky tablar, sevilənlər lenti, foto üstünlüklü siyahı.

## API qısaca

- `GET /api/menu` ictimai menyu (gizli məhsul və kateqoriyalar daxil deyil), `ETag` ilə.
- `POST /api/admin/login`, `POST /logout`, `GET /me`, `POST /password`
- `GET /api/admin/data` admin üçün hamısı
- `POST|PUT|PATCH|DELETE /api/admin/items[/:id]`, `POST /items/reorder`
- `/categories`, `/features`, `/tables` (+ `GET /tables/:id/qr.svg|png`), `PUT /settings`
- `POST /upload` (multipart, 8 MB), `GET /backup` (zip), `GET /backups`, `GET /audit`

Dəyişdirən sorğular `x-csrf-token` (girişdə verilir) və eyni Origin tələb edir. Sessiya: httpOnly, Secure, SameSite=Strict cookie, 7 gün. Giriş: IP+istifadəçi üzrə 15 dəqiqədə 5 uğursuz cəhd.

## Ofisiant funksiyaları (növbəti mərhələ)

İndi yoxdur, yeri hazırdır:
- Frontend: `NAV_SLOTS`-da `waiter` slotu (`web/src/menu/main.ts`), `settings.waiter_enabled` true olanda görünür.
- Admin: Parametrlərdə "Ofisiant funksiyaları (tezliklə)" söndürülmüş keçid.
- Server: `server/modules/waiter/index.ts` (boş qeydiyyat) və `server/modules/waiter/README.md`-də `orders`, `order_lines`, `waiter_calls`, `staff` cədvəllərinin sxemi və axın.

## Backup

- Admin → Parametrlər → "İndi yüklə": baza (`db.backup` ilə ardıcıl surət) + `uploads/` zip.
- Server hər gecə 03:00-dan sonra `data/backups/yuxa-YYYY-MM-DD.zip` yazır, son 14 nüsxəni saxlayır.
- Əl ilə: `npm run backup`.

## Deploy (yuxa.az, Coolify)

Hələ deploy edilməyib. Lazım olanlar:
1. Coolify-da yeni Application: bu repo, build pack **Dockerfile** (və ya docker-compose.yml), port **8787**.
2. Domen: `https://yuxa.az` (DNS artıq serverə baxır), Coolify/Traefik SSL verir.
3. Persistent volume: `/app/data` (baza, şəkillər, backup).
4. Env: `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH_B64` (base64, compose `$` təhlükəsiz; yalnız admin yoxdursa yaradılır) (və ya deploydan sonra konteynerdə `node dist-server/server/cli/admin-create.js admin`, parol stdin-dən).
5. Deploydan sonra admin → Parametrlər → "Saytın ünvanı" `https://yuxa.az` olsun (QR-lar buna görə yaranır), nümunə məhsulları real menyu ilə əvəz edin, Masalar → Çap səhifəsi.
