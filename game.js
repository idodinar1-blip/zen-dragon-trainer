/* Zen Dragon v10.1 — unlocks fixed (per-difficulty, immediate), popup alert, fraction distractors improved */

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
let COMHIST = JSON.parse(localStorage.getItem('zenCombatSessions')||'[]'); // each: {diff, acc, avg, bank, ...}
let PMIST = JSON.parse(localStorage.getItem('zenPracticeMistakesV2')||'{"m":[],"pow":[],"root":[],"frac":[]}');
let PCOUNT= JSON.parse(localStorage.getItem('zenPracticeCountsV2')||'{"m":0,"pow":0,"root":0,"frac":0}');

/* ======= User Targets (drive unlocks) ======= */
let TARGETS = JSON.parse(localStorage.getItem('zenTargets')||'{"acc":95,"avgMs":1500,"mist":3}');
function saveTargets(){ localStorage.setItem('zenTargets', JSON.stringify(TARGETS)); }

/* ======= Dwell buffers (ms) for roots/fractions ======= */
const SLOW_BUFFER = { m:0, pow:0, root:120, frac:250 };

/* ======= Per-combat topic stats ======= */
let combatTopicStats = { m:{seen:0,wrong:0}, pow:{seen:0,wrong:0}, root:{seen:0,wrong:0}, frac:{seen:0,wrong:0} };
let combatTopicRts   = { m:[], pow:[], root:[], frac:[] };
function resetCombatStats(){ for(const k of ["m","pow","root","frac"]){ combatTopicStats[k].seen=0; combatTopicStats[k].wrong=0; combatTopicRts[k]=[]; } }

/* ======= Persistence helpers ======= */
const saveUnlocks=()=>localStorage.setItem('zenUnlocks',JSON.stringify(UNL));
const saveComHist=()=>localStorage.setItem('zenCombatSessions',JSON.stringify(COMHIST.slice(-60))); // keep more history
const savePMist=()=>localStorage.setItem('zenPracticeMistakesV2',JSON.stringify(PMIST));
const savePCount=()=>localStorage.setItem('zenPracticeCountsV2',JSON.stringify(PCOUNT));

/* ========= Pools ========= */
const rand=(a,b)=>Math.floor(Math.random()*(b-a+1))+a;
const mulPool=(A,B)=>{ let out=[]; A.forEach(x=>B.forEach(y=>out.push({t:`${x}×${y}`,a:String(x*y),topic:'m'}))); return out; };
function powPool(){ let out=[]; for(let n=1;n<=14;n++) out.push({t:`${n}²`,a:String(n*n),topic:'pow'}); for(let n=2;n<=6;n++) out.push({t:`${n}³`,a:String(n*n*n),topic:'pow'}); out.push({t:'2⁴',a:'16',topic:'pow'},{t:'3⁴',a:'81',topic:'pow'},{t:'2⁵',a:'32',topic:'pow'},{t:'2⁶',a:'64',topic:'pow'}); return out; }
function rootPool(){ let out=[]; [4,9,16,25,36,49,64,81,100,121,144,169,196].forEach(v=>out.push({t:`√${v}`,a:String(Math.sqrt(v)),topic:'root'})); [8,27,64,125,216].forEach(v=>out.push({t:`³√${v}`,a:String(Math.cbrt(v)),topic:'root'})); [16,81].forEach(v=>out.push({t:`⁴√${v}`,a:String(Math.round(Math.pow(v,1/4))),topic:'root'})); out.push({t:'⁵√32',a:'2',topic:'root'},{t:'⁶√64',a:'2',topic:'root'}); return out; }
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

/* ========= FRACTIONS helpers & pick4 ========= */
function _gcd(a,b){ a=Math.abs(a); b=Math.abs(b); while(b){ [a,b]=[b,a%b]; } return a||1; }
function _simpPair(N,D){ if(D===0) return [1,0]; const s=(D<0?-1:1); N*=s; D*=s; const g=_gcd(N,D); return [N/g, D/g]; }
function _fmt(N,D){ return (D===1) ? String(N) : (N+"/"+D); }
function _isFracStr(str){ return typeof str==="string" && /^\s*-?\d+\s*\/\s*-?\d+\s*$/.test(str); }

function pick4(ans,topic){
  if (_isFracStr(ans)){
    let [n0,d0] = ans.split('/').map(x=>parseInt(x.trim(),10));
    [n0,d0] = _simpPair(n0,d0);

    const set = new Set();
    const pushIf = (N,D)=>{
      const [nn,dd] = _simpPair(N,D);
      const s = _fmt(nn,dd);
      if (dd===1) return false;                    // בלי הסחות של מספרים שלמים
      if (nn===n0 && dd===d0) return false;        // לא התשובה
      if (!set.has(s)) { set.add(s); return true; }
      return false;
    };

    const tryCand = [
      [n0+1,d0],[n0-1,d0],[n0+2,d0],[n0-2,d0],
      [n0,d0+1],[n0,d0-1],[n0,d0+2],[n0,d0-2],
      [n0*2+1,d0*2],[n0*3-1,d0*3],[n0*2-1,d0*3+1],
      [n0*d0+1,d0*d0],[n0*d0-1,d0*d0+1]
    ];
    for(const [N,D] of tryCand){ if (set.size>=3) break; if (D && D!==0) pushIf(N,D); }
    while(set.size<3){
      const N = n0 + (Math.floor(Math.random()*7)-3);
      let   D = d0 + (Math.floor(Math.random()*7)-3);
      if (D===0) continue; if (D<0){ D=-D; }
      pushIf(N,D);
    }
    const opts = [ _fmt(n0,d0), ...set.values() ];
    return opts.slice(0,4).sort(()=>Math.random()-.5).map(v=>({v,topic}));
  }

  // numeric
  let s=new Set([ans]);
  let num=parseFloat(ans);
  while(s.size<4){
    let g = isNaN(num) ? String(rand(2,99)) : String(num + rand(-9,9));
    if(!s.has(g) && g!=='NaN' && g!=='Infinity' && g!=='-Infinity') s.add(g);
  }
  return [...s].sort(()=>Math.random()-.5).map(v=>({v,topic}));
}

/* ========= Combat pools ========= */
function combatPool(d){
  let set=[];
  if (d==='easy'){
    set=[].concat(mulPool([2,3,4,5],[2,3,4,5,6]), powPool(), rootPool(), fracPool());
  } else if (d==='medium'){
    set=[].concat(mulPool([3,4,5,6,7],[4,5,6,7,8,9,10]), powPool(), rootPool(), fracPool());
  } else {
    set=[].concat(mulPool([6,7,8,9],[6,7,8,9,10]), powPool(), rootPool(), fracPool());
  }
  return set.sort(()=>Math.random()-.5);
}
const practicePool=(topic)=> []
  .concat(combatPool('easy'),combatPool('medium'),combatPool('hard'))
  .filter(x=>x.topic===topic);

/* ========= HUD ========= */
function last3StatsAll(){
  let h=COMHIST.slice(-3);
  if(h.length===0) return {acc:null,avg:null,mist:null};
  let acc=h.reduce((s,x)=>s+(x.acc||0),0)/h.length;
  let avg=h.reduce((s,x)=>s+(x.avg||0),0)/h.length;
  let mist=h.reduce((s,x)=>s+(x.bank||0),0)/h.length;
  return {acc,avg,mist};
}
function last3StatsByDiff(diff){
  const arr = COMHIST.filter(r=>r && r.diff===diff).slice(-3);
  if(arr.length===0) return {acc:null,avg:null,mist:null,count:0};
  let acc=arr.reduce((s,x)=>s+(x.acc||0),0)/arr.length;
  let avg=arr.reduce((s,x)=>s+(x.avg||0),0)/arr.length;
  let mist=arr.reduce((s,x)=>s+(x.bank||0),0)/arr.length;
  return {acc,avg,mist,count:arr.length};
}
function hudHintText(){
  return `Targets (avg of last 3): Acc ≥ <b>${TARGETS.acc}%</b> • Avg ≤ <b>${(TARGETS.avgMs/1000).toFixed(2)}s</b> • Mistakes ≤ <b>${TARGETS.mist}</b>.`;
}
function drawSideHUD(){
  if(MODE!=='combat') return;
  const s=last3StatsAll();
  $('hudAcc').textContent=(s.acc==null)?'—':s.acc.toFixed(0)+'%';
  $('hudSpd').textContent=(s.avg==null)?'—':(s.avg/1000).toFixed(2)+'s';
  $('hudBank').textContent=(s.mist==null)?'—':s.mist.toFixed(2);

  const last3 = COMHIST.slice(-3);
  const dwellSet = new Set(), errSet = new Set();
  for (let r of last3){
    (r?.weakDwellList||[]).forEach(w=>dwellSet.add(w));
    (r?.weakErrList||[]).forEach(w=>errSet.add(w));
  }
  const dwellArr = Array.from(dwellSet);
  const errArr = Array.from(errSet).filter(x=>!dwellSet.has(x));
  const dwellHTML = dwellArr.map(w => `⏱ <b>${w}</b>`).join(', ');
  const errHTML   = errArr.map(w => `✖ ${w}`).join(', ');
  $('hudWeak').innerHTML = (dwellHTML||errHTML) ? [dwellHTML,errHTML].filter(Boolean).join(', ') : '—';

  const hintEl = document.querySelector('.hint');
  if (hintEl) hintEl.innerHTML = hudHintText();
}
function updateLevelBadge(){
  const cMed=$('cMed'), cHard=$('cHard');
  if(!UNL.medium){
    cMed.classList.add('lockedBtn');
    if(!cMed.querySelector('.lockIcon')){
      let i=document.createElement('span'); i.className='lockIcon'; i.textContent='🔒'; cMed.prepend(i);
    }
  } else {
    cMed.classList.remove('lockedBtn'); cMed.querySelector('.lockIcon')?.remove();
  }
  if(!UNL.hard){
    cHard.classList.add('lockedBtn');
    if(!cHard.querySelector('.lockIcon')){
      let i=document.createElement('span'); i.className='lockIcon'; i.textContent='🔐'; cHard.prepend(i);
    }
  } else {
    cHard.classList.remove('lockedBtn'); cHard.querySelector('.lockIcon')?.remove();
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

/* ========= Render & Pick ========= */
function render(){
  if(i>=total){ end(); return; }
  const item=qs[i];
  $('q').textContent=item.t;
  const ops=pick4(item.a,item.topic);
  $('opts').innerHTML=ops.map(o=>`<div class="opt" data-topic="${o.topic}" data-val="${o.v}">${o.v}</div>`).join("");
  document.querySelectorAll('.opt').forEach(el=>{
    el.addEventListener('click', ()=> pick(el.getAttribute('data-val'), item.a, item));
  });
  $('barFill').style.width=(i/total*100)+'%';
  $('progress').textContent=Math.round(i/total*100)+'%';
  window.__t=performance.now();
}
document.addEventListener('keydown',e=>{
  if(['1','2','3','4'].includes(e.key)){
    const idx=parseInt(e.key)-1;
    const btns=document.querySelectorAll('.opt');
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
  if(idx!==-1){ PMIST[topic][idx].streak= ok ? (PMIST[topic][idx].streak||0)+1 : 0; savePMist(); }
}
function pick(v,a,item){
  const rt=performance.now()-window.__t;
  rts.push(rt);

  document.querySelectorAll('.opt').forEach(n=>{
    if(n.getAttribute('data-val')===a) n.classList.add('correct');
    if(n.getAttribute('data-val')===v && v!==a) n.classList.add('wrong');
  });

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

  if(MODE==='practice'){
    if(!isReview && !ok) ensureMist(item.topic,item);
    else if(isReview)    markReview(item.topic,item,ok);
  }

  setTimeout(()=>{ i++; render(); },150);
}

/* ========= Confetti ========= */
function confetti(){
  const layer=$('confetti'); if(!layer) return;
  layer.classList.remove('hidden');
  const W=innerWidth,H=innerHeight;
  for(let k=0;k<140;k++){
    let d=document.createElement('div'); d.className='conf';
    d.style.left=Math.random()*W+'px'; d.style.top='-20px';
    d.style.background='hsl('+(Math.floor(Math.random()*360))+',100%,60%)';
    let fall=H+80+Math.random()*200,time=2000+Math.random()*700,rot=(Math.random()*720-360);
    d.animate([{transform:'translateY(0) rotate(0deg)'},{transform:'translateY('+fall+'px) rotate('+rot+'deg)'}],
      {duration:time,easing:'cubic-bezier(.2,.6,.2,1)'}
    );
    layer.appendChild(d);
    setTimeout(()=>{ d.remove(); }, time+80);
  }
  setTimeout(()=> layer.classList.add('hidden'), 3000);
}

/* ========= Unlock logic (uses TARGETS, per-difficulty) ========= */
function meetsTargets(stats){
  if ((stats.count ?? 0) < 3) return false;
  if (stats.acc==null || stats.avg==null || stats.mist==null) return false;
  const accOK  = stats.acc >= TARGETS.acc;
  const avgOK  = stats.avg <= TARGETS.avgMs;
  const mistOK = stats.mist <= TARGETS.mist;
  return accOK && avgOK && mistOK;
}
function maybeUnlockImmediate(){
  let unlockedMsg = '';

  // אם עוד לא פתוח Medium — בדוק Easy
  if (!UNL.medium){
    const sEasy = last3StatsByDiff('easy');
    if (meetsTargets(sEasy)){
      UNL.medium = true; saveUnlocks(); updateLevelBadge();
      unlockedMsg += 'Medium unlocked!';
    }
  }
  // אם Medium פתוח אבל Hard לא — בדוק Medium
  if (UNL.medium && !UNL.hard){
    const sMed = last3StatsByDiff('medium');
    if (meetsTargets(sMed)){
      UNL.hard = true; saveUnlocks(); updateLevelBadge();
      unlockedMsg += (unlockedMsg? ' ' : '') + 'Hard unlocked!';
    }
  }
  if (unlockedMsg){
    alert(unlockedMsg); // הודעה קופצת פשוטה כפי שביקשת
  }
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
      for (let it of (PMIST[TOPIC] || [])) { if ((it.streak || 0) >= 2) { removed++; } else { keep.push(it); } }
      PMIST[TOPIC] = keep; savePMist();
      $('sumPracticeExtra').textContent =
        'Removed from mistake bank: '+removed+'. Rule: each mistake is deleted only after TWO correct answers in TWO separate reviews (with two normal sessions in between).';
    } else {
      $('sumPracticeExtra').textContent = '';
    }

  } else {
    const bankCount = total - score;
    const topicMap = { m:"Multiplication", pow:"Exponents", root:"Roots", frac:"Fractions" };

    const weakErrList = Object.keys(combatTopicStats)
      .filter(k => combatTopicStats[k].seen>0 && (combatTopicStats[k].wrong / combatTopicStats[k].seen) >= 0.4)
      .map(k => topicMap[k]);

    const weakDwellList = Object.keys(combatTopicRts)
      .filter(k => {
        const arr = combatTopicRts[k]; if(!arr.length) return false;
        const thr = avg + (SLOW_BUFFER[k]||0);
        const slow = arr.filter(v=>v>thr).length;
        return (slow/arr.length) > 0.5;
      })
      .map(k => topicMap[k]);

    // persist this combat (כולל diff!)
    COMHIST.push({
      diff: DIFF || 'easy',
      acc, avg,
      bank: bankCount,
      correct: score,
      total: total,
      weakErrList, weakDwellList,
      ts: Date.now()
    });
    saveComHist(); // נשמור לפני הבדיקה
    resetCombatStats();

    // בדוק מייד פתיחת שלבים + פופאפ
    maybeUnlockImmediate();
    $('sumPracticeExtra').textContent = '';
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
      <div class="hint">${ (function(){ return `Targets (avg of last 3): Acc ≥ <b>${TARGETS.acc}%</b> • Avg ≤ <b>${(TARGETS.avgMs/1000).toFixed(2)}s</b> • Mistakes ≤ <b>${TARGETS.mist}</b>.`; })() }</div>
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

/* ===== Open modals from lobby buttons ===== */
document.addEventListener('click',(e)=>{
  if(e.target && e.target.id==='instructionsBtn'){ window.__openInstructions && window.__openInstructions(); }
  if(e.target && e.target.id==='targetsBtn'){ window.__openTargets && window.__openTargets(TARGETS); }
});

/* ===== Save targets from modal ===== */
window.__saveTargetsFromModal = ()=>{
  const t = window.__readTargets ? window.__readTargets() : TARGETS;
  TARGETS = t; saveTargets();
  document.querySelectorAll('.hint').forEach(h=> h.innerHTML = `Targets (avg of last 3): Acc ≥ <b>${TARGETS.acc}%</b> • Avg ≤ <b>${(TARGETS.avgMs/1000).toFixed(2)}s</b> • Mistakes ≤ <b>${TARGETS.mist}</b>.`);
  window.__closeTargets && window.__closeTargets();
};

/* ========= Boot ========= */
updateLevelBadge(); show('lobby'); drawSideHUD();



