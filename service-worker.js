const C='kyk-v142';
const A=['./','./index.html','./css/style.css?v=142','./js/app.js?v=142','./js/jszip.min.js?v=142','./manifest.json','./version.json'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(C).then(c=>c.addAll(A)))});
self.addEventListener('activate',e=>e.waitUntil(Promise.all([self.clients.claim(),caches.keys().then(k=>Promise.all(k.filter(x=>x.startsWith('kyk-')&&x!==C).map(x=>caches.delete(x))))])));
self.addEventListener('message',e=>{if(e.data?.type==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET')return;
 if(e.request.mode==='navigate'||u.pathname.endsWith('/version.json')||u.pathname.endsWith('/index.html')){e.respondWith(fetch(e.request,{cache:'no-store'}).then(r=>{if(r&&r.ok){const cp=r.clone();caches.open(C).then(c=>c.put(e.request,cp))}return r}).catch(()=>caches.match(e.request).then(x=>x||caches.match('./index.html'))));return}
 e.respondWith(fetch(e.request).then(r=>{if(r&&r.ok){const cp=r.clone();caches.open(C).then(c=>c.put(e.request,cp))}return r}).catch(()=>caches.match(e.request)));
});
