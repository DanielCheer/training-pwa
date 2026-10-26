/* app/plan.js — the Plan tab: targets, exercise cards, set logging + plates, workout history, notes, CSV export, Sheet sync, Fuel targets/day review, End Workout / Review Meals. */
/* Green 🎯 target line under the rx prescription — only in the Build phase, only for loadable
   lifts. Shows the seeded number (ramped by phase-week), a conservative hold for the guardrail
   lifts, or an honest "establish" cue when there's no feel-out data — never a blank, never an
   invented number. Reuses the existing phase/wkNow/PHW globals — no duplicated week derivation. */
/* ── History-driven targets (v112) ─────────────────────────────────────────
   The seeded TARGETS are a WEEK-1 starting point that ramps `inc` per Build week and then clamps
   at the end of Build. That was fine for an 8-week block, but DJ is now HELD in Build indefinitely,
   so the seed froze — Bench sat at "~125 lb" while his log already said 145×5. A target that
   undershoots what you actually lifted is worse than no target.
   Fix: derive the target from the LAST LOGGED SESSION, using DJ's own progression rule — every set
   to failure at 5–6 reps, and when you get REP_CAP reps the weight goes up. So: hit 7+ → last
   weight + inc; otherwise repeat the weight and try to beat the reps. Seeds stay as the fallback
   for lifts with no history. Works on the signed bw axis too: assisted −25 × 12 → −20 (less
   assist), which is exactly the right direction. */
function incFor(name){const t=TARGETS[name];return (t&&t.inc)||5}
function lastTopSetByName(name){
 const today=localDayKey();
 const prior=loadWorkoutLog().filter(e=>e&&e.exercise===name&&e.date<today&&e.weight!=null);
 if(!prior.length)return null;
 const d=prior.reduce((m,e)=>e.date>m?e.date:m,prior[0].date); // latest prior session
 return prior.filter(e=>e.date===d)
   .reduce((b,s)=>((s.weight>b.weight)||(s.weight===b.weight&&(s.reps||0)>(b.reps||0)))?s:b);
}
function targetLine(name){
 if(phase<BUILD_PHASE)return '';                // BEFORE Build (P1 Foundation) = pure feel-out week, no numbers yet
 const inBuild=(phase===BUILD_PHASE);           // seeds RAMP during Build; AFTER Build (Peak/Taper/in-season) they show as static working-weight references (the ramp `w` clamps to the last Build week below, so a seeded lift shows its final-Build number as the reference)
 const t=ldOf(name);if(!t)return '';            // unclassified (warm-up/stretch) → nothing
 const c=LOAD_TYPES[t],tg=TARGETS[name],MU='var(--mu)';
 const wrap=(txt,col)=>`<div class="r" style="color:${col};font-weight:700;margin-top:2px">🎯 ${txt}</div>`;
 const w=Math.min(Math.max(wkNow-BUILD_START,0),PHW[BUILD_PHASE]-1); // weeks into Build (0-based) — hoisted, used by the seeded + alts branches
 const wkTag=inBuild?(PHW[BUILD_PHASE]>1?` <span style="color:${MU};font-weight:600">· wk ${w+1} of Build</span>`:''):` <span style="color:${MU};font-weight:600">· working weight</span>`;
 /* Real logged history beats every seeded number below — including a stale guardrail hold,
    since what he actually lifted IS the current truth. Seeds/guardrails only apply with no history. */
 const hist=lastTopSetByName(name);
 if(hist){
  const earned=(hist.reps||0)>=REP_CAP,val=hist.weight+(earned?incFor(name):0);
  return wrap(fmtTarget(name,val)+` <span style="color:${MU};font-weight:600">· ${earned?'you hit '+hist.reps+' last time — go up':'beat '+(hist.reps||'?')+' reps at this weight'}</span>`,'var(--gr)');
 }
 if(tg&&tg.hold)                                // guardrail lift (a string hold is the reason shown) — conservative, never ramp
  return wrap((tg.t0!=null?'hold ~'+fmtTarget(name,tg.t0):'establish light')
    +` <span style="color:${MU};font-weight:600">· ${typeof tg.hold=='string'?tg.hold+' — ':''}keep conservative</span>`,'var(--or)');
 if(tg&&tg.alts)                                // one either-or slot, two different loads (Cable Fly vs Pec Deck) → show both, each ramped
  return wrap(tg.alts.map(a=>'~'+fmtTarget(name,a.t0+(a.inc||0)*w)+' '+a.lbl).join(' / ')+wkTag,'var(--gr)');
 if(tg&&tg.t0!=null){                           // seeded → current-week ramped number
  const val=tg.t0+(tg.inc||0)*w;
  // a NEGATIVE bw target is assistance (v106): progress is the assist shrinking, so say so instead of a week tag
  if(val<0&&t=='bw')return wrap(fmtTarget(name,val)+` <span style="color:${MU};font-weight:600">· drop the assist over time, then add load</span>`,'var(--gr)');
  return wrap('~'+fmtTarget(name,val)+wkTag,'var(--gr)');
 }
 if(sec=='power')return '';                     // power = intent/%-based (Speed Bench etc.); seeded power like Box Jump already returned above
 if(!(c.plates||t=='db'||t=='stack'))return ''; // held/box/bw with no seed: load is secondary, rx carries it
 if(!inBuild)return '';                         // outside Build, an UNSEEDED loadable lift shows nothing — the "establish wk1" cue is Build-only (it's not week 1 in-season)
 // v108: no RPE anywhere DJ can see — his standard is every working set to FAILURE at 5–6 reps
 return wrap(`establish the weight <span style="color:${MU};font-weight:600">· to failure at 5–6 reps, +weight when you get 7</span>`,MU);
}
function exRow(e,idx){
 const id=day+sec+idx,isOn=!!done[id];
 const rx=Array.isArray(e.rx)?(e.rx[phase]||e.rx[0]):(e.rx||''); // warmups carry their sets/reps in the name and have no rx array → render an empty prescription line, not "undefined"
 return `<div class="ex" id="ex-${id}">
 <div class="exh" onclick="tog('${id}')">
  <div class="chk ${isOn?'on':''}" onclick="event.stopPropagation();chk('${id}')">${isOn?"✓":""}</div>
  <div class="exn"><div class="n">${e.n}</div><div class="r" style="color:${PHASES[phase]&&PHASES[phase].heavy?'var(--or)':'var(--cy)'}">${rx}</div>${targetLine(e.n)}${lastLine(id)}</div>
  <div class="car">▼</div></div>
 <div class="exb">
  ${diaKey(e)?dia(diaKey(e)):""}
  ${e.v?llink(e.v):vlink(e.n)}
  <div class="exlog">
   <div class="exlogt">Log sets</div>
   ${logInputHtml(id,e.n)}
   <div id="setlist-${id}">${setListHtml(id)}</div>
   <div class="exlogt" style="margin-top:10px">Notes</div>
   <textarea id="exlog-in-${id}" placeholder="Swaps, form notes, how it felt..."></textarea>
   <button class="savebtn" onclick="saveExLog('${id}')">+ Save note</button>
   <div id="exlog-list-${id}">${exLogListHtml(id)}</div>
  </div>
  <div class="chips">${(e.t||[]).map(c=>`<span class="chip">${c}</span>`).join("")}</div>
  ${e.y?`<div class="why"><b style="color:var(--gr)">Why:</b> ${e.y}</div>`:""}
  ${e.c?`<div class="cue">💡 ${e.c}</div>`:""}
 </div></div>`}

function chkRow(x,idx,sc,vsuffix){
 const id=day+sc+idx,isOn=!!done[id],dk=diaKey(x);
 return `<div class="ex" id="ex-${id}">
 <div class="exh" onclick="${dk?`tog('${id}')`:`chk('${id}')`}">
  <div class="chk ${isOn?'on':''}" onclick="event.stopPropagation();chk('${id}')">${isOn?"✓":""}</div>
  <div class="exn"><div class="n" style="font-weight:600;font-size:14.5px">${x.n}</div></div>
  ${dk?'<div class="car">▼</div>':''}
 </div>
 ${dk?`<div class="exb">${dia(dk)}${vlink(x.n+(vsuffix||""))}</div>`:""}
 </div>`}

/* Section-level notes — a comment box at the bottom of a tab, for sections flagged notes:true
   (e.g. Stretch). Reuses the per-exercise exLog dated-note store with a slot-LESS key (day+sec,
   e.g. "sunstr"), so saveExLog/exLogListHtml work unchanged; correctionNotes skips non-slot keys. */
function sectionNotesHtml(dk,sk){const id=dk+sk,lbl=((SECTIONS.find(s=>s.k==sk)||{}).lbl||sk).replace(/^[^A-Za-z]+/,'');
 return `<div class="exlog" style="margin-top:12px">
  <div class="exlogt">📝 ${lbl} notes</div>
  <textarea id="exlog-in-${id}" placeholder="Notes for today's ${lbl.toLowerCase()} — what you did, what you pushed to another day, how it felt…"></textarea>
  <button class="savebtn" onclick="saveExLog('${id}')">+ Save note</button>
  <div id="exlog-list-${id}">${exLogListHtml(id)}</div>
 </div>`}
function renderContent(){
 const D=dayObj(day),S=D.secs;let h="";
 const sd=SECTIONS.find(x=>x.k==sec);
 if(sd&&sd.special=="cardio"){$("content").innerHTML=cardioSectionHtml();renderCardio();return} // its own tab, not a day exercise list
 const list=S[sec]||[];
 if(sd&&sd.chkOnly)h=list.map((x,i)=>chkRow(x,i,sec,sd.vsuffix)).join("");
 else h=list.length?list.map((e,i)=>exRow(e,i)).join(""):`<div class="card small" style="text-align:center">Hip + glute work is built into today's main block.</div>`;
 if(sd&&sd.notes)h+=sectionNotesHtml(day,sec);
 $("content").innerHTML=h;bindDias()}
/* The Cardio & Sauna logger — now its own section tab (after Stretch) rather than pinned to the
   bottom of the Plan page. renderContent() drops it into #content when the cardio tab is active,
   then renderCardio() fills #cardioList (a no-op on other tabs, where #cardioList doesn't exist). */
function cardioSectionHtml(){return `<div class="card">
 <div class="stitle" style="color:var(--or)">Cardio &amp; Sauna</div>
 <div class="small" style="margin-bottom:8px">Enter minutes, then tap the activity.</div>
 <input id="cardioMin" type="number" inputmode="numeric" placeholder="minutes" style="width:100%;background:var(--card2);border:1px solid var(--bd);border-radius:8px;padding:9px 11px;color:var(--tx);font-family:inherit;font-size:14px;margin-bottom:8px">
 <div style="display:flex;flex-wrap:wrap;gap:6px">
  <button onclick="addCardio('Stairmaster')" style="flex:1;min-width:82px;padding:9px 4px;border-radius:9px;background:#101E29;border:1px solid var(--bd);color:var(--tx);font-weight:700;font-size:12.5px">Stairmaster</button>
  <button onclick="addCardio('Sauna')" style="flex:1;min-width:66px;padding:9px 4px;border-radius:9px;background:#101E29;border:1px solid var(--bd);color:var(--tx);font-weight:700;font-size:12.5px">Sauna</button>
  <button onclick="addCardio('Bike')" style="flex:1;min-width:55px;padding:9px 4px;border-radius:9px;background:#101E29;border:1px solid var(--bd);color:var(--tx);font-weight:700;font-size:12.5px">Bike</button>
  <button onclick="addCardio('Run')" style="flex:1;min-width:52px;padding:9px 4px;border-radius:9px;background:#101E29;border:1px solid var(--bd);color:var(--tx);font-weight:700;font-size:12.5px">Run</button>
 </div>
 <div id="cardioList"></div>
</div>
<div class="card">
 <div class="stitle" style="color:var(--pu)">Sauna + Stairmaster Rules</div>
 <div class="small">${PROFILE.cardioRules}</div>
</div>`}

function tog(id){const el=$("ex-"+id);if(el)el.classList.toggle("open")}
/* Surgical update, not a full renderContent() — a full re-render would wipe unsaved text
   sitting in any other exercise's log textarea just because you checked a different box. */
function chk(id){if(dayRoll())renderDay();done[id]=!done[id];saveDone();const row=$("ex-"+id);if(!row)return;
 const c=row.querySelector(".chk");if(c){c.classList.toggle("on",!!done[id]);c.textContent=done[id]?"✓":""}
 schedulePush()}

/* Structured workout history — one row per SET (weight × reps), entered in the in-card form,
   exportable to CSV. The checkmark is now just a checkmark; logging happens in the card.
   (Replaced the old prompt()-per-exercise flow 2026-07-23 — it captured one summary row per
   exercise and real multi-set data like 8×95/6×115/6×115/6×135 couldn't be entered at all.)
   Dates use localDayKey, not todayKey: UTC rolls to tomorrow during the local evening, when most
   sessions happen, so late sessions were getting stamped with the next day's date. Food-log day keys
   stay UTC — contract-locked with the shared-log inbox; changing them would orphan history. */
function loadWorkoutLog(){try{return JSON.parse(localStorage.getItem('dj-workout-log')||'[]')}catch(e){return[]}}
function exName(id){
 const idx=+id.slice((day+sec).length);
 const list=dayObj(day).secs[sec];
 return list&&list[idx]?list[idx].n:null}
function addSet(id){
 const rEl=$("setr-"+id);if(!rEl)return;
 const reps=parseInt(rEl.value);if(!reps){rEl.focus();return}
 const name=exName(id);if(!name)return;
 const t=ldOf(name),c=t?LOAD_TYPES[t]:null;
 const wEl=$("setw-"+id);
 let weight=null,plates=null;
 if(!wEl&&c&&c.plates){ // plate picker is active (no typed input present)
  weight=plateTotal(id,name);
  plates={base:baseFor(name),side:plateSide(id).slice()};
 } else if(wEl){
  weight=wEl.value.trim()!==''?parseFloat(wEl.value):null;
 }
 const entry={id:'w-'+Date.now()+'-'+Math.random().toString(36).slice(2,8),date:localDayKey(),day,exercise:name,weight,sets:1,reps};
 if(t)entry.ld=t;
 if(weight!=null)entry.unit=(c&&c.unit)||'lb';
 if(plates)entry.plates=plates;
 const log=loadWorkoutLog();log.push(entry);
 localStorage.setItem('dj-workout-log',JSON.stringify(log));
 rEl.value=""; // reps clear; weight/plate stack stay — next set is usually the same or nearby
 renderSetList(id);schedulePush()}
function todaySets(id){
 const name=exName(id);if(!name)return[];
 return loadWorkoutLog().map((e,i)=>({e,i})).filter(x=>x.e.exercise===name&&x.e.date===localDayKey())}
/* Most-recent PRIOR session for an exercise (strictly before today), so the card can show
   "last: W×R" next to the 🎯 target — tells you whether to push or hold. Date strings are
   zero-padded YYYY-MM-DD, so string compare == chronological (same assumption as the history sort). */
function lastSessionSets(id){
 const name=exName(id);if(!name)return[];
 const today=localDayKey();
 const prior=loadWorkoutLog().filter(e=>e&&e.exercise===name&&e.date<today);
 if(!prior.length)return[];
 const d=prior.reduce((m,e)=>e.date>m?e.date:m,prior[0].date); // latest prior date
 return prior.filter(e=>e.date===d);
}
function lastLine(id){
 const sets=lastSessionSets(id);if(!sets.length)return'';
 const withW=sets.filter(s=>s.weight!=null);
 // top working set: max weight, tie-break max reps; all-bodyweight → max reps
 const top=(withW.length?withW:sets).reduce((b,s)=>((s.weight||0)>(b.weight||0)||((s.weight||0)===(b.weight||0)&&(s.reps||0)>(b.reps||0)))?s:b);
 return `<div class="r" style="color:var(--mu);font-weight:600;margin-top:1px">last: ${fmtSetShort(top)}</div>`;
}
function setListHtml(id){
 return todaySets(id).map((x,n)=>
  `<div class="logentry" style="padding:6px 10px"><div style="flex:1" class="small"><b style="color:var(--tx)">Set ${n+1}:</b> ${fmtSetWeight(x.e)}${x.e.reps??"?"} reps${plateSub(x.e)}</div><button class="del" onclick="delSet('${id}','${x.e.id||''}')">×</button></div>`).join("")}
function renderSetList(id){const el=$("setlist-"+id);if(el)el.innerHTML=setListHtml(id)}
function delSet(id,entryId){ // delete by entry id, not index — a stale index from another open card would splice the wrong set
 const log=loadWorkoutLog();const i=log.findIndex(e=>e&&e.id===entryId);
 if(i<0)return;
 log.splice(i,1);
 localStorage.setItem('dj-workout-log',JSON.stringify(log));
 renderSetList(id);schedulePush()}
function renderWorkoutStats(){
 const el=$("workoutStats");if(!el)return;
 const log=loadWorkoutLog();
 const notes=correctionNotes();
 const warn=notes.length?`<div style="background:#2A1E05;border:1px solid #6B4A12;border-radius:10px;padding:9px 11px;margin-bottom:9px"><div style="font-size:10.5px;font-weight:800;letter-spacing:.8px;color:var(--or);margin-bottom:5px">⚠ CHECK UNITS ON THESE</div>${notes.map(n=>`<div style="font-size:12px;color:#F5D9A6;margin-bottom:3px;line-height:1.4"><b style="color:#FFE9C2">${escHtml(n.exercise)}</b> <span style="color:var(--mu)">${n.date}</span> — ${escHtml(n.note)}</div>`).join("")}</div>`:"";
 el.innerHTML=warn+`<span>${log.length?`${log.length} set${log.length==1?'':'s'} logged`:"No sets logged yet — open an exercise and log your sets."}</span>`;renderWorkoutHistory()}
/* Workout history — every logged day, newest first, collapsible; sets grouped by exercise.
   Rendered from the same dj-workout-log the plan cards and CSV export read. */
function fmtSetShort(s){
 if(s.weight==null)return (s.reps??'?')+'r';
 const u=s.unit||'lb';
 let w;
 if(u=='in')w=s.weight+'″';
 else if(s.ld=='db')w=s.weight+'/hand';
 else if(s.ld=='bw')w=s.weight<0?(-s.weight)+'lb asst':'+'+s.weight+'lb'; // negative = assistance
 else w=s.weight+'lb';
 return w+'×'+(s.reps??'?');
}
function renderWorkoutHistory(){
 const el=$("workoutHistory");if(!el)return;
 const log=loadWorkoutLog();
 if(!log.length){el.innerHTML='';return}
 const byDate={};
 for(const e of log)(byDate[e.date]=byDate[e.date]||[]).push(e);
 const dates=Object.keys(byDate).sort((a,b)=>b.localeCompare(a));
 el.innerHTML=dates.map(d=>{
  const sets=byDate[d],byEx={},order=[];
  for(const s of sets){if(!(s.exercise in byEx)){byEx[s.exercise]=[];order.push(s.exercise)}byEx[s.exercise].push(s)}
  const dayLabel=sets[0].day?sets[0].day.toUpperCase():'';
  const body=order.map(ex=>`<div class="small" style="padding:4px 0;border-top:1px solid var(--bd)"><b style="color:var(--tx)">${escHtml(ex)}</b> <span style="color:var(--mu)">${byEx[ex].map(fmtSetShort).join(', ')}</span></div>`).join('');
  return `<details style="margin-bottom:8px;border:1px solid var(--bd);border-radius:10px;padding:9px 11px;background:var(--card2)"><summary style="cursor:pointer;font-weight:700;font-size:13.5px;display:flex;justify-content:space-between;gap:8px;list-style:none"><span>${fmtHistDate(d)} <span style="color:var(--mu);font-weight:600;font-size:11px">${dayLabel} ${d}</span></span><span style="color:var(--cy);font-weight:800;font-size:12px;white-space:nowrap">${sets.length} set${sets.length==1?'':'s'}</span></summary><div style="margin-top:6px">${body}</div></details>`;
 }).join('');
}
/* ── Load-type aware set-logging form ──────────────────────────────────────
   logInputHtml renders the right input for the exercise's load type. Plate types
   get the picker (no typed weight box — addSet reads the plate stack); box/db/
   stack/held get a labelled number; bodyweight is reps-only with an optional
   "+ add load". "⌨ type" on the picker collapses to a plain total-lb box for the
   odd machine that prints a total. Handlers take only `id` and resolve the
   exercise via exName(id), so nothing breaks under the Monday rotation. */
const INP_STY='flex:1;min-width:0;background:var(--card2);border:1px solid var(--bd);border-radius:8px;padding:9px 10px;color:var(--tx);font-family:inherit;font-size:14px';
const BTN_STY='background:var(--gr);color:#00110F;font-weight:800;border-radius:8px;padding:9px 14px;font-size:13px;white-space:nowrap';
function rnd1(n){return Math.round(n*10)/10}
function repsAndSet(id){return `<input id="setr-${id}" type="number" inputmode="numeric" placeholder="reps" style="${INP_STY}"><button onclick="addSet('${id}')" style="${BTN_STY}">+ Set</button>`}
function numRow(id,ph,step){return `<div style="display:flex;gap:6px;margin-bottom:7px"><input id="setw-${id}" type="number" inputmode="decimal" step="${step||'0.5'}" placeholder="${ph}" style="${INP_STY}">${repsAndSet(id)}</div>`}
/* Bodyweight lifts carry ONE signed load axis: positive = weight added, NEGATIVE = machine/band
   ASSISTANCE. That keeps pull-up progression a single continuous number (−40 → −25 → 0 → +10)
   instead of two competing fields, so lastLine()'s "max weight" top-set pick and any trend read
   already order correctly (less assist beats more assist). Nothing to migrate: existing entries
   are positive or null. Assist is entered by typing a negative, or via the "− assist" shortcut. */
function bwRow(id){return `<div style="display:flex;gap:6px;margin-bottom:5px"><input id="setw-${id}" type="number" inputmode="decimal" step="0.5" placeholder="added load (lb) · negative = assist" style="${INP_STY};display:none">${repsAndSet(id)}</div><div id="addload-${id}" style="margin-bottom:7px"><span onclick="showLoad('${id}')" style="font-size:11.5px;color:var(--cy);cursor:pointer">+ add load</span> <span onclick="showLoad('${id}',1)" style="font-size:11.5px;color:var(--cy);cursor:pointer;margin-left:10px">− assist</span></div>`}
function showLoad(id,assist){const w=$("setw-"+id);if(w){w.style.display='';if(assist&&!w.value)w.value='-';w.focus()}const a=$("addload-"+id);if(a)a.style.display='none'}
function logInputHtml(id,name){
 const t=ldOf(name),c=t?LOAD_TYPES[t]:null;
 if(c&&c.plates)return `<div id="loginp-${id}">${plateBlock(id,name)}</div>`;
 if(c&&c.unit=='in')return `<div id="loginp-${id}">${numRow(id,c.ph,'1')}</div>`;
 if(c&&c.ph)return `<div id="loginp-${id}">${numRow(id,c.ph)}</div>`;
 if(c&&c.optionalLoad)return `<div id="loginp-${id}">${bwRow(id)}</div>`;
 return `<div id="loginp-${id}">${numRow(id,'weight (lb)')}</div>`;
}
const plateState={}; // id -> {side:[...]}; persisted per-day so a reload mid-exercise (e.g. after a reel) keeps the loaded plates
function plateKey(){return 'dj-plates-'+localDayKey()}
function savePlates(){try{localStorage.setItem(plateKey(),JSON.stringify(plateState))}catch(e){}}
(function(){for(let i=localStorage.length-1;i>=0;i--){const k=localStorage.key(i);if(k&&k.indexOf('dj-plates-')===0&&k!==plateKey())localStorage.removeItem(k)}try{Object.assign(plateState,JSON.parse(localStorage.getItem(plateKey())||'{}'))}catch(e){}})();
function plateSide(id){return (plateState[id]&&plateState[id].side)||[]}
function plateTotal(id,name){const t=ldOf(name),c=LOAD_TYPES[t];const base=baseFor(name);const sum=plateSide(id).reduce((a,b)=>a+b,0);return rnd1(base+(c&&c.dbl?2*sum:sum))}
function plateBlock(id,name){return platePanel(id,name)+`<div style="display:flex;gap:6px;margin-bottom:7px">${repsAndSet(id)}</div>`}
function platePanel(id,name){return `<div id="pl-${id}">${platePanelInner(id,name)}</div>`}
function platePanelInner(id,name){
 const t=ldOf(name),c=LOAD_TYPES[t];const base=baseFor(name);const side=plateSide(id);const total=plateTotal(id,name);
 const sum=side.reduce((a,b)=>a+b,0);
 const btns=PLATE_SIZES.map(w=>`<button onclick="tapPlate('${id}',${w})" style="flex:1;padding:8px 2px;border-radius:8px;font-weight:800;font-size:13px;background:${w==45?'#07201D':'var(--card2)'};color:${w==45?'var(--cy)':'var(--tx)'};border:1px solid ${w==45?'var(--cy)':'var(--bd)'}">${w}</button>`).join('');
 const eq=side.length
  ? `${base} bar ${c.dbl?'+ 2×'+rnd1(sum)+'/side':'+ '+rnd1(sum)} = <b style="color:var(--gr)">${rnd1(total)} lb</b>`
  : (c.dbl?'tap the plates on <b style="color:var(--tx)">ONE side</b> — ×2 loads the other for you':`${base} + plates`);
 return `<div style="background:#0A1520;border:1px solid var(--bd);border-radius:10px;padding:9px 10px;margin-bottom:7px">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:6px">
   ${_baseEdit[id]?baseEditForm(id,name,c,base):`<span onclick="editBase('${id}')" style="font-size:11px;color:var(--mu);cursor:pointer;white-space:nowrap">${c.lbl}: <b style="color:var(--tx)">${base}</b> lb ✎</span>`}
   <span style="font-size:10px;color:var(--dim);white-space:nowrap">${c.dbl?'load 1 side · ×2':'single load'}</span>
   <span style="font-size:14px;font-weight:800;color:var(--gr);white-space:nowrap">${rnd1(total)} lb</span>
  </div>
  <div style="display:flex;gap:5px;margin-bottom:7px">${btns}</div>
  <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;color:var(--mu)">
   <span>one side: ${side.length?side.join(' + ')+' = '+rnd1(sum):'—'}</span>
   <span><span onclick="undoPlate('${id}')" style="color:var(--cy);cursor:pointer;margin-right:11px">↶ undo</span><span onclick="clearPlates('${id}')" style="color:var(--cy);cursor:pointer;margin-right:11px">clear</span><span onclick="typeMode('${id}')" style="color:var(--dim);cursor:pointer">⌨ type</span></span>
  </div>
  <div style="margin-top:6px;padding-top:6px;border-top:1px solid var(--bd);font-size:11px;color:var(--mu);text-align:center">${eq}</div></div>`;
}
function tapPlate(id,w){(plateState[id]=plateState[id]||{side:[]}).side.push(w);savePlates();renderPanel(id)}
function undoPlate(id){const s=plateState[id];if(s&&s.side.length)s.side.pop();savePlates();renderPanel(id)}
function clearPlates(id){if(plateState[id])plateState[id].side=[];savePlates();renderPanel(id)}
function renderPanel(id){const el=$("pl-"+id);if(el)el.innerHTML=platePanelInner(id,exName(id))}
/* Bar/sled base weight — edited in place in the plate panel (was a prompt(); an empty or mistyped
   answer silently reset the base). Invalid input keeps the old base and says why; "Default" is explicit. */
const _baseEdit={}; // plate-panel id -> true while its base editor is open
const BASE_MAX=1000;
function baseEditForm(id,name,c,base){
 return `<form class="ef ef-inline" onsubmit="event.preventDefault();saveBase('${id}')" style="flex:1">
  <label class="efl" for="be-${id}">${c.lbl} base (lb) for ${escHtml(name)}</label>
  <div style="display:flex;gap:5px;align-items:center"><input id="be-${id}" type="text" inputmode="decimal" value="${base}" autocomplete="off">
  <button type="submit" class="efok">Save</button><button type="button" class="efno" onclick="resetBase('${id}')">Default</button><button type="button" class="efno" onclick="closeBase('${id}')">Cancel</button></div>
  <div class="eferr" id="be-err-${id}" role="alert"></div></form>`}
function editBase(id){if(!exName(id))return;_baseEdit[id]=true;renderPanel(id);const el=$("be-"+id);if(el&&el.focus)el.focus()}
function closeBase(id){delete _baseEdit[id];renderPanel(id)}
function saveBase(id){const name=exName(id),el=$("be-"+id);if(!name||!el)return closeBase(id);
 const v=parseNumIn(el.value,0,BASE_MAX);
 if(v==null){const er=$("be-err-"+id);if(er)er.textContent='"'+el.value.trim()+'" isn\'t a weight from 0 to '+BASE_MAX+' lb — the base stays '+baseFor(name)+' lb.';return}
 saveBaseOverride(name,v);closeBase(id)}
function resetBase(id){const name=exName(id);if(name)saveBaseOverride(name,null);closeBase(id)}
function typeMode(id){const el=$("loginp-"+id);if(el)el.innerHTML=`<div style="display:flex;gap:6px;margin-bottom:4px"><input id="setw-${id}" type="number" inputmode="decimal" step="0.5" placeholder="total weight (lb)" style="${INP_STY}">${repsAndSet(id)}</div><div style="margin-bottom:7px"><span onclick="plateMode('${id}')" style="font-size:11.5px;color:var(--cy);cursor:pointer">⊞ back to plates</span></div>`}
function plateMode(id){const el=$("loginp-"+id);if(el)el.innerHTML=plateBlock(id,exName(id))}
function fmtSetWeight(e){
 if(e.weight==null)return "";
 const u=e.unit||'lb';
 if(u=='in')return e.weight+"″ × ";
 if(e.ld=='db')return e.weight+" lb/hand × ";
 if(e.ld=='bw')return e.weight<0?(-e.weight)+" lb assist × ":"+"+e.weight+" lb × "; // negative = assistance
 return e.weight+" lb × ";
}
/* Target load in the SAME unit the log stores for this exercise's load type — parallels
   fmtSetWeight() branch-for-branch so a target and its log input can't drift apart. */
function fmtTarget(name,val){
 const t=ldOf(name),c=t?LOAD_TYPES[t]:null;
 if(c&&c.unit=='in')return val+'″';        // box   → inches
 if(t=='db')return val+' lb/hand';          // db    → per hand
 if(t=='bw')return val<0?(-val)+' lb assist':'+'+val+' lb'; // bw → signed: + added load, − assistance
 return val+' lb';                          // bar/trap/ez/sled/belt/stack/held → total
}
function plateSub(e){if(!e.plates)return "";return `<div style="font-size:10px;color:var(--dim);margin-top:1px">${e.plates.base} + [${(e.plates.side||[]).join('·')||'0'}]/side</div>`}
/* Correction backstop — surfaces any set-note that reads like a units correction
   ("each side", "not lbs", "inches", "miscalc"…) so a Fri-07-24-style mistake
   can't slip past on the phone or in the CSV. */
function exNameFromExlogKey(slot,date){
 const m=slot.match(EXLOG_SLOT_RX);
 if(!m)return null;
 const D=dayObj(m[1],date);if(!D)return null;
 let list=D.secs[m[2]];
 if(m[1]=='mon'&&m[2]=='main'&&!D._ov&&baseDaysFor(date)===DAYS){const wk=date?Math.max(0,Math.floor((new Date(date+'T12:00:00')-START)/(7*864e5))):wkNow;list=MON_VARIANTS[wk%MON_VARIANTS.length];} // OLD base Monday rotates weekly — resolve against the NOTE's date. V2 Monday is basketball (no rotation, main:[]) → skip.
 const idx=+m[3];return list&&list[idx]?list[idx].n:null;
}
function correctionNotes(){
 const out=[];
 for(let i=0;i<localStorage.length;i++){
  const k=localStorage.key(i);if(!k||!k.startsWith('dj-exlog-'))continue;
  let arr;try{arr=JSON.parse(localStorage.getItem(k)||'[]')}catch(e){continue}
  const slot=k.slice('dj-exlog-'.length);
  if(!EXLOG_SLOT_RX.test(slot))continue; // only scan real exercise slots (day+sec+idx); skip section-notes keys like "sunstr"
  for(const en of arr)if(en&&typeof en.t=='string'&&CORRECTION_RX.test(en.t))out.push({date:en.d||'',exercise:exNameFromExlogKey(slot,en.d)||slot,note:en.t});
 }
 for(const e of loadWorkoutLog())if(e&&typeof e.note=='string'&&CORRECTION_RX.test(e.note))out.push({date:e.date,exercise:e.exercise,note:e.note});
 return out;
}
function correctionFlagSet(){const s=new Set();for(const n of correctionNotes())s.add(n.date+"|"+n.exercise);return s}
/* v87: every exlog note (for the CSV archive) + a clear-after-archive routine. On End Workout the
   notes get written into the downloaded CSV (the durable backup) and then the just-trained day's
   note slots are wiped so the next session starts with clean boxes (DJ's request — notes were
   accumulating forever). The CSV is the archive of record; the Sheet sync stays notes-free. */
function allWorkoutNotes(){
 const out=[];
 for(let i=0;i<localStorage.length;i++){
  const k=localStorage.key(i);if(!k||!k.startsWith('dj-exlog-'))continue;
  let arr;try{arr=JSON.parse(localStorage.getItem(k)||'[]')}catch(e){continue}
  const slot=k.slice('dj-exlog-'.length);
  for(const en of arr)if(en&&typeof en.t=='string'){
   const name=EXLOG_SLOT_RX.test(slot)?(exNameFromExlogKey(slot,en.d)||slot):slot; // section-note keys (e.g. sunstr) keep the slot label
   out.push({date:en.d||'',exercise:name,note:en.t});
  }
 }
 return out;
}
function clearWorkoutNotes(days){ // called from endDay with the day tab(s) ACTUALLY trained today (not the viewed tab).
 if(!Array.isArray(days)||!days.length)return;                                  // Archives every note to dj-exlog-archive FIRST (survives a silently-failed CSV download), then empties the slots → clean boxes next session, zero data loss.
 let archive;try{archive=JSON.parse(localStorage.getItem('dj-exlog-archive')||'[]')}catch(e){archive=[]}
 for(const dk of days){
  const pre='dj-exlog-'+dk; // this day's slots (day+sec+idx) + its section-note keys (day+sec)
  for(let i=localStorage.length-1;i>=0;i--){
   const k=localStorage.key(i);if(!k||k.indexOf(pre)!==0)continue;
   let arr;try{arr=JSON.parse(localStorage.getItem(k)||'[]')}catch(e){arr=[]}
   const slot=k.slice('dj-exlog-'.length);
   for(const en of arr)if(en&&typeof en.t=='string')archive.push({slot,exercise:EXLOG_SLOT_RX.test(slot)?(exNameFromExlogKey(slot,en.d)||slot):slot,date:en.d||'',note:en.t});
   localStorage.removeItem(k); // empty the live slot
  }
 }
 if(archive.length>500)archive=archive.slice(-500); // bound the archive
 localStorage.setItem('dj-exlog-archive',JSON.stringify(archive));
}
function exportWorkoutCSV(){
 const log=loadWorkoutLog();
 if(!log.length){alert("Nothing to export yet.");return}
 const flags=correctionFlagSet();
 const rows=[["Date","Day","Exercise","Weight","Unit","Sets","Reps","Plates","Flag"]];
 for(const r of log){
  const plates=r.plates?r.plates.base+"+"+(r.plates.side||[]).join("+"):"";
  const unit=r.unit||(r.weight!=null?"lb":"");
  const unitOut=r.ld=="db"&&unit=="lb"?"lb/hand":unit;
  const flag=flags.has(r.date+"|"+r.exercise)?"CHECK UNITS":"";
  rows.push([r.date,r.day,r.exercise,r.weight??"",unitOut,r.sets??"",r.reps??"",plates,flag]);
 }
 const notes=allWorkoutNotes(); // v87: archive the free-text notes into the CSV so they're never lost when they get cleared on End Workout
 if(notes.length){
  rows.push([]);
  rows.push(["NOTES:"]);
  rows.push(["Date","Exercise","Note"]);
  for(const nt of notes)rows.push([nt.date,nt.exercise,nt.note]);
 }
 const csv=rows.map(row=>row.map(v=>{const s=String(v);return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s}).join(",")).join("\r\n");
 const blob=new Blob([csv],{type:"text/csv;charset=utf-8;"});
 const url=URL.createObjectURL(blob);
 const a=document.createElement("a");
 a.href=url;a.download="dj-workout-log-"+localDayKey()+".csv";
 document.body.appendChild(a);a.click();document.body.removeChild(a);
 URL.revokeObjectURL(url)}
/* Google Sheet sync — batches on "End Workout", not live per set (gym signal is unreliable).
   Sends only entries not yet synced (tracked by id in dj-workout-log-synced), so a retry after
   a failed/partial sync never double-appends rows on the sheet. Requires DJ to deploy the Apps
   Script Web App himself and paste the URL once (see README) — that URL is the only credential
   involved, there's no OAuth on the phone side. */
function loadSyncedIds(){try{return new Set(JSON.parse(localStorage.getItem('dj-workout-log-synced')||'[]'))}catch(e){return new Set()}}
function loadFoodSyncedIds(){try{return new Set(JSON.parse(localStorage.getItem('dj-food-synced-ids')||'[]'))}catch(e){return new Set()}}
function loadSheetUrl(){return localStorage.getItem('dj-sheet-url')||''}
function saveSheetUrl(){const el=$("sheetUrlIn");localStorage.setItem('dj-sheet-url',el.value.trim());el.defaultValue=el.value;schedulePush()}
function renderSheetUrl(){const el=$("sheetUrlIn");if(el)el.value=el.defaultValue=loadSheetUrl()} // defaultValue = the saved value, so hasUnsavedText() doesn't count it as typing
/* Sends workout AND food rows in one POST — apps-script.gs (v2) files them into separate
   "Workouts"/"Food" tabs on the same sheet. Entries logged before ids existed (id undefined)
   are simply never eligible to sync — CSV export still has them, this only affects the Sheet. */
function syncToSheet(){
 return new Promise(resolve=>{
  const url=loadSheetUrl();
  if(!url){resolve({ok:false,reason:'no-url'});return}
  const wSynced=loadSyncedIds(),wPending=loadWorkoutLog().filter(e=>e.id&&!wSynced.has(e.id));
  const fSynced=loadFoodSyncedIds(),fPending=loadAllFoodLog().filter(e=>e.id&&!e.pending&&!fSynced.has(e.id)); // v116: never send a pending (0-kcal placeholder) meal — the Sheet is append-only + id-deduped, so it could never be corrected
  if(!wPending.length&&!fPending.length){resolve({ok:true,sentWorkout:0,sentFood:0});return}
  fetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({workoutRows:wPending,foodRows:fPending})})
   .then(r=>r.ok?r.json():Promise.reject())
   .then(()=>{
    wPending.forEach(e=>wSynced.add(e.id));
    fPending.forEach(e=>fSynced.add(e.id));
    localStorage.setItem('dj-workout-log-synced',JSON.stringify([...wSynced]));
    localStorage.setItem('dj-food-synced-ids',JSON.stringify([...fSynced]));
    resolve({ok:true,sentWorkout:wPending.length,sentFood:fPending.length})})
   .catch(()=>resolve({ok:false,reason:'network'}))})}

/* A CSV download lands in Files/Downloads, outside the PWA's storage sandbox — so unlike
   localStorage it survives clearing Safari site data. That's the actual backup, not just a
   convenience: exporting on demand is easy to forget, so give it a one-tap trigger at the
   natural end-of-session moment instead of relying on remembering to visit the Home tab.
   Food log + workout log export together, always, from the same button — one action, both
   records, so they never drift out of sync with each other. */
/* End-of-day review — judges the day's food vs targets, counts the workout, marks the day
   confirmed (✓ in Meal History), shown after End Day exports the CSV backups. */
/* Fuel tab "Daily Targets" + meal-structure numbers — rendered from DAY_TARGETS so the Fuel tab
   can never disagree with the Log tab's bars/verdict (which already read DAY_TARGETS). */
function renderFuelTargets(){
 const T=DAY_TARGETS,mid=r=>(r[0]+r[1])/2,kM=mid(T.kcal);
 const pct=(m,cal)=>Math.round(mid(T[m])*cal/kM*100);
 if($("dailyTargets"))$("dailyTargets").innerHTML=
  `<div class="mini"><div class="l">Calories</div><div class="v" style="color:var(--or)">${T.kcal[0]}–${T.kcal[1]}</div></div>`+
  `<div class="mini"><div class="l">Protein · ${pct('p',4)}%</div><div class="v" style="color:var(--cy)">${T.p[0]}–${T.p[1]} g</div></div>`+
  `<div class="mini"><div class="l">Carbs · ${pct('c',4)}%</div><div class="v" style="color:var(--gr)">${T.c[0]}–${T.c[1]} g</div></div>`+
  `<div class="mini"><div class="l">Fat · ${pct('f',9)}%</div><div class="v" style="color:var(--pu)">${T.f[0]}–${T.f[1]} g</div></div>`;
 const set=(id,v)=>{const el=$(id);if(el)el.textContent=v};
 set("dtSurplus",(T.kcal[0]-TEE)+"–"+(T.kcal[1]-TEE));
 set("dtTee",TEE);
 set("dtKcalMid",Math.round(kM/100)*100);
 set("dtPMid",Math.round(mid(T.p)/5)*5);
 const split=n=>`~${Math.round(kM/n/10)*10} kcal · ~${Math.floor(mid(T.p)/n)}g protein each`;
 if($("mealSplits"))$("mealSplits").innerHTML=
  `<div class="mini"><div class="l">4 meals/day</div><div class="v" style="font-size:14px">${split(4)}</div></div>`+
  `<div class="mini"><div class="l">5 meals/day</div><div class="v" style="font-size:14px">${split(5)}</div></div>`;
}
function dayFoodTotals(date){
 let all;try{all=JSON.parse(localStorage.getItem('dj-foodlog-'+date)||'[]')}catch(e){all=[]}
 const log=all.filter(e=>!e.pending); // v116: pending meals (awaiting the autofill estimate) are NOT counted — t.pend says how many are missing
 const t={n:all.length,pend:all.length-log.length,...log.reduce((a,e)=>({kcal:a.kcal+(+e.kcal||0),p:a.p+(+e.p||0),c:a.c+(+e.c||0),f:a.f+(+e.f||0)}),{kcal:0,p:0,c:0,f:0})};
 // v119: local-model DRAFTS of pending meals, summed apart — shown as "≈", never added to the counted macros above
 t.draft=all.filter(e=>e.pending&&sameDraftInputs(e)).reduce((a,e)=>({kcal:a.kcal+(+e.draft.kcal||0),p:a.p+(+e.draft.p||0),c:a.c+(+e.draft.c||0),f:a.f+(+e.draft.f||0),n:a.n+1}),{kcal:0,p:0,c:0,f:0,n:0});
 NUTRIENTS.forEach(nu=>{let sum=0,cnt=0;for(const e of log)if(typeof e[nu.k]=='number'){sum+=e[nu.k];cnt++;}t[nu.k]=sum;t[nu.k+'N']=cnt;});
 return t;
}
function rngTag(v,r,u){v=Math.round(v);if(v<r[0])return{cls:'under',s:(r[0]-v)+u+' under'};if(v>r[1])return{cls:'over',s:(v-r[1])+u+' over'};return{cls:'in',s:'on target'};}
function dayVerdict(t){
 if(!t.n)return "No meals logged for today yet — nothing to review.";
 const kcal=Math.round(t.kcal),p=Math.round(t.p),kl=DAY_TARGETS.kcal[0],kh=DAY_TARGETS.kcal[1],pl=DAY_TARGETS.p[0],ph=DAY_TARGETS.p[1];
 const bits=[];
 if(p<pl-5)bits.push("**"+(pl-p)+"g short on protein** — a shake would fix it");
 else if(p>ph)bits.push("protein above target");
 else bits.push("protein on point");
 if(kcal>kh+150)bits.push("**"+(kcal-kh)+" kcal over** — ease off tomorrow to keep the slow-bulk clean");
 else if(kcal<kl-200)bits.push((kl-kcal)+" kcal under — a bit light");
 else bits.push("calories in range");
 const good=p>=pl-5&&kcal>=kl-200&&kcal<=kh+150;
 const incomplete=t.pend?"**"+t.pend+" meal"+(t.pend==1?"":"s")+" still pending** — totals are incomplete until the auto-fill counts "+(t.pend==1?"it":"them")+". ":"";
 return incomplete+(good?"Solid day — ":"Heads up — ")+bits.join(", ")+".";
}
function renderDayReview(){
 const el=$("dayReview");if(!el)return;
 const date=todayKey();
 if(!localStorage.getItem('dj-day-confirmed-'+date)){el.innerHTML='';return;}
 const t=dayFoodTotals(date),sets=loadWorkoutLog().filter(e=>e.date===localDayKey()).length;
 const line=(lbl,val,r,u,col)=>{const tag=rngTag(val,r,u),c=tag.cls=='in'?'var(--gr)':tag.cls=='over'?'var(--or)':'var(--ye)';return `<div style="display:flex;justify-content:space-between;font-size:12px;padding:2px 0"><span style="color:var(--mu)">${lbl}</span><span><b style="color:${col}">${Math.round(val)}</b><span style="color:var(--dim)"> / ${r[0]}–${r[1]}${u}</span> · <span style="color:${c};font-weight:700">${tag.s}</span></span></div>`;};
 el.innerHTML=`<div class="card" style="border:1px solid var(--gr);background:#07160F;margin:0">
  <div style="font-weight:800;color:var(--gr);font-size:13px;margin-bottom:5px">✓ Day saved &amp; reviewed</div>
  <div class="small" style="margin-bottom:8px">${sets} set${sets==1?'':'s'} logged · ${t.n} meal${t.n==1?'':'s'} · CSV backups downloaded</div>
  ${line('Calories',t.kcal,DAY_TARGETS.kcal,'','var(--or)')}
  ${line('Protein',t.p,DAY_TARGETS.p,'g','var(--cy)')}
  ${line('Carbs',t.c,DAY_TARGETS.c,'g','var(--gr)')}
  ${line('Fat',t.f,DAY_TARGETS.f,'g','var(--pu)')}
  ${NUTRIENTS.filter(nu=>t[nu.k+'N']>0).map(nu=>line(nu.label,t[nu.k],nu.tgt,'g',nu.col)).join('')}
  <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--bd);font-size:12.5px;color:var(--tx);line-height:1.5">${dayVerdict(t).replace(/\*\*(.+?)\*\*/g,'<b style="color:var(--ye)">$1</b>')}</div>
 </div>`;
}
/* End Workout — exports the workout CSV + syncs to the Sheet. WORKOUT ONLY (meals have their
   own "Review meals" button on the Fuel tab); this button never touches the food log. */
function endDay(){
 const wLog=loadWorkoutLog(),btn=$("endWorkoutBtn");if(!btn)return;
 const orig=btn.textContent;
 if(!wLog.length){btn.textContent="No sets logged yet";setTimeout(()=>{btn.textContent=orig},2500);return}
 const todaysLog=wLog.filter(e=>e.date===localDayKey());
 const todaySets=todaysLog.length;
 const trainedDays=[...new Set(todaysLog.map(e=>e.day))]; // v89: the day tab(s) sets were logged under TODAY — clear THOSE notes, not whatever tab happens to be open
 exportWorkoutCSV();
 clearWorkoutNotes(trainedDays); // v87/v89: archive (CSV + dj-exlog-archive) then wipe the TRAINED day's note slots for a clean next session; runs before the async pushDeviceLogs so the cleared state snapshots
 btn.textContent="Exporting + syncing…";
 syncToSheet().then(res=>{
  let msg="✓ Workout saved — "+todaySets+" set"+(todaySets==1?"":"s")+" today";
  if(res.ok&&res.sentWorkout>0)msg+=" · "+res.sentWorkout+" synced to Sheet";
  else if(res.ok&&loadSheetUrl())msg+=" · Sheet up to date";
  else if(!res.ok&&res.reason=='no-url')msg+=" · CSV backup saved";
  else if(!res.ok)msg+=" · Sheet sync will retry";
  btn.textContent=msg;
  setTimeout(()=>{btn.textContent=orig},4200);
  pushDeviceLogs()})}
/* Review meals — Fuel tab. Exports the food CSV, marks the day confirmed, and shows the judged
   macro review. Kept entirely separate from the workout side. */
function endMeals(){
 const btn=$("endMealBtn");if(!btn)return;
 const orig=btn.textContent;
 const t=dayFoodTotals(todayKey());
 if(!t.n){btn.textContent="No meals logged today yet";setTimeout(()=>{btn.textContent=orig},2500);return}
 if(t.pend&&!confirm(t.pend+" meal"+(t.pend==1?" is":"s are")+" still pending (not counted yet). Save & review anyway?"))return;
 exportFoodCSV();
 localStorage.setItem('dj-day-confirmed-'+todayKey(),'1');
 renderDayReview();
 btn.textContent="✓ Meals saved & reviewed";
 setTimeout(()=>{btn.textContent=orig},3000);
 syncToSheet().then(()=>pushDeviceLogs())}

/* Per-exercise log — persisted per day+section+slot (weight/reps you actually did), localStorage only, this phone. */
function escHtml(s){return s.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}
function escAttr(s){return escHtml(String(s)).replace(/"/g,'&quot;')}
/* Inline edit forms (meal, weigh-in, bar base) parse numbers with this — never parseFloat(x)||0, which
   turned a typo into a 0 that then counted. Returns the number, or null for empty / not a plain decimal /
   outside [min, max); the caller keeps the old value and shows the error. */
function parseNumIn(raw,min,max){const s=String(raw==null?'':raw).trim();
 if(!/^-?(\d+(\.\d*)?|\.\d+)$/.test(s))return null;const v=Number(s);return isFinite(v)&&v>=min&&v<max?v:null}
function exLogKey(id){return 'dj-exlog-'+id}
function loadExLog(id){try{return JSON.parse(localStorage.getItem(exLogKey(id))||'[]')}catch(e){return[]}}
function exLogListHtml(id){
 const entries=loadExLog(id);
 return entries.length?entries.map((e,i)=>
  `<div class="logentry"><div style="flex:1"><div class="logdate">${e.d}</div><div class="logtxt">${escHtml(e.t)}</div></div><button class="del" onclick="delExLog('${id}',${i})">×</button></div>`
 ).join(""):`<div class="small" style="margin-top:2px">No entries yet.</div>`}
function renderExLog(id){const el=$("exlog-list-"+id);if(el)el.innerHTML=exLogListHtml(id)}
function saveExLog(id){
 const inp=$("exlog-in-"+id);if(!inp)return;
 const t=inp.value.trim();if(!t)return;
 const entries=loadExLog(id);
 entries.unshift({d:localDayKey(),t}); // local date — matches the app-wide day contract (rolls at local midnight; since v73 the food log does too)
 localStorage.setItem(exLogKey(id),JSON.stringify(entries));
 inp.value="";renderExLog(id);schedulePush()}
function delExLog(id,i){const entries=loadExLog(id);entries.splice(i,1);localStorage.setItem(exLogKey(id),JSON.stringify(entries));renderExLog(id);schedulePush()}
