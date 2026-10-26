/* Public harness section — the diagram requestAnimationFrame loop runs only while an open exercise card
   shows a diagram: nothing is scheduled at boot, opening a card with a diagram starts it, it keeps
   going while one is visible and stops itself on the first frame with none. prefers-reduced-motion
   never starts it. (The vm's matchMedia matches everything, so REDUCE is patched off for the main run.) */
module.exports=({run,ok,MOD})=>{
console.log('\n=== P12. Diagram animation loop runs only while a diagram is open ===');
const probe=`(function(){var R={},calls=0,cb=null;
 R.bootRaf=diaRaf;
 requestAnimationFrame=function(f){calls++;cb=f;return calls};
 var open=false,svg={isConnected:true,closest:function(){return open?{}:null}};
 DIAS.push({svg:svg,items:[],acc:0,sp:1});
 startDiaLoop();R.closedStart=calls;                 // card closed → nothing scheduled
 open=true;startDiaLoop();startDiaLoop();R.openStart=calls; // opened → exactly one frame scheduled, no duplicate loop
 var step=function(t){var f=cb;cb=null;if(f)f(t)};step(1000);step(1016);step(1032);R.running=calls;R.acc=DIAS[DIAS.length-1].acc;
 open=false;step(1048);R.afterClose=calls;R.rafAfter=diaRaf;
 return R})()`;
const n=run(MOD,2026,9,26,{probe,patch:s=>s.replace('const REDUCE=matchMedia("(prefers-reduced-motion:reduce)").matches;','const REDUCE=false;')});
if(n.fatal){ok(false,'threw '+n.fatal.split('\n')[0]);return}
const R=n.probe;
ok(R.bootRaf===0,'no animation frame scheduled at boot (no card open)');
ok(R.closedStart===0,'a diagram in a closed card does not start the loop');
ok(R.openStart===1,'opening a card with a diagram starts exactly one loop (repeat starts are no-ops)');
ok(R.running===4&&R.acc===32,'the loop keeps scheduling while the diagram is visible and advances it ('+R.running+' frames, acc '+R.acc+' ms)');
ok(R.afterClose===4&&R.rafAfter===0,'closing the card: the next frame does not reschedule — the loop stops itself');
const m=run(MOD,2026,9,26,{probe});
ok(!m.fatal&&m.probe.openStart===0,'prefers-reduced-motion: the loop never starts');
};
