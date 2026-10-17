'use strict';
/* ============================================================
   welcome.js — 新手的第一分鐘
   ・第一次來（瀏覽器裡沒有存檔）：歡迎視窗，說明這是什麼、怎麼玩
   ・關卡：照一份編排一步一步帶著按，每一步要按的格子會亮起來；還沒到時間會倒數，到了就提示「現在按」。
     晚按也沒關係，後面的時間會跟著往後挪。
       第一關  午夜藍調：一次一個鍵，約 1 分鐘
       第三關  夜店 House：宣傳片裡的那 30 秒，一次好幾個鍵（第二關製作中）
   ============================================================ */
const WELCOME_SEEN = 'inksynth-welcome-v1';
const welcomeSeen = () => { try{ return !!localStorage.getItem(WELCOME_SEEN); }catch(_){ return true; } };
const markWelcome = () => { try{ localStorage.setItem(WELCOME_SEEN, '1'); }catch(_){} };
document.body.classList.toggle('touch', matchMedia('(pointer:coarse)').matches);

function closeWelcome(){ $('#welcome').hidden = true; markWelcome(); }
$('#wSkip').onclick = closeWelcome;
$('#wHelp').onclick = () => { closeWelcome(); openHelp('start'); };
$('#wGo').onclick = () => { closeWelcome(); initAudio(); boardReady.then(() => startTour(1, true)); };

/* ---------- 關卡 ---------- */
const LEVELS = {
  /* 第一關：午夜藍調（92 BPM、搖擺）。一次只按一個鍵，從鼓、低音、伴奏一層層疊上去，再讓主旋律、副旋律唱完 */
  1:{name:'第一關：午夜藍調', tpl:'blues', align:{Digit8:'bar'}, steps:[
    {bar:0,  title:'先讓鼓跑起來', go:['Digit1']},
    {bar:2,  title:'加上低音，一步一步往上走的 Walking Bass', go:['KeyZ']},
    {bar:4,  title:'風琴伴奏進來', go:['KeyR']},
    {bar:8,  title:'主旋律登場（會唱 8 小節）', go:['KeyA']},
    {bar:12, title:'加一點鋼琴切分', go:['KeyW']},
    {bar:16, title:'換副旋律接著唱', go:['KeyS']},
    {bar:19, title:'鼓過門，準備收尾', go:['Digit8']},
    {bar:20, title:'結尾：按下結束和弦（其他聲音會在同一小節停下）', go:['Slash'], end:true},
  ]},
  /* 第三關：夜店 House（124 BPM）。宣傳片的編排，和 宣傳素材/source/record-house.js 的 PLAN 相同 */
  3:{name:'第三關：夜店 House', tpl:'house', align:{Digit9:'bar', KeyM:'bar', KeyB:'bar'}, steps:[
    {bar:0,  title:'開場：先鋪上和弦、超鋸齒與 Hi-hat', go:['KeyW', 'KeyQ', 'Digit3']},
    {bar:2,  title:'鼓和低音進來！拍手和「上升」開始往 Drop 堆', go:['Digit1', 'KeyX', 'Digit7', 'KeyV']},
    {bar:4,  title:'加上琶音，畫面更滿', go:['KeyE']},
    {bar:6,  title:'Drop！換成有過門的鼓，加上重擊、Hook 和人聲', stop:['Digit1'], go:['Digit9', 'Digit2', 'KeyD', 'KeyN']},
    {bar:12, title:'讓它跑一會兒……來一段掃頻', go:['KeyM']},
    {bar:13, title:'鼓過門，準備收尾', go:['Digit8']},
    {bar:14, title:'結尾：按下結束和弦（其他聲音會在同一小節停下）', go:['Slash', 'Digit0', 'KeyB'], end:true},
  ]},
};
const nextLevel = id => Object.keys(LEVELS).map(Number).sort((a, b) => a - b).find(n => n > id);
const TS = {lv:null, id:0, k:-1, t0:0, seen:null, poll:null, endTimer:null};
let TOUR = [];
const padIdx = key => S.pads.findIndex(p => p.key === key);
const barLen = () => 240 / S.bpm;

function startTour(id = 1, firstRun = false){
  const lv = LEVELS[id], t = lv && InkTemplates.map[lv.tpl];
  if(!t){ toast('找不到這一關的範本'); return; }
  if(!firstRun && S.boardName !== t.name && S.pads.some(p => p.objects.length) &&
     !confirm(`「${lv.name}」會載入範本「${t.name}」，取代目前的音效板。
（想保留目前的作品，請先用「☰ 檔案 → 儲存」存檔）

要開始嗎？`)) return;
  endTour(); initAudio(); stopAll(); closeEditor(); setMode('play'); setView('board');
  applyBoard(t);
  S.quant = 'bar'; syncGlobals();
  for(const [key, a] of Object.entries(lv.align || {})){ const i = padIdx(key); if(i >= 0) S.pads[i].align = a; }   // 關卡裡這幾格改成對齊小節，才會剛好在拍子上
  refreshAllPads(); save();
  TS.lv = lv; TS.id = id; TOUR = lv.steps;
  TS.k = 0; TS.t0 = 0; showTourStep();
  TS.poll = setInterval(pollTour, 120);
  toast(`${lv.name}：跟著亮起來的格子按`);
}
function endTour(){
  clearInterval(TS.poll); clearTimeout(TS.endTimer); TS.poll = null; TS.k = -1;
  $$('.pad.coachPad,.pad.coachStop,.pad.coachSoon').forEach(el => el.classList.remove('coachPad', 'coachStop', 'coachSoon'));
  $('#coach').hidden = true; document.body.classList.remove('touring'); fitBoard();
}
$('#coachX').onclick = endTour;
$('#coachAgain').onclick = () => startTour(TS.id, false);
$('#coachNext').onclick = () => { const n = nextLevel(TS.id); if(n) startTour(n, false); };

function showTourStep(){
  const st = TOUR[TS.k];
  TS.seen = new Set();
  $('#coachStep').textContent = `${TS.k + 1}／${TOUR.length}`;
  $('#coachText').textContent = st.title;
  $('#coachX').textContent = '結束'; $('#coachAgain').hidden = true; $('#coachNext').hidden = true;
  $('#coach').hidden = false; document.body.classList.add('touring'); fitBoard();
  renderTourPads(); pollTour();
}
const chip = (key, stop, done) => { const i = padIdx(key), p = S.pads[i];
  return `<span class="chip${stop ? ' stop' : ''}${done ? ' done' : ''}">${done ? '✓' : stop ? '■' : ''}<kbd>${esc(keyLabel(key))}</kbd>${esc(p ? p.name : '')}${stop ? ' 停' : ''}</span>`; };
function renderTourPads(){
  const st = TOUR[TS.k];
  $('#coachPads').innerHTML = [...(st.stop || []).map(k => chip(k, true, TS.seen.has('s' + k))), ...st.go.map(k => chip(k, false, TS.seen.has('g' + k)))].join('');
}
/** 每 0.12 秒檢查：要開始的格子有沒有在播、要停的格子有沒有停；也更新倒數 */
function pollTour(){
  if(TS.k < 0 || !ctx) return;
  const st = TOUR[TS.k];
  let changed = false;
  for(const key of st.go){ const i = padIdx(key), ps = padState(i);
    if(!TS.seen.has('g' + key) && ps.state && !ps.stopping){ TS.seen.add('g' + key); changed = true; } }
  for(const key of st.stop || []){ const ps = padState(padIdx(key));
    if(!TS.seen.has('s' + key) && (!ps.state || ps.stopping)){ TS.seen.add('s' + key); changed = true; } }
  if(changed) renderTourPads();
  // 第一步：開始的時間就是整首的第 0 小節；之後每一步都用實際開始的時間校正（晚按就整個往後挪）
  const started = st.go.map(k => voices.get(padIdx(k))).filter(Boolean).map(v => v.t0);
  if(started.length && TS.seen.size){ const t0 = Math.min(...started) - st.bar * barLen(); if(TS.k === 0 || t0 > TS.t0) TS.t0 = t0; }
  // 倒數：在目標小節的前一小節內按下，對齊小節後剛好在目標小節進來
  const ready = TS.k === 0 ? 0 : TS.t0 + (st.bar - 1) * barLen(), left = ready - ctx.currentTime;
  const allDone = st.go.every(k => TS.seen.has('g' + k)) && (st.stop || []).every(k => TS.seen.has('s' + k));
  const beats = Math.ceil(left / (60 / S.bpm));
  $('#coachTime').innerHTML = allDone ? '✓ 很好！' : left > 0.05 ? `⏳ 再 <b>${beats}</b> 拍` : '<b class="now">▶ 現在按！</b>';
  for(const key of [...st.go, ...(st.stop || [])]){ const el = padEls[padIdx(key)]?.el; if(!el) continue;
    const done = TS.seen.has('g' + key) || (st.stop || []).includes(key) && TS.seen.has('s' + key);
    el.classList.toggle('coachPad', !done && left <= 0.05 && !(st.stop || []).includes(key));
    el.classList.toggle('coachStop', !done && left <= 0.05 && (st.stop || []).includes(key));
    el.classList.toggle('coachSoon', !done && left > 0.05); }
  if(allDone){
    if(st.end) return finishTour();
    $$('.pad.coachPad,.pad.coachStop,.pad.coachSoon').forEach(el => el.classList.remove('coachPad', 'coachStop', 'coachSoon'));
    TS.k++; showTourStep();
  }
}
/** 結尾：其他還在播的聲音，在結束和弦進來的那一刻一起停 */
function finishTour(){
  const st = TOUR[TS.k], ends = new Set(st.go.map(padIdx)), v = voices.get(padIdx('Slash'));
  const at = v ? v.t0 : ctx.currentTime;
  clearInterval(TS.poll); TS.poll = null;
  TS.endTimer = setTimeout(() => { for(const id of [...voices.keys()]) if(!ends.has(id)) stopPad(id, 0.05); }, Math.max(0, (at - ctx.currentTime) * 1000 - 20));
  $$('.pad.coachPad,.pad.coachStop,.pad.coachSoon').forEach(el => el.classList.remove('coachPad', 'coachStop', 'coachSoon'));
  TS.k = -1;
  $('#coachStep').textContent = '🎉';
  $('#coachText').textContent = TS.id === 3 ? '完成第三關！這就是宣傳片裡的那 30 秒。' : `完成${TS.lv.name.split('：')[0]}！`;
  $('#coachPads').innerHTML = `<span class="chipNote">換個範本、換個順序按按看；想自己做聲音，切到「✎ 編輯」點一格。</span>`;
  $('#coachTime').innerHTML = '';
  const n = nextLevel(TS.id);
  $('#coachX').textContent = '好'; $('#coachAgain').hidden = false;
  $('#coachNext').hidden = !n; if(n) $('#coachNext').textContent = LEVELS[n].name.split('：')[0] + ' ▶';
}
/* 切去編輯模式就結束挑戰 */
{ const _setMode = setMode; setMode = function(m){ _setMode(m); if(m !== 'play' && TS.k >= 0) endTour(); }; }

/* ---------- 第一次來才顯示 ---------- */
if(!welcomeSeen()){
  if(hadSave) markWelcome();                    // 舊使用者：已經有作品了，不打擾
  else { dismissHelpTip(); $('#welcome').hidden = false; }
}
addEventListener('keydown', e => { if(e.code === 'Escape' && !$('#welcome').hidden){ e.stopImmediatePropagation(); closeWelcome(); } }, true);
$$('[data-level]').forEach(b => b.onclick = () => { closeHelp(); startTour(+b.dataset.level, false); });
