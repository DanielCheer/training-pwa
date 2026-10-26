/* Public harness section — End Workout's notes archive (v122). The archive stays bounded at
   NOTES_ARCHIVE_MAX, but trimming it raises a warning banner with the count; and the live note slots
   are emptied only AFTER the archive is saved (v121 removed them first, so a full store lost them). */
module.exports=({run,ok,MOD})=>{
console.log('\n=== P18. Notes archive: bounded with a warning, slots cleared only after it saves ===');
const mk=(full)=>`(function(){var R={},old=[];for(var i=0;i<NOTES_ARCHIVE_MAX-1;i++)old.push({slot:'x',exercise:'X',date:'2026-01-01',note:'n'+i});
 localStorage.setItem('dj-exlog-archive',JSON.stringify(old));
 localStorage.setItem('dj-exlog-wedmain0',JSON.stringify([{d:'2026-10-26',t:'a'},{d:'2026-10-26',t:'b'}]));
 localStorage.setItem('dj-exlog-wedstr',JSON.stringify([{d:'2026-10-26',t:'c'}]));
 ${full?"localStorage.setItem=function(k){if(k==='dj-exlog-archive'){var e=new Error('q');e.name='QuotaExceededError';throw e}};":''}
 clearWorkoutNotes(['wed']);
 var a=JSON.parse(localStorage.getItem('dj-exlog-archive'));R.len=a.length;R.first=a[0].note;R.last=a[a.length-1].note;
 R.slotsLeft=['dj-exlog-wedmain0','dj-exlog-wedstr'].filter(function(k){return localStorage.getItem(k)!==null}).length;
 var b=document.getElementById('banner-notes-archive');R.warn=b.textContent;R.cls=b.className;
 R.quota=document.getElementById('banner-quota').textContent;
 return R})()`;
let n=run(MOD,2026,9,26,{probe:mk(false)});
if(n.fatal){ok(false,'threw '+n.fatal.split('\n')[0]);return}
let R=n.probe;
ok(R.len===500&&R.first==='n2'&&['a','b','c'].includes(R.last),'archive kept at 500: the 2 oldest dropped, the 3 new notes in ('+R.len+', first '+R.first+')');
ok(/the 2 oldest archived notes were removed/.test(R.warn)&&/warn/.test(R.cls),'a warning banner says how many were dropped ("'+R.warn.slice(0,70)+'…")');
ok(R.slotsLeft===0,'the trained day\'s note slots are emptied after the archive saved');
n=run(MOD,2026,9,26,{probe:mk(true)});
if(n.fatal){ok(false,'storage full: threw '+n.fatal.split('\n')[0]);return}
R=n.probe;
ok(R.slotsLeft===2&&R.len===499,'storage full: archive unchanged and BOTH live note slots kept (nothing lost)');
ok(/dj-exlog-archive/.test(R.quota)&&R.warn==='','storage full: the quota banner names the archive, and no trim warning (nothing was trimmed)');
};
