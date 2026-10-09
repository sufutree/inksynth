'use strict';
/* ============================================================
   build-excursions.js — 開發用工具，主程式不會載入這個檔案。
   產生 音效板/11 遠行（C418 Excursions 風格）.inksynth.json（40 格全部填滿）。
   執行方式：在專案資料夾下執行  node tools/build-excursions.js

   參考：C418〈Excursions〉（2018）—— F♯ 小調、100 BPM；回聲房間鋼琴、弦樂、
   環境錄音（鳥鳴、營火與黑膠的劈啪聲），以及不加失真、只靠濾波共振「嘶吼」的類比低音。
   結構是「氛圍鋪陳 → 鼓點進來」，這裡用第一列的鼓組與最後一格的 Riser 來做那個轉折。

   和聲設計（讓任意組合都好聽）：
   ・四個和弦 F♯m11 / Dmaj9 / Bm11 / Aadd9 全部只用 F♯ A B C♯ D E 六個音（刻意避開 G♯），
     所以任何兩個循環錯開疊在一起都還是同一組音，不會撞出刺耳的小二度。
   ・旋律用同一組六個音，以 F♯ 小調五聲音階（F♯ A B C♯ E）為主。
   ・啟動對齊「對小節」，和聲循環都是 4 小節（16 拍）。
   ============================================================ */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');

const sandbox = {document:{currentScript:null, querySelector:() => null, querySelectorAll:() => []}, console, Math, JSON};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/core.js'), 'utf8'), sandbox);

const GEN = String.raw`
Object.assign(S, {root:6, scale:'minor', bpm:100}); resetScaleCache();
const pads = PAD_KEYS.map((_, i) => newPad(i));
const set = (key, props, objs) => Object.assign(pads[PAD_KEYS.indexOf(key)], props, {objects:objs.flat().map(normalizeObj)});

/* ---- 音名 → MIDI（只會用到 F♯ A B C♯ D E） ---- */
const PC = {C:0, 'C#':1, D:2, 'D#':3, E:4, F:5, 'F#':6, G:7, 'G#':8, A:9, 'A#':10, B:11};
const M = s => { const [, n, o] = s.match(/^([A-G]#?)(-?\d)$/); return PC[n] + 12 * (+o + 1); };
const Ms = s => s.split(' ').map(M);

/* ---- 物件產生器 ---- */
const syn = (tone, env, extra = {}) => ({tone, texture:'smooth', size:12, alpha:0.75, ...PDEF, ...envOf(env), ...extra});
const pt = (B, b, m, w = 1) => ({x:+(b / B).toFixed(5), y:+midiToY(m).toFixed(5), w:+w.toFixed(3)});
const note = (B, b, len, m, pr, w = 1) => ({type:'line', pts:[pt(B, b, m, w), pt(B, b + len, m, w * 0.85)], ...pr});
/** list：[拍, 長度, 音名, 力度?] */
const notes = (B, list, pr) => list.map(([b, len, n, w]) => note(B, b, len, typeof n === 'string' ? M(n) : n, pr, w ?? 1));
/** 一條連續筆畫的樂句（音與音之間滑過去） */
const phrase = (B, list, pr, wf = u => 0.55 + 0.45 * Math.sin(u * Math.PI)) => {
  const pts = [], b0 = list[0][0], end = list[list.length - 1][0] + list[list.length - 1][1];
  for(const [b, len, n] of list){ const m = M(n);
    pts.push(pt(B, b, m, wf((b - b0) / (end - b0))), pt(B, b + len * 0.86, m, wf((b + len * 0.86 - b0) / (end - b0)))); }
  return {type:'line', pts, ...pr};
};
const curve = (B, b0, b1, fn, pr, wf = () => 1) => { const pts = [], n = Math.max(12, Math.round((b1 - b0) * 24));
  for(let j = 0; j <= n; j++){ const u = j / n; pts.push({x:+((b0 + (b1 - b0) * u) / B).toFixed(5), y:+clamp(fn(u), MEL_TOP, MEL_BOT).toFixed(5), w:+wf(u).toFixed(3)}); }
  return {type:'line', pts, ...pr}; };
/** 和弦：每個音都直接寫出來（開放式鋼琴配置） */
const chord = (B, b, len, voicing, pr) => ({type:'chord', x:b / B, len:len / B, ...pr, notes:voicing.map(m => +midiToY(m).toFixed(5))});
const drop = (B, b, lane, alpha, extra = {}) => ({type:'drop', x:b / B, lane, alpha, ...PDEF, rev:0.15, ...extra});
const drops = (B, beats, lane, alpha, extra = {}) => beats.map((b, j) => drop(B, b, lane,
  typeof alpha === 'function' ? alpha(j, b) : alpha, typeof extra === 'function' ? extra(j, b) : extra));
const range = (n, step, off = 0) => Array.from({length:n}, (_, j) => off + j * step);

/* ---- 和弦配置（全部只用 F♯ A B C♯ D E） ---- */
const CH = {
  'F#m11': Ms('F#2 C#3 E3 A3 B3'),  'Dmaj9': Ms('D3 A3 C#4 E4 F#4'),
  'Bm11':  Ms('B2 F#3 A3 D4 E4'),   'Aadd9': Ms('A2 E3 A3 B3 C#4'),
};
const HI = {   // 高八度、去掉低音的版本（給 Pad、電鋼）
  'F#m11': Ms('A3 C#4 E4 F#4 B4'),  'Dmaj9': Ms('A3 C#4 D4 E4 F#4'),
  'Bm11':  Ms('A3 B3 D4 E4 F#4'),   'Aadd9': Ms('A3 B3 C#4 E4 A4'),
};
const PROG_A = ['F#m11', 'F#m11', 'Dmaj9', 'Dmaj9'];            // i – VI
const PROG_B = ['Dmaj9', 'Aadd9', 'F#m11', 'Bm11'];             // VI – III – i – iv

/* ---- 鼓組音色：精簡、短促的數位感 ---- */
const KICK = {tune:-2, dec:0.9, rev:0.06};
const CLIP = j => ({tune:4 + (j * 7 % 5), dec:0.35 + (j * 3 % 4) * 0.1, pan:[-0.35, 0.2, -0.1, 0.4][j % 4], rev:0.1});

/* ============ 第一列：節奏 ============ */
set('Digit1', {name:'遠行律動', mode:'loop', beats:4, vol:0.75}, [
  drops(4, [0, 2.5], 'kick', 0.8, KICK), drops(4, [1, 3], 'snare', 0.5, {tune:-2, dec:0.7, rev:0.3}),
  drops(4, range(8, 0.5), 'hat', j => j % 2 ? 0.45 : 0.25, CLIP)]);
set('Digit2', {name:'數位切片 Hat', mode:'loop', beats:4, vol:0.6},
  drops(4, [0, 0.25, 0.75, 1, 1.5, 1.75, 2.25, 2.5, 3, 3.25, 3.5, 3.875], 'hat', j => [0.5, 0.25, 0.35, 0.45][j % 4], CLIP));
set('Digit3', {name:'四拍大鼓', mode:'loop', beats:4, vol:0.7}, drops(4, [0, 1, 2, 3], 'kick', j => j % 2 ? 0.6 : 0.8, KICK));
set('Digit4', {name:'拍手殘響', mode:'loop', beats:4, vol:0.6}, drops(4, [1, 3], 'clap', 0.6, {tune:-1, dec:1.2, rev:0.55}));
set('Digit5', {name:'碎拍 Break', mode:'loop', beats:8, vol:0.7}, [
  drops(8, [0, 1.75, 2.5, 4, 5.25, 6.5, 7.25], 'kick', 0.75, KICK),
  drops(8, [1, 3, 5, 7, 7.75], 'snare', j => j === 4 ? 0.3 : 0.55, {tune:-1, dec:0.8, rev:0.25}),
  drops(8, range(16, 0.5), 'hat', j => j % 2 ? 0.4 : 0.22, CLIP)]);
set('Digit6', {name:'木頭敲擊', mode:'loop', beats:8, vol:0.55},
  drops(8, [0, 0.75, 1.5, 3, 4, 4.75, 6, 6.5], 'tom', j => 0.35 + (j % 3) * 0.12, j => ({tune:12 + (j % 3) * 3, dec:0.16, pan:j % 2 ? 0.45 : -0.45, rev:0.3})));
/* 紐約地鐵：車輪壓過鐵軌接縫的「喀噠—喀噠」 */
set('Digit7', {name:'地鐵軌道', mode:'loop', beats:4, vol:0.55}, [
  drops(4, [0, 0.25, 2, 2.25], 'tom', j => j % 2 ? 0.45 : 0.6, j => ({tune:-3, dec:0.45, pan:-0.2, rev:0.2})),
  drops(4, [0.125, 0.375, 2.125, 2.375], 'hat', 0.25, {tune:-4, dec:0.6, pan:0.25, rev:0.2})]);
set('Digit8', {name:'數位故障 過門', mode:'oneshot', beats:4, vol:0.65}, [
  drops(4, [0, 1.5], 'kick', 0.75, KICK),
  drops(4, range(8, 0.125, 2), 'hat', j => 0.3 + j * 0.06, j => ({tune:2 + j * 2, dec:0.3, pan:-0.6 + j * 0.17, rev:0.1})),
  drops(4, range(4, 0.25, 3), 'snare', j => 0.35 + j * 0.15, j => ({tune:j * 2, dec:0.6, rev:0.2}))]);
set('Digit9', {name:'小鼓漸強', mode:'oneshot', beats:8, vol:0.6}, [
  drops(8, range(8, 0.5), 'snare', j => 0.15 + j * 0.03, {tune:-2, dec:0.6, rev:0.35}),
  drops(8, range(16, 0.25, 4), 'snare', j => 0.4 + j * 0.035, j => ({tune:j * 0.4, dec:0.5, rev:0.35}))]);
set('Digit0', {name:'撞擊 Impact', mode:'oneshot', beats:4, vol:0.75}, [
  drop(4, 0, 'kick', 1, {...KICK, dec:2}), drop(4, 0, 'ohat', 0.6, {dec:3, rev:0.5}),
  drop(4, 0, 'tom', 0.8, {tune:-12, dec:2.5, rev:0.5}), drop(4, 0, 'clap', 0.5, {dec:1.5, rev:0.6})]);

/* ============ 第二列：和聲 ============ */
/* 回聲房間鋼琴：三角波＋撥奏包絡，大量殘響與附點八分延遲 */
const PIANO = syn('triangle', 'pluck', {a:0.004, d:1.8, s:0.22, r:1.6, size:11, alpha:0.6, rev:0.55, dly:0.18});
const pianoProg = (prog, hits) => prog.flatMap((c, bar) => hits.map(([b, l, a]) => chord(16, bar * 4 + b, l, CH[c], {...PIANO, alpha:a})));
set('KeyQ', {name:'回聲鋼琴 i–VI', mode:'loop', beats:16, vol:0.7}, pianoProg(PROG_A, [[0, 2.4, 0.62], [2.5, 1.4, 0.38]]));
set('KeyW', {name:'回聲鋼琴 四和弦', mode:'loop', beats:16, vol:0.7}, pianoProg(PROG_B, [[0, 3.8, 0.6]]));
set('KeyE', {name:'鋼琴 八分脈動', mode:'loop', beats:8, vol:0.55},
  range(16, 0.5).map((b, j) => chord(8, b, 0.4, HI[j < 8 ? 'F#m11' : 'Dmaj9'], {...PIANO, d:0.5, s:0.1, r:0.3, dly:0.05, rev:0.35, alpha:j % 2 ? 0.32 : 0.5})));
const STRINGS = syn('sawtooth', 'swell', {size:8, alpha:0.45, uni:16, rev:0.5, texture:'mist', lfoD:5, lfoR:4.8, a:1.5, r:2});
set('KeyR', {name:'弦樂 四和弦', mode:'loop', beats:16, vol:0.5}, PROG_B.map((c, j) => chord(16, j * 4, 3.95, HI[c], STRINGS)));
set('KeyT', {name:'類比 Pad', mode:'gate', beats:8, vol:0.45},
  [chord(8, 0, 8, HI['F#m11'], syn('supersaw', 'swell', {size:7, alpha:0.45, uni:18, rev:0.55, texture:'mist', a:2, r:2.5}))]);
set('KeyY', {name:'人聲和聲', mode:'loop', beats:16, vol:0.45},
  PROG_A.filter((_, j) => j % 2 === 0).map((c, j) => chord(16, j * 8, 7.9, HI[c], syn('choir', 'swell', {size:15, alpha:0.5, rev:0.6, a:1.4, r:2, lfoD:8, lfoR:4.5}))));
const RHODES = syn('bell', 'pluck', {size:9, alpha:0.5, d:1.4, s:0.3, r:1.3, rev:0.45, dly:0.15, lfoD:4, lfoR:4.2, pan:0.2});
set('KeyU', {name:'電鋼琴', mode:'loop', beats:16, vol:0.55},
  PROG_B.flatMap((c, j) => [chord(16, j * 4 + 0.5, 1.4, HI[c], RHODES), chord(16, j * 4 + 2.5, 1.2, HI[c], {...RHODES, alpha:0.35})]));
set('KeyI', {name:'鋼琴分解', mode:'loop', beats:8, vol:0.6},
  notes(8, [[0, 2, 'F#3'], [0.5, 1.5, 'C#4'], [1, 1.5, 'E4'], [1.5, 1, 'A4'], [2, 1.5, 'C#5'], [3, 1, 'B4'],
            [4, 2, 'D3'], [4.5, 1.5, 'A3'], [5, 1.5, 'E4'], [5.5, 1, 'F#4'], [6, 1.5, 'A4'], [7, 1, 'E4']]
    .map(([b, l, n], j) => [b, l, n, j % 6 === 0 ? 0.95 : 0.6 + (j % 3) * 0.1]), {...PIANO, d:1.4, pan:-0.15}));
/* Moog 式琶音：脈衝波＋濾波包絡，十六分音符 */
const MOOG_ARP = syn('pulse', 'pluck', {size:9, alpha:0.55, d:0.25, s:0.15, r:0.15, fenv:0.45, q:4, dly:0.25, rev:0.25, pan:0.3});
set('KeyO', {name:'Moog 琶音', mode:'loop', beats:4, vol:0.5},
  notes(4, 'F#3 A3 C#4 E4 F#4 E4 C#4 A3 F#3 A3 C#4 E4 A4 E4 C#4 B3'.split(' ').map((n, j) => [j / 4, 0.22, n, j % 4 === 0 ? 1 : 0.6]), MOOG_ARP));
set('KeyP', {name:'城市天際線', mode:'gate', beats:8, vol:0.45},
  [['C#5', -0.4], ['F#5', 0.4], ['B5', 0]].map(([n, pan], j) => curve(8, j * 0.6, 8, () => midiToY(M(n)),
    syn('sine', 'swell', {size:22, alpha:0.45, texture:'mist', lfoD:6, lfoR:0.3 + j * 0.15, rev:0.6, pan}), u => 0.4 + 0.6 * Math.sin(u * Math.PI))));

/* ============ 第三列：旋律（「要按幾個音才會動人？」——越少越好） ============ */
const MEL_A = [[0, 1.5, 'C#5'], [1.5, 0.5, 'B4'], [2, 2, 'A4'], [4, 1.5, 'E5'], [5.5, 0.5, 'C#5'], [6, 2, 'B4'],
               [8, 1.5, 'C#5'], [9.5, 0.5, 'B4'], [10, 1, 'A4'], [11, 1, 'F#4'], [12, 3.5, 'E4']];
const MEL_B = [[0, 1, 'A4'], [1, 1, 'B4'], [2, 2, 'C#5'], [4, 1, 'E5'], [5, 1, 'F#5'], [6, 2, 'E5'],
               [8, 1.5, 'D5'], [9.5, 0.5, 'C#5'], [10, 2, 'B4'], [12, 3.5, 'F#4']];
const MELP = {...PIANO, size:13, alpha:0.75, d:2.2, s:0.18, r:1.8, dly:0.28, pan:0.1};
set('KeyA', {name:'鋼琴主題 ①', mode:'oneshot', beats:16, vol:0.7}, notes(16, MEL_A.map(([b, l, n], j) => [b, l, n, [0.9, 0.6, 0.8, 1, 0.65, 0.8, 0.85, 0.55, 0.7, 0.65, 0.9][j]]), MELP));
set('KeyS', {name:'鋼琴主題 ②', mode:'oneshot', beats:16, vol:0.7}, notes(16, MEL_B.map(([b, l, n], j) => [b, l, n, j % 3 === 2 ? 0.95 : 0.7]), MELP));
set('KeyD', {name:'高音點綴', mode:'loop', beats:8, vol:0.5},
  notes(8, [[0, 1.5, 'F#5', 0.8], [2.5, 1, 'E5', 0.6], [4.5, 1.5, 'C#5', 0.7], [6.5, 1, 'A5', 0.5]], {...PIANO, size:15, alpha:0.55, dly:0.45, rev:0.6, pan:0.35}));
const MUSICBOX = syn('bell', 'pluck', {size:20, alpha:0.5, d:0.8, s:0.05, r:1.4, rev:0.5, dly:0.2});
set('KeyF', {name:'八音盒', mode:'oneshot', beats:8, vol:0.5},
  notes(8, [[0, 0.5, 'E5'], [0.5, 0.5, 'F#5'], [1, 1, 'A5'], [2, 0.5, 'F#5'], [2.5, 1, 'E5'], [4, 0.5, 'C#5'], [4.5, 0.5, 'E5'],
            [5, 1, 'B4'], [6, 1.5, 'C#5']].map(([b, l, n], j) => [b, l, n, 0.6 + (j % 3) * 0.15]), MUSICBOX));
/* 類比 Lead「嘶吼」：不加失真，只靠高共振濾波與濾波包絡 */
const SCREAM = syn('sawtooth', 'soft', {a:0.03, d:0.6, s:0.7, r:0.4, size:10, alpha:0.6, q:7, fenv:0.5, glide:0.12, texture:'wave', lfoR:5.4, rev:0.35, dly:0.2});
set('KeyG', {name:'類比 Lead 嘶吼', mode:'oneshot', beats:8, vol:0.5}, [phrase(8,
  [[0, 1.5, 'F#4'], [1.5, 0.5, 'A4'], [2, 1.5, 'C#5'], [3.5, 0.5, 'B4'], [4, 1, 'A4'], [5, 1, 'E5'], [6, 1.8, 'C#5']], SCREAM)]);
const LEAD = syn('sine', 'soft', {a:0.05, d:0.3, s:0.9, r:0.6, size:18, alpha:0.65, glide:0.09, texture:'wave', lfoR:5, rev:0.45, dly:0.25});
set('KeyH', {name:'正弦主奏', mode:'oneshot', beats:8, vol:0.55}, [phrase(8,
  [[0, 2, 'E5'], [2, 1, 'C#5'], [3, 1, 'B4'], [4, 1.5, 'A4'], [5.5, 0.5, 'B4'], [6, 1.8, 'F#4']], LEAD)]);
set('KeyJ', {name:'鋼琴八度下行', mode:'oneshot', beats:4, vol:0.6},
  ['F#5', 'E5', 'C#5', 'B4', 'A4', 'F#4'].flatMap((n, j) => [note(4, j * 0.5, 1.2, M(n), {...PIANO, alpha:0.6, dly:0.2}, 0.9 - j * 0.05),
    note(4, j * 0.5, 1.2, M(n) - 12, {...PIANO, alpha:0.45, dly:0.2}, 0.8 - j * 0.05)]));
const BELL = syn('bell', 'pluck', {size:14, alpha:0.55, d:1, s:0.15, r:1.6, rev:0.5, dly:0.22});
set('KeyK', {name:'鐘聲動機', mode:'oneshot', beats:4, vol:0.5}, notes(4, [[0, 0.75, 'C#5'], [1, 0.75, 'A4'], [2, 1.8, 'E5']], BELL));
set('KeyL', {name:'數位琶音 上行', mode:'oneshot', beats:2, vol:0.45},
  notes(2, 'F#4 A4 B4 C#5 E5 F#5 A5 B5'.split(' ').map((n, j) => [j * 0.1875, 0.2, n, 0.5 + j * 0.06]),
    syn('pulse', 'pluck', {size:16, alpha:0.5, d:0.2, s:0.1, r:0.3, dly:0.35, rev:0.35})).map((o, j) => ({...o, pan:-0.5 + j / 7})));
/* 主題 ① 的下方和聲：同一組六個音裡往下找「三度」 */
const SAFE = ['E', 'F#', 'A', 'B', 'C#', 'D'];
const below = n => { const m = M(n); for(let k = 3; k <= 5; k++) if(SAFE.includes(NOTE_NAMES[(m - k) % 12])) return noteName(m - k); };
set('Semicolon', {name:'鋼琴主題 和聲', mode:'oneshot', beats:16, vol:0.55},
  notes(16, MEL_A.map(([b, l, n]) => [b, l, below(n), 0.6]), {...MELP, alpha:0.55, pan:-0.25}));

/* ============ 第四列：低音與環境錄音 ============ */
const BASS = syn('sub', 'soft', {a:0.02, d:0.5, s:0.8, r:0.4, size:9, alpha:0.75, oct:-1, rev:0});
set('KeyZ', {name:'低音 i–VI', mode:'loop', beats:16, vol:0.7}, notes(16, [
  [0, 3.4, 'F#3'], [3.5, 0.45, 'F#3', 0.7], [4, 3.4, 'F#3'], [7.5, 0.45, 'D3', 0.7],
  [8, 3.4, 'D3'], [11.5, 0.45, 'D3', 0.7], [12, 3.4, 'D3'], [15.5, 0.45, 'F#3', 0.7]], BASS));
/* 類比低音：高共振＋濾波包絡的「嘶吼」，跟著四和弦走 */
const ACID = syn('sawtooth', 'pluck', {size:7, alpha:0.7, q:9, fenv:0.7, d:0.3, s:0.3, r:0.12, oct:-1, rev:0.05, dly:0.08});
set('KeyX', {name:'類比低音 嘶吼', mode:'loop', beats:16, vol:0.55}, notes(16,
  [['D3', 'D4'], ['A3', 'A3'], ['F#3', 'F#4'], ['B3', 'B3']].flatMap(([r, o], bar) =>
    [[0, 0.4, r], [0.75, 0.2, r, 0.6], [1.5, 0.4, o, 0.8], [2.5, 0.4, r], [3, 0.2, r, 0.6], [3.5, 0.4, o, 0.85]].map(([b, l, n, w]) => [bar * 4 + b, l, n, w ?? 1])), ACID));
set('KeyC', {name:'持續低音 F♯', mode:'gate', beats:8, vol:0.5},
  [note(8, 0, 8, M('F#3'), syn('sub', 'swell', {size:10, alpha:0.6, oct:-1, rev:0, lfoD:3, lfoR:0.25}), 1)]);
const BIRD = syn('sine', 'hard', {a:0.01, r:0.1, size:30, alpha:0.4, glide:0.025, rev:0.5, dly:0.15});
set('KeyV', {name:'鳥鳴', mode:'loop', beats:8, vol:0.4}, [
  curve(8, 0, 0.25, u => midiToY(M('E5') + u * 5), {...BIRD, pan:0.55}), curve(8, 0.35, 0.6, u => midiToY(M('E5') + u * 5), {...BIRD, pan:0.55}),
  curve(8, 2.5, 2.7, u => midiToY(M('B5') - u * 6), {...BIRD, pan:-0.4}), curve(8, 2.8, 3, u => midiToY(M('B5') - u * 6), {...BIRD, pan:-0.4}),
  curve(8, 3.1, 3.6, u => midiToY(M('F#5') + Math.sin(u * Math.PI) * 5), {...BIRD, pan:-0.4}),
  curve(8, 5.5, 5.75, u => midiToY(M('A5') + u * 3), {...BIRD, pan:0.2}), curve(8, 5.9, 6.15, u => midiToY(M('A5') + u * 3), {...BIRD, pan:0.2})]);
set('KeyB', {name:'營火劈啪', mode:'loop', beats:4, vol:0.5},
  [curve(4, 0, 4, () => midiToY(M('E3')), syn('wind', 'soft', {size:4, alpha:0.55, texture:'grain', rev:0.15, a:0.3, r:0.3, pan:-0.15}), u => 0.55 + 0.15 * Math.sin(u * Math.PI * 6))]);
set('KeyN', {name:'黑膠底噪', mode:'loop', beats:4, vol:0.45},
  [curve(4, 0, 4, () => midiToY(M('A5')), syn('wind', 'soft', {size:3, alpha:0.4, texture:'grain', rev:0.05, a:0.3, r:0.3}), u => 0.6 + 0.1 * Math.sin(u * Math.PI * 8))]);
const TRAFFIC = syn('wind', 'swell', {size:14, alpha:0.6, texture:'mist', glide:0.5, rev:0.45, q:0});
set('KeyM', {name:'城市車流', mode:'oneshot', beats:8, vol:0.55}, [
  curve(8, 0, 5, u => midiToY(M('A3') + 7 * Math.sin(u * Math.PI)), {...TRAFFIC, pan:-0.5}, u => 0.2 + 0.8 * Math.sin(u * Math.PI)),
  curve(8, 3, 8, u => midiToY(M('E3') + 9 * Math.sin(u * Math.PI)), {...TRAFFIC, pan:0.5}, u => 0.2 + 0.8 * Math.sin(u * Math.PI))]);
set('Comma', {name:'地鐵進站', mode:'oneshot', beats:8, vol:0.55}, [
  curve(8, 0, 7.5, u => midiToY(M('C#3') + 14 * Math.sin(u * Math.PI) ** 2), syn('wind', 'swell', {size:16, alpha:0.7, texture:'mist', glide:0.6, rev:0.4, q:0}), u => 0.15 + 0.85 * Math.sin(u * Math.PI)),
  note(8, 0.5, 6.5, M('F#3'), syn('sub', 'swell', {size:8, alpha:0.5, oct:-1, rev:0.1, lfoD:20, lfoR:7}), 0.8)]);
/* 遠方警笛：A 與 D 兩個音慢慢滑來滑去（兩個音都在安全音裡） */
set('Period', {name:'遠方警笛', mode:'oneshot', beats:8, vol:0.35}, [phrase(8,
  [[0, 1, 'A4'], [1, 1, 'D5'], [2, 1, 'A4'], [3, 1, 'D5'], [4, 1, 'A4'], [5, 1, 'D5'], [6, 1.6, 'A4']],
  syn('sine', 'swell', {a:0.8, r:1.5, size:10, alpha:0.5, glide:0.35, texture:'mist', rev:0.6, pan:0.45}), u => 0.25 + 0.75 * Math.sin(u * Math.PI))]);
set('Slash', {name:'上升 → Drop', mode:'oneshot', beats:8, vol:0.55}, [
  curve(8, 0, 8, u => midiToY(M('F#3') + u * u * 24), syn('supersaw', 'swell', {size:16, alpha:0.55, uni:24, rev:0.45, texture:'wave', a:2}), u => 0.25 + 0.75 * u),
  curve(8, 1, 8, u => midiToY(M('C#4') + u * 26), syn('wind', 'swell', {size:24, alpha:0.6, texture:'mist', glide:0.3, rev:0.5}), u => 0.2 + 0.8 * u)]);

globalThis.OUT = {format:'inksynth-board', version:2, name:'遠行（C418 Excursions 風格）',
  bpm:S.bpm, root:S.root, scale:S.scale, quant:'bar', pads};
`;
vm.runInContext(GEN, sandbox);

let seed = 20261007;
const out = sandbox.OUT;
out.pads.forEach(p => p.objects.forEach(o => { o.seed = (seed = (seed * 1103515245 + 12345) >>> 0) % 1e9; }));
const round4 = (k, v) => typeof v === 'number' && !Number.isInteger(v) ? +v.toFixed(4) : v;
const file = path.join(ROOT, '音效板/11 遠行（C418 Excursions 風格）.inksynth.json');
fs.writeFileSync(file, JSON.stringify(out, round4));
console.log(`寫入 ${file}`);
out.pads.forEach(p => console.log(p.key.padEnd(10), p.mode.padEnd(8), String(p.beats).padStart(2), p.objects.length.toString().padStart(3), p.name));
console.log('空白格：', out.pads.filter(p => !p.objects.length).map(p => p.key));
