/* Engine configuration — constants the app logic reads (load types, sections, nutrients, sync
   timings, inbox contract). Not personal: shared by every profile. Loaded first, before data/*.js. */
/* ── Set-logging load types ─────────────────────────────────────────────────
   Every exercise is classified by HOW it's loaded so the log form captures the
   RIGHT number at entry: a barbell TOTAL vs plates-per-side (×2), a dumbbell
   per-hand, a box height in inches, or bodyweight = reps only. Fixes the class
   of error from Fri 07-24 (box jump logged in lbs, hack squat logged per-side).
   Tags are keyed by exercise NAME — stable across the Monday rotation,
   overrides and gym sessions, unlike slot ids. A name absent from LD_BY_NAME falls
   back to today's plain "weight (lb)" input (safety net, nothing breaks). */
const LOAD_TYPES={
 bar:  {lbl:"bar",       base:45, dbl:true,  plates:true},
 trap: {lbl:"trap bar",  base:45, dbl:true,  plates:true},
 ez:   {lbl:"EZ bar",    base:25, dbl:true,  plates:true},
 sled: {lbl:"sled",      base:0,  dbl:true,  plates:true},   // plate machine, plates per side, base set per-machine
 belt: {lbl:"belt/lever",base:0,  dbl:true,  plates:true},   // DJ's hip-thrust machine loads plates on BOTH sides → ×2 (confirmed by his notes, Fri + Sun 2026-07-26). Base editable per-machine.
 db:   {ph:"per hand (lb)",  unit:"lb"},
 stack:{ph:"stack (lb)",     unit:"lb"},
 held: {ph:"implement (lb)", unit:"lb"},
 box:  {ph:"box height (in)",unit:"in"},
 bw:   {optionalLoad:true}   // reps-only; "+ add load" reveals an optional lb input (weighted pull-up, jump squat P2+)
};
const PLATE_SIZES=[45,25,10,5,2.5];

/* Canonical section list — order = tab order = first-non-empty default. chkOnly sections
   render as simple check rows (no rx/log). Every section-keyed lookup (tabs, colors, content
   dispatch, exlog-key regex) derives from this — one place to add/rename/reorder a section. */
const SECTIONS=[
 {k:"warm", lbl:"Warmup",   col:"var(--ye)"},
 {k:"power",lbl:"⚡ Power", col:"var(--or)"},
 {k:"main", lbl:"Main",     col:"var(--cy)"},
 {k:"core", lbl:"Core/Hip", col:"var(--gr)"},
 {k:"prep", lbl:"🦶 Prep",  col:"var(--pu)"},
 {k:"str",  lbl:"Stretch",  col:"var(--pu)", chkOnly:true, vsuffix:" stretch", notes:true},
 {k:"cardio",lbl:"🧖 Cardio",col:"var(--or)", special:"cardio", always:true} // not a per-day exercise list — its own tab after Stretch; renderContent drops the Cardio & Sauna logger here. `always` keeps the tab present on every day (segrow filter would otherwise drop a 0-length section).
];

/* Fail-loud config guards — if PHW/PHASES fall out of sync, or an exercise's rx array doesn't
   carry either 1 entry (phase-agnostic) or one-per-phase, show a red banner + console.error
   instead of silently rendering a wrong (week-1) prescription. The app still renders. */
function cfgFail(msg){
 console.error('CONFIG ERROR: '+msg);
 try{const b=document.createElement('div');
  b.style.cssText='position:fixed;top:0;left:0;right:0;z-index:999;background:#7F1D1D;color:#fff;font:700 12px/1.5 -apple-system,sans-serif;padding:9px 14px;text-align:center';
  b.textContent='⚠ CONFIG ERROR: '+msg;document.body.appendChild(b)}catch(e){}
}

/* Persistent in-app banners (stacked at the top, one per id; showing an id again updates it). tone
   'error' stays until reload; 'warn' has a dismiss button. */
function appBanner(id,msg,tone){
 try{let box=document.getElementById('banners');
  if(!box){box=document.createElement('div');box.id='banners';box.className='banners';document.body.appendChild(box)}
  let b=document.getElementById('banner-'+id);
  if(!b){b=document.createElement('div');b.id='banner-'+id;b.setAttribute('role','alert');box.appendChild(b)}
  b.className='banner '+(tone==='warn'?'warn':'error');b.textContent=msg;
  if(tone==='warn'){const x=document.createElement('button');x.type='button';x.textContent='✕';x.setAttribute('aria-label','Dismiss');
   x.onclick=()=>b.remove();b.appendChild(x)}
 }catch(e){console.error('banner '+id+': '+msg)}}

/* Parsed-read memo for the big logs (loadWorkoutLog, loadFoodLog, foodLogFor). One render pass parsed
   the same JSON dozens of times (every exercise card's target and last-session line re-read the whole
   workout log). A cached parse is reused only while the stored string is unchanged, so a write from
   anywhere (another tab, the inbox, a test) is never masked; lsSet() drops the key's entry before it
   writes, so a caller that mutated the array and then failed to save can't leave that copy behind;
   and the memo empties when the current task ends, so it lives for one render, not the session.
   Callers own the returned array until their write: mutate it only to save it. */
const _lsMemo=new Map();let _lsMemoSweep=false;
function lsJSON(k){
 const raw=localStorage.getItem(k),m=_lsMemo.get(k);
 if(m&&m.raw===raw)return m.val;
 let val;try{val=JSON.parse(raw||'[]')}catch(e){val=[]}
 _lsMemo.set(k,{raw,val});
 if(!_lsMemoSweep){_lsMemoSweep=true;Promise.resolve().then(()=>{_lsMemo.clear();_lsMemoSweep=false})}
 return val}

/* Every app write to localStorage goes through lsSet(). A full store throws QuotaExceededError out of
   the middle of a save, so a logged set or meal silently never persisted (and the code after the
   write never ran). lsSet catches exactly that error, shows a persistent banner naming what was lost
   and returns false; any other error still throws. */
function isQuotaError(e){return !!e&&(e.name==='QuotaExceededError'||e.name==='NS_ERROR_DOM_QUOTA_REACHED'||e.code===22||e.code===1014)}
function lsSet(k,v){
 _lsMemo.delete(k); // write-through: the next read re-parses what was actually stored
 try{localStorage.setItem(k,v);return true}
 catch(e){if(!isQuotaError(e))throw e;
  console.error('localStorage is full: '+k+' was not saved');
  appBanner('quota','⚠ Storage for the app is full on this phone, so the last change ('+k+') was NOT saved. Export your workout and meal logs, then clear old data.','error');
  return false}}

/* Fallback diagram key by exercise name (diaFor) — an explicit `d:` on the exercise always wins. */
const DIA_HINTS=[[/kb conditioning complex/i,"kbcx"],[/tibialis/i,"tibraise"],[/ankle dorsiflexion/i,"wallankle"],[/bulletproof knee/i,"kneeiso"],[/cat-?cow/i,"catcow"],[/child'?s pose/i,"childp"],[/wall ankle/i,"wallankle"],[/standing quad|quad stretch/i,"quadstr"],[/hamstring/i,"hamstr"],[/thoracic/i,"thoracic"],[/figure-?4/i,"pigeon"],[/world'?s greatest/i,"kneel"],[/wall slide|arm circle/i,"pullapart"],[/suicide|volleyball|basketball|pickleball|jump rope|\bbike\b|\brow\b/i,"run"]];

/* History-driven targets (targetLine): reps at the logged weight that earn the next increment. */
const REP_CAP=7;                       // reps at a given load that earn the bump (DJ's rule: get 7 → go up)

/* Correction backstop: a set note that reads like a units correction gets surfaced (correctionNotes). */
const CORRECTION_RX=/each side|per side|(^|[^\dx×])[x×]2(?=$|[^\d])|not lbs?|\binch(es)?\b|miscalc/i; // boundaries so "3x20" / "pinching" don't false-flag

const FOOD_DAY_ROLL_HOUR=4; // v116: the FOOD day rolls at 4 AM local — a meal eaten after midnight counts toward the previous day (DJ's rule). todayKey() is the food day; the workout side keeps localDayKey() (midnight). autofill's nightly run is scheduled just after this hour.
if(!(Number.isInteger(FOOD_DAY_ROLL_HOUR)&&FOOD_DAY_ROLL_HOUR>=0&&FOOD_DAY_ROLL_HOUR<24))cfgFail('FOOD_DAY_ROLL_HOUR must be an integer 0–23');

/* Optional quality nutrients — Claude-estimated ONLY (DJ never enters these); pre-filled on
   FOODS staples, filled on logged meals via chat + the autofill task. Each line is independently
   removable. ti = its slot index in a FOODS tuple. kind: 'ceil' = target is a max, 'floor' = min. */
const NUTRIENTS=[
 {k:'sugar',label:'Sugar',  ti:5,tgt:[0,100], kind:'ceil', col:'#F472B6'},
 {k:'fiber',label:'Fiber',  ti:6,tgt:[35,45], kind:'floor',col:'#A3E635'},
 {k:'satf', label:'Sat fat',ti:7,tgt:[0,31],  kind:'ceil', col:'#FB923C'}
];

/* Freshness monitors for the phone→PC push and the PC auto-fill run (status strip on the Log tab). */
const SYNC_STALE_H=24,AUTOFILL_STALE_H=36,AUTOFILL_OK=['filled','empty','already-filled','nothing-ready'];

/* Local-model draft polling (awaitDrafts) and its overdue threshold. */
const DRAFT_POLL_S=10,DRAFT_POLL_MAX_S=600,DRAFT_OVERDUE_MIN=5,DRAFT_OK=['drafted','running','empty','nothing-ready','nothing-usable'];
/* Shared-log inbox: the dedup key, and every entry `type` applySharedEntries() understands. */
const IMPORTED_KEY='dj-shared-imported-ids';
const KNOWN_INBOX_TYPES=['workout','workout-update','cardio','weigh','food-move','food-update']; // every `type` branch in applySharedEntries(); a plain food entry has no type

/* Sent with every POST to the companion server (serve.py refuses a POST without it, except the
   sendBeacon push, which can't set headers): together with the JSON/image Content-Type it means a page on
   another origin can't make the phone's browser post to the PC. */
const CLIENT_HEADERS={'X-Train-Client':'1'};

/* Rest timer length (s). */
const TDUR=90;

/* localStorage namespace. A data contract with the companion server (device-logs.json push,
   food_common.py, the shared-log inbox), so it stays "dj-" for every profile. Existing call sites
   keep their literal keys; new code builds keys from LS_NS. */
const LS_NS='dj-';
