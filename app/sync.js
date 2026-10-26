/* app/sync.js — the shared-log inbox merge (Claude → phone), server-synced ids, and the device push (phone → PC). */
/* Shared food-log inbox — Claude (running server-side, with disk access but no access to this
   phone's localStorage) drops new entries into shared-log.json. This merges them in, one-way,
   new entries only: editing/deleting always stays local via editFoodLogEntry/delFoodLogEntry.
   dj-shared-imported-ids is authoritative for dedup — a deleted entry never resurrects on re-sync.
   NOTE: this key deliberately does NOT start with "dj-foodlog-" — loadAllFoodLog() scans every
   key with that prefix as a per-day entry list, and a same-prefixed tracking key here previously
   got its content misparsed as food entries (real bug, caught by testing, fixed 2026-07-22). */
(function migrateImportedKey(){ // one-time: old key name would otherwise re-import everything as "new"
 const old=localStorage.getItem('dj-foodlog-imported');
 if(old!==null&&localStorage.getItem(IMPORTED_KEY)===null){
  localStorage.setItem(IMPORTED_KEY,old);
  localStorage.removeItem('dj-foodlog-imported')}})();
let lastSharedSync=0;
function syncSharedLog(){
 if(!serverHas('inbox'))return Promise.resolve();
 return fetch('shared-log.json',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(data=>{
  if(!data||!Array.isArray(data.entries))return;
  const t=applySharedEntries(data.entries);
  if(t.touchedToday)renderFoodLog();
  renderMealHistory();
  if(t.touchedWorkout)renderWorkoutStats()
  if(t.touchedCardio)renderCardio()
  if(t.touchedBW)renderBW()
 }).catch(()=>{})}
/* The merge itself — synchronous (v116 split out of syncSharedLog so the harness can drive it). */
function applySharedEntries(entries){
  let imported;try{imported=new Set(JSON.parse(localStorage.getItem(IMPORTED_KEY)||'[]'))}catch(e){imported=new Set()}
  let touchedToday=false,touchedWorkout=false,touchedCardio=false,touchedBW=false;
  for(const e of entries){
   if(!e||typeof e.id!='string'||imported.has(e.id))continue;
   if(e.type!==undefined&&!KNOWN_INBOX_TYPES.includes(e.type)){console.warn('shared-log: unknown type "'+e.type+'" skipped (not imported — a newer app version will apply it): '+e.id);continue} // v119: before this, an unknown type carrying n+macros fell through and became a duplicate MEAL
   if(typeof e.date!='string'||!/^\d{4}-\d{2}-\d{2}$/.test(e.date))continue;
   if(e.type=='workout'){ // Claude-reported sets (e.g. told in chat) merge into the real workout log
    if(typeof e.exercise!='string')continue;
    imported.add(e.id);
    const extra={};
    if(e.unit=='lb'||e.unit=='in')extra.unit=e.unit;
    if(typeof e.ld=='string'&&LOAD_TYPES[e.ld])extra.ld=e.ld;
    if(e.plates&&typeof e.plates=='object'&&typeof e.plates.base=='number'&&Array.isArray(e.plates.side)&&e.plates.side.every(n=>typeof n=='number'))extra.plates={base:e.plates.base,side:e.plates.side};
    const wlog=loadWorkoutLog();
    wlog.push({id:e.id,date:e.date,day:e.day||'',exercise:e.exercise,
     weight:typeof e.weight=='number'?e.weight:null,
     sets:typeof e.sets=='number'?e.sets:1,
     reps:typeof e.reps=='number'?e.reps:null,
     ...(typeof e.note=='string'&&e.note?{note:e.note}:{}),...extra,src:'c'});
    localStorage.setItem('dj-workout-log',JSON.stringify(wlog));
    touchedWorkout=true;continue}
   if(e.type=='workout-update'){ // correct an existing logged set in place, by entry id (weight/reps/unit/ld/note/plates)
    if(typeof e.target!='string'){imported.add(e.id);continue}
    const wlog=loadWorkoutLog();
    const idx=wlog.findIndex(x=>x&&x.id===e.target);
    if(idx<0){console.error('workout-update target not found yet — will retry next sync: '+e.target);continue} // don't mark imported: the set may arrive in a later sync
    imported.add(e.id);
    const tgt=wlog[idx];
    if(typeof e.exercise=='string')tgt.exercise=e.exercise;
    if(typeof e.weight=='number'&&isFinite(e.weight))tgt.weight=e.weight; else if(e.weight===null)tgt.weight=null;
    if(typeof e.reps=='number'&&isFinite(e.reps))tgt.reps=e.reps;
    if(typeof e.unit=='string')tgt.unit=e.unit;
    if(typeof e.ld=='string')tgt.ld=e.ld;
    if(typeof e.note=='string')tgt.note=e.note;
    if(e.plates&&typeof e.plates=='object'&&typeof e.plates.base=='number'&&Array.isArray(e.plates.side)&&e.plates.side.every(n=>typeof n=='number'))tgt.plates={base:e.plates.base,side:e.plates.side};
    localStorage.setItem('dj-workout-log',JSON.stringify(wlog));
    touchedWorkout=true;continue}
   if(e.type=='cardio'){ // stairmaster/sauna minutes reported by Claude
    imported.add(e.id);
    if(typeof e.activity!='string'||typeof e.min!='number'||!isFinite(e.min))continue;
    const clog=loadCardioLog();
    if(!clog.some(x=>x.id===e.id)){clog.push({id:e.id,date:e.date,activity:e.activity,min:e.min});localStorage.setItem('dj-cardio-log',JSON.stringify(clog));}
    touchedCardio=true;continue}
   if(e.type=='weigh'){ // Sunday fasted weigh-in reported by Claude (bodyweight log has no other Claude->phone path)
    imported.add(e.id);
    if(typeof e.w!='number'||!isFinite(e.w)||e.w<=0)continue;
    const blog=loadBW();
    if(!blog.some(x=>x.d===e.date)){blog.push({d:e.date,w:e.w});blog.sort((a,b)=>b.d.localeCompare(a.d));localStorage.setItem('dj-bw-log',JSON.stringify(blog));} // one weigh-in per day — dedup by date so a manual entry isn't doubled
    touchedBW=true;continue}
   if(e.type=='food-move'){ // v118: re-date a meal logged under the wrong food day (e.g. "this is yday" logged this morning). e.date = destination, e.from = where it sits now; the entry moves whole (id, photo, macros, pending)
    if(typeof e.target!='string'||typeof e.from!='string'||!/^\d{4}-\d{2}-\d{2}$/.test(e.from)||e.from===e.date){console.error('food-move malformed, ignored: '+e.id);imported.add(e.id);continue}
    const toLog=foodLogFor(e.date);
    if(toLog.some(x=>x&&x.id===e.target)){imported.add(e.id);continue} // already at the destination — idempotent
    const fromLog=foodLogFor(e.from),idx=fromLog.findIndex(x=>x&&x.id===e.target);
    if(idx<0){console.error('food-move target not found yet — will retry next sync: '+e.target);continue} // do NOT mark imported: the meal may arrive in a later sync
    if(fromLog[idx].photoQueued){console.warn('food-move waits for the photo upload: '+e.target);continue} // the queued photo is filed under the old date until /upload-food succeeds
    imported.add(e.id);
    toLog.push(fromLog.splice(idx,1)[0]);
    localStorage.setItem('dj-foodlog-'+e.from,JSON.stringify(fromLog));
    localStorage.setItem('dj-foodlog-'+e.date,JSON.stringify(toLog));
    if(e.from==todayKey()||e.date==todayKey())touchedToday=true;
    continue}
   if(e.type=='food-update'){ // patch an existing meal in place (macros/photo), no duplicate row
    if(typeof e.target!='string'){imported.add(e.id);continue}
    const fk='dj-foodlog-'+e.date;let flog;try{flog=JSON.parse(localStorage.getItem(fk)||'[]')}catch(err){flog=[]}
    const idx=flog.findIndex(x=>x&&x.id===e.target);
    if(idx<0){console.error('food-update target not found yet — will retry next sync: '+e.target);continue} // do NOT mark imported: the target meal may arrive in a later sync
    imported.add(e.id);
    const tgt=flog[idx];
    if(typeof e.n=='string')tgt.n=e.n;
    ['kcal','p','c','f',...NUTRIENTS.map(n=>n.k)].forEach(k=>{if(typeof e[k]=='number'&&isFinite(e[k]))tgt[k]=e[k]});
    if(typeof e.photo=='string'&&/^food-photos\/[A-Za-z0-9._-]+$/.test(e.photo))tgt.photo=e.photo;
    if(['kcal','p','c','f'].every(k=>typeof e[k]=='number'&&isFinite(e[k])))delete tgt.pending; // v116: a full estimate counts the meal; a name/photo-only update leaves it pending
    localStorage.setItem(fk,JSON.stringify(flog));
    if(e.date==todayKey())touchedToday=true;
    continue}
   if(typeof e.n!='string'||![e.kcal,e.p,e.c,e.f].every(n=>typeof n=='number'&&isFinite(n)))continue;
   imported.add(e.id);
   const key='dj-foodlog-'+e.date;
   let log;try{log=JSON.parse(localStorage.getItem(key)||'[]')}catch(err){log=[]}
   const fentry={id:e.id,n:e.n,kcal:e.kcal,p:e.p,c:e.c,f:e.f,...(typeof e.photo=='string'&&/^food-photos\/[A-Za-z0-9._-]+$/.test(e.photo)?{photo:e.photo}:{}),src:'c'};
   NUTRIENTS.map(n=>n.k).forEach(k=>{if(typeof e[k]=='number'&&isFinite(e[k]))fentry[k]=e[k]});
   log.push(fentry);
   localStorage.setItem(key,JSON.stringify(log));
   if(e.date==todayKey())touchedToday=true}
  localStorage.setItem(IMPORTED_KEY,JSON.stringify([...imported]));
  return {touchedToday,touchedWorkout,touchedCardio,touchedBW}}

/* server-synced.json — Claude's back-channel for "I already sent these ids to the Sheet
   server-side." Union-merged into the phone's synced sets (monotone, so re-merging is
   harmless) purely to keep End Day from re-uploading rows the Sheet would skip anyway;
   the Apps Script's own id-dedup (v3) is what actually guarantees no duplicate rows. */
function syncServerSyncedIds(){
 if(!serverHas('inbox'))return Promise.resolve();
 return fetch('server-synced.json',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(data=>{
  if(!data)return;
  if(Array.isArray(data.workoutIds)&&data.workoutIds.length){
   const s=loadSyncedIds();data.workoutIds.forEach(id=>s.add(id));
   localStorage.setItem('dj-workout-log-synced',JSON.stringify([...s]))}
  if(Array.isArray(data.foodIds)&&data.foodIds.length){
   const s=loadFoodSyncedIds();data.foodIds.forEach(id=>s.add(id));
   localStorage.setItem('dj-food-synced-ids',JSON.stringify([...s]))}
 }).catch(()=>{})}

/* Device push — the reverse of the shared-log inbox: the phone snapshots every dj-* localStorage
   key (plus session state: checkmarks, day/section, Tuesday mode) and POSTs it to /push-logs on
   this app's own server, which writes it to device-logs.json on disk where Claude can read it.
   That's what lets Claude answer "what's checked off?" / run exports without a manual End Day.
   Fails silent offline like everything else here. Checkmarks are a snapshot as-of pushedAt;
   they now also persist per-day in dj-done-<localDayKey> (this push is just the live mirror). */
let pushTO=null,pushSeq=+(localStorage.getItem('dj-push-seq')||0);
function gatherDeviceLogs(){
 const ls={};
 for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);
  if(k&&k.startsWith('dj-'))ls[k]=localStorage.getItem(k)}
 return {v:1,pushedAt:new Date().toISOString(),seq:pushSeq+1,day,sec,phase,tueMode,done:{...done},ls}}
/* The server refuses a snapshot older than the one it holds (409 {state:'stale-seq', seq}) — this phone's
   counter fell behind (cleared site data, another device). Adopt max(stored, own) so the retry sends the
   next number, and retry once. */
function pushDeviceLogs(retried){ // resolves true/false (v116: Count now must know the PC really has the latest log)
 if(!serverHas('push'))return Promise.resolve(false);
 clearTimeout(pushTO);pushTO=null;
 return fetch('push-logs',{method:'POST',headers:{'Content-Type':'application/json',...CLIENT_HEADERS},body:JSON.stringify(gatherDeviceLogs())})
  .then(r=>{
   if(r.status===409&&!retried)return r.json().then(d=>{
    if(!(d&&d.state==='stale-seq'&&Number.isInteger(d.seq)&&d.seq>=0))return false;
    pushSeq=Math.max(d.seq,pushSeq);localStorage.setItem('dj-push-seq',String(pushSeq));
    return pushDeviceLogs(true)},()=>false);
   if(!r.ok)return false;pushSeq++;localStorage.setItem('dj-push-seq',String(pushSeq));
   localStorage.setItem('dj-push-last',new Date().toISOString());renderSyncStatus();return true}) // freshness monitor for the phone→PC half
  .catch(()=>false)}
function schedulePush(){clearTimeout(pushTO);pushTO=setTimeout(()=>pushDeviceLogs(),4000)}
