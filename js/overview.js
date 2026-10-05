'use strict';
/* ============================================================
   overview.js — 疊合總覽：所有音效板畫在同一張畫布上
   ============================================================ */
const OV = {align:'stretch', others:'dim', hidden:new Set(), legendKey:''};
const ovCv = $('#ovCv'), ovG = ovCv.getContext('2d');
/** 實際長度模式：以最長的那格為軸（至少 4 小節），較短的音效重複鋪滿 */
const realBeats = () => Math.max(16, ...S.pads.filter(p => p.objects.length).map(p => p.beats));

/* 總覽可以同時畫好幾份：主畫面上的這一張（OVM），也可以在背景另外畫（例如錄影用）。
   每一份有自己的尺寸與快取（layer＝沒在動的部分），設定（OV）是共用的，背景那份也會照最後的總覽設定。 */
function makeOvInst(){ return {layer:document.createElement('canvas'), scratch:document.createElement('canvas'), W:0, H:0, dpr:1, key:''}; }
const OVM = makeOvInst(), OV_INSTS = [OVM];
function ovSize(I, W, H, dpr){
  if(I.W === W && I.H === H && I.dpr === dpr) return;
  Object.assign(I, {W, H, dpr, key:''});
  for(const c of [I.layer, I.scratch]){ c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
}
const ovInvalidate = () => OV_INSTS.forEach(I => I.key = '');
function ovResize(){
  const r = $('#ovStage').getBoundingClientRect(); if(!r.width) return;
  const dpr = Math.min(2, devicePixelRatio || 1); ovSize(OVM, r.width, r.height, dpr);
  ovCv.width = Math.round(r.width * dpr); ovCv.height = Math.round(r.height * dpr); OVM.key = '';
}
new ResizeObserver(ovResize).observe($('#ovStage'));
const ovV = (I, w, am) => ({W:w, H:I.H, dpr:I.dpr, s:I.scratch, k:Math.min(1, I.H / 640), am});

function renderOvLayer(I, states){
  const c = ctxFor(I.layer, I.dpr);
  c.clearRect(0, 0, I.W, I.H);
  drawGrid(c, {W:I.W, H:I.H}, OV.align === 'real' ? realBeats() : 16, {labels:OV.align === 'real'});
  const order = S.pads.map((p, i) => i).filter(i => S.pads[i].objects.length && !OV.hidden.has(i));
  const playing = i => states[i].state === 'playing' || states[i].state === 'armed';
  // 先畫沒在播的，再把播放中的疊在最上面
  for(const pass of [false, true]) for(const i of order){
    if(playing(i) !== pass) continue;
    const am = pass ? 1 : OV.others === 'dim' ? 0.22 : OV.others === 'hide' ? 0 : 1;
    if(am <= 0) continue;
    withKey(S.pads[i], () => drawPadOn(I, c, S.pads[i], am));
  }
}
function drawPadOn(I, c, p, am){
  if(OV.align === 'stretch'){ const V = ovV(I, I.W, am); for(const o of p.objects) drawObj(c, o, V); return; }
  const RB = realBeats(), L = Math.min(p.beats, RB), tiles = Math.max(1, Math.round(RB / L)), tw = I.W / tiles, V = ovV(I, tw, am);
  for(let t = 0; t < tiles; t++){ c.save(); c.translate(t * tw, 0); for(const o of p.objects) drawObj(c, o, V); c.restore(); }
}
/** 把一份總覽畫到 c 上（c 的座標要已經對齊這份總覽的左上角、以 CSS 像素為單位）；靜態部分有變才重畫，回傳是否重畫 */
function drawOverview(I, c, states){
  const playKey = states.map(s => s.state === 'playing' ? (s.stopping ? 's' : 'p') : s.state === 'armed' ? 'a' : '-').join('');
  const key = [inkVer, playKey, OV.align, OV.others, [...OV.hidden].join(','), I.W, I.H, S.root, S.scale].join('|'), changed = key !== I.key;
  if(changed){ renderOvLayer(I, states); I.key = key; }
  c.drawImage(I.layer, 0, 0, I.W, I.H);
  states.forEach((st, i) => {
    if(st.state !== 'playing' || OV.hidden.has(i)) return;
    const p = S.pads[i], col = padColor(p);
    if(OV.align === 'stretch'){ withKey(p, () => drawPlayhead(c, p.objects, st.prog, ovV(I, I.W), padDur(p), col)); return; }
    const RB = realBeats(), L = Math.min(p.beats, RB), beatDur = 60 / S.bpm, eb = (st.el / beatDur) % RB;
    const tile = Math.floor(eb / L), tw = I.W / Math.max(1, Math.round(RB / L));
    c.save(); c.translate(tile * tw, 0); withKey(p, () => drawPlayhead(c, p.objects, (eb - tile * L) / L, ovV(I, tw), padDur(p), col)); c.restore();
  });
  return changed;
}
function ovFrame(){
  if(S.view !== 'overview' || !OVM.W || S.editing !== null) return;
  const states = S.pads.map((_, i) => padState(i));
  ovG.setTransform(OVM.dpr, 0, 0, OVM.dpr, 0, 0); ovG.clearRect(0, 0, OVM.W, OVM.H);
  if(drawOverview(OVM, ovG, states)) updateLegendStates(states);
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
  ovInvalidate();
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
