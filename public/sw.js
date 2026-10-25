/* 江湖行 Service Worker：静态资源离线可用，接口实时 */
const VER = 'wuxia-v2';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VER).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VER).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (u.pathname.startsWith('/api/')) return;           // 接口永远走网络
  if (e.request.method !== 'GET') return;
  if (/\.(png|jpg|jpeg|webp)$/i.test(u.pathname)) {     // 图片：先缓存
    e.respondWith(caches.open(VER).then(async (c) => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok) c.put(e.request, res.clone());
      return res;
    }));
    return;
  }
  e.respondWith(caches.open(VER).then(async (c) => {
    try {
      const res = await fetch(e.request);
      if (res && res.ok) c.put(e.request, res.clone());
      return res;
    } catch (err) {
      const hit = await c.match(e.request) || await c.match('/index.html') || await c.match('/');
      if (hit) return hit;
      throw err;
    }
  }));
});
