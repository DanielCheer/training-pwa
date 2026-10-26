/* app/main.js — startup: profile cards, Why/Fuel/Home renders, foreground sync, timeline, rest timer, foreground re-resolve, service-worker registration. Loads last. */
/* Profile cards — the owner's personal Home/Fuel/Log content comes from PROFILE (data/profile.js),
   so the engine and the markup carry no personal data. Runs before every other render: the goal
   card holds the .js-season span filled just below. */
const FLAG_STY={lo:'background:#132B3C;color:#7BB8D4',ok:'background:#0A2A1A;color:var(--gr)',hi:'background:#2A1408;color:var(--or)'};
function renderProfileCards(){
 const P=PROFILE,set=(id,h)=>{const el=$(id);if(el)el.innerHTML=h};
 document.title=P.title;
 const meta=document.querySelector('meta[name="apple-mobile-web-app-title"]');if(meta)meta.setAttribute('content',P.shortName);
 set("heroEyebrow",P.eyebrow);set("heroTitle",P.title);
 set("goalCard",`<div class="stitle" style="color:var(--or)">${P.goal.title}</div>`+
  P.goal.bars.map(b=>`<div class="sb"><div class="sbt"><span style="color:var(--mu)">${b.label}</span><span><b style="color:${b.col}">${b.val}</b><span style="color:var(--mu)">${b.rest}</span></span></div><div class="sbg"><div class="sbf" style="width:${b.pct}%;background:${b.col}"></div></div></div>`).join('')+
  `<div class="small">${P.goal.note}</div>`);
 set("scanCard",`<div class="stitle" style="color:var(--cy)">Starting Stats — Scan ${P.scan.date}</div><div class="grid2">`+
  P.scan.rows.map(([l,v,f])=>`<div class="mini"><div class="l">${l}</div><div class="v">${v}${f?` <span class="flag" style="${FLAG_STY[f[1]]}">${f[0]}</span>`:''}</div></div>`).join('')+
  `</div><div class="small" style="margin-top:9px">${P.scan.note}</div>`);
 set("mealTiming",P.mealTiming);set("aptTitle",P.aptTitle);
 const S=P.sampleDay;
 set("sampleDayCard",`<div class="stitle" style="color:var(--or)">${S.title}</div><div class="small" style="margin-bottom:10px">${S.intro}</div><div style="display:flex;flex-direction:column;gap:7px">`+
  S.items.map(i=>`<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:9px 12px;background:var(--card2);border-radius:9px"><div><b style="font-size:13px">${i.n}</b><div class="small" style="margin-top:1px">${i.d}</div></div><div style="text-align:right;font-size:11.5px;color:var(--mu);white-space:nowrap">${i.kcal} kcal<br>${i.p}g P</div></div>`).join('')+
  `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 12px;background:#1A0F05;border:1px solid #6B2A12;border-radius:9px"><b style="font-size:13px;color:var(--or)">Total</b><div style="text-align:right;font-size:12.5px;font-weight:800;color:var(--or)">${S.total}</div></div></div><div class="small" style="margin-top:9px">${S.note}</div>`);
 const K=P.shakes;
 set("shakesCard",`<div class="stitle" style="color:var(--gr)">${K.title}</div>`+K.paras.map(t=>`<div class="small" style="margin-bottom:8px">${t}</div>`).join('')+(K.warn?`<div class="why" style="border-color:var(--rd)">${K.warn}</div>`:''));
 const mt=$("mealText");if(mt)mt.placeholder=P.mealPlaceholder;
 const tz=$("tzLabel");if(tz)tz.textContent=P.tz}
renderProfileCards();

/* WHY + FUEL render */
$("whycontent").innerHTML=whyList().map(w=>`<div class="card"><div class="stitle" style="color:${w.c}">${w.t}</div><div style="font-size:12px;line-height:1.65;color:#CFE2DC">${w.b}</div></div>`).join("");
$("stack").innerHTML=STACK.map((s,i)=>`<div style="display:flex;gap:10px;padding:8px 0;${i<STACK.length-1?'border-bottom:1px solid var(--bd)':''}"><span>${s[0]}</span><div><div style="font-size:12px;font-weight:700">${s[1]}</div><div class="small" style="margin-top:1px">${s[2]}</div></div></div>`).join("");
$("apt").innerHTML=APT.map(a=>`<div style="margin-bottom:10px"><div style="font-size:11px;font-weight:800;color:var(--gr)">${a[0]}</div><div style="font-size:11px;color:#D1FAE5;line-height:1.55;margin-top:2px">${a[1]}</div></div>`).join("");
renderFuelTargets();
$("nutFoot").innerHTML=`Macros + ${NUTRIENTS.map(n=>n.label.toLowerCase()).join(' / ')} (Claude fills those ${NUTRIENTS.length} — you only ever set calories &amp; protein/carb/fat). No vitamins/minerals: this is a hand-built local food list, not a full database.`;
document.querySelectorAll('.js-season').forEach(el=>el.textContent=SEASON_STR);

/* Home week cards — consult dayObj so an active override week shows the swapped focus + a ✈ tag */
function renderWk(){$("wk").innerHTML=DAYS.map(b=>{const d=dayObj(b.k);
 return `<div class="li" style="align-items:center"><b style="color:var(--or);font-size:11px;min-width:34px">${d.l}</b><div style="flex:1"><div style="font-size:12.5px;font-weight:700">${d.focus}${d._ov?' <span style="color:var(--ye)">· ✈ this wk</span>':''}</div><div class="small">${d.time}${d.secs.power.length?" · ⚡ power first":""}</div></div></div>`}).join("")}
renderWk();
renderBW();
renderWorkoutStats();
renderSheetUrl();
renderFoodPicker();renderFoodLog();renderMealHistory();renderDayReview();renderCardio();
{const el=$("rollHourTxt");if(el)el.textContent=fmtHour(FOOD_DAY_ROLL_HOUR)}
if(HAS_SERVER){
 /* foreground sync: Claude's inbox in, queued meal photos up, then the snapshot out (so the PC
    sees the uploaded photo paths), plus the auto-fill status for the strip */
 const fgSync=()=>{syncServerSyncedIds().then(()=>syncSharedLog()).then(()=>flushPhotoQueue()).then(()=>pushDeviceLogs());
  fetchAutofillState().then(()=>renderFoodLog());
  fetchDraftState().then(s=>{if(s)applyDrafts(s);renderFoodLog();renderMealHistory();awaitDrafts()})};
 fgSync();lastSharedSync=Date.now();
 window.addEventListener('online',()=>{flushPhotoQueue()});
 document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible'&&Date.now()-lastSharedSync>60000){
   lastSharedSync=Date.now();
   fgSync()}
  else if(document.visibilityState==='hidden'&&pushTO!==null){
   /* app being backgrounded with a debounced push still pending — flush it now via
      sendBeacon (survives the page being suspended, unlike a fetch we'd never finish) */
   clearTimeout(pushTO);pushTO=null;
   if(navigator.sendBeacon)navigator.sendBeacon('push-logs',new Blob([JSON.stringify(gatherDeviceLogs())],{type:'application/json'}))}})}

/* Timeline render — weeks colored by phase (PHASES[i].bd), current week outlined; plus the
   phase-axis labels, hero date line and countdown. All derived; wkNow/phase/Monday-rotation
   were already computed in the state block up top. */
(function(){let h="",w=0;const nowW=tlWeek();PHW.forEach((n,pi)=>{for(let i=0;i<n;i++){h+=`<div class="tlw ${w==nowW?'now':''}" style="background:${PHASES[pi]?PHASES[pi].bd:'var(--dim)'}"></div>`;w++}});$("tl").innerHTML=h;
 $("tlx").innerHTML=PHASES.map((p,i)=>`<span style="flex:${PHW[i]||1};text-align:center">${p.n.replace(' · ',' ')}</span>`).join('');
 $("heroDates").textContent=fmtMD(START)+" → "+fmtMD(SEASON)+", "+SEASON.getFullYear()+" · "+TOTAL_WEEKS+"-week block";
 const dl=Math.max(0,Math.ceil((SEASON-new Date())/864e5));$("cd").textContent=dl+" days to tip-off";})();

/* Rest timer — timestamp-based (not tick-decrement) so it self-corrects after any
   throttling/backgrounding, plus a scheduled Notification as a best-effort background alert.
   iOS fully suspends JS in a backgrounded/closed PWA — there's no way to GUARANTEE the
   notification fires without a push server. This covers the realistic case (screen stays
   on, you switch apps for a minute) and always self-corrects the instant you reopen. */
let tEnd=0,tInt=null,notifyTO=null;
/* Audible rest-timer cue — iOS Safari/PWA supports neither Notification nor navigator.vibrate, so
   the timer was silent on the one device it runs on. A short WebAudio beep works whenever the app
   is foreground with the screen on (the realistic gym case). AudioContext is unlocked on the start
   tap (the required user gesture); the Notification/vibrate below stay as no-op fallbacks. */
let _actx=null;
function unlockAudio(){try{_actx=_actx||new (window.AudioContext||window.webkitAudioContext)();if(_actx.state==='suspended')_actx.resume()}catch(e){}}
function beep(){try{if(!_actx)return;const o=_actx.createOscillator(),g=_actx.createGain();o.type='sine';o.frequency.value=880;o.connect(g);g.connect(_actx.destination);const t=_actx.currentTime;g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(0.35,t+0.02);g.gain.exponentialRampToValueAtTime(0.0001,t+0.5);o.start(t);o.stop(t+0.55)}catch(e){}}
function reqNotifPerm(){if('Notification' in window && Notification.permission==='default')Notification.requestPermission()}
function scheduleNotify(){
 clearTimeout(notifyTO);
 notifyTO=setTimeout(()=>{
  if('Notification' in window && Notification.permission==='granted'){
   try{new Notification('Rest over',{body:'Back to work.',tag:'dj-rest',icon:'icons/icon-192.png'})}catch(e){}}
  if(navigator.vibrate)navigator.vibrate([200,100,200]);
 },Math.max(0,tEnd-Date.now()))}
function tickTimer(){
 const b=$("tmr"),left=Math.ceil((tEnd-Date.now())/1000);
 if(left<=0){clearInterval(tInt);tInt=null;tEnd=0;localStorage.removeItem('dj-timer-end');
  b.classList.remove("run");b.textContent="⏱ GO";setTimeout(()=>{if(!tInt)b.textContent="⏱ "+TDUR+"s"},2500);
  beep();if(navigator.vibrate)navigator.vibrate([200,100,200]);return}
 b.textContent="⏱ "+left}
function timer(){const b=$("tmr");
 if(tInt||tEnd){clearInterval(tInt);tInt=null;tEnd=0;clearTimeout(notifyTO);
  localStorage.removeItem('dj-timer-end');b.classList.remove("run");b.textContent="⏱ "+TDUR+"s";return}
 reqNotifPerm();unlockAudio();
 tEnd=Date.now()+TDUR*1000;localStorage.setItem('dj-timer-end',tEnd);
 b.classList.add("run");scheduleNotify();tickTimer();
 tInt=setInterval(tickTimer,250)}
document.addEventListener('visibilitychange',()=>{
 if(document.visibilityState==='visible'&&tEnd){tickTimer();if(!tInt&&Date.now()<tEnd)tInt=setInterval(tickTimer,250)}});
(function(){ // survive a reload/relaunch while a rest period was still running
 const saved=+localStorage.getItem('dj-timer-end');
 if(saved>Date.now()){tEnd=saved;$("tmr").classList.add("run");tickTimer();tInt=setInterval(tickTimer,250);scheduleNotify()}
 else{if(saved)localStorage.removeItem('dj-timer-end');$("tmr").textContent="⏱ "+TDUR+"s"}})();

renderPhaseRow();renderDayRow();renderDay();

/* Re-resolve on foreground: (a) dayRoll() clears yesterday's checks + re-resolves week/phase/
   rotation if the local date changed while the app stayed open; (b) a week-override window that
   started/ended. Re-render only when something actually changed, so a normal foreground can't
   wipe unsaved note-textarea text mid-session. */
let ovSig=(activeOverride()||{}).from||'';
document.addEventListener('visibilitychange',()=>{
 if(document.visibilityState!=='visible')return;
 const rolled=dayRoll();
 const s=(activeOverride()||{}).from||'';
 if(rolled||s!==ovSig){ovSig=s;renderPhaseRow();renderWk();renderDayRow();renderDay();
  renderFoodLog();renderMealHistory();renderDayReview();renderCardio()}
 const fd=todayKey(); // v116: the food day rolls at FOOD_DAY_ROLL_HOUR, not midnight — re-render the food cards on THAT boundary too
 if(fd!==foodDaySig){foodDaySig=fd;renderFoodLog();renderMealHistory();renderDayReview()}});
let foodDaySig=todayKey();

/* Offline shell. Only registers over http(s) — file:// silently skips.
   Updates land in ONE launch: sw.js skips waiting + claims, so a new VERSION takes over this page and
   fires `controllerchange`. Right after launch (nothing typed yet) the page just reloads onto the new
   shell; later, or with unsaved text in any field, it offers a reload instead of throwing that text
   away. The very first install also fires controllerchange (no controller → one) — not an update. */
const BOOT_AT=Date.now(),SW_AUTO_RELOAD_MS=5000;
function hasUnsavedText(){ // a field whose value differs from what it was rendered with = typed, not saved
 return [...document.querySelectorAll('textarea,input')].some(el=>!['file','hidden','checkbox','radio','button','submit'].includes(el.type)&&el.value!==el.defaultValue)}
function showUpdateToast(){
 if($("swToast"))return;
 const t=document.createElement('div');t.id='swToast';t.className='toast';t.setAttribute('role','status');
 t.innerHTML='<span>New version ready</span><button type="button" onclick="location.reload()">Reload</button>';
 document.body.appendChild(t)}
if('serviceWorker' in navigator && location.protocol.startsWith('http')){
 const hadController=!!navigator.serviceWorker.controller;let reloading=false;
 navigator.serviceWorker.addEventListener('controllerchange',()=>{
  if(!hadController||reloading)return;
  if(Date.now()-BOOT_AT<SW_AUTO_RELOAD_MS&&!hasUnsavedText()){reloading=true;location.reload()}
  else showUpdateToast()});
 window.addEventListener('load',()=>{navigator.serviceWorker.register('sw.js').then(reg=>{
  // a PWA resumed from the background isn't a navigation, so the browser won't look for a new sw.js by itself
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')reg.update().catch(()=>{})})}).catch(()=>{})});
}
