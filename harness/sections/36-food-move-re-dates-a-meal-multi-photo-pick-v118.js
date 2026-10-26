/* Public harness section — asserts only engine behaviour on fixtures it seeds itself (or values
   derived from the loaded data), so it passes on the demo and on a private overlay alike. */
module.exports=({run,ok,MOD,ORIG,has,fs,path,DIR,PRIV})=>{{
// ---------- 36. food-move re-dates a meal; multi-photo pick (v118) ----------
console.log('\n=== 36. food-move + multi-photo pick (v118) ===');
{const F=(d,arr)=>['dj-foodlog-'+d,JSON.stringify(arr)];
 const seed=[F('2026-10-17',[{id:'m-old',n:'lunch',kcal:400,p:20,c:40,f:10}]),
             F('2026-10-18',[{id:'m-done',n:'ramen',kcal:1338,p:67,c:134,f:58,photo:'food-photos/x.jpg',sugar:52},
                             {id:'m-queued',n:'',pending:true,photoQueued:true,kcal:0,p:0,c:0,f:0},
                             {id:'m-today',n:'breakfast',kcal:300,p:20,c:30,f:10}])];
 const a=run(MOD,2026,9,18,{move:true,seed});
 ok(!a.fatal,'runs'+(a.fatal?': '+a.fatal.split('\n')[0]:''));
 const m=a.move||{};
 ok(m.d17&&m.d17.join()==='m-old,m-done','moved meal lands on the destination day, once ('+(m.d17||[]).join()+')');
 ok(m.moved&&m.moved.kcal===1338&&m.moved.sugar===52&&m.moved.photo==='food-photos/x.jpg','the entry moves whole (macros, nutrients, photo)');
 ok(m.d18&&m.d18.slice(0,2).join()==='m-queued,m-today','source day keeps everything else; queued-photo meal waits ('+(m.d18||[]).join()+')');
 const imp=new Set(m.imported||[]);
 ok(imp.has('mv-ok')&&imp.has('mv-again')&&imp.has('mv-bad'),'done / already-there / malformed moves are marked imported');
 ok(!imp.has('mv-queued')&&!imp.has('mv-ghost'),'missing target + photo-still-queued moves retry next sync');
 ok(a.errors.some(e=>/not found yet.*m-ghost/.test(e))&&a.errors.some(e=>/malformed.*mv-bad/.test(e)),'missing target + malformed move fail loud');
 const ad=m.added||[];
 ok(ad.length===3&&ad.every(e=>e.pending===true&&typeof e.at==='string'),'3 photos picked -> 3 pending meals ('+ad.length+')');
 ok(ad.length===3&&ad[0].n==='three dishes'&&ad[1].n===''&&ad[2].n==='','typed text rides on the first photo only');
 ok(new Set(ad.map(e=>e.id)).size===3,'each photo meal gets its own id');
}
}};
