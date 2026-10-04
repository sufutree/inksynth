'use strict';
/* ============================================================
   audio.js — 合成引擎：多種音色、6 種鼓、ADSR、濾波、效果、播放管理
   ============================================================ */
let ctx = null, master, revIn, dlyIn, delayNode, noiseBuf, crackleBuf, SAT, PW25, ORGAN;
const LOOSE = {srcs:[], out:null};   // 試聽用的零散音源

function curve(k){ const n = 2048, c = new Float32Array(n);
  for(let i = 0; i < n; i++){ const x = i * 2 / n - 1; c[i] = (1 + k) * x / (1 + k * Math.abs(x)); } return c; }
const _drive = {};
const driveCurve = d => { const k = Math.round(d * 20); return _drive[k] || (_drive[k] = curve(1 + k * k * 0.5)); };

function initAudio(){
  if(ctx){ if(ctx.state !== 'running') ctx.resume(); return; }
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.connect(ctx.destination);
  master = ctx.createGain(); master.gain.value = 0.75; master.connect(comp);

  // 殘響：用衰減噪音產生 impulse response
  const conv = ctx.createConvolver(), len = ctx.sampleRate * 2.8, ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for(let ch = 0; ch < 2; ch++){ const d = ir.getChannelData(ch); for(let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
  conv.buffer = ir; revIn = ctx.createGain(); const revOut = ctx.createGain(); revOut.gain.value = 0.55;
  revIn.connect(conv); conv.connect(revOut); revOut.connect(comp);

  // 延遲：附點八分音符
  dlyIn = ctx.createGain(); delayNode = ctx.createDelay(2);
  const fb = ctx.createGain(), dl = ctx.createBiquadFilter(), dw = ctx.createGain();
  fb.gain.value = 0.38; dl.type = 'lowpass'; dl.frequency.value = 3000; dw.gain.value = 0.6;
  dlyIn.connect(delayNode); delayNode.connect(dl); dl.connect(fb); fb.connect(delayNode); dl.connect(dw); dw.connect(comp);
  updateDelayTime();

  SAT = curve(4);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  { const d = noiseBuf.getChannelData(0); for(let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  crackleBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  { const d = crackleBuf.getChannelData(0); let pop = 0;
    for(let i = 0; i < d.length; i++){
      if(Math.random() < 0.0007) pop = (Math.random() < .5 ? -1 : 1) * (0.3 + Math.random() * 0.7);
      d[i] = (Math.random() * 2 - 1) * 0.035 + pop; pop *= 0.82;
    } }
  // 25% 脈衝波
  { const N = 64, re = new Float32Array(N), im = new Float32Array(N);
    for(let n = 1; n < N; n++) re[n] = 2 / (n * Math.PI) * Math.sin(n * Math.PI * 0.25);
    PW25 = ctx.createPeriodicWave(re, im); }
  // 風琴：拉桿式泛音
  { const N = 24, re = new Float32Array(N), im = new Float32Array(N);
    [[1,1],[2,.75],[3,.5],[4,.45],[6,.3],[8,.25],[10,.12],[12,.1],[16,.06]].forEach(([h, a]) => im[h] = a);
    ORGAN = ctx.createPeriodicWave(re, im); }
  LOOSE.out = {dry:master, rev:revIn, dly:dlyIn};
}
function updateDelayTime(){ if(delayNode) delayNode.delayTime.value = 60 / S.bpm * 0.75; }
const outLat = () => ctx ? (ctx.outputLatency || ctx.baseLatency || 0) : 0;
function reg(v, s, end){ v.srcs.push({s, end}); }

const LVL = {sine:.42, triangle:.44, sawtooth:.32, square:.24, pulse:.28, supersaw:.30, organ:.26, bell:.34,
             pluck:.46, wind:.85, sub:.40, choir:.30};
const dynGain = w => Math.max(0.06, Math.pow(w, 1.4));

/** 共用訊號鏈：濾波 → 失真 → 顆粒 → ADSR → 力度 → 斷續 → 聲像 → (乾聲 / 殘響 / 延遲) */
function makeChain(o, ts, te, v, lvl, cutoff){
  const A = Math.max(0.002, o.a), Dd = Math.max(0.01, o.d), Rr = Math.max(0.01, o.r), end = te + Rr;
  const input = ctx.createGain(), lp = ctx.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = cutoff; lp.Q.value = o.q;
  input.connect(lp); let node = lp;
  if(o.fenv > 0.005){ lp.detune.setValueAtTime(o.fenv * 4800, ts); lp.detune.setTargetAtTime(0, ts, Math.max(0.02, Dd / 3)); }
  if(o.drive > 0.01){ const ws = ctx.createWaveShaper(); ws.curve = driveCurve(o.drive); ws.oversample = '2x';
    const comp = ctx.createGain(); comp.gain.value = 1 / (1 + o.drive * 0.6); node.connect(ws); ws.connect(comp); node = comp; }
  if(o.texture === 'grain'){ const sh = ctx.createWaveShaper(); sh.curve = SAT; node.connect(sh); node = sh; }
  const env = ctx.createGain(), g = env.gain; node.connect(env);
  g.setValueAtTime(0, ts);
  if(te <= ts + A){ g.linearRampToValueAtTime(lvl * (te - ts) / A, te); g.linearRampToValueAtTime(0, end); }
  else {
    g.linearRampToValueAtTime(lvl, ts + A);
    const tD = Math.min(ts + A + Dd, te), vD = lvl + (lvl * o.s - lvl) * ((tD - ts - A) / Dd);
    g.linearRampToValueAtTime(vD, tD); if(te > tD) g.setValueAtTime(vD, te); g.linearRampToValueAtTime(0, end);
  }
  if(o.texture === 'grain'){
    const cs = ctx.createBufferSource(), cg = ctx.createGain(); cs.buffer = crackleBuf; cs.loop = true; cg.gain.value = 0.5 * lvl / 0.2;
    cs.connect(cg); cg.connect(env); cs.start(ts, Math.random() * 1.5); cs.stop(end); reg(v, cs, end);
  }
  const dyn = ctx.createGain(); env.connect(dyn); let tail = dyn;
  if(o.texture === 'dash'){
    const tr = ctx.createGain(), l = ctx.createOscillator(), lg = ctx.createGain();
    tr.gain.value = 0.5; l.type = 'square'; l.frequency.value = S.bpm / 60 * 4; lg.gain.value = 0.5;
    l.connect(lg); lg.connect(tr.gain); dyn.connect(tr); tail = tr; l.start(ts); l.stop(end); reg(v, l, end);
  }
  let out = tail;
  if(ctx.createStereoPanner){ const pn = ctx.createStereoPanner(); pn.pan.value = o.pan; tail.connect(pn); out = pn; }
  out.connect(v.out.dry);
  const rv = Math.min(1, o.rev + (o.texture === 'mist' ? 0.55 : 0));
  if(rv > 0.01){ const sg = ctx.createGain(); sg.gain.value = rv; out.connect(sg); sg.connect(v.out.rev); }
  if(o.dly > 0.01){ const sg = ctx.createGain(); sg.gain.value = o.dly; out.connect(sg); sg.connect(v.out.dly); }
  return {input, lp, dyn, end};
}

/** 建立音色本體。回傳 F（頻率參數與倍率）、D（detune 參數，給顫音用）、N（換音時觸發的函式） */
function buildTone(tone, o, f0, ts, end, dest, v){
  const F = [], D = [], N = [], u = o.uni;
  const osc = (type, r, det = 0, gain = 1, to = dest) => {
    const x = ctx.createOscillator();
    if(typeof type === 'string') x.type = type; else x.setPeriodicWave(type);
    x.frequency.value = f0 * r; x.detune.value = det;
    if(gain !== 1){ const gg = ctx.createGain(); gg.gain.value = gain; x.connect(gg); gg.connect(to); } else x.connect(to);
    F.push({p:x.frequency, r}); D.push(x.detune); x.start(ts); x.stop(end); reg(v, x, end); return x;
  };
  switch(tone){
    case 'sine': osc('sine', 1); break;
    case 'triangle': osc('triangle', 1); osc('sine', 2, 0, 0.12); break;
    case 'sawtooth': osc('sawtooth', 1, -u / 2); osc('sawtooth', 1, u / 2); break;
    case 'square': osc('square', 1, -u / 4, 0.8); osc('square', 1, u / 4, 0.8); break;
    case 'pulse': osc(PW25, 1, -u / 4); osc(PW25, 1, u / 4); break;
    case 'supersaw': for(let i = 0; i < 7; i++) osc('sawtooth', 1, (i - 3) / 3 * u * 1.6, 0.5); break;
    case 'organ': osc(ORGAN, 1, -u / 6); osc(ORGAN, 1, u / 6); break;
    case 'bell': {
      const c = osc('sine', 1), m = ctx.createOscillator(), mg = ctx.createGain();
      m.frequency.value = f0 * 3.5; m.connect(mg); mg.connect(c.frequency);
      const hit = t => { mg.gain.setValueAtTime(f0 * 2.4, t); mg.gain.setTargetAtTime(f0 * 0.2, t, 0.35); };
      hit(ts); N.push(hit); F.push({p:m.frequency, r:3.5}); D.push(m.detune); m.start(ts); m.stop(end); reg(v, m, end);
      break;
    }
    case 'pluck': {
      const pk = ctx.createGain(); pk.connect(dest);
      osc('sawtooth', 1, -u / 3, 1, pk); osc('triangle', 2, u / 3, 0.4, pk);
      const hit = t => { pk.gain.setValueAtTime(1, t); pk.gain.setTargetAtTime(0.04, t, 0.17); };
      hit(ts); N.push(hit); break;
    }
    case 'wind': {
      const s = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), gg = ctx.createGain();
      s.buffer = noiseBuf; s.loop = true; bp.type = 'bandpass'; bp.frequency.value = f0; bp.Q.value = 8 + o.q * 2; gg.gain.value = 4;
      s.connect(bp); bp.connect(gg); gg.connect(dest); F.push({p:bp.frequency, r:1}); D.push(bp.detune);
      s.start(ts, Math.random()); s.stop(end); reg(v, s, end); break;
    }
    case 'sub': osc('sine', 1); osc('sine', 0.5, 0, 0.8); osc('triangle', 1, 0, 0.2); break;
    case 'choir': {
      const mix = ctx.createGain();
      for(const [fq, q, gn] of [[730, 7, 1], [1090, 8, 0.55], [2440, 9, 0.3]]){
        const bp = ctx.createBiquadFilter(), gg = ctx.createGain(); bp.type = 'bandpass'; bp.frequency.value = fq; bp.Q.value = q;
        gg.gain.value = gn * 2.6; mix.connect(bp); bp.connect(gg); gg.connect(dest);
      }
      osc('sawtooth', 1, -u, 1, mix); osc('sawtooth', 1, 0, 1, mix); osc('sawtooth', 1, u, 1, mix);
      break;
    }
  }
  return {F, D, N};
}
function addVibrato(o, T, ts, end, span, v){
  const depth = o.texture === 'wave' ? Math.max(o.lfoD, 30) : o.lfoD;
  if(depth < 0.5 || !T.D.length) return;
  const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = o.lfoR;
  lg.gain.setValueAtTime(0, ts); lg.gain.linearRampToValueAtTime(depth, ts + Math.min(0.4, Math.max(0.01, span)));
  lfo.connect(lg); T.D.forEach(d => lg.connect(d)); lfo.start(ts); lfo.stop(end); reg(v, lfo, end);
}

function scheduleLine(o, t0, dur, v){
  const P = o.pts; if(P.length < 2) return;
  const ts = t0 + P[0].x * dur, te = t0 + P[P.length - 1].x * dur; if(te - ts < 0.015) return;
  const oct = o.oct * 12, C = cutoffOf(o.size);
  const ch = makeChain(o, ts, te, v, LVL[o.tone] * (0.15 + o.alpha * 0.85), C);
  const T = buildTone(o.tone, o, mtof(quant(P[0].y) + oct), ts, ch.end + 0.05, ch.input, v);
  let last = null, lt = -1;
  for(let i = 0; i < P.length; i++){
    const p = P[i], t = t0 + p.x * dur, m = quant(p.y) + oct;
    if(m !== last){
      const f = mtof(m);
      for(const {p:pp, r} of T.F){ if(last === null || o.glide < 0.003) pp.setValueAtTime(f * r, t); else pp.setTargetAtTime(f * r, t, o.glide / 3); }
      if(last !== null) T.N.forEach(fn => fn(t));
      last = m;
    }
    // 筆觸力度 → 音量與亮度
    const w = p.w ?? 1;
    if(i === 0){ ch.dyn.gain.setValueAtTime(dynGain(w), t); ch.lp.frequency.setValueAtTime(C * (0.55 + 0.45 * w), t); lt = t; }
    else if(t - lt >= 0.025 || i === P.length - 1){ ch.dyn.gain.linearRampToValueAtTime(dynGain(w), t); ch.lp.frequency.linearRampToValueAtTime(C * (0.55 + 0.45 * w), t); lt = t; }
  }
  addVibrato(o, T, ts, ch.end, te - ts, v);
}
function scheduleChord(o, ts, len, v){
  const notes = chordNotes(o); notes.unshift(quant(o.y) - 12);
  const te = ts + len, oct = o.oct * 12;
  const ch = makeChain(o, ts, te, v, LVL[o.tone] * 1.1 * (0.15 + o.alpha * 0.85) / Math.sqrt(notes.length), cutoffOf(o.size));
  for(const m of notes){
    const T = buildTone(o.tone, o, mtof(m + oct), ts, ch.end + 0.05, ch.input, v);
    T.D.forEach(d => d.value += (Math.random() - 0.5) * 8);
    addVibrato(o, T, ts, ch.end, len, v);
  }
}
function playDrum(o, t, v){
  const vv = 0.35 + o.alpha * 0.65, tr = Math.pow(2, (o.tune || 0) / 12), dk = o.dec || 1;
  const bus = ctx.createGain(); let out = bus;
  if(ctx.createStereoPanner){ const pn = ctx.createStereoPanner(); pn.pan.value = o.pan || 0; bus.connect(pn); out = pn; }
  out.connect(v.out.dry);
  if(o.rev > 0.01){ const sg = ctx.createGain(); sg.gain.value = o.rev; out.connect(sg); sg.connect(v.out.rev); }
  const env = (peak, dec, at = t) => { const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, at + dec); g.connect(bus); return g; };
  const noise = (dec, type, f, peak, at = t, q = 1) => { const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter();
    s.buffer = noiseBuf; fl.type = type; fl.frequency.value = f; fl.Q.value = q; s.connect(fl); fl.connect(env(peak, dec, at));
    s.start(at, Math.random() * 1.5); s.stop(at + dec + 0.02); reg(v, s, at + dec); };
  const tone = (type, f1, f2, sweep, peak, dec) => { const x = ctx.createOscillator(); x.type = type;
    x.frequency.setValueAtTime(f1, t); x.frequency.exponentialRampToValueAtTime(f2, t + sweep);
    x.connect(env(peak, dec)); x.start(t); x.stop(t + dec + 0.03); reg(v, x, t + dec); };
  switch(o.lane){
    case 'kick':  tone('sine', 165 * tr, 42 * tr, 0.14, 1.0 * vv, 0.42 * dk); noise(0.012, 'highpass', 3000, 0.25 * vv); break;
    case 'snare': noise(0.2 * dk, 'highpass', 1300 * tr, 0.5 * vv); tone('triangle', 200 * tr, 150 * tr, 0.1, 0.38 * vv, 0.12 * dk); break;
    case 'clap':  [0, 0.011, 0.022].forEach(k => noise(0.018, 'bandpass', 1400 * tr, 0.55 * vv, t + k, 2));
                  noise(0.2 * dk, 'bandpass', 1200 * tr, 0.4 * vv, t + 0.03, 1.5); break;
    case 'hat':   noise(0.055 * dk, 'highpass', 7500 * tr, 0.24 * vv); break;
    case 'ohat':  noise(0.4 * dk, 'highpass', 6500 * tr, 0.18 * vv); break;
    case 'tom':   tone('sine', 190 * tr, 95 * tr, 0.3, 0.8 * vv, 0.4 * dk); noise(0.02, 'bandpass', 2000, 0.1 * vv); break;
  }
}
function scheduleObj(o, t0, dur, v){
  if(o.type === 'line') scheduleLine(o, t0, dur, v);
  else if(o.type === 'drop') playDrum(o, t0 + o.x * dur, v);
  else scheduleChord(o, t0 + o.x * dur, o.len * dur, v);
}
/** 單獨試聽一個物件：從它的起點開始播 */
function auditionObj(o, pad){
  initAudio(); const dur = padDur(pad), start = o.type === 'line' ? o.pts[0].x : o.x;
  withKey(pad, () => scheduleObj(o, ctx.currentTime + 0.02 - start * dur, dur, LOOSE));
}

/* ============ 音效板播放 ============
   每個 voice 對應一格（或音色庫試聽），每一圈循環是一個 pass，
   這樣「播完這一圈再停」時可以把已經排好的下一圈整個取消。 */
const voices = new Map();
function makeOut(vol, parent){
  const o = {dry:ctx.createGain(), rev:ctx.createGain(), dly:ctx.createGain()};
  for(const k in o) o[k].gain.value = vol;
  if(parent){ o.dry.connect(parent.dry); o.rev.connect(parent.rev); o.dly.connect(parent.dly); }
  else { o.dry.connect(master); o.rev.connect(revIn); o.dly.connect(dlyIn); }
  return o;
}
const disconnectOut = o => { for(const k in o) o[k].disconnect(); };
/** align：音效格自己的啟動對齊，'global' 或沒有就跟隨上方的設定 */
function launchTime(immediate, align){
  const now = ctx.currentTime + 0.02, q = !align || align === 'global' ? S.quant : align;
  if(immediate || q === 'off') return now;
  const grid = 60 / S.bpm * (q === 'bar' ? 4 : 1);
  return Math.ceil(now / grid - 1e-6) * grid;
}
function schedulePass(p, v, t0){
  const now = ctx.currentTime;
  v.passes = v.passes.filter(ps => { if(ps.t0 + v.dur + 4 < now){ disconnectOut(ps.out); return false; } return true; });
  const ps = {t0, srcs:[], out:makeOut(1, v.out)};
  v.passes.push(ps);
  withKey(p, () => { for(const o of p.objects) scheduleObj(o, t0, v.dur, ps); });
}
function silencePass(ps, fade){
  const now = ctx.currentTime;
  for(const k in ps.out){ const gp = ps.out[k].gain; gp.cancelScheduledValues(now); gp.setValueAtTime(gp.value, now); gp.linearRampToValueAtTime(0, now + fade); }
  for(const x of ps.srcs){ try{ x.s.stop(now + fade + 0.03); }catch(e){} }
  setTimeout(() => disconnectOut(ps.out), (fade + 0.3) * 1000);
}
/** id：音效板的格子編號，或音色庫試聽用的字串 */
function startVoice(id, p, opt = {}){
  if(!p || !p.objects.length) return false;
  initAudio(); stopPad(id, 0.02);
  const t0 = launchTime(opt.immediate, p.align), dur = padDur(p), loop = opt.loop ?? p.mode !== 'oneshot';
  const v = {pad:p, out:makeOut(p.vol), passes:[], t0, upto:t0, dur, loop, endAt:loop ? Infinity : t0 + dur, stopping:false, preview:!!opt.preview};
  voices.set(id, v); schedulePass(p, v, t0); onVoiceChange(id);
  return true;
}
const startPad = (i, opt) => startVoice(i, S.pads[i], opt);
/** 立即停止 */
function stopPad(id, fade = 0.05){
  const v = voices.get(id); if(!v) return; voices.delete(id);
  const now = ctx.currentTime;
  for(const k in v.out){ const gp = v.out[k].gain; gp.cancelScheduledValues(now); gp.setValueAtTime(gp.value, now); gp.linearRampToValueAtTime(0, now + fade); }
  for(const ps of v.passes) for(const x of ps.srcs){ try{ x.s.stop(now + fade + 0.03); }catch(e){} }
  setTimeout(() => { for(const ps of v.passes) disconnectOut(ps.out); disconnectOut(v.out); }, (fade + 0.3) * 1000);
  onVoiceChange(id);
}
/** 播完目前這一圈再停 */
function stopAtCycleEnd(id){
  const v = voices.get(id); if(!v) return;
  const now = ctx.currentTime;
  if(now < v.t0){ stopPad(id, 0.02); return; }          // 還在等對拍 → 直接取消
  const end = v.t0 + (Math.floor((now - v.t0) / v.dur) + 1) * v.dur;
  v.passes = v.passes.filter(ps => { if(ps.t0 >= end - 1e-6){ silencePass(ps, 0.01); return false; } return true; });
  Object.assign(v, {loop:false, stopping:true, endAt:end, upto:end - v.dur});
  onVoiceChange(id);
}
/** 在「準備停止」期間再按一次 → 繼續循環 */
function resumeLoop(id){
  const v = voices.get(id); if(!v || !v.stopping) return false;
  if(ctx.currentTime > v.endAt - 0.05) return false;     // 已經來不及接上
  Object.assign(v, {loop:true, stopping:false, endAt:Infinity}); onVoiceChange(id);
  return true;
}
function setPadVolume(i, vol){ const v = voices.get(i); if(v) for(const k in v.out) v.out[k].gain.setTargetAtTime(vol, ctx.currentTime, 0.02); }
function stopAll(){ for(const id of [...voices.keys()]) stopPad(id, 0.08); }
setInterval(() => {
  if(!ctx) return; const now = ctx.currentTime;
  for(const [id, v] of voices){
    if(v.loop){ if(now > v.upto + v.dur - 0.4){ v.upto += v.dur; schedulePass(v.pad, v, v.upto); } }
    else if(now > v.endAt + 3){ for(const ps of v.passes) disconnectOut(ps.out); disconnectOut(v.out); voices.delete(id); onVoiceChange(id); }
  }
  LOOSE.srcs = LOOSE.srcs.filter(x => x.end > now);
}, 50);
/** 回傳 {state:'armed'|'playing'|null, prog, el, stopping} */
function padState(id){
  const v = voices.get(id); if(!v || !ctx) return {state:null};
  const t = ctx.currentTime - outLat(), el = t - v.t0;
  if(el < 0) return {state:'armed'};
  if(t > v.endAt) return {state:null};
  return {state:'playing', prog:(el % v.dur) / v.dur, el, stopping:v.stopping};
}
/** 演奏模式的觸發：單次＝從頭播一次；循環＝再按一次就播完這圈停止。shift = 立即停止 */
function trigger(i, shift = false){
  const p = S.pads[i], v = voices.get(i), st = padState(i).state;
  if(shift){ if(v) stopPad(i, 0.03); return; }
  if(!p.objects.length){ toast(`「${keyLabel(p.key)}」是空白的，切到 ✎ 編輯 來畫`); return; }
  if(v && st && v.stopping && resumeLoop(i)) return;
  if(p.mode === 'loop' && v && st){ stopAtCycleEnd(i); return; }
  startPad(i); flashPad(i);
}

/* ============ 作畫時的即時試聽 ============ */
let pv = null;
function previewStart(b, m, w){
  initAudio();
  const t = ctx.currentTime, V = {srcs:[]}, lp = ctx.createBiquadFilter(), g = ctx.createGain();
  lp.type = 'lowpass'; lp.frequency.value = cutoffOf(b.size); lp.Q.value = b.q;
  const lvl = LVL[b.tone] * (0.2 + b.alpha * 0.8) * 0.85;
  const T = buildTone(b.tone, b, mtof(m + b.oct * 12), t, t + 600, lp, V);
  lp.connect(g); g.connect(master);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(lvl * dynGain(w), t + Math.min(0.25, b.a + 0.005));
  addVibrato(b, T, t, t + 600, 1, V);
  pv = {T, g, m, V, lvl, b};
}
function previewMove(m, w){
  if(!pv) return; const t = ctx.currentTime;
  if(m !== pv.m){ const f = mtof(m + pv.b.oct * 12);
    for(const {p, r} of pv.T.F) p.setTargetAtTime(f * r, t, Math.max(0.01, pv.b.glide / 3));
    pv.T.N.forEach(fn => fn(t)); pv.m = m; }
  pv.g.gain.setTargetAtTime(pv.lvl * dynGain(w), t, 0.03);
}
function previewEnd(){
  if(!pv) return; const t = ctx.currentTime, r = Math.min(0.8, pv.b.r);
  pv.g.gain.cancelScheduledValues(t); pv.g.gain.setValueAtTime(pv.g.gain.value, t); pv.g.gain.linearRampToValueAtTime(0, t + r);
  for(const x of pv.V.srcs){ try{ x.s.stop(t + r + 0.05); }catch(e){} }
  pv = null;
}
