'use strict';
/* ============================================================
   overview.js — 疊合總覽：所有音效板畫在同一張畫布上
   ============================================================ */
const OV = {align:'stretch', others:'dim', hidden:new Set(), key:'', legendKey:''};
const ovCv = $('#ovCv'), ovG = ovCv.getContext('2d');
const ovLayer = document.createElement('canvas'), ovScratch = document.createElement('canvas');
let OW = 0, OH = 0, ODPR = 1;
/** 實際長度模式：以最長的那格為軸（至少 4 小節），較短的音效重複鋪滿 */
const realBeats = () => Math.max(16, ...S.pads.filter(p => p.objects.length).map(p => p.beats));

function ovResize(){
  const r = $('#ovStage').getBoundingClientRect(); if(!r.width) return;
  ODPR = Math.min(2, devicePixelRatio || 1); OW = r.width; OH = r.height;
  for(const c of [ovCv, ovLayer, ovScratch]){ c.width = Math.round(OW * ODPR); c.height = Math.round(OH * ODPR); }
  OV.key = '';
}
new ResizeObserver(ovResize).observe($('#ovStage'));
const ovV = (w, am) => ({W:w, H:OH, dpr:ODPR, s:ovScratch, k:Math.min(1, OH / 640), am});

function renderOvLayer(states){
  const c = ctxFor(ovLayer, ODPR);
  c.clearRect(0, 0, OW, OH);
  drawGrid(c, {W:OW, H:OH}, OV.align === 'real' ? realBeats() : 16, {labels:OV.align === 'real'});
  const order = S.pads.map((p, i) => i).filter(i => S.pads[i].objects.length && !OV.hidden.has(i));
  const playing = i => states[i].state === 'playing' || states[i].state === 'armed';
  // 先畫沒在播的，再把播放中的疊在最上面
  for(const pass of [false, true]) for(const i of order){
    if(playing(i) !== pass) continue;
    const am = pass ? 1 : OV.others === 'dim' ? 0.22 : OV.others === 'hide' ? 0 : 1;
    if(am <= 0) continue;
    drawPadOn(c, S.pads[i], am);
  }
}
function drawPadOn(c, p, am){
  withKey(p, () => drawPadOn0(c, p, am));
}
function drawPadOn0(c, p, am){
  if(OV.align === 'stretch'){ const V = ovV(OW, am); for(const o of p.objects) drawObj(c, o, V); return; }
  const RB = realBeats(), L = Math.min(p.beats, RB), tiles = Math.max(1, Math.round(RB / L)), tw = OW / tiles, V = ovV(tw, am);
  for(let t = 0; t < tiles; t++){ c.save(); c.translate(t * tw, 0); for(const o of p.objects) drawObj(c, o, V); c.restore(); }
}
function ovFrame(){
  if(S.view !== 'overview' || !OW || S.editing !== null) return;
  const states = S.pads.map((_, i) => padState(i));
  const playKey = states.map(s => s.state === 'playing' ? (s.stopping ? 's' : 'p') : s.state === 'armed' ? 'a' : '-').join('');
  const key = [inkVer, playKey, OV.align, OV.others, [...OV.hidden].join(','), OW, OH, S.root, S.scale].join('|');
  if(key !== OV.key){ renderOvLayer(states); OV.key = key; updateLegendStates(states); }
  ovG.setTransform(ODPR, 0, 0, ODPR, 0, 0); ovG.clearRect(0, 0, OW, OH); ovG.drawImage(ovLayer, 0, 0, OW, OH);
  states.forEach((st, i) => {
    if(st.state !== 'playing' || OV.hidden.has(i)) return;
    const p = S.pads[i], col = padColor(p);
    if(OV.align === 'stretch'){ withKey(p, () => drawPlayhead(ovG, p.objects, st.prog, ovV(OW), padDur(p), col)); return; }
    const RB = realBeats(), L = Math.min(p.beats, RB), beatDur = 60 / S.bpm, eb = (st.el / beatDur) % RB;
    const tile = Math.floor(eb / L), tw = OW / Math.max(1, Math.round(RB / L));
    ovG.save(); ovG.translate(tile * tw, 0); withKey(p, () => drawPlayhead(ovG, p.objects, (eb - tile * L) / L, ovV(tw), padDur(p), col)); ovG.restore();
  });
  const n = states.filter(s => s.state === 'playing').length;
  $('#ovCount').textContent = n ? `${n} 格播放中` : '目前沒有在播放';
}

/* ---------- 圖例 ---------- */
function buildLegend(){
  const rows = S.pads.map((p, i) => ({p, i})).filter(r => r.p.objects.length);
  OV.legendKey = rows.map(r => r.i + r.p.name + r.p.key).join('|') + inkVer;
  $('#ovLegend').innerHTML = rows.length ? rows.map(({p, i}) => `
    <div class="lg" data-i="${i}" style="--c:${padColor(p)}">
      <input type="checkbox" ${OV.hidden.has(i) ? '' : 'checked'} title="顯示／隱藏">
      <kbd title="點擊播放">${keyLabel(p.key)}</kbd><i></i>
      <span class="ln">${p.name || '未命名'}</span><span class="lm" title="${padBadgeTitle(p)}">${padBadge(p)}</span>
    </div>`).join('') : '<div class="lgEmpty">還沒有任何音效板，先到 ✎ 編輯 畫一些吧</div>';
  $$('#ovLegend .lg').forEach(row => {
    const i = +row.dataset.i;
    row.querySelector('input').onchange = e => { e.target.checked ? OV.hidden.delete(i) : OV.hidden.add(i); };
    const k = row.querySelector('kbd');
    k.onpointerdown = e => { e.preventDefault(); initAudio(); try{ k.setPointerCapture(e.pointerId); }catch(_){} trigger(i, e.shiftKey); };
  });
  OV.key = '';
}
function updateLegendStates(states){
  $$('#ovLegend .lg').forEach(row => {
    const st = states[+row.dataset.i].state;
    row.classList.toggle('playing', st === 'playing'); row.classList.toggle('armed', st === 'armed'); row.classList.toggle('stopping', !!states[+row.dataset.i].stopping);
  });
}
$('#ovAlign').onclick = e => { const b = e.target.closest('button'); if(!b) return; OV.align = b.dataset.v; syncOvOptions(); };
$('#ovOthers').onclick = e => { const b = e.target.closest('button'); if(!b) return; OV.others = b.dataset.v; syncOvOptions(); };
$('#ovAll').onclick = () => { OV.hidden.clear(); buildLegend(); };
$('#ovNone').onclick = () => { S.pads.forEach((p, i) => p.objects.length && OV.hidden.add(i)); buildLegend(); };
function syncOvOptions(){
  $$('#ovAlign button').forEach(b => b.classList.toggle('on', b.dataset.v === OV.align));
  $$('#ovOthers button').forEach(b => b.classList.toggle('on', b.dataset.v === OV.others));
}
