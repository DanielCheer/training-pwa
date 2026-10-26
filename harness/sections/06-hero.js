/* Public harness section — the Home hero status line (heroStatus() in app/main.js) is derived from
   START/SEASON/HOLD_AT_PHASE/GOAL, never a literal: a countdown while the calendar runs toward SEASON,
   and a "week N · holding at <phase> until <goal>" / "in-season · week N" line once the program holds
   or the season has started. It must never read "0 days to tip-off". Patches flip the demo program
   into each state so every branch runs on the public data. */
module.exports=({run,ok,MOD})=>{
console.log('\n=== P6. Home hero status line ===');
const probe='({cd:document.getElementById("cd").textContent,season:+SEASON,start:+START,now:+new Date(),hold:HOLD_AT_PHASE,'+
 'holdName:HOLD_AT_PHASE==null?null:PHASES[HOLD_AT_PHASE].n.split(" · ").pop(),goal:GOAL_STR,wk:wkNow,'+
 'edge:[heroStatus(new Date(SEASON.getTime()-1)),heroStatus(new Date(SEASON.getTime())),heroStatus(new Date(SEASON.getTime()+7*864e5))]})';
const HOLD=s=>s.replace(/const HOLD_AT_PHASE=null;/,'const HOLD_AT_PHASE=BUILD_PHASE;');
const NOHOLD=s=>s.replace(/const HOLD_AT_PHASE=BUILD_PHASE;/,'const HOLD_AT_PHASE=null;');
const cases=[['calendar running',NOHOLD],['held at Build',HOLD]];
for(const [label,patch] of cases){
 const n=run(MOD,2026,9,26,{probe,patch});
 if(n.fatal){ok(false,label+': threw '+n.fatal.split('\n')[0]);continue}
 const P=n.probe,days=Math.ceil((P.season-P.now)/864e5);
 ok(!/\b0 days/.test(P.cd)&&!P.edge.some(t=>/\b0 days/.test(t)),label+': never "0 days to tip-off" (now: "'+P.cd+'"; around SEASON: '+P.edge.map(t=>'"'+t+'"').join(', ')+')');
 const inSeason=P.now>=P.season,seasonWk=Math.floor((P.now-P.season)/(7*864e5))+1;
 if(P.hold==null){
  if(inSeason)ok(P.cd==='in-season · week '+seasonWk+' · block complete',label+': past SEASON: in-season week '+seasonWk+', no countdown ("'+P.cd+'")');
  else ok(P.cd===days+(days===1?' day':' days')+' to tip-off',label+': countdown to SEASON = '+days+' days ("'+P.cd+'")');
  ok(P.edge[0]==='1 day to tip-off',label+': the last instant before SEASON still counts down, singular ("'+P.edge[0]+'")');
  ok(P.edge[1]==='in-season · week 1 · block complete'&&P.edge[2]==='in-season · week 2 · block complete',label+': from SEASON on: in-season week N, no countdown ("'+P.edge[1]+'", "'+P.edge[2]+'")');
 }else{
  const tail=' · holding at '+P.holdName+' until '+P.goal;
  ok(P.cd===(inSeason?'in-season · week '+seasonWk:'week '+(P.wk+1))+tail,label+': '+(inSeason?'in-season':'before SEASON')+' while held: week + held phase + goal, no countdown ("'+P.cd+'")');
  ok(P.edge[1]==='in-season · week 1'+tail,label+': in-season while held ("'+P.edge[1]+'")');
 }
}
};
