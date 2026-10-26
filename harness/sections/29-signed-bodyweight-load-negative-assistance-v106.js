/* Public harness section — asserts only engine behaviour on fixtures it seeds itself (or values
   derived from the loaded data), so it passes on the demo and on a private overlay alike. */
module.exports=({run,ok,MOD,ORIG,has,fs,path,DIR,PRIV})=>{{
// ---------- 29. Signed bodyweight load: negative = assistance (v106) ----------
console.log('\n=== 29. Bodyweight sets carry a SIGNED load (− = assist, + = added) ===');
{const n=run(MOD,2026,7,12,{fmt:true});
 const F=n.fmt||{};
 ok(F.shortAsst==='40lb asst×8','fmtSetShort: assisted set → "'+F.shortAsst+'"');
 ok(F.shortAdd==='+25lb×5','fmtSetShort: weighted set → "'+F.shortAdd+'"');
 ok(F.shortBw==='8r','fmtSetShort: plain bodyweight (no load) → "'+F.shortBw+'"');
 ok(F.wAsst==='40 lb assist × ','fmtSetWeight: assisted → "'+F.wAsst+'"');
 ok(F.wAdd==='+25 lb × ','fmtSetWeight: weighted → "'+F.wAdd+'"');
 ok(F.tAsst==='40 lb assist','fmtTarget: negative bw target → "'+F.tAsst+'"');
 ok(F.tAdd==='+25 lb','fmtTarget: positive bw target → "'+F.tAdd+'"');
 // the whole point: one axis, so "less assist" sorts as the better top set
 ok(F.topPick===-25,'lastLine top-set pick: −25 assist beats −40 (progress orders correctly), got '+F.topPick);
 ok(F.topPickMixed===10,'top-set pick: +10 added beats any assisted set, got '+F.topPickMixed);
}
}};
