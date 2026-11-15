import type { Lang } from '../shared/catalog.js';

const az = {
  menu: 'Menyu', search: 'Axtarış', cart: 'Səbət', waiter: 'Ofisiant', info: 'Məkan',
  table: 'Masa', open: 'Açıqdır', closed: 'Bağlıdır', until: (t: string) => `${t}-dək`, opens: (t: string) => `açılış ${t}`,
  opensDay: (d: string, t: string) => `${d}, açılış ${t}`,
  featured: 'Ən çox sevilənlər', searchPh: 'Yemək və ya içki axtarın', searchHint: 'Məsələn: qutab, çay, kabab',
  noResults: 'Bu sözə uyğun heç nə tapılmadı', add: 'Səbətə əlavə et', update: 'Yenilə', added: 'Səbətə əlavə olundu',
  unavailable: 'Hal-hazırda yoxdur', from: 'başlayan', min: 'dəq', ingredients: 'Tərkibi', allergens: 'Allergenlər',
  size: 'Seçim', extras: 'Əlavələr', choose: 'Seçin', cartTitle: 'Səbətiniz', cartEmpty: 'Səbət hələ boşdur',
  cartEmptySub: 'Bəyəndiyiniz yeməyə toxunun və səbətə əlavə edin.', toMenu: 'Menyuya keç',
  subtotal: 'Məbləğ', service: (p: number) => `Xidmət haqqı ${p}%`, total: 'Cəmi',
  showWaiter: 'Ofisianta göstər', showHint: 'Sifarişi ofisiant qəbul edəcək. Bu ekranı ona göstərin.',
  note: 'Qeyd', notePh: 'Məsələn: soğansız', addNote: 'Qeyd əlavə et', clear: 'Səbəti təmizlə', clearAsk: 'Səbət təmizlənsin?',
  order: 'Sifariş', close: 'Bağla', items: (n: number) => `${n} məhsul`, gone: 'Bu məhsul indi yoxdur',
  address: 'Ünvan', phone: 'Telefon', wifi: 'Wi-Fi', password: 'Parol', hours: 'İş saatları', copy: 'Kopyala', copied: 'Kopyalandı',
  sample: 'Nümunə menyu: yeməklər və qiymətlər real deyil.', offline: 'İnternet yoxdur, saxlanmış menyu göstərilir',
  theme: 'Tema', lang: 'Dil', qty: 'Say', day: ['Bazar ertəsi', 'Çərşənbə axşamı', 'Çərşənbə', 'Cümə axşamı', 'Cümə', 'Şənbə', 'Bazar'],
  dayClosed: 'bağlı', today: 'bu gün', tomorrow: 'Sabah', legend: 'Nişanlar', loadErr: 'Menyunu yükləmək olmadı', retry: 'Yenidən cəhd et',
  units: {} as Record<string, string>,
};
type Dict = typeof az;

const en: Dict = {
  ...az,
  menu: 'Menu', search: 'Search', cart: 'Cart', waiter: 'Waiter', info: 'Venue',
  table: 'Table', open: 'Open', closed: 'Closed', until: (t) => `until ${t}`, opens: (t) => `opens at ${t}`,
  opensDay: (d, t) => `opens ${d} at ${t}`,
  featured: 'Guest favourites', searchPh: 'Search dishes or drinks', searchHint: 'For example: qutab, tea, kebab',
  noResults: 'Nothing matches that search', add: 'Add to cart', update: 'Update', added: 'Added to cart',
  unavailable: 'Not available now', from: 'from', min: 'min', ingredients: 'Ingredients', allergens: 'Allergens',
  size: 'Choose one', extras: 'Extras', choose: 'Choose', cartTitle: 'Your cart', cartEmpty: 'Your cart is empty',
  cartEmptySub: 'Tap a dish you like and add it here.', toMenu: 'Go to menu',
  subtotal: 'Subtotal', service: (p) => `Service ${p}%`, total: 'Total',
  showWaiter: 'Show to waiter', showHint: 'Your waiter will take the order. Show them this screen.',
  note: 'Note', notePh: 'For example: no onion', addNote: 'Add a note', clear: 'Clear cart', clearAsk: 'Clear the cart?',
  order: 'Order', close: 'Close', items: (n) => `${n} ${n === 1 ? 'item' : 'items'}`, gone: 'This item is not available now',
  address: 'Address', phone: 'Phone', wifi: 'Wi-Fi', password: 'Password', hours: 'Opening hours', copy: 'Copy', copied: 'Copied',
  sample: 'Sample menu: dishes and prices are not real.', offline: 'You are offline, showing the saved menu',
  theme: 'Theme', lang: 'Language', qty: 'Qty', day: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
  dayClosed: 'closed', today: 'today', tomorrow: 'tomorrow', legend: 'Labels', loadErr: 'Could not load the menu', retry: 'Try again',
  units: { 'əd': 'pcs', q: 'g', ml: 'ml', 'nəfər': 'pers.', l: 'l', kq: 'kg' },
};
const ru: Dict = {
  ...az,
  menu: 'Меню', search: 'Поиск', cart: 'Корзина', waiter: 'Официант', info: 'О нас',
  table: 'Стол', open: 'Открыто', closed: 'Закрыто', until: (t) => `до ${t}`, opens: (t) => `откроется в ${t}`,
  opensDay: (d, t) => `откроется: ${d}, ${t}`,
  featured: 'Любимое гостями', searchPh: 'Найти блюдо или напиток', searchHint: 'Например: кутаб, чай, кебаб',
  noResults: 'Ничего не найдено', add: 'В корзину', update: 'Обновить', added: 'Добавлено в корзину',
  unavailable: 'Сейчас нет', from: 'от', min: 'мин', ingredients: 'Состав', allergens: 'Аллергены',
  size: 'Вариант', extras: 'Добавки', choose: 'Выберите', cartTitle: 'Ваша корзина', cartEmpty: 'Корзина пока пуста',
  cartEmptySub: 'Нажмите на блюдо, которое нравится, и добавьте его сюда.', toMenu: 'Перейти в меню',
  subtotal: 'Сумма', service: (p) => `Обслуживание ${p}%`, total: 'Итого',
  showWaiter: 'Показать официанту', showHint: 'Заказ примет официант. Покажите ему этот экран.',
  note: 'Комментарий', notePh: 'Например: без лука', addNote: 'Добавить комментарий', clear: 'Очистить корзину', clearAsk: 'Очистить корзину?',
  order: 'Заказ', close: 'Закрыть', items: (n) => `${n} поз.`, gone: 'Этого блюда сейчас нет',
  address: 'Адрес', phone: 'Телефон', wifi: 'Wi-Fi', password: 'Пароль', hours: 'Часы работы', copy: 'Копировать', copied: 'Скопировано',
  sample: 'Пример меню: блюда и цены не настоящие.', offline: 'Нет интернета, показано сохранённое меню',
  theme: 'Тема', lang: 'Язык', qty: 'Кол-во', day: ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'],
  dayClosed: 'выходной', today: 'сегодня', tomorrow: 'завтра', legend: 'Значки', loadErr: 'Не удалось загрузить меню', retry: 'Повторить',
  units: { 'əd': 'шт', q: 'г', ml: 'мл', 'nəfər': 'чел.', l: 'л', kq: 'кг' },
};

export const DICT: Record<Lang, Dict> = { az, en, ru };
export type { Dict };
