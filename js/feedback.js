'use strict';
/* ============================================================
   feedback.js — 問題／意見回報
   網站是純靜態網頁，回報直接送到 Google 表單（formResponse），資料會出現在表單的回覆／試算表裡。
   設定方式：FEEDBACK.form 填表單的 ID，entries 填四個欄位的 entry 編號（從「取得預先填入的連結」看得到）。
   還沒設定時，所有回報入口都會藏起來。
   ============================================================ */
const FEEDBACK = {
  form:'',                                            // 例：1FAIpQLSc…（表單網址 /forms/d/e/ 後面那一段）
  entries:{type:'', text:'', contact:'', info:''},   // 例：entry.123456789
};
const feedbackReady = () => !!(FEEDBACK.form && FEEDBACK.entries.text);
const feedbackOpen = () => !$('#feedback').hidden;

/* 最近的錯誤（附在裝置資訊裡，方便查問題） */
const RECENT_ERRORS = [];
addEventListener('error', e => { RECENT_ERRORS.push(`${e.message} @${(e.filename || '').split('/').pop()}:${e.lineno}`); if(RECENT_ERRORS.length > 3) RECENT_ERRORS.shift(); });
addEventListener('unhandledrejection', e => { RECENT_ERRORS.push('Promise: ' + (e.reason && e.reason.message || e.reason)); if(RECENT_ERRORS.length > 3) RECENT_ERRORS.shift(); });

function deviceInfo(){
  const touch = matchMedia('(pointer:coarse)').matches, standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  return [
    `時間：${new Date().toLocaleString('zh-TW')}`,
    `瀏覽器：${navigator.userAgent}`,
    `螢幕：${innerWidth}×${innerHeight}・像素比 ${devicePixelRatio}・${touch ? '觸控' : '滑鼠'}${standalone ? '・主畫面 App' : ''}`,
    `畫面：${S.view === 'overview' ? '疊合總覽' : S.editing !== null ? `編輯器（第 ${S.editing + 1} 格）` : '音效板'}・${S.mode === 'edit' ? '編輯模式' : '演奏模式'}`,
    `音效板：${S.boardName}・${NOTE_NAMES[S.root]} ${SCALES[S.scale]?.name || S.scale}・${S.bpm} BPM・播放中 ${voices.size} 格`,
    `音訊：${typeof ctx !== 'undefined' && ctx ? `${ctx.state}・${ctx.sampleRate} Hz` : '尚未啟動'}・音色增強 ${ENH ? '開' : '關'}`,
    ...(RECENT_ERRORS.length ? ['最近的錯誤：', ...RECENT_ERRORS] : []),
  ].join('\n');
}

let fbType = '問題回報', fbLast = 0;
function openFeedback(){
  closeHelp(); $('#fbForm').hidden = false; $('#fbDone').hidden = true; $('#fbMsg').textContent = '';
  $('#fbInfoPre').textContent = deviceInfo(); $('#fbInfoPre').hidden = !$('#fbInfo').checked;
  $('#feedback').hidden = false; setTimeout(() => $('#fbText').focus(), 50);
}
function closeFeedback(){ $('#feedback').hidden = true; }
$('#fbType').onclick = e => { const b = e.target.closest('button'); if(!b) return; fbType = b.dataset.v;
  $$('#fbType button').forEach(x => x.classList.toggle('on', x === b)); };
$('#fbInfo').onchange = e => { $('#fbInfoPre').hidden = !e.target.checked; };
$('#fbClose').onclick = $('#fbCancel').onclick = $('#fbOk').onclick = closeFeedback;
$('#feedback').addEventListener('pointerdown', e => { if(e.target.id === 'feedback') closeFeedback(); });
$('#fbSend').onclick = async () => {
  const text = $('#fbText').value.trim();
  if(text.length < 4){ $('#fbMsg').textContent = '請多寫一點點內容'; $('#fbText').focus(); return; }
  if(Date.now() - fbLast < 20000){ $('#fbMsg').textContent = '剛剛才送出過，請稍等一下再送'; return; }
  const E = FEEDBACK.entries, body = new URLSearchParams();
  body.set(E.text, text);
  if(E.type) body.set(E.type, fbType);
  if(E.contact) body.set(E.contact, $('#fbContact').value.trim());
  if(E.info) body.set(E.info, $('#fbInfo').checked ? deviceInfo() : '（使用者選擇不附上）');
  $('#fbSend').disabled = true; $('#fbMsg').textContent = '傳送中…';
  try{
    // Google 表單不允許跨網域讀回應（no-cors），送得出去就當作成功
    await fetch(`https://docs.google.com/forms/d/e/${FEEDBACK.form}/formResponse`, {method:'POST', mode:'no-cors', body});
    fbLast = Date.now(); $('#fbText').value = ''; $('#fbForm').hidden = true; $('#fbDone').hidden = false;
  }catch(err){
    $('#fbMsg').textContent = '送不出去，請檢查網路後再試一次';
  }finally{ $('#fbSend').disabled = false; }
};
/* 入口：使用說明的章節列表、常見問題最後、頁尾 */
$$('[data-feedback]').forEach(el => el.addEventListener('click', e => { e.preventDefault(); openFeedback(); }));
$$('.fbEntry').forEach(el => el.hidden = !feedbackReady());
