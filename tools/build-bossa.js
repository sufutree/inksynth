'use strict';
/* ============================================================
   build-bossa.js — 開發用工具，主程式不會載入這個檔案。
   產生 templates/bossa.js（Bossa Nova 範本，40 格全部填滿）。
   執行方式：在專案資料夾下執行  node tools/build-bossa.js

   和聲設計（讓任意組合都好聽的關鍵）：
   ・F 大調，和弦只用 Fmaj7 / Dm7 / B♭maj7 三個 —— 兩兩疊在一起都還是好聽的延伸和弦
     （Fmaj7+Dm7 = Dm9、Fmaj7+B♭maj7 = B♭maj9♯11、Dm7+B♭maj7 = B♭maj9），
     所以就算兩個循環錯開一小節也不會打架。
   ・旋律幾乎只用 F 大調五聲音階（F G A C D），疊在任何一個和弦上都是和弦音或 9、11、13 度。
   ・刻意不用 C7、Gm7（屬和弦的 B♭ 與 E 會和 Fmaj7 撞出小二度）。
   ・啟動對齊預設為「對小節」，所有循環都是 1 或 2 小節的倍數。
   ============================================================ */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');

const sandbox = {document:{currentScript:null, querySelector:() => null, querySelectorAll:() => []}, console, Math, JSON};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/core.js'), 'utf8'), sandbox);

const GEN = String.raw`
Object.assign(S, {root:5, scale:'major', bpm:124}); resetScaleCache();
const E = extNotes(), tonic = E.find(m => m >= 55 && (m - S.root) % 12 === 0), ti = E.indexOf(tonic);
const deg = d => E[ti + d];                                 // 音階級數 → MIDI（0 = F4）
const PEN = [0, 1, 2, 4, 5];                                // 五聲音階在大調裡的級數
const pen = i => deg(7 * Math.floor(i / 5) + PEN[((i % 5) + 5) % 5]);
const pads = PAD_KEYS.map((_, i) => newPad(i));
const set = (key, props, objs) => Object.assign(pads[PAD_KEYS.indexOf(key)], props, {objects:objs.flat().map(normalizeObj)});

/* ---- 物件產生器 ---- */
const syn = (tone, env, extra = {}) => ({tone, texture:'smooth', size:12, alpha:0.75, ...PDEF, ...envOf(env), ...extra});
const pt = (B, b, m, w = 1) => ({x:+(b / B).toFixed(5), y:+midiToY(m).toFixed(5), w:+w.toFixed(3)});
const note = (B, b, len, m, pr, w = 1) => ({type:'line', pts:[pt(B, b, m, w), pt(B, b + len, m, w * 0.85)], ...pr});
const notes = (B, list, pr) => list.map(([b, len, m, w]) => note(B, b, len, m, pr, w ?? 1));
/** 一條連續筆畫的樂句：每個音一段水平線，音與音之間用短斜線接起來（滑音） */
const phrase = (B, list, pr, wf = u => 0.55 + 0.45 * Math.sin(u * Math.PI)) => {
  const pts = [], end = list[list.length - 1][0] + list[list.length - 1][1], b0 = list[0][0];
  list.forEach(([b, len, m], j) => {
    const u0 = (b - b0) / (end - b0), u1 = (b + len * 0.86 - b0) / (end - b0);
    pts.push(pt(B, b, m, wf(u0)), pt(B, b + len * 0.86, m, wf(u1)));
  });
  return {type:'line', pts, ...pr};
};
/** 曲線（音效用） */
const curve = (B, b0, b1, fn, pr, wf = () => 1) => { const pts = [], n = Math.max(12, Math.round((b1 - b0) * 24));
  for(let j = 0; j <= n; j++){ const u = j / n; pts.push({x:+((b0 + (b1 - b0) * u) / B).toFixed(5), y:+clamp(fn(u), MEL_TOP, MEL_BOT).toFixed(5), w:+wf(u).toFixed(3)}); }
  return {type:'line', pts, ...pr}; };
const chord = (B, b, len, m, shape, pr) => ({type:'chord', x:b / B, y:midiToY(m), len:len / B, shape, ...pr});
const drop = (B, b, lane, alpha, extra = {}) => ({type:'drop', x:b / B, lane, alpha, ...PDEF, rev:0.12, ...extra});
const drops = (B, beats, lane, alpha, extra = {}) => beats.map((b, j) => drop(B, b, lane,
  typeof alpha === 'function' ? alpha(j, b) : alpha, typeof extra === 'function' ? extra(j, b) : extra));

/* ---- 和弦（根音位置） ---- */
const F3 = deg(-7), D3 = deg(-9), Bb3 = deg(-4), D4 = deg(-2), F4 = deg(0), C4 = deg(-3);

/* 鼓組音色 */
const KICK = {tune:-3, dec:1.1, rev:0.05};
const RIM  = {tune:11, dec:0.22, rev:0.18};
const SHK  = (j) => ({tune:3, dec:0.8, pan:j % 2 ? 0.3 : 0.18, rev:0.08});
const CLAVE = [0, 1.5, 3, 5, 6.5];                            // 巴西 Bossa 響棒（2 小節）
const KICK_BAR = [0, 1.5, 2, 3.5];                            // 附點四分＋八分
const shakerAcc = j => [0.42, 0.18, 0.3, 0.22][j % 4];

/* ============ 第一列：節奏 ============ */
set('Digit1', {name:'Bossa 律動', mode:'loop', beats:8, vol:0.85}, [
  drops(8, [...KICK_BAR, ...KICK_BAR.map(b => b + 4)], 'kick', j => j % 2 ? 0.55 : 0.75, KICK),
  drops(8, CLAVE, 'snare', 0.55, RIM),
  drops(8, Array.from({length:16}, (_, j) => j / 2), 'hat', j => j % 2 ? 0.42 : 0.26, SHK)]);
set('Digit2', {name:'沙鈴 Shaker', mode:'loop', beats:4, vol:0.75},
  drops(4, Array.from({length:16}, (_, j) => j / 4), 'hat', shakerAcc, SHK));
set('Digit3', {name:'響棒 Clave', mode:'loop', beats:8, vol:0.8}, [
  drops(8, CLAVE, 'snare', 0.62, RIM),
  drops(8, [2, 6], 'tom', 0.35, {tune:14, dec:0.18, pan:-0.35, rev:0.15})]);
set('Digit4', {name:'蘇爾多 Surdo', mode:'loop', beats:4, vol:0.8}, [
  drops(4, [0, 2], 'tom', 0.42, {tune:-10, dec:0.45, pan:-0.1}),
  drops(4, [1, 3], 'tom', 0.78, {tune:-10, dec:1.6, pan:-0.1, rev:0.15})]);
set('Digit5', {name:'鈴鼓 Pandeiro', mode:'loop', beats:4, vol:0.75}, [
  drops(4, Array.from({length:16}, (_, j) => j / 4), 'hat', j => [0.5, 0.2, 0.36, 0.24][j % 4], j => ({tune:-1, dec:1.4, pan:0.35, rev:0.1})),
  drops(4, [0, 2], 'tom', 0.45, {tune:5, dec:0.35, pan:0.25}),
  drops(4, [1.5, 3.5], 'clap', 0.35, {tune:2, dec:0.4, pan:0.3})]);
set('Digit6', {name:'鼓刷 Brush', mode:'loop', beats:4, vol:0.75}, [
  drops(4, [0, 1, 2, 3], 'snare', j => j % 2 ? 0.38 : 0.26, j => ({tune:-6, dec:1.8, pan:j % 2 ? 0.2 : -0.2, rev:0.2})),
  drops(4, [0.5, 1.5, 2.5, 3.5], 'hat', 0.2, {tune:-2, dec:1.6, rev:0.15})]);
/* 阿哥哥鈴：兩個有音高的鈴（C6 與 A5），五聲音階裡永遠不衝突 */
const AGO = syn('bell', 'pluck', {d:0.25, r:0.35, s:0.05, size:20, alpha:0.42, rev:0.2, pan:0.4});
set('Digit7', {name:'阿哥哥鈴', mode:'loop', beats:8, vol:0.65},
  notes(8, [[0, 0.3, deg(11)], [0.5, 0.3, deg(9)], [1.5, 0.3, deg(9)], [2, 0.3, deg(11)], [3, 0.3, deg(9)],
            [4, 0.3, deg(11)], [4.5, 0.3, deg(11)], [5, 0.3, deg(9)], [6, 0.3, deg(11)], [6.5, 0.3, deg(9)], [7.5, 0.3, deg(9)]], AGO));
set('Digit8', {name:'過門 Fill', mode:'oneshot', beats:4, vol:0.8}, [
  drops(4, [0, 1.5], 'kick', 0.7, KICK), drops(4, [0, 1.5], 'snare', 0.55, RIM),
  drops(4, [2, 2.25, 2.5, 2.75, 3, 3.25], 'tom', j => 0.45 + j * 0.08, j => ({tune:7 - j * 3, dec:0.9, pan:0.5 - j * 0.2, rev:0.15})),
  drops(4, [3.5], 'kick', 0.8, KICK), drops(4, [3.5], 'ohat', 0.4, {dec:1.8, rev:0.25})]);
set('Digit9', {name:'熱情 Samba', mode:'loop', beats:4, vol:0.8}, [
  drops(4, [0, 0.75, 1, 2, 2.75, 3], 'kick', j => j % 3 === 0 ? 0.75 : 0.45, KICK),
  drops(4, [1, 3], 'tom', 0.7, {tune:-10, dec:1.3, rev:0.12}),
  drops(4, Array.from({length:16}, (_, j) => j / 4), 'hat', shakerAcc, SHK),
  drops(4, [0.5, 1.75, 2.5, 3.25], 'snare', 0.45, RIM)]);
set('Digit0', {name:'結尾 Ending', mode:'oneshot', beats:4, vol:0.85}, [
  drops(4, [0, 1.5], 'kick', 0.85, KICK), drops(4, [0, 1.5], 'snare', 0.6, RIM),
  drops(4, [1.5], 'ohat', 0.55, {dec:2.5, rev:0.35}), drops(4, [1.5], 'tom', 0.6, {tune:-10, dec:1.8, rev:0.2})]);

/* ============ 第二列：和聲 ============ */
/* 吉他 Batida：João Gilberto 式的切分刷法，最後半拍提前換到下一個和弦 */
const GTR = syn('pluck', 'pluck', {size:11, alpha:0.62, d:0.4, r:0.3, rev:0.22, pan:-0.18, dly:0.04});
const batida = (A, Bm) => [
  ...[[0, 0.45], [1, 0.4], [1.5, 0.45], [2.5, 0.4]].map(([b, l]) => chord(8, b, l, A, 'sq', GTR)),
  ...[[3.5, 0.45], [4.5, 0.4], [5, 0.45], [6, 0.4]].map(([b, l]) => chord(8, b, l, Bm, 'sq', GTR)),
  chord(8, 7.5, 0.45, A, 'sq', GTR)];
set('KeyQ', {name:'吉他 Fmaj7→B♭', mode:'loop', beats:8, vol:0.8}, batida(F3, Bb3));
set('KeyW', {name:'吉他 Fmaj7→Dm7', mode:'loop', beats:8, vol:0.8}, batida(F3, D3));
/* 電鋼琴：FM 鐘聲 + 低濾波 = Rhodes 質感 */
const RH = syn('bell', 'pluck', {size:9, alpha:0.6, d:1.2, s:0.35, r:1.1, rev:0.3, lfoD:5, lfoR:4.5});
set('KeyE', {name:'電鋼 四和弦', mode:'loop', beats:16, vol:0.75},
  [[0, F3, 'sq'], [4, D3, 'sq'], [8, Bb3, 'sq'], [12, Bb3, 'tri']].map(([b, m, s]) => chord(16, b, 3.8, m, s, RH)));
const RH2 = {...RH, size:11, alpha:0.55, d:0.5, s:0.2, r:0.5, pan:0.25, dly:0.18};
set('KeyR', {name:'電鋼 切分', mode:'loop', beats:8, vol:0.7}, [
  chord(8, 1.5, 0.5, F4, 'sq', RH2), chord(8, 2.5, 0.4, F4, 'sq', RH2),
  chord(8, 3.5, 0.5, Bb3, 'sq', RH2), chord(8, 5.5, 0.5, Bb3, 'sq', RH2), chord(8, 6.5, 0.4, Bb3, 'sq', RH2)]);
set('KeyT', {name:'弦樂 Pad', mode:'loop', beats:8, vol:0.6},
  [chord(8, 0, 8, D4, 'sq', syn('sawtooth', 'swell', {size:8, alpha:0.5, uni:16, rev:0.5, texture:'mist', lfoD:6, lfoR:4.8}))]);
set('KeyY', {name:'人聲 Pad「啊」', mode:'loop', beats:4, vol:0.6},
  [chord(4, 0, 4, F4, 'sq', syn('choir', 'soft', {size:16, alpha:0.55, rev:0.55, a:0.5, r:1.2, lfoD:10, lfoR:4.6, pan:0.1}))]);
const ORG = syn('organ', 'soft', {a:0.06, size:9, alpha:0.45, rev:0.3, texture:'wave', lfoR:6.2, lfoD:8});
set('KeyU', {name:'風琴 Organ', mode:'loop', beats:8, vol:0.6}, [chord(8, 0, 3.9, F3, 'sq', ORG), chord(8, 4, 3.9, Bb3, 'sq', ORG)]);
/* 吉他分解：F6/9 的音（F A C D G）全部都在五聲音階內，怎麼疊都安全 */
const ARP = syn('pluck', 'pluck', {size:12, alpha:0.6, d:0.5, r:0.5, rev:0.25, dly:0.15, pan:0.3});
set('KeyI', {name:'吉他分解', mode:'loop', beats:4, vol:0.7},
  notes(4, [[0, 1.4, deg(-7), 0.95], [0.5, 0.9, deg(-3), 0.7], [1, 0.9, deg(2), 0.8], [1.5, 0.9, deg(1), 0.6],
            [2, 1.4, deg(-3), 0.85], [2.5, 0.9, deg(2), 0.7], [3, 0.9, deg(5), 0.8], [3.5, 0.5, deg(1), 0.6]], ARP));
/* 刷弦 Fmaj9：每根弦錯開一點點時間，畫面上是一道斜向的瀑布 */
const STR = syn('pluck', 'pluck', {size:13, alpha:0.6, d:0.8, s:0.2, r:1.2, rev:0.35});
set('KeyO', {name:'刷弦 Fmaj9', mode:'oneshot', beats:4, vol:0.75},
  [deg(-7), deg(-3), deg(-1), deg(2), deg(4), deg(8)].map((m, j) => note(4, j * 0.07, 3.6 - j * 0.07, m, {...STR, pan:-0.3 + j * 0.12}, 1 - j * 0.06)));
const DUSK = syn('sine', 'swell', {size:20, alpha:0.55, texture:'mist', lfoD:8, lfoR:0.4, rev:0.5});
set('KeyP', {name:'暮色 Pad', mode:'loop', beats:8, vol:0.6},
  [[deg(-2), -0.3], [deg(2), 0.3], [deg(6), 0]].map(([m, pan]) => curve(8, 0, 8, () => midiToY(m), {...DUSK, pan}, u => 0.55 + 0.45 * Math.sin(u * Math.PI))));

/* ============ 第三列：旋律 ============ */
const FLUTE = syn('triangle', 'soft', {a:0.06, d:0.3, s:0.9, r:0.4, size:16, alpha:0.8, texture:'wave', lfoR:5.2, glide:0.06, rev:0.32, dly:0.12});
const MEL_A = [[0, 0.5, 2], [0.5, 1, 4], [1.5, 0.5, 5], [2, 0.5, 4], [2.5, 1, 2], [3.5, 0.5, 1],
               [4, 1.5, 2], [5.5, 0.5, 0], [6, 0.5, 1], [6.5, 1.3, 2]];
set('KeyA', {name:'長笛 主旋律', mode:'oneshot', beats:8, vol:0.75}, [phrase(8, MEL_A.map(([b, l, d]) => [b, l, deg(d)]), FLUTE)]);
set('KeyS', {name:'長笛 答句', mode:'oneshot', beats:8, vol:0.75}, [phrase(8,
  [[0, 0.5, 7], [0.5, 0.5, 5], [1, 1, 4], [2, 0.5, 5], [2.5, 1, 7], [3.5, 0.5, 8], [4, 1, 9], [5, 0.5, 8], [5.5, 0.5, 7], [6, 1.8, 5]]
    .map(([b, l, d]) => [b, l, deg(d)]), {...FLUTE, pan:0.15})]);
const SCAT = syn('choir', 'soft', {a:0.03, d:0.2, s:0.7, r:0.18, size:15, alpha:0.7, rev:0.35, pan:-0.2});
set('KeyD', {name:'人聲 Scat', mode:'oneshot', beats:8, vol:0.7},
  notes(8, [[0, 0.4, 4], [0.5, 0.4, 4], [1.5, 0.4, 2], [2, 0.9, 4], [3.5, 0.4, 5], [4, 0.4, 4], [4.5, 0.4, 2], [5.5, 0.4, 1], [6, 1.6, 2]]
    .map(([b, l, d], j) => [b, l, deg(d), [0.9, 0.6, 0.75, 1, 0.8, 0.7, 0.65, 0.6, 0.9][j]]), SCAT));
const WHISTLE = syn('sine', 'soft', {a:0.04, d:0.2, s:0.95, r:0.3, size:22, alpha:0.6, texture:'wave', lfoR:5.8, glide:0.08, rev:0.4, dly:0.2});
set('KeyF', {name:'口哨', mode:'oneshot', beats:8, vol:0.6}, [
  phrase(8, [[0, 1, 11], [1, 0.5, 9], [1.5, 1.5, 8]].map(([b, l, d]) => [b, l, deg(d)]), WHISTLE),
  phrase(8, [[4, 0.5, 7], [4.5, 0.5, 8], [5, 1, 9], [6, 1.6, 7]].map(([b, l, d]) => [b, l, deg(d)]), WHISTLE)]);
const SOLO = syn('pluck', 'pluck', {size:13, alpha:0.7, d:0.45, s:0.15, r:0.35, rev:0.25, dly:0.25, pan:-0.25});
set('KeyG', {name:'吉他 獨奏', mode:'oneshot', beats:4, vol:0.75},
  notes(4, [[0, 0.25, 4], [0.25, 0.25, 5], [0.5, 0.5, 7], [1, 0.5, 5], [1.5, 0.75, 4], [2.5, 0.25, 2], [2.75, 0.25, 4], [3, 0.9, 2]]
    .map(([b, l, d]) => [b, l, deg(d)]), SOLO));
const VIB = syn('bell', 'pluck', {size:15, alpha:0.65, d:0.9, s:0.2, r:1.4, rev:0.42, dly:0.22, texture:'wave', lfoR:5});
set('KeyH', {name:'顫音琴 動機', mode:'oneshot', beats:4, vol:0.65},
  notes(4, [[0, 0.5, 4], [0.75, 0.5, 2], [1.5, 0.5, 4], [2, 1.8, 7]].map(([b, l, d]) => [b, l, deg(d)]), VIB));
const RUN = {...RH, size:13, alpha:0.6, d:0.4, s:0.1, r:0.6, dly:0.2, lfoD:0, pan:0.3};
set('KeyJ', {name:'電鋼 下行', mode:'oneshot', beats:2, vol:0.65},
  notes(2, Array.from({length:8}, (_, j) => [j * 0.25, 0.24, pen(8 - j), 1 - j * 0.05]), RUN));
const MUTE = syn('sawtooth', 'soft', {a:0.05, d:0.3, s:0.8, r:0.25, size:7, alpha:0.65, glide:0.05, rev:0.3, texture:'wave', lfoR:5.5, pan:0.2});
set('KeyK', {name:'弱音小號', mode:'oneshot', beats:4, vol:0.7}, [phrase(4,
  [[0, 0.75, 4], [0.75, 0.25, 5], [1, 1, 7], [2.5, 0.5, 5], [3, 0.9, 4]].map(([b, l, d]) => [b, l, deg(d)]), MUTE)]);
const STAR = syn('bell', 'pluck', {size:22, alpha:0.5, d:0.6, s:0.05, r:1.2, rev:0.5, dly:0.3});
set('KeyL', {name:'星光琶音', mode:'oneshot', beats:2, vol:0.55},
  notes(2, Array.from({length:7}, (_, j) => [j * 0.25, 0.22, pen(2 + j), 0.6 + j * 0.06]), STAR).map((o, j) => ({...o, pan:-0.5 + j / 6})));
set('Semicolon', {name:'長笛 和聲', mode:'oneshot', beats:8, vol:0.6}, [phrase(8, MEL_A.map(([b, l, d]) => {
  const k = PEN.indexOf(((d % 7) + 7) % 7) + 5 * Math.floor(d / 7);       // 主旋律下方的五聲「三度」→ 四度和聲
  return [b, l, pen(k - 2)]; }), {...FLUTE, alpha:0.6, pan:-0.3, texture:'wave', lfoR:4.7})]);

/* ============ 第四列：低音與氛圍 ============ */
const BASS = syn('pluck', 'pluck', {size:5, alpha:0.85, d:0.6, s:0.35, r:0.12, oct:-1, fenv:0.12, rev:0.04, dly:0});
const bassLine = list => notes(8, list.map(([b, l, m]) => [b, l, m, 1]), BASS);
set('KeyZ', {name:'低音 F→B♭', mode:'loop', beats:8, vol:0.85}, bassLine([
  [0, 1.4, F3], [1.5, 0.4, deg(-3)], [2, 1.4, deg(-3)], [3.5, 0.45, Bb3],
  [4, 1.4, Bb3], [5.5, 0.4, F3], [6, 1.4, F3], [7.5, 0.45, F3]]));
set('KeyX', {name:'低音 F→Dm', mode:'loop', beats:8, vol:0.85}, bassLine([
  [0, 1.4, F3], [1.5, 0.4, deg(-3)], [2, 1.4, deg(-3)], [3.5, 0.45, D3],
  [4, 1.4, D3], [5.5, 0.4, deg(-3)], [6, 1.4, deg(-3)], [7.5, 0.45, F3]]));
set('KeyC', {name:'低頻 Drone', mode:'loop', beats:8, vol:0.6},
  [note(8, 0, 8, F3, syn('sub', 'swell', {size:10, alpha:0.6, oct:-1, rev:0, lfoD:3, lfoR:0.25}), 1)]);
const SEA = syn('wind', 'swell', {size:24, alpha:0.75, texture:'mist', glide:0.4, rev:0.45, q:0});
set('KeyV', {name:'海浪', mode:'oneshot', beats:8, vol:0.7}, [
  curve(8, 0, 4.2, u => 0.62 - 0.22 * Math.sin(u * Math.PI), {...SEA, pan:-0.4}, u => 0.2 + 0.8 * Math.sin(u * Math.PI)),
  curve(8, 3.6, 8, u => 0.66 - 0.26 * Math.sin(u * Math.PI), {...SEA, pan:0.4}, u => 0.2 + 0.8 * Math.sin(u * Math.PI))]);
const BIRD = syn('sine', 'hard', {a:0.01, r:0.12, size:30, alpha:0.45, glide:0.03, rev:0.45, dly:0.2});
set('KeyB', {name:'鳥鳴', mode:'oneshot', beats:4, vol:0.45}, [
  curve(4, 0, 0.3, u => midiToY(deg(8) + u * 5), {...BIRD, pan:0.5}), curve(4, 0.4, 0.7, u => midiToY(deg(8) + u * 5), {...BIRD, pan:0.5}),
  curve(4, 2, 2.2, u => midiToY(deg(11) - u * 5), {...BIRD, pan:-0.4}), curve(4, 2.3, 2.5, u => midiToY(deg(11) - u * 5), {...BIRD, pan:-0.4}),
  curve(4, 2.6, 3.1, u => midiToY(deg(8) + Math.sin(u * Math.PI) * 4), {...BIRD, pan:-0.4})]);
set('KeyN', {name:'黑膠沙沙聲', mode:'loop', beats:4, vol:0.55},
  [curve(4, 0, 4, () => midiToY(deg(11)), syn('wind', 'soft', {size:3, alpha:0.4, texture:'grain', rev:0.05, a:0.3, r:0.3}), u => 0.6 + 0.1 * Math.sin(u * Math.PI * 8))]);
const HARP = syn('pluck', 'pluck', {size:16, alpha:0.55, d:0.6, s:0.08, r:0.9, rev:0.45, dly:0.12});
set('KeyM', {name:'豎琴刷奏', mode:'oneshot', beats:2, vol:0.6},
  notes(2, Array.from({length:12}, (_, j) => [j * 0.11, 0.6, pen(8 - j), 0.95 - j * 0.04]), HARP).map((o, j) => ({...o, pan:0.5 - j / 11})));
const CHIME = syn('bell', 'pluck', {size:24, alpha:0.42, d:1, s:0.05, r:2, rev:0.6, dly:0.25});
set('Comma', {name:'風鈴', mode:'oneshot', beats:8, vol:0.5},
  notes(8, [[0, 0.5, pen(6)], [0.6, 0.5, pen(8)], [1.5, 0.5, pen(5)], [2.4, 0.5, pen(7)], [3.1, 0.5, pen(4)],
            [4.2, 0.5, pen(8)], [5.1, 0.5, pen(6)], [6.3, 1, pen(7)]].map(([b, l, m], j) => [b, l, m, 0.5 + (j % 3) * 0.2]), CHIME)
    .map((o, j) => ({...o, pan:Math.sin(j * 2.1) * 0.6})));
const CUICA = syn('sine', 'hard', {a:0.01, r:0.1, size:14, alpha:0.55, glide:0.05, rev:0.2, pan:-0.35});
set('Period', {name:'庫伊卡 Cuíca', mode:'loop', beats:4, vol:0.45}, [
  curve(4, 0.5, 0.95, u => midiToY(pen(2) + Math.sin(u * Math.PI) * 7), CUICA, u => 1 - u * 0.4),
  curve(4, 2.5, 2.8, u => midiToY(pen(3) + Math.sin(u * Math.PI) * 5), CUICA, u => 0.8 - u * 0.3),
  curve(4, 3, 3.45, u => midiToY(pen(2) + Math.sin(u * Math.PI) * 7), CUICA, u => 1 - u * 0.4)]);
const FIN = syn('bell', 'pluck', {size:12, alpha:0.6, d:2, s:0.3, r:3, rev:0.55});
set('Slash', {name:'收尾 Fmaj9', mode:'oneshot', beats:8, vol:0.7}, [
  chord(8, 0, 7, F3, 'sq', FIN),
  chord(8, 0.05, 7.5, F4, 'tri', syn('choir', 'swell', {size:14, alpha:0.45, rev:0.6, a:0.8, r:2.5, texture:'mist'})),
  note(8, 0.1, 6, deg(8), {...FIN, size:20, alpha:0.55, dly:0.3}, 0.8)]);

globalThis.OUT = {format:'inksynth-board', version:2, id:'bossa', name:'Bossa Nova 海灘',
  desc:'F 大調・124 BPM・吉他切分、電鋼琴、長笛與巴西打擊，任意疊加都和諧',
  bpm:S.bpm, root:S.root, scale:S.scale, quant:'bar', pads};
`;
vm.runInContext(GEN, sandbox);

/* 種子固定，重新產生時結果不變 */
let seed = 20261002;
const out = sandbox.OUT;
out.pads.forEach(p => p.objects.forEach(o => { o.seed = (seed = (seed * 1103515245 + 12345) >>> 0) % 1e9; }));
const round4 = (k, v) => typeof v === 'number' && !Number.isInteger(v) ? +v.toFixed(4) : v;
const file = path.join(ROOT, 'templates/bossa.js');
fs.writeFileSync(file, `/* InkSynth 範本：${out.name}（${out.desc}）
   這是一般的 JSON 資料，外面包一層 InkTemplates.add(...) 讓瀏覽器在本機（file://）也能載入。
   由 tools/build-bossa.js 產生。 */
InkTemplates.add(${JSON.stringify(out, round4)});
`);
const empty = out.pads.filter(p => !p.objects.length).map(p => p.key);
console.log(`寫入 ${file}`);
out.pads.forEach(p => console.log(p.key.padEnd(10), p.mode.padEnd(8), String(p.beats).padStart(2), p.objects.length.toString().padStart(3), p.name));
console.log('空白格：', empty.length ? empty : '無');
