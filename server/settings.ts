import type { DB, L3 } from './db.js';

export type Day = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export const DAYS: Day[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export interface DayHours { open: string; close: string; closed: boolean }

export interface Settings {
  venue_name: string;
  tagline: L3;
  address: L3;
  phone: string;
  wifi_name: string;
  wifi_password: string;
  instagram: string;
  hours: Record<Day, DayHours>;
  timezone: string;
  service_percent: number;
  currency: string;
  default_theme: 'dark' | 'light';
  accent: string;
  logo: string | null;
  hero_image: string | null;
  public_url: string;
  sample_notice: boolean;
  /** Ofisiant funksiyaları: hələlik həmişə false. Bax: server/modules/waiter */
  waiter_enabled: boolean;
}

const week = (open: string, close: string): Record<Day, DayHours> =>
  Object.fromEntries(DAYS.map((d) => [d, { open, close, closed: false }])) as Record<Day, DayHours>;

export const DEFAULT_SETTINGS: Settings = {
  venue_name: 'Yuxa',
  tagline: {
    az: 'Yuxanı hər səhər sacda bişiririk. Qutab, rulet və ev yeməkləri.',
    en: 'Fresh yuxa baked on the sac every morning. Qutab, rolls and home cooking.',
    ru: 'Юху печём на садже каждое утро. Кутабы, рулеты и домашняя кухня.',
  },
  address: { az: 'Nümunə küçəsi 12, Bakı', en: '12 Sample St, Baku', ru: 'ул. Образцовая 12, Баку' },
  phone: '+994 12 000 00 00',
  wifi_name: 'yuxa-guest',
  wifi_password: '',
  instagram: '',
  hours: week('08:00', '23:00'),
  timezone: 'Asia/Baku',
  service_percent: 10,
  currency: '₼',
  default_theme: 'dark',
  accent: 'violet',
  logo: null,
  hero_image: null,
  public_url: 'https://yuxa.az',
  sample_notice: true,
  waiter_enabled: false,
};

export const ACCENTS = ['violet', 'plum', 'orchid', 'indigo', 'amber'] as const;

export function getSettings(db: DB): Settings {
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const s: Record<string, unknown> = structuredClone(DEFAULT_SETTINGS) as unknown as Record<string, unknown>;
  for (const r of rows) {
    try { s[r.key] = JSON.parse(r.value); } catch { /* ignore broken */ }
  }
  const out = s as unknown as Settings;
  out.waiter_enabled = false; // hələlik söndürülüb, API ilə açılmır
  return out;
}

const str = (v: unknown, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) : undefined);
const l3 = (v: unknown, max = 400): L3 | undefined => {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  return { az: str(o.az, max) ?? '', en: str(o.en, max) ?? '', ru: str(o.ru, max) ?? '' };
};
const time = (v: unknown) => (typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : undefined);

/** Yalnız tanınan və düzgün açarları saxlayır. Qaytarır: dəyişən açarlar. */
export function saveSettings(db: DB, patch: Record<string, unknown>): string[] {
  const cur = getSettings(db);
  const next: Partial<Settings> = {};
  const p = patch;
  if (str(p.venue_name, 60)) next.venue_name = str(p.venue_name, 60);
  for (const k of ['tagline', 'address'] as const) { const v = l3(p[k]); if (v) next[k] = v; }
  for (const k of ['phone', 'wifi_name', 'wifi_password', 'instagram'] as const) {
    const v = str(p[k], 80); if (v !== undefined) next[k] = v;
  }
  const pu = str(p.public_url, 200);
  if (pu !== undefined && /^https?:\/\/[a-z0-9.-]+(:\d+)?(\/[\w\-./]*)?$/i.test(pu)) next.public_url = pu.replace(/\/+$/, '');
  if (typeof p.service_percent === 'number' && p.service_percent >= 0 && p.service_percent <= 30) next.service_percent = Math.round(p.service_percent * 10) / 10;
  const cur2 = str(p.currency, 4); if (cur2) next.currency = cur2;
  if (p.default_theme === 'dark' || p.default_theme === 'light') next.default_theme = p.default_theme;
  if (typeof p.accent === 'string' && (ACCENTS as readonly string[]).includes(p.accent)) next.accent = p.accent;
  if (typeof p.sample_notice === 'boolean') next.sample_notice = p.sample_notice;
  for (const k of ['logo', 'hero_image'] as const) {
    if (p[k] === null) next[k] = null;
    else if (typeof p[k] === 'string' && /^[a-z0-9]{6,40}$/.test(p[k] as string)) next[k] = p[k] as string;
  }
  if (p.hours && typeof p.hours === 'object') {
    const h = structuredClone(cur.hours);
    const src = p.hours as Record<string, Partial<DayHours>>;
    for (const d of DAYS) {
      const x = src[d]; if (!x) continue;
      h[d] = { open: time(x.open) ?? h[d].open, close: time(x.close) ?? h[d].close, closed: !!x.closed };
    }
    next.hours = h;
  }
  const ins = db.prepare('INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
  const changed: string[] = [];
  db.transaction(() => {
    for (const [k, v] of Object.entries(next)) {
      if (JSON.stringify((cur as unknown as Record<string, unknown>)[k]) !== JSON.stringify(v)) changed.push(k);
      ins.run(k, JSON.stringify(v));
    }
  })();
  return changed;
}

export function publicSettings(s: Settings) {
  const { wifi_password, ...rest } = s;
  return { ...rest, wifi_password: wifi_password || '' };
}
