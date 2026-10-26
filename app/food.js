/* app/food.js — bodyweight + cardio logs, the food picker and food log, meal capture (pending meals, photos queued in IndexedDB), local drafts, the auto-fill status strip, Meal History and the food CSV. */
/* Weekly bodyweight log — Home tab, Sunday-morning weigh-ins, localStorage only, this phone. */
function loadBW(){try{return JSON.parse(localStorage.getItem('dj-bw-log')||'[]')}catch(e){return[]}}
function saveBW(){
 const inp=$("bwIn"),v=parseFloat(inp.value);if(!v||v<=0)return;
 const d=localDayKey(),entries=loadBW(); // local date + dedup: one weigh-in per day, so a re-weigh (or a Claude-pushed entry) isn't doubled
 const ex=entries.find(e=>e.d===d);
 if(ex)ex.w=v;else entries.push({d,w:v});
 entries.sort((a,b)=>b.d.localeCompare(a.d));
 localStorage.setItem('dj-bw-log',JSON.stringify(entries));
 inp.value="";renderBW();schedulePush()}
function delBW(i){const entries=loadBW();entries.splice(i,1);localStorage.setItem('dj-bw-log',JSON.stringify(entries));renderBW();schedulePush()}
function editBW(i){
 const entries=loadBW(),cur=entries[i];if(!cur)return;
 const nd=prompt("Edit date (YYYY-MM-DD):",cur.d);
 if(!nd||nd===cur.d)return;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(nd)){alert("Use YYYY-MM-DD format.");return}
 cur.d=nd;
 entries.sort((a,b)=>b.d.localeCompare(a.d));
 localStorage.setItem('dj-bw-log',JSON.stringify(entries));
 renderBW();schedulePush()}
function renderBW(){
 const el=$("bwList");if(!el)return;
 const entries=loadBW();
 el.innerHTML=entries.length?entries.map((e,i)=>{
  const prev=entries[i+1],delta=prev?+(e.w-prev.w).toFixed(1):null;
  const dtxt=delta==null?"":(delta>=0?`+${delta}`:delta);
  const dcol=delta==null?"var(--mu)":delta<0?"#7BB8D4":delta>0.75?"var(--or)":"var(--gr)";
  return `<div class="logentry"><div style="flex:1"><div class="logdate" style="cursor:pointer;text-decoration:underline dotted;text-underline-offset:3px" onclick="editBW(${i})">${e.d}</div><div class="logtxt"><b style="font-size:16px">${e.w}</b> lb${delta!=null?` <span style="color:${dcol};font-weight:700;font-size:12.5px">${dtxt} lb</span>`:""}</div></div><button class="del" onclick="delBW(${i})">×</button></div>`
 }).join(""):`<div class="small" style="margin-top:2px">No weigh-ins yet — log Sunday morning's number here.</div>`}

/* Cardio & sauna log — stairmaster/bike/sauna minutes, localStorage only, this phone.
   Uses localDayKey (done in-session with the workout), rides device-logs via the dj- prefix. */
function loadCardioLog(){try{return JSON.parse(localStorage.getItem('dj-cardio-log')||'[]')}catch(e){return[]}}
function addCardio(activity){
 const inp=$("cardioMin"),min=parseInt(inp?inp.value:0);
 if(!min||min<=0){if(inp)inp.focus();return}
 const log=loadCardioLog();
 log.push({id:'cd-'+Date.now()+'-'+Math.random().toString(36).slice(2,7),date:localDayKey(),activity,min});
 localStorage.setItem('dj-cardio-log',JSON.stringify(log));
 if(inp)inp.value='';
 renderCardio();schedulePush()}
function delCardio(id){localStorage.setItem('dj-cardio-log',JSON.stringify(loadCardioLog().filter(e=>e.id!==id)));renderCardio();schedulePush()}
function renderCardio(){
 const el=$("cardioList");if(!el)return;
 const log=loadCardioLog();
 if(!log.length){el.innerHTML='<div class="small" style="margin-top:6px">Nothing logged yet.</div>';return}
 const byDate={};for(const e of log)(byDate[e.date]=byDate[e.date]||[]).push(e);
 const dates=Object.keys(byDate).sort((a,b)=>b.localeCompare(a));
 el.innerHTML=dates.map(d=>`<div style="margin-top:9px"><div class="logdate">${fmtHistDate(d)} <span style="color:var(--dim);font-weight:600">${d}</span></div>${byDate[d].map(e=>`<div class="logentry" style="padding:5px 10px"><span style="flex:1" class="small"><b style="color:var(--tx)">${escHtml(e.activity)}</b> · ${e.min} min</span><button class="del" onclick="delCardio('${e.id}')">×</button></div>`).join('')}</div>`).join('');
}

function loadFoodLog(){try{return JSON.parse(localStorage.getItem('dj-foodlog-'+todayKey())||'[]')}catch(e){return[]}}
function loadCustomFoods(){try{return JSON.parse(localStorage.getItem('dj-customfoods')||'[]')}catch(e){return[]}}
function allFoods(){return FOODS.concat(loadCustomFoods())}
const r1=rnd1; // dedup: identical rounding to rnd1() — aliased to avoid churning the food-log call sites
function addFood(idx){
 const inp=$("fq"+idx),qty=parseFloat(inp?inp.value:1)||1;
 const f=allFoods()[idx];if(!f)return;
 const log=loadFoodLog();
 const entry={id:newFoodId(),at:new Date().toISOString(),n:f[0]+(qty!=1?" ×"+qty:""),kcal:r1(f[1]*qty),p:r1(f[2]*qty),c:r1(f[3]*qty),f:r1(f[4]*qty)};
 NUTRIENTS.forEach(nu=>{if(typeof f[nu.ti]=='number')entry[nu.k]=r1(f[nu.ti]*qty)});
 log.push(entry);
 localStorage.setItem('dj-foodlog-'+todayKey(),JSON.stringify(log));
 renderFoodLog();schedulePush()}
function newFoodId(){return 'f-'+Date.now()+'-'+Math.random().toString(36).slice(2,8)}
function delFoodLogEntry(i){const log=loadFoodLog(),e=log[i];if(!e)return;if(e.photoQueued)photoQueueDel(e.id);log.splice(i,1);localStorage.setItem('dj-foodlog-'+todayKey(),JSON.stringify(log));renderFoodLog();schedulePush()}
function editFoodLogEntry(i){
 const log=loadFoodLog(),e=log[i];if(!e)return;
 const n=prompt("Name:",e.n);if(n==null)return;
 if(e.pending&&!confirm("This meal is waiting for the auto-fill estimate.\n\nOK = type the macros yourself\nCancel = just keep the new name (auto-fill will use it)")){
  e.n=n;localStorage.setItem('dj-foodlog-'+todayKey(),JSON.stringify(log));renderFoodLog();schedulePush();return}
 const kcal=prompt("Calories:",e.kcal);if(kcal==null)return;
 const p=prompt("Protein (g):",e.p);if(p==null)return;
 const c=prompt("Carbs (g):",e.c);if(c==null)return;
 const f=prompt("Fat (g):",e.f);if(f==null)return;
 e.n=n;e.kcal=parseFloat(kcal)||0;e.p=parseFloat(p)||0;e.c=parseFloat(c)||0;e.f=parseFloat(f)||0;
 delete e.pending; // macros typed by hand → counted now; the autofill skips it (no longer pending)
 localStorage.setItem('dj-foodlog-'+todayKey(),JSON.stringify(log));
 renderFoodLog();schedulePush()}
function addCustomFood(){
 const n=$("cfName").value.trim(),kcal=parseFloat($("cfKcal").value);
 const p=parseFloat($("cfP").value)||0,c=parseFloat($("cfC").value)||0,f=parseFloat($("cfF").value)||0;
 if(!n||!kcal)return;
 const cf=loadCustomFoods();cf.push([n,kcal,p,c,f]);
 localStorage.setItem('dj-customfoods',JSON.stringify(cf));
 $("cfName").value="";$("cfKcal").value="";$("cfP").value="";$("cfC").value="";$("cfF").value="";
 renderFoodPicker();schedulePush()}
function renderFoodPicker(){
 const el=$("foodPicker");if(!el)return;
 el.innerHTML=allFoods().map((f,i)=>
  `<div class="logentry" style="align-items:center">
    <div style="flex:1"><div class="logtxt" style="font-weight:700;font-size:13.5px">${escHtml(f[0])}</div><div class="small">${f[1]} kcal · ${f[2]}p ${f[3]}c ${f[4]}f</div></div>
    <input type="number" id="fq${i}" value="1" step="0.5" style="width:44px;background:var(--card2);border:1px solid var(--bd);border-radius:6px;padding:6px 2px;color:var(--tx);text-align:center;margin-right:6px;font-size:13px">
    <button onclick="addFood(${i})" style="background:var(--gr);color:#00110F;font-weight:800;border-radius:6px;padding:7px 12px;font-size:12px;white-space:nowrap">Add</button>
   </div>`
 ).join("")}
function renderFoodLog(){
 const totEl=$("logTotals"),listEl=$("logList");if(!totEl||!listEl)return;
 const log=loadFoodLog();
 const tot=dayFoodTotals(todayKey()),T=DAY_TARGETS;
 const bar=(val,hi,col)=>`<div class="sbg"><div class="sbf" style="width:${Math.min(100,Math.round(val/hi*100))}%;background:${col}"></div></div>`;
 const nutRow=NUTRIENTS.map(nu=>{
  const has=tot[nu.k+'N']>0,v=Math.round(tot[nu.k]),tgt=nu.kind=='ceil'?'≤'+nu.tgt[1]:nu.tgt[0]+'–'+nu.tgt[1];
  let col=!has?'var(--dim)':(nu.kind=='ceil'&&v>nu.tgt[1])||(nu.kind=='floor'&&v<nu.tgt[0])?'var(--ye)':'var(--tx)';
  return `<span>${nu.label} <b style="color:${col}">${has?v+'g':'—'}</b><span style="color:var(--dim)"> /${tgt}</span></span>`;
 }).join('');
 totEl.innerHTML=`
  <div class="sb"><div class="sbt"><span style="color:var(--mu)">Calories</span><span><b style="color:var(--or)">${Math.round(tot.kcal)}</b><span style="color:var(--mu)"> / ${T.kcal[0]}–${T.kcal[1]}</span></span></div>${bar(tot.kcal,T.kcal[1],"var(--or)")}</div>
  <div class="sb"><div class="sbt"><span style="color:var(--mu)">Protein</span><span><b style="color:var(--cy)">${Math.round(tot.p)}g</b><span style="color:var(--mu)"> / ${T.p[0]}–${T.p[1]}g</span></span></div>${bar(tot.p,T.p[1],"var(--cy)")}</div>
  <div class="sb"><div class="sbt"><span style="color:var(--mu)">Carbs</span><span><b style="color:var(--gr)">${Math.round(tot.c)}g</b><span style="color:var(--mu)"> / ${T.c[0]}–${T.c[1]}g</span></span></div>${bar(tot.c,T.c[1],"var(--gr)")}</div>
  <div class="sb"><div class="sbt"><span style="color:var(--mu)">Fat</span><span><b style="color:var(--pu)">${Math.round(tot.f)}g</b><span style="color:var(--mu)"> / ${T.f[0]}–${T.f[1]}g</span></span></div>${bar(tot.f,T.f[1],"var(--pu)")}</div>
  <div class="small" style="display:flex;flex-wrap:wrap;gap:2px 14px;margin-top:9px;padding-top:8px;border-top:1px solid var(--bd);color:var(--mu)">${nutRow}</div>
  ${tot.pend?`<div class="small" style="margin-top:8px;color:var(--ye);font-weight:700">⏳ ${tot.pend} meal${tot.pend==1?'':'s'} pending — not counted above yet</div>`:''}
  ${tot.draft.n?`<div class="small" style="margin-top:3px;color:var(--mu)">≈${Math.round(tot.draft.kcal)} kcal · ≈${Math.round(tot.draft.p)}g protein in ${tot.draft.n} draft${tot.draft.n==1?'':'s'} — not counted; tonight's count replaces ${tot.draft.n==1?'it':'them'}</div>`:''}`;
 const title=$("loggedTitle");
 if(title)title.textContent=todayKey()===localDayKey()?"Logged Today":"Logged Today · still "+fmtHistDate(todayKey())+" until "+fmtHour(FOOD_DAY_ROLL_HOUR);
 const skipped=autofillSkipReasons(),dskip=draftSkipFor(loadDraftState());
 listEl.innerHTML=log.length?log.map((e,i)=>{
  const tstyle='width:42px;height:42px;border-radius:8px;object-fit:cover;margin-right:9px;flex:none;cursor:pointer';
  const thumb=e.photo
   ?`<img src="${e.photo}" onerror="this.style.display='none'" onclick="event.stopPropagation();playImg('${e.photo}')" style="${tstyle}">`
   :e.photoQueued
   ?`<img data-qid="${e.id}" alt="⏳" style="${tstyle};background:var(--card2);border:1px dashed var(--ye)">`
   :`<button onclick="event.stopPropagation();pickFoodPhoto('${e.id}')" title="Add a photo" style="width:42px;height:42px;border-radius:8px;background:var(--card2);border:1px solid var(--bd);color:var(--mu);font-size:17px;margin-right:9px;flex:none;padding:0">📷</button>`;
  const ds=e.pending&&!sameDraftInputs(e)?dskip(e):null;
  const draftTxt=!e.pending?'':sameDraftInputs(e)
   ?` · <b style="color:var(--tx)">≈${Math.round(e.draft.kcal)} kcal</b> · ${Math.round(e.draft.p)}P ${Math.round(e.draft.c)}C ${Math.round(e.draft.f)}F <span style="color:var(--mu)">draft</span>`
   :ds?` · <span style="color:var(--mu)">draft: ${escHtml(ds.reason)}</span>`
   :e.photoQueued&&!e.photo?'':' · <span style="color:var(--mu)">drafting…</span>';
  const sub=e.pending
   ?`<div class="small" style="color:var(--ye)">⏳ pending${draftTxt} — counted by the nightly auto-fill or “Count now”${e.photoQueued?' · photo waiting to upload':''}${skipped[e.id]?`<br><span style="color:var(--or)">last run skipped it: ${escHtml(skipped[e.id])}</span>`:''}</div>`
   :`<div class="small">${e.kcal} kcal · ${e.p}g P · ${e.c}g C · ${e.f}g F${e.draft&&isFinite(e.draft.kcal)?` <span style="color:var(--dim)">· draft was ≈${Math.round(e.draft.kcal)}</span>`:''}</div>`;
  return `<div class="logentry" style="align-items:center">${thumb}<div style="flex:1;cursor:pointer" onclick="editFoodLogEntry(${i})"><div class="logtxt" style="font-weight:700;text-decoration:underline dotted;text-underline-offset:3px">${escHtml(e.n||'Photo meal')}${e.src=='c'?' <span class="flag" style="background:#07201D;color:var(--cy)">C</span>':''}</div>${sub}</div><button class="del" onclick="delFoodLogEntry(${i})">×</button></div>`;
 }).join(""):`<div class="small">Nothing logged yet today.</div>`;
 hydrateQueuedThumbs(listEl);
 renderSyncStatus()}

/* Meal history — every day you've logged, newest first, each day collapsible with its
   daily total. Reuses loadAllFoodLog() (the same all-days scan the CSV export uses).
   Today's meals live in the "Logged Today" card above, so they're excluded here. */
function fmtHistDate(d){try{return new Date(d+'T12:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})}catch(e){return d}}
function renderMealHistory(){
 const el=$("mealHistory");if(!el)return;
 const today=todayKey(),byDate={};
 for(const e of loadAllFoodLog()){if(e.date===today)continue;(byDate[e.date]=byDate[e.date]||[]).push(e)}
 const dates=Object.keys(byDate).sort((a,b)=>b.localeCompare(a));
 if(!dates.length){el.innerHTML='<div class="small">No earlier days logged yet — today\'s meals are in the card above.</div>';return}
 el.innerHTML=dates.map(d=>{
  const items=byDate[d];
  const t=dayFoodTotals(d); // same pending-excluding sum as the Logged Today card
  const rows=items.map(e=>`<div class="small" style="display:flex;justify-content:space-between;gap:10px;padding:4px 0;border-top:1px solid var(--bd)"><span style="flex:1">${e.photo||e.photoQueued?'📷 ':''}${escHtml(e.n||'Photo meal')}</span><span style="color:${e.pending?'var(--ye)':'var(--mu)'};white-space:nowrap">${e.pending?(sameDraftInputs(e)?`⏳ ≈${Math.round(e.draft.kcal)} draft`:'⏳ pending'):`${Math.round(e.kcal)} · ${Math.round(e.p)}P ${Math.round(e.c)}C ${Math.round(e.f)}F`}</span></div>`).join('');
  return `<details style="margin-bottom:8px;border:1px solid var(--bd);border-radius:10px;padding:9px 11px;background:var(--card2)"><summary style="cursor:pointer;font-weight:700;font-size:13.5px;display:flex;justify-content:space-between;align-items:center;gap:8px;list-style:none"><span>${fmtHistDate(d)} <span style="color:var(--mu);font-weight:600;font-size:11px">${d}</span></span><span style="font-size:12px;color:var(--or);font-weight:800;white-space:nowrap">${localStorage.getItem('dj-day-confirmed-'+d)?'<span style="color:var(--gr)">✓ </span>':''}${Math.round(t.kcal)} kcal · ${Math.round(t.p)}g P${t.pend?` <span style="color:var(--ye)">(${t.pend} pending${t.draft.n?' · ≈'+Math.round(t.draft.kcal)+' draft':''})</span>`:''}</span></summary><div style="margin-top:6px">${rows}</div></details>`;
 }).join('');
}
/* Meal log (v116) — capture now, count once a day. "Log a Meal" saves a PENDING entry
   ({pending:true, at, kcal/p/c/f:0}) the moment DJ taps — text, photo, or both, online or not.
   autofill-food.py (nightly after FOOD_DAY_ROLL_HOUR, or "Count now" → POST /request-fill)
   estimates every pending meal in ONE Claude call and answers with food-updates through
   shared-log.json; the merge below clears `pending`. Pending meals are never counted as 0.
   Photos: downscaled to JPEG, held in IndexedDB (`dj-food`/`photos`, keyed by entry id) with
   `photoQueued:true` on the entry until /upload-food succeeds — so nothing is lost offline.
   v119: within about a minute a local-model DRAFT (≈ numbers, entry.draft) appears on the row; it is
   never counted — see applyDrafts(). */
/* Companion server (D2) — SERVER (data/profile.js) lists the server features this profile has
   ({push,inbox,autofill,drafts,photos}); null = a static checkout (the public demo) with none. The
   network paths also need an http(s) origin: file:// has no server behind it. Computed once. */
const HAS_SERVER=!!SERVER&&location.protocol.startsWith('http');
function serverHas(f){return HAS_SERVER&&!!SERVER[f]}
let _photoTarget=null; // null = new meal from the Log-a-Meal form; an entry id = add a photo to that row
function pickFoodPhoto(id){_photoTarget=id;const inp=$("foodPhotoInput");if(inp){inp.value="";inp.click()}}
function foodLogFor(date){try{return JSON.parse(localStorage.getItem('dj-foodlog-'+date)||'[]')}catch(e){return[]}}
function patchFoodEntry(date,id,fn){const log=foodLogFor(date),e=log.find(x=>x&&x.id===id);if(!e)return false;fn(e);localStorage.setItem('dj-foodlog-'+date,JSON.stringify(log));return true}
function addPendingMeal(text){
 const date=todayKey(),log=foodLogFor(date),e={id:newFoodId(),at:new Date().toISOString(),n:text,pending:true,kcal:0,p:0,c:0,f:0};
 log.push(e);localStorage.setItem('dj-foodlog-'+date,JSON.stringify(log));
 return {date,id:e.id}}
function takeMealText(){const ta=$("mealText"),t=(ta&&ta.value||'').trim();if(ta)ta.value='';return t}
function logTextMeal(){
 const ta=$("mealText");if(!ta||!ta.value.trim()){if(ta)ta.focus();return}
 addPendingMeal(takeMealText());renderFoodLog();schedulePush();awaitDrafts()}
/* v118: the picker allows several photos at once — one pending meal per photo (DJ shoots each dish
   separately; the nightly batch sees them all together, so a photo that repeats another meal gets
   skipped by the estimator rather than double-counted). Typed text rides on the FIRST photo's meal.
   Adding a photo to an existing row still takes one file (a meal holds one photo). Photos are
   downscaled one at a time so a big multi-pick can't spike memory on the phone. */
async function onFoodPhotoPicked(inp){
 const files=Array.from(inp.files||[]);if(!files.length)return; // cancelled picker → nothing is created
 if(_photoTarget!=null){const id=_photoTarget;_photoTarget=null;return queueFoodPhoto(id,todayKey(),files[0])}
 const text=takeMealText(),refs=files.map((f,i)=>addPendingMeal(i===0?text:''));
 renderFoodLog();schedulePush();
 awaitDrafts();
 for(let i=0;i<files.length;i++)await queueFoodPhoto(refs[i].id,refs[i].date,files[i])}
function downscaleToJpeg(file,max=1600){
 return new Promise((res,rej)=>{
  const url=URL.createObjectURL(file),img=new Image();
  img.onload=()=>{
   URL.revokeObjectURL(url);
   let w=img.width,h=img.height;
   if(w>=h&&w>max){h=Math.round(h*max/w);w=max}else if(h>w&&h>max){w=Math.round(w*max/h);h=max}
   const cv=document.createElement('canvas');cv.width=w;cv.height=h;
   cv.getContext('2d').drawImage(img,0,0,w,h);
   cv.toBlob(b=>b?res(b):rej(new Error('encode')),'image/jpeg',0.85)};
  img.onerror=()=>{URL.revokeObjectURL(url);rej(new Error('decode'))};
  img.src=url})}
/* IndexedDB photo queue — tiny promise wrapper; every call rejects cleanly where IDB is missing. */
let _photoDbP=null;
function photoDb(){
 if(typeof indexedDB==='undefined')return Promise.reject(new Error('no-idb'));
 if(!_photoDbP)_photoDbP=new Promise((res,rej)=>{const rq=indexedDB.open('dj-food',1);
  rq.onupgradeneeded=()=>rq.result.createObjectStore('photos',{keyPath:'id'});
  rq.onsuccess=()=>res(rq.result);rq.onerror=()=>{_photoDbP=null;rej(rq.error)}});
 return _photoDbP}
function photoQueueTx(mode,fn){return photoDb().then(db=>new Promise((res,rej)=>{
 const tx=db.transaction('photos',mode),rq=fn(tx.objectStore('photos'));
 tx.oncomplete=()=>res(rq.result);tx.onerror=tx.onabort=()=>rej(tx.error)}))}
function photoQueuePut(rec){return photoQueueTx('readwrite',st=>st.put(rec))}
function photoQueueGet(id){return photoQueueTx('readonly',st=>st.get(id))}
function photoQueueAll(){return photoQueueTx('readonly',st=>st.getAll())}
function photoQueueDel(id){return photoQueueTx('readwrite',st=>st.delete(id)).catch(()=>{})}
function queueFoodPhoto(id,date,file){
 return downscaleToJpeg(file).then(blob=>
  photoQueuePut({id,date,blob,at:new Date().toISOString()})
   .then(()=>{patchFoodEntry(date,id,e=>{e.photoQueued=true});renderFoodLog();schedulePush();flushPhotoQueue()})
   .catch(()=>uploadPhotoBlob(id,date,blob).then(ok=>{if(!ok)alert("Photo upload failed and this browser can't hold it offline — try again on wifi/tailnet.")})))
 .catch(()=>alert('Could not read that image.'))}
function uploadPhotoBlob(id,date,blob){
 if(!serverHas('photos'))return Promise.resolve(false);
 return fetch('/upload-food?date='+date+'&id='+encodeURIComponent(id),{method:'POST',body:blob})
  .then(r=>r.ok?r.json():null).then(d=>{
   if(!(d&&d.ok&&d.saved))return false;
   patchFoodEntry(date,id,e=>{e.photo=d.saved;delete e.photoQueued});
   renderFoodLog();renderMealHistory();schedulePush();awaitDrafts();return true})
  .catch(()=>false)}
let _flushP=null;
function flushPhotoQueue(){ // uploads queued photos oldest-first; stops at the first network failure (retried on next trigger)
 if(_flushP)return _flushP;
 _flushP=photoQueueAll().then(async recs=>{
  let uploaded=0;
  for(const r of (recs||[]).sort((a,b)=>String(a.at).localeCompare(String(b.at)))){
   if(!foodLogFor(r.date).some(e=>e&&e.id===r.id)){await photoQueueDel(r.id);continue} // meal was deleted
   if(!await uploadPhotoBlob(r.id,r.date,r.blob))break;
   await photoQueueDel(r.id);uploaded++}
  return {uploaded,remaining:((await photoQueueAll())||[]).length}})
 .catch(()=>({uploaded:0,remaining:0}))
 .finally(()=>{_flushP=null});
 return _flushP}
function hydrateQueuedThumbs(el){
 if(!el||!el.querySelectorAll)return;
 el.querySelectorAll('img[data-qid]').forEach(img=>photoQueueGet(img.dataset.qid)
  .then(r=>{if(r&&r.blob)img.src=URL.createObjectURL(r.blob)}).catch(()=>{}))}

/* Sync + auto-fill status strip and the "Count now" button. Two freshness monitors, because both
   halves of this pipeline can die silently: the phone→PC push (dj-push-last, set on every 200 from
   /push-logs) and the PC's auto-fill run (autofill-state.json, fetched network-only, cached in the
   non-dj- key af-state so it shows offline and is never echoed back in the push). */
/* v119 — local DRAFT estimates. draft-food.py (on the PC, a local model pinned to the RTX 3070) drafts
   each pending meal within about a minute of the push and writes draft-state.json (single writer,
   network-only here). applyDrafts() copies a draft onto its meal as entry.draft = {kcal,p,c,f,of,src,
   basis,at,model}. A draft is NEVER a count: `pending` stays, counted totals / verdict / Sheet ignore
   it, and the nightly Claude count replaces it (the draft is kept so draft-vs-final can be measured).
   `of` = the inputs it was computed from; once DJ renames the meal or adds a photo it is stale. */
function loadDraftState(){try{return JSON.parse(localStorage.getItem('draft-state')||'null')}catch(e){return null}}
function fetchDraftState(){
 if(!serverHas('drafts'))return Promise.resolve(null);
 return fetch('draft-state.json',{cache:'no-store'}).then(r=>r.ok?r.json():null)
  .then(s=>{if(s&&s.lastRun)localStorage.setItem('draft-state',JSON.stringify(s));return s}).catch(()=>null)}
function sameDraftInputs(e){const d=e&&e.draft,of=d&&d.of;return !!(of&&(e.n||'')===(of.n||'')&&(e.photo||'')===(of.photo||''))}
function draftSkipFor(st){const sk=st&&Array.isArray(st.skipped)?st.skipped:[];
 return e=>sk.find(x=>x&&x.id===e.id&&x.of&&(e.n||'')===(x.of.n||'')&&(e.photo||'')===(x.of.photo||''))||null}
function findFoodEntry(id){ // across every day — a meal may have been re-dated by food-move
 for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(!k||!k.startsWith('dj-foodlog-'))continue;
  let log;try{log=JSON.parse(localStorage.getItem(k)||'[]')}catch(e){continue}
  const idx=Array.isArray(log)?log.findIndex(x=>x&&x.id===id):-1;
  if(idx>=0)return {key:k,date:k.slice('dj-foodlog-'.length),log,idx}}
 return null}
function applyDrafts(st){
 let touched=false,touchedToday=false;
 const drafts=st&&st.drafts&&typeof st.drafts=='object'?st.drafts:{};
 for(const id of Object.keys(drafts)){
  const d=drafts[id],loc=findFoodEntry(id);
  if(!loc)continue; // not on this phone (yet) — silent
  if(!d||!['kcal','p','c','f'].every(k=>typeof d[k]=='number'&&isFinite(d[k]))||!d.of){console.error('draft-state: malformed draft ignored: '+id);continue}
  const e=loc.log[loc.idx];
  if(e.draft&&String(e.draft.at||'')>=String(d.at||''))continue; // already have this (or a newer) one
  e.draft={kcal:d.kcal,p:d.p,c:d.c,f:d.f,of:{n:d.of.n||'',photo:d.of.photo||''},src:d.src||'',basis:String(d.basis||'').slice(0,120),at:d.at||'',model:d.model||''};
  localStorage.setItem(loc.key,JSON.stringify(loc.log));
  touched=true;if(loc.date===todayKey())touchedToday=true}
 if(touched)schedulePush();
 return {touched,touchedToday}}
function draftOutstanding(st){ // pending meals the PC should be drafting right now (photo uploaded, no draft, no reported skip)
 const sk=draftSkipFor(st);
 return loadAllFoodLog().filter(e=>e.pending&&(e.n||e.photo)&&!(e.photoQueued&&!e.photo)&&!sameDraftInputs(e)&&!sk(e))}
let _draftWaitP=null;
function awaitDrafts(){ // bounded poll while visible and a draft is expected; no-op off-server
 if(_draftWaitP||!serverHas('drafts'))return _draftWaitP||Promise.resolve();
 _draftWaitP=(async()=>{
  const t0=Date.now(),before=(loadDraftState()||{}).lastRun;
  const cap=Math.min(DRAFT_POLL_MAX_S,90+40*draftOutstanding(loadDraftState()).length)*1000;
  while(draftOutstanding(loadDraftState()).length&&Date.now()-t0<cap){
   if(document.visibilityState&&document.visibilityState!=='visible')break;
   await new Promise(res=>setTimeout(res,DRAFT_POLL_S*1000));
   const st=await fetchDraftState();
   if(!st)continue;
   if(applyDrafts(st).touched){renderFoodLog();renderMealHistory()}else renderSyncStatus();
   if(st.lastRun!==before&&!DRAFT_OK.includes(st.lastResult))break}
 })().finally(()=>{_draftWaitP=null;renderSyncStatus()});
 return _draftWaitP}
function draftSummary(s){
 if(s.lastResult=='drafted'||s.lastResult=='empty'||s.lastResult=='nothing-ready')return 'ok';
 if(s.lastResult=='running')return 'drafting…';
 if(s.lastResult=='nothing-usable')return "couldn't size the last meal";
 return 'FAILED — '+s.lastResult+(s.error?': '+s.error:'')}
let _fillMsg='',_fillBusy=false;
function agoTxt(iso){const ms=Date.now()-Date.parse(iso);if(!isFinite(ms))return 'never';const m=Math.round(ms/6e4);
 return m<1?'just now':m<60?m+' min ago':m<48*60?Math.round(m/60)+' h ago':Math.round(m/1440)+' days ago'}
function loadAutofillState(){try{return JSON.parse(localStorage.getItem('af-state')||'null')}catch(e){return null}}
function fetchAutofillState(){
 if(!serverHas('autofill'))return Promise.resolve(null);
 return fetch('autofill-state.json',{cache:'no-store'}).then(r=>r.ok?r.json():null)
  .then(s=>{if(s&&s.lastRun)localStorage.setItem('af-state',JSON.stringify(s));return s}).catch(()=>null)}
function autofillSkipReasons(){const s=loadAutofillState(),o={};if(s&&Array.isArray(s.skipped))s.skipped.forEach(x=>{if(x&&x.id)o[x.id]=String(x.reason||'')});return o}
function afSummary(s){
 if(!s)return 'no run seen yet';
 const n=a=>Array.isArray(a)?a.length:0;
 if(s.lastResult=='filled')return 'counted '+n(s.filled)+' meal'+(n(s.filled)==1?'':'s')+(n(s.skipped)?', '+n(s.skipped)+' skipped':'');
 if(s.lastResult=='empty'||s.lastResult=='already-filled')return 'nothing was pending';
 if(s.lastResult=='nothing-ready')return 'waiting on '+n(s.skipped)+' photo'+(n(s.skipped)==1?'':'s');
 return 'FAILED — '+s.lastResult+(s.error?': '+s.error:'')}
function renderSyncStatus(){
 const el=$("syncStatus");if(!el)return;
 if(!SERVER){el.innerHTML=`<div class="small" style="line-height:1.6;padding-top:8px;border-top:1px solid var(--bd);color:var(--mu)">Static demo: companion-server features off — meals stay pending (no auto-fill or drafts) and nothing syncs off this device.</div>`;return}
 const last=localStorage.getItem('dj-push-last'),st=loadAutofillState();
 const syncWarn=!last||Date.now()-Date.parse(last)>SYNC_STALE_H*36e5;
 const afWarn=!st||Date.now()-Date.parse(st.lastRun)>AUTOFILL_STALE_H*36e5||!AUTOFILL_OK.includes(st.lastResult);
 // draft freshness is EVENT-keyed (a meal is waiting too long), not time-keyed: no meals → no runs is healthy
 const dst=loadDraftState(),overdue=draftOutstanding(dst).filter(e=>Date.now()-Date.parse(e.at||'')>DRAFT_OVERDUE_MIN*6e4);
 const draftWarn=overdue.length>0||!!(dst&&!DRAFT_OK.includes(dst.lastResult));
 const pend=loadAllFoodLog().filter(e=>e.pending).length;
 const line=(warn,txt)=>`<div style="color:${warn?'var(--ye)':'var(--mu)'}">${warn?'⚠ ':''}${txt}</div>`;
 el.innerHTML=`<div class="small" style="line-height:1.6;padding-top:8px;border-top:1px solid var(--bd)">
  ${line(syncWarn,'Phone → PC: '+(last?'synced '+agoTxt(last):'never synced')+(syncWarn?' — open the app on wifi/Tailscale':''))}
  ${line(afWarn,'Auto-fill: '+(st?agoTxt(st.lastRun)+' · '+afSummary(st):'no run seen yet'))}
  ${dst||overdue.length?line(draftWarn,'Draft (PC local model): '+(overdue.length?overdue.length+' meal'+(overdue.length==1?' has':'s have')+' waited '+DRAFT_OVERDUE_MIN+'+ min — is the PC on?':'')+(dst?(overdue.length?' · last run ':'')+agoTxt(dst.lastRun)+' · '+draftSummary(dst):'')):''}</div>
  ${pend&&SERVER.autofill?`<button onclick="requestFill()" ${_fillBusy?'disabled':''} style="width:100%;margin-top:8px;padding:10px;border-radius:9px;background:var(--card2);border:1px solid var(--ye);color:var(--ye);font-weight:800;font-size:13px">${_fillBusy?'⏳ Counting…':'⚡ Count now · '+pend+' pending'}</button>`:''}
  ${_fillMsg?`<div class="small" style="margin-top:6px;color:var(--tx)">${escHtml(_fillMsg)}</div>`:''}`}
async function requestFill(){
 if(_fillBusy)return;_fillBusy=true;
 const say=m=>{_fillMsg=m;renderSyncStatus()};
 try{
  say('Uploading photos…');
  const q=await flushPhotoQueue();
  if(q.remaining>0){say(q.remaining+' photo'+(q.remaining==1?'':'s')+" still waiting to upload — is Tailscale on?");return}
  say('Sending your log to the PC…');
  if(!await pushDeviceLogs()){say("Couldn't reach the PC — is Tailscale on?");return}
  const before=(loadAutofillState()||{}).lastRun;
  const r=await fetch('request-fill',{method:'POST'}).catch(()=>null);
  if(!r){say("Couldn't reach the PC — is Tailscale on?");return}
  if(r.status==429){say('It just ran — try again in a minute.');return}
  if(r.status==404){say('The PC server needs a restart before Count now works.');return}
  if(r.status==400){say("The PC didn't get your latest log — try again.");return}
  if(r.status!=202&&r.status!=409){say('PC error ('+r.status+').');return}
  say(r.status==409?'Already counting — hang on…':'Counting… usually under a minute.');
  const t0=Date.now();
  while(Date.now()-t0<8*60e3){
   await new Promise(res=>setTimeout(res,8000));
   const s=await fetchAutofillState();
   if(s&&s.lastRun!==before){await syncSharedLog();say('Done — '+afSummary(s)+'.');return}}
  say('Still counting — it will show up on your next open.')}
 finally{_fillBusy=false;renderSyncStatus()}}
/* Every day's food log (dj-foodlog-YYYY-MM-DD) across all days, for export — loadFoodLog() only
   ever reads today's key, this scans every day's key and tags each entry with its date. */
function loadAllFoodLog(){
 const all=[];
 for(let i=0;i<localStorage.length;i++){
  const k=localStorage.key(i);
  if(!k||!k.startsWith('dj-foodlog-'))continue;
  const date=k.slice('dj-foodlog-'.length);
  try{JSON.parse(localStorage.getItem(k)||'[]').forEach(e=>all.push({date,...e}))}catch(err){}}
 all.sort((a,b)=>a.date.localeCompare(b.date));
 return all}
function foodCSVRows(){
 const rows=[["Date","Logged At","Food","Calories","Protein (g)","Carb (g)","Fat (g)",...NUTRIENTS.map(nu=>nu.label+" (g)"),"Draft kcal","Status"]];
 for(const r of loadAllFoodLog())rows.push([r.date,r.at||"",r.n,r.kcal,r.p,r.c,r.f,...NUTRIENTS.map(nu=>r[nu.k]??""),r.draft&&isFinite(r.draft.kcal)?r.draft.kcal:"",r.pending?"pending":""]);
 return rows}
function exportFoodCSV(){
 const rows=foodCSVRows();
 if(rows.length<2)return false;
 const csv=rows.map(row=>row.map(v=>{const s=String(v);return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s}).join(",")).join("\r\n");
 const blob=new Blob([csv],{type:"text/csv;charset=utf-8;"});
 const url=URL.createObjectURL(blob);
 const a=document.createElement("a");
 a.href=url;a.download="dj-food-log-"+todayKey()+".csv";
 document.body.appendChild(a);a.click();document.body.removeChild(a);
 URL.revokeObjectURL(url);
 return true}
