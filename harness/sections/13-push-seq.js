/* Public harness section — the push-logs seq rule, client side. The server answers 409
   {state:'stale-seq', seq} when this phone's counter is behind the snapshot it holds; the app adopts
   max(stored, own), retries ONCE with the next number, and counts the push as done only on a 200.
   The server-side rule is covered by tests/test_serve_posts.py. Async: fetch is a promise chain. */
module.exports=async({run,ok,MOD})=>{
console.log('\n=== P13. Push seq: adopt the server\'s seq on 409 and retry once ===');
// a server-backed install over http (the demo ships SERVER=null and the vm is file:)
const SRV=s=>s.replace(/const SERVER=null;/,'const SERVER={push:true,inbox:true,autofill:true,drafts:true,photos:true};')
 .replace("const HAS_SERVER=!!SERVER&&location.protocol.startsWith('http');","const HAS_SERVER=!!SERVER;");
const settle=async()=>{for(let i=0;i<20;i++)await new Promise(r=>setImmediate(r))};
const scenario=async(label,replies,ownSeq)=>{
 const n=run(MOD,2026,9,26,{patch:SRV,seed:[['dj-seeded','x'],['dj-push-seq',String(ownSeq)]]});
 if(n.fatal){ok(false,label+': threw '+n.fatal.split('\n')[0]);return null}
 await settle(); // let the boot-time foreground sync (default fetch stub: offline) finish first
 const C=n.ctx,sent=[];
 C.fetch=(url,o)=>{if(url!=='push-logs')return Promise.resolve({ok:false,status:404,json:()=>Promise.resolve(null)});
  const b=JSON.parse(o.body);sent.push({seq:b.seq,hdr:o.headers,v:b.v,keys:Object.keys(b).sort().join()});const r=replies[Math.min(sent.length-1,replies.length-1)];
  return Promise.resolve({ok:r.status===200,status:r.status,json:()=>Promise.resolve(r.body)})};
 let res;C.pushDeviceLogs().then(v=>{res=v});await settle();
 return {res,sent,stored:C.localStorage.getItem('dj-push-seq'),last:C.localStorage.getItem('dj-push-last')};
};
let r=await scenario('in step',[{status:200,body:{ok:true}}],7);
ok(r&&r.res===true&&r.sent.length===1&&r.sent[0].seq===8&&r.stored==='8','in step: sends own+1 (8), 200 → seq stored as 8');
ok(r&&r.sent[0].v===2&&r.sent[0].keys==='day,done,ls,phase,pushedAt,sec,seq,v','payload v2: day, done, ls, phase, pushedAt, sec, seq, v (no tueMode) — '+(r&&r.sent[0].keys));
ok(r&&r.sent[0].hdr['X-Train-Client']==='1'&&r.sent[0].hdr['Content-Type']==='application/json','the push carries Content-Type: application/json + X-Train-Client');
r=await scenario('behind',[{status:409,body:{ok:false,state:'stale-seq',seq:40}},{status:200,body:{ok:true}}],3);
ok(r&&r.res===true&&r.sent.map(s=>s.seq).join()==='4,41'&&r.stored==='41'&&!!r.last,'behind (own 3, server 40): 409 → adopts 40, retries once with 41, stores 41, marks synced ('+(r&&r.sent.map(s=>s.seq).join())+')');
r=await scenario('still refused',[{status:409,body:{ok:false,state:'stale-seq',seq:40}},{status:409,body:{ok:false,state:'stale-seq',seq:90}}],3);
ok(r&&r.res===false&&r.sent.length===2&&!r.last,'a second 409 is not retried again (one retry), the push reports failure, not synced');
r=await scenario('junk 409',[{status:409,body:{ok:false,state:'stale-seq',seq:'x'}}],3);
ok(r&&r.res===false&&r.sent.length===1&&r.stored==='3','a 409 without a usable seq: no retry, the counter is untouched');
};
