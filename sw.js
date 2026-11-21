// بيخلّي صفحات البرنامج تفتح حتى لو النت فاصل (بيحتفظ بآخر نسخة اتفتحت)
// الشغل: من النت الأول، ولو مفيش نت من النسخة المحفوظة. طلبات قاعدة البيانات مش بتعدّي من هنا.
const CACHE = 'pos-shell-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const req = e.request; const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(async () => {
      const hit = await caches.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') return (await caches.match(new URL('cashier/', self.registration.scope).href)) || (await caches.match(self.registration.scope)) || Response.error();
      return Response.error();
    })
  );
});
