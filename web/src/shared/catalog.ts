/** Server və hər iki frontend üçün ortaq kataloq: allergenlər, ikonlar, rənglər. */
export const ALLERGENS: Record<string, { az: string; en: string; ru: string }> = {
  gluten: { az: 'Qlüten', en: 'Gluten', ru: 'Глютен' },
  milk: { az: 'Süd', en: 'Milk', ru: 'Молоко' },
  egg: { az: 'Yumurta', en: 'Egg', ru: 'Яйцо' },
  nuts: { az: 'Qoz-fındıq', en: 'Nuts', ru: 'Орехи' },
  sesame: { az: 'Küncüt', en: 'Sesame', ru: 'Кунжут' },
  fish: { az: 'Balıq', en: 'Fish', ru: 'Рыба' },
  soy: { az: 'Soya', en: 'Soy', ru: 'Соя' },
  mustard: { az: 'Xardal', en: 'Mustard', ru: 'Горчица' },
};

/** 24×24 stroke ikonları (path d). */
export const ICONS: Record<string, string> = {
  star: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z',
  leaf: 'M5 19c0-8 5-13 14-14-1 9-6 14-14 14zm0 0 7-7',
  chili: 'M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-6 1-9z',
  sparkle: 'M12 3v4M12 17v4M3 12h4M17 12h4M6.5 6.5l2.5 2.5M15 15l2.5 2.5M17.5 6.5 15 9M9 15l-2.5 2.5',
  drop: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z',
  heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  wheat: 'M12 21V9M12 9c-2-1-3-3-3-5 2 0 3 1.5 3 3 0-1.5 1-3 3-3 0 2-1 4-3 5zM12 14c-2-1-3-3-3-5M12 14c2-1 3-3 3-5',
  fish: 'M3 12c3-4 7-5 10-5 3 0 5 2 8 5-3 3-5 5-8 5-3 0-7-1-10-5zm0 0-1-3m1 3-1 3',
  child: 'M12 7a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM8 22v-6l-2-5h12l-2 5v6',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  crown: 'M3 8l4 4 5-7 5 7 4-4-2 11H5z',
  snow: 'M12 2v20M4 7l16 10M20 7 4 17',
};

export const FEATURE_COLORS = ['#f5b971', '#7dd3a8', '#ff8a8a', '#c4b5fd', '#7cc7ff', '#f9a8d4', '#fde68a', '#a5b4fc'];

export interface L3 { az: string; en: string; ru: string }
export type Lang = 'az' | 'en' | 'ru';

export const fold = (s: string): string =>
  s.toLocaleLowerCase('az')
    .replace(/i̇/g, 'i')
    .replace(/[əä]/g, 'e').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ü/g, 'u')
    .replace(/ç/g, 'c').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ё/g, 'е')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
