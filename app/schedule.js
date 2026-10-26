/* app/schedule.js — data contract guard, base epochs, overrides + sessions (dayObj), config sanity check, app state, week/phase resolution, navigation and the Plan tab's day/phase rows. */
/* Day keys. localDayKey() = local calendar day (workout side, checkmarks, exlog). todayKey() = the
   FOOD day: local time shifted back FOOD_DAY_ROLL_HOUR hours, so 00:00–03:59 still files under the
   previous day (v116; v73 had made both local-midnight, fixing the old UTC/8 PM roll).
   They live here, ahead of their first load-time caller (the state init below): a function
   declared in a LATER script doesn't exist yet when this one runs. */
function fmtHour(h){return (h%12||12)+(h<12?' AM':' PM')}
function fmtDayKey(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function todayKey(){return fmtDayKey(new Date(Date.now()-FOOD_DAY_ROLL_HOUR*36e5))}
function localDayKey(){return fmtDayKey(new Date())}

/* ───────── DATA CONTRACT ─────────
   Everything below reads globals the data/*.js scripts must declare (docs/data-contract.md). A
   missing one would otherwise surface as a ReferenceError deep inside some render; name every
   missing global at once, show the config banner, and stop the engine here. */
const DATA_CONTRACT=['PROFILE','SERVER','SEED','GOAL','START','SEASON','fmtMD','SEASON_STR','PHASES','PHW','TOTAL_WEEKS',
 'BUILD_PHASE','BUILD_START','HOLD_AT_PHASE','HOLD_END_WEEK','LD_BY_NAME','TARGETS','MON_VARIANTS','DAYS',
 'BASE_EPOCHS','GYM_SESSIONS','GYM_SESSIONS_LEGACY','WEEK_OVERRIDES','DAY_TARGETS','TEE',
 'FOODS','STACK','APT'];
(function contractGuard(){
 const missing=DATA_CONTRACT.filter(n=>{try{return (0,eval)('typeof '+n)==='undefined'}catch(e){return true}});
 if(missing.length){cfgFail('data/*.js is missing required global'+(missing.length>1?'s':'')+': '+missing.join(', ')+' — see docs/data-contract.md');
  throw new Error('data contract: missing '+missing.join(', '))}})();

function ldOf(name){return LD_BY_NAME[name]}
function loadBaseOverrides(){try{return JSON.parse(localStorage.getItem('dj-plate-base')||'{}')}catch(e){return{}}}
function saveBaseOverride(name,lb){const m=loadBaseOverrides();if(lb==null||isNaN(lb))delete m[name];else m[name]=lb;lsSet('dj-plate-base',JSON.stringify(m));schedulePush()}
function baseFor(name){const o=loadBaseOverrides();if(name in o)return o[name];const t=ldOf(name),c=t?LOAD_TYPES[t]:null;return c&&typeof c.base=='number'?c.base:0}



const EXLOG_SLOT_RX=new RegExp('^('+DAYS.map(d=>d.k).join('|')+')('+SECTIONS.map(s=>s.k).join('|')+')(\\d+)$');

/* sanityCheck() runs below, AFTER WEEK_OVERRIDES is defined, so it can validate override days too. */


/* Which base epoch (BASE_EPOCHS in data/program.js: weekly base + Why tab + options) is in effect for
   a local day (defaults to today). dayObj + exNameFromExlogKey both route through this, so today's
   render AND historical note resolution pick the right era. Epochs are ascending by `from`; the
   first has from:'' (validated in sanityCheck). */
function epochFor(dk){dk=dk||localDayKey();let ep=BASE_EPOCHS[0];for(const e of BASE_EPOCHS)if(e.from&&dk>=e.from)ep=e;return ep}
function baseDaysFor(dk){return epochFor(dk).days}

const WD_KEYS=["sun","mon","tue","wed","thu","fri","sat"];
function wdKeyOf(dk){const p=String(dk||'').split('-');return WD_KEYS[new Date(+p[0],+p[1]-1,+p[2],12).getDay()]}
function sessKey(dk){return 'dj-session-'+(dk||localDayKey())}
function pickedSession(dk){try{return localStorage.getItem(sessKey(dk))}catch(e){return null}}
/* Suggest the next session in the A→B→C rotation, derived from the most recent day he actually
   picked one — so the default is always "the one you haven't done", with no manual bookkeeping. */
function nextSession(){
 let latest=null,lid=null;
 try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);
  if(!k||k.indexOf('dj-session-')!==0)continue;const d=k.slice(11);
  if(d<localDayKey()&&(!latest||d>latest)){latest=d;lid=localStorage.getItem(k)}}}catch(e){}
 const i=GYM_SESSIONS.findIndex(s=>s.id===lid);
 let nid=GYM_SESSIONS[i<0?0:(i+1)%GYM_SESSIONS.length].id;
 // fbLegs is never SUGGESTED for a Saturday (Sunday's the game — see GYM_SESSIONS comment).
 // The picker stays fully manual, this only steers the default.
 if(nid==='fbLegs'&&wdKeyOf(localDayKey())==='sat'){
  const li=GYM_SESSIONS.findIndex(s=>s.id==='fbLegs');
  nid=GYM_SESSIONS[(li+1)%GYM_SESSIONS.length].id;
 }
 return nid;
}
function setGymSession(id){
 try{if(id)lsSet(sessKey(),id);else localStorage.removeItem(sessKey())}catch(e){}
 const S=dayObj(day).secs;
 sec=(SECTIONS.find(s=>(S[s.k]||[]).length)||SECTIONS[SECTIONS.length-1]).k;
 renderDay();schedulePush()}


function activeOverride(dk){dk=dk||localDayKey();return WEEK_OVERRIDES.find(o=>o.from<=dk&&dk<=o.to)||null}
/* Program week (0-based) of a local day: whole weeks from START to that day's NOON (a DST change
   between START and the day can't pull the first hour of a week back into the previous one),
   clamped to the block. wkNow is this for today. */
function progWeekOf(dk){const p=String(dk||localDayKey()).split('-');
 return Math.min(TOTAL_WEEKS-1,Math.max(0,Math.floor((new Date(+p[0],+p[1]-1,+p[2],12)-START)/(7*864e5))))}
/* The first base week's (DAYS) Monday main block rotates weekly through MON_VARIANTS. Resolved at
   READ time for the date asked about: resolveWeek() used to write today's variant into DAYS, so
   every past Monday read back as this week's variant. Later epochs' Mondays don't rotate. */
function monVariantDay(base,dk){return {...base,secs:{...base.secs,main:MON_VARIANTS[progWeekOf(dk)%MON_VARIANTS.length]}}}
function dayObj(k,dk){dk=dk||localDayKey();
 const days=baseDaysFor(dk);let base=days.find(d=>d.k==k);
 if(k==='mon'&&days===DAYS&&MON_VARIANTS.length)base=monVariantDay(base,dk);
 const o=activeOverride(dk),ov=o&&o.days[k];
 let out=ov?{...base,...ov,secs:{...base.secs,...ov.secs},_ov:true}:base;
 /* v114: a gym session PICKED for this date wins over the weekday base (and over a dated override —
    a manual pick is the most specific statement of what he actually trained). Applies only to the
    weekday that date really falls on, so browsing other day tabs still shows their own content. */
 const sid=pickedSession(dk),S=sid&&(GYM_SESSIONS.find(x=>x.id===sid)||GYM_SESSIONS_LEGACY.find(x=>x.id===sid));
 if(S&&wdKeyOf(dk)===k)out={...out,...S,k,l:base.l,secs:{...out.secs,...S.secs},_sess:S.id};
 return out}

/* Fail-loud config guard (runs after WEEK_OVERRIDES so it can validate override days). Bad rx
   lengths render a silent wrong-week prescription; a malformed override from/to silently never
   activates — both should shout, not slip. */
(function sanityCheck(){
 ['bw','bfPct','lean'].forEach(k=>{if(!(typeof (PROFILE.scan||{})[k]=='number'&&isFinite(PROFILE.scan[k])))cfgFail('PROFILE.scan.'+k+' must be a number — the Goal card bars read it.')});
 (PROFILE.sampleDay.items||[]).forEach(i=>{if(!['kcal','p','c','f'].every(k=>typeof i[k]=='number'&&isFinite(i[k])))cfgFail('PROFILE.sampleDay item "'+i.n+'" needs numeric kcal, p, c and f — the Fuel tab totals are computed from them.')});
 if(!(GOAL.bw>0&&GOAL.bfPct>0&&GOAL.bfPct<100))cfgFail('GOAL needs bw > 0 and 0 < bfPct < 100 — the Goal card bars read it.');
 if(PHW.length!==PHASES.length)cfgFail('PHW has '+PHW.length+' entries but PHASES has '+PHASES.length+' — every phase needs a week count.');
 const chk=(list,where)=>(list||[]).forEach(e=>{if(e&&Array.isArray(e.rx)&&e.rx.length!==1&&e.rx.length!==PHASES.length)cfgFail('"'+e.n+'" ('+where+'): '+e.rx.length+' rx entries — needs 1 or '+PHASES.length+'.')});
 const dRx=/^\d{4}-\d{2}-\d{2}$/;
 if(!Array.isArray(BASE_EPOCHS)||!BASE_EPOCHS.length||BASE_EPOCHS[0].from!=='')cfgFail('BASE_EPOCHS must be a non-empty list whose first epoch has from:"".');
 (BASE_EPOCHS||[]).forEach((ep,i)=>{
  if(i&&(!dRx.test(ep.from||'')||ep.from<=BASE_EPOCHS[i-1].from))cfgFail('BASE_EPOCHS['+i+'].from "'+ep.from+'" must be YYYY-MM-DD and after the previous epoch.');
  if(!Array.isArray(ep.days)||!Array.isArray(ep.why))cfgFail('BASE_EPOCHS['+i+'] needs days[] and why[].');
  (ep.days||[]).forEach(d=>Object.entries(d.secs).forEach(([sname,l])=>chk(l,(i?'v'+(i+1)+' ':'')+d.k+'/'+sname)))});
 MON_VARIANTS.forEach((v,i)=>chk(v,'mon variant '+(i+1)));
 // every TARGETS key must resolve a load type, or fmtTarget can't derive its unit (rename footgun)
 Object.keys(TARGETS).forEach(n=>{if(!ldOf(n))cfgFail('TARGETS "'+n+'" has no load type in LD_BY_NAME — target unit can\'t be derived (renamed?).');});
 WEEK_OVERRIDES.forEach((o,i)=>{
  if(!dRx.test(o.from||'')||!dRx.test(o.to||''))cfgFail('WEEK_OVERRIDES['+i+'] bad date range "'+o.from+'".."'+o.to+'" — need YYYY-MM-DD or it never activates.');
  Object.entries(o.days||{}).forEach(([dk,dv])=>Object.entries((dv&&dv.secs)||{}).forEach(([sname,l])=>chk(l,'override '+dk+'/'+sname)));
 });
})();

function whyList(){return epochFor().why}



/* ───────── STATE + RENDER ───────── */
/* First-open seed (data/seed.js). A static demo has no history, so SEED fills localStorage once
   with sample sets, weigh-ins and meals; the owner's profile ships SEED=null and this is a no-op.
   One-shot via a marker key, and never overwrites a key that already holds data. */
(function seedOnce(){
 if(!SEED)return;
 try{
  if(localStorage.getItem(LS_NS+'seeded'))return;
  Object.keys(SEED).forEach(k=>{if(localStorage.getItem(k)===null)lsSet(k,typeof SEED[k]=='string'?SEED[k]:JSON.stringify(SEED[k]))});
  lsSet(LS_NS+'seeded',new Date().toISOString());
 }catch(e){console.error('seed: localStorage unavailable, demo starts empty: '+e)}})();
/* Fallback diagram lookup by name — so warmup/stretch/cardio items and a few movement blocks
   that carry a video instead of a `d:` key still show a figure. Explicit `e.d` always wins. */
function diaFor(name){if(!name)return null;for(let i=0;i<DIA_HINTS.length;i++)if(DIA_HINTS[i][0].test(name))return DIA_HINTS[i][1];return null;}
function diaKey(e){return (e&&e.d)||diaFor(e&&e.n);}
let day="tue",phase=0,sec="warm";
/* Reopen where you left off TODAY (survives the reload iOS forces on returning from a reel /
   backgrounding), else default to today's actual weekday instead of always Tuesday. */
function saveView(){try{lsSet('dj-view',JSON.stringify({day,sec,dayKey:localDayKey()}))}catch(e){}}
(function(){try{const v=JSON.parse(localStorage.getItem('dj-view')||'{}');
 if(v&&v.dayKey===localDayKey()&&DAYS.some(d=>d.k===v.day)){day=v.day;if(v.sec)sec=v.sec}
 else{const wd=["sun","mon","tue","wed","thu","fri","sat"][new Date().getDay()];if(DAYS.some(d=>d.k===wd))day=wd}}catch(e){}})();
const done={};
/* Checkmarks persist for the DAY (keyed by local date) so they survive a reload or iOS
   suspending the PWA in the background — they used to be memory-only and cleared on every
   reload. A new day starts fresh; stale prior-day keys are pruned on load. Logged sets were
   always persisted separately (dj-workout-log); this only covers the visual ✓ circles. */
function doneKey(){return 'dj-done-'+localDayKey()}
function loadDone(){try{return JSON.parse(localStorage.getItem(doneKey())||'{}')}catch(e){return{}}}
function saveDone(){try{lsSet(doneKey(),JSON.stringify(done))}catch(e){}}
function pruneDone(){for(let i=localStorage.length-1;i>=0;i--){const k=localStorage.key(i);if(k&&k.indexOf('dj-done-')===0&&k!==doneKey())localStorage.removeItem(k)}}
let doneDay=localDayKey();
(function(){pruneDone();Object.assign(done,loadDone())})();
/* If the local day rolled over while the app stayed open/backgrounded (iOS keeps PWAs alive for
   days), the in-memory checks belong to YESTERDAY — clear them, re-prune, and re-resolve the
   week/schedule so nothing bleeds into today's key. Called from chk() + on foreground. */
function dayRoll(){const t=localDayKey();if(t===doneDay)return false;
 doneDay=t;for(const k in done)delete done[k];for(const k in plateState)delete plateState[k];pruneDone();resolveWeek();return true}
const $=id=>document.getElementById(id);

/* Current program week (0-based) + phase, derived from START/PHW. Global on purpose (targets, hero,
   timeline). resolveWeek() so the midnight day-roll hook can re-run it without a reload; called at
   init so it's set before the first renderWorkoutStats(). It writes no program data: the Monday
   rotation resolves per date in dayObj(). */
let wkNow=0;
function resolveWeek(){
 wkNow=progWeekOf(localDayKey());
 phase=(()=>{let c=0;for(let i=0;i<PHW.length;i++){c+=PHW[i];if(wkNow<c)return i}return PHW.length-1})();
 if(phase>=PHASES.length)phase=PHASES.length-1; // clamp if PHW/PHASES mismatch (cfgFail already fired)
 if(HOLD_AT_PHASE!=null&&phase>HOLD_AT_PHASE)phase=HOLD_AT_PHASE; // goal-gated hold — never ramp past Build into Peak/Taper while the goal is open
}
resolveWeek();
/* Timeline marker week: while the program HOLDS, wkNow keeps running past the held phase's
   calendar band — pin the marker to the last week of that band so the bar can't show "Taper"
   while the banner says Build. Unheld → the real week. */
function tlWeek(){return (HOLD_AT_PHASE!=null&&phase===HOLD_AT_PHASE&&HOLD_END_WEEK!=null)?Math.min(wkNow,HOLD_END_WEEK):wkNow}

const _scroll={};
function nav(p,btn){const cur=document.querySelector(".pg.on");if(cur)_scroll[cur.id]=window.scrollY; // remember where you were on the page you're leaving
 document.querySelectorAll(".pg").forEach(e=>e.classList.remove("on"));$("pg-"+p).classList.add("on");
 document.querySelectorAll("nav button").forEach(b=>b.classList.remove("on"));btn.classList.add("on");
 if(p==='home')renderWorkoutStats(); // refresh the workout history here (moved off the set-logging hot path) — it was rebuilding an invisible tab on every "+ Set"
 window.scrollTo(0,_scroll['pg-'+p]||0)}

function renderPhaseRow(){$("phrow").innerHTML=PHASES.map((p,i)=>`<button class="${i==phase?'on':''}" onclick="setPhase(${i})">${p.n.split(" · ")[0]}</button>`).join("");
 const p=PHASES[phase];$("pban").style.background=p.bg;$("pban").style.borderColor=p.bd;$("pban").innerHTML=`<b style="color:${p.c}">${p.n}</b> <span style="color:var(--mu)">· ${p.d}</span><br>${p.t}`}
function setPhase(i){phase=i;renderPhaseRow();renderContent()}

function renderDayRow(){$("dayrow").innerHTML=DAYS.map(d=>`<button class="${d.k==day?'on':''}" onclick="setDay('${d.k}')">${d.l}</button>`).join("")}
function setDay(k){day=k;const S=dayObj(k).secs;
 sec=(SECTIONS.find(s=>(S[s.k]||[]).length)||SECTIONS[SECTIONS.length-1]).k;
 renderDayRow();renderDay();saveView()}

function renderDay(){
 const D=dayObj(day);
 $("dfocus").textContent=D.focus;
 $("dmeta").textContent="⏰ "+D.time+" · finish: "+(D.fin||"stairmaster 10–20 min → sauna 15–20 min");
 $("mmap").innerHTML=bodySVG(0,D.map)+bodySVG(1,D.map);
 const tt=$("sessRow");
 /* v114: on TODAY's tab, in an epoch with sessionPicker, this row is the gym-session picker — tap
    whichever session you're doing, on whatever day you're in the gym. The un-picked default
    highlights nextSession() so the rotation self-advances. Hidden everywhere else. */
 if(day===wdKeyOf(localDayKey())&&epochFor().sessionPicker){
  const cur=pickedSession(),sug=nextSession();
  tt.style.display="flex";
  tt.innerHTML=GYM_SESSIONS.map(s=>`<button class="${cur===s.id?'on':''}" onclick="setGymSession('${s.id}')">${s.lbl}${!cur&&s.id===sug?' ·next':''}</button>`).join('')
   +`<button class="${cur?'':'on'}" onclick="setGymSession('')">No gym</button>`;
 }
 else tt.style.display="none";
 const S=D.secs;
 const tabs=SECTIONS.map(s=>[s.k,s.lbl,(S[s.k]||[]).length]).filter(t=>t[2]||SECTIONS.find(s=>s.k==t[0]).always);
 if(!tabs.some(t=>t[0]==sec))sec=tabs.length?tabs[0][0]:"str"; // parked section gone (e.g. a window reverted under an open app) → jump to first live tab
 $("segrow").innerHTML=tabs.map(t=>{const col=SECTIONS.find(x=>x.k==t[0]).col;
  return `<button class="${sec==t[0]?'on':''}" style="${sec==t[0]?'color:'+col+';border-bottom-color:'+col:''}" onclick="setSec('${t[0]}')">${t[1]}${t[2]?' ('+t[2]+')':''}</button>`}).join("");
 $("dnote").innerHTML="⚠️ "+D.note;
 renderContent()}
function setSec(s){sec=s;renderDay();saveView()}
