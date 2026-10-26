/* Public harness section — asserts only engine behaviour on fixtures it seeds itself (or values
   derived from the loaded data), so it passes on the demo and on a private overlay alike. */
module.exports=({run,ok,MOD,ORIG,has,fs,path,DIR,PRIV})=>{{
// ---------- 10. Cardio & Sauna is its own tab (v78) ----------
console.log('\n=== 10. Cardio & Sauna moved to its own tab after Stretch (v78) ===');
{const n=run(MOD,2026,6,28,{tc:true});
 ok(!n.fatal,'runs'+(n.fatal?': '+n.fatal.split('\n')[0]:''));
 const c=n.tc||{};
 ok(/🧖 Cardio/.test(c.segrow||''),'segrow has the 🧖 Cardio tab');
 ok(!/🧖 Cardio \(/.test(c.segrow||''),'cardio tab shows NO (count) — it is not an exercise list');
 ok(c.sec==='cardio','tapping it selects the cardio section');
 ok(/Cardio &amp; Sauna/.test(c.cardioContent||'')&&/id="cardioMin"/.test(c.cardioContent||''),'cardio tab renders the logger into #content (header + minutes input)');
 ok(/addCardio\('Stairmaster'\)/.test(c.cardioContent||'')&&/addCardio\('Sauna'\)/.test(c.cardioContent||''),'logger has the Stairmaster + Sauna buttons');
 ok(!/cardioMin/.test(c.mainAfter||''),'switching back to Main drops the logger (it lives only on the cardio tab, not pinned to the page)');
}
}};
