const C='twinlakes-v23';
const F=['./','index.html','app.js','images.js','manifest.webmanifest','icon-192.png','icon-512.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(C).then(c=>Promise.all(F.map(u=>c.add(new Request(u,{cache:'reload'})).catch(()=>{})))).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))).then(()=>self.clients.claim())));
const store=(q,r)=>{if(r&&r.ok){const c=r.clone();caches.open(C).then(x=>x.put(q,c))}return r};
self.addEventListener('fetch',e=>{const q=e.request;if(q.method!=='GET')return;
if(new URL(q.url).pathname.endsWith('/images.js')){e.respondWith(caches.match(q).then(r=>r||fetch(q,{cache:'no-cache'}).then(x=>store(q,x))));return}
e.respondWith(new Promise(res=>{let t=setTimeout(()=>{t=null;caches.match(q).then(r=>{if(r)res(r)})},2500);
fetch(q,{cache:'no-cache'}).then(r=>{if(t)clearTimeout(t);res(store(q,r))}).catch(()=>{if(t)clearTimeout(t);caches.match(q).then(r=>res(r||Response.error()))})}))});
