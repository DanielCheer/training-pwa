/* Public harness section — the data overlay is all-or-nothing (D1): assemble() takes every data/*
   script from the overlay dir and fails loudly when one is missing there, instead of silently
   falling back to the demo copy (which could seed demo content into a real install). */
module.exports=({ok,assemble,fs,path,DIR})=>{
console.log('\n=== P2. Data overlay is all-or-nothing ===');
const os=require('os');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'overlay-'));
try{
 const names=fs.readdirSync(path.join(DIR,'data')).filter(f=>f.endsWith('.js'));
 names.forEach(f=>fs.copyFileSync(path.join(DIR,'data',f),path.join(tmp,f)));
 const units=assemble(path.join(DIR,'index.html'),tmp);
 ok(units.filter(u=>u.name.startsWith('data/')).length===names.length,'complete overlay: every data/* unit comes from the overlay dir ('+names.length+' files)');
 fs.unlinkSync(path.join(tmp,'seed.js'));
 let err=null;try{assemble(path.join(DIR,'index.html'),tmp)}catch(e){err=String(e.message||e)}
 ok(!!err&&/data\/seed\.js missing/.test(err)&&/no fallback/.test(err),'overlay missing data/seed.js: assemble refuses, no fallback to the demo copy ('+(err||'no error')+')');
}finally{fs.rmSync(tmp,{recursive:true,force:true})}
};
