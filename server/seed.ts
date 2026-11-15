/**
 * NÜMUNƏ MƏLUMAT. Bu yeməklər, qiymətlər və şəkillər dizayn nümunəsidir, real menyu deyil.
 * Baza boş olanda bir dəfə yüklənir. Admin paneldə "Nümunə menyu" bildirişi bununla bağlıdır.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { DB, L3, Option } from './db.js';
import { processImage } from './images.js';

const L = (az: string, en = '', ru = ''): L3 => ({ az, en, ru });
const opt = (id: string, az: string, en: string, ru: string, price: number): Option => ({ id, name: L(az, en, ru), price });

export const SEED_FEATURES = [
  { key: 'sig', name: L('İmza yeməyi', 'Signature', 'Фирменное'), icon: 'star', color: '#f5b971' },
  { key: 'veg', name: L('Vegetarian', 'Vegetarian', 'Вегетарианское'), icon: 'leaf', color: '#7dd3a8' },
  { key: 'hot', name: L('Acılı', 'Spicy', 'Острое'), icon: 'chili', color: '#ff8a8a' },
  { key: 'new', name: L('Yeni', 'New', 'Новинка'), icon: 'sparkle', color: '#c4b5fd' },
  { key: 'cool', name: L('Sərinləşdirici', 'Refreshing', 'Освежающее'), icon: 'drop', color: '#7cc7ff' },
];

type SeedItem = [L3, L3, number, string, string[], number, string?, Partial<{ ing: L3; all: string[]; variants: Option[]; addons: Option[]; featured: boolean; available: boolean }>?];

const CATS: { name: L3; note: L3; items: SeedItem[] }[] = [
  { name: L('Qutablar', 'Qutab', 'Кутабы'), note: L('Sacda, kərə yağı ilə. Sumaq və qatıqla verilir.', 'Cooked on the sac with butter. Served with sumac and yoghurt.', 'На садже, со сливочным маслом. С сумахом и катыком.'), items: [
    [L('Göyərtili qutab', 'Herb qutab', 'Кутаб с зеленью'), L('Şüyüd, keşniş, cəfəri, yaşıl soğan', 'Dill, coriander, parsley, spring onion', 'Укроп, кинза, петрушка, зелёный лук'), 180, '1 əd', ['veg', 'sig'], 8, 'qutab', { all: ['gluten', 'milk'], featured: true, ing: L('Yuxa xəmiri, şüyüd, keşniş, cəfəri, yaşıl soğan, kərə yağı, sumaq', 'Yuxa dough, dill, coriander, parsley, spring onion, butter, sumac', 'Тесто юха, укроп, кинза, петрушка, зелёный лук, масло, сумах') }],
    [L('Ətli qutab', 'Lamb qutab', 'Кутаб с бараниной'), L('Qoyun əti, soğan, nar', 'Minced lamb, onion, pomegranate', 'Баранина, лук, гранат'), 260, '1 əd', [], 10, undefined, { all: ['gluten', 'milk'] }],
    [L('Balqabaqlı qutab', 'Pumpkin qutab', 'Кутаб с тыквой'), L('Balqabaq, nar dənəsi, darçın', 'Pumpkin, pomegranate seeds, cinnamon', 'Тыква, гранат, корица'), 200, '1 əd', ['veg', 'new'], 8, undefined, { all: ['gluten', 'milk'] }],
    [L('Pendirli qutab', 'Cheese qutab', 'Кутаб с сыром'), L('Motal pendiri, göyərti', 'Motal cheese, herbs', 'Сыр мотал, зелень'), 240, '1 əd', ['veg'], 8, undefined, { all: ['gluten', 'milk'] }],
    [L('Qutab dəsti', 'Qutab set', 'Сет кутабов'), L('Hər növdən ikisi, 8 ədəd', 'Two of each kind, 8 pieces', 'По два каждого вида, 8 шт'), 1500, '8 əd', ['sig'], 15, 'qutab', { all: ['gluten', 'milk'], addons: [opt('qatiq', 'Əlavə qatıq', 'Extra yoghurt', 'Доп. катык', 100), opt('sumaq', 'Əlavə sumaq', 'Extra sumac', 'Доп. сумах', 50)] }],
  ] },
  { name: L('Yuxa ruletləri', 'Yuxa rolls', 'Рулеты из юхи'), note: L('İsti yuxaya bükülür, kəsib verilir.', 'Rolled in warm yuxa and sliced.', 'Сворачиваем в тёплую юху и нарезаем.'), items: [
    [L('Pendirli rulet', 'Cheese & herb roll', 'Рулет с сыром'), L('Ağ pendir, göyərti, pomidor', 'White cheese, herbs, tomato', 'Белый сыр, зелень, помидор'), 650, '8 əd', ['veg', 'sig'], 7, 'rulet', { all: ['gluten', 'milk'], featured: true }],
    [L('Toyuqlu rulet', 'Chicken roll', 'Рулет с курицей'), L('Közdə toyuq, qatıqlı sous, kahı', 'Grilled chicken, yoghurt sauce, lettuce', 'Курица на углях, соус из катыка, салат'), 850, '8 əd', [], 10, undefined, { all: ['gluten', 'milk'] }],
    [L('Lüləli yuxa', 'Lula in yuxa', 'Люля в юхе'), L('Lülə kabab, sumaqlı soğan, göyərti', 'Lula kebab, sumac onion, herbs', 'Люля-кебаб, лук с сумахом, зелень'), 1000, '300 q', ['hot'], 15, undefined, { all: ['gluten'] }],
  ] },
  { name: L('Şorbalar', 'Soups', 'Супы'), note: L('', '', ''), items: [
    [L('Düşbərə', 'Dushbara', 'Дюшбара'), L('Kiçik düşbərə, quzu bulyonu, quru nanə. Sarımsaqlı sirkə ilə.', 'Tiny dumplings in lamb broth, dried mint. With garlic vinegar.', 'Маленькие пельмени в бульоне, сушёная мята. С чесночным уксусом.'), 700, '350 ml', ['sig'], 12, 'dushbara', { all: ['gluten'], variants: [opt('half', 'Yarım porsiya', 'Half portion', 'Половина', 450), opt('full', 'Tam porsiya', 'Full portion', 'Полная', 700)] }],
    [L('Mərci şorbası', 'Lentil soup', 'Чечевичный суп'), L('Qırmızı mərci, limon, qızardılmış yuxa', 'Red lentils, lemon, crispy yuxa', 'Красная чечевица, лимон, хрустящая юха'), 500, '350 ml', ['veg'], 6, undefined, { all: ['gluten'] }],
    [L('Dovğa', 'Dovga', 'Довга'), L('Qatıq, göyərti, noxud. Soyuq və ya isti.', 'Yoghurt, herbs, chickpeas. Cold or warm.', 'Катык, зелень, нут. Холодная или тёплая.'), 450, '300 ml', ['veg', 'cool'], 5, undefined, { all: ['milk'] }],
  ] },
  { name: L('Salatlar', 'Salads', 'Салаты'), note: L('', '', ''), items: [
    [L('Közlənmiş badımcan', 'Smoked aubergine', 'Печёный баклажан'), L('Sarımsaq, qoz, nar şirəsi', 'Garlic, walnuts, pomegranate', 'Чеснок, грецкий орех, гранат'), 650, '220 q', ['veg', 'hot'], 6, 'salad', { all: ['nuts'] }],
    [L('Çoban salatı', 'Shepherd salad', 'Салат чобан'), L('Pomidor, xiyar, qırmızı soğan, nar', 'Tomato, cucumber, red onion, pomegranate', 'Помидор, огурец, красный лук, гранат'), 550, '250 q', ['veg'], 5, 'salad'],
    [L('Qatıq və göyərti', 'Yoghurt & herbs', 'Катык с зеленью'), L('Ev qatığı, təzə göyərti boşqabı', 'Homemade yoghurt, fresh herb plate', 'Домашний катык, тарелка зелени'), 400, '2 nəfər', ['veg'], 3, undefined, { all: ['milk'] }],
  ] },
  { name: L('İsti yeməklər', 'Mains', 'Горячее'), note: L('Közdə və sacda, sifarişlə hazırlanır.', 'Charcoal and sac, cooked to order.', 'На углях и садже, готовим под заказ.'), items: [
    [L('Lülə kabab', 'Lula kebab', 'Люля-кебаб'), L('Közdə, lavaş, sumaqlı soğan, közlənmiş tərəvəz', 'Charcoal-grilled, lavash, sumac onion, grilled vegetables', 'На углях, лаваш, лук с сумахом, овощи'), 1200, '250 q', [], 20, 'kebab', { featured: true, all: ['gluten'], variants: [opt('lamb', 'Quzu əti', 'Lamb', 'Баранина', 1200), opt('chicken', 'Toyuq', 'Chicken', 'Курица', 1000)], addons: [opt('lavash', 'Əlavə lavaş', 'Extra lavash', 'Доп. лаваш', 50), opt('tomato', 'Közlənmiş pomidor', 'Grilled tomato', 'Печёный помидор', 150), opt('ayran', 'Ayran', 'Ayran', 'Айран', 250)] }],
    [L('Toyuq çığırtması', 'Chicken chigirtma', 'Чыгыртма'), L('Pomidor, soğan və yumurta ilə', 'With tomatoes, onion and eggs', 'С помидорами, луком и яйцами'), 1300, '350 q', [], 20, undefined, { all: ['egg'] }],
    [L('Dolma üç bacı', 'Three-sister dolma', 'Долма «три сестры»'), L('Badımcan, bibər, pomidor; qatıq ilə', 'Aubergine, pepper, tomato; with yoghurt', 'Баклажан, перец, помидор; с катыком'), 1400, '6 əd', [], 20, undefined, { all: ['milk'] }],
    [L('Sac içi', 'Sac platter', 'Садж'), L('Ət, kartof, badımcan, bibər; sacda gəlir', 'Lamb, potatoes, aubergine, peppers; served on the sac', 'Баранина, картофель, баклажан, перец; на садже'), 3200, '2 nəfər', ['sig'], 30, undefined, { available: false }],
  ] },
  { name: L('Şirniyyat', 'Desserts', 'Десерты'), note: L('', '', ''), items: [
    [L('Şəkərbura və paxlava', 'Shekerbura & pakhlava', 'Шекербура и пахлава'), L('Əl işi, qoz və zəfəranla', 'Handmade, with walnuts and saffron', 'Ручная работа, грецкий орех, шафран'), 600, '4 əd', ['veg', 'sig'], 2, 'sweets', { all: ['gluten', 'nuts', 'egg'] }],
    [L('Şirin yuxa', 'Sweet yuxa', 'Сладкая юха'), L('Kərə yağı, bal, qoz, darçın', 'Butter, honey, walnuts, cinnamon', 'Масло, мёд, орех, корица'), 500, '1 əd', ['veg'], 8, undefined, { all: ['gluten', 'milk', 'nuts'] }],
    [L('Firni', 'Firni', 'Фирни'), L('Düyü unu, süd, darçın', 'Rice-flour milk pudding, cinnamon', 'Рисовый пудинг, корица'), 450, '180 q', ['veg'], 2, undefined, { all: ['milk'] }],
  ] },
  { name: L('Çay və içkilər', 'Tea & drinks', 'Чай и напитки'), note: L('Çay armudu stəkanda, mürəbbə ilə.', 'Tea in armudu glasses, with jam.', 'Чай в армуду, с вареньем.'), items: [
    [L('Çay dəsti', 'Tea set', 'Чайный набор'), L('Qara çay, iki mürəbbə, limon, nabat', 'Black tea, two jams, lemon, rock sugar', 'Чёрный чай, два варенья, лимон, набат'), 800, '2 nəfər', ['sig'], 5, 'tea', { featured: true, variants: [opt('p2', '2 nəfərlik', 'For 2', 'На двоих', 800), opt('p4', '4 nəfərlik', 'For 4', 'На четверых', 1400)] }],
    [L('Kəklikotu çayı', 'Thyme tea', 'Чай с чабрецом'), L('Dağ kəklikotu, bal', 'Mountain thyme, honey', 'Горный чабрец, мёд'), 500, '500 ml', [], 5],
    [L('Ayran', 'Ayran', 'Айран'), L('Ev qatığından, nanə ilə', 'Homemade, with mint', 'Домашний, с мятой'), 250, '300 ml', ['cool'], 1, undefined, { all: ['milk'] }],
    [L('Nar limonadı', 'Pomegranate lemonade', 'Гранатовый лимонад'), L('Təzə nar şirəsi, nanə, soda', 'Fresh pomegranate, mint, soda', 'Свежий гранат, мята, содовая'), 600, '400 ml', ['cool', 'new'], 3],
    [L('Espresso', 'Espresso', 'Эспрессо'), L(''), 350, '30 ml', [], 3],
    [L('Kapuçino', 'Cappuccino', 'Капучино'), L('', '', ''), 500, '300 ml', [], 4, undefined, { all: ['milk'], addons: [opt('oat', 'Yulaf südü', 'Oat milk', 'Овсяное молоко', 100), opt('syrup', 'Sirop', 'Syrup', 'Сироп', 80)] }],
  ] },
];

export async function seedIfEmpty(db: DB, dataDir: string, seedImgDir: string): Promise<boolean> {
  const n = (db.prepare('SELECT COUNT(*) c FROM categories').get() as { c: number }).c;
  if (n > 0) return false;
  const uploads = path.join(dataDir, 'uploads');
  const imgIds: Record<string, string> = {};
  if (fs.existsSync(seedImgDir)) {
    for (const f of fs.readdirSync(seedImgDir).filter((x) => x.endsWith('.webp'))) {
      const { id } = await processImage(fs.readFileSync(path.join(seedImgDir, f)), uploads);
      imgIds[f.replace('.webp', '')] = id;
    }
  }
  const tx = db.transaction(() => {
    const insF = db.prepare('INSERT INTO features(key,name,icon,color,sort) VALUES (?,?,?,?,?)');
    SEED_FEATURES.forEach((f, i) => insF.run(f.key, JSON.stringify(f.name), f.icon, f.color, i));
    const insC = db.prepare('INSERT INTO categories(name,note,sort) VALUES (?,?,?)');
    const insI = db.prepare(`INSERT INTO items(category_id,name,description,ingredients,price,portion,prep_min,image,features,allergens,variants,addons,featured,visible,available,sort)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)`);
    CATS.forEach((c, ci) => {
      const cid = Number(insC.run(JSON.stringify(c.name), JSON.stringify(c.note), ci).lastInsertRowid);
      c.items.forEach(([name, desc, price, portion, feats, mins, img, x = {}], ii) => {
        insI.run(cid, JSON.stringify(name), JSON.stringify(desc), JSON.stringify(x.ing ?? L('')), price, portion, mins,
          img ? imgIds[img] ?? null : null, JSON.stringify(feats), JSON.stringify(x.all ?? []),
          JSON.stringify(x.variants ?? []), JSON.stringify(x.addons ?? []), x.featured ? 1 : 0, x.available === false ? 0 : 1, ii);
      });
    });
    const insT = db.prepare('INSERT INTO tables_(code,name,sort) VALUES (?,?,?)');
    for (let i = 1; i <= 12; i++) insT.run(String(i), `Masa ${i}`, i);
    if (imgIds.hero) db.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES('hero_image',?)").run(JSON.stringify(imgIds.hero));
  });
  tx();
  return true;
}
