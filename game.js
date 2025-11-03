/* Zen Dragon v9.5 — modular JS */

// ===== Shortcuts
const $ = id => document.getElementById(id);
const show = elId => {
  ["lobby","combatMenu","practiceMenu","game"].forEach(k => $(k)?.classList.add("hidden"));
  $(elId)?.classList.remove("hidden");
};
function pling(){try{let c=new (window.AudioContext||window.webkitAudioContext)(),o=c.createOscillator(),g=c.createGain();
o.type='sine';o.frequency.value=880;g.gain.value=.0001;o.connect(g).connect(c.destination);o.start();
g.gain.exponentialRampToValueAtTime(.15,c.currentTime+.01);
g.gain.exponentialRampToValueAtTime(.0001,c.currentTime+.12);o.stop(c.currentTime+.13)}catch(e){}}

// ===== State
let MODE='combat', DIFF='easy', TOPIC='m', LENGTH=20;
let qs=[],i=0,score=0,total=0,rts=[],isReview=false;

let UNL=JSON.parse(localStorage.getItem('zenUnlocks')||'{"medium":false,"hard":false}');
let COMHIST=JSON.parse(localStorage.getItem('zenCombatSessions')||'[]');
let PMIST=JSON.parse(localStorage.getItem('zenPracticeMistakesV2')||'{"m":[],"pow":[],"root":[],"frac":[]}');
let PCOUNT=JSON.parse(localStorage.getItem('zenPracticeCountsV2')||'{"m":0,"pow":0,"root":0,"frac":0}');
const saveUnlocks=()=>localStorage.setItem('zenUnlocks',JSON.stringify(UNL));
const saveComHist=()=>localStorage.setItem('zenCombatSessions',JSON.stringify(COMHIST.slice(-6)));
const savePMist=()=>localStorage.setItem('zenPracticeMistakesV2',JSON.stringify(PMIST));
const savePCount=()=>localStorage.setItem('zenPracticeCountsV2',JSON.stringify(PCOUNT));

// ===== Pools
const rand=(a,b)=>Math.floor(Math.random()*(b-a+1))+a;
const mulPool=(A,B)=>{let out=[];A.forEach(x=>B.forEach(y=>out.push({t:`${x}×${y}`,a:String(x*y),topic:'m'})));return out}
function powPool(){let out=[];for(let n=1;n<=14;n++)out.push({t:`${n}²`,a:String(n*n),topic:'pow'});
for(let n=2;n<=6;n++)out.push({t:`${n}³`,a:String(n*n*n),topic:'pow'});
out.push({t:'2⁴',a:'16',topic:'pow'},{t:'3⁴',a:'81',topic:'pow'},{t:'2⁵',a:'32',topic:'pow'},{t:'2⁶',a:'64',topic:'pow'});return out}
function rootPool(){let out=[];[4,9,16,25,36,49,64,81,100,121,144,169,196].forEach(v=>out.push({t:`√${v}`,a:String(Math.sqrt(v)),topic:'root'}));
[8,27,64,125,216].forEach(v=>out.push({t:`³√${v}`,a:String(Math.cbrt(v)),topic:'root'}));
[16,81].forEach(v=>out.push({t:`⁴√${v}`,a:String(Math.round(Math.pow(v,1/4))),topic:'root'}));
out.push({t:'⁵√32',a:'2',topic:'root'},{t:'⁶√64',a:'2',topic:'root'});return out}
function fracPool(){let out=[];for(let k=0;k<14;k++){let a=rand(2,9),b=rand(2,9),c=rand(2,9);let n=a*b,d=a*c;let g=(m,n)=>{while(n){[m,n]=[n,m%n]}return Math.abs(m)};
let gg=g(n,d);let simp=(n/gg)+'/'+(d/gg); if(d/gg==1)simp=String(n/gg); out.push({t:`${n}/${d}`,a:simp,topic:'frac'})}return out}
function pick4(ans,topic){let s=new Set([ans]);let num=parseFloat(ans);while(s.size<4){let g=String((isNaN(num)?rand(2,99):num+rand(-9,9)));
 if(g!==ans && g!=='NaN' && g!=='0')s.add(g)}return[...s].sort(()=>Math.random()-.5).map(v=>({v,topic}))}
function combatPool(d){let set=[];if(d==='easy'){set=[].concat(mulPool([2,3,4,5],[2,3,4,5,6]),powPool(),rootPool(),fracPool())}
else if(d==='medium'){set=[].concat(mulPool([3,4,5,6,7],[4,5,6,7,8,9,10]),powPool(),rootPool(),fracPool())}
else{set=[].concat(mulPool([6,7,8,9],[6,7,8,9,10]),powPool(),rootPool(),fracPool())}return set.sort(()=>Math.random()-.5)}
const practicePool=(topic)=>[].concat(combatPool('easy'),combatPool('medium'),combatPool('hard')).filter(x=>x.topic===topic);

// ===== HUD
function last3Stats(){let h=COMHIST.slice(-3); if(h.length===0) return {acc:null,avg:null,mist:null};
let acc=h.reduce((s,x)=>s+(x.acc||0),0)/h.length; let avg=h.reduce((s,x)=>s+(x.avg||0),0)/h.length;
let mist=h.reduce((s,x)=>s+(x.bank||0),0)/h.length; return {acc,avg,mist}}
function drawSideHUD(){ if(MODE!=='combat') return;
  const s=last3Stats(); $('hudAcc').textContent=(s.acc==null)?'—':s.acc.toFixed(0)+'%';
  $('hudSpd').textContent=(s.avg==null)?'—':(s.avg/1000).toFixed(2)+'s';
  $('hudBank').textContent=(s.mist==null)?'—':s.mist.toFixed(2);
}
function updateLevelBadge(){
  const cMed=$('cMed'), cHard=$('cHard');
  // medium
  if(!UNL.medium){ cMed.classList.add('lockedBtn'); if(!cMed.querySelector('.lockIcon')){let i=document.createElement('span'); i.className='lockIcon'; i.textContent='🔒'; cMed.prepend(i)}}
  else{ cMed.classList.remove('lockedBtn'); cMed.querySelector('.lockIcon')?.remove() }
  // hard
  if(!UNL.hard){ cHard.classList.add('lockedBtn'); if(!cHard.querySelector('.lockIcon')){let i=document.createElement('span'); i.className='lockIcon'; i.textContent='🔐'; cHard.prepend(i)}}
  else{ cHard.classList.remove('lockedBtn'); cHard.querySelector('.lockIcon')?.remove() }
  $('medState').textContent= UNL.medium ? '(unlocked)' : '(locked)';
  $('medState').className= UNL.medium ? 'ok' : 'lock';
  $('hardState').textContent= UNL.hard ? '(unlocked)' : '(locked)';
  $('hardState').className= UNL.hard ? 'ok' : 'lock';
}

// ===== Runtime
function resetRuntime(){i=0;score=0;rts=[]}
function beginBattle(){ $('startWrap').style.display='none'; $('q').style.display='block'; render() }
function startCombat(diff){
  MODE='combat'; DIFF=diff; LENGTH=parseInt($('lenCombat').value||'20');
  qs=combatPool(DIFF).slice(0,LENGTH); total=qs.length;
  $('gameTitle').textContent=`Combat — ${diff[0].toUpperCase()+diff.slice(1)}`; enterGame(true)
}
function startPractice(topic){
  MODE='practice'; TOPIC=topic; LENGTH=parseInt($('lenPractice').value||'20');
  const next=(PCOUNT[TOPIC]||0)+1; isReview=(next%3===0)&&(PMIST[TOPIC]||[]).length>0;
  let pool=isReview?PMIST[TOPIC].slice():practicePool(TOPIC).sort(()=>Math.random()-.5);
  qs=(pool.length>=LENGTH?pool.slice(0,LENGTH):pool.concat(practicePool(TOPIC)).slice(0,LENGTH));
  total=qs.length;
  const map={m:'Multiplication',pow:'Exponents',root:'Roots',frac:'Fractions'};
  $('gameTitle').textContent=isReview?`Practice — ${map[TOPIC]} (Mistake Review)`: `Practice — ${map[TOPIC]}`;
  enterGame(false)
}
function enterGame(showSide){
  show('game'); $('side').style.display= showSide? 'block':'none';
  $('barFill').style.width='0%'; $('progress').textContent='0%'; $('opts').innerHTML='';
  $('q').style.display= showSide? 'none':'block'; $('startWrap').style.display= showSide? 'flex':'none';
  resetRuntime(); drawSideHUD(); if(MODE==='practice') render();
}
function render(){
  if(i>=total){ end(); return }
  const item=qs[i]; $('q').textContent=item.t;
  const ops=pick4(item.a,item.topic);
  $('opts').innerHTML=ops.map(o=>`<div class="opt" data-topic="${o.topic}" data-val="${o.v}">${o.v}</div>`).join("");
  [...document.querySelectorAll('.opt')].forEach(el=>el.addEventListener('click',()=>pick(el.getAttribute('data-val'),item.a,item)));
  $('barFill').style.width=(i/total*100)+'%'; $('progress').textContent=Math.round(i/total*100)+'%';
  window.__t=performance.now();
}
document.addEventListener('keydown',e=>{
  if(['1','2','3','4'].includes(e.key)){ let b=document.querySelectorAll('.opt')[parseInt(e.key)-1]; if(b) b.click(); }
});
function ensureMist(topic,item){PMIST[topic]=PMIST[topic]||[]; let idx=PMIST[topic].findIndex(x=>x.t===item.t&&x.a===item.a);
 if(idx===-1) PMIST[topic].push({t:item.t,a:item.a,streak:0}); savePMist()}
function markReview(topic,item,ok){let idx=PMIST[topic].findIndex(x=>x.t===item.t&&x.a===item.a);
 if(idx!==-1){PMIST[topic][idx].streak= ok ? (PMIST[topic][idx].streak||0)+1 : 0; savePMist()}}
function pick(v, a, item){
  const rt = performance.now() - window.__t;
  rts.push(rt);

  // הצגה ויזואלית של נכון/לא נכון
  document.querySelectorAll('.opt').forEach(n=>{
    if(n.getAttribute('data-val') === a) n.classList.add('correct');
    if(n.getAttribute('data-val') === v && v !== a) n.classList.add('wrong');
  });

  // בדיקת תשובה
  const ok = (v === a);
  if (ok) {
    score++;   // ✅ התיקון: לספור תשובות נכונות
    pling();   // צליל רק כשהתשובה נכונה
  }

  // לוגיקת טעויות במצב תרגול
  const topic = item.topic;
  if (MODE === 'practice') {
    if (!isReview && !ok) {
      ensureMist(topic, item);
    } else if (isReview) {
      markReview(topic, item, ok);
    }
  }

  // מעבר לשאלה הבאה
  setTimeout(()=>{ i++; render(); }, 150);
}


// ===== Confetti
function confetti(){
  const layer=$('confetti'); layer.classList.remove('hidden');
  const W=innerWidth,H=innerHeight;
  for(let k=0;k<160;k++){
    let d=document.createElement('div'); d.className='conf';
    d.style.left=Math.random()*W+'px'; d.style.top='-20px';
    d.style.background=`hsl(${Math.floor(Math.random()*360)},100%,60%)`;
    let fall=H+80+Math.random()*200,time=2200+Math.random()*800,rot=(Math.random()*720-360);
    d.animate([{transform:'translateY(0) rotate(0deg)'},{transform:`translateY(${fall}px) rotate(${rot}deg)`}],
      {duration:time,easing:'cubic-bezier(.2,.6,.2,1)'}); layer.appendChild(d);
    setTimeout(()=>layer.removeChild(d),time+60)
  }
  setTimeout(()=>layer.classList.add('hidden'),3100)
}

// ===== End Session
function end(){
  const acc=score/Math.max(1,total)*100;
  const avg=rts.reduce((x,y)=>x+y,0)/Math.max(1,rts.length);
  let removed=0;

  if(MODE==='practice'){
    PCOUNT[TOPIC]=(PCOUNT[TOPIC]||0)+1; savePCount();
    if(isReview){
      let keep=[];
      for(let it of (PMIST[TOPIC]||[])){ if((it.streak||0)>=2){ removed++; } else { keep.push(it) } }
      PMIST[TOPIC]=keep; savePMist();
      $('sumPracticeExtra').textContent=`Removed from mistake bank: ${removed}. Rule: each mistake is deleted only after TWO correct answers in TWO separate reviews (with two normal sessions in between).`;
    } else $('sumPracticeExtra').textContent='';
  } else {
    const bankCount=total-score;
    COMHIST.push({
  acc: acc,                 // accuracy %
  avg: avg,                 // avg response time
  bank: bankCount,          // mistakes in this battle
  correct: score,           // ✅ new - correct answers
  total: total,             // ✅ new - total questions
  ts: Date.now()
});
saveComHist();
$('sumPracticeExtra').textContent='';

    confetti();
    // Promotion by last-3 averages
    const last3=COMHIST.slice(-3);
    const pass= last3.length===3 && (
      last3.reduce((s,x)=>s+x.acc,0)/3>=95 &&
      last3.reduce((s,x)=>s+x.avg,0)/3<=1500 &&
      last3.reduce((s,x)=>s+x.bank,0)/3<=3
    );
    if(!UNL.medium && pass){UNL.medium=true; saveUnlocks()}
    else if(UNL.medium && !UNL.hard && pass){UNL.hard=true; saveUnlocks()}
  }
  $('sumLines').innerHTML=`Accuracy: ${acc.toFixed(0)}%<br>Avg Response: ${(avg/1000).toFixed(2)}s`;
  // Build correct buttons for summary screen
let btns = "";

if (MODE === 'combat') {
  btns += `<button id="btnAgain" class="bigbtn">⚔️ Another Battle</button>`;
} else {
  btns += `<button id="btnAgain" class="bigbtn">🔁 Another Practice</button>`;
}

$('summaryButtons').innerHTML = btns;

// re-bind button
$('btnAgain').addEventListener('click', () => {
  $('summary').style.display = 'none';
  if (MODE === 'combat') startCombat(DIFF);
  else startPractice(TOPIC);
});
  
$('summary').style.display = 'flex';   // <-- show the summary modal
  drawSideHUD();
}

// ===== Build HTML (mount once)
document.getElementById('app').innerHTML = `
  <!-- LOBBY -->
  <section id="lobby" class="center">
    <div class="box card">
      <h2>Zen Dragon Trainer</h2>
      <p>Sharpen the mind. Train the warrior.</p>
      <button id="toCombat" class="bigbtn">⚔️ Combat Mode</button>
      <button id="toPractice" class="bigbtn">📚 Practice Mode</button>
    </div>
  </section>

  <!-- COMBAT MENU -->
  <section id="combatMenu" class="center hidden">
    <div class="box card">
      <h3>Choose your battle</h3>
      <div class="badge"><strong>Levels:</strong> Easy • Medium <span id="medState" class="lock">(locked)</span> • Hard <span id="hardState" class="lock">(locked)</span></div>
      <div style="margin-top:12px;display:grid;gap:10px">
        <button id="cEasy" class="btn">Easy</button>
        <button id="cMed" class="btn">Medium</button>
        <button id="cHard" class="btn">Hard</button>
      </div>
      <div style="margin-top:16px">Length: <select id="lenCombat"><option>10</option><option selected>20</option><option>30</option></select></div>
      <div style="margin-top:14px"><button id="backFromCombat" class="btn">⬅️ Back</button></div>
    </div>
  </section>

  <!-- PRACTICE MENU -->
  <section id="practiceMenu" class="center hidden">
    <div class="box card">
      <h3>Pick a topic to practice</h3>
      <div style="margin-top:12px;display:grid;gap:10px">
        <button class="btn pTopic" data-topic="m">Multiplication</button>
        <button class="btn pTopic" data-topic="pow">Exponents</button>
        <button class="btn pTopic" data-topic="root">Roots</button>
        <button class="btn pTopic" data-topic="frac">Fractions</button>
      </div>
      <div style="margin-top:16px">Length: <select id="lenPractice"><option selected>20</option><option>30</option></select></div>
      <div style="margin-top:14px"><button id="backFromPractice" class="btn">⬅️ Back</button></div>
    </div>
  </section>

  <!-- GAME -->
  <section id="game" class="hidden">
    <div id="side" class="card">
      <div class="hudTitle">COMBAT HUD</div>
      <div class="metric"><div class="label">Accuracy (avg of last 3)</div><div id="hudAcc" class="value">—</div></div>
      <div class="metric"><div class="label">Avg Time (avg of last 3)</div><div id="hudSpd" class="value">—</div></div>
      <div class="metric"><div class="label">Mistakes / battle (avg of last 3)</div><div id="hudBank" class="value">—</div></div>
      <div class="hint">Targets (measured by <b>average of last 3 battles</b>): Acc ≥ <b>95%</b> • Avg ≤ <b>1.50s</b> • Mistakes ≤ <b>3</b>.</div>
    </div>
    <div id="main" class="card">
      <div id="homeBtn" class="topSwitch">Home</div>
      <h1 id="gameTitle">Zen Dragon</h1>
      <div class="bar"><span id="barFill"></span></div>
      <div id="startWrap"><button id="startBtn">Start Battle</button></div>
      <div id="q" class="q" style="display:none">×</div>
      <div id="opts" class="options"></div>
      <div id="progress" class="mini">0%</div>
    </div>
  </section>

 <!-- SUMMARY -->
<div id="summary" class="center">
  <div id="sumBox" class="card">
    <div style="font-weight:900">—— SESSION REPORT ——</div><br/>
    <div id="sumLines"></div><br/>
    <div id="sumPracticeExtra" style="margin-bottom:10px;"></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center">
      <div id="summaryButtons"></div>
      <button id="btnHome" class="bigbtn">🏠 Home</button>
    </div>
  </div>
</div>


  <div id="confetti" class="hidden"></div>
`;

// ===== Bindings
$('toCombat').addEventListener('click',()=>{MODE='combat';updateLevelBadge();show('combatMenu')});
$('toPractice').addEventListener('click',()=>{MODE='practice';show('practiceMenu')});
$('backFromCombat').addEventListener('click',()=>show('lobby'));
$('backFromPractice').addEventListener('click',()=>show('lobby'));
$('homeBtn').addEventListener('click',()=>show('lobby'));
$('cEasy').addEventListener('click',()=>startCombat('easy'));
$('cMed').addEventListener('click',()=>{ if(UNL.medium) startCombat('medium'); else { $('cMed').classList.remove('shake'); void $('cMed').offsetWidth; $('cMed').classList.add('shake'); }});
$('cHard').addEventListener('click',()=>{ if(UNL.hard) startCombat('hard'); else { $('cHard').classList.remove('shake'); void $('cHard').offsetWidth; $('cHard').classList.add('shake'); }});
document.querySelectorAll('.pTopic').forEach(b=>b.addEventListener('click',()=>startPractice(b.getAttribute('data-topic'))));
$('startBtn').addEventListener('click',beginBattle);
$('btnHome').addEventListener('click',()=>{ $('summary').style.display='none'; show('lobby') });

// Boot
updateLevelBadge(); show('lobby'); drawSideHUD();
