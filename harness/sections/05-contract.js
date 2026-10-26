/* Public harness section — the data contract guard. Every global in DATA_CONTRACT is declared by the
   loaded data set; dropping one stops the engine with a cfgFail that names it (instead of a
   ReferenceError somewhere inside a render). */
module.exports=({run,ok,MOD})=>{
console.log('\n=== P5. Data contract guard ===');
const n=run(MOD,2026,9,26,{probe:'DATA_CONTRACT.slice()'});
ok(!n.fatal&&Array.isArray(n.probe)&&n.probe.length>20,'every DATA_CONTRACT global is declared ('+(n.probe||[]).length+')');
for(const [decl,name] of [['const TEE=','TEE'],['const BASE_EPOCHS=','BASE_EPOCHS'],['const SEED=','SEED']]){
 const b=run(MOD,2026,9,26,{patch:s=>s.replace(new RegExp('^'+decl,'m'),'const '+name+'_RENAMED=')});
 ok(!!b.fatal&&b.errors.some(e=>new RegExp('missing required global.*\\b'+name+'\\b').test(e)),'drop '+name+' → engine stops with a cfgFail naming it');
}
};
