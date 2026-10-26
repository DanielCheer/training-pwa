/* Public harness section — the app boots cleanly on whatever data set is loaded (demo or a private
   overlay): no fatal error, no console error / cfgFail, every day tab renders, and the timeline and
   phase labels follow the program's own PHW/PHASES. Asserts only values derived from the data. */
module.exports=({run,ok,MOD})=>{
console.log('\n=== P0. Boot — the app loads cleanly on the active data set ===');
const probe='({days:DAYS.map(function(d){return d.k}),weeks:TOTAL_WEEKS,phases:PHASES.length,secs:SECTIONS.map(function(s){return s.k})})';
for(const [y,m,d] of [[2026,0,15],[2026,6,25],[2026,9,26],[2027,2,1]]){
 const label=y+'-'+String(m+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
 const n=run(MOD,y,m,d,{probe});
 if(n.fatal){ok(false,label+' threw: '+n.fatal.split('\n')[0]);continue}
 const P=n.probe,C=n.cap;
 ok(n.errors.length===0,label+': no console errors / cfgFail ('+n.errors.join(' | ')+')');
 ok(['mon','tue','wed','thu','fri','sat','sun'].every(k=>P.days.includes(k)),label+': DAYS carries all seven weekday keys');
 ok(C.tlBars===P.weeks,label+': timeline renders one bar per program week ('+C.tlBars+' = TOTAL_WEEKS '+P.weeks+')');
 ok(C.phasesD.length===P.phases&&C.phasesD.every(s=>typeof s==='string'&&s.length>0),label+': every phase got a generated date label');
 ok(C.phase>=0&&C.phase<P.phases,label+': current phase '+C.phase+' is a real phase index');
 const bad=Object.entries(C.days).filter(([k,v])=>!v.focus||!/Cardio/.test(v.segrow));
 ok(!bad.length,label+': every day tab renders a focus line and its section tabs'+(bad.length?' (bad: '+bad.map(b=>b[0]).join(',')+')':''));
 ok(C.ids.heroDates.t.length>0&&/days to tip-off$/.test(C.ids.cd.t),label+': hero dates + countdown rendered ("'+C.ids.heroDates.t+'" · "'+C.ids.cd.t+'")');
}
};
