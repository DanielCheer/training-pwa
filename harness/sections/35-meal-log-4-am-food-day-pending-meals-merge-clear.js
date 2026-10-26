/* Public harness section — asserts only engine behaviour on fixtures it seeds itself (or values
   derived from the loaded data), so it passes on the demo and on a private overlay alike. */
module.exports=({run,ok,MOD,ORIG,has,fs,path,DIR,PRIV})=>{{
// ---------- 35. Meal log: 4 AM food day, pending meals, merge clears pending (v116) ----------
console.log('\n=== 35. Meal log — capture now, count once a day (v116) ===');
{const F=(d,arr)=>['dj-foodlog-'+d,JSON.stringify(arr)];
 const pend=(id,n)=>({id,n,at:'2026-10-18T05:30:00.000Z',pending:true,kcal:0,p:0,c:0,f:0});
 const seed=[F('2026-10-17',[pend('f-pend','ramen 3 eggs'),{id:'f-real',n:'rice',kcal:500,p:10,c:100,f:2},pend('f-pend2','pho')]),
             F('2026-10-18',[{id:'f-next',n:'next day',kcal:300,p:20,c:30,f:10}])];
 // 02:00 on Oct 18 = still the Oct 17 food day
 const a=run(MOD,2026,9,18,{hour:2,meal:true,seed,probe:'!!SERVER'});
 ok(!a.fatal,'runs at 02:00'+(a.fatal?': '+a.fatal.split('\n')[0]:''));
 const m=a.meal||{};
 ok(m.roll===4,'FOOD_DAY_ROLL_HOUR = 4');
 ok(m.todayKey==='2026-10-17'&&m.localDayKey==='2026-10-18','02:00 Oct 18 -> food day Oct 17, calendar day Oct 18');
 ok(/still .*until 4 AM/.test(m.loggedTitle),'Logged Today title says "still <day> until 4 AM" ("'+m.loggedTitle+'")');
 ok(m.tot&&m.tot.kcal===500&&m.tot.pend===2&&m.tot.n===3,'pending meals excluded from totals ('+JSON.stringify(m.tot&&{k:m.tot.kcal,p:m.tot.pend})+')');
 ok(/pending/.test(m.logList)&&/2 meals pending/.test(m.logTotals),'pending shown on rows + in the totals card');
 ok(!/2026-10-17/.test(m.mealHistory),'the open food day is not duplicated into Meal History');
 ok(/still pending/.test(m.verdict),'day verdict flags incomplete totals');
 if(a.probe){ // a companion server is configured: the strip is live
  ok(/Count now · 2 pending/.test(m.syncStatus),'status strip offers Count now with the pending count');
  ok(/never synced/.test(m.syncStatus),'status strip warns when the phone has never synced');
 }else ok(/Static demo/.test(m.syncStatus)&&!/Count now/.test(m.syncStatus),'SERVER=null: strip says the server features are off, and offers no Count now');
 ok(m.rollTxt==='4 AM','Meal History prose derives the roll hour from config ("'+m.rollTxt+'")');
 const hdr=(m.csv||[[]])[0],row=(m.csv||[]).find(r=>r[2]==='ramen 3 eggs');
 ok(hdr[1]==='Logged At'&&hdr[hdr.length-1]==='Status'&&row&&row[row.length-1]==='pending','CSV carries Logged At + Status=pending');
 ok(m.afterFull&&m.afterFull.pending===undefined&&m.afterFull.kcal===850&&m.afterFull.sugar===4,'full food-update fills macros and clears pending');
 ok(m.afterName&&m.afterName.pending===true&&m.afterName.n==='renamed','name-only food-update keeps the meal pending');
 ok(m.totAfter&&m.totAfter.kcal===1350&&m.totAfter.pend===1,'totals pick up the estimate');
 ok(m.textMeal&&m.textMeal.pending===true&&m.textMeal.n==='protein shake'&&typeof m.textMeal.at==='string'&&m.textCleared==='','"Log it" saves a trimmed, timestamped pending meal and clears the box');
 ok(m.cancelNoop,'cancelled photo picker creates no orphan row');
 ok(a.errors.length===0,'no console errors / cfgFail without IndexedDB ('+a.errors.join(' | ')+')');
 // 04:00 rolls the food day; noon + 22:00 keep todayKey===localDayKey (sections 1-9 unaffected)
 for(const h of [4,12,22]){const r=run(MOD,2026,9,18,{hour:h,meal:true,seed});
  ok(r.meal&&r.meal.todayKey==='2026-10-18'&&r.meal.todayKey===r.meal.localDayKey,h+':00 -> food day = calendar day');}
}
}};
