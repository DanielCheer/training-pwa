/* Public harness section — the Fuel tab's sample day: its Total row and "vs your targets" line are
   computed from PROFILE.sampleDay.items, and {kcal}/{p}/{c}/{f} in its prose are filled from DAY_TARGETS
   (the owner's card once claimed a band DAY_TARGETS had already moved past). A patched DAY_TARGETS must
   move the prose and the verdict with it. */
module.exports=({run,ok,MOD})=>{
console.log('\n=== P8. Fuel sample day: totals + band prose derived ===');
const probe='({card:document.getElementById("sampleDayCard").innerHTML,items:PROFILE.sampleDay.items,T:DAY_TARGETS,intro:PROFILE.sampleDay.intro,note:PROFILE.sampleDay.note})';
const n=run(MOD,2026,9,26,{probe});
if(n.fatal){ok(false,'threw '+n.fatal.split('\n')[0]);return}
const P=n.probe,sum=k=>P.items.reduce((a,i)=>a+i[k],0),tot={kcal:sum('kcal'),p:sum('p'),c:sum('c'),f:sum('f')};
ok(n.errors.length===0,'no console errors / cfgFail ('+n.errors.join(' | ')+')');
const totTxt='~'+Math.round(tot.kcal)+' kcal · '+Math.round(tot.p)+'g P · '+Math.round(tot.c)+'g C · '+Math.round(tot.f)+'g F';
ok(P.card.includes('>'+totTxt+'</div>'),'Total row = the sum of the item rows ('+totTxt+')');
const band=r=>r.map(v=>v.toLocaleString('en-US')).join('–');
ok(!/\{(kcal|p|c|f)\}/.test(P.card),'no unfilled {token} left in the card');
for(const k of ['kcal','p','c','f'])if(P.intro.includes('{'+k+'}')||P.note.includes('{'+k+'}'))ok(P.card.includes(band(P.T[k])),'{'+k+'} reads DAY_TARGETS.'+k+' ('+band(P.T[k])+')');
const tag=(v,r,u)=>{v=Math.round(v);return v<r[0]?(r[0]-v)+u+' under':v>r[1]?(v-r[1])+u+' over':'on target'};
const want=[['kcal','calories',' kcal'],['p','protein','g'],['c','carbs','g'],['f','fat','g']].map(([k,l,u])=>l+' <b[^>]*>'+tag(tot[k],P.T[k],u)+'</b>').join(' · ');
ok(new RegExp('vs your targets: '+want+'</div>').test(P.card),'vs-targets line matches DAY_TARGETS for every macro');
// move the targets: the prose and verdict must follow (DAY_TARGETS declared on one line in data/profile.js)
const SHIFT=s=>s.replace(/const DAY_TARGETS=\{[^}]*\};/,'const DAY_TARGETS={kcal:[1000,1100],p:[10,20],c:[10,20],f:[10,20]};');
const m=run(MOD,2026,9,26,{probe,patch:SHIFT});
ok(!m.fatal&&m.probe.T.kcal[0]===1000,'patched DAY_TARGETS loads');
if(!m.fatal){
 if(P.intro.includes('{kcal}')||P.note.includes('{kcal}'))ok(m.probe.card.includes('1,000–1,100'),'prose follows the patched kcal band (1,000–1,100)');
 ok(m.probe.card.includes('calories <b style="color:var(--or)">'+(Math.round(tot.kcal)-1100)+' kcal over</b>'),'verdict follows the patched targets (calories '+(Math.round(tot.kcal)-1100)+' kcal over)');
}
};
