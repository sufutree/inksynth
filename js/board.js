'use strict';
/* ============================================================
   board.js — 40 格音效板（鍵盤排列）
   ============================================================ */
const board = $('#board'), padEls = [], thumbScratch = document.createElement('canvas');
let TW = 0, TH = 0, TDPR = 1;

function buildBoard(){
  board.innerHTML = ''; padEls.length = 0;
  S.pads.forEach((p, i) => {
    const row = Math.floor(i / 10), col = i % 10;
    const el = document.createElement('div'); el.className = 'pad';
    el.style.gridRow = String(row + 1);
    el.style.gridColumn = `${row + 1 + col * 4} / span 4`;   // 每列錯開，像真的鍵盤
    el.innerHTML = '<canvas></canvas><div class="empty"></div><span class="key"></span><span class="mode"></span><span class="name"></span><span class="vol"><i></i></span><span class="vtip"></span>';
    board.appendChild(el);
    const pe = {el, cv:el.querySelector('canvas'), cache:document.createElement('canvas'), dirty:true, was:null};
    padEls.push(pe);
    el.addEventListener('pointerdown', e => {
      e.preventDefault(); initAudio();
      if(S.mode === 'edit'){ openEditor(i); return; }
      try{ el.setPointerCapture(e.pointerId); }catch(_){} trigger(i, e.shiftKey);
    });
    refreshPad(i);
  });
  sizeThumbs();
}
function refreshPad(i){
  const p = S.pads[i], pe = padEls[i]; if(!pe) return;
  pe.el.querySelector('.key').textContent = keyLabel(p.key);
  pe.el.querySelector('.mode').textContent = padBadge(p);
  pe.el.querySelector('.mode').title = padBadgeTitle(p);
  pe.el.querySelector('.name').textContent = p.name || (p.objects.length ? '未命名' : '');
  pe.el.querySelector('.empty').textContent = S.mode === 'edit' ? '＋' : '';
  pe.el.classList.toggle('isEmpty', !p.objects.length);
  pe.el.style.setProperty('--c', padColor(p));
  syncPadMix(i);
  pe.dirty = true; pe.fresh = false;
}
/** 音量條、靜音／獨奏的樣子 */
function syncPadMix(i){
  const pe = padEls[i]; if(!pe) return;
  pe.el.style.setProperty('--vol', (S.pads[i].vol / 1.2 * 100).toFixed(1) + '%');
  pe.el.classList.toggle('muted', mixSilenced(i)); pe.el.classList.toggle('solo', MIX.solo.has(i));
}
function refreshAllPads(){ S.pads.forEach((_, i) => refreshPad(i)); }
function sizeThumbs(){
  if(!padEls.length) return;
  const r = padEls[0].el.getBoundingClientRect(); if(!r.width) return;
  TDPR = Math.min(2, devicePixelRatio || 1); TW = r.width; TH = r.height;
  for(const c of [thumbScratch, ...padEls.flatMap(pe => [pe.cv, pe.cache])]){ c.width = Math.round(TW * TDPR); c.height = Math.round(TH * TDPR); }
  padEls.forEach(pe => { pe.dirty = true; pe.fresh = false; });
}
new ResizeObserver(sizeThumbs).observe(board);
const thumbV = () => ({W:TW, H:TH, dpr:TDPR, s:thumbScratch, k:TH / 430});
function renderThumbCache(i){
  const p = S.pads[i], pe = padEls[i], c = ctxFor(pe.cache, TDPR);
  c.clearRect(0, 0, TW, TH);
  if(!p.objects.length) return;
  c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(0, DRUM_TOP * TH, TW, TH);
  for(let b = 1; b < p.beats; b++){ c.fillStyle = b % 4 ? 'rgba(255,255,255,.03)' : 'rgba(255,255,255,.08)'; c.fillRect(b / p.beats * TW, 0, 1, TH); }
  const V = thumbV(); withKey(p, () => { for(const o of p.objects) drawObj(c, o, V); });
}
function drawBoard(){
  if(!TW || S.view !== 'board' || S.editing !== null) return;
  padEls.forEach((pe, i) => {
    const st = padState(i), key = st.state === 'playing' ? 'p' + st.prog.toFixed(4) + st.stopping : st.state;
    if(pe.dirty && !pe.fresh) renderThumbCache(i);   // fresh：錄影時已經先畫好了
    pe.fresh = false;
    if(pe.dirty || key !== pe.was){
      const c = ctxFor(pe.cv, TDPR); c.clearRect(0, 0, TW, TH); c.drawImage(pe.cache, 0, 0, TW, TH);
      if(st.state === 'playing'){ const p = S.pads[i]; withKey(p, () => drawPlayhead(c, p.objects, st.prog, thumbV(), padDur(p), padColor(p))); }
      pe.el.classList.toggle('playing', st.state === 'playing');
      pe.el.classList.toggle('armed', st.state === 'armed');
      pe.el.classList.toggle('stopping', !!st.stopping);
      pe.dirty = false; pe.was = key;
    }
  });
}
/** 格子右上角的小標記：模式＋特例設定 */
function padBadge(p){
  return PAD_MODES[p.mode].split(' ')[0] + (p.align !== 'global' ? (p.align === 'off' ? ' ⚡' : p.align === 'beat' ? ' ♩' : ' 𝄀') : '') +
    (p.ownKey ? ' ♮' + NOTE_NAMES[p.ownKey.root] : '');
}
function padBadgeTitle(p){
  return PAD_MODES[p.mode] + (p.align !== 'global' ? `・啟動：${ALIGNS[p.align]}` : '') + (p.ownKey ? `・獨立調性 ${keyName(p)}` : '');
}
function flashPad(i){ const pe = padEls[i]; if(!pe) return; pe.el.classList.add('hit'); setTimeout(() => pe.el.classList.remove('hit'), 90); }
function boardHint(){
  $('#boardHint').innerHTML = S.mode === 'play'
    ? '按鍵盤上對應的鍵，或直接點擊音效板・<b>→</b> 單次　<b>↻</b> 循環，再按一次＝播完這圈停止・<b>⚡</b> 不對齊　<b>♮</b> 獨立調性<br><kbd>Shift</kbd>＋按鍵＝立即停止該音色・<kbd>Esc</kbd> 全部立即停止'
    : '<span style="color:var(--square)">編輯模式</span>：點任一格進入繪製・鍵盤按鍵仍可彈奏';
}
/** 依可用高度決定音效板寬度，讓 4 列剛好放得下 */
function fitBoard(){
  const r = $('#boardView').getBoundingClientRect(); if(!r.height) return;
  const availH = r.height - 32 - $('#boardHint').offsetHeight - $('#copyright').offsetHeight - 16;
  const w = ((availH - 30) / 4 / 0.75 + 8) * 43 / 4;   // 每格寬 = 板寬 × 4/43 − 8，高 = 寬 × 3/4
  board.style.setProperty('--bw', Math.max(520, Math.floor(w)) + 'px');
}
new ResizeObserver(fitBoard).observe($('#boardView'));
