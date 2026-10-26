/* Public harness section — a full localStorage fails loud (v122). Every app write goes through
   lsSet(): a QuotaExceededError shows a persistent banner naming the key and returns false instead of
   throwing out of the middle of a save; any other storage error still throws. A source scan keeps
   bare localStorage.setItem out of the app (the only one left is inside lsSet). */
module.exports=({run,ok,MOD,fs,path,DIR})=>{
console.log('\n=== P16. Storage full: lsSet shows a banner, never a silent loss ===');
const probe=`(function(){var R={},real=localStorage.setItem;
 var full=function(){var e=new Error('quota');e.name='QuotaExceededError';throw e};
 R.okWrite=lsSet('dj-x','1');
 localStorage.setItem=full;
 var before=localStorage.getItem('dj-foodlog-'+todayKey());
 try{addFood(0);R.addFoodThrew=false}catch(e){R.addFoodThrew=String(e)}
 R.unchanged=localStorage.getItem('dj-foodlog-'+todayKey())===before;
 R.ret=lsSet('dj-y','2');
 var b=document.getElementById('banner-quota');R.text=b.textContent;R.cls=b.className;R.role=b.getAttribute('role');
 localStorage.setItem=function(){var e=new Error('denied');e.name='SecurityError';throw e};
 try{lsSet('dj-z','3');R.otherThrows=false}catch(e){R.otherThrows=e.name}
 localStorage.setItem=real;return R})()`;
const n=run(MOD,2026,9,26,{probe});
if(n.fatal){ok(false,'threw '+n.fatal.split('\n')[0]);return}
const R=n.probe;
ok(R.okWrite===true,'lsSet returns true on a normal write');
ok(R.addFoodThrew===false&&R.unchanged,'logging a meal with storage full does not throw, and the log is unchanged');
ok(R.ret===false,'lsSet returns false when the write is refused');
ok(/Storage for the app is full/.test(R.text)&&/dj-y/.test(R.text)&&/error/.test(R.cls),'a persistent error banner names the key that was not saved ('+R.text.slice(0,60)+'…)');
ok(R.otherThrows==='SecurityError','a non-quota storage error still throws');
const bare=fs.readdirSync(path.join(DIR,'app')).filter(f=>f.endsWith('.js')).flatMap(f=>{
 const src=fs.readFileSync(path.join(DIR,'app',f),'utf8');return (src.match(/localStorage\.setItem\(/g)||[]).map(()=>f)});
ok(bare.length===1&&bare[0]==='config.js','the only localStorage.setItem in app/ is lsSet\'s own ('+bare.join(', ')+')');
};
