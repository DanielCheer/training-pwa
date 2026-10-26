/* Public harness section — first-open seed (data/seed.js → seedOnce()). With a SEED, every key lands
   in localStorage once, a marker makes it one-shot, and existing data is never overwritten. With
   SEED=null (a real install) nothing is written. Shape checks apply to whatever SEED is loaded. */
module.exports=({run,ok,MOD})=>{
console.log('\n=== P1. First-open seed ===');
const probe='SEED?JSON.parse(JSON.stringify(SEED)):null';
const n=run(MOD,2026,9,26,{probe});
if(n.fatal){ok(false,'threw: '+n.fatal.split('\n')[0]);return}
const S=n.probe;
if(!S){
 ok(!n.store.has('dj-seeded')&&![...n.store.keys()].some(k=>/^dj-(workout-log|bw-log|foodlog-)/.test(k)),'SEED=null: seedOnce writes nothing');
 return;
}
const keys=Object.keys(S);
ok(keys.every(k=>n.store.has(k)),'every SEED key is in localStorage after the first open ('+keys.length+' keys)');
ok(n.store.has('dj-seeded'),'marker key dj-seeded set (LS_NS + "seeded")');
ok(keys.every(k=>k.indexOf('dj-')===0),'every SEED key uses the dj- namespace the rest of the app reads');
// one-shot: a second open with the marker present must not re-seed a key the user has since emptied
const after=[...n.store.entries()].map(([k,v])=>[k,k==='dj-bw-log'?'[]':v]);
const m=run(MOD,2026,9,26,{seed:after});
ok(m.store.get('dj-bw-log')==='[]','second open: the marker stops the seed from overwriting the user\'s data');
// never overwrites existing data even on a first open (no marker yet)
const m2=run(MOD,2026,9,26,{seed:[['dj-bw-log','[{"d":"2026-10-01","w":150}]']]});
ok(m2.store.get('dj-bw-log')==='[{"d":"2026-10-01","w":150}]','first open over existing data: an occupied key is left alone');
// shape of the seeded history (what the demo is meant to show off)
const wlog=S['dj-workout-log']||[],weeks=new Set(wlog.map(e=>Math.floor(Date.parse(e.date+'T12:00:00')/(7*864e5))));
ok(wlog.length>0&&weeks.size>=4,'workout log spans 4+ distinct weeks ('+wlog.length+' sets, '+weeks.size+' weeks)');
const byEx={};wlog.forEach(e=>{(byEx[e.exercise]=byEx[e.exercise]||[]).push(e)});
const progressed=Object.values(byEx).filter(a=>{const s=a.slice().sort((x,y)=>x.date.localeCompare(y.date));return s[s.length-1].weight>s[0].weight});
ok(progressed.length>0,'sets show progression (weight rises over time on '+progressed.length+' lifts)');
ok((S['dj-bw-log']||[]).length>=6,'6+ weigh-ins ('+(S['dj-bw-log']||[]).length+')');
const foodDays=keys.filter(k=>k.indexOf('dj-foodlog-')===0);
const pending=foodDays.reduce((a,k)=>a+S[k].filter(e=>e.pending).length,0);
ok(foodDays.length>=3&&pending>=1,'3+ meal days incl. a pending meal ('+foodDays.length+' days, '+pending+' pending)');
ok(wlog.every(e=>/^\d{4}-\d{2}-\d{2}$/.test(e.date)&&e.date<n.cap.localDayKey),'every seeded set is dated before today');
};
