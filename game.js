/* Zen Dragon v10.2 — Mistake Review freeze fixed; per-difficulty unlocks; targets modal wired */

// ========= Shortcuts =========
const $ = id => document.getElementById(id);
const $qs = (sel, root=document) => Array.from(root.querySelectorAll(sel));

const show = elId => {
  ["lobby","combatMenu","practiceMenu","game"].forEach(k => $(k) && $(k).classList.add("hidden"));
  $(elId) && $(elId).classList.remove("hidden");
};

function pling(){
  try{
    const C = new (window.AudioContext||window.webkitAudioContext)();
    const o = C.createOscillator();
    const g = C.createGain();
    o.type='sine'; o.frequency.value=880; g.gain.value=.0001;
    o.connect(g).connect(C.destination); o.start();
    g.gain.exponentialRampToValueAtTime(.15, C.currentTime+.01);
    g.gain.exponentialRampToValueAtTime(.0001, C.currentTime+.12);
    o.stop(C.currentTime+.13);
  }catch(e){ /* ignore */ }
}

// ========= State =========
let MODE='combat', DIFF='easy', TOPIC='m', LENGTH=20;
let qs=[], i=0, score=0, total=0, rts=[], isReview=false;

// Persistence
let UNL      = JSON.parse(localStorage.getItem('zenUnlocks')||'{"medium":false,"hard":false}');
let COMHIST  = JSON.parse(localStorage.getItem('zenCombatSessions')||'[]'); // each: {diff, acc, avg, bank, correct, total, ts}
let PMIST    = JSON.parse(localStorage.getItem('zenPracticeMistakesV2')||'{"m":[],"pow":[],"root":[],"frac":[]}');
let PCOUNT   = JSON.parse(localStorage.getItem('zenPracticeCountsV2')||'{"m":0,"pow":0,"root":0,"frac":0}');
let TARGETS  = JSON.parse(localStorage.getItem('zenTargets')||'{"acc":95,"avgMs":1500,"mist":3}');

function saveTargets(){ localStorage.setItem('zenTargets', JSON.stringify(TARGETS)); }
const saveUnlocks=()=>localStorage.setItem('zenUnlocks',JSON.stringify(UNL));
const saveComHist=()=>localStorage.setItem('zenCombatSessions',JSON.stringify(COMHIST.slice(-60)));
const savePMist=()=>localStorage.setItem('zenPracticeMistakesV2',JSON.stringify(PMIST));
const savePCount=()=>localStorage.setItem('zenPracticeCountsV2',JSON.stringify(PCOUNT));

// Dwell buffers (ms) for roots/fractions
const SLOW_BUFFER = { m:0, pow:0, root:120, frac:250 };

// Per-combat topic stats (for HUD & weak topic detection)
let combatTopicStats = { m:{seen:0,wrong:0}, pow:{seen:0,wrong:0}, root:{seen:0,wrong:0}, frac:{seen:0,wrong:0} };
let combatTopicRts   = { m:[], pow:[], root:[], frac:[] };
function resetCombatStats(){
  for (const k of ["m","pow","root","frac"]) {
    combatTopicStats[k].seen=0; combatTopicStats[k].wrong=0; combatTopicRts[k]=[];
  }
}

// ========= Pools =========
const rand=(a,b)=>Math.floor(Math.random()*(b-a+1))+a;
const mulPool=(A,B)=>{ let out=[]; A.forEach(x=>B.forEach(y=>out.push({t:`${x}×${y}`,a:String(x*y),topic:'m'}))); return out; };
function powPool(){
  let out=[];
  for(let n=1;n<=14;n++) out.push({t:`${n}²`,a:String(n*n),topic:'pow'});
  for(let n=2;n<=6;n++) out.push({t:`${n}³`,a:String(n*n*n),topic:'pow'});
  out.push({t:'2⁴',a:'16',topic:'pow'},{t:'3⁴',a:'81',topic:'pow'},{t:'2⁵',a:'32',topic:'pow'},{t:'2⁶',a:'64',topic:'pow'});
  return out;
}
function rootPool(){
  let out=[];
  [4,9,16,25,36,49,64,81,100,121,144,169,196].forEach(v=>out.push({t:`√${v}`,a:String(Math.sqrt(v)),topic:'root'}));
  [8,27,64,125,216].forEach(v=>out.push({t:`³√${v}`,a:String(Math.cbrt(v)),topic:'root'}));
  [16,81].forEach(v=>out.push({t:`⁴√${v}`,a:String(Math.round(Math.pow(v,1/4))),topic:'root'}));
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

// ========= FRACTIONS helpers & pick4 =========
function _gcd(a,b){ a=Math.abs(a); b=Math.abs(b); while(b){ [a,b]=[b,a%b]; } return a||1; }
function _simpPair(N,D){ if(D===0) return [1,0]; const s=(D<0?-1:1); N*=s; D*=s; const g=_gcd(N,D); return [N/g, D/g]; }
function _fmt(N,D){ return (D===1) ? String(N) : (N+"/"+D); }
function _isFracStr(str){ return typeof str==="string" && /^\s*-?\d+\s*\/\s*-?\d+\s*$/.test(str); }

function pick4(ans,topic){
  // four options: 1 correct + 3 plausible distractors
  const opts = [];
  const push = (v,t=topic)=>{ if(!opts.some(o=>o.v===v)) opts.push({v,topic:t}); };
  if(_isFracStr(ans)){
    let [n0,d0] = ans.split('/').map(x=>parseInt(x.trim(),10));
    [n0,d0] = _simpPair(n0,d0);
    push(_fmt(n0,d0));
    // equivalent fraction
    const k = rand(2,4);
    push(_fmt(n0*k, d0*k));
    // off-by-one numerator or denominator simplified
    const [n1,d1] = _simpPair(n0+1, d0);
    push(_fmt(n1,d1));
    const [n2,d2] = _simpPair(n0, d0+1);
    push(_fmt(n2,d2));
  } else if (!isNaN(parseFloat(ans))) {
    const core = parseInt(ans,10);
    push(String(core));
    push(String(core + rand(1,3)));
    push(String(core - rand(1,3)));
    push(String(core + (rand(0,1)?10:-10)));
  } else {
    push(String(ans));
    push(String(ans)+'?'); push(String(Math.random()*100|0)); push(String(rand(1,12)));
  }
  // ensure exactly 4 shuffled
  while(opts.length<4) push(String(rand(1,99)));
  return opts.slice(0,4).sort(()=>Math.random()-.5);
}

// ========= Build combat/practice pools =========
function combatPool(diff){
  // diff affects composition and range
  const baseM = diff==='easy'  ? mulPool([2,3,4,5,6,7],[2,3,4,5,6,7])
              : diff==='medium'? mulPool([3,4,6,7,8,9],[3,4,6,7,8,9])
              :                  mulPool([7,8,9,11,12],[7,8,9,11,12]);
  const P = powPool();
  const R = rootPool();
  const F = fracPool();
  const all = baseM.concat(P,R,F).sort(()=>Math.random()-.5);
  return all;
}
function practicePool(topic){
  if(topic==='m') return mulPool([2,3,4,5,6,7,8,9],[2,3,4,5,6,7,8,9]).sort(()=>Math.random()-.5);
  if(topic==='pow') return powPool().sort(()=>Math.random()-.5);
  if(topic==='root') return rootPool().sort(()=>Math.random()-.5);
  return fracPool().sort(()=>Math.random()-.5);
}

// ========= Runtime =========
function resetRuntime(){ i=0; score=0; rts=[]; }
function beginBattle(){ $('startWrap').style.display='none'; $('q').style.display='block'; render(); }

function startCombat(diff){
  MODE='combat'; DIFF=diff; LENGTH=parseInt($('lenCombat').value||'20');
  qs = combatPool(DIFF).slice(0,LENGTH); total = qs.length;
  $('gameTitle').textContent = `Combat — ${diff[0].toUpperCase()+diff.slice(1)}`;
  resetCombatStats(); enterGame(true);
}

function startPractice(topic){
  MODE='practice'; TOPIC=topic; LENGTH=parseInt($('lenPractice').value||'20');
  const next=(PCOUNT[TOPIC]||0)+1;
  isReview=(next%3===0)&&(PMIST[TOPIC]||[]).length>0;

  let pool = isReview
    ? PMIST[TOPIC].slice().map(it => it.topic ? it : ({...it, topic: TOPIC})) // ensure topic exists (FIX)
    : practicePool(TOPIC).sort(()=>Math.random()-.5);

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

// ========= Render & Pick =========
let t0=0;
function render(){
  if(i>=total){ end(); return; }
  const item=qs[i];
  $('q').textContent=item.t;
  const ops=pick4(item.a, item.topic || TOPIC); // use topic fallback (FIX)
  $('opts').innerHTML=ops.map((o,idx)=>`<div class="opt" data-topic="${o.topic}" data-val="${o.v}">${o.v}</div>`).join("");
  $qs('.opt').forEach((el, idx)=>{
    el.addEventListener('click', ()=> pick(el.getAttribute('data-val'), el.getAttribute('data-topic') || item.topic || TOPIC, el));
  });
  t0=performance.now();
}

function ensureMist(topic,item){
  PMIST[topic]=PMIST[topic]||[];
  let idx=PMIST[topic].findIndex(x=>x.t===item.t && x.a===item.a);
  if(idx===-1) PMIST[topic].push({t:item.t,a:item.a,topic:topic,streak:0}); // include topic (FIX)
  savePMist();
}

function markReview(topic,item,ok){
  const t = topic || item.topic || TOPIC; // robust topic resolution (FIX)
  PMIST[t]=PMIST[t]||[];
  let idx=PMIST[t].findIndex(x=>x.t===item.t && x.a===item.a);
  if(idx!==-1){
    PMIST[t][idx].streak = ok ? (PMIST[t][idx].streak||0)+1 : 0;
    savePMist();
  }
}

function maybeClearFromMistakes(topic,item){
  const t = topic || item.topic || TOPIC;
  PMIST[t]=PMIST[t]||[];
  let idx=PMIST[t].findIndex(x=>x.t===item.t && x.a===item.a);
  if(idx!==-1 && (PMIST[t][idx].streak||0)>=2){
    PMIST[t].splice(idx,1);
    savePMist();
  }
}

function pick(v, topic, el){
  const item=qs[i];
  const dt=performance.now()-t0;

  // HUD stats per topic during combat
  if(MODE==='combat'){
    const k=item.topic||topic||TOPIC;
    combatTopicStats[k].seen++;
    combatTopicRts[k].push(dt);
  }

  const ok = (String(v)===String(item.a));
  if(ok){ pling(); el && el.classList.add('correct'); score++; }
  else { el && el.classList.add('wrong'); }

  // practice mistakes bank maintenance
  if(MODE==='practice'){
    if(ok){
      if(isReview){ markReview(topic,item,true); maybeClearFromMistakes(topic,item); }
    }else{
      ensureMist(topic,item); markReview(topic,item,false);
    }
  }else{
    // MODE===combat: track wrongs
    if(!ok){ combatTopicStats[(item.topic||topic||TOPIC)].wrong++; }
  }

  rts.push(dt);
  // progress bar & mini text
  const p = Math.round(((i+1)/total)*100);
  $('barFill').style.width = p+'%';
  $('progress').textContent = p+'%';
  // delay a tick then advance
  setTimeout(()=>{
    i++;
    if(i>=total) end();
    else render();
  }, ok? 120 : 220);
}

// ========= End & Summary =========
function avgArr(a){ return a.length? a.reduce((s,x)=>s+x,0)/a.length : 0; }

function maybeUnlockImmediate(){
  // check last 3 battles per difficulty meet TARGETS
  const diffs=['easy','medium','hard'];
  diffs.forEach(d=>{
    const last3 = COMHIST.filter(s=>s.diff===d).slice(-3);
    if(last3.length<3) return;
    const acc = avgArr(last3.map(s=>s.acc));
    const avg = avgArr(last3.map(s=>s.avg));
    const mist= avgArr(last3.map(s=>s.bank));
    if(acc>=TARGETS.acc && avg<=TARGETS.avgMs && mist<=TARGETS.mist){
      if(d==='easy') { UNL.medium = true; saveUnlocks(); }
      if(d==='medium'){ UNL.hard = true; saveUnlocks(); }
      // popup
      alert(`🎉 Level unlocked! You met your goals on ${d} — new tier available.`);
      updateCombatLocksUI();
    }
  });
}

function end(){
  const acc = total ? (100*score/total) : 0;
  const avg = avgArr(rts);

  if(MODE==='combat'){
    // compute weak lists
    const avgTopicRt = avg; // base
    const topicMap={m:'Multiplication',pow:'Exponents',root:'Roots',frac:'Fractions'};

    const bankCount = Object.values(combatTopicStats).reduce((s,x)=>s+x.wrong,0);

    const weakErrList = Object.keys(combatTopicStats)
      .filter(k => combatTopicStats[k].seen>0 && (combatTopicStats[k].wrong / combatTopicStats[k].seen) >= 0.4)
      .map(k => topicMap[k]);

    const weakDwellList = Object.keys(combatTopicRts)
      .filter(k => {
        const arr = combatTopicRts[k]; if(!arr.length) return false;
        const thr = avgTopicRt + (SLOW_BUFFER[k]||0);
        const slow = arr.filter(v=>v>thr).length;
        return (slow/arr.length) > 0.5;
      })
      .map(k => topicMap[k]);

    // persist this combat
    COMHIST.push({
      diff: DIFF || 'easy',
      acc, avg,
      bank: bankCount,
      correct: score, total: total,
      weakErrList, weakDwellList,
      ts: Date.now()
    });
    saveComHist();
    resetCombatStats();

    // check unlocks immediately + popup
    maybeUnlockImmediate();

    $('sumPracticeExtra') && ( $('sumPracticeExtra').textContent = '' );
  } else {
    // practice
    PCOUNT[TOPIC]=(PCOUNT[TOPIC]||0)+1; savePCount();
    $('sumPracticeExtra') && ( $('sumPracticeExtra').textContent = isReview ? 'Mistake Review complete.' : '' );
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

// ========= Side HUD =========
function drawSideHUD(){
  // show averages of last 3 battles (any diff) for display purposes
  const last3 = COMHIST.slice(-3);
  const hudAcc = last3.length ? avgArr(last3.map(s=>s.acc)).toFixed(0)+'%' : '—';
  const hudSpd = last3.length ? (avgArr(last3.map(s=>s.avg))/1000).toFixed(2)+'s' : '—';
  const hudBank= last3.length ? avgArr(last3.map(s=>s.bank)).toFixed(1) : '—';

  if($('hudAcc')) $('hudAcc').textContent = hudAcc;
  if($('hudSpd')) $('hudSpd').textContent = hudSpd;
  if($('hudBank')) $('hudBank').textContent = hudBank;

  // weak topics (last 3 combats)
  const topicMap={m:'Multiplication',pow:'Exponents',root:'Roots',frac:'Fractions'};
  const weakErr = [];
  const weakDwell = [];
  last3.forEach(s=>{
    (s.weakErrList||[]).forEach(x=>weakErr.push(x));
    (s.weakDwellList||[]).forEach(x=>weakDwell.push(x));
  });
  const weak = [...new Set(weakErr.concat(weakDwell))];
  $('hudWeak') && ($('hudWeak').textContent = weak.length? weak.join(', ') : '—');
}

// ========= Template =========
document.getElementById('app').innerHTML = `
  <!-- LOBBY -->
  <section id="lobby" class="center">
    <div class="box card">
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
      <div class="hint">\${ (function(){ return \`Targets (avg of last 3): Acc ≥ <b>\${TARGETS.acc}%</b> • Avg ≤ <b>\${(TARGETS.avgMs/1000).toFixed(2)}s</b> • Mistakes ≤ <b>\${TARGETS.mist}</b>.\`; })() }</div>
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
      <div id="sumLines"></div>
      <div id="sumPracticeExtra" class="mini"></div>
      <div style="margin-top:12px" id="summaryButtons"></div>
    </div>
  </div>

  <!-- Confetti container (optional) -->
  <div id="confetti"></div>
`;

// ========= Wire up menus =========
$('toCombat').onclick=()=>{ show('combatMenu'); updateCombatLocksUI(); };
$('toPractice').onclick=()=>show('practiceMenu');
$('backFromCombat').onclick=()=>show('lobby');
$('backFromPractice').onclick=()=>show('lobby');
$('homeBtn').onclick=()=>{ show('lobby'); };

// Difficulty buttons (with locks)
$('cEasy').onclick = ()=> { show('game'); startCombat('easy'); };
$('cMed').onclick  = ()=> {
  if(!UNL.medium){
    $('cMed').classList.add('shake');
    setTimeout(()=>$('cMed').classList.remove('shake'),350);
    return;
  }
  show('game'); startCombat('medium');
};
$('cHard').onclick = ()=> {
  if(!UNL.hard){
    $('cHard').classList.add('shake');
    setTimeout(()=>$('cHard').classList.remove('shake'),350);
    return;
  }
  show('game'); startCombat('hard');
};

function updateCombatLocksUI(){
  const cMed=$('cMed'), cHard=$('cHard');
  if(!cMed || !cHard) return;
  if(!UNL.medium){
    cMed.classList.add('lockedBtn');
    if(!cMed.querySelector('.lockIcon')){ const i=document.createElement('span'); i.className='lockIcon'; i.textContent='🔒'; cMed.prepend(i); }
  } else {
    cMed.classList.remove('lockedBtn'); cMed.querySelector('.lockIcon')?.remove();
  }
  if(!UNL.hard){
    cHard.classList.add('lockedBtn');
    if(!cHard.querySelector('.lockIcon')){ const i=document.createElement('span'); i.className='lockIcon'; i.textContent='🔐'; cHard.prepend(i); }
  } else {
    cHard.classList.remove('lockedBtn'); cHard.querySelector('.lockIcon')?.remove();
  }
  $('medState') && ( $('medState').textContent= UNL.medium ? '(unlocked)' : '(locked)',
                     $('medState').className= UNL.medium ? 'ok' : 'lock' );
  $('hardState') && ( $('hardState').textContent= UNL.hard ? '(unlocked)' : '(locked)',
                      $('hardState').className= UNL.hard ? 'ok' : 'lock' );
}

// Practice topics
$qs('.pTopic').forEach(btn=>{
  btn.onclick=()=> startPractice(btn.getAttribute('data-topic'));
});

// Start button inside combat
$('startBtn').onclick=beginBattle;

// ========= Instructions & Targets modals integration =========
// index.html defines: window.__openInstructions, __openTargets, __readTargets, __closeTargets, and a Save hook __saveTargetsFromModal
$('instructionsBtn').onclick = ()=> { window.__openInstructions && window.__openInstructions(); };
$('targetsBtn').onclick = ()=> { window.__openTargets && window.__openTargets(TARGETS); };

// Allow modal to call back into us to save targets
window.__saveTargetsFromModal = function(){
  if(!window.__readTargets) return;
  TARGETS = window.__readTargets();
  saveTargets();
  drawSideHUD();
  alert('🎯 Goals saved!');
};

// Initial paint
updateCombatLocksUI();
drawSideHUD();
show('lobby');






