const prefix = `desktop-clock-${self.registration.scope}-`;
const cacheName = `${prefix}v1`;
const files = ['index.html','style.css','app.js','clock-logic.js','manifest.webmanifest','icon-192.png','icon-512.png'];
const urls = new Set(files.map(f => new URL(f,self.registration.scope).href));
const pageURL = new URL('index.html',self.registration.scope).href;
// Only our own app shell is cached, never sign-in pages or third-party responses.
async function validPage(response) {
  return response.ok && !response.redirected && response.headers.get('content-type')?.includes('text/html') && (await response.clone().text()).includes('<title>デスクトップ時計</title>');
}
self.addEventListener('install', event => {
  event.waitUntil((async()=>{
    const cache = await caches.open(cacheName);
    for (const url of urls) {
      const response = await fetch(url,{cache:'reload',credentials:'same-origin'});
      if (!response.ok || response.redirected || (url === pageURL && !await validPage(response))) throw new Error('時計のファイルを取得できません');
      await cache.put(url,response);
    }
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async()=>{
    const keys = await caches.keys();
    await Promise.all(keys.filter(k=>k.startsWith(prefix)&&k!==cacheName).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (!url.href.startsWith(self.registration.scope)) return;
  if (event.request.mode === 'navigate' && (url.pathname === new URL(self.registration.scope).pathname || url.href.split('?')[0] === pageURL)) {
    event.respondWith((async()=>{
      const cache = await caches.open(cacheName);
      const controller = new AbortController();
      const timeout = setTimeout(()=>controller.abort(),4000);
      try {
        const response = await fetch(event.request,{signal:controller.signal});
        if (await validPage(response)) {await cache.put(pageURL,response.clone()); return response;}
        // Respect an online authentication response; only fall back on network failure.
        return response;
      } catch {return await cache.match(pageURL) || new Response('時計を一度オンラインで開いてください。',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});}
      finally {clearTimeout(timeout);}
    })());
  } else if (urls.has(url.href)) {
    event.respondWith((async()=>{
      const cached = await caches.match(url.href); return cached || fetch(event.request);
    })());
  }
});
