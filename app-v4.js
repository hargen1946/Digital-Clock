import { INTERVALS, nextBoundary, announcement, timeString, dateString, timePhrase } from './clock-logic.js';
const $ = selector => document.querySelector(selector);
const settingsKey = 'desktop-clock-preferences-v1';
const prefs = {showYear: true, showMonthDay: true, interval: 5};
try {
  const saved = JSON.parse(localStorage.getItem(settingsKey) || 'null');
  if (saved && typeof saved.showYear === 'boolean') prefs.showYear = saved.showYear;
  if (saved && typeof saved.showMonthDay === 'boolean') prefs.showMonthDay = saved.showMonthDay;
  if (saved && INTERVALS.includes(saved.interval)) prefs.interval = saved.interval;
} catch { $('#save-status').textContent = '設定を読み込めませんでした。初期設定で起動しました。'; }
$('#show-year').checked = prefs.showYear;
$('#show-month-day').checked = prefs.showMonthDay;
$('#interval').value = String(prefs.interval);
let target = nextBoundary(new Date(), prefs.interval);
let previous = null;
let lastKey = '';
let audioEnabled = false;
let speechEpoch = 0;
let pendingInstall = null;
let pipWindow = null;
let pipTime = null;
let pipDate = null;
let clockWasVisible = !document.hidden;
const speech = window.speechSynthesis;
function setStatus(text) { $('#audio-status').textContent = text; }
function cancelSpeech() { speechEpoch++; speech?.cancel(); }
function updateAudioButton() {
  $('#audio-button').textContent = audioEnabled ? '音声通知を停止' : '音声通知を開始';
  $('#audio-button').setAttribute('aria-pressed', String(audioEnabled));
}
function stopAudio(text = '音声は停止中です') {
  audioEnabled = false; cancelSpeech(); updateAudioButton(); setStatus(text);
}
function japaneseVoice() {
  if (!speech) return null;
  return speech.getVoices().filter(v => /^ja(?:-|_)/i.test(v.lang)).sort((a,b) => Number(b.localService)-Number(a.localService) || Number(b.default)-Number(a.default))[0] || null;
}
function speak(text, onEnd) {
  if (!speech || !('SpeechSynthesisUtterance' in window)) {
    stopAudio('このブラウザーは読み上げに対応していません。ChromeまたはEdgeで開いてください。'); return false;
  }
  const voice = japaneseVoice();
  if (!voice) {
    stopAudio('日本語音声が見つかりません。Windowsの日本語読み上げ音声を確認し、少し待って再度お試しください。'); return false;
  }
  cancelSpeech();
  const epoch = speechEpoch;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ja-JP'; utterance.voice = voice; utterance.rate = 1; utterance.volume = 1;
  utterance.onerror = event => {
    if (epoch !== speechEpoch || event.error === 'canceled' || event.error === 'interrupted') return;
    stopAudio(event.error === 'not-allowed' ? '音声を開始できませんでした。「音声通知を開始」をもう一度押してください。' : '読み上げに失敗しました。PCの音声設定を確認して再度開始してください。');
  };
  utterance.onend = () => { if (epoch === speechEpoch) onEnd?.(); };
  speech.speak(utterance);
  return true;
}
// A page click explicitly enables speech. It is never auto-started on launch.
$('#audio-button').addEventListener('click', () => {
  if (audioEnabled) {stopAudio(); return;}
  audioEnabled = true;
  target = nextBoundary(new Date(), prefs.interval); previous = null; lastKey = '';
  updateAudioButton(); setStatus('音声通知中です');
  speak('音声通知を開始しました');
  render();
});
$('#test-button').addEventListener('click', () => {
  setStatus('音声をテストしています…');
  speak(`現在、${timePhrase(new Date())}です`, () => setStatus(audioEnabled ? '音声通知中です' : '音声テストが完了しました。通知は停止中です。'));
});
function savePreferences() {
  try {localStorage.setItem(settingsKey, JSON.stringify(prefs)); $('#save-status').textContent = '設定をこのPCに保存しました。';}
  catch {$('#save-status').textContent = 'このPCに設定を保存できません。今回はそのまま使用できます。';}
}
function applyPreferences(input) {
  if (input.showYear !== undefined) prefs.showYear = input.showYear;
  if (input.showMonthDay !== undefined) prefs.showMonthDay = input.showMonthDay;
  if (input.interval !== undefined && input.interval !== prefs.interval) {
    prefs.interval = input.interval; target = nextBoundary(new Date(), prefs.interval);
    previous = null; lastKey = ''; cancelSpeech();
  }
  $('#show-year').checked = prefs.showYear; $('#show-month-day').checked = prefs.showMonthDay;
  $('#interval').value = String(prefs.interval);
  savePreferences(); render();
}
$('#show-year').addEventListener('change', e => applyPreferences({showYear:e.target.checked}));
$('#show-month-day').addEventListener('change', e => applyPreferences({showMonthDay:e.target.checked}));
$('#interval').addEventListener('change', e => applyPreferences({interval:Number(e.target.value)}));
function showSettings(open) {
  $('#settings').hidden = !open; $('#settings-button').setAttribute('aria-expanded', String(open));
}
$('#settings-button').addEventListener('click', () => showSettings($('#settings').hidden));
$('.face').addEventListener('contextmenu', e => { e.preventDefault(); showSettings(true); $('#show-year').focus(); });
document.addEventListener('keydown', e => {if (e.key === 'Escape') {showSettings(false); $('#settings-button').focus();}});
$('#close-button').addEventListener('click', () => {
  stopAudio();
  pipWindow?.close();
  window.close();
  $('#message').textContent = '音声通知を停止しました。閉じない場合は、ウィンドウ右上の×で閉じてください。';
});
function render(now = new Date()) {
  $('#time').textContent = timeString(now); $('#time').dateTime = now.toISOString();
  if (pipTime) { pipTime.textContent = timeString(now); pipTime.dateTime = now.toISOString(); }
  const dateText = dateString(now, prefs.showYear, prefs.showMonthDay);
  $('#date').textContent = dateText;
  if (pipDate) {
    pipDate.textContent = dateText;
    pipDate.hidden = !dateText;
    pipWindow.document.body.classList.toggle('has-date', !!dateText);
  }
  const seconds = Math.max(0, Math.ceil((target-now)/1000));
  $('#next-label').textContent = seconds <= 60 ? '次回通知まで' : (audioEnabled ? '次回通知' : '通知予定');
  $('#next-time').textContent = seconds <= 60 ? `${seconds}秒 ・ ${timeString(target).slice(0,5)}` : `${timeString(target).slice(0,5)} ・ ${prefs.interval === 60 ? '1時間' : `${prefs.interval}分`}ごと`;
  $('#progress-bar').style.width = `${Math.max(0, Math.min(100, 100*(1-(target-now)/(prefs.interval*60000))))}%`;
}
function tick() {
  const now = new Date();
  const elapsed = previous ? now-previous : 0;
  if (previous && (elapsed < 0 || elapsed > 2000)) { target = nextBoundary(now, prefs.interval); lastKey = ''; }
  if (audioEnabled && clockIsVisible()) {
    const notice = announcement(now, previous, target);
    if (notice && notice.key !== lastKey) {lastKey = notice.key; speak(notice.text);}
  }
  if (now >= target) { target = nextBoundary(now, prefs.interval); lastKey = ''; }
  previous = now;
  render(now);
}
function clockIsVisible() {
  return !document.hidden || !!(pipWindow && !pipWindow.closed && !pipWindow.document.hidden);
}
function syncVisibility() {
  const visible = clockIsVisible();
  if (visible !== clockWasVisible) {
    cancelSpeech(); previous = null; lastKey = ''; target = nextBoundary(new Date(), prefs.interval);
    clockWasVisible = visible;
  }
  if (audioEnabled) setStatus(visible ? '音声通知中です' : '音声は一時停止中です（画面が非表示）');
  render();
}
document.addEventListener('visibilitychange', syncVisibility);
window.addEventListener('pagehide', () => { stopAudio(); pipWindow?.close(); timerOwner.clearInterval(timer); });
if (!speech || !('SpeechSynthesisUtterance' in window)) {
  $('#audio-button').disabled = true; $('#test-button').disabled = true;
  setStatus('読み上げにはChromeまたはEdgeをご利用ください。');
} else { speech.getVoices(); }
render();
let timerOwner = window;
let timer = window.setInterval(tick, 200);
function moveTimer(owner) {
  timerOwner.clearInterval(timer);
  timerOwner = owner; timer = owner.setInterval(tick, 200);
}
function updatePipButton() {
  const open = !!(pipWindow && !pipWindow.closed);
  $('#pip-button').textContent = open ? '小窓を閉じる' : '小窓表示';
  $('#pip-button').setAttribute('aria-pressed', String(open));
}
$('#pip-button').addEventListener('click', async () => {
  if (pipWindow && !pipWindow.closed) {pipWindow.close(); return;}
  if (!window.documentPictureInPicture?.requestWindow) {
    $('#message').textContent = '小窓表示には、最新のWindows版ChromeまたはEdgeをご利用ください。'; return;
  }
  const button = $('#pip-button'); button.disabled = true;
  try {
    const pip = await window.documentPictureInPicture.requestWindow({width:240, height:72, disallowReturnToOpener:true, preferInitialWindowPlacement:true});
    pipWindow = pip;
    pip.document.title = '時計';
    const style = pip.document.createElement('style');
    style.textContent = ':root{color-scheme:dark;background:#020a05}*{box-sizing:border-box}body{margin:0;padding:2px;height:100dvh;display:flex;flex-direction:column;gap:2px;align-items:center;justify-content:center;overflow:hidden}time{color:#6df5a3;font-family:Consolas,"Cascadia Mono","Courier New",monospace;font-weight:700;font-variant-numeric:tabular-nums;font-size:clamp(18px,min(15vw,65dvh),40px);letter-spacing:-.04em;line-height:1.1;white-space:nowrap}.has-date time{font-size:clamp(18px,min(15vw,calc((100dvh - 26px)/1.1)),40px)}#pip-date{color:#a5d4b7;font-family:"Yu Gothic UI","Meiryo",sans-serif;font-size:14px;line-height:1.3;font-variant-numeric:tabular-nums;text-align:center;white-space:nowrap;flex-shrink:0}[hidden]{display:none!important}';
    pip.document.head.append(style);
    pipTime = pip.document.createElement('time'); pipTime.setAttribute('aria-label','現在時刻');
    pipDate = pip.document.createElement('div'); pipDate.id = 'pip-date'; pipDate.setAttribute('aria-label','日付');
    pip.document.body.append(pipTime, pipDate);
    pip.document.addEventListener('visibilitychange',syncVisibility);
    pip.addEventListener('pagehide', () => {
      if (pipWindow !== pip) return;
      pipWindow = null; pipTime = null; pipDate = null; moveTimer(window); updatePipButton(); syncVisibility();
      $('#message').textContent = '';
    }, {once:true});
    moveTimer(pip); updatePipButton(); syncVisibility();
    $('#message').textContent = '小窓表示中です。通常画面は最小化できます。閉じると小窓も閉じます。';
  } catch {
    $('#message').textContent = '小窓を開けませんでした。ChromeまたはEdgeで、もう一度「小窓表示」を押してください。';
  } finally {button.disabled = false;}
});

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); pendingInstall = e; $('#install-button').hidden = false;
});
$('#install-button').addEventListener('click', async () => {
  if (!pendingInstall) return;
  const prompt = pendingInstall; pendingInstall = null;
  try {await prompt.prompt(); await prompt.userChoice;} catch {$('#message').textContent = 'Edgeのメニューからアプリをインストールしてください。';}
  $('#install-button').hidden = true;
});
window.addEventListener('appinstalled', () => {
  $('#install-button').hidden = true;
  $('#message').textContent = 'インストールしました。タスクバーの時計アイコンを右クリックしてピン留めしてください。';
});
if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('./sw.js', {scope:'./', updateViaCache:'none'}).then(async registration => {
    await navigator.serviceWorker.ready;
    $('#offline-status').textContent = 'オフライン利用の準備ができました。';
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) $('#message').textContent = '新しいバージョンがあります。時計を閉じて起動し直すと更新されます。';
      });
    });
  }).catch(() => {$('#offline-status').textContent = 'オフライン利用を準備できませんでした。接続中は使用できます。';});
} else { $('#offline-status').textContent = 'オフライン利用には、公開URLをChromeまたはEdgeで開いてください。'; }

// Optional browser agent interface uses exactly the same preferences as the UI.
if (document.modelContext?.registerTool) {
  const lifecycle = new AbortController();
  const tool = {
    name:'configure_clock', title:'時計の表示と通知間隔を設定',
    description:'このPCの時計の年・月日表示と通知間隔を保存する。音声の開始は画面のボタンで行う。',
    inputSchema:{type:'object',properties:{showYear:{type:'boolean'},showMonthDay:{type:'boolean'},interval:{type:'integer',enum:INTERVALS}},additionalProperties:false},
    annotations:{readOnlyHint:false,untrustedContentHint:false},
    execute(input) {
      if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k=>!['showYear','showMonthDay','interval'].includes(k))) throw new TypeError('設定が無効です');
      for (const k of ['showYear','showMonthDay']) if (k in input && typeof input[k] !== 'boolean') throw new TypeError('表示設定が無効です');
      if ('interval' in input && !INTERVALS.includes(input.interval)) throw new RangeError('通知間隔が無効です');
      applyPreferences(input); return {...prefs,audioEnabled};
    }
  };
  try { Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{}); } catch {}
  window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}
