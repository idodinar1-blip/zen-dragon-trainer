/* Zen Dragon v9.7 — modular JS (fractions fix + dwell buffer + Goals UI) */

/* ========= Shortcuts ========= */
const $ = id => document.getElementById(id);
const show = elId => {
  ["lobby","combatMenu","practiceMenu","game"].forEach(k => $(k) && $(k).classList.add("hidden"));
  $(elId) && $(elId).classList.remove("hidden");
};
function pling(){
  try{
    let c=new (window.AudioContext||window.webkitAudioContext)(),
        o=c.createOscillator(),g=c.createGain();
    o.type='sine';o.frequency.value=880;g.gain.value=.0001;
    o.connect(g).connect(c.destination);o.start();
    g.gain.exponentialRampToValueAtTime(.15,c.currentTime+.01);
    g.gain.exponentialRampToValueAtTime(.0001,c.currentTime+.12);
    o.stop(c.currentTime+.13);
  }catch(e){}
}

/* ========= State ========= */
let MODE='combat', DIFF='easy', TOPIC='m', LENGTH=20;
let qs=[], i=0, score=0, total=0, rts=[], isReview=false;

let UNL   = JSON.parse(localStorage.getItem('zenUnlocks')||'{"medium":false,"hard":false}');
let COMHIST = JSON.parse(localStorage.getItem('zenCombatSessions')||'[]');
let PMIST = JSON.parse(localStorage.getItem('zenPracticeMistakesV2')||'{"m":[],"pow":[],"root":[],"frac":[]}');
let PCOUNT= JSON.parse(localStorage.getItem('zenPracticeCountsV2')||'{"m":0,"pow":0,"root":0,"frac":0}');

/* ======= User Goals (targets) ======= */
let TARGETS = JSON.parse(localStorage.getItem('zenTargets')||'{"acc":95,"avgMs":1500,"mist":3}');
function saveTargets(){ localStorage.setItem('zenTargets', JSON.stringify(TARGETS)); }

/* ======= Per-topic dwell buffer (ms) ======= */
const SLOW_BUFFER = { m:0, pow:0, root:120, frac:250 };

/* ======= Per-combat topic stats ======= */
let combatTopicStats = {
  m:    { seen: 0, wrong: 0 },
  pow:  { seen: 0, wrong: 0 },
  root: { seen: 0, wrong: 0 },
  frac: { seen: 0, wrong: 0 }
};
let combatTopicRts = { m:[], pow:[], root:[], frac:[] };

function resetCombatStats(){
  for(const k of ["m","pow","root","frac"]){
    combatTopicStats[k].seen=0; combatTopicStats[k].wrong=0;
    combatTopicRts[k]=[];
  }
}

const saveUnlocks=()=>localStorage.setItem('zenUnlocks',JSON.stringify(UNL));
const saveComHist=()=>localStorage.setItem('zenCombatSessions',JSON.stringify(COMHIST.slice(-6)));
const savePMist=()=>localStorage.setItem('zenPracticeMistakesV2',JSON.stringify(PMIST));
const savePCount=()=>localStorage.setItem('zenPracticeCountsV2',JSON.stringify(PCOUNT));

/* ========= Pools ========= */
const rand=(a,b)=>Math.floor(Math.random()*(b-a+1))+a;

const mulPool=(A,B)=>{
  let out=[];
  A.forEach(x=>B.forEach(y=>out.push({t:`${x}×${y}`,a:String(x*y),topic:'m'})));
  return out;
};
function powPool(){
  let out=[];
  for(let n=1;n<=14;n++) out.push({t:`${n}²`,a:String(n*n),topic:'pow'});
  for(let n=2;n<=6;n++) out.push({t:`${n}³`,a:String(n*n*n),topic:'pow'});
  out.push(
    {t:'2⁴',a:'16',topic:'pow'},{t:'3⁴',a:'81',topic:'pow'},
    {t:'2⁵',a:'32',topic:'pow'},{t:'2⁶',a:'64',topic:'pow'}
  );
  return out;
}
function rootPool(){
  let out=[];
  [4,9,16,25,36,49,64,81,100,121,144,169,196]
    .forEach(v=>out.push({t:`√${v}`,a:String(Math.sqrt(v)),topic:'root'}));
  [8,27,64,125,216]
    .forEach(v=>out.push({t:`³√${v}`,a:String(Math.cbrt(v)),topic:'root'}));
  [16,81]
    .forEach(v=>out.push({t:`⁴√${v}`,a:String(Math.round(Math.pow(v,1/4))),topic:'root'}));
  out.push({t:'⁵√32',a:'2',topic:'root'},{t:'⁶√64',a:'2',topic:'root'});
  return out;
}
function fracPool(){
  let out=[];
  for(let k=0;k<14;k++){
    let a=rand(2,9),b=rand(2,9),c=rand(2,9);
    let n=a*b,d=a*c;
    let g=(m,n)=>{while(n){[m,n]=[n,m%n]}return Math.abs(m)};
    let gg=g(n,d);
    let simp=(n/gg)+'/'+(d/gg);
    if (d/gg==1) simp=String(n/gg);
    out.push({t:`${n}/${d}`,a:simp,topic:'frac'});
  }
  return out;
}

/* ========= Answers (with smart FRACTION distractors) ========= */
function _gcd(a,b){ a=Math.abs(a); b=Math.abs(b); while(b){ [a,b]=[b,a%b]; } return a||1; }
function _simp(n,d){
  if(d===0) return "∞";
  const s=(d<0?-1:1); n*=s; d*=s;
  const g=_gcd(n,d); n/=g; d/=g;
  return d===1 ? String(n) : (n+"/"+d);
}
function _isFrac(str){ return typeof str==="string" && /^\s*-?\d+\s*\/\s*-?\d+\s*$/.test(str); }

function pick4(ans,topic){
  if(_isFrac(ans)){
    let [N,D] = ans.split("/").map(x=>parseInt(x.trim(),10));
    const g=_gcd(N,D); N/=g; D/=g;
    const set = new Set([ _simp(N,D) ]);

    const cand = [
      _simp(N+1, D), _simp(N-1, D),
      _simp(N, D+1), _simp(N, D-1),
      _simp(N+2, D), _simp(N, D+2),
      _simp(N*2, D*2),     // נראה "נכון" אבל שקול—הסימפליפיקציה תבטיח שונות
      _simp(N*2+1, D*2),
      _simp(N*3, D*2)
    ];
    for(const c of cand){
      if(set.size>=4) break;
      if(c!=="NaN" && c!=="Infinity" && c!=="-Infinity") set.add(c);
    }
    while(set.size<4){
      const n = N + (Math.floor(Math.random()*5)-2);
      const d = Math.max(2, D + (Math.floor(Math.random()*5)-2));
      set.add(_simp(n,d));
    }
    return [...set].sort(()=>Math.random()-.5).map(v=>({v,topic}));
  }

  // numeric answers (original behavior with small tweak)
  let s=new Set([ans]);
  let num=parseFloat(ans);
  while(s.size<4){
    let g = isNaN(num) ? String(rand(2,99)) : String(num + rand(-9,9));
    if(!s.has(g) && g!=='NaN') s.add(g);
  }
  return [...s].sort(()=>Math.random()-.5).map(v=>({v,topic}));
}

/* ========= HUD ========= */
function last3Stats(){
  let h=COMHIST.slice(-3);
  if(h.length===0) return {acc:null,avg:null,mist:null};
  let acc=h.reduce((s,x)=>s+(x.acc||0),0)/h.length;
  let avg=h.reduce((s,x)=>s+(x.avg||0),0)/h.length;
  let mist=h.reduce((s,x)=>s+(x.bank||0),0)/h.length;
  return {acc,avg,mist};
}
function hudHintText(){
  return `Targets (avg of last 3): Acc ≥ <b>${TARGETS.acc}%</b> • Avg ≤ <b>${(TARGETS.avgMs/1000).toFixed(2)}s</b> • Mistakes ≤ <b>${TARGETS.mist}</b>.`;
}
function drawSideHUD(){
  if(MODE!=='combat') return;
  const s=last3Stats();
  $('hudAcc').textContent=(s.acc==null)?'—':s.acc.toFixed(0)+'%';
  $('hudSpd').textContent=(s.avg==null)?'—':(s.avg/1000).toFixed(2)+'s';
  $('hudBank').textContent=(s.mist==null)?'—':s.mist.toFixed(2);

  const last3 = COMHIST.slice(-3);
  const dwellSet = new Set(), errSet=new Set();
  for (let r of last3){
    if (!r) continue;
    (r.weakDwellList||[]).forEach(w=>dwellSet.add(w));
    (r.weakErrList||[]).forEach(w=>errSet.add(w));
  }
  const dwellArr = Array.from(dwellSet);
  const errArr = Array.from(errSet).filter(x => !dwellSet.has(x));
  const dwellHTML = dwellArr.map(w => `⏱ <b>${w}</b>`).join(', ');
  const errHTML   = errArr.map(w => `✖ ${w}`).join(', ');
  $('hudWeak').innerHTML = (dwellHTML||errHTML) ? [dwellHTML,errHTML].filter(Boolean).join(', ') : '—';

  // update hint line with current targets
  const hintEl = document.querySelector('.hint');
  if (hintEl) hintEl.innerHTML = hudHintText();
}

function updateLevelBadge(){
  const cMed=$('cMed'), cHard=$('cHard');
  if(!UNL.medium){
    cMed.classList.add('lockedBtn');
    if(!cMed.querySelector('.lockIcon')){
      let i=document.createElement('span');
      i.className='lockIcon'; i.textContent='🔒'; cMed.prepend(i);
    }
  } else {
    cMed.classList.remove('lockedBtn'); cMed.querySelector('.lockIcon') && cMed.querySelector('.lockIcon').remove();
  }
  if(!UNL.hard){
    cHard.classList.add('lockedBtn');
    if(!cHard.querySelector('.lockIcon')){
      let i=document.createElement('span');
      i.className='lockIcon'; i.textContent='🔐'; cHard.prepend(i);
    }
  } else {
    cHard.classList.remove('lockedBtn'); cHard.querySelector('.lockIcon') && cHard.querySelector('.lockIcon').remove();
  }
  $('medState').textContent= UNL.medium ? '(unlocked)' : '(locked)';
  $('medState').className= UNL.medium ? 'ok' : 'lock';
  $('hardState').textContent= UNL.hard ? '(unlocked)' : '(locked)';
  $('hardState').className= UNL.hard ? 'ok' : 'lock';
}

/* ========= Runtime ========= */
function resetRuntime(){ i=0; score=0; rts=[]; }
function beginBattle(){ $('startWrap').style.display='none'; $('q').style.display='block'; render(); }
function startCombat(diff){
  MODE='combat'; DIFF=diff; LENGTH=parseInt($('lenCombat').value||'20');
  qs=combatPool(DIFF).slice(0,LENGTH); total=qs.length;
  $('gameTitle').textContent=`Combat — ${diff[0].toUpperCase()+diff.slice(1)}`;
  resetCombatStats(); enterGame(true);
}
function startPractice(topic){
  MODE='practice'; TOPIC=topic; LENGTH=parseInt($('lenPractice').value||'20');
  const next=(PCOUNT[TOPIC]||0)+1;
  isReview=(next%3===0)&&(PMIST[TOPIC]||[]).length>0;

  let pool=isReview?PMIST[TOPIC].slice():practicePool(TOPIC).sort(()=>Math.random()-.5);
  qs=(pool.length>=LENGTH?pool.slice(0,LENGTH):pool.concat(practicePool(TOPIC)).slice(0,LENGTH));
  total=qs.length;

  const map={m:'Multiplication',pow:'Exponents',root:'Roots',frac:'Fractions'};
  $('gameTitle').textContent=isReview?`Practice — ${map[TOPIC]} (Mistake Review)`:`Practice — ${map[TOPIC]}`;
  enterGame(false);
}
function enterGame(showSide){
  show('game');
  $('side').style.display= showSide? 'block':'none';
  $('barFill').style.width='0%'; $('progress').textContent='0%'; $('opts').innerHTML='';
  $('q').style.display= showSide? 'none':'block';
  $('startWrap').style.display= showSide? 'flex':'none';
  resetRuntime(); drawSideHUD();
  if(MODE==='practice') render();
}

function render(){
  if(i>=total){ end(); return; }
  const item=qs[i];
  $('q').textContent=item.t;
  const ops=pick4(item.a,item.topic);
  $('opts').innerHTML=ops.map(o=>`<div class="opt" data-topic="${o.topic}" data-val="${o.v}">${o.v}</div>`).join("");
  var nodes=document.querySelectorAll('.opt');
  for(var z=0; z<nodes.length; z++){
    (function(el){
      el.addEventListener('click', function(){
        pick(el.getAttribute('data-val'), item.a, item);
      });
    })(nodes[z]);
  }
  $('barFill').style.width=(i/total*100)+'%';
  $('progress').textContent=Math.round(i/total*100)+'%';
  window.__t=performance.now();
}
document.addEventListener('keydown',function(e){
  if(['1','2','3','4'].indexOf(e.key)!==-1){
    var idx=parseInt(e.key)-1;
    var btns=document.querySelectorAll('.opt');
    if(btns[idx]) btns[idx].click();
  }
});

function ensureMist(topic,item){
  PMIST[topic]=PMIST[topic]||[];
  let idx=PMIST[topic].findIndex(x=>x.t===item.t&&x.a===item.a);
  if(idx===-1) PMIST[topic].push({t:item.t,a:item.a,streak:0});
  savePMist();
}
function markReview(topic,item,ok){
  let idx=PMIST[topic].findIndex(x=>x.t===item.t&&x.a===item.a);
  if(idx!==-1){
    PMIST[topic][idx].streak= ok ? (PMIST[topic][idx].streak||0)+1 : 0;
    savePMist();
  }
}

function pick(v,a,item){
  const rt=performance.now()-window.__t;
  rts.push(rt);

  var options=document.querySelectorAll('.opt');
  for(var k=0;k<options.length;k++){
    var n=options[k];
    if(n.getAttribute('data-val')===a) n.classList.add('correct');
    if(n.getAttribute('data-val')===v && v!==a) n.classList.add('wrong');
  }

  const ok=(v===a);

  if (MODE === 'combat') {
    const t = item.topic;
    if (combatTopicStats[t]) {
      combatTopicStats[t].seen++;
      if (!ok) combatTopicStats[t].wrong++;
    }
    if (combatTopicRts[t]) combatTopicRts[t].push(rt);
  }

  if(ok){ score++; pling(); }

  const topic=item.topic;
  if(MODE==='practice'){
    if(!isReview && !ok) ensureMist(topic,item);
    else if(isReview)    markReview(topic,item,ok);
  }

  setTimeout(function(){ i++; render(); },150);
}

/* ========= Confetti ========= */
function confetti(){
  const layer=$('confetti'); layer.classList.remove('hidden');
  const W=innerWidth,H=innerHeight;
  for(let k=0;k<160;k++){
    let d=document.createElement('div'); d.className='conf';
    d.style.left=Math.random()*W+'px'; d.style.top='-20px';
    d.style.background='hsl('+(Math.floor(Math.random()*360))+',100%,60%)';
    let fall=H+80+Math.random()*200,time=2200+Math.random()*800,rot=(Math.random()*720-360);
    d.animate(
      [{transform:'translateY(0) rotate(0deg)'},
       {transform:'translateY('+fall+'px) rotate('+rot+'deg)'}],
      {duration:time,easing:'cubic-bezier(.2,.6,.2,1)'}
    );
    layer.appendChild(d);
    setTimeout((function(dd){return function(){ if(dd.parentNode) dd.parentNode.removeChild(dd); };})(d),time+60);
  }
  setTimeout(function(){ layer.classList.add('hidden'); },3100);
}

/* ========= End Session ========= */
function end(){
  const acc = score / Math.max(1, total) * 100;
  const avg = rts.reduce((x,y)=>x+y,0) / Math.max(1, rts.length);
  let removed = 0;

  if (MODE === 'practice') {
    PCOUNT[TOPIC] = (PCOUNT[TOPIC] || 0) + 1; savePCount();

    if (isReview) {
      let keep = [];
      for (let it of (PMIST[TOPIC] || [])) {
        if ((it.streak || 0) >= 2) { removed++; } else { keep.push(it); }
      }
      PMIST[TOPIC] = keep; savePMist();
      $('sumPracticeExtra').textContent =
        'Removed from mistake bank: '+removed+'. Rule: each mistake is deleted only after TWO correct answers in TWO separate reviews (with two normal sessions in between).';
    } else {
      $('sumPracticeExtra').textContent = '';
    }

  } else {
    const bankCount = total - score;
    const topicMap = { m:"Multiplication", pow:"Exponents", root:"Roots", frac:"Fractions" };

    // ≥40% errors
    const weakErrList = Object.keys(combatTopicStats)
      .filter(k => combatTopicStats[k].seen>0 && (combatTopicStats[k].wrong / combatTopicStats[k].seen) >= 0.4)
      .map(k => topicMap[k]);

    // >50% slower than (avg + buffer)
    const weakDwellList = Object.keys(combatTopicRts)
      .filter(k => {
        const arr = combatTopicRts[k]; if(!arr.length) return false;
        const thr = avg + (SLOW_BUFFER[k]||0);
        const slow = arr.filter(v=>v>thr).length;
        return (slow/arr.length) > 0.5;
      })
      .map(k => topicMap[k]);

    COMHIST.push({
      acc, avg, bank: bankCount, correct: score, total,
      weakErrList, weakDwellList, ts: Date.now()
    });

    resetCombatStats();
    saveComHist();
    $('sumPracticeExtra').textContent = '';
    confetti();
  }

  $('sumLines').innerHTML =
    'Accuracy: '+acc.toFixed(0)+'%<br>Avg Response: '+(avg/1000).toFixed(2)+'s';

  const btns = (MODE === 'combat')
    ? '<button id="btnAgain" class="bigbtn">⚔️ Another Battle</button>'
    : '<button id="btnAgain" class="bigbtn">🔁 Another Practice</button>';

  $('summaryButtons').innerHTML = btns;

  $('btnAgain').onclick = function(){
    $('summary').style.display = 'none';
    if (MODE === 'combat') startCombat(DIFF);
    else startPractice(TOPIC);
  };

  $('summary').style.display = 'flex';
  drawSideHUD();
}

/* ========= Template ========= */
document.getElementById('app').innerHTML = `
  <!-- LOBBY -->
  <section id="lobby" class="center">
    <div class="box card" style="max-width:720px;width:92%;text-align:center">
      <h2>Zen Dragon Trainer</h2>
      <p>Sharpen the mind. Train the warrior.</p>
      <button id="toCombat" class="bigbtn">⚔️ Combat Mode</button>
      <button id="toPractice" class="bigbtn">📚 Practice Mode</button>
      <button id="instructionsBtn" class="bigbtn">📖 Instructions</button>
      <button id="targetsBtn" class="bigbtn">🎯 Goals</button>
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
      <div style="margin-top:16px">Length:
        <select id="lenCombat"><option>10</option><option selected>20</option><option>30</option></select>
      </div>
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
      <div style="margin-top:16px">Length:
        <select id="lenPractice"><option selected>20</option><option>30</option></select>
      </div>
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
      <div class="metric"><div class="label">Weak Topics (last 3)</div><div id="hudWeak" class="value">—</div></div>
      <div class="hint">${hudHintText()}</div>
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
  <div id="summary" class="center" style="display:none">
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

/* ========= Bindings ========= */
$('toCombat').addEventListener('click',function(){MODE='combat';updateLevelBadge();show('combatMenu')});
$('toPractice').addEventListener('click',function(){MODE='practice';show('practiceMenu')});
$('backFromCombat').addEventListener('click',function(){show('lobby')});
$('backFromPractice').addEventListener('click',function(){show('lobby')});
$('homeBtn').addEventListener('click',function(){show('lobby')});
$('cEasy').addEventListener('click',function(){startCombat('easy')});
$('cMed').addEventListener('click',function(){ if(UNL.medium) startCombat('medium'); else { $('cMed').classList.remove('shake'); void $('cMed').offsetWidth; $('cMed').classList.add('shake'); }});
$('cHard').addEventListener('click',function(){ if(UNL.hard) startCombat('hard'); else { $('cHard').classList.remove('shake'); void $('cHard').offsetWidth; $('cHard').classList.add('shake'); }});
document.querySelectorAll('.pTopic').forEach(b=>b.addEventListener('click',()=>startPractice(b.getAttribute('data-topic'))));
$('startBtn').addEventListener('click',beginBattle);
$('btnHome').addEventListener('click',function(){ $('summary').style.display='none'; show('lobby') });

/* ========= Instructions Modal (dynamic, so index.html לא חייב לשנות) ========= */
(function injectInstructionsModal(){
  if (document.getElementById('instructionsModal')) return; // אם קיים באינדקס, לא מוסיף כפול
  const modalHTML = `
  <div id="instructionsModal" class="hidden" style="
      position:fixed; inset:0; display:flex; align-items:center; justify-content:center;
      background:rgba(0,0,0,.65); z-index:1000;">
    <div style="max-width:880px; width:92%; max-height:90vh; overflow:auto;
                background:#0f1830; color:#e8eeff; border:1px solid #27345d; border-radius:16px; padding:24px;">
      <div style="display:flex; gap:8px; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <button id="insClose" class="btn">✖</button>
        <div style="display:flex; gap:8px;">
          <button id="insLang" class="btn">עברית</button>
        </div>
      </div>
      <div id="insContent" style="font-size:16px; line-height:1.55;"></div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', modalHTML);
})();

const INS_HE = `
<div dir="rtl" style="text-align:right">
<h2>הוראות שימוש</h2>

<h3>מה המטרה?</h3>
אימון ממוקד לפיתוח מהירות, דיוק וביטחון בחישוב בראש: לוח כפל, חזקות, שורשים ושברים.
המשחק מאתר את החולשות שלך בזמן אמת ודוחף אותך להשתפר בצורה חכמה והדרגתית.

<h3>מצבי משחק</h3>
<b>⚔️ מצב קרב (Combat)</b><br>
תרגול משולב מכל הנושאים, לפי רמת קושי. לאחר כל קרב תופיע טבלת הישגים, ניתוח ביצועים, והמלצה מדויקת מה לחזק.

<br><br>
<b>📚 מצב תרגול (Practice)</b><br>
בחירה של נושא אחד והעמקה בו. טעויות נשמרות ומופיעות מחדש באימון ייעודי לנטרול חולשות לאורך זמן.

<h3>איך מתחילים?</h3>
בוחרים רמה → Start Battle. הזמן מתחיל להימדד רק מהרגע שלוחצים על Start.

<h3>איך עונים?</h3>
מקשי 1–4 או לחיצה על האפשרות במסך. תשובה נכונה תנגן צליל קצר.

<h3>קריטריונים לעליית רמה</h3>
(ממוצע של 3 הקרבות האחרונים)<br>
• דיוק ≥ 95%<br>
• זמן ממוצע לשאלה ≤ 1.50 שניות<br>
• ≤ 3 טעויות לקרב

<h3>ה־HUD (לוח התקדמות בצד)</h3>
מציג נתונים משלושת הקרבות האחרונים: דיוק ממוצע, זמן תשובה ממוצע, כמות טעויות, ו־Weak Topics — נושאים לחיזוק.

<h3>איך מזוהות חולשות?</h3>
<b>⏱ זמן תגובה איטי:</b> אם ביותר מ־50% מהשאלות בנושא מסוים היית איטי מהממוצע שלך — הנושא יסומן לעדיפות תרגול (מופיע ראשון).<br>
<b>✖ שיעור טעויות גבוה:</b> אם טעית ב־40% ומעלה מהשאלות בנושא. הנושאים האיטיים מוצגים קודם (זמן הוא אויב משמעותי בפסיכומטרי).

<h3>איך עובדת מערכת תיקון טעויות?</h3>
בתרגול, כל טעות נשמרת. כדי למחוק אותה צריך לענות עליה נכון פעמיים בשני סשנים נפרדים של Review (וביניהם שני אימונים רגילים).
כך מיומנות נבנית יציב — לא במקרה.

<h3>טיפ חשוב</h3>
אל תיעצר על שאלה. זרום. המערכת תחזיר אותך בדיוק למה שדורש חיזוק — אתה מתאמן, לא נבחן.
</div>
`;
const INS_EN = `
<h2>Instructions</h2>

<h3>Purpose</h3>
Boost mental calculation speed, accuracy, and confidence — multiplication, powers, roots, and fractions.
The system tracks weaknesses in real time and adapts training gradually for smart improvement.

<h3>Game Modes</h3>
<b>⚔️ Combat</b><br>
Mixed questions by difficulty. After each battle you get a performance report and precise recommendations.

<br><br>
<b>📚 Practice</b><br>
Focus on a single topic. Mistakes are saved and resurfaced in structured review sessions to eliminate weaknesses over time.

<h3>How to start</h3>
Choose difficulty → Start Battle. Timing begins only after you press Start.

<h3>How to answer</h3>
Keys 1–4 or click. A short chime plays on correct answers.

<h3>Ranking up (avg of last 3 battles)</h3>
• Accuracy ≥ 95%<br>
• Avg response ≤ 1.50s<br>
• ≤ 3 mistakes per battle

<h3>HUD (side panel)</h3>
Shows averages from your last 3 battles: accuracy, response speed, mistakes, and Weak Topics to target.

<h3>Weakness detection</h3>
<b>⏱ Slow:</b> >50% of a topic’s questions were slower than your battle average + buffer → speed priority (listed first).<br>
<b>✖ Errors:</b> ≥40% wrong in a topic → targeted for accuracy.

<h3>Mistake Bank</h3>
In practice mode, mistakes stay saved. To erase one, answer it correctly twice in two separate reviews with normal sessions in between.

<h3>Pro tip</h3>
Don’t freeze. Flow. The system will circle back and drill exactly what you need.
`;

let INS_LANG = 'en';
function renderInstructions(){
  const box = $('insContent');
  if (!box) return;
  if (INS_LANG === 'en') {
    box.innerHTML = INS_EN;
    $('insLang').textContent = 'עברית';
    box.removeAttribute('dir'); box.style.textAlign = 'start';
  } else {
    box.innerHTML = INS_HE;
    $('insLang').textContent = 'English';
    box.setAttribute('dir','rtl'); box.style.textAlign = 'right';
  }
}
document.addEventListener('click', (e)=>{
  if (e.target && e.target.id === 'instructionsBtn') {
    const modal = $('instructionsModal');
    if (modal){ modal.classList.remove('hidden'); renderInstructions(); }
  }
  if (e.target && e.target.id === 'insClose') { $('instructionsModal')?.classList.add('hidden'); }
  if (e.target && e.target.id === 'insLang') { INS_LANG = (INS_LANG === 'en') ? 'he' : 'en'; renderInstructions(); }
});

/* ========= Goals (Targets) Modal ========= */
(function injectTargetsModal(){
  if (document.getElementById('targetsModal')) return;
  const html = `
  <div id="targetsModal" class="hidden" style="
    position:fixed; inset:0; display:flex; align-items:center; justify-content:center;
    background:rgba(0,0,0,.65); z-index:1001;">
    <div class="card" style="max-width:560px;width:92%;padding:22px;background:#0f1830;border:1px solid #27345d">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <h3 style="margin:0">🎯 Set Goals</h3>
        <button id="tgClose" class="btn">✖</button>
      </div>
      <div style="display:grid;gap:12px">
        <label>Accuracy ≥ <input id="tgAcc" type="number" min="50" max="100" step="1" style="width:88px"> %</label>
        <label>Avg. time ≤ <input id="tgAvg" type="number" min="300" max="5000" step="10" style="width:88px"> ms</label>
        <label>Mistakes ≤ <input id="tgMist" type="number" min="0" max="20" step="1" style="width:88px"></label>
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px">
        <button id="tgReset" class="btn">Reset Defaults</button>
        <button id="tgSave" class="btn">Save</button>
      </div>
      <div style="font-size:12px;color:#cfe2ff;opacity:.85;margin-top:8px">
        These goals affect the HUD targets and your personal benchmarks (no auto-unlock).
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
})();
function openTargets(){
  $('tgAcc').value = TARGETS.acc;
  $('tgAvg').value = TARGETS.avgMs;
  $('tgMist').value= TARGETS.mist;
  $('targetsModal').classList.remove('hidden');
}
function closeTargets(){ $('targetsModal').classList.add('hidden'); }
function saveTargetsFromUI(){
  TARGETS.acc   = Math.max(50, Math.min(100, parseInt($('tgAcc').value||TARGETS.acc)));
  TARGETS.avgMs = Math.max(300, Math.min(5000, parseInt($('tgAvg').value||TARGETS.avgMs)));
  TARGETS.mist  = Math.max(0,  Math.min(20,  parseInt($('tgMist').value||TARGETS.mist)));
  saveTargets();
  // refresh hint text wherever we are
  document.querySelectorAll('.hint').forEach(h=>h.innerHTML = hudHintText());
  closeTargets();
}
document.addEventListener('click', (e)=>{
  if(e.target && e.target.id==='targetsBtn') openTargets();
  if(e.target && e.target.id==='tgClose') closeTargets();
  if(e.target && e.target.id==='tgSave') saveTargetsFromUI();
  if(e.target && e.target.id==='tgReset'){
    TARGETS = { acc:95, avgMs:1500, mist:3 }; saveTargets();
    $('tgAcc').value=TARGETS.acc; $('tgAvg').value=TARGETS.avgMs; $('tgMist').value=TARGETS.mist;
    document.querySelectorAll('.hint').forEach(h=>h.innerHTML = hudHintText());
  }
});

/* ========= Boot ========= */
updateLevelBadge(); show('lobby'); drawSideHUD();


