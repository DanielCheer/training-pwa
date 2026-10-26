/* Public harness section — every exercise's diagram key resolves. An exercise names its figure with
   `d:` (data/program.js, data/overrides.js) and DIA_HINTS maps names to keys; a key missing from the
   diagram library P silently renders no figure, so walk every exercise list the engine can show
   (each base epoch, the Monday variants, every override, every gym session, legacy ones included). */
module.exports=({run,ok,MOD})=>{
console.log('\n=== P14. Diagram keys resolve ===');
const probe=`(function(){var keys=[],lists=[];
 BASE_EPOCHS.forEach(function(ep){ep.days.forEach(function(d){lists.push(d.secs)})});
 WEEK_OVERRIDES.forEach(function(o){Object.keys(o.days||{}).forEach(function(k){lists.push((o.days[k]||{}).secs||{})})});
 GYM_SESSIONS.concat(GYM_SESSIONS_LEGACY).forEach(function(s){lists.push(s.secs||{})});
 lists.push({mv:[].concat.apply([],MON_VARIANTS)});
 lists.forEach(function(secs){Object.keys(secs).forEach(function(k){(secs[k]||[]).forEach(function(e){if(e&&e.d)keys.push(e.d)})})});
 DIA_HINTS.forEach(function(h){keys.push(h[1])});
 return {keys:keys,missing:keys.filter(function(k){return !P[k]}),lib:Object.keys(P).length}})()`;
const n=run(MOD,2026,9,26,{probe});
if(n.fatal){ok(false,'threw '+n.fatal.split('\n')[0]);return}
const R=n.probe;
ok(R.keys.length>0,'found '+R.keys.length+' diagram references (library has '+R.lib+' figures)');
ok(R.missing.length===0,'every d: key and DIA_HINTS key exists in the diagram library'+(R.missing.length?' — missing: '+[...new Set(R.missing)].join(', '):''));
};
