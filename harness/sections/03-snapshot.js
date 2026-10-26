/* Public harness section — render snapshot. Captures what the app renders (timeline, phase row,
   banner, week list, Fuel numbers, every day tab's focus/meta/note/tabs/content) at fixed pinned
   dates and compares it with the saved baseline for the active data set:
     demo data       → harness/baseline/demo.json            (committed)
     private overlay → <private>/harness/baseline/snapshot.json
   Any difference fails. After an INTENDED change, re-run with --rebaseline and review the diff. */
module.exports=({run,ok,fs,path,DIR,PRIV,OVERLAY,REBASELINE,MOD})=>{
console.log('\n=== P3. Render snapshot vs baseline ===');
const file=OVERLAY?path.join(PRIV,'harness','baseline','snapshot.json'):path.join(DIR,'harness','baseline','demo.json');
const pins=[[2026,6,25],[2026,8,20],[2026,9,26],[2027,0,10]];
const snap={};
for(const [y,m,d] of pins){const n=run(MOD,y,m,d,{});const k=y+'-'+(m+1)+'-'+d;
 snap[k]=n.fatal?{fatal:n.fatal.split('\n')[0]}:{phase:n.cap.phase,phasesD:n.cap.phasesD,ids:n.cap.ids,days:n.cap.days,errors:n.errors}}
if(REBASELINE){
 fs.mkdirSync(path.dirname(file),{recursive:true});
 fs.writeFileSync(file,JSON.stringify(snap,null,1)+'\n');
 ok(true,'baseline rewritten: '+file);return}
if(!fs.existsSync(file)){ok(false,'no snapshot baseline at '+file+' — run with --rebaseline once, then commit/keep it');return}
const base=JSON.parse(fs.readFileSync(file,'utf8'));
for(const k of Object.keys(snap)){
 const a=base[k],b=snap[k],diffs=[];
 const walk=(x,y,p)=>{if(diffs.length>4)return;
  if(x&&y&&typeof x=='object'&&typeof y=='object'){for(const kk of new Set([...Object.keys(x),...Object.keys(y)]))walk(x[kk],y[kk],p+'.'+kk)}
  else if(JSON.stringify(x)!==JSON.stringify(y))diffs.push(p)};
 walk(a,b,k);
 ok(!diffs.length,k+': render matches the baseline'+(diffs.length?' — differs at '+diffs.join(', '):''));
}
};
