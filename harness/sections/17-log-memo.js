/* Public harness section — the workout/food log parse is memoized per render with write-through
   invalidation (v122). Same array back while the stored string is unchanged; a fresh parse after
   lsSet, after a write that bypassed lsSet, and after a refused write (so a mutated-then-unsaved
   array can't leak); the memo empties once the task ends. Async: the sweep is a microtask. */
module.exports=async({run,ok,MOD})=>{
console.log('\n=== P17. Log parse memo: one parse per render, never stale ===');
const probe=`(function(){var R={},W='dj-workout-log',F='dj-foodlog-'+todayKey();
 var a=loadWorkoutLog();R.same=a===loadWorkoutLog();
 lsSet(W,JSON.stringify(a.concat([{id:'m1',exercise:'X',date:'2000-01-01'}])));
 var b=loadWorkoutLog();R.afterLsSet=b!==a&&b.length===a.length+1;
 localStorage.setItem(W,'[]');R.afterBypass=loadWorkoutLog().length===0;
 var c=loadWorkoutLog();c.push({id:'unsaved'});
 var real=localStorage.setItem;localStorage.setItem=function(){var e=new Error('q');e.name='QuotaExceededError';throw e};
 lsSet(W,JSON.stringify(c));localStorage.setItem=real;
 R.afterRefused=loadWorkoutLog().length===0;
 var f=loadFoodLog();R.foodSame=f===foodLogFor(todayKey());
 lsSet(F,JSON.stringify(f.concat([{id:'fm',n:'x',kcal:1,p:0,c:0,f:0}])));R.foodFresh=loadFoodLog().length===f.length+1;
 R.size=_lsMemo.size;R.sizeNow=function(){return _lsMemo.size};return R})()`;
const n=run(MOD,2026,9,26,{probe});
if(n.fatal){ok(false,'threw '+n.fatal.split('\n')[0]);return}
const R=n.probe;
ok(R.same,'two reads in one pass return the same parsed array (one JSON.parse)');
ok(R.afterLsSet,'after lsSet the next read sees the new log');
ok(R.afterBypass,'a write that bypassed lsSet is still seen (the memo checks the stored string)');
ok(R.afterRefused,'a refused write drops the memo: the mutated, unsaved array is not served');
ok(R.foodSame&&R.foodFresh,'loadFoodLog / foodLogFor share the memo and see their writes');
for(let i=0;i<5;i++)await new Promise(r=>setImmediate(r));
ok(R.size>0,'memo held entries during the pass ('+R.size+')');
ok(R.sizeNow()===0,'the memo is empty once the task ends (per render, not per session)');
};
