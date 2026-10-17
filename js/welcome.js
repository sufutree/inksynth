'use strict';
/* ============================================================
   welcome.js — 新手的第一分鐘
   ・第一次來（瀏覽器裡沒有存檔）：歡迎視窗，說明這是什麼、怎麼玩
   ・「帶我玩一次」：底部導覽列一步一步帶著按 鼓 → 低音 → 和聲 → 旋律，
     要按的格子會亮起來，按對了就進下一步；最後告訴他怎麼停、怎麼自己畫
   ============================================================ */
const WELCOME_SEEN = 'inksynth-welcome-v1';
const welcomeSeen = () => { try{ return !!localStorage.getItem(WELCOME_SEEN); }catch(_){ return true; } };
const markWelcome = () => { try{ localStorage.setItem(WELCOME_SEEN, '1'); }catch(_){} };
document.body.classList.toggle('touch', matchMedia('(pointer:coarse)').matches);

function closeWelcome(){ $('#welcome').hidden = true; markWelcome(); }
$('#wSkip').onclick = closeWelcome;
$('#wHelp').onclick = () => { closeWelcome(); openHelp('start'); };
$('#wGo').onclick = () => { closeWelcome(); initAudio(); closeEditor(); setMode('play'); setView('board'); boardReady.then(startCoach); };

/* ---------- 導覽：一層一層疊上去 ---------- */
const COACH_PLAN = [
  {keys:['Digit1', 'Digit2', 'Digit3'], what:'先放節奏'},
  {keys:['KeyZ', 'KeyX', 'KeyC'], what:'加上低音'},
  {keys:['KeyQ', 'KeyW', 'KeyE', 'KeyR'], what:'鋪上和聲'},
  {keys:['KeyA', 'KeyS', 'KeyD'], what:'最後是旋律'},
];
const COACH = {steps:[], k:-1, timer:null};
function startCoach(){
  COACH.steps = COACH_PLAN.map(st => ({...st, i:st.keys.map(c => S.pads.findIndex(p => p.key === c)).find(i => i >= 0 && S.pads[i].objects.length)}))
    .filter(st => st.i != null && st.i >= 0);
  if(!COACH.steps.length) return;
  COACH.k = 0; showCoachStep();
}
function coachPadMark(i){ $$('.pad.coachPad').forEach(el => el.classList.remove('coachPad')); if(i != null && padEls[i]) padEls[i].el.classList.add('coachPad'); }
function showCoachStep(){
  const st = COACH.steps[COACH.k], p = S.pads[st.i], name = esc(p.name || '這一格');
  $('#coachStep').textContent = `${COACH.k + 1}／${COACH.steps.length}`;
  $('#coachText').innerHTML = isTouch() ? `${st.what}：點亮著的格子「${name}」`
    : `${st.what}：按 <kbd>${esc(keyLabel(p.key))}</kbd> 或點亮著的格子「${name}」`;
  $('#coachX').textContent = '略過';
  $('#coach').hidden = false; coachPadMark(st.i);
  padEls[st.i].el.scrollIntoView({block:'nearest', behavior:'smooth'});
}
function finishCoach(){
  coachPadMark(null); COACH.k = -1;
  $('#coachStep').textContent = '🎉';
  $('#coachText').innerHTML = `你已經在演奏了！${isTouch() ? '同一格再點一次會停下，按住不放立即停止' : '同一格再按一次會停下，<kbd>Esc</kbd> 全部停止'}。想自己做聲音？切到「✎ 編輯」點一格。`;
  $('#coachX').textContent = '好';
  clearTimeout(COACH.timer); COACH.timer = setTimeout(endCoach, 14000);
}
function endCoach(){ clearTimeout(COACH.timer); COACH.k = -1; coachPadMark(null); $('#coach').hidden = true; }
$('#coachX').onclick = endCoach;
function coachHit(i){
  if(COACH.k < 0 || i !== COACH.steps[COACH.k].i) return;
  if(!padState(i).state) return;   // 按了第二次（停掉）不算
  COACH.k++;
  if(COACH.k >= COACH.steps.length) finishCoach(); else showCoachStep();
}
/* 每次觸發格子（鍵盤或點擊都會經過 trigger）都檢查一下導覽 */
{ const _trigger = trigger; trigger = function(i, shift){ _trigger(i, shift); if(!shift) coachHit(i); }; }
/* 切去編輯或總覽就結束導覽 */
{ const _setMode = setMode; setMode = function(m){ _setMode(m); if(m !== 'play' && COACH.k >= 0) endCoach(); }; }

/* ---------- 第一次來才顯示 ---------- */
if(!welcomeSeen()){
  if(hadSave) markWelcome();                    // 舊使用者：已經有作品了，不打擾
  else { dismissHelpTip(); $('#welcome').hidden = false; }
}
addEventListener('keydown', e => { if(e.code === 'Escape' && !$('#welcome').hidden){ e.stopImmediatePropagation(); closeWelcome(); } }, true);
