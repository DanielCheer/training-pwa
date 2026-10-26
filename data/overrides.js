/* data/overrides.js — dated one-off schedule changes, merged over the base week at read time by
   dayObj(). Each block: inclusive from/to (YYYY-MM-DD local days) + per-weekday replacement fields;
   it expires by itself the day after `to`. Expired blocks STAY — logged history resolves through them.
   DEMO PERSONA ("Alex"): one past block and one active this week, both dated relative to today. */
const HOME_DAY={focus:"Home Workout — no equipment",time:"anytime",fin:"a 20-minute walk",map:["chest","tri","abs","hipfx"],
 note:"Gym closed for the day, so this is a bodyweight session: push, core and hip work you can do on a living-room floor. Sets you log here file under Thursday.",
 secs:{warm:[{n:"2 min brisk walk or easy stairs",d:"run"},{n:"Arm circles — 10 each way",d:"pullapart"}],power:[],
  main:[{n:"Plyo Push-up",d:"plyo",rx:["4×5 · explode off the floor"],t:["Chest","Upper-body power"],y:"Bodyweight pressing with intent — keeps the press groove alive away from the bench.",c:"Push hard enough that the hands leave the floor; land softly."},
   {n:"Standing Hip Flexor March",d:"hipflex",rx:["3×10/side"],t:["Hip flexors","Balance"],y:"Hip flexor strength through a full range, no equipment needed.",c:"Tall posture, drive the knee to hip height, lower under control."}],
  core:[{n:"Hollow Hold",d:"hollow",rx:["3×20–30s"],t:["Abs","Core"],y:"The trunk brace, no equipment needed.",c:"Lower back pressed into the floor the whole time."}],
  str:[{n:"Couch stretch — 45s/side",d:"couch"}]}};
const OUTDOOR_DAY={focus:"Outdoor Conditioning",time:"10 AM",fin:"stretch in the shade, then hydrate",map:["quad","glute","abs","deltF"],
 note:"Nice weather this weekend, so Saturday moves outside: med-ball throws and core work at the park instead of the trap-bar session. The trap bar comes back next Saturday.",
 secs:{warm:[{n:"Easy jog — 5 min",d:"run"},{n:"Leg swings — 10 each direction",d:"legswing"}],
  power:[{n:"Overhead Med Ball Throw",d:"mbthrow",rx:["4×4 · max height"],t:["Total-body power"],y:"Full-body triple extension — the same hip drive as a jump, finished through the arms.",c:"Dip, drive through the legs, release the ball overhead at full extension."}],
  main:[],
  core:[{n:"Cable Crunch",d:"crunch",rx:["3×12 · resistance band"],t:["Abs"],y:"Loaded spinal flexion with a band tied to a post.",c:"Curl the ribs toward the hips; the hips stay still."}],
  str:[{n:"World's Greatest Stretch — 5/side"}]}};
const WEEK_OVERRIDES=(()=>{
 const pad=n=>String(n).padStart(2,'0'),now=new Date();
 const dk=off=>{const d=new Date(now.getFullYear(),now.getMonth(),now.getDate()+off,12);return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())};
 return [
  {from:dk(-14),to:dk(-8),why:"Two weeks ago: the gym was closed one day, so Thursday became a bodyweight home session.",days:{thu:HOME_DAY}},
  {from:dk(-1),to:dk(5),why:"This week: Saturday moves outdoors (med-ball throws + core) instead of the trap-bar session.",days:{sat:OUTDOOR_DAY}}];
})();
