/* منطق مشترك بين المتصفح والخادم: البيانات الافتراضية، الترقية، والمزامنة */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function ps4Stations(n, from = 1) {
  return Array.from({ length: n }, (_, i) => ({ id: uid(), name: `بلاي 4 — ${i + from}`, type: 'game', icon: '🎮' }));
}

const DEFAULT_STATE = () => ({
  version: 2,
  settings: { name: 'مقهى مكناس', currency: 'درهم', round: 15, min: 30, grace: 2, hourRate: 12, matchRate: 4, footer: 'شكراً لزيارتكم — نتمنى لكم وقتاً ممتعاً' },
  products: [
    ['قهوة سوداء', 'مشروبات ساخنة', 8], ['قهوة نص نص', 'مشروبات ساخنة', 10], ['كابتشينو', 'مشروبات ساخنة', 15],
    ['أتاي بالنعناع', 'مشروبات ساخنة', 8], ['شوكولا ساخنة', 'مشروبات ساخنة', 15],
    ['عصير برتقال', 'عصائر', 15], ['عصير أفوكادو', 'عصائر', 20], ['بانشي', 'عصائر', 20],
    ['كوكا كولا', 'مشروبات باردة', 10], ['ماء معدني', 'مشروبات باردة', 6], ['هاواي', 'مشروبات باردة', 10],
    ['كرواسون', 'مأكولات', 6], ['مسمن', 'مأكولات', 6], ['ساندويتش', 'مأكولات', 25], ['بيتزا صغيرة', 'مأكولات', 35],
    ['شيبس', 'وجبات خفيفة', 5], ['شوكولاتة', 'وجبات خفيفة', 6],
  ].map(([name, category, price]) => ({ id: uid(), name, category, price })),
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
  st.settings = Object.assign({}, def.settings, st.settings);
  st.users = Object.assign({}, def.users, st.users);
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

return { uid, ps4Stations, DEFAULT_STATE, migrate, diffState, applyPatch, clone };
});
