'use strict';
/* ============================================================
   recorder.js — 錄下演奏（影片＋聲音）
   另外畫 1920×1080 的錄影畫面（上方資訊列＋音效板或疊合總覽）。
   錄影模式：
     board    主畫面（音效板）
     overview 疊合總覽（在背景另外畫一份，照最後的總覽設定；演奏時可以待在主畫面調音量）
     split    兩者，分割畫面（一個檔案：上面音效板、下面疊合總覽）
     files    兩者，分成兩個檔案（同時錄，共用同一段聲音，長度完全一樣）

   編碼方式：
   ・優先用 WebCodecs 自己把畫面編成 H.264、聲音編成 AAC，再用 mp4-muxer（js/vendor）封裝成「一般的」MP4：
     總長度與索引寫在檔頭，任何播放器、手機、LINE 都能拖時間軸。
   ・瀏覽器內建的 MediaRecorder 錄出來的是分段式檔案，沒有總長度和索引，播放器沒辦法拖時間軸，
     所以只在瀏覽器不支援 WebCodecs 時才用它。
   分頁切到背景時瀏覽器會暫停畫面更新，影片畫面會停住（聲音照錄）。
   ============================================================ */
const RW = 1920, RH = 1080, FPS = 30, VBITRATE = 6e6, ABITRATE = 192000;
const REC_MODES = {board:'主畫面', overview:'疊合總覽', split:'兩者・分割畫面（一個檔案）', files:'兩者・分成兩個檔案'};
const REC_TAGS = {board:'主畫面', overview:'疊合總覽', split:'分割畫面'};
const REC_STORE = 'inksynth-rec-v1';
const REC = {on:false, busy:false, mode:'board', engine:'', outs:[], t0:0, timer:null, saved:0};
try{ const m = localStorage.getItem(REC_STORE); if(REC_MODES[m]) REC.mode = m; }catch(e){}
const REC_OV = makeOvInst(); OV_INSTS.push(REC_OV);   // 錄影用的總覽（和主畫面的總覽共用設定）

function newRecOut(layout){ const cv = document.createElement('canvas'); cv.width = RW; cv.height = RH; const o = {layout, cv, g:cv.getContext('2d')}; recDraw(o); return o; }
function recFileName(o, ext){
  const d = new Date(), z = n => String(n).padStart(2, '0');
  return `${(S.boardName || 'inksynth').replace(/[\\/:*?"<>|]/g, '_')}-${REC_TAGS[o.layout]}-${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}.${ext}`;
}
function downloadBlob(blob, name){
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

async function startRec(mode){
  if(REC.on || REC.busy) return;
  initAudio(); await ctx.resume();
  REC.mode = mode; try{ localStorage.setItem(REC_STORE, mode); }catch(e){}
  const layouts = mode === 'files' ? ['board', 'overview'] : [mode];
  REC.busy = true; syncRecBtn();
  try{
    const wc = await wcSupport();
    if(wc) await startWC(layouts, wc);
    else if(typeof MediaRecorder !== 'undefined' && HTMLCanvasElement.prototype.captureStream){
      startMR(layouts); toast('這個瀏覽器不支援 WebCodecs，改用內建錄影：檔案可以播放，但部分播放器無法拖時間軸（建議用 Chrome 或 Edge）'); }
    else throw Error('這個瀏覽器不支援錄影，請改用 Chrome 或 Edge');
  }catch(e){ REC.busy = false; syncRecBtn(); return toast('無法開始錄影：' + e.message); }
  REC.busy = false; REC.on = true; REC.saved = 0; REC.t0 = performance.now(); REC.timer = setInterval(syncRecBtn, 250); syncRecBtn();
  if(REC.engine === 'wc') toast(`開始錄影（${REC_MODES[mode]}）：照常演奏就好，再按一次「停止錄影」就會存成 MP4`);
}
async function stopRec(){
  if(!REC.on) return;
  REC.on = false; clearInterval(REC.timer); REC.busy = true; syncRecBtn();
  try{ if(REC.engine === 'wc') await stopWC(); else stopMR(); }
  catch(e){ toast('存檔失敗：' + e.message); }
  REC.busy = false; syncRecBtn();
}

/* ================= WebCodecs＋mp4-muxer ================= */
const H264 = ['avc1.640028', 'avc1.4d0028', 'avc1.42e028'];   // High／Main／Baseline，Level 4.0（1080p30）
/** 回傳可用的編碼設定，不支援就回傳 null */
async function wcSupport(){
  if(!window.VideoEncoder || !window.AudioEncoder || !window.VideoFrame || !window.AudioData || !window.Mp4Muxer || !ctx.audioWorklet) return null;
  let video = null;
  for(const codec of H264){ const cfg = {codec, width:RW, height:RH, bitrate:VBITRATE, framerate:FPS, avc:{format:'avc'}};
    try{ if((await VideoEncoder.isConfigSupported(cfg)).supported){ video = cfg; break; } }catch(e){} }
  if(!video) return null;
  let audio = null;
  for(const [codec, mux] of [['mp4a.40.2', 'aac'], ['opus', 'opus']]){ const cfg = {codec, sampleRate:ctx.sampleRate, numberOfChannels:2, bitrate:ABITRATE};
    try{ if((await AudioEncoder.isConfigSupported(cfg)).supported){ audio = {cfg, mux}; break; } }catch(e){} }
  return audio ? {video, audio} : null;
}
/* 從最後的輸出抓聲音：AudioWorklet 每攢滿 4096 個取樣就送回主執行緒；沒有聲音時補靜音，時間軸才連續 */
const CAP_WORKLET = `class Cap extends AudioWorkletProcessor{
  constructor(){ super(); this.n = 0; this.b = [new Float32Array(4096), new Float32Array(4096)]; this.on = true;
    this.port.onmessage = e => { if(e.data === 'stop'){ this.flush(); this.on = false; this.port.postMessage('done'); } }; }
  flush(){ if(this.n){ this.port.postMessage([this.b[0].slice(0, this.n), this.b[1].slice(0, this.n)]); this.n = 0; } }
  process(inputs){
    if(!this.on) return false;
    const i = inputs[0], L = i && i[0], R = i && (i[1] || i[0]), len = L ? L.length : 128;
    for(let k = 0; k < len; k++){ this.b[0][this.n] = L ? L[k] : 0; this.b[1][this.n] = R ? R[k] : 0; if(++this.n === 4096) this.flush(); }
    return true;
  }
}
registerProcessor('inksynth-capture', Cap);`;
let capReady = null;
async function startWC(layouts, wc){
  capReady ||= ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([CAP_WORKLET], {type:'text/javascript'})));
  await capReady;
  const sr = ctx.sampleRate;
  REC.engine = 'wc'; REC.outs = layouts.map(newRecOut); REC.err = null;
  const fail = e => { REC.err ||= e; console.error(e); };
  for(const o of REC.outs){
    o.muxer = new Mp4Muxer.Muxer({target:new Mp4Muxer.ArrayBufferTarget(), fastStart:'in-memory', firstTimestampBehavior:'offset',
      video:{codec:'avc', width:RW, height:RH, frameRate:FPS}, audio:{codec:wc.audio.mux, sampleRate:sr, numberOfChannels:2}});
    o.venc = new VideoEncoder({output:(chunk, meta) => o.muxer.addVideoChunk(chunk, meta), error:fail});
    o.venc.configure(wc.video); o.frames = 0; o.lastT = -1;
  }
  /* 聲音只編一次，同一份送進每個檔案（分檔時兩個檔案的聲音完全一樣） */
  REC.aenc = new AudioEncoder({output:(chunk, meta) => REC.outs.forEach(o => o.muxer.addAudioChunk(chunk, meta)), error:fail});
  REC.aenc.configure(wc.audio.cfg); REC.aFrames = 0;
  REC.cap = new AudioWorkletNode(ctx, 'inksynth-capture', {numberOfInputs:1, numberOfOutputs:1, channelCount:2, channelCountMode:'explicit'});
  REC.sink = ctx.createGain(); REC.sink.gain.value = 0;   // 接到喇叭（音量 0）才會一直被處理
  REC.capDone = new Promise(res => REC.cap.port.onmessage = e => {
    if(e.data === 'done') return res();
    const [L, R] = e.data, n = L.length, data = new Float32Array(n * 2); data.set(L, 0); data.set(R, n);
    const ad = new AudioData({format:'f32-planar', sampleRate:sr, numberOfFrames:n, numberOfChannels:2, timestamp:Math.round(REC.aFrames / sr * 1e6), data});
    REC.aFrames += n; if(REC.aenc.state === 'configured') REC.aenc.encode(ad); ad.close();
  });
  OUT.connect(REC.cap); REC.cap.connect(REC.sink); REC.sink.connect(ctx.destination);
  REC.ct0 = ctx.currentTime;   // 畫面的時間戳記用音訊時鐘，和聲音對得齊
  wcFrame(true);
}
/** 每一幀：照音訊時鐘、每秒 30 張送進編碼器；編碼器忙不過來時跳過這一張 */
function wcFrame(force = false){
  const t = ctx.currentTime - REC.ct0, states = S.pads.map((_, i) => padState(i));
  for(const o of REC.outs){
    if(!force && t - o.lastT < 1 / FPS - 0.004) continue;
    if(o.venc.state !== 'configured' || o.venc.encodeQueueSize > 6) continue;
    o.lastT = t; recDraw(o, states);
    const f = new VideoFrame(o.cv, {timestamp:Math.round(Math.max(0, t) * 1e6)});
    o.venc.encode(f, {keyFrame:o.frames++ % (FPS * 2) === 0}); f.close();
  }
}
async function stopWC(){
  REC.cap.port.postMessage('stop'); await Promise.race([REC.capDone, new Promise(r => setTimeout(r, 1000))]);
  try{ OUT.disconnect(REC.cap); }catch(e){} REC.cap.disconnect(); REC.sink.disconnect();
  toast('正在存檔…');
  await REC.aenc.flush(); REC.aenc.close();
  for(const o of REC.outs){ await o.venc.flush(); o.venc.close(); o.muxer.finalize(); }
  if(REC.err) throw REC.err;
  const sizes = [];
  for(const o of REC.outs){ const blob = new Blob([o.muxer.target.buffer], {type:'video/mp4'}); sizes.push(blob.size); downloadBlob(blob, recFileName(o, 'mp4')); o.muxer = null; }
  toast(REC.outs.length > 1 ? `已存成 ${REC.outs.length} 個 MP4（主畫面、疊合總覽）` : `已存成 MP4（${(sizes[0] / 1048576).toFixed(1)} MB），可以拖時間軸`);
  REC.outs = []; REC.aenc = REC.cap = REC.sink = null;
}

/* ================= 備用：MediaRecorder（不支援 WebCodecs 的瀏覽器） ================= */
function recMime(){
  for(const m of ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'])
    if(MediaRecorder.isTypeSupported(m)) return m;
  return '';
}
function startMR(layouts){
  REC.engine = 'mr'; REC.mime = recMime(); REC.outs = layouts.map(newRecOut);
  for(const o of REC.outs){
    o.dest = ctx.createMediaStreamDestination(); OUT.connect(o.dest);   // 每個錄影器各自接一個錄音點（共用同一條音軌在分檔時會漏錄）
    o.mr = new MediaRecorder(new MediaStream([...o.cv.captureStream(FPS).getVideoTracks(), ...o.dest.stream.getAudioTracks()]),
      {...(REC.mime ? {mimeType:REC.mime} : {}), videoBitsPerSecond:VBITRATE, audioBitsPerSecond:ABITRATE});
    o.chunks = []; o.mr.ondataavailable = e => { if(e.data.size) o.chunks.push(e.data); };
    o.mr.onstop = () => { const type = (REC.mime || o.mr.mimeType || 'video/webm').split(';')[0];
      downloadBlob(new Blob(o.chunks, {type}), recFileName(o, type.includes('mp4') ? 'mp4' : 'webm'));
      if(++REC.saved === REC.outs.length) toast('已存檔'); };
  }
  REC.outs.forEach(o => o.mr.start(1000));
}
function stopMR(){ REC.outs.forEach(o => { o.mr.stop(); try{ OUT.disconnect(o.dest); }catch(e){} }); }

/* ================= 按鈕與選單 ================= */
const fmtTime = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
function syncRecBtn(){
  const b = $('#recBtn'); b.classList.toggle('on', REC.on); b.disabled = REC.busy;
  b.textContent = REC.busy ? (REC.on ? '…' : '⏳ 處理中') : REC.on ? `■ 停止錄影 ${fmtTime((performance.now() - REC.t0) / 1000)}` : '⏺ 錄影';
  $$('#recMenu [data-rec]').forEach(x => x.classList.toggle('on', x.dataset.rec === REC.mode));
}
/* 沒在錄就打開模式選單，錄影中就停止 */
$('#recBtn').onclick = e => { e.stopPropagation(); if(REC.on) return stopRec(); syncRecBtn(); $('#recMenu').hidden = !$('#recMenu').hidden; };
$('#recMenu').onclick = e => { const b = e.target.closest('[data-rec]'); if(!b) return; $('#recMenu').hidden = true; startRec(b.dataset.rec); };
document.addEventListener('pointerdown', e => { if(!e.target.closest('#recWrap')) $('#recMenu').hidden = true; });

/* ---------- 錄影畫面 ---------- */
function rrect(c, x, y, w, h, r){ c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
const FONT = 'system-ui, "Noto Sans TC", "Microsoft JhengHei", sans-serif';
/** 每一幀由 main.js 的畫面迴圈呼叫 */
function recFrame(){
  if(!REC.on) return;
  if(REC.engine === 'wc') wcFrame();
  else { const states = S.pads.map((_, i) => padState(i)); REC.outs.forEach(o => recDraw(o, states)); }
}
function recDraw(o, states = S.pads.map((_, i) => padState(i))){
  const c = o.g, playing = states.filter(s => s.state === 'playing').length;
  const bg = c.createLinearGradient(0, 0, 0, RH); bg.addColorStop(0, '#12141c'); bg.addColorStop(1, '#0b0c10');
  c.fillStyle = bg; c.fillRect(0, 0, RW, RH);
  /* 上方資訊列 */
  c.textBaseline = 'middle'; c.textAlign = 'left';
  c.font = `800 44px ${FONT}`; c.fillStyle = '#f1ede2'; c.fillText('Ink', 60, 64);
  const iw = c.measureText('Ink').width; c.fillStyle = '#7cf0d0'; c.fillText('Synth', 60 + iw, 64);
  const lw = iw + c.measureText('Synth').width;
  c.font = `600 30px ${FONT}`; c.fillStyle = '#c9c6bd'; c.fillText(S.boardName || '', 60 + lw + 32, 66);
  c.textAlign = 'right'; c.font = `600 26px ${FONT}`; c.fillStyle = '#9a9caa';
  c.fillText(`${NOTE_NAMES[S.root]} ${SCALES[S.scale].name}・${S.bpm} BPM・${playing ? playing + ' 格播放中' : '待命中'}`, RW - 60, 66);
  c.fillStyle = 'rgba(255,255,255,.08)'; c.fillRect(60, 118, RW - 120, 2);
  /* 內容 */
  if(o.layout === 'board') recBoard(c, states, 50, 150, RW - 100, RH - 230);
  else if(o.layout === 'overview') recOverview(c, states, 60, 150, RW - 120, RH - 230);
  else { const bh = recBoard(c, states, 120, 140, RW - 240, 0); recOverview(c, states, 60, 140 + bh + 22, RW - 120, RH - 140 - bh - 22 - 70); }
  c.textAlign = 'right'; c.textBaseline = 'middle'; c.font = `500 20px ${FONT}`; c.fillStyle = 'rgba(255,255,255,.28)'; c.fillText('inksynth-pad.vercel.app', RW - 60, RH - 34);
}
/** 疊合總覽：用錄影專用的那一份，大小固定，跟網頁上的畫面無關 */
function recOverview(c, states, x, y, w, h){
  ovSize(REC_OV, Math.round(w), Math.round(h), 1);
  c.save(); rrect(c, x, y, w, h, 14); c.clip(); c.translate(x, y); drawOverview(REC_OV, c, states); c.restore();
  c.strokeStyle = '#262a36'; c.lineWidth = 2; rrect(c, x, y, w, h, 14); c.stroke();
}
/** 音效板：照網頁上的鍵盤排列（每列錯開 1/4 格）。ah＝0 表示貼齊上方；回傳實際高度 */
function recBoard(c, states, ax, ay, aw, ah){
  const u = aw / 43, pw = u * 4 - 10, ph = pw * 0.75, gap = Math.max(10, pw * 0.1), total = ph * 4 + gap * 3, y0 = ah ? ay + (ah - total) / 2 : ay;
  S.pads.forEach((_, i) => { const row = Math.floor(i / 10), col = i % 10; recPad(c, i, states[i], ax + (row + col * 4) * u + 5, y0 + row * (ph + gap), pw, ph); });
  return total;
}
function recPad(c, i, st, x, y, w, h){
  const p = S.pads[i], pe = padEls[i], col = padColor(p), empty = !p.objects.length, k = w / 170;
  c.save(); if(mixSilenced(i)) c.globalAlpha = 0.4;
  rrect(c, x, y, w, h, 12 * k); c.fillStyle = empty ? '#0f1016' : '#12141c'; c.fill();
  if(!empty && pe){
    if(pe.dirty && !pe.fresh){ renderThumbCache(i); pe.fresh = true; }   // 縮圖快取和主畫面共用
    c.save(); rrect(c, x, y, w, h, 12 * k); c.clip();
    if(pe.cache.width) c.drawImage(pe.cache, x, y, w, h);
    if(st.state === 'playing'){ c.translate(x, y); withKey(p, () => drawPlayhead(c, p.objects, st.prog, {W:w, H:h, k:h / 430}, padDur(p), col)); c.translate(-x, -y); }
    const gr = c.createLinearGradient(0, y + h - 34 * k, 0, y + h); gr.addColorStop(0, 'rgba(8,9,13,0)'); gr.addColorStop(1, 'rgba(8,9,13,.8)');
    c.fillStyle = gr; c.fillRect(x, y + h - 34 * k, w, 34 * k);
    c.font = `600 ${15 * k}px ${FONT}`; c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.fillStyle = '#f1ede2';
    let name = p.name || ''; while(name && c.measureText(name).width > w - 18 * k) name = name.slice(0, -1);
    c.fillText(name, x + 9 * k, y + h - 10 * k);
    c.fillStyle = 'rgba(255,255,255,.1)'; c.fillRect(x + 8 * k, y + h - 4 * k, w - 16 * k, 3 * k);   // 音量條
    c.fillStyle = col; c.fillRect(x + 8 * k, y + h - 4 * k, (w - 16 * k) * p.vol / 1.2, 3 * k);
    c.restore();
  }
  /* 外框：播放中發光、等待對拍時虛線 */
  rrect(c, x, y, w, h, 12 * k);
  if(st.state === 'playing'){ c.shadowColor = col; c.shadowBlur = 26 * k; c.strokeStyle = col; c.lineWidth = 3 * k; }
  else if(st.state === 'armed'){ c.strokeStyle = col; c.lineWidth = 2 * k; c.setLineDash([6 * k, 5 * k]); }
  else { c.strokeStyle = empty ? '#22252f' : '#262a36'; c.lineWidth = 1.5 * k; if(empty) c.setLineDash([5 * k, 4 * k]); }
  c.stroke(); c.setLineDash([]); c.shadowBlur = 0;
  /* 按鍵標籤 */
  const label = keyLabel(p.key); c.font = `700 ${15 * k}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
  const kw = Math.max(26 * k, c.measureText(label).width + 12 * k);
  rrect(c, x + 7 * k, y + 7 * k, kw, 26 * k, 6 * k); c.fillStyle = 'rgba(0,0,0,.6)'; c.fill();
  c.fillStyle = empty ? '#4b4f60' : '#f1ede2'; c.fillText(label, x + 7 * k + kw / 2, y + 20 * k);
  c.restore();
}
