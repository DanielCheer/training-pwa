/* Public harness section — asserts only engine behaviour on fixtures it seeds itself (or values
   derived from the loaded data), so it passes on the demo and on a private overlay alike. */
module.exports=({run,ok,MOD,ORIG,has,fs,path,DIR,PRIV})=>{{
// ---------- 37. Local-model drafts: shown as ≈, never counted, replaced by the final (v119) ----------
console.log('\n=== 37. Local-model drafts (v119) ===');
{const D='2026-10-18';
 const pend=(id,n,at,x)=>Object.assign({id,n,at,pending:true,kcal:0,p:0,c:0,f:0},x||{});
 const seed=[['dj-foodlog-'+D,JSON.stringify([pend('f-A','pho','2026-10-18T15:40:00Z'),
   pend('f-B','','2026-10-18T15:58:00Z',{photoQueued:true}),
   {id:'f-C',n:'rice',kcal:500,p:10,c:100,f:2},
   pend('f-D','mystery bowl','2026-10-18T15:59:00Z')])]];
 const a=run(MOD,2026,9,18,{draft:true,seed,probe:'!!SERVER'}); // noon local = 16:00Z
 ok(!a.fatal,'runs'+(a.fatal?': '+a.fatal.split('\n')[0]:''));
 const m=a.draft||{};
 ok(m.r1&&m.r1.touched&&m.r1.touchedToday,'applyDrafts reports what it touched');
 ok(m.A1&&m.A1.pending===true&&m.A1.kcal===0&&m.A1.draft&&m.A1.draft.kcal===244,'draft lands on entry.draft; pending + 0 macros untouched');
 ok(m.C1&&m.C1.kcal===500&&m.C1.draft&&m.C1.draft.kcal===999&&m.tot1&&m.tot1.kcal===500,'a draft on a final meal never changes its counted macros');
 ok(m.tot1&&m.tot1.kcal===500&&m.tot1.draft&&m.tot1.draft.kcal===244&&m.tot1.draft.n===1,'counted total excludes drafts; draft summed apart ('+JSON.stringify(m.tot1&&m.tot1.draft)+')');
 ok(/≈244 kcal/.test(m.list1)&&/draft/.test(m.list1),'row shows ≈244 kcal draft');
 ok(/photo waiting to upload/.test(m.list1),'queued-photo meal says photo waiting (no "drafting…")');
 ok(/draft: estimator-unsure/.test(m.list1),'reported skip shows its reason on the row');
 ok(/≈244 kcal · ≈16g protein in 1 draft — not counted/.test(m.totals1),'totals card shows the draft line as not counted');
 ok(!/⚠ Draft/.test(m.strip1),'no draft warning when nothing is overdue and the last run was ok');
 ok(m.tot2&&m.tot2.draft.n===0&&/drafting…/.test(m.list2),'renaming the meal makes the draft stale -> drafting…, not counted as draft');
 if(a.probe){ // a companion server is configured: the draft line is live
  ok(/⚠ Draft \(PC local model\): 1 meal has waited 5\+ min/.test(m.strip2),'event-keyed freshness: a meal waiting too long turns the strip amber');
  ok(/⚠ Draft .*FAILED — ollama-down/.test(m.strip3),'worker error surfaces on the strip');
 }else ok(/Static demo/.test(m.strip2)&&/Static demo/.test(m.strip3),'SERVER=null: no draft line — the strip says the server features are off');
 ok(m.A3&&m.A3.draft.kcal===488&&m.A4&&m.A4.draft.kcal===488,'newer draft applies; an older one never overwrites');
 ok(m.A5&&m.A5.pending===undefined&&m.A5.kcal===500&&m.A5.draft&&m.A5.draft.kcal===488,'final food-update clears pending and keeps the draft');
 ok(m.tot5&&m.tot5.kcal===1000&&m.tot5.draft.n===0,'after the final: counted = finals only, no draft in the sum');
 ok(/draft was ≈488/.test(m.list5),'final row shows "draft was ≈488"');
 const hdr=(m.csv||[[]])[0],row=(m.csv||[]).find(r=>r[2]==='pho large');
 ok(hdr[hdr.length-2]==='Draft kcal'&&hdr[hdr.length-1]==='Status'&&row&&row[hdr.length-2]===488,'CSV: Draft kcal column before Status');
 ok(m.moved&&m.moved.draft&&m.moved.draft.kcal===488,'food-move carries the draft with the meal');
 ok(m.unknownAdded===0&&!(m.imported||[]).includes('fut-1'),'unknown inbox type: not added as a meal, not marked imported');
 ok(!a.errors.length,'no console errors ('+a.errors.join(' | ')+')');
}
}};
