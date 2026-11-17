/* منطق مشترك بين المتصفح والخادم: البيانات الافتراضية، الترقية، والمزامنة */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
/* قائمة المقهى الحقيقية (Cafe Shop Meknes) — الأثمنة بالدرهم */
const HOT = 'المشروبات الساخنة', JUICE = 'العصائر', ICED = 'آيس كوفي', MOJITO = 'موخيطو', CREPE = 'الكريب', WAFFLE = 'الكوفر';
const MENU = [
  ['قهوة + ماء', HOT, 10], ['قهوة حليب', HOT, 10], ['أنفيزيون', HOT, 10], ['زعتر', HOT, 10], ['لويزة', HOT, 10],
  ['ليبتون', HOT, 10], ['زنجبيل', HOT, 10], ['أعشاب', HOT, 10], ['شاي', HOT, 10], ['كابوتشينو', HOT, 11],
  ['عصير حامض', JUICE, 13], ['عصير تفاح', JUICE, 13], ['عصير بنان', JUICE, 13], ['عصير أفوكا', JUICE, 15],
  ['عصير ليمون', JUICE, 15], ['عصير مانجا', JUICE, 18], ['عصير كيوي', JUICE, 18], ['عصير أناناس', JUICE, 18],
  ['عصير فريز', JUICE, 18], ['باناشي', JUICE, 24],
  ['آيس كوفي شوكولا', ICED, 16], ['آيس كوفي فاني', ICED, 16], ['آيس كوفي كراميل', ICED, 16], ['آيس كوفي أوريو', ICED, 18],
  ['آيس كوفي لوتوس', ICED, 18], ['آيس كوفي نتيلا', ICED, 18], ['آيس كوفي كيندر', ICED, 18], ['آيس كوفي بيستاج', ICED, 18],
  ['آيس موكا', ICED, 18],
  ['موخيطو كلاسيك', MOJITO, 15], ['موخيطو بلو بيري', MOJITO, 18], ['موخيطو أناناس', MOJITO, 18], ['موخيطو فريز', MOJITO, 18],
  ['موخيطو كيوي', MOJITO, 18], ['موخيطو مانج', MOJITO, 18], ['الكركدية (بسام)', MOJITO, 15],
  ['كريب شوكولا', CREPE, 13], ['كريب بنان', CREPE, 16], ['كريب كيت كات', CREPE, 18], ['كريب أوريو', CREPE, 18],
  ['كريب نتيلا', CREPE, 20], ['كريب كيندر', CREPE, 20], ['كريب لوتوس', CREPE, 20], ['كريب ميلكا', CREPE, 20], ['كريب سبيسيال', CREPE, 25],
  ['كوفر شوكولا', WAFFLE, 13], ['كوفر بنان', WAFFLE, 16], ['كوفر كيت كات', WAFFLE, 18], ['كوفر أوريو', WAFFLE, 18],
  ['كوفر نتيلا', WAFFLE, 20], ['كوفر لوتوس', WAFFLE, 20], ['كوفر ميلكا', WAFFLE, 20], ['كوفر سبيسيال', WAFFLE, 25],
];
const MENU_VERSION = 2;
function menuProducts() { return MENU.map(([name, category, price]) => ({ id: uid(), name, category, price })); }
// أسماء القائمة التجريبية القديمة: إن لم يعدّلها صاحب المقهى، تُستبدل بالقائمة الحقيقية
const OLD_DEMO_MENU = ['قهوة سوداء', 'قهوة نص نص', 'كابتشينو', 'أتاي بالنعناع', 'شوكولا ساخنة', 'عصير برتقال', 'عصير أفوكادو', 'بانشي',
  'كوكا كولا', 'ماء معدني', 'هاواي', 'كرواسون', 'مسمن', 'ساندويتش', 'بيتزا صغيرة', 'شيبس', 'شوكولاتة'];
// يرجع true إذا تغيّر شيء يجب حفظه
function upgradeMenu(st) {
  if ((st.settings.menuVersion || 1) >= MENU_VERSION) return false;
  const names = (st.products || []).map(p => p.name);
  const untouched = !names.length || (names.length === OLD_DEMO_MENU.length && names.every(n => OLD_DEMO_MENU.includes(n)));
  if (untouched) st.products = menuProducts();
  st.settings = { ...st.settings, menuVersion: MENU_VERSION };
  return true;
}

function ps4Stations(n, from = 1) {
  return Array.from({ length: n }, (_, i) => ({ id: uid(), name: `بلاي 4 — ${i + from}`, type: 'game', icon: '🎮' }));
}

const DEFAULT_STATE = () => ({
  version: 2,
  settings: { name: 'مقهى مكناس', currency: 'درهم', round: 15, min: 30, grace: 2, hourRate: 12, matchRate: 4, menuVersion: MENU_VERSION, footer: 'شكراً لزيارتكم — نتمنى لكم وقتاً ممتعاً' },
  products: menuProducts(),
  stations: [
    ...[1, 2, 3, 4, 5, 6].map(n => ({ id: uid(), name: `طاولة ${n}`, type: 'table', icon: '☕' })),
    { id: uid(), name: 'سفري', type: 'table', icon: '🥡' },
    ...ps4Stations(4),
  ],
  users: {
    owner: { title: 'صاحب المقهى', hash: null },
    manager: { title: 'مدير المقهى', hash: null },
  },
  open: {},
  sales: [],
  seq: 1,
});

// ترقية البيانات القديمة: صالة الألعاب أصبحت بلاي 4 فقط بثمن موحد (ساعة / مباراة)
function migrate(st) {
  const def = DEFAULT_STATE();
  const savedMenuVersion = st.settings?.menuVersion; // لا نأخذ رقم نسخة القائمة من القيم الافتراضية
  st.settings = Object.assign({}, def.settings, st.settings, { menuVersion: savedMenuVersion });
  st.users = Object.assign({}, def.users, st.users);
  upgradeMenu(st);
  if ((st.version || 1) < 2) {
    const oldGames = st.stations.filter(s => s.type === 'game');
    oldGames.forEach(s => delete st.open[s.id]);
    st.stations = [...st.stations.filter(s => s.type !== 'game'), ...ps4Stations(4)];
    st.version = 2;
  }
  return st;
}

/* ===== المزامنة: حساب الفرق بين نسختين وتطبيقه =====
   شكل الفرق (patch):
   { settings?, products?, stations?, seq?, open?: { [stationId]: order | null }, salesAdd?: [sale], salesDel?: [id] } */
const WHOLE_KEYS = ['settings', 'products', 'stations'];
const J = v => JSON.stringify(v);
function diffState(base, cur) {
  const p = {};
  for (const k of WHOLE_KEYS) if (J(base[k]) !== J(cur[k])) p[k] = cur[k];
  const open = {};
  for (const id of new Set([...Object.keys(base.open || {}), ...Object.keys(cur.open || {})])) {
    const a = base.open?.[id], b = cur.open?.[id];
    if (J(a) !== J(b)) open[id] = b ?? null;
  }
  if (Object.keys(open).length) p.open = open;
  const baseIds = new Set(base.sales.map(s => s.id)), curIds = new Set(cur.sales.map(s => s.id));
  const add = cur.sales.filter(s => !baseIds.has(s.id));
  const del = base.sales.filter(s => !curIds.has(s.id)).map(s => s.id);
  if (add.length) p.salesAdd = add;
  if (del.length) p.salesDel = del;
  return Object.keys(p).length ? p : null;
}
function applyPatch(st, p) {
  for (const k of WHOLE_KEYS) if (p[k] !== undefined) st[k] = clone(p[k]);
  if (p.seq !== undefined) st.seq = p.seq;
  if (p.open) for (const [id, o] of Object.entries(p.open)) { if (o) st.open[id] = clone(o); else delete st.open[id]; }
  if (p.salesDel) { const d = new Set(p.salesDel); st.sales = st.sales.filter(s => !d.has(s.id)); }
  if (p.salesAdd) for (const sale of p.salesAdd) {
    const i = st.sales.findIndex(s => s.id === sale.id);
    if (i >= 0) st.sales[i] = clone(sale); else st.sales.push(clone(sale));
  }
  return st;
}
const clone = v => v === undefined ? v : JSON.parse(JSON.stringify(v));

return { uid, ps4Stations, DEFAULT_STATE, migrate, upgradeMenu, menuProducts, diffState, applyPatch, clone };
});
