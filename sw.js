const PREFIX='jiji-fighter-'+encodeURIComponent(self.registration.scope)+'-';
const CACHE=PREFIX+'BUILD_ID';
const CORE=['./','./index.html','./mp4-share.js','./linux-music-recovery.js','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./icons/apple-touch-icon.png','./music/mazz-db-2017.mp3'];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)));
  // Wait for existing game windows to close; never reload an active mission.
});
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for(const name of await caches.keys())if(name.startsWith(PREFIX)&&name!==CACHE)await caches.delete(name);
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url),scope=new URL(self.registration.scope);
  if(request.method!=='GET'||url.origin!==scope.origin||!url.pathname.startsWith(scope.pathname))return;
  // Live means live: neither cache nor synthesize topic API responses.
  if(url.pathname.endsWith('/api/trends'))return;
  if(request.mode==='navigate'){
    event.respondWith(fetch(request).then(response=>{
      if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(c=>c.put('./index.html',copy)));}
      return response;
    }).catch(()=>caches.open(CACHE).then(c=>c.match(new URL('./index.html',scope).href))));
    return;
  }
  if(!CORE.some(item=>new URL(item,scope).href===url.href))return;
  event.respondWith((async()=>{
    const cached=await (await caches.open(CACHE)).match(request.url);
    if(cached){
      const range=request.headers.get('range');
      if(range&&url.pathname.endsWith('.mp3')){
        const match=/^bytes=(\d*)-(\d*)$/.exec(range);
        if(match&&(match[1]||match[2])){
          const data=await cached.arrayBuffer(),size=data.byteLength;
          const start=match[1]?Number(match[1]):Math.max(0,size-Number(match[2]));
          const end=match[1]?(match[2]?Math.min(Number(match[2]),size-1):size-1):size-1;
          if(start>end||start>=size)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}});
          return new Response(data.slice(start,end+1),{status:206,headers:{'Content-Type':'audio/mpeg','Accept-Ranges':'bytes','Content-Range':`bytes ${start}-${end}/${size}`,'Content-Length':String(end-start+1)}});
        }
      }
      return cached;
    }
    return fetch(request);
  })());
});
