/* Verification harness — runs the app's scripts in a vm sandbox with DOM/localStorage/Date stubs at
   pinned dates. Usage:
     node harness/harness.js                 public sections, then private ones if <repo>/private exists
     node harness/harness.js --private DIR   use DIR as the private root (DIR/data overlay, DIR/harness)
     node harness/harness.js --demo          ignore any private overlay: demo data + public sections only
     node harness/harness.js --rebaseline    rewrite the snapshot baseline for the active data set
   Public sections (harness/sections/*.js) only assert things derived from the loaded data, so they
   pass on the demo AND on a private overlay. Private sections (<private>/harness/sections/*.js) carry
   the owner's dated checks and the byte-diff against the single-file v119 baseline. */
const fs=require('fs');
const vm=require('vm');
const path=require('path');
const DIR=path.resolve(__dirname,'..');   // the app dir this harness ships in (a copy tests itself, not the live dir)

/* Private overlay (D1) — the same all-or-nothing rule serve.py applies: if <private>/data exists,
   EVERY data/* script comes from it and a missing file is fatal (never a per-file fallback to the
   demo data). --private <dir> overrides the default <repo>/private. */
const argv=process.argv.slice(2);
const DEMO_ONLY=argv.includes('--demo'),REBASELINE=argv.includes('--rebaseline');
const PRIV=(()=>{const i=argv.indexOf('--private');return i>=0?path.resolve(argv[i+1]):path.join(DIR,'private')})();
const OVERLAY=!DEMO_ONLY&&fs.existsSync(path.join(PRIV,'data'))?path.join(PRIV,'data'):null;

/* assemble(indexPath, dataDir) → [{name,src}] in <script> order, inline blocks included. Each unit
   runs as its own script in ONE vm context (run() below), mirroring the browser: top-level
   const/let are shared across scripts, but a top-level call can only reach definitions that a
   SAME-or-EARLIER script already made — the hoisting hazard a plain concatenation would hide. */
function assemble(indexPath,dataDir){
 const h=fs.readFileSync(indexPath,'utf8'),units=[],re=/<script(?:\s+src="([^"]+)")?\s*>([\s\S]*?)<\/script>/g;let m;
 while((m=re.exec(h))){
  if(m[1]){const rel=m[1],file=rel.startsWith('data/')&&dataDir?path.join(dataDir,rel.slice(5)):path.join(path.dirname(indexPath),rel);
   if(!fs.existsSync(file))throw new Error('assemble: '+rel+' missing at '+file+(dataDir?' (overlay is all-or-nothing — no fallback to demo data)':''));
   units.push({name:rel,src:fs.readFileSync(file,'utf8')})}
  else units.push({name:'index.html#inline'+units.length,src:m[2]})}
 if(!units.length)throw new Error('no script in '+indexPath);
 return units;
}
/* The v119 single-file baseline keeps the single-string path: one inline <script>. */
function extract(file){const h=fs.readFileSync(file,'utf8');const m=h.match(/<script>([\s\S]*)<\/script>/);if(!m)throw new Error('no script in '+file);return [{name:path.basename(file),src:m[1]}];}
const ORIG_FILE=path.join(PRIV,'harness','index.orig.html');
const ORIG=OVERLAY&&fs.existsSync(ORIG_FILE)?extract(ORIG_FILE):null;
const MOD=assemble(path.join(DIR,'index.html'),OVERLAY);
console.log('data: '+(OVERLAY?'private overlay '+OVERLAY:'demo (repo data/)')+' · units: '+MOD.map(u=>u.name).join(', '));

/* Epilogues: capture scripts appended as the last unit of a run. run(…,{flag:true}) adds EPIS[flag];
   its capture lands on the result as .<key>. Order = EPI_ORDER, whatever order the flags are given. */
const SHARED_EPI=`;(function(){
 var cap={};
 cap.phase=phase;
 cap.todayKey=todayKey();cap.localDayKey=localDayKey();
 cap.phasesD=PHASES.map(function(p){return p.d});
 cap.dayT=(typeof DAY_TARGETS!=='undefined')?DAY_TARGETS:null; // v104: Fuel-tab assertions derive from these
 cap.tee=(typeof TEE!=='undefined')?TEE:null;
 cap.monMain0=(dayObj('mon').secs.main[0]||{}).n; // today's resolved Monday main (v122: the rotation resolves in dayObj, DAYS is never written)
 var ids=['tl','tlx','phrow','pban','cd','heroDates','wk','logTotals','dailyTargets','mealSplits','nutFoot','dtSurplus','dtTee','dtKcalMid','dtPMid'];
 cap.ids={};ids.forEach(function(id){var el=document.getElementById(id);cap.ids[id]={h:el?el.innerHTML:null,t:el?el.textContent:null}});
 cap.tlBars=(cap.ids.tl.h.match(/class="tlw/g)||[]).length;
 cap.days={};
 ['mon','tue','wed','thu','fri','sat','sun'].forEach(function(k){setDay(k);
  cap.days[k]={focus:document.getElementById('dfocus').textContent,dmeta:document.getElementById('dmeta').textContent,dnote:document.getElementById('dnote').innerHTML,segrow:document.getElementById('segrow').innerHTML,content:document.getElementById('content').innerHTML};});
 globalThis.__CAP=cap;
})();`;

// v106: signed bodyweight load — negative weight means machine/band ASSISTANCE
const FMT_EPI=`;(function(){var c={};
 c.shortAsst=fmtSetShort({weight:-40,reps:8,ld:'bw'});
 c.shortAdd=fmtSetShort({weight:25,reps:5,ld:'bw'});
 c.shortBw=fmtSetShort({weight:null,reps:8,ld:'bw'});
 c.wAsst=fmtSetWeight({weight:-40,ld:'bw'});
 c.wAdd=fmtSetWeight({weight:25,ld:'bw'});
 c.tAsst=fmtTarget('Pull-up',-40);
 c.tAdd=fmtTarget('Pull-up',25);
 // top-set selection must treat "less assist" as better, and added load as best
 var pick=function(sets){var withW=sets.filter(function(s){return s.weight!=null});
  return (withW.length?withW:sets).reduce(function(b,s){return ((s.weight||0)>(b.weight||0)||((s.weight||0)===(b.weight||0)&&(s.reps||0)>(b.reps||0)))?s:b});};
 c.topPick=pick([{weight:-40,reps:12},{weight:-25,reps:7}]).weight;
 c.topPickMixed=pick([{weight:-40,reps:12},{weight:-25,reps:7},{weight:10,reps:3}]).weight;
 globalThis.__FMTCAP=c;})();`;

// P2 weight-targets: navigate to specific day+section and capture the rendered exercise cards.
const T8_EPI=`;(function(){var c={};
 c.buildPhase=(typeof BUILD_PHASE!=='undefined')?BUILD_PHASE:null;
 c.buildStart=(typeof BUILD_START!=='undefined')?BUILD_START:null;
 c.phase=phase;c.wkNow=wkNow;
 function secHTML(dk,sk){try{setDay(dk);setSec(sk);return document.getElementById('content').innerHTML}catch(e){return 'ERR:'+e}}
 c.tueMain=secHTML('tue','main');
 c.satMain=secHTML('sat','main');
 c.satPower=secHTML('sat','power');
 c.friMain=secHTML('fri','main');
 c.friPower=secHTML('fri','power');
 c.sunMain=secHTML('sun','main');
 c.sunCore=secHTML('sun','core');
 c.wedMain=secHTML('wed','main');
 globalThis.__T8CAP=c;
})();`;

// v78: Cardio & Sauna as its own section tab after Stretch
const TC_EPI=`;(function(){var c={};
 setDay('tue'); c.segrow=document.getElementById('segrow').innerHTML;
 setSec('cardio'); c.sec=sec; c.cardioContent=document.getElementById('content').innerHTML;
 setSec('main'); c.mainAfter=document.getElementById('content').innerHTML;
 globalThis.__TCCAP=c;
})();`;

// v86: last-session "W×R" line under the target
const TLAST_EPI=`;(function(){var c={};
 setDay('sat');setSec('main');c.satMain=document.getElementById('content').innerHTML;
 globalThis.__TLASTCAP=c;
})();`;

// v87/v89: note archive-then-clear on End Workout — trained WED today but VIEWING thu (Fable finding 1)
const TNOTE_EPI=`;(function(){var c={};
 setDay('thu'); // viewing Thursday, but today's sets were logged under Wednesday
 try{exportWorkoutCSV()}catch(e){c.exportErr=String(e)}                 // standalone export must NOT clear
 c.notClearedByExport=localStorage.getItem('dj-exlog-wedmain0')!==null;
 var todaysLog=loadWorkoutLog().filter(function(e){return e.date===localDayKey()}); // replicate endDay's derivation
 c.trainedDays=todaysLog.map(function(e){return e.day}).filter(function(v,i,a){return a.indexOf(v)===i});
 clearWorkoutNotes(c.trainedDays);
 c.wedGone=localStorage.getItem('dj-exlog-wedmain0')===null;   // trained → cleared
 c.thuKept=localStorage.getItem('dj-exlog-thumain0')!==null;   // viewed but NOT trained → untouched
 var arch;try{arch=JSON.parse(localStorage.getItem('dj-exlog-archive')||'[]')}catch(e){arch=[]}
 c.archived=arch.map(function(a){return a.exercise+'|'+a.date+'|'+a.note});
 globalThis.__TNOTECAP=c;
})();`;

// v116: meal log — food-day roll, pending meals, merge clears pending, CSV status, form flow
const MEAL_EPI=`;(function(){var c={};
 c.todayKey=todayKey();c.localDayKey=localDayKey();c.roll=FOOD_DAY_ROLL_HOUR;
 c.tot=dayFoodTotals(todayKey());
 c.logList=document.getElementById('logList').innerHTML;
 c.logTotals=document.getElementById('logTotals').innerHTML;
 c.mealHistory=document.getElementById('mealHistory').innerHTML;
 c.loggedTitle=document.getElementById('loggedTitle').textContent;
 c.rollTxt=document.getElementById('rollHourTxt').textContent;
 c.syncStatus=document.getElementById('syncStatus').innerHTML;
 c.csv=foodCSVRows();
 c.verdict=dayVerdict(c.tot);
 applySharedEntries([{id:'u-name',type:'food-update',date:c.todayKey,target:'f-pend2',n:'renamed'},
                     {id:'u-full',type:'food-update',date:c.todayKey,target:'f-pend',kcal:850,p:35,c:86,f:38,sugar:4}]);
 var lg=JSON.parse(localStorage.getItem('dj-foodlog-'+c.todayKey)||'[]');
 c.afterFull=lg.filter(function(e){return e.id==='f-pend'})[0];
 c.afterName=lg.filter(function(e){return e.id==='f-pend2'})[0];
 c.totAfter=dayFoodTotals(c.todayKey);
 document.getElementById('mealText').value='  protein shake  ';
 logTextMeal();
 lg=JSON.parse(localStorage.getItem('dj-foodlog-'+c.todayKey)||'[]');
 c.textMeal=lg[lg.length-1];c.textCleared=document.getElementById('mealText').value;
 var before=lg.length;onFoodPhotoPicked({files:[]});
 c.cancelNoop=JSON.parse(localStorage.getItem('dj-foodlog-'+c.todayKey)||'[]').length===before;
 globalThis.__MEALCAP=c;
})();`;

// v118: food-move (re-date a meal) + multi-photo pick
const MOVE_EPI=`;(function(){var c={};
 var L=function(d){return JSON.parse(localStorage.getItem('dj-foodlog-'+d)||'[]').map(function(e){return e.id})};
 applySharedEntries([
  {id:'mv-ok',type:'food-move',date:'2026-10-17',from:'2026-10-18',target:'m-done'},
  {id:'mv-queued',type:'food-move',date:'2026-10-17',from:'2026-10-18',target:'m-queued'},
  {id:'mv-ghost',type:'food-move',date:'2026-10-17',from:'2026-10-18',target:'m-ghost'},
  {id:'mv-again',type:'food-move',date:'2026-10-17',from:'2026-10-18',target:'m-done'},
  {id:'mv-bad',type:'food-move',date:'2026-10-17',from:'2026-10-17',target:'m-x'}]);
 c.d17=L('2026-10-17');c.d18=L('2026-10-18');
 c.moved=JSON.parse(localStorage.getItem('dj-foodlog-2026-10-17')||'[]').filter(function(e){return e.id==='m-done'})[0];
 c.imported=JSON.parse(localStorage.getItem('dj-shared-imported-ids')||'[]');
 document.getElementById('mealText').value='three dishes';
 var before=L('2026-10-18').length;
 onFoodPhotoPicked({files:[{},{},{}]});
 c.added=JSON.parse(localStorage.getItem('dj-foodlog-2026-10-18')||'[]').slice(before);
 globalThis.__MOVECAP=c;
})();`;

// v119: local-model drafts — merge, never-counted totals, staleness, render, strip, CSV, move, inbox hardening
const DRAFT_EPI=`;(function(){var c={};var D='2026-10-18';
 var L=function(){return JSON.parse(localStorage.getItem('dj-foodlog-'+D)||'[]')};
 var E=function(id){return L().filter(function(e){return e.id===id})[0]};
 var setDS=function(o){if(o)localStorage.setItem('draft-state',JSON.stringify(o));else localStorage.removeItem('draft-state')};
 var dA={kcal:244,p:16,c:24,f:10,of:{n:'pho',photo:''},at:'2026-10-18T15:45:00Z',src:'text',model:'m'};
 c.r1=applyDrafts({lastRun:'2026-10-18T15:46:00Z',lastResult:'drafted',drafts:{
   'f-A':dA,'f-C':{kcal:999,p:1,c:1,f:1,of:{n:'rice',photo:''},at:'2026-10-18T15:45:00Z'},
   'f-ghost':{kcal:5,p:1,c:1,f:0,of:{n:'x',photo:''},at:'2026-10-18T15:45:00Z'}},skipped:[]});
 c.A1=E('f-A');c.C1=E('f-C');c.tot1=dayFoodTotals(D);
 setDS({lastRun:'2026-10-18T15:46:00Z',lastResult:'drafted',drafts:{},skipped:[{id:'f-D',reason:'estimator-unsure',of:{n:'mystery bowl',photo:''},transient:false,at:'2026-10-18T15:59:30Z'}]});
 renderFoodLog();renderMealHistory();
 c.list1=document.getElementById('logList').innerHTML;c.totals1=document.getElementById('logTotals').innerHTML;
 c.strip1=document.getElementById('syncStatus').innerHTML;
 // stale: DJ renames the meal -> the draft no longer describes it
 var lg=L();lg.forEach(function(e){if(e.id==='f-A')e.n='pho large'});localStorage.setItem('dj-foodlog-'+D,JSON.stringify(lg));
 c.tot2=dayFoodTotals(D);setDS(null);renderFoodLog();
 c.list2=document.getElementById('logList').innerHTML;c.strip2=document.getElementById('syncStatus').innerHTML;
 setDS({lastRun:'2026-10-18T15:58:00Z',lastResult:'ollama-down',error:'local model ollama-down at h',drafts:{},skipped:[]});renderFoodLog();
 c.strip3=document.getElementById('syncStatus').innerHTML;
 // newer draft for the new inputs applies; an older one never overwrites
 applyDrafts({drafts:{'f-A':{kcal:488,p:32,c:48,f:20,of:{n:'pho large',photo:''},at:'2026-10-18T15:50:00Z'}}});c.A3=E('f-A');
 applyDrafts({drafts:{'f-A':{kcal:1,p:1,c:1,f:0,of:{n:'pho large',photo:''},at:'2026-10-18T15:40:00Z'}}});c.A4=E('f-A');
 // the final count lands: pending cleared, draft kept for calibration
 applySharedEntries([{id:'u-A',type:'food-update',date:D,target:'f-A',kcal:500,p:33,c:49,f:20}]);
 c.A5=E('f-A');c.tot5=dayFoodTotals(D);renderFoodLog();c.list5=document.getElementById('logList').innerHTML;
 c.csv=foodCSVRows();
 // a food-move carries the draft with the meal
 applySharedEntries([{id:'mv-A',type:'food-move',date:'2026-10-17',from:D,target:'f-A'}]);
 c.moved=JSON.parse(localStorage.getItem('dj-foodlog-2026-10-17')||'[]').filter(function(e){return e.id==='f-A'})[0];
 // inbox hardening: an unknown type with n+macros must NOT become a meal, and must not be marked imported
 var before=L().length;
 applySharedEntries([{id:'fut-1',type:'future-thing',date:D,n:'should not appear',kcal:100,p:1,c:1,f:1}]);
 c.unknownAdded=L().length-before;
 c.imported=JSON.parse(localStorage.getItem('dj-shared-imported-ids')||'[]');
 globalThis.__DRAFTCAP=c;
})();`;

// Phase 2: personal Home/Fuel/Log cards rendered from PROFILE — capture what renderProfileCards() produced
const PROFILE_EPI=`;(function(){var c={},g=function(id){return document.getElementById(id)};
 ['heroEyebrow','heroTitle','goalCard','scanCard','mealTiming','sampleDayCard','shakesCard','aptTitle'].forEach(function(id){c[id]=g(id).innerHTML});
 c.tzLabel=g('tzLabel').textContent;c.placeholder=g('mealText').placeholder;c.title=document.title;
 c.cardio=cardioSectionHtml();
 globalThis.__PROFCAP=c;})();`;

const EPI_ORDER=['modEpi','fmt','t1','t8','tc','tlast','tnote','meal','move','draft','prof'];
const EPIS={fmt:{src:FMT_EPI,g:'__FMTCAP',key:'fmt'},t8:{src:T8_EPI,g:'__T8CAP',key:'t8'},tc:{src:TC_EPI,g:'__TCCAP',key:'tc'},
 tlast:{src:TLAST_EPI,g:'__TLASTCAP',key:'tlast'},tnote:{src:TNOTE_EPI,g:'__TNOTECAP',key:'tnote'},meal:{src:MEAL_EPI,g:'__MEALCAP',key:'meal'},
 move:{src:MOVE_EPI,g:'__MOVECAP',key:'move'},draft:{src:DRAFT_EPI,g:'__DRAFTCAP',key:'draft'},prof:{src:PROFILE_EPI,g:'__PROFCAP',key:'prof'}};
const PRIV_EPIS=path.join(PRIV,'harness','epilogues.js');
if(OVERLAY&&fs.existsSync(PRIV_EPIS))Object.assign(EPIS,require(PRIV_EPIS));

function makeEl(id){return{id,innerHTML:'',textContent:'',value:'',dataset:{},
 style:{},classList:{_s:new Set(),add(){for(var i=0;i<arguments.length;i++)this._s.add(arguments[i])},remove(){for(var i=0;i<arguments.length;i++)this._s.delete(arguments[i])},toggle(c,f){if(f===undefined){this._s.has(c)?this._s.delete(c):this._s.add(c)}else{f?this._s.add(c):this._s.delete(c)}},contains(c){return this._s.has(c)}},
 appendChild(){},removeChild(){},remove(){},insertAdjacentHTML(){},setAttribute(){},getAttribute(){return null},
 querySelector(){return null},querySelectorAll(){return[]},addEventListener(){},focus(){},click(){},href:'',download:''};}

function run(src,pinY,pinM,pinD,opts){
 opts=opts||{};
 const units=src.map(u=>({name:u.name,src:opts.patch?opts.patch(u.src):u.src}));
 const epi=SHARED_EPI+EPI_ORDER.filter(f=>opts[f]).map(f=>{if(!EPIS[f])throw new Error('run(): epilogue "'+f+'" is not registered (private epilogues need the overlay)');return EPIS[f].src}).join('');
 units.push({name:'epilogue',src:epi+(opts.probe?';globalThis.__PROBE=(function(){return ('+opts.probe+')})();':'')}); // probe: an expression evaluated after load, returned as .probe
 const pinMs=new Date(pinY,pinM,pinD,opts.hour==null?12:opts.hour,0,0).getTime(); // noon by default (UTC-date==local-date); opts.hour lets a test straddle UTC midnight
 class PinnedDate extends Date{constructor(){if(arguments.length===0){super(pinMs)}else{super(...arguments)}}static now(){return pinMs}}
 const store=new Map();
 (opts.seed||[]).forEach(([k,v])=>store.set(k,v));
 const localStorage={getItem(k){return store.has(k)?store.get(k):null},setItem(k,v){store.set(k,String(v))},removeItem(k){store.delete(k)},key(i){return[...store.keys()][i]},get length(){return store.size}};
 const errors=[];
 const elMap={};
 const document={getElementById(id){return elMap[id]||(elMap[id]=makeEl(id))},querySelector(){return null},querySelectorAll(){return[]},createElement(t){return makeEl('_'+t)},createElementNS(ns,t){return makeEl('_'+t)},addEventListener(){},get body(){return elMap.__body||(elMap.__body=makeEl('__body'))}};
 const sandbox={
  document,localStorage,Date:PinnedDate,
  console:{log(){},warn(){},error(){errors.push([...arguments].join(' '))},info(){}},
  matchMedia(){return{matches:true,addListener(){},addEventListener(){}}},
  navigator:{},location:{protocol:'file:'},
  alert(){},prompt(){return null},confirm(){return false},
  fetch(){return Promise.resolve({ok:false,json(){return Promise.resolve(null)}})},
  URL:{createObjectURL(){return'blob:x'},revokeObjectURL(){}},
  setTimeout(){return 0},clearTimeout(){},setInterval(){return 0},clearInterval(){},
  requestAnimationFrame(){return 0},cancelAnimationFrame(){},addEventListener(){},
  encodeURIComponent,decodeURIComponent,Math,JSON,parseInt,parseFloat,isFinite,isNaN,Array,Object,String,Number,Boolean,RegExp,Set,Map,Promise,Blob:function(){},Image:function(){}
 };
 sandbox.window=sandbox;sandbox.globalThis=sandbox;
 vm.createContext(sandbox);
 for(const u of units){
  try{vm.runInContext(u.src,sandbox,{filename:u.name});}
  catch(e){return{fatal:String(e&&e.stack||e),errors};}}
 const out={cap:sandbox.__CAP,errors};
 for(const f of EPI_ORDER)if(EPIS[f])out[EPIS[f].key]=sandbox[EPIS[f].g];
 if(opts.probe)out.probe=sandbox.__PROBE;
 out.store=store;out.ctx=sandbox; // async sections read the sandbox again after its promises settle
 return out;
}

/* v121 accessibility markup → the pre-v121 markup, for sections that byte-compare against an older
   baseline: the done-circle <button role="checkbox"> back to its <div>, and the added visually-hidden
   <label>s and aria-labels dropped. Applying this and comparing proves the a11y pass changed nothing
   else in the render. */
function undoA11y(h){return String(h)
 .replace(/<button type="button" class="chk([^"]*)" role="checkbox" aria-checked="(?:true|false)" aria-label="[^"]*" (onclick="[^"]*")>([^<]*)<\/button>/g,'<div class="chk$1" $2>$3</div>')
 .replace(/<label class="vh" for="[^"]*">[^<]*<\/label>\s*/g,'')
 .replace(/ aria-label="(?:Delete set|Delete note|Delete weigh-in|Delete entry|Delete meal|Add a photo|Rest timer|Meal photos)"/g,'')}

/* v125: form controls take their font size from styles.css (16px, so iOS doesn't zoom on focus), not
   inline. Comparisons against the pre-v125 baselines drop inline font sizes from controls on BOTH
   sides, so that move is the only thing excused. */
function dropControlFontSize(h){return String(h).replace(/<(input|textarea|select)\b[^>]*>/g,t=>t.replace(/;?font-size:[0-9.]+px/g,''))}

let FAIL=0;
function ok(cond,msg){if(!cond){FAIL++;console.log('  ✗ '+msg)}else{console.log('  ✓ '+msg)}}
const has=(h,s)=>String(h||'').includes(s);

/* Sections: public first (sorted by file name), then private when the overlay is active. A section
   that throws is a failure, not a crash — the remaining sections still run. */
const H={run,ok,has,undoA11y,dropControlFontSize,assemble,extract,MOD,ORIG,fs,path,DIR,PRIV,OVERLAY,REBASELINE};
/* A section may be async (return a promise) when it must let the app's fetch/promise chains settle —
   run(...).ctx is the sandbox to read afterwards. Sections still run one at a time, in order. */
async function runSections(dir,label){
 if(!fs.existsSync(dir))return 0;
 const files=fs.readdirSync(dir).filter(f=>f.endsWith('.js')).sort();
 for(const f of files){
  try{await require(path.join(dir,f))(H)}
  catch(e){ok(false,label+' section '+f+' threw: '+String(e&&e.stack||e).split('\n').slice(0,2).join(' | '))}}
 return files.length;
}
(async()=>{
 const nPub=await runSections(path.join(__dirname,'sections'),'public');
 let nPriv=0;
 if(OVERLAY){
  if(!ORIG)ok(false,'private overlay is active but the v119 baseline '+ORIG_FILE+' is missing');
  nPriv=await runSections(path.join(PRIV,'harness','sections'),'private');
 }
 console.log('\nsections: '+nPub+' public'+(OVERLAY?' + '+nPriv+' private':' (demo data — private sections skipped)'));
 console.log('\n'+(FAIL===0?'ALL CHECKS PASSED':FAIL+' CHECK(S) FAILED'));
 process.exitCode=FAIL===0?0:1;
})();
