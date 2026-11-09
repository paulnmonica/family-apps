// 인터넷이 없어도 앱이 열리도록 파일을 휴대폰에 저장해 두는 서비스 워커
// 앱 파일을 고친 뒤에는 VERSION 숫자를 올려 주세요. 그래야 휴대폰에 새 버전이 들어가요.
const VERSION = 'v1';
const CACHE = 'family-apps-' + VERSION;
const FILES = [
  './', './index.html', './manifest.webmanifest',
  './shared/common.css', './shared/common.js',
  './allowance/index.html',
  './pilsa/index.html', './pilsa/sentences.js',
  './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('family-apps-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (url.origin !== self.location.origin && !isFont) return;

  // 앱 파일: 인터넷이 되면 새 파일을 받고, 안 되면 저장해 둔 파일을 씀
  // 글꼴: 저장해 둔 것을 먼저 씀
  if (isFont) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res;
    })));
    return;
  }
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || caches.match('./index.html')))
  );
});
