/* Shell only: never cache authenticated API calls or signed photo URLs. */
const CACHE='briquotheque-shell-v16';
const SHELL=['/','/index.html','/interface.css?v=14','/collector.css?v=1','/collector-model.js?v=1','/collector.js?v=2','/vendor/supabase.js','/manifest.webmanifest','/favicon-square.svg?v=3','/apple-touch-icon-v3.png','/app-icon-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL))));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for(const name of await caches.keys())if(name.startsWith('briquotheque-shell-')&&name!==CACHE)await caches.delete(name);
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  const req=event.request,url=new URL(req.url);
  if(req.method!=='GET'||url.origin!==self.location.origin)return;
  if(req.mode==='navigate'){
    event.respondWith(fetch(req).catch(()=>caches.match('/index.html')));return;
  }
  if(SHELL.includes(url.pathname+url.search))event.respondWith(caches.open(CACHE).then(async cache=>{
    const hit=await cache.match(req);if(hit)return hit;
    const response=await fetch(req);if(response.ok)await cache.put(req,response.clone());return response;
  }));
});
