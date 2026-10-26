/* data/program.js — the training program: block dates, phases, targets, days, Why tab.
   DEMO PERSONA ("Alex") — a fictional 4-day upper/lower block. Dates are relative to the day the
   app is opened, so the demo always sits mid-block with history behind it. */

/* Block dates. The block starts on the Monday four weeks before this week's Monday and runs
   TOTAL_WEEKS; SEASON is the date the block builds toward (the countdown + "Realistic by"). */
const START=(()=>{const d=new Date();return new Date(d.getFullYear(),d.getMonth(),d.getDate()-((d.getDay()+6)%7)-28)})();
const SEASON=new Date(START.getFullYear(),START.getMonth(),START.getDate()+12*7);
const fmtMD=d=>d.toLocaleDateString('en-US',{month:'short',day:'numeric'});
const SEASON_STR=fmtMD(SEASON);

const PHASES=[
{n:"P1 · Foundation",d:"",c:"var(--cy)",bg:"#07201D",bd:"#0E4D46",t:"Learn the lifts and find honest working weights. Leave 2–3 reps in the tank on every set; the goal is clean, repeatable technique, not heavy numbers."},
{n:"P2 · Build",d:"",c:"#5EC4E8",bg:"#08202C",bd:"#134A63",t:"The overload phase. Add weight when every set hits the top of the rep range with clean form; the 🎯 numbers are your working weights and your logged sets are the real progression. Toward "+GOAL_STR+": eat the surplus, sleep 7–8 h."},
{n:"P3 · Peak",d:"",heavy:true,c:"var(--or)",bg:"#1E0D05",bd:"#6B2A12",t:"Heavier sets of fewer reps on the main lifts; accessories hold steady. Recovery is the limiter now — protect sleep and don't add volume."},
{n:"P4 · Deload",d:"",heavy:true,c:"var(--ye)",bg:"#171204",bd:"#4A3A0E",t:"Cut volume roughly in half and keep the weights moderate. You finish on "+SEASON_STR+" fresh, ready to test new 5-rep maxes."}];
const PHW=[2,4,4,2]; // weeks per phase
const TOTAL_WEEKS=PHW.reduce((a,b)=>a+b,0);
/* Derived, never literal: the Build phase (where the 🎯 targets ramp) and its first program week. */
const BUILD_PHASE=PHASES.findIndex(p=>/build/i.test(p.n));
const BUILD_START=PHW.slice(0,BUILD_PHASE<0?0:BUILD_PHASE).reduce((a,b)=>a+b,0);
const HOLD_AT_PHASE=null; // null = follow the calendar through every phase (an index here would hold the program in that phase)
const HOLD_END_WEEK=HOLD_AT_PHASE==null?null:PHW.slice(0,HOLD_AT_PHASE+1).reduce((a,b)=>a+b,0)-1;
/* Phase date ranges + week labels, generated from START + PHW. */
(function(){let w=0;PHASES.forEach((p,i)=>{
 const s=new Date(START.getTime()+w*7*864e5);
 let e=new Date(START.getTime()+((w+PHW[i])*7-1)*864e5);
 if(i==PHASES.length-1&&e>=SEASON)e=new Date(SEASON.getTime()-864e5);
 const range=s.getMonth()==e.getMonth()?fmtMD(s)+'–'+e.getDate():fmtMD(s)+' – '+fmtMD(e);
 p.d=range+' (Wk '+(w+1)+(PHW[i]>1?'–'+(w+PHW[i]):'')+')';
 if(i===HOLD_AT_PHASE)p.d='from '+fmtMD(s)+' · HOLDING until '+GOAL_STR;
 else if(HOLD_AT_PHASE!=null&&i>HOLD_AT_PHASE)p.d='on hold — for a real peaking event';
 w+=PHW[i]})})();

/* How each exercise is loaded (LOAD_TYPES in app/config.js) — keyed by exact exercise name. */
const LD_BY_NAME={
 "Barbell Bench Press":"bar","Barbell Row":"bar","Barbell Back Squat":"bar","Romanian Deadlift":"bar","Barbell Hip Thrust":"bar",
 "Trap Bar Deadlift":"trap","Skull Crusher":"ez",
 "Seated DB Shoulder Press":"db","Incline DB Press":"db","Bulgarian Split Squat":"db",
 "Cable Pushdown":"stack","Leg Extension":"stack","Lying Hamstring Curl":"stack","Cable Crunch":"stack",
 "Medicine Ball Chest Pass":"held","Overhead Med Ball Throw":"held",
 "Box Jump":"box",
 "Pull-up":"bw","Ab Wheel Rollout":"bw","Hollow Hold":"bw","Bird Dog":"bw","Stir the Pot":"bw","Plyo Push-up":"bw","Standing Hip Flexor March":"bw"
};

/* Build-phase 🎯 seeds — t0 = week-1 load in the exercise's own log unit, inc = per-week bump,
   hold = never ramp (the string is the reason shown). Logged history always beats the seed. */
const TARGETS={
 "Barbell Bench Press":{t0:135,inc:5},
 "Barbell Back Squat":{t0:185,inc:5},
 "Trap Bar Deadlift":{t0:225,inc:10},
 "Incline DB Press":{t0:50,inc:5},
 "Seated DB Shoulder Press":{t0:40,inc:5},
 "Pull-up":{t0:-20},
 "Leg Extension":{t0:70,hold:"form first"},
 "Box Jump":{t0:24}
};

/* Tuesday (lower A) has a full and a short version, toggled per week on the Tuesday tab. */
const TUE_MAIN_FULL=[
 {n:"Barbell Back Squat",d:"squat",rx:["3×8 · leave 2 in the tank","4×6–8 · +5 lb/wk","4×5 heavier","2×5 light"],t:["Quads","Glutes","Core"],y:"The main lower-body strength lift — most of the leg mass this block builds comes from here.",c:"Brace before you descend, knees track over the toes, stand up through the whole foot."},
 {n:"Romanian Deadlift",d:"rdl",rx:["3×8","4×8 +load","4×6 heavier","2×8"],t:["Hamstrings","Glutes"],y:"Hamstrings trained long, which is where they're weakest and where they grow.",c:"Soft knees, hips back, bar close to the legs. Stop when the hamstrings are fully stretched."},
 {n:"Leg Extension",d:"legext",rx:["3×12","3×10–12","3×10","2×12"],t:["Quads"],y:"Quad volume without loading the back after two heavy hinges and squats.",c:"Pause one second at the top, lower under control."},
 {n:"Lying Hamstring Curl",d:"hamcurl",rx:["3×10","3×10 +load","3×8 heavier","2×10"],t:["Hamstrings"],y:"Knee-flexion work the RDL doesn't cover — a balanced hamstring needs both.",c:"Hips pressed into the pad, squeeze at the top, slow on the way down."}];
const TUE_CORE_FULL=[
 {n:"Hollow Hold",d:"hollow",rx:["3×20–30s"],t:["Abs","Core"],y:"Teaches the trunk to stay rigid — the same brace a heavy squat needs.",c:"Lower back pressed into the floor the whole time; bend the knees to make it easier."}];
const TUE_MAIN_SHORT=[TUE_MAIN_FULL[0],TUE_MAIN_FULL[1]];
const TUE_CORE_SHORT=TUE_CORE_FULL;

/* Monday's main block rotates weekly through these variants (one here, so it's the same each week). */
const MON_VARIANTS=[
[
 {n:"Barbell Bench Press",d:"bench",rx:["3×8 · leave 2 in the tank","4×6–8 · +5 lb/wk","4×5 heavier","2×5 light"],t:["Chest","Front delts","Triceps"],y:"The main pressing lift and this block's weak point — it leads both upper days.",c:"Shoulder blades pinned, feet planted, touch the chest under control and press back up."},
 {n:"Barbell Row",d:"row",rx:["3×8","4×6–8 +load","4×6 heavier","2×8"],t:["Mid-back","Lats"],y:"Balances the pressing volume and builds the upper back that stabilizes the bench.",c:"Hinge to about 45°, pull to the lower ribs, no body English."},
 {n:"Seated DB Shoulder Press",d:"ohp",rx:["3×10","3×8–10 +load","4×8 heavier","2×10"],t:["Delts","Triceps"],y:"Overhead pressing for the shoulders — and more pressing practice for a lagging bench.",c:"Ribs down, press straight up, don't arch the lower back."},
 {n:"Cable Pushdown",d:"pushdown",rx:["3×12"],t:["Triceps"],y:"Triceps finish every press; extra direct volume helps the lockout.",c:"Elbows pinned to the sides, full extension, controlled return."}]];

const DAYS=[
{k:"mon",l:"MON",time:"6 PM",focus:"Upper A — Press Focus",fin:"10 min easy cardio (optional)",map:["chest","deltF","tri","upback"],
 note:"Bench leads while you're fresh. Rest 2–3 min on the first two lifts, 60–90 s on the rest.",
 secs:{warm:[{n:"5 min easy bike",d:"run"},{n:"Band pull-aparts — 2×15",d:"pullapart"},{n:"Push-ups — 2×10",d:"pushup"}],
  power:[],
  main:[],
  core:[{n:"Ab Wheel Rollout",d:"abwheel",rx:["3×8"],t:["Abs"],y:"Anti-extension strength — the trunk stiffness that keeps a heavy press stable.",c:"Roll out only as far as you can without the lower back sagging."}],
  str:[{n:"Doorway pec stretch — 30s/side",d:"fly"},{n:"Cat-cow — 10"}]}},
{k:"tue",l:"TUE",time:"6 PM",focus:"Lower A — Squat Focus",fin:"10 min easy cardio (optional)",map:["quad","glute","ham"],
 note:"Squat first, then the hinge. On a short day keep the squat and the RDL and skip the rest.",
 secs:{warm:[{n:"5 min easy bike",d:"run"},{n:"Bodyweight squats — 2×10",d:"squat"},{n:"Leg swings — 10 each direction",d:"legswing"}],
  power:[],
  main:TUE_MAIN_FULL,
  core:TUE_CORE_FULL,
  str:[{n:"Couch stretch — 45s/side",d:"couch"},{n:"Hamstring strap stretch — 45s/side"}]}},
{k:"wed",l:"WED",time:"anytime",focus:"Active Recovery",map:["hipfx","glute"],fin:"an easy walk is the whole session",
 note:"No lifting today. A walk and ten minutes of mobility help tomorrow's session more than another workout would.",
 secs:{warm:[],power:[],main:[],core:[],
  str:[{n:"90/90 hip switch — 60s/side",d:"ninety"},{n:"Thoracic extension on foam roller — 60s"},{n:"Child's pose — 60s"}]}},
{k:"thu",l:"THU",time:"6 PM",focus:"Upper B — Pull Focus",fin:"10 min easy cardio (optional)",map:["lats","upback","bic","tri","chest"],
 note:"Pull-ups are the scoreboard this block — log the assistance every session and watch it come down.",
 secs:{warm:[{n:"5 min row",d:"run"},{n:"Dead hang — 30s",d:"hang"},{n:"Band pull-aparts — 2×15",d:"pullapart"}],
  power:[{n:"Medicine Ball Chest Pass",d:"medball",rx:["3×5 · max intent"],t:["Upper-body power"],y:"Fast pressing against a wall — trains rate of force, not just strength.",c:"Explode off the chest, catch the rebound, reset between reps."}],
  main:[
   {n:"Pull-up",d:"pullup",rx:["4×5–8 (assist ok)","4×6–8 less assist","4×5 · less assist again","2×5 crisp"],t:["Lats","Biceps"],y:"The vertical pull that fills out the back — and the clearest progress marker in the program.",c:"Full hang at the bottom, chest toward the bar, no kipping."},
   {n:"Incline DB Press",d:"incline",rx:["3×10","4×8–10 +load","4×8 heavier","2×10"],t:["Upper chest","Front delts"],y:"A second press for the lagging chest, from a different angle than Monday's bench.",c:"30–45° bench, full stretch at the bottom of every rep."},
   {n:"Skull Crusher",d:"skull",rx:["3×10","3×10 +load","3×8 heavier","2×10"],t:["Triceps"],y:"Long-head triceps work for a stronger lockout.",c:"Upper arms stay still; lower the bar toward the forehead slowly."}],
  core:[{n:"Bird Dog",d:"bird",rx:["3×8/side"],t:["Core","Glutes"],y:"Trunk control while the limbs move — cheap, low-fatigue core work.",c:"Reach long, keep the hips level, pause a beat at full extension."}],
  str:[{n:"Lat stretch — 30s/side",d:"hang"},{n:"Cat-cow — 10"}]}},
{k:"fri",l:"FRI",time:"—",focus:"Rest",map:[],fin:"no finisher — rest day",
 note:"Full rest. Eat to the targets anyway; recovery happens on days like this.",
 secs:{warm:[],power:[],main:[],core:[],str:[]}},
{k:"sat",l:"SAT",time:"10 AM",focus:"Lower B — Hinge + Power",fin:"10 min easy cardio (optional)",map:["glute","ham","quad","calf","abs"],
 note:"Jumps first while you're fresh, then the trap bar. Keep the box jumps crisp — stop the set when height drops.",
 secs:{warm:[{n:"5 min easy bike",d:"run"},{n:"Glute bridges — 2×15",d:"bridge"},{n:"Pogo hops — 2×15",d:"pogo"}],
  power:[{n:"Box Jump",d:"boxjump",rx:["3×4 · stick the landing","4×4 · raise the box","4×3 · max height","2×3"],t:["Vertical power"],y:"Explosive hip extension with a soft, low-impact landing.",c:"Full intent, land quietly, step down — never jump down."}],
  main:[
   {n:"Trap Bar Deadlift",d:"dl",rx:["3×6","4×5 +load","4×4 heavier","2×5"],t:["Posterior chain","Grip"],y:"The heaviest pull of the week with a back-friendly setup.",c:"Push the floor away, brace before each rep, neutral spine."},
   {n:"Bulgarian Split Squat",d:"bulg",rx:["3×10/leg","3×8–10 +load","3×8 heavier","2×8"],t:["Quads","Glutes","Balance"],y:"Single-leg strength — evens out left/right differences.",c:"Weaker leg first, front shin near vertical, control the descent."},
   {n:"Barbell Hip Thrust",d:"thrust",rx:["3×10","4×8–10 +load","4×8 heavier","2×10"],t:["Glutes"],y:"Direct glute loading at full hip extension.",c:"Ribs down, chin tucked, squeeze for a second at the top."}],
  core:[{n:"Stir the Pot",d:"stirpot",rx:["3×6/direction"],t:["Abs","Obliques"],y:"A plank that fights rotation — more trunk demand than a static hold.",c:"Small circles with the forearms on the ball, hips square to the floor."}],
  str:[{n:"Pigeon pose — 60s/side",d:"pigeon"},{n:"Standing quad stretch — 30s/side"}]}},
{k:"sun",l:"SUN",time:"anytime",focus:"Mobility + Weigh-In",map:["hipfx","glute","lowback"],fin:"no finisher — just the stretch block",
 note:"Weigh in first thing (fasted, same conditions every week), then the mobility block. Ten minutes resets the week.",
 secs:{warm:[],power:[],main:[],core:[],
  str:[{n:"World's Greatest Stretch — 5/side"},{n:"Couch stretch — 45s/side",d:"couch"},{n:"90/90 hip switch — 45s/side",d:"ninety"},{n:"Wall ankle — 30s/side"}]}}];

/* One base for the whole demo — there is no second era yet. */
const BASE_V2_FROM="9999-12-31";
const DAYS_V2=DAYS;

/* Optional flexible-session picker (none in the demo). */
const GYM_SESSIONS_LEGACY=[];
const GYM_SESSIONS=[];

/* Why tab */
const WHY=[
{t:"How the program thinks",c:"var(--cy)",b:"Two upper and two lower days a week, each lift trained twice. Over "+TOTAL_WEEKS+" weeks the block moves from technique (P1) → volume (P2) → intensity (P3) → a deload, finishing on "+SEASON_STR+" ready to test new 5-rep maxes."},
{t:"Upper A / Upper B",c:"var(--or)",b:"Pressing is the weak point, so both upper days lead with a press — flat bench on Monday, incline on Thursday — and pull-ups get two exposures a week."},
{t:"Lower A / Lower B",c:"var(--gr)",b:"Tuesday is squat-led, Saturday is hinge-led with jumps first. Between them every big lower-body pattern is trained twice."},
{t:"The rules that protect the whole thing",c:"var(--ye)",b:"1) Add weight only when every set hits the top of the rep range with clean form. 2) Weaker side first on single-leg work. 3) Sharp pain means stop that exercise, not push through. 4) Sleep 7–8 h — you grow between sessions, not during them."}];
const WHY_V2=WHY;
