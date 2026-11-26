const VERSION = 'v29';
const SHELL = `shell-${VERSION}`;
const TILES = 'tiles-v1'; // 圖磚快取跨版本保留
const PHOTOS = 'photos-v1';
const FONTS = 'fonts-v1'; // 主題的 Google Fonts，離線也能顯示
const TILE_HOST = 'server.arcgisonline.com';
const CORE = ['./', './index.html', './app.js', './config.js', './themes.js', './vendor/supabase.js', './seed.json', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png', './img/0412e7fc22f86ffd.webp', './img/0885af984e126684.webp', './img/1efa56162060cad3.webp', './img/393f869237631466.webp', './img/44d2650b82a60bbe.webp', './img/4bb12cb1589e17e4.webp', './img/5f84d6ba4e9f6605.webp', './img/686f2aa5355b04be.webp', './img/6ef9eade48d4f874.webp', './img/7f7bc1fb38c871d6.webp', './img/87c7e2e1df829e99.webp', './img/8df82cfc2f871ac7.webp', './img/931ee2b3bbff4c81.webp', './img/94366815ae137b6f.webp', './img/a543c7c30989ae21.webp', './img/af3bf6480178fd4c.webp', './img/b63b6db99a7578bd.webp', './img/b8a34eb832d5f4db.webp', './img/bbeea4839c9b4453.webp', './img/c9a5fa1b70c15209.webp', './img/d4c63de28272f001.webp', './img/ff9e41302199bdcb.webp'];
const BLANK = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), c => c.charCodeAt(0));

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k.startsWith('shell-') && k !== SHELL).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// 網路優先；訊號差時逾時改用快取
async function networkFirst(req, ms, key) {
  const cache = await caches.open(SHELL);
  try {
    const res = await Promise.race([fetch(req), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
    if (res.ok) { cache.put(key || req, res.clone()); return res; }
    // 伺服器回錯誤（404／5xx）時，有快取就用快取，避免整個 App 變成錯誤頁
    const hit = await cache.match(key || req, { ignoreSearch: true });
    return hit || res;
  } catch (err) {
    const hit = await cache.match(key || req, { ignoreSearch: true });
    if (hit) return hit;
    throw err;
  }
}
// 快取優先（圖磚、照片）
async function cacheFirst(req, name, blankOnFail) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
    return res;
  } catch (err) {
    if (blankOnFail) return new Response(BLANK, { headers: { 'Content-Type': 'image/png' } });
    throw err;
  }
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname === TILE_HOST) return e.respondWith(cacheFirst(req, TILES, true));
  if (url.pathname.includes('/storage/v1/object/public/')) return e.respondWith(cacheFirst(req, PHOTOS, false));
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') return e.respondWith(cacheFirst(req, FONTS, false));
  if (url.origin !== location.origin || /^\/(api\/|mcp$|ai$|llms\.txt$)/.test(url.pathname)) return;
  if (req.mode === 'navigate' && (url.pathname === '/' || url.pathname === '/index.html')) return e.respondWith(networkFirst(req, 2500, './index.html'));
  if (url.pathname.startsWith('/img/')) return e.respondWith(caches.match(req).then(h => h || fetch(req)));
  e.respondWith(networkFirst(req, 2500));
});
