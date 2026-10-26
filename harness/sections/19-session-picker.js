/* Public harness section — the gym-session picker. In an epoch with sessionPicker, today's tab shows one
   button per GYM_SESSIONS entry plus "No gym"; picking one stores it for the date and today resolves to
   that session (other weekdays keep their own content); "No gym" restores the base. Runs on whatever
   data is loaded (skips when today's epoch has no picker). */
module.exports=({run,ok,MOD})=>{
console.log('\n=== P19. Gym-session picker ===');
const probe=`(function(){var R={};var ep=epochFor();R.has=!!ep.sessionPicker&&GYM_SESSIONS.length>0;if(!R.has)return R;
 var wd=wdKeyOf(localDayKey());setDay(wd);
 var row=document.getElementById('sessRow');R.display=row.style.display;R.buttons=(row.innerHTML.match(/<button/g)||[]).length;R.n=GYM_SESSIONS.length;
 R.next=row.innerHTML.indexOf('·next')>=0;
 var s=GYM_SESSIONS[GYM_SESSIONS.length-1];setGymSession(s.id);
 R.stored=localStorage.getItem('dj-session-'+localDayKey());R.focus=dayObj(wd).focus;R.want=s.focus;R.sess=dayObj(wd)._sess;
 var other=['mon','tue','wed','thu','fri','sat','sun'].filter(function(k){return k!==wd})[0];R.otherUntouched=!dayObj(other)._sess;
 setGymSession('');R.cleared=localStorage.getItem('dj-session-'+localDayKey())===null&&!dayObj(wd)._sess;
 return R})()`;
const n=run(MOD,2026,9,26,{probe});
if(n.fatal){ok(false,'threw '+n.fatal.split('\n')[0]);return}
const R=n.probe;
if(!R.has){ok(true,'today\'s epoch has no session picker (nothing to check)');return}
ok(R.display==='flex'&&R.buttons===R.n+1,'today\'s tab shows '+R.n+' session buttons + "No gym" ('+R.buttons+')');
ok(R.next,'the un-picked default marks the suggested next session');
ok(R.stored&&R.sess===R.stored&&R.focus===R.want,'picking a session stores it for today and today resolves to it ("'+R.focus+'")');
ok(R.otherUntouched,'other weekdays keep their own content');
ok(R.cleared,'"No gym" clears the pick and restores the base day');
};
