'use strict';
/* ============================================================
   build-mega.js — 開發用工具，主程式不會載入這個檔案。
   一次產生 4 套「40 格全滿」的範本：templates/cinematic.js、synthwave.js、citypop.js、liquid.js
   執行方式：在專案資料夾下執行  node tools/build-mega.js

   設計重點：
   ・每套都有固定的 8 小節和弦進行，所有循環都是 1／2／4／8 小節，疊在一起會在同一個小節線上對齊。
   ・大量 4 小節（16 拍）與 8 小節（32 拍）的長段落：主題、副題、對位、琶音、低音線、整段和弦。
   ・旋律用「強拍落和弦音、弱拍走音階」的規則產生，種子固定，重新產生的結果不變。
   ・示範「特例」：過門對拍、衝擊音效立即發聲；上升／下墜音效用半音階的獨立調性，滑音才平順。
   ============================================================ */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');

/* ================= 四種風格 =================
   prog：8 個小節各自的和弦（音階級數，0＝主和弦）
   T：每個角色的音色 [tone, 包絡, 其他參數]；N：每個角色的名稱
   drum：一小節的鼓型（拍數位置），fill：過門小節 */
const STYLES = {
  cinematic: {
    name:'電影史詩', desc:'D 小調・88 BPM・8 小節史詩進行、太鼓、弦樂與合唱', root:2, scale:'minor', bpm:88, seed:11,
    prog:[0, 5, 2, 6, 0, 3, 5, 4], shape:'tri', buildLane:'tom',
    drum:{kick:[0, 2.5], tom:[1, 1.75, 3], snare:[2], ohat:[], hat:[0.5, 1.5, 2.5, 3.5]},
    drumB:{kick:[0, 0.75, 2.5], tom:[1, 1.5, 3, 3.25, 3.5], snare:[2], hat:[0.5, 1.5, 2.5, 3.5]},
    fill:{tom:[0, 0.5, 1, 1.5, 2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75], kick:[0, 2]},
    hats:{hat:[0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], ohat:[1.75, 3.75]},
    perc:{tom:[0, 0.75, 1.5, 2, 2.75, 3.5], clap:[1, 3]},
    lane:{kick:{tune:-5, dec:1.6, rev:0.25}, tom:{tune:-7, dec:1.5, rev:0.3}, snare:{tune:-8, dec:1.4, rev:0.35}, hat:{tune:-3, dec:0.8, rev:0.2}, ohat:{dec:1.6, rev:0.3}, clap:{tune:-2, rev:0.4}},
    rhyA:[[[0, 1.5], [1.5, 0.5], [2, 2]], [[0, 1], [1, 1], [2, 1.5], [3.5, 0.5]], [[0, 3], [3, 1]], [[0, 4]]],
    rhyB:[[[0, 0.5], [0.5, 0.5], [1, 1], [2, 2]], [[0, 2], [2, 1], [3, 1]], [[0, 1.5], [1.5, 0.5], [2, 1], [3, 1]], [[0, 4]]],
    bass:[[0, 1.5, 'r'], [1.5, 0.5, 'r'], [2, 1.5, '5'], [3.5, 0.5, 'a']],
    bassB:[[0, 0.5, 'r'], [0.5, 0.5, 'r'], [1, 0.5, 'o'], [1.5, 0.5, 'r'], [2, 0.5, 'r'], [2.5, 0.5, '5'], [3, 0.5, 'o'], [3.5, 0.5, 'a']],
    stab:[[0, 0.75], [1.5, 0.5], [2.5, 0.5], [3, 0.75]], arpStep:0.5, seqStep:0.25,
    T:{
      padProg8:['supersaw', 'swell', {size:12, alpha:0.55, uni:18, rev:0.55, texture:'mist'}],
      stabs4:['sawtooth', 'hard', {size:14, alpha:0.65, fenv:0.4, q:2, rev:0.4, drive:0.15}],
      arpProg8:['pluck', 'pluck', {size:16, alpha:0.6, rev:0.45, dly:0.25, pan:-0.25}],
      keys8:['bell', 'pluck', {size:10, alpha:0.55, d:1.2, s:0.25, r:1.4, rev:0.5}],
      strings8:['sawtooth', 'soft', {size:9, alpha:0.55, uni:14, a:0.6, r:1.2, rev:0.5, lfoD:6, lfoR:5}],
      choir4:['choir', 'swell', {size:18, alpha:0.6, rev:0.6, lfoD:10, lfoR:4.6}],
      offbeat4:['organ', 'hard', {size:10, alpha:0.5, rev:0.35, pan:0.2}],
      progB8:['triangle', 'soft', {size:14, alpha:0.6, rev:0.5, a:0.4, texture:'mist'}],
      strum:['pluck', 'pluck', {size:14, alpha:0.6, d:0.9, s:0.2, r:1.5, rev:0.5}],
      highPad4:['bell', 'swell', {size:24, alpha:0.4, rev:0.7, texture:'mist', oct:1}],
      themeA8:['sawtooth', 'soft', {size:12, alpha:0.75, a:0.08, glide:0.06, rev:0.45, fenv:0.2, lfoD:8, lfoR:5.2, texture:'wave'}],
      themeB8:['choir', 'soft', {size:16, alpha:0.7, a:0.12, rev:0.55, lfoD:10, glide:0.08}],
      hook4:['square', 'hard', {size:10, alpha:0.6, rev:0.4, dly:0.3, drive:0.2}],
      counter8:['triangle', 'soft', {size:14, alpha:0.65, a:0.1, rev:0.45, lfoD:6, texture:'wave', glide:0.05}],
      seq4:['pulse', 'pluck', {size:12, alpha:0.5, rev:0.35, dly:0.3, pan:0.3}],
      solo4:['supersaw', 'hard', {size:13, alpha:0.65, glide:0.03, rev:0.4, dly:0.2, uni:12}],
      harmony8:['sawtooth', 'soft', {size:9, alpha:0.55, a:0.1, rev:0.45, pan:-0.3, uni:16, texture:'wave'}],
      bellMotif2:['bell', 'pluck', {size:18, alpha:0.55, d:0.8, s:0.1, r:1.6, rev:0.6, dly:0.2}],
      callResp4:[['sawtooth', 'hard', {size:12, alpha:0.65, rev:0.35, pan:-0.35, fenv:0.3}], ['choir', 'soft', {size:16, alpha:0.6, rev:0.5, pan:0.35, a:0.05}]],
      glideLead4:['sine', 'soft', {size:22, alpha:0.7, glide:0.25, rev:0.5, lfoD:12, lfoR:5, texture:'wave'}],
      bass8:['sub', 'hard', {size:10, alpha:0.85, rev:0.05}], bass4:['sawtooth', 'hard', {size:6, alpha:0.7, fenv:0.45, q:5, rev:0.1}],
      sub8:['sine', 'soft', {size:20, alpha:0.8, a:0.1, rev:0}],
      riser4:['supersaw', 'swell', {size:20, alpha:0.6, uni:30, rev:0.5, texture:'wave'}],
      down2:['wind', 'hard', {size:22, alpha:0.75, rev:0.5, glide:0.2, texture:'mist'}],
      texture8:['wind', 'swell', {size:26, alpha:0.6, rev:0.6, texture:'mist', glide:0.4}],
      noise4:['wind', 'swell', {size:30, alpha:0.7, rev:0.4, glide:0.3}],
      stutter:['supersaw', 'hard', {size:16, alpha:0.55, texture:'dash', rev:0.35}],
      drone8:['organ', 'swell', {size:12, alpha:0.5, rev:0.5, lfoD:4, lfoR:0.3, texture:'mist'}],
      outro:['choir', 'swell', {size:16, alpha:0.55, rev:0.7, r:2.5, texture:'mist'}],
    },
    N:{groove4:'太鼓 4 小節', groove8:'戰鼓 8 小節', hats:'金屬節拍', perc:'行軍鼓', half:'沉重半拍', break:'寂靜脈動', build:'戰鼓漸強',
       fill:'太鼓過門', impact:'巨響 Impact', ending:'終止重擊', padProg8:'弦樂 8 小節進行', stabs4:'銅管重音', arpProg8:'豎琴琶音 8 小節',
       keys8:'鐘琴和聲', strings8:'弦樂長音', choir4:'合唱「啊」', offbeat4:'管風琴反拍', progB8:'第二進行', strum:'豎琴刷奏', highPad4:'星空泛音',
       themeA8:'英雄主題 8 小節', themeB8:'合唱副題 8 小節', hook4:'號角動機', counter8:'大提琴對位', seq4:'緊張十六分', solo4:'追逐樂句',
       harmony8:'主題三度和聲', bellMotif2:'命運鐘聲', callResp4:'銅管與合唱對答', glideLead4:'哀歌滑音', bass8:'低音提琴 8 小節',
       bass4:'推進低音', sub8:'深淵次低音', riser4:'張力上升', down2:'墜落', texture8:'戰場風聲', noise4:'沙塵掃過', stutter:'斷續銅管',
       drone8:'持續低鳴', outro:'終章和弦'},
  },
  synthwave: {
    name:'Synthwave 夕陽公路', desc:'E 小調・104 BPM・80 年代合成器、閘門小鼓與八分音低音', root:4, scale:'minor', bpm:104, seed:22,
    prog:[0, 5, 2, 6, 0, 5, 3, 4], shape:'tri',
    drum:{kick:[0, 2], clap:[1, 3], hat:[0.5, 1.5, 2.5, 3.5]},
    drumB:{kick:[0, 1.5, 2], clap:[1, 3], hat:[0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]},
    fill:{tom:[0, 0.5, 1, 1.5, 2, 2.5], clap:[3, 3.25, 3.5, 3.75], kick:[0]},
    hats:{hat:[0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75], ohat:[0.5, 2.5]},
    perc:{tom:[0.75, 2.75], clap:[3.5], snare:[1.75]},
    lane:{kick:{tune:-2, dec:1.2, rev:0.05}, clap:{dec:1.8, rev:0.6}, snare:{dec:1.5, rev:0.5}, hat:{tune:2, rev:0.08}, ohat:{rev:0.15}, tom:{tune:2, dec:1.2, rev:0.4}},
    rhyA:[[[0, 0.5], [0.5, 0.5], [1, 1], [2, 0.5], [2.5, 1.5]], [[0, 1], [1, 0.5], [1.5, 0.5], [2, 2]], [[0, 0.5], [0.5, 0.5], [1, 0.5], [1.5, 0.5], [2, 2]], [[0, 3], [3, 0.5], [3.5, 0.5]]],
    rhyB:[[[0, 2], [2, 1], [3, 1]], [[0, 1.5], [1.5, 1.5], [3, 1]], [[0, 0.5], [0.5, 1], [1.5, 0.5], [2, 2]], [[0, 4]]],
    bass:[[0, 0.5, 'r'], [0.5, 0.5, 'o'], [1, 0.5, 'r'], [1.5, 0.5, 'o'], [2, 0.5, 'r'], [2.5, 0.5, 'o'], [3, 0.5, 'r'], [3.5, 0.5, 'o']],
    bassB:[[0, 0.75, 'r'], [0.75, 0.25, 'r'], [1, 0.5, 'o'], [1.5, 0.5, '5'], [2, 0.75, 'r'], [2.75, 0.25, 'r'], [3, 0.5, 'o'], [3.5, 0.5, 'a']],
    stab:[[0, 0.5], [0.75, 0.5], [1.5, 0.5], [2.5, 0.5], [3.25, 0.5]], arpStep:0.25, seqStep:0.25,
    T:{
      padProg8:['supersaw', 'soft', {size:14, alpha:0.55, uni:24, rev:0.5, a:0.3}],
      stabs4:['sawtooth', 'hard', {size:16, alpha:0.6, rev:0.3, dly:0.2}],
      arpProg8:['pulse', 'hard', {size:13, alpha:0.5, dly:0.35, rev:0.2, pan:0.25}],
      keys8:['organ', 'hard', {size:13, alpha:0.5, rev:0.3}],
      strings8:['supersaw', 'swell', {size:10, alpha:0.5, uni:20, rev:0.5, texture:'wave'}],
      choir4:['choir', 'soft', {size:18, alpha:0.55, rev:0.55}],
      offbeat4:['square', 'hard', {size:11, alpha:0.45, rev:0.25, pan:-0.2}],
      progB8:['sawtooth', 'soft', {size:12, alpha:0.55, uni:16, rev:0.45, texture:'grain'}],
      strum:['pluck', 'pluck', {size:15, alpha:0.6, d:0.7, s:0.15, r:1.2, rev:0.45, dly:0.2}],
      highPad4:['triangle', 'swell', {size:22, alpha:0.45, rev:0.6, oct:1, texture:'mist'}],
      themeA8:['sawtooth', 'hard', {size:14, alpha:0.75, glide:0.05, rev:0.35, dly:0.3, uni:14, lfoD:6, lfoR:5.5}],
      themeB8:['square', 'soft', {size:12, alpha:0.65, a:0.05, glide:0.05, rev:0.4, dly:0.25}],
      hook4:['supersaw', 'hard', {size:16, alpha:0.65, rev:0.3, dly:0.25, uni:18}],
      counter8:['triangle', 'soft', {size:14, alpha:0.6, a:0.06, rev:0.4, dly:0.2, texture:'wave'}],
      seq4:['pulse', 'pluck', {size:12, alpha:0.55, dly:0.3, rev:0.2, pan:-0.25}],
      solo4:['sawtooth', 'hard', {size:14, alpha:0.7, drive:0.3, glide:0.04, rev:0.35, dly:0.25}],
      harmony8:['square', 'soft', {size:11, alpha:0.5, a:0.05, rev:0.4, pan:0.3}],
      bellMotif2:['bell', 'pluck', {size:16, alpha:0.55, d:0.6, s:0.1, r:1.2, rev:0.5, dly:0.35}],
      callResp4:[['sawtooth', 'hard', {size:14, alpha:0.65, rev:0.3, dly:0.25, pan:-0.35}], ['pulse', 'hard', {size:13, alpha:0.6, rev:0.3, dly:0.25, pan:0.35}]],
      glideLead4:['sawtooth', 'soft', {size:12, alpha:0.7, glide:0.18, rev:0.45, dly:0.3, lfoD:14, lfoR:5.8, texture:'wave'}],
      bass8:['sawtooth', 'hard', {size:7, alpha:0.8, fenv:0.35, q:3, rev:0.05}], bass4:['pulse', 'hard', {size:8, alpha:0.75, fenv:0.5, q:4, rev:0.05}],
      sub8:['sub', 'soft', {size:18, alpha:0.8, a:0.05, rev:0}],
      riser4:['supersaw', 'swell', {size:18, alpha:0.55, uni:35, rev:0.5, texture:'wave'}],
      down2:['sawtooth', 'hard', {size:16, alpha:0.6, rev:0.45, glide:0.15, dly:0.3}],
      texture8:['wind', 'swell', {size:24, alpha:0.55, rev:0.6, texture:'mist', glide:0.3}],
      noise4:['wind', 'swell', {size:30, alpha:0.65, rev:0.35, glide:0.3, texture:'grain'}],
      stutter:['supersaw', 'hard', {size:18, alpha:0.55, texture:'dash', rev:0.3}],
      drone8:['sawtooth', 'swell', {size:6, alpha:0.45, uni:25, rev:0.5, lfoD:5, lfoR:0.2}],
      outro:['supersaw', 'swell', {size:14, alpha:0.55, uni:22, rev:0.7, r:2.5, texture:'mist'}],
    },
    N:{groove4:'公路節拍 4 小節', groove8:'霓虹節拍 8 小節', hats:'十六分 Hat', perc:'電子通鼓', half:'慢速半拍', break:'只剩大鼓', build:'閘門小鼓漸強',
       fill:'電子鼓過門', impact:'閘門重擊', ending:'結尾', padProg8:'超鋸齒 8 小節進行', stabs4:'合成器切分', arpProg8:'十六分琶音 8 小節',
       keys8:'風琴和弦', strings8:'合成弦樂', choir4:'人聲 Pad', offbeat4:'方波反拍', progB8:'磁帶感進行', strum:'電吉他刷弦', highPad4:'夕陽泛光',
       themeA8:'主旋律 8 小節', themeB8:'方波副歌 8 小節', hook4:'超鋸齒 Hook', counter8:'三角波對位', seq4:'脈衝序列', solo4:'失真獨奏',
       harmony8:'副歌和聲', bellMotif2:'數位鐘聲', callResp4:'雙合成器對答', glideLead4:'滑音 Lead', bass8:'八分音低音 8 小節',
       bass4:'律動低音', sub8:'次低音', riser4:'上升掃頻', down2:'下墜掃頻', texture8:'夜風', noise4:'磁帶噪音', stutter:'切片和弦',
       drone8:'鋸齒持續音', outro:'結束和弦'},
  },
  citypop: {
    name:'City Pop 午夜霓虹', desc:'B♭ 大調・112 BPM・七和弦、電鋼琴、Slap 低音與銅管', root:10, scale:'major', bpm:112, seed:33,
    prog:[3, 2, 1, 0, 3, 2, 1, 4], shape:'sq',
    drum:{kick:[0, 1.5, 2.5], snare:[1, 3], hat:[0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]},
    drumB:{kick:[0, 1.5, 2.5, 3.5], snare:[1, 3, 3.75], hat:[0, 0.5, 1, 1.5, 2, 2.5, 3], ohat:[3.5]},
    fill:{snare:[0, 0.5, 1, 1.25, 1.5], tom:[2, 2.25, 2.5, 2.75, 3, 3.25], kick:[0, 3.5], ohat:[3.5]},
    hats:{hat:[0, 0.25, 0.5, 1, 1.25, 1.5, 2, 2.25, 2.5, 3, 3.25, 3.5], ohat:[0.75, 2.75]},
    perc:{clap:[1, 3], tom:[0.5, 1.75, 2.5, 3.25], hat:[0, 1, 2, 3]},
    lane:{kick:{tune:0, dec:0.9, rev:0.05}, snare:{tune:2, dec:0.9, rev:0.2}, hat:{tune:1, dec:0.9, rev:0.08}, ohat:{rev:0.15}, tom:{tune:5, dec:0.7, rev:0.2}, clap:{tune:1, rev:0.25}},
    rhyA:[[[0.5, 0.5], [1, 0.5], [1.5, 1], [2.5, 0.5], [3, 1]], [[0, 0.5], [0.5, 0.5], [1, 1.5], [2.5, 1.5]], [[0.5, 0.5], [1, 0.5], [1.5, 0.5], [2, 1], [3, 1]], [[0, 2.5], [2.5, 0.5], [3, 1]]],
    rhyB:[[[0, 1], [1, 0.5], [1.5, 1], [2.5, 1.5]], [[0, 0.5], [0.5, 0.5], [1, 0.5], [1.5, 0.5], [2, 2]], [[0.5, 1], [1.5, 0.5], [2, 1], [3, 1]], [[0, 3], [3, 1]]],
    bass:[[0, 0.5, 'r'], [0.75, 0.25, 'o'], [1, 0.5, 'r'], [1.5, 0.5, '5'], [2, 0.5, 'r'], [2.5, 0.25, 'o'], [3, 0.5, '5'], [3.5, 0.5, 'a']],
    bassB:[[0, 0.75, 'r'], [0.75, 0.25, 'r'], [1.5, 0.5, 'o'], [2, 0.75, 'r'], [2.75, 0.25, '5'], [3.25, 0.25, 'o'], [3.5, 0.5, 'a']],
    stab:[[0, 0.5], [1.5, 0.5], [2.5, 0.25], [3, 0.5]], arpStep:0.5, seqStep:0.25,
    T:{
      padProg8:['bell', 'soft', {size:10, alpha:0.55, d:1.4, s:0.35, r:1.2, rev:0.35, lfoD:5, lfoR:4.5, a:0.005}],
      stabs4:['square', 'hard', {size:13, alpha:0.55, fenv:0.3, q:2, rev:0.25}],
      arpProg8:['bell', 'pluck', {size:13, alpha:0.5, d:0.5, s:0.1, r:0.6, dly:0.25, rev:0.3, pan:0.25}],
      keys8:['organ', 'hard', {size:11, alpha:0.5, rev:0.3, texture:'wave', lfoD:6, lfoR:6.5}],
      strings8:['sawtooth', 'soft', {size:9, alpha:0.5, uni:16, a:0.3, rev:0.45}],
      choir4:['choir', 'soft', {size:16, alpha:0.55, rev:0.5}],
      offbeat4:['pluck', 'pluck', {size:13, alpha:0.55, rev:0.2, pan:-0.3}],
      progB8:['triangle', 'soft', {size:14, alpha:0.55, rev:0.4, a:0.15}],
      strum:['pluck', 'pluck', {size:14, alpha:0.6, d:0.8, s:0.2, r:1.2, rev:0.4}],
      highPad4:['sine', 'swell', {size:24, alpha:0.45, rev:0.6, oct:1, texture:'mist'}],
      themeA8:['sine', 'soft', {size:18, alpha:0.75, a:0.04, glide:0.05, rev:0.35, dly:0.2, lfoD:8, lfoR:5.5, texture:'wave'}],
      themeB8:['square', 'soft', {size:10, alpha:0.6, a:0.03, glide:0.04, rev:0.3, dly:0.2}],
      hook4:['sawtooth', 'hard', {size:13, alpha:0.6, fenv:0.25, rev:0.3, dly:0.2}],
      counter8:['triangle', 'soft', {size:14, alpha:0.6, a:0.05, rev:0.35, texture:'wave'}],
      seq4:['bell', 'pluck', {size:14, alpha:0.5, d:0.4, s:0.05, r:0.4, dly:0.3, pan:-0.3}],
      solo4:['sawtooth', 'hard', {size:12, alpha:0.65, drive:0.25, glide:0.05, rev:0.3, dly:0.2}],
      harmony8:['sine', 'soft', {size:16, alpha:0.55, a:0.04, rev:0.35, pan:-0.3, texture:'wave'}],
      bellMotif2:['bell', 'pluck', {size:18, alpha:0.5, d:0.7, s:0.1, r:1.3, rev:0.45, dly:0.25}],
      callResp4:[['square', 'hard', {size:13, alpha:0.6, rev:0.3, pan:-0.35}], ['sawtooth', 'hard', {size:12, alpha:0.55, fenv:0.3, rev:0.3, pan:0.35}]],
      glideLead4:['triangle', 'soft', {size:16, alpha:0.7, glide:0.15, rev:0.4, dly:0.2, lfoD:10, lfoR:5.5, texture:'wave'}],
      bass8:['pluck', 'pluck', {size:7, alpha:0.85, d:0.4, s:0.3, r:0.1, fenv:0.2, q:3, rev:0.03}], bass4:['sawtooth', 'hard', {size:6, alpha:0.75, fenv:0.5, q:6, rev:0.03}],
      sub8:['sub', 'soft', {size:18, alpha:0.75, a:0.03, rev:0}],
      riser4:['sawtooth', 'swell', {size:18, alpha:0.55, uni:22, rev:0.45, texture:'wave'}],
      down2:['bell', 'hard', {size:16, alpha:0.55, rev:0.45, glide:0.15, dly:0.25}],
      texture8:['wind', 'swell', {size:24, alpha:0.5, rev:0.55, texture:'grain', glide:0.3}],
      noise4:['wind', 'swell', {size:30, alpha:0.6, rev:0.35, glide:0.3}],
      stutter:['organ', 'hard', {size:14, alpha:0.55, texture:'dash', rev:0.3}],
      drone8:['organ', 'swell', {size:10, alpha:0.45, rev:0.45, lfoD:5, lfoR:0.25, texture:'mist'}],
      outro:['bell', 'soft', {size:12, alpha:0.6, d:2, s:0.3, r:3, rev:0.55, a:0.005}],
    },
    N:{groove4:'都會律動 4 小節', groove8:'夜車律動 8 小節', hats:'細碎 Hat', perc:'拍手與通鼓', half:'慢搖半拍', break:'Breakdown', build:'小鼓漸強',
       fill:'過門', impact:'銅管重擊', ending:'結尾 Hit', padProg8:'電鋼琴 8 小節進行', stabs4:'銅管切分', arpProg8:'電鋼琶音 8 小節',
       keys8:'風琴 8 小節', strings8:'弦樂鋪底', choir4:'和聲 Pad', offbeat4:'吉他切音', progB8:'副歌進行', strum:'吉他刷弦', highPad4:'霓虹泛光',
       themeA8:'主旋律 8 小節', themeB8:'副歌 8 小節', hook4:'Hook 樂句', counter8:'對位旋律', seq4:'鐘琴序列', solo4:'吉他獨奏',
       harmony8:'主旋律和聲', bellMotif2:'鐘聲動機', callResp4:'銅管對答', glideLead4:'滑音合成器', bass8:'Slap 低音 8 小節',
       bass4:'放克低音', sub8:'次低音', riser4:'上升', down2:'下墜', texture8:'城市夜色', noise4:'雨聲掃過', stutter:'切片風琴',
       drone8:'持續音', outro:'結束七和弦'},
  },
  liquid: {
    name:'Liquid DnB 雨夜', desc:'G 多利安・172 BPM・碎拍、柔和 Pad、Reese 低音與鐘聲', root:7, scale:'dorian', bpm:172, seed:44,
    prog:[0, 3, 0, 6, 0, 3, 4, 2], shape:'sq',
    drum:{kick:[0, 2.5], snare:[1, 3], hat:[0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]},
    drumB:{kick:[0, 1.75, 2.5], snare:[1, 2.75, 3], hat:[0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]},
    fill:{snare:[0, 0.5, 1, 1.5, 2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75], kick:[0, 2]},
    hats:{hat:[0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75], ohat:[1.5, 3.5]},
    perc:{snare:[0.75, 1.5, 2.25], tom:[3.25, 3.5], clap:[1, 3]},
    lane:{kick:{tune:-1, dec:0.9, rev:0.05}, snare:{tune:3, dec:0.8, rev:0.25}, hat:{tune:3, dec:0.7, rev:0.1}, ohat:{rev:0.2}, tom:{tune:3, dec:0.8, rev:0.25}, clap:{rev:0.35}},
    rhyA:[[[0, 2], [2, 1], [3, 1]], [[0, 1], [1, 1], [2, 2]], [[0, 1.5], [1.5, 0.5], [2, 2]], [[0, 4]]],
    rhyB:[[[0, 1], [1, 0.5], [1.5, 0.5], [2, 2]], [[0, 3], [3, 1]], [[0, 0.5], [0.5, 0.5], [1, 1], [2, 1], [3, 1]], [[0, 4]]],
    bass:[[0, 1.5, 'r'], [1.75, 0.75, 'r'], [2.5, 1.5, '5']],
    bassB:[[0, 0.75, 'r'], [0.75, 0.75, 'o'], [1.5, 1, 'r'], [2.5, 0.5, '5'], [3, 1, 'a']],
    stab:[[0, 1], [1.5, 0.5], [2.5, 1]], arpStep:0.25, seqStep:0.25,
    T:{
      padProg8:['choir', 'swell', {size:16, alpha:0.55, rev:0.6, a:0.6, texture:'mist'}],
      stabs4:['bell', 'pluck', {size:12, alpha:0.5, d:0.6, s:0.2, r:0.8, rev:0.45}],
      arpProg8:['pluck', 'pluck', {size:15, alpha:0.5, rev:0.4, dly:0.3, pan:0.3}],
      keys8:['bell', 'soft', {size:10, alpha:0.5, d:1.5, s:0.3, r:1.5, rev:0.45, a:0.005, lfoD:5}],
      strings8:['supersaw', 'swell', {size:9, alpha:0.45, uni:18, rev:0.6, texture:'mist'}],
      choir4:['choir', 'soft', {size:18, alpha:0.55, rev:0.65}],
      offbeat4:['organ', 'hard', {size:10, alpha:0.45, rev:0.35, pan:-0.2}],
      progB8:['triangle', 'swell', {size:16, alpha:0.55, rev:0.55, texture:'mist'}],
      strum:['pluck', 'pluck', {size:15, alpha:0.55, d:1, s:0.2, r:1.6, rev:0.55}],
      highPad4:['sine', 'swell', {size:26, alpha:0.4, rev:0.75, oct:1, texture:'mist'}],
      themeA8:['sine', 'soft', {size:20, alpha:0.7, a:0.06, glide:0.08, rev:0.55, dly:0.3, lfoD:10, lfoR:5, texture:'wave'}],
      themeB8:['choir', 'soft', {size:16, alpha:0.65, a:0.08, rev:0.6, glide:0.08}],
      hook4:['bell', 'pluck', {size:14, alpha:0.6, d:0.6, s:0.15, r:1, rev:0.5, dly:0.3}],
      counter8:['triangle', 'soft', {size:14, alpha:0.55, a:0.1, rev:0.5, texture:'wave'}],
      seq4:['pluck', 'pluck', {size:13, alpha:0.5, dly:0.35, rev:0.35, pan:-0.3}],
      solo4:['square', 'hard', {size:10, alpha:0.55, glide:0.04, rev:0.45, dly:0.3}],
      harmony8:['sine', 'soft', {size:16, alpha:0.5, a:0.06, rev:0.55, pan:-0.3, texture:'wave'}],
      bellMotif2:['bell', 'pluck', {size:18, alpha:0.5, d:0.9, s:0.1, r:1.8, rev:0.6, dly:0.3}],
      callResp4:[['bell', 'pluck', {size:14, alpha:0.55, rev:0.5, pan:-0.35}], ['choir', 'soft', {size:16, alpha:0.55, rev:0.55, pan:0.35, a:0.05}]],
      glideLead4:['sine', 'soft', {size:22, alpha:0.65, glide:0.22, rev:0.6, dly:0.3, lfoD:14, lfoR:4.5, texture:'wave'}],
      bass8:['supersaw', 'soft', {size:5, alpha:0.7, a:0.03, uni:22, drive:0.35, rev:0.05}], bass4:['sub', 'hard', {size:12, alpha:0.85, rev:0}],
      sub8:['sine', 'soft', {size:18, alpha:0.8, a:0.05, rev:0}],
      riser4:['wind', 'swell', {size:22, alpha:0.6, rev:0.55, texture:'wave'}],
      down2:['sine', 'hard', {size:18, alpha:0.6, rev:0.5, glide:0.2, dly:0.3}],
      texture8:['wind', 'swell', {size:28, alpha:0.55, rev:0.65, texture:'grain', glide:0.3}],
      noise4:['wind', 'swell', {size:30, alpha:0.6, rev:0.45, glide:0.3, texture:'mist'}],
      stutter:['choir', 'hard', {size:16, alpha:0.55, texture:'dash', rev:0.4}],
      drone8:['sine', 'swell', {size:24, alpha:0.45, rev:0.55, lfoD:5, lfoR:0.25, texture:'mist'}],
      outro:['choir', 'swell', {size:16, alpha:0.55, rev:0.75, r:3, texture:'mist'}],
    },
    N:{groove4:'碎拍 4 小節', groove8:'雨夜碎拍 8 小節', hats:'十六分 Hat', perc:'鬼音小鼓', half:'半速律動', break:'雨聲間奏', build:'小鼓滾奏',
       fill:'碎拍過門', impact:'落雷', ending:'結尾', padProg8:'人聲 8 小節進行', stabs4:'鐘聲切分', arpProg8:'撥弦琶音 8 小節',
       keys8:'電鋼琴 8 小節', strings8:'弦樂雨幕', choir4:'人聲「啊」', offbeat4:'風琴反拍', progB8:'第二進行', strum:'吉他刷弦', highPad4:'雨滴泛音',
       themeA8:'主旋律 8 小節', themeB8:'人聲副題 8 小節', hook4:'鐘聲 Hook', counter8:'對位旋律', seq4:'撥弦序列', solo4:'方波獨奏',
       harmony8:'主旋律和聲', bellMotif2:'水滴鐘聲', callResp4:'鐘聲與人聲對答', glideLead4:'滑音 Lead', bass8:'Reese 低音 8 小節',
       bass4:'次低音律動', sub8:'深沉次低音', riser4:'雨勢漸強', down2:'下墜', texture8:'雨聲', noise4:'風掃過', stutter:'斷續人聲',
       drone8:'持續音', outro:'結束和弦'},
  },
};

/* ================= 產生器（在 core.js 的環境裡執行） ================= */
function build(C){
  Object.assign(S, {root:C.root, scale:C.scale, bpm:C.bpm}); resetScaleCache();
  const E = extNotes(), tonic = E.find(m => m >= 55 && (m - S.root) % 12 === 0), ti = E.indexOf(tonic);
  const deg = d => E[ti + d];                                  // 音階級數 → MIDI（0＝主音）
  const R = rng(C.seed);
  const pads = PAD_KEYS.map((_, i) => newPad(i));
  const set = (key, props, ...objs) => Object.assign(pads[PAD_KEYS.indexOf(key)], props, {objects:objs.flat(9).map(normalizeObj)});
  const P = k => C.prog[k % C.prog.length];

  /* ---- 物件 ---- */
  const syn = ([tone, env, extra = {}], more = {}) => ({tone, texture:'smooth', size:12, alpha:0.75, ...PDEF, ...envOf(env), ...extra, ...more});
  const pt = (B, b, m, w = 1) => ({x:+(b / B).toFixed(5), y:+midiToY(clamp(m, MIDI_LO, MIDI_HI)).toFixed(5), w:+w.toFixed(3)});
  const note = (B, b, len, m, pr, w = 1) => ({type:'line', pts:[pt(B, b, m, w), pt(B, b + len, m, w * 0.9)], ...pr});
  const notes = (B, list, pr, gap = 0.9) => list.map(([b, len, m, w]) => note(B, b, len * gap, m, pr, w ?? 1));
  const phrase = (B, list, pr, wf = u => 0.6 + 0.4 * Math.sin(u * Math.PI)) => {
    const pts = [], b0 = list[0][0], end = list[list.length - 1][0] + list[list.length - 1][1];
    list.forEach(([b, len, m]) => { const e = b + len * 0.88; pts.push(pt(B, b, m, wf((b - b0) / (end - b0))), pt(B, e, m, wf((e - b0) / (end - b0)))); });
    return {type:'line', pts, ...pr};
  };
  const curve = (B, b0, b1, fn, pr, wf = () => 1) => { const pts = [], n = Math.max(12, Math.round((b1 - b0) * 10));
    for(let j = 0; j <= n; j++){ const u = j / n; pts.push({x:+((b0 + (b1 - b0) * u) / B).toFixed(5), y:+clamp(fn(u), MEL_TOP, MEL_BOT).toFixed(5), w:+wf(u).toFixed(3)}); }
    return {type:'line', pts, ...pr}; };
  const chordAt = (B, b, len, d, shape, pr) => ({type:'chord', x:b / B, y:midiToY(deg(d - 7)), len:len / B, shape, ...pr});
  const drop = (B, b, lane, alpha, extra = {}) => ({type:'drop', x:b / B, lane, alpha:clamp(alpha, 0.15, 1), ...PDEF, rev:0.1, ...(C.lane[lane] || {}), ...extra});
  const ALPHA = {kick:0.9, snare:0.8, clap:0.8, hat:0.45, ohat:0.45, tom:0.7};
  const bar = (pat, B, off, mul = 1, extra = {}) => Object.entries(pat).flatMap(([lane, beats]) => beats.map((b, j) =>
    drop(B, off + b, lane, ALPHA[lane] * mul * (lane === 'hat' ? (j % 2 ? 0.7 : 1) : 1), lane.includes('hat') ? {pan:j % 2 ? 0.22 : -0.22, ...extra} : extra)));
  /** 低音的音：r 根音、5 五度、o 高八度、a 往下一個和弦的經過音 */
  const bassNote = (k, kind) => {
    const c = P(k), n = P(k + 1); let m = deg(c - 7); while(m > 52) m -= 12; while(m < MIDI_LO) m += 12;
    if(kind === '5'){ const f = deg(c - 7 + 4) - deg(c - 7); return m + f; }
    if(kind === 'o') return m + 12;
    if(kind === 'a'){ let t = deg(n - 7); while(t > 52) t -= 12; while(t < MIDI_LO) t += 12; const i = E.indexOf(t); return E[t > m ? i - 1 : i + 1]; }
    return m;
  };
  /** 旋律：強拍落和弦音、弱拍走音階，contour 決定整句的起伏（單位：音階級數） */
  const melody = (bars, rhy, form, {center = 4, range = 3, contour = u => Math.sin(u * Math.PI), lo = -2, hi = 10, shift = 0} = {}) => {
    const out = []; let prev = center, prev2 = null;
    for(let k = 0; k < bars; k++){
      const c = P(k + shift), list = rhy[form[k % form.length]];
      list.forEach(([o, len], j) => {
        const u = (k * 4 + o) / (bars * 4), want = center + contour(u) * range, strong = j === 0 || o % 2 === 0;
        let cand = [];
        if(strong) for(let oc = -14; oc <= 21; oc += 7) for(const t of [0, 2, 4]) cand.push(c + t + oc);
        else cand = [prev - 2, prev - 1, prev + 1, prev + 2];
        cand = cand.filter(d => d >= lo && d <= hi);
        const goal = strong ? want * 0.65 + prev * 0.35 : want;
        const cost = d => Math.abs(d - goal) + (d === prev2 ? 1.6 : 0) + (d === prev ? 0.8 : 0) + R() * 0.3;   // 避免來回擺動、少一點同音反覆
        cand.sort((a, b) => cost(a) - cost(b));
        const d = cand[0] ?? prev; prev2 = prev; prev = d; out.push([k * 4 + o, len, d]);
      });
    }
    const last = out[out.length - 1]; if(last){ const c = P(bars - 1 + shift); last[2] = [c, c + 2, c + 4, c + 7].sort((a, b) => Math.abs(a - last[2]) - Math.abs(b - last[2]))[0]; }
    return out;
  };
  const toMidi = list => list.map(([b, l, d, w]) => [b, l, deg(d), w]);
  const chordTones = (c, n = 4) => [0, 2, 4, 7, 9, 11, 14].slice(0, n).map(t => c + t);
  const T = C.T, N = C.N, bpb = 4;

  /* ============ 第一列：節奏 ============ */
  set('Digit1', {name:N.groove4, mode:'loop', beats:16, vol:0.85}, [0, 1, 2].map(k => bar(k === 1 ? C.drumB : C.drum, 16, k * 4)), bar(C.drum, 16, 12, 1).filter(o => o.x * 16 < 14), bar(C.fill, 16, 12, 0.8).filter(o => o.x * 16 >= 14));
  set('Digit2', {name:N.groove8, mode:'loop', beats:32, vol:0.85}, Array.from({length:8}, (_, k) => k === 7 ? bar(C.fill, 32, 28, 0.85) : bar(k % 2 ? C.drumB : C.drum, 32, k * 4, k === 4 ? 1.05 : 1)),
    drop(32, 0, 'ohat', 0.6, {dec:2.2, rev:0.35}), drop(32, 16, 'ohat', 0.55, {dec:2.2, rev:0.35}));
  set('Digit3', {name:N.hats, mode:'loop', beats:16, vol:0.7}, [0, 1, 2, 3].map(k => bar(C.hats, 16, k * 4, k === 3 ? 1.15 : 0.95)));
  set('Digit4', {name:N.perc, mode:'loop', beats:16, vol:0.7}, [0, 1, 2, 3].map(k => bar(C.perc, 16, k * 4, 0.8, {pan:k % 2 ? 0.3 : -0.3})));
  const half = {kick:[0], snare:[2], hat:[0, 1, 2, 3]};
  set('Digit5', {name:N.half, mode:'loop', beats:16, vol:0.8}, [0, 1, 2, 3].map(k => bar(k === 3 ? {...half, kick:[0, 1.5, 3.5]} : half, 16, k * 4)));
  set('Digit6', {name:N.break, mode:'loop', beats:16, vol:0.75}, drop(16, 0, 'kick', 0.85), drop(16, 8, 'kick', 0.8), drop(16, 10.5, 'kick', 0.6),
    Array.from({length:16}, (_, j) => drop(16, j + 0.5, 'hat', 0.25 + (j % 4 === 3 ? 0.15 : 0), {pan:Math.sin(j) * 0.4})));
  set('Digit7', {name:N.build, mode:'oneshot', beats:16, vol:0.8, align:'bar'}, [[0, 1], [4, 0.5], [8, 0.25], [12, 0.125]].flatMap(([s, st], k) =>
    Array.from({length:4 / st}, (_, j) => drop(16, s + j * st, C.buildLane || 'snare', 0.3 + 0.6 * (s + j * st) / 16, {tune:(s + j * st) / 2, pan:0}))), drop(16, 0, 'kick', 0.8));
  set('Digit8', {name:N.fill, mode:'oneshot', beats:4, vol:0.8, align:'beat'}, bar(C.fill, 4, 0, 0.9));
  set('Digit9', {name:N.impact, mode:'oneshot', beats:8, vol:0.85, align:'off'}, drop(8, 0, 'kick', 1, {dec:2.2, tune:-6}), drop(8, 0, 'tom', 0.9, {tune:-12, dec:2.5, rev:0.6}),
    drop(8, 0, 'ohat', 0.7, {dec:2.5, rev:0.7}), drop(8, 0, 'clap', 0.6, {dec:2, rev:0.8}));
  set('Digit0', {name:N.ending, mode:'oneshot', beats:4, vol:0.85, align:'beat'}, drop(4, 0, 'kick', 0.9), drop(4, 0, 'snare', 0.7), drop(4, 0.75, 'kick', 0.8), drop(4, 0.75, 'snare', 0.7),
    drop(4, 1.5, 'kick', 1), drop(4, 1.5, 'ohat', 0.7, {dec:2.5, rev:0.5}), drop(4, 1.5, 'tom', 0.7, {tune:-8, dec:2}));

  /* ============ 第二列：和聲 ============ */
  const sh = C.shape;
  set('KeyQ', {name:N.padProg8, mode:'loop', beats:32, vol:0.6}, C.prog.map((d, k) => chordAt(32, k * 4, 3.9, d, sh, syn(T.padProg8))));
  set('KeyW', {name:N.stabs4, mode:'loop', beats:16, vol:0.65}, [0, 1, 2, 3].map(k => C.stab.map(([o, l]) => chordAt(16, k * 4 + o, l, P(k), sh, syn(T.stabs4)))));
  const arpPat = [0, 1, 2, 3, 2, 1, 2, 3, 0, 2, 1, 3, 2, 3, 1, 2], aS = C.arpStep;
  set('KeyE', {name:N.arpProg8, mode:'loop', beats:32, vol:0.6}, notes(32, Array.from({length:32 / aS}, (_, j) => {
    const b = j * aS, k = Math.floor(b / 4), ct = chordTones(P(k), 4);
    return [b, aS, deg(ct[arpPat[j % arpPat.length]]), j % (4 / aS) === 0 ? 1 : 0.65];
  }), syn(T.arpProg8)));
  set('KeyR', {name:N.keys8, mode:'loop', beats:32, vol:0.6}, C.prog.map((d, k) => [[0, 1.5], [1.5, 1], [2.5, 1.5]].map(([o, l]) => chordAt(32, k * 4 + o, l, d, sh, syn(T.keys8)))));
  /* 弦樂：上方聲部用最近的和弦音連接（聲部進行），下方墊一個長和弦 */
  { let top = 9; const line = C.prog.map((d, k) => { const c = chordTones(d, 3).flatMap(t => [t, t + 7]); top = c.sort((a, b) => Math.abs(a - top) - Math.abs(b - top))[0]; return [k * 4, 4, deg(top)]; });
    set('KeyT', {name:N.strings8, mode:'loop', beats:32, vol:0.55}, [phrase(32, line, syn(T.strings8)), C.prog.map((d, k) => chordAt(32, k * 4, 3.95, d, 'tri', syn(T.strings8, {alpha:0.35, pan:-0.2})))]); }
  set('KeyY', {name:N.choir4, mode:'loop', beats:16, vol:0.55}, [0, 1, 2, 3].map(k => chordAt(16, k * 4, 3.95, P(k), 'tri', syn(T.choir4))));
  set('KeyU', {name:N.offbeat4, mode:'loop', beats:16, vol:0.55}, [0, 1, 2, 3].map(k => [0.5, 1.5, 2.5, 3.5].map(o => chordAt(16, k * 4 + o, 0.35, P(k), sh, syn(T.offbeat4)))));
  const progB = C.prog.map((d, k) => k % 2 ? (d + 5) % 7 : d);   // 每兩小節換成代理和弦
  set('KeyI', {name:N.progB8, mode:'loop', beats:32, vol:0.55}, progB.map((d, k) => chordAt(32, k * 4, 3.9, d, k % 2 ? 'tri' : sh, syn(T.progB8))));
  set('KeyO', {name:N.strum, mode:'oneshot', beats:4, vol:0.65}, chordTones(C.prog[0], 6).map((d, j) => note(4, j * 0.06, 3.7 - j * 0.06, deg(d - 7), syn(T.strum, {pan:-0.3 + j * 0.12}), 1 - j * 0.06)));
  set('KeyP', {name:N.highPad4, mode:'loop', beats:16, vol:0.5}, [0, 1, 2, 3].map(k => [chordTones(P(k), 3)[(k + 2) % 3] + 7].map(d =>
    curve(16, k * 4, k * 4 + 4, () => midiToY(deg(d)), syn(T.highPad4, {pan:k % 2 ? 0.4 : -0.4}), u => 0.4 + 0.6 * Math.sin(u * Math.PI)))));

  /* ============ 第三列：旋律 ============ */
  const themeA = melody(8, C.rhyA, [0, 1, 0, 2, 0, 1, 2, 3], {center:5, range:3, contour:u => Math.sin(u * Math.PI * 2) * 0.6 + Math.sin(u * Math.PI) * 0.6});
  set('KeyA', {name:N.themeA8, mode:'oneshot', beats:32, vol:0.7}, [phrase(32, toMidi(themeA.slice(0, Math.ceil(themeA.length / 2))), syn(T.themeA8)),
    phrase(32, toMidi(themeA.slice(Math.ceil(themeA.length / 2))), syn(T.themeA8))]);
  const themeB = melody(8, C.rhyB, [0, 1, 2, 3, 0, 1, 2, 3], {center:6, range:3, contour:u => 1 - 2 * Math.abs(u - 0.4)});
  set('KeyS', {name:N.themeB8, mode:'oneshot', beats:32, vol:0.65}, notes(32, toMidi(themeB), syn(T.themeB8), 0.95));
  set('KeyD', {name:N.hook4, mode:'loop', beats:16, vol:0.6}, notes(16, toMidi(melody(4, C.rhyA, [2, 1, 2, 3], {center:7, range:2, contour:u => Math.cos(u * Math.PI * 2)})), syn(T.hook4)));
  set('KeyF', {name:N.counter8, mode:'loop', beats:32, vol:0.55}, [phrase(32, toMidi(melody(8, [[[0, 2], [2, 2]], [[0, 4]]], [0, 1, 0, 1, 0, 0, 0, 1],
    {center:0, range:2, lo:-5, hi:5, contour:u => -Math.sin(u * Math.PI * 2)})), syn(T.counter8))]);
  const sq = [0, 2, 1, 3, 0, 2, 3, 2];
  set('KeyG', {name:N.seq4, mode:'loop', beats:16, vol:0.5}, notes(16, Array.from({length:16 / C.seqStep}, (_, j) => {
    const b = j * C.seqStep, k = Math.floor(b / 4), ct = chordTones(P(k), 4).map(d => d + 7);
    return [b, C.seqStep, deg(ct[sq[j % sq.length]]), j % 4 === 0 ? 1 : 0.6];
  }), syn(T.seq4), 0.8));
  const run = []; for(let k = 0; k < 4; k++){ const c = P(k); const fast = k % 2 === 1;
    if(fast) for(let j = 0; j < 8; j++) run.push([k * 4 + j * 0.5, 0.5, c + 7 + [0, 1, 2, 4, 3, 2, 1, 0][j]]);
    else run.push([k * 4, 1.5, c + 7], [k * 4 + 1.5, 0.5, c + 8], [k * 4 + 2, 2, c + 9]); }
  set('KeyH', {name:N.solo4, mode:'oneshot', beats:16, vol:0.6}, [phrase(16, toMidi(run.map(([b, l, d]) => [b, l, Math.min(d, 11)])), syn(T.solo4))]);
  set('KeyJ', {name:N.harmony8, mode:'oneshot', beats:32, vol:0.5}, notes(32, toMidi(themeA.map(([b, l, d]) => [b, l, d - 2])), syn(T.harmony8), 0.95));
  set('KeyK', {name:N.bellMotif2, mode:'loop', beats:8, vol:0.5}, notes(8, toMidi([[0, 0.75, 9], [0.75, 0.75, 7], [1.5, 1, 4], [3, 0.5, 6],
    [4, 0.75, 9], [4.75, 0.75, 7], [5.5, 1.5, P(1) + 7], [7, 1, P(1) + 9]]), syn(T.bellMotif2)));
  const call = melody(4, C.rhyA, [0, 3, 1, 3], {center:5, range:2, contour:u => Math.sin(u * Math.PI * 4)});
  set('KeyL', {name:N.callResp4, mode:'oneshot', beats:16, vol:0.6}, call.map(([b, l, d]) => note(16, b, l * 0.9, deg(d + (Math.floor(b / 4) % 2 ? 2 : 0)),
    syn(T.callResp4[Math.floor(b / 4) % 2]))));
  set('Semicolon', {name:N.glideLead4, mode:'oneshot', beats:16, vol:0.6}, [phrase(16, toMidi(melody(4, [[[0, 3], [3, 1]], [[0, 4]]], [0, 1, 0, 1],
    {center:6, range:3, contour:u => Math.sin(u * Math.PI * 1.5)})), syn(T.glideLead4), u => 0.5 + 0.5 * Math.sin(u * Math.PI))]);

  /* ============ 第四列：低音與音效 ============ */
  set('KeyZ', {name:N.bass8, mode:'loop', beats:32, vol:0.85}, C.prog.map((_, k) => notes(32, C.bass.map(([o, l, kd]) => [k * 4 + o, l, bassNote(k, kd)]), syn(T.bass8), 0.92)));
  set('KeyX', {name:N.bass4, mode:'loop', beats:16, vol:0.8}, [0, 1, 2, 3].map(k => notes(16, C.bassB.map(([o, l, kd]) => [k * 4 + o, l, bassNote(k, kd)]), syn(T.bass4), 0.85)));
  set('KeyC', {name:N.sub8, mode:'loop', beats:32, vol:0.75}, C.prog.map((_, k) => note(32, k * 4, 3.9, bassNote(k, 'r'), syn(T.sub8, {oct:-1}))));
  const CHROM = {ownKey:{root:C.root, scale:'chromatic'}};   // 音效用半音階：滑音每個半音都會經過，聽起來是平順的掃頻
  set('KeyV', {name:N.riser4, mode:'oneshot', beats:16, vol:0.6, align:'bar', ...CHROM}, [curve(16, 0, 16, u => MEL_BOT - 0.02 - u * u * 0.6, syn(T.riser4), u => 0.25 + 0.75 * u)]);
  set('KeyB', {name:N.down2, mode:'oneshot', beats:8, vol:0.6, align:'off', ...CHROM}, [curve(8, 0, 6, u => 0.12 + Math.sqrt(u) * 0.58, syn(T.down2), u => 1 - u * 0.7)]);
  set('KeyN', {name:N.texture8, mode:'loop', beats:32, vol:0.5}, [curve(32, 0, 16, u => midiToY(deg(7)) + 0.05 * Math.sin(u * Math.PI * 3), syn(T.texture8, {pan:-0.4}), u => 0.3 + 0.7 * Math.sin(u * Math.PI)),
    curve(32, 15, 32, u => midiToY(deg(9)) + 0.05 * Math.sin(u * Math.PI * 2), syn(T.texture8, {pan:0.4}), u => 0.3 + 0.7 * Math.sin(u * Math.PI))]);
  set('KeyM', {name:N.noise4, mode:'oneshot', beats:16, vol:0.55, align:'off', ...CHROM}, [curve(16, 0, 16, u => 0.6 - Math.sin(u * Math.PI) * 0.45, syn(T.noise4), u => 0.2 + 0.8 * Math.sin(u * Math.PI))]);
  set('Comma', {name:N.stutter, mode:'oneshot', beats:8, vol:0.6, align:'beat'}, [chordAt(8, 0, 3.75, P(0), sh, syn(T.stutter)), chordAt(8, 4, 3.75, P(1), sh, syn(T.stutter))]);
  set('Period', {name:N.drone8, mode:'loop', beats:32, vol:0.5}, [note(32, 0, 32, deg(-7), syn(T.drone8), 0.8), note(32, 0, 32, deg(-3), syn(T.drone8, {alpha:0.35, pan:0.3}), 0.7)]);
  set('Slash', {name:N.outro, mode:'oneshot', beats:8, vol:0.65}, [chordAt(8, 0, 7.5, 0, 'sq', syn(T.outro)), note(8, 0.1, 6.5, deg(9), syn(T.outro, {alpha:0.4}), 0.8)]);

  return {format:'inksynth-board', version:2, id:C.id, name:C.name, desc:C.desc, bpm:C.bpm, root:C.root, scale:C.scale, quant:'bar', pads};
}

/* ================= 執行 ================= */
const round4 = (k, v) => typeof v === 'number' && !Number.isInteger(v) ? +v.toFixed(4) : v;
for(const [id, cfg] of Object.entries(STYLES)){
  const sandbox = {document:{currentScript:null, querySelector:() => null, querySelectorAll:() => []}, console, Math, JSON};
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/core.js'), 'utf8'), sandbox);
  const out = vm.runInContext(`(${build.toString()})(${JSON.stringify({...cfg, id})})`, sandbox);
  let seed = cfg.seed * 7919;   // 種子固定，重新產生時結果不變
  out.pads.forEach(p => p.objects.forEach(o => { o.seed = (seed = (seed * 1103515245 + 12345) >>> 0) % 1e9; }));
  const file = path.join(ROOT, `templates/${id}.js`);
  fs.writeFileSync(file, `/* InkSynth 範本：${out.name}（${out.desc}）
   這是一般的 JSON 資料，外面包一層 InkTemplates.add(...) 讓瀏覽器在本機（file://）也能載入。
   由 tools/build-mega.js 產生。 */
InkTemplates.add(${JSON.stringify(out, round4)});
`);
  const empty = out.pads.filter(p => !p.objects.length).map(p => p.key);
  const long = out.pads.filter(p => p.beats >= 16).length;
  console.log(`${id.padEnd(10)} ${out.name}：${out.pads.length - empty.length} 格有內容，其中 ${long} 格是 4／8 小節長段落，${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
  if(empty.length) console.log('  空白格：', empty);
}
