/* Public harness section — the Monday rotation resolves at read time (v122). resolveWeek() used to
   write this week's MON_VARIANTS entry into DAYS, so a past Monday read back as THIS week's variant
   and DAYS changed under everything holding a reference to it. Now dayObj(k, date) resolves the
   variant for the date asked about and DAYS is never written. A second variant is added in the probe
   so the rotation is visible even when the program ships just one. */
module.exports=({run,ok,MOD})=>{
console.log('\n=== P15. Monday rotation resolves per date; DAYS is never written ===');
const probe=`(function(){var R={};
 resolveWeek();renderDay();['mon','tue','wed','thu','fri','sat','sun'].forEach(function(k){setDay(k)});dayRoll();
 R.daysUntouched=JSON.stringify(DAYS)===__DAYS0;
 var v0=MON_VARIANTS[0];MON_VARIANTS.push(v0.slice().reverse());var L=MON_VARIANTS.length;
 R.checked=0;R.bad=[];R.weeksSeen={};
 for(var w=0;w<TOTAL_WEEKS;w++){var d=new Date(START.getFullYear(),START.getMonth(),START.getDate()+w*7+1,12),dk=fmtDayKey(d);
  if(baseDaysFor(dk)!==DAYS||activeOverride(dk)&&activeOverride(dk).days.mon||pickedSession(dk))continue;
  var want=MON_VARIANTS[progWeekOf(dk)%L],got=dayObj('mon',dk).secs.main;R.checked++;R.weeksSeen[progWeekOf(dk)%L]=1;
  if(got!==want)R.bad.push(dk+' main');
  if(want[0]&&exNameFromExlogKey('monmain0',dk)!==want[0].n)R.bad.push(dk+' exName');}
 R.today=(baseDaysFor()!==DAYS||activeOverride()&&activeOverride().days.mon)?'n/a':(dayObj('mon').secs.main===MON_VARIANTS[wkNow%L]);
 R.stillUntouched=JSON.stringify(DAYS)===__DAYS0;
 return R})()`;
const patch=s=>s.replace('const BASE_EPOCHS=','globalThis.__DAYS0=JSON.stringify(DAYS);const BASE_EPOCHS=');
const n=run(MOD,2026,7,20,{probe,patch});
if(n.fatal){ok(false,'threw '+n.fatal.split('\n')[0]);return}
const R=n.probe;
ok(R.daysUntouched,'DAYS after boot, renders of every day and a day roll == DAYS as the data file declared it');
ok(R.checked>=2&&Object.keys(R.weeksSeen).length>=2,'checked '+R.checked+' weeks of the first base epoch, '+Object.keys(R.weeksSeen).length+' different variants seen');
ok(R.bad.length===0,'dayObj(mon, date) and the note resolver use the variant of THAT date\'s week'+(R.bad.length?' — wrong: '+R.bad.join(', '):''));
ok(R.today==='n/a'||R.today===true,'today\'s Monday shows this week\'s variant ('+R.today+')');
ok(R.stillUntouched,'resolving historical Mondays wrote nothing into DAYS');
};
