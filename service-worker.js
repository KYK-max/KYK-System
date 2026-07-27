const C='kyk-v160';
const A=['./','./index.html','./css/style.css?v=1.6.1','./js/app.js?v=1.6.1','./js/jszip.min.js?v=1.6.1','./js/xlsx.full.min.js?v=1.6.1','./manifest.json?v=1.6.1','./version.json','./KYKDB.xlsx'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(C).then(c=>c.addAll(A)))});
self.addEventListener('activate',e=>e.waitUntil(Promise.all([self.clients.claim(),caches.keys().then(k=>Promise.all(k.filter(x=>x.startsWith('kyk-')&&x!==C).map(x=>caches.delete(x))))])));
self.addEventListener('message',e=>{if(e.data?.type==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('fetch',e=>{
 const u=new URL(e.request.url);
 if(u.pathname.endsWith('/version.json')||u.pathname.endsWith('/service-worker.js')||u.pathname.endsWith('/KYKDB.xlsx')){e.respondWith(fetch(e.request,{cache:'no-store'}).catch(()=>caches.match(e.request)));return}
 if(e.request.mode==='navigate'){e.respondWith(fetch(e.request,{cache:'no-store'}).then(r=>{const copy=r.clone();caches.open(C).then(c=>c.put('./index.html',copy));return r}).catch(()=>caches.match('./index.html')));return}
 e.respondWith(caches.match(e.request).then(cached=>{const network=fetch(e.request).then(r=>{if(r&&r.ok&&e.request.method==='GET'){const copy=r.clone();caches.open(C).then(c=>c.put(e.request,copy))}return r});return cached||network}));
});
