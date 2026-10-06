'use strict';
/* ============================================================
   main.js — 全域介面、鍵盤、自動儲存、啟動
   ============================================================ */
function onVoiceChange(id){ if(id === S.editing) syncEditorBar(); if(id === 'imp') markImport(); mixerSync(); }

/* ---------- 畫面與模式 ---------- */
function setView(v){
  S.view = v;
  if(v === 'overview') closeEditor();
  $('#boardView').hidden = v !== 'board'; $('#ovView').hidden = v !== 'overview';
  $$('#views button').forEach(b => b.classList.toggle('on', b.dataset.view === v));
  document.body.classList.toggle('ov', v === 'overview');
  if(v === 'overview'){ ovResize(); buildLegend(); syncOvOptions(); }
  else { sizeThumbs(); padEls.forEach(pe => pe.dirty = true); }
}
function setMode(m){
  S.mode = m; if(m === 'play') closeEditor();
  if(m === 'edit' && S.view !== 'board') setView('board');
  $$('#modes button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
  document.body.classList.toggle('edit', m === 'edit');
  refreshAllPads(); boardHint();
}
$$('#views button').forEach(b => b.onclick = () => setView(b.dataset.view));
$$('#modes button').forEach(b => b.onclick = () => setMode(b.dataset.mode));

/* ---------- 全域設定 ---------- */
NOTE_NAMES.forEach((n, i) => $('#root').add(new Option(n, i)));
Object.entries(SCALES).forEach(([k, v]) => $('#scale').add(new Option(v.name, k)));
function syncGlobals(){ $('#root').value = S.root; $('#scale').value = S.scale; $('#bpm').value = S.bpm; $('#quant').value = S.quant; }
function keyChanged(){ resetScaleCache(); bgDirty = inkDirty = true; inkVer++; padEls.forEach(pe => pe.dirty = true); syncTools(); if(S.editing !== null) syncSpecial(); save(); }
$('#root').onchange = e => { S.root = +e.target.value; keyChanged(); };
$('#scale').onchange = e => { S.scale = e.target.value; keyChanged(); };
$('#bpm').onchange = e => { S.bpm = clamp(Math.round(+e.target.value) || 100, 50, 200); syncGlobals(); stopAll(); updateDelayTime(); save(); };
$('#quant').onchange = e => { S.quant = e.target.value; if(S.editing !== null) syncSpecial(); save(); };
$('#stopAll').onclick = () => { stopAll(); syncEditorBar(); };
document.addEventListener('click', e => { const b = e.target.closest('button'); if(b) b.blur(); });

/* ---------- 鍵盤 ---------- */
const held = new Set();
addEventListener('keydown', e => {
  const tag = e.target.tagName;
  // 使用說明：F1 開關；說明打開時鍵盤不彈奏，只留 Esc 關閉
  if(e.code === 'F1'){ e.preventDefault(); if(bindingKey){ bindingKey = false; syncEditorBar(); } toggleHelp(); return; }
  if(helpOpen()){ if(e.code === 'Escape') closeHelp(); return; }
  if(bindingKey){
    e.preventDefault();
    if(e.code === 'Escape'){ bindingKey = false; syncEditorBar(); }
    else if(RESERVED.has(e.code)) toast('這個鍵保留給其他功能，請換一個');
    else bindKey(e.code);
    return;
  }
  const undoKey = (e.ctrlKey || e.metaKey) && !e.altKey && (e.code === 'KeyZ' || e.code === 'KeyY');
  // 改完下拉選單（例如「長度」）後焦點會停在選單上，復原／重做照樣要能用；文字輸入框保留瀏覽器自己的文字復原
  if(tag === 'SELECT' && undoKey && S.editing !== null) e.target.blur();
  else if(tag === 'SELECT' || (tag === 'INPUT' && e.target.type !== 'range' && e.target.type !== 'checkbox')){ if(e.code === 'Escape') e.target.blur(); return; }
  if(e.code === 'Escape'){
    if(!$('#impModal').hidden) closeImport();
    else if(S.editing !== null && S.sel) select(null);   // 取消所有選取
    else if(S.editing !== null) closeEditor();
    else stopAll();
    return;
  }
  if(!$('#impModal').hidden) return;
  if(S.editing !== null){
    if(e.code === 'Space'){ e.preventDefault(); togglePreview(); return; }
    if(undoKey){ e.preventDefault(); if(e.code === 'KeyY' || e.shiftKey) redo(); else undo(); return; }   // Ctrl+Y／Ctrl+Shift+Z＝重做
    if(e.code === 'Backspace' && S.brush.tool === 'note'){ e.preventDefault(); noteBackspace(); return; }   // 音符模式：收回剛才那個音，繼續輸入
    if((e.code === 'Delete' || e.code === 'Backspace') && S.sel){ e.preventDefault(); deleteSel(); return; }
    if(editorKey(e)){ e.preventDefault(); return; }   // 有選取時：字母、方向鍵用來編輯音高，不觸發音效格
  }
  if(volumeKey(e, held)){ e.preventDefault(); return; }   // 按住格子的鍵＋↑↓：調那一格的音量
  if(e.ctrlKey || e.metaKey || e.altKey) return;
  const i = S.pads.findIndex(p => p.key === e.code);
  if(i < 0) return;
  e.preventDefault();
  if(e.repeat || held.has(e.code)) return;
  held.add(e.code); initAudio(); trigger(i, e.shiftKey);
});
addEventListener('keyup', e => held.delete(e.code));
addEventListener('blur', () => held.clear());

/* ---------- 儲存 ---------- */
const STORE = 'inksynth-pads-v2', OLD_STORE = 'inksynth-pads-v1';
let saveTimer = null;
function save(){ clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 300); }
function saveNow(){
  clearTimeout(saveTimer);
  try{ localStorage.setItem(STORE, JSON.stringify({name:S.boardName, bpm:S.bpm, root:S.root, scale:S.scale, quant:S.quant, pads:S.pads}, round4)); }
  catch(e){ toast('瀏覽器儲存空間不足，請用「☰ 檔案 → 儲存音效板」存成檔案'); }
}
addEventListener('beforeunload', saveNow);
function load(){
  try{
    const d = JSON.parse(localStorage.getItem(STORE));
    if(d && Array.isArray(d.pads) && d.pads.length === 40){
      const b = normalizeBoard({...d, format:BOARD_FORMAT});
      Object.assign(S, {bpm:b.bpm, root:b.root, scale:b.scale, quant:b.quant, boardName:d.name || '我的音效板', pads:b.pads});
      return true;
    }
    const old = JSON.parse(localStorage.getItem(OLD_STORE));   // 從上一版（16 格）升級
    if(old && Array.isArray(old.pads)){
      Object.assign(S, {bpm:old.bpm || 100, root:old.root ?? 9, scale:SCALES[old.scale] ? old.scale : 'minor', quant:old.quant || 'off'});
      S.pads = PAD_KEYS.map((_, i) => newPad(i));
      for(const op of old.pads){
        let idx = PAD_KEYS.indexOf(op.key); if(idx < 0 || S.pads[idx].objects.length) continue;
        S.pads[idx] = normalizePad({...newPad(idx), ...op, key:PAD_KEYS[idx], objects:(op.objects || []).map(normalizeObj)});
      }
      toast('已把上一版的 16 格音效搬過來了');
      return true;
    }
  }catch(e){ console.warn(e); }
  return false;
}

/* ---------- 啟動 ---------- */
const hadSave = load();
if(!hadSave) S.pads = PAD_KEYS.map((_, i) => newPad(i));
syncGlobals(); syncBoardName(); buildBoard(); setMode('play'); setView('board'); syncTools(); syncOvOptions();
(function frame(){ requestAnimationFrame(frame); drawBoard(); drawEditor(); ovFrame(); })();
loadTemplateFiles().then(() => {
  fillTemplateSelect();
  const first = templateList()[0];
  if(!hadSave && first){ applyBoard(first); toast(`第一次使用，先幫你載入範本「${first.name}」`); }
  if(!templateList().length) toast('找不到範本檔（templates 資料夾），範本選單會是空的');
});
