'use strict';

const APP_VERSION = 'SINC-ALARMAS-NUEVA-v2-DIALOGOS-PERSONALIZADOS-20260711';
const GPS_INTERVAL_MS = 60000;
const REST_ALARM_POLL_MS = 2500;
const REST_GPS_POLL_MS = 7000;

// Configuración Firebase de respaldo. La configuración pública de Firebase no es una clave secreta.
// Se incluye aquí para que la app no se quede en modo local si no se sube firebase-config.js.
const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyA5qyoQK_YAH58FKYynViWJrnMIiJkpY",
  authDomain: "sincalarmas.firebaseapp.com",
  databaseURL: "https://sincalarmas-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "sincalarmas",
  storageBucket: "sincalarmas.firebasestorage.app",
  messagingSenderId: "640133778450",
  appId: "1:640133778450:web:fbcff7b620d7c686c91ccb",
  measurementId: "G-JNBH8HQPMK"
};


const LS = {
  deviceId: 'sinc_alarmas_nueva_device_id_v1',
  peerId: 'sinc_alarmas_nueva_peer_id_v1',
  pairKey: 'sinc_alarmas_nueva_pair_key_v1',
  alarms: 'sinc_alarmas_nueva_alarms_v1',
  gpsLogs: 'sinc_alarmas_nueva_gps_logs_v1',
  settings: 'sinc_alarmas_nueva_settings_v1',
  shownInitial: 'sinc_alarmas_nueva_shown_initial_v1',
  ackShown: 'sinc_alarmas_nueva_ack_shown_v1'
};

const AlarmStatus = {
  pending: 'pending',
  received: 'received_by_receiver',
  ringing: 'ringing',
  completed: 'completed',
  cancelled: 'cancelled',
  error: 'error'
};

const state = {
  deviceId: getOrCreateDeviceId(),
  peerId: localStorage.getItem(LS.peerId) || '',
  pairKey: localStorage.getItem(LS.pairKey) || '',
  alarms: loadJson(LS.alarms, []),
  gpsLogs: loadJson(LS.gpsLogs, {}),
  settings: loadJson(LS.settings, { theme: 'blue', mode: '3d', opacity: 92, sound: 'classic', historyFilter: 'all' }),
  shownInitial: loadJson(LS.shownInitial, {}),
  ackShown: loadJson(LS.ackShown, {}),
  firebaseMode: 'local',
  firebaseReady: false,
  db: null,
  restPollTimer: null,
  restGpsPollTimers: {},
  sdkAlarmRef: null,
  sdkGpsRefs: {},
  gpsPermission: 'unknown',
  gpsLastPosition: null,
  gpsLastPositionAt: 0,
  senderGpsTimers: {},
  senderGpsBusy: {},
  activeRingingAlarmId: '',
  activeInitialPopupAlarmId: '',
  audioCtx: null,
  ringTimer: null,
  appDialogResolver: null,
  appDialogLastFocus: null
};

const $ = (id) => document.getElementById(id);

document.addEventListener('DOMContentLoaded', init);

function init(){
  setText('versionLine', APP_VERSION);
  migrateOldKnownData();
  applySettings();
  setupEvents();
  setDefaultDateTime();
  updateIdentityUI();
  updateGpsPermissionUI();
  initFirebase();
  renderAll();
  setInterval(checkDueAlarms, 1000);
  setInterval(resumeSenderGpsForOwnActiveAlarms, 15000);
}

function setupEvents(){
  on('menuBtn', 'click', openMenu);
  on('closeMenuBtn', 'click', closeMenu);
  on('scrim', 'click', () => { closeMenu(); closePanels(); });
  on('quickPairBtn', 'click', () => openPanel('pairPanel'));
  on('quickSendBtn', 'click', () => openPanel('sendPanel'));
  on('quickListBtn', 'click', () => openPanel('historyPanel'));
  on('openListBtn', 'click', () => openPanel('historyPanel'));
  on('savePairBtn', 'click', savePairing);
  on('clearPairBtn', 'click', clearPairing);
  on('copyMyIdBtn', 'click', copyMyDeviceId);
  on('authorizeGpsBtn', 'click', authorizeGpsFromButton);
  on('sendAlarmBtn', 'click', sendAlarm);
  on('closeInitialPopupBtn', 'click', closeInitialPopup);
  on('confirmReceivedBtn', 'click', confirmReceivedAlarm);
  on('closeSenderAckBtn', 'click', () => $('senderAckPopup').classList.add('hidden'));
  on('appDialogCancelBtn', 'click', () => closeAppDialog(false));
  on('appDialogConfirmBtn', 'click', () => closeAppDialog(true));
  on('appDialogCopyBtn', 'click', copyDialogValue);
  on('appDialog', 'click', ev => { if(ev.target === $('appDialog')) closeAppDialog(false); });
  document.addEventListener('keydown', ev => {
    if(ev.key === 'Escape' && !$('appDialog')?.classList.contains('hidden')) closeAppDialog(false);
  });
  on('historyAllBtn', 'click', () => { state.settings.historyFilter = 'all'; saveSettings(); renderAll(); });
  on('historyPendingBtn', 'click', () => { state.settings.historyFilter = 'pending'; saveSettings(); renderAll(); });
  on('historyClearLocalBtn', 'click', clearCompletedLocalHistory);
  on('opacityInput', 'input', () => {
    state.settings.opacity = Number($('opacityInput').value || 92);
    saveSettings(); applySettings();
  });
  on('soundSelect', 'change', () => { state.settings.sound = $('soundSelect').value; saveSettings(); });
  on('testSoundBtn', 'click', () => { startTone(); setTimeout(stopTone, 1800); });

  document.querySelectorAll('[data-panel]').forEach(btn => btn.addEventListener('click', () => openPanel(btn.dataset.panel)));
  document.querySelectorAll('[data-close]').forEach(btn => btn.addEventListener('click', closePanels));
  document.querySelectorAll('#themeButtons button').forEach(btn => btn.addEventListener('click', () => {
    state.settings.theme = btn.dataset.theme; saveSettings(); applySettings();
  }));
  document.querySelectorAll('#modeButtons button').forEach(btn => btn.addEventListener('click', () => {
    state.settings.mode = btn.dataset.mode; saveSettings(); applySettings();
  }));
  document.addEventListener('click', handleAlarmAction);
}

function on(id, event, fn){ const el = $(id); if(el) el.addEventListener(event, fn); }
function setText(id, value){ const el = $(id); if(el) el.textContent = value == null ? '' : String(value); }

function migrateOldKnownData(){
  const oldDevice = localStorage.getItem('sinc_alarmas_device_id_v3') || localStorage.getItem('sinc_alarmas_device_id_v2');
  const oldPeer = localStorage.getItem('sinc_alarmas_peer_id_v3') || localStorage.getItem('sinc_alarmas_peer_id_v2');
  if(oldDevice && !localStorage.getItem(LS.deviceId)) {
    state.deviceId = oldDevice;
    localStorage.setItem(LS.deviceId, oldDevice);
  }
  if(oldPeer && !state.peerId) {
    state.peerId = oldPeer;
    state.pairKey = buildPairKey(state.deviceId, oldPeer);
    persistPairing();
  }
}

function getOrCreateDeviceId(){
  let id = localStorage.getItem(LS.deviceId);
  if(!id){
    id = 'MOVIL-' + randomPart() + '-' + randomPart();
    localStorage.setItem(LS.deviceId, id);
  }
  return id;
}
function randomPart(){ return Math.random().toString(36).slice(2,6).toUpperCase(); }
function loadJson(key, fallback){
  try { const parsed = JSON.parse(localStorage.getItem(key) || ''); return parsed ?? fallback; }
  catch { return fallback; }
}
function saveAlarms(){ localStorage.setItem(LS.alarms, JSON.stringify(state.alarms)); }
function saveGpsLogs(){ localStorage.setItem(LS.gpsLogs, JSON.stringify(state.gpsLogs)); }
function saveSettings(){ localStorage.setItem(LS.settings, JSON.stringify(state.settings)); }
function saveShownInitial(){ localStorage.setItem(LS.shownInitial, JSON.stringify(state.shownInitial)); }
function saveAckShown(){ localStorage.setItem(LS.ackShown, JSON.stringify(state.ackShown)); }

function normalizeDeviceId(id){ return String(id || '').trim().toUpperCase().replace(/\s+/g, ''); }
function buildPairKey(a,b){
  const ids = [normalizeDeviceId(a), normalizeDeviceId(b)].sort();
  return stableHash(ids.join('|')).slice(0, 16);
}
function stableHash(str){
  let h1 = 0xdeadbeef ^ str.length;
  let h2 = 0x41c6ce57 ^ str.length;
  for(let i=0; i<str.length; i++){
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const n = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return n.toString(16).padStart(14, '0');
}
function safeKey(value){ return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_'); }

function applySettings(){
  const app = $('app');
  if(!app) return;
  app.className = `app theme-${state.settings.theme || 'blue'} mode-${state.settings.mode || '3d'}`;
  document.documentElement.style.setProperty('--window-opacity', String((Number(state.settings.opacity || 92)) / 100));
  setText('opacityValue', `${state.settings.opacity || 92}%`);
  const opacity = $('opacityInput'); if(opacity) opacity.value = state.settings.opacity || 92;
  const sound = $('soundSelect'); if(sound) sound.value = state.settings.sound || 'classic';
  document.querySelectorAll('#themeButtons button').forEach(btn => btn.classList.toggle('active', btn.dataset.theme === state.settings.theme));
  document.querySelectorAll('#modeButtons button').forEach(btn => btn.classList.toggle('active', btn.dataset.mode === state.settings.mode));
}

function openMenu(){ $('sideMenu')?.classList.add('open'); $('scrim')?.classList.add('show'); }
function closeMenu(){ $('sideMenu')?.classList.remove('open'); $('scrim')?.classList.remove('show'); }
function openPanel(id){ closeMenu(); closePanels(); const el = $(id); if(el) el.classList.remove('hidden'); $('scrim')?.classList.add('show'); if(id === 'sendPanel') setDefaultDateTime(); }
function closePanels(){ document.querySelectorAll('.panel').forEach(p => p.classList.add('hidden')); if(!$('sideMenu')?.classList.contains('open')) $('scrim')?.classList.remove('show'); }

function setDefaultDateTime(){
  const input = $('alarmDateTime');
  if(!input || input.value) return;
  const d = new Date(Date.now() + 5 * 60000);
  d.setSeconds(0,0);
  const pad = n => String(n).padStart(2,'0');
  input.value = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function updateIdentityUI(){
  setText('myDeviceIdText', state.deviceId);
  setText('myDeviceIdCode', state.deviceId);
  setText('peerDeviceIdText', state.peerId || 'No emparejado');
  setText('pairKeyText', state.pairKey || 'Sin canal');
  const peerInput = $('peerIdInput'); if(peerInput) peerInput.value = state.peerId || '';
  const onlineText = state.firebaseReady
    ? (state.firebaseMode === 'sdk' ? 'Sincronización online activa (Firebase SDK)' : 'Sincronización online activa (REST)')
    : 'Modo local · sin Firebase activo';
  setText('statusLine', `${onlineText}${state.pairKey ? ' · canal ' + state.pairKey : ''}`);
}

function savePairing(){
  const peer = normalizeDeviceId($('peerIdInput')?.value || '');
  if(!/^MOVIL-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(peer)){
    setPanelInfo('pairInfo', 'Introduce un ID con formato MOVIL-XXXX-XXXX.', true); return;
  }
  if(peer === state.deviceId){ setPanelInfo('pairInfo', 'No puedes emparejar este móvil consigo mismo.', true); return; }
  state.peerId = peer;
  state.pairKey = buildPairKey(state.deviceId, peer);
  persistPairing();
  setPanelInfo('pairInfo', `Emparejamiento guardado. Canal Firebase: ${state.pairKey}`);
  updateIdentityUI();
  restartFirebaseSubscription();
  renderAll();
}
function persistPairing(){ localStorage.setItem(LS.peerId, state.peerId); localStorage.setItem(LS.pairKey, state.pairKey); }
async function clearPairing(){
  const accepted = await appConfirm({
    title: 'Borrar emparejamiento',
    message: 'Este móvil dejará de estar vinculado con el otro dispositivo. Las alarmas guardadas localmente no se borrarán.',
    confirmText: 'BORRAR',
    cancelText: 'CANCELAR',
    tone: 'danger'
  });
  if(!accepted) return;
  state.peerId = ''; state.pairKey = '';
  localStorage.removeItem(LS.peerId); localStorage.removeItem(LS.pairKey);
  stopAllRemoteListeners(); updateIdentityUI(); renderAll();
  setPanelInfo('pairInfo', 'Emparejamiento borrado.');
}
async function copyMyDeviceId(){
  try {
    await navigator.clipboard.writeText(state.deviceId);
    toast('ID copiado.');
  } catch {
    await showCopyIdDialog(state.deviceId);
  }
}
function setPanelInfo(id, text, isError=false){ const el=$(id); if(!el) return; el.textContent=text; el.style.color=isError?'#dc2626':'var(--primary)'; }

function initFirebase(){
  const cfg = window.SINC_FIREBASE_CONFIG || DEFAULT_FIREBASE_CONFIG;
  window.SINC_FIREBASE_CONFIG = cfg;
  if(!cfg || !cfg.databaseURL){ state.firebaseReady = false; updateIdentityUI(); return; }
  try {
    if(window.firebase && firebase.apps){
      if(!firebase.apps.length) firebase.initializeApp(cfg);
      state.db = firebase.database();
      state.firebaseReady = true;
      state.firebaseMode = 'sdk';
      restartFirebaseSubscription();
      updateIdentityUI();
      return;
    }
  } catch (err) {
    console.warn('Firebase SDK no disponible, se usará REST.', err);
  }
  state.firebaseReady = true;
  state.firebaseMode = 'rest';
  restartFirebaseSubscription();
  updateIdentityUI();
}

function restartFirebaseSubscription(){
  stopAllRemoteListeners();
  if(!state.firebaseReady || !state.pairKey) return;
  if(state.firebaseMode === 'sdk') startSdkAlarmListener();
  else startRestAlarmPolling();
}
function stopAllRemoteListeners(){
  if(state.sdkAlarmRef){ try { state.sdkAlarmRef.off(); } catch{} state.sdkAlarmRef = null; }
  Object.values(state.sdkGpsRefs).forEach(ref => { try { ref.off(); } catch{} });
  state.sdkGpsRefs = {};
  if(state.restPollTimer){ clearInterval(state.restPollTimer); state.restPollTimer = null; }
  Object.values(state.restGpsPollTimers).forEach(t => clearInterval(t));
  state.restGpsPollTimers = {};
}
function startSdkAlarmListener(){
  if(!state.db || !state.pairKey) return;
  state.sdkAlarmRef = state.db.ref(`pairs/${state.pairKey}/alarms`);
  state.sdkAlarmRef.on('value', snap => processRemoteAlarms(snap.val() || {}), err => {
    console.error(err); state.firebaseReady = false; updateIdentityUI();
  });
}
function startRestAlarmPolling(){
  pollRemoteAlarmsRest();
  state.restPollTimer = setInterval(pollRemoteAlarmsRest, REST_ALARM_POLL_MS);
}
async function pollRemoteAlarmsRest(){
  if(!state.pairKey || state.firebaseMode !== 'rest') return;
  try {
    const data = await restGet(`pairs/${state.pairKey}/alarms`);
    processRemoteAlarms(data || {});
  } catch(err){ console.warn('REST alarm polling failed:', err); }
}
async function restGet(path){
  const url = restUrl(path);
  const res = await fetch(url, { cache: 'no-store' });
  if(!res.ok) throw new Error(`GET ${path} ${res.status}`);
  return await res.json();
}
async function restPut(path, data){
  const res = await fetch(restUrl(path), { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data) });
  if(!res.ok) throw new Error(`PUT ${path} ${res.status}`);
  return await res.json();
}
async function restPatch(path, data){
  const res = await fetch(restUrl(path), { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data) });
  if(!res.ok) throw new Error(`PATCH ${path} ${res.status}`);
  return await res.json();
}
function restUrl(path){
  const base = String(window.SINC_FIREBASE_CONFIG.databaseURL || '').replace(/\/$/, '');
  return `${base}/${path}.json`;
}

async function dbSetAlarm(alarm){
  if(!state.firebaseReady || !state.pairKey) throw new Error('Firebase no está activo.');
  if(state.firebaseMode === 'sdk') await state.db.ref(`pairs/${state.pairKey}/alarms/${alarm.id}`).set(alarm);
  else await restPut(`pairs/${state.pairKey}/alarms/${alarm.id}`, alarm);
}
async function dbUpdateAlarm(alarmId, patch){
  if(!state.firebaseReady || !state.pairKey) throw new Error('Firebase no está activo.');
  patch.updatedAt = Date.now();
  if(state.firebaseMode === 'sdk') await state.db.ref(`pairs/${state.pairKey}/alarms/${alarmId}`).update(patch);
  else await restPatch(`pairs/${state.pairKey}/alarms/${alarmId}`, patch);
}
async function dbPutGpsLog(alarmId, log){
  if(!state.firebaseReady || !state.pairKey) throw new Error('Firebase no está activo.');
  const key = `${log.timestamp}_${safeKey(log.from)}`;
  if(state.firebaseMode === 'sdk') await state.db.ref(`pairs/${state.pairKey}/gpsLogs/${alarmId}/${key}`).set(log);
  else await restPut(`pairs/${state.pairKey}/gpsLogs/${alarmId}/${key}`, log);
}

function processRemoteAlarms(remoteObj){
  const remoteAlarms = Object.values(remoteObj || {}).filter(Boolean);
  let changed = false;
  for(const remote of remoteAlarms){
    if(!remote.id || !isAlarmInThisChannel(remote)) continue;
    const local = state.alarms.find(a => a.id === remote.id);
    if(remote.from === state.deviceId){
      changed = upsertAlarm(Object.assign({}, local || {}, remote, { direction: 'outgoing' })) || changed;
      processOutgoingRemoteUpdate(remote);
    } else if(shouldAcceptIncomingAlarm(remote)){
      const normalized = Object.assign({}, local || {}, remote, { direction: 'incoming', to: state.deviceId });
      changed = upsertAlarm(normalized) || changed;
      processIncomingRemoteUpdate(normalized);
      confirmProgrammedOnReceiver(normalized);
      ensureGpsListener(normalized.id);
      maybeShowInitialReceiverPopup(normalized);
    }
  }
  if(changed){ saveAlarms(); renderAll(); }
  resumeSenderGpsForOwnActiveAlarms();
}
function isAlarmInThisChannel(alarm){ return !alarm.pairKey || alarm.pairKey === state.pairKey; }
function shouldAcceptIncomingAlarm(alarm){
  if(!state.peerId || !state.pairKey) return false;
  if(alarm.from === state.deviceId) return false;
  if(alarm.from !== state.peerId) return false;
  if(alarm.pairKey && alarm.pairKey !== state.pairKey) return false;
  return true;
}
function processOutgoingRemoteUpdate(alarm){
  if(alarm.cancelled || alarm.status === AlarmStatus.cancelled || alarm.status === AlarmStatus.completed) stopSenderGps(alarm.id);
  if(alarm.receivedByReceiver && !state.ackShown[alarm.id]){
    state.ackShown[alarm.id] = Date.now(); saveAckShown();
    showSenderAck(alarm);
  }
}
function processIncomingRemoteUpdate(alarm){
  if(!alarm || alarm.direction !== 'incoming') return;
  if(alarm.status === AlarmStatus.cancelled || alarm.cancelled){
    if(state.activeRingingAlarmId === alarm.id){
      stopTone();
      state.activeRingingAlarmId = '';
      $('ringingPopup')?.classList.add('hidden');
      toast('Alarma anulada por el emisor.');
    }
    stopGpsListener(alarm.id);
  }
  if(alarm.status === AlarmStatus.completed){
    stopGpsListener(alarm.id);
  }
}
async function confirmProgrammedOnReceiver(alarm){
  if(!alarm || alarm.from === state.deviceId) return;
  if(alarm.receivedByReceiver && alarm.receiverDeviceId === state.deviceId) return;
  try {
    await dbUpdateAlarm(alarm.id, {
      to: state.deviceId,
      receivedByReceiver: true,
      receiverDeviceId: state.deviceId,
      receiverConfirmedAt: Date.now(),
      status: alarm.status === AlarmStatus.pending ? AlarmStatus.received : alarm.status
    });
  } catch(err){ console.warn('No se pudo confirmar recepción:', err); }
}
function upsertAlarm(alarm){
  const idx = state.alarms.findIndex(a => a.id === alarm.id);
  if(idx >= 0){
    const before = JSON.stringify(state.alarms[idx]);
    state.alarms[idx] = Object.assign({}, state.alarms[idx], alarm);
    return JSON.stringify(state.alarms[idx]) !== before;
  }
  state.alarms.push(alarm);
  return true;
}

async function authorizeGpsFromButton(){
  setGpsPermission('requesting', 'Solicitando GPS... Revisa si el iPhone o Android muestra un aviso de permiso.');
  try {
    const pos = await requestPosition({ enableHighAccuracy:false, timeout:12000, maximumAge:300000 });
    state.gpsLastPosition = pos;
    state.gpsLastPositionAt = Date.now();
    setGpsPermission('granted', `GPS autorizado correctamente. Última precisión: ±${Math.round(pos.coords.accuracy || 0)} m.`);
  } catch(firstErr){
    try {
      setGpsPermission('requesting', 'Primer intento sin respuesta. Probando de nuevo con mayor precisión...');
      const pos = await requestPosition({ enableHighAccuracy:true, timeout:18000, maximumAge:0 });
      state.gpsLastPosition = pos;
      state.gpsLastPositionAt = Date.now();
      setGpsPermission('granted', `GPS autorizado correctamente. Última precisión: ±${Math.round(pos.coords.accuracy || 0)} m.`);
    } catch(err){
      setGpsPermission('denied', gpsErrorMessage(err));
    }
  }
}
function requestPosition(options){
  return new Promise((resolve, reject) => {
    if(!navigator.geolocation){ reject(new Error('GPS no disponible en este navegador.')); return; }
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}
function setGpsPermission(status, message){ state.gpsPermission = status; setText('gpsPermissionText', message); updateGpsPermissionUI(); }
function updateGpsPermissionUI(){
  const btn = $('authorizeGpsBtn'); if(!btn) return;
  btn.disabled = state.gpsPermission === 'requesting';
  if(state.gpsPermission === 'granted') btn.textContent = 'GPS autorizado en este móvil';
  else if(state.gpsPermission === 'requesting') btn.textContent = 'Solicitando GPS...';
  else btn.textContent = 'Autorizar GPS de este móvil';
}
function gpsErrorMessage(err){
  if(err && err.code === 1) return 'GPS denegado. En ajustes del navegador, permite ubicación para esta web. Puedes enviar la alarma, pero no se enviarán coordenadas.';
  if(err && err.code === 2) return 'No se pudo obtener ubicación. Comprueba cobertura GPS, WiFi/datos y permisos.';
  if(err && err.code === 3) return 'El GPS tardó demasiado. Prueba en exterior o abre la app desde Safari/Chrome directamente.';
  return (err && err.message) || 'No se pudo autorizar el GPS.';
}

async function sendAlarm(){
  const info = $('sendInfo'); if(info) info.textContent = '';
  if(!state.peerId || !state.pairKey){ setPanelInfo('sendInfo', 'Primero debes emparejar este móvil con el otro.', true); return; }
  if(!state.firebaseReady){ setPanelInfo('sendInfo', 'No se puede enviar: Firebase no está activo. La alarma no se marcará como enviada.', true); return; }
  const input = $('alarmDateTime');
  const message = ($('alarmMessage')?.value || '').trim() || 'Alarma sin mensaje';
  const scheduledAt = input?.value ? new Date(input.value).getTime() : NaN;
  if(!Number.isFinite(scheduledAt)){ setPanelInfo('sendInfo', 'Selecciona una fecha y hora válidas.', true); return; }
  if(scheduledAt < Date.now() - 30000){ setPanelInfo('sendInfo', 'La fecha y hora no pueden estar en el pasado.', true); return; }

  const id = `alarm_${Date.now()}_${safeKey(state.deviceId)}`;
  const gpsEnabled = state.gpsPermission === 'granted';
  const alarm = {
    id,
    from: state.deviceId,
    to: state.peerId,
    pairKey: state.pairKey,
    scheduledAt,
    dateText: formatDate(scheduledAt),
    timeText: formatTime(scheduledAt),
    message,
    status: AlarmStatus.pending,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    receivedByReceiver: false,
    receiverConfirmedAt: null,
    receiverDeviceId: null,
    cancelled: false,
    cancelledAt: null,
    completedAt: null,
    gpsEnabledBySender: gpsEnabled,
    gpsStoppedAt: null,
    lastGpsAt: null,
    direction: 'outgoing'
  };

  setPanelInfo('sendInfo', 'Guardando alarma online...');
  try {
    await dbSetAlarm(alarm);
    upsertAlarm(alarm); saveAlarms(); renderAll();
    setPanelInfo('sendInfo', gpsEnabled ? 'Alarma enviada online. GPS activo: se enviará la primera ubicación y después una cada minuto.' : 'Alarma enviada online. GPS no autorizado: el receptor recibirá la alarma, pero no verá coordenadas.');
    $('alarmMessage').value = '';
    setDefaultDateTime();
    if(gpsEnabled) startSenderGps(alarm);
  } catch(err){
    console.error(err);
    setPanelInfo('sendInfo', 'Error: Firebase no confirmó la escritura. La alarma no debe considerarse enviada.', true);
  }
}

function startSenderGps(alarm){
  if(!alarm || !alarm.id || alarm.from !== state.deviceId) return;
  if(alarm.status === AlarmStatus.cancelled || alarm.status === AlarmStatus.completed) return;
  if(state.senderGpsTimers[alarm.id]) return;
  uploadGpsOnce(alarm.id);
  state.senderGpsTimers[alarm.id] = setInterval(() => uploadGpsOnce(alarm.id), GPS_INTERVAL_MS);
}
function stopSenderGps(alarmId){
  if(state.senderGpsTimers[alarmId]){ clearInterval(state.senderGpsTimers[alarmId]); delete state.senderGpsTimers[alarmId]; }
  delete state.senderGpsBusy[alarmId];
}
async function uploadGpsOnce(alarmId){
  const alarm = state.alarms.find(a => a.id === alarmId);
  if(!alarm || alarm.from !== state.deviceId || !isActiveAlarm(alarm)) { stopSenderGps(alarmId); return; }
  if(state.senderGpsBusy[alarmId]) return;
  state.senderGpsBusy[alarmId] = true;
  try {
    let pos = null;
    if(state.gpsLastPosition && Date.now() - state.gpsLastPositionAt < 20000) pos = state.gpsLastPosition;
    else pos = await requestPosition({ enableHighAccuracy:false, timeout:15000, maximumAge:30000 });
    state.gpsLastPosition = pos; state.gpsLastPositionAt = Date.now();
    const log = {
      alarmId,
      from: state.deviceId,
      to: state.peerId,
      timestamp: Date.now(),
      latitude: Number(pos.coords.latitude),
      longitude: Number(pos.coords.longitude),
      accuracy: Number(pos.coords.accuracy || 0),
      source: 'sender'
    };
    addGpsLogLocal(alarmId, log);
    await dbPutGpsLog(alarmId, log);
    await dbUpdateAlarm(alarmId, { lastGpsAt: log.timestamp, gpsEnabledBySender: true });
  } catch(err){
    console.warn('GPS upload failed:', err);
  } finally {
    state.senderGpsBusy[alarmId] = false;
  }
}
function resumeSenderGpsForOwnActiveAlarms(){
  state.alarms.filter(a => a.from === state.deviceId && a.gpsEnabledBySender && isActiveAlarm(a)).forEach(a => {
    if(state.gpsPermission === 'granted') startSenderGps(a);
  });
}
function isActiveAlarm(alarm){ return [AlarmStatus.pending, AlarmStatus.received, AlarmStatus.ringing].includes(alarm.status) && !alarm.cancelled; }

function ensureGpsListener(alarmId){
  if(!alarmId || !state.firebaseReady || !state.pairKey) return;
  if(state.firebaseMode === 'sdk'){
    if(state.sdkGpsRefs[alarmId]) return;
    const ref = state.db.ref(`pairs/${state.pairKey}/gpsLogs/${alarmId}`);
    state.sdkGpsRefs[alarmId] = ref;
    ref.on('value', snap => processGpsLogs(alarmId, snap.val() || {}), err => console.warn('GPS listener failed:', err));
  } else {
    if(state.restGpsPollTimers[alarmId]) return;
    pollGpsRest(alarmId);
    state.restGpsPollTimers[alarmId] = setInterval(() => pollGpsRest(alarmId), REST_GPS_POLL_MS);
  }
}
async function pollGpsRest(alarmId){
  try { processGpsLogs(alarmId, await restGet(`pairs/${state.pairKey}/gpsLogs/${alarmId}`) || {}); }
  catch(err){ console.warn('REST GPS polling failed:', err); }
}
function processGpsLogs(alarmId, logsObj){
  const logs = Object.values(logsObj || {}).filter(l => l && l.alarmId === alarmId).sort((a,b) => b.timestamp - a.timestamp);
  if(!logs.length) return;
  state.gpsLogs[alarmId] = logs;
  saveGpsLogs();
  renderGpsLists(alarmId);
  renderAll();
}
function addGpsLogLocal(alarmId, log){
  const arr = state.gpsLogs[alarmId] || [];
  if(!arr.some(x => x.timestamp === log.timestamp && x.from === log.from)) arr.unshift(log);
  arr.sort((a,b) => b.timestamp - a.timestamp);
  state.gpsLogs[alarmId] = arr.slice(0, 500);
  saveGpsLogs();
  renderGpsLists(alarmId);
}
function stopGpsListener(alarmId){
  if(state.sdkGpsRefs[alarmId]){ try { state.sdkGpsRefs[alarmId].off(); } catch{} delete state.sdkGpsRefs[alarmId]; }
  if(state.restGpsPollTimers[alarmId]){ clearInterval(state.restGpsPollTimers[alarmId]); delete state.restGpsPollTimers[alarmId]; }
}

function maybeShowInitialReceiverPopup(alarm){
  if(!alarm || alarm.direction !== 'incoming' || !isActiveAlarm(alarm)) return;
  if(state.shownInitial[alarm.id]) return;
  state.shownInitial[alarm.id] = Date.now(); saveShownInitial();
  showInitialReceiverPopup(alarm);
}
function showInitialReceiverPopup(alarm){
  state.activeInitialPopupAlarmId = alarm.id;
  const html = `
    <p><strong>Mensaje:</strong><br>${escapeHtml(alarm.message || 'Alarma sin mensaje')}</p>
    <p><strong>Día programado:</strong> ${escapeHtml(formatDate(alarm.scheduledAt))}</p>
    <p><strong>Hora programada:</strong> ${escapeHtml(formatTime(alarm.scheduledAt))}</p>
    <p><strong>Estado:</strong> <span class="alarm-status ${statusClass(alarm.status)}">${escapeHtml(statusText(alarm.status))}</span></p>
  `;
  $('initialPopupContent').innerHTML = html;
  renderGpsListInto('initialGpsList', alarm.id);
  $('initialReceiverPopup').classList.remove('hidden');
}
function closeInitialPopup(){ state.activeInitialPopupAlarmId = ''; $('initialReceiverPopup').classList.add('hidden'); }
function renderGpsLists(alarmId){
  if(state.activeInitialPopupAlarmId === alarmId) renderGpsListInto('initialGpsList', alarmId);
  if(state.activeRingingAlarmId === alarmId) renderGpsListInto('ringingGpsList', alarmId);
}
function renderGpsListInto(containerId, alarmId){
  const box = $(containerId); if(!box) return;
  const logs = (state.gpsLogs[alarmId] || []).slice().sort((a,b) => b.timestamp - a.timestamp);
  if(!logs.length){ box.innerHTML = '<div class="gps-empty">Esperando primera ubicación del emisor...</div>'; return; }
  box.innerHTML = logs.slice(0, 80).map(log => {
    const lat = Number(log.latitude).toFixed(6);
    const lng = Number(log.longitude).toFixed(6);
    const acc = Number(log.accuracy || 0).toFixed(0);
    const maps = `https://www.google.com/maps?q=${lat},${lng}`;
    return `<div class="gps-line">${escapeHtml(formatDate(log.timestamp))} · ${escapeHtml(formatTimeWithSeconds(log.timestamp))}<br><a href="${maps}" target="_blank" rel="noopener">${lat}, ${lng}</a> · ±${acc} m</div>`;
  }).join('');
}

function checkDueAlarms(){
  const now = Date.now();
  for(const alarm of state.alarms){
    if(alarm.direction !== 'incoming') continue;
    if(!isActiveAlarm(alarm)) continue;
    if(Number(alarm.scheduledAt) <= now){
      showRingingAlarm(alarm);
      break;
    }
  }
}
async function showRingingAlarm(alarm){
  if(state.activeRingingAlarmId === alarm.id) return;
  state.activeRingingAlarmId = alarm.id;
  alarm.status = AlarmStatus.ringing;
  upsertAlarm(alarm); saveAlarms(); renderAll(); ensureGpsListener(alarm.id);
  $('ringingContent').innerHTML = `
    <p><strong>Mensaje:</strong><br>${escapeHtml(alarm.message || 'Alarma sin mensaje')}</p>
    <p><strong>Día:</strong> ${escapeHtml(formatDate(alarm.scheduledAt))}</p>
    <p><strong>Hora:</strong> ${escapeHtml(formatTime(alarm.scheduledAt))}</p>
    <p><strong>Estado:</strong> <span class="alarm-status status-ringing">SONANDO</span></p>
  `;
  renderGpsListInto('ringingGpsList', alarm.id);
  $('ringingPopup').classList.remove('hidden');
  startTone();
  try { await dbUpdateAlarm(alarm.id, { status: AlarmStatus.ringing }); } catch(err){ console.warn(err); }
}
async function confirmReceivedAlarm(){
  const alarmId = state.activeRingingAlarmId;
  if(!alarmId) return;
  stopTone();
  const alarm = state.alarms.find(a => a.id === alarmId);
  if(alarm){
    alarm.status = AlarmStatus.completed;
    alarm.completedAt = Date.now();
    alarm.receiverCompletedAt = Date.now();
    upsertAlarm(alarm); saveAlarms(); renderAll();
    try { await dbUpdateAlarm(alarm.id, { status: AlarmStatus.completed, completedAt: alarm.completedAt, receiverCompletedAt: alarm.receiverCompletedAt }); } catch(err){ console.warn(err); }
  }
  $('ringingPopup').classList.add('hidden');
  state.activeRingingAlarmId = '';
  stopGpsListener(alarmId);
}

async function cancelAlarm(alarmId){
  const alarm = state.alarms.find(a => a.id === alarmId);
  if(!alarm || alarm.from !== state.deviceId) return;
  if(!isActiveAlarm(alarm)) return;
  const accepted = await appConfirm({
    title: 'Anular alarma',
    message: 'La alarma dejará de estar activa y el otro móvil verá que ha sido anulada.',
    confirmText: 'ANULAR',
    cancelText: 'MANTENER',
    tone: 'danger'
  });
  if(!accepted) return;
  alarm.status = AlarmStatus.cancelled; alarm.cancelled = true; alarm.cancelledAt = Date.now();
  upsertAlarm(alarm); saveAlarms(); renderAll(); stopSenderGps(alarm.id);
  try { await dbUpdateAlarm(alarm.id, { status: AlarmStatus.cancelled, cancelled: true, cancelledAt: alarm.cancelledAt, gpsStoppedAt: Date.now() }); }
  catch(err){ toast('No se pudo anular online. Revisa conexión.'); console.warn(err); }
}

function handleAlarmAction(ev){
  const btn = ev.target.closest('[data-action]');
  if(!btn) return;
  const id = btn.dataset.id;
  if(btn.dataset.action === 'cancel') cancelAlarm(id);
  if(btn.dataset.action === 'showGps') {
    const alarm = state.alarms.find(a => a.id === id);
    if(alarm){ ensureGpsListener(id); showInitialReceiverPopup(alarm); }
  }
  if(btn.dataset.action === 'deleteLocal') deleteLocalAlarm(id);
}
function deleteLocalAlarm(id){
  const alarm = state.alarms.find(a => a.id === id);
  if(!alarm || isActiveAlarm(alarm)){ toast('Solo se pueden borrar registros finalizados o anulados.'); return; }
  state.alarms = state.alarms.filter(a => a.id !== id);
  delete state.gpsLogs[id];
  saveAlarms(); saveGpsLogs(); renderAll();
}
async function clearCompletedLocalHistory(){
  const accepted = await appConfirm({
    title: 'Limpiar historial local',
    message: 'Se borrarán de este móvil las alarmas completadas o anuladas y sus registros GPS locales. Las alarmas activas se conservarán.',
    confirmText: 'BORRAR',
    cancelText: 'CANCELAR',
    tone: 'danger'
  });
  if(!accepted) return;
  const keep = [];
  for(const a of state.alarms){ if(isActiveAlarm(a)) keep.push(a); else delete state.gpsLogs[a.id]; }
  state.alarms = keep; saveAlarms(); saveGpsLogs(); renderAll();
}

function showSenderAck(alarm){
  setText('senderAckText', `✅ El otro móvil confirmó que ha recibido la alarma: ${alarm.message || 'Alarma sin mensaje'}`);
  $('senderAckPopup').classList.remove('hidden');
}

function renderAll(){
  updateIdentityUI();
  const incomingPending = state.alarms.filter(a => a.direction === 'incoming' && isActiveAlarm(a)).length;
  const outgoingPending = state.alarms.filter(a => a.direction === 'outgoing' && isActiveAlarm(a)).length;
  setText('pendingIncomingCount', incomingPending);
  setText('pendingOutgoingCount', outgoingPending);
  renderRecent(); renderReceived(); renderSent(); renderHistory();
}
function renderRecent(){
  const list = state.alarms.slice().sort(sortNewest).slice(0, 4);
  renderAlarmList('recentList', list, true);
}
function renderReceived(){ renderAlarmList('receivedList', state.alarms.filter(a => a.direction === 'incoming').sort(sortNewest)); }
function renderSent(){ renderAlarmList('sentList', state.alarms.filter(a => a.direction === 'outgoing').sort(sortNewest)); }
function renderHistory(){
  let list = state.alarms.slice().sort(sortNewest);
  if(state.settings.historyFilter === 'pending') list = list.filter(isActiveAlarm);
  renderAlarmList('historyList', list);
}
function sortNewest(a,b){ return Number(b.createdAt || b.scheduledAt || 0) - Number(a.createdAt || a.scheduledAt || 0); }
function renderAlarmList(containerId, list, compact=false){
  const el = $(containerId); if(!el) return;
  if(!list.length){ el.innerHTML = '<div class="empty">No hay alarmas que mostrar.</div>'; return; }
  el.innerHTML = list.map(a => alarmCardHtml(a, compact)).join('');
}
function alarmCardHtml(a, compact){
  const gpsCount = (state.gpsLogs[a.id] || []).length;
  const ack = a.direction === 'outgoing' ? (a.receivedByReceiver ? '✅ Recibida por el otro móvil' : '⌛ Esperando confirmación de recepción del otro móvil...') : '📥 Recibida en este móvil';
  const actions = [];
  if(a.direction === 'outgoing' && isActiveAlarm(a)) actions.push(`<button class="danger" data-action="cancel" data-id="${escapeAttr(a.id)}" type="button">Anular alarma</button>`);
  if(a.direction === 'incoming') actions.push(`<button class="secondary" data-action="showGps" data-id="${escapeAttr(a.id)}" type="button">Ver GPS</button>`);
  if(!isActiveAlarm(a)) actions.push(`<button class="secondary" data-action="deleteLocal" data-id="${escapeAttr(a.id)}" type="button">Borrar local</button>`);
  const gpsLine = a.gpsEnabledBySender || gpsCount ? `<div><strong>GPS:</strong> ${gpsCount ? gpsCount + ' registros' : 'autorizado, esperando coordenadas'}</div>` : `<div><strong>GPS:</strong> no autorizado por el emisor</div>`;
  return `
    <article class="alarm-item ${escapeAttr(a.status || AlarmStatus.pending)}">
      <div class="alarm-title">${a.direction === 'outgoing' ? 'Enviada al otro móvil' : 'Recibida del otro móvil'}</div>
      <div class="alarm-meta">
        <div>${escapeHtml(formatDate(a.scheduledAt))}, ${escapeHtml(formatTime(a.scheduledAt))}</div>
        <div><strong>Mensaje:</strong> ${escapeHtml(a.message || 'Alarma sin mensaje')}</div>
        <div><strong>Estado:</strong> <span class="alarm-status ${statusClass(a.status)}">${escapeHtml(statusText(a.status))}</span></div>
        ${compact ? '' : `<div>${escapeHtml(ack)}</div>${gpsLine}`}
      </div>
      ${actions.length ? `<div class="alarm-actions">${actions.join('')}</div>` : ''}
    </article>`;
}
function statusText(status){
  const map = {
    pending: 'PENDIENTE',
    received_by_receiver: 'RECIBIDA POR RECEPTOR',
    ringing: 'SONANDO',
    completed: 'COMPLETADA',
    cancelled: 'ANULADA',
    error: 'ERROR'
  };
  return map[status] || 'PENDIENTE';
}
function statusClass(status){ return `status-${status || AlarmStatus.pending}`; }

function formatDate(ms){ const d = new Date(Number(ms)); return Number.isFinite(d.getTime()) ? d.toLocaleDateString('es-ES') : '-'; }
function formatTime(ms){ const d = new Date(Number(ms)); return Number.isFinite(d.getTime()) ? d.toLocaleTimeString('es-ES', {hour:'2-digit', minute:'2-digit'}) : '-'; }
function formatTimeWithSeconds(ms){ const d = new Date(Number(ms)); return Number.isFinite(d.getTime()) ? d.toLocaleTimeString('es-ES', {hour:'2-digit', minute:'2-digit', second:'2-digit'}) : '-'; }
function escapeHtml(value){ return String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch])); }
function escapeAttr(value){ return escapeHtml(value).replace(/`/g, '&#96;'); }
function appConfirm(options={}){
  return openAppDialog({ ...options, showCancel: true });
}
function showCopyIdDialog(deviceId){
  return openAppDialog({
    title: 'Copia el ID de este móvil',
    message: 'No se ha podido copiar automáticamente. Pulsa “COPIAR ID” o mantén pulsado el identificador para copiarlo manualmente.',
    confirmText: 'CERRAR',
    showCancel: false,
    tone: 'info',
    value: deviceId,
    valueLabel: 'ID de este móvil'
  });
}
function openAppDialog(options={}){
  const dialog = $('appDialog');
  if(!dialog) return Promise.resolve(false);
  if(state.appDialogResolver) closeAppDialog(false);

  state.appDialogLastFocus = document.activeElement;
  setText('appDialogTitle', options.title || 'Aviso');
  setText('appDialogMessage', options.message || '');

  const icon = $('appDialogIcon');
  const tone = options.tone || 'info';
  if(icon){
    icon.className = `dialog-icon ${tone === 'danger' ? 'danger' : tone === 'warning' ? 'warning' : ''}`.trim();
    icon.textContent = tone === 'danger' ? '!' : tone === 'warning' ? '!' : 'i';
  }

  const valueWrap = $('appDialogValueWrap');
  const hasValue = options.value !== undefined && options.value !== null && String(options.value) !== '';
  valueWrap?.classList.toggle('hidden', !hasValue);
  setText('appDialogValueLabel', options.valueLabel || 'Información');
  setText('appDialogValue', hasValue ? options.value : '');

  const cancelBtn = $('appDialogCancelBtn');
  const confirmBtn = $('appDialogConfirmBtn');
  const showCancel = options.showCancel !== false;
  if(cancelBtn){
    cancelBtn.classList.toggle('hidden', !showCancel);
    cancelBtn.textContent = options.cancelText || 'CANCELAR';
  }
  if(confirmBtn){
    confirmBtn.textContent = options.confirmText || 'ACEPTAR';
    confirmBtn.className = tone === 'danger' ? 'danger' : '';
    confirmBtn.classList.toggle('single-action', !showCancel);
  }

  dialog.classList.remove('hidden');
  setTimeout(() => (showCancel ? cancelBtn : confirmBtn)?.focus(), 0);
  return new Promise(resolve => { state.appDialogResolver = resolve; });
}
function closeAppDialog(result=false){
  const dialog = $('appDialog');
  if(dialog) dialog.classList.add('hidden');
  const resolve = state.appDialogResolver;
  state.appDialogResolver = null;
  if(resolve) resolve(Boolean(result));
  const previousFocus = state.appDialogLastFocus;
  state.appDialogLastFocus = null;
  if(previousFocus && typeof previousFocus.focus === 'function') setTimeout(() => previousFocus.focus(), 0);
}
async function copyDialogValue(){
  const valueEl = $('appDialogValue');
  const value = valueEl?.textContent || '';
  if(!value) return;
  try {
    await navigator.clipboard.writeText(value);
    toast('ID copiado.');
  } catch {
    selectElementText(valueEl);
    toast('El ID ha quedado seleccionado para copiarlo manualmente.');
  }
}
function selectElementText(element){
  if(!element || !window.getSelection || !document.createRange) return;
  const range = document.createRange();
  range.selectNodeContents(element);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  element.focus();
}

function toast(message){
  const old = document.querySelector('.toast'); if(old) old.remove();
  const el = document.createElement('div'); el.className = 'toast'; el.textContent = message; document.body.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

function startTone(){
  stopTone();
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    state.audioCtx = state.audioCtx || new AudioContext();
    const pattern = () => playBeepSequence();
    pattern(); state.ringTimer = setInterval(pattern, 1800);
  } catch(err){ console.warn('No audio:', err); }
}
function stopTone(){ if(state.ringTimer){ clearInterval(state.ringTimer); state.ringTimer = null; } }
function playBeepSequence(){
  const ctx = state.audioCtx; if(!ctx) return;
  const now = ctx.currentTime;
  const sound = state.settings.sound || 'classic';
  const freqs = sound === 'soft' ? [660, 660] : sound === 'fast' ? [880, 980, 880] : sound === 'double' ? [740, 740] : [720, 920];
  freqs.forEach((f, i) => beep(ctx, f, now + i * 0.22, 0.16));
}
function beep(ctx, freq, start, duration){
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = freq; osc.type = 'sine';
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.35, start + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain); gain.connect(ctx.destination);
  osc.start(start); osc.stop(start + duration + 0.03);
}

window.addEventListener('beforeunload', () => {
  Object.keys(state.senderGpsTimers).forEach(stopSenderGps);
});
