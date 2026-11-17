'use strict';

/* ================= البيانات ================= */
const STORE_KEY = 'cafe-meknas-v1';

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

function ps4Stations(n) {
  return Array.from({ length: n }, (_, i) => ({ id: uid(), name: `بلاي 4 — ${i + 1}`, type: 'game', icon: '🎮' }));
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

let state = load();
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return migrate(Object.assign(DEFAULT_STATE(), JSON.parse(raw)));
  } catch (e) { console.warn(e); }
  return DEFAULT_STATE();
}
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
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
  catch (e) { toast('تعذّر حفظ البيانات في المتصفح!'); }
}

/* ================= أدوات ================= */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
const money = n => `${r2(n).toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${esc(state.settings.currency)}`;
const pad = n => String(n).padStart(2, '0');
function fmtDur(ms) {
  const s = Math.floor(ms / 1000);
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
}
const fmtDate = t => new Date(t).toLocaleString('ar-MA', { dateStyle: 'short', timeStyle: 'short' });
const dayKey = t => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._h); toast._h = setTimeout(() => t.classList.remove('show'), 2200);
}
const stationById = id => state.stations.find(s => s.id === id);
// القسم الذي تنتمي إليه الفاتورة: المقهى (table) أو صالة الألعاب (game)
const saleSection = s => s.stationType || (s.game ? 'game' : 'table');

/* ================= منطق الطلب والأثمنة ================= */
function getOrder(stationId, create = false) {
  if (!state.open[stationId] && create) {
    state.open[stationId] = { openedAt: Date.now(), items: [], game: { mode: 'hour', running: false, segStart: 0, accMs: 0, matches: 0 }, discount: 0, payment: 'cash' };
  }
  return state.open[stationId];
}
function playedMs(o) {
  if (!o) return 0;
  const g = o.game;
  return g.accMs + (g.running ? Date.now() - g.segStart : 0);
}
function billableMinutes(ms) {
  const mins = ms / 60000;
  if (mins <= 0) return 0;
  const { round, min, grace } = state.settings;
  const r = Math.max(1, round);
  // مهلة السماح: دقائق قليلة بعد نهاية الفترة لا تُحتسب فترة جديدة
  const rounded = Math.max(r, Math.ceil(Math.max(0, mins - (Number(grace) || 0)) / r) * r);
  return Math.max(Number(min) || 0, rounded);
}
const gameMode = o => o?.game.mode || 'hour';
function gameCost(station, o) {
  if (!o || station.type !== 'game') return 0;
  if (gameMode(o) === 'match') return r2(o.game.matches * state.settings.matchRate);
  return r2(billableMinutes(playedMs(o)) / 60 * state.settings.hourRate);
}
function gameRecord(o, cost) {
  const ms = playedMs(o), mode = gameMode(o);
  return {
    mode, playedMs: mode === 'hour' ? ms : 0, billedMinutes: mode === 'hour' ? billableMinutes(ms) : 0,
    matches: mode === 'match' ? o.game.matches : 0,
    rate: mode === 'hour' ? state.settings.hourRate : state.settings.matchRate, cost,
  };
}
const ratesBadge = () => `<span class="badge">${money(state.settings.hourRate)} / ساعة</span> <span class="badge">${money(state.settings.matchRate)} / مباراة</span>`;
function itemsTotal(o) { return o ? r2(o.items.reduce((s, i) => s + i.price * i.qty, 0)) : 0; }
function orderTotals(station, o) {
  const items = itemsTotal(o), game = gameCost(station, o);
  const subtotal = r2(items + game);
  const discount = Math.min(subtotal, Math.max(0, Number(o?.discount) || 0));
  return { items, game, subtotal, discount, total: r2(subtotal - discount) };
}
function isEmptyOrder(o) {
  return !o || (o.items.length === 0 && !o.game.running && o.game.accMs === 0 && o.game.matches === 0);
}

/* ================= التنقل ================= */
document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));
function showView(v) {
  if (v === 'settings' && !isOwner()) v = 'cafe';
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  document.querySelectorAll('.view').forEach(s => s.classList.toggle('active', s.id === 'view-' + v));
  if (v === 'cafe' || v === 'games') {
    floorSection = v === 'games' ? 'game' : 'table';
    $('#view-floor').classList.add('active');
    $('#view-floor').classList.toggle('games', floorSection === 'game');
    return renderFloor();
  }
  ({ menu: renderProducts, reports: renderReports, settings: renderSettings })[v]();
}

/* ================= الطاولات ================= */
let floorFilter = 'all', floorSection = 'table';
$('#floorFilters').addEventListener('click', e => {
  const b = e.target.closest('.chip'); if (!b) return;
  floorFilter = b.dataset.filter;
  document.querySelectorAll('#floorFilters .chip').forEach(c => c.classList.toggle('active', c === b));
  renderFloor();
});

function renderFloor() {
  $('#cafeName').textContent = state.settings.name;
  document.title = state.settings.name + ' — الطلبات والألعاب';
  const isGames = floorSection === 'game';
  $('#floorTitle').textContent = isGames ? '🎮 صالة الألعاب' : '☕ المقهى';
  const all = state.stations.filter(s => s.type === floorSection);
  let list = all;
  if (floorFilter === 'busy') list = list.filter(s => state.open[s.id]);
  if (floorFilter === 'free') list = list.filter(s => !state.open[s.id]);
  $('#stationsGrid').innerHTML = list.map(stationCard).join('') ||
    `<div class="empty">${all.length ? 'لا توجد عناصر' : (isGames ? 'لا توجد محطات ألعاب — أضفها من الإعدادات' : 'لا توجد طاولات — أضفها من الإعدادات')}</div>`;

  const busy = all.filter(s => state.open[s.id]);
  const openTotal = busy.reduce((sum, s) => sum + orderTotals(s, state.open[s.id]).total, 0);
  const today = dayKey(Date.now());
  const todaySales = state.sales.filter(s => dayKey(s.closedAt) === today && saleSection(s) === floorSection).reduce((a, s) => a + s.total, 0);
  $('#floorSummary').innerHTML =
    `<span>${isGames ? 'محطات مشغولة' : 'طاولات مشغولة'}: <b>${busy.length}/${all.length}</b></span>` +
    `<span>طلبات مفتوحة: <b>${money(openTotal)}</b></span>` +
    `<span>مبيعات اليوم: <b>${money(todaySales)}</b></span>`;
}
function stationCard(s) {
  const o = state.open[s.id];
  const t = o ? orderTotals(s, o) : null;
  let timer = '';
  if (o && s.type === 'game') {
    timer = gameMode(o) === 'match'
      ? `<div class="s-timer">${o.game.matches} مباراة</div>`
      : `<div class="s-timer ${o.game.running ? '' : 'paused'}" data-timer="${s.id}">${fmtDur(playedMs(o))}${o.game.running ? '' : ' ⏸'}</div>`;
  }
  const rate = s.type === 'game' && !o ? ratesBadge() : '';
  return `<button class="station ${s.type} ${o ? 'busy' : ''}" data-id="${s.id}">
    <div class="s-head"><span>${esc(s.name)}</span><span class="s-icon">${esc(s.icon || '☕')}</span></div>
    <div class="s-status">${o ? 'مشغولة منذ ' + new Date(o.openedAt).toLocaleTimeString('ar-MA', { hour: '2-digit', minute: '2-digit' }) : 'متاحة'} ${rate}</div>
    ${timer}
    ${t ? `<div class="s-total" data-total="${s.id}">${money(t.total)}</div>` : ''}
  </button>`;
}
$('#stationsGrid').addEventListener('click', e => {
  const c = e.target.closest('.station'); if (c) openOrder(c.dataset.id);
});

/* ================= نافذة الطلب ================= */
let current = null, orderCat = 'الكل';
const dlg = $('#orderDialog');

function openOrder(stationId) {
  current = stationId;
  orderCat = 'الكل';
  $('#orderSearch').value = '';
  renderOrderMenu();
  renderOrderSide();
  dlg.showModal();
}
function closeOrder() {
  if (current && isEmptyOrder(state.open[current])) delete state.open[current];
  save(); current = null; dlg.close(); renderFloor();
}
dlg.addEventListener('cancel', e => { e.preventDefault(); closeOrder(); });
$('#orderCloseBtn').addEventListener('click', closeOrder);

function categories() { return [...new Set(state.products.map(p => p.category))]; }
function renderOrderMenu() {
  const s = stationById(current);
  $('#orderTitle').textContent = `${s.icon || ''} ${s.name}`;
  $('#orderCategories').innerHTML = ['الكل', ...categories()].map(c =>
    `<button class="chip ${c === orderCat ? 'active' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
  const q = $('#orderSearch').value.trim();
  const list = state.products.filter(p => (orderCat === 'الكل' || p.category === orderCat) && (!q || p.name.includes(q)));
  $('#orderProducts').innerHTML = list.map(p =>
    `<button class="product" data-pid="${p.id}"><span>${esc(p.name)}</span><span class="p-price">${money(p.price)}</span></button>`
  ).join('') || '<div class="empty">لا توجد منتجات</div>';
}
$('#orderCategories').addEventListener('click', e => {
  const b = e.target.closest('.chip'); if (!b) return;
  orderCat = b.dataset.cat; renderOrderMenu();
});
$('#orderSearch').addEventListener('input', renderOrderMenu);
$('#orderProducts').addEventListener('click', e => {
  const b = e.target.closest('.product'); if (!b) return;
  const p = state.products.find(x => x.id === b.dataset.pid);
  const o = getOrder(current, true);
  const line = o.items.find(i => i.pid === p.id && i.price === p.price);
  if (line) line.qty++; else o.items.push({ pid: p.id, name: p.name, price: p.price, qty: 1 });
  save(); renderOrderSide();
});

function renderOrderSide() {
  const s = stationById(current);
  const o = state.open[current];

  // صندوق اللعب
  if (s.type === 'game') {
    const g = o?.game, mode = gameMode(o), st = state.settings;
    const modeChips = `<div class="row">
      <button class="chip ${mode === 'hour' ? 'active' : ''}" data-g="mode-hour">⏱ بالساعة — ${money(st.hourRate)}</button>
      <button class="chip ${mode === 'match' ? 'active' : ''}" data-g="mode-match">⚽ بالمباراة — ${money(st.matchRate)}</button>
    </div>`;
    if (mode === 'match') {
      $('#gameBox').innerHTML = `${modeChips}
        <div class="timer">${g ? g.matches : 0} مباراة</div>
        <div class="muted" style="text-align:center">${g?.matches || 0} × ${money(st.matchRate)} = ${money(gameCost(s, o))}</div>
        <div class="row">
          <button class="btn" data-g="match-">− مباراة</button>
          <button class="btn primary" data-g="match+">+ مباراة</button>
        </div>`;
    } else {
      $('#gameBox').innerHTML = `${modeChips}
        <div class="timer" id="dlgTimer">${fmtDur(playedMs(o))}</div>
        <div class="muted" id="dlgBill" style="text-align:center">${billInfo(s, o)}</div>
        <div class="row">
          ${!g || (!g.running && g.accMs === 0)
            ? '<button class="btn primary" data-g="start">▶ بدء اللعب</button>'
            : g.running
              ? '<button class="btn" data-g="pause">⏸ إيقاف مؤقت</button>'
              : '<button class="btn primary" data-g="resume">▶ استئناف</button>'}
          ${g && (g.running || g.accMs > 0) ? '<button class="btn" data-g="addtime">+15 د</button><button class="btn danger" data-g="reset">تصفير</button>' : ''}
        </div>`;
    }
  } else {
    $('#gameBox').innerHTML = '';
  }

  // البنود
  $('#orderItems').innerHTML = o && o.items.length ? o.items.map((i, idx) => `
    <div class="oi">
      <div>${esc(i.name)}<div class="muted" style="font-size:.8rem">${money(i.price)}</div></div>
      <div class="qty"><button data-q="-" data-i="${idx}">−</button><span>${i.qty}</span><button data-q="+" data-i="${idx}">+</button></div>
      <div class="sub">${money(i.price * i.qty)}</div>
    </div>`).join('') : '<div class="empty">اضغط على المنتجات لإضافتها</div>';

  $('#orderDiscount').value = o?.discount || 0;
  $('#orderPayment').value = o?.payment || 'cash';
  renderTotals();
}
function billInfo(s, o) {
  if (!o) return 'لم يبدأ اللعب بعد';
  const mins = billableMinutes(playedMs(o));
  return mins ? `يُحتسب: ${mins} دقيقة = ${money(gameCost(s, o))}` : 'لم يبدأ اللعب بعد';
}
function renderTotals() {
  const s = stationById(current), o = state.open[current];
  const t = orderTotals(s, o);
  $('#orderTotals').innerHTML = `
    <div><span>المشروبات والمأكولات</span><span>${money(t.items)}</span></div>
    ${s.type === 'game' ? `<div><span>اللعب</span><span>${money(t.game)}</span></div>` : ''}
    ${t.discount ? `<div><span>التخفيض</span><span>− ${money(t.discount)}</span></div>` : ''}
    <div class="grand"><span>المجموع</span><span>${money(t.total)}</span></div>`;
}

$('#orderItems').addEventListener('click', e => {
  const b = e.target.closest('button[data-q]'); if (!b) return;
  const o = state.open[current]; const i = o.items[+b.dataset.i];
  i.qty += b.dataset.q === '+' ? 1 : -1;
  if (i.qty <= 0) o.items.splice(+b.dataset.i, 1);
  save(); renderOrderSide();
});
$('#gameBox').addEventListener('click', e => {
  const b = e.target.closest('button[data-g]'); if (!b) return;
  const o = getOrder(current, true), g = o.game, now = Date.now();
  switch (b.dataset.g) {
    case 'start': case 'resume': g.running = true; g.segStart = now; break;
    case 'pause': g.accMs += now - g.segStart; g.running = false; break;
    case 'addtime': g.accMs += 15 * 60000; break;
    case 'reset':
      if (!confirm('تصفير وقت اللعب؟')) return;
      g.running = false; g.accMs = 0; g.segStart = 0; break;
    case 'mode-hour': case 'mode-match': {
      const m = b.dataset.g.slice(5);
      if (gameMode(o) === m) return;
      const hasData = g.running || g.accMs > 0 || g.matches > 0;
      if (hasData && !confirm('تغيير طريقة الاحتساب سيُصفّر الوقت / المباريات. متابعة؟')) return;
      Object.assign(g, { mode: m, running: false, segStart: 0, accMs: 0, matches: 0 });
      break;
    }
    case 'match+': g.matches++; break;
    case 'match-': g.matches = Math.max(0, g.matches - 1); break;
  }
  save(); renderOrderSide();
});
$('#orderDiscount').addEventListener('input', e => {
  const o = getOrder(current, true); o.discount = Math.max(0, Number(e.target.value) || 0); save(); renderTotals();
});
$('#orderPayment').addEventListener('change', e => { const o = getOrder(current, true); o.payment = e.target.value; save(); });

$('#orderCancelBtn').addEventListener('click', () => {
  if (!state.open[current]) return closeOrder();
  if (!confirm('هل تريد إلغاء هذا الطلب نهائياً؟')) return;
  delete state.open[current]; closeOrder(); toast('تم إلغاء الطلب');
});

$('#orderCheckoutBtn').addEventListener('click', () => {
  const s = stationById(current), o = state.open[current];
  if (isEmptyOrder(o)) return toast('الطلب فارغ');
  const t = orderTotals(s, o);
  if (!confirm(`إنهاء الطلب ودفع ${r2(t.total)} ${state.settings.currency}؟`)) return;
  const sale = {
    id: uid(), no: state.seq++, stationId: s.id, stationName: s.name, stationType: s.type,
    openedAt: o.openedAt, closedAt: Date.now(),
    items: o.items.map(i => ({ ...i })),
    game: s.type === 'game' ? gameRecord(o, t.game) : null,
    itemsTotal: t.items, gameTotal: t.game, discount: t.discount, total: t.total, payment: o.payment,
    by: currentUser ? state.users[currentUser].title : '',
  };
  state.sales.push(sale);
  delete state.open[current];
  save();
  printReceipt(sale);
  closeOrder();
  toast(`تم تسجيل الفاتورة رقم ${sale.no}`);
});

$('#orderPrintBtn').addEventListener('click', () => {
  const s = stationById(current), o = state.open[current];
  if (isEmptyOrder(o)) return toast('الطلب فارغ');
  const t = orderTotals(s, o);
  printReceipt({
    no: '—', stationName: s.name, closedAt: Date.now(), items: o.items,
    game: s.type === 'game' ? gameRecord(o, t.game) : null,
    itemsTotal: t.items, gameTotal: t.game, discount: t.discount, total: t.total, payment: o.payment, draft: true,
  });
});

// نقل الطلب لطاولة أخرى
$('#orderMoveBtn').addEventListener('click', () => {
  if (isEmptyOrder(state.open[current])) return toast('الطلب فارغ');
  const free = state.stations.filter(s => s.id !== current && !state.open[s.id]);
  if (!free.length) return toast('لا توجد طاولة متاحة');
  const opts = type => free.filter(s => s.type === type).map(s => `<option value="${s.id}">${esc(s.icon)} ${esc(s.name)}</option>`).join('');
  $('#moveTarget').innerHTML = `<optgroup label="☕ المقهى">${opts('table')}</optgroup><optgroup label="🎮 صالة الألعاب">${opts('game')}</optgroup>`;
  $('#moveDialog').showModal();
});
$('#moveCancel').addEventListener('click', () => $('#moveDialog').close());
$('#moveConfirm').addEventListener('click', () => {
  const target = $('#moveTarget').value;
  const from = stationById(current), to = stationById(target);
  const o = state.open[current];
  // عند النقل من محطة ألعاب إلى طاولة: يُضاف ثمن اللعب كبند ثابت
  if (from.type === 'game' && to.type !== 'game') {
    const cost = gameCost(from, o);
    if (cost > 0) o.items.push({ pid: null, name: `لعب: ${from.name}`, price: cost, qty: 1 });
    o.game = { mode: 'hour', running: false, segStart: 0, accMs: 0, matches: 0 };
  }
  state.open[target] = o; delete state.open[current];
  save(); $('#moveDialog').close();
  current = target; renderOrderMenu(); renderOrderSide();
  toast(`تم نقل الطلب إلى ${to.name}`);
});

/* ================= الطباعة ================= */
function receiptHtml(sale) {
  const st = state.settings;
  const rows = sale.items.map(i => `<tr><td>${esc(i.name)}</td><td>${i.qty}×${r2(i.price)}</td><td class="num">${r2(i.price * i.qty).toFixed(2)}</td></tr>`).join('');
  let game = '';
  if (sale.game) {
    game = (sale.game.mode || sale.game.billing) === 'match'
      ? `<tr><td>لعب (${sale.game.matches} مباراة)</td><td>${sale.game.matches}×${r2(sale.game.rate)}</td><td class="num">${r2(sale.game.cost).toFixed(2)}</td></tr>`
      : `<tr><td>لعب ${fmtDur(sale.game.playedMs)}</td><td>${sale.game.billedMinutes} د</td><td class="num">${r2(sale.game.cost).toFixed(2)}</td></tr>`;
  }
  return `<div class="receipt">
    <h1>${esc(st.name)}</h1>
    <div class="c">${sale.draft ? 'فاتورة مؤقتة' : 'فاتورة رقم ' + sale.no}</div>
    <div class="c">${esc(sale.stationName)} — ${fmtDate(sale.closedAt)}</div>
    <table>${rows}${game}</table>
    ${sale.discount ? `<div>التخفيض: −${r2(sale.discount).toFixed(2)}</div>` : ''}
    <div class="tot">المجموع: ${money(sale.total)}</div>
    <div>الدفع: ${sale.payment === 'card' ? 'بطاقة' : 'نقداً'}</div>
    ${sale.by ? `<div>بواسطة: ${esc(sale.by)}</div>` : ''}
    <p class="c">${esc(st.footer)}</p>
  </div>`;
}
function printHtml(html) {
  $('#printArea').innerHTML = html;
  setTimeout(() => window.print(), 50);
}
function printReceipt(sale) { printHtml(receiptHtml(sale)); }

/* ================= المنتجات ================= */
function renderProducts() {
  $('#categoryList').innerHTML = categories().map(c => `<option value="${esc(c)}">`).join('');
  const q = $('#productSearch').value.trim();
  const list = state.products.filter(p => !q || p.name.includes(q) || p.category.includes(q))
    .sort((a, b) => a.category.localeCompare(b.category, 'ar') || a.name.localeCompare(b.name, 'ar'));
  $('#productsTable').innerHTML = list.length ? `<div class="table-wrap"><table>
    <thead><tr><th>المنتج</th><th>الصنف</th><th class="num">السعر</th><th></th></tr></thead>
    <tbody>${list.map(p => `<tr>
      <td>${esc(p.name)}</td><td>${esc(p.category)}</td><td class="num">${money(p.price)}</td>
      <td class="num"><span class="owner-only"><button class="btn sm" data-edit="${p.id}">تعديل</button> <button class="btn sm danger" data-del="${p.id}">حذف</button></span></td>
    </tr>`).join('')}</tbody></table></div>` : '<div class="empty">لا توجد منتجات</div>';
}
$('#productSearch').addEventListener('input', renderProducts);
$('#productForm').addEventListener('submit', e => {
  e.preventDefault();
  if (!isOwner()) return;
  const id = $('#productId').value;
  const data = { name: $('#productName').value.trim(), category: $('#productCategory').value.trim(), price: r2($('#productPrice').value) };
  if (id) Object.assign(state.products.find(p => p.id === id), data);
  else state.products.push({ id: uid(), ...data });
  save(); resetProductForm(); renderProducts(); toast('تم حفظ المنتج');
});
function resetProductForm() { $('#productForm').reset(); $('#productId').value = ''; }
$('#productCancel').addEventListener('click', resetProductForm);
$('#productsTable').addEventListener('click', e => {
  const ed = e.target.closest('[data-edit]'), del = e.target.closest('[data-del]');
  if (ed) {
    const p = state.products.find(x => x.id === ed.dataset.edit);
    $('#productId').value = p.id; $('#productName').value = p.name; $('#productCategory').value = p.category; $('#productPrice').value = p.price;
    $('#productName').focus();
  } else if (del && isOwner() && confirm('حذف هذا المنتج؟')) {
    state.products = state.products.filter(p => p.id !== del.dataset.del); save(); renderProducts();
  }
});

/* ================= التقارير ================= */
function initReportDates() { const t = dayKey(Date.now()); $('#reportFrom').value = t; $('#reportTo').value = t; }
$('#reportFrom').addEventListener('change', renderReports);
$('#reportTo').addEventListener('change', renderReports);
$('#reportSection').addEventListener('change', renderReports);
$('#reportToday').addEventListener('click', () => { initReportDates(); renderReports(); });

function reportSales() {
  const from = $('#reportFrom').value, to = $('#reportTo').value;
  const sec = $('#reportSection').value;
  return state.sales.filter(s => {
    const k = dayKey(s.closedAt);
    return (!from || k >= from) && (!to || k <= to) && (sec === 'all' || saleSection(s) === sec);
  });
}
function reportData() {
  const sales = reportSales();
  const sum = f => r2(sales.reduce((a, s) => a + f(s), 0));
  const top = {}, games = {};
  sales.forEach(s => {
    s.items.forEach(i => { (top[i.name] ??= { qty: 0, total: 0 }); top[i.name].qty += i.qty; top[i.name].total += i.qty * i.price; });
    (games[s.stationName] ??= { ms: 0, matches: 0, total: 0, n: 0 });
    const g = games[s.stationName]; g.n++; g.total += s.total;
    if (s.game) { g.ms += s.game.playedMs; g.matches += s.game.matches; }
  });
  return {
    sales, top, games,
    cafe: sum(s => saleSection(s) === 'table' ? s.total : 0), games: sum(s => saleSection(s) === 'game' ? s.total : 0),
    total: sum(s => s.total), items: sum(s => s.itemsTotal), game: sum(s => s.gameTotal), discount: sum(s => s.discount),
    cash: sum(s => s.payment === 'cash' ? s.total : 0), card: sum(s => s.payment === 'card' ? s.total : 0),
  };
}
function renderReports() {
  if (!$('#reportFrom').value && !$('#reportTo').value) initReportDates();
  const d = reportData();
  const stat = (l, v) => `<div class="stat"><div class="v">${v}</div><div class="l">${l}</div></div>`;
  $('#reportStats').innerHTML =
    stat('إجمالي المداخيل', money(d.total)) + stat('عدد الفواتير', d.sales.length) +
    stat('مداخيل المقهى', money(d.cafe)) + stat('مداخيل صالة الألعاب', money(d.games)) +
    stat('المشروبات والمأكولات', money(d.items)) + stat('ثمن اللعب', money(d.game)) +
    stat('نقداً', money(d.cash)) + stat('بطاقة', money(d.card)) + stat('التخفيضات', money(d.discount)) +
    stat('متوسط الفاتورة', money(d.sales.length ? d.total / d.sales.length : 0));

  const top = Object.entries(d.top).sort((a, b) => b[1].qty - a[1].qty).slice(0, 15);
  $('#reportTop').innerHTML = top.length ? `<table><thead><tr><th>المنتج</th><th class="num">الكمية</th><th class="num">المبلغ</th></tr></thead><tbody>
    ${top.map(([n, v]) => `<tr><td>${esc(n)}</td><td class="num">${v.qty}</td><td class="num">${money(v.total)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">لا توجد بيانات</div>';

  const games = Object.entries(d.games).sort((a, b) => b[1].total - a[1].total);
  $('#reportGames').innerHTML = games.length ? `<table><thead><tr><th>المحطة</th><th class="num">جلسات</th><th class="num">وقت اللعب / الجولات</th><th class="num">المداخيل</th></tr></thead><tbody>
    ${games.map(([n, v]) => `<tr><td>${esc(n)}</td><td class="num">${v.n}</td><td class="num">${v.ms ? fmtDur(v.ms) : ''}${v.matches ? ` ${v.matches} مباراة` : ''}</td><td class="num">${money(v.total)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">لا توجد بيانات</div>';

  const list = [...d.sales].reverse();
  $('#reportSales').innerHTML = list.length ? `<div class="table-wrap"><table><thead><tr>
    <th>رقم</th><th>التاريخ</th><th>القسم</th><th>الطاولة / المحطة</th><th class="num">منتجات</th><th class="num">لعب</th><th class="num">تخفيض</th><th class="num">المجموع</th><th>الدفع</th><th>بواسطة</th><th></th>
    </tr></thead><tbody>${list.map(s => `<tr>
      <td>${s.no}</td><td>${fmtDate(s.closedAt)}</td><td>${saleSection(s) === 'game' ? '🎮 الألعاب' : '☕ المقهى'}</td><td>${esc(s.stationName)}</td>
      <td class="num">${money(s.itemsTotal)}</td><td class="num">${s.gameTotal ? money(s.gameTotal) : '—'}</td>
      <td class="num">${s.discount ? money(s.discount) : '—'}</td><td class="num"><b>${money(s.total)}</b></td>
      <td>${s.payment === 'card' ? 'بطاقة' : 'نقداً'}</td><td>${esc(s.by || '')}</td>
      <td class="num"><button class="btn sm" data-reprint="${s.id}">طباعة</button> <button class="btn sm danger owner-only" data-delsale="${s.id}">حذف</button></td>
    </tr>`).join('')}</tbody></table></div>` : '<div class="empty">لا توجد فواتير في هذه الفترة</div>';
}
$('#reportSales').addEventListener('click', e => {
  const rp = e.target.closest('[data-reprint]'), del = e.target.closest('[data-delsale]');
  if (rp) printReceipt(state.sales.find(s => s.id === rp.dataset.reprint));
  if (del && isOwner() && confirm('حذف هذه الفاتورة من السجل؟')) {
    state.sales = state.sales.filter(s => s.id !== del.dataset.delsale); save(); renderReports();
  }
});
$('#reportPrint').addEventListener('click', () => {
  const d = reportData();
  printHtml(`<div class="receipt"><h1>${esc(state.settings.name)}</h1>
    <div class="c">تقرير من ${$('#reportFrom').value} إلى ${$('#reportTo').value}</div>
    <div class="c">${$('#reportSection').selectedOptions[0].text}</div>
    <table>
      <tr><td>عدد الفواتير</td><td class="num">${d.sales.length}</td></tr>
      <tr><td>مداخيل المقهى</td><td class="num">${money(d.cafe)}</td></tr>
      <tr><td>مداخيل صالة الألعاب</td><td class="num">${money(d.games)}</td></tr>
      <tr><td>منها ثمن اللعب</td><td class="num">${money(d.game)}</td></tr>
      <tr><td>التخفيضات</td><td class="num">${money(d.discount)}</td></tr>
      <tr><td>نقداً</td><td class="num">${money(d.cash)}</td></tr>
      <tr><td>بطاقة</td><td class="num">${money(d.card)}</td></tr>
    </table><div class="tot">الإجمالي: ${money(d.total)}</div></div>`);
});
$('#reportCsv').addEventListener('click', () => {
  const d = reportData();
  const q = v => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [['رقم', 'التاريخ', 'القسم', 'الطاولة', 'المنتجات', 'مبلغ المنتجات', 'مبلغ اللعب', 'التخفيض', 'المجموع', 'الدفع'].map(q).join(',')];
  d.sales.forEach(s => lines.push([s.no, new Date(s.closedAt).toISOString(), saleSection(s) === 'game' ? 'صالة الألعاب' : 'المقهى', s.stationName,
    s.items.map(i => `${i.name} x${i.qty}`).join(' | '), s.itemsTotal, s.gameTotal, s.discount, s.total, s.payment].map(q).join(',')));
  download(`sales-${$('#reportFrom').value}_${$('#reportTo').value}.csv`, '﻿' + lines.join('\n'), 'text/csv');
});
function download(name, content, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ================= الإعدادات ================= */
function renderSettings() {
  const st = state.settings;
  $('#setName').value = st.name; $('#setCurrency').value = st.currency;
  $('#setHourRate').value = st.hourRate; $('#setMatchRate').value = st.matchRate;
  $('#setRound').value = st.round; $('#setGrace').value = st.grace; $('#setMin').value = st.min; $('#setFooter').value = st.footer;
  const group = (type, title) => {
    const list = state.stations.filter(s => s.type === type);
    return `<h3 class="subhead">${title} (${list.length})</h3>` + (list.length ? `<div class="table-wrap"><table>
    <thead><tr><th></th><th>الاسم</th>${type === 'game' ? '<th class="num">السعر</th>' : ''}<th></th></tr></thead>
    <tbody>${list.map((s, i) => `<tr>
      <td>${esc(s.icon)}</td><td>${esc(s.name)}</td>
      ${type === 'game' ? `<td class="num">${ratesBadge()}</td>` : ''}
      <td class="num">
        <button class="btn sm" data-up="${s.id}" ${i === 0 ? 'disabled' : ''}>▲</button>
        <button class="btn sm" data-sedit="${s.id}">تعديل</button>
        <button class="btn sm danger" data-sdel="${s.id}">حذف</button>
      </td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">لا يوجد</div>');
  };
  $('#stationsTable').innerHTML = group('table', '☕ طاولات المقهى') + group('game', '🎮 أجهزة بلاي 4');
}
$('#settingsForm').addEventListener('submit', e => {
  e.preventDefault();
  Object.assign(state.settings, {
    name: $('#setName').value.trim(), currency: $('#setCurrency').value.trim(),
    hourRate: r2(Math.max(0, +$('#setHourRate').value)), matchRate: r2(Math.max(0, +$('#setMatchRate').value)),
    round: Math.max(1, +$('#setRound').value || 1), grace: Math.max(0, +$('#setGrace').value || 0), min: Math.max(0, +$('#setMin').value || 0), footer: $('#setFooter').value,
  });
  save(); renderSettings(); $('#cafeName').textContent = state.settings.name; toast('تم حفظ الإعدادات');
});
function resetStationForm() { $('#stationForm').reset(); $('#stationId').value = ''; }
$('#stationCancel').addEventListener('click', resetStationForm);
$('#stationForm').addEventListener('submit', e => {
  e.preventDefault();
  const id = $('#stationId').value, type = $('#stationType').value;
  const data = {
    name: $('#stationName').value.trim(), type,
    icon: type === 'game' ? '🎮' : '☕',
  };
  if (id) {
    const s = stationById(id);
    if (state.open[id] && s.type !== data.type) return toast('لا يمكن تغيير النوع أثناء وجود طلب مفتوح');
    if (s.icon === '🥡' && data.type === 'table') data.icon = s.icon;
    Object.assign(s, data);
  } else state.stations.push({ id: uid(), ...data });
  save(); resetStationForm(); renderSettings(); toast('تم الحفظ');
});
$('#stationsTable').addEventListener('click', e => {
  const ed = e.target.closest('[data-sedit]'), del = e.target.closest('[data-sdel]'), up = e.target.closest('[data-up]');
  if (ed) {
    const s = stationById(ed.dataset.sedit);
    $('#stationId').value = s.id; $('#stationName').value = s.name; $('#stationType').value = s.type;
    $('#stationName').focus();
  } else if (del) {
    if (state.open[del.dataset.sdel]) return toast('توجد طلبية مفتوحة على هذه الطاولة');
    if (!confirm('حذف هذه الطاولة / المحطة؟')) return;
    state.stations = state.stations.filter(s => s.id !== del.dataset.sdel); save(); renderSettings();
  } else if (up) {
    // تبديل المكان مع العنصر السابق من نفس القسم
    const a = state.stations, i = a.findIndex(s => s.id === up.dataset.up);
    let j = i - 1; while (j >= 0 && a[j].type !== a[i].type) j--;
    if (j >= 0) { [a[j], a[i]] = [a[i], a[j]]; save(); renderSettings(); }
  }
});
$('#backupExport').addEventListener('click', () =>
  download(`cafe-backup-${dayKey(Date.now())}.json`, JSON.stringify(state, null, 2), 'application/json'));
$('#backupImport').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (!Array.isArray(data.products) || !Array.isArray(data.stations)) throw new Error('bad');
    if (!confirm('سيتم استبدال كل البيانات الحالية. متابعة؟')) return;
    const keepUsers = state.users;
    state = migrate(Object.assign(DEFAULT_STATE(), data));
    if (!data.users) state.users = keepUsers;
    save(); renderSettings(); toast('تم الاستيراد');
  } catch { toast('ملف غير صالح'); }
  e.target.value = '';
});
$('#clearSales').addEventListener('click', () => {
  if (!confirm('سيتم حذف كل الفواتير المسجلة. هل أنت متأكد؟')) return;
  state.sales = []; state.seq = 1; save(); toast('تم حذف سجل المبيعات');
});

/* ================= تسجيل الدخول ================= */
// ملاحظة: الحماية هنا محلية (داخل المتصفح) وتمنع الاستعمال غير المأذون للتطبيق على جهاز المقهى.
const SESSION_KEY = 'cafe-meknas-session';
const DEFAULT_PASSWORDS = { owner: '1234', manager: '0000' };
let currentUser = null;
const isOwner = () => currentUser === 'owner';

async function hashPassword(role, pw) {
  const text = `cafe-meknas|${role}|${pw}`;
  if (window.crypto?.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  let h = 5381; for (const ch of text) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0;
  return 'x' + h.toString(16);
}
async function checkPassword(role, pw) {
  const u = state.users[role];
  if (!u) return false;
  if (!u.hash) return pw === DEFAULT_PASSWORDS[role];
  return (await hashPassword(role, pw)) === u.hash;
}
function updateLoginHint() {
  const role = document.querySelector('input[name=role]:checked').value;
  $('#loginHint').textContent = state.users[role]?.hash ? '' :
    `كلمة المرور الافتراضية: ${DEFAULT_PASSWORDS[role]} — غيّرها من الإعدادات بعد الدخول`;
}
document.querySelectorAll('input[name=role]').forEach(r => r.addEventListener('change', () => { updateLoginHint(); $('#loginPassword').focus(); }));
$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const role = document.querySelector('input[name=role]:checked').value;
  if (await checkPassword(role, $('#loginPassword').value)) {
    try { sessionStorage.setItem(SESSION_KEY, role); } catch {}
    enterApp(role);
  } else {
    $('#loginError').textContent = 'كلمة المرور غير صحيحة';
    $('#loginPassword').select();
  }
});
function enterApp(role) {
  currentUser = role;
  $('#loginPassword').value = ''; $('#loginError').textContent = '';
  document.body.classList.remove('locked', 'role-owner', 'role-manager');
  document.body.classList.add('role-' + role);
  $('#userName').textContent = (role === 'owner' ? '👑 ' : '🧾 ') + state.users[role].title;
  showView('cafe');
}
function logout() {
  if (dlg.open) closeOrder();
  currentUser = null;
  try { sessionStorage.removeItem(SESSION_KEY); } catch {}
  document.body.classList.add('locked');
  $('#loginCafe').textContent = state.settings.name;
  updateLoginHint();
  $('#loginPassword').focus();
}
$('#logoutBtn').addEventListener('click', logout);
$('#passwordForm').addEventListener('submit', async e => {
  e.preventDefault();
  if (!isOwner()) return;
  const role = $('#pwUser').value, pw = $('#pwNew').value;
  if (pw !== $('#pwConfirm').value) return toast('كلمتا المرور غير متطابقتين');
  state.users[role].hash = await hashPassword(role, pw);
  save(); $('#passwordForm').reset(); toast(`تم تغيير كلمة مرور ${state.users[role].title}`);
});

/* ================= التحديث الدوري ================= */
function tick() {
  $('#clock').textContent = new Date().toLocaleTimeString('ar-MA');
  // تحديث المؤقتات دون إعادة رسم الصفحة
  document.querySelectorAll('[data-timer]').forEach(el => {
    const id = el.dataset.timer, o = state.open[id];
    if (o?.game.running) el.textContent = fmtDur(playedMs(o));
  });
  document.querySelectorAll('[data-total]').forEach(el => {
    const id = el.dataset.total, s = stationById(id), o = state.open[id];
    if (s && o) el.innerHTML = money(orderTotals(s, o).total);
  });
  if (current && dlg.open) {
    const s = stationById(current), o = state.open[current];
    if (s?.type === 'game' && o?.game.running) {
      const t = $('#dlgTimer'); if (t) t.textContent = fmtDur(playedMs(o));
      const b = $('#dlgBill'); if (b) b.innerHTML = billInfo(s, o);
      renderTotals();
    }
  }
}
setInterval(tick, 1000);

window.addEventListener('storage', e => { if (e.key === STORE_KEY) { state = load(); if (!dlg.open) renderFloor(); } });

(function init() {
  let role = null;
  try { role = sessionStorage.getItem(SESSION_KEY); } catch {}
  if (role && state.users[role]) enterApp(role); else logout();
  tick();
})();
