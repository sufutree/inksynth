'use strict';
/* ============================================================
   library.js — 音效板檔案、範本檔、音色庫、匯入音色
   檔案格式：{format:'inksynth-board', version:2, name, bpm, root, scale, quant, pads:[40 格]}
   範本檔（templates/*.js）是同樣的 JSON，外面包一層 InkTemplates.add(...)
   ============================================================ */
const BOARD_FORMAT = 'inksynth-board';
const round4 = (k, v) => k[0] === '_' ? undefined : typeof v === 'number' ? Math.round(v * 10000) / 10000 : v;
const clone = x => JSON.parse(JSON.stringify(x));
const safeName = s => (s || 'inksynth').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'inksynth';

function boardSnapshot(extra = {}){
  return {format:BOARD_FORMAT, version:2, name:S.boardName, bpm:S.bpm, root:S.root, scale:S.scale, quant:S.quant, pads:S.pads, ...extra};
}
/** 把檔案內容（.json 或範本 .js）轉成音效板資料，並補齊、檢查 */
function parseBoardText(text){
  let t = text.trim();
  const m = t.match(/InkTemplates\.add\(\s*([\s\S]*)\)\s*;?\s*$/);
  if(m) t = m[1];
  const d = JSON.parse(t);
  if(!d || d.format !== BOARD_FORMAT || !Array.isArray(d.pads)) throw new Error('這不是 InkSynth 音效板檔案');
  return normalizeBoard(d);
}
function normalizeBoard(d){
  const pads = PAD_KEYS.map((_, i) => {
    const p = d.pads[i] || {};
    return normalizePad({...newPad(i), ...clone(p), key:p.key || PAD_KEYS[i], beats:[1, 2, 4, 8, 16, 32].includes(p.beats) ? p.beats : 4,
            objects:(p.objects || []).map(o => normalizeObj(clone(o)))});
  });
  return {...d, name:d.name || '未命名音效板', bpm:clamp(+d.bpm || 100, 50, 200), root:((+d.root || 0) % 12 + 12) % 12,
          scale:SCALES[d.scale] ? d.scale : 'minor', quant:['off', 'beat', 'bar'].includes(d.quant) ? d.quant : 'off', pads};
}
/** 用一份音效板資料取代目前的音效板 */
function applyBoard(d){
  stopAll(); closeEditor();
  const b = normalizeBoard(clone(d));
  Object.assign(S, {bpm:b.bpm, root:b.root, scale:b.scale, quant:b.quant, boardName:b.name, pads:b.pads});
  resetScaleCache(); updateDelayTime(); syncGlobals(); syncBoardName();
  inkVer++; bgDirty = inkDirty = true; buildBoard(); if(S.view === 'overview') buildLegend(); saveNow();
}
function download(filename, text, type = 'application/json'){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], {type:type + ';charset=utf-8'}));
  a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function pickFile(accept = '.json,.js'){
  return new Promise(res => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = accept;
    inp.onchange = () => res(inp.files[0] || null); inp.click();
  });
}
async function readBoardFile(){
  const f = await pickFile(); if(!f) return null;
  try{ const d = parseBoardText(await f.text()); if(!d.name || d.name === '未命名音效板') d.name = f.name.replace(/\.(inksynth\.)?(json|js)$/i, ''); return d; }
  catch(e){ toast('讀取失敗：' + e.message); return null; }
}

/* ---------- 範本（templates/ 資料夾裡的檔案） ---------- */
function loadTemplateFiles(){
  const files = InkTemplates.files || [];
  return Promise.all(files.map(f => new Promise(res => {
    const sc = document.createElement('script'); sc.src = `templates/${f}.js`;
    sc.onload = res; sc.onerror = () => { console.warn('範本載入失敗：' + f); res(); };
    document.head.appendChild(sc);
  })));
}
const templateList = () => (InkTemplates.files || []).map(f => InkTemplates.map[f]).filter(Boolean);

/* ---------- 音色庫：從檔案加入、存在瀏覽器裡 ---------- */
const LIB_STORE = 'inksynth-libs-v1';
let LIBS = [];
try{ LIBS = JSON.parse(localStorage.getItem(LIB_STORE)) || []; }catch(e){ LIBS = []; }
function saveLibs(){
  try{ localStorage.setItem(LIB_STORE, JSON.stringify(LIBS, round4)); }
  catch(e){ toast('瀏覽器儲存空間不足，這個音色庫只會保留到關閉頁面為止'); }
}
function addLibrary(d){
  const lib = {id:'lib' + Date.now().toString(36), name:d.name, root:d.root, scale:d.scale, bpm:d.bpm,
               pads:d.pads.filter(p => p.objects.length).map(clone)};
  if(!lib.pads.length){ toast('這個檔案裡沒有任何音色'); return null; }
  LIBS.push(lib); saveLibs(); return lib;
}

/* ---------- 匯入音色對話框 ---------- */
const impScratch = document.createElement('canvas');
let impSrc = 'cur';
function impSources(){
  const list = [{id:'cur', name:`目前音效板（${S.boardName}）`, pads:S.pads.filter((p, i) => p.objects.length && i !== S.editing)}];
  for(const t of templateList()) list.push({id:'tpl:' + t.id, name:`範本：${t.name}`, info:`${NOTE_NAMES[t.root]} ${SCALES[t.scale].name}・${t.bpm} BPM`,
    key:{root:t.root, scale:t.scale}, pads:t.pads.filter(p => p.objects.length)});
  for(const l of LIBS) list.push({id:'lib:' + l.id, name:`音色庫：${l.name}`, info:`${NOTE_NAMES[l.root]} ${SCALES[l.scale]?.name || ''}・${l.bpm} BPM`,
    key:SCALES[l.scale] ? {root:l.root, scale:l.scale} : null, pads:l.pads, lib:l});
  return list;
}
function openImport(){
  if(S.editing === null) return;
  const srcs = impSources();
  if(!srcs.find(s => s.id === impSrc)) impSrc = 'cur';
  $('#impSrc').innerHTML = srcs.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
  $('#impSrc').value = impSrc;
  $('#impTarget').textContent = `#${S.editing + 1}「${keyLabel(EP().key)}」`;
  $('#impModal').hidden = false; renderImport();
}
function closeImport(){ stopPad('imp', 0.05); $('#impModal').hidden = true; }
let impKeep = false;
/** 來源音色實際要用的樣子：勾選「保留來源調性」時，帶上來源的調性當作獨立調性 */
function impPadOf(src, p){
  if(p.ownKey || !impKeep || !src.key) return p;
  const same = src.key.root === S.root && src.key.scale === S.scale;
  return same ? p : {...p, ownKey:{...src.key}};
}
function renderImport(){
  const src = impSources().find(s => s.id === impSrc);
  $('#impDelLib').hidden = !src.lib;
  $('#impKeepWrap').hidden = !src.key; $('#impKeep').checked = impKeep;
  $('#impNote').textContent = (src.info ? src.info + '。' : '') + (impKeep && src.key
    ? `匯入後保留來源的調性（設為這格的獨立調性），速度跟隨目前設定，按鍵維持「${keyLabel(EP().key)}」。`
    : `匯入後會套用目前的調性（${NOTE_NAMES[S.root]} ${SCALES[S.scale].name}）與速度，按鍵維持「${keyLabel(EP().key)}」。`);
  const grid = $('#impGrid');
  if(!src.pads.length){ grid.innerHTML = '<div class="impEmpty">這裡沒有可以匯入的音色</div>'; return; }
  grid.innerHTML = src.pads.map((p, j) => `
    <div class="impCard" data-j="${j}" style="--c:${padColor(p)}">
      <canvas width="10" height="10"></canvas>
      <div class="impMeta"><kbd>${keyLabel(p.key)}</kbd><b>${p.name || '未命名'}</b></div>
      <div class="impInfo">${beatsLabel(p.beats)}・${PAD_MODES[p.mode]}・${p.objects.length} 筆</div>
      <div class="impBtns"><button data-act="play">▷ 試聽</button><button data-act="use" class="pri">匯入</button></div>
    </div>`).join('');
  const dpr = Math.min(2, devicePixelRatio || 1);
  $$('#impGrid .impCard').forEach(card => {
    const p0 = src.pads[+card.dataset.j], p = impPadOf(src, p0), cv = card.querySelector('canvas'), w = 200, h = 120;
    cv.width = w * dpr; cv.height = h * dpr; impScratch.width = w * dpr; impScratch.height = h * dpr;
    const c = ctxFor(cv, dpr); c.fillStyle = '#0f1117'; c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(0, DRUM_TOP * h, w, h);
    const V = {W:w, H:h, dpr, s:impScratch, k:h / 430}; withKey(p, () => { for(const o of p.objects) drawObj(c, o, V); });
    card.onclick = e => {
      const act = e.target.closest('button')?.dataset.act; if(!act) return;
      if(act === 'play'){ if(voices.has('imp') && impPlaying === p0) stopPad('imp'); else { startVoice('imp', p, {immediate:true, loop:false}); impPlaying = p0; } }
      else importPad(p);
    };
  });
  markImport();
}
let impPlaying = null;
function markImport(){
  const src = impSources().find(s => s.id === impSrc), on = voices.has('imp');
  $$('#impGrid .impCard').forEach(card => {
    const playing = on && src && src.pads[+card.dataset.j] === impPlaying;
    card.classList.toggle('playing', playing); card.querySelector('[data-act=play]').textContent = playing ? '■ 停止' : '▷ 試聽';
  });
}
function importPad(src){
  const p = EP(); pushHistory();
  Object.assign(p, normalizePad({name:src.name, mode:src.mode, beats:src.beats, vol:src.vol ?? 0.8, align:src.align, ownKey:clone(src.ownKey || null),
    objects:clone(src.objects).map(normalizeObj)}));
  S.sel = null; closeImport(); stopPad(S.editing, 0.02); resetScaleCache();
  bgDirty = true; changed(); syncEditorBar(); syncTools();
  toast(`已匯入「${src.name || '未命名'}」，可以按 Ctrl+Z 復原畫面內容`);
}
const beatsLabel = b => b < 4 ? `${b} 拍` : `${b / 4} 小節`;
$('#impSrc').onchange = e => { impSrc = e.target.value; stopPad('imp', 0.05); renderImport(); };
$('#impKeep').onchange = e => { impKeep = e.target.checked; stopPad('imp', 0.05); renderImport(); };
$('#impClose').onclick = closeImport;
$('#impModal').addEventListener('pointerdown', e => { if(e.target.id === 'impModal') closeImport(); });
$('#impAddFile').onclick = async () => {
  const d = await readBoardFile(); if(!d) return;
  const lib = addLibrary(d); if(!lib) return;
  impSrc = 'lib:' + lib.id; openImport(); toast(`已把「${lib.name}」加入音色庫（${lib.pads.length} 個音色）`);
};
$('#impDelLib').onclick = () => {
  const id = impSrc.slice(4), lib = LIBS.find(l => l.id === id); if(!lib) return;
  if(!confirm(`從音色庫移除「${lib.name}」？（不會刪除你電腦裡的檔案）`)) return;
  LIBS = LIBS.filter(l => l.id !== id); saveLibs(); impSrc = 'cur'; openImport();
};

/* ---------- 檔案選單 ---------- */
function syncBoardName(){ $('#boardName').textContent = S.boardName; $('#boardName').title = '點擊重新命名：' + S.boardName; }
$('#boardName').onclick = () => { const n = prompt('音效板名稱', S.boardName); if(n && n.trim()){ S.boardName = n.trim().slice(0, 40); syncBoardName(); save(); } };
$('#fileBtn').onclick = e => { e.stopPropagation(); $('#fileMenu').hidden = !$('#fileMenu').hidden; };
document.addEventListener('pointerdown', e => { if(!e.target.closest('#fileMenu, #fileBtn')) $('#fileMenu').hidden = true; });
$('#fileMenu').onclick = async e => {
  const act = e.target.closest('button')?.dataset.act; if(!act) return;
  $('#fileMenu').hidden = true;
  const hasContent = S.pads.some(p => p.objects.length);
  if(act === 'new'){
    if(hasContent && !confirm('建立全新的空白音效板？目前的內容會被清掉（建議先儲存成檔案）。')) return;
    applyBoard({format:BOARD_FORMAT, name:'新的音效板', bpm:S.bpm, root:S.root, scale:S.scale, quant:S.quant, pads:[]});
    toast('已建立空白音效板，切到 ✎ 編輯 開始畫');
  } else if(act === 'open'){
    const d = await readBoardFile(); if(!d) return;
    if(hasContent && !confirm(`開啟「${d.name}」會取代目前的音效板，確定嗎？`)) return;
    applyBoard(d); toast(`已開啟「${d.name}」`);
  } else if(act === 'save'){
    download(`${safeName(S.boardName)}.inksynth.json`, JSON.stringify(boardSnapshot(), round4));
    toast('已下載音效板檔案，之後可以用「開啟音效板檔案」讀回來');
  } else if(act === 'template'){
    const desc = prompt('範本說明（會顯示在範本選單）', `${NOTE_NAMES[S.root]} ${SCALES[S.scale].name}・${S.bpm} BPM`); if(desc === null) return;
    const file = safeName(S.boardName).replace(/\s+/g, '_');
    const data = boardSnapshot({id:'user_' + Date.now().toString(36), desc});
    download(`${file}.js`, `/* InkSynth 範本：${S.boardName} */\nInkTemplates.add(${JSON.stringify(data, round4)});\n`, 'text/javascript');
    alert(`已下載範本檔「${file}.js」。\n\n要讓它出現在範本選單：\n1. 把檔案放進 templates 資料夾\n2. 用記事本打開 templates/manifest.js，在清單裡加上 "${file}"\n3. 重新整理頁面`);
  } else if(act === 'lib'){
    const d = await readBoardFile(); if(!d) return;
    const lib = addLibrary(d); if(lib) toast(`已把「${lib.name}」加入音色庫，在編輯器按「📥 匯入音色」就能挑選`);
  } else if(act === 'libcur'){
    const lib = addLibrary(clone(boardSnapshot())); if(lib) toast(`已把目前的音效板存進音色庫（${lib.pads.length} 個音色）`);
  }
};
function fillTemplateSelect(){
  $('#tpl').innerHTML = '<option value="">🎼 範本…</option>' +
    templateList().map(t => `<option value="${t.id}">${t.name}（${NOTE_NAMES[t.root]} ${SCALES[t.scale]?.name || t.scale}・${t.bpm}）</option>`).join('');
}
$('#tpl').onchange = e => {
  const t = InkTemplates.map[Object.keys(InkTemplates.map).find(f => InkTemplates.map[f].id === e.target.value)];
  e.target.value = ''; e.target.blur(); if(!t) return;
  if(S.pads.some(p => p.objects.length) && !confirm(`載入範本「${t.name}」會取代目前的音效板，確定嗎？\n（建議先用「☰ 檔案 → 儲存」存檔）`)) return;
  applyBoard(t); toast(`已載入「${t.name}」：${t.desc || ''}`);
};
