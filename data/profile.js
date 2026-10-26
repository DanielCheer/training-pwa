/* data/profile.js — who the app is for: goal, targets, supplement stack, food list, branding cards.
   DEMO PERSONA ("Alex") — fictional. A real install replaces data/*.js with its own copies via the
   private overlay (serve.py serves private/data/* instead; see docs/data-contract.md). */

/* Open-ended body-composition goal. Declared before PHASES (data/program.js) interpolates it. */
const GOAL={bw:175,bfPct:12};
const GOAL_STR=GOAL.bw+' lb @ ~'+GOAL.bfPct+'% body fat';

/* Fuel tab: supplement stack — [icon, name, how/why]. */
const STACK=[["🔑","Creatine Monohydrate","5 g/day, any time of day. Expect a pound or two of water weight in the first weeks — that's muscle hydration, not fat."],
["🔑","Whey Protein","1–2 scoops/day to close the gap to the protein target on days real food falls short."],
["➕","Vitamin D3","1000–2000 IU/day through the darker months."]];

/* Fuel tab: weekly mobility protocol — [heading, items]. Card title: PROFILE.aptTitle. */
const APT=[["🔵 Mobilize","Hips (90/90, couch stretch) · thoracic spine (foam roller) · ankles (wall drill)"],
["⚡ Every session","5-minute general warm-up · two ramp-up sets before the first heavy lift"],
["❌ Never","Skipping the warm-up on a heavy day · testing a max without a spotter or safety pins"]];

/* Daily macro bands — the Log tab bars, the day verdict and the Fuel tab all read these. */
const DAY_TARGETS={kcal:[2700,2900],p:[160,180],c:[300,340],f:[75,90]};
const TEE=2600; // estimated total daily energy expenditure — the Fuel-tab surplus prose derives from DAY_TARGETS minus this

/* Food picker — [name, kcal, protein g, carb g, fat g, sugar g, fiber g, sat-fat g] per default serving. */
const FOODS=[
["Whey protein, 1 scoop",120,24,3,1.5,1,0,0.5],
["2% Milk, 1 cup",122,8,12,5,12,0,3],
["Greek yogurt, 1 cup",150,20,9,4,7,0,2.5],
["Banana, 1 medium",105,1,27,0,14,3,0],
["Oats (dry), 1 cup",300,10,54,5,1,8,1],
["Egg, 1 large",72,6.3,0.4,5,0,0,1.6],
["White rice, cooked, 1 cup",205,4.3,45,0.4,0,0.6,0.1],
["Chicken breast, cooked, 6oz",280,53,0,6,0,0,1.7],
["Salmon, cooked, 6oz",350,34,0,22,0,0,4],
["Black beans, 1/2 cup",114,7.6,20,0.5,0.3,7.5,0.1],
["Mixed vegetables, 1.5 cup",75,3,15,0.5,6,5,0.1],
["Olive oil, 1 tbsp",119,0,0,13.5,0,0,2]
];

/* Branding + the personal Home/Fuel/Log cards (renderProfileCards()). Strings may carry inline HTML. */
const PROFILE={
 name:"Alex",
 title:"Alex · Strength Block",
 shortName:"Training",
 eyebrow:"Demo profile → Programming",
 tz:"local",
 mealPlaceholder:"What did you eat? e.g. “chicken rice bowl”, “2 eggs + toast” (optional with a photo)",
 goal:{title:"The Goal — Honest Math",
  bars:[{label:"Weight",val:"165.0",rest:" / 175 lbs",pct:94,col:"var(--or)"},
   {label:"Lean mass",val:"135.3",rest:" / 154 lbs",pct:88,col:"var(--cy)"},
   {label:"Body fat",val:"18.0%",rest:" → 12%",pct:67,col:"var(--gr)"}],
  note:"175 lbs @ 12% = <b style=\"color:var(--tx)\">154 lbs lean mass</b> — about +19 lbs of muscle while trimming a little fat. That's a multi-year project, so this block's job is the first chunk of it: get stronger on the big lifts by <span class=\"js-season\"></span> and gain slowly enough that the waistline holds."},
 scan:{date:"Week 1",
  rows:[["Weight","165.0 lb"],
   ["Body fat","18.0%",["above goal","hi"]],
   ["Lean body mass","135.3 lb"],
   ["BMR / TEE","1720 / 2600"],
   ["Squat 5RM","185 lb"],
   ["Bench 5RM","135 lb",["lagging","lo"]],
   ["Deadlift 5RM","225 lb"],
   ["Pull-ups","3 (assisted)",["lagging","lo"]]],
  note:"Two things drive this block: <b style=\"color:var(--tx)\">upper-body pressing lags the lower body</b>, so both upper days lead with a press, and <b style=\"color:var(--tx)\">pull-ups are still assisted</b>, so they show up twice a week."},
 aptTitle:"Weekly Mobility Protocol",
 mealTiming:"Anchor one meal within ~1–2h after training — that's when the carb + protein combo does the most work. On busy days, a shake covers a missed slot better than skipping it.",
 sampleDay:{title:"Sample Day",
  intro:"A concrete day that lands inside the bands. Swap foods freely — the point is hitting the numbers, not this exact menu.",
  items:[{n:"Breakfast",d:"oats · milk · banana · 1 scoop whey",kcal:647,p:43},
   {n:"Lunch",d:"chicken breast · 1.5c rice · vegetables",kcal:663,p:62},
   {n:"Snack",d:"Greek yogurt · banana",kcal:255,p:21},
   {n:"Dinner",d:"salmon · 1.5c rice · black beans · olive oil",kcal:890,p:48},
   {n:"Shake",d:"1 scoop whey · milk",kcal:242,p:32}],
  total:"~2697 kcal · 206g P · 317g C · 66g F",
  note:"Protein sits over the band (fine while gaining) and fat runs under it — an extra tbsp of olive oil on the rice closes that gap."},
 shakes:{title:"Shakes",
  paras:["<b style=\"color:var(--tx)\">Post-workout:</b> 1 scoop whey + 1 cup milk ≈ <b style=\"color:var(--tx)\">32g protein · ~242 kcal</b>. Have it within an hour of training if dinner is far off."],
  warn:""},
 cardioRules:"Optional: 10–20 min easy cardio after lifting, or a sauna session if your gym has one. Drink an extra glass or two of water afterwards."
};

/* Companion-server features (serve.py + the PC agents). null = a static checkout with none of them:
   no phone→PC push, no shared-log inbox, no auto-fill, no drafts, no photo upload. */
const SERVER=null;
