/* Public harness section — the Home Goal card's bars are derived, never typed in: bodyweight from the
   latest dj-bw-log weigh-in (scan fallback until there is one), lean mass + body fat from PROFILE.scan,
   goals from GOAL; progress = nearer/farther of now vs goal. Runs on whatever data set is loaded and
   checks every bar against values computed here from the same globals. */
module.exports=({run,ok,MOD})=>{
console.log('\n=== P7. Goal bars derived from the scan, the weigh-in log and GOAL ===');
const probe='(function(){var g=document.getElementById("goalCard").innerHTML;'+
 'var r={card:g,bars:goalBars(),goal:GOAL,scan:{bw:PROFILE.scan.bw,bfPct:PROFILE.scan.bfPct,lean:PROFILE.scan.lean,date:PROFILE.scan.date},bfNote:PROFILE.goal.bfNote||""};'+
 'document.getElementById("bwIn").value="171.4";saveBW();r.afterSave=goalBars();r.afterCard=document.getElementById("goalCard").innerHTML;'+
 'r.today=localDayKey();r.fmtToday=fmtHistDate(localDayKey());return r})()';
const pct=(a,b)=>Math.round(Math.min(a,b)/Math.max(a,b)*100);
const check=(label,seed,expectW,expectSrc)=>{
 const n=run(MOD,2026,9,26,{seed,probe});
 if(n.fatal){ok(false,label+': threw '+n.fatal.split('\n')[0]);return}
 ok(n.errors.length===0,label+': no console errors ('+n.errors.join(' | ')+')');
 const P=n.probe,[W,L,F]=P.bars,G=P.goal,S=P.scan,leanGoal=Math.round(G.bw*(1-G.bfPct/100)*10)/10;
 const w=expectW==null?S.bw:expectW;
 ok(W.val===w.toFixed(1)&&W.rest===' / '+G.bw+' lbs'&&W.pct===pct(w,G.bw),label+': weight bar = '+w+' of '+G.bw+' ('+W.val+W.rest+', '+W.pct+'%)');
 ok(W.src===(expectSrc||'scan '+S.date),label+': weight bar names its source ("'+W.src+'")');
 ok(L.val===S.lean.toFixed(1)&&L.rest===' / '+leanGoal+' lbs'&&L.pct===pct(S.lean,leanGoal)&&L.src==='scan '+S.date,label+': lean-mass bar from the scan vs GOAL lean '+leanGoal+' ('+L.val+L.rest+', '+L.pct+'%, '+L.src+')');
 ok(F.val===S.bfPct.toFixed(1)+'%'&&F.rest===' → '+G.bfPct+'%'+P.bfNote&&F.pct===pct(S.bfPct,G.bfPct)&&F.src==='scan '+S.date,label+': body-fat bar from the scan ('+F.val+F.rest+', '+F.pct+'%, '+F.src+')');
 ok(P.bars.every(b=>P.card.includes('width:'+b.pct+'%')&&P.card.includes('>'+b.val+'<')&&P.card.includes(' · '+b.src+'<')),label+': the card renders every bar (value, width, source)');
 ok(P.afterSave[0].val==='171.4'&&P.afterSave[0].src===P.fmtToday+' weigh-in'&&P.afterCard.includes('>171.4<')&&P.afterCard.includes('width:'+pct(171.4,G.bw)+'%'),label+': saving a weigh-in re-renders the weight bar from it ('+P.afterSave[0].val+', '+P.afterSave[0].src+')');
};
// no weigh-ins (and the demo seed already spent) → every bar comes from the scan
check('no weigh-ins',[['dj-seeded','x']],null,null);
// a log with an older, a newest and a malformed entry → the newest valid one wins, unsorted input is fine
check('weigh-in log',[['dj-seeded','x'],['dj-bw-log',JSON.stringify([{d:'2026-10-11',w:150.2},{d:'2026-10-25',w:152.6},{d:'2026-10-30',w:'oops'},{d:'2026-10-18',w:151.0}])]],152.6,'Sun, Oct 25 weigh-in');
};
