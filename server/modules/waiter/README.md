# Ofisiant modulu (plan, hələlik söndürülüb)

Bu gün müştəri səbəti yalnız telefonda saxlanır və "Ofisianta göstər" ekranı ilə sözlə təqdim olunur.
Serverə sifariş getmir. Bu qovluq sonrakı mərhələ üçün yerdir.

## Planlaşdırılan cədvəllər

```sql
CREATE TABLE staff (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, pin_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('waiter','manager')), active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE orders (
  id INTEGER PRIMARY KEY, table_id INTEGER NOT NULL REFERENCES tables_(id),
  status TEXT NOT NULL CHECK (status IN ('new','accepted','served','paid','cancelled')),
  note TEXT, subtotal INTEGER NOT NULL, service INTEGER NOT NULL, total INTEGER NOT NULL,
  client_token TEXT NOT NULL,            -- səbəti göndərən cihaz (spam limiti üçün)
  staff_id INTEGER REFERENCES staff(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT
);
CREATE TABLE order_lines (
  id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL, name_snapshot TEXT NOT NULL, variant_snapshot TEXT, addons_snapshot TEXT,
  qty INTEGER NOT NULL, unit_price INTEGER NOT NULL, note TEXT
);
CREATE TABLE waiter_calls (
  id INTEGER PRIMARY KEY, table_id INTEGER NOT NULL REFERENCES tables_(id),
  reason TEXT NOT NULL CHECK (reason IN ('call','bill','help')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','done')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')), done_by INTEGER REFERENCES staff(id)
);
```

## Axın

1. Müştəri səbətdə "Sifarişi göndər" basır, `POST /api/orders` (masa kodu, sətirlər). Qiymətlər serverdə yenidən hesablanır.
2. Ofisiant paneli (`/staff`, PIN ilə giriş) SSE ilə yeni sifariş və çağırışları canlı görür.
3. Müştəri nav-da "Ofisiant" düyməsi ilə `POST /api/waiter-calls` göndərir (masa başına dəqiqədə 1 limit).

## Frontend-də hazır yerlər

- `web/src/menu/main.ts`: `NAV_SLOTS`-da `waiter` slotu, `settings.waiter_enabled` true olanda görünür.
- `web/src/admin/main.ts`: Parametrlərdə "Ofisiant funksiyaları (tezliklə)" söndürülmüş keçid.
