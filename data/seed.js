/* data/seed.js — first-open localStorage seed (seedOnce() in the engine writes it once).
   DEMO PERSONA ("Alex"): four weeks of logged sets with progression, six Sunday weigh-ins, three
   days of meals (today's includes one pending meal), a little cardio — all dated relative to today
   so the demo never goes stale. Keys use the app's dj- namespace (LS_NS). A real install ships
   `const SEED=null;` — its history already lives in localStorage. */
const SEED=(()=>{
 const pad=n=>String(n).padStart(2,'0');
 const key=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
 const now=new Date(),today=new Date(now.getFullYear(),now.getMonth(),now.getDate(),12);
 const add=(d,n)=>new Date(d.getFullYear(),d.getMonth(),d.getDate()+n,12);
 const foodToday=key(new Date(Date.now()-FOOD_DAY_ROLL_HOUR*36e5));
 const monday=add(today,-((today.getDay()+6)%7));
 const out={};

 /* Sets: the main lifts of each gym day, for the four weeks before this one, +5 lb a week. */
 const plan={mon:[["Barbell Bench Press",125,[8,7,6]],["Barbell Row",115,[8,8,7]],["Seated DB Shoulder Press",35,[10,9,8]]],
  tue:[["Barbell Back Squat",175,[8,7,7]],["Romanian Deadlift",135,[8,8,8]]],
  thu:[["Pull-up",-30,[6,6,5]],["Incline DB Press",45,[10,9,8]],["Skull Crusher",50,[10,10,9]]],
  sat:[["Trap Bar Deadlift",205,[6,6,5]],["Bulgarian Split Squat",20,[10,10,9]],["Barbell Hip Thrust",135,[10,10,10]]]};
 const DOW={mon:0,tue:1,thu:3,sat:5};
 const log=[];let n=0;
 for(let w=4;w>=1;w--)for(const day of Object.keys(plan)){
  const date=key(add(monday,DOW[day]-7*w));
  for(const [ex,base,reps] of plan[day]){
   const ld=LD_BY_NAME[ex],lt=LOAD_TYPES[ld]||{},step=ex==="Pull-up"?5:(lt.unit==='lb'&&ld==='db'?2.5:5);
   const weight=base+step*(4-w);
   reps.forEach(r=>log.push({id:'w-demo-'+(++n),date,day,exercise:ex,weight,sets:1,reps:r,ld,unit:lt.unit||'lb'}));}}
 out['dj-workout-log']=log;

 /* Weigh-ins: the last six Sundays, slowly trending up. */
 const lastSun=add(today,-(today.getDay()||7));
 out['dj-bw-log']=[167.2,166.8,166.1,165.9,165.4,165.0].map((w,i)=>({d:key(add(lastSun,-7*i)),w}));

 /* Meals: two complete earlier days + today (one counted meal, one pending capture). */
 const meal=(id,n,kcal,p,c,f,x)=>Object.assign({id:'f-demo-'+id,n,kcal,p,c,f},x||{});
 const d2=key(add(new Date(Date.now()-FOOD_DAY_ROLL_HOUR*36e5),-2)),d1=key(add(new Date(Date.now()-FOOD_DAY_ROLL_HOUR*36e5),-1));
 out['dj-foodlog-'+d2]=[meal('a1','Oats + whey + banana',647,43,96,12,{sugar:27,fiber:11,satf:4}),meal('a2','Chicken rice bowl',663,62,83,7,{fiber:6,satf:2}),
  meal('a3','Salmon, rice, black beans',890,48,88,37,{fiber:9,satf:5}),meal('a4','Greek yogurt + banana',255,21,36,4,{sugar:21,satf:3})];
 out['dj-foodlog-'+d1]=[meal('b1','2 eggs + toast + milk',386,24,40,16,{satf:6}),meal('b2','Turkey sandwich + apple',610,42,72,15,{fiber:8}),
  meal('b3','Chicken breast, rice, vegetables',870,64,112,9,{fiber:7,satf:2}),meal('b4','Whey + milk',242,32,15,7,{satf:3})];
 out['dj-day-confirmed-'+d2]='1';
 out['dj-foodlog-'+foodToday]=[meal('c1','Oats + whey + banana',647,43,96,12,{at:new Date(Date.now()-5*36e5).toISOString()}),
  meal('c2','chicken burrito bowl',0,0,0,0,{pending:true,at:new Date(Date.now()-36e5).toISOString()})];

 /* Cardio */
 out['dj-cardio-log']=[{id:'cd-demo-1',date:key(add(monday,-2)),activity:'Bike',min:15},{id:'cd-demo-2',date:key(add(monday,-6)),activity:'Run',min:20}];
 return out;
})();
