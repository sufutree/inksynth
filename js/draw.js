'use strict';
/* ============================================================
   draw.js — 墨水繪圖（編輯器、縮圖、疊合總覽共用）
   V = {W, H, dpr, s:暫存畫布, k:線寬比例, am:透明度倍率, ym:資料 y → 畫面 y（編輯器的上下分區用，省略＝y×H）, dk:墨滴大小倍率}
   ============================================================ */
const Y = (V, y) => V.ym ? V.ym(y) : y * V.H;
const ctxFor = (cv, dpr) => { const x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); return x; };
function taper(u){ const s = x => Math.sin(Math.min(1, x) * Math.PI / 2); return 0.12 + 0.88 * Math.min(s(u / 0.18), s((1 - u) / 0.25)); }
const isSoft = o => o.a > 0.05;

function drawLineObj(c, o, V){
  const {W, H, k} = V, am = V.am ?? 1, n = o.pts.length; if(n < 2) return;
  const P = o.pts.map(p => [p.x * W, Y(V, p.y), p.w ?? 1]);
  const col = toneColor(o.tone), size = Math.max(1.2, o.size * k), soft = isSoft(o);
  // 只處理筆畫範圍，避免整張畫布重繪
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for(const p of P){ x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  const pad = size * 1.2 + 6;
  const bx = Math.max(0, Math.floor(x0 - pad)), by = Math.max(0, Math.floor(y0 - pad));
  const bw = Math.min(W, Math.ceil(x1 + pad)) - bx, bh = Math.min(H, Math.ceil(y1 + pad)) - by;
  if(bw <= 0 || bh <= 0) return;
  const s = ctxFor(V.s, V.dpr);
  s.clearRect(bx, by, bw, bh); s.strokeStyle = col; s.lineJoin = 'round'; s.lineCap = 'round';
  const L = [0]; for(let i = 1; i < n; i++) L[i] = L[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
  const tot = L[n - 1] || 1;
  const widthAt = i => Math.max(1, size * (soft ? taper(L[i] / tot) : 1) * (0.3 + 0.7 * P[i][2]));
  for(let i = 1; i < n; i++){
    s.lineWidth = widthAt(i);
    s.beginPath(); s.moveTo(P[i - 1][0], P[i - 1][1]); s.lineTo(P[i][0], P[i][1]); s.stroke();
  }
  const R = rng(o.seed || 1), kk = Math.max(k, 0.4);
  if(o.texture === 'grain'){
    s.globalCompositeOperation = 'destination-out';
    for(let i = 0; i < n; i++) for(let j = 0; j < 3; j++){ s.beginPath();
      s.arc(P[i][0] + (R() - .5) * size, P[i][1] + (R() - .5) * size, (0.4 + R() * 1.4) * kk, 0, 7); s.fill(); }
    s.globalCompositeOperation = 'source-atop'; s.fillStyle = 'rgba(0,0,0,.35)';
    for(let i = 0; i < n; i += 2){ s.beginPath(); s.arc(P[i][0] + (R() - .5) * size, P[i][1] + (R() - .5) * size, (0.6 + R()) * kk, 0, 7); s.fill(); }
  } else if(o.texture === 'wave'){
    s.strokeStyle = 'rgba(255,255,255,.6)'; s.lineWidth = Math.max(0.7, 1.3 * k); s.beginPath();
    for(let i = 0; i < n; i++){
      const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1;
      const off = Math.sin(L[i] * 0.22 / kk) * widthAt(i) * 0.45;
      const x = P[i][0] - dy / d * off, y = P[i][1] + dx / d * off; i ? s.lineTo(x, y) : s.moveTo(x, y);
    }
    s.stroke();
  } else if(o.texture === 'dash'){
    s.globalCompositeOperation = 'destination-out'; s.setLineDash([4 * kk + 1, 9 * kk + 2]); s.lineWidth = size + 8; s.lineCap = 'butt';
    s.beginPath(); P.forEach((p, i) => i ? s.lineTo(p[0], p[1]) : s.moveTo(p[0], p[1])); s.stroke(); s.setLineDash([]);
  }
  s.globalCompositeOperation = 'source-over';
  c.save(); c.globalAlpha = (0.2 + o.alpha * 0.8) * am;
  if(soft || o.texture === 'mist'){ c.shadowColor = col; c.shadowBlur = size * (o.texture === 'mist' ? 2.4 : 0.9); }
  if(o.texture === 'mist'){ c.save(); c.globalAlpha *= 0.45; c.filter = `blur(${Math.max(2, size * 0.5)}px)`;
    c.drawImage(V.s, bx * V.dpr, by * V.dpr, bw * V.dpr, bh * V.dpr, bx, by, bw, bh); c.restore(); }
  c.drawImage(V.s, bx * V.dpr, by * V.dpr, bw * V.dpr, bh * V.dpr, bx, by, bw, bh);
  c.restore();
}
function dropRadius(o, V){ return {kick:10, tom:9, snare:8, clap:8, ohat:6.5, hat:5.5}[o.lane] * (0.75 + o.alpha * 0.4) * Math.max(V.k, .35) * (V.dk || 1); }
function drawDrop(c, o, V){
  const x = o.x * V.W, y = Y(V, LANES[o.lane]), R = dropRadius(o, V), rnd = rng(o.seed || 7);
  c.save(); c.globalAlpha = 0.95 * (V.am ?? 1); c.fillStyle = DRUMS[o.lane].color; c.beginPath();
  for(let j = 0; j <= 16; j++){ const a = j / 16 * Math.PI * 2, rr = R * (0.82 + rnd() * 0.32); j ? c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : c.moveTo(x + rr, y); }
  c.fill();
  for(let j = 0; j < 5; j++){ const a = rnd() * Math.PI * 2, d = R * (1.3 + rnd() * 1.3);
    c.beginPath(); c.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, R * (0.07 + rnd() * 0.17), 0, 7); c.fill(); }
  c.restore();
}
/** 和弦的外框：上下包住所有的音 */
function chordGeom(o, V){
  const ys = chordNotes(o).filter(m => m <= MIDI_HI).map(m => Y(V, midiToY(m))), top = Math.min(...ys), bot = Math.max(...ys);
  const x0 = o.x * V.W, w = Math.max(6, o.len * V.W), h = Math.max(24 * V.k, bot - top + 18 * V.k);
  return {cy:(top + bot) / 2, x0, w, h, ys};
}
function chordPath(c, o, V, pad = 0){
  const {cy, x0, w, h} = chordGeom(o, V); c.beginPath();
  if(o.shape === 'tri'){ c.moveTo(x0 - pad, cy + h / 2 + pad); c.lineTo(x0 + w / 2, cy - h / 2 - pad * 1.6); c.lineTo(x0 + w + pad, cy + h / 2 + pad); c.closePath(); }
  else if(o.shape === 'sq') c.rect(x0 - pad, cy - h / 2 - pad, w + pad * 2, h + pad * 2);
  else c.ellipse(x0 + w / 2, cy, w / 2 + pad, h / 2 + pad, 0, 0, Math.PI * 2);
}
function drawChord(c, o, V){
  const col = toneColor(o.tone), {x0} = chordGeom(o, V);
  c.save(); c.globalAlpha = (0.3 + o.alpha * 0.7) * (V.am ?? 1);
  if(isSoft(o) || o.texture === 'mist'){ c.shadowColor = col; c.shadowBlur = 14 * V.k * (o.texture === 'mist' ? 2.5 : 1); }
  chordPath(c, o, V); c.fillStyle = hexA(col, 0.2); c.fill();
  c.lineWidth = Math.max(1, (isSoft(o) ? 2 : 2.5) * V.k); c.strokeStyle = col;
  if(o.texture === 'dash') c.setLineDash([6 * V.k + 1, 5 * V.k + 1]);
  c.stroke(); c.setLineDash([]);
  c.shadowBlur = 0; c.fillStyle = col; c.strokeStyle = hexA(col, 0.55); c.lineWidth = Math.max(1, 1.5 * V.k);
  const {w, ys} = chordGeom(o, V);
  for(const y of ys){ c.beginPath(); c.moveTo(x0, y); c.lineTo(x0 + w, y); c.stroke();   // 每個音一條細線，看得出音高
    c.beginPath(); c.arc(x0, y, Math.max(1.2, 3 * V.k), 0, 7); c.fill(); }
  c.restore();
}
function drawObj(c, o, V){ if(o.type === 'line') drawLineObj(c, o, V); else if(o.type === 'drop') drawDrop(c, o, V); else drawChord(c, o, V); }
function objBBox(o, V){
  if(o.type === 'line'){ const r = o.size * V.k / 2 + 6; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for(const p of o.pts){ const y = Y(V, p.y); x0 = Math.min(x0, p.x * V.W); x1 = Math.max(x1, p.x * V.W); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    return [x0 - r, y0 - r, x1 + r, y1 + r]; }
  if(o.type === 'drop'){ const R = dropRadius(o, V) * 2 + 4, x = o.x * V.W, y = Y(V, LANES[o.lane]); return [x - R, y - R, x + R, y + R]; }
  const {cy, x0, w, h} = chordGeom(o, V); return [x0 - 6, cy - h / 2 - 8, x0 + w + 6, cy + h / 2 + 6];
}
/** 選取框；note：和弦裡被點選的那一個音（索引），會另外標亮 */
function drawSelection(c, o, V, note = null){
  const [x0, y0, x1, y1] = objBBox(o, V);
  c.save(); c.strokeStyle = '#fff'; c.lineWidth = 1.2; c.setLineDash([5, 4]); c.lineDashOffset = -performance.now() / 40;
  c.strokeRect(x0, y0, x1 - x0, y1 - y0);
  if(note !== null && o.type === 'chord'){ const {x0:cx, w, ys} = chordGeom(o, V), y = ys[note];
    if(y != null){ c.setLineDash([]); c.strokeStyle = '#fff'; c.lineWidth = 3; c.shadowColor = toneColor(o.tone); c.shadowBlur = 10;
      c.beginPath(); c.moveTo(cx - 4, y); c.lineTo(cx + w + 4, y); c.stroke(); } }
  c.restore();
}
function drawPlayhead(c, objs, prog, V, dur, col = '#7cf0d0'){
  const {W, H, k} = V, sx = prog * W, kk = Math.max(k, .4);
  for(const o of objs){
    if(o.type === 'line'){
      const y = lineYAt(o, prog); if(y === null) continue;
      c.save(); c.fillStyle = '#fff'; c.shadowColor = toneColor(o.tone); c.shadowBlur = 18 * k;
      c.beginPath(); c.arc(sx, Y(V, y), Math.max(2, (o.size / 2 + 3) * k), 0, 7); c.fill(); c.restore();
    } else if(o.type === 'drop'){
      const d = (prog - o.x) * dur;
      if(d >= 0 && d < 0.18){ c.save(); c.globalAlpha = 1 - d / 0.18; c.strokeStyle = DRUMS[o.lane].color; c.lineWidth = 2;
        c.beginPath(); c.arc(o.x * W, Y(V, LANES[o.lane]), (10 + d * 120) * kk * (V.dk || 1), 0, 7); c.stroke(); c.restore(); }
    } else if(prog >= o.x && prog <= o.x + o.len){
      c.save(); c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.shadowColor = toneColor(o.tone); c.shadowBlur = 16 * k;
      chordPath(c, o, V, 4 * k); c.stroke(); c.restore();
    }
  }
  const gw = 70 * kk, grd = c.createLinearGradient(sx - gw, 0, sx, 0);
  grd.addColorStop(0, hexA(col, 0)); grd.addColorStop(1, hexA(col, .2));
  c.fillStyle = grd; c.fillRect(sx - gw, 0, gw, H);
  c.save(); c.strokeStyle = col; c.lineWidth = Math.max(1.2, 2 * k); c.shadowColor = col; c.shadowBlur = 12;
  c.beginPath(); c.moveTo(sx, 0); c.lineTo(sx, H); c.stroke(); c.restore();
}
/** 編輯器用：把旋律線實際會發出的音高畫成細細的階梯，讓「畫的位置」和「聽到的音」對得起來 */
function drawQuantTrace(c, o, V){
  if(o.type !== 'line' || o.pts.length < 2) return;
  c.save(); c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 1.4; c.lineJoin = 'miter';
  c.shadowColor = 'rgba(0,0,0,.8)'; c.shadowBlur = 3; c.beginPath();
  let last = null;
  for(const p of o.pts){
    const x = p.x * V.W, y = Y(V, midiToY(quant(p.y)));
    if(last === null) c.moveTo(x, y); else { if(y !== last) c.lineTo(x, last); c.lineTo(x, y); }
    last = y;
  }
  c.stroke();
  c.fillStyle = '#fff'; last = null;
  for(const p of o.pts){ const m = quant(p.y); if(m !== last){ c.beginPath(); c.arc(p.x * V.W, Y(V, midiToY(m)), 2.2, 0, 7); c.fill(); last = m; } }
  c.restore();
}
/** 每個音階音所佔的上下範圍（資料座標），給鋼琴卷軸的橫條用 */
function noteRows(){
  const N = scaleNotes();
  return N.map((m, i) => {
    const up = i < N.length - 1 ? midiToY((m + N[i + 1]) / 2) : midiToY(m) - (midiToY(N[i - 1]) - midiToY(m)) / 2;
    const dn = i > 0 ? midiToY((m + N[i - 1]) / 2) : midiToY(m) + (midiToY(m) - midiToY(N[i + 1])) / 2;
    return {m, y0:up, y1:dn, root:((m - curRoot()) % 12 + 12) % 12 === 0};
  });
}
/** 背景格線（編輯器與總覽共用）
   opts.labels=false：不畫任何文字；opts.side=false：不畫左右的音名／鼓名（編輯器另外畫在左側鍵盤）
   opts.sub：每拍細分幾格；opts.bands：鋼琴卷軸橫條；opts.cells：節奏區的步進格 */
function drawGrid(c, V, beats, opts = {}){
  const {W, H} = V, labels = opts.labels !== false, side = labels && opts.side !== false, sub = opts.sub || 2;
  const grd = c.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, '#12141c'); grd.addColorStop(1, '#0e1017');
  c.fillStyle = grd; c.fillRect(0, 0, W, H);
  const dTop = Y(V, DRUM_TOP);
  c.fillStyle = '#090a0e'; c.fillRect(0, dTop, W, H - dTop);
  c.font = '10px system-ui, sans-serif'; c.textBaseline = 'middle';
  if(opts.bands){
    noteRows().forEach((r, i) => {
      const y0 = Y(V, r.y0), y1 = Y(V, r.y1);
      c.fillStyle = r.root ? 'rgba(124,240,208,.075)' : i % 2 ? 'rgba(255,255,255,.028)' : 'rgba(0,0,0,.12)';
      c.fillRect(0, y0, W, y1 - y0);
    });
  }
  for(const m of scaleNotes()){
    const y = Y(V, midiToY(m)), root = ((m - curRoot()) % 12 + 12) % 12 === 0;
    c.strokeStyle = root ? 'rgba(124,240,208,.15)' : 'rgba(255,255,255,.035)'; c.lineWidth = 1;
    if(!opts.bands || root){ c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
    if(side && (root || H > 420)){ c.fillStyle = root ? 'rgba(124,240,208,.65)' : 'rgba(255,255,255,.2)'; c.fillText(noteName(m), 6, y); }
  }
  const n = beats * sub;
  for(let b = 0; b <= n; b++){
    const x = b / n * W, beat = b % sub === 0, bar = b % (sub * 4) === 0;
    c.strokeStyle = bar ? 'rgba(255,255,255,.16)' : beat ? 'rgba(255,255,255,.06)' : 'rgba(255,255,255,.022)';
    c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke();
    if(labels && beat && b < n && (bar || beats <= 8)){
      const bi = b / sub; c.fillStyle = bar ? 'rgba(255,255,255,.45)' : 'rgba(255,255,255,.22)';
      c.fillText(bar && beats > 4 ? `第 ${bi / 4 + 1} 小節` : beats > 4 ? `${Math.floor(bi / 4) + 1}.${bi % 4 + 1}` : String(bi + 1), x + 5, 12);
    }
  }
  const lh = Math.abs(Y(V, LANES.hat) - Y(V, LANES.ohat));
  LANE_KEYS.forEach((k, li) => {
    const y = Y(V, LANES[k]);
    if(opts.cells){
      if(li % 2) { c.fillStyle = 'rgba(255,255,255,.018)'; c.fillRect(0, y - lh / 2, W, lh); }
      const sw = W / n, pw = Math.min(sw * 0.62, 22), ph = Math.min(lh * 0.62, 26);
      if(sw >= 5) for(let b = 0; b < n; b++){
        const beat = b % sub === 0; c.fillStyle = beat ? hexA(DRUMS[k].color, .1) : 'rgba(255,255,255,.035)';
        c.beginPath(); c.roundRect ? c.roundRect(b * sw - pw / 2, y - ph / 2, pw, ph, Math.min(6, pw / 2)) : c.rect(b * sw - pw / 2, y - ph / 2, pw, ph); c.fill();
      }
    } else { c.strokeStyle = 'rgba(255,255,255,.04)'; c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
    if(side){ c.fillStyle = hexA(DRUMS[k].color, .45); c.textAlign = 'right'; c.fillText(DRUMS[k].zh + ' ' + DRUMS[k].en, W - 8, y); c.textAlign = 'left'; }
  });
  c.strokeStyle = 'rgba(124,240,208,.25)'; c.setLineDash([4, 5]);
  c.beginPath(); c.moveTo(0, dTop); c.lineTo(W, dTop); c.stroke(); c.setLineDash([]);
}
