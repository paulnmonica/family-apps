// 두 앱이 함께 쓰는 서비스 워커 본체 (인터넷이 없어도 앱이 열리도록 파일을 저장해 둠)
// 각 앱의 sw.js가 APP, VERSION, FILES를 정한 뒤 이 파일을 불러와요.
const CACHE = APP + '-' + VERSION;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      // 이 앱의 옛 버전과, 두 앱이 하나였던 시절의 저장본(family-apps-)을 지움
      .then(keys => Promise.all(keys.filter(k => (k.startsWith(APP + '-') && k !== CACHE) || k.startsWith('family-apps-')).map(k => caches.delete(k))))
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
