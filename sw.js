/* عامل الخدمة: يحفظ ملفات التطبيق ليفتح بسرعة ويُثبّت على الهاتف.
   طلبات /api لا تُخزَّن أبداً (البيانات دائماً من الخادم). */
const CACHE = 'cafe-meknas-v7';
const FILES = ['./', 'index.html', 'config.js', 'vendor/supabase-2.118.0.js', 'app.js', 'shared.js', 'style.css', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// الشبكة أولاً (للحصول على آخر نسخة)، ثم النسخة المحفوظة عند انقطاع الاتصال
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/api/')) return;
  e.respondWith(
    fetch(e.request)
      .then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return res; })
      .catch(() => caches.match(e.request).then(r => r || caches.match('index.html')))
  );
});
