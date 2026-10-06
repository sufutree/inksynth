'use strict';
/* ============================================================
   editor.js — 單格音效的繪製編輯器
   畫布分成上下兩區：上方旋律（鋼琴卷軸），下方節奏（步進格），中間的分隔線可以拖曳。
   物件的資料座標（0–1）不變，只有畫面上的 y 會依分隔位置重新對應（ymap / yinv）。
   ============================================================ */
const cvs = $('#cv'), g = cvs.getContext('2d'), gut = $('#gut');
const bgLayer = document.createElement('canvas'), inkLayer = document.createElement('canvas'), scratch = document.createElement('canvas');
let W = 0, H = 0, DPR = 1, bgDirty = true, inkDirty = true, gutKey = '';
let cur = null, curChord = null, noteDrag = null, paint = null, erasing = false, drag = null, bindingKey = false, stroke = null, hover = null;
/* 選取：SELS 是所有選到的物件（S.sel 是第一個，面板顯示它的參數）；selNote 是和弦裡被點選的那一個音；box 是框選範圍 */
let SELS = [], selNote = null, box = null;
const EP = () => S.pads[S.editing];

/* ---------- 上下分區 ---------- */
const UI_STORE = 'inksynth-ui-v1', SPLIT_DEF = 0.6;
let SPLIT = SPLIT_DEF;   // 旋律區佔畫布高度的比例
try{ const u = JSON.parse(localStorage.getItem(UI_STORE)); if(u && u.split) SPLIT = clamp(u.split, 0.3, 0.85); }catch(e){}
const saveUI = () => { try{ localStorage.setItem(UI_STORE, JSON.stringify({split:SPLIT})); }catch(e){} };
const splitPx = () => SPLIT * H;
function ymap(y){ const sp = splitPx(); return y <= DRUM_TOP ? y / DRUM_TOP * sp : sp + (y - DRUM_TOP) / (1 - DRUM_TOP) * (H - sp); }
function yinv(py){ const sp = splitPx(); return py <= sp ? py / sp * DRUM_TOP : DRUM_TOP + (py - sp) / (H - sp) * (1 - DRUM_TOP); }
const laneH = () => (H - splitPx()) * (LANES.hat - LANES.ohat) / (1 - DRUM_TOP);
const EV = () => ({W, H, dpr:DPR, s:scratch, k:1, ym:ymap, dk:clamp(laneH() / 30, 0.8, 1.5)});
const stepsOf = () => EP().beats * S.brush.grid;

function resizeEditor(){
  const r = $('#cvWrap').getBoundingClientRect(); if(!r.width) return;
  DPR = Math.min(2, devicePixelRatio || 1); W = r.width; H = r.height;
  for(const c of [cvs, bgLayer, inkLayer, scratch]){ c.width = Math.round(W * DPR); c.height = Math.round(H * DPR); }
  gut.width = Math.round(gut.clientWidth * DPR); gut.height = Math.round(H * DPR);
  bgDirty = inkDirty = true; placeSplit();
}
new ResizeObserver(resizeEditor).observe($('#cvWrap'));
function placeSplit(){ $('#split').style.top = splitPx() + 'px'; }
{
  const sp = $('#split');
  sp.addEventListener('pointerdown', e => { e.preventDefault(); sp.setPointerCapture(e.pointerId); sp.classList.add('on'); });
  sp.addEventListener('pointermove', e => {
    if(!sp.classList.contains('on')) return;
    const r = $('#cvWrap').getBoundingClientRect(); SPLIT = clamp((e.clientY - r.top) / r.height, 0.3, 0.85);
    bgDirty = inkDirty = true; placeSplit();
  });
  const up = () => { if(sp.classList.contains('on')){ sp.classList.remove('on'); saveUI(); } };
  sp.addEventListener('pointerup', up); sp.addEventListener('pointercancel', up);
  sp.addEventListener('dblclick', () => { SPLIT = SPLIT_DEF; bgDirty = inkDirty = true; placeSplit(); saveUI(); });
}

/* ---------- 繪製 ---------- */
function drawEditor(){ if(S.editing !== null && W) withKey(EP(), drawEditor0); }
function drawEditor0(){
  const pad = EP(), V = EV();
  if(bgDirty){ const c = ctxFor(bgLayer, DPR); c.clearRect(0, 0, W, H);
    drawGrid(c, V, pad.beats, {sub:S.brush.grid, side:false, bands:true, cells:true}); bgDirty = false; gutKey = ''; }
  if(inkDirty){ const c = ctxFor(inkLayer, DPR); c.clearRect(0, 0, W, H);
    for(const o of pad.objects) drawObj(c, o, V);
    for(const o of pad.objects) drawQuantTrace(c, o, V);
    inkDirty = false; }
  g.setTransform(DPR, 0, 0, DPR, 0, 0); g.clearRect(0, 0, W, H);
  g.drawImage(bgLayer, 0, 0, W, H);
  drawHover(V);
  g.drawImage(inkLayer, 0, 0, W, H);
  if(cur){ drawLineObj(g, cur, V); drawQuantTrace(g, cur, V); }
  for(const o of SELS) if(pad.objects.includes(o)) drawSelection(g, o, V, o === S.sel ? selNote : null);
  if(S.brush.tool === 'note' && (S.sel || REST) && !noteDrag){   // 鍵盤輸入的游標：下一個音會放在這裡
    const x = insertPos() * W, sw = W / stepsOf();
    g.save(); g.strokeStyle = 'rgba(255,210,63,.9)'; g.fillStyle = 'rgba(255,210,63,.12)'; g.setLineDash([4, 3]);
    g.fillRect(x, 0, sw, splitPx()); g.beginPath(); g.moveTo(x, 0); g.lineTo(x, splitPx()); g.stroke(); g.restore();
  }
  if(box){ g.save(); g.fillStyle = 'rgba(124,240,208,.08)'; g.strokeStyle = 'rgba(124,240,208,.8)'; g.setLineDash([4, 3]);
    g.fillRect(box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0); g.strokeRect(box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0); g.restore(); }
  const st = padState(S.editing);
  if(st.state === 'playing') drawPlayhead(g, pad.objects, st.prog, V, padDur(pad));
  drawGutter(V);
}
/** 游標所在的音高列／鼓格亮起來，音符工具會先顯示一個預覽方塊 */
function drawHover(V){
  if(!hover || drag) return;
  const t = S.brush.tool, steps = stepsOf(), sw = W / steps;
  if(hover.sy > splitPx()){
    if(t === 'select' || t === 'erase') return;
    const {lane, x} = drumCell(hover), y = ymap(LANES[lane]), lh = laneH();
    g.fillStyle = hexA(DRUMS[lane].color, .08); g.fillRect(0, y - lh / 2, W, lh);
    g.strokeStyle = hexA(DRUMS[lane].color, .8); g.lineWidth = 1.5;
    const pw = Math.min(sw * 0.62, 22), ph = Math.min(lh * 0.62, 26);
    g.beginPath(); g.roundRect ? g.roundRect(x * W - pw / 2, y - ph / 2, pw, ph, Math.min(6, pw / 2)) : g.rect(x * W - pw / 2, y - ph / 2, pw, ph); g.stroke();
    return;
  }
  const m = quant(hover.y), r = noteRows().find(q => q.m === m); if(!r) return;
  const y0 = ymap(r.y0), y1 = ymap(r.y1);
  g.fillStyle = 'rgba(255,255,255,.06)'; g.fillRect(0, y0, W, y1 - y0);
  if(t === 'note' && !noteDrag){
    const x0 = Math.floor(clamp(hover.x, 0, 0.9999) * steps) / steps;
    g.fillStyle = hexA(toneColor(S.brush.tone), .35); g.fillRect(x0 * W + 1, y0 + 1, sw - 2, y1 - y0 - 2);
  }
  if(t !== 'select' && t !== 'erase' && t !== 'drop'){
    const label = noteName(m), tx = clamp(hover.sx + 14, 4, W - 40), ty = clamp(hover.sy - 14, 10, H - 10);
    g.font = 'bold 12px system-ui, sans-serif'; g.textBaseline = 'middle';
    const tw = g.measureText(label).width + 10;
    g.fillStyle = 'rgba(0,0,0,.7)'; g.fillRect(tx - 5, ty - 9, tw, 18);
    g.fillStyle = toneColor(S.brush.tone); g.fillText(label, tx, ty);
  }
}
/** 左側：上半是只列出音階內音的鋼琴鍵，下半是鼓名 */
function drawGutter(V){
  const gw = gut.clientWidth; if(!gw) return;
  const hm = hover && hover.sy <= splitPx() && S.brush.tool !== 'drop' ? quant(hover.y) : null;
  const sm = pv ? pv.m : null, hl = hover && hover.sy > splitPx() ? laneAt(hover.y) : null;
  const key = [W, H, SPLIT, hm, sm, hl, curRoot(), curScale()].join('|'); if(key === gutKey) return; gutKey = key;
  const c = ctxFor(gut, DPR); c.clearRect(0, 0, gw, H);
  c.font = '10.5px system-ui, sans-serif'; c.textBaseline = 'middle';
  const rows = noteRows();
  for(const r of rows){
    const y0 = ymap(r.y0), y1 = ymap(r.y1), on = r.m === hm || r.m === sm, black = NOTE_NAMES[r.m % 12].includes('#');
    c.fillStyle = on ? toneColor(S.brush.tone) : r.root ? '#2a4d46' : black ? '#16181f' : '#c4c1b8';
    c.fillRect(0, y0 + 0.5, black && !on ? gw * 0.72 : gw, y1 - y0 - 1);
    if(y1 - y0 >= 11 || r.root || on){
      c.fillStyle = on ? '#000' : r.root ? '#7cf0d0' : black ? '#9a9caa' : '#2b2c33';
      c.textAlign = 'right'; c.fillText(noteName(r.m), gw - 5, (y0 + y1) / 2);
    }
  }
  const sp = splitPx();
  c.fillStyle = '#090a0e'; c.fillRect(0, sp, gw, H - sp);
  c.strokeStyle = 'rgba(124,240,208,.35)'; c.beginPath(); c.moveTo(0, sp); c.lineTo(gw, sp); c.stroke();
  const lh = laneH();
  for(const k of LANE_KEYS){
    const y = ymap(LANES[k]), on = k === hl;
    if(on){ c.fillStyle = hexA(DRUMS[k].color, .25); c.fillRect(0, y - lh / 2, gw, lh); }
    c.fillStyle = on ? '#fff' : DRUMS[k].color; c.textAlign = 'right';
    c.font = `${lh >= 30 ? 'bold 12px' : '10.5px'} system-ui, sans-serif`; c.fillText(DRUMS[k].zh, gw - 5, y - (lh >= 34 ? 6 : 0));
    if(lh >= 34){ c.font = '8.5px system-ui, sans-serif'; c.fillStyle = hexA(DRUMS[k].color, .55); c.fillText(DRUMS[k].en, gw - 5, y + 7); }
  }
  c.textAlign = 'left';
}

/* ---------- 開關編輯器 ---------- */
function openEditor(i){
  stopAll(); S.editing = i; setSel([]); bindingKey = false;
  $('#editor').hidden = false; resizeEditor(); bgDirty = inkDirty = true;
  syncEditorBar(); buildDetail(); syncTools();
}
function closeEditor(){
  if(S.editing === null) return;
  const i = S.editing; if((voices.get(i) || {}).preview) stopPad(i);
  S.editing = null; SELS = []; S.sel = null; selNote = null; bindingKey = false; hover = null; $('#editor').hidden = true; refreshPad(i); sizeThumbs();
}
function syncEditorBar(){
  if(S.editing === null) return;
  const p = EP();
  $('#eNum').textContent = `#${S.editing + 1}`;
  $('#eName').value = p.name; $('#eVol').value = p.vol; $('#eBeats').value = p.beats;
  $('#eKey').textContent = bindingKey ? '請按新的鍵…' : '按鍵 ' + keyLabel(p.key);
  $('#eKey').classList.toggle('wait', bindingKey);
  $$('#eMode button').forEach(b => b.classList.toggle('on', b.dataset.v === p.mode));
  const playing = voices.has(S.editing);
  $('#ePlay').textContent = playing ? '■ 停止' : '▶ 試聽整格'; $('#ePlay').classList.toggle('on', playing);
  syncSpecial();
}
function togglePreview(){
  const i = S.editing; if(i === null) return;
  if(voices.has(i)) stopPad(i);
  else if(!startPad(i, {loop:true, immediate:true, preview:true})) toast('先畫點東西再試聽');
  syncEditorBar();
}

/* ---------- 特例選項：這格自己的啟動對齊、獨立調性 ---------- */
$('#eAlign').innerHTML = Object.entries(ALIGNS).map(([k, v]) => `<button data-v="${k}">${{global:'', off:'⚡ ', beat:'♩ ', bar:'𝄀 '}[k]}${v}</button>`).join('');
NOTE_NAMES.forEach((n, i) => $('#eRoot').add(new Option(n, i)));
Object.entries(SCALES).forEach(([k, v]) => $('#eScale').add(new Option(v.name, k)));
function syncSpecial(){
  const p = EP(), own = !!p.ownKey;
  $$('#eAlign button').forEach(b => b.classList.toggle('on', b.dataset.v === p.align));
  $$('#eKeyMode button').forEach(b => b.classList.toggle('on', b.dataset.v === (own ? 'own' : 'follow')));
  $('#eRoot').disabled = $('#eScale').disabled = !own;
  $('#eRoot').value = own ? p.ownKey.root : S.root; $('#eScale').value = own ? p.ownKey.scale : S.scale;
  const special = own || p.align !== 'global';
  $('#eSpecialBtn').classList.toggle('on', special);
  $('#eSpecialBtn').textContent = special ? '⚙ 特例 ●' : '⚙ 特例';
  const q = p.align === 'global' ? `啟動跟隨上方的「${ALIGNS[S.quant]}」` : p.align === 'off' ? '⚡ 按下立刻發聲，不等拍子（適合音效、打擊點綴）' : `這格永遠${ALIGNS[p.align]}啟動`;
  $('#eSpecialNote').textContent = q + '・' + (own ? `♮ 固定在 ${keyName(p)}，切換主調也不會變` : `音高吸附到主調 ${keyName(null)}`);
}
function specialChanged(){
  const p = EP(); resetScaleCache(); bgDirty = inkDirty = true; inkVer++;
  syncSpecial(); syncTools(); refreshPad(S.editing); save();
  if(voices.has(S.editing) && (voices.get(S.editing) || {}).preview){ stopPad(S.editing, 0.02); togglePreview(); }
  return p;
}
$('#eSpecialBtn').onclick = () => { $('#eSpecial').hidden = !$('#eSpecial').hidden; resizeEditor(); };
$('#eAlign').onclick = e => { const b = e.target.closest('button'); if(!b) return; EP().align = b.dataset.v; specialChanged(); };
$('#eKeyMode').onclick = e => {
  const b = e.target.closest('button'); if(!b) return; const p = EP();
  if(b.dataset.v === 'own'){ if(!p.ownKey) p.ownKey = {root:S.root, scale:S.scale}; }
  else p.ownKey = null;
  specialChanged();
};
$('#eRoot').onchange = e => { const p = EP(); if(p.ownKey){ p.ownKey.root = +e.target.value; specialChanged(); } };
$('#eScale').onchange = e => { const p = EP(); if(p.ownKey){ p.ownKey.scale = e.target.value; specialChanged(); } };

/* ---------- 面板：目標是「選取的物件」或「筆刷」 ---------- */
const target = () => S.sel || S.brush;
const targetKind = () => S.sel ? S.sel.type : S.brush.tool === 'drop' ? 'drop' : S.brush.tool === 'chord' ? 'chord' : 'line';

/** keys：每個按鈕對應的快捷鍵，會標在說明文字旁，例如「選取 (1)」 */
function makeSeg(el, entries, attr, keys = []){
  el.innerHTML = Object.entries(entries).map(([k, v], i) => `<button data-${attr}="${k}">${v.zh}${v.sub || keys[i] ? `<small>${v.sub || ''}${keys[i] ? ` (${keys[i]})` : ''}</small>` : ''}</button>`).join('');
}
const TOOLS = {select:{zh:'⬚', sub:'選取'}, line:{zh:'〰', sub:'水墨旋律線'}, note:{zh:'♪', sub:'音符（短音）'},
               chord:{zh:'△', sub:'和弦'}, drop:{zh:'●', sub:'鼓'}, erase:{zh:'⌫', sub:'橡皮擦'}};
/* 編輯模式的數字鍵：1–6 切換工具、7–0 切換對齊格線（依按鈕的排列順序） */
const TOOL_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'], GRID_KEYS = ['Digit7', 'Digit8', 'Digit9', 'Digit0'];
makeSeg($('#tools'), TOOLS, 'tool', TOOL_KEYS.map(keyLabel));
makeSeg($('#grids'), GRIDS, 'grid', GRID_KEYS.map(keyLabel));
makeSeg($('#dyns'), DYN_MODES, 'dyn');
makeSeg($('#envs'), ENV_PRESETS, 'env');
makeSeg($('#texs'), TEXTURES, 'tex');
makeSeg($('#shapes'), SHAPES, 'shape');
$('#tones').innerHTML = TONE_KEYS.map(k => { const t = TONES[k]; const [c, n] = t.zh.split('・');
  return `<button data-tone="${k}" style="--tc:${t.color}" title="${t.desc}"><i></i><b>${c}</b><span>${n}</span></button>`; }).join('');

/** 有選取就套用到所有選到的物件（只改那種物件有的參數），沒選取就改筆刷 */
function setProp(k, val){
  if(SELS.length){
    let n = 0; pushHistory('prop:' + k);   // 面板上的修改也能復原
    for(const o of SELS){
      if(o.type === 'drop' && !DRUM_KEYS.includes(k) && k !== 'alpha') continue;
      if(o.type !== 'drop' && k === 'tune') continue;
      if(k === 'shape'){ if(o.type !== 'chord') continue; withKey(EP(), () => { o.notes = stackChord(o.y, SHAPE_N[val]); syncChord(o); }); n++; continue; }   // 形狀＝音數：從根音重新疊
      o[k] = val; n++;
    }
    if(k === 'shape') selNote = null;
    if(n) changed();
  } else S.brush[k] = val;
  syncTools();
}
const fmtSec = v => v < 1 ? Math.round(v * 1000) + ' ms' : v.toFixed(2) + ' s';
const pct = v => Math.round(v * 100) + '%';
const SPACE = [
  {g:'空間'},
  {k:'pan', zh:'Pan 聲像', min:-1, max:1, step:0.05, fmt:v => Math.abs(v) < 0.03 ? '中' : (v < 0 ? 'L ' : 'R ') + Math.round(Math.abs(v) * 100)},
  {k:'rev', zh:'Reverb 殘響', min:0, max:1, fmt:pct},
];
const DETAIL = [
  {g:'包絡 ADSR'},
  {k:'a', zh:'Attack 起音', min:0.001, max:2, exp:true, fmt:fmtSec},
  {k:'d', zh:'Decay 衰減', min:0.01, max:2, exp:true, fmt:fmtSec},
  {k:'s', zh:'Sustain 延持', min:0, max:1, fmt:pct},
  {k:'r', zh:'Release 釋音', min:0.01, max:3, exp:true, fmt:fmtSec},
  {g:'濾波與音色'},
  {k:'q', zh:'Resonance 共振', min:0.3, max:18, exp:true, fmt:v => v.toFixed(1)},
  {k:'fenv', zh:'Filter Env 掃頻', min:0, max:1, fmt:pct},
  {k:'uni', zh:'Unison 齊奏寬度', min:0, max:50, step:1, fmt:v => Math.round(v) + ' ¢'},
  {k:'drive', zh:'Drive 失真', min:0, max:1, fmt:pct},
  {k:'oct', zh:'Octave 八度', min:-2, max:2, step:1, fmt:v => (v > 0 ? '+' : '') + v},
  {g:'調變'},
  {k:'glide', zh:'Glide 滑音', min:0, max:0.5, fmt:fmtSec},
  {k:'lfoR', zh:'LFO 速度', min:0.5, max:12, exp:true, fmt:v => v.toFixed(1) + ' Hz'},
  {k:'lfoD', zh:'LFO 顫音深度', min:0, max:100, step:1, fmt:v => Math.round(v) + ' ¢'},
  ...SPACE,
  {k:'dly', zh:'Delay 延遲', min:0, max:1, fmt:pct},
];
const DRUM_DETAIL = [
  {g:'鼓聲細節'},
  {k:'tune', zh:'Tune 音高', min:-12, max:12, step:1, fmt:v => (v > 0 ? '+' : '') + v + ' 半音'},
  {k:'dec', zh:'Decay 長度', min:0.3, max:2.5, fmt:v => '×' + v.toFixed(2)},
  ...SPACE,
];
const toPos = (d, v) => d.exp ? Math.log(v / d.min) / Math.log(d.max / d.min) * 1000 : (v - d.min) / (d.max - d.min) * 1000;
function fromPos(d, pos){
  let v = d.exp ? d.min * Math.pow(d.max / d.min, pos / 1000) : d.min + (d.max - d.min) * pos / 1000;
  if(d.step) v = Math.round(v / d.step) * d.step;
  return +v.toFixed(4);
}
let detailKind = null, detailKey = null;
const detailKeyNow = () => (S.sel ? 'sel' : 'brush') + targetKind();
function buildDetail(){
  const kind = targetKind(), list = kind === 'drop' ? DRUM_DETAIL : DETAIL;
  detailKind = kind; detailKey = detailKeyNow();
  $('#detailTitle').textContent = (S.sel ? '選取的' : '筆刷的') + (kind === 'drop' ? '鼓聲' : kind === 'chord' ? '和弦' : '旋律線') + '參數';
  $('#detailBox').innerHTML = list.map(d => d.g ? `<h4>${d.g}</h4>` :
    `<label class="dl"><span class="dn">${d.zh}</span><span class="dv" data-v="${d.k}"></span><input type="range" min="0" max="1000" data-k="${d.k}"></label>`).join('');
  $$('#detailBox input').forEach(inp => {
    const d = list.find(x => x.k === inp.dataset.k);
    inp.oninput = () => { setProp(d.k, fromPos(d, +inp.value)); };
    inp.ondblclick = () => { setProp(d.k, PDEF[d.k]); updateDetailValues(); };
  });
  updateDetailValues();
}
function updateDetailValues(){
  const t = target(), list = detailKind === 'drop' ? DRUM_DETAIL : DETAIL;
  $$('#detailBox input').forEach(inp => {
    const d = list.find(x => x.k === inp.dataset.k), v = t[d.k] ?? PDEF[d.k];
    if(document.activeElement !== inp) inp.value = toPos(d, clamp(v, d.min, d.max));
    $(`#detailBox [data-v="${d.k}"]`).textContent = d.fmt(v);
  });
}
function hintText(){
  const b = S.brush, key = keyName(S.editing === null ? null : EP()), drums = '・下方節奏區點一下放鼓、再點一下拿掉';
  switch(b.tool){
    case 'select': return '⬚ 選取：點一下選取、空白處拖曳框選、Shift＋點加選・和弦再點一次可選中單一個音｜鍵盤：A–G 換成最近的那個音（Shift＝升）・↑↓ 音階上下（Shift＝八度）・←→ 選旁邊的音（Shift 擴大範圍）・＋／− 和弦加減音・Ctrl+C／V 複製貼上・Delete 刪除・Esc 取消';
    case 'drop': return `● 鼓：在下方節奏區點一下放置、再點一下拿掉，按住橫拖可以連續填格・對齊 ${GRIDS[b.grid].zh}・濃度＝力度`;
    case 'erase': return '⌫ 橡皮擦：按住拖曳擦掉線條、音符、鼓或和弦';
    case 'chord': return `${SHAPES[b.shape].zh} 和弦（${SHAPES[b.shape].sub}）：點一下放置，按住往右拖曳可以拉長・之後用「⬚ 選取」點兩下和弦可以調每一個音｜${TONES[b.tone].zh}${drums}`;
    case 'note': return `♪ 音符：點一下放一個音（放完自動選取）、往右拖拉長、點已有的音符＝刪除｜鍵盤：A–G 在黃色虛線處輸入下一個音（Shift＝升，長度＝目前格線）・R 休止・Backspace 收回剛才那個音・7–0 換格線長度（先 1/8 再 1/4 就是切分音）・↑↓ 調音高・←→ 選音（Shift 擴大）・Esc 取消選取｜${key}｜${TONES[b.tone].zh}${drums}`;
  }
  const dyn = b.dyn === 'speed' ? '畫得越慢越重越響' : b.dyn === 'pressure' ? '筆壓越大越響（滑鼠會改用速度）' : '力度固定';
  return `〰 水墨旋律線：由左往右畫，白色階梯＝實際聽到的音（${key}）・按住 Shift＝鎖住目前的音・按住 Ctrl＝換音吸到最近的拍點（${GRIDS[b.grid].zh}）・${dyn}・點一下＝短音｜${TONES[b.tone].zh}｜Cutoff ${fmtHz(cutoffOf(b.size))}${drums}`;
}
function syncTools(){
  const t = target(), b = S.brush, on = (sel, attr, val) => $$(sel + ' button').forEach(x => x.classList.toggle('on', x.dataset[attr] === String(val)));
  if(detailKeyNow() !== detailKey) buildDetail();
  on('#tools', 'tool', b.tool); on('#dyns', 'dyn', b.dyn); on('#grids', 'grid', b.grid);
  on('#tones', 'tone', t.type === 'drop' ? null : t.tone);
  on('#texs', 'tex', t.type === 'drop' ? null : t.texture);
  on('#shapes', 'shape', t.type === 'chord' || !S.sel ? t.shape : null);
  const env = Object.keys(ENV_PRESETS).find(k => ['a','d','s','r'].every(q => Math.abs(ENV_PRESETS[k][q] - t[q]) < 1e-3));
  on('#envs', 'env', env);
  $('#size').value = t.size ?? b.size; $('#alpha').value = t.alpha;
  $('#vSize').textContent = fmtHz(cutoffOf(t.size ?? b.size)); $('#vAlpha').textContent = Math.round(t.alpha * 100) + '%';
  $('#toneDesc').textContent = t.type === 'drop' ? DRUMS[t.lane].zh : TONES[t.tone].desc;
  const sel = S.sel; $('#selBar').hidden = !sel;
  if(sel) withKey(EP(), () => { $('#selInfo').textContent = SELS.length > 1 ? `已選取 ${SELS.length} 個物件（調整會套用到全部）` : '正在調整：' + (sel.type === 'drop' ? `鼓（${DRUMS[sel.lane].zh}）`
    : sel.type === 'chord' ? `和弦 ${chordNotes(sel).map(noteName).join(' ')}${selNote !== null ? `・選中 ${noteName(chordNotes(sel)[selNote])}` : ''}（${TONES[sel.tone].zh}）`
    : `${isNoteObj(sel) ? '音符 ' + noteName(quant(sel.pts[0].y)) : '旋律線'}（${TONES[sel.tone].zh}）`); });
  $('#eside').classList.toggle('isDrop', targetKind() === 'drop');
  $('#hint').textContent = hintText();
  cvs.style.cursor = b.tool === 'erase' ? 'cell' : b.tool === 'select' ? 'default' : 'crosshair';
  updateDetailValues();
}
function setSel(list, note = null){
  SELS = [...new Set(list.filter(Boolean))]; S.sel = SELS[0] || null;
  selNote = SELS.length === 1 && S.sel.type === 'chord' ? note : null;
  inkDirty = true; if(S.editing !== null) syncTools();
}
function select(o){ setSel(o ? [o] : []); }

/* ---------- 歷史與變更 ---------- */
/* 每格各自有復原（_hist）與重做（_redo）；做了新的修改，重做就清空 */
let histTag = null, histAt = 0;
/** tag：連續拖滑桿這類同一種修改，2 秒內只記一次，免得要按很多次復原 */
function pushHistory(tag = null){
  const p = EP(), now = performance.now();
  if(tag && tag === histTag && now - histAt < 2000){ histAt = now; return; }
  histTag = tag; histAt = now;
  (p._hist ||= []).push(JSON.stringify(p.objects)); if(p._hist.length > 120) p._hist.shift(); p._redo = [];
}
function undo(){ const p = EP(); if(!p._hist || !p._hist.length) return toast('沒有可以復原的步驟');
  (p._redo ||= []).push(JSON.stringify(p.objects)); p.objects = JSON.parse(p._hist.pop()); histTag = null; setSel([]); changed(); syncTools(); }
function redo(){ const p = EP(); if(!p._redo || !p._redo.length) return toast('沒有可以重做的步驟');
  (p._hist ||= []).push(JSON.stringify(p.objects)); p.objects = JSON.parse(p._redo.pop()); histTag = null; setSel([]); changed(); syncTools(); }
function changed(){
  inkDirty = true; inkVer++;
  if(S.editing !== null){ const objs = EP().objects;
    if(SELS.some(o => !objs.includes(o))){ SELS = SELS.filter(o => objs.includes(o)); S.sel = SELS[0] || null; selNote = null; }   // 被刪掉的物件移出選取
    refreshPad(S.editing); }
  save();
}

/* ---------- 命中測試（都在畫面座標下算） ---------- */
const pos = e => { const r = cvs.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
  return {sx, sy, x:sx / r.width, y:yinv(sy)}; };
const inDrumZone = p => p.sy > splitPx();
const isNoteObj = o => o.type === 'line' && o.pts.length === 2 && Math.abs(o.pts[0].y - o.pts[1].y) < 1e-6;
function segDist(px, py, ax, ay, bx, by){
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy, u = l ? clamp(((px - ax) * dx + (py - ay) * dy) / l, 0, 1) : 0;
  return Math.hypot(px - ax - u * dx, py - ay - u * dy);
}
function hitObj(o, p){
  // 音符只算點在同一個音高列上：相鄰半音（例如 C 和 C♯）的列很窄，用距離判斷會誤點到旁邊的音
  if(isNoteObj(o)) return p.sy <= splitPx() && quant(clamp(p.y, MEL_TOP, MEL_BOT)) === quant(o.pts[0].y) && p.x >= o.pts[0].x - 3 / W && p.x <= o.pts[1].x + 3 / W;
  if(o.type === 'line'){
    const r = Math.max(8, o.size / 2 + 5);
    for(let i = 0; i < o.pts.length; i++){
      const a = o.pts[i], b = o.pts[Math.min(i + 1, o.pts.length - 1)];
      if(segDist(p.sx, p.sy, a.x * W, ymap(a.y), b.x * W, ymap(b.y)) < r) return true;
    }
    return false;
  }
  if(o.type === 'drop') return Math.hypot(o.x * W - p.sx, ymap(LANES[o.lane]) - p.sy) < Math.max(10, laneH() * 0.42);
  const {cy, h} = chordGeom(o, EV()); return p.x >= o.x - 0.005 && p.x <= o.x + o.len + 0.005 && Math.abs(p.sy - cy) < h / 2 + 6;
}
function topHit(p, ok = () => true){ const objs = EP().objects; for(let i = objs.length - 1; i >= 0; i--) if(ok(objs[i]) && hitObj(objs[i], p)) return objs[i]; return null; }
function eraseAt(p){ const pad = EP(), n = pad.objects.length; pad.objects = pad.objects.filter(o => !hitObj(o, p));
  if(pad.objects.length !== n) changed(); }
/** 吸到最接近的格線（依目前選的對齊格線） */
const snapBeat = x => { const st = stepsOf(); return clamp(Math.round(clamp(x, 0, 1) * st) / st, 0, 1); };
/** 筆觸力度：筆壓或速度（慢＝重） */
function strokeW(e, p){
  const b = S.brush;
  if(b.dyn === 'fixed') return 1;
  if(b.dyn === 'pressure' && e.pointerType !== 'mouse' && e.pressure > 0) return clamp(0.15 + e.pressure * 0.95, 0.2, 1);
  if(!stroke) return 0.75;
  const dt = Math.max(1, e.timeStamp - stroke.t), sp = Math.hypot(p.sx - stroke.sx, p.sy - stroke.sy) / dt;
  const target = clamp(1.1 - sp * 0.42, 0.2, 1);
  return stroke.w + (target - stroke.w) * 0.3;
}
const brushObj = extra => {
  const b = S.brush, o = {tone:b.tone, size:b.size, alpha:b.alpha, texture:b.texture, seed:Math.random() * 1e9 | 0, ...extra};
  for(const k in PDEF) o[k] = b[k];
  return o;
};

/* ---------- 節奏區：步進格 ---------- */
function drumCell(p){
  const steps = stepsOf(); let s = Math.round(clamp(p.x, 0, 1) * steps); if(s >= steps) s = steps - 1;
  return {lane:laneAt(p.y), x:s / steps};
}
const findDrop = (lane, x) => EP().objects.find(o => o.type === 'drop' && o.lane === lane && Math.abs(o.x - x) < 0.5 / stepsOf() - 1e-9);
function paintDrum(p){
  const {lane, x} = drumCell(p), id = lane + x; if(paint.done.has(id)) return; paint.done.add(id);
  const pad = EP(), dup = findDrop(lane, x);
  if(paint.mode === 'del'){ if(dup){ pad.objects = pad.objects.filter(o => o !== dup); changed(); } return; }
  if(dup) return;
  const o = brushObj({type:'drop', x, lane}); pad.objects.push(o); changed();
  playDrum(o, ctx.currentTime + 0.005, LOOSE);
}

/* ---------- 音符工具 ---------- */
function setNotePts(nd){
  const step = 1 / stepsOf(), y = midiToY(nd.m), x1 = Math.min(1, nd.x0 + (nd.len - 0.06) * step);
  nd.o.pts = [{x:nd.x0, y, w:0.9}, {x:x1, y, w:0.9}]; inkDirty = true;
}
const auditionNote = o => auditionObj(o, EP());

/* ---------- 畫布互動 ---------- */
function onDown(e){
  const p = pos(e), pad = EP(), b = S.brush;
  if(b.tool === 'select'){
    const hit = topHit(p);
    if(!hit){   // 空白處：拖曳框選（按住 Shift 是加選）
      if(!e.shiftKey) setSel([]);
      box = {sx:p.sx, sy:p.sy, x0:p.sx, y0:p.sy, x1:p.sx, y1:p.sy, add:e.shiftKey ? [...SELS] : []}; return;
    }
    if(e.shiftKey){ setSel(SELS.includes(hit) ? SELS.filter(o => o !== hit) : [...SELS, hit]); return; }   // Shift＋點：加選／取消
    if(hit.type === 'chord' && SELS.length === 1 && S.sel === hit){   // 再點一次已選的和弦：選中點到的那一個音
      const i = chordNotes(hit).indexOf(quant(clamp(p.y, MEL_TOP, MEL_BOT)));
      if(i >= 0){ materialize(hit); setSel([hit], i); } else setSel([hit]);
    } else if(!SELS.includes(hit)) setSel([hit]);
    drag = {start:p, origs:SELS.map(o => JSON.parse(JSON.stringify(o))), moved:false};
    if(selNote !== null) auditionPitch(hit, chordNotes(hit)[selNote]); else auditionQuick(hit);
    return;
  }
  if(b.tool === 'erase'){ pushHistory(); erasing = true; eraseAt(p); return; }
  if(inDrumZone(p) || b.tool === 'drop'){
    if(!inDrumZone(p)){ toast('鼓要點在下方的節奏區'); return; }
    const {lane, x} = drumCell(p);
    pushHistory(); paint = {mode:findDrop(lane, x) ? 'del' : 'add', done:new Set()}; paintDrum(p);
    return;
  }
  if(b.tool === 'line'){
    const y = clamp(p.y, MEL_TOP, MEL_BOT), w = b.dyn === 'fixed' ? 1 : strokeW(e, p);
    stroke = {sx:p.sx, sy:p.sy, t:e.timeStamp, w};
    cur = brushObj({type:'line', pts:[{x:e.ctrlKey || e.metaKey ? snapBeat(p.x) : clamp(p.x, 0, 1), y, w}]});
    previewStart(b, quant(y), w);
  } else if(b.tool === 'note'){
    const hit = topHit(p, isNoteObj);
    if(hit){ pushHistory(); pad.objects = pad.objects.filter(o => o !== hit); changed(); return; }
    const steps = stepsOf(), x0 = Math.floor(clamp(p.x, 0, 0.9999) * steps) / steps;
    pushHistory();
    noteDrag = {o:brushObj({type:'line', pts:[]}), x0, len:1, m:quant(clamp(p.y, MEL_TOP, MEL_BOT))};
    setNotePts(noteDrag); pad.objects.push(noteDrag.o); changed(); auditionNote(noteDrag.o);
  } else if(b.tool === 'chord'){
    const steps = stepsOf(), x = Math.floor(clamp(p.x, 0, 0.999) * steps) / steps;
    pushHistory();
    const y = clamp(p.y, MEL_TOP, MEL_BOT);   // 形狀決定音數，之後每個音都可以再調
    curChord = syncChord(brushObj({type:'chord', x, y, len:Math.min(2 / pad.beats, 1 - x), shape:b.shape, notes:stackChord(y, SHAPE_N[b.shape])}));
    pad.objects.push(curChord); changed();
    scheduleChord(curChord, ctx.currentTime + 0.01, 0.5, LOOSE);
  }
}
function onMove(e){
  const p = pos(e); hover = p;
  if(paint){ if(inDrumZone(p)) paintDrum(p); return; }
  if(cur){
    /* Shift：音高鎖在按下那一刻的音（畫成水平線），放開才跳回滑鼠所指的音
       Ctrl：點吸到最接近的格線，換音一定落在拍點上；停在同一個拍點附近上下移動，改的是「從這一拍開始的音」 */
    const last = cur.pts[cur.pts.length - 1], snap = e.ctrlKey || e.metaKey, x = snap ? snapBeat(p.x) : clamp(p.x, 0, 1);
    if(e.shiftKey) cur.lockY ??= +midiToY(quant(last.y)).toFixed(5); else cur.lockY = null;
    const y = cur.lockY ?? clamp(p.y, MEL_TOP, MEL_BOT);
    const w = S.brush.dyn === 'fixed' ? 1 : strokeW(e, p);
    stroke = {sx:p.sx, sy:p.sy, t:e.timeStamp, w};
    previewMove(quant(y), w);
    if(snap){ if(x > last.x + 1e-6) cur.pts.push({x, y, w:+w.toFixed(3)}); else if(Math.abs(x - last.x) < 1e-6){ last.y = y; inkDirty = true; } }
    else if((x - last.x) * W >= 2) cur.pts.push({x, y, w:+w.toFixed(3)});   // 時間只能往前
  } else if(noteDrag){
    const steps = stepsOf(), len = clamp(Math.ceil((p.x - noteDrag.x0) * steps - 0.15), 1, Math.round((1 - noteDrag.x0) * steps));
    const m = quant(clamp(p.y, MEL_TOP, MEL_BOT));
    if(len !== noteDrag.len || m !== noteDrag.m){
      const pitch = m !== noteDrag.m; noteDrag.len = len; noteDrag.m = m; setNotePts(noteDrag);
      if(pitch) auditionNote({...noteDrag.o, pts:[noteDrag.o.pts[0], {...noteDrag.o.pts[0], x:noteDrag.x0 + 1 / steps}]});
    }
  } else if(curChord){
    const half = 1 / stepsOf();
    curChord.len = clamp(Math.round((p.x - curChord.x) / half) * half, half, 1 - curChord.x); inkDirty = true;
  } else if(box){
    Object.assign(box, {x0:Math.min(box.sx, p.sx), y0:Math.min(box.sy, p.sy), x1:Math.max(box.sx, p.sx), y1:Math.max(box.sy, p.sy)});
  } else if(drag){
    const dsx = p.sx - drag.start.sx, dsy = p.sy - drag.start.sy, st = stepsOf(), dx = dsx / W;
    if(!drag.moved){ if(Math.hypot(dsx, dsy) < 4) return; pushHistory(); drag.moved = true; }
    const my = y => clamp(yinv(ymap(y) + dsy), MEL_TOP, MEL_BOT), snap = y => +midiToY(quant(y)).toFixed(5);
    SELS.forEach((o, j) => { const O = drag.origs[j]; if(!O) return;
      if(o.type === 'line'){
        const xs = O.pts.map(q => q.x), ddx = clamp(dx, -Math.min(...xs), 1 - Math.max(...xs));
        o.pts = O.pts.map(q => ({...q, x:q.x + ddx, y:my(q.y)}));
        if(isNoteObj(O)){ const y = snap(o.pts[0].y); o.pts.forEach(q => q.y = y); }   // 音符拖曳時吸附到音階列
      } else if(o.type === 'chord' && selNote !== null && O.notes){   // 只上下拖選中的那一個音
        const y = snap(my(O.notes[drag.note ??= selNote])); o.notes = O.notes.slice(); o.notes[drag.note] = y; syncChord(o);
        selNote = o.notes.indexOf(y);
      } else if(o.type === 'chord'){
        o.x = clamp(Math.round((O.x + dx) * st) / st, 0, 1 - O.len); o.y = my(O.y); if(O.notes) o.notes = O.notes.map(my);
      } else {
        o.x = clamp(Math.round((O.x + dx) * st) / st, 0, (st - 1) / st); o.lane = laneAt(yinv(ymap(LANES[O.lane]) + dsy));
      } });
    inkDirty = true;
  } else if(erasing) eraseAt(p);
}
function endStroke(){
  if(cur){
    if(cur.pts.length < 2 || (cur.pts[cur.pts.length - 1].x - cur.pts[0].x) * W < 6){   // 點一下＝短音（對齊格線）
      const p0 = cur.pts[0], steps = stepsOf(), x0 = Math.floor(p0.x * steps) / steps, y = midiToY(quant(p0.y));
      cur.pts = [{x:x0, y, w:p0.w}, {x:Math.min(1, x0 + 0.94 / steps), y, w:p0.w}];
    }
    delete cur.lockY; pushHistory(); EP().objects.push(cur); previewEnd(); cur = null; stroke = null; changed();
  }
  if(noteDrag){ const o = noteDrag.o; noteDrag = null; changed(); setSel([o]); NAV = null; }   // 自動選取剛放的音，可以接著用鍵盤輸入
  if(paint){ paint = null; const h = EP()._hist; if(h && h.length && h[h.length - 1] === JSON.stringify(EP().objects)) h.pop(); }
  if(curChord){ curChord = null; changed(); }
  if(drag){ if(drag.moved){ changed(); syncTools(); } drag = null; }
  if(box){ const b = box, V = EV(); box = null;
    const hits = b.x1 - b.x0 < 3 && b.y1 - b.y0 < 3 ? [] : EP().objects.filter(o => { const [x0, y0, x1, y1] = objBBox(o, V); return x0 < b.x1 && x1 > b.x0 && y0 < b.y1 && y1 > b.y0; });
    setSel([...b.add, ...hits]); }
  if(erasing){ erasing = false; const h = EP()._hist; if(h && h.length && h[h.length - 1] === JSON.stringify(EP().objects)) h.pop(); }
}
const inKey = fn => e => { if(S.editing !== null) withKey(EP(), () => fn(e)); };
cvs.addEventListener('pointerdown', inKey(e => { e.preventDefault(); initAudio(); try{ cvs.setPointerCapture(e.pointerId); }catch(_){} onDown(e); }));
cvs.addEventListener('pointermove', inKey(onMove));
cvs.addEventListener('pointerup', inKey(endStroke));
cvs.addEventListener('pointercancel', inKey(endStroke));
cvs.addEventListener('pointerleave', () => { if(!cur && !noteDrag && !drag && !paint && !box) hover = null; });
cvs.addEventListener('contextmenu', e => e.preventDefault());
/** 選取時短暫試聽：鼓直接打 */
function auditionQuick(o){
  if(o.type === 'drop') playDrum(o, ctx.currentTime + 0.005, LOOSE);
  else if(isNoteObj(o)) auditionObj(o, EP());
  else if(o.type === 'chord') withKey(EP(), () => scheduleChord(o, ctx.currentTime + 0.01, 0.45, LOOSE));
}
/** 用這個物件的音色短短地彈一個音 */
function auditionPitch(o, m){ const y = midiToY(m); auditionObj({...o, type:'line', x:0, pts:[{x:0, y, w:0.9}, {x:0.4 / EP().beats, y, w:0.9}]}, EP()); }
/** 舊資料的和弦只有形狀，要調個別的音之前先把音寫出來 */
function materialize(o){ if(o.type === 'chord' && !o.notes){ o.notes = chordNotes(o).map(m => +midiToY(m).toFixed(5)); syncChord(o); } return o; }
function deleteSel(){
  if(!SELS.length) return; pushHistory(); const p = EP();
  if(selNote !== null && S.sel.type === 'chord'){   // 只刪和弦裡選中的那一個音
    const o = materialize(S.sel);
    if(o.notes.length <= 2){ p._hist.pop(); return toast('和弦至少要兩個音；要刪整個和弦，先按 Esc 再刪'); }
    o.notes.splice(selNote, 1); syncChord(o); selNote = Math.min(selNote, o.notes.length - 1); changed(); syncTools(); return;
  }
  p.objects = p.objects.filter(o => !SELS.includes(o)); setSel([]); changed(); syncTools();
}

/* ---------- 鍵盤編輯音高 ----------
   A–G：移到最接近目前音高的那個音（Shift＝升記號）・↑↓：音階上下一格（Shift＝八度）
   ←→：依時間順序選旁邊的音（和弦裡會一個一個音走）・＋／−：和弦加一個音／減一個音 */
const LETTER = {KeyC:0, KeyD:2, KeyE:4, KeyF:5, KeyG:7, KeyA:9, KeyB:11};
/** 依音階移動 k 格（不在音階上的音先吸附） */
function stepPitch(m, k){ const E = extNotes(), i = E.indexOf(quant(midiToY(m))); return E[clamp(i + k, 0, E.length - 1)]; }
function clampPitch(m){ while(m > MIDI_HI) m -= 12; while(m < MIDI_LO) m += 12; return m; }
/** 把一個物件的音高整體移動（fn：舊音高 → 新音高） */
function shiftObj(o, fn){
  const Y = m => +midiToY(clampPitch(m)).toFixed(5);
  if(o.type === 'line') o.pts.forEach(q => q.y = Y(fn(quant(q.y))));
  else if(o.type === 'chord'){ materialize(o); o.notes = o.notes.map(y => Y(fn(quant(y)))); syncChord(o); }
}
/** 編輯器裡可以用鍵盤逐一選取的「音」：音符、旋律線、和弦裡的每一個音，依時間再依音高排序 */
function noteItems(){
  const out = [];
  for(const o of EP().objects){
    if(o.type === 'chord') chordNotes(o).forEach((m, i) => out.push({o, i, x:o.x, m}));
    else if(o.type === 'line') out.push({o, i:null, x:o.pts[0].x, m:quant(o.pts[0].y)});
  }
  return out.sort((a, b) => a.x - b.x || a.m - b.m);
}
/** 最接近 base 的那個音名（pc） */
const nearestPc = (base, pc) => { let t = base - ((base - pc) % 12 + 12) % 12; if(base - t > 6) t += 12; return t; };
/** 物件的時間範圍（0–1） */
const objSpan = o => o.type === 'line' ? [o.pts[0].x, o.pts[o.pts.length - 1].x] : o.type === 'chord' ? [o.x, o.x + o.len] : [o.x, o.x + 1 / stepsOf()];
/** 音符模式的鍵盤輸入：接在選取的音後面放一個新音（音高取最接近上一個音的那個音名），放完自動選取它 */
/* 鍵盤輸入的「游標」：下一個音緊接在上一個音結束的地方（對齊 1/12 拍——1/4、1/8、1/16、三連音都在這個網格上），
   長度是目前格線的一格，所以先用 1/8 打一個音、再換 1/4 打下一個，就是切分音。REST：按 R 空出的休止 */
let REST = null;
function insertPos(){
  const steps = stepsOf(), B = EP().beats, prev = S.sel && S.sel.type !== 'drop' ? S.sel : null;
  if(REST && REST.after === S.sel) return REST.x;
  if(prev) return Math.ceil(objSpan(prev)[1] * B * 12 - 0.1) / (B * 12);
  if(hover && hover.sy <= splitPx()) return Math.floor(clamp(hover.x, 0, 0.9999) * steps) / steps;
  return 0;
}
function typeNote(pc){
  const pad = EP(), steps = stepsOf(), prev = S.sel && S.sel.type !== 'drop' ? S.sel : null, x0 = insertPos();
  let base = 64;
  if(prev) base = prev.type === 'chord' ? chordNotes(prev)[selNote ?? chordNotes(prev).length - 1] : quant(prev.pts[prev.pts.length - 1].y);
  else if(hover && hover.sy <= splitPx()) base = quant(hover.y);
  if(x0 >= 1 - 1e-6) return toast('已經到這一格的結尾了（可以在上方把長度調長）');
  const m = quant(midiToY(clampPitch(nearestPc(base, pc))));
  if(m % 12 !== pc) toast(`${NOTE_NAMES[pc]} 不在目前的音階（${keyName(pad)}）裡，吸附到 ${noteName(m)}`);
  pushHistory(); REST = null;
  const nd = {o:brushObj({type:'line', pts:[]}), x0, len:Math.min(1, (1 - x0) * steps), m};   // 長度＝目前格線一格
  setNotePts(nd); pad.objects.push(nd.o); changed(); setSel([nd.o]); auditionNote(nd.o);
}
/** 音符模式的 Backspace：像復原剛才那一步，但繼續留在輸入狀態
   ・剛按了休止 → 收回一格休止
   ・選著一個音 → 刪掉它，改選前一個音，游標停在被刪的音原本的位置，接著打就會放回同一個地方 */
function noteBackspace(){
  return withKey(EP(), () => {
    if(REST && REST.after === S.sel){ const x = REST.x - 1 / stepsOf(); REST = null;
      if(x > insertPos() + 1e-6) REST = {after:S.sel, x}; inkDirty = true; return; }
    if(SELS.length !== 1 || !isNoteObj(S.sel)){ if(SELS.length) deleteSel(); return; }
    const pad = EP(), gone = S.sel, x0 = gone.pts[0].x;
    pushHistory(); pad.objects = pad.objects.filter(o => o !== gone); changed();
    const prev = noteItems().filter(t => t.x < x0 - 1e-6).pop();
    if(prev){ if(prev.i !== null) materialize(prev.o); setSel([prev.o], prev.i); } else setSel([]);
    REST = null; if(x0 > insertPos() + 1e-6) REST = {after:S.sel, x:x0};   // 前面有休止才保留游標位置，否則下一次 Backspace 會白按
    NAV = null; inkDirty = true;
  });
}
/** 休止：游標往後空一格（目前的格線長度） */
function typeRest(){
  const x = insertPos() + 1 / stepsOf();
  if(x > 1 + 1e-6) return toast('已經到這一格的結尾了');
  REST = {after:S.sel, x}; inkDirty = true; toast(`休止 ${GRIDS[S.brush.grid].zh}`);
}

/* ---------- 複製／剪下／貼上：位置用「拍」記，貼到不同長度的格子也對得上 ---------- */
let CLIP = null;
function copySel(){
  if(!SELS.length) return false;
  const B = EP().beats, spans = SELS.map(objSpan);
  CLIP = {objs:JSON.parse(JSON.stringify(SELS)), beats:B, b0:Math.min(...spans.map(s => s[0])) * B, b1:Math.max(...spans.map(s => s[1])) * B};
  CLIP.next = CLIP.b1; return true;
}
/** where：'hover'＝滑鼠所在的格線（沒有就接在後面）、'after'＝接在複製範圍後面 */
function pasteClip(where = 'hover'){
  if(!CLIP) return toast('還沒有複製任何東西（先選取，再按 Ctrl+C）');
  const pad = EP(), B = pad.beats, steps = stepsOf(), step = B / steps;
  let start = where === 'hover' && hover && !box ? Math.floor(clamp(hover.x, 0, 0.9999) * steps) * step : CLIP.next;
  start = Math.round(start / step) * step;
  if(start >= B - 1e-6) return toast('已經到這一格的結尾了，把滑鼠移到要貼上的位置再按 Ctrl+V');
  const sh = start - CLIP.b0, X = x => (x * CLIP.beats + sh) / B, out = [];
  for(const src of CLIP.objs){
    const o = JSON.parse(JSON.stringify(src)); o.seed = Math.random() * 1e9 | 0;
    if(o.type === 'line'){ o.pts = o.pts.map(q => ({...q, x:X(q.x)})).filter(q => q.x <= 1 + 1e-6); if(o.pts.length < 2) continue; }
    else if(o.type === 'chord'){ o.x = X(o.x); o.len = Math.min(o.len * CLIP.beats / B, 1 - o.x); if(o.len <= 0) continue; }
    else { o.x = X(o.x); if(o.x >= 1 - 1e-6 || findDrop(o.lane, o.x)) continue; }
    out.push(o);
  }
  if(!out.length) return toast('貼上的位置超出這一格了');
  pushHistory(); pad.objects.push(...out); CLIP.next = start + (CLIP.b1 - CLIP.b0);
  changed(); setSel(out); toast(`已貼上 ${out.length} 個物件`);
}

/* ---------- 方向鍵選取：Shift 擴大範圍（從 anchor 延伸到 head） ---------- */
let NAV = null;
function editorKey(e){
  if(S.editing === null) return false;
  const pad = EP(), code = e.code, tl = S.brush.tool;
  return withKey(pad, () => {
    if(e.ctrlKey || e.metaKey){
      if(e.altKey) return false;
      if(code === 'KeyA'){ setSel(pad.objects.slice()); return true; }
      if(code === 'KeyC'){ if(copySel()) toast(`已複製 ${CLIP.objs.length} 個物件`); return true; }
      if(code === 'KeyX'){ if(copySel()){ const n = SELS.length; selNote = null; deleteSel(); toast(`已剪下 ${n} 個物件`); } return true; }
      if(code === 'KeyV'){ pasteClip('hover'); return true; }
      if(code === 'KeyD'){ if(copySel()) pasteClip('after'); return true; }   // 複製一份接在後面
      return false;
    }
    if(e.altKey) return false;
    if(!e.shiftKey){   // 1–6 工具、7–0 對齊格線（編輯模式下數字鍵不再觸發音效格）
      const ti = TOOL_KEYS.indexOf(code), gi = GRID_KEYS.indexOf(code);
      if(ti >= 0){ $$('#tools button')[ti].click(); return true; }
      if(gi >= 0){ $$('#grids button')[gi].click(); toast(`對齊格線：${GRIDS[S.brush.grid].zh}（${GRIDS[S.brush.grid].sub}）`); return true; }
    }
    if(tl !== 'select' && tl !== 'note' && !SELS.length) return false;
    if(code === 'ArrowLeft' || code === 'ArrowRight'){
      const items = noteItems(); if(!items.length) return true;
      const dir = code === 'ArrowRight' ? 1 : -1, find = k => k ? items.findIndex(t => t.o === k.o && t.i === k.i) : -1;
      let at = NAV && SELS.includes(NAV.head.o) ? find(NAV.head) : -1;
      if(at < 0) at = items.findIndex(t => t.o === S.sel && (t.i === selNote || selNote === null && (t.i === null || t.i === 0)));
      if(at < 0){ const x0 = S.sel ? objSpan(S.sel)[0] : 0; at = items.findIndex(t => t.x >= x0); if(at < 0) at = items.length; if(dir > 0) at--; }
      const t = items[clamp(at + dir, 0, items.length - 1)], key = {o:t.o, i:t.i};
      if(e.shiftKey && S.sel){   // 擴大選取：從起點一路選到新的位置
        const anchor = NAV && SELS.includes(NAV.anchor.o) && find(NAV.anchor) >= 0 ? NAV.anchor : items[Math.max(0, at)];
        const a = find(anchor), lo = Math.min(a, find(key)), hi = Math.max(a, find(key));
        NAV = {anchor:{o:anchor.o, i:anchor.i}, head:key}; setSel(items.slice(lo, hi + 1).map(x => x.o));
      } else {
        if(t.i !== null) materialize(t.o);
        setSel([t.o], t.i); NAV = {anchor:key, head:key};
      }
      t.i !== null ? auditionPitch(t.o, t.m) : auditionQuick(t.o); return true;
    }
    if(tl === 'note' && code in LETTER){ typeNote((LETTER[code] + (e.shiftKey ? 1 : 0)) % 12); return true; }   // 音符模式：字母＝輸入新的音
    if(tl === 'note' && code === 'KeyR' && !e.shiftKey){ typeRest(); return true; }   // R＝休止
    const mel = SELS.filter(o => o.type !== 'drop'); if(!mel.length) return false;
    const one = selNote !== null ? S.sel : null;   // 和弦裡選中一個音：只動那個音
    const apply = fn => { pushHistory();
      if(one){ materialize(one); const y = +midiToY(clampPitch(fn(chordNotes(one)[selNote]))).toFixed(5); one.notes[selNote] = y; syncChord(one); selNote = one.notes.indexOf(y); auditionPitch(one, quant(y)); }
      else { mel.forEach(o => shiftObj(o, fn)); auditionQuick(mel[0]); }
      changed(); syncTools(); };
    if(code === 'ArrowUp' || code === 'ArrowDown'){ const d = code === 'ArrowUp' ? 1 : -1; apply(m => e.shiftKey ? m + 12 * d : stepPitch(m, d)); return true; }
    if(code in LETTER){
      const pc = (LETTER[code] + (e.shiftKey ? 1 : 0)) % 12, base = one ? chordNotes(one)[selNote] : mel[0].type === 'chord' ? chordNotes(mel[0])[0] : quant(mel[0].pts[0].y);
      let tgt = base - ((base - pc) % 12 + 12) % 12; if(base - tgt > 6) tgt += 12;   // 最接近目前音高的那個音
      const got = quant(midiToY(clampPitch(tgt)));
      if(got % 12 !== pc) toast(`${NOTE_NAMES[pc]} 不在目前的音階（${keyName(pad)}）裡，吸附到 ${noteName(got)}`);
      const E = extNotes(), k = E.indexOf(got) - E.indexOf(quant(midiToY(base)));   // 整段旋律／和弦照音階級數平移，形狀不變
      apply(m => one ? got : stepPitch(m, k)); return true;
    }
    if(code === 'Equal' || code === 'NumpadAdd' || code === 'Minus' || code === 'NumpadSubtract'){
      const chords = SELS.filter(o => o.type === 'chord'); if(!chords.length) return false;
      const add = code === 'Equal' || code === 'NumpadAdd'; pushHistory();
      for(const o of chords){ materialize(o); const ms = chordNotes(o);
        if(add){ if(ms.length >= 6) continue; o.notes.push(+midiToY(clampPitch(stepPitch(ms[ms.length - 1], SCALES[curScale()].iv.length === 7 ? 2 : 1))).toFixed(5)); }
        else { if(ms.length <= 2) continue; o.notes.splice(one === o ? selNote : o.notes.length - 1, 1); }
        syncChord(o); }
      if(one) selNote = Math.min(selNote, one.notes.length - 1);
      changed(); syncTools(); auditionQuick(chords[0]); return true;
    }
    return false;
  });
}

/* ---------- 面板事件 ---------- */
$('#eside').addEventListener('click', e => {
  const btn = e.target.closest('button'); if(!btn) return;
  const d = btn.dataset;
  if(d.tab){ S.tab = d.tab; $$('#eside [data-tab]').forEach(x => x.classList.toggle('on', x.dataset.tab === S.tab));
    $$('#eside [data-pane]').forEach(x => x.hidden = x.dataset.pane !== S.tab); return; }
  if(d.tool){
    S.brush.tool = d.tool; if(d.tool !== 'select') setSel([]); inkDirty = true;
    // 短音配慢起音會聽不清楚，切到音符工具時自動換成利鋒
    if(d.tool === 'note' && S.brush.a > 0.08){ Object.assign(S.brush, envOf('hard')); toast('音符工具：筆鋒自動換成「利鋒」，短音才會清楚'); }
    syncTools(); return;
  }
  if(d.grid){ S.brush.grid = +d.grid; bgDirty = true; syncTools(); return; }
  if(d.tone){ setProp('tone', d.tone); if(!S.sel) S.brush.tool = ['line', 'chord', 'note'].includes(S.brush.tool) ? S.brush.tool : 'line'; syncTools(); return; }
  if(d.dyn){ S.brush.dyn = d.dyn; syncTools(); return; }
  if(d.env){ const e2 = envOf(d.env);
    if(SELS.length){ pushHistory(); SELS.filter(o => o.type !== 'drop').forEach(o => Object.assign(o, e2)); changed(); } else Object.assign(S.brush, e2);
    syncTools(); return; }
  if(d.tex){ setProp('texture', d.tex); return; }
  if(d.shape){ setProp('shape', d.shape); if(!S.sel) S.brush.tool = 'chord'; syncTools(); return; }
});
$('#size').oninput = e => setProp('size', +e.target.value);
$('#alpha').oninput = e => setProp('alpha', +e.target.value);
$('#resetDetail').onclick = () => {
  const drum = targetKind() === 'drop', keys = drum ? DRUM_KEYS : SYN_KEYS;
  if(SELS.length) pushHistory();
  for(const t of SELS.length ? SELS.filter(o => (o.type === 'drop') === drum) : [S.brush]) for(const k of keys) t[k] = PDEF[k];
  if(SELS.length) changed(); syncTools();
};
$('#selPlay').onclick = () => { if(S.sel) auditionObj(S.sel, EP()); };
$('#selDel').onclick = deleteSel;
$('#selNone').onclick = () => select(null);
$('#undo').onclick = undo;
$('#redo').onclick = redo;
$('#clearPad').onclick = () => { const p = EP(); if(!p.objects.length) return; pushHistory(); p.objects = []; setSel([]); changed(); stopPad(S.editing); syncTools(); toast('已清空這格（可以按復原）'); };

$('#eDone').onclick = closeEditor;
$('#eImport').onclick = () => openImport();   // openImport 在 library.js，載入順序較晚
$('#ePlay').onclick = togglePreview;
$('#eName').oninput = e => { EP().name = e.target.value; refreshPad(S.editing); save(); };
$('#eVol').oninput = e => { EP().vol = +e.target.value; setPadVolume(S.editing); syncPadMix(S.editing); mixerSync(); save(); };
$('#eBeats').onchange = e => { const p = EP(), was = voices.has(S.editing); p.beats = +e.target.value; bgDirty = true; changed();
  if(was){ stopPad(S.editing, 0.02); togglePreview(); } };
$('#eMode').onclick = e => { const b = e.target.closest('button'); if(!b) return; EP().mode = b.dataset.v; syncEditorBar(); refreshPad(S.editing); save(); };
$('#eKey').onclick = () => { bindingKey = !bindingKey; syncEditorBar(); };
function bindKey(code){
  const p = EP(), other = S.pads.findIndex((q, j) => j !== S.editing && q.key === code);
  if(other >= 0){ S.pads[other].key = p.key; refreshPad(other); toast(`和第 ${other + 1} 格交換了按鍵`); }
  p.key = code; bindingKey = false; syncEditorBar(); refreshPad(S.editing); save();
}
