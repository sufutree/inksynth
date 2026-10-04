'use strict';
/* ============================================================
   core.js — 常數、狀態、共用工具、音階量化
   ============================================================ */

/* 音色 = 顏色：每一種顏色對應一種合成方式 */
const TONES = {
  sine:     {zh:'藍・正弦',   color:'#4aa8ff', desc:'純淨、冷調、適合憂鬱旋律'},
  triangle: {zh:'青・三角',   color:'#45e0d8', desc:'柔和溫暖，像長笛'},
  sawtooth: {zh:'紅・鋸齒',   color:'#ff4d5e', desc:'明亮、有侵略性的 Lead'},
  square:   {zh:'黃・方波',   color:'#ffd23f', desc:'電玩 8-bit 感'},
  pulse:    {zh:'橙・脈衝',   color:'#ff8a3d', desc:'細薄的 Chiptune 脈衝波'},
  supersaw: {zh:'洋紅・超鋸齒', color:'#ff4fd8', desc:'7 層齊奏的厚實 EDM 音色'},
  organ:    {zh:'琥珀・風琴', color:'#e3a557', desc:'加法合成的管風琴'},
  bell:     {zh:'紫・FM 鐘聲', color:'#a98bff', desc:'FM 合成、金屬感的鐘聲'},
  pluck:    {zh:'綠・撥弦',   color:'#6be675', desc:'每換一個音就重新撥一次'},
  wind:     {zh:'銀・風聲',   color:'#d3dae8', desc:'有音高的噪音，像風或呼吸'},
  sub:      {zh:'靛・次低音', color:'#5d6cff', desc:'厚重的低頻 Sub Bass'},
  choir:    {zh:'粉・人聲',   color:'#ff9bb8', desc:'母音共振峰「啊—」'},
};
const TONE_KEYS = Object.keys(TONES);

/* 鼓組：墨滴依照落點的列決定種類（由上到下） */
const DRUMS = {
  ohat:  {zh:'開放鈸', en:'OPEN HAT', color:'#6fcfff'},
  hat:   {zh:'閉合鈸', en:'HI-HAT',   color:'#8ff0d4'},
  clap:  {zh:'拍手',   en:'CLAP',     color:'#ffb38a'},
  snare: {zh:'小鼓',   en:'SNARE',    color:'#c6b6ff'},
  tom:   {zh:'通鼓',   en:'TOM',      color:'#ff8fa3'},
  kick:  {zh:'大鼓',   en:'KICK',     color:'#f1ede2'},
};
const LANE_KEYS = Object.keys(DRUMS);
const MEL_TOP = 0.04, MEL_BOT = 0.735, DRUM_TOP = 0.765;
const LANES = {}; LANE_KEYS.forEach((k, i) => LANES[k] = 0.792 + i * 0.037);
const MIDI_LO = 40, MIDI_HI = 84;

const SCALES = {
  minor:      {name:'自然小調',   iv:[0,2,3,5,7,8,10]},
  major:      {name:'大調',       iv:[0,2,4,5,7,9,11]},
  pentaMinor: {name:'小調五聲',   iv:[0,3,5,7,10]},
  pentaMajor: {name:'大調五聲',   iv:[0,2,4,7,9]},
  dorian:     {name:'多利安',     iv:[0,2,3,5,7,9,10]},
  harmMinor:  {name:'和聲小調',   iv:[0,2,3,5,7,8,11]},
  blues:      {name:'藍調',       iv:[0,3,5,6,7,10]},
  miyako:     {name:'日本都節',   iv:[0,1,5,7,8]},
  mixolydian: {name:'混合利底亞', iv:[0,2,4,5,7,9,10]},
  hijaz:      {name:'希賈茲（阿拉伯）', iv:[0,1,4,5,7,8,10]},
  pelog:      {name:'佩洛格（峇里）',   iv:[0,1,3,7,8]},
  chromatic:  {name:'不鎖定',     iv:[0,1,2,3,4,5,6,7,8,9,10,11]},
};
const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

const TEXTURES = {
  smooth: {zh:'平滑', sub:'乾淨'},
  grain:  {zh:'顆粒', sub:'Lo-fi'},
  wave:   {zh:'波浪', sub:'顫音'},
  dash:   {zh:'斷續', sub:'切片'},
  mist:   {zh:'暈染', sub:'殘響'},
};
const ENV_PRESETS = {
  soft:  {zh:'柔鋒', sub:'慢起長尾', a:0.25,  d:0.4,  s:0.85, r:0.7},
  hard:  {zh:'利鋒', sub:'硬起短尾', a:0.005, d:0.15, s:0.9,  r:0.08},
  pluck: {zh:'撥奏', sub:'快速衰減', a:0.003, d:0.35, s:0.12, r:0.25},
  swell: {zh:'漸強', sub:'緩慢浮現', a:1.2,   d:0.5,  s:1,    r:1.5},
};
const DYN_MODES = {fixed:{zh:'固定', sub:'不變'}, speed:{zh:'速度', sub:'慢＝重'}, pressure:{zh:'筆壓', sub:'繪圖筆'}};
const SHAPES = {tri:{zh:'△', sub:'三和弦'}, sq:{zh:'□', sub:'七和弦'}, circle:{zh:'○', sub:'強力和弦'}};
const PAD_MODES = {oneshot:'→ 單次', loop:'↻ 循環'};
const ALIGNS = {global:'跟隨全域', off:'立即', beat:'對拍', bar:'對小節'};
const GRIDS = {1:{zh:'1/4', sub:'一拍'}, 2:{zh:'1/8', sub:'半拍'}, 4:{zh:'1/16', sub:'四分之一拍'}, 3:{zh:'三連音', sub:'1/8T'}};

/* 音色細節參數的預設值 */
const PDEF = {a:0.25, d:0.4, s:0.85, r:0.7, q:1, fenv:0, uni:10, lfoR:5.5, lfoD:0, glide:0.04, oct:0, drive:0,
              pan:0, rev:0.15, dly:0.08, tune:0, dec:1};
const SYN_KEYS  = ['a','d','s','r','q','fenv','uni','lfoR','lfoD','glide','oct','drive','pan','rev','dly'];
const DRUM_KEYS = ['tune','dec','pan','rev'];

/* 40 個按鍵：1–0 / Q–P / A–; / Z–/ */
const PAD_KEYS = [
  'Digit1','Digit2','Digit3','Digit4','Digit5','Digit6','Digit7','Digit8','Digit9','Digit0',
  'KeyQ','KeyW','KeyE','KeyR','KeyT','KeyY','KeyU','KeyI','KeyO','KeyP',
  'KeyA','KeyS','KeyD','KeyF','KeyG','KeyH','KeyJ','KeyK','KeyL','Semicolon',
  'KeyZ','KeyX','KeyC','KeyV','KeyB','KeyN','KeyM','Comma','Period','Slash',
];
const RESERVED = new Set(['Escape','Space','Tab','Enter','Backspace','Delete','ShiftLeft','ShiftRight',
  'ControlLeft','ControlRight','AltLeft','AltRight','MetaLeft','MetaRight','CapsLock']);

const S = {
  view:'board', mode:'play', editing:null, sel:null, tab:'brush', boardName:'我的音效板',
  bpm:100, root:9, scale:'minor', quant:'off', pads:[],
  brush:{tool:'line', grid:4, tone:'sine', size:14, alpha:0.8, dyn:'speed', texture:'smooth', shape:'tri', ...PDEF},
};
let inkVer = 0;
/* 範本檔（templates/*.js）會呼叫 InkTemplates.add(...)，用檔名當作索引 */
const InkTemplates = {files:[], map:{}, add(t){
  const src = document.currentScript && document.currentScript.src || '';
  const file = decodeURIComponent(src.split('/').pop() || '').replace(/\.js$/, '') || t.id;
  this.map[file] = t;
}};   // 任何繪圖內容改變就 +1，讓各畫面知道要重繪

/* ---------- 工具 ---------- */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const cutoffOf = size => 700 * Math.pow(26, (size - 3) / 37);   // 細＝700Hz 偏暗，粗＝18kHz 全開
const fmtHz = f => f >= 1000 ? (f / 1000).toFixed(1) + ' kHz' : Math.round(f) + ' Hz';
const padDur = p => p.beats * 60 / S.bpm;
const toneColor = t => (TONES[t] || TONES.sine).color;
function rng(seed){ let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hexA(hex, a){ const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${n >> 8 & 255},${n & 255},${a})`; }
const keyLabel = c => !c ? '—' : c.startsWith('Key') ? c.slice(3) : c.startsWith('Digit') ? c.slice(5) : c.startsWith('Numpad') ? 'N' + c.slice(6) :
  ({Semicolon:';', Comma:',', Period:'.', Slash:'/', Quote:"'", BracketLeft:'[', BracketRight:']', Minus:'-', Equal:'=',
    Backquote:'`', Backslash:'\\', ArrowUp:'↑', ArrowDown:'↓', ArrowLeft:'←', ArrowRight:'→'}[c] || c);
/* align：這格自己的啟動對齊（global＝跟隨上方設定）；ownKey：{root, scale} 獨立調性，null＝跟隨主調 */
const newPad = i => ({name:'', key:PAD_KEYS[i], mode:'oneshot', beats:4, vol:0.8, align:'global', ownKey:null, objects:[]});
/** 補齊音效格的設定（也負責把舊版資料升級：「按住」模式改成循環） */
function normalizePad(p){
  p.mode = p.mode === 'oneshot' ? 'oneshot' : 'loop';
  if(!ALIGNS[p.align]) p.align = 'global';
  const k = p.ownKey;
  p.ownKey = k && SCALES[k.scale] ? {root:((+k.root || 0) % 12 + 12) % 12, scale:k.scale} : null;
  return p;
}
const envOf = name => { const e = ENV_PRESETS[name]; return {a:e.a, d:e.d, s:e.s, r:e.r}; };

/** 補齊物件缺少的參數（也負責把舊版資料升級） */
function normalizeObj(o){
  if(o.wave && !o.tone){ o.tone = o.wave; delete o.wave; }
  if(o.edge){ Object.assign(o, envOf(o.edge === 'soft' ? 'soft' : 'hard')); delete o.edge; }
  if(o.type !== 'drop'){ o.tone = TONES[o.tone] ? o.tone : 'sine'; o.texture = TEXTURES[o.texture] ? o.texture : 'smooth'; }
  if(o.type === 'line') o.pts.forEach(p => { if(p.w == null) p.w = 1; });
  if(o.type === 'drop' && !DRUMS[o.lane]) o.lane = 'kick';
  for(const k in PDEF) if(o[k] == null) o[k] = PDEF[k];
  if(o.alpha == null) o.alpha = 0.8;
  if(o.size == null) o.size = 12;
  if(!o.seed) o.seed = Math.random() * 1e9 | 0;
  return o;
}

/* ---------- 音階量化 ----------
   有「獨立調性」的音效格，在排程／繪製它的期間會用 withKey() 暫時換成它自己的主音與音階。 */
let KEYCTX = null;
const curRoot = () => KEYCTX ? KEYCTX.root : S.root;
const curScale = () => KEYCTX ? KEYCTX.scale : S.scale;
function withKey(p, fn){ const prev = KEYCTX; KEYCTX = p && p.ownKey || null; try{ return fn(); } finally{ KEYCTX = prev; } }
const keyName = p => p && p.ownKey ? `${NOTE_NAMES[p.ownKey.root]} ${SCALES[p.ownKey.scale].name}` : `${NOTE_NAMES[S.root]} ${SCALES[S.scale].name}`;
let _cache = {};
const inScale = m => SCALES[curScale()].iv.includes(((m - curRoot()) % 12 + 12) % 12);
const keyCache = () => _cache[curRoot() + curScale()] ||= {};
function scaleNotes(){ const c = keyCache(); if(!c.n){ c.n = []; for(let m = MIDI_LO; m <= MIDI_HI; m++) if(inScale(m)) c.n.push(m); } return c.n; }
function extNotes(){ const c = keyCache(); if(!c.e){ c.e = []; for(let m = 12; m <= 120; m++) if(inScale(m)) c.e.push(m); } return c.e; }
function resetScaleCache(){ _cache = {}; }
const rawMidi = y => MIDI_HI - (clamp(y, MEL_TOP, MEL_BOT) - MEL_TOP) / (MEL_BOT - MEL_TOP) * (MIDI_HI - MIDI_LO);
function quant(y){
  const raw = rawMidi(y);
  let best = null; for(const m of scaleNotes()) if(best === null || Math.abs(m - raw) < Math.abs(best - raw)) best = m;
  return best;
}
const midiToY = m => MEL_TOP + (MIDI_HI - m) / (MIDI_HI - MIDI_LO) * (MEL_BOT - MEL_TOP);
const noteName = m => NOTE_NAMES[m % 12] + (Math.floor(m / 12) - 1);
function chordNotes(o){
  const r = quant(o.y);
  if(o.shape === 'circle') return [r, r + 7, r + 12];
  if(curScale() === 'chromatic') return o.shape === 'sq' ? [r, r + 3, r + 7, r + 10] : [r, r + 3, r + 7];
  if(SCALES[curScale()].iv.length === 7){
    const E = extNotes(), i = E.indexOf(r), n = [E[i], E[i + 2], E[i + 4]];
    if(o.shape === 'sq') n.push(E[i + 6]);
    return n;
  }
  // 五聲、藍調、都節等：依音階裡有的音挑三度與五度，沒有三度就做成空五度
  const pick = (...c) => c.find(x => inScale(r + x));
  const third = pick(3, 4), fifth = pick(7, 6, 8) ?? 7, n = third ? [r, r + third, r + fifth] : [r, r + fifth, r + 12];
  if(o.shape === 'sq') n.push(r + (pick(10, 11, 9) ?? 10));
  return n;
}
function lineYAt(o, xn){
  const P = o.pts; if(xn < P[0].x || xn > P[P.length - 1].x) return null;
  let lo = 0, hi = P.length - 1;
  while(hi - lo > 1){ const mid = (lo + hi) >> 1; if(P[mid].x <= xn) lo = mid; else hi = mid; }
  const a = P[lo], b = P[hi], u = b.x === a.x ? 0 : (xn - a.x) / (b.x - a.x);
  return a.y + (b.y - a.y) * u;
}
function laneAt(y){ let best = 'kick'; for(const k in LANES) if(Math.abs(LANES[k] - y) < Math.abs(LANES[best] - y)) best = k; return best; }
function padColor(p){
  const w = {}; let drops = 0;
  for(const o of p.objects){ if(o.type === 'drop') drops++; else w[o.tone] = (w[o.tone] || 0) + (o.type === 'chord' ? 3 : 2); }
  const best = Object.keys(w).sort((a, b) => w[b] - w[a])[0];
  return best ? toneColor(best) : drops ? DRUMS.kick.color : '#7cf0d0';
}
function toast(msg){ if(!msg) return; const t = $('#toast'); t.textContent = msg; t.style.opacity = 1;
  clearTimeout(toast.h); toast.h = setTimeout(() => t.style.opacity = 0, 2400); }
