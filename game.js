/* Zen Dragon v9.8 — full game.js with real difficulty tiers + proper fraction distractors
   NOTE: Instructions modal is handled in index.html only (no injection here) */

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

/* ========= Per-battle topic tracking ========= */
let combatTopicStats = { m:{seen:0,wrong:0}, pow:{seen:0,wrong:0}, root:{seen:0,wrong:0}, frac:{seen:0,wrong:0} };
let combatTopicRts   = { m:[],                pow:[],                root:[],                frac:[] };
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

/* ========= Utilities ========= */
const rand=(a,b)=>Math.floor(Math.random()*(b-a+1))+a;
const gcd=(a,b)=>{a=Math.abs(a);b=Math.abs(b);while(b){[a,b]=[b,a%b]}return a||1;};
function simplify(n,d){const g=gcd(n,d);const N=n/g,D=d/g;return (D===1)?String(N):`${N}/${D}`;}
function asNumberIfInt(str){
  if(/\//.test(str)){
    const [N,D]=str.split('/').map(x=>+x);
    if(D===1) return String(N);
  }
  return str;
}

/* ========= Question Pools (real tiers) ========= */
const mulPool = (A,B)=>{const out=[];A.forEach(x=>B.forEach(y=>out.push({t:`${x}×${y}`,a:String(x*y),topic:'m'})));return out;};

function powPoolEasy(){
  const out=[];
  for(let n=1;n<=12;n++) out.push({t:`${n}²`,a:String(n*n),topic:'pow'});
  for(let n=2;n<=5;n++)  out.push({t:`${n}³`,a:String(n*n*n),topic:'pow'});
  out.push({t:'2⁴',a:'16',topic:'pow'},{t:'3⁴',a:'81',topic:'pow'});
  return out;
}
function powPoolMedium(){
  const out=[];
  for(let n=6;n<=20;n++) out.push({t:`${n}²`,a:String(n*n),topic:'pow'});
  for(let n=3;n<=8;n++)  out.push({t:`${n}³`,a:String(n*n*n),topic:'pow'});
  out.push({t:'4⁴',a:'256',topic:'pow'},{t:'5⁴',a:'625',topic:'pow'});
  return out;
}
function powPoolHard(){
  const out=[];
  for(let n=12;n<=25;n++) out.push({t:`${n}²`,a:String(n*n),topic:'pow'});
  for(let n=5;n<=9;n++)  out.push({t:`${n}³`,a:String(n*n*n),topic:'pow'});
  out.push({t:'6⁴',a:'1296',topic:'pow'},{t:'7⁴',a:'2401',topic:'pow'});
  return out;
}

function rootPoolEasy(){
  const out=[];
  [4,9,16,25,36,49,64,81,100,121,144].forEach(v=>out.push({t:`√${v}`,a:String(Math.sqrt(v)),topic:'root'}));
  [8,27,64,125].forEach(v=>out.push({t:`³√${v}`,a:String(Math.cbrt(v)),topic:'root'}));
  return out;
}
function rootPoolMedium(){
  const out=[];
  [169,196,225,256,289,324,361,400].forEach(v=>out.push({t:`√${v}`,a:String(Math.sqrt(v)),topic:'root'}));
  [216,343,512].forEach(v=>out.push({t:`³√${v}`,a:String(Math.cbrt(v)),topic:'root'}));
  return out;
}
function rootPoolHard(){
  const out=[];
  [441,484,529,576,625].forEach(v=>out.push({t:`√${v}`,a:String(Math.sqrt(v)),topic:'root'}));
  [729,1000].forEach(v=>out.push({t:`³√${v}`,a:String(Math.cbrt(v)),topic:'root'}));
  return out;
}

function fracPoolEasy(){
  const out=[];
  for(let k=0;k<14;k++){
    const g = rand(2,6), x = rand(2,9), y = rand(2,9);
    const n = g*x, d = g*y;
    out.push({t:`${n}/${d}`,a:simplify(n,d),topic:'frac'});
  }
  return out;
}
function fracPoolMedium(){
  const out=[];
  for(let k=0;k<16;k++){
    if(Math.random()<0.5){
      const g = rand(2,6), x = rand(3,12), y = rand(2,11);
      const n = g*x, d = g*y;
      out.push({t:`${n}/${d}`,a:simplify(n,d),topic:'frac'});
    }else{
      let n = rand(5,45), d = rand(3,35);
      if(n===d) n++;
      out.push({t:`${n}/${d}`,a:simplify(n,d),topic:'frac'});
    }
  }
  return out;
}
function fracPoolHard(){
  const out=[];
  for(let k=0;k<18;k++){
    const g = rand(2,8);
    const n = g*rand(8,25);
    const d = g*rand(5,20);
    out.push({t:`${n}/${d}`,a:simplify(n,d),topic:'frac'});
  }
  return out;
}

/* ========= Distractors ========= */
function pick4Numeric(ans,topic){
  const s=new Set([ans]); const base=parseFloat(ans);
  while(s.size<4){
    let g = isNaN(base) ? String(rand(2,99)) : String(base + rand(-9,9));
    if(g!==ans && g!=='NaN') s.add(g);
  }
  return [...s].sort(()=>Math.random()-.5).map(v=>({v,topic}));
}
function neighborsForFraction(answerStr){
  if(!answerStr.includes('/')){
    const N = parseInt(answerStr,10);
    const out = [
      `${N}/${1}`, `${N*2}/${2}`, `${N*3}/${3}`, `${N*2+1}/${2}`, `${N*3-1}/${3}`
    ];
    return [...new Set(out)];
  }
  const [A,B] = answerStr.split('/').map(x=>parseInt(x,10));
  const variants = new Set();
  [2,3].forEach(m=>variants.add(`${A*m}/${B*m}`));                // שקול
  [-2,-1,1,2].forEach(t=>variants.add(`${A+t}/${B}`));            // קרוב במונה
  [-2,-1,1,2].forEach(t=>variants.add(`${A}/${B+t}`));            // קרוב במכנה
  variants.add(`${A+1}/${B+1}`);
  variants.add(`${A-1}/${B+1}`);
  variants.add(`${A+1}/${B-1}`);
  return [...variants].filter(v=>{
    if(!/^\d+\/\d+$/.test(v)) return false;
    const [,den] = v.split('/').map(Number);
    return den>0;
  });
}
function normalizeFrac(str){
  if(!str.includes('/')) return str;
  const [a,b]=str.split('/').map(Number);
  return asNumberIfInt(simplify(a,b));
}
function pick4(ans,topic){
  if(topic!=='frac') return pick4Numeric(ans,topic);
  const choices = new Set([ans]);
  let neigh = neighborsForFraction(ans).sort(()=>Math.random()-0.5);
  for(const c of neigh){
    if(choices.size>=4) break;
    const norm = normalizeFrac(c);
    if(norm!==ans) choices.add(norm);
  }
  while(choices.size<4){
    const a = rand(2,30), b = rand(2,30);
    const cand = normalizeFrac(`${a}/${b}`);
    if(cand!==ans) choices.add(cand);
  }
  // ודא שלפחות 2 אופציות הן שוברים “אמיתיים” (לא מספר שלם)
  const arr = [...choices];
  const fracCount = arr.filter(x=>x.includes('/')).length;
  if(fracCount<2){
    while(arr.filter(x=>x.includes('/')).length<2){
      const a = rand(2,20), b = rand(2,20);
      const cand = normalizeFrac(`${a}/${b}`);
      if(!arr.includes(cand) && cand.includes('/')) arr[Math.floor(Math.random()*arr.length)] = cand;
    }
  }
  return arr.sort(()=>Math.random()-.5).map(v=>({v,topic}));
}

/* ========= Compose combat pools ========= */
function combatPool(d){
  if (d==='easy'){
    return [].concat(
      mulPool([2,3,4,5],[2,3,4,5,6]),
      powPoolEasy(),
      rootPoolEasy(),
      fracPoolEasy()
    ).sort(()=>Math.random()-.5);
  }
  if (d==='medium'){
    return [].concat(
      mulPool([4,5,6,7,8],[6,7,8,9,10,11,12]),
      powPoolMedium(),
      rootPoolMedium(),
      fracPoolMedium()
    ).sort(()=>Math.random()-.5);
  }
  return [].concat(
    mulPool([7,8,9,10,11,12],[8,9,10,11,12,13]),
    powPoolHard(),
    rootPoolHard(),
    fracPoolHard()
  ).sort(()=>Math.random()-.5);
}

const practicePool=(topic)=>
  [].concat(combatPool('easy'),combatPool('medium'),combatPool('hard'))
   .filter(x=>x.topic===topic);

/* ========= HUD ========= */
function last3Stats(){
  let h=COMHIST.slice(-3);
  if(h.length===0) return {acc:null,avg:null,mist:null};
  let acc=h.reduce((s,x)=>s+(x.acc||0),0)/h.length;
  let avg=h.reduce((s,x)=>s+(x.avg||0),0)/h.length;
  let mist=h.reduce((s,x)=>s+(x.bank||0),0)/h.length;
  return {acc,avg,mist};
}
function drawSideHUD(){
  if(MODE!=='combat') return;
  const s=last3Stats();
  $('hudAcc').textContent=(s.acc==null)?'—':s.acc.toFixed(0)+'%';
  $('hudSpd').textContent=(s.avg==null)?'—':(s.avg/1000).toFixed(2)+'s';
  $('hudBank').textContent=(s.mist==null)?'—':s.mist.toFixed(2);
  const last3 = COMHIST.slice(-3);
  const dwellSet = new Set(), errSet = new Set();
  for (let r of last3){
    if (!r) continue;
    (r.weakDwellList||[]).forEach(w=>dwellSet.add(w));
    (r.weakErrList||[]).forEach(w=>errSet.add(w));
  }
  const dwellArr = Array.from(dwellSet);
  const errArr = Array.from(errSet).filter(x=>!dwellSet.has(x));
  const dwellHTML = dwellArr.map(w=>`⏱ <b>${w}</b>`).join(', ');
  const errHTML   = errArr.map(w=>`✖ ${w}`).join(', ');
  $('hudWeak').innerHTML = (dwellHTML && errHTML) ? `${dwellHTML}, ${errHTML}` : (dwellHTML || errHTML || '—');
}
function updateLevelBadge(){
  const cMed=$('cMed'), cHard=$('cHard');
  if(!UNL.medium){
    cMed.classList.add('lockedBtn');
    if(!cMed.querySelector('.lockIcon')){
      let i=document.createElement('span');
      i.className='lockIcon'; i.textContent='🔒'; cMed.prepend(i);
    }
  } else { cMed.classList.remove('lockedBtn'); cMed.querySelector('.lockIcon')?.remove(); }
  if(!UNL.hard){
    cHard.classList.add('lockedBtn');
    if(!cHard.querySelector('.lockIcon')){
      let i=document.createElement('span');
      i.className='lockIcon'; i.textContent='🔐'; cHard.prepend(i);
    }
  } else { cHard.classList.remove('lockedBtn'); cHard.querySelector('.lockIcon')?.remove(); }
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
  [...document.querySelectorAll('.opt')].forEach(el=>{
    el.addEventListener('click',()=>pick(el.getAttribute('data-val'), item.a, item));
  });
  $('barFill').style.width=(i/total*100)+'%';
  $('progress').textContent=Math.round(i/total*100)+'%';
  window.__t=performance.now();
}
document.addEventListener('keydown',e=>{
  if(['1','2','3','4'].includes(e.key)){
    let b=document.querySelectorAll('.opt')[parseInt(e.key)-1];
    if(b) b.click();
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
    if (combatTopicStats[t]) { combatTopicStats[t].seen++; if (!ok) combatTopicStats[t].wrong++; }
    if (combatTopicRts[t])   { combatTopicRts[t].push(rt); }
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
  const layer=$('confetti'); layer.classList.remove('hidden');
  const W=innerWidth,H=innerHeight;
  for(let k=0;k<160;k++){
    let d=document.createElement('div'); d.className='conf';
    d.style.left=Math.random()*W+'px'; d.style.top='-20px';
    d.style.background=`hsl(${Math.floor(Math.random()*360)},100%,60%)`;
    let fall=H+80+Math.random()*200,time=2200+Math.random()*800,rot=(Math.random()*720-360);
    d.animate([{transform:'translateY(0) rotate(0deg)'},{transform:`translateY(${fall}px) rotate(${rot}deg)`}],
              {duration:time,easing:'cubic-bezier(.2,.6,.2,1)'});
    layer.appendChild(d);
    setTimeout(()=>{ if(d.parentNode) d.parentNode.remove(); }, time+60);
  }
  setTimeout(()=>layer.classList.add('hidden'),3100);
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
        `Removed from mistake bank: ${removed}. Rule: each mistake is deleted only after TWO correct answers in TWO separate reviews (with two normal sessions in between).`;
    } else { $('sumPracticeExtra').textContent = ''; }
  } else {
    const bankCount = total - score;
    const topicMap = { m:"Multiplication", pow:"Exponents", root:"Roots", frac:"Fractions" };
    const weakErrList = Object.keys(combatTopicStats)
      .filter(k=>{ const st=combatTopicStats[k]; return st.seen>0 && (st.wrong/st.seen)>=0.4; })
      .map(k=>topicMap[k]);
    const weakDwellList = Object.keys(combatTopicRts)
      .filter(k=>{
        const arr = combatTopicRts[k]; if(!arr.length) return false;
        let slow=0; for(const v of arr){ if(v>avg) slow++; }
        return (slow/arr.length) > 0.5;
      })
      .map(k=>topicMap[k]);
    COMHIST.push({acc,avg,bank:bankCount,correct:score, total, weakErrList, weakDwellList, ts:Date.now()});
    resetCombatStats(); saveComHist();
    $('sumPracticeExtra').textContent = '';
    confetti();
  }

  $('sumLines').innerHTML = `Accuracy: ${acc.toFixed(0)}%<br>Avg Response: ${(avg/1000).toFixed(2)}s`;
  $('summaryButtons').innerHTML = (MODE==='combat')
    ? `<button id="btnAgain" class="bigbtn">⚔️ Another Battle</button>`
    : `<button id="btnAgain" class="bigbtn">🔁 Another Practice</button>`;
  $('btnAgain').onclick = ()=>{ $('summary').style.display='none'; (MODE==='combat') ? startCombat(DIFF) : startPractice(TOPIC); };
  $('summary').style.display='flex';
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
      <div class="hint">Targets (avg of last 3): Acc ≥ <b>95%</b> • Avg ≤ <b>1.50s</b> • Mistakes ≤ <b>3</b>.</div>
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

/* ========= Boot ========= */
updateLevelBadge(); show('lobby'); drawSideHUD();





