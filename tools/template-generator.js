'use strict';
/* ============================================================
   template-generator.js — 開發用工具，主程式不會載入這個檔案。
   templates/ 資料夾裡的範本檔就是用這裡的程式產生的：每個範本有自己的主音、音階、
   速度、鼓組風格與音色搭配，音高用「音階級數」寫，所以會自動落在該範本的調上。
   重新產生的方法：在 inksynth.html 載入後，於瀏覽器 Console 貼上本檔內容，
   再執行 exportAllTemplates()，會逐一下載 templates/*.js。
   ============================================================ */

/* 鼓組風格：每種一小節（4 拍）的位置 */
const SWING8 = [0, .67, 1, 1.67, 2, 2.67, 3, 3.67];
const EIGHTH = [0, .5, 1, 1.5, 2, 2.5, 3, 3.5], OFF8 = [.5, 1.5, 2.5, 3.5];
const SIXTEENTH = Array.from({length:16}, (_, j) => j / 4);
const DRUM_STYLES = {
  pop:     {main:{kick:[0, 2, 2.5], snare:[1, 3], hat:OFF8},        hats:{hat:SIXTEENTH},          groove:{kick:[0, 2], clap:[1, 3], ohat:OFF8}},
  lofi:    {main:{kick:[0, 1.75, 2.5], snare:[1, 3], hat:SWING8},   hats:{hat:SWING8, ohat:[3.67]}, groove:{kick:[0, 2.5], clap:[1, 3], hat:SWING8},
            tune:{snare:-3, hat:-2}, dec:{snare:0.8}},
  house:   {main:{kick:[0, 1, 2, 3], clap:[1, 3], ohat:OFF8},       hats:{hat:SIXTEENTH, ohat:OFF8}, groove:{kick:[0, 1, 2, 3], ohat:OFF8, hat:[.25, .75, 1.25, 1.75, 2.25, 2.75, 3.25, 3.75]}},
  trap:    {main:{kick:[0, 1.75, 2.5], clap:[2], hat:[...EIGHTH, 3.625, 3.75, 3.875]},
            hats:{hat:[...SIXTEENTH, 1.125, 1.375, 3.125, 3.375, 3.625, 3.875]}, groove:{kick:[0, .75, 2.5, 3.25], snare:[2], hat:EIGHTH},
            tune:{kick:-4, clap:1}, dec:{kick:1.8}},
  chip:    {main:{kick:[0, 2], snare:[1, 3], hat:EIGHTH},           hats:{hat:SIXTEENTH},          groove:{kick:[0, 1.5, 2], snare:[1, 3], hat:OFF8},
            tune:{hat:7, snare:5, kick:3}, dec:{snare:0.6, hat:0.7}},
  shuffle: {main:{kick:[0, 2], snare:[1, 3], hat:SWING8},           hats:{hat:SWING8, ohat:[1.67, 3.67]}, groove:{kick:[0, 1.67, 2], snare:[1, 3], ohat:[.67, 1.67, 2.67, 3.67]}},
  taiko:   {main:{kick:[0, .5, 2], tom:[1, 1.5, 3, 3.25, 3.5]},     hats:{hat:[0, 1, 2, 3, 3.5]},  groove:{tom:[0, .75, 1.5, 2, 2.5, 3], kick:[0]},
            tune:{tom:-5, hat:4}, dec:{tom:1.6, kick:1.4}},
  ambient: {main:{kick:[0, 2.5], ohat:[1, 3], hat:[.5, 1.5, 2.5, 3.5]}, hats:{hat:EIGHTH},       groove:{tom:[0, 1.5], ohat:[3], kick:[0]},
            rev:0.45, soft:0.6},
};
const LANE_ALPHA = {kick:.9, snare:.8, clap:.8, hat:.5, ohat:.45, tom:.7};

/* 預設的音色分工；範本只要覆寫想換的角色 */
const ROLE_DEF = {chord:'sine', chordB:'sine', pad:'supersaw', pad2:'choir', tex:'sine', air:'wind', lead:'sine', riff:'sawtooth',
  arp:'pluck', bell:'bell', mel2:'triangle', chip:'pulse', coin:'square', bass:'sawtooth', sub:'sub', riser:'supersaw',
  drop:'square', fx:'pulse', gate:'sawtooth'};

const TEMPLATES = {
  lofi:    {name:'憂鬱 Lo-fi',  desc:'A 小調・100 BPM・慵懶的搖擺鼓與顆粒質感', root:9, scale:'minor', bpm:100, drums:'lofi', prog:[0, 5, 2, 6],
            roles:{}, leadTex:'wave', padTex:'grain', rev:0.3,
            mel:u => 7 * Math.sin(u * Math.PI * 1.6) + 3 - 3 * u, mel2:u => 4 * Math.sin(u * Math.PI * 3) + 6 + 2 * u},
  pop:     {name:'陽光流行',    desc:'C 大調・118 BPM・I–V–vi–IV 經典進行', root:0, scale:'major', bpm:118, drums:'pop', prog:[0, 4, 5, 3],
            roles:{chord:'triangle', chordB:'organ', lead:'pulse', riff:'square', mel2:'triangle', gate:'supersaw'},
            leadTex:'smooth', padTex:'smooth', rev:0.2,
            mel:u => 4 + 6 * u * (1 - u) * 4 * 0.5 + 3 * Math.sin(u * Math.PI * 4), mel2:u => 9 - 6 * u + 2 * Math.sin(u * Math.PI * 6)},
  house:   {name:'夜店 House',  desc:'F 多利安・124 BPM・四四拍與風琴和弦', root:5, scale:'dorian', bpm:124, drums:'house', prog:[0, 3, 6, 4],
            roles:{chord:'organ', chordB:'organ', lead:'supersaw', riff:'sawtooth', bass:'pulse', gate:'supersaw', chip:'pluck'},
            leadTex:'smooth', padTex:'dash', rev:0.25,
            mel:u => 5 + 4 * Math.sin(u * Math.PI * 4), mel2:u => 10 - 4 * Math.abs(Math.sin(u * Math.PI * 2))},
  wafu:    {name:'日式和風',    desc:'D 都節音階・84 BPM・太鼓、撥弦與尺八', root:2, scale:'miyako', bpm:84, drums:'taiko', prog:[0, 2, 3, 1],
            roles:{chord:'pluck', chordB:'pluck', pad:'choir', pad2:'wind', tex:'triangle', lead:'triangle', riff:'pluck', mel2:'wind',
                   chip:'pluck', coin:'bell', bass:'sub', riser:'wind', drop:'bell', fx:'pluck', gate:'pluck'},
            leadTex:'wave', padTex:'mist', rev:0.45, leadGlide:0.14,
            mel:u => 6 * Math.sin(u * Math.PI) + 2 * Math.sin(u * Math.PI * 5), mel2:u => 8 - 5 * u + 3 * Math.sin(u * Math.PI * 2)},
  blues:   {name:'午夜藍調',    desc:'E 藍調音階・92 BPM・搖擺節奏與失真 Lead', root:4, scale:'blues', bpm:92, drums:'shuffle', prog:[0, 2, 4, 0],
            roles:{chord:'organ', chordB:'organ', pad:'organ', lead:'sawtooth', riff:'square', bass:'pluck', gate:'organ'},
            leadTex:'smooth', padTex:'grain', rev:0.25, leadDrive:0.3, leadGlide:0.07,
            mel:u => 5 + 5 * Math.sin(u * Math.PI * 2.5) - 2 * u, mel2:u => 7 + 3 * Math.sin(u * Math.PI * 5)},
  chip:    {name:'8-bit 冒險',  desc:'G 大調五聲・140 BPM・全部都是電玩音色', root:7, scale:'pentaMajor', bpm:140, drums:'chip', prog:[0, 3, 4, 2],
            roles:{chord:'square', chordB:'pulse', pad:'pulse', pad2:'square', tex:'triangle', lead:'pulse', riff:'square', arp:'pulse',
                   bell:'square', chip:'pulse', bass:'triangle', sub:'triangle', riser:'square', fx:'pulse', gate:'square'},
            leadTex:'smooth', padTex:'dash', rev:0.08, hard:true,
            mel:u => 6 + 6 * Math.sin(u * Math.PI * 3), mel2:u => 4 + 8 * u},
  ambient: {name:'夢境漂浮',    desc:'E♭ 大調・72 BPM・大量殘響與漸強音色', root:3, scale:'major', bpm:72, drums:'ambient', prog:[0, 5, 3, 4],
            roles:{chordB:'choir', riff:'bell', arp:'bell', chip:'sine', coin:'bell', bass:'sub', riser:'wind', drop:'sine', fx:'bell', gate:'choir'},
            leadTex:'mist', padTex:'mist', rev:0.6, swell:true,
            mel:u => 7 + 5 * Math.sin(u * Math.PI * 1.2), mel2:u => 12 - 4 * Math.sin(u * Math.PI)},
  dark:    {name:'暗黑電子',    desc:'C# 和聲小調・128 BPM・Trap 鼓與失真超鋸齒', root:1, scale:'harmMinor', bpm:128, drums:'trap', prog:[0, 5, 3, 4],
            roles:{chord:'sawtooth', chordB:'supersaw', tex:'sawtooth', lead:'supersaw', riff:'sawtooth', mel2:'square', coin:'bell', bass:'sub', drop:'sawtooth'},
            leadTex:'smooth', padTex:'grain', rev:0.3, leadDrive:0.35,
            mel:u => 3 + 4 * Math.sin(u * Math.PI * 2) + 4 * u, mel2:u => 6 + 6 * Math.sin(u * Math.PI * 4) * (1 - u)},
};

function buildTemplate(key){
  const T = TEMPLATES[key], R = {...ROLE_DEF, ...T.roles}, DS = DRUM_STYLES[T.drums];
  Object.assign(S, {root:T.root, scale:T.scale, bpm:T.bpm}); resetScaleCache();
  const E = extNotes(), tonic = E.find(m => m >= 55 && (m - T.root) % 12 === 0), ti = E.indexOf(tonic);
  const hi = tonic < 60 ? 1 : 0;                          // 高音域用的八度
  const deg = (d, o = 0) => E[ti + d] + 12 * o;           // 音階級數 → MIDI
  const pads = PAD_KEYS.map((_, i) => newPad(i));
  const set = (key, props, objs) => Object.assign(pads[PAD_KEYS.indexOf(key)], props, {objects:objs.map(normalizeObj)});
  const envA = T.hard ? 'hard' : 'soft', envP = T.swell ? 'swell' : 'soft';
  // 撥弦與鐘聲本身會衰減，配慢起音會聽不到，所以自動改成硬起音
  const syn = (tone, env, extra = {}) => ({tone, texture:'smooth', size:12, alpha:0.75, ...PDEF,
    ...envOf((tone === 'pluck' || tone === 'bell') && (env === 'soft' || env === 'swell') ? 'hard' : env), rev:T.rev, ...extra});
  const line = (pts, pr) => ({type:'line', pts, ...pr});
  const note = (B, b, len, m, pr) => line([{x:b / B, y:midiToY(m), w:1}, {x:(b + len) / B, y:midiToY(m), w:1}], pr);
  const crv = (B, b0, b1, fn, pr, wf = () => 1) => { const pts = [], n = Math.max(12, Math.round((b1 - b0) * 26));
    for(let j = 0; j <= n; j++){ const u = j / n; pts.push({x:(b0 + (b1 - b0) * u) / B, y:clamp(fn(u), MEL_TOP, MEL_BOT), w:+wf(u).toFixed(3)}); } return line(pts, pr); };
  const melY = f => u => midiToY(tonic + f(u));
  const steps = (B, list, pr) => line(list.flatMap(([b, len, m]) => [{x:b / B, y:midiToY(m), w:1}, {x:(b + len * 0.9) / B, y:midiToY(m), w:1}]), pr);
  const chord = (B, b, len, d, shape, pr) => ({type:'chord', x:b / B, y:midiToY(deg(d, -1)), len:len / B, shape, ...pr});
  const chordName = d => { const n = chordNotes({y:midiToY(deg(d, -1)), shape:'tri'}), a = n[1] - n[0], b = n[2] - n[0];
    return NOTE_NAMES[n[0] % 12] + (a === 3 && b === 6 ? 'dim' : a === 4 && b === 8 ? '+' : a === 3 ? 'm' : a === 4 ? '' : a === 5 ? 'sus4' : '5'); };
  const drumBar = (pat, B, off = 0, extra = {}) => Object.entries(pat).flatMap(([lane, beats]) => beats.map((b, j) => ({
    type:'drop', x:(off + b) / B, lane, alpha:LANE_ALPHA[lane] * (lane === 'hat' && j % 2 ? 0.6 : 1) * (DS.soft || 1), ...PDEF,
    tune:(DS.tune || {})[lane] || 0, dec:(DS.dec || {})[lane] || 1, rev:DS.rev ?? 0.05, pan:lane.includes('hat') ? (j % 2 ? 0.25 : -0.25) : 0, ...extra})));
  const P = T.prog;

  /* 數字列：節奏 */
  set('Digit1', {name:'主節奏', mode:'loop', beats:4}, drumBar(DS.main, 4));
  set('Digit2', {name:'細碎 Hat', mode:'loop', beats:4}, drumBar(DS.hats, 4));
  set('Digit3', {name:'律動 Groove', mode:'loop', beats:4}, drumBar(DS.groove, 4));
  set('Digit4', {name:'通鼓 Fill', mode:'oneshot', beats:4}, Array.from({length:8}, (_, j) => drumBar({tom:[j * 0.5]}, 4, 0, {alpha:0.6 + j * 0.05, tune:9 - j * 2.5 + ((DS.tune || {}).tom || 0), pan:0.6 - j * 0.17})).flat());
  set('Digit5', {name:'小鼓滾奏', mode:'oneshot', beats:4}, Array.from({length:16}, (_, j) => drumBar({[T.drums === 'house' || T.drums === 'trap' ? 'clap' : 'snare']:[j / 4]}, 4, 0, {alpha:0.2 + 0.8 * j / 15, tune:j / 3})).flat());
  set('Digit6', {name:'碎拍 Break', mode:'loop', beats:8}, [...drumBar(DS.main, 8), ...drumBar(DS.groove, 8, 4),
    ...drumBar({tom:[3.25, 3.5, 3.75]}, 8, 4, {tune:-4})]);

  /* Q 列：和弦與 Pad */
  const CH = syn(R.chord, T.hard ? 'hard' : 'soft', {size:12, alpha:0.7, s:0.8});
  const CHB = syn(R.chordB, T.hard ? 'hard' : 'soft', {size:12, alpha:0.7, s:0.8, drive:T.leadDrive ? 0.25 : 0});
  set('KeyQ', {name:`和弦 ${chordName(P[0])} → ${chordName(P[1])}`, mode:'loop', beats:8}, [chord(8, 0, 3.8, P[0], 'tri', CH), chord(8, 4, 3.8, P[1], 'tri', CH)]);
  set('KeyW', {name:`和弦 ${chordName(P[2])} → ${chordName(P[3])}`, mode:'loop', beats:8}, [chord(8, 0, 3.8, P[2], 'sq', CHB), chord(8, 4, 3.8, P[3], 'tri', CHB)]);
  set('KeyE', {name:`四和弦循環`, mode:'loop', beats:16}, P.map((d, j) => chord(16, j * 4, 3.8, d, j % 2 ? 'sq' : 'tri', CH)));
  set('KeyR', {name:'鋪底 Pad', mode:'loop', beats:8}, [chord(8, 0, 8, P[0], 'tri', syn(R.pad, 'swell', {uni:22, rev:Math.max(0.45, T.rev), size:18, alpha:0.7, texture:T.padTex === 'dash' ? 'smooth' : T.padTex === 'mist' ? 'mist' : 'smooth'}))]);
  set('KeyT', {name:'人聲 Pad', mode:'loop', beats:4}, [chord(4, 0, 4, P[0], 'tri', syn(R.pad2, 'soft', {rev:Math.max(0.5, T.rev), size:22, alpha:0.75, lfoD:12, lfoR:4.5}))]);
  const TEX = syn(R.tex, 'soft', {size:26, alpha:0.55, texture:T.padTex === 'dash' ? 'grain' : T.padTex});
  set('KeyY', {name:'紋理 Pad', mode:'loop', beats:4}, [note(4, 0, 4, deg(0, -1 + hi), TEX), note(4, 0, 4, deg(2, -1 + hi), TEX), note(4, 0, 4, deg(4, -1 + hi), TEX)]);
  set('KeyU', {name:'氛圍', mode:'oneshot', beats:8}, [crv(8, 0, 8, u => 0.45 - 0.25 * Math.sin(u * Math.PI), syn(R.air, 'swell', {texture:'mist', size:22, alpha:0.8, glide:0.3}), u => 0.4 + 0.6 * Math.sin(u * Math.PI))]);

  /* A 列：旋律 */
  set('KeyA', {name:'主旋律', mode:'oneshot', beats:8}, [crv(8, 0, 7.5, melY(T.mel),
    syn(R.lead, envA, {size:16, alpha:0.85, texture:T.leadTex, glide:T.leadGlide ?? 0.04, drive:T.leadDrive || 0}), u => 0.5 + 0.5 * Math.sin(u * Math.PI))]);
  const RIFF = syn(R.riff, 'hard', {size:9, alpha:0.7, dly:0.3, drive:T.leadDrive || 0});
  set('KeyS', {name:'Lead 樂句', mode:'oneshot', beats:4}, [[0, .45, 4], [.5, .45, 3], [1, .45, 2], [1.5, 1.5, 0]].map(([b, l, d]) => note(4, b, l, deg(d, hi), RIFF)));
  set('KeyD', {name:'琶音', mode:'loop', beats:4}, [steps(4, [0, 2, 4, 7, 4, 2, 4, 6].map((d, j) => [j * 0.5, 0.5, deg(P[0] % 7 + d, 0)]),
    syn(R.arp, 'hard', {glide:0, dly:0.35, size:14, alpha:0.75}))]);
  const BELL = syn(R.bell, 'pluck', {r:1.4, s:0.1, d:0.8, rev:Math.max(0.45, T.rev), size:16, alpha:0.7});
  set('KeyF', {name:'鐘聲動機', mode:'oneshot', beats:4}, [note(4, 0, 0.9, deg(4, hi), BELL), note(4, 1, 0.9, deg(2, hi), BELL), note(4, 2, 1.8, deg(0, hi), BELL)]);
  set('KeyG', {name:'副旋律', mode:'oneshot', beats:8}, [crv(8, 0, 7, melY(T.mel2),
    syn(R.mel2, envA, {glide:0.08, texture:'wave', size:12, alpha:0.8}), u => 0.6 + 0.4 * Math.sin(u * Math.PI * 3))]);
  set('KeyH', {name:'快速琶音', mode:'loop', beats:2}, [steps(2, [0, 2, 4, 7, 0, 2, 4, 6].map((d, j) => [j * 0.25, 0.25, deg(d, hi)]),
    syn(R.chip, 'hard', {glide:0, size:10, alpha:0.55, dly:0.2}))]);
  const COIN = syn(R.coin, 'hard', {size:20, alpha:0.6});
  set('KeyJ', {name:'提示音', mode:'oneshot', beats:1}, [note(1, 0, 0.12, deg(4, hi), COIN), note(1, 0.12, 0.5, deg(7, hi), COIN)]);

  /* Z 列：低音與音效 */
  const BASS = syn(R.bass, 'hard', {size:7, alpha:0.85, fenv:0.5, q:4});
  set('KeyZ', {name:'低音', mode:'loop', beats:4}, [[0, 0], [0.5, 0], [1.5, 1], [2, 0], [3, 2], [3.5, 3]].map(([b, j]) => note(4, b, 0.4, deg(P[j] % 7, -1), BASS)));
  const SUB = syn(R.sub, 'soft', {a:0.02, r:0.3, oct:-1, size:20, alpha:0.85, rev:0});
  set('KeyX', {name:'次低音', mode:'loop', beats:4}, [note(4, 0, 1.9, deg(P[0] % 7, -1), SUB), note(4, 2, 1.9, deg(P[1] % 7, -1), SUB)]);
  set('KeyC', {name:'上升 Riser', mode:'oneshot', beats:8}, [crv(8, 0, 8, u => MEL_BOT - 0.03 - u * u * 0.62,
    syn(R.riser, 'swell', {size:22, alpha:0.65, texture:'wave', uni:25, rev:0.4}), u => 0.3 + 0.7 * u)]);
  set('KeyV', {name:'下墜 Drop', mode:'oneshot', beats:2}, [crv(2, 0, 2, u => 0.12 + u * 0.58, syn(R.drop, 'hard', {size:14, alpha:0.55, texture:'wave', glide:0.1}), u => 1 - u * 0.6)]);
  const FX = syn(R.fx, 'hard', {size:10, alpha:0.6, dly:0.45, glide:0.05});
  set('KeyB', {name:'雷射 FX', mode:'oneshot', beats:1}, [crv(1, 0, 0.35, u => 0.12 + u * 0.45, FX), crv(1, 0.5, 0.85, u => 0.18 + u * 0.45, FX)]);
  set('KeyN', {name:'切片 Pad', mode:'loop', beats:4}, [chord(4, 0, 4, P[0], 'tri', syn(R.gate, 'soft', {texture:'dash', size:16, alpha:0.6}))]);
  set('KeyM', {name:'長音 Drone', mode:'loop', beats:8}, [note(8, 0, 8, deg(0, -1), syn(R.sub === 'triangle' ? 'triangle' : 'sine', envP, {size:30, alpha:0.6, texture:'mist', lfoD:6, lfoR:0.3})),
    note(8, 0, 8, deg(4, -1), syn(R.pad2 === 'wind' ? 'wind' : 'sine', envP, {size:24, alpha:0.4, texture:'mist'}))]);
  return pads;
}

/** 開發用：把所有範本下載成 templates/*.js */
function exportAllTemplates(){
  for(const k of Object.keys(TEMPLATES)){
    const T = TEMPLATES[k], pads = buildTemplate(k);
    const data = {format:'inksynth-board', version:2, id:k, name:T.name, desc:T.desc, bpm:T.bpm, root:T.root, scale:T.scale, quant:'off', pads};
    download(`${k}.js`, `/* InkSynth 範本：${T.name}（${T.desc}） */
InkTemplates.add(${JSON.stringify(data, round4)});
`, 'text/javascript');
  }
}
