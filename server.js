#!/usr/bin/env node
/*
 * خادم مقهى مكناس — يربط كل الأجهزة (الحاسوب والهواتف) عبر شبكة الواي فاي:
 * مزامنة الطلبات والفواتير لحظياً + الدردشة بين صاحب المقهى والمدير.
 * لا يحتاج أي مكتبة خارجية: فقط Node.js (الإصدار 18 أو أحدث).
 *
 * التشغيل:  node server.js        (المنفذ الافتراضي 8080، أو PORT=3000 node server.js)
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { DEFAULT_STATE, migrate, applyPatch, clone } = require('./shared.js');

const PORT = Number(process.env.PORT) || 8080;
const ROOT = __dirname;
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const DEFAULT_PASSWORDS = { owner: '1234', manager: '0000' };
const MAX_CHAT = 1000;
const MAX_BODY = 20 * 1024 * 1024;

/* ===== التخزين ===== */
let db = { state: DEFAULT_STATE(), rev: 1, chat: [], tokens: {} };
try {
  if (fs.existsSync(DB_FILE)) {
    db = Object.assign(db, JSON.parse(fs.readFileSync(DB_FILE, 'utf8')));
    db.state = migrate(Object.assign(DEFAULT_STATE(), db.state));
  }
} catch (e) {
  console.error('تعذّرت قراءة ملف البيانات:', e.message);
  process.exit(1);
}
let saveTimer = null;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = DB_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, DB_FILE);
  }, 200);
}
persist();

/* ===== الحسابات ===== */
const hashPassword = (role, pw) => crypto.createHash('sha256').update(`cafe-meknas|${role}|${pw}`).digest('hex');
function checkPassword(role, pw) {
  const u = db.state.users[role];
  if (!u || typeof pw !== 'string') return false;
  const expected = u.hash || hashPassword(role, DEFAULT_PASSWORDS[role]);
  const got = hashPassword(role, pw);
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(got));
}
// الحالة التي تُرسل للأجهزة: بدون بصمات كلمات المرور
function publicState() {
  const st = clone(db.state);
  for (const r of Object.keys(st.users)) { st.users[r].hasPassword = !!st.users[r].hash; delete st.users[r].hash; }
  return st;
}
const failed = new Map(); // حماية بسيطة ضد تخمين كلمة المرور
function tooManyAttempts(ip) {
  const f = failed.get(ip);
  return f && f.count >= 5 && Date.now() - f.at < 60_000;
}
function noteFailure(ip) {
  const f = failed.get(ip);
  if (!f || Date.now() - f.at > 60_000) failed.set(ip, { count: 1, at: Date.now() });
  else f.count++;
}

/* ===== البث اللحظي (Server-Sent Events) ===== */
const clients = new Set();
function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const c of clients) c.res.write(msg);
}
setInterval(() => { for (const c of clients) c.res.write(': ping\n\n'); }, 25_000);

/* ===== تطبيق التعديلات مع احترام الصلاحيات ===== */
function sanitizePatch(p, role) {
  const out = {};
  if (p.open && typeof p.open === 'object') out.open = p.open;
  if (Array.isArray(p.salesAdd)) out.salesAdd = p.salesAdd.filter(s => s && typeof s.id === 'string' && !db.state.sales.some(x => x.id === s.id));
  if (role === 'owner') {
    for (const k of ['settings', 'products', 'stations']) if (p[k] !== undefined) out[k] = p[k];
    if (Array.isArray(p.salesDel)) out.salesDel = p.salesDel;
  }
  // الخادم هو من يعطي أرقام الفواتير حتى لا تتكرر بين الأجهزة
  if (out.salesAdd?.length) {
    const used = new Set(db.state.sales.map(s => s.no));
    for (const s of out.salesAdd) {
      if (!Number.isInteger(s.no) || s.no < 1 || used.has(s.no)) s.no = db.state.seq;
      used.add(s.no);
      db.state.seq = Math.max(db.state.seq, s.no + 1);
    }
    out.seq = db.state.seq;
  }
  if (out.salesDel?.length && db.state.sales.length === out.salesDel.length) { db.state.seq = 1; out.seq = 1; }
  return out;
}

/* ===== أدوات HTTP ===== */
function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > MAX_BODY) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
function auth(req, url) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : url.searchParams.get('token');
  const t = token && db.tokens[token];
  return t ? { token, role: t.role } : null;
}
const STATIC = {
  '/': 'index.html', '/index.html': 'index.html', '/app.js': 'app.js', '/shared.js': 'shared.js', '/style.css': 'style.css',
  '/manifest.webmanifest': 'manifest.webmanifest', '/sw.js': 'sw.js',
  '/config.js': 'config.js', '/vendor/supabase-2.118.0.js': 'vendor/supabase-2.118.0.js',
  '/icons/icon.svg': 'icons/icon.svg', '/icons/icon-192.png': 'icons/icon-192.png', '/icons/icon-512.png': 'icons/icon-512.png',
};
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };

/* ===== المسارات ===== */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const ip = req.socket.remoteAddress;
  try {
    if (!url.pathname.startsWith('/api/')) {
      const file = STATIC[url.pathname];
      if (!file || req.method !== 'GET') { res.writeHead(404); return res.end('Not found'); }
      return fs.readFile(path.join(ROOT, file), (err, data) => {
        if (err) { res.writeHead(404); return res.end('Not found'); }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
        res.end(data);
      });
    }

    const route = `${req.method} ${url.pathname}`;
    if (route === 'GET /api/ping') {
      const u = db.state.users;
      return send(res, 200, { ok: true, name: db.state.settings.name, hasPassword: { owner: !!u.owner.hash, manager: !!u.manager.hash } });
    }

    if (route === 'POST /api/login') {
      if (tooManyAttempts(ip)) return send(res, 429, { error: 'محاولات كثيرة، انتظر دقيقة' });
      const { role, password } = await readBody(req);
      if (!checkPassword(role, password)) { noteFailure(ip); return send(res, 401, { error: 'كلمة المرور غير صحيحة' }); }
      failed.delete(ip);
      const token = crypto.randomBytes(24).toString('hex');
      db.tokens[token] = { role, at: Date.now() };
      persist();
      return send(res, 200, { token, role });
    }

    const user = auth(req, url);
    if (!user) return send(res, 401, { error: 'يجب تسجيل الدخول' });

    switch (route) {
      case 'POST /api/logout':
        delete db.tokens[user.token]; persist();
        return send(res, 200, { ok: true });

      case 'GET /api/state':
        return send(res, 200, { state: publicState(), rev: db.rev, role: user.role });

      case 'POST /api/patch': {
        const body = await readBody(req);
        const patch = sanitizePatch(body.patch || {}, user.role);
        if (!Object.keys(patch).length) return send(res, 200, { rev: db.rev, patch: null });
        applyPatch(db.state, patch);
        db.rev++;
        persist();
        broadcast('patch', { rev: db.rev, patch });
        return send(res, 200, { rev: db.rev, patch });
      }

      case 'POST /api/password': {
        if (user.role !== 'owner') return send(res, 403, { error: 'غير مسموح' });
        const { role, password } = await readBody(req);
        if (!db.state.users[role] || typeof password !== 'string' || password.length < 4) return send(res, 400, { error: 'بيانات غير صالحة' });
        db.state.users[role].hash = hashPassword(role, password);
        // إخراج كل الأجهزة المسجلة بهذا الحساب (إلا الجهاز الحالي)
        for (const [t, v] of Object.entries(db.tokens)) if (v.role === role && t !== user.token) delete db.tokens[t];
        persist();
        broadcast('users', publicState().users);
        return send(res, 200, { ok: true });
      }

      case 'GET /api/chat':
        return send(res, 200, { messages: db.chat.slice(-200) });

      case 'POST /api/chat': {
        const { text } = await readBody(req);
        const clean = String(text || '').trim().slice(0, 1000);
        if (!clean) return send(res, 400, { error: 'رسالة فارغة' });
        const msg = { id: crypto.randomBytes(8).toString('hex'), from: user.role, text: clean, at: Date.now() };
        db.chat.push(msg);
        if (db.chat.length > MAX_CHAT) db.chat = db.chat.slice(-MAX_CHAT);
        persist();
        broadcast('chat', msg);
        return send(res, 200, msg);
      }

      case 'GET /api/events': {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
        res.write(`event: hello\ndata: ${JSON.stringify({ rev: db.rev })}\n\n`);
        const c = { res, role: user.role };
        clients.add(c);
        req.on('close', () => clients.delete(c));
        return;
      }
    }
    send(res, 404, { error: 'غير موجود' });
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, 400, { error: 'طلب غير صالح' });
  }
});

server.listen(PORT, () => {
  const ips = Object.values(os.networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);
  console.log(`\n☕🎮 ${db.state.settings.name} — الخادم يعمل`);
  console.log(`   على هذا الحاسوب:   http://localhost:${PORT}`);
  ips.forEach(ip => console.log(`   من الهواتف (نفس الواي فاي): http://${ip}:${PORT}`));
  console.log(`   البيانات محفوظة في: ${DB_FILE}\n`);
});
