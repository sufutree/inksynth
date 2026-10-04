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
  if(S.sel && pad.objects.includes(S.sel)) drawSelection(g, S.sel, V);
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
  stopAll(); S.editing = i; S.sel = null; bindingKey = false;
  $('#editor').hidden = false; resizeEditor(); bgDirty = inkDirty = true;
  syncEditorBar(); buildDetail(); syncTools();
}
function closeEditor(){
  if(S.editing === null) return;
  const i = S.editing; if((voices.get(i) || {}).preview) stopPad(i);
  S.editing = null; S.sel = null; bindingKey = false; hover = null; $('#editor').hidden = true; refreshPad(i); sizeThumbs();
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

function makeSeg(el, entries, attr){
  el.innerHTML = Object.entries(entries).map(([k, v]) => `<button data-${attr}="${k}">${v.zh}${v.sub ? `<small>${v.sub}</small>` : ''}</button>`).join('');
}
const TOOLS = {select:{zh:'⬚', sub:'選取'}, line:{zh:'〰', sub:'水墨旋律線'}, note:{zh:'♪', sub:'音符（短音）'},
               chord:{zh:'△', sub:'和弦'}, drop:{zh:'●', sub:'鼓'}, erase:{zh:'⌫', sub:'橡皮擦'}};
makeSeg($('#tools'), TOOLS, 'tool');
makeSeg($('#grids'), GRIDS, 'grid');
makeSeg($('#dyns'), DYN_MODES, 'dyn');
makeSeg($('#envs'), ENV_PRESETS, 'env');
makeSeg($('#texs'), TEXTURES, 'tex');
makeSeg($('#shapes'), SHAPES, 'shape');
$('#tones').innerHTML = TONE_KEYS.map(k => { const t = TONES[k]; const [c, n] = t.zh.split('・');
  return `<button data-tone="${k}" style="--tc:${t.color}" title="${t.desc}"><i></i><b>${c}</b><span>${n}</span></button>`; }).join('');

function setProp(k, val){
  const t = target();
  if(S.sel){
    if(S.sel.type === 'drop' && !DRUM_KEYS.includes(k) && k !== 'alpha') return;
    if(k === 'shape' && S.sel.type !== 'chord') return;
    t[k] = val; changed();
  } else t[k] = val;
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
    case 'select': return '⬚ 選取：點一下選取物件，可以拖曳移動、在右側調整它的音色細節・Delete 刪除・Esc 取消選取';
    case 'drop': return `● 鼓：在下方節奏區點一下放置、再點一下拿掉，按住橫拖可以連續填格・對齊 ${GRIDS[b.grid].zh}・濃度＝力度`;
    case 'erase': return '⌫ 橡皮擦：按住拖曳擦掉線條、音符、鼓或和弦';
    case 'chord': return `△ 和弦：點一下放置，按住往右拖曳可以拉長｜${TONES[b.tone].zh}${drums}`;
    case 'note': return `♪ 音符：對齊 ${GRIDS[b.grid].zh} 格線，點一下放一個短音、往右拖拉長、上下拖換音・點已有的音符＝刪除｜${key}｜${TONES[b.tone].zh}${drums}`;
  }
  const dyn = b.dyn === 'speed' ? '畫得越慢越重越響' : b.dyn === 'pressure' ? '筆壓越大越響（滑鼠會改用速度）' : '力度固定';
  return `〰 水墨旋律線：由左往右畫，白色階梯＝實際聽到的音（${key}）・${dyn}・點一下＝短音｜${TONES[b.tone].zh}｜Cutoff ${fmtHz(cutoffOf(b.size))}${drums}`;
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
  if(sel) $('#selInfo').textContent = '正在調整：' + (sel.type === 'drop' ? `鼓（${DRUMS[sel.lane].zh}）` : sel.type === 'chord' ? `和弦（${TONES[sel.tone].zh}）` : `${isNoteObj(sel) ? '音符' : '旋律線'}（${TONES[sel.tone].zh}）`);
  $('#eside').classList.toggle('isDrop', targetKind() === 'drop');
  $('#hint').textContent = hintText();
  cvs.style.cursor = b.tool === 'erase' ? 'cell' : b.tool === 'select' ? 'default' : 'crosshair';
  updateDetailValues();
}
function select(o){ S.sel = o; inkDirty = true; syncTools(); }

/* ---------- 歷史與變更 ---------- */
function pushHistory(){ const p = EP(); (p._hist ||= []).push(JSON.stringify(p.objects)); if(p._hist.length > 80) p._hist.shift(); }
function undo(){ const p = EP(); if(!p._hist || !p._hist.length) return toast('沒有可以復原的步驟');
  p.objects = JSON.parse(p._hist.pop()); S.sel = null; changed(); syncTools(); }
function changed(){ inkDirty = true; inkVer++; if(S.editing !== null) refreshPad(S.editing); save(); }

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
  if(pad.objects.length !== n){ if(S.sel && !pad.objects.includes(S.sel)) S.sel = null; changed(); } }
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
  if(paint.mode === 'del'){ if(dup){ pad.objects = pad.objects.filter(o => o !== dup); if(S.sel === dup) S.sel = null; changed(); } return; }
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
    const hit = topHit(p); select(hit);
    if(hit){ drag = {start:p, orig:JSON.parse(JSON.stringify(hit)), moved:false}; auditionQuick(hit); }
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
    cur = brushObj({type:'line', pts:[{x:clamp(p.x, 0, 1), y, w}]});
    previewStart(b, quant(y), w);
  } else if(b.tool === 'note'){
    const hit = topHit(p, isNoteObj);
    if(hit){ pushHistory(); pad.objects = pad.objects.filter(o => o !== hit); if(S.sel === hit) S.sel = null; changed(); return; }
    const steps = stepsOf(), x0 = Math.floor(clamp(p.x, 0, 0.9999) * steps) / steps;
    pushHistory();
    noteDrag = {o:brushObj({type:'line', pts:[]}), x0, len:1, m:quant(clamp(p.y, MEL_TOP, MEL_BOT))};
    setNotePts(noteDrag); pad.objects.push(noteDrag.o); changed(); auditionNote(noteDrag.o);
  } else if(b.tool === 'chord'){
    const steps = stepsOf(), x = Math.floor(clamp(p.x, 0, 0.999) * steps) / steps;
    pushHistory();
    curChord = brushObj({type:'chord', x, y:clamp(p.y, MEL_TOP, MEL_BOT), len:Math.min(2 / pad.beats, 1 - x), shape:b.shape});
    pad.objects.push(curChord); changed();
    scheduleChord(curChord, ctx.currentTime + 0.01, 0.5, LOOSE);
  }
}
function onMove(e){
  const p = pos(e); hover = p;
  if(paint){ if(inDrumZone(p)) paintDrum(p); return; }
  if(cur){
    const last = cur.pts[cur.pts.length - 1], x = clamp(p.x, 0, 1), y = clamp(p.y, MEL_TOP, MEL_BOT);
    const w = S.brush.dyn === 'fixed' ? 1 : strokeW(e, p);
    stroke = {sx:p.sx, sy:p.sy, t:e.timeStamp, w};
    previewMove(quant(y), w);
    if((x - last.x) * W >= 2) cur.pts.push({x, y, w:+w.toFixed(3)});   // 時間只能往前
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
  } else if(drag){
    const dsx = p.sx - drag.start.sx, dsy = p.sy - drag.start.sy, o = S.sel, O = drag.orig, st = stepsOf(), dx = dsx / W;
    if(!drag.moved){ if(Math.hypot(dsx, dsy) < 4) return; pushHistory(); drag.moved = true; }
    const my = y => clamp(yinv(ymap(y) + dsy), MEL_TOP, MEL_BOT);
    if(o.type === 'line'){
      const xs = O.pts.map(q => q.x), ddx = clamp(dx, -Math.min(...xs), 1 - Math.max(...xs));
      o.pts = O.pts.map(q => ({...q, x:q.x + ddx, y:my(q.y)}));
      if(isNoteObj(O)){ const m = quant(o.pts[0].y), y = midiToY(m); o.pts.forEach(q => q.y = y); }   // 音符拖曳時吸附到音階列
    } else if(o.type === 'chord'){
      o.x = clamp(Math.round((O.x + dx) * st) / st, 0, 1 - O.len); o.y = my(O.y);
    } else {
      o.x = clamp(Math.round((O.x + dx) * st) / st, 0, (st - 1) / st); o.lane = laneAt(yinv(ymap(LANES[O.lane]) + dsy));
    }
    inkDirty = true;
  } else if(erasing) eraseAt(p);
}
function endStroke(){
  if(cur){
    if(cur.pts.length < 2 || (cur.pts[cur.pts.length - 1].x - cur.pts[0].x) * W < 6){   // 點一下＝短音（對齊格線）
      const p0 = cur.pts[0], steps = stepsOf(), x0 = Math.floor(p0.x * steps) / steps, y = midiToY(quant(p0.y));
      cur.pts = [{x:x0, y, w:p0.w}, {x:Math.min(1, x0 + 0.94 / steps), y, w:p0.w}];
    }
    pushHistory(); EP().objects.push(cur); previewEnd(); cur = null; stroke = null; changed();
  }
  if(noteDrag){ noteDrag = null; changed(); }
  if(paint){ paint = null; const h = EP()._hist; if(h && h.length && h[h.length - 1] === JSON.stringify(EP().objects)) h.pop(); }
  if(curChord){ curChord = null; changed(); }
  if(drag){ if(drag.moved){ changed(); syncTools(); } drag = null; }
  if(erasing){ erasing = false; const h = EP()._hist; if(h && h.length && h[h.length - 1] === JSON.stringify(EP().objects)) h.pop(); }
}
const inKey = fn => e => { if(S.editing !== null) withKey(EP(), () => fn(e)); };
cvs.addEventListener('pointerdown', inKey(e => { e.preventDefault(); initAudio(); try{ cvs.setPointerCapture(e.pointerId); }catch(_){} onDown(e); }));
cvs.addEventListener('pointermove', inKey(onMove));
cvs.addEventListener('pointerup', inKey(endStroke));
cvs.addEventListener('pointercancel', inKey(endStroke));
cvs.addEventListener('pointerleave', () => { if(!cur && !noteDrag && !drag && !paint) hover = null; });
cvs.addEventListener('contextmenu', e => e.preventDefault());
/** 選取時短暫試聽：鼓直接打 */
function auditionQuick(o){
  if(o.type === 'drop') playDrum(o, ctx.currentTime + 0.005, LOOSE);
  else if(isNoteObj(o)) auditionObj(o, EP());
}
function deleteSel(){
  if(!S.sel) return; pushHistory(); const p = EP(); p.objects = p.objects.filter(o => o !== S.sel); S.sel = null; changed(); syncTools();
}

/* ---------- 面板事件 ---------- */
$('#eside').addEventListener('click', e => {
  const btn = e.target.closest('button'); if(!btn) return;
  const d = btn.dataset;
  if(d.tab){ S.tab = d.tab; $$('#eside [data-tab]').forEach(x => x.classList.toggle('on', x.dataset.tab === S.tab));
    $$('#eside [data-pane]').forEach(x => x.hidden = x.dataset.pane !== S.tab); return; }
  if(d.tool){
    S.brush.tool = d.tool; if(d.tool !== 'select') S.sel = null; inkDirty = true;
    // 短音配慢起音會聽不清楚，切到音符工具時自動換成利鋒
    if(d.tool === 'note' && S.brush.a > 0.08){ Object.assign(S.brush, envOf('hard')); toast('音符工具：筆鋒自動換成「利鋒」，短音才會清楚'); }
    syncTools(); return;
  }
  if(d.grid){ S.brush.grid = +d.grid; bgDirty = true; syncTools(); return; }
  if(d.tone){ setProp('tone', d.tone); if(!S.sel) S.brush.tool = ['line', 'chord', 'note'].includes(S.brush.tool) ? S.brush.tool : 'line'; syncTools(); return; }
  if(d.dyn){ S.brush.dyn = d.dyn; syncTools(); return; }
  if(d.env){ const e2 = envOf(d.env); if(S.sel && S.sel.type === 'drop') return;
    for(const k in e2) target()[k] = e2[k]; if(S.sel) changed(); syncTools(); return; }
  if(d.tex){ setProp('texture', d.tex); return; }
  if(d.shape){ setProp('shape', d.shape); if(!S.sel) S.brush.tool = 'chord'; syncTools(); return; }
});
$('#size').oninput = e => { if(S.sel && S.sel.type === 'drop') return; setProp('size', +e.target.value); };
$('#alpha').oninput = e => setProp('alpha', +e.target.value);
$('#resetDetail').onclick = () => {
  const t = target(), keys = targetKind() === 'drop' ? DRUM_KEYS : SYN_KEYS;
  for(const k of keys) t[k] = PDEF[k];
  if(S.sel) changed(); syncTools();
};
$('#selPlay').onclick = () => { if(S.sel) auditionObj(S.sel, EP()); };
$('#selDel').onclick = deleteSel;
$('#selNone').onclick = () => select(null);
$('#undo').onclick = undo;
$('#clearPad').onclick = () => { const p = EP(); if(!p.objects.length) return; pushHistory(); p.objects = []; S.sel = null; changed(); stopPad(S.editing); syncTools(); toast('已清空這格（可以按復原）'); };

$('#eDone').onclick = closeEditor;
$('#eImport').onclick = () => openImport();   // openImport 在 library.js，載入順序較晚
$('#ePlay').onclick = togglePreview;
$('#eName').oninput = e => { EP().name = e.target.value; refreshPad(S.editing); save(); };
$('#eVol').oninput = e => { EP().vol = +e.target.value; setPadVolume(S.editing, EP().vol); save(); };
$('#eBeats').onchange = e => { const p = EP(), was = voices.has(S.editing); p.beats = +e.target.value; bgDirty = true; changed();
  if(was){ stopPad(S.editing, 0.02); togglePreview(); } };
$('#eMode').onclick = e => { const b = e.target.closest('button'); if(!b) return; EP().mode = b.dataset.v; syncEditorBar(); refreshPad(S.editing); save(); };
$('#eKey').onclick = () => { bindingKey = !bindingKey; syncEditorBar(); };
function bindKey(code){
  const p = EP(), other = S.pads.findIndex((q, j) => j !== S.editing && q.key === code);
  if(other >= 0){ S.pads[other].key = p.key; refreshPad(other); toast(`和第 ${other + 1} 格交換了按鍵`); }
  p.key = code; bindingKey = false; syncEditorBar(); refreshPad(S.editing); save();
}
