'use strict';

/* ================= البيانات ================= */
const STORE_KEY = 'cafe-meknas-v1';

let state = load();
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return migrate(Object.assign(DEFAULT_STATE(), JSON.parse(raw)));
  } catch (e) { console.warn(e); }
  return DEFAULT_STATE();
}
function save() {
  if (isRemote()) return schedulePush();
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
  setOrderPane('menu');
  dlg.showModal();
}
function closeOrder() {
  if (current && isEmptyOrder(state.open[current])) delete state.open[current];
  save(); current = null; dlg.close(); renderFloor();
}
dlg.addEventListener('cancel', e => { e.preventDefault(); closeOrder(); });
$('#orderCloseBtn').addEventListener('click', closeOrder);
$('#mBack').addEventListener('click', closeOrder);
// على الهاتف: تبديل بين قائمة المنتجات وتفاصيل الطلب
function setOrderPane(p) {
  $('.order-wrap').classList.toggle('show-side', p === 'side');
  document.querySelectorAll('.mtab').forEach(b => b.classList.toggle('active', b.dataset.pane === p));
  $('.order-wrap').scrollTop = 0; $('.order-menu').scrollTop = 0; $('.order-side').scrollTop = 0;
}
document.querySelectorAll('.mtab').forEach(b => b.addEventListener('click', () => setOrderPane(b.dataset.pane)));

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
  const n = o ? o.items.reduce((a, i) => a + i.qty, 0) : 0;
  $('#mTotal').innerHTML = `${n ? `(${n}) ` : ''}${money(t.total)}`;
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

$('#orderCheckoutBtn').addEventListener('click', async () => {
  const s = stationById(current), o = state.open[current];
  if (isEmptyOrder(o)) return toast('الطلب فارغ');
  const t = orderTotals(s, o);
  if (!confirm(`إنهاء الطلب ودفع ${r2(t.total)} ${state.settings.currency}؟`)) return;
  const sale = {
    id: uid(), no: state.seq != null ? state.seq++ : null, stationId: s.id, stationName: s.name, stationType: s.type,
    openedAt: o.openedAt, closedAt: Date.now(),
    items: o.items.map(i => ({ ...i })),
    game: s.type === 'game' ? gameRecord(o, t.game) : null,
    itemsTotal: t.items, gameTotal: t.game, discount: t.discount, total: t.total, payment: o.payment,
    by: currentUser ? roleTitle(currentUser) : '',
  };
  state.sales.push(sale);
  delete state.open[current];
  save();
  closeOrder();
  // في وضع الخادم: ننتظر الحفظ ليعطي الخادم رقم الفاتورة النهائي
  await flushSync();
  const saved = state.sales.find(x => x.id === sale.id) || sale;
  printReceipt(saved);
  toast(saved.no != null ? `تم تسجيل الفاتورة رقم ${saved.no}` : 'تم تسجيل الفاتورة (سيُعطى الرقم عند عودة الاتصال)');
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
    <div class="c">${sale.draft ? 'فاتورة مؤقتة' : 'فاتورة رقم ' + (sale.no ?? '—')}</div>
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
      <td>${s.no ?? '—'}</td><td>${fmtDate(s.closedAt)}</td><td>${saleSection(s) === 'game' ? '🎮 الألعاب' : '☕ المقهى'}</td><td>${esc(s.stationName)}</td>
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
  renderStationsTable();
}
function renderStationsTable() {
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
    if (!data.users || isRemote()) state.users = keepUsers;
    save(); renderSettings(); toast('تم الاستيراد');
  } catch { toast('ملف غير صالح'); }
  e.target.value = '';
});
$('#clearSales').addEventListener('click', () => {
  if (!confirm('سيتم حذف كل الفواتير المسجلة. هل أنت متأكد؟')) return;
  state.sales = []; state.seq = 1; save(); toast('تم حذف سجل المبيعات');
});

/* ================= تسجيل الدخول ================= */
// ثلاثة أوضاع للتشغيل:
//  - local    : فتح index.html مباشرة — البيانات في هذا المتصفح فقط.
//  - server   : عبر خادم المقهى (node server.js) — الأجهزة على نفس الواي فاي متزامنة.
//  - supabase : عبر Supabase (يُفعَّل بملء config.js) — كل الأجهزة متزامنة عبر الإنترنت.
const SESSION_KEY = 'cafe-meknas-session';
const TOKEN_KEY = 'cafe-meknas-token';
const DEFAULT_PASSWORDS = { owner: '1234', manager: '0000' };
let MODE = 'local', backend = null;
let currentUser = null;
const isOwner = () => currentUser === 'owner';
const isRemote = () => MODE !== 'local';
const roleTitle = r => state.users[r]?.title || (r === 'owner' ? 'صاحب المقهى' : 'مدير المقهى');

async function hashPassword(role, pw) {
  const text = `cafe-meknas|${role}|${pw}`;
  if (window.crypto?.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  let h = 5381; for (const ch of text) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0;
  return 'x' + h.toString(16);
}
async function checkLocalPassword(role, pw) {
  const u = state.users[role];
  if (!u) return false;
  if (!u.hash) return pw === DEFAULT_PASSWORDS[role];
  return (await hashPassword(role, pw)) === u.hash;
}
function updateLoginHint() {
  const role = document.querySelector('input[name=role]:checked').value;
  const usesDefault = MODE === 'local' ? !state.users[role]?.hash : MODE === 'server' ? !backend.info?.hasPassword?.[role] : false;
  $('#loginHint').textContent = usesDefault ? `كلمة المرور الافتراضية: ${DEFAULT_PASSWORDS[role]} — غيّرها من الإعدادات بعد الدخول` : '';
  $('#diagBtn').hidden = MODE !== 'supabase';
  $('#sbShareBtn').hidden = MODE !== 'supabase';
  $('#sbDisconnectBtn').hidden = !(MODE === 'supabase' && supabaseConfig()?.source === 'device');
  $('#sbConnectBtn').hidden = MODE !== 'local';
  $('#loginMode').textContent = {
    local: location.protocol === 'https:'
      ? '⚠️ غير مربوط بـ Supabase — البيانات محفوظة في هذا الجهاز فقط. اضغط «ربط بـ Supabase»'
      : '💻 وضع هذا الجهاز فقط (بدون خادم)',
    server: '🟢 متصل بخادم المقهى — كل الأجهزة متزامنة',
    supabase: '☁️ عبر Supabase — كل الأجهزة متزامنة عبر الإنترنت',
  }[MODE];
}
document.querySelectorAll('input[name=role]').forEach(r => r.addEventListener('change', () => { updateLoginHint(); $('#loginPassword').focus(); }));
$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const role = document.querySelector('input[name=role]:checked').value, pw = $('#loginPassword').value;
  const fail = msg => { $('#loginError').textContent = msg; $('#loginPassword').select(); };
  const btn = $('#loginForm button[type=submit]');
  btn.disabled = true;
  try {
    if (isRemote()) {
      const d = await backend.login(role, pw);
      startRemote(d);
      enterApp(d.role);
    } else if (await checkLocalPassword(role, pw)) {
      try { sessionStorage.setItem(SESSION_KEY, role); } catch {}
      enterApp(role);
    } else fail('كلمة المرور غير صحيحة');
  } catch (err) {
    fail(err.message || 'تعذّر الاتصال');
  } finally { btn.disabled = false; }
});
function startRemote(d) { base = d.state; state = clone(base); setSync('ok'); }
function enterApp(role) {
  currentUser = role;
  $('#loginPassword').value = ''; $('#loginError').textContent = '';
  document.body.classList.remove('locked', 'role-owner', 'role-manager');
  document.body.classList.add('role-' + role);
  $('#userName').textContent = (role === 'owner' ? '👑 ' : '🧾 ') + roleTitle(role);
  showView('cafe');
  if (isRemote()) { backend.subscribe(); loadChat(); }
  renderChat();
}
function logout() {
  if (dlg.open) closeOrder();
  closeChat();
  const wasIn = currentUser;
  currentUser = null; chatMessages = [];
  if (backend) { backend.unsubscribe(); if (wasIn) backend.logout().catch(() => {}); }
  try { sessionStorage.removeItem(SESSION_KEY); } catch {}
  document.body.classList.add('locked');
  $('#loginCafe').textContent = backend?.info?.name || state.settings.name;
  updateLoginHint();
  $('#loginPassword').focus();
}
$('#logoutBtn').addEventListener('click', logout);
$('#diagBtn').addEventListener('click', async () => {
  const box = $('#diagResult');
  box.hidden = false; box.innerHTML = '<li>⏳ جارٍ الفحص...</li>';
  const icon = { ok: '✅', bad: '❌', warn: '⚠️', info: 'ℹ️' };
  try { box.innerHTML = (await backend.diagnose()).map(([k, t]) => `<li class="${k}">${icon[k]} ${esc(t)}</li>`).join(''); }
  catch (e) { box.innerHTML = `<li class="bad">❌ ${esc(e.message)}</li>`; }
});
$('#passwordForm').addEventListener('submit', async e => {
  e.preventDefault();
  if (!isOwner()) return;
  const role = $('#pwUser').value, pw = $('#pwNew').value;
  if (pw !== $('#pwConfirm').value) return toast('كلمتا المرور غير متطابقتين');
  if (isRemote()) {
    try { await backend.setPassword(role, pw); }
    catch (err) { return toast(err.message); }
  } else {
    state.users[role].hash = await hashPassword(role, pw);
    save();
  }
  $('#passwordForm').reset(); toast(`تم تغيير كلمة مرور ${roleTitle(role)}`);
});

/* ================= المزامنة (مشتركة بين الخادم و Supabase) ================= */
let base = null, pushTimer = null, pushing = false, pushAgain = false;
function setSync(status) {
  const el = $('#syncStatus');
  if (!el) return;
  el.dataset.status = status;
  el.title = { ok: 'متزامن', busy: 'جارٍ الحفظ...', off: 'غير متصل — سيتم الحفظ عند عودة الاتصال' }[status] || '';
}
// يطبّق تغييراً وصل من الخادم مع الحفاظ على التعديلات المحلية التي لم تُرسل بعد
function rebase(updateBase) {
  const pending = diffState(base, state);
  updateBase();
  state = clone(base);
  if (pending) {
    if (pending.salesAdd) pending.salesAdd = pending.salesAdd.filter(s => !state.sales.some(x => x.id === s.id));
    applyPatch(state, pending);
  }
}
function applyRemote(patch) {
  if (!base) return;
  rebase(() => applyPatch(base, patch));
  refreshUI();
}
async function resync() {
  const d = await backend.loadState();
  rebase(() => { base = d.state; });
  refreshUI();
  schedulePush();
}
function schedulePush() {
  if (!isRemote() || !base) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(push, 250);
}
async function push() {
  if (pushing) { pushAgain = true; return; }
  const patch = diffState(base, state);
  if (!patch) return setSync('ok');
  pushing = true; setSync('busy');
  try {
    await backend.push(patch);
    setSync('ok');
  } catch (e) {
    console.warn('sync', e);
    setSync('off');
    if (e.fatal) { toast('رفض الخادم التعديل: ' + e.message); resync().catch(() => {}); }
    else if (e.status !== 401) setTimeout(schedulePush, 3000);
  } finally {
    pushing = false;
    if (pushAgain) { pushAgain = false; schedulePush(); }
  }
}
async function flushSync() {
  if (!isRemote()) return;
  clearTimeout(pushTimer);
  while (pushing) await new Promise(r => setTimeout(r, 50));
  await push();
}
function sessionExpired() {
  if (!currentUser) return;
  toast('انتهت الجلسة، سجّل الدخول من جديد');
  logout();
}
// إعادة رسم الواجهة بعد وصول تغييرات من جهاز آخر
function refreshUI() {
  if (!currentUser) return;
  if (dlg.open && current) {
    if (!stationById(current)) { current = null; dlg.close(); }
    else if (document.activeElement?.id !== 'orderDiscount') renderOrderSide();
  }
  const v = document.querySelector('.tab.active')?.dataset.view;
  if (v === 'cafe' || v === 'games') renderFloor();
  else if (v === 'reports') renderReports();
  else if (v === 'menu') renderProducts();
  else if (v === 'settings') renderStationsTable();
}

/* ----- الواجهة الخلفية 1: خادم المقهى (node server.js) ----- */
const NodeBackend = {
  info: null, token: null, rev: 0, es: null,
  async detect() {
    if (!location.protocol.startsWith('http')) return false;
    try {
      const r = await fetch('api/ping', { cache: 'no-store' });
      if (!r.ok) return false;
      this.info = await r.json();
      return !!this.info.ok;
    } catch { return false; }
  },
  async api(method, url, body) {
    const r = await fetch(url, {
      method, cache: 'no-store',
      headers: { 'Content-Type': 'application/json', ...(this.token ? { Authorization: 'Bearer ' + this.token } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (r.status === 401 && url !== 'api/login') sessionExpired();
      throw Object.assign(new Error(data.error || 'خطأ في الاتصال'), { status: r.status, fatal: r.status === 403 });
    }
    return data;
  },
  async restore() {
    try { this.token = localStorage.getItem(TOKEN_KEY); } catch {}
    if (!this.token) return null;
    try { return await this.loadState(); } catch { this.token = null; return null; }
  },
  async login(role, password) {
    const r = await this.api('POST', 'api/login', { role, password });
    this.token = r.token;
    try { localStorage.setItem(TOKEN_KEY, r.token); } catch {}
    return this.loadState();
  },
  async logout() {
    const t = this.token;
    this.token = null;
    try { localStorage.removeItem(TOKEN_KEY); } catch {}
    if (t) await fetch('api/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + t } });
  },
  async loadState() {
    const d = await this.api('GET', 'api/state');
    this.rev = d.rev;
    return { state: d.state, role: d.role };
  },
  receive(newRev, patch) {
    if (newRev <= this.rev) return;
    if (newRev !== this.rev + 1) return void resync().catch(() => {});
    this.rev = newRev;
    applyRemote(patch);
  },
  async push(patch) {
    const r = await this.api('POST', 'api/patch', { patch });
    if (r.patch) this.receive(r.rev, r.patch);
  },
  subscribe() {
    this.unsubscribe();
    const es = this.es = new EventSource('api/events?token=' + encodeURIComponent(this.token));
    es.addEventListener('hello', e => { setSync('ok'); if (JSON.parse(e.data).rev !== this.rev) resync().catch(() => {}); });
    es.addEventListener('patch', e => { const d = JSON.parse(e.data); this.receive(d.rev, d.patch); });
    es.addEventListener('users', e => { const u = JSON.parse(e.data); state.users = u; if (base) base.users = u; });
    es.addEventListener('chat', e => onChatMessage(JSON.parse(e.data)));
    es.onerror = () => {
      setSync('off');
      // التحقق من أن الجلسة ما زالت صالحة (إن لم تكن، يُخرج المستخدم)
      clearTimeout(this._t);
      this._t = setTimeout(() => { if (currentUser) resync().catch(() => {}); }, 4000);
    };
  },
  unsubscribe() { if (this.es) { this.es.close(); this.es = null; } },
  async loadChat() { return (await this.api('GET', 'api/chat')).messages; },
  sendChat(text) { return this.api('POST', 'api/chat', { text }); },
  async setPassword(role, password) { await this.api('POST', 'api/password', { role, password }); },
};

/* ----- الواجهة الخلفية 2: Supabase ----- */
const SupabaseBackend = {
  info: { name: null }, sb: null, cfg: null, role: null, channel: null,
  detect() {
    const c = supabaseConfig();
    if (!c) return false;
    if (!window.supabase?.createClient) { console.error('مكتبة Supabase غير محمّلة'); return false; }
    this.cfg = c;
    this.sb = window.supabase.createClient(c.supabaseUrl, c.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'cafe-meknas-auth' },
    });
    // إذا أُلغيت الجلسة (مثلاً بعد تغيير كلمة المرور من جهاز آخر)
    this.sb.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT') sessionExpired(); });
    return true;
  },
  // ترجمة أخطاء Supabase الشائعة إلى رسالة واضحة مع طريقة الإصلاح
  explain(err) {
    const m = String(err?.message || ''), c = err?.code;
    if (c === 'PGRST205' || c === '42P01' || /could not find the table|does not exist/i.test(m))
      return 'جداول قاعدة البيانات غير موجودة: شغّل ملف supabase/schema.sql في SQL Editor';
    if (c === '42501' || /permission denied/i.test(m))
      return 'صلاحيات ناقصة في قاعدة البيانات: أعد تشغيل النسخة الأخيرة من supabase/schema.sql في SQL Editor';
    if (/invalid api key|no api key/i.test(m)) return 'مفتاح anon في config.js غير صحيح';
    if (/failed to fetch|networkerror|load failed/i.test(m)) return 'تعذّر الوصول إلى Supabase: تحقّق من supabaseUrl في config.js ومن الإنترنت';
    return m || 'خطأ غير معروف';
  },
  check(res) {
    if (res.error) {
      const { message, code } = res.error;
      const e = new Error(this.explain(res.error));
      e.code = code;
      if (code === 'PGRST301' || /jwt/i.test(message || '')) { e.status = 401; sessionExpired(); }
      // أخطاء الصلاحيات والقيود: لا فائدة من إعادة المحاولة
      e.fatal = ['42501', '23514', '23502', '22P02'].includes(code);
      throw e;
    }
    return res.data;
  },
  rowToSale: r => ({ ...r.data, id: r.id, no: r.no }),
  rowToMsg: r => ({ id: 'c' + r.id, from: r.from_role, text: r.text, at: Date.parse(r.created_at) }),
  async restore() {
    const { data } = await this.sb.auth.getSession();
    if (!data.session) return null;
    try { return await this.loadState(); } catch (e) { console.warn(e); return null; }
  },
  async login(role, password) {
    const email = this.cfg.emails?.[role];
    if (!email) throw Object.assign(new Error('لم يُحدَّد بريد هذا الحساب في config.js'), { status: 400 });
    const { error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error) {
      const m = error.message || '';
      const msg = error.code === 'email_not_confirmed' || /not confirmed/i.test(m)
          ? 'البريد غير مؤكَّد: في Supabase ← Authentication ← Users احذف المستخدم وأعد إنشاءه مع تفعيل Auto Confirm User'
        : error.code === 'invalid_credentials' || /invalid login credentials/i.test(m)
          ? `البريد أو كلمة المرور غير صحيحة. تأكّد أن المستخدم ${email} موجود في Supabase ← Authentication ← Users بنفس البريد المكتوب في config.js`
        : !error.status || error.name === 'AuthRetryableFetchError' ? this.explain({ message: 'failed to fetch' })
        : this.explain(error);
      throw Object.assign(new Error(msg), { status: error.status || 503 });
    }
    try {
      const d = await this.loadState();
      if (d.role !== role) throw Object.assign(new Error('هذا الحساب غير مرتبط بالدور المختار'), { status: 403 });
      return d;
    } catch (e) { await this.sb.auth.signOut(); throw e; }
  },
  async logout() { await this.sb.auth.signOut(); },
  // فحص الإعداد قبل تسجيل الدخول
  async diagnose() {
    const out = [], c = this.cfg;
    out.push(['ok', `config.js: ${c.supabaseUrl}`]);
    try {
      const r = await fetch(c.supabaseUrl.replace(/\/$/, '') + '/auth/v1/settings', { headers: { apikey: c.supabaseAnonKey } });
      if (r.status === 401) out.push(['bad', 'مفتاح anon في config.js غير صحيح (انسخه من Project Settings ← API Keys)']);
      else if (!r.ok) out.push(['bad', `Supabase أجاب بخطأ ${r.status}`]);
      else {
        out.push(['ok', 'الاتصال بـ Supabase والمفتاح صحيحان']);
        const st = await r.json().catch(() => ({}));
        if (st.disable_signup === false) out.push(['warn', 'التسجيل مفتوح لأي شخص: أوقف Allow new users to sign up (لا خطر على البيانات لكنه أفضل)']);
      }
    } catch { out.push(['bad', 'تعذّر الوصول إلى supabaseUrl: تحقّق من الرابط في config.js ومن الإنترنت']); return out; }
    const { error } = await this.sb.from('staff').select('role').limit(1);
    if (!error || error.code === '42501' || /permission denied/i.test(error.message)) out.push(['ok', 'جداول قاعدة البيانات موجودة']);
    else out.push(['bad', this.explain(error)]);
    for (const r of ['owner', 'manager']) if (!c.emails?.[r]) out.push(['bad', `بريد ${r === 'owner' ? 'صاحب المقهى' : 'المدير'} غير مكتوب في config.js`]);
    out.push(['info', 'إذا كان كل شيء ✅ وفشل الدخول، ستظهر رسالة الخطأ الدقيقة تحت خانة كلمة المرور']);
    return out;
  },
  async loadAllSales() {
    const all = [];
    for (let from = 0; ; from += 1000) {
      const rows = this.check(await this.sb.from('sales').select('id,no,data').order('no').range(from, from + 999));
      all.push(...rows);
      if (rows.length < 1000) break;
    }
    return all.map(this.rowToSale);
  },
  async loadState() {
    const { data: { session } } = await this.sb.auth.getSession();
    if (!session) throw Object.assign(new Error('يجب تسجيل الدخول'), { status: 401 });
    const q = (table, cols) => this.sb.from(table).select(cols).then(r => this.check(r));
    const [staff, config, open, sales] = await Promise.all([
      q('staff', 'user_id,role,title'), q('config', 'key,value'), q('open_orders', 'station_id,data'), this.loadAllSales(),
    ]);
    const me = staff.find(s => s.user_id === session.user.id);
    if (!me) throw Object.assign(new Error('الحساب غير مربوط بدور: شغّل ملف supabase/staff.sql في SQL Editor (بعد التأكد من البريدين فيه)'), { status: 403 });
    this.role = me.role;

    const st = DEFAULT_STATE();
    st.users = { owner: { title: 'صاحب المقهى' }, manager: { title: 'مدير المقهى' } };
    staff.forEach(s => { st.users[s.role] = { title: s.title }; });
    const have = new Set(config.map(r => r.key));
    for (const r of config) st[r.key] = r.key === 'settings' ? { ...st.settings, ...r.value } : r.value;
    const missing = ['settings', 'products', 'stations'].filter(k => !have.has(k));
    if (missing.length) {
      // أول تشغيل: صاحب المقهى يحفظ القوائم الافتراضية
      if (me.role !== 'owner') throw Object.assign(new Error('يجب أن يدخل صاحب المقهى أولاً لتهيئة البيانات'), { status: 403 });
      this.check(await this.sb.from('config').upsert(missing.map(key => ({ key, value: st[key] }))));
    }
    st.open = Object.fromEntries(open.map(r => [r.station_id, r.data]));
    st.sales = sales;
    st.seq = null; // رقم الفاتورة تعطيه قاعدة البيانات
    this.info.name = st.settings.name;
    return { state: st, role: me.role };
  },
  async push(patch) {
    const sb = this.sb, applied = {}, now = new Date().toISOString();
    const owner = this.role === 'owner';
    const cfgRows = owner ? ['settings', 'products', 'stations'].filter(k => patch[k] !== undefined).map(key => ({ key, value: patch[key], updated_at: now })) : [];
    if (cfgRows.length) {
      this.check(await sb.from('config').upsert(cfgRows));
      cfgRows.forEach(r => { applied[r.key] = r.value; });
    }
    // الفاتورة أولاً ثم حذف الطلب المفتوح، حتى لا يضيع شيء إذا انقطع الاتصال بينهما
    if (patch.salesAdd?.length) {
      const rows = patch.salesAdd.map(s => {
        const { id, no, ...data } = s;
        return { id, data, closed_at: new Date(s.closedAt || Date.now()).toISOString() };
      });
      this.check(await sb.from('sales').upsert(rows, { onConflict: 'id', ignoreDuplicates: true }));
      const saved = this.check(await sb.from('sales').select('id,no,data').in('id', rows.map(r => r.id)));
      applied.salesAdd = saved.map(this.rowToSale);
    }
    if (patch.open) {
      const ups = [], dels = [];
      for (const [station_id, data] of Object.entries(patch.open)) data ? ups.push({ station_id, data, updated_at: now }) : dels.push(station_id);
      if (ups.length) this.check(await sb.from('open_orders').upsert(ups));
      if (dels.length) this.check(await sb.from('open_orders').delete().in('station_id', dels));
      applied.open = patch.open;
    }
    if (owner && patch.salesDel?.length) {
      for (let i = 0; i < patch.salesDel.length; i += 200) {
        this.check(await sb.from('sales').delete().in('id', patch.salesDel.slice(i, i + 200)));
      }
      applied.salesDel = patch.salesDel;
    }
    if (Object.keys(applied).length) applyRemote(applied);
  },
  subscribe() {
    this.unsubscribe();
    let first = true;
    const ch = this.sb.channel('cafe-' + uid());
    const on = (table, fn) => ch.on('postgres_changes', { event: '*', schema: 'public', table }, p => {
      try { fn(p); } catch (e) { console.error(e); }
    });
    on('open_orders', p => {
      const id = p.new?.station_id ?? p.old?.station_id;
      applyRemote({ open: { [id]: p.eventType === 'DELETE' ? null : p.new.data } });
    });
    on('sales', p => applyRemote(p.eventType === 'DELETE' ? { salesDel: [p.old.id] } : { salesAdd: [this.rowToSale(p.new)] }));
    on('config', p => {
      if (p.eventType === 'DELETE') return;
      const v = p.new.key === 'settings' ? { ...state.settings, ...p.new.value } : p.new.value;
      applyRemote({ [p.new.key]: v });
    });
    on('chat', p => { if (p.eventType === 'INSERT') onChatMessage(this.rowToMsg(p.new)); });
    ch.subscribe(status => {
      if (status === 'SUBSCRIBED') {
        setSync('ok');
        // بعد انقطاع: جلب ما فات
        if (!first) { resync().catch(() => {}); loadChat(); }
        first = false;
      } else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) setSync('off');
    });
    this.channel = ch;
  },
  unsubscribe() { if (this.channel) { this.sb.removeChannel(this.channel); this.channel = null; } },
  async loadChat() {
    const rows = this.check(await this.sb.from('chat').select('*').order('id', { ascending: false }).limit(200));
    return rows.reverse().map(this.rowToMsg);
  },
  async sendChat(text) {
    return this.rowToMsg(this.check(await this.sb.from('chat').insert({ from_role: this.role, text }).select().single()));
  },
  async setPassword(role, password) {
    if (password.length < 6) throw new Error('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
    if (role === this.role) {
      const { error } = await this.sb.auth.updateUser({ password });
      if (error) throw new Error(error.message);
      return;
    }
    const { error } = await this.sb.functions.invoke('set-password', { body: { role, password } });
    if (error) {
      let msg = '';
      try { msg = (await error.context.json()).error; } catch {}
      throw new Error(msg || 'تعذّر تغيير كلمة المرور. انشر الدالة set-password، أو غيّرها من لوحة Supabase ← Authentication ← Users');
    }
  },
};

/* ================= الدردشة ================= */
let chatMessages = [], chatOpen = false;
const LASTREAD_KEY = () => `cafe-meknas-chat-read-${currentUser}`;
function lastRead() { try { return +localStorage.getItem(LASTREAD_KEY()) || 0; } catch { return 0; } }
function markRead() {
  const last = chatMessages[chatMessages.length - 1];
  if (last) try { localStorage.setItem(LASTREAD_KEY(), last.at); } catch {}
  updateChatBadge();
}
function updateChatBadge() {
  const n = chatOpen ? 0 : chatMessages.filter(m => m.at > lastRead() && m.from !== currentUser).length;
  $('#chatBadge').textContent = n > 9 ? '9+' : n;
  $('#chatBadge').hidden = !n;
}
async function loadChat() {
  try { chatMessages = await backend.loadChat(); renderChat(); } catch (e) { console.warn(e); }
}
function renderChat() {
  const box = $('#chatMessages');
  if (!isRemote()) {
    box.innerHTML = `<div class="chat-note">💡 الدردشة بين صاحب المقهى والمدير تعمل عند ربط التطبيق بـ Supabase
      (ملف <code>config.js</code>) أو تشغيله عبر خادم المقهى (<code>node server.js</code>). راجع ملف README.</div>`;
    $('#chatForm').hidden = true;
    return updateChatBadge();
  }
  $('#chatForm').hidden = false;
  const other = currentUser === 'owner' ? 'manager' : 'owner';
  $('#chatWith').textContent = (other === 'owner' ? '👑 ' : '🧾 ') + roleTitle(other);
  let lastDay = '';
  box.innerHTML = chatMessages.length ? chatMessages.map(m => {
    const d = dayKey(m.at);
    const sep = d !== lastDay ? `<div class="chat-day">${new Date(m.at).toLocaleDateString('ar-MA', { weekday: 'long', day: 'numeric', month: 'long' })}</div>` : '';
    lastDay = d;
    return `${sep}<div class="msg ${m.from === currentUser ? 'mine' : 'theirs'}">
      <div class="bubble">${esc(m.text).replace(/\n/g, '<br>')}</div>
      <div class="meta">${m.from === currentUser ? 'أنت' : esc(roleTitle(m.from))} · ${new Date(m.at).toLocaleTimeString('ar-MA', { hour: '2-digit', minute: '2-digit' })}</div>
    </div>`;
  }).join('') : '<div class="chat-note">لا توجد رسائل بعد. اكتب أول رسالة 👋</div>';
  box.scrollTop = box.scrollHeight;
  if (chatOpen) markRead(); else updateChatBadge();
}
function onChatMessage(m) {
  if (chatMessages.some(x => x.id === m.id)) return;
  chatMessages.push(m);
  renderChat();
  if (m.from !== currentUser) {
    if (!chatOpen) toast(`💬 ${roleTitle(m.from)}: ${m.text.slice(0, 60)}`);
    try { navigator.vibrate?.(200); } catch {}
    beep();
  }
}
function beep() {
  try {
    const ctx = beep.ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = 880; g.gain.setValueAtTime(0.15, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.3);
  } catch {}
}
function openChat() { chatOpen = true; document.body.classList.add('chat-open'); renderChat(); markRead(); if (isRemote() && !matchMedia('(max-width: 700px)').matches) $('#chatInput').focus(); }
function closeChat() { chatOpen = false; document.body.classList.remove('chat-open'); updateChatBadge(); }
$('#chatFab').addEventListener('click', () => chatOpen ? closeChat() : openChat());
$('#chatClose').addEventListener('click', closeChat);
$('#chatForm').addEventListener('submit', async e => {
  e.preventDefault();
  const input = $('#chatInput'), text = input.value.trim();
  if (!text) return;
  input.value = ''; autoGrow();
  try { onChatMessage(await backend.sendChat(text)); }
  catch (err) { input.value = text; toast('لم تُرسل الرسالة: ' + err.message); }
  input.focus();
});
function autoGrow() { const i = $('#chatInput'); i.style.height = 'auto'; i.style.height = Math.min(120, i.scrollHeight) + 'px'; }
$('#chatInput').addEventListener('input', autoGrow);
$('#chatInput').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('#chatForm').requestSubmit(); }
});

/* ================= تثبيت التطبيق على الهاتف ================= */
let installPrompt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; $('#installBtn').hidden = false; });
$('#installBtn').addEventListener('click', async () => {
  if (!installPrompt) return;
  installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; $('#installBtn').hidden = true;
});
if ('serviceWorker' in navigator && window.isSecureContext && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

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

window.addEventListener('storage', e => {
  if (MODE === 'local' && e.key === STORE_KEY) { state = load(); if (currentUser && !dlg.open) refreshUI(); }
});

/* ================= ربط Supabase من داخل التطبيق ================= */
// الأولوية لـ config.js، وإلا الإعداد المحفوظ في هذا الجهاز (من نموذج الربط أو من رابط الربط)
const SB_KEY = 'cafe-meknas-supabase';
const DEFAULT_EMAILS = { owner: 'owner@cafemeknas.ma', manager: 'manager@cafemeknas.ma' };
function supabaseConfig() {
  const file = window.CAFE_CONFIG || {};
  if (file.supabaseUrl && file.supabaseAnonKey) return { ...file, emails: { ...DEFAULT_EMAILS, ...file.emails }, source: 'file' };
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(SB_KEY)); } catch {}
  if (saved?.supabaseUrl && saved?.supabaseAnonKey) return { ...saved, emails: { ...DEFAULT_EMAILS, ...file.emails, ...saved.emails }, source: 'device' };
  return null;
}
const normalizeUrl = u => u.trim().replace(/\/+$/, '').replace(/\/(rest|auth)\/v1.*$/, '');
// يرفض المفاتيح السرية التي لا يجب أبداً وضعها في الصفحة
function checkPublicKey(key) {
  if (/^sb_secret_/.test(key)) return 'هذا مفتاح سري (secret) — لا تستعمله هنا أبداً. انسخ مفتاح Publishable أو anon public';
  if (/^eyJ/.test(key)) {
    try {
      const p = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (p.role === 'service_role') return 'هذا مفتاح service_role السري — لا تستعمله هنا أبداً. انسخ مفتاح anon public';
      if (p.role !== 'anon') return 'هذا ليس مفتاح anon public';
    } catch { return 'المفتاح غير مكتمل — انسخه كاملاً'; }
    return null;
  }
  if (/^sb_publishable_/.test(key)) return null;
  return 'المفتاح غير معروف — انسخ مفتاح anon public أو Publishable key';
}
function encodeSetup(c) {
  return btoa(JSON.stringify({ supabaseUrl: c.supabaseUrl, supabaseAnonKey: c.supabaseAnonKey, emails: c.emails }))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
// فتح «رابط ربط الهواتف»: يحفظ الإعداد في هذا الجهاز ثم يمسحه من شريط العنوان
(function importSetupLink() {
  const m = location.hash.match(/[#&]sb=([A-Za-z0-9_-]+)/);
  if (!m) return;
  try {
    const c = JSON.parse(atob(m[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (/^https?:\/\//.test(c.supabaseUrl) && !checkPublicKey(c.supabaseAnonKey)) {
      localStorage.setItem(SB_KEY, JSON.stringify({ supabaseUrl: normalizeUrl(c.supabaseUrl), supabaseAnonKey: c.supabaseAnonKey, emails: c.emails }));
    }
  } catch {}
  history.replaceState(null, '', location.pathname + location.search);
})();

function showSetup(open) {
  document.body.classList.toggle('setup-open', open);
  $('#sbSetupForm').hidden = !open;
  if (open) {
    const c = supabaseConfig() || {};
    const emails = { ...DEFAULT_EMAILS, ...(window.CAFE_CONFIG?.emails || {}), ...(c.emails || {}) };
    $('#sbUrl').value = c.supabaseUrl || ''; $('#sbKey').value = c.supabaseAnonKey || '';
    $('#sbOwnerEmail').value = emails.owner; $('#sbManagerEmail').value = emails.manager;
    $('#sbSetupMsg').textContent = '';
    $('#sbUrl').focus();
  }
}
$('#sbConnectBtn').addEventListener('click', () => showSetup(true));
$('#sbSetupCancel').addEventListener('click', () => showSetup(false));
$('#sbSetupForm').addEventListener('submit', async e => {
  e.preventDefault();
  const msg = t => { $('#sbSetupMsg').textContent = t; };
  const url = normalizeUrl($('#sbUrl').value), key = $('#sbKey').value.replace(/\s+/g, '');
  if (!/^https?:\/\/[^\s/]+$/.test(url)) return msg('الرابط غير صحيح. مثال: https://xxxxxxxx.supabase.co');
  const bad = checkPublicKey(key);
  if (bad) return msg(bad);
  msg('⏳ جارٍ اختبار الاتصال...');
  try {
    const r = await fetch(url + '/auth/v1/settings', { headers: { apikey: key } });
    if (r.status === 401) return msg('Supabase رفض المفتاح: تأكّد أنه مفتاح هذا المشروع ونسخته كاملاً');
    if (!r.ok) return msg(`Supabase أجاب بخطأ ${r.status}. تأكّد من Project URL`);
  } catch { return msg('تعذّر الوصول إلى هذا الرابط. تأكّد من Project URL ومن الإنترنت'); }
  const cfg = { supabaseUrl: url, supabaseAnonKey: key, emails: { owner: $('#sbOwnerEmail').value.trim(), manager: $('#sbManagerEmail').value.trim() } };
  try { localStorage.setItem(SB_KEY, JSON.stringify(cfg)); } catch { return msg('تعذّر الحفظ في هذا المتصفح'); }
  msg('✅ تم الربط — جارٍ إعادة التحميل...');
  location.reload();
});
$('#sbShareBtn').addEventListener('click', async () => {
  const c = supabaseConfig();
  if (!c) return;
  const link = `${location.origin}${location.pathname}#sb=${encodeSetup(c)}`;
  if (navigator.share) { try { await navigator.share({ title: 'ربط تطبيق المقهى', url: link }); return; } catch {} }
  try { await navigator.clipboard.writeText(link); toast('تم نسخ الرابط — افتحه مرة واحدة على كل هاتف'); }
  catch { prompt('انسخ هذا الرابط وافتحه مرة واحدة على كل هاتف:', link); }
});
$('#sbDisconnectBtn').addEventListener('click', () => {
  if (!confirm('قطع ربط هذا الجهاز بـ Supabase؟ (البيانات تبقى محفوظة في Supabase)')) return;
  try { localStorage.removeItem(SB_KEY); localStorage.removeItem('cafe-meknas-auth'); } catch {}
  location.reload();
});

(async function init() {
  if (SupabaseBackend.detect()) { MODE = 'supabase'; backend = SupabaseBackend; }
  else if (await NodeBackend.detect()) { MODE = 'server'; backend = NodeBackend; }
  document.body.classList.add('mode-' + MODE);
  tick();
  if (backend) {
    const d = await backend.restore();
    if (d) { startRemote(d); return enterApp(d.role); }
    return logout();
  }
  let role = null;
  try { role = sessionStorage.getItem(SESSION_KEY); } catch {}
  if (role && state.users[role]) enterApp(role); else logout();
})();
