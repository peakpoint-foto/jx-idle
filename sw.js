<<<<<<< HEAD
const C = 'jxidle-v24';   // v24: bỏ ref.js/data.js (5,3MB) khỏi precache — nặng, làm chậm install;
// chúng được cache ở lần fetch đầu (network-first + put trong fetch handler).
// + guarded API Bearer <redacted> (guild tech, world boss) — ab3862b
const CORE = ['./index.html', './style.css', './ui/jx2.css', './js/jxshell.js', './manifest.json', './js/core.js', './js/main.js', './world.js'];
=======
const C = 'jxidle-v25';   // v25: guild_tech_ui Bearer <redacted> onlApi (GET+POST); bỏ ref.js/data.js khỏi precache (W0-4);
// ref.js/data.js được cache ở lần fetch đầu (network-first + put trong fetch handler).
// + guarded API Bearer <redacted> (guild tech, world boss) — ab3862b
const CORE = ['./index.html', './style.css', './ui/jx2.css', './js/jxshell.js', './manifest.json', './js/core.js', './js/main.js', './world.js'];
self.addEventListener('install', e => e.waitUntil(
  caches.open(C).then(c => c.addAll(CORE)).catch(() => caches.open(C))
    .then(() => self.skipWaiting())
));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim())
));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const req = e.request;
  const u = new URL(req.url);
  if (u.origin !== self.location.origin || u.pathname.startsWith('/api/')) return;   // API online va tai nguyen ngoai: khong cache
  const layMang = () => fetch(req).then(r => { if (r.ok) { const cp = r.clone(); caches.open(C).then(c => c.put(req, cp)); } return r; });
  if (req.mode === 'navigate') {                      // dieu huong: mang truoc, offline thi lay ban da luu
    e.respondWith(layMang().catch(() => caches.match(req).then(r => r || caches.match('./index.html'))));
    return;
  }
  e.respondWith(layMang().catch(() => caches.match(req)));
});
