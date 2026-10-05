'use strict';
/* ============================================================
   mixer.js — 演奏時即時調音量
   ・滑鼠滾輪：游標停在格子上滾動
   ・鍵盤：按住格子的鍵，再按 ↑↓（Shift＝一次 10%）
   ・混音台：列出正在播放（或設了靜音／獨奏）的格子，推桿＋靜音 M＋獨奏 S，以及總音量
   音量就是格子本身的音量（和編輯器裡的同一個值，會存檔）；靜音、獨奏只在這次演奏有效。
   ============================================================ */
const VOL_MAX = 1.2;
const esc = t => String(t).replace(/[&<>"]/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;'})[c]);   // 名稱可能來自匯入的檔案
let vtipTimer = {};
/** 改一格的音量：d 是增減量，播放中立刻生效 */
function adjustVol(i, d){
  const p = S.pads[i]; if(!p) return;
  p.vol = +clamp(Math.round((p.vol + d) * 100) / 100, 0, VOL_MAX).toFixed(2);
  setPadVolume(i); syncPadMix(i); showVolTip(i); save();
  if(S.editing === i) syncEditorBar();
  mixerSync();
}
function setVol(i, v){ adjustVol(i, v - S.pads[i].vol); }
/** 格子中間短暫顯示音量百分比 */
function showVolTip(i){
  const pe = padEls[i]; if(!pe) return;
  pe.el.querySelector('.vtip').textContent = Math.round(S.pads[i].vol * 100) + '%';
  pe.el.classList.add('volShow'); clearTimeout(vtipTimer[i]);
  vtipTimer[i] = setTimeout(() => pe.el.classList.remove('volShow'), 900);
}
/* 滾輪：只在演奏模式（編輯模式點格子是進入編輯，滾輪留給頁面捲動） */
board.addEventListener('wheel', e => {
  if(S.mode !== 'play') return;
  const el = e.target.closest('.pad'), i = padEls.findIndex(pe => pe.el === el); if(i < 0 || !S.pads[i].objects.length) return;
  e.preventDefault(); adjustVol(i, (e.deltaY < 0 ? 1 : -1) * (e.shiftKey ? 0.1 : 0.05));
}, {passive:false});
/** 鍵盤：按住格子的鍵＋↑↓（由 main.js 的 keydown 呼叫），有處理就回傳 true */
function volumeKey(e, held){
  if(S.editing !== null || (e.code !== 'ArrowUp' && e.code !== 'ArrowDown')) return false;
  const ids = [...held].map(c => S.pads.findIndex(p => p.key === c)).filter(i => i >= 0);
  if(!ids.length) return false;
  ids.forEach(i => adjustVol(i, (e.code === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 0.1 : 0.05)));
  return true;
}

/* ---------- 靜音／獨奏 ---------- */
function applyMix(){ S.pads.forEach((_, i) => { setPadVolume(i); syncPadMix(i); }); mixerSync(true); }
function toggleMute(i){ MIX.mute.has(i) ? MIX.mute.delete(i) : MIX.mute.add(i); applyMix(); }
function toggleSolo(i){ MIX.solo.has(i) ? MIX.solo.delete(i) : MIX.solo.add(i); applyMix(); }

/* ---------- 混音台面板 ---------- */
let mxKey = '';
/** 重建推桿（播放中的格子有變動時），否則只更新數值；force＝一定重建 */
function mixerSync(force = false){
  if($('#mixer').hidden) return;
  const ids = S.pads.map((_, i) => i).filter(i => voices.has(i) || MIX.mute.has(i) || MIX.solo.has(i));
  const key = ids.join(',');
  if(force || key !== mxKey){
    mxKey = key;
    $('#mxStrips').innerHTML = ids.length ? ids.map(i => { const p = S.pads[i];
      return `<div class="mxS" data-i="${i}" style="--c:${padColor(p)}"><span class="mxKey">${keyLabel(p.key)}</span>
        <input type="range" class="mxF" min="0" max="${VOL_MAX}" step="0.01" value="${p.vol}" title="${esc(p.name)}">
        <span class="mxV"></span><div class="mxB"><button class="mxM" title="靜音">M</button><button class="mxSo" title="獨奏">S</button></div>
        <span class="mxN" title="${esc(p.name)}">${esc(p.name || '未命名')}</span></div>`; }).join('')
      : '<div class="mxEmpty">目前沒有在播放的格子。按鍵盤或點音效板開始演奏，播放中的格子會出現在這裡。</div>';
  }
  $$('#mxStrips .mxS').forEach(s => { const i = +s.dataset.i, p = S.pads[i];
    const f = s.querySelector('.mxF'); if(document.activeElement !== f) f.value = p.vol;
    s.querySelector('.mxV').textContent = Math.round(p.vol * 100) + '%';
    s.querySelector('.mxM').classList.toggle('on', MIX.mute.has(i)); s.querySelector('.mxSo').classList.toggle('on', MIX.solo.has(i));
    s.classList.toggle('silent', mixSilenced(i)); s.classList.toggle('playing', voices.has(i)); });
  $('#mxMaster').value = MIX.master; $('#mxMasterV').textContent = Math.round(MIX.master * 100) + '%';
}
$('#mxStrips').addEventListener('input', e => { const s = e.target.closest('.mxS'); if(s && e.target.classList.contains('mxF')) setVol(+s.dataset.i, +e.target.value); });
$('#mxStrips').addEventListener('click', e => { const s = e.target.closest('.mxS'); if(!s) return;
  if(e.target.classList.contains('mxM')) toggleMute(+s.dataset.i); else if(e.target.classList.contains('mxSo')) toggleSolo(+s.dataset.i); });
$('#mxMaster').oninput = e => { setMasterVolume(+e.target.value); mixerSync(); };
$('#mxReset').onclick = () => { MIX.mute.clear(); MIX.solo.clear(); applyMix(); };
function toggleMixer(show = $('#mixer').hidden){
  $('#mixer').hidden = !show; $('#mixBtn').classList.toggle('on', show); document.body.classList.toggle('mixOpen', show);
  if(show){ mxKey = ''; mixerSync(true); }
}
$('#mixBtn').onclick = () => toggleMixer();
$('#mxClose').onclick = () => toggleMixer(false);
