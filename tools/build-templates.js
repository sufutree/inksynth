'use strict';
/* ============================================================
   build-templates.js — 開發用工具，主程式不會載入這個檔案。
   產生 templates/ 裡除了 bossa 以外的所有範本（bossa 由 build-bossa.js 產生）。
   執行方式：在專案資料夾下執行  node tools/build-templates.js [範本 id ...]

   和聲設計：
   ・每個範本有一組 4 小節的和弦進行（參考各曲風常用的真實進行），所有跟著和弦走的循環
     都是 4 或 8 小節，1、2 小節的短循環只用「疊在每個和弦上都不衝突」的安全音，
     所以任意疊加都會在同一個小節線上對齊、不打架。
   ・和弦用級數＋延伸音寫（add9、sus4、9sus4…），產生時會檢查：屬七、小大七、增、減、♭9
     一律報錯（只有藍調允許屬七）。原本會出問題的 V7、♭VII7 改用 sus4／9sus4 或三和弦。
   ・和弦排列用聲部進行：每個和弦選離上一個和弦最近的轉位，有低音時省略根音。
   ・產生完會模擬所有循環一起播放，統計半音衝突，方便檢查。
   ============================================================ */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');

function GEN(ONLY){

/* ================= 共用常數 ================= */
const S8 = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], OFF8 = [0.5, 1.5, 2.5, 3.5], S16 = Array.from({length:16}, (_, j) => j / 4);
const SW8 = [0, 0.67, 1, 1.67, 2, 2.67, 3, 3.67];
/* 7 聲音階的和弦：延伸音名稱 → 從根音往上的音階級數 */
const EXT = {'':[0, 2, 4], '7':[0, 2, 4, 6], '9':[0, 2, 4, 6, 8], 'add9':[0, 2, 4, 8], 'sus2':[0, 1, 4], 'sus4':[0, 3, 4],
  '6':[0, 2, 4, 5], '69':[0, 2, 4, 5, 8], '9sus4':[0, 3, 4, 6, 8], '#11':[0, 2, 4, 6, 8, 10], '5':[0, 4, 7]};
const PRI7 = [2, 6, 8, 5, 10, 3, 1, 4, 0, 7, 9];   // 排和弦時優先保留：三度、七度、九度、六度…最後才是五度與根音
const SHARP = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'], FLAT = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
const ALPHA = {kick:0.9, snare:0.8, clap:0.8, hat:0.45, ohat:0.45, tom:0.7};
const scaleList = (root, sc) => { const iv = SCALES[sc].iv, out = []; for(let m = 12; m <= 120; m++) if(iv.includes(((m - root) % 12 + 12) % 12)) out.push(m); return out; };
const fit = m => { while(m < MIDI_LO) m += 12; while(m > MIDI_HI) m -= 12; return m; };

/* ================= 預設音色與名稱（各範本可覆寫） ================= */
const BASE_T = {
  pad:['supersaw', 'soft', {size:12, alpha:0.5, uni:18, rev:0.5, a:0.3}],
  stabs:['sawtooth', 'hard', {size:14, alpha:0.6, fenv:0.3, q:2, rev:0.3}],
  arp:['pluck', 'pluck', {size:14, alpha:0.55, rev:0.35, dly:0.25, pan:0.25}],
  comp:['bell', 'pluck', {size:10, alpha:0.55, d:1.2, s:0.3, r:1, rev:0.35}],
  strings8:['sawtooth', 'soft', {size:9, alpha:0.5, uni:14, a:0.5, r:1.2, rev:0.5, lfoD:6, lfoR:5}],
  choir:['choir', 'soft', {size:16, alpha:0.55, rev:0.55, a:0.4}],
  offbeat:['organ', 'hard', {size:10, alpha:0.45, rev:0.3, pan:-0.2}],
  alt:['triangle', 'soft', {size:14, alpha:0.55, rev:0.45, a:0.3}],
  strum:['pluck', 'pluck', {size:14, alpha:0.6, d:0.9, s:0.2, r:1.4, rev:0.45}],
  shimmer:['sine', 'swell', {size:24, alpha:0.45, rev:0.65, texture:'mist'}],
  themeA8:['sawtooth', 'soft', {size:13, alpha:0.72, a:0.05, glide:0.05, rev:0.4, dly:0.2, lfoD:6, lfoR:5.5}],
  themeB:['square', 'soft', {size:11, alpha:0.62, a:0.04, glide:0.04, rev:0.35, dly:0.2}],
  hook:['bell', 'pluck', {size:14, alpha:0.55, d:0.6, s:0.15, r:1, rev:0.45, dly:0.3}],
  counter:['triangle', 'soft', {size:14, alpha:0.58, a:0.08, rev:0.4, texture:'wave'}],
  seq:['pulse', 'pluck', {size:12, alpha:0.5, rev:0.3, dly:0.3, pan:-0.25}],
  run:['sawtooth', 'hard', {size:13, alpha:0.62, glide:0.03, rev:0.35, dly:0.2}],
  harmony8:['triangle', 'soft', {size:12, alpha:0.5, a:0.05, rev:0.4, pan:0.3}],
  motif:['bell', 'pluck', {size:18, alpha:0.5, d:0.8, s:0.1, r:1.5, rev:0.55, dly:0.25}],
  callResp:[['sawtooth', 'hard', {size:12, alpha:0.6, rev:0.35, pan:-0.35}], ['square', 'soft', {size:12, alpha:0.55, rev:0.35, pan:0.35, a:0.03}]],
  glide:['sine', 'soft', {size:20, alpha:0.65, glide:0.2, rev:0.5, dly:0.25, lfoD:12, lfoR:5, texture:'wave'}],
  bass:['sawtooth', 'hard', {size:7, alpha:0.8, fenv:0.35, q:3, rev:0.05}],
  bass2:['pulse', 'hard', {size:8, alpha:0.72, fenv:0.45, q:4, rev:0.05}],
  sub:['sub', 'soft', {size:18, alpha:0.78, a:0.04, rev:0}],
  riser:['supersaw', 'swell', {size:18, alpha:0.55, uni:30, rev:0.5, texture:'wave'}],
  down:['sine', 'hard', {size:18, alpha:0.6, rev:0.45, glide:0.18}],
  texture:['wind', 'swell', {size:26, alpha:0.55, rev:0.6, texture:'mist', glide:0.3}],
  sweep:['wind', 'swell', {size:30, alpha:0.62, rev:0.4, glide:0.3}],
  stutter:['supersaw', 'hard', {size:15, alpha:0.55, texture:'dash', rev:0.3}],
  drone:['sine', 'swell', {size:22, alpha:0.45, rev:0.5, lfoD:4, lfoR:0.25, texture:'mist'}],
  outro:['choir', 'swell', {size:16, alpha:0.55, rev:0.7, r:2.5, texture:'mist'}],
};
const BASE_N = {groove:'主節奏', groove4:'節奏＋過門', hats:'細碎 Hat', perc:'打擊樂', half:'半速律動', break:'間奏節拍', build:'鼓聲漸強',
  fill:'過門', impact:'重擊', ending:'結尾', pad:'和弦鋪底', stabs:'和弦切分', arp:'琶音', comp:'鍵盤伴奏', strings8:'弦樂 8 小節',
  choir:'人聲和弦', offbeat:'反拍和弦', alt:'第二進行', strum:'刷弦', shimmer:'高空泛音', themeA8:'主旋律 8 小節', themeB:'副旋律',
  hook:'Hook 短句', counter:'對位旋律', seq:'序列', run:'快速樂句', harmony8:'主旋律和聲', motif:'鐘聲動機', callResp:'對答樂句',
  glide:'滑音 Lead', bass:'低音線', bass2:'律動低音', sub:'次低音', riser:'上升', down:'下墜', texture:'氛圍', sweep:'掃頻',
  stutter:'切片和弦', drone:'持續低音', outro:'結束和弦'};
const LAYOUT = {
  Digit1:'groove', Digit2:'groove4', Digit3:'hats', Digit4:'perc', Digit5:'half', Digit6:'break', Digit7:'build', Digit8:'fill', Digit9:'impact', Digit0:'ending',
  KeyQ:'pad', KeyW:'stabs', KeyE:'arp', KeyR:'comp', KeyT:'strings8', KeyY:'choir', KeyU:'offbeat', KeyI:'alt', KeyO:'strum', KeyP:'shimmer',
  KeyA:'themeA8', KeyS:'themeB', KeyD:'hook', KeyF:'counter', KeyG:'seq', KeyH:'run', KeyJ:'harmony8', KeyK:'motif', KeyL:'callResp', Semicolon:'glide',
  KeyZ:'bass', KeyX:'bass2', KeyC:'sub', KeyV:'riser', KeyB:'down', KeyN:'texture', KeyM:'sweep', Comma:'stutter', Period:'drone', Slash:'outro'};

/* ================= 產生器 ================= */
function build(C){
  Object.assign(S, {root:C.root, scale:C.scale, bpm:C.bpm}); resetScaleCache();
  const NAMES = C.flats ? FLAT : SHARP;
  const E = scaleList(C.root, C.scale), NS = SCALES[C.scale].iv.length;
  const tonic = E.find(m => m >= 55 && (m - C.root) % 12 === 0), ti = E.indexOf(tonic);
  const deg = d => E[ti + d];                                       // 音階級數 → MIDI（0＝主音）
  const pcOf = d => deg(d) % 12;
  const HSC = C.hscale || C.scale, HE = scaleList(C.root, HSC), hti = HE.indexOf(tonic);
  const hdeg = d => HE[hti + d];                                    // 和聲用的音階（藍調的和弦用混合利底亞）
  const HK = HSC !== C.scale ? {ownKey:{root:C.root, scale:HSC}} : {};
  const CHROM = {ownKey:{root:C.root, scale:'chromatic'}};          // 音效用半音階：滑音每個半音都會經過
  const R = rng(C.seed);
  const K = C.kit, RH = C.rh;
  const T = {...BASE_T, ...(C.T || {})}, N = {...BASE_N, ...(C.N || {})};

  /* ---------- 和弦 ---------- */
  const chordName = ch => { const iv = new Set([...ch.pcs].map(p => (p - ch.root + 12) % 12));
    const third = iv.has(4) ? 4 : iv.has(3) ? 3 : 0, sev = iv.has(11) ? 'maj7' : iv.has(10) ? '7' : '';
    let s = third === 3 ? 'm' : '';
    if(third){
      if(sev) s += sev === '7' ? (iv.has(2) ? '9' : '7') : (iv.has(2) ? 'maj9' : 'maj7');
      else if(iv.has(9)) s += iv.has(2) ? '6/9' : '6';
      else if(iv.has(2)) s += third === 3 ? '(add9)' : 'add9';
      if(iv.has(6) && iv.has(7)) s += '♯11';
    } else s += (sev === '7' ? (iv.has(2) ? '9' : '7') : sev) + (iv.has(5) ? 'sus4' : iv.has(2) ? 'sus2' : sev ? '' : iv.has(9) ? '6' : '5');
    return NAMES[ch.root] + s + (ch.bass !== ch.root ? '/' + NAMES[ch.bass] : ''); };
  const mkProg = (spec, label) => { let b = 0;
    const P = spec.map(([d, ext, len, o = {}]) => {
      const st = typeof ext === 'string' ? EXT[ext] : ext; if(!st) throw Error(`${C.id} 未知的和弦寫法 ${ext}`);
      const order = typeof ext === 'string' ? [...st].sort((a, c) => PRI7.indexOf(a) - PRI7.indexOf(c)) : st;
      const root = hdeg(d) % 12, tones = [...new Set(order.map(s => hdeg(d + s) % 12))];
      const ch = {d, b0:b, len, root, bass:o.bass != null ? hdeg(o.bass) % 12 : root, tones, pcs:new Set(tones)};
      const iv = new Set(tones.map(p => (p - root + 12) % 12)), bad = [];
      if(iv.has(4) && iv.has(10) && !C.allowDom) bad.push('屬七'); if(iv.has(3) && iv.has(11)) bad.push('小大七');
      if(iv.has(4) && iv.has(8) && !iv.has(7)) bad.push('增'); if(iv.has(3) && iv.has(6) && !iv.has(7)) bad.push('減'); if(iv.has(1)) bad.push('♭9');
      ch.name = chordName(ch); if(bad.length) throw Error(`${C.id} ${label} ${ch.name}：${bad.join('、')}`);
      b += len; return ch; });
    if(b !== 16) throw Error(`${C.id} ${label} 要剛好 4 小節（目前 ${b} 拍）`);
    P.len = b; return P; };
  const PROG = mkProg(C.prog, '主進行'), ALT = C.alt ? mkProg(C.alt, '第二進行') : null;
  /* 第二進行要能和主進行同時播放：逐拍比對，不共用的音不能和對方的和弦音差半音 */
  if(ALT) for(let b = 0; b < 16; b += 0.5){ const a = ALT.find(c => b >= c.b0 && b < c.b0 + c.len), p = PROG.find(c => b >= c.b0 && b < c.b0 + c.len);
    for(const x of a.pcs) if(!p.pcs.has(x)) for(const y of p.pcs) if([1, 11].includes((x - y + 12) % 12))
      throw Error(`${C.id} 第二進行 ${a.name} 和主進行 ${p.name} 在第 ${b} 拍有半音衝突`); }
  const FINAL = mkProg([[...C.final.slice(0, 2), 16]], '結束和弦')[0];
  const at = (P, b) => { const x = ((b % P.len) + P.len) % P.len; return P.find(c => x >= c.b0 - 1e-6 && x < c.b0 + c.len - 1e-6) || P[0]; };
  const ch = b => at(PROG, b);
  const nextOf = (P, c) => P[(P.indexOf(c) + 1) % P.length];
  /** 會不會衝突：不是和弦音，又剛好在和弦音上方半音，或和根音成三全音 */
  const clash = (pc, c) => !c.pcs.has(pc) && ([...c.pcs].some(t => (pc - t + 12) % 12 === 1) || (pc - c.root + 12) % 12 === 6);
  const SAFE_ADD = new Set((C.safeAdd || []).map(s => (C.root + s) % 12));
  const safePc = pc => SAFE_ADD.has(pc) || PROG.every(c => !clash(pc, c));
  const safeDegs = (lo, hi) => { const o = []; for(let d = lo; d <= hi; d++) if(safePc(pcOf(d))) o.push(d); return o; };

  /* ---------- 聲部進行 ---------- */
  /** 取 n 個音：照優先順序取，不夠就重複根音、五度（不重複三度） */
  const voicePcs = (c, n) => { const t = c.tones.slice(0, n), dup = [c.root, (c.root + 7) % 12, ...c.tones].filter(pc => c.pcs.has(pc));
    for(let i = 0; t.length < n; i++) t.push(dup[i % dup.length]); return t; };
  const voicings = (pcs, lo, hi, spread) => {
    const opts = pcs.map(pc => { const o = []; for(let m = lo; m <= hi; m++) if(m % 12 === pc) o.push(m); return o; });
    let res = [[]]; for(const o of opts){ const nx = []; for(const r of res) for(const m of o) if(!r.includes(m)) nx.push([...r, m]); res = nx; }
    return res.map(v => v.sort((a, b) => a - b)).filter(v => v[v.length - 1] - v[0] <= spread); };
  const VC = {};
  /** 把整個進行排成聲部：先跑一圈，讓第一個和弦也是從最後一個和弦接過來（循環時才平順） */
  const lead = (P, {n = 4, lo = 53, hi = 74, top = 70, spread = 14} = {}) => VC[[P === ALT, n, lo, hi, top, spread].join()] ||= (() => {
    const pick = (c, prev) => {
      for(const sp of [spread, spread + 7, 26]) for(let k = n; k >= Math.min(n, c.tones.length); k--){ let best = null, bc = 1e9;
        for(const v of voicings(voicePcs(c, k), lo, hi, sp)){ let cost = Math.abs(v[v.length - 1] - top) * (prev ? 0.3 : 1);
          if(prev) v.forEach((m, i) => cost += Math.abs(m - prev[Math.round(i * (prev.length - 1) / Math.max(1, v.length - 1))]));
          for(let i = 1; i < v.length; i++){ const g = v[i] - v[i - 1]; if(g === 1) cost += 14; if(g === 2 && v[i - 1] < 57) cost += 3; }
          if(v.length > 1 && v[1] - v[0] < 5 && v[0] < 52) cost += 5;
          if(cost < bc){ bc = cost; best = v; } }
        if(best) return best; }
      throw Error(`${C.id} 排不出和弦 ${c.name}`); };
    let prev = null; for(const c of P) prev = pick(c, prev);
    return P.map(c => prev = pick(c, prev)); })();
  const voiceAt = (P, b, opt) => lead(P, opt)[P.indexOf(at(P, b))];
  const inWin = (pc, lo = 40, hi = 51) => { for(let m = lo; m <= hi; m++) if(m % 12 === pc) return m; };

  /* ---------- 旋律 ---------- */
  /** 強拍落和弦音、弱拍走音階（避開衝突的音），contour 決定整句的起伏（單位：音階級數） */
  const melody = (P, bars, rhy, form, {center = 4, range = 3, contour = u => Math.sin(u * Math.PI), lo = -2, hi = 10, land = true} = {}) => {
    const out = []; let prev = Math.round(center), prev2 = null;
    for(let k = 0; k < bars; k++) rhy[form[k % form.length]].forEach(([o, len], j) => {
      const b = k * 4 + o, c0 = at(P, b), c1 = at(P, b + len * 0.9), u = b / (bars * 4);
      const want = center + contour(u) * range, strong = j === 0 || (o % 1 === 0 && (o % 2 === 0 || len >= 1)) || len >= 1.5;
      let cand = [];
      for(let d = lo; d <= hi; d++){ const pc = pcOf(d);
        if(strong ? c0.pcs.has(pc) && !clash(pc, c1) : Math.abs(d - prev) <= 2 && d !== prev && !clash(pc, c0) && (len < 0.75 || !clash(pc, c1))) cand.push(d); }
      if(!cand.length) for(let d = lo; d <= hi; d++) if(c0.pcs.has(pcOf(d))) cand.push(d);
      const goal = strong ? want * 0.6 + prev * 0.4 : want;
      const cost = d => Math.abs(d - goal) + (d === prev2 ? 1.4 : 0) + (d === prev ? 0.9 : 0) + Math.max(0, Math.abs(d - prev) - 3) * 0.8 + R() * 0.35;
      cand.sort((a, c) => cost(a) - cost(c));
      const d = cand[0]; prev2 = prev; prev = d; out.push([b, len, d]); });
    if(land && out.length){ const L = out[out.length - 1], c = at(P, L[0]); let best = L[2], bc = 1e9;
      for(let d = lo; d <= hi; d++){ const pc = pcOf(d); if(!c.pcs.has(pc)) continue; const cc = Math.abs(d - L[2]) + (pc === c.root ? 0 : 0.8); if(cc < bc){ bc = cc; best = d; } }
      L[2] = best; }
    return out; };
  /** 只用安全音的短句：長音、正拍用安全音，短的經過音走音階 */
  const safeLine = (cells, {lo = 2, hi = 11, contour = u => Math.sin(u * Math.PI), center = 7, range = 3, total = 8} = {}) => {
    const SD = safeDegs(lo, hi), out = []; let prev = SD.reduce((a, d) => Math.abs(d - center) < Math.abs(a - center) ? d : a, SD[0]);
    cells.forEach(([b, len], j) => { const want = center + contour(b / total) * range, passing = len <= 0.5 && b % 1 !== 0;
      const cand = passing ? [prev - 1, prev + 1].filter(d => d >= lo && d <= hi) : SD.filter(d => d !== prev || j === 0);
      cand.sort((a, c) => Math.abs(a - want) - Math.abs(c - want) + (R() - 0.5) * 0.4);
      prev = cand[0] ?? prev; out.push([b, len, prev]); });
    const L = out[out.length - 1]; if(L && !safePc(pcOf(L[2]))) L[2] = SD.reduce((a, d) => Math.abs(d - L[2]) < Math.abs(a - L[2]) ? d : a, SD[0]);
    return out; };
  /** 安全音太少（少於 4 個）時，短句改成 4 小節、跟著和弦走：把 2 小節的節奏重複兩次 */
  const FEW = safeDegs(0, NS - 1).length < 4;
  const follow = (cells, m) => { const two = [cells.filter(([b]) => b < 4), cells.filter(([b]) => b >= 4).map(([b, l]) => [b - 4, l])];
    return melody(PROG, 4, two, [0, 1, 0, 1], {center:m.center, range:2, contour:u => m.contour(u * 2 % 1)}); };
  const toMidi = list => list.map(([b, l, d, w]) => [b, l, deg(d), w]);

  /* ---------- 低音 ---------- */
  const HSTEP = (m, dir) => { const i = HE.indexOf(m); return i < 0 ? m + dir : HE[i + dir]; };
  /** r 根音、5 五度、3 三度、o 高八度、a 往下一個和弦的經過音 */
  const bassNote = (P, b, kind) => { const c = at(P, b), r = inWin(c.bass);
    const up = s => { const pc = (c.root + s) % 12; return c.pcs.has(pc) ? r + ((pc - c.bass + 12) % 12) : null; };
    if(kind === 'o') return r + 12;
    if(kind === '5') return up(7) ?? up(8) ?? up(6) ?? r + 12;
    if(kind === '3') return up(4) ?? up(3) ?? up(5) ?? up(7) ?? r;
    if(kind === 'a'){ const nx = at(P, b + 1); const t = inWin(nx.bass); if(nx === c) return up(7) ?? r; return t > r ? HSTEP(t, -1) : HSTEP(t, 1); }
    return r; };

  /* ---------- 畫面物件 ---------- */
  const syn = (spec, more = {}) => { const [tone, env, extra = {}] = spec; return {tone, texture:'smooth', size:12, alpha:0.75, ...PDEF, ...envOf(env), ...extra, ...more}; };
  const pt = (B, b, m, w = 1) => ({x:+(b / B).toFixed(5), y:+midiToY(fit(m)).toFixed(5), w:+clamp(w, 0.05, 1).toFixed(3)});
  const note = (B, b, len, m, pr, w = 1) => ({type:'line', pts:[pt(B, b, m, w), pt(B, b + len, m, w * 0.9)], ...pr});
  const notes = (B, list, pr, gap = 0.9) => list.map(([b, len, m, w]) => note(B, b, len * gap, m, pr, w ?? 1));
  const phrase = (B, list, pr, wf = u => 0.6 + 0.4 * Math.sin(u * Math.PI), gap = 0.88) => {
    const pts = [], b0 = list[0][0], end = list[list.length - 1][0] + list[list.length - 1][1];
    list.forEach(([b, len, m]) => { const e = b + len * gap; pts.push(pt(B, b, m, wf((b - b0) / (end - b0))), pt(B, e, m, wf((e - b0) / (end - b0)))); });
    return {type:'line', pts, ...pr}; };
  const curve = (B, b0, b1, fn, pr, wf = () => 1) => { const pts = [], n = Math.max(12, Math.round((b1 - b0) * 10));
    for(let j = 0; j <= n; j++){ const u = j / n; pts.push({x:+((b0 + (b1 - b0) * u) / B).toFixed(5), y:+clamp(fn(u), MEL_TOP, MEL_BOT).toFixed(5), w:+wf(u).toFixed(3)}); }
    return {type:'line', pts, ...pr}; };
  /** 和弦物件：只有在「調內疊三度」剛好等於這個和弦時才用（□ 七和弦也一樣），否則改畫成一條條的音 */
  const chordObj = (B, b, len, c, pr) => withKey(HK.ownKey ? HK : null, () => { const y = +midiToY(inWin(c.root, 43, 54)).toFixed(5);
    for(const shape of ['sq', 'tri']){ const ns = chordNotes({y, shape}); if(ns.every(m => c.pcs.has(m % 12))) return {type:'chord', x:+(b / B).toFixed(5), y, len:+(len / B).toFixed(5), shape, ...pr}; }
    return null; });
  const voiced = (B, b, len, v, pr, w = 1) => v.map(m => note(B, b, len, m, pr, w));
  const drop = (B, b, lane, alpha, extra = {}) => ({type:'drop', x:+(b / B).toFixed(5), lane, alpha:clamp(alpha, 0.15, 1), ...PDEF, rev:0.1, ...(K.lane[lane] || {}), ...extra});
  /** 一小節的鼓型：{lane:[拍, 或 [拍, 力度倍率, 額外參數]]} */
  const bar = (pat, B, off, mul = 1, extra = {}) => Object.entries(pat).flatMap(([lane, beats]) => beats.map((h, j) => {
    const [b, m = 1, ex = {}] = Array.isArray(h) ? h : [h];
    return drop(B, off + b, lane, ALPHA[lane] * mul * m * (lane === 'hat' && !Array.isArray(h) ? (j % 2 ? 0.7 : 1) : 1),
      {...(lane.includes('hat') ? {pan:j % 2 ? 0.22 : -0.22} : {}), ...extra, ...ex}); }));

  /* ================= 每一種格子的做法 =================
     每個函式回傳 [格子設定, 物件]，o 是這一格的額外選項，tm 是音色，name 是名稱 */
  const ROLES = {
    /* ---- 節奏 ---- */
    groove:(o, tm, name) => [{name, mode:'loop', beats:8, vol:0.85}, [bar(K.drum, 8, 0), bar(K.drumB || K.drum, 8, 4)]],
    groove4:(o, tm, name) => [{name, mode:'loop', beats:16, vol:0.85}, [bar(K.drum, 16, 0), bar(K.drumB || K.drum, 16, 4), bar(K.drum, 16, 8),
      bar(K.drum, 16, 12).filter(d => d.x * 16 < 14), bar(K.fill, 16, 12, 0.85).filter(d => d.x * 16 >= 14), drop(16, 0, 'ohat', 0.55, {dec:2, rev:0.3})]],
    hats:(o, tm, name) => [{name, mode:'loop', beats:4, vol:0.7}, bar(K.hats, 4, 0)],
    perc:(o, tm, name) => [{name, mode:'loop', beats:8, vol:0.7}, [bar(K.perc, 8, 0, 0.8, {pan:-0.3}), bar(K.perc, 8, 4, 0.8, {pan:0.3})]],
    half:(o, tm, name) => [{name, mode:'loop', beats:8, vol:0.8}, [bar(K.half, 8, 0), bar(K.half2 || K.half, 8, 4)]],
    break:(o, tm, name) => [{name, mode:'loop', beats:8, vol:0.75}, [bar(K.brk, 8, 0, 0.9), bar(K.brk2 || K.brk, 8, 4, 0.9)]],
    build:(o, tm, name) => [{name, mode:'oneshot', beats:16, vol:0.8, align:'bar'}, [[[0, 1], [4, 0.5], [8, 0.25], [12, 0.125]].flatMap(([s, st]) =>
      Array.from({length:4 / st}, (_, j) => { const b = s + j * st, ln = K.buildLane || 'snare';
        return drop(16, b, ln, 0.3 + 0.6 * b / 16, {tune:((K.lane[ln] || {}).tune || 0) + b / 2, pan:0}); })),
      drop(16, 0, 'kick', 0.8)]],
    fill:(o, tm, name) => [{name, mode:'oneshot', beats:4, vol:0.8, align:'beat'}, bar(K.fill, 4, 0, 0.9)],
    impact:(o, tm, name) => [{name, mode:'oneshot', beats:4, vol:0.85, align:'off'}, [drop(4, 0, 'kick', 1, {dec:2.2, tune:-6}), drop(4, 0, 'tom', 0.85, {tune:-12, dec:2.5, rev:0.6}),
      drop(4, 0, 'ohat', 0.7, {dec:2.5, rev:0.7}), drop(4, 0, 'clap', 0.55, {dec:2, rev:0.8})]],
    ending:(o, tm, name) => [{name, mode:'oneshot', beats:4, vol:0.85, align:'beat'}, [drop(4, 0, 'kick', 0.9), drop(4, 0, 'snare', 0.7), drop(4, 0.75, 'kick', 0.8),
      drop(4, 0.75, 'snare', 0.7), drop(4, 1.5, 'kick', 1), drop(4, 1.5, 'ohat', 0.7, {dec:2.5, rev:0.5}), drop(4, 1.5, 'tom', 0.7, {tune:-8, dec:2})]],
    /** 自訂鼓型：o.bars 是每小節的鼓型 */
    beat:(o, tm, name) => { const B = o.bars.length * 4;
      return [{name, mode:o.mode || 'loop', beats:B, vol:o.vol ?? 0.8, align:o.align}, o.bars.map((p, k) => bar(p, B, k * 4, o.mul || 1, o.extra || {}))]; },

    /* ---- 和聲（全部跟著 4 小節進行） ---- */
    pad:(o, tm, name) => [{name, mode:'loop', beats:16, vol:o.vol ?? 0.55, ...HK}, PROG.map((c, i) => voiced(16, c.b0, c.len - 0.08, lead(PROG, o.v)[i], syn(tm), 0.85))],
    stabs:(o, tm, name) => [{name, mode:'loop', beats:16, vol:0.6, ...HK}, [0, 1, 2, 3].map(k => RH.stab.map(([s, l]) => { const b = k * 4 + s, c = ch(b);
      return chordObj(16, b, l, c, syn(tm)) || voiced(16, b, l, voiceAt(PROG, b, {n:3, lo:55, hi:74}), syn(tm)); }))],
    arp:(o, tm, name) => { const st = o.step || RH.arpStep || 0.5, pat = o.pat || [0, 1, 2, 3, 4, 3, 2, 1];
      return [{name, mode:'loop', beats:16, vol:0.55, ...HK}, notes(16, Array.from({length:16 / st}, (_, j) => { const b = j * st, v = voiceAt(PROG, b, o.v || {n:4, lo:55, hi:72});
        const ladder = [...v, v[0] + 12, v[1] + 12]; return [b, st, ladder[pat[j % pat.length]], j % Math.round(1 / st) === 0 ? 1 : 0.65]; }), syn(tm), 0.9)]; },
    comp:(o, tm, name) => [{name, mode:'loop', beats:16, vol:0.55, ...HK}, [0, 1, 2, 3].map(k => (o.rhy || RH.comp).map(([s, l]) => { const b = k * 4 + s;
      return voiced(16, b, l * 0.92, voiceAt(PROG, b, o.v || {n:4, lo:52, hi:72}), syn(tm), s % 1 ? 0.75 : 0.95); }))],
    /** 弦樂：上方聲部連成一條線（第二輪往上走），下方墊和弦 */
    strings8:(o, tm, name) => { const V4 = lead(PROG, {n:3, lo:53, hi:69}), line = [];
      for(let r = 0; r < 2; r++) PROG.forEach((c, i) => { const v = V4[i]; let top = v[v.length - 1];
        if(r === 1){ const up = c.tones.map(pc => inWin(pc, top + 1, top + 12)).filter(Boolean).sort((a, b) => a - b)[0]; if(up && up <= 81) top = up; }
        line.push([r * 16 + c.b0, c.len, top]); });
      return [{name, mode:'loop', beats:32, vol:0.55, ...HK}, [phrase(32, line, syn(tm)), [0, 16].map(r => PROG.map((c, i) => voiced(32, r + c.b0, c.len - 0.08, V4[i], syn(tm, {alpha:0.32, pan:-0.2}), 0.7)))]]; },
    choir:(o, tm, name) => [{name, mode:'loop', beats:16, vol:0.5, ...HK}, PROG.map((c, i) => voiced(16, c.b0, c.len - 0.1, lead(PROG, {n:3, lo:57, hi:76, top:72})[i], syn(tm), 0.8))],
    offbeat:(o, tm, name) => [{name, mode:'loop', beats:16, vol:0.5, ...HK}, [0, 1, 2, 3].map(k => (o.at || OFF8).map(s => { const b = k * 4 + s;
      return voiced(16, b, o.len || 0.32, voiceAt(PROG, b, {n:3, lo:58, hi:77, top:74}), syn(tm)); }))],
    alt:(o, tm, name) => [{name, mode:'loop', beats:16, vol:0.5, ...HK}, ALT.map((c, i) => voiced(16, c.b0, c.len - 0.08, lead(ALT, {n:4, lo:52, hi:72})[i], syn(tm), 0.85))],
    strum:(o, tm, name) => { const v = lead(PROG, {n:4, lo:55, hi:74})[0], all = [inWin(PROG[0].bass, 40, 51), ...v, v[1] + 12];
      return [{name, mode:'oneshot', beats:4, vol:0.62, ...HK}, all.map((m, j) => note(4, j * 0.06, 3.7 - j * 0.06, m, syn(tm, {pan:-0.3 + j * 0.1}), 1 - j * 0.05))]; },
    shimmer:(o, tm, name) => { const SD = safeDegs(NS + 1, NS * 2 + 1).slice(0, 3);
      return [{name, mode:'loop', beats:8, vol:0.45}, SD.map((d, j) => curve(8, j * 0.5, 8, () => midiToY(fit(deg(d))), syn(tm, {pan:[-0.4, 0.4, 0][j]}), u => 0.35 + 0.65 * Math.sin(u * Math.PI)))]; },

    /* ---- 旋律 ---- */
    themeA8:(o, tm, name) => { const m = THEME(); const half = m.findIndex(n => n[0] >= 16);
      return [{name, mode:'oneshot', beats:32, vol:0.68}, [phrase(32, toMidi(m.slice(0, half)), syn(tm)), phrase(32, toMidi(m.slice(half)), syn(tm))]]; },
    themeB:(o, tm, name) => [{name, mode:'oneshot', beats:16, vol:0.62}, notes(16, toMidi(melody(PROG, 4, RH.rhyB, [0, 1, 2, 3], {center:NS - 1, range:3, contour:u => 1 - 2 * Math.abs(u - 0.4), ...(o.m || {})})), syn(tm), 0.95)],
    hook:(o, tm, name) => FEW ? [{name, mode:'loop', beats:16, vol:0.55}, notes(16, toMidi(follow(o.rhy || RH.hook, {center:NS + 1, contour:u => Math.cos(u * Math.PI * 2), ...(o.m || {})})), syn(tm))]
      : [{name, mode:'loop', beats:8, vol:0.55}, notes(8, toMidi(safeLine(o.rhy || RH.hook, {center:NS + 1, contour:u => Math.cos(u * Math.PI * 2), ...(o.m || {})})), syn(tm))],
    counter:(o, tm, name) => [{name, mode:'loop', beats:16, vol:0.52}, [phrase(16, toMidi(melody(PROG, 4, [[[0, 2], [2, 2]], [[0, 4]], [[0, 3], [3, 1]]], [0, 1, 2, 1],
      {center:-1, range:2, lo:-NS + 1, hi:NS - 2, contour:u => -Math.sin(u * Math.PI * 2), ...(o.m || {})})), syn(tm))]],
    seq:(o, tm, name) => { const st = RH.seqStep || 0.25, sq = o.pat || [0, 2, 1, 3, 0, 2, 3, 2];
      return [{name, mode:'loop', beats:16, vol:0.48, ...HK}, notes(16, Array.from({length:16 / st}, (_, j) => { const b = j * st, v = voiceAt(PROG, b, {n:4, lo:62, hi:81, top:78});
        return [b, st, v[sq[j % sq.length]], j % 4 === 0 ? 1 : 0.6]; }), syn(tm), 0.8)]; },
    /** 快速樂句：16 分音符往上衝再落下，長音都是安全音 */
    run:(o, tm, name) => { const SD = safeDegs(2, NS * 2 + 2), a = SD[0], list = [];
      for(let j = 0; j < 8; j++) list.push([j * 0.25, 0.25, a + j]);
      const top = SD.filter(d => d >= a + 7)[0] ?? SD[SD.length - 1];
      list.push([2, 1, top]); for(let j = 0; j < 4; j++) list.push([3 + j * 0.25, 0.25, top - 1 - j]);
      const end = SD.filter(d => d <= top - 4).pop() ?? a; list.push([4, 3, end]);
      return [{name, mode:'oneshot', beats:8, vol:0.58, align:'beat'}, [phrase(8, toMidi(list), syn(tm), u => 0.65 + 0.35 * Math.sin(u * Math.PI))]]; },
    /** 主旋律和聲：每個音往下找最近的和弦音（至少差兩級），短音就直接低三度 */
    harmony8:(o, tm, name) => [{name, mode:'oneshot', beats:32, vol:0.48}, notes(32, toMidi(THEME().map(([b, l, d]) => { const c = ch(b);
      let h = d - 2; if(l >= 0.75){ for(let x = d - 2; x >= d - 4; x--) if(c.pcs.has(pcOf(x))){ h = x; break; } }
      return [b, l, clash(pcOf(h), c) ? d - 3 : h]; })), syn(tm), 0.95)],
    motif:(o, tm, name) => { const rhy = o.rhy || [[0, 0.75], [0.75, 0.75], [1.5, 1], [3, 0.5], [4, 0.75], [4.75, 0.75], [5.5, 1.5], [7, 1]], m = {center:NS + 2, contour:u => Math.cos(u * Math.PI * 2), ...(o.m || {})};
      return FEW ? [{name, mode:'loop', beats:16, vol:0.48}, notes(16, toMidi(follow(rhy, m)), syn(tm))] : [{name, mode:'loop', beats:8, vol:0.48}, notes(8, toMidi(safeLine(rhy, m)), syn(tm))]; },
    callResp:(o, tm, name) => [{name, mode:'oneshot', beats:16, vol:0.58}, melody(PROG, 4, RH.rhyA, [0, 3, 1, 3], {center:NS - 2, range:2, contour:u => Math.sin(u * Math.PI * 4), ...(o.m || {})})
      .map(([b, l, d]) => note(16, b, l * 0.9, deg(d), syn(tm[Math.floor(b / 4) % 2])))],
    glide:(o, tm, name) => [{name, mode:'oneshot', beats:16, vol:0.58}, [phrase(16, toMidi(melody(PROG, 4, [[[0, 3], [3, 1]], [[0, 4]], [[0, 2], [2, 2]]], [0, 1, 2, 1],
      {center:NS - 1, range:3, contour:u => Math.sin(u * Math.PI * 1.5), ...(o.m || {})})), syn(tm), u => 0.5 + 0.5 * Math.sin(u * Math.PI))]],

    /* ---- 低音與音效 ---- */
    bass:(o, tm, name) => [{name, mode:'loop', beats:16, vol:0.82, ...HK}, [0, 1, 2, 3].map(k => notes(16, (o.rhy || RH.bass).map(([s, l, kd]) => [k * 4 + s, l, bassNote(PROG, k * 4 + s, kd)]), syn(tm), 0.9))],
    bass2:(o, tm, name) => [{name, mode:'loop', beats:16, vol:0.78, ...HK}, [0, 1, 2, 3].map(k => notes(16, (o.rhy || RH.bassB).map(([s, l, kd]) => [k * 4 + s, l, bassNote(PROG, k * 4 + s, kd)]), syn(tm), 0.85))],
    sub:(o, tm, name) => [{name, mode:'loop', beats:16, vol:0.72, ...HK}, PROG.map(c => note(16, c.b0, c.len - 0.1, inWin(c.bass), syn(tm, {oct:-1})))],
    riser:(o, tm, name) => [{name, mode:'oneshot', beats:16, vol:0.58, align:'bar', ...CHROM}, [curve(16, 0, 16, u => MEL_BOT - 0.02 - u * u * 0.6, syn(tm), u => 0.25 + 0.75 * u)]],
    down:(o, tm, name) => [{name, mode:'oneshot', beats:4, vol:0.58, align:'off', ...CHROM}, [curve(4, 0, 3.2, u => 0.12 + Math.sqrt(u) * 0.58, syn(tm), u => 1 - u * 0.7)]],
    texture:(o, tm, name) => { const SD = safeDegs(NS, NS * 2);
      return [{name, mode:'loop', beats:16, vol:0.48}, [curve(16, 0, 9, u => midiToY(deg(SD[0])) + 0.005 * Math.sin(u * Math.PI * 3), syn(tm, {pan:-0.4}), u => 0.3 + 0.7 * Math.sin(u * Math.PI)),
        curve(16, 7, 16, u => midiToY(deg(SD[Math.min(2, SD.length - 1)])) + 0.005 * Math.sin(u * Math.PI * 2), syn(tm, {pan:0.4}), u => 0.3 + 0.7 * Math.sin(u * Math.PI))]]; },
    sweep:(o, tm, name) => [{name, mode:'oneshot', beats:8, vol:0.52, align:'off', ...CHROM}, [curve(8, 0, 8, u => 0.6 - Math.sin(u * Math.PI) * 0.45, syn(tm), u => 0.2 + 0.8 * Math.sin(u * Math.PI))]],
    stutter:(o, tm, name) => [{name, mode:'oneshot', beats:4, vol:0.55, align:'beat', ...HK}, voiced(4, 0, 3.6, lead(PROG, {n:4, lo:55, hi:74})[0], syn(tm))],
    /** 持續音：主音（不安全就改五度），再加五度或八度；只用安全音，疊在每個和弦上都不衝突 */
    drone:(o, tm, name) => { const ok = m => safePc(m % 12), a = ok(tonic) ? tonic : ok(tonic + 7) ? tonic - 5 : tonic, b = ok(a + 7) ? a + 7 : a + 12;
      return [{name, mode:'loop', beats:16, vol:0.48}, [note(16, 0, 16, a - 12, syn(tm), 0.8), note(16, 0, 16, b - 12, syn(tm, {alpha:0.35, pan:0.3}), 0.7)]]; },
    outro:(o, tm, name) => { const v = lead([FINAL], {n:5, lo:50, hi:79, top:76, spread:24})[0];
      return [{name, mode:'oneshot', beats:8, vol:0.62, ...HK}, [voiced(8, 0, 7.5, v, syn(tm), 0.9), note(8, 0, 7, inWin(FINAL.bass, 40, 51), syn(tm, {alpha:0.5}), 0.8)]]; },

    /* ---- 曲風專用 ---- */
    /** 手寫的音：o.notes = [[拍, 長度, 級數, 力度]] */
    notes:(o, tm, name) => [{name, mode:o.mode || 'loop', beats:o.beats, vol:o.vol ?? 0.55, align:o.align}, o.phrase ? [phrase(o.beats, toMidi(o.notes), syn(tm))] : notes(o.beats, toMidi(o.notes), syn(tm), o.gap ?? 0.9)],
    /** 有裝飾音的旋律（尺八、蘆笛、竹笛）：長音前面加一個從下方滑上來的倚音 */
    ornament:(o, tm, name) => { const bars = o.bars || 4, B = bars * 4;
      const m = o.theme ? THEME() : melody(PROG, bars, o.rhy || RH.rhyA, o.form || [0, 1, 2, 3], {center:NS - 1, range:3, contour:u => Math.sin(u * Math.PI * 1.3), ...(o.m || {})});
      const pts = []; const wf = u => 0.55 + 0.45 * Math.sin(u * Math.PI);
      m.forEach(([b, len, d]) => { const u = b / B;
        if(len >= 1 && b > 0){ pts.push(pt(B, b, deg(d - 1), wf(u) * 0.7), pt(B, b + 0.12, deg(d - 1), wf(u) * 0.8)); pts.push(pt(B, b + 0.2, deg(d), wf(u))); }
        else pts.push(pt(B, b, deg(d), wf(u)));
        pts.push(pt(B, b + len * 0.9, deg(d), wf((b + len * 0.9) / B))); });
      return [{name, mode:'oneshot', beats:B, vol:o.vol ?? 0.62}, [{type:'line', pts, ...syn(tm)}]]; },
    /** 輪指（卡農琴、曼陀林、三味線）：旋律的每個音拆成快速重複 */
    tremolo:(o, tm, name) => { const rate = o.rate || 0.25;
      const m = melody(PROG, 4, o.rhy || [[[0, 2], [2, 2]], [[0, 1], [1, 1], [2, 2]], [[0, 4]], [[0, 2], [2, 1], [3, 1]]], [0, 1, 2, 3], {center:NS + 1, range:2, ...(o.m || {})});
      return [{name, mode:'loop', beats:16, vol:o.vol ?? 0.5}, m.flatMap(([b, len, d]) => Array.from({length:Math.round(len / rate)}, (_, j) =>
        note(16, b + j * rate, rate * 0.8, deg(d), syn(tm), j % 2 ? 0.6 : 0.95)))]; },
    /** 甘美朗交織（kotekan）：兩個聲部輪流敲 16 分音符，合起來是一條連續的線 */
    kotekan:(o, tm, name) => { const pat = o.pat || [1, 0, 2, 1, 0, 2, 1, 2], sh = o.shift || 0, list = [[], []];
      for(let j = 0; j < 64; j++){ const b = j / 4, c = ch(b); const base = (() => { for(let d = sh + 2; d >= sh - 3; d--) if(c.pcs.has(pcOf(d))) return d; return sh; })();
        list[j % 2].push([b, 0.25, base + pat[j % pat.length], j % 4 === 0 ? 1 : 0.7]); }
      return [{name, mode:'loop', beats:16, vol:o.vol ?? 0.5}, [notes(16, toMidi(list[0]), syn(tm, {pan:-0.45}), 0.85), notes(16, toMidi(list[1]), syn(tm, {pan:0.45}), 0.85)]]; },
    /** 核心旋律（pokok）：每 o.step 拍一個和弦音 */
    pokok:(o, tm, name) => { const st = o.step || 1, list = melody(PROG, 4, [Array.from({length:4 / Math.min(st, 4)}, (_, j) => [j * st, st])], [0], {center:o.center ?? 2, range:2, lo:o.lo ?? -NS, hi:o.hi ?? NS + 2, contour:u => Math.sin(u * Math.PI * 2)});
      return [{name, mode:'loop', beats:16, vol:o.vol ?? 0.55}, notes(16, toMidi(list.map(([b, l, d]) => [b, l, d + (o.oct || 0) * NS])), syn(tm), 0.95)]; },
    /** 銅鑼週期：大鑼在週期開頭，小鑼在中間 */
    gong:(o, tm, name) => [{name, mode:'loop', beats:16, vol:0.7}, [note(16, 0, 8, tonic - 12, syn(tm, {r:3}), 1), note(16, 0, 6, tonic - 12, syn(['sub', 'soft', {size:14, alpha:0.7, a:0.02, r:2, rev:0.3}], {oct:-1}), 1),
      note(16, 8, 6, tonic - 12 + (E.includes(tonic + 7) ? 7 : 12), syn(tm, {alpha:0.55, r:2}), 0.8), [4, 12].map(b => note(16, b, 1.5, tonic, syn(tm, {alpha:0.4, size:20, r:0.8, pan:0.3}), 0.7))]],
    /** 克差（Kecak）：三組人聲「恰」互相交錯 */
    kecak:(o, tm, name) => { const grp = [[0, 0.75, 1.5, 2.25, 3], [0.25, 1, 1.75, 2.5, 3.25], [0.5, 1.25, 2, 2.75, 3.5, 3.75]];
      return [{name, mode:'loop', beats:4, vol:0.6}, grp.map((g, k) => g.map(b => note(4, b, 0.12, [tonic, tonic + 7, tonic + 12][k], syn(tm, {pan:[-0.4, 0.4, 0][k]}), k === 0 && b % 1 === 0 ? 1 : 0.7)))]; },
    /* 電玩音效 */
    coin:(o, tm, name) => [{name, mode:'oneshot', beats:1, vol:0.55, align:'off'}, [note(1, 0, 0.1, deg(NS + 2), syn(tm)), note(1, 0.1, 0.6, deg(NS + 5), syn(tm))]],
    jump:(o, tm, name) => [{name, mode:'oneshot', beats:1, vol:0.5, align:'off', ...CHROM}, [curve(1, 0, 0.45, u => 0.55 - Math.sqrt(u) * 0.3, syn(tm), u => 1 - u * 0.4)]],
    powerup:(o, tm, name) => [{name, mode:'oneshot', beats:2, vol:0.5, align:'beat'}, notes(2, Array.from({length:12}, (_, j) => [j / 6, 1 / 6, deg([0, 2, 4][j % 3] + NS * Math.floor(j / 3) - NS + 2), 0.6 + j * 0.03]), syn(tm), 0.85)],
    laser:(o, tm, name) => [{name, mode:'oneshot', beats:1, vol:0.5, align:'off', ...CHROM}, [curve(1, 0, 0.35, u => 0.12 + u * 0.45, syn(tm)), curve(1, 0.5, 0.85, u => 0.18 + u * 0.45, syn(tm))]],
    jingle:(o, tm, name) => { const v = lead([FINAL], {n:3, lo:60, hi:79})[0];
      return [{name, mode:'oneshot', beats:8, vol:0.55, align:'bar', ...HK}, [notes(8, [[0, 0.33, v[0]], [0.33, 0.33, v[1]], [0.67, 0.33, v[2]], [1, 0.5, v[0] + 12], [2, 0.33, v[1]], [2.33, 0.33, v[2]], [2.67, 0.33, v[0] + 12], [3, 1.5, v[1] + 12]], syn(tm)),
        voiced(8, 4, 3.5, v, syn(tm, {alpha:0.55}))]]; },
  };
  let _theme = null;
  const THEME = () => _theme ||= melody(PROG, 8, RH.rhyA, C.formA || [0, 1, 0, 2, 0, 1, 2, 3], {center:NS - 2, range:3, contour:u => Math.sin(u * Math.PI * 2) * 0.6 + Math.sin(u * Math.PI) * 0.6, ...(C.themeM || {})});

  /* ================= 組合 40 格 ================= */
  const pads = PAD_KEYS.map((_, i) => newPad(i));
  for(const key of PAD_KEYS){
    const ov = (C.pads || {})[key] || {}, role = ov.role || LAYOUT[key];
    if(!ROLES[role]) throw Error(`${C.id} ${key} 未知的格子類型 ${role}`);
    const opt = {...((C.O || {})[role] || {}), ...ov};
    const [props, objs] = ROLES[role](opt, ov.T || T[role] || T[LAYOUT[key]], ov.name || N[role] || N[LAYOUT[key]], key);   // 沒指定就沿用這個位置原本的音色
    const pad = pads[PAD_KEYS.indexOf(key)];
    Object.assign(pad, props, {objects:[objs].flat(9).filter(Boolean).map(normalizeObj)});
    if(ov.vol != null) pad.vol = ov.vol;
    if(!pad.align) pad.align = 'global';
  }
  const progText = P => P.map(c => c.name).join(' – ');
  return {board:{format:'inksynth-board', version:2, id:C.id, name:C.name, desc:C.desc, bpm:C.bpm, root:C.root, scale:C.scale, quant:'bar', pads},
    info:{prog:progText(PROG), alt:ALT ? progText(ALT) : '', safe:[...new Set(safeDegs(0, NS - 1).map(d => NAMES[pcOf(d)]))].join(' '), PROG}};
}

/* ================= 衝突檢查 =================
   假設所有循環同時從第一拍開始播，每 1/4 拍取樣一次；
   一個音不是當下的和弦音、又剛好比別格的音高半音（爵士理論的「避免音」），就算一次衝突。 */
function audit(board, PROG){
  Object.assign(S, {root:board.root, scale:board.scale}); resetScaleCache();
  const loops = board.pads.filter(p => p.mode === 'loop' && p.objects.some(o => o.type !== 'drop'));
  const at = b => { const x = b % 16; return PROG.find(c => x >= c.b0 && x < c.b0 + c.len) || PROG[0]; };
  const bad = {}; let total = 0;
  for(let t = 0; t < 32; t += 0.25){
    const c = at(t), sound = [];
    for(const p of loops){ const u = (t % p.beats) / p.beats;
      withKey(p, () => { for(const o of p.objects){
        if(o.type === 'line'){ const y = lineYAt(o, u); if(y != null) sound.push([p.name, quant(y) + (o.oct || 0) * 12]); }
        else if(o.type === 'chord' && u >= o.x && u < o.x + o.len) chordNotes(o).forEach(m => sound.push([p.name, m]));
      } }); }
    for(const [pa, m] of sound){ if(c.pcs.has(m % 12)) continue;
      for(const [pb, n] of sound){
        if(pb !== pa && ((m - n) % 12 + 12) % 12 === 1){ const k = pa + ' × ' + pb; bad[k] = (bad[k] || 0) + 1; total++; break; } } }
  }
  return {total, top:Object.entries(bad).sort((a, b) => b[1] - a[1]).slice(0, 4)};
}

/* ================= 各範本設定 ================= */
const STYLES = /*STYLES*/ {};

const out = {};
for(const id in STYLES){ if(ONLY.length && !ONLY.includes(id)) continue;
  const r = build({...STYLES[id], id}); r.audit = audit(r.board, r.info.PROG); delete r.info.PROG; out[id] = r; }
return out;
}

/* ================= 執行 ================= */
const round4 = (k, v) => typeof v === 'number' && !Number.isInteger(v) ? +v.toFixed(4) : v;
const sandbox = {document:{currentScript:null, querySelector:() => null, querySelectorAll:() => []}, console, Math, JSON};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/core.js'), 'utf8'), sandbox);
const src = GEN.toString().replace('/*STYLES*/ {}', fs.readFileSync(path.join(__dirname, 'template-styles.js'), 'utf8').replace(/^[\s\S]*?\/\*BEGIN\*\//, '').replace(/\/\*END\*\/[\s\S]*$/, ''));
const result = vm.runInContext(`(${src})(${JSON.stringify(process.argv.slice(2))})`, sandbox);
for(const [id, {board, info, audit}] of Object.entries(result)){
  let seed = board.bpm * 7919 + board.root;   // 種子固定，重新產生時結果不變
  board.pads.forEach(p => p.objects.forEach(o => { o.seed = (seed = (seed * 1103515245 + 12345) >>> 0) % 1e9; }));
  const file = path.join(ROOT, `templates/${id}.js`);
  fs.writeFileSync(file, `/* InkSynth 範本：${board.name}（${board.desc}）
   這是一般的 JSON 資料，外面包一層 InkTemplates.add(...) 讓瀏覽器在本機（file://）也能載入。
   由 tools/build-templates.js 產生。 */
InkTemplates.add(${JSON.stringify(board, round4)});
`);
  const len = {}; board.pads.forEach(p => len[p.beats / 4] = (len[p.beats / 4] || 0) + 1);
  const empty = board.pads.filter(p => !p.objects.length).map(p => p.key);
  console.log(`\n${id.padEnd(10)} ${board.name}  ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
  console.log(`  進行：${info.prog}${info.alt ? `\n  第二：${info.alt}` : ''}\n  安全音：${info.safe}`);
  console.log(`  長度（小節:格數）：${Object.entries(len).sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}:${v}`).join('  ')}`);
  console.log(`  衝突取樣：${audit.total}${audit.top.length ? '  ' + audit.top.map(([k, v]) => `${k}(${v})`).join('、') : ''}`);
  if(empty.length) console.log('  空白格：', empty);
}
