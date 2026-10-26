/* Public harness section — accessibility basics that are easy to regress silently: zoom allowed, every
   form field labelled (static markup AND what the engine renders), the done-circles are real checkboxes
   that report their state, icon-only buttons are named, and the faint --dim text keeps >= 3:1 contrast
   on the card background. */
module.exports=({run,ok,MOD,fs,path,DIR})=>{
console.log('\n=== P11. Accessibility ===');
const html=fs.readFileSync(path.join(DIR,'index.html'),'utf8'),css=fs.readFileSync(path.join(DIR,'styles.css'),'utf8');
ok(!/user-scalable\s*=\s*no|maximum-scale\s*=\s*1(\.0)?\b/.test(html),'viewport allows pinch-zoom (no user-scalable=no / maximum-scale=1)');
// every input/textarea needs a <label for=id> or an aria-label
const unlabelled=h=>{const ids=new Set([...h.matchAll(/<label[^>]*\sfor="([^"]+)"/g)].map(m=>m[1]));
 return [...h.matchAll(/<(input|textarea)\b([^>]*)>/g)].filter(m=>!/aria-label="[^"]+"/.test(m[2])&&!ids.has((m[2].match(/\sid="([^"]+)"/)||[])[1])).map(m=>m[0].slice(0,60))};
ok(!unlabelled(html).length,'index.html: every input/textarea is labelled'+(unlabelled(html).length?' — missing: '+unlabelled(html).join(' | '):''));
// rendered: each day's sections, the food picker/log, the weigh-in list, the cardio tab
const probe=`(function(){var R={html:[]},$=function(id){return document.getElementById(id)};
 DAYS.forEach(function(d){setDay(d.k);var D=dayObj(d.k);SECTIONS.forEach(function(s){if((D.secs[s.k]||[]).length||s.always){setSec(s.k);R.html.push($('content').innerHTML)}})});
 R.html.push($('foodPicker').innerHTML,$('logList').innerHTML,$('bwList').innerHTML,cardioSectionHtml());
 var k=DAYS.map(function(d){return d.k}).filter(function(k){return (dayObj(k).secs.main||[]).length})[0];setDay(k);setSec('main');R.first=k+'main0';chk(R.first);renderContent();R.after=$('content').innerHTML;return R})()`;
const n=run(MOD,2026,9,26,{probe,seed:[['dj-seeded','x'],['dj-bw-log','[{"d":"2026-10-25","w":150}]'],['dj-foodlog-2026-10-26','[{"id":"f1","n":"x","kcal":1,"p":1,"c":1,"f":1}]']]});
if(n.fatal){ok(false,'threw '+n.fatal.split('\n')[0]);return}
const all=n.probe.html.join('\n');
const miss=unlabelled(all);
ok(!miss.length,'rendered UI: every input/textarea is labelled ('+(all.match(/<(input|textarea)\b/g)||[]).length+' fields)'+(miss.length?' — missing: '+[...new Set(miss)].slice(0,5).join(' | '):''));
const chks=all.match(/class="chk[^"]*"[^>]*>/g)||[];
ok(chks.length>0&&chks.every(t=>/role="checkbox" aria-checked="(true|false)" aria-label="[^"]+ done"/.test(t))&&!/<div class="chk/.test(all),'done-circles are <button role="checkbox"> with aria-checked + a name ('+chks.length+')');
ok(new RegExp('id="ex-'+n.probe.first+'"[\\s\\S]*?role="checkbox" aria-checked="true"').test(n.probe.after),'checking an exercise reports aria-checked="true"');
const dels=all.match(/<button class="del"[^>]*>/g)||[];
ok(dels.length>0&&dels.every(t=>/aria-label="[^"]+"/.test(t)),'every × delete button has an aria-label ('+dels.length+')');
ok(/<button id="tmr"[^>]*aria-label="[^"]+"/.test(html)&&/aria-label="Close"[^>]*>✕/.test(html),'the rest timer and the lightbox ✕ are named');
// contrast: --dim on --card, WCAG relative luminance
const v=k=>(css.match(new RegExp('--'+k+':\\s*(#[0-9A-Fa-f]{6})'))||[])[1];
const L=h=>{const c=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255).map(x=>x<=0.03928?x/12.92:Math.pow((x+0.055)/1.055,2.4));return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2]};
const cr=(a,b)=>{const x=L(a),y=L(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05)};
const ratio=cr(v('dim'),v('card'));
ok(ratio>=3,'--dim '+v('dim')+' on --card '+v('card')+' = '+ratio.toFixed(2)+':1 (>= 3:1)');
};
