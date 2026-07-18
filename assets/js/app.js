'use strict';

const APP_VERSION = 'ALARMAS-LUCIA-v3.0-PUSH-RECEPTOR-CERRADO-20260718';
const DEFAULT_GPS_INTERVAL_MS = 60000;
const MIN_GPS_INTERVAL_MS = 1000;
const MAX_GPS_INTERVAL_MS = 3600000;
const REST_ALARM_POLL_MS = 2500;
const REST_GPS_POLL_MS = 7000;
const IMMOBILITY_URGENT_DELAY_MS = 120000;

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
  ackShown: 'sinc_alarmas_nueva_ack_shown_v1',
  immobilityShown: 'sinc_alarmas_nueva_immobility_shown_v1',
  knownDevices: 'sinc_alarmas_nueva_known_devices_v1'
};

const DEFAULT_SETTINGS = {
  theme: 'blue',
  mode: '3d',
  opacity: 92,
  sound: 'classic',
  historyFilter: 'all',
  gpsIntervalMs: DEFAULT_GPS_INTERVAL_MS,
  immobilityEnabled: false,
  immobilityMinutes: 10,
  immobilityRadiusM: 100,
  vibrationEnabled: true,
  generalNotificationSoundEnabled: true,
  newAlarmSoundEnabled: true,
  cancelledAlarmSoundEnabled: true,
  scheduledAlarmSoundEnabled: true
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
  settings: Object.assign({}, DEFAULT_SETTINGS, loadJson(LS.settings, {})),
  shownInitial: loadJson(LS.shownInitial, {}),
  ackShown: loadJson(LS.ackShown, {}),
  immobilityShown: loadJson(LS.immobilityShown, {}),
  knownDevices: normalizeKnownDevices(loadJson(LS.knownDevices, [])),
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
  webGpsResumePending: false,
  webGpsLastResumeAttemptAt: 0,
  screenWakeLock: null,
  screenWakeLockRequestPending: false,
  screenWakeLockLastError: '',
  energySaverActive: false,
  energySaverAlarmId: '',
  energySaverHoldTimer: null,
  energySaverPreviousThemeColor: '',
  energySaverPreviousScrollY: 0,
  nativeGpsTracking: {},
  nativeImmobilityMonitoring: {},
  webImmobilityState: {},
  activeRingingAlarmId: '',
  activeInitialPopupAlarmId: '',
  gpsHistoryExpanded: { initialGpsList: false, ringingGpsList: false },
  audioCtx: null,
  ringTimer: null,
  immobilityToneTimer: null,
  immobilityUrgentAlarmId: '',
  immobilityDialogKey: '',
  immobilityPresented: {},
  appDialogResolver: null,
  appDialogLastFocus: null,
  appDialogDismissible: true,
  appDialogInputEnabled: false
};

const $ = (id) => document.getElementById(id);

document.addEventListener('DOMContentLoaded', init);

function init(){
  setText('versionLine', APP_VERSION);
  migrateOldKnownData();
  applySettings();
  setupEvents();
  setupScreenWakeLockLifecycle();
  setupEnergySaverLifecycle();
  setDefaultDateTime();
  updateIdentityUI();
  updateGpsPermissionUI();
  detectNativeLocationPermission();
  initFirebase();
  syncNativeAlertSettings();
  setTimeout(syncNativeBackgroundService, 750);
  setTimeout(refreshPushStatus, 1100);
  setTimeout(() => { resumeSenderGpsForOwnActiveAlarms(); syncScreenWakeLock(); }, 900);
  renderAll();
  syncNativeAlarmSchedules();
  syncNativeImmobilityMonitors();
  setInterval(checkDueAlarms, 1000);
  setInterval(resumeSenderGpsForOwnActiveAlarms, 15000);
  setInterval(evaluateAllImmobilityStates, 5000);
  setInterval(syncNativeImmobilityAlertStates, 2000);
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
  on('appDialogConfirmBtn', 'click', confirmAppDialog);
  on('appDialogCopyBtn', 'click', copyDialogValue);
  on('appDialog', 'click', ev => { if(ev.target === $('appDialog') && state.appDialogDismissible) closeAppDialog(false); });
  document.addEventListener('keydown', ev => {
    if(ev.key === 'Escape' && !$('appDialog')?.classList.contains('hidden') && state.appDialogDismissible) closeAppDialog(false);
  });
  on('historyAllBtn', 'click', () => { state.settings.historyFilter = 'all'; saveSettings(); renderAll(); });
  on('historyPendingBtn', 'click', () => { state.settings.historyFilter = 'pending'; saveSettings(); renderAll(); });
  on('historyClearLocalBtn', 'click', clearCompletedLocalHistory);
  on('opacityInput', 'input', () => {
    state.settings.opacity = Number($('opacityInput').value || 92);
    saveSettings(); applySettings();
  });
  on('soundSelect', 'change', () => { state.settings.sound = $('soundSelect').value; saveSettings(); syncNativeImmobilityMonitors(); syncNativeBackgroundService(); });
  on('testSoundBtn', 'click', () => { startTone(); setTimeout(stopTone, 1800); });
  on('gpsIntervalSelect', 'change', handleGpsIntervalSettingChange);
  on('gpsCustomIntervalInput', 'change', handleGpsIntervalSettingChange);
  on('immobilityEnabledInput', 'change', handleImmobilitySettingChange);
  on('immobilityMinutesInput', 'change', handleImmobilitySettingChange);
  on('immobilityRadiusInput', 'change', handleImmobilitySettingChange);
  ['vibrationEnabledInput','generalNotificationSoundInput','newAlarmSoundInput','cancelledAlarmSoundInput','scheduledAlarmSoundInput']
    .forEach(id => on(id, 'change', handleAlertSettingsChange));
  on('refreshPushBtn', 'click', refreshPushRegistration);
  on('batterySettingsBtn', 'click', openBatteryOptimizationSettings);
  on('notificationSettingsBtn', 'click', openNativeNotificationSettings);

  document.querySelectorAll('[data-panel]').forEach(btn => btn.addEventListener('click', () => openPanel(btn.dataset.panel)));
  document.querySelectorAll('[data-close]').forEach(btn => btn.addEventListener('click', closePanels));
  document.querySelectorAll('#themeButtons button').forEach(btn => btn.addEventListener('click', () => {
    state.settings.theme = btn.dataset.theme; saveSettings(); applySettings();
  }));
  document.querySelectorAll('#modeButtons button').forEach(btn => btn.addEventListener('click', () => {
    state.settings.mode = btn.dataset.mode; saveSettings(); applySettings();
  }));
  document.addEventListener('click', handleAlarmAction);
  document.addEventListener('click', handleKnownDeviceAction);
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
  if(state.peerId) upsertKnownDevice(state.peerId, undefined, false);
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
function saveImmobilityShown(){ localStorage.setItem(LS.immobilityShown, JSON.stringify(state.immobilityShown)); }
function saveKnownDevices(){ localStorage.setItem(LS.knownDevices, JSON.stringify(state.knownDevices)); }

function normalizeKnownDevices(value){
  const input = Array.isArray(value) ? value : [];
  const result = [];
  const seenIds = new Set();
  const usedNumbers = new Set();
  let nextNumber = 1;
  for(const raw of input){
    const deviceId = normalizeDeviceId(raw?.deviceId || raw?.id || '');
    if(!/^MOVIL-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(deviceId) || seenIds.has(deviceId)) continue;
    let registrationNumber = Math.round(Number(raw?.registrationNumber || raw?.number || 0));
    if(registrationNumber < 1 || usedNumbers.has(registrationNumber)){
      while(usedNumbers.has(nextNumber)) nextNumber++;
      registrationNumber = nextNumber;
    }
    usedNumbers.add(registrationNumber);
    nextNumber = Math.max(nextNumber, registrationNumber + 1);
    seenIds.add(deviceId);
    result.push({
      registrationNumber,
      deviceId,
      alias: sanitizeDeviceAlias(raw?.alias || ''),
      pairKey: buildPairKey(getOrCreateDeviceId(), deviceId),
      firstPairedAt: Number(raw?.firstPairedAt || raw?.createdAt || Date.now()),
      lastPairedAt: Number(raw?.lastPairedAt || raw?.updatedAt || 0)
    });
  }
  return result.sort((a,b) => a.registrationNumber - b.registrationNumber);
}
function sanitizeDeviceAlias(value){ return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 40); }
function getKnownDevice(deviceId){
  const id = normalizeDeviceId(deviceId);
  return state.knownDevices.find(item => item.deviceId === id) || null;
}
function nextKnownDeviceNumber(){
  return state.knownDevices.reduce((max, item) => Math.max(max, Number(item.registrationNumber || 0)), 0) + 1;
}
function upsertKnownDevice(deviceId, alias, touch=true){
  const id = normalizeDeviceId(deviceId);
  if(!/^MOVIL-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(id) || id === state.deviceId) return null;
  const now = Date.now();
  let item = getKnownDevice(id);
  if(!item){
    item = {
      registrationNumber: nextKnownDeviceNumber(),
      deviceId: id,
      alias: sanitizeDeviceAlias(alias || ''),
      pairKey: buildPairKey(state.deviceId, id),
      firstPairedAt: now,
      lastPairedAt: touch ? now : 0
    };
    state.knownDevices.push(item);
  } else {
    item.pairKey = buildPairKey(state.deviceId, id);
    if(alias !== undefined) item.alias = sanitizeDeviceAlias(alias);
    if(touch) item.lastPairedAt = now;
  }
  state.knownDevices.sort((a,b) => a.registrationNumber - b.registrationNumber);
  saveKnownDevices();
  return item;
}

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
  const theme = state.settings.theme || 'blue';
  const mode = state.settings.mode || '3d';
  const themeClass = `theme-${theme}`;
  const modeClass = `mode-${mode}`;
  app.className = `app ${themeClass} ${modeClass}`;

  // Sincronizar también html y body evita que el fondo exterior, el rebote de
  // Safari y elementos creados dinámicamente (por ejemplo, los avisos toast)
  // conserven el color o el relieve de otro modo visual.
  const themeClasses = ['theme-blue','theme-green','theme-purple','theme-orange','theme-dark'];
  const modeClasses = ['mode-2d','mode-3d'];
  [document.documentElement, document.body].forEach(element => {
    element.classList.remove(...themeClasses, ...modeClasses);
    element.classList.add(themeClass, modeClass);
  });

  if(!state.energySaverActive){
    const browserColors = { blue:'#2563eb', green:'#16a34a', purple:'#7c3aed', orange:'#ea580c', dark:'#0f172a' };
    setBrowserThemeColor(browserColors[theme] || '#2563eb');
  }

  document.documentElement.style.setProperty('--window-opacity', String((Number(state.settings.opacity || 92)) / 100));
  setText('opacityValue', `${state.settings.opacity || 92}%`);
  const opacity = $('opacityInput'); if(opacity) opacity.value = state.settings.opacity || 92;
  const sound = $('soundSelect'); if(sound) sound.value = state.settings.sound || 'classic';
  const alertInputs = {
    vibrationEnabledInput: 'vibrationEnabled',
    generalNotificationSoundInput: 'generalNotificationSoundEnabled',
    newAlarmSoundInput: 'newAlarmSoundEnabled',
    cancelledAlarmSoundInput: 'cancelledAlarmSoundEnabled',
    scheduledAlarmSoundInput: 'scheduledAlarmSoundEnabled'
  };
  Object.entries(alertInputs).forEach(([id, key]) => {
    const input = $(id); if(input) input.checked = state.settings[key] !== false;
  });
  applyGpsSettingsUI();
  document.querySelectorAll('#themeButtons button').forEach(btn => btn.classList.toggle('active', btn.dataset.theme === state.settings.theme));
  document.querySelectorAll('#modeButtons button').forEach(btn => btn.classList.toggle('active', btn.dataset.mode === state.settings.mode));
}

function clampNumber(value, min, max, fallback){
  const n = Number(value);
  if(!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
function getGpsIntervalMs(){
  return Math.round(clampNumber(state.settings.gpsIntervalMs, MIN_GPS_INTERVAL_MS, MAX_GPS_INTERVAL_MS, DEFAULT_GPS_INTERVAL_MS));
}
function getImmobilityMinutes(){
  return Math.round(clampNumber(state.settings.immobilityMinutes, 1, 1440, 10));
}
function getImmobilityDurationMs(){ return getImmobilityMinutes() * 60000; }
function getImmobilityRadiusM(){
  return Math.round(clampNumber(state.settings.immobilityRadiusM, 5, 5000, 100));
}
function isImmobilityEnabled(){ return Boolean(state.settings.immobilityEnabled); }
function applyGpsSettingsUI(){
  const interval = getGpsIntervalMs();
  state.settings.gpsIntervalMs = interval;
  const select = $('gpsIntervalSelect');
  const custom = $('gpsCustomIntervalInput');
  const customWrap = $('gpsCustomIntervalWrap');
  const known = ['1000','5000','10000','30000','60000','120000','300000'];
  const value = String(interval);
  const isCustom = !known.includes(value);
  if(select) select.value = isCustom ? 'custom' : value;
  if(custom) custom.value = String(Math.max(1, Math.round(interval / 1000)));
  customWrap?.classList.toggle('hidden', !isCustom);

  const enabled = isImmobilityEnabled();
  const enabledInput = $('immobilityEnabledInput');
  if(enabledInput) enabledInput.checked = enabled;
  const minutesInput = $('immobilityMinutesInput');
  if(minutesInput) minutesInput.value = String(getImmobilityMinutes());
  const radiusInput = $('immobilityRadiusInput');
  if(radiusInput) radiusInput.value = String(getImmobilityRadiusM());
  const options = $('immobilityOptions');
  if(options){
    options.classList.toggle('settings-disabled', !enabled);
    options.querySelectorAll('input').forEach(input => { input.disabled = !enabled; });
  }
}
function handleAlertSettingsChange(){
  state.settings.vibrationEnabled = Boolean($('vibrationEnabledInput')?.checked);
  state.settings.generalNotificationSoundEnabled = Boolean($('generalNotificationSoundInput')?.checked);
  state.settings.newAlarmSoundEnabled = Boolean($('newAlarmSoundInput')?.checked);
  state.settings.cancelledAlarmSoundEnabled = Boolean($('cancelledAlarmSoundInput')?.checked);
  state.settings.scheduledAlarmSoundEnabled = Boolean($('scheduledAlarmSoundInput')?.checked);
  saveSettings();
  syncNativeAlertSettings();
}
function syncNativeAlertSettings(){
  if(!hasAndroidBridgeMethod('saveAlertSettings')) return;
  try {
    AndroidBridge.saveAlertSettings(
      state.settings.vibrationEnabled !== false,
      state.settings.generalNotificationSoundEnabled !== false,
      state.settings.newAlarmSoundEnabled !== false,
      state.settings.cancelledAlarmSoundEnabled !== false,
      state.settings.scheduledAlarmSoundEnabled !== false
    );
  } catch(err){ console.warn('No se pudieron guardar los avisos nativos:', err); }
}
function refreshPushRegistration(){
  if(hasAndroidBridgeMethod('refreshPushRegistration')){
    try { AndroidBridge.refreshPushRegistration(); } catch(err){ console.warn(err); }
  }
  setText('pushStatusText', 'Actualizando el registro push y la sincronización…');
  setTimeout(refreshPushStatus, 1800);
}
function openBatteryOptimizationSettings(){
  if(hasAndroidBridgeMethod('openBatteryOptimizationSettings')){
    try { AndroidBridge.openBatteryOptimizationSettings(); } catch(err){ console.warn(err); }
  }
}
function openNativeNotificationSettings(){
  if(hasAndroidBridgeMethod('openNotificationSettings')){
    try { AndroidBridge.openNotificationSettings(); } catch(err){ console.warn(err); }
  }
}
function refreshPushStatus(){
  const target = $('pushStatusText'); if(!target) return;
  if(!hasAndroidBridgeMethod('getPushStatus')){
    target.textContent = 'La recepción push nativa solo está disponible en la app Android.';
    return;
  }
  try {
    const status = JSON.parse(AndroidBridge.getPushStatus() || '{}');
    const batteryOk = hasAndroidBridgeMethod('isBatteryOptimizationIgnored')
      ? Boolean(AndroidBridge.isBatteryOptimizationIgnored()) : false;
    let text = '';
    if(!status.firebaseConfigured){
      text = 'PUSH PENDIENTE: falta configurar el App ID de la aplicación Android de Firebase.';
    } else if(status.tokenAvailable && Number(status.registeredAt || 0) > 0){
      text = 'PUSH ACTIVO: este móvil está registrado para recibir alarmas con la app cerrada.';
    } else if(status.tokenAvailable){
      text = 'Token push obtenido; esperando registrar este móvil en Firebase.';
    } else {
      text = 'Firebase está configurado, pero todavía no se ha obtenido el token push.';
    }
    if(!status.backgroundSyncConfigured) text += ' Empareja un móvil para completar el registro.';
    if(!batteryOk) text += ' Conviene permitir funcionamiento sin restricciones para evitar bloqueos de DuraSpeed o del ahorro de batería.';
    if(status.lastError) text += ` Detalle: ${status.lastError}`;
    target.textContent = text;
  } catch(err){
    target.textContent = 'No se pudo leer el estado de la recepción push.';
  }
}

function handleGpsIntervalSettingChange(event){
  const select = $('gpsIntervalSelect');
  if(event?.currentTarget === select && select?.value === 'custom'){
    $('gpsCustomIntervalWrap')?.classList.remove('hidden');
    setTimeout(() => $('gpsCustomIntervalInput')?.focus(), 0);
    return;
  }
  let interval = Number(select?.value || DEFAULT_GPS_INTERVAL_MS);
  if(select?.value === 'custom') interval = Number($('gpsCustomIntervalInput')?.value || 60) * 1000;
  state.settings.gpsIntervalMs = Math.round(clampNumber(interval, MIN_GPS_INTERVAL_MS, MAX_GPS_INTERVAL_MS, DEFAULT_GPS_INTERVAL_MS));
  saveSettings();
  applyGpsSettingsUI();
  applyTrackingSettingsToActiveAlarms();
  syncNativeBackgroundService();
}
function handleImmobilitySettingChange(){
  state.settings.immobilityEnabled = Boolean($('immobilityEnabledInput')?.checked);
  state.settings.immobilityMinutes = Math.round(clampNumber($('immobilityMinutesInput')?.value, 1, 1440, 10));
  state.settings.immobilityRadiusM = Math.round(clampNumber($('immobilityRadiusInput')?.value, 5, 5000, 100));
  saveSettings();
  applyGpsSettingsUI();
  state.webImmobilityState = {};
  syncNativeImmobilityMonitors();
  syncNativeBackgroundService();
  evaluateAllImmobilityStates();
}

function openMenu(){ $('sideMenu')?.classList.add('open'); $('scrim')?.classList.add('show'); }
function closeMenu(){ $('sideMenu')?.classList.remove('open'); $('scrim')?.classList.remove('show'); }
function openPanel(id){ closeMenu(); closePanels(); const el = $(id); if(el) el.classList.remove('hidden'); $('scrim')?.classList.add('show'); if(id === 'sendPanel') setDefaultDateTime(); if(id === 'settingsPanel') setTimeout(refreshPushStatus, 100); }
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
  const knownPeer = getKnownDevice(state.peerId);
  const peerLabel = state.peerId
    ? (knownPeer?.alias ? `${knownPeer.alias} · ${state.peerId}` : state.peerId)
    : 'No emparejado';
  setText('peerDeviceIdText', peerLabel);
  setText('pairKeyText', state.pairKey || 'Sin canal');
  const peerInput = $('peerIdInput');
  const aliasInput = $('peerAliasInput');
  const pairPanelIsOpen = !$('pairPanel')?.classList.contains('hidden');
  if(!pairPanelIsOpen){
    if(peerInput) peerInput.value = state.peerId || '';
    if(aliasInput) aliasInput.value = knownPeer?.alias || '';
  }
  const onlineText = state.firebaseReady
    ? (state.firebaseMode === 'sdk' ? 'Sincronización online activa (Firebase SDK)' : 'Sincronización online activa (REST)')
    : 'Modo local · sin Firebase activo';
  setText('statusLine', `${onlineText}${state.pairKey ? ' · canal ' + state.pairKey : ''}`);
  renderKnownDevices();
}

function savePairing(){
  const peer = normalizeDeviceId($('peerIdInput')?.value || '');
  const alias = sanitizeDeviceAlias($('peerAliasInput')?.value || '');
  if(!/^MOVIL-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(peer)){
    setPanelInfo('pairInfo', 'Introduce un ID con formato MOVIL-XXXX-XXXX.', true); return;
  }
  if(peer === state.deviceId){ setPanelInfo('pairInfo', 'No puedes emparejar este móvil consigo mismo.', true); return; }
  stopAllRemoteListeners();
  state.peerId = peer;
  state.pairKey = buildPairKey(state.deviceId, peer);
  persistPairing();
  const saved = upsertKnownDevice(peer, alias, true);
  const name = saved?.alias ? `“${saved.alias}”` : peer;
  setPanelInfo('pairInfo', `Dispositivo ${name} guardado y vinculado. Registro n.º ${saved?.registrationNumber || '-'}.`);
  updateIdentityUI();
  restartFirebaseSubscription();
  syncNativeBackgroundService();
  renderAll();
}
function persistPairing(){ localStorage.setItem(LS.peerId, state.peerId); localStorage.setItem(LS.pairKey, state.pairKey); }

function activateKnownDevice(deviceId){
  const item = getKnownDevice(deviceId);
  if(!item) return;
  stopAllRemoteListeners();
  state.peerId = item.deviceId;
  state.pairKey = buildPairKey(state.deviceId, item.deviceId);
  item.pairKey = state.pairKey;
  item.lastPairedAt = Date.now();
  saveKnownDevices();
  persistPairing();
  const peerInput = $('peerIdInput'); if(peerInput) peerInput.value = item.deviceId;
  const aliasInput = $('peerAliasInput'); if(aliasInput) aliasInput.value = item.alias || '';
  updateIdentityUI();
  restartFirebaseSubscription();
  syncNativeBackgroundService();
  renderAll();
  setPanelInfo('pairInfo', `Vinculado con ${item.alias || item.deviceId} (registro n.º ${item.registrationNumber}).`);
}
function editKnownDevice(deviceId){
  const item = getKnownDevice(deviceId);
  if(!item) return;
  const peerInput = $('peerIdInput'); if(peerInput) peerInput.value = item.deviceId;
  const aliasInput = $('peerAliasInput');
  if(aliasInput){ aliasInput.value = item.alias || ''; aliasInput.focus(); }
  setPanelInfo('pairInfo', `Editando el registro n.º ${item.registrationNumber}. Cambia el alias y pulsa GUARDAR Y VINCULAR.`);
}
async function deleteKnownDevice(deviceId){
  const item = getKnownDevice(deviceId);
  if(!item) return;
  const accepted = await appConfirm({
    title: 'Eliminar dispositivo guardado',
    message: `Se eliminará el registro n.º ${item.registrationNumber}${item.alias ? ` (${item.alias})` : ''}. Las alarmas históricas no se borrarán.`,
    confirmText: 'ELIMINAR',
    cancelText: 'CANCELAR',
    tone: 'danger'
  });
  if(!accepted) return;
  const wasActive = state.peerId === item.deviceId;
  state.knownDevices = state.knownDevices.filter(entry => entry.deviceId !== item.deviceId);
  saveKnownDevices();
  if(wasActive){
    state.alarms.forEach(alarm => {
      if(alarm.direction === 'incoming') { cancelNativeDueAlarm(alarm.id); nativeStopImmobilityMonitor(alarm.id); }
      if(alarm.direction === 'outgoing') stopSenderGps(alarm.id);
    });
    nativeStopBackgroundService();
    state.peerId = ''; state.pairKey = '';
    localStorage.removeItem(LS.peerId); localStorage.removeItem(LS.pairKey);
    stopAllRemoteListeners();
  }
  const peerInput = $('peerIdInput'); if(peerInput && peerInput.value === item.deviceId) peerInput.value = '';
  const aliasInput = $('peerAliasInput'); if(aliasInput) aliasInput.value = '';
  updateIdentityUI(); renderAll();
  setPanelInfo('pairInfo', 'Dispositivo eliminado de la lista de guardados.');
}
function renderKnownDevices(){
  const box = $('knownDevicesList');
  if(!box) return;
  if(!state.knownDevices.length){
    box.innerHTML = '<div class="empty known-devices-empty">Todavía no hay dispositivos guardados.</div>';
    return;
  }
  box.innerHTML = state.knownDevices.map(item => {
    const active = item.deviceId === state.peerId;
    const title = item.alias || 'Sin alias';
    const lastUsed = item.lastPairedAt ? `Última vinculación: ${formatDate(item.lastPairedAt)} ${formatTime(item.lastPairedAt)}` : 'Todavía no vinculado en esta versión';
    return `<article class="known-device-item${active ? ' active' : ''}">
      <div class="known-device-number">N.º ${escapeHtml(item.registrationNumber)}</div>
      <div class="known-device-main">
        <strong>${escapeHtml(title)}</strong>
        <code>${escapeHtml(item.deviceId)}</code>
        <small>${escapeHtml(lastUsed)}</small>
      </div>
      <div class="known-device-actions">
        <button type="button" class="${active ? 'secondary' : 'primary'}" data-device-action="select" data-device-id="${escapeAttr(item.deviceId)}" ${active ? 'disabled' : ''}>${active ? 'VINCULADO' : 'VINCULAR'}</button>
        <button type="button" class="secondary" data-device-action="edit" data-device-id="${escapeAttr(item.deviceId)}">EDITAR ALIAS</button>
        <button type="button" class="danger outline" data-device-action="delete" data-device-id="${escapeAttr(item.deviceId)}">ELIMINAR</button>
      </div>
    </article>`;
  }).join('');
}
function handleKnownDeviceAction(ev){
  const btn = ev.target.closest('[data-device-action]');
  if(!btn) return;
  const deviceId = btn.dataset.deviceId;
  if(btn.dataset.deviceAction === 'select') activateKnownDevice(deviceId);
  if(btn.dataset.deviceAction === 'edit') editKnownDevice(deviceId);
  if(btn.dataset.deviceAction === 'delete') deleteKnownDevice(deviceId);
}
async function clearPairing(){
  const accepted = await appConfirm({
    title: 'Borrar emparejamiento',
    message: 'Este móvil dejará de estar vinculado con el otro dispositivo. Las alarmas guardadas localmente no se borrarán.',
    confirmText: 'BORRAR',
    cancelText: 'CANCELAR',
    tone: 'danger'
  });
  if(!accepted) return;
  state.alarms.forEach(alarm => {
    if(alarm.direction === 'incoming') {
      cancelNativeDueAlarm(alarm.id);
      nativeStopImmobilityMonitor(alarm.id);
    }
    if(alarm.direction === 'outgoing') stopSenderGps(alarm.id);
  });
  nativeStopBackgroundService();
  state.peerId = ''; state.pairKey = '';
  localStorage.removeItem(LS.peerId); localStorage.removeItem(LS.pairKey);
  stopAllRemoteListeners(); updateIdentityUI(); renderAll();
  setPanelInfo('pairInfo', 'Dispositivo desvinculado. Sigue disponible en la lista de dispositivos guardados.');
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
      scheduleNativeDueAlarm(normalized);
      ensureGpsListener(normalized.id);
      nativeStartImmobilityMonitor(normalized);
      maybeShowInitialReceiverPopup(normalized);
    }
  }
  if(changed){ saveAlarms(); renderAll(); }
  resumeSenderGpsForOwnActiveAlarms();
  syncScreenWakeLock();
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
  maybeShowRemoteImmobilityAlert(alarm);
  if(alarm.status === AlarmStatus.cancelled || alarm.cancelled){
    cancelNativeDueAlarm(alarm.id);
    stopNativeRingingAlarm(alarm.id);
    if(state.activeRingingAlarmId === alarm.id){
      stopTone();
      state.activeRingingAlarmId = '';
      $('ringingPopup')?.classList.add('hidden');
      toast('Alarma anulada por el emisor.');
    }
    stopGpsListener(alarm.id);
    nativeStopImmobilityMonitor(alarm.id);
  }
  if(alarm.status === AlarmStatus.completed){
    cancelNativeDueAlarm(alarm.id);
    stopNativeRingingAlarm(alarm.id);
    stopGpsListener(alarm.id);
    nativeStopImmobilityMonitor(alarm.id);
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



function hasOwnActiveGpsAlarm(){
  return state.alarms.some(alarm =>
    alarm &&
    alarm.from === state.deviceId &&
    alarm.gpsEnabledBySender === true &&
    isActiveAlarm(alarm)
  );
}

function shouldKeepScreenAwake(){
  return !isNativeAndroidLocationAvailable() && hasOwnActiveGpsAlarm();
}

async function requestScreenWakeLock(force = false){
  if(isNativeAndroidLocationAvailable()) return false;
  if(!force && !shouldKeepScreenAwake()) return false;
  if(document.visibilityState !== 'visible') return false;
  if(!navigator.wakeLock || typeof navigator.wakeLock.request !== 'function'){
    state.screenWakeLockLastError = 'unsupported';
    return false;
  }
  if(state.screenWakeLock && state.screenWakeLock.released === false) return true;
  if(state.screenWakeLockRequestPending) return false;

  state.screenWakeLockRequestPending = true;
  try {
    const sentinel = await navigator.wakeLock.request('screen');
    state.screenWakeLock = sentinel;
    state.screenWakeLockLastError = '';
    sentinel.addEventListener('release', () => {
      if(state.screenWakeLock === sentinel) state.screenWakeLock = null;
    });
    return true;
  } catch(err){
    state.screenWakeLockLastError = String(err?.name || err?.message || 'wake-lock-error');
    console.warn('No se pudo mantener la pantalla encendida:', err);
    return false;
  } finally {
    state.screenWakeLockRequestPending = false;
  }
}

async function releaseScreenWakeLock(){
  const sentinel = state.screenWakeLock;
  state.screenWakeLock = null;
  if(!sentinel || sentinel.released) return;
  try { await sentinel.release(); }
  catch(err){ console.warn('No se pudo liberar el bloqueo de pantalla:', err); }
}

async function syncScreenWakeLock(){
  if(shouldKeepScreenAwake()) return requestScreenWakeLock(false);
  await releaseScreenWakeLock();
  return false;
}

function uploadGpsForOwnActiveAlarms(){
  state.alarms
    .filter(alarm => alarm.from === state.deviceId && alarm.gpsEnabledBySender && isActiveAlarm(alarm))
    .forEach(alarm => uploadGpsOnce(alarm.id));
}

function setupScreenWakeLockLifecycle(){
  const resumeWebTracking = () => {
    if(document.visibilityState !== 'visible') return;
    resumeSenderGpsForOwnActiveAlarms();
    uploadGpsForOwnActiveAlarms();
    syncScreenWakeLock();
  };

  document.addEventListener('visibilitychange', () => {
    if(document.visibilityState === 'visible') resumeWebTracking();
  });
  window.addEventListener('pageshow', resumeWebTracking);
  window.addEventListener('focus', resumeWebTracking);
  window.addEventListener('online', resumeWebTracking);

  // En iPhone, una pulsación del usuario permite reintentar la solicitud si
  // Safari la rechazó al restaurar la página o al volver desde otra aplicación.
  document.addEventListener('pointerdown', () => {
    if(shouldKeepScreenAwake()) requestScreenWakeLock(false);
  }, { passive: true });
  document.addEventListener('touchstart', () => {
    if(shouldKeepScreenAwake()) requestScreenWakeLock(false);
  }, { passive: true });
}

function setupEnergySaverLifecycle(){
  const overlay = $('energySaverOverlay');
  if(!overlay) return;

  // Debe ser hijo directo de body. Si queda dentro de #app, la perspectiva del
  // modo 3D puede convertir el contenedor en referencia de position:fixed y
  // dejar visibles tarjetas o ventanas fuera de la capa negra.
  if(overlay.parentElement !== document.body) document.body.appendChild(overlay);

  const cancelHold = () => {
    if(state.energySaverHoldTimer){
      clearTimeout(state.energySaverHoldTimer);
      state.energySaverHoldTimer = null;
    }
    overlay.classList.remove('holding');
  };

  const startHold = ev => {
    if(!state.energySaverActive) return;
    ev.preventDefault();
    cancelHold();
    overlay.classList.add('holding');
    if(ev.pointerId != null && typeof overlay.setPointerCapture === 'function'){
      try { overlay.setPointerCapture(ev.pointerId); } catch {}
    }
    state.energySaverHoldTimer = setTimeout(() => {
      state.energySaverHoldTimer = null;
      exitEnergySaverMode();
    }, 1000);
  };

  const endHold = ev => {
    if(ev) ev.preventDefault();
    cancelHold();
  };

  if(window.PointerEvent){
    overlay.addEventListener('pointerdown', startHold);
    overlay.addEventListener('pointerup', endHold);
    overlay.addEventListener('pointercancel', endHold);
  } else {
    overlay.addEventListener('touchstart', startHold, { passive:false });
    overlay.addEventListener('touchend', endHold, { passive:false });
    overlay.addEventListener('touchcancel', endHold, { passive:false });
  }

  overlay.addEventListener('contextmenu', ev => ev.preventDefault());
  overlay.addEventListener('keydown', ev => {
    if(ev.key === 'Enter' || ev.key === ' ' || ev.key === 'Escape'){
      ev.preventDefault();
      exitEnergySaverMode();
    }
  });
}

function hasOwnActiveAlarm(){
  return state.alarms.some(alarm =>
    alarm && alarm.direction === 'outgoing' && (!alarm.from || alarm.from === state.deviceId) && isActiveAlarm(alarm)
  );
}

function setBrowserThemeColor(color){
  const meta = document.querySelector('meta[name="theme-color"]');
  if(meta) meta.setAttribute('content', color);
}

function enterEnergySaverMode(alarmId){
  const alarm = state.alarms.find(item => item.id === alarmId);
  if(!alarm || alarm.direction !== 'outgoing' || (alarm.from && alarm.from !== state.deviceId) || !isActiveAlarm(alarm)){
    toast('El ahorro de energía solo puede activarse con una alarma enviada activa.');
    return;
  }

  const overlay = $('energySaverOverlay');
  if(!overlay) return;

  const themeMeta = document.querySelector('meta[name="theme-color"]');
  state.energySaverPreviousThemeColor = themeMeta?.getAttribute('content') || '#2563eb';
  state.energySaverActive = true;
  state.energySaverAlarmId = alarmId;

  // La petición se inicia desde la pulsación del usuario para que Safari en iPhone
  // permita mantener la pantalla activa mientras la página permanece visible.
  requestScreenWakeLock(true);
  resumeSenderGpsForOwnActiveAlarms();
  uploadGpsForOwnActiveAlarms();

  state.energySaverPreviousScrollY = window.scrollY || window.pageYOffset || 0;
  document.documentElement.classList.add('energy-saver-active');
  document.body.classList.add('energy-saver-active');
  const app = $('app');
  if(app){
    app.setAttribute('aria-hidden', 'true');
    try { app.inert = true; } catch {}
  }
  setBrowserThemeColor('#000000');
  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-hidden', 'false');
  try { overlay.focus({ preventScroll:true }); } catch { overlay.focus(); }
}

function exitEnergySaverMode(){
  const overlay = $('energySaverOverlay');
  if(state.energySaverHoldTimer){
    clearTimeout(state.energySaverHoldTimer);
    state.energySaverHoldTimer = null;
  }

  state.energySaverActive = false;
  state.energySaverAlarmId = '';
  document.documentElement.classList.remove('energy-saver-active');
  document.body.classList.remove('energy-saver-active');
  const app = $('app');
  if(app){
    app.removeAttribute('aria-hidden');
    try { app.inert = false; } catch {}
  }
  overlay?.classList.add('hidden');
  overlay?.classList.remove('holding');
  overlay?.setAttribute('aria-hidden', 'true');
  setBrowserThemeColor(state.energySaverPreviousThemeColor || '#2563eb');
  state.energySaverPreviousThemeColor = '';
  const restoreY = Number(state.energySaverPreviousScrollY || 0);
  state.energySaverPreviousScrollY = 0;
  requestAnimationFrame(() => window.scrollTo(0, restoreY));

  if(shouldKeepScreenAwake()) requestScreenWakeLock(false);
  else releaseScreenWakeLock();
}

function syncEnergySaverMode(){
  if(state.energySaverActive && !hasOwnActiveAlarm()) exitEnergySaverMode();
}

function hasAndroidBridgeMethod(name){
  try {
    return Boolean(window.AndroidBridge && typeof window.AndroidBridge[name] === 'function');
  } catch {
    return false;
  }
}
function isNativeAndroidLocationAvailable(){
  try {
    return hasAndroidBridgeMethod('isNativeLocationAvailable') && Boolean(AndroidBridge.isNativeLocationAvailable());
  } catch {
    return false;
  }
}
function nativeHasLocationPermission(){
  try {
    return hasAndroidBridgeMethod('hasLocationPermission') && Boolean(AndroidBridge.hasLocationPermission());
  } catch {
    return false;
  }
}
function nativeHasBackgroundLocationPermission(){
  try {
    return hasAndroidBridgeMethod('hasBackgroundLocationPermission')
      && Boolean(AndroidBridge.hasBackgroundLocationPermission());
  } catch {
    return false;
  }
}
function syncNativeBackgroundService(){
  if(!state.peerId || !state.pairKey || !hasAndroidBridgeMethod('configureBackgroundSync')) return false;
  const cfg = window.SINC_FIREBASE_CONFIG || DEFAULT_FIREBASE_CONFIG;
  if(!cfg?.databaseURL) return false;
  try {
    return Boolean(AndroidBridge.configureBackgroundSync(
      String(state.deviceId || ''),
      String(state.peerId || ''),
      String(state.pairKey || ''),
      String(cfg.databaseURL || ''),
      Boolean(isImmobilityEnabled()),
      Number(getImmobilityDurationMs()),
      Number(getImmobilityRadiusM()),
      Number(getGpsIntervalMs()),
      String(state.settings.sound || 'classic')
    ));
  } catch(err){
    console.warn('No se pudo activar la sincronización nativa:', err);
    return false;
  }
}
function nativeStopBackgroundService(){
  if(!hasAndroidBridgeMethod('stopBackgroundSync')) return;
  try { AndroidBridge.stopBackgroundSync(); } catch(err){ console.warn(err); }
}
function detectNativeLocationPermission(){
  if(!isNativeAndroidLocationAvailable()) return;
  if(nativeHasLocationPermission()){
    setGpsPermission('granted', 'GPS autorizado en Android. La ubicación podrá continuar con la app minimizada o la pantalla apagada.');
  }
}
window.onNativeLocationPermissionResult = function(granted){
  if(granted){
    if(nativeHasBackgroundLocationPermission()){
      setGpsPermission('granted', 'GPS autorizado en Android, incluido el uso con la app cerrada o la pantalla apagada.');
    } else {
      setGpsPermission('requesting', 'Autoriza ahora “Permitir siempre” para que el GPS pueda recuperarse en segundo plano.');
      try {
        if(hasAndroidBridgeMethod('requestBackgroundLocationPermission')) AndroidBridge.requestBackgroundLocationPermission();
      } catch(err){
        setGpsPermission('granted', 'GPS autorizado mientras el servicio esté activo. Falta “Permitir siempre” para recuperarlo tras cierres o reinicios.');
      }
    }
  } else {
    setGpsPermission('denied', 'Permiso GPS denegado. Sin este permiso no se puede compartir la ubicación.');
  }
};
window.onNativeBackgroundLocationPermissionResult = function(granted){
  if(granted){
    setGpsPermission('granted', 'GPS autorizado en Android, incluido el uso con la app cerrada o la pantalla apagada.');
  } else if(nativeHasLocationPermission()){
    setGpsPermission('granted', 'GPS autorizado mientras el servicio esté activo. Para recuperarlo tras cierres o reinicios, selecciona “Permitir siempre”.');
  }
};

function nativeStartSenderGps(alarm){
  if(!alarm || !isNativeAndroidLocationAvailable() || !nativeHasLocationPermission()) return false;
  if(!hasAndroidBridgeMethod('startLocationTracking')) return false;
  const cfg = window.SINC_FIREBASE_CONFIG || DEFAULT_FIREBASE_CONFIG;
  const configKey = `${getGpsIntervalMs()}|${state.pairKey || alarm.pairKey || ''}`;
  try {
    if(state.nativeGpsTracking[alarm.id] === configKey){
      if(!hasAndroidBridgeMethod('isLocationTracking') || Boolean(AndroidBridge.isLocationTracking(String(alarm.id)))) return true;
    }
    const started = Boolean(AndroidBridge.startLocationTracking(
      String(alarm.id || ''),
      String(state.pairKey || alarm.pairKey || ''),
      String(state.deviceId || alarm.from || ''),
      String(state.peerId || alarm.to || ''),
      String(cfg.databaseURL || ''),
      Number(getGpsIntervalMs())
    ));
    if(started) state.nativeGpsTracking[alarm.id] = configKey;
    return started;
  } catch(err){
    console.warn('No se pudo iniciar el GPS nativo:', err);
    return false;
  }
}
function nativeStopSenderGps(alarmId){
  if(!alarmId || !hasAndroidBridgeMethod('stopLocationTracking')) return;
  try { AndroidBridge.stopLocationTracking(String(alarmId)); } catch(err){ console.warn(err); }
  delete state.nativeGpsTracking[alarmId];
}
function nativeStartImmobilityMonitor(alarm){
  if(!alarm || alarm.direction !== 'incoming' || !isActiveAlarm(alarm) || !isImmobilityEnabled()) return false;
  if(!hasAndroidBridgeMethod('startImmobilityMonitoring')) return false;
  const cfg = window.SINC_FIREBASE_CONFIG || DEFAULT_FIREBASE_CONFIG;
  const senderInterval = Math.round(clampNumber(alarm.gpsIntervalMs, MIN_GPS_INTERVAL_MS, MAX_GPS_INTERVAL_MS, DEFAULT_GPS_INTERVAL_MS));
  const pollIntervalMs = Math.min(60000, Math.max(5000, senderInterval));
  const configKey = `${getImmobilityDurationMs()}|${getImmobilityRadiusM()}|${pollIntervalMs}|${state.settings.sound || 'classic'}|${state.pairKey || alarm.pairKey || ''}`;
  try {
    if(state.nativeImmobilityMonitoring[alarm.id] === configKey){
      if(!hasAndroidBridgeMethod('isImmobilityMonitoring') || Boolean(AndroidBridge.isImmobilityMonitoring(String(alarm.id)))) return true;
    }
    const started = Boolean(AndroidBridge.startImmobilityMonitoring(
      String(alarm.id || ''),
      String(state.pairKey || alarm.pairKey || ''),
      String(cfg.databaseURL || ''),
      Number(getImmobilityDurationMs()),
      Number(getImmobilityRadiusM()),
      Number(pollIntervalMs),
      String(state.settings.sound || 'classic')
    ));
    if(started) state.nativeImmobilityMonitoring[alarm.id] = configKey;
    return started;
  } catch(err){
    console.warn('No se pudo iniciar la vigilancia de inmovilidad:', err);
    return false;
  }
}
function nativeStopImmobilityMonitor(alarmId){
  if(!alarmId || !hasAndroidBridgeMethod('stopImmobilityMonitoring')) return;
  try { AndroidBridge.stopImmobilityMonitoring(String(alarmId)); } catch(err){ console.warn(err); }
  delete state.nativeImmobilityMonitoring[alarmId];
}
function syncNativeImmobilityMonitors(){
  state.alarms.forEach(alarm => {
    if(alarm.direction !== 'incoming') return;
    if(isActiveAlarm(alarm) && isImmobilityEnabled()) nativeStartImmobilityMonitor(alarm);
    else nativeStopImmobilityMonitor(alarm.id);
  });
}
function hasNativeImmobilityAlertCoordinator(){
  return hasAndroidBridgeMethod('getImmobilityAlertState');
}
function nativeAcknowledgeImmobilityAlert(alarmId){
  if(!alarmId || !hasAndroidBridgeMethod('acknowledgeImmobilityAlert')) return;
  try { AndroidBridge.acknowledgeImmobilityAlert(String(alarmId)); } catch(err){ console.warn(err); }
}
function syncNativeImmobilityAlertStates(){
  if(!isImmobilityEnabled() || !hasNativeImmobilityAlertCoordinator()) return;
  state.alarms
    .filter(alarm => alarm.direction === 'incoming' && isActiveAlarm(alarm))
    .forEach(syncNativeImmobilityAlertStateForAlarm);
}
function syncNativeImmobilityAlertStateForAlarm(alarm){
  if(!alarm || !hasNativeImmobilityAlertCoordinator()) return false;
  try {
    const raw = AndroidBridge.getImmobilityAlertState(String(alarm.id));
    const info = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw;
    if(!info || !info.exists) return false;
    handleNativeImmobilityAlertState(alarm, info);
    return true;
  } catch(err){
    console.warn('No se pudo leer el estado nativo de inmovilidad:', err);
    return false;
  }
}
function handleNativeImmobilityAlertState(alarm, info){
  if(!info.active || info.stage === 'none'){
    resetImmobilityEpisode(alarm.id);
    return;
  }

  const tracker = state.webImmobilityState[alarm.id] || {};
  tracker.active = true;
  tracker.firstAlertAt = Number(info.firstAlertAt || tracker.firstAlertAt || Date.now());
  tracker.urgentShown = info.stage === 'urgent';
  tracker.urgentAcknowledged = Boolean(info.urgentAcknowledged);
  state.webImmobilityState[alarm.id] = tracker;

  if(info.stage === 'urgent'){
    if(info.urgentAcknowledged){
      if(state.immobilityUrgentAlarmId === alarm.id) stopImmobilityTone();
      if(state.immobilityDialogKey.startsWith(`${alarm.id}|urgent|`)){
        state.immobilityDialogKey = '';
        closeAppDialog(true, true);
      }
      return;
    }
    showImmobilityWarning(
      alarm,
      Number(info.durationMs || getImmobilityDurationMs()),
      Number(info.radiusM || getImmobilityRadiusM()),
      Number(info.maxDistanceM || 0),
      { timestamp: Number(info.latestTimestamp || Date.now()) },
      {
        stage: 'urgent',
        alertAt: Number(info.urgentAlertAt || Date.now()),
        nativeSoundActive: Boolean(info.nativeSoundActive)
      }
    );
    return;
  }

  showImmobilityWarning(
    alarm,
    Number(info.durationMs || getImmobilityDurationMs()),
    Number(info.radiusM || getImmobilityRadiusM()),
    Number(info.maxDistanceM || 0),
    { timestamp: Number(info.latestTimestamp || Date.now()) },
    {
      stage: 'initial',
      alertAt: Number(info.firstAlertAt || Date.now()),
      nativeSoundPlayed: Boolean(info.initialSoundPlayedNatively)
    }
  );
}
function applyTrackingSettingsToActiveAlarms(){
  const patch = {
    gpsIntervalMs: getGpsIntervalMs(),
    immobilityMonitoringAvailable: true
  };
  let localChanged = false;
  state.alarms.forEach(alarm => {
    if(alarm.direction === 'outgoing' && isActiveAlarm(alarm)){
      Object.assign(alarm, patch);
      localChanged = true;
      if(state.senderGpsTimers[alarm.id]){
        clearInterval(state.senderGpsTimers[alarm.id]);
        delete state.senderGpsTimers[alarm.id];
      }
      if(alarm.gpsEnabledBySender) startSenderGps(alarm);
      if(state.firebaseReady) dbUpdateAlarm(alarm.id, patch).catch(err => console.warn('No se pudo actualizar el intervalo GPS online:', err));
    }
  });
  if(localChanged) saveAlarms();
  syncNativeImmobilityMonitors();
}
function scheduleNativeDueAlarm(alarm){
  if(!alarm || alarm.direction !== 'incoming' || !isActiveAlarm(alarm)) return;
  if(!hasAndroidBridgeMethod('scheduleNativeAlarm')) return;
  const cfg = window.SINC_FIREBASE_CONFIG || DEFAULT_FIREBASE_CONFIG;
  try {
    AndroidBridge.scheduleNativeAlarm(
      String(alarm.id || ''),
      Number(alarm.scheduledAt || 0),
      String(alarm.message || 'Alarma'),
      String(state.pairKey || alarm.pairKey || ''),
      String(cfg.databaseURL || '')
    );
  } catch(err){ console.warn('No se pudo programar la alarma nativa:', err); }
}
function cancelNativeDueAlarm(alarmId){
  if(!alarmId || !hasAndroidBridgeMethod('cancelNativeAlarm')) return;
  try { AndroidBridge.cancelNativeAlarm(String(alarmId)); } catch(err){ console.warn(err); }
}
function stopNativeRingingAlarm(alarmId){
  if(!alarmId || !hasAndroidBridgeMethod('stopNativeAlarm')) return;
  try { AndroidBridge.stopNativeAlarm(String(alarmId)); } catch(err){ console.warn(err); }
}
function syncNativeAlarmSchedules(){
  state.alarms.forEach(alarm => {
    if(alarm.direction === 'incoming' && isActiveAlarm(alarm)) scheduleNativeDueAlarm(alarm);
    else if(alarm.direction === 'incoming') cancelNativeDueAlarm(alarm.id);
  });
}

async function authorizeGpsFromButton(){
  if(isNativeAndroidLocationAvailable()){
    if(nativeHasLocationPermission()){
      if(nativeHasBackgroundLocationPermission()){
        setGpsPermission('granted', 'GPS autorizado en Android, incluido el uso con la app cerrada o la pantalla apagada.');
      } else {
        setGpsPermission('requesting', 'Falta autorizar “Permitir siempre”. Se abrirán los ajustes de ubicación de Android.');
        try {
          if(hasAndroidBridgeMethod('requestBackgroundLocationPermission')) AndroidBridge.requestBackgroundLocationPermission();
        } catch(err){
          setGpsPermission('denied', 'No se pudieron abrir los ajustes de ubicación en segundo plano.');
        }
      }
      return;
    }
    setGpsPermission('requesting', 'Solicitando permiso GPS de Android...');
    try {
      if(hasAndroidBridgeMethod('requestLocationPermission')) AndroidBridge.requestLocationPermission();
      else setGpsPermission('denied', 'No se pudo abrir el permiso GPS de Android.');
    } catch(err){
      setGpsPermission('denied', 'No se pudo solicitar el permiso GPS de Android.');
    }
    return;
  }

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
  const gpsEnabled = state.gpsPermission === 'granted' || nativeHasLocationPermission();
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
    gpsIntervalMs: getGpsIntervalMs(),
    immobilityMonitoringAvailable: true,
    gpsStoppedAt: null,
    lastGpsAt: null,
    direction: 'outgoing'
  };

  setPanelInfo('sendInfo', 'Guardando alarma online...');
  // Se solicita inmediatamente desde el toque en ENVIAR para que Safari pueda
  // conceder el bloqueo de pantalla antes de que termine la operación de red.
  const wakeLockPromise = gpsEnabled && !isNativeAndroidLocationAvailable()
    ? requestScreenWakeLock(true)
    : Promise.resolve(false);
  try {
    await dbSetAlarm(alarm);
    upsertAlarm(alarm); saveAlarms(); renderAll();
    const screenKeptAwake = await wakeLockPromise;
    const intervalText = formatGpsInterval(getGpsIntervalMs());
    let gpsOkText = '';
    if(isNativeAndroidLocationAvailable()){
      gpsOkText = `Alarma enviada online. GPS nativo activo: seguirá enviando una ubicación ${intervalText} con la app minimizada o la pantalla apagada.`;
    } else if(screenKeptAwake){
      gpsOkText = `Alarma enviada online. GPS activo: se enviará una ubicación ${intervalText}. En iPhone, la pantalla se mantendrá encendida mientras esta página permanezca visible.`;
    } else {
      gpsOkText = `Alarma enviada online. GPS activo: se enviará una ubicación ${intervalText} mientras el navegador mantenga la página visible. Si la pantalla se apaga, mantén Safari abierto y desactiva temporalmente el bloqueo automático.`;
    }
    setPanelInfo('sendInfo', gpsEnabled ? gpsOkText : 'Alarma enviada online. GPS no autorizado: el receptor recibirá la alarma, pero no verá coordenadas.');
    $('alarmMessage').value = '';
    setDefaultDateTime();
    if(gpsEnabled) startSenderGps(alarm);
    syncScreenWakeLock();
  } catch(err){
    console.error(err);
    if(!hasOwnActiveGpsAlarm()) releaseScreenWakeLock();
    setPanelInfo('sendInfo', 'Error: Firebase no confirmó la escritura. La alarma no debe considerarse enviada.', true);
  }
}

function startSenderGps(alarm){
  if(!alarm || !alarm.id || alarm.from !== state.deviceId) return;
  if(alarm.status === AlarmStatus.cancelled || alarm.status === AlarmStatus.completed) return;

  // En Android se usa el servicio nativo: no depende de los temporizadores
  // de la WebView y continúa con la pantalla apagada.
  if(nativeStartSenderGps(alarm)) return;

  // Respaldo para navegador/PWA/iPhone mientras la página siga activa.
  if(state.senderGpsTimers[alarm.id]) return;
  uploadGpsOnce(alarm.id);
  state.senderGpsTimers[alarm.id] = setInterval(() => uploadGpsOnce(alarm.id), getGpsIntervalMs());
}
function stopSenderGps(alarmId){
  nativeStopSenderGps(alarmId);
  if(state.senderGpsTimers[alarmId]){ clearInterval(state.senderGpsTimers[alarmId]); delete state.senderGpsTimers[alarmId]; }
  delete state.senderGpsBusy[alarmId];
  setTimeout(syncScreenWakeLock, 0);
}
async function uploadGpsOnce(alarmId){
  const alarm = state.alarms.find(a => a.id === alarmId);
  if(!alarm || alarm.from !== state.deviceId || !isActiveAlarm(alarm)) { stopSenderGps(alarmId); return; }
  if(state.senderGpsBusy[alarmId]) return;
  state.senderGpsBusy[alarmId] = true;
  try {
    let pos = null;
    const intervalMs = getGpsIntervalMs();
    const cacheAgeMs = Math.min(30000, Math.max(0, Math.floor(intervalMs / 3)));
    if(state.gpsLastPosition && Date.now() - state.gpsLastPositionAt < cacheAgeMs) pos = state.gpsLastPosition;
    else pos = await requestPosition({ enableHighAccuracy:false, timeout:15000, maximumAge:cacheAgeMs });
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
  const active = state.alarms.filter(a => a.from === state.deviceId && a.gpsEnabledBySender && isActiveAlarm(a));
  if(!active.length){ syncScreenWakeLock(); return; }

  if(nativeHasLocationPermission() || state.gpsPermission === 'granted'){
    active.forEach(startSenderGps);
    syncScreenWakeLock();
    return;
  }

  // Después de recargar Safari, el permiso concedido por iOS puede seguir
  // vigente aunque el estado JavaScript haya vuelto a "unknown". Se comprueba
  // una posición y, si responde, se reanuda el envío sin obligar a crear otra alarma.
  if(isNativeAndroidLocationAvailable() || document.visibilityState !== 'visible' || state.webGpsResumePending) return;
  if(Date.now() - state.webGpsLastResumeAttemptAt < 30000) return;
  state.webGpsResumePending = true;
  state.webGpsLastResumeAttemptAt = Date.now();
  requestPosition({ enableHighAccuracy:false, timeout:12000, maximumAge:300000 })
    .then(pos => {
      state.gpsLastPosition = pos;
      state.gpsLastPositionAt = Date.now();
      setGpsPermission('granted', `GPS autorizado correctamente. Última precisión: ±${Math.round(pos.coords.accuracy || 0)} m.`);
      active.forEach(startSenderGps);
      syncScreenWakeLock();
    })
    .catch(err => {
      if(err && err.code === 1) setGpsPermission('denied', gpsErrorMessage(err));
      else console.warn('No se pudo reanudar todavía el GPS web:', err);
    })
    .finally(() => { state.webGpsResumePending = false; });
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
  state.gpsLogs[alarmId] = logs.slice(0, 5000);
  saveGpsLogs();
  evaluateImmobilityForAlarm(alarmId);
  renderGpsLists(alarmId);
  renderAll();
}
function addGpsLogLocal(alarmId, log){
  const arr = state.gpsLogs[alarmId] || [];
  if(!arr.some(x => x.timestamp === log.timestamp && x.from === log.from)) arr.unshift(log);
  arr.sort((a,b) => b.timestamp - a.timestamp);
  state.gpsLogs[alarmId] = arr.slice(0, 5000);
  saveGpsLogs();
  renderGpsLists(alarmId);
}
function stopGpsListener(alarmId){
  if(state.sdkGpsRefs[alarmId]){ try { state.sdkGpsRefs[alarmId].off(); } catch{} delete state.sdkGpsRefs[alarmId]; }
  if(state.restGpsPollTimers[alarmId]){ clearInterval(state.restGpsPollTimers[alarmId]); delete state.restGpsPollTimers[alarmId]; }
  delete state.webImmobilityState[alarmId];
}

function evaluateAllImmobilityStates(){
  state.alarms
    .filter(a => a.direction === 'incoming' && isActiveAlarm(a))
    .forEach(a => evaluateImmobilityForAlarm(a.id));
  syncNativeImmobilityAlertStates();
}
function evaluateImmobilityForAlarm(alarmId){
  const alarm = state.alarms.find(a => a.id === alarmId);
  if(!alarm || alarm.direction !== 'incoming' || !isActiveAlarm(alarm) || !isImmobilityEnabled()){
    resetImmobilityEpisode(alarmId);
    return;
  }

  // En Android, el servicio nativo es la única fuente de decisión para evitar
  // avisos duplicados y mantener los dos niveles con la pantalla apagada.
  if(hasNativeImmobilityAlertCoordinator()){
    nativeStartImmobilityMonitor(alarm);
    syncNativeImmobilityAlertStateForAlarm(alarm);
    return;
  }

  const logs = (state.gpsLogs[alarmId] || [])
    .filter(log => Number.isFinite(Number(log.timestamp)) && Number.isFinite(Number(log.latitude)) && Number.isFinite(Number(log.longitude)))
    .slice()
    .sort((a,b) => Number(a.timestamp) - Number(b.timestamp));
  if(logs.length < 2) return;

  const durationMs = getImmobilityDurationMs();
  const radiusM = getImmobilityRadiusM();
  const latest = logs[logs.length - 1];
  const cutoff = Number(latest.timestamp) - durationMs;
  let anchorIndex = -1;
  for(let i = 0; i < logs.length; i++){
    if(Number(logs[i].timestamp) <= cutoff) anchorIndex = i;
    else break;
  }
  if(anchorIndex < 0) return;

  const anchor = logs[anchorIndex];
  const windowLogs = logs.slice(anchorIndex);
  let maxDistance = 0;
  for(const log of windowLogs){
    maxDistance = Math.max(maxDistance, haversineDistanceMeters(anchor, log));
  }

  const tracker = state.webImmobilityState[alarmId] || {
    active: false, firstAlertAt: 0, urgentShown: false, urgentAcknowledged: false
  };

  if(maxDistance <= radiusM){
    if(!tracker.active){
      tracker.active = true;
      tracker.firstAlertAt = Date.now();
      tracker.anchorTimestamp = Number(anchor.timestamp);
      tracker.urgentShown = false;
      tracker.urgentAcknowledged = false;
      state.webImmobilityState[alarmId] = tracker;
      showImmobilityWarning(alarm, durationMs, radiusM, maxDistance, latest, {
        stage: 'initial',
        alertAt: tracker.firstAlertAt,
        nativeSoundPlayed: false
      });
    } else {
      tracker.anchorTimestamp = Number(anchor.timestamp);
      if(!tracker.urgentShown
          && !tracker.urgentAcknowledged
          && Date.now() - Number(tracker.firstAlertAt || 0) >= IMMOBILITY_URGENT_DELAY_MS){
        tracker.urgentShown = true;
        tracker.urgentAlertAt = Date.now();
        showImmobilityWarning(alarm, durationMs, radiusM, maxDistance, latest, {
          stage: 'urgent',
          alertAt: tracker.urgentAlertAt,
          nativeSoundActive: false
        });
      }
      state.webImmobilityState[alarmId] = tracker;
    }
  } else {
    resetImmobilityEpisode(alarmId);
  }
}
function resetImmobilityEpisode(alarmId){
  if(!alarmId) return;
  delete state.webImmobilityState[alarmId];
  Object.keys(state.immobilityPresented).forEach(key => {
    if(key.startsWith(`${alarmId}|`)) delete state.immobilityPresented[key];
  });
  if(state.immobilityUrgentAlarmId === alarmId) stopImmobilityTone();
  if(state.immobilityDialogKey.startsWith(`${alarmId}|`)){
    state.immobilityDialogKey = '';
    closeAppDialog(false, true);
  }
}
function haversineDistanceMeters(a, b){
  const lat1 = Number(a.latitude), lon1 = Number(a.longitude);
  const lat2 = Number(b.latitude), lon2 = Number(b.longitude);
  if(![lat1,lon1,lat2,lon2].every(Number.isFinite)) return Infinity;
  const toRad = value => value * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const p1 = toRad(lat1);
  const p2 = toRad(lat2);
  const h = Math.sin(dLat/2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dLon/2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1-h));
}
async function showImmobilityWarning(alarm, durationMs, radiusM, maxDistance, latestLog, options={}){
  if(!alarm) return;
  const stage = options.stage === 'urgent' ? 'urgent' : 'initial';
  const alertAt = Number(options.alertAt || Date.now());
  const key = `${alarm.id}|${stage}|${alertAt}`;

  if(stage === 'initial'){
    const persistedKey = `${alarm.id}:initial`;
    if(Number(state.immobilityShown[persistedKey] || 0) === alertAt) return;
    state.immobilityShown[persistedKey] = alertAt;
    saveImmobilityShown();
  } else {
    if(state.immobilityPresented[key]) return;
    state.immobilityPresented[key] = true;
  }

  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const distance = Math.max(0, Math.round(maxDistance));
  const latestTimestamp = Number(latestLog?.timestamp || Date.now());
  const baseMessage = `El emisor de “${alarm.message || 'esta alarma'}” lleva al menos ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'} dentro de una zona de ${radiusM} m. La separación máxima observada ha sido de ${distance} m. Último registro: ${formatDate(latestTimestamp)} ${formatTimeWithSeconds(latestTimestamp)}.`;

  state.immobilityDialogKey = key;
  if(stage === 'initial'){
    if(!options.nativeSoundPlayed) playImmobilityToneOnce();
    await openAppDialog({
      title: 'Posible falta de movimiento',
      message: baseMessage,
      confirmText: 'ENTENDIDO',
      showCancel: false,
      tone: 'warning',
      dismissible: true,
      priority: 'immobility-initial'
    });
    if(state.immobilityDialogKey === key) state.immobilityDialogKey = '';
    return;
  }

  if(!options.nativeSoundActive) startImmobilityTone(alarm.id);
  const understood = await openAppDialog({
    title: 'Falta de movimiento sin resolver',
    message: `${baseMessage} Han transcurrido otros 2 minutos sin detectar un desplazamiento suficiente. El sonido continuará hasta que pulses ENTENDIDO.`,
    confirmText: 'ENTENDIDO',
    showCancel: false,
    tone: 'danger',
    dismissible: false,
    priority: 'immobility-urgent'
  });
  if(state.immobilityDialogKey === key) state.immobilityDialogKey = '';
  if(!understood) return;

  stopImmobilityTone();
  const tracker = state.webImmobilityState[alarm.id];
  if(tracker) tracker.urgentAcknowledged = true;
  nativeAcknowledgeImmobilityAlert(alarm.id);
}
function maybeShowRemoteImmobilityAlert(alarm){
  if(!alarm || !isImmobilityEnabled() || !alarm.immobilityAlertActive) return;
  const stage = alarm.immobilityAlertStage === 'urgent' ? 'urgent' : 'initial';
  const alertAt = Number(stage === 'urgent'
    ? (alarm.immobilityUrgentAt || alarm.immobilityAlertAt)
    : alarm.immobilityAlertAt);
  if(!alertAt || (stage === 'urgent' && alarm.immobilityAlertAcknowledged)) return;
  showImmobilityWarning(
    alarm,
    Number(alarm.immobilityDurationMs || getImmobilityDurationMs()),
    Number(alarm.immobilityRadiusM || getImmobilityRadiusM()),
    Number(alarm.immobilityMaxDistanceM || 0),
    { timestamp: Number(alarm.immobilityLatestTimestamp || alertAt) },
    {
      stage,
      alertAt,
      nativeSoundPlayed: Boolean(alarm.immobilitySoundPlayedNatively),
      nativeSoundActive: Boolean(alarm.immobilityNativeSoundActive)
    }
  );
}
function formatGpsInterval(intervalMs){
  const seconds = Math.max(1, Math.round(Number(intervalMs || DEFAULT_GPS_INTERVAL_MS) / 1000));
  if(seconds < 60) return `cada ${seconds} ${seconds === 1 ? 'segundo' : 'segundos'}`;
  const minutes = Math.round(seconds / 60);
  return `cada ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`;
}

function maybeShowInitialReceiverPopup(alarm){
  if(!alarm || alarm.direction !== 'incoming' || !isActiveAlarm(alarm)) return;
  if(state.shownInitial[alarm.id]) return;
  state.shownInitial[alarm.id] = Date.now(); saveShownInitial();
  showInitialReceiverPopup(alarm);
}
function showInitialReceiverPopup(alarm){
  state.activeInitialPopupAlarmId = alarm.id;
  state.gpsHistoryExpanded.initialGpsList = false;
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
function closeInitialPopup(){
  state.activeInitialPopupAlarmId = '';
  state.gpsHistoryExpanded.initialGpsList = false;
  $('initialReceiverPopup').classList.add('hidden');
}
function renderGpsLists(alarmId){
  if(state.activeInitialPopupAlarmId === alarmId) renderGpsListInto('initialGpsList', alarmId);
  if(state.activeRingingAlarmId === alarmId) renderGpsListInto('ringingGpsList', alarmId);
}
function renderGpsListInto(containerId, alarmId){
  const box = $(containerId); if(!box) return;
  const logsNewestFirst = (state.gpsLogs[alarmId] || []).slice().sort((a,b) => Number(b.timestamp) - Number(a.timestamp));
  if(!logsNewestFirst.length){
    box.innerHTML = `
      <button type="button" class="secondary gps-toggle-btn" disabled>MOSTRAR TODAS</button>
      <div class="gps-empty">Esperando primera ubicación del emisor...</div>
    `;
    return;
  }

  const expanded = Boolean(state.gpsHistoryExpanded[containerId]);
  const logsToShow = expanded
    ? logsNewestFirst.slice().reverse()
    : [logsNewestFirst[0]];
  const label = expanded
    ? `Historial completo · ${logsNewestFirst.length} ${logsNewestFirst.length === 1 ? 'ubicación' : 'ubicaciones'}`
    : 'Última ubicación recibida';

  box.innerHTML = `
    <button
      type="button"
      class="secondary gps-toggle-btn"
      data-action="toggleGpsHistory"
      data-id="${escapeAttr(alarmId)}"
      data-container="${escapeAttr(containerId)}"
      aria-expanded="${expanded ? 'true' : 'false'}"
    >${expanded ? 'OCULTAR' : 'MOSTRAR TODAS'}</button>
    <div class="gps-view-label">${escapeHtml(label)}</div>
    <div class="gps-records">
      ${logsToShow.map(gpsLogHtml).join('')}
    </div>
  `;
}
function gpsLogHtml(log){
  const latitude = Number(log.latitude);
  const longitude = Number(log.longitude);
  const accuracy = Number(log.accuracy || 0);
  const lat = Number.isFinite(latitude) ? latitude.toFixed(6) : '-';
  const lng = Number.isFinite(longitude) ? longitude.toFixed(6) : '-';
  const acc = Number.isFinite(accuracy) ? accuracy.toFixed(0) : '0';
  const hasCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude);
  const coordsText = hasCoordinates ? `${lat},${lng}` : '';
  const coordinates = hasCoordinates
    ? `<a href="https://www.google.com/maps?q=${lat},${lng}" target="_blank" rel="noopener">${lat}, ${lng}</a>`
    : '<span>Coordenadas no disponibles</span>';
  const copyButton = hasCoordinates
    ? `<button type="button" class="gps-copy-btn" data-action="copyGpsCoords" data-coords="${escapeAttr(coordsText)}" aria-label="Copiar ubicación ${escapeAttr(lat)}, ${escapeAttr(lng)} al portapapeles">Copiar ubicación</button>`
    : '';
  return `
    <div class="gps-line">
      <div class="gps-line-top">
        <div class="gps-line-datetime">${escapeHtml(formatDate(log.timestamp))} · ${escapeHtml(formatTimeWithSeconds(log.timestamp))}</div>
        ${copyButton}
      </div>
      <div class="gps-line-bottom">${coordinates} · <span class="gps-line-accuracy">±${acc} m</span></div>
    </div>
  `;
}
async function copyGpsCoords(btn){
  const coords = String(btn?.dataset?.coords || '').trim();
  if(!coords){ toast('No hay coordenadas para copiar.'); return; }
  const originalText = btn.dataset.originalText || btn.textContent || 'Copiar ubicación';
  btn.dataset.originalText = originalText;
  const copied = await copyTextToClipboard(coords);
  if(copied){
    btn.textContent = 'Ubicación copiada';
    btn.classList.add('copied');
    toast('Coordenadas GPS copiadas al portapapeles.');
    clearTimeout(Number(btn.dataset.resetTimer || 0));
    const timer = setTimeout(() => {
      btn.textContent = originalText;
      btn.classList.remove('copied');
      btn.dataset.resetTimer = '';
    }, 1800);
    btn.dataset.resetTimer = String(timer);
  } else {
    toast('No se pudieron copiar las coordenadas.');
  }
}
async function copyTextToClipboard(text){
  try {
    if(navigator.clipboard && window.isSecureContext){
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch(err){
    console.warn('Clipboard API no disponible:', err);
  }
  try {
    const helper = document.createElement('textarea');
    helper.value = text;
    helper.setAttribute('readonly', 'readonly');
    helper.style.position = 'fixed';
    helper.style.opacity = '0';
    helper.style.pointerEvents = 'none';
    helper.style.left = '-9999px';
    document.body.appendChild(helper);
    helper.focus();
    helper.select();
    helper.setSelectionRange(0, helper.value.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(helper);
    return ok;
  } catch(err){
    console.warn('Fallback de copiado falló:', err);
    return false;
  }
}
function toggleGpsHistory(containerId, alarmId){
  if(!containerId || !alarmId || !Object.prototype.hasOwnProperty.call(state.gpsHistoryExpanded, containerId)) return;
  state.gpsHistoryExpanded[containerId] = !state.gpsHistoryExpanded[containerId];
  renderGpsListInto(containerId, alarmId);
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
  stopNativeRingingAlarm(alarm.id);
  state.activeRingingAlarmId = alarm.id;
  state.gpsHistoryExpanded.ringingGpsList = false;
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
  stopNativeRingingAlarm(alarmId);
  cancelNativeDueAlarm(alarmId);
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
  state.gpsHistoryExpanded.ringingGpsList = false;
  stopGpsListener(alarmId);
  nativeStopImmobilityMonitor(alarmId);
}

async function cancelAlarm(alarmId){
  const alarm = state.alarms.find(a => a.id === alarmId);
  if(!alarm || alarm.from !== state.deviceId) return;
  if(!isActiveAlarm(alarm)) return;
  const response = await openAppDialog({
    title: 'Anular alarma',
    message: 'La alarma dejará de estar activa y el otro móvil verá que ha sido anulada.',
    confirmText: 'ANULAR',
    cancelText: 'MANTENER',
    tone: 'danger',
    input: true,
    inputLabel: 'Mensaje de anulación (opcional)',
    inputPlaceholder: 'Ej.: Llegué bien.',
    inputValue: '',
    inputMaxLength: 250
  });
  if(!response || response.confirmed !== true) return;

  const cancellationMessage = String(response.value || '').trim();
  alarm.status = AlarmStatus.cancelled;
  alarm.cancelled = true;
  alarm.cancelledAt = Date.now();
  alarm.cancellationMessage = cancellationMessage;
  upsertAlarm(alarm);
  saveAlarms();
  renderAll();
  stopSenderGps(alarm.id);
  syncScreenWakeLock();

  try {
    await dbUpdateAlarm(alarm.id, {
      status: AlarmStatus.cancelled,
      cancelled: true,
      cancelledAt: alarm.cancelledAt,
      cancellationMessage,
      gpsStoppedAt: Date.now()
    });
  } catch(err){
    toast('No se pudo anular online. Revisa conexión.');
    console.warn(err);
  }
}

function handleAlarmAction(ev){
  const btn = ev.target.closest('[data-action]');
  if(!btn) return;
  const id = btn.dataset.id;
  if(btn.dataset.action === 'cancel') cancelAlarm(id);
  if(btn.dataset.action === 'energySave') enterEnergySaverMode(id);
  if(btn.dataset.action === 'showGps') {
    const alarm = state.alarms.find(a => a.id === id);
    if(alarm){ ensureGpsListener(id); showInitialReceiverPopup(alarm); }
  }
  if(btn.dataset.action === 'toggleGpsHistory') {
    toggleGpsHistory(btn.dataset.container, id);
  }
  if(btn.dataset.action === 'copyGpsCoords') {
    copyGpsCoords(btn);
  }
  if(btn.dataset.action === 'deleteLocal') deleteLocalAlarm(id);
}
function deleteLocalAlarm(id){
  const alarm = state.alarms.find(a => a.id === id);
  if(!alarm || isActiveAlarm(alarm)){ toast('Solo se pueden borrar registros finalizados o anulados.'); return; }
  state.alarms = state.alarms.filter(a => a.id !== id);
  delete state.gpsLogs[id];
  nativeStopImmobilityMonitor(id);
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
  for(const a of state.alarms){
    if(isActiveAlarm(a)) keep.push(a);
    else {
      delete state.gpsLogs[a.id];
      nativeStopImmobilityMonitor(a.id);
    }
  }
  state.alarms = keep; saveAlarms(); saveGpsLogs(); renderAll();
}

function showSenderAck(alarm){
  setText('senderAckText', `✅ El otro móvil confirmó que ha recibido la alarma: ${alarm.message || 'Alarma sin mensaje'}`);
  $('senderAckPopup').classList.remove('hidden');
}

function renderAll(){
  syncEnergySaverMode();
  updateIdentityUI();
  const incomingPending = state.alarms.filter(a => a.direction === 'incoming' && isActiveAlarm(a)).length;
  const outgoingPending = state.alarms.filter(a => a.direction === 'outgoing' && isActiveAlarm(a)).length;
  setText('pendingIncomingCount', incomingPending);
  setText('pendingOutgoingCount', outgoingPending);
  renderKnownDevices(); renderRecent(); renderReceived(); renderSent(); renderHistory();
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
  const cancellationMessage = getCancellationMessage(a);
  const cancellationLine = (a.status === AlarmStatus.cancelled || a.cancelled) && cancellationMessage
    ? `<div class="cancellation-message"><strong>Mensaje de anulación:</strong><br>${escapeHtmlWithBreaks(cancellationMessage)}</div>`
    : '';
  const actions = [];
  const canUseEnergySaver = a.direction === 'outgoing' && isActiveAlarm(a);
  if(canUseEnergySaver){
    actions.push(`<button class="danger" data-action="cancel" data-id="${escapeAttr(a.id)}" type="button">Anular alarma</button>`);
    actions.push(`<button class="energy-saver-btn" data-action="energySave" data-id="${escapeAttr(a.id)}" type="button" aria-label="Activar ahorro de energía. Mantén pulsada la pantalla negra durante un segundo para volver.">Ahorro de energía</button>`);
  }
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
        ${cancellationLine}
        ${compact ? '' : `<div>${escapeHtml(ack)}</div>${gpsLine}`}
      </div>
      ${actions.length ? `<div class="alarm-actions${canUseEnergySaver ? ' alarm-actions-paired' : ''}">${actions.join('')}</div>` : ''}
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
function escapeHtmlWithBreaks(value){ return escapeHtml(value).replace(/\r?\n/g, '<br>'); }
function getCancellationMessage(alarm){ return String(alarm?.cancellationMessage || alarm?.mensajeAnulacion || '').trim(); }
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
  if(state.appDialogResolver){
    if(!state.appDialogDismissible && options.priority !== 'immobility-urgent') return Promise.resolve(false);
    closeAppDialog(false, true);
  }

  state.appDialogDismissible = options.dismissible !== false;
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

  const inputWrap = $('appDialogInputWrap');
  const input = $('appDialogInput');
  state.appDialogInputEnabled = options.input === true;
  inputWrap?.classList.toggle('hidden', !state.appDialogInputEnabled);
  setText('appDialogInputLabel', options.inputLabel || 'Mensaje');
  if(input){
    input.value = state.appDialogInputEnabled ? String(options.inputValue || '') : '';
    input.placeholder = options.inputPlaceholder || '';
    input.maxLength = Math.max(1, Number(options.inputMaxLength || 250));
  }

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
  setTimeout(() => {
    if(state.appDialogInputEnabled) input?.focus();
    else (showCancel ? cancelBtn : confirmBtn)?.focus();
  }, 0);
  return new Promise(resolve => { state.appDialogResolver = resolve; });
}
function confirmAppDialog(){
  if(state.appDialogInputEnabled){
    const value = String($('appDialogInput')?.value || '').trim();
    closeAppDialog({ confirmed: true, value });
    return;
  }
  closeAppDialog(true);
}
function closeAppDialog(result=false, force=false){
  if(!force && !result && !state.appDialogDismissible) return;
  const dialog = $('appDialog');
  if(dialog) dialog.classList.add('hidden');
  const resolve = state.appDialogResolver;
  state.appDialogResolver = null;
  state.appDialogDismissible = true;
  state.appDialogInputEnabled = false;
  if(resolve) resolve(result);
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
function playImmobilityToneOnce(){
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    state.audioCtx = state.audioCtx || new AudioContext();
    if(state.audioCtx.state === 'suspended') state.audioCtx.resume().catch(() => {});
    playBeepSequence();
  } catch(err){ console.warn('No se pudo reproducir el aviso de inmovilidad:', err); }
}
function startImmobilityTone(alarmId){
  if(state.immobilityToneTimer && state.immobilityUrgentAlarmId === alarmId) return;
  stopImmobilityTone();
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    state.audioCtx = state.audioCtx || new AudioContext();
    if(state.audioCtx.state === 'suspended') state.audioCtx.resume().catch(() => {});
    state.immobilityUrgentAlarmId = String(alarmId || '');
    const pattern = () => playBeepSequence();
    pattern();
    state.immobilityToneTimer = setInterval(pattern, 1800);
  } catch(err){ console.warn('No se pudo iniciar el sonido continuo de inmovilidad:', err); }
}
function stopImmobilityTone(){
  if(state.immobilityToneTimer){
    clearInterval(state.immobilityToneTimer);
    state.immobilityToneTimer = null;
  }
  state.immobilityUrgentAlarmId = '';
}
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
  stopImmobilityTone();
  Object.keys(state.senderGpsTimers).forEach(stopSenderGps);
  releaseScreenWakeLock();
});
