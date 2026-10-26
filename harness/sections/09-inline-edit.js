/* Public harness section — the inline edit forms that replaced prompt() for a meal, a weigh-in and a
   bar's base weight. Invalid or empty numbers keep the old value and show an error (never
   parseFloat(x)||0); a pending meal is counted only when all four macros parse; a rename alone keeps it
   pending. Runs on whatever data set is loaded; the meals and weigh-ins it edits are seeded here. */
module.exports=({run,ok,MOD})=>{
console.log('\n=== P9. Inline edit forms (meal / weigh-in / bar base) ===');
const probe=`(function(){
 var $=function(id){return document.getElementById(id)},R={},D=todayKey();
 var meal=function(id){return JSON.parse(localStorage.getItem('dj-foodlog-'+D)||'[]').filter(function(e){return e.id===id})[0]};
 var fill=function(o){Object.keys(o).forEach(function(k){$(k).value=o[k]})};
 var snap=function(){return JSON.stringify(meal('f-pend'))};
 // --- pending meal ---
 editFoodLogEntry(0);R.formOpen=$('logList').innerHTML.indexOf('id="fe-kcal"')>=0&&$('logList').innerHTML.indexOf('for="fe-kcal"')>=0;
 R.pendBoxesEmpty=$('logList').innerHTML.indexOf('id="fe-kcal" type="text" inputmode="decimal" value=""')>=0;
 var before=snap();
 fill({'fe-n':'chicken bowl','fe-kcal':'abc','fe-p':'','fe-c':'','fe-f':''});saveFoodEdit();
 R.abcErr=$('fe-err').textContent;R.abcSame=snap()===before;R.abcOpen=_foodEdit==='f-pend';
 fill({'fe-kcal':'500'});$('fe-err').textContent='';saveFoodEdit();
 R.partialErr=$('fe-err').textContent;R.partialSame=snap()===before;
 fill({'fe-kcal':'','fe-n':'chicken bowl'});saveFoodEdit();
 R.renamed=meal('f-pend');R.renameClosed=_foodEdit===null;
 editFoodLogEntry(0);fill({'fe-n':'chicken bowl','fe-kcal':'650','fe-p':'40.5','fe-c':'70','fe-f':'.5'});saveFoodEdit();
 R.counted=meal('f-pend');
 // --- counted meal: every box must hold a real number ---
 editFoodLogEntry(1);var b2=JSON.stringify(meal('f-done'));
 fill({'fe-n':'eggs','fe-kcal':'','fe-p':'20','fe-c':'2','fe-f':'15'});saveFoodEdit();R.emptyErr=$('fe-err').textContent;
 fill({'fe-kcal':'-5'});saveFoodEdit();R.negErr=$('fe-err').textContent;
 fill({'fe-kcal':'1e3'});saveFoodEdit();R.expErr=$('fe-err').textContent;
 R.doneSame=JSON.stringify(meal('f-done'))===b2;
 fill({'fe-kcal':'300.5'});saveFoodEdit();R.done=meal('f-done');
 // an open form survives a re-render (a sync / draft poll) with what was typed
 editFoodLogEntry(1);fill({'fe-kcal':'999'});renderFoodLog();R.keptTyped=$('fe-kcal').value;cancelFoodEdit();R.cancelled=_foodEdit===null&&meal('f-done').kcal===300.5;
 // --- weigh-in ---
 var bw=function(){return JSON.parse(localStorage.getItem('dj-bw-log')||'[]')};
 editBW(0);R.bwForm=$('bwList').innerHTML.indexOf('id="bwe-w"')>=0;var bb=JSON.stringify(bw());
 fill({'bwe-d':'2026-10-18','bwe-w':'150.2'});saveBWEdit();R.bwDupErr=$('bwe-err').textContent;
 fill({'bwe-d':'2026-02-30'});saveBWEdit();R.bwDateErr=$('bwe-err').textContent;
 fill({'bwe-d':'2026-10-24','bwe-w':'abc'});saveBWEdit();R.bwNumErr=$('bwe-err').textContent;R.bwSame=JSON.stringify(bw())===bb;
 fill({'bwe-w':'150.4'});saveBWEdit();R.bwAfter=bw();R.bwClosed=_bwEditD===null;
 // --- bar base (first plate-loaded exercise in today's resolved week: exName() reads dayObj) ---
 var found=null;DAYS.forEach(function(b){var d=dayObj(b.k);Object.keys(d.secs).forEach(function(s){(d.secs[s]||[]).forEach(function(e,i){var t=ldOf(e.n);if(!found&&t&&LOAD_TYPES[t].plates)found={day:d.k,sec:s,i:i,n:e.n}})})});
 R.found=found;
 if(found){setDay(found.day);setSec(found.sec);var id=found.day+found.sec+found.i,def=baseFor(found.n);R.def=def;
  editBase(id);R.baseForm=$('pl-'+id).innerHTML.indexOf('id="be-'+id+'"')>=0;
  $('be-'+id).value='heavy';saveBase(id);R.baseErr=$('be-err-'+id).textContent;R.baseKept=baseFor(found.n)===def;
  $('be-'+id).value='';saveBase(id);R.baseEmptyKept=baseFor(found.n)===def&&$('be-err-'+id).textContent.length>0;
  $('be-'+id).value='35';saveBase(id);R.baseSet=baseFor(found.n);R.baseClosed=!_baseEdit[id];
  editBase(id);resetBase(id);R.baseReset=baseFor(found.n)===def}
 return R})()`;
const D=new Date(2026,9,26,12),key=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const today=key(new Date(D.getTime()-4*36e5)); // food day at noon = the calendar day
const seed=[['dj-seeded','x'],
 ['dj-foodlog-'+today,JSON.stringify([{id:'f-pend',at:'2026-10-26T15:00:00Z',n:'bowl',pending:true,kcal:0,p:0,c:0,f:0},{id:'f-done',n:'eggs',kcal:216,p:19,c:1,f:15}])],
 ['dj-bw-log',JSON.stringify([{d:'2026-10-25',w:150},{d:'2026-10-18',w:149}])]];
const n=run(MOD,2026,9,26,{seed,probe});
if(n.fatal){ok(false,'threw '+n.fatal.split('\n')[0]);return}
const R=n.probe;
ok(n.errors.length===0,'no console errors ('+n.errors.join(' | ')+')');
ok(R.formOpen&&R.pendBoxesEmpty,'tapping a meal opens a labelled inline form; a pending meal\'s number boxes start empty');
ok(/Calories "abc" isn't a number/.test(R.abcErr)&&R.abcSame&&R.abcOpen,'"abc" → inline error, the meal is unchanged and still pending, the form stays open ("'+R.abcErr+'")');
ok(/fill all four/.test(R.partialErr)&&R.partialSame,'one macro of four on a pending meal → error, nothing changes ("'+R.partialErr+'")');
ok(R.renamed.n==='chicken bowl'&&R.renamed.pending===true&&R.renamed.kcal===0&&R.renameClosed,'rename with the numbers left empty → new name, still pending for the auto-fill');
ok(R.counted.pending===undefined&&R.counted.kcal===650&&R.counted.p===40.5&&R.counted.c===70&&R.counted.f===0.5,'all four macros parse → counted ('+JSON.stringify([R.counted.kcal,R.counted.p,R.counted.c,R.counted.f])+'), pending cleared');
ok(/Calories is empty/.test(R.emptyErr)&&/Calories "-5"/.test(R.negErr)&&/Calories "1e3"/.test(R.expErr)&&R.doneSame,'a counted meal: empty, negative and non-decimal numbers are refused and nothing changes');
ok(R.done.kcal===300.5&&R.done.p===20,'a valid edit updates the counted meal (300.5 kcal)');
ok(R.keptTyped==='999'&&R.cancelled,'an open form keeps what was typed across a re-render; Cancel leaves the meal alone');
ok(R.bwForm&&/already a weigh-in on 2026-10-18/.test(R.bwDupErr)&&/real date/.test(R.bwDateErr)&&/"abc" isn't a weight/.test(R.bwNumErr)&&R.bwSame,'weigh-in form: duplicate date, impossible date and a non-number are refused, the log is unchanged');
ok(JSON.stringify(R.bwAfter)===JSON.stringify([{d:'2026-10-24',w:150.4},{d:'2026-10-18',w:149}])&&R.bwClosed,'a valid weigh-in edit moves the date + weight and keeps the log sorted');
if(!R.found){ok(false,'no plate-loaded exercise in DAYS to test the base editor on');return}
ok(R.baseForm&&/"heavy" isn't a weight/.test(R.baseErr)&&R.baseKept&&R.baseEmptyKept,'bar base ('+R.found.n+'): a non-number or empty box keeps the base ('+R.def+' lb) and says why');
ok(R.baseSet===35&&R.baseClosed&&R.baseReset,'bar base: 35 saves, "Default" goes back to the load type\'s base');
};
