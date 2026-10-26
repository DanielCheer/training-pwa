/* Public harness section — base epochs (BASE_EPOCHS in data/program.js). The epoch for a date is the
   last one whose `from` is on/before it; baseDaysFor() and whyList() read it; a malformed list
   fail-louds instead of silently routing every date to the wrong week. */
module.exports=({run,ok,MOD})=>{
console.log('\n=== P4. Base epochs ===');
const probe=`BASE_EPOCHS.map(function(e,i){var prev=new Date(e.from?e.from+'T12:00:00':'2000-01-02T12:00:00');prev.setDate(prev.getDate()-1);
 var pk=prev.getFullYear()+'-'+String(prev.getMonth()+1).padStart(2,'0')+'-'+String(prev.getDate()).padStart(2,'0');
 return {i:i,from:e.from,own:BASE_EPOCHS.indexOf(epochFor(e.from||'2000-01-01')),before:BASE_EPOCHS.indexOf(epochFor(pk)),days:baseDaysFor(e.from||'2000-01-01')===e.days}})`;
const n=run(MOD,2026,9,26,{probe});
if(n.fatal){ok(false,'threw: '+n.fatal.split('\n')[0]);return}
const E=n.probe;
ok(E.length>=1&&E[0].from==='','first epoch is open-ended (from:"") — '+E.length+' epoch(s)');
for(const e of E){
 ok(e.own===e.i&&e.days,'epoch '+e.i+(e.from?' (from '+e.from+')':'')+': its own start date resolves to it, baseDaysFor returns its days');
 if(e.i)ok(e.before===e.i-1,'epoch '+e.i+': the day before '+e.from+' still resolves to epoch '+(e.i-1)+' (history keeps its era)');
}
const bad=run(MOD,2026,9,26,{patch:s=>s.replace('const BASE_EPOCHS=[','const BASE_EPOCHS=[{from:"2099-01-01",days:DAYS,why:WHY},')});
ok(bad.errors.some(e=>/BASE_EPOCHS/.test(e)),'malformed BASE_EPOCHS (first epoch dated) → cfgFail fires');
const bad2=run(MOD,2026,9,26,{patch:s=>s.replace('const BASE_EPOCHS=[','const BASE_EPOCHS=[{from:"",days:DAYS,why:WHY},{from:"2000-1-1",days:DAYS,why:WHY},')});
ok(bad2.errors.some(e=>/BASE_EPOCHS\[1\]\.from/.test(e)),'malformed epoch date → cfgFail names the bad entry');
};
