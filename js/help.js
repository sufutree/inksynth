'use strict';
/* ============================================================
   help.js — 右下角「?」使用說明
   ・依目前畫面打開對應章節；F1 開關、Esc 關閉（由 main.js 的 keydown 呼叫）
   ・「👀 指給我看」：關掉說明，切到需要的畫面，讓那個介面元素閃一下
   ============================================================ */
const HELP_SEEN = 'inksynth-help-seen';
const helpOpen = () => !$('#helpModal').hidden;

function helpChapter(ch){
  $$('#helpNav button').forEach(b => b.classList.toggle('on', b.dataset.ch === ch));
  $$('#helpBody section').forEach(s => s.hidden = s.dataset.ch !== ch);
  $('#helpBody').scrollTop = 0;
}
function openHelp(ch){
  helpChapter(ch || (S.editing !== null ? (S.tab === 'detail' ? 'detail' : 'editor') : S.view === 'overview' ? 'overview' : 'start'));
  $('#helpModal').hidden = false; dismissHelpTip();
}
function closeHelp(){ $('#helpModal').hidden = true; }
function toggleHelp(){ helpOpen() ? closeHelp() : openHelp(); }

/* 指給我看：need＝board／editor 時先切到那個畫面 */
function helpShow(sel, need){
  closeHelp();
  if(need === 'board' && (S.view !== 'board' || S.editing !== null)){ closeEditor(); setView('board'); }
  if(need === 'editor' && S.editing === null){
    const i = Math.max(0, S.pads.findIndex(p => p.objects.length));
    setMode('edit'); openEditor(i); toast('已打開第 ' + (i + 1) + ' 格的編輯器，按 Esc 或「← 完成」離開');
  }
  const els = $$(sel).filter(el => el.offsetParent !== null || getComputedStyle(el).position === 'fixed');
  if(!els.length) return toast('現在的畫面看不到這個元件');
  els[0].scrollIntoView({block:'nearest', behavior:'smooth'});
  els.forEach(el => { el.classList.remove('helpFlash'); void el.offsetWidth; el.classList.add('helpFlash'); });
  setTimeout(() => els.forEach(el => el.classList.remove('helpFlash')), 2200);
}

$('#helpBtn').onclick = () => toggleHelp();
$('#helpClose').onclick = closeHelp;
$('#helpModal').addEventListener('pointerdown', e => { if(e.target.id === 'helpModal') closeHelp(); });
$('#helpNav').onclick = e => { const b = e.target.closest('button'); if(b) helpChapter(b.dataset.ch); };
$('#helpBody').onclick = e => {
  const go = e.target.closest('[data-go]'); if(go){ helpChapter(go.dataset.go); return; }
  const sh = e.target.closest('[data-show]'); if(sh) helpShow(sh.dataset.show, sh.dataset.need);
};

/* 第一次來：在「?」旁邊提示一次 */
function dismissHelpTip(){
  clearTimeout(helpTipTimer); $('#helpTip').hidden = true;
  try{ localStorage.setItem(HELP_SEEN, '1'); }catch(_){}
}
$('#helpTipX').onclick = e => { e.stopPropagation(); dismissHelpTip(); };
$('#helpTip').onclick = () => openHelp('start');
let helpTipTimer = null;
try{ if(!localStorage.getItem(HELP_SEEN)) helpTipTimer = setTimeout(() => $('#helpTip').hidden = false, 1500); }catch(_){}
