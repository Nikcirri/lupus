'use strict';

/* =========================================================================
   3. CHIAVI LOCALSTORAGE E STATO DELL'APPLICAZIONE
========================================================================= */
const STORAGE_KEYS = {
  ROLES: 'lupus_narratore_roles_v1',
  PLAYERS: 'lupus_narratore_players_v1',
  SETTINGS: 'lupus_narratore_settings_v1',
  MATCH: 'lupus_narratore_match_v1',
  UPDATES: 'lupus_updates_v1',
  KNOWN_PLAYERS: 'lupus_narratore_known_players_v1', // nomi di chi ha già giocato (suggerimenti)
  SEEN_VERSION: 'lupus_narratore_seen_version_v1'    // ultima versione di cui si sono viste le novità
};

const DEFAULT_DAY_TIMER_SECONDS = 180;

let rolesDB = [];
let setupPlayers = [];
let appSettings = {
  ghostRule: true,
  autoResolve: true,   // morti e vittorie automatiche
  enforceRules: true,  // regole controllate nella modalità guidata
  selectedDeck: {}, // mappa { roleId: count }
  selectedPresetCode: null,
  activeSetupTab: 'presets',
  knownDefaultRoleIds: null, // ruoli base già visti: i nuovi si aggiungono una volta sola
  // Varianti della partita (copiate nella partita quando inizia)
  tieRule: 'runoff',       // pareggio al voto: 'runoff' | 'none' | 'decider'
  revealDead: false,       // si svela il ruolo di chi muore
  deckAnnounced: false,    // all'inizio si annunciano i ruoli in gioco
  surpriseEvents: false,   // eventi a sorpresa nelle notti
  // Preferenze del Narratore (valgono per tutte le partite)
  playMode: 'narrator',      // 'narrator' (c'è un Narratore) | 'auto' (senza Narratore: il telefono passa di mano in mano)
  narratorLevel: 'beginner', // 'beginner' (consigli a ogni passo) | 'expert' (solo l'essenziale)
  voiceOn: false,            // il telefono legge le frasi ad alta voce
  soundsOn: true             // ululato, gallo, campanella...
};

// Stato completo della partita attiva (salvato a ogni azione)
let activeMatch = null;

// Variabili temporanee UI (Timer Giorno e distribuzione)
let dayTimerSeconds = DEFAULT_DAY_TIMER_SECONDS;
let dayTimerInterval = null;
let confirmCallback = null;
let wakeLockSentinel = null;
let pendingDeathPlayerId = null;

// Funzioni del telefono (vibrazione, tasto Indietro, versione): arrivano da src/native.js.
// Nel browser (senza app) non esistono e si usano le alternative web.
function nativeApp() {
  return window.LupusApp || null;
}

function getAppVersion() {
  const app = nativeApp();
  return app && app.version ? app.version : '0.0.0';
}

function isNativeApp() {
  const app = nativeApp();
  return !!(app && app.isNative);
}

function vibrate(kind) {
  const app = nativeApp();
  if (app && app.vibrate) {
    app.vibrate(kind);
  } else if (navigator.vibrate) {
    const patterns = { tap: 12, reveal: 25, death: 220, victory: [80, 60, 80, 60, 160], alert: [400, 150, 400] };
    try { navigator.vibrate(patterns[kind] || 20); } catch (e) {}
  }
}

/* =========================================================================
   4. INIZIALIZZAZIONE E FUNZIONI DI SISTEMA (WAKE LOCK, TASTO INDIETRO, STORAGE)
========================================================================= */
window.addEventListener('DOMContentLoaded', () => {
  const isFirstRun = !hasSavedData();
  loadAllFromStorage();
  dayTimerSeconds = getTimerDuration();
  renderSetupScreen();
  showScreen('screenSetup');
  requestScreenWakeLock();
  renderUpdateBanner();
  checkWhatsNew(isFirstRun);
  if (isFirstRun) openWelcome();
  setTimeout(autoCheckForUpdates, 1500);
});

function hasSavedData() {
  try {
    return [STORAGE_KEYS.ROLES, STORAGE_KEYS.PLAYERS, STORAGE_KEYS.SETTINGS, STORAGE_KEYS.MATCH].some(k => localStorage.getItem(k) !== null);
  } catch (e) {
    return false;
  }
}

// Tasto Indietro di Android (chiamato da src/native.js).
// Restituisce true se l'ha gestito l'app; false = l'app va in secondo piano.
window.handleAndroidBack = function handleAndroidBack() {
  const isOpen = id => document.getElementById(id).classList.contains('active');

  if (isOpen('modalConfirm')) { closeConfirmModal(); return true; }
  if (isOpen('modalWelcome')) { closeWelcome(); return true; }
  if (isTableViewOpen()) { showToast('✋ Per tornare al Narratore tieni premuto il pulsante in basso.'); return true; }
  if (isOpen('modalRestore')) { closeRestoreModal(); return true; }
  if (isOpen('modalDeathCause')) { closeDeathCauseModal(); return true; }
  if (isOpen('modalVote')) { closeVoteModal(); return true; }
  if (isOpen('modalSummary')) { closeSummaryModal(); return true; }
  if (isOpen('modalGuide')) { closeGuideModal(); return true; }
  if (isOpen('modalShareRoles')) { closeShareRolesModal(); return true; }
  if (isOpen('modalImportRoles')) { closeImportRolesModal(); return true; }
  if (isOpen('modalWhatsNew')) { closeWhatsNewModal(); return true; }
  if (isOpen('modalRoleForm')) { closeRoleFormModal(); return true; }
  if (isOpen('modalInfo')) { closeInfoModal(); return true; }
  if (isOpen('modalGameMenu')) { closeGameMenuModal(); return true; }
  if (isOpen('modalAntiAmnesiaSafeView') || isOpen('modalAntiAmnesiaSelect')) { closeAntiAmnesiaModal(); return true; }

  if (isOpen('screenRoleEditor')) { closeRoleEditorScreen(); return true; }

  if (isOpen('screenDistribution')) {
    // Se un ruolo è scoperto, lo copre di nuovo (senza passare al giocatore successivo).
    if (document.getElementById('distStepReveal').classList.contains('visible')) {
      hideDistRole();
      return true;
    }
    confirmLeaveApp();
    return true;
  }

  if (isOpen('screenNarrator')) {
    confirmLeaveApp();
    return true;
  }

  // Preparazione: Indietro torna alla tappa precedente
  if (isOpen('screenSetup') && setupStep > 1) {
    goSetupStep(setupStep - 1);
    return true;
  }

  return false;
};

function confirmLeaveApp() {
  openConfirmModal(
    'Uscire da Lupus?',
    'La partita resta salvata: quando riapri l\'app la ritrovi esattamente dov\'eri.',
    () => {
      const app = nativeApp();
      if (app && app.minimize) app.minimize();
    },
    { yesLabel: 'Esci', yesClass: 'btn-primary' }
  );
}

// Riattiva Wake Lock quando la pagina torna visibile
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    requestScreenWakeLock();
  }
});

// Attiva Wake Lock anche al primo tocco sullo schermo
document.addEventListener('click', () => {
  if (!wakeLockSentinel) requestScreenWakeLock();
}, { once: true });

async function requestScreenWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      wakeLockSentinel = await navigator.wakeLock.request('screen');
      wakeLockSentinel.addEventListener('release', () => {
        wakeLockSentinel = null;
      });
    }
  } catch (err) {
    // Gestione silenziosa degli errori come richiesto
  }
}

function loadAllFromStorage() {
  // 1. Ruoli
  try {
    const savedRoles = localStorage.getItem(STORAGE_KEYS.ROLES);
    if (savedRoles) {
      rolesDB = JSON.parse(savedRoles);
    } else {
      rolesDB = JSON.parse(JSON.stringify(DEFAULT_ROLES));
      saveRolesToStorage();
    }
  } catch (e) {
    rolesDB = JSON.parse(JSON.stringify(DEFAULT_ROLES));
  }

  // 2. Nomi giocatori
  try {
    const savedPlayers = localStorage.getItem(STORAGE_KEYS.PLAYERS);
    if (savedPlayers) {
      setupPlayers = JSON.parse(savedPlayers);
    }
  } catch (e) {
    setupPlayers = [];
  }

  // 3. Impostazioni setup
  try {
    const savedSettings = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (savedSettings) {
      appSettings = { ...appSettings, ...JSON.parse(savedSettings) };
    }
  } catch (e) {}

  // 4. Partita in corso
  try {
    const savedMatch = localStorage.getItem(STORAGE_KEYS.MATCH);
    if (savedMatch) {
      activeMatch = JSON.parse(savedMatch);
    }
  } catch (e) {
    activeMatch = null;
  }

  // Dati salvati non validi (per esempio file vecchi o danneggiati): si riparte puliti.
  if (!Array.isArray(rolesDB) || rolesDB.length === 0) rolesDB = JSON.parse(JSON.stringify(DEFAULT_ROLES));
  if (!Array.isArray(setupPlayers)) setupPlayers = [];
  setupPlayers = setupPlayers.filter(n => typeof n === 'string' && n.trim()).map(n => n.trim());
  if (!appSettings.selectedDeck || typeof appSettings.selectedDeck !== 'object') appSettings.selectedDeck = {};
  if (activeMatch && (!Array.isArray(activeMatch.players) || activeMatch.players.length === 0)) activeMatch = null;
  migrateRoles();
  if (activeMatch) migrateMatch(activeMatch);
  pruneDeckOfMissingRoles();
}

// Partite salvate con le versioni precedenti: aggiunge i dati nuovi.
function migrateMatch(match) {
  if (!match.nightChoices) migrateLegacyMatch(match);
  if (!match.usedPowers || typeof match.usedPowers !== 'object') match.usedPowers = {};
  if (!Array.isArray(match.pendingDeathActions)) match.pendingDeathActions = [];
  if (!TIE_RULE_KEYS.includes(match.tieRule)) match.tieRule = 'runoff';
  ['revealDead', 'deckAnnounced', 'surpriseEvents'].forEach(k => { if (typeof match[k] !== 'boolean') match[k] = false; });
  if (match.event && !findSurpriseEvent(match.event.id)) match.event = null;
  if (match.mode !== 'auto') match.mode = 'narrator';
}

// Partite salvate con le versioni 1.0-1.2: i segnalini diventano le scelte della modalità guidata.
function migrateLegacyMatch(match) {
  const plan = buildNightPlan(match.players, rolesDB, match.turn || 1);
  const findStep = kind => plan.find(st => st.kind === kind);
  const choices = {};
  const prev = {};
  const pick = (field, kind) => {
    const p = match.players.find(x => x[field]);
    const step = findStep(kind);
    if (p && step) choices[step.key] = p.id;
  };
  if (match.phase === 'night') {
    pick('wolfTarget', 'wolves');
    pick('shieldTonight', 'protect');
    pick('seerProbed', 'investigate');
    pick('flowerTonight', 'mark');
  }
  const guard = match.players.find(x => x.shieldYesterday);
  const protectStep = findStep('protect');
  if (guard && protectStep) prev[protectStep.key] = guard.id;
  match.players.forEach(p => {
    delete p.wolfTarget; delete p.shieldTonight; delete p.shieldYesterday; delete p.seerProbed; delete p.flowerTonight;
  });
  delete match.completedSteps;
  delete match.copioneTargetId;
  match.nightChoices = choices;
  match.prevNightChoices = prev;
  match.guideKey = match.phase === 'night' ? 'intro' : 'morning';
  match.nightLogs = match.nightLogs || [];
  if (typeof match.autoResolve !== 'boolean') match.autoResolve = true;
  if (typeof match.enforceRules !== 'boolean') match.enforceRules = true;
}

// Ruoli salvati con le versioni precedenti: aggiunge i ruoli base nuovi (una volta sola)
// e le capacità che mancano (azione notturna, regole, vittoria, caratteristiche...).
function migrateRoles() {
  let changed = false;
  const res = addNewDefaultRoles(rolesDB, appSettings.knownDefaultRoleIds);
  if (res.added.length) {
    rolesDB = res.roles;
    changed = true;
  }
  if (JSON.stringify(appSettings.knownDefaultRoleIds) !== JSON.stringify(res.knownIds)) {
    appSettings.knownDefaultRoleIds = res.knownIds;
    saveSettingsToStorage();
  }
  rolesDB.forEach(r => {
    const filled = completeRoleCapabilities(r);
    const current = JSON.stringify(ROLE_CAPABILITY_FIELDS.map(k => r[k]));
    if (current !== JSON.stringify(ROLE_CAPABILITY_FIELDS.map(k => filled[k]))) {
      Object.assign(r, filled);
      changed = true;
    }
  });
  if (changed) saveRolesToStorage();
}

const ROLE_CAPABILITY_FIELDS = ['nightAction', 'actionRules', 'wakesWithWolves', 'deathAction', 'victory', 'traits', 'markText'];

function completeRoleCapabilities(r) {
  return {
    nightAction: roleNightAction(r),
    actionRules: roleActionRules(r),
    wakesWithWolves: roleWakesWithWolves(r),
    deathAction: roleDeathAction(r),
    victory: roleVictory(r),
    traits: roleTraits(r),
    markText: typeof r.markText === 'string' ? r.markText : (roleNightAction(r) === 'mark' ? roleMarkText(r) : '')
  };
}

// Toglie dal mazzo i ruoli che non esistono più (eliminati o dopo il ripristino dei ruoli base).
function pruneDeckOfMissingRoles() {
  let changed = false;
  // preset delle versioni precedenti (codici cambiati con la 1.5)
  const allCodes = Object.values(PRESETS_BY_COUNT).flat().map(p => p.code);
  if (appSettings.selectedPresetCode && !allCodes.includes(appSettings.selectedPresetCode)) {
    appSettings.selectedPresetCode = null;
    changed = true;
  }
  for (const roleId of Object.keys(appSettings.selectedDeck)) {
    if (!rolesDB.some(r => r.id === roleId) || !(appSettings.selectedDeck[roleId] > 0)) {
      delete appSettings.selectedDeck[roleId];
      changed = true;
    }
  }
  if (changed) {
    appSettings.selectedPresetCode = null;
    saveSettingsToStorage();
  }
}

function findRoleOrNull(roleId) {
  return rolesDB.find(r => r.id === roleId) || null;
}

function saveRolesToStorage() {
  try {
    localStorage.setItem(STORAGE_KEYS.ROLES, JSON.stringify(rolesDB));
  } catch (e) {}
}

function savePlayersToStorage() {
  try {
    localStorage.setItem(STORAGE_KEYS.PLAYERS, JSON.stringify(setupPlayers));
  } catch (e) {}
}

function saveSettingsToStorage() {
  try {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(appSettings));
  } catch (e) {}
}

function saveMatchToStorage() {
  try {
    if (activeMatch) {
      localStorage.setItem(STORAGE_KEYS.MATCH, JSON.stringify(activeMatch));
    } else {
      localStorage.removeItem(STORAGE_KEYS.MATCH);
    }
  } catch (e) {}
}

function getRoleById(roleId) {
  return rolesDB.find(r => r.id === roleId) || {
    id: roleId,
    name: roleId,
    icon: '❓',
    faction: 'Villaggio',
    whatYouDo: '',
    howYouWin: '',
    wakeTiming: 'mai',
    priority: 10,
    narratorPhrase: '',
    narratorNote: '',
    isPair: false
  };
}

/* =========================================================================
   5. NOTIFICHE TOAST E MODALE DI CONFERMA
========================================================================= */
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = 'toast' + (type === 'ghost' ? ' toast-ghost' : type === 'warn' ? ' toast-warn' : '');
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.25s';
    setTimeout(() => toast.remove(), 260);
  }, 3400);
}

function openConfirmModal(title, message, onConfirm, options = {}) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMessage').textContent = message;
  const yesBtn = document.getElementById('confirmBtnYes');
  yesBtn.textContent = options.yesLabel || 'Conferma';
  yesBtn.className = 'btn ' + (options.yesClass || 'btn-danger');
  confirmCallback = onConfirm;
  document.getElementById('confirmBtnYes').onclick = () => {
    const cb = confirmCallback;
    closeConfirmModal();
    if (cb) cb();
  };
  document.getElementById('modalConfirm').classList.add('active');
}

function closeConfirmModal() {
  document.getElementById('modalConfirm').classList.remove('active');
  confirmCallback = null;
}

function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(screenId).classList.add('active');

  const isNarrator = (screenId === 'screenNarrator');
  document.getElementById('btnAntiAmnesiaTop').style.display = isNarrator ? 'inline-flex' : 'none';
  document.getElementById('btnSettingsTop').style.display = isNarrator ? 'inline-flex' : 'none';
  document.getElementById('btnUndoTop').style.display = isNarrator ? 'inline-flex' : 'none';
  document.getElementById('btnTableTop').style.display = isNarrator ? 'inline-flex' : 'none';
  if (!isNarrator && isTableViewOpen()) closeTableView();
  document.getElementById('headerIcon').style.display = isNarrator ? 'none' : 'inline';
  document.getElementById('btnInfoTop').style.display = (screenId === 'screenSetup') ? 'inline-flex' : 'none';
  if (screenId !== 'screenNarrator') document.getElementById('headerTitle').textContent = 'Lupus';

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* =========================================================================
   6. SCHERMATA 1: SETUP GIOCATORI, PRESET E PERSONALIZZA
========================================================================= */
function renderSetupScreen() {
  document.getElementById('headerTitle').textContent = 'Lupus';
  syncMatchOptionToggles();
  document.getElementById('totalRolesDbCount').textContent = rolesDB.length;

  // Banner Riprendi Partita in Corso
  const resumeBanner = document.getElementById('resumeBanner');
  if (activeMatch && activeMatch.players && activeMatch.players.length > 0) {
    resumeBanner.style.display = 'flex';
    const phaseLabel = activeMatch.status === 'distributing'
      ? 'Distribuzione Ruoli'
      : (activeMatch.phase === 'night' ? `🌙 Notte ${activeMatch.turn}` : `☀️ Giorno ${activeMatch.turn}`);
    document.getElementById('resumePhaseBadge').textContent = phaseLabel;
    const aliveCount = activeMatch.players.filter(p => !p.isDead).length;
    document.getElementById('resumeSummaryText').textContent =
      `${activeMatch.players.length} giocatori (${aliveCount} vivi) • Tocca per riprendere da dove eri rimasto.`;
  } else {
    resumeBanner.style.display = 'none';
  }

  renderPlayerChips();
  renderSetupTabs();
  syncPlayModeUI();
  updateSetupDeckCounters();
}

function renderPlayerChips() {
  const count = setupPlayers.length;
  document.getElementById('playerCountLabel').textContent = count;
  document.getElementById('btnClearPlayers').style.display = count > 0 ? 'inline-flex' : 'none';

  const container = document.getElementById('playerChipsList');
  container.innerHTML = '';
  renderNameSuggestions();

  if (count === 0) {
    container.innerHTML = `<div style="text-align:center; padding: 12px; color: var(--text-muted); font-size: 0.9rem;">
      Nessun giocatore inserito. Aggiungi almeno 5 giocatori per iniziare.
    </div>`;
    return;
  }

  const colors = assignPlayerColors(setupPlayers);
  setupPlayers.forEach((name, idx) => {
    const row = document.createElement('div');
    row.className = 'player-chip';
    row.innerHTML = `
      <div class="player-chip-name">
        ${avatarHtml(name, colors[idx])}
        <span>${escapeHtml(name)}</span>
      </div>
      <button class="player-chip-remove" onclick="removePlayerAt(${idx})" title="Rimuovi">✖</button>
    `;
    container.appendChild(row);
  });
}

function addPlayerFromInput() {
  const input = document.getElementById('playerNameInput');
  const raw = input.value.trim();
  if (!raw) return;

  // Supporta anche inserimento multiplo separato da virgola
  const names = raw.split(',').map(s => s.trim()).filter(Boolean);
  names.forEach(name => {
    if (setupPlayers.some(p => p.toLowerCase() === name.toLowerCase())) {
      showToast(`"${name}" è già nella lista!`, 'warn');
    } else {
      setupPlayers.push(name);
    }
  });

  input.value = '';
  input.focus();
  savePlayersToStorage();
  autoSelectFirstPresetIfMatch();
  renderSetupScreen();
}

function removePlayerAt(index) {
  const name = setupPlayers[index];
  doWithUndo(`✖ ${name} tolto dalla lista`, () => {
    setupPlayers.splice(index, 1);
    savePlayersToStorage();
    autoSelectFirstPresetIfMatch();
    renderSetupScreen();
  });
}

// Nomi già usati in altre partite, proposti sotto il campo di testo
function loadKnownPlayers() {
  try {
    const list = JSON.parse(localStorage.getItem(STORAGE_KEYS.KNOWN_PLAYERS) || '[]');
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

function saveKnownPlayers(list) {
  try { localStorage.setItem(STORAGE_KEYS.KNOWN_PLAYERS, JSON.stringify(list || [])); } catch (e) {}
}

function getTypedNameFragment() {
  const value = document.getElementById('playerNameInput').value;
  const parts = value.split(',');
  return parts[parts.length - 1];
}

function renderNameSuggestions() {
  const box = document.getElementById('nameSuggestions');
  const names = suggestPlayerNames(loadKnownPlayers(), setupPlayers, getTypedNameFragment(), 10);
  if (!names.length) {
    box.style.display = 'none';
    box.innerHTML = '';
    return;
  }
  const colors = assignPlayerColors(names);
  box.style.display = 'flex';
  box.innerHTML = `<span class="name-suggestions-label">Hanno già giocato:</span>` +
    names.map((n, i) => `<button class="name-suggestion" onclick="addSuggestedPlayer(${escapeHtml(JSON.stringify(n))})">${avatarHtml(n, colors[i], 'sm')} ${escapeHtml(n)}</button>`).join('') +
    `<button class="name-suggestion name-suggestion-forget" onclick="forgetKnownPlayers()" title="Dimentica questi nomi">🧹</button>`;
}

function addSuggestedPlayer(name) {
  if (setupPlayers.some(p => p.toLowerCase() === name.toLowerCase())) return;
  vibrate('tap');
  const input = document.getElementById('playerNameInput');
  const parts = input.value.split(',');
  parts.pop();
  input.value = parts.length ? parts.join(',') + ', ' : '';
  setupPlayers.push(name);
  savePlayersToStorage();
  autoSelectFirstPresetIfMatch();
  renderSetupScreen();
}

function forgetKnownPlayers() {
  doWithUndo('🧹 Nomi suggeriti dimenticati', () => {
    saveKnownPlayers([]);
    renderNameSuggestions();
  });
}

function confirmClearPlayers() {
  doWithUndo('🧹 Lista giocatori svuotata', () => {
    setupPlayers = [];
    appSettings.selectedDeck = {};
    appSettings.selectedPresetCode = null;
    savePlayersToStorage();
    saveSettingsToStorage();
    renderSetupScreen();
  });
}

// Interruttori delle opzioni di partita: uguali nel setup e nel menu ⚙️ durante la partita
// Interruttori delle opzioni: [nella schermata iniziale, nel menu ⚙️ della partita] e valore predefinito
const MATCH_OPTION_TOGGLES = {
  ghostRule: ['toggleGhostRule', 'toggleGhostRuleInGame'],
  autoResolve: ['toggleAutoResolve', 'toggleAutoResolveInGame'],
  enforceRules: ['toggleEnforceRules', 'toggleEnforceRulesInGame'],
  revealDead: ['toggleRevealDead', 'toggleRevealDeadInGame'],
  deckAnnounced: ['toggleDeckAnnounced', null],
  surpriseEvents: ['toggleSurpriseEvents', 'toggleSurpriseEventsInGame']
};
const MATCH_OPTION_DEFAULTS = { ghostRule: true, autoResolve: true, enforceRules: true, revealDead: false, deckAnnounced: false, surpriseEvents: false };

function getSetupOption(key) {
  return typeof appSettings[key] === 'boolean' ? appSettings[key] : MATCH_OPTION_DEFAULTS[key];
}

function getMatchOption(key) {
  if (activeMatch && typeof activeMatch[key] === 'boolean') return activeMatch[key];
  return getSetupOption(key);
}

function getTieRule() {
  const rule = activeMatch && activeMatch.tieRule ? activeMatch.tieRule : appSettings.tieRule;
  return TIE_RULE_KEYS.includes(rule) ? rule : 'runoff';
}

function syncMatchOptionToggles() {
  Object.entries(MATCH_OPTION_TOGGLES).forEach(([key, ids]) => {
    const el0 = ids[0] && document.getElementById(ids[0]);
    if (el0) el0.checked = getSetupOption(key);
    const el1 = ids[1] && document.getElementById(ids[1]);
    if (el1) el1.checked = getMatchOption(key);
  });
  ['optTieRule', 'optTieRuleInGame'].forEach((id, i) => {
    const select = document.getElementById(id);
    if (!select) return;
    if (!select.options.length) select.innerHTML = TIE_RULE_KEYS.map(k => `<option value="${k}">${escapeHtml(TIE_RULES[k].label)}</option>`).join('');
    select.value = i === 0 ? (TIE_RULE_KEYS.includes(appSettings.tieRule) ? appSettings.tieRule : 'runoff') : getTieRule();
  });
  syncNarratorPrefs();
}

function onTieRuleChange(value) {
  if (!TIE_RULE_KEYS.includes(value)) return;
  appSettings.tieRule = value;
  saveSettingsToStorage();
  if (activeMatch) {
    activeMatch.tieRule = value;
    saveMatchToStorage();
    if (document.getElementById('modalVote').classList.contains('active')) renderVoteTally();
  }
  syncMatchOptionToggles();
}

/* ---------- Preferenze del Narratore: livello, voce, suoni ---------- */
function isExpertNarrator() {
  return appSettings.narratorLevel === 'expert';
}

function syncNarratorPrefs() {
  [['toggleVoice', 'voiceOn'], ['toggleVoiceInGame', 'voiceOn'], ['toggleSounds', 'soundsOn'], ['toggleSoundsInGame', 'soundsOn']].forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (el) el.checked = key === 'voiceOn' ? appSettings.voiceOn === true : appSettings.soundsOn !== false;
  });
  document.querySelectorAll('.level-choice').forEach(btn => {
    const active = btn.dataset.level === (isExpertNarrator() ? 'expert' : 'beginner');
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  document.getElementById('screenNarrator').classList.toggle('level-expert', isExpertNarrator());
}

function setNarratorLevel(level) {
  appSettings.narratorLevel = level === 'expert' ? 'expert' : 'beginner';
  saveSettingsToStorage();
  syncNarratorPrefs();
  vibrate('tap');
}

async function onNarratorPrefToggle(key, checked) {
  appSettings[key] = checked;
  saveSettingsToStorage();
  syncNarratorPrefs();
  if (key === 'soundsOn' && checked) playSound('bell');
  if (key === 'voiceOn') {
    if (!checked) {
      stopNarration();
      return;
    }
    const ok = await speakText('La voce del Narratore è attiva.');
    if (ok === false) voiceUnavailable();
  }
}

function onMatchOptionToggle(key, checked) {
  appSettings[key] = checked;
  saveSettingsToStorage();
  if (activeMatch) {
    activeMatch[key] = checked;
    if (key === 'autoResolve' && checked) activeMatch.victoryDismissed = false;
    if (key === 'surpriseEvents' && !checked) activeMatch.event = null;
    saveMatchToStorage();
    if (document.getElementById('screenNarrator').classList.contains('active')) {
      renderNarratorDashboard();
    }
  }
  syncMatchOptionToggles();
}

function switchSetupTab(tab) {
  appSettings.activeSetupTab = tab;
  saveSettingsToStorage();
  renderSetupTabs();
}

function autoSelectFirstPresetIfMatch() {
  const count = setupPlayers.length;
  const presets = PRESETS_BY_COUNT[count];
  if (presets && presets.length > 0 && appSettings.activeSetupTab === 'presets') {
    const currentTotal = getSelectedDeckTotal();
    if (currentTotal !== count) {
      selectPreset(presets[0].code);
    }
  }
}

function renderSetupTabs() {
  const isPresets = appSettings.activeSetupTab === 'presets';
  document.getElementById('tabBtnPresets').classList.toggle('active', isPresets);
  document.getElementById('tabBtnCustom').classList.toggle('active', !isPresets);
  document.getElementById('tabContentPresets').style.display = isPresets ? 'block' : 'none';
  document.getElementById('tabContentCustom').style.display = !isPresets ? 'block' : 'none';

  renderPresetsList();
  renderCustomRoleSelector();
}

function renderPresetsList() {
  const container = document.getElementById('presetsContainer');
  const count = setupPlayers.length;
  container.innerHTML = '';

  if (count < 5) {
    container.innerHTML = `<div style="padding: 16px; text-align: center; color: var(--text-muted); background: var(--bg-main); border-radius: var(--radius-sm); border: 1px dashed var(--border-light);">
      Inserisci almeno <strong>5 giocatori</strong> (attualmente ${count}) per visualizzare i Preset Consigliati.
    </div>`;
    return;
  }

  if (count > 15) {
    container.innerHTML = `<div style="padding: 16px; text-align: center; color: var(--text-muted); background: var(--bg-main); border-radius: var(--radius-sm); border: 1px dashed var(--border-light);">
      Hai inserito <strong>${count} giocatori</strong>. I preset automatici coprono da 5 a 15 giocatori: usa la tab <strong>"🎛️ Personalizza"</strong> per comporre il mazzo!
    </div>`;
    return;
  }

  const presets = PRESETS_BY_COUNT[count] || [];
  presets.forEach((preset, i) => {
    const isSelected = appSettings.selectedPresetCode === preset.code && isDeckEqualToPreset(preset.roles);
    const missingRoles = getPresetMissingRoles(preset);
    const roleStrings = Object.entries(preset.roles).map(([rId, qty]) => {
      const rObj = getRoleById(rId);
      return `<span class="badge">${escapeHtml(rObj.icon)} ${qty}x ${escapeHtml(rObj.name)}</span>`;
    }).join('');

    const item = document.createElement('div');
    item.className = 'preset-item' + (isSelected ? ' selected' : '') + (missingRoles.length ? ' preset-unavailable' : '');
    item.onclick = () => selectPreset(preset.code);
    item.innerHTML = `
      <div class="preset-header">
        <div class="preset-name">${isSelected ? '✅ ' : ''}${String.fromCharCode(65 + i)}. ${escapeHtml(preset.name)}</div>
        <span class="preset-turns">⏱️ ${preset.turns}</span>
      </div>
      ${preset.desc ? `<div class="preset-desc">${escapeHtml(preset.desc)}</div>` : ''}
      <div class="preset-roles">${roleStrings}</div>
      ${missingRoles.length ? `<div class="card-subtitle" style="color: var(--accent-warning);">⚠️ Usa ruoli che hai eliminato (${escapeHtml(missingRoles.join(', '))}). Ripristinali da "Gestisci i ruoli".</div>` : ''}
    `;
    container.appendChild(item);
  });
}

function getPresetMissingRoles(preset) {
  return Object.keys(preset.roles).filter(id => !findRoleOrNull(id));
}

function selectPreset(presetCode) {
  const count = setupPlayers.length;
  const presets = PRESETS_BY_COUNT[count] || [];
  const found = presets.find(p => p.code === presetCode);
  if (!found) return;
  if (getPresetMissingRoles(found).length) {
    showToast('Questo preset usa ruoli che hai eliminato: ripristina i ruoli base per usarlo.', 'warn');
    return;
  }

  appSettings.selectedPresetCode = found.code;
  appSettings.selectedDeck = { ...found.roles };
  saveSettingsToStorage();
  renderPresetsList();
  renderCustomRoleSelector();
  updateSetupDeckCounters();
}

function isDeckEqualToPreset(presetRoles) {
  const keysA = Object.keys(presetRoles).filter(k => presetRoles[k] > 0);
  const keysB = Object.keys(appSettings.selectedDeck).filter(k => appSettings.selectedDeck[k] > 0);
  if (keysA.length !== keysB.length) return false;
  return keysA.every(k => appSettings.selectedDeck[k] === presetRoles[k]);
}

function renderCustomRoleSelector() {
  const container = document.getElementById('customRoleSelectorList');
  container.innerHTML = '';

  rolesDB.forEach(role => {
    const qty = appSettings.selectedDeck[role.id] || 0;
    const step = role.isPair ? 2 : 1;
    const factionClass = getFactionBadgeClass(role.faction);

    const row = document.createElement('div');
    row.className = 'role-selector-item';
    row.innerHTML = `
      <div class="role-selector-info">
        <div class="role-selector-title">
          <span style="font-size: 1.3rem;">${escapeHtml(role.icon)}</span>
          <span>${escapeHtml(role.name)}</span>
          <span class="badge ${factionClass}">${escapeHtml(role.faction)}</span>
          ${role.isPair ? '<span class="badge">👥 Coppia (+2)</span>' : ''}
        </div>
        <div class="role-selector-sub">${escapeHtml(role.whatYouDo)}</div>
      </div>
      <div class="role-counter-controls">
        <button class="qty-btn" onclick="changeCustomRoleQty('${role.id}', -${step})" ${qty === 0 ? 'disabled' : ''}>−</button>
        <span class="qty-val">${qty}</span>
        <button class="qty-btn" onclick="changeCustomRoleQty('${role.id}', ${step})">+</button>
      </div>
    `;
    container.appendChild(row);
  });
}

function changeCustomRoleQty(roleId, delta) {
  const current = appSettings.selectedDeck[roleId] || 0;
  const next = Math.max(0, current + delta);
  if (next === 0) {
    delete appSettings.selectedDeck[roleId];
  } else {
    appSettings.selectedDeck[roleId] = next;
  }
  saveSettingsToStorage();
  renderCustomRoleSelector();
  renderPresetsList();
  updateSetupDeckCounters();
}

function clearCustomDeck() {
  appSettings.selectedDeck = {};
  appSettings.selectedPresetCode = null;
  saveSettingsToStorage();
  renderCustomRoleSelector();
  renderPresetsList();
  updateSetupDeckCounters();
}

function getSelectedDeckTotal() {
  return Object.values(appSettings.selectedDeck).reduce((acc, v) => acc + (Number(v) || 0), 0);
}

function updateSetupDeckCounters() {
  const playerCount = setupPlayers.length;
  const deckTotal = getSelectedDeckTotal();

  const badge = document.getElementById('deckMatchBadge');
  badge.textContent = `${deckTotal} / ${playerCount} ruoli`;

  // Motivi per cui non si può ancora distribuire (vedi getDeckProblems in rules.js)
  const isValid = getDeckProblems(appSettings.selectedDeck, playerCount, findRoleOrNull).length === 0;
  badge.className = playerCount < 5 ? 'badge' : isValid ? 'badge badge-villaggio' : 'badge badge-alleato';

  renderDeckBalance(deckTotal);
  renderSetupStepper();
}

/* ---------- Le tre tappe della preparazione: Giocatori → Mazzo → Opzioni ---------- */
let setupStep = 1;
const SETUP_STEP_COUNT = 3;

// Cosa manca per finire una tappa ('' = tutto a posto)
function setupStepProblem(step) {
  if (setupPlayers.length < 5) return `Servono almeno 5 giocatori (ora ${setupPlayers.length}).`;
  if (step >= 2) {
    const problems = getDeckProblems(appSettings.selectedDeck, setupPlayers.length, findRoleOrNull);
    if (problems.length) return problems[0];
  }
  return '';
}

function canReachSetupStep(step) {
  return step <= 1 || !setupStepProblem(step - 1);
}

function goSetupStep(step) {
  const target = Math.max(1, Math.min(SETUP_STEP_COUNT, step));
  if (!canReachSetupStep(target)) {
    showToast(setupStepProblem(target - 1), 'warn');
    return;
  }
  vibrate('tap');
  setupStep = target;
  renderSetupStepper();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function setupNext() {
  const problem = setupStepProblem(setupStep);
  if (problem) {
    showToast(problem, 'warn');
    return;
  }
  if (setupStep < SETUP_STEP_COUNT) goSetupStep(setupStep + 1);
  else startDistributionPhase();
}

function renderSetupStepper() {
  while (setupStep > 1 && !canReachSetupStep(setupStep)) setupStep--;
  for (let i = 1; i <= SETUP_STEP_COUNT; i++) {
    document.getElementById(`setupPane${i}`).style.display = i === setupStep ? 'flex' : 'none';
  }
  document.querySelectorAll('#setupStepper .setup-step').forEach(btn => {
    const step = Number(btn.dataset.step);
    btn.classList.toggle('current', step === setupStep);
    btn.classList.toggle('done', step < setupStep);
    btn.disabled = step !== setupStep && !canReachSetupStep(step);
    if (step === setupStep) btn.setAttribute('aria-current', 'step');
    else btn.removeAttribute('aria-current');
  });

  const playerCount = setupPlayers.length;
  const problem = setupStepProblem(setupStep);
  const labels = ['Avanti: il mazzo →', 'Avanti: le opzioni →', '🎲 Distribuisci i ruoli'];
  const status = [
    `👥 ${playerCount} ${playerCount === 1 ? 'giocatore' : 'giocatori'}`,
    `🃏 ${getSelectedDeckTotal()} / ${playerCount} ruoli`,
    isAutoPlayMode() ? '🤝 Senza Narratore' : '📖 Con il Narratore'
  ];
  document.getElementById('stickyStepLabel').textContent = `Tappa ${setupStep} di ${SETUP_STEP_COUNT}`;
  const statusEl = document.getElementById('stickyDeckStatus');
  statusEl.textContent = status[setupStep - 1];
  statusEl.style.color = problem ? 'var(--accent-warning)' : 'var(--accent-success)';
  const next = document.getElementById('btnSetupNext');
  next.textContent = labels[setupStep - 1];
  next.disabled = !!problem;
  const problemEl = document.getElementById('stickyDeckProblem');
  problemEl.textContent = problem;
  problemEl.style.display = problem ? 'block' : 'none';
}

/* ---------- Con o senza Narratore ---------- */
function isAutoPlayMode() {
  return appSettings.playMode === 'auto';
}

function setPlayMode(mode) {
  appSettings.playMode = mode === 'auto' ? 'auto' : 'narrator';
  saveSettingsToStorage();
  vibrate('tap');
  syncPlayModeUI();
  renderSetupStepper();
}

function syncPlayModeUI() {
  const auto = isAutoPlayMode();
  document.querySelectorAll('.mode-choice').forEach(btn => {
    const active = btn.dataset.mode === (auto ? 'auto' : 'narrator');
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  document.getElementById('setupPane3').classList.toggle('play-auto', auto);
}

/* ---------- Benvenuto al primo avvio ---------- */
let welcomeSlide = 0;

function openWelcome() {
  closeInfoModal();
  welcomeSlide = 0;
  renderWelcome();
  document.getElementById('modalWelcome').classList.add('active');
}

function renderWelcome() {
  document.querySelectorAll('#modalWelcome .welcome-slide').forEach((el, i) => { el.style.display = i === welcomeSlide ? 'flex' : 'none'; });
  document.querySelectorAll('#modalWelcome .welcome-dots span').forEach((el, i) => el.classList.toggle('active', i === welcomeSlide));
  const last = welcomeSlide === 2;
  document.getElementById('btnWelcomeNext').textContent = last ? 'Iniziamo! 🐺' : 'Avanti →';
  document.getElementById('btnWelcomeSkip').style.visibility = last ? 'hidden' : 'visible';
}

function welcomeNext() {
  vibrate('tap');
  if (welcomeSlide >= 2) {
    closeWelcome();
    return;
  }
  welcomeSlide++;
  renderWelcome();
}

function closeWelcome() {
  document.getElementById('modalWelcome').classList.remove('active');
}

// Equilibrio del mazzo: bilancia tra lupi (sinistra) e villaggio (destra), con un consiglio
function renderDeckBalance(deckTotal) {
  const box = document.getElementById('deckBalance');
  if (!deckTotal) {
    box.style.display = 'none';
    return;
  }
  const balance = deckBalance(appSettings.selectedDeck, findRoleOrNull);
  const hints = {
    'wolves-strong': 'Per pareggiare aggiungi ruoli buoni con un potere (es. Veggente, Guardia) o togli qualche aiutante dei lupi.',
    wolves: 'Per pareggiare aggiungi un ruolo buono con un potere (es. Guardia) o togli un aiutante dei lupi.',
    balanced: 'Le due squadre partono alla pari.',
    village: 'Per pareggiare aggiungi un aiutante dei lupi (es. Indemoniato) o togli un potere al villaggio.',
    'village-strong': 'Per pareggiare aggiungi un lupo o un aiutante dei lupi (es. Gufo, Indemoniato) o togli qualche potere al villaggio.'
  };
  box.style.display = 'flex';
  document.getElementById('deckBalanceLabel').textContent = `${balance.icon} ${balance.label}`;
  document.getElementById('deckBalanceMarker').style.left = `${Math.round(balance.position * 100)}%`;
  document.getElementById('deckBalanceHint').textContent = hints[balance.level];
}

// Classe con il colore della fazione (striscia dei giocatori, cornice della carta ruolo)
function getFactionClass(faction) {
  if (faction === 'Villaggio') return 'faction-villaggio';
  if (faction === 'Branco') return 'faction-branco';
  if (faction === 'Alleato dei Lupi') return 'faction-alleato';
  return 'faction-solitario';
}

function getFactionBadgeClass(faction) {
  if (faction === 'Villaggio') return 'badge-villaggio';
  if (faction === 'Branco') return 'badge-branco';
  if (faction === 'Alleato dei Lupi') return 'badge-alleato';
  return 'badge-solitario';
}

/* =========================================================================
   7. EDITOR DEI RUOLI ("🛠️ GESTISCI / CREA RUOLI")
========================================================================= */
function openRoleEditorScreen() {
  renderEditorRolesList();
  showScreen('screenRoleEditor');
}

function closeRoleEditorScreen() {
  renderSetupScreen();
  showScreen('screenSetup');
}

function renderEditorRolesList() {
  renderNightOrderList();
  document.getElementById('editorRolesCount').textContent = rolesDB.length;
  const container = document.getElementById('editorRolesList');
  container.innerHTML = '';

  rolesDB.forEach(role => {
    const factionClass = getFactionBadgeClass(role.faction);
    const wake = WAKE_TIMING_LABELS[role.wakeTiming] || WAKE_TIMING_LABELS.mai;
    const abilities = roleAbilityNotes(role);

    const item = document.createElement('div');
    item.className = 'card';
    item.style.padding = '12px';
    item.innerHTML = `
      <div class="card-header">
        <div class="role-selector-title">
          <span style="font-size: 1.4rem;">${escapeHtml(role.icon)}</span>
          <strong>${escapeHtml(role.name)}</strong>
          <span class="badge ${factionClass}">${escapeHtml(role.faction)}</span>
          ${role.isPair ? '<span class="badge">👥 Coppia</span>' : ''}
        </div>
        <div style="display: flex; gap: 6px;">
          <button class="icon-btn" onclick="openRoleFormModal('${role.id}')" title="Modifica" aria-label="Modifica ${escapeHtml(role.name)}">✏️</button>
          <button class="icon-btn" style="color: var(--accent-danger);" onclick="confirmDeleteRole('${role.id}')" title="Elimina" aria-label="Elimina ${escapeHtml(role.name)}">🗑️</button>
        </div>
      </div>
      <div style="font-size: 0.85rem; color: var(--text-main);">
        <strong>Cosa fai:</strong> ${escapeHtml(role.whatYouDo)}<br>
        <strong>Come vinci:</strong> ${escapeHtml(role.howYouWin)}
      </div>
      <div style="font-size: 0.78rem; color: var(--text-muted); display: flex; gap: 10px; flex-wrap: wrap;">
        <span>🌙 Risveglio: <strong>${escapeHtml(wake.short)}</strong></span>
        ${role.wakeTiming !== 'mai' ? `<span>🧭 Di notte: <strong>${escapeHtml(NIGHT_ACTIONS[roleNightAction(role)].short)}</strong></span>` : ''}
        ${abilities.length ? `<span>✨ <strong>${escapeHtml(abilities.join(', '))}</strong></span>` : ''}
      </div>
    `;
    container.appendChild(item);
  });
}

/* ---------- Ordine di chiamata della notte (trascina ☰ oppure ▲▼) ---------- */
let nightOrderDrag = null;

function renderNightOrderList() {
  const list = document.getElementById('nightOrderList');
  const roles = getNightOrderRoles(rolesDB);
  if (!roles.length) {
    list.innerHTML = '<li class="card-subtitle">Nessun ruolo si sveglia di notte.</li>';
    return;
  }
  list.innerHTML = roles.map((r, i) => `
    <li class="night-order-item" data-id="${escapeHtml(r.id)}">
      <span class="drag-handle" onpointerdown="startNightOrderDrag(event)" title="Tieni premuto e trascina" aria-hidden="true">☰</span>
      <span class="night-order-num">${i + 1}</span>
      <span class="night-order-text">
        <span class="night-order-name">${escapeHtml(r.icon)} ${escapeHtml(r.name)}</span>
        <span class="night-order-when">${escapeHtml((WAKE_TIMING_LABELS[r.wakeTiming] || WAKE_TIMING_LABELS.mai).short)}</span>
      </span>
      <span class="order-btns">
        <button class="order-btn" onclick="moveNightOrder('${r.id}', -1)" ${i === 0 ? 'disabled' : ''} aria-label="Chiama prima ${escapeHtml(r.name)}">▲</button>
        <button class="order-btn" onclick="moveNightOrder('${r.id}', 1)" ${i === roles.length - 1 ? 'disabled' : ''} aria-label="Chiama dopo ${escapeHtml(r.name)}">▼</button>
      </span>
    </li>`).join('');
}

function getNightOrderDomIds() {
  return Array.from(document.querySelectorAll('#nightOrderList .night-order-item')).map(li => li.dataset.id);
}

function renumberNightOrderDom() {
  document.querySelectorAll('#nightOrderList .night-order-item').forEach((li, i) => {
    li.querySelector('.night-order-num').textContent = i + 1;
  });
}

function startNightOrderDrag(e) {
  const handle = e.currentTarget;
  const item = handle.closest('.night-order-item');
  if (!item || nightOrderDrag) return;
  e.preventDefault();
  try { handle.setPointerCapture(e.pointerId); } catch (err) {}
  item.classList.add('dragging');
  vibrate('tap');
  nightOrderDrag = { item, handle, startIds: getNightOrderDomIds() };
  handle.addEventListener('pointermove', onNightOrderDragMove);
  handle.addEventListener('pointerup', endNightOrderDrag);
  handle.addEventListener('pointercancel', endNightOrderDrag);
  handle.addEventListener('lostpointercapture', endNightOrderDrag);
}

function onNightOrderDragMove(e) {
  if (!nightOrderDrag) return;
  const { item } = nightOrderDrag;
  const list = item.parentElement;
  const y = e.clientY;
  const others = Array.from(list.querySelectorAll('.night-order-item')).filter(li => li !== item);
  const before = others.find(li => {
    const box = li.getBoundingClientRect();
    return y < box.top + box.height / 2;
  }) || null;
  // Si spostano le altre righe e non quella trascinata: toglierla dalla pagina interromperebbe il trascinamento
  let moved = false;
  if (before && (item.compareDocumentPosition(before) & Node.DOCUMENT_POSITION_PRECEDING)) {
    while (item.compareDocumentPosition(before) & Node.DOCUMENT_POSITION_PRECEDING) {
      item.after(item.previousElementSibling);
      moved = true;
    }
  } else {
    while (item.nextElementSibling && item.nextElementSibling !== before) {
      item.before(item.nextElementSibling);
      moved = true;
    }
  }
  if (moved) renumberNightOrderDom();
  // vicino ai bordi dello schermo la pagina scorre da sola
  if (y < 90) window.scrollBy(0, -10);
  else if (y > window.innerHeight - 90) window.scrollBy(0, 10);
}

function endNightOrderDrag(e) {
  if (!nightOrderDrag) return;
  const { item, handle, startIds } = nightOrderDrag;
  handle.removeEventListener('pointermove', onNightOrderDragMove);
  handle.removeEventListener('pointerup', endNightOrderDrag);
  handle.removeEventListener('pointercancel', endNightOrderDrag);
  handle.removeEventListener('lostpointercapture', endNightOrderDrag);
  try { handle.releasePointerCapture(e.pointerId); } catch (err) {}
  item.classList.remove('dragging');
  nightOrderDrag = null;
  const ids = getNightOrderDomIds();
  if (ids.join('|') !== startIds.join('|')) commitNightOrder(ids);
}

function moveNightOrder(roleId, delta) {
  const ids = getNightOrderRoles(rolesDB).map(r => r.id);
  const from = ids.indexOf(roleId);
  const to = from + delta;
  if (from === -1 || to < 0 || to >= ids.length) return;
  [ids[from], ids[to]] = [ids[to], ids[from]];
  vibrate('tap');
  commitNightOrder(ids);
}

function commitNightOrder(ids) {
  doWithUndo('🌙 Ordine di chiamata aggiornato', () => {
    rolesDB = applyNightOrder(rolesDB, ids);
    saveRolesToStorage();
    renderEditorRolesList();
    if (activeMatch && document.getElementById('screenNarrator').classList.contains('active')) renderNarratorDashboard();
  });
}

/* ---------- Finestra "Crea / Modifica ruolo" ---------- */
function fillSelectOptions(id, entries) {
  document.getElementById(id).innerHTML = entries.map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join('');
}

function openRoleFormModal(roleId) {
  const isEdit = !!roleId;
  document.getElementById('roleFormTitle').textContent = isEdit ? '✏️ Modifica Ruolo' : '➕ Crea Nuovo Ruolo';
  fillSelectOptions('rfWake', VALID_WAKE_TIMINGS.map(k => [k, WAKE_TIMING_LABELS[k].short]));
  fillSelectOptions('rfDeathAction', DEATH_ACTION_KEYS.map(k => [k, DEATH_ACTIONS[k].label]));
  fillSelectOptions('rfVictory', VICTORY_KEYS.map(k => [k, VICTORY_TYPES[k].label]));
  document.getElementById('rfTraits').innerHTML = TRAIT_KEYS.map(k =>
    `<label class="check-row"><input type="checkbox" id="rfTrait_${k}"> ${escapeHtml(TRAIT_LABELS[k])}</label>`).join('');

  const r = isEdit ? getRoleById(roleId) : {
    id: '', icon: '🧙‍♀️', name: '', faction: 'Villaggio', whatYouDo: '', howYouWin: 'Vinci col villaggio.',
    wakeTiming: 'ogni_notte', narratorPhrase: '', narratorNote: '', isPair: false,
    nightAction: 'none', actionRules: { notSelf: true }, wakesWithWolves: false, deathAction: 'none', victory: 'faction', traits: {}, markText: ''
  };
  document.getElementById('rfId').value = r.id;
  document.getElementById('rfIcon').value = r.icon;
  document.getElementById('rfName').value = r.name;
  document.getElementById('rfFaction').value = r.faction;
  document.getElementById('rfWhat').value = r.whatYouDo;
  document.getElementById('rfWin').value = r.howYouWin;
  document.getElementById('rfWake').value = VALID_WAKE_TIMINGS.includes(r.wakeTiming) ? r.wakeTiming : 'mai';
  document.getElementById('rfNarratorPhrase').value = r.narratorPhrase || '';
  document.getElementById('rfNarratorNote').value = r.narratorNote || '';
  document.getElementById('rfIsPair').checked = !!r.isPair;
  document.getElementById('rfWakesWithWolves').checked = roleWakesWithWolves(r);
  document.getElementById('rfDeathAction').value = roleDeathAction(r);
  document.getElementById('rfVictory').value = roleVictory(r);
  const traits = roleTraits(r);
  TRAIT_KEYS.forEach(k => { document.getElementById(`rfTrait_${k}`).checked = !!traits[k]; });
  document.getElementById('rfMarkText').value = roleNightAction(r) === 'mark' ? roleMarkText(r) : '';
  // Le regole avanzate si aprono da sole se il ruolo ne usa qualcuna
  document.getElementById('rfAdvanced').open = roleWakesWithWolves(r) || roleDeathAction(r) !== 'none' || roleVictory(r) !== 'faction' || TRAIT_KEYS.some(k => traits[k]);
  fillRoleFormAction(roleNightAction(r), roleActionRules(r));

  document.getElementById('modalRoleForm').classList.add('active');
  document.querySelector('#modalRoleForm .modal-box').scrollTop = 0;
}

// Menu "Cosa fa di notte" con tutte le azioni che la guida sa gestire
function fillRoleFormAction(action, rules) {
  fillSelectOptions('rfNightAction', NIGHT_ACTION_KEYS.map(k => [k, NIGHT_ACTIONS[k].label]));
  document.getElementById('rfNightAction').value = action;
  ACTION_RULE_KEYS.forEach(k => { document.getElementById(`rfRule_${k}`).checked = !!rules[k]; });
  updateRoleFormActionUI();
}

function onRoleFormActionChange() {
  // Un ruolo con un'azione notturna deve svegliarsi: se era "Mai", passa a "Ogni notte"
  const wake = document.getElementById('rfWake');
  if (document.getElementById('rfNightAction').value !== 'none' && wake.value === 'mai') wake.value = 'ogni_notte';
  const markField = document.getElementById('rfMarkText');
  if (document.getElementById('rfNightAction').value === 'mark' && !markField.value.trim()) markField.value = roleMarkText({});
  updateRoleFormActionUI();
}

function onRoleFormWakeChange() {
  updateRoleFormActionUI();
}

function updateRoleFormActionUI() {
  const action = document.getElementById('rfNightAction').value;
  const sleeps = document.getElementById('rfWake').value === 'mai';
  const hints = {
    none: 'La guida lo chiama con la sua frase, senza scegliere nessuno.',
    wolves: 'Si sveglia insieme ai Lupi Mannari: nella guida è nello stesso passo dei lupi.',
    kill: 'Il giocatore scelto muore all\'alba, a meno che qualcuno lo protegga.',
    protect: 'Il giocatore scelto non muore stanotte (né per i lupi né per altri).',
    investigate: 'La guida ti dice se fare SÌ (è un lupo) o NO con la testa.',
    medium: 'La guida ti dice se il bruciato di ieri era un lupo.',
    mark: 'Al mattino la guida ti fa leggere la frase qui sotto sul giocatore scelto.',
    copy: 'Se copia un lupo o chi indaga diventa quel ruolo, altrimenti diventa Contadino.',
    witch: 'Vede la vittima dei lupi: può salvarla una volta e uccidere una volta in tutta la partita.',
    note: 'La scelta viene solo annotata (la ritrovi nel riepilogo).'
  };
  document.getElementById('rfActionHint').textContent = sleeps
    ? 'Questo ruolo non si sveglia da solo: la guida non lo chiama (può comunque svegliarsi con i Lupi, nelle regole avanzate).'
    : (hints[action] || '');
  const hasTarget = !sleeps && NIGHT_ACTIONS[action] && NIGHT_ACTIONS[action].target;
  document.getElementById('rfRulesBox').style.display = hasTarget ? 'flex' : 'none';
  // la Strega ha già le sue pozioni "una volta sola": la regola non serve
  document.getElementById('rfRuleRow_oncePerGame').style.display = action === 'witch' ? 'none' : '';
  document.getElementById('rfMarkTextBox').style.display = !sleeps && action === 'mark' ? 'flex' : 'none';
}

function closeRoleFormModal() {
  document.getElementById('modalRoleForm').classList.remove('active');
}

function saveRoleFromForm() {
  const idVal = document.getElementById('rfId').value.trim();
  const icon = firstSymbol(document.getElementById('rfIcon').value.trim()) || '🎭';
  const name = document.getElementById('rfName').value.trim();
  const faction = document.getElementById('rfFaction').value;
  const whatYouDo = document.getElementById('rfWhat').value.trim();
  const howYouWin = document.getElementById('rfWin').value.trim();
  const wakeTiming = document.getElementById('rfWake').value;
  const narratorPhrase = document.getElementById('rfNarratorPhrase').value.trim();
  const narratorNote = document.getElementById('rfNarratorNote').value.trim();
  const isPair = document.getElementById('rfIsPair').checked;
  const nightAction = document.getElementById('rfNightAction').value;
  const actionRules = {};
  ACTION_RULE_KEYS.forEach(k => { actionRules[k] = document.getElementById(`rfRule_${k}`).checked; });
  if (nightAction === 'witch') actionRules.oncePerGame = false;
  const traits = {};
  TRAIT_KEYS.forEach(k => { traits[k] = document.getElementById(`rfTrait_${k}`).checked; });
  const capabilities = {
    nightAction,
    actionRules,
    wakesWithWolves: document.getElementById('rfWakesWithWolves').checked,
    deathAction: document.getElementById('rfDeathAction').value,
    victory: document.getElementById('rfVictory').value,
    traits,
    markText: nightAction === 'mark' ? document.getElementById('rfMarkText').value.trim() : ''
  };
  if (nightAction === 'mark' && !capabilities.markText.includes('{nome}')) {
    showToast('Nella frase del mattino scrivi {nome} dove va il nome del giocatore scelto.', 'warn');
    return;
  }

  if (!name || !whatYouDo || !howYouWin) {
    showToast('Compila Nome, "Cosa fai" e "Come vinci"!', 'warn');
    return;
  }

  if (rolesDB.some(r => r.id !== idVal && r.name.trim().toLowerCase() === name.toLowerCase())) {
    showToast(`Esiste già un ruolo chiamato "${name}".`, 'warn');
    return;
  }

  // Ordine di chiamata: un ruolo che inizia a svegliarsi va in fondo alla notte (poi si sposta trascinandolo)
  const lastPriority = () => Math.min(MAX_PRIORITY, Math.max(0, ...getNightOrderRoles(rolesDB).map(r => Number(r.priority) || 0)) + 1);
  if (idVal) {
    const idx = rolesDB.findIndex(r => r.id === idVal);
    if (idx !== -1) {
      const old = rolesDB[idx];
      const priority = old.wakeTiming === 'mai' && wakeTiming !== 'mai' ? lastPriority() : old.priority;
      rolesDB[idx] = { id: idVal, name, icon, faction, whatYouDo, howYouWin, wakeTiming, priority, narratorPhrase, narratorNote, isPair, ...capabilities };
    }
  } else {
    const newId = 'custom_' + Date.now();
    const priority = wakeTiming === 'mai' ? 10 : lastPriority();
    rolesDB.push({ id: newId, name, icon, faction, whatYouDo, howYouWin, wakeTiming, priority, narratorPhrase, narratorNote, isPair, ...capabilities });
  }

  saveRolesToStorage();
  closeRoleFormModal();
  renderEditorRolesList();
  showToast('Ruolo salvato con successo!');
}

// Prima emoji (o primo carattere) del testo: le emoji composte come 🧑‍🌾 restano intere.
function firstSymbol(text) {
  if (!text) return '';
  try {
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
      const seg = new Intl.Segmenter('it', { granularity: 'grapheme' });
      for (const part of seg.segment(text)) return part.segment;
    }
  } catch (e) {}
  return Array.from(text).slice(0, 2).join('');
}

function confirmDeleteRole(roleId) {
  const r = getRoleById(roleId);
  doWithUndo(`🗑️ Ruolo "${r.name}" eliminato`, () => {
    rolesDB = rolesDB.filter(item => item.id !== roleId);
    saveRolesToStorage();
    pruneDeckOfMissingRoles();
    saveSettingsToStorage();
    renderEditorRolesList();
  });
}

function confirmResetDefaultRoles() {
  doWithUndo('🔄 Ripristinati i ruoli base', () => {
    rolesDB = JSON.parse(JSON.stringify(DEFAULT_ROLES));
    appSettings.knownDefaultRoleIds = DEFAULT_ROLES.map(r => r.id);
    saveSettingsToStorage();
    saveRolesToStorage();
    pruneDeckOfMissingRoles();
    renderEditorRolesList();
  });
}

/* =========================================================================
   8. SCHERMATA 2: DISTRIBUZIONE RUOLI ("PASSA IL TELEFONO")
========================================================================= */
function buildShuffledDeckArray(deckMap) {
  const deck = [];
  for (const [roleId, count] of Object.entries(deckMap)) {
    for (let i = 0; i < count; i++) {
      deck.push(roleId);
    }
  }
  // Fisher-Yates shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function startDistributionPhase() {
  const problems = getDeckProblems(appSettings.selectedDeck, setupPlayers.length, findRoleOrNull);
  if (problems.length) {
    showToast(problems[0], 'warn');
    return false;
  }
  const deckArray = buildShuffledDeckArray(appSettings.selectedDeck);
  if (deckArray.length !== setupPlayers.length) {
    showToast('Il numero di ruoli non coincide coi giocatori!', 'warn');
    return false;
  }
  stopDayTimer();
  dayTimerSeconds = getTimerDuration();
  saveKnownPlayers(rememberPlayerNames(loadKnownPlayers(), setupPlayers, Date.now()));

  activeMatch = {
    status: 'distributing',
    distIndex: 0,
    turn: 1,
    phase: 'night', // 'night' | 'day'
    ghostRule: appSettings.ghostRule !== false,
    autoResolve: isAutoPlayMode() || appSettings.autoResolve !== false,
    enforceRules: appSettings.enforceRules !== false,
    mode: isAutoPlayMode() ? 'auto' : 'narrator', // senza Narratore: il telefono passa di mano in mano
    pass: null,             // notte senza Narratore: a chi tocca e mosse segrete
    tieRule: TIE_RULE_KEYS.includes(appSettings.tieRule) ? appSettings.tieRule : 'runoff',
    revealDead: getSetupOption('revealDead'),
    deckAnnounced: getSetupOption('deckAnnounced'),
    surpriseEvents: getSetupOption('surpriseEvents'),
    event: null,            // evento a sorpresa della notte { turn, id }
    usedPowers: {},
    pendingDeathActions: [],
    initialDeckMap: { ...appSettings.selectedDeck },
    victoryDismissed: false,
    guideKey: 'intro',      // passo attuale della modalità guidata
    nightChoices: {},       // scelte di stanotte { chiavePasso: idGiocatore }
    prevNightChoices: {},   // scelte della notte scorsa (regola "non due notti di fila")
    lastNightResult: null,  // esito dell'ultima notte (per l'annuncio del mattino)
    nightLogs: [],
    players: setupPlayers.map((name, idx) => ({
      id: 'p_' + idx,
      name: name,
      roleId: deckArray[idx],
      originalRoleId: deckArray[idx],
      isDead: false,
      isGhost: false,
      extraPin: false,
      deathCause: null, // 'notte' | 'rogo' | 'altro'
      diedOnTurn: null
    }))
  };

  saveMatchToStorage();
  renderDistributionStep();
  showScreen('screenDistribution');
  return true;
}

function renderDistributionStep() {
  const total = activeMatch.players.length;
  const idx = activeMatch.distIndex;

  const coverEl = document.getElementById('distStepCover');
  const completeEl = document.getElementById('distStepComplete');
  document.getElementById('distStepReveal').classList.remove('visible');
  distRoleSeen = false;

  if (idx >= total) {
    coverEl.style.display = 'none';
    completeEl.style.display = 'flex';
    return;
  }

  const player = activeMatch.players[idx];
  coverEl.style.display = 'flex';
  completeEl.style.display = 'none';

  document.getElementById('distProgressBadge').textContent = `Giocatore ${idx + 1} di ${total}`;
  document.getElementById('distPlayerNameCover').textContent = player.name;
  setAvatar('distCoverAvatar', player);
  document.getElementById('btnRevealRole').textContent = `👆 ${player.name}, tieni premuto qui per vedere il tuo ruolo`;
  updateDistNextButton();
}

function nextDistributionPlayer() {
  if (!distRoleSeen) return;
  activeMatch.distIndex++;
  saveMatchToStorage();
  renderDistributionStep();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function beginNarratorMatch() {
  lastNarratedKey = null;
  activeMatch.status = 'playing';
  activeMatch.turn = 1;
  activeMatch.phase = 'night';
  saveMatchToStorage();
  renderNarratorDashboard();
  showScreen('screenNarrator');
}

function resumeSavedMatch() {
  if (!activeMatch) return;
  if (activeMatch.status === 'distributing') {
    renderDistributionStep();
    showScreen('screenDistribution');
  } else {
    syncNarrationKey();
    renderNarratorDashboard();
    showScreen('screenNarrator');
  }
}

function confirmClearSavedMatch() {
  doWithUndo('🗑️ Partita salvata cancellata', () => {
    activeMatch = null;
    saveMatchToStorage();
    renderSetupScreen();
  });
}

/* =========================================================================
   9. SCHERMATA 3: CRUSCOTTO DEL NARRATORE (NOTTE, GIORNO, VITTORIA)
========================================================================= */
function renderNarratorDashboard() {
  if (!activeMatch) return;

  const isNight = activeMatch.phase === 'night';
  const turn = activeMatch.turn;

  // Aggiorna titolo e badge fase
  document.getElementById('headerTitle').textContent = isNight ? `🌙 Notte ${turn}` : `☀️ Giorno ${turn}`;

  // Il cielo della barra di fase mostra la luna di notte e l'alba di giorno
  document.querySelector('.narrator-stats-bar').classList.toggle('is-day', !isNight);
  const phaseBadge = document.getElementById('narratorPhaseBadge');
  phaseBadge.textContent = isNight ? `Notte ${turn}` : `Giorno ${turn}`;
  phaseBadge.className = 'phase-badge ' + (isNight ? 'phase-night' : 'phase-day');

  // Pulsante ↩️ in alto: attivo solo se c'è una fase precedente a cui tornare
  const undoBtn = document.getElementById('btnUndoTop');
  undoBtn.disabled = !activeMatch.undo;
  undoBtn.title = activeMatch.undo ? `Torna a: ${getPhaseLabel(activeMatch.undo)}` : 'Nessuna fase precedente';

  // Contatori vivi: Lupi (Branco) vs Altri
  const { aliveWolves, aliveOthers } = getAliveCounts();
  document.getElementById('countAliveWolves').textContent = aliveWolves;
  document.getElementById('countAliveOthers').textContent = aliveOthers;

  // Controllo Banner Vittoria
  renderVictoryBanner();

  // Senza Narratore: niente scheda Giocatori né contatori (svelerebbero i ruoli)
  document.getElementById('screenNarrator').classList.toggle('mode-auto', isAutoMatch());
  document.getElementById('modalGameMenu').classList.toggle('play-auto', isAutoMatch());

  // Modalità guidata (passo attuale) e scheda Giocatori per le correzioni
  renderNarratorGuide();
  renderNarratorPlayersList();
  document.getElementById('narratorPlayersCount').textContent = activeMatch.players.length;
  applyNarratorTab();
  renderTableView();
}

function getAliveCounts() {
  let aliveWolves = 0;
  let aliveOthers = 0;
  activeMatch.players.forEach(p => {
    if (!p.isDead) {
      const role = getRoleById(p.roleId);
      if (role.faction === 'Branco') {
        aliveWolves++;
      } else {
        aliveOthers++;
      }
    }
  });
  return { aliveWolves, aliveOthers };
}

function evaluateVictoryCondition() {
  if (!activeMatch || !isAutoResolve()) return null;
  // Prima si risolvono i colpi di chi muore (es. il Cacciatore), poi si controlla la vittoria.
  if ((activeMatch.pendingDeathActions || []).length) return null;
  // Regole in rules.js: vittorie solitarie (rogo, ultimo vivo, sopravvissuto), lupi finiti, parità dei lupi.
  return evaluateVictory(activeMatch.players, findRoleOrNull);
}

let lastVictoryText = null;

function renderVictoryBanner() {
  const banner = document.getElementById('victoryBanner');
  const winInfo = evaluateVictoryCondition();

  if (winInfo && !activeMatch.victoryDismissed) {
    if (lastVictoryText !== winInfo.text) {
      vibrate('victory');
      playSound('victory');
    }
    lastVictoryText = winInfo.text;
    banner.style.display = 'flex';
    banner.className = 'victory-banner ' + (winInfo.type === 'wolves' ? 'wolves' : winInfo.type === 'solo' ? 'solo' : '');
    document.getElementById('victoryBannerText').textContent = winInfo.text;
  } else {
    if (!winInfo) lastVictoryText = null;
    banner.style.display = 'none';
  }
}

function dismissVictoryBanner() {
  if (!activeMatch) return;
  activeMatch.victoryDismissed = true;
  saveMatchToStorage();
  document.getElementById('victoryBanner').style.display = 'none';
}

// Copia della fase attuale, per poter tornare indietro se un cambio di fase è stato fatto per sbaglio.
// Si tengono le ultime fasi (UNDO_MAX_STEPS), così ↩️ si può premere più volte di fila.
function pushUndoSnapshot() {
  const snapshot = JSON.parse(JSON.stringify(activeMatch));
  trimUndoChain(snapshot, UNDO_MAX_STEPS - 1);
  activeMatch.undo = snapshot;
}

const UNDO_MAX_STEPS = 6;

function trimUndoChain(match, keep) {
  let node = match;
  for (let i = 0; i < keep && node && node.undo; i++) node = node.undo;
  if (node) delete node.undo;
}

function getPhaseLabel(match) {
  return match.phase === 'night' ? `🌙 Notte ${match.turn}` : `☀️ Giorno ${match.turn}`;
}

function undoPhaseChange() {
  if (!activeMatch || !activeMatch.undo) return;
  const previous = activeMatch.undo;
  doWithUndo(`↩️ Sei tornato a: ${getPhaseLabel(previous)}`, () => {
    stopDayTimer();
    activeMatch = previous;
    syncNarrationKey();
    saveMatchToStorage();
    renderNarratorDashboard();
  });
}

/* =========================================================================
   10. MODALITÀ GUIDATA DEL NARRATORE
   Un passo alla volta: frase da leggere, scelta del giocatore, Avanti.
   Le scelte della notte sono in activeMatch.nightChoices ({ chiavePasso: idGiocatore });
   all'alba resolveNight (rules.js) calcola morti, protezioni, segni e copie.
========================================================================= */
const DAY_PLAN_KINDS = ['morning', 'debate', 'vote', 'dusk'];
let narratorTab = 'guide';
let emptyCallTimer = null; // { key, endsAt, interval, done }

function isAutoResolve() {
  return !!activeMatch && (activeMatch.autoResolve !== false || activeMatch.mode === 'auto');
}

function isRulesEnforced() {
  return !!activeMatch && activeMatch.enforceRules !== false;
}

// Piano della notte in corso (tiene conto dei poteri già usati, come le pozioni della Strega)
function currentNightPlan() {
  return buildNightPlan(activeMatch.players, rolesDB, activeMatch.turn, activeMatch.usedPowers || {}, currentNightEffects());
}

function getGuidePlan() {
  if (activeMatch.phase === 'night') return currentNightPlan();
  return DAY_PLAN_KINDS.map(kind => ({ key: kind, kind, roleIds: [], holders: [], aliveHolders: [], emptyCall: false }));
}

function getGuideIndex(plan) {
  const idx = plan.findIndex(st => st.key === activeMatch.guideKey);
  return idx === -1 ? 0 : idx;
}

function getStepRoles(step) {
  return step.roleIds.map(id => getRoleById(id));
}

function getStepTitle(step) {
  const titles = {
    intro: '🌙 Cala la notte',
    dawn: '🌅 Fine della notte',
    morning: '🌅 Il villaggio si sveglia',
    debate: '💬 Dibattito',
    vote: '🗳️ Votazione al rogo',
    dusk: '🌇 Fine del giorno'
  };
  if (titles[step.kind]) return titles[step.kind];
  if (step.kind === 'wolves') return '🐺 Lupi Mannari';
  const role = getStepRoles(step)[0];
  return `${role.icon} ${role.name}`;
}

function getStepChipLabel(step) {
  const labels = { intro: 'Notte', dawn: 'Alba', morning: 'Mattino', debate: 'Dibattito', vote: 'Voto', dusk: 'Sera', wolves: 'Lupi' };
  if (labels[step.kind] && step.kind !== 'wolves') return labels[step.kind];
  if (step.kind === 'wolves') return '🐺 Lupi';
  const role = getStepRoles(step)[0];
  return `${role.icon} ${role.name}`;
}

function guideGo(delta) {
  const plan = getGuidePlan();
  const current = getGuideIndex(plan);
  const idx = Math.min(plan.length - 1, Math.max(0, current + delta));
  if (delta > 0) prepareStepClose(plan[current]);
  setGuideStep(plan[idx].key);
}

function guideJump(key) {
  setGuideStep(key);
}

function setGuideStep(key) {
  vibrate('tap');
  activeMatch.guideKey = key;
  saveMatchToStorage();
  renderNarratorGuide();
  const panel = document.getElementById('narratorGuidePanel');
  if (panel && panel.getBoundingClientRect().top < 60) {
    window.scrollTo({ top: window.scrollY + panel.getBoundingClientRect().top - 70, behavior: 'smooth' });
  }
}

function switchNarratorTab(tab) {
  narratorTab = tab;
  applyNarratorTab();
}

function applyNarratorTab() {
  if (isAutoMatch()) narratorTab = 'guide';
  const isGuide = narratorTab === 'guide';
  document.getElementById('narratorGuidePanel').style.display = isGuide ? 'flex' : 'none';
  document.getElementById('guideBottomBar').style.display = isGuide ? 'block' : 'none';
  document.getElementById('narratorPlayersPanel').style.display = isGuide ? 'none' : 'flex';
  document.getElementById('tabBtnGuide').classList.toggle('active', isGuide);
  document.getElementById('tabBtnPlayers').classList.toggle('active', !isGuide);
}

function renderNarratorGuide() {
  if (isAutoMatch() && activeMatch.phase === 'night') {
    renderPassNight();
    return;
  }
  const plan = getGuidePlan();
  const idx = getGuideIndex(plan);
  const step = plan[idx];
  activeMatch.guideKey = step.key;

  document.getElementById('guideProgressText').textContent = `Passo ${idx + 1} di ${plan.length} · ${getStepChipLabel(step)}`;

  const chips = document.getElementById('guideChips');
  chips.innerHTML = plan.map((st, i) => `
    <button class="guide-chip${i < idx ? ' done' : ''}${i === idx ? ' current' : ''}" onclick="guideJump('${st.key}')">
      ${i < idx ? '✓ ' : ''}${escapeHtml(getStepChipLabel(st))}
    </button>`).join('');
  const current = chips.querySelector('.guide-chip.current');
  if (current && current.scrollIntoView) current.scrollIntoView({ block: 'nearest', inline: 'center' });

  const body = document.getElementById('guideStep');
  body.innerHTML = `
    ${renderDeathActionsCard()}
    <div class="guide-title">${escapeHtml(getStepTitle(step))}</div>
    ${renderGuideStepBody(step, plan)}
  `;
  // Indietro / Avanti (o l'azione di alba e sera) stanno nella barra fissa in basso
  document.getElementById('guideBottomBar').innerHTML = renderGuideNav(step, plan, idx);

  if (step.emptyCall) {
    startEmptyCallTimer(step.key);
    updateEmptyCallCountdown();
  } else {
    stopEmptyCallTimer();
  }
  if (step.kind === 'debate') updateTimerUI();
  maybeNarrateStep(step);
}

function renderGuideNav(step, plan, idx) {
  const back = `<button class="btn" ${idx === 0 ? 'disabled' : ''} onclick="guideGo(-1)">← Indietro</button>`;
  if (step.kind === 'dawn') {
    return `<div class="guide-nav">${back}<button class="btn btn-warning guide-next" onclick="advanceToDay()">☀️ Fai sorgere il Giorno ${activeMatch.turn}</button></div>`;
  }
  if (step.kind === 'dusk') {
    return `<div class="guide-nav">${back}<button class="btn btn-primary guide-next" onclick="advanceToNight()">🌙 Inizia la Notte ${activeMatch.turn + 1}</button></div>`;
  }
  const next = plan[idx + 1];
  return `<div class="guide-nav">${back}<button class="btn btn-primary guide-next" onclick="guideGo(1)">
    <span>Avanti →</span>${next ? `<span class="guide-next-label">poi: ${escapeHtml(getStepChipLabel(next))}</span>` : ''}
  </button></div>`;
}

function renderGuideStepBody(step, plan) {
  switch (step.kind) {
    case 'intro': return renderIntroStep(plan);
    case 'dawn': return renderDawnStep(plan);
    case 'morning': return renderMorningStep();
    case 'debate': return renderDebateStep();
    case 'vote': return renderVoteStep();
    case 'dusk': return renderDuskStep();
    default: return renderRoleStep(step, plan);
  }
}

/* ---------- Eventi a sorpresa e frasi dei passi ---------- */
const NIGHTFALL_PHRASE = '«Cala la notte sul villaggio: tutti chiudono gli occhi e abbassano la testa.»';
const DEBATE_PHRASE = '«Il villaggio discute: chi sono i lupi? Il tempo parte adesso!»';
const VOTE_PHRASE = '«È il momento di votare: ognuno indichi chi vuole mandare al rogo.»';
const FESTA_VOTE_PHRASE = '«Oggi è festa: niente rogo! Godetevi la festa... ma tenete d\'occhio i vicini.»';

// Consigli per il Narratore principiante (nascosti in modalità esperto)
const NARRATOR_TIPS = {
  intro: 'Parla piano e a voce bassa. Prima di andare avanti controlla che tutti abbiano gli occhi chiusi: se qualcuno sbircia, fermati e ricomincia.',
  wolves: 'I lupi si mettono d\'accordo a gesti, in silenzio. Aspetta che indichino tutti la stessa persona, poi tocca il suo nome.',
  witch: 'Indica con il dito la vittima dei lupi. La Strega risponde a gesti: pollice su per salvarla, poi indica chi avvelenare oppure fa no con la testa.',
  target: 'Guarda chi apre gli occhi senza farti notare. Quando indica qualcuno, fai un cenno per confermare e tocca il suo nome qui.',
  wake: 'Lascia qualche secondo per guardarsi intorno, poi fai chiudere gli occhi.',
  empty: 'Fai finta di aspettare come sempre: nessuno deve capire che quel ruolo non c\'è più.',
  dawn: 'Questo riepilogo è solo per te. Se qualcosa non torna, tocca un passo in alto e correggilo prima di far sorgere il giorno.',
  morning: 'Annuncia i morti con calma. Da adesso chi è morto non parla più (il Fantasma può solo votare).',
  debate: 'Fai parlare tutti, uno alla volta. Se il dibattito si blocca, chiedi a chi è stato più zitto cosa ne pensa.',
  vote: 'Apri la votazione e chiedi a ognuno, uno alla volta, chi vuole mandare al rogo.',
  dusk: 'Prima di iniziare la notte, ricorda a tutti di chiudere gli occhi e di non fare rumore.'
};

function guideTip(kind) {
  return NARRATOR_TIPS[kind] ? `<div class="guide-tip">🎓 ${escapeHtml(NARRATOR_TIPS[kind])}</div>` : '';
}

// Frase da leggere ad alta voce, con il pulsante 🔊 per farla leggere al telefono
function phraseHtml(contentHtml) {
  return `<div class="guide-phrase"><span class="phrase-text">${contentHtml}</span><button class="phrase-say" onclick="sayPhrase(this)" title="Leggi ad alta voce" aria-label="Leggi ad alta voce">🔊</button></div>`;
}

// Evento a sorpresa del turno in corso (esce al calare della notte)
function currentRoundEvent() {
  if (!activeMatch || !activeMatch.surpriseEvents || !activeMatch.event || activeMatch.event.turn !== activeMatch.turn) return null;
  return findSurpriseEvent(activeMatch.event.id);
}

function currentDayEvent() {
  const ev = currentRoundEvent();
  return ev && ev.phase === 'day' ? ev : null;
}

function currentNightEffects() {
  const ev = currentRoundEvent();
  return eventEffects(ev && ev.phase === 'night' ? ev : null);
}

// Testo dell'evento detto di giorno: "Domani..." diventa "Oggi..."
function eventTextToday(ev) {
  return ev.text.replace(/^Domattina/, 'Stamattina').replace(/^Domani/, 'Oggi');
}

function dayEventIs(effect) {
  const ev = currentDayEvent();
  return !!ev && ev.effect === effect;
}

function renderEventCard(ev) {
  return `
    <div class="event-card">
      <div class="event-title">${escapeHtml(ev.icon)} Evento a sorpresa: ${escapeHtml(ev.name)}</div>
      <div>${escapeHtml(ev.text)}</div>
      ${phraseHtml(escapeHtml(ev.phrase))}
      <div class="event-actions">
        <button class="btn btn-sm" onclick="rerollSurpriseEvent()">🎲 Pescane un altro</button>
        <button class="btn btn-sm" onclick="removeSurpriseEvent()">✖ Niente evento</button>
      </div>
    </div>`;
}

function setSurpriseEvent(ev) {
  activeMatch.event = ev ? { turn: activeMatch.turn, id: ev.id } : null;
  if (ev) activeMatch.lastEventId = ev.id;
  saveMatchToStorage();
  renderNarratorDashboard();
  if (ev) narrate([{ say: ev.phrase }]);
}

function surpriseEventExclusions() {
  return activeMatch.revealDead ? ['veglia'] : [];
}

function rerollSurpriseEvent() {
  const current = currentRoundEvent();
  vibrate('tap');
  setSurpriseEvent(pickSurpriseEvent(Math.random, [current ? current.id : null].concat(surpriseEventExclusions())));
}

function removeSurpriseEvent() {
  vibrate('tap');
  setSurpriseEvent(null);
}

function introPhrases() {
  const lines = [];
  if (activeMatch.turn === 1 && activeMatch.deckAnnounced) lines.push(deckAnnouncement(activeMatch.initialDeckMap, findRoleOrNull));
  lines.push(NIGHTFALL_PHRASE);
  const ev = currentRoundEvent();
  if (ev) lines.push(ev.phrase);
  return lines;
}

function renderIntroStep(plan) {
  const calls = plan.filter(st => st.kind !== 'intro' && st.kind !== 'dawn');
  const list = calls.length
    ? calls.map(st => `${escapeHtml(getStepChipLabel(st))}${st.emptyCall ? ' <span class="guide-muted">(chiamata a vuoto)</span>' : ''}`).join(' · ')
    : 'Nessun ruolo da chiamare stanotte.';
  let html = '';
  if (activeMatch.turn === 1 && activeMatch.deckAnnounced) {
    html += `<div class="guide-info">📣 Prima di iniziare, annuncia a tutti i ruoli in gioco:</div>`;
    html += phraseHtml(escapeHtml(deckAnnouncement(activeMatch.initialDeckMap, findRoleOrNull)));
  }
  html += phraseHtml(escapeHtml(NIGHTFALL_PHRASE));
  const ev = currentRoundEvent();
  if (ev) {
    html += renderEventCard(ev);
  } else if (activeMatch.surpriseEvents) {
    html += activeMatch.turn === 1
      ? '<div class="guide-muted guide-help">🎲 Gli eventi a sorpresa iniziano dalla seconda notte.</div>'
      : `<div class="guide-muted">🎲 Stanotte nessun evento a sorpresa. <button class="btn btn-sm" onclick="rerollSurpriseEvent()">Pesca un evento</button></div>`;
  }
  html += `
    <div class="guide-info">Stanotte chiamerai, in quest'ordine: ${list}</div>
    <div class="guide-muted guide-help">Tocca "Avanti" quando tutti hanno gli occhi chiusi.</div>
    ${guideTip('intro')}
  `;
  return html;
}

function holdersLine(step) {
  if (!step.holders.length) return '';
  const names = step.holders.map(p => p.isDead ? `💀 ${escapeHtml(p.name)}` : `<strong>${escapeHtml(p.name)}</strong>`);
  return `<div class="guide-holders">${step.holders.length === 1 ? 'È' : 'Sono'}: ${names.join(', ')}</div>`;
}

// Giocatori scelti in un passo (i lupi con la Luna rossa ne scelgono due)
function getStepChosenIds(step) {
  const ch = activeMatch.nightChoices || {};
  if (step.kind === 'wolves') {
    const ids = [ch[step.key]];
    if ((step.targets || 1) > 1) ids.push(ch[secondTargetKey(step.key)]);
    return ids.filter(Boolean);
  }
  return ch[step.key] ? [ch[step.key]] : [];
}

function renderTargetGrid(step, chosenIds) {
  const options = getTargetOptions(step, activeMatch.players, rolesDB, activeMatch.prevNightChoices || {}, isRulesEnforced());
  const colors = getMatchColors();
  return `
    <div class="target-grid">
      ${options.map(o => `
        <button class="target-btn${chosenIds.includes(o.id) ? ' selected' : ''}" ${o.disabled ? 'disabled' : ''} onclick="selectGuideTarget('${step.key}', '${o.id}', ${step.targets || 1})">
          <span class="target-name">${avatarHtml(o.name, colors[o.id], 'sm')} ${escapeHtml(o.name)}</span>
          ${o.reason ? `<span class="target-reason">${escapeHtml(o.reason)}</span>` : ''}
        </button>`).join('')}
    </div>`;
}

function renderRoleStep(step, plan) {
  const roles = getStepRoles(step);
  const mainRole = roles[0];
  const action = NIGHT_ACTIONS[step.kind] || NIGHT_ACTIONS.none;
  let html = holdersLine(step);

  if (step.emptyCall) {
    html += `
      <div class="guide-empty">
        💀 ${step.holders.length === 1 ? 'È morto' : 'Sono tutti morti'}: chiamalo lo stesso con la sua frase, così nessuno capisce che non c'è più.
        <div id="emptyCallCountdown" class="guide-countdown">⏳</div>
      </div>`;
  }

  html += phraseHtml(escapeHtml(rolePhrase(mainRole)));

  // Chi può sbirciare mentre i lupi sono svegli (es. la Bambina)
  if (step.kind === 'wolves') {
    activeMatch.players.filter(p => !p.isDead && roleTraits(findRoleOrNull(p.roleId)).peeksAtWolves).forEach(p => {
      const r = getRoleById(p.roleId);
      html += `<div class="guide-info">${escapeHtml(r.icon)} ${escapeHtml(r.name)} (<strong>${escapeHtml(p.name)}</strong>) può sbirciare: tienila d'occhio.</div>`;
    });
  }

  let tip = action.target ? 'target' : 'wake';
  if (step.emptyCall) {
    tip = 'empty';
  } else if (step.exhausted) {
    html += `<div class="guide-empty">🔒 ${step.kind === 'witch' ? 'Ha già usato entrambe le pozioni' : 'Ha già usato il suo potere (una volta per partita)'}: chiamalo lo stesso con la sua frase, così nessuno capisce, poi vai avanti.</div>`;
  } else if (step.kind === 'wolves' && step.noKill) {
    html += '<div class="guide-empty">🌑 Eclissi: stanotte i lupi aprono gli occhi e si guardano, ma non possono uccidere. Poi falli richiudere.</div>';
  } else if (step.blind) {
    html += '<div class="guide-empty">🌫️ Nebbia: stanotte non vede nulla. Lascia che indichi qualcuno, poi non dare nessuna risposta (allarga le braccia).</div>';
  } else if (step.kind === 'witch') {
    tip = 'witch';
    html += renderWitchStep(step, plan);
  } else if (action.target) {
    if (step.kind === 'wolves') tip = 'wolves';
    const twoVictims = step.kind === 'wolves' && (step.targets || 1) > 1;
    const question = step.kind === 'kill' ? `Chi colpisce ${mainRole.name}?` : action.question;
    const chosenIds = getStepChosenIds(step);
    if (twoVictims) html += '<div class="guide-info">🌕 Luna rossa: stanotte i lupi scelgono <strong>due</strong> vittime.</div>';
    html += `
      <div class="guide-question">${escapeHtml(question)}${twoVictims ? ` <span class="guide-muted">(${chosenIds.length} di 2)</span>` : ''}</div>
      ${renderTargetGrid(step, chosenIds)}
      ${chosenIds.length
        ? chosenIds.map(id => renderChoiceResult(step, id, plan)).join('')
        : '<div class="guide-muted guide-help">Tocca il giocatore indicato. Puoi cambiarlo toccandone un altro.</div>'}
    `;
  }

  if (step.kind === 'medium' && !step.emptyCall && !step.blind) html += renderMediumInfo();

  const notes = roles.map(r => r.narratorNote).filter(Boolean);
  if (notes.length) html += `<div class="guide-note">💡 ${notes.map(escapeHtml).join('<br>💡 ')}</div>`;
  return html + guideTip(tip);
}

// Strega (o ruolo con le pozioni): vittime dei lupi da salvare e pozione della morte
function renderWitchStep(step, plan) {
  const choices = activeMatch.nightChoices || {};
  const wolvesStep = plan.find(st => st.kind === 'wolves' && !st.emptyCall);
  const victims = wolvesTargetIds(plan, choices).map(id => activeMatch.players.find(p => p.id === id)).filter(Boolean);
  const saveKey = witchSaveKey(step.key);
  const colors = getMatchColors();
  let html = '<div class="potion-box">';

  html += '<div class="potion-title">💚 Pozione della vita</div>';
  if (step.saveUsed) {
    html += '<div class="guide-muted">Già usata in una notte precedente.</div>';
  } else if (!wolvesStep || wolvesStep.noKill) {
    html += '<div class="guide-muted">Stanotte i lupi non hanno una vittima.</div>';
  } else if (!victims.length) {
    html += `<div class="guide-muted">I lupi non hanno ancora scelto. <button class="btn btn-sm" onclick="guideJump('${wolvesStep.key}')">🐺 Torna ai Lupi</button></div>`;
  } else {
    const names = joinNames(victims.map(v => `<strong>${escapeHtml(v.name)}</strong>`));
    html += `<div class="guide-info">Indica alla Strega ${victims.length > 1 ? 'le vittime' : 'la vittima'} dei lupi: ${names}.${victims.length > 1 ? ' Può salvarne una sola.' : ''}</div>`;
    victims.forEach(victim => {
      const isSaving = choices[saveKey] === victim.id;
      html += `
        <button class="target-btn potion-btn${isSaving ? ' selected' : ''}" onclick="toggleWitchSave('${step.key}', '${victim.id}')">
          <span class="target-name">${avatarHtml(victim.name, colors[victim.id], 'sm')} ${isSaving ? `💚 ${escapeHtml(victim.name)} salvato con la pozione` : `Salva ${escapeHtml(victim.name)}`}</span>
        </button>`;
    });
  }

  html += '<div class="potion-title">☠️ Pozione della morte</div>';
  if (step.killUsed) {
    html += '<div class="guide-muted">Già usata in una notte precedente.</div>';
  } else {
    const chosen = choices[step.key];
    html += `<div class="guide-question">Chi avvelena? (se vuole)</div>${renderTargetGrid(step, chosen ? [chosen] : [])}`;
    if (chosen) {
      const target = activeMatch.players.find(p => p.id === chosen);
      const preview = resolveNight(activeMatch.players, plan, choices, rolesDB);
      const isSaved = preview.saved.some(x => x.playerId === chosen && x.from === 'kill');
      if (target) html += `<div class="guide-result result-danger">☠️ Avvelenato: <strong>${escapeHtml(target.name)}</strong>${isSaved ? '<br>🛡️ È protetto stanotte: si salverà.' : '<br>Morirà all\'alba.'}</div>`;
    }
  }
  html += '<div class="guide-muted guide-help">Se la Strega non vuole usare le pozioni, tocca Avanti.</div>';
  return html + '</div>';
}

function toggleWitchSave(stepKey, victimId) {
  vibrate('tap');
  if (!activeMatch.nightChoices) activeMatch.nightChoices = {};
  const key = witchSaveKey(stepKey);
  if (activeMatch.nightChoices[key] === victimId) delete activeMatch.nightChoices[key];
  else activeMatch.nightChoices[key] = victimId;
  saveMatchToStorage();
  renderNarratorGuide();
  renderNarratorPlayersList();
}

function renderChoiceResult(step, targetId, plan) {
  const target = activeMatch.players.find(p => p.id === targetId);
  if (!target) return '';
  const name = `<strong>${escapeHtml(target.name)}</strong>`;
  const preview = resolveNight(activeMatch.players, plan, activeMatch.nightChoices || {}, rolesDB);
  const isSaved = preview.saved.some(x => x.playerId === targetId && x.from === step.kind);
  const isImmune = step.kind === 'wolves' && preview.immune.some(x => x.playerId === targetId);
  const mainRole = getStepRoles(step)[0];

  switch (step.kind) {
    case 'wolves':
      return `<div class="guide-result result-danger">🐺 Vittima dei lupi: ${name}${isSaved ? '<br>🛡️ È protetto stanotte: si salverà.' : ''}${isImmune ? `<br>${escapeHtml(getRoleById(target.roleId).icon)} È ${escapeHtml(getRoleById(target.roleId).name)}: immune ai lupi, non morirà.` : ''}</div>`;
    case 'kill':
      return `<div class="guide-result result-danger">${escapeHtml(mainRole.icon)} Colpito: ${name}${isSaved ? '<br>🛡️ È protetto stanotte: si salverà.' : '<br>Morirà all\'alba.'}</div>`;
    case 'protect':
      return `<div class="guide-result result-good">🛡️ Protetto stanotte: ${name}</div>`;
    case 'investigate': {
      const answer = investigateAnswer(target, findRoleOrNull);
      if (answer.dies) return `<div class="guide-result result-danger">👎 Fai NO con la testa.<br>${escapeHtml(getRoleById(target.roleId).icon)} ${name} è ${escapeHtml(getRoleById(target.roleId).name)}: se lo scoprono muore, morirà all'alba!</div>`;
      return answer.isWolf
        ? `<div class="guide-result result-danger">👍 Fai SÌ con la testa: ${name} è un lupo.</div>`
        : `<div class="guide-result result-good">👎 Fai NO con la testa: ${name} non è un lupo.</div>`;
    }
    case 'mark':
      return `<div class="guide-result">${escapeHtml(mainRole.icon)} Domattina annuncerai il segno per ${name}.</div>`;
    case 'copy': {
      const newRoleId = copyResultRoleId(findRoleOrNull(target.roleId), rolesDB);
      const newRole = newRoleId ? getRoleById(newRoleId) : null;
      const who = step.aliveHolders.map(p => escapeHtml(p.name)).join(', ');
      return `<div class="guide-result">🎭 Dall'alba <strong>${who}</strong> diventerà ${newRole ? `${escapeHtml(newRole.icon)} ${escapeHtml(newRole.name)}` : 'nessun ruolo nuovo'}.</div>`;
    }
    default:
      return `<div class="guide-result">📌 Annotato: ${name}</div>`;
  }
}

function renderMediumInfo() {
  const burned = findBurnedOnDay(activeMatch.players, activeMatch.turn - 1);
  if (!burned) {
    return `<div class="guide-result">🔥 Ieri nessuno è stato bruciato al rogo: fai NO con la testa.</div>`;
  }
  const role = getRoleById(burned.roleId);
  const wasWolf = role.faction === 'Branco';
  return `<div class="guide-result ${wasWolf ? 'result-danger' : 'result-good'}">
    🔥 Ieri al rogo è morto <strong>${escapeHtml(burned.name)}</strong> (${escapeHtml(role.icon)} ${escapeHtml(role.name)}).<br>
    ${wasWolf ? '👍 Fai SÌ con la testa: era un lupo.' : '👎 Fai NO con la testa: non era un lupo.'}
  </div>`;
}

// targets = quante persone sceglie il passo (2 per i lupi con la Luna rossa)
function selectGuideTarget(stepKey, playerId, targets = 1) {
  vibrate('tap');
  if (!activeMatch.nightChoices) activeMatch.nightChoices = {};
  const ch = activeMatch.nightChoices;
  if (targets > 1) {
    const second = secondTargetKey(stepKey);
    if (ch[stepKey] === playerId) {
      delete ch[stepKey];
      if (ch[second]) {
        ch[stepKey] = ch[second];
        delete ch[second];
      }
    } else if (ch[second] === playerId) {
      delete ch[second];
    } else if (!ch[stepKey]) {
      ch[stepKey] = playerId;
    } else if (!ch[second]) {
      ch[second] = playerId;
    } else {
      showToast('Hai già scelto 2 vittime: toccane una per toglierla.', 'warn');
      return;
    }
  } else if (ch[stepKey] === playerId) {
    delete ch[stepKey];
  } else {
    ch[stepKey] = playerId;
  }
  saveMatchToStorage();
  renderNarratorGuide();
  renderNarratorPlayersList();
}

function describeDeathCause(cause, roleIds) {
  if (cause === 'lupi') return 'sbranato dai lupi';
  if (cause === 'indagine') return 'è stato scoperto da chi indaga (e per lui è fatale)';
  const role = getRoleById((roleIds || [])[0]);
  return `colpito da ${role.icon} ${role.name}`;
}

function renderDawnStep(plan) {
  const res = resolveNight(activeMatch.players, plan, activeMatch.nightChoices || {}, rolesDB);
  const nameOf = id => escapeHtml((activeMatch.players.find(p => p.id === id) || { name: '?' }).name);
  const rows = [];
  res.deaths.forEach(d => rows.push(`💀 <strong>${nameOf(d.playerId)}</strong> muore: ${escapeHtml(describeDeathCause(d.cause, d.roleIds))}`));
  res.saved.forEach(x => {
    const potion = res.entries.some(e => e.kind === 'witch-save' && e.targetId === x.playerId);
    rows.push(potion
      ? `💚 <strong>${nameOf(x.playerId)}</strong> era la vittima dei lupi: salvato dalla pozione`
      : `🛡️ <strong>${nameOf(x.playerId)}</strong> era nel mirino ma è protetto: si salva`);
  });
  res.immune.forEach(x => rows.push(`🛡️ <strong>${nameOf(x.playerId)}</strong> è immune ai lupi: non muore`));
  res.marks.forEach(m => rows.push(`${escapeHtml(getRoleById(m.roleId).icon)} Segno per <strong>${nameOf(m.playerId)}</strong> (da annunciare)`));
  res.copies.forEach(c => {
    const nr = c.newRoleId ? getRoleById(c.newRoleId) : null;
    rows.push(`🎭 <strong>${nameOf(c.playerId)}</strong> diventa ${nr ? `${escapeHtml(nr.icon)} ${escapeHtml(nr.name)}` : 'nessun ruolo nuovo'}`);
  });

  // Scelte dimenticate (le pozioni sono facoltative; con Eclissi e Nebbia non c'è niente da scegliere)
  const choices = activeMatch.nightChoices || {};
  const missing = plan.filter(st => {
    if (st.emptyCall || st.exhausted || st.blind || st.kind === 'witch' || !(NIGHT_ACTIONS[st.kind] || {}).target) return false;
    if (st.kind === 'wolves') return !st.noKill && getStepChosenIds(st).length < (st.targets || 1);
    return !choices[st.key];
  });
  const missingHtml = missing.length
    ? `<div class="guide-empty">⚠️ Manca la scelta di: ${missing.map(st => `<button class="btn btn-sm" onclick="guideJump('${st.key}')">${escapeHtml(getStepChipLabel(st))}</button>`).join(' ')}</div>`
    : '';

  return `
    <div class="guide-muted">Riepilogo per te (non leggerlo ad alta voce):</div>
    <div class="guide-result">${rows.length ? rows.join('<br>') : '🌙 Notte tranquilla: nessuno muore.'}</div>
    ${missingHtml}
    <div class="guide-muted guide-help">${isAutoResolve()
      ? '🤖 Quando fai sorgere il giorno, i morti vengono segnati da soli e l\'app controlla se qualcuno ha vinto.'
      : '✋ Morti automatiche spente: al mattino segnerai tu chi è morto.'}</div>
    ${guideTip('dawn')}
  `;
}

// Si svela il ruolo dei morti? (variante della partita, oppure evento "Veglia funebre")
function revealsNightDeaths() {
  return !!activeMatch.revealDead || dayEventIs('revealNightDeaths');
}

function getMorningLines() {
  const turn = activeMatch.turn;
  const last = activeMatch.lastNightResult && activeMatch.lastNightResult.turn === turn ? activeMatch.lastNightResult : null;
  const nameOf = id => (activeMatch.players.find(p => p.id === id) || { name: '?' }).name;
  const deadTonight = activeMatch.players.filter(p => p.isDead && p.deathCause === 'notte' && p.diedOnTurn === turn);
  const lines = buildMorningAnnouncement(deadTonight.map(p => p.name), last ? last.marks : [], findRoleOrNull, nameOf);
  if (revealsNightDeaths()) deadTonight.forEach(p => lines.push(roleRevealLine(p.name, findRoleOrNull(p.roleId))));
  const ev = currentDayEvent();
  if (ev && ev.today) lines.push(ev.today);
  return lines;
}

function renderMorningStep() {
  const turn = activeMatch.turn;
  const last = activeMatch.lastNightResult && activeMatch.lastNightResult.turn === turn ? activeMatch.lastNightResult : null;
  const nameOf = id => (activeMatch.players.find(p => p.id === id) || { name: '?' }).name;
  let html = '';

  if (!isAutoResolve() && last) {
    const pending = last.deaths.filter(d => {
      const p = activeMatch.players.find(x => x.id === d.playerId);
      return p && !p.isDead;
    });
    if (pending.length) {
      html += `<div class="guide-empty">✋ Da segnare a mano:<br>${pending.map(d =>
        `<button class="btn btn-sm btn-danger" style="margin-top: 6px;" onclick="markNightDeath('${d.playerId}')">💀 Segna ${escapeHtml(nameOf(d.playerId))} come morto</button>`).join(' ')}</div>`;
    }
  }

  const ev = currentDayEvent();
  if (ev) html += `<div class="event-card"><div class="event-title">${escapeHtml(ev.icon)} ${escapeHtml(ev.name)}</div><div>${escapeHtml(eventTextToday(ev))}</div></div>`;
  html += phraseHtml(getMorningLines().map(escapeHtml).join('<br><br>'));
  html += `<div class="guide-muted guide-help">${revealsNightDeaths() ? 'Leggi anche il ruolo dei morti.' : 'Annuncia i morti senza svelare il loro ruolo.'}</div>`;

  const ghost = activeMatch.players.find(p => p.isGhost && p.diedOnTurn === turn);
  if (ghost) html += `<div class="guide-info">👻 <strong>${escapeHtml(ghost.name)}</strong> è il Fantasma: da ora resta in silenzio, ma vota al rogo.</div>`;
  if (last && last.copies.length && !isAutoMatch()) {
    html += `<div class="guide-note">🎭 Solo per te: ${last.copies.map(c => {
      const nr = c.newRoleId ? getRoleById(c.newRoleId) : null;
      return `${escapeHtml(nameOf(c.playerId))} ora è ${nr ? `${escapeHtml(nr.icon)} ${escapeHtml(nr.name)}` : 'senza ruolo nuovo'}`;
    }).join(', ')}.</div>`;
  }
  return html + guideTip('morning');
}

function renderDebateStep() {
  const ghosts = activeMatch.players.filter(p => p.isGhost).map(p => p.name);
  const mayors = activeMatch.players.filter(p => !p.isDead && roleTraits(findRoleOrNull(p.roleId)).doubleVote).map(p => p.name);
  return `
    ${phraseHtml(escapeHtml(DEBATE_PHRASE))}
    ${dayEventIs('shortDebate') ? '<div class="guide-info">⚡ Processo lampo: oggi il dibattito dura la metà.</div>' : ''}
    <button class="btn" onclick="openTableView()">🪑 Mostra al tavolo (timer e vivi, senza ruoli)</button>
    <div class="timer-box">
      <div>
        <div id="dayTimerDisplay" class="timer-display ${dayTimerSeconds === 0 ? 'expired' : ''}">${formatTimer(dayTimerSeconds)}</div>
      </div>
      <div class="timer-controls">
        <button class="btn btn-sm" onclick="adjustDayTimer(-30)" aria-label="Togli 30 secondi">−30s</button>
        <button class="btn btn-sm" onclick="adjustDayTimer(30)" aria-label="Aggiungi 30 secondi">+30s</button>
        <button class="btn btn-sm btn-primary" onclick="startPauseDayTimer()" id="btnDayTimerPlay">${dayTimerInterval ? '⏸️ Pausa' : '▶️ Via'}</button>
        <button class="btn btn-sm" onclick="resetDayTimer()" aria-label="Ricomincia">🔄</button>
      </div>
    </div>
    <div class="guide-info">
      👻 Fantasma: ${ghosts.length ? `<strong>${escapeHtml(ghosts.join(', '))}</strong> (zitto, ma vota)` : 'nessuno'}
      ${isAutoMatch() ? '' : `<br>🎖️ Voto doppio: ${mayors.length ? `<strong>${escapeHtml(mayors.join(', '))}</strong>` : 'nessuno'}`}
    </div>
    ${guideTip('debate')}
  `;
}

function getVotePhrases() {
  const burned = findBurnedOnDay(activeMatch.players, activeMatch.turn);
  if (burned) {
    const lines = [`«${burned.name} viene condannato al rogo!»`];
    if (activeMatch.revealDead) lines.push(roleRevealLine(burned.name, findRoleOrNull(burned.roleId)));
    return lines;
  }
  return [dayEventIs('noBurning') ? FESTA_VOTE_PHRASE : VOTE_PHRASE];
}

function renderVoteStep() {
  const burned = findBurnedOnDay(activeMatch.players, activeMatch.turn);
  if (burned) {
    const role = getRoleById(burned.roleId);
    return `
      <div class="guide-result result-danger">🔥 Oggi il villaggio ha bruciato <strong>${escapeHtml(burned.name)}</strong> (${escapeHtml(role.icon)} ${escapeHtml(role.name)}).</div>
      ${phraseHtml(getVotePhrases().map(escapeHtml).join('<br><br>'))}
      <div class="guide-muted guide-help">${isAutoMatch() ? 'Se avete sbagliato, toccate ↩️ in alto per tornare indietro.' : 'Se hai sbagliato, nella scheda 👥 Giocatori tocca ❌ per riportarlo in vita.'}</div>
    `;
  }
  if (dayEventIs('noBurning')) {
    return `
      ${phraseHtml(escapeHtml(FESTA_VOTE_PHRASE))}
      <div class="guide-info">🎉 Festa al villaggio: oggi niente votazione. Tocca Avanti.</div>
    `;
  }
  const tieLabels = {
    runoff: 'i pareggi si risolvono con il ballottaggio',
    none: 'con un pareggio nessuno va al rogo',
    decider: 'con un pareggio decide chi ha il voto doppio'
  };
  return `
    ${phraseHtml(escapeHtml(VOTE_PHRASE))}
    <button class="btn btn-warning" onclick="openVoteModal()">🗳️ Apri la votazione</button>
    <div class="guide-muted guide-help">L'app conta i voti (il voto doppio vale 2, il Fantasma vota); ${tieLabels[getTieRule()]}. Se oggi nessuno va al rogo, tocca Avanti.</div>
    ${guideTip('vote')}
  `;
}

function getDuskPhrase() {
  const burned = findBurnedOnDay(activeMatch.players, activeMatch.turn);
  return `«Il sole tramonta sul villaggio${burned ? ` e le ceneri di ${burned.name} si raffreddano` : ''}... presto arriverà la notte.»`;
}

function renderDuskStep() {
  const burned = findBurnedOnDay(activeMatch.players, activeMatch.turn);
  return `
    ${phraseHtml(escapeHtml(getDuskPhrase()))}
    <div class="guide-muted guide-help">${burned ? '' : 'Oggi nessuno è stato bruciato. '}Quando sei pronto, inizia la notte.</div>
    ${guideTip('dusk')}
  `;
}

// Alba: risolve la notte (copie sempre, morti solo se automatiche) e passa al giorno.
function advanceToDay() {
  if (!activeMatch || activeMatch.phase !== 'night') return;
  stopEmptyCallTimer();
  stopDayTimer();
  pushUndoSnapshot();

  const turn = activeMatch.turn;
  const plan = currentNightPlan();
  const res = resolveNight(activeMatch.players, plan, activeMatch.nightChoices || {}, rolesDB);
  const byId = id => activeMatch.players.find(p => p.id === id);

  // Poteri usati stanotte (pozioni, poteri "una volta per partita")
  const used = activeMatch.usedPowers || {};
  computePowerUsage(activeMatch.players, plan, activeMatch.nightChoices || {}, rolesDB).forEach(u => {
    used[u.playerId] = Array.from(new Set((used[u.playerId] || []).concat(u.slot)));
  });
  activeMatch.usedPowers = used;

  res.copies.forEach(c => {
    const p = byId(c.playerId);
    if (p && c.newRoleId) p.roleId = c.newRoleId;
  });
  if (isAutoResolve()) {
    res.deaths.forEach(d => {
      const p = byId(d.playerId);
      if (p && !p.isDead) killPlayer(p, 'notte', { silent: true });
    });
  }

  activeMatch.lastNightResult = { turn, deaths: res.deaths, saved: res.saved, immune: res.immune, marks: res.marks, copies: res.copies };
  const roundEvent = currentRoundEvent();
  activeMatch.nightLogs = (activeMatch.nightLogs || []).filter(l => l.turn !== turn).concat([{ turn, entries: res.entries, eventId: roundEvent ? roundEvent.id : null }]);
  activeMatch.prevNightChoices = { ...(activeMatch.nightChoices || {}) };
  activeMatch.nightChoices = {};
  activeMatch.phase = 'day';
  activeMatch.guideKey = 'morning';
  activeMatch.vote = null;
  dayTimerSeconds = getDebateDuration();

  vibrate(isAutoResolve() && res.deaths.length ? 'death' : 'tap');
  saveMatchToStorage();
  narratorTab = 'guide';
  renderNarratorDashboard();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  showToast(`☀️ Giorno ${turn}. Se hai sbagliato, tocca ↩️ in alto.`);
}

// Sera: inizia una nuova notte.
function advanceToNight() {
  if (!activeMatch || activeMatch.phase !== 'day') return;
  stopDayTimer();
  pushUndoSnapshot();

  activeMatch.turn += 1;
  activeMatch.phase = 'night';
  activeMatch.guideKey = 'intro';
  activeMatch.nightChoices = {};

  // Evento a sorpresa (dalla seconda notte, circa una notte su due o tre)
  activeMatch.event = null;
  if (activeMatch.surpriseEvents) {
    const ev = drawSurpriseEvent(Math.random, activeMatch.lastEventId || null, surpriseEventExclusions());
    if (ev) {
      activeMatch.event = { turn: activeMatch.turn, id: ev.id };
      activeMatch.lastEventId = ev.id;
    }
  }
  activeMatch.vote = null;
  activeMatch.players.forEach(p => { p.extraPin = false; });

  saveMatchToStorage();
  narratorTab = 'guide';
  renderNarratorDashboard();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  showToast(`🌙 Notte ${activeMatch.turn}. Se hai sbagliato, tocca ↩️ in alto.`);
}

// Chiamata a vuoto: qualche secondo di attesa (variabile, così nessuno capisce) prima di chiudere la chiamata.
function startEmptyCallTimer(key) {
  if (emptyCallTimer && emptyCallTimer.key === key) return;
  stopEmptyCallTimer();
  const seconds = 5 + Math.floor(Math.random() * 4);
  emptyCallTimer = { key, endsAt: Date.now() + seconds * 1000, interval: null, done: false };
  emptyCallTimer.interval = setInterval(updateEmptyCallCountdown, 250);
}

function updateEmptyCallCountdown() {
  if (!emptyCallTimer) return;
  const el = document.getElementById('emptyCallCountdown');
  const left = Math.max(0, Math.ceil((emptyCallTimer.endsAt - Date.now()) / 1000));
  if (el) {
    el.textContent = left > 0 ? `⏳ Aspetta ancora ${left} s in silenzio...` : '✔️ Ora chiudi la chiamata («...chiude gli occhi») e vai avanti.';
    el.classList.toggle('done', left === 0);
  }
  if (left === 0 && !emptyCallTimer.done) {
    emptyCallTimer.done = true;
    clearInterval(emptyCallTimer.interval);
    emptyCallTimer.interval = null;
    vibrate('tap');
    closeEmptyCallAloud(emptyCallTimer.key);
  }
}

function stopEmptyCallTimer() {
  if (emptyCallTimer && emptyCallTimer.interval) clearInterval(emptyCallTimer.interval);
  emptyCallTimer = null;
}

// Morte segnata a mano dal mattino (quando le morti automatiche sono spente)
function markNightDeath(playerId) {
  const p = activeMatch.players.find(item => item.id === playerId);
  if (!p || p.isDead) return;
  killPlayer(p, 'notte');
}

/* =========================================================================
   PARTITA SENZA NARRATORE
   Di notte il telefono passa a tutti i vivi, uno alla volta (nell'ordine in cui sono seduti).
   Chi lo riceve fa la sua mossa in segreto; chi non ha niente da fare tocca un nome a caso,
   così dal tempo passato col telefono nessuno capisce chi ha poteri.
   Le mosse stanno in activeMatch.pass.votes; all'alba diventano activeMatch.nightChoices.
========================================================================= */
const AUTO_NIGHTFALL_PHRASE = '«Cala la notte: il telefono passerà a tutti, uno alla volta. Chi non ce l\'ha chiude gli occhi.»';
const AUTO_DONE_PHRASE = '«Tutti hanno fatto la loro mossa. Appoggiate il telefono al centro: il villaggio si sveglia!»';

function isAutoMatch() {
  return !!activeMatch && activeMatch.mode === 'auto';
}

function ensurePass() {
  if (!activeMatch.pass || activeMatch.pass.turn !== activeMatch.turn) {
    activeMatch.pass = { turn: activeMatch.turn, order: passOrder(activeMatch.players), index: 0, stage: 'intro', votes: {}, decoy: {} };
  }
  const pass = activeMatch.pass;
  // chi è morto nel frattempo non riceve il telefono
  while ((pass.stage === 'cover' || pass.stage === 'action') && pass.index < pass.order.length) {
    const p = activeMatch.players.find(x => x.id === pass.order[pass.index]);
    if (p && !p.isDead) break;
    pass.index++;
  }
  if ((pass.stage === 'cover' || pass.stage === 'action') && pass.index >= pass.order.length) pass.stage = 'done';
  return pass;
}

function passPlayer(pass) {
  return activeMatch.players.find(p => p.id === pass.order[pass.index]) || null;
}

function passNarrationKey(pass) {
  return `pass|${activeMatch.turn}|${pass.stage}|${pass.index}`;
}

function getPassVote(key, playerId) {
  const byPlayer = (activeMatch.pass.votes || {})[key] || {};
  return Array.isArray(byPlayer[playerId]) ? byPlayer[playerId] : null;
}

function setPassVote(key, playerId, list) {
  const votes = activeMatch.pass.votes;
  votes[key] = votes[key] || {};
  votes[key][playerId] = list;
}

// Passi della notte in cui gioca questo giocatore
function passStepsFor(player, plan) {
  return plan.filter(st => st.kind !== 'intro' && st.kind !== 'dawn' && (st.aliveHolders || []).some(h => h.id === player.id));
}

function passTargetGrid(step, player, key, chosen, allowNone) {
  const options = getTargetOptions(step, activeMatch.players, rolesDB, activeMatch.prevNightChoices || {}, isRulesEnforced());
  const colors = getMatchColors();
  return `
    <div class="target-grid">
      ${options.map(o => `
        <button class="target-btn${chosen.includes(o.id) ? ' selected' : ''}" ${o.disabled ? 'disabled' : ''} onclick="passPick('${key}', '${o.id}', ${step.targets || 1})">
          <span class="target-name">${avatarHtml(o.name, colors[o.id], 'sm')} ${escapeHtml(o.name)}</span>
          ${o.reason ? `<span class="target-reason">${escapeHtml(o.reason)}</span>` : ''}
        </button>`).join('')}
    </div>
    ${allowNone ? `<button class="btn btn-sm${chosen.length === 1 && chosen[0] === '' ? ' btn-primary' : ''}" onclick="passPick('${key}', '', 1)">Nessuno</button>` : ''}`;
}

/**
 * Un pezzo della schermata segreta: { html, complete, needsDecoy }.
 * needsDecoy = in questo pezzo non c'è niente da toccare (serve la finta mossa).
 */
function renderPassSection(step, player) {
  const role = getStepRoles(step)[0];
  const nameOf = id => (activeMatch.players.find(p => p.id === id) || { name: '?' }).name;
  const others = step.aliveHolders.filter(h => h.id !== player.id).map(h => h.name);
  const title = `<div class="potion-title">${escapeHtml(role.icon)} ${escapeHtml(step.kind === 'wolves' ? 'Il branco' : role.name)}</div>`;

  if (step.exhausted) {
    return { html: `${title}<div class="guide-muted">🔒 Hai già usato ${step.kind === 'witch' ? 'entrambe le pozioni' : 'il tuo potere'}.</div>`, complete: true, needsDecoy: true };
  }

  if (step.kind === 'wolves') {
    const pack = others.length ? `🐺 Il tuo branco: <strong>${escapeHtml(joinNames(others))}</strong>.` : '🐺 Sei l\'unico lupo rimasto.';
    if (step.noKill) {
      return { html: `${title}<div class="guide-info">${pack}</div><div class="guide-empty">🌑 Eclissi: stanotte il branco non può uccidere.</div>`, complete: true, needsDecoy: true };
    }
    const targets = step.targets || 1;
    const mine = getPassVote(step.key, player.id) || [];
    const sofar = step.aliveHolders
      .filter(h => h.id !== player.id && getPassVote(step.key, h.id))
      .map(h => `${escapeHtml(h.name)} → ${escapeHtml(getPassVote(step.key, h.id).filter(Boolean).map(nameOf).join(' e ') || 'nessuno')}`);
    return {
      html: `${title}
        <div class="guide-info">${pack}${sofar.length ? `<br>Scelte del branco finora: ${sofar.join(', ')}.` : ''}</div>
        ${targets > 1 ? '<div class="guide-info">🌕 Luna rossa: stanotte scegliete <strong>due</strong> vittime.</div>' : ''}
        <div class="guide-question">Chi volete sbranare?${targets > 1 ? ` <span class="guide-muted">(${mine.length} di 2)</span>` : ''}</div>
        ${passTargetGrid(step, player, step.key, mine, false)}
        <div class="guide-muted">Se il branco non è d'accordo, vince la persona scelta da più lupi (a parità, la prima scelta).</div>`,
      complete: mine.length >= targets,
      needsDecoy: false
    };
  }

  if (step.kind === 'witch') {
    let html = title;
    let complete = true;
    if (!step.saveUsed) {
      const save = getPassVote(witchSaveKey(step.key), player.id);
      complete = complete && !!save;
      html += `<div class="guide-question">💚 Usi la pozione della vita sulla vittima dei lupi di stanotte, chiunque sia?</div>
        <div class="pass-yes-no">
          <button class="btn${save && save[0] === ANY_WOLF_VICTIM ? ' btn-success' : ''}" onclick="passPick('${witchSaveKey(step.key)}', '${ANY_WOLF_VICTIM}', 1, true)">Sì, salvala</button>
          <button class="btn${save && save[0] === '' ? ' btn-primary' : ''}" onclick="passPick('${witchSaveKey(step.key)}', '', 1, true)">No</button>
        </div>`;
    }
    if (!step.killUsed) {
      const kill = getPassVote(step.key, player.id);
      complete = complete && !!kill;
      html += `<div class="guide-question">☠️ Usi la pozione della morte? Su chi?</div>${passTargetGrid(step, player, step.key, kill || [], true)}`;
    }
    return { html, complete, needsDecoy: false };
  }

  if (step.blind) {
    return { html: `${title}<div class="guide-empty">🌫️ Nebbia: stanotte non vedi nulla.</div>`, complete: true, needsDecoy: true };
  }

  if (step.kind === 'medium') {
    const burned = findBurnedOnDay(activeMatch.players, activeMatch.turn - 1);
    const wasWolf = burned && getRoleById(burned.roleId).faction === 'Branco';
    const text = !burned ? '🔥 Ieri nessuno è stato bruciato al rogo.'
      : wasWolf ? `👍 ${escapeHtml(burned.name)}, bruciato ieri, <strong>era un lupo</strong>.`
        : `👎 ${escapeHtml(burned.name)}, bruciato ieri, <strong>non era un lupo</strong>.`;
    return { html: `${title}<div class="guide-result ${wasWolf ? 'result-danger' : 'result-good'}">${text}</div>`, complete: true, needsDecoy: true };
  }

  if (step.kind === 'none') {
    const group = others.length ? `<div class="guide-info">Gli altri del tuo gruppo: <strong>${escapeHtml(joinNames(others))}</strong>.</div>` : '';
    return { html: `${title}${group || '<div class="guide-muted">Stanotte ti svegli e basta.</div>'}`, complete: true, needsDecoy: true };
  }

  // Azioni con un bersaglio: protegge, indaga, segno, copia, uccide, indica
  const picked = getPassVote(step.key, player.id) || [];
  const target = picked[0] ? activeMatch.players.find(p => p.id === picked[0]) : null;
  let result = '';
  if (target) {
    if (step.kind === 'investigate') {
      result = investigateAnswer(target, findRoleOrNull).isWolf
        ? `<div class="guide-result result-danger">👍 Sì: <strong>${escapeHtml(target.name)}</strong> è un lupo.</div>`
        : `<div class="guide-result result-good">👎 No: <strong>${escapeHtml(target.name)}</strong> non è un lupo.</div>`;
    } else if (step.kind === 'protect') {
      result = `<div class="guide-result result-good">🛡️ Stanotte proteggi <strong>${escapeHtml(target.name)}</strong>.</div>`;
    } else if (step.kind === 'mark') {
      result = `<div class="guide-result">${escapeHtml(role.icon)} Domattina verrà annunciato il segno su <strong>${escapeHtml(target.name)}</strong>.</div>`;
    } else if (step.kind === 'copy') {
      const newRoleId = copyResultRoleId(findRoleOrNull(target.roleId), rolesDB);
      const newRole = newRoleId ? getRoleById(newRoleId) : null;
      result = `<div class="guide-result">🎭 Dall'alba sarai: <strong>${newRole ? `${escapeHtml(newRole.icon)} ${escapeHtml(newRole.name)}` : 'senza un ruolo nuovo'}</strong>.</div>`;
    } else if (step.kind === 'kill') {
      result = `<div class="guide-result result-danger">${escapeHtml(role.icon)} Hai scelto <strong>${escapeHtml(target.name)}</strong>.</div>`;
    } else {
      result = `<div class="guide-result">📌 Hai indicato <strong>${escapeHtml(target.name)}</strong>.</div>`;
    }
  }
  const question = step.kind === 'kill' ? 'Chi vuoi colpire? (se vuoi)' : (NIGHT_ACTIONS[step.kind] || NIGHT_ACTIONS.note).question;
  return {
    html: `${title}<div class="guide-question">${escapeHtml(question)}</div>${passTargetGrid(step, player, step.key, picked, step.kind === 'kill')}${result}`,
    complete: picked.length > 0,
    needsDecoy: false
  };
}

// Schermata segreta di un giocatore: le sue mosse (o la finta mossa) e se ha finito
function buildPassAction(player) {
  const plan = currentNightPlan();
  const role = getRoleById(player.roleId);
  const sections = passStepsFor(player, plan).map(st => renderPassSection(st, player));
  const needsDecoy = sections.every(sec => sec.needsDecoy);
  let html = `<div class="pass-role ${getFactionClass(role.faction)}">
      <span class="pass-role-icon">${escapeHtml(role.icon)}</span>
      <span><strong>${escapeHtml(player.name)}, sei: ${escapeHtml(role.name)}</strong><span class="card-subtitle">${escapeHtml(role.faction)}</span></span>
    </div>`;
  html += sections.map(sec => sec.html).join('');
  let complete = sections.every(sec => sec.complete);
  if (needsDecoy) {
    const decoy = activeMatch.pass.decoy[player.id];
    const colors = getMatchColors();
    const peeks = roleTraits(findRoleOrNull(player.roleId)).peeksAtWolves;
    html += `<div class="guide-info">${sections.length ? 'Non hai altro da fare.' : 'Stanotte non hai niente da fare.'} Tocca un nome qualsiasi: non succede nulla, serve solo a non farti scoprire.${peeks ? '<br>👀 Senza Narratore non si può sbirciare.' : ''}</div>
      <div class="target-grid">
        ${activeMatch.players.filter(p => !p.isDead).map(p => `
          <button class="target-btn${decoy === p.id ? ' selected' : ''}" onclick="passDecoy('${p.id}')">
            <span class="target-name">${avatarHtml(p.name, colors[p.id], 'sm')} ${escapeHtml(p.name)}</span>
          </button>`).join('')}
      </div>`;
    complete = complete && !!decoy;
  }
  return { html, complete };
}

function renderPassNight() {
  const pass = ensurePass();
  const total = pass.order.length;
  const body = document.getElementById('guideStep');
  const bar = document.getElementById('guideBottomBar');
  document.getElementById('guideChips').innerHTML = '';
  let html = renderDeathActionsCard();
  let nav = '';
  const player = passPlayer(pass);

  if (pass.stage === 'intro') {
    document.getElementById('guideProgressText').textContent = `Notte ${activeMatch.turn} · senza Narratore`;
    const first = activeMatch.players.find(p => p.id === pass.order[0]);
    html += `<div class="guide-title">🌙 Cala la notte</div>`;
    if (activeMatch.turn === 1 && activeMatch.deckAnnounced) {
      html += `<div class="guide-info">📣 Prima di iniziare, leggete i ruoli in gioco:</div>${phraseHtml(escapeHtml(deckAnnouncement(activeMatch.initialDeckMap, findRoleOrNull)))}`;
    }
    html += phraseHtml(escapeHtml(AUTO_NIGHTFALL_PHRASE));
    const ev = currentRoundEvent();
    if (ev) html += renderEventCard(ev);
    html += `<div class="guide-info">Chi riceve il telefono tocca <strong>"Sono io"</strong>, fa la sua mossa in segreto e tocca <strong>"Fatto"</strong>. Chi non ha niente da fare tocca un nome a caso: così nessuno capisce chi ha poteri.</div>
      <div class="guide-muted">Ordine: ${escapeHtml(pass.order.map(id => (activeMatch.players.find(p => p.id === id) || { name: '?' }).name).join(' → '))}</div>`;
    nav = `<div class="guide-nav"><button class="btn btn-primary guide-next" onclick="passStart()">📱 Inizia: telefono a ${escapeHtml(first ? first.name : '')}</button></div>`;
  } else if (pass.stage === 'cover' && player) {
    document.getElementById('guideProgressText').textContent = `Notte ${activeMatch.turn} · telefono ${pass.index + 1} di ${total}`;
    html += `<div class="pass-cover">
        <div class="guide-muted">📱 Passa il telefono a:</div>
        ${avatarHtml(player.name, getMatchColors()[player.id], 'lg')}
        <div class="pass-cover-name">${escapeHtml(player.name)}</div>
        <div class="guide-muted">Tutti gli altri tengono gli occhi chiusi.</div>
      </div>`;
    nav = `<div class="guide-nav"><button class="btn btn-primary guide-next" onclick="passReveal()">👆 Sono ${escapeHtml(player.name)}: inizio</button></div>`;
  } else if (pass.stage === 'action' && player) {
    document.getElementById('guideProgressText').textContent = `Notte ${activeMatch.turn} · telefono ${pass.index + 1} di ${total}`;
    const action = buildPassAction(player);
    html += action.html;
    nav = `<div class="guide-nav"><button class="btn btn-success guide-next" ${action.complete ? '' : 'disabled'} onclick="passDone()">✅ Fatto: copri e passa il telefono</button></div>`;
  } else {
    pass.stage = 'done';
    document.getElementById('guideProgressText').textContent = `Notte ${activeMatch.turn} · tutti hanno giocato`;
    html += `<div class="guide-title">🌅 Fine della notte</div>${phraseHtml(escapeHtml(AUTO_DONE_PHRASE))}`;
    nav = `<div class="guide-nav"><button class="btn btn-warning guide-next" onclick="finishPassNight()">☀️ Fai sorgere il Giorno ${activeMatch.turn}</button></div>`;
  }

  body.innerHTML = html;
  bar.innerHTML = nav;
  stopEmptyCallTimer();
  maybeNarrateParts(passNarrationKey(pass), passNarration(pass));
}

function passNarration(pass) {
  const player = passPlayer(pass);
  if (pass.stage === 'intro') {
    const lines = [];
    if (activeMatch.turn === 1 && activeMatch.deckAnnounced) lines.push(deckAnnouncement(activeMatch.initialDeckMap, findRoleOrNull));
    lines.push(AUTO_NIGHTFALL_PHRASE);
    const ev = currentRoundEvent();
    if (ev) lines.push(ev.phrase);
    return [{ sound: 'owl' }].concat(lines.map(say => ({ say })));
  }
  if (pass.stage === 'cover' && player) return [{ say: `Passa il telefono a ${player.name}.` }];
  if (pass.stage === 'done') return [{ say: AUTO_DONE_PHRASE }];
  return [];
}

function passStart() {
  const pass = ensurePass();
  pass.stage = 'cover';
  pass.index = 0;
  saveMatchToStorage();
  vibrate('tap');
  renderNarratorGuide();
}

function passReveal() {
  ensurePass().stage = 'action';
  saveMatchToStorage();
  vibrate('reveal');
  renderNarratorGuide();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Tocco su un nome nella schermata segreta (targets = quante persone sceglie; toggle = sì/no della pozione)
function passPick(key, playerId, targets, toggle) {
  const pass = ensurePass();
  const me = passPlayer(pass);
  if (!me || pass.stage !== 'action') return;
  vibrate('tap');
  const current = getPassVote(key, me.id) || [];
  let next;
  if (toggle || playerId === '' || targets <= 1) {
    next = [playerId];
  } else if (current.includes(playerId)) {
    next = current.filter(id => id !== playerId);
  } else if (current.filter(Boolean).length < targets) {
    next = current.filter(Boolean).concat(playerId);
  } else {
    showToast(`Hai già scelto ${targets} persone: toccane una per toglierla.`, 'warn');
    return;
  }
  setPassVote(key, me.id, next);
  saveMatchToStorage();
  renderNarratorGuide();
}

function passDecoy(playerId) {
  const pass = ensurePass();
  const me = passPlayer(pass);
  if (!me) return;
  vibrate('tap');
  pass.decoy[me.id] = playerId;
  saveMatchToStorage();
  renderNarratorGuide();
}

function passDone() {
  const pass = ensurePass();
  const me = passPlayer(pass);
  if (!me || !buildPassAction(me).complete) return;
  vibrate('tap');
  pass.index++;
  pass.stage = pass.index < pass.order.length ? 'cover' : 'done';
  saveMatchToStorage();
  renderNarratorGuide();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Alba: le mosse segrete diventano le scelte della notte, poi tutto come con il Narratore
function finishPassNight() {
  const pass = ensurePass();
  const plan = currentNightPlan();
  const choices = {};
  const inOrder = byPlayer => pass.order.filter(id => byPlayer && byPlayer[id]).map(id => byPlayer[id]);
  plan.forEach(st => {
    if (st.kind === 'intro' || st.kind === 'dawn') return;
    const picked = pickFromVotes(inOrder(pass.votes[st.key]), st.targets || 1);
    if (picked[0]) choices[st.key] = picked[0];
    if (picked[1]) choices[secondTargetKey(st.key)] = picked[1];
    if (st.kind === 'witch') {
      const saves = inOrder(pass.votes[witchSaveKey(st.key)]);
      if (saves.some(list => list[0] === ANY_WOLF_VICTIM)) choices[witchSaveKey(st.key)] = ANY_WOLF_VICTIM;
    }
  });
  activeMatch.nightChoices = choices;
  advanceToDay();
}

/* =========================================================================
   VOCE E SUONI DEL NARRATORE
   A ogni passo nuovo: prima il suono (gufo, ululato, gallo, campanella), poi la voce legge la frase.
   La chiusura delle frasi dei ruoli («...chiude gli occhi») si legge quando si tocca Avanti.
========================================================================= */
let narrationToken = 0;
let lastNarratedKey = null;
let pendingCloseText = '';
let closeSpokenKey = null;
let voiceWarned = false;

function soundsOn() {
  return appSettings.soundsOn !== false;
}

function voiceOn() {
  return appSettings.voiceOn === true;
}

function playSound(name) {
  if (!soundsOn() || typeof LupusSounds === 'undefined') return 0;
  return LupusSounds.play(name) || 0;
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Legge un testo; false = sul telefono manca la voce italiana
async function speakText(text) {
  const clean = speechText(text);
  if (!clean) return true;
  const app = nativeApp();
  if (!app || !app.speak) return false;
  // se il telefono non avvisa quando ha finito di parlare, si va avanti dopo il tempo stimato
  const limit = wait(2500 + clean.length * 90).then(() => true);
  return Promise.race([app.speak(clean), limit]);
}

function stopNarration() {
  narrationToken++;
  const app = nativeApp();
  if (app && app.stopSpeaking) app.stopSpeaking();
}

function voiceUnavailable() {
  if (voiceWarned) return;
  voiceWarned = true;
  showToast('🗣️ Manca la voce italiana: scarica "Sintesi vocale di Google" e la lingua italiana dalle impostazioni del telefono.', 'warn');
  const app = nativeApp();
  if (app && app.installVoice) app.installVoice();
}

// parts = [{ sound }, { say }]: ognuno parte quando il precedente è finito. force = legge anche con la voce spenta.
async function narrate(parts, force = false) {
  const token = ++narrationToken;
  const app = nativeApp();
  if (app && app.stopSpeaking) await app.stopSpeaking();
  for (const part of parts) {
    if (token !== narrationToken) return;
    if (part.sound) {
      const seconds = playSound(part.sound);
      if (seconds) await wait(seconds * 1000);
    } else if (part.say && (force || voiceOn())) {
      const ok = await speakText(part.say);
      if (ok === false) {
        voiceUnavailable();
        return;
      }
    }
  }
}

// 🔊 accanto a una frase: la legge subito, anche con la voce automatica spenta
function sayPhrase(button) {
  const box = button.closest('.guide-phrase');
  const text = box ? box.querySelector('.phrase-text').innerText : '';
  vibrate('tap');
  narrate(text.split(/\n+/).filter(Boolean).map(line => ({ say: line })), true);
}

function narrationKey(step) {
  return `${activeMatch.turn}|${activeMatch.phase}|${step.key}`;
}

// Segna il passo attuale come già letto (dopo una ripresa o un "Annulla", senza rileggere)
function syncNarrationKey() {
  if (!activeMatch || activeMatch.status !== 'playing') return;
  if (isAutoMatch() && activeMatch.phase === 'night') {
    lastNarratedKey = passNarrationKey(ensurePass());
  } else {
    const plan = getGuidePlan();
    lastNarratedKey = narrationKey(plan[getGuideIndex(plan)]);
  }
  pendingCloseText = '';
  stopNarration();
}

// Cosa si sente entrando in un passo
function stepNarration(step) {
  switch (step.kind) {
    case 'intro': return [{ sound: 'owl' }].concat(introPhrases().map(say => ({ say })));
    case 'dawn': return [];
    case 'morning': return [{ sound: 'rooster' }].concat(getMorningLines().map(say => ({ say })));
    case 'debate': return [{ say: DEBATE_PHRASE }];
    case 'vote': return [{ sound: 'bell' }].concat(getVotePhrases().map(say => ({ say })));
    case 'dusk': return [{ say: getDuskPhrase() }];
    default: {
      const parts = step.kind === 'wolves' ? [{ sound: 'howl' }] : [];
      parts.push({ say: splitPhrase(rolePhrase(getStepRoles(step)[0])).open });
      return parts;
    }
  }
}

function maybeNarrateStep(step) {
  maybeNarrateParts(narrationKey(step), stepNarration(step));
}

function maybeNarrateParts(key, stepParts) {
  if (key === lastNarratedKey) return;
  lastNarratedKey = key;
  const parts = pendingCloseText ? [{ say: pendingCloseText }] : [];
  pendingCloseText = '';
  if (parts.length || stepParts.length) narrate(parts.concat(stepParts));
}

// Avanti da un passo di un ruolo: prima si dice «...chiude gli occhi»
function prepareStepClose(step) {
  if (!step || !step.roleIds.length || closeSpokenKey === narrationKey(step)) return;
  pendingCloseText = splitPhrase(rolePhrase(getStepRoles(step)[0])).close;
}

// Chiamata a vuoto: finita l'attesa, la voce chiude la chiamata da sola
function closeEmptyCallAloud(stepKey) {
  if (!voiceOn() || !activeMatch || activeMatch.phase !== 'night') return;
  const step = getGuidePlan().find(st => st.key === stepKey);
  if (!step || activeMatch.guideKey !== stepKey) return;
  closeSpokenKey = narrationKey(step);
  narrate([{ say: splitPhrase(rolePhrase(getStepRoles(step)[0])).close }]);
}

/* =========================================================================
   11. TIMER DEL DIBATTITO DIURNO (DURATA REGOLABILE)
========================================================================= */
function formatTimer(sec) {
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function updateTimerUI() {
  [['dayTimerDisplay', 'btnDayTimerPlay'], ['tableTimer', 'tableTimerPlay']].forEach(([displayId, buttonId]) => {
    const disp = document.getElementById(displayId);
    const btn = document.getElementById(buttonId);
    if (disp) {
      disp.textContent = formatTimer(dayTimerSeconds);
      disp.classList.toggle('expired', dayTimerSeconds === 0);
    }
    if (btn) btn.textContent = dayTimerInterval ? '⏸️ Pausa' : '▶️ Via';
  });
}

function getTimerDuration() {
  const saved = Number(appSettings.dayTimerSeconds);
  return saved >= 30 && saved <= 1200 ? saved : DEFAULT_DAY_TIMER_SECONDS;
}

// Durata del dibattito di oggi: la metà con l'evento "Processo lampo"
function getDebateDuration() {
  const full = getTimerDuration();
  return activeMatch && dayEventIs('shortDebate') ? Math.max(30, Math.round(full / 60) * 30) : full;
}

// Il timer usa l'orario di fine: resta preciso anche se il telefono rallenta o lo schermo si spegne.
let dayTimerEndsAt = 0;

function startPauseDayTimer() {
  if (dayTimerInterval) {
    stopDayTimer();
  } else {
    if (dayTimerSeconds <= 0) dayTimerSeconds = getDebateDuration();
    dayTimerEndsAt = Date.now() + dayTimerSeconds * 1000;
    dayTimerInterval = setInterval(() => {
      dayTimerSeconds = Math.max(0, Math.ceil((dayTimerEndsAt - Date.now()) / 1000));
      updateTimerUI();
      if (dayTimerSeconds === 0) {
        stopDayTimer();
        vibrate('alert');
        playSound('bells');
        showToast('⏰ Tempo del dibattito scaduto! Si passa ai voti.', 'warn');
      }
    }, 250);
  }
  updateTimerUI();
}

function adjustDayTimer(delta) {
  const running = !!dayTimerInterval;
  if (running) {
    dayTimerEndsAt += delta * 1000;
    dayTimerSeconds = Math.max(0, Math.ceil((dayTimerEndsAt - Date.now()) / 1000));
    if (dayTimerSeconds < 1) {
      dayTimerEndsAt = Date.now() + 1000;
      dayTimerSeconds = 1;
    }
  } else {
    dayTimerSeconds = Math.min(1200, Math.max(30, (dayTimerSeconds || getTimerDuration()) + delta));
    // La durata scelta da fermo diventa quella predefinita delle prossime volte (intera anche durante il Processo lampo).
    appSettings.dayTimerSeconds = activeMatch && dayEventIs('shortDebate') ? Math.min(1200, dayTimerSeconds * 2) : dayTimerSeconds;
    saveSettingsToStorage();
  }
  updateTimerUI();
}

function stopDayTimer() {
  if (dayTimerInterval) {
    clearInterval(dayTimerInterval);
    dayTimerInterval = null;
  }
  updateTimerUI();
}

function resetDayTimer() {
  stopDayTimer();
  dayTimerSeconds = getDebateDuration();
  updateTimerUI();
}

/* =========================================================================
   12. SCHEDA GIOCATORI: STATO E CORREZIONI
   Le scelte della notte si fanno nella Guida; qui si correggono morti, Fantasma e note.
========================================================================= */
// Etichette "di stanotte" per ogni giocatore, prese dalle scelte della guida
function getNightTagsByPlayer() {
  const tags = {};
  const add = (id, text) => { (tags[id] = tags[id] || []).push(text); };
  const labelFor = (step, mainRole) => ({
    wolves: '🐺 Scelto dai lupi',
    kill: `${mainRole.icon} Colpito`,
    protect: `${mainRole.icon} Protetto`,
    investigate: `${mainRole.icon} Indagato`,
    mark: `${mainRole.icon} Segno`,
    copy: `${mainRole.icon} Copiato`,
    witch: `${mainRole.icon} Avvelenato`,
    note: `${mainRole.icon} Indicato`
  })[step.kind];

  if (activeMatch.phase === 'night') {
    const plan = currentNightPlan();
    plan.forEach(step => {
      const target = (activeMatch.nightChoices || {})[step.key];
      if (!target) return;
      const text = labelFor(step, getStepRoles(step)[0] || {});
      if (text) add(target, text);
      const second = (activeMatch.nightChoices || {})[secondTargetKey(step.key)];
      if (step.kind === 'wolves' && (step.targets || 1) > 1 && second) add(second, text);
    });
    plan.filter(step => step.kind === 'witch').forEach(step => {
      const saved = (activeMatch.nightChoices || {})[witchSaveKey(step.key)];
      if (saved) add(saved, `${getStepRoles(step)[0].icon} Pozione della vita`);
    });
    // chi è stato protetto ieri non può esserlo di nuovo (se la regola è attiva)
    Object.entries(activeMatch.prevNightChoices || {}).forEach(([key, id]) => {
      const step = plan.find(st => st.key === key);
      if (step && step.kind === 'protect' && roleActionRules(findRoleOrNull(step.roleIds[0])).notSameTwice) add(id, '🛡️ Protetto ieri');
    });
  } else if (activeMatch.lastNightResult && activeMatch.lastNightResult.turn === activeMatch.turn) {
    activeMatch.lastNightResult.saved.forEach(x => add(x.playerId, '🛡️ Salvato stanotte'));
    activeMatch.lastNightResult.marks.forEach(m => add(m.playerId, `${getRoleById(m.roleId).icon} Segno stanotte`));
  }
  return tags;
}

function renderNarratorPlayersList() {
  const container = document.getElementById('narratorPlayersList');
  container.innerHTML = renderDeathActionsCard();
  const nightTags = getNightTagsByPlayer();
  const colors = getMatchColors();

  activeMatch.players.forEach(p => {
    const role = getRoleById(p.roleId);
    const origRole = getRoleById(p.originalRoleId);
    const factionClass = getFactionBadgeClass(role.faction);

    let badgesHtml = '';
    const deathWhen = escapeHtml(describeDeath(p));
    if (p.isGhost) {
      badgesHtml += `<span class="status-pill status-ghost">👻 Fantasma (vota in silenzio)${deathWhen ? ' • ' + deathWhen : ''}</span>`;
    } else if (p.isDead) {
      badgesHtml += `<span class="status-pill status-dead">💀 Morto${deathWhen ? ' • ' + deathWhen : ''}</span>`;
    } else {
      badgesHtml += `<span class="status-pill status-alive">● Vivo</span>`;
    }
    (nightTags[p.id] || []).forEach(t => {
      badgesHtml += `<span class="status-pill status-active-badge">${escapeHtml(t)}</span>`;
    });
    if (p.extraPin) badgesHtml += `<span class="status-pill status-active-badge">📌 Nota</span>`;

    const wasCopied = p.originalRoleId !== p.roleId;

    const card = document.createElement('div');
    card.className = 'narrator-player-card ' + getFactionClass(role.faction) + (p.isDead ? ' is-dead' : '') + (p.isGhost ? ' is-ghost' : '');
    card.innerHTML = `
      <div class="np-top">
        <div class="np-identity">
          <div class="np-name-row">
            ${avatarHtml(p.name, colors[p.id])}
            <span class="np-name">${escapeHtml(p.name)}</span>
            <span class="badge ${factionClass}">${escapeHtml(role.icon)} ${escapeHtml(role.name)}</span>
            ${wasCopied ? `<span class="badge">🎭 Ex-${escapeHtml(origRole.name)}</span>` : ''}
          </div>
          <div class="np-badges" style="margin-top: 4px;">
            ${badgesHtml}
          </div>
        </div>
        <button class="icon-btn" style="height: 34px; min-width: 34px; font-size: 0.85rem;" onclick="openAntiAmnesiaForPlayer('${p.id}')" title="Mostra carta ruolo a questo giocatore">
          🃏
        </button>
      </div>

      <div class="np-actions np-actions-3">
        <button class="np-action-btn ${p.isDead ? 'active-kill' : ''}" onclick="togglePlayerKill('${p.id}')" title="Elimina / Uccidi giocatore">${p.isDead ? '💚 Riporta in vita' : '❌ Morto'}</button>
        <button class="np-action-btn ${p.isGhost ? 'active-ghost' : ''}" onclick="togglePlayerGhost('${p.id}')" title="Attiva/Disattiva Fantasma">👻 Fantasma</button>
        <button class="np-action-btn ${p.extraPin ? 'active-pin' : ''}" onclick="toggleNotePin('${p.id}')" title="Segnalino per ricordarti qualcosa">📌 Nota</button>
      </div>
    `;
    container.appendChild(card);
  });
}

/* ---------- Colpo di chi muore (es. il Cacciatore) ---------- */
function getPendingDeathActions() {
  return (activeMatch.pendingDeathActions || [])
    .map(a => activeMatch.players.find(p => p.id === a.playerId))
    .filter(p => p && p.isDead);
}

// Riquadro "chi porta con sé?": in cima alla guida e alla scheda Giocatori finché non si sceglie
function renderDeathActionsCard() {
  const pending = getPendingDeathActions();
  if (!pending.length) return '';
  const colors = getMatchColors();
  return pending.map(shooter => {
    const role = getRoleById(shooter.roleId);
    const targets = activeMatch.players.filter(p => !p.isDead);
    return `
      <div class="death-shot-card">
        <div class="guide-title">${escapeHtml(role.icon)} ${escapeHtml(shooter.name)} è morto: chi porta con sé?</div>
        ${phraseHtml(`«${escapeHtml(shooter.name)} si rivela: ${escapeHtml(role.name)}! Prima di morire, sceglie qualcuno da portare con sé...»`)}
        <div class="target-grid">
          ${targets.map(t => `
            <button class="target-btn" onclick="resolveDeathShot('${shooter.id}', '${t.id}')">
              <span class="target-name">${avatarHtml(t.name, colors[t.id], 'sm')} ${escapeHtml(t.name)}</span>
            </button>`).join('')}
        </div>
        <button class="btn btn-sm" onclick="resolveDeathShot('${shooter.id}', '')">Nessuno</button>
        <div class="guide-muted">Finché non scegli, l'app non controlla la vittoria.</div>
      </div>`;
  }).join('');
}

function resolveDeathShot(shooterId, targetId) {
  const shooter = activeMatch.players.find(p => p.id === shooterId);
  const target = targetId ? activeMatch.players.find(p => p.id === targetId) : null;
  if (!shooter) return;
  const message = target ? `${getRoleById(shooter.roleId).icon} ${shooter.name} ha portato con sé ${target.name}` : `${shooter.name} non ha portato con sé nessuno`;
  doWithUndo(message, () => {
    activeMatch.pendingDeathActions = (activeMatch.pendingDeathActions || []).filter(a => a.playerId !== shooterId);
    if (target && !target.isDead) {
      killPlayer(target, 'altro', { killedBy: shooter.id });
    } else {
      saveMatchToStorage();
      renderNarratorDashboard();
    }
  });
}

function toggleNotePin(playerId) {
  const p = activeMatch.players.find(item => item.id === playerId);
  if (!p) return;
  p.extraPin = !p.extraPin;
  saveMatchToStorage();
  renderNarratorPlayersList();
}

function describeDeath(p) {
  if (!p.isDead || !p.diedOnTurn) return '';
  if (p.deathCause === 'rogo') return `🔥 Rogo G${p.diedOnTurn}`;
  if (p.deathCause === 'notte') return `🌙 Notte ${p.diedOnTurn}`;
  const killer = p.killedBy ? activeMatch.players.find(x => x.id === p.killedBy) : null;
  if (killer) return `🎯 Portato via da ${killer.name}`;
  return p.diedInPhase === 'night' ? `🌙 Notte ${p.diedOnTurn}` : `G${p.diedOnTurn}`;
}

// ❌ sulla riga del giocatore: di notte segna subito la morte; di giorno chiede come è morto.
function togglePlayerKill(playerId) {
  const p = activeMatch.players.find(item => item.id === playerId);
  if (!p) return;

  if (p.isDead) {
    revivePlayer(p);
    return;
  }

  if (activeMatch.phase === 'day') {
    openDeathCauseModal(p);
  } else {
    killPlayer(p, 'notte');
  }
}

function openDeathCauseModal(p) {
  pendingDeathPlayerId = p.id;
  document.getElementById('deathCauseTitle').textContent = `❌ Come è morto ${p.name}?`;
  document.getElementById('deathCauseNightLabel').textContent = `🌙 Morto stanotte (Notte ${activeMatch.turn})`;
  document.getElementById('modalDeathCause').classList.add('active');
}

function closeDeathCauseModal() {
  document.getElementById('modalDeathCause').classList.remove('active');
  pendingDeathPlayerId = null;
}

function confirmDeathCause(cause) {
  const p = activeMatch && activeMatch.players.find(item => item.id === pendingDeathPlayerId);
  closeDeathCauseModal();
  if (p && !p.isDead) killPlayer(p, cause);
}

// opts.silent = true: niente salvataggio né ridisegno (li fa chi chiama, per più morti insieme)
// opts.quiet = true: niente avviso del rogo (lo mostra già "Annulla")
// opts.killedBy = id di chi l'ha portato con sé morendo (es. il Cacciatore)
function killPlayer(p, cause, opts = {}) {
  const role = getRoleById(p.roleId);
  p.isDead = true;
  p.deathCause = cause;
  p.diedOnTurn = activeMatch.turn;
  p.diedInPhase = cause === 'notte' ? 'night' : cause === 'rogo' ? 'day' : activeMatch.phase;
  p.killedBy = opts.killedBy || null;

  // Chi quando muore porta con sé un giocatore (es. il Cacciatore): la guida chiede chi
  if (hasDeathShot(findRoleOrNull(p.roleId))) {
    if (!Array.isArray(activeMatch.pendingDeathActions)) activeMatch.pendingDeathActions = [];
    if (!activeMatch.pendingDeathActions.some(a => a.playerId === p.id)) activeMatch.pendingDeathActions.push({ playerId: p.id });
  }

  // Riattiva controllo banner vittoria a ogni nuova eliminazione
  activeMatch.victoryDismissed = false;

  if (cause === 'rogo' && !opts.quiet && !opts.silent) {
    showToast(`🔥 ${p.name} è stato bruciato al rogo.`);
  }

  // Logica del Fantasma: se la regola è attiva, ancora nessuno è Fantasma, e il giocatore è della fazione "Villaggio"
  const anyGhostAlready = activeMatch.players.some(other => other.isGhost);
  if (activeMatch.ghostRule && !anyGhostAlready && role.faction === 'Villaggio') {
    p.isGhost = true;
    showToast(`👻 È il primo buono a morire: ${p.name} diventa il Fantasma!`, 'ghost');
  }

  if (opts.silent) return;
  vibrate('death');
  saveMatchToStorage();
  renderNarratorDashboard();
}

function revivePlayer(p) {
  p.isDead = false;
  p.isGhost = false;
  p.deathCause = null;
  p.diedOnTurn = null;
  p.diedInPhase = null;
  p.killedBy = null;
  activeMatch.pendingDeathActions = (activeMatch.pendingDeathActions || []).filter(a => a.playerId !== p.id);
  showToast(`💚 ${p.name} è di nuovo vivo.`);
  saveMatchToStorage();
  renderNarratorDashboard();
}

function togglePlayerGhost(playerId) {
  const p = activeMatch.players.find(item => item.id === playerId);
  if (!p) return;

  p.isGhost = !p.isGhost;
  if (p.isGhost && !p.isDead) {
    // Il Fantasma è un giocatore morto con diritto di voto
    p.isDead = true;
    p.deathCause = p.deathCause || 'altro';
    p.diedOnTurn = p.diedOnTurn || activeMatch.turn;
    p.diedInPhase = p.diedInPhase || activeMatch.phase;
    activeMatch.victoryDismissed = false;
  }
  saveMatchToStorage();
  renderNarratorDashboard();
}

/* =========================================================================
   13. SCHERMATA/MODALE 4: FUNZIONE "ANTI-AMNESIA"
========================================================================= */
let currentAntiAmnesiaPlayerId = null;

function openAntiAmnesiaSelector() {
  if (!activeMatch) return;
  const container = document.getElementById('antiAmnesiaPlayerButtons');
  container.innerHTML = '';

  activeMatch.players.forEach(p => {
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.style.justifyContent = 'space-between';
    btn.onclick = () => openAntiAmnesiaForPlayer(p.id);
    btn.innerHTML = `
      <span>👤 <strong>${escapeHtml(p.name)}</strong></span>
      <span class="badge">${p.isDead ? (p.isGhost ? '👻 Fantasma' : '💀 Morto') : 'Mostra carta ➡️'}</span>
    `;
    container.appendChild(btn);
  });

  document.getElementById('modalAntiAmnesiaSelect').classList.add('active');
}

function openAntiAmnesiaForPlayer(playerId) {
  const p = activeMatch.players.find(item => item.id === playerId);
  if (!p) return;

  currentAntiAmnesiaPlayerId = playerId;
  document.getElementById('modalAntiAmnesiaSelect').classList.remove('active');

  // Schermata coperta: il ruolo si vede solo tenendo premuto il pulsante
  document.getElementById('aaCoverPlayerName').textContent = p.name;
  setAvatar('aaCoverAvatar', p);
  document.getElementById('btnAaReveal').textContent = `👆 ${p.name}, tieni premuto qui per vedere il tuo ruolo`;
  document.getElementById('aaStepCard').classList.remove('visible');

  document.getElementById('modalAntiAmnesiaSafeView').classList.add('active');
}

function closeAntiAmnesiaModal() {
  document.getElementById('modalAntiAmnesiaSelect').classList.remove('active');
  document.getElementById('modalAntiAmnesiaSafeView').classList.remove('active');
  document.getElementById('aaStepCard').classList.remove('visible');
  currentAntiAmnesiaPlayerId = null;
}

/* =========================================================================
   14. SCHERMATA/MODALE 5: FINE PARTITA E "RIVINCITA RAPIDA"
========================================================================= */
function openGameMenuModal() {
  if (activeMatch) {
    syncMatchOptionToggles();
  }
  document.getElementById('menuVersionLabel').textContent = `Lupus v${getAppVersion()}`;
  document.getElementById('modalGameMenu').classList.add('active');
}

function closeGameMenuModal() {
  document.getElementById('modalGameMenu').classList.remove('active');
}

// Dal menu ⚙️ chiede conferma se la partita non è ancora finita (dal banner di vittoria no).
function confirmQuickRematch() {
  doWithUndo('🔄 Ruoli rimescolati: passa il telefono', () => quickRematch(true));
}

function confirmReturnToSetup() {
  doWithUndo('🏠 Partita chiusa', returnToSetupScreen);
}

// quiet = true: niente avviso (lo mostra già "Annulla")
function quickRematch(quiet = false) {
  closeGameMenuModal();
  stopDayTimer();

  if (!activeMatch) return;

  // Mantiene esattamente gli stessi giocatori e lo stesso mazzo iniziale, rimescola e riparte da "Passa il telefono"
  const deckMap = activeMatch.initialDeckMap || appSettings.selectedDeck;
  const playerNames = activeMatch.players.map(p => p.name);
  setupPlayers = [...playerNames];
  appSettings.selectedDeck = { ...deckMap };
  savePlayersToStorage();
  saveSettingsToStorage();

  if (startDistributionPhase() && !quiet) {
    showToast('🔄 Ruoli rimescolati! Passa il telefono per la nuova partita.');
  }
}

function returnToSetupScreen() {
  closeGameMenuModal();
  stopDayTimer();

  activeMatch = null;
  saveMatchToStorage();
  renderSetupScreen();
  showScreen('screenSetup');
}

/* =========================================================================
   16. INFORMAZIONI E AGGIORNAMENTI DELL'APP
   L'unico collegamento a internet dell'app: chiede a GitHub qual è l'ultima versione.
========================================================================= */
function loadUpdateState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.UPDATES) || 'null');
    if (saved && typeof saved === 'object') return saved;
  } catch (e) {}
  return { lastCheck: null, latestVersion: null, apkUrl: null, pageUrl: null, dismissedVersion: null };
}

function saveUpdateState(state) {
  try { localStorage.setItem(STORAGE_KEYS.UPDATES, JSON.stringify(state)); } catch (e) {}
}

function getAvailableUpdate() {
  const state = loadUpdateState();
  if (state.latestVersion && isNewerVersion(state.latestVersion, getAppVersion())) return state;
  return null;
}

async function checkForUpdates() {
  if (navigator.onLine === false) return { kind: 'offline' };
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => ctrl && ctrl.abort(), 10000);
  try {
    const res = await fetch(UPDATE_API_URL, {
      headers: { Accept: 'application/vnd.github+json' },
      cache: 'no-store',
      signal: ctrl ? ctrl.signal : undefined
    });
    if (!res.ok) return { kind: 'error' };
    const release = parseRelease(await res.json());
    if (!release) return { kind: 'error' };
    const state = loadUpdateState();
    state.lastCheck = new Date().toISOString();
    state.latestVersion = release.version;
    state.apkUrl = release.apkUrl;
    state.pageUrl = release.pageUrl;
    saveUpdateState(state);
    return isNewerVersion(release.version, getAppVersion()) ? { kind: 'available', release } : { kind: 'current', release };
  } catch (e) {
    return { kind: navigator.onLine === false ? 'offline' : 'error' };
  } finally {
    clearTimeout(timer);
  }
}

// All'avvio, al massimo una volta al giorno, solo nell'app installata e solo con internet.
async function autoCheckForUpdates() {
  if (!isNativeApp()) return;
  const state = loadUpdateState();
  if (!shouldAutoCheck(state.lastCheck, new Date())) return;
  const result = await checkForUpdates();
  if (result.kind === 'available') renderUpdateBanner();
}

function renderUpdateBanner() {
  const banner = document.getElementById('updateBanner');
  const update = getAvailableUpdate();
  if (!update || update.dismissedVersion === update.latestVersion) {
    banner.style.display = 'none';
    return;
  }
  document.getElementById('updateBannerText').textContent =
    `È uscita la versione ${update.latestVersion} (tu hai la ${getAppVersion()}). Scaricala e installala sopra: partite e ruoli restano.`;
  banner.style.display = 'flex';
}

function dismissUpdateBanner() {
  const state = loadUpdateState();
  state.dismissedVersion = state.latestVersion;
  saveUpdateState(state);
  renderUpdateBanner();
}

function downloadUpdate() {
  const update = getAvailableUpdate();
  const url = (update && (update.apkUrl || update.pageUrl)) || UPDATE_PAGE_URL;
  openExternalLink(url);
  showToast('⬇️ Download avviato: quando finisce apri il file e tocca "Aggiorna".');
}

function openExternalLink(url) {
  const app = nativeApp();
  if (app && app.openExternal) {
    app.openExternal(url);
    return;
  }
  window.open(url, '_blank', 'noopener');
}

function openInfoModal() {
  closeGameMenuModal();
  document.getElementById('infoVersion').textContent = `Versione ${getAppVersion()}`;
  renderInfoUpdateStatus();
  document.getElementById('modalInfo').classList.add('active');
}

function closeInfoModal() {
  document.getElementById('modalInfo').classList.remove('active');
}

function renderInfoUpdateStatus(message) {
  const statusEl = document.getElementById('infoUpdateStatus');
  const downloadBtn = document.getElementById('btnInfoDownload');
  const update = getAvailableUpdate();
  if (message) {
    statusEl.textContent = message;
  } else if (update) {
    statusEl.textContent = `🆕 È disponibile la versione ${update.latestVersion}.`;
  } else {
    const state = loadUpdateState();
    statusEl.textContent = state.lastCheck
      ? `Ultimo controllo: ${new Date(state.lastCheck).toLocaleString('it-IT', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}.`
      : 'Non hai ancora controllato gli aggiornamenti.';
  }
  downloadBtn.style.display = update ? 'inline-flex' : 'none';
}

async function manualCheckForUpdates() {
  const btn = document.getElementById('btnInfoCheck');
  btn.disabled = true;
  btn.textContent = '⏳ Controllo in corso...';
  const result = await checkForUpdates();
  btn.disabled = false;
  btn.textContent = '🔄 Controlla aggiornamenti';
  const messages = {
    available: `🆕 È disponibile la versione ${result.release ? result.release.version : ''}!`,
    current: '✅ Hai già l\'ultima versione.',
    offline: '📵 Sei offline: collegati a internet e riprova.',
    error: '⚠️ Non sono riuscito a controllare. Riprova tra poco.'
  };
  if (result.kind === 'available') {
    const state = loadUpdateState();
    state.dismissedVersion = null;
    saveUpdateState(state);
  }
  renderInfoUpdateStatus(messages[result.kind]);
  renderUpdateBanner();
}

/* =========================================================================
   15. UTILITY DI SICUREZZA HTML
========================================================================= */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* =========================================================================
   17. VOTAZIONE AL ROGO
   Ogni votante sceglie chi vuole al rogo; chi ha il voto doppio (es. il Sindaco) vale 2, il Fantasma vota.
   I voti restano salvati nella partita (activeMatch.vote) fino al cambio di fase.
========================================================================= */
function getCurrentVote() {
  if (!activeMatch) return null;
  if (!activeMatch.vote || activeMatch.vote.turn !== activeMatch.turn) {
    activeMatch.vote = { turn: activeMatch.turn, round: 1, candidates: null, votes: {} };
  }
  return activeMatch.vote;
}

function openVoteModal() {
  if (!activeMatch || activeMatch.phase !== 'day') return;
  getCurrentVote();
  renderVoteVoters();
  renderVoteTally();
  document.getElementById('modalVote').classList.add('active');
}

function closeVoteModal() {
  document.getElementById('modalVote').classList.remove('active');
}

function getVoteCandidates(vote) {
  const alive = activeMatch.players.filter(p => !p.isDead);
  if (!vote.candidates) return alive;
  return alive.filter(p => vote.candidates.includes(p.id));
}

function renderVoteVoters() {
  const vote = getCurrentVote();
  const candidates = getVoteCandidates(vote);
  document.getElementById('voteTitle').textContent =
    `🗳️ Votazione al rogo • Giorno ${activeMatch.turn}${vote.round > 1 ? ' • Ballottaggio' : ''}`;

  const container = document.getElementById('voteVotersList');
  container.innerHTML = '';
  // Niente icone dei ruoli: la finestra può essere mostrata al tavolo senza svelare nulla.
  const colors = getMatchColors();
  getVoters(activeMatch.players).forEach(voter => {
    const weight = voteWeight(voter, findRoleOrNull(voter.roleId));
    const tags = [];
    if (weight === 2 && !isAutoMatch()) tags.push('<span class="badge badge-alleato">🎖️ vale 2</span>');
    if (voter.isGhost) tags.push('<span class="badge badge-solitario">👻 Fantasma</span>');
    const current = vote.votes[voter.id] || '';
    const options = candidates.map(c =>
      `<option value="${c.id}" ${current === c.id ? 'selected' : ''}>${escapeHtml(c.name)}${c.id === voter.id ? ' (sé stesso)' : ''}</option>`
    ).join('');
    const row = document.createElement('div');
    row.className = 'vote-row';
    row.innerHTML = `
      <div class="vote-voter">
        ${avatarHtml(voter.name, colors[voter.id], 'sm')}
        <strong>${escapeHtml(voter.name)}</strong>
        ${tags.join('')}
      </div>
      <select class="select-field vote-select" onchange="setVote('${voter.id}', this.value)">
        <option value="">— non ha votato —</option>
        ${options}
      </select>
    `;
    container.appendChild(row);
  });
}

function setVote(voterId, targetId) {
  vibrate('tap');
  const vote = getCurrentVote();
  if (targetId) vote.votes[voterId] = targetId;
  else delete vote.votes[voterId];
  saveMatchToStorage();
  renderVoteTally();
}

function renderVoteTally() {
  const vote = getCurrentVote();
  const tally = tallyVotes(activeMatch.players, vote.votes, findRoleOrNull, vote.candidates);
  const nameOf = id => (activeMatch.players.find(p => p.id === id) || { name: '?' }).name;

  document.getElementById('voteProgress').textContent = `Hanno votato ${tally.castCount} su ${tally.voterCount}`;

  const rows = tally.totals.filter(r => r.votes > 0 || vote.candidates);
  document.getElementById('voteTally').innerHTML = rows.length
    ? rows.map(r => {
        const isLeader = tally.leaders.includes(r.playerId);
        const width = tally.maxVotes ? Math.round((r.votes / tally.maxVotes) * 100) : 0;
        return `
          <div class="tally-row${isLeader ? ' tally-leader' : ''}">
            <div class="tally-bar" style="width: ${width}%;"></div>
            <span class="tally-name">${isLeader ? '🔥 ' : ''}${escapeHtml(r.name)}</span>
            <span class="tally-votes">${r.votes} ${r.votes === 1 ? 'voto' : 'voti'}</span>
          </div>`;
      }).join('')
    : '<div class="card-subtitle">Nessun voto ancora: scegli per ogni giocatore chi vuole mandare al rogo.</div>';

  const actions = document.getElementById('voteActions');
  if (tally.leaders.length === 1) {
    const leaderId = tally.leaders[0];
    actions.innerHTML = `<button class="btn btn-warning" onclick="burnFromVote('${leaderId}')">🔥 Brucia ${escapeHtml(nameOf(leaderId))} (${tally.maxVotes} ${tally.maxVotes === 1 ? 'voto' : 'voti'})</button>`;
  } else if (tally.leaders.length > 1) {
    const names = tally.leaders.map(nameOf);
    const outcome = tieOutcome(getTieRule(), activeMatch.players, findRoleOrNull);
    let html = `<div class="scaletta-highlight">⚖️ Pareggio tra <strong>${escapeHtml(names.join(', '))}</strong> con ${tally.maxVotes} voti.</div>`;
    if (outcome.kind === 'none') {
      html += `<div class="card-subtitle">Con la regola scelta, quando c'è un pareggio oggi nessuno va al rogo.</div>
        <button class="btn btn-primary" onclick="closeVoteModal()">🕊️ Nessuno al rogo</button>`;
    } else if (outcome.kind === 'decider') {
      html += `<div class="card-subtitle">Decide <strong>${escapeHtml(nameOf(outcome.deciderId))}</strong> (voto doppio): chi va al rogo?</div>
        ${tally.leaders.map(id => `<button class="btn btn-warning" onclick="burnFromVote('${id}')">🔥 Brucia ${escapeHtml(nameOf(id))}</button>`).join('')}`;
    } else {
      if (getTieRule() === 'decider') html += '<div class="card-subtitle">Nessuno ha il voto doppio: si fa il ballottaggio.</div>';
      html += `<button class="btn btn-primary" onclick="startRunoff()">⚖️ Ballottaggio tra ${escapeHtml(names.join(' e '))}</button>`;
    }
    actions.innerHTML = html;
  } else {
    actions.innerHTML = '';
  }
  document.getElementById('btnVoteRestart').style.display = vote.round > 1 ? 'inline-flex' : 'none';
  renderTableView();
}

function startRunoff() {
  const vote = getCurrentVote();
  const tally = tallyVotes(activeMatch.players, vote.votes, findRoleOrNull, vote.candidates);
  if (tally.leaders.length < 2) return;
  vote.candidates = tally.leaders.slice();
  vote.votes = {};
  vote.round += 1;
  saveMatchToStorage();
  renderVoteVoters();
  renderVoteTally();
  document.querySelector('#modalVote .modal-box').scrollTop = 0;
  showToast('⚖️ Ballottaggio: si vota di nuovo solo tra i giocatori in pareggio.');
}

function resetVotes() {
  const vote = getCurrentVote();
  vote.votes = {};
  saveMatchToStorage();
  renderVoteVoters();
  renderVoteTally();
}

function restartVoteFromScratch() {
  activeMatch.vote = null;
  getCurrentVote();
  saveMatchToStorage();
  renderVoteVoters();
  renderVoteTally();
}

function burnFromVote(playerId) {
  const p = activeMatch.players.find(item => item.id === playerId);
  if (!p || p.isDead) return;
  doWithUndo(`🔥 ${p.name} bruciato al rogo`, () => {
    closeVoteModal();
    killPlayer(p, 'rogo', { quiet: true });
  });
}

/* =========================================================================
   18. RIEPILOGO DELLA PARTITA (RUOLI SVELATI E CRONOLOGIA)
========================================================================= */
function openSummaryModal() {
  if (!activeMatch) return;
  closeGameMenuModal();

  // Cronologia: notti già risolte + le scelte della notte in corso
  const logs = (activeMatch.nightLogs || []).slice();
  if (activeMatch.phase === 'night') {
    const plan = currentNightPlan();
    logs.push({ turn: activeMatch.turn, entries: resolveNight(activeMatch.players, plan, activeMatch.nightChoices || {}, rolesDB).entries });
  }
  const timeline = buildTimeline(activeMatch.players, logs, findRoleOrNull);

  const win = evaluateVictoryCondition();
  document.getElementById('summaryWinner').innerHTML = win
    ? `<div class="victory-title">${escapeHtml(win.text)}</div>`
    : `<div class="card-subtitle">Partita ancora in corso: ${escapeHtml(getPhaseLabel(activeMatch))}.</div>`;

  const factions = ['Branco', 'Alleato dei Lupi', 'Solitario', 'Villaggio'];
  const colors = getMatchColors();
  const groups = factions.map(faction => {
    const members = activeMatch.players.filter(p => getRoleById(p.roleId).faction === faction);
    if (!members.length) return '';
    const rows = members.map(p => {
      const role = getRoleById(p.roleId);
      const wasCopione = p.originalRoleId !== p.roleId ? ` <span class="card-subtitle">(era ${escapeHtml(getRoleById(p.originalRoleId).name)})</span>` : '';
      const status = p.isGhost ? '👻' : p.isDead ? '💀' : '🟢';
      const when = describeDeath(p);
      return `<div class="summary-player">${status} ${avatarHtml(p.name, colors[p.id], 'sm')} <strong>${escapeHtml(p.name)}</strong> — ${escapeHtml(role.icon)} ${escapeHtml(role.name)}${wasCopione}${when ? ` <span class="card-subtitle">• ${escapeHtml(when)}</span>` : ''}</div>`;
    }).join('');
    return `<div class="summary-group"><span class="badge ${getFactionBadgeClass(faction)}">${escapeHtml(faction)}</span>${rows}</div>`;
  }).join('');
  document.getElementById('summaryRoles').innerHTML = groups;

  document.getElementById('summaryTimeline').innerHTML = timeline.length
    ? timeline.map(e => `
        <div class="summary-turn ${e.phase === 'night' ? 'summary-night' : 'summary-day'}">
          <div class="summary-turn-title">${escapeHtml(e.title)}</div>
          ${e.lines.map(l => `<div>${escapeHtml(l)}</div>`).join('')}
        </div>`).join('')
    : '<div class="card-subtitle">Ancora niente da raccontare: le scelte della notte e i morti compariranno qui.</div>';

  document.getElementById('modalSummary').classList.add('active');
  document.querySelector('#modalSummary .modal-box').scrollTop = 0;
}

function closeSummaryModal() {
  document.getElementById('modalSummary').classList.remove('active');
}

/* =========================================================================
   19. RUOLO VISIBILE SOLO CON IL DITO PREMUTO
   Il ruolo compare finché il giocatore tiene premuto il pulsante e sparisce appena alza il dito.
========================================================================= */
let distRoleSeen = false;

function setupHoldToReveal(button, show, hide) {
  let active = false;
  const start = e => {
    if (active) return;
    if (e && e.preventDefault) e.preventDefault();
    active = true;
    if (e && e.pointerId !== undefined) {
      try { button.setPointerCapture(e.pointerId); } catch (err) {}
    }
    show();
  };
  const end = () => {
    if (!active) return;
    active = false;
    hide();
  };
  button.addEventListener('pointerdown', start);
  button.addEventListener('pointerup', end);
  button.addEventListener('pointercancel', end);
  button.addEventListener('lostpointercapture', end);
  button.addEventListener('contextmenu', e => e.preventDefault());
  // Tastiera (accessibilità): Spazio o Invio tenuti premuti
  button.addEventListener('keydown', e => {
    if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) start(e);
  });
  button.addEventListener('keyup', e => {
    if (e.key === ' ' || e.key === 'Enter') end();
  });
  // Se l'app va in secondo piano mentre il ruolo è visibile, lo nasconde.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') end();
  });
}

function fillRoleCard(prefix, player) {
  const role = getRoleById(player.roleId);
  const overlay = document.getElementById(prefix === 'dist' ? 'distStepReveal' : 'aaStepCard');
  overlay.querySelector('.hold-reveal-card').className = 'pass-card hold-reveal-card ' + getFactionClass(role.faction);
  document.getElementById(prefix + 'PlayerName').innerHTML = `${avatarHtml(player.name, getPlayerColor(player.id), 'sm')} ${escapeHtml(player.name)}`;
  document.getElementById(prefix + 'RoleIcon').textContent = role.icon;
  document.getElementById(prefix + 'RoleName').textContent = role.name;
  const factionBadge = document.getElementById(prefix + 'RoleFaction');
  factionBadge.textContent = role.faction;
  factionBadge.className = 'badge ' + getFactionBadgeClass(role.faction);
  document.getElementById(prefix + 'RoleWhat').textContent = role.whatYouDo;
  document.getElementById(prefix + 'RoleWin').textContent = role.howYouWin;
}

function showDistRole() {
  if (!activeMatch || activeMatch.distIndex >= activeMatch.players.length) return;
  fillRoleCard('dist', activeMatch.players[activeMatch.distIndex]);
  document.getElementById('distStepReveal').classList.add('visible');
  vibrate('reveal');
}

function hideDistRole() {
  const overlay = document.getElementById('distStepReveal');
  if (!overlay.classList.contains('visible')) return;
  overlay.classList.remove('visible');
  distRoleSeen = true;
  updateDistNextButton();
}

function updateDistNextButton() {
  if (!activeMatch) return;
  const btn = document.getElementById('btnDistNext');
  const nextPlayer = activeMatch.players[activeMatch.distIndex + 1];
  btn.disabled = !distRoleSeen;
  btn.textContent = distRoleSeen
    ? (nextPlayer ? `✅ Ho visto: passa il telefono a ${nextPlayer.name}` : '✅ Ho visto: riconsegna al Narratore')
    : '✅ Ho visto (prima tieni premuto qui sopra)';
}

function showAntiAmnesiaRole() {
  if (!currentAntiAmnesiaPlayerId || !activeMatch) return;
  const p = activeMatch.players.find(item => item.id === currentAntiAmnesiaPlayerId);
  if (!p) return;
  fillRoleCard('aa', p);
  document.getElementById('aaStepCard').classList.add('visible');
  vibrate('reveal');
}

function hideAntiAmnesiaRole() {
  document.getElementById('aaStepCard').classList.remove('visible');
}

window.addEventListener('DOMContentLoaded', () => {
  setupHoldToReveal(document.getElementById('btnRevealRole'), showDistRole, hideDistRole);
  setupHoldToReveal(document.getElementById('btnAaReveal'), showAntiAmnesiaRole, hideAntiAmnesiaRole);
});

/* =========================================================================
   20. GUIDA DEI RUOLI E DELLE REGOLE
========================================================================= */
function openGuideModal() {
  closeGameMenuModal();
  const filter = document.getElementById('guideOnlyDeck');
  const deckIds = getGuideDeckRoleIds();
  document.getElementById('guideFilterRow').style.display = deckIds.size ? 'flex' : 'none';
  if (!deckIds.size) filter.checked = false;
  renderGuide();
  document.getElementById('modalGuide').classList.add('active');
  document.querySelector('#modalGuide .modal-box').scrollTop = 0;
}

function closeGuideModal() {
  document.getElementById('modalGuide').classList.remove('active');
}

// Ruoli del mazzo attuale (partita in corso oppure mazzo scelto nel setup)
function getGuideDeckRoleIds() {
  const deck = activeMatch ? activeMatch.initialDeckMap : appSettings.selectedDeck;
  const ids = new Set(Object.keys(deck || {}).filter(id => deck[id] > 0));
  if (activeMatch) activeMatch.players.forEach(p => ids.add(p.roleId));
  return ids;
}

function renderGuide() {
  const onlyDeck = document.getElementById('guideOnlyDeck').checked;
  const deckIds = getGuideDeckRoleIds();
  const roles = onlyDeck ? rolesDB.filter(r => deckIds.has(r.id)) : rolesDB;
  const ghostOn = activeMatch ? !!activeMatch.ghostRule : !!appSettings.ghostRule;

  const factionIntro = {
    'Villaggio': 'Vincono quando tutti i lupi sono stati eliminati.',
    'Branco': 'Vincono quando sono tanti quanti gli altri giocatori vivi.',
    'Alleato dei Lupi': 'Umani che tifano per i lupi: vincono se vince il branco.',
    'Solitario': 'Giocano da soli, con un obiettivo tutto loro.'
  };

  document.getElementById('guideRoles').innerHTML = ['Villaggio', 'Branco', 'Alleato dei Lupi', 'Solitario'].map(faction => {
    const list = roles.filter(r => r.faction === faction);
    if (!list.length) return '';
    return `
      <div class="guide-faction">
        <div class="guide-faction-head"><span class="badge ${getFactionBadgeClass(faction)}">${escapeHtml(faction)}</span>
          <span class="card-subtitle">${escapeHtml(factionIntro[faction])}</span></div>
        ${list.map(r => `
          <div class="guide-role">
            <div class="guide-role-name"><span class="guide-role-icon">${escapeHtml(r.icon)}</span> ${escapeHtml(r.name)}${r.isPair ? ' <span class="badge">👥 in coppia</span>' : ''}</div>
            <div>${escapeHtml(r.whatYouDo)}</div>
            <div class="card-subtitle">🏆 ${escapeHtml(r.howYouWin)} • 🌙 ${escapeHtml((WAKE_TIMING_LABELS[r.wakeTiming] || WAKE_TIMING_LABELS.mai).long)}${r.wakeTiming !== 'mai' && roleNightAction(r) !== 'none' ? `: ${escapeHtml(NIGHT_ACTIONS[roleNightAction(r)].short)}` : ''}</div>
            ${roleAbilityNotes(r).length ? `<div class="card-subtitle">✨ ${escapeHtml(roleAbilityNotes(r).join(' • '))}</div>` : ''}
          </div>`).join('')}
      </div>`;
  }).join('') || '<div class="card-subtitle">Nessun ruolo da mostrare.</div>';

  document.getElementById('guideGhostRule').style.display = ghostOn ? 'block' : 'none';

  // Varianti ed eventi a sorpresa scelti per questa partita
  const option = key => getMatchOption(key);
  const tieTexts = {
    runoff: 'se c\'è un pareggio si rivota solo tra chi ha pareggiato (ballottaggio).',
    none: 'se c\'è un pareggio quel giorno nessuno va al rogo.',
    decider: 'se c\'è un pareggio decide chi ha il voto doppio (es. il Sindaco).'
  };
  const variants = [`⚖️ <strong>Pareggio al voto:</strong> ${tieTexts[getTieRule()]}`];
  if (activeMatch ? isAutoMatch() : isAutoPlayMode()) {
    variants.unshift('🤝 <strong>Senza Narratore:</strong> di notte il telefono passa a tutti i vivi, uno alla volta. Chi non ha niente da fare tocca un nome a caso. Il branco sceglie la vittima con più voti (a parità, la prima scelta); la Strega decide se salvare la vittima dei lupi senza sapere chi è; la Bambina non può sbirciare.');
  }
  if (option('revealDead')) variants.push('🪦 <strong>Ruoli svelati:</strong> quando qualcuno muore si annuncia che ruolo aveva.');
  if (option('deckAnnounced')) variants.push('📣 <strong>Mazzo annunciato:</strong> all\'inizio si dice a tutti quali ruoli sono in gioco.');
  if (option('surpriseEvents')) {
    variants.push(`🎲 <strong>Eventi a sorpresa</strong> (dalla seconda notte, ogni tanto):<br>${SURPRISE_EVENTS.map(ev => `${escapeHtml(ev.icon)} <strong>${escapeHtml(ev.name)}</strong>: ${escapeHtml(ev.text)}`).join('<br>')}`);
  }
  document.getElementById('guideVariants').innerHTML = variants.map(v => `<div>${v}</div>`).join('');
}

/* =========================================================================
   21. CONDIVIDERE I RUOLI CON GLI AMICI
   Il messaggio contiene un codice (LUPUS-RUOLI-1:...) che l'altro telefono incolla in "Importa ruoli".
========================================================================= */
let pendingImportRoles = null;
let importIdCounter = 0;

function openShareRolesModal() {
  const container = document.getElementById('shareRolesList');
  container.innerHTML = rolesDB.map(r => `
    <label class="share-role-row">
      <input type="checkbox" value="${escapeHtml(r.id)}" ${isRoleCustomized(r, DEFAULT_ROLES) ? 'checked' : ''} onchange="updateShareCount()">
      <span>${escapeHtml(r.icon)} ${escapeHtml(r.name)}</span>
      ${isRoleCustomized(r, DEFAULT_ROLES) ? '<span class="badge badge-alleato">tuo</span>' : ''}
    </label>`).join('');
  updateShareCount();
  document.getElementById('modalShareRoles').classList.add('active');
}

function closeShareRolesModal() {
  document.getElementById('modalShareRoles').classList.remove('active');
}

function getSelectedShareRoles() {
  const ids = Array.from(document.querySelectorAll('#shareRolesList input:checked')).map(i => i.value);
  return rolesDB.filter(r => ids.includes(r.id));
}

function setAllShareRoles(checked) {
  document.querySelectorAll('#shareRolesList input').forEach(i => { i.checked = checked; });
  updateShareCount();
}

function updateShareCount() {
  const n = getSelectedShareRoles().length;
  const btn = document.getElementById('btnShareRolesSend');
  btn.disabled = n === 0;
  btn.textContent = n ? `📤 Condividi ${n} ${n === 1 ? 'ruolo' : 'ruoli'}` : '📤 Scegli almeno un ruolo';
  document.getElementById('btnShareRolesCopy').disabled = n === 0;
}

function buildShareMessage(roles) {
  const names = roles.map(r => `${r.icon} ${r.name}`).join(', ');
  return `🐺 Ruoli per Lupus (${roles.length}): ${names}\n` +
    `Per aggiungerli: apri Lupus → 🛠️ Gestisci i ruoli → 📥 Importa ruoli e incolla tutto questo messaggio.\n\n` +
    encodeRolesShare(roles);
}

async function shareSelectedRoles() {
  const roles = getSelectedShareRoles();
  if (!roles.length) return;
  const text = buildShareMessage(roles);
  const app = nativeApp();
  try {
    if (app && app.isNative && app.share) {
      await app.share(text);
      return;
    }
    if (navigator.share) {
      await navigator.share({ title: 'Ruoli per Lupus', text });
      return;
    }
  } catch (e) {
    // Condivisione annullata o non disponibile: si prova a copiare.
  }
  await copySelectedRoles();
}

async function copySelectedRoles() {
  const roles = getSelectedShareRoles();
  if (!roles.length) return;
  const ok = await copyText(buildShareMessage(roles));
  showToast(ok ? '📋 Copiato! Incollalo in un messaggio per i tuoi amici.' : 'Non sono riuscito a copiare: usa "Condividi".', ok ? 'info' : 'warn');
}

async function copyText(text) {
  const app = nativeApp();
  try {
    if (app && app.isNative && app.writeClipboard) {
      await app.writeClipboard(text);
      return true;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) {}
  return false;
}

function openImportRolesModal() {
  pendingImportRoles = null;
  document.getElementById('importRolesText').value = '';
  document.getElementById('importRolesPreview').innerHTML = '';
  document.getElementById('btnImportRolesConfirm').style.display = 'none';
  document.getElementById('modalImportRoles').classList.add('active');
}

function closeImportRolesModal() {
  document.getElementById('modalImportRoles').classList.remove('active');
  pendingImportRoles = null;
}

async function pasteImportRoles() {
  const app = nativeApp();
  let text = '';
  try {
    if (app && app.isNative && app.readClipboard) text = await app.readClipboard();
    else if (navigator.clipboard && navigator.clipboard.readText) text = await navigator.clipboard.readText();
  } catch (e) {}
  if (!text) {
    showToast('Non riesco a leggere gli appunti: tieni premuto nel riquadro e scegli Incolla.', 'warn');
    return;
  }
  document.getElementById('importRolesText').value = text;
  previewImportRoles();
}

function previewImportRoles() {
  const preview = document.getElementById('importRolesPreview');
  const confirmBtn = document.getElementById('btnImportRolesConfirm');
  const text = document.getElementById('importRolesText').value;
  pendingImportRoles = null;
  confirmBtn.style.display = 'none';
  if (!text.trim()) {
    preview.innerHTML = '';
    return;
  }
  const result = decodeRolesShare(text);
  if (result.error) {
    preview.innerHTML = `<div class="scaletta-dead-alert">⚠️ ${escapeHtml(result.error)}</div>`;
    return;
  }
  pendingImportRoles = result.roles;
  preview.innerHTML = result.roles.map(r => {
    const exists = rolesDB.some(e => e.name.trim().toLowerCase() === r.name.trim().toLowerCase());
    return `<div class="share-role-row">
      <span>${escapeHtml(r.icon)} <strong>${escapeHtml(r.name)}</strong></span>
      <span class="badge ${getFactionBadgeClass(r.faction)}">${escapeHtml(r.faction)}</span>
      <span class="badge">${exists ? '♻️ aggiorna il tuo' : '➕ nuovo'}</span>
    </div>`;
  }).join('');
  confirmBtn.style.display = 'inline-flex';
  confirmBtn.textContent = `📥 Importa ${result.roles.length} ${result.roles.length === 1 ? 'ruolo' : 'ruoli'}`;
}

function confirmImportRoles() {
  if (!pendingImportRoles || !pendingImportRoles.length) return;
  const merged = mergeImportedRoles(rolesDB, pendingImportRoles, () => `custom_${Date.now()}_${++importIdCounter}`);
  rolesDB = merged.roles;
  saveRolesToStorage();
  closeImportRolesModal();
  renderEditorRolesList();
  const parts = [];
  if (merged.added) parts.push(`${merged.added} ${merged.added === 1 ? 'aggiunto' : 'aggiunti'}`);
  if (merged.updated) parts.push(`${merged.updated} ${merged.updated === 1 ? 'aggiornato' : 'aggiornati'}`);
  showToast(`📥 Ruoli importati: ${parts.join(', ')}.`);
}

/* =========================================================================
   22. COLORE E INIZIALE DEI GIOCATORI
   Ogni giocatore ha un cerchietto colorato con l'iniziale, uguale in tutte le schermate.
========================================================================= */
function avatarHtml(name, color, size = '') {
  return `<span class="avatar${size ? ' avatar-' + size : ''}" style="--av: ${color || '#9CA3C4'};" aria-hidden="true">${escapeHtml(playerInitial(name))}</span>`;
}

// Colori dei giocatori della partita: { idGiocatore: colore }
function getMatchColors() {
  const map = {};
  if (!activeMatch) return map;
  const colors = assignPlayerColors(activeMatch.players.map(p => p.name));
  activeMatch.players.forEach((p, i) => { map[p.id] = colors[i]; });
  return map;
}

function getPlayerColor(playerId) {
  return getMatchColors()[playerId];
}

function setAvatar(elementId, player) {
  const el = document.getElementById(elementId);
  el.textContent = playerInitial(player.name);
  el.style.setProperty('--av', getPlayerColor(player.id));
}

/* =========================================================================
   23. "ANNULLA" AL POSTO DI "SEI SICURO?"
   Le azioni che si possono correggere avvengono subito; per 2 secondi compare un avviso
   con "Annulla" che rimette tutto com'era prima (ruoli, giocatori, impostazioni, partita).
========================================================================= */
const UNDO_TOAST_MS = 2000;
let undoToastTimer = null;
let undoRestore = null;

function getActiveScreenId() {
  const el = document.querySelector('.screen.active');
  return el ? el.id : 'screenSetup';
}

function captureAppState() {
  return JSON.stringify({
    rolesDB, setupPlayers, appSettings, activeMatch,
    knownPlayers: loadKnownPlayers(),
    screen: getActiveScreenId(),
    narratorTab
  });
}

function restoreAppState(json) {
  const st = JSON.parse(json);
  stopDayTimer();
  stopEmptyCallTimer();
  ['modalVote', 'modalGameMenu', 'modalConfirm', 'modalDeathCause'].forEach(id => document.getElementById(id).classList.remove('active'));

  rolesDB = st.rolesDB;
  setupPlayers = st.setupPlayers;
  appSettings = st.appSettings;
  activeMatch = st.activeMatch;
  narratorTab = st.narratorTab || 'guide';
  saveRolesToStorage();
  savePlayersToStorage();
  saveSettingsToStorage();
  saveMatchToStorage();
  saveKnownPlayers(st.knownPlayers);

  let screen = st.screen;
  if ((screen === 'screenNarrator' || screen === 'screenDistribution') && !activeMatch) screen = 'screenSetup';
  syncNarrationKey();
  if (screen === 'screenNarrator') renderNarratorDashboard();
  else if (screen === 'screenDistribution') renderDistributionStep();
  else if (screen === 'screenRoleEditor') renderEditorRolesList();
  else renderSetupScreen();
  showScreen(screen);
}

function doWithUndo(message, action) {
  const before = captureAppState();
  action();
  showUndoToast(message, () => restoreAppState(before));
}

function showUndoToast(message, restore) {
  const el = document.getElementById('undoToast');
  document.getElementById('undoToastText').textContent = message;
  undoRestore = restore;
  // fa ripartire la barra del tempo
  el.classList.remove('visible');
  void el.offsetWidth;
  el.classList.add('visible');
  clearTimeout(undoToastTimer);
  undoToastTimer = setTimeout(hideUndoToast, UNDO_TOAST_MS);
}

function hideUndoToast() {
  clearTimeout(undoToastTimer);
  document.getElementById('undoToast').classList.remove('visible');
  undoRestore = null;
}

function onUndoToastClick() {
  const restore = undoRestore;
  hideUndoToast();
  if (!restore) return;
  restore();
  vibrate('tap');
  showToast('↩️ Annullato: tutto come prima.');
}

/* =========================================================================
   BACKUP: RUOLI, GIOCATORI E IMPOSTAZIONI IN UN FILE
========================================================================= */
let pendingRestore = null;

async function saveBackup() {
  const now = new Date();
  const backup = buildBackup({ roles: rolesDB, players: setupPlayers, settings: appSettings, knownPlayers: loadKnownPlayers() }, now.toISOString(), getAppVersion());
  const text = JSON.stringify(backup, null, 2);
  const name = backupFileName(now);
  const app = nativeApp();
  try {
    if (app && app.isNative && app.shareFile) {
      const shared = await app.shareFile(name, text);
      if (shared) showToast('💾 Backup pronto: tienilo in un posto sicuro (Drive, email, WhatsApp...).');
    } else {
      downloadTextFile(name, text);
      showToast(`💾 Backup salvato: ${name}`);
    }
  } catch (e) {
    showToast('Non sono riuscito a salvare il backup. Riprova.', 'warn');
  }
}

// Nel browser: scarica il file
function downloadTextFile(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function openRestoreModal() {
  closeInfoModal();
  pendingRestore = null;
  document.getElementById('restoreText').value = '';
  document.getElementById('restoreFileInput').value = '';
  previewRestore();
  document.getElementById('modalRestore').classList.add('active');
}

function closeRestoreModal() {
  document.getElementById('modalRestore').classList.remove('active');
  pendingRestore = null;
}

function onRestoreFileChosen(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    document.getElementById('restoreText').value = String(reader.result || '');
    previewRestore();
  };
  reader.onerror = () => showToast('Non riesco a leggere questo file.', 'warn');
  reader.readAsText(file);
}

function previewRestore() {
  const text = document.getElementById('restoreText').value;
  const box = document.getElementById('restorePreview');
  const btn = document.getElementById('btnRestoreConfirm');
  pendingRestore = null;
  if (!text.trim()) {
    box.style.display = 'none';
    btn.disabled = true;
    return;
  }
  const res = parseBackup(text);
  box.style.display = 'block';
  if (res.error) {
    box.className = 'guide-result result-danger';
    box.textContent = `⚠️ ${res.error}`;
    btn.disabled = true;
    return;
  }
  pendingRestore = res.data;
  const when = res.createdAt ? new Date(res.createdAt) : null;
  const custom = res.data.roles.filter(r => isRoleCustomized(r, DEFAULT_ROLES)).length;
  box.className = 'guide-result result-good';
  box.innerHTML = `✅ Backup${when && !isNaN(when) ? ` del ${escapeHtml(when.toLocaleDateString('it-IT'))}` : ''}:<br>
    🎭 ${res.data.roles.length} ruoli (${custom} ${custom === 1 ? 'tuo' : 'tuoi'})<br>
    👥 ${res.data.players.length} giocatori<br>
    ⚙️ le impostazioni<br>
    <span class="card-subtitle">Ripristinando, ruoli, giocatori e impostazioni di adesso vengono sostituiti. La partita in corso resta.</span>`;
  btn.disabled = false;
}

function confirmRestore() {
  const data = pendingRestore;
  if (!data) return;
  closeRestoreModal();
  doWithUndo('📂 Backup ripristinato', () => {
    rolesDB = data.roles;
    setupPlayers = data.players.slice();
    appSettings = { ...appSettings, ...data.settings, knownDefaultRoleIds: data.settings.knownDefaultRoleIds || null, selectedPresetCode: null };
    saveKnownPlayers(data.knownPlayers);
    migrateRoles();
    pruneDeckOfMissingRoles();
    saveRolesToStorage();
    savePlayersToStorage();
    saveSettingsToStorage();
    setupStep = 1;
    renderSetupScreen();
    showScreen('screenSetup');
  });
}

/* =========================================================================
   VISTA PER IL TAVOLO: fase, timer, vivi e voti. Mai i ruoli (tranne quelli già svelati a tutti).
   Si esce solo tenendo premuto, così nessuno torna per sbaglio alla schermata del Narratore.
========================================================================= */
let tableExitTimer = null;

function isTableViewOpen() {
  return document.getElementById('tableView').classList.contains('open');
}

function openTableView() {
  if (!activeMatch) return;
  vibrate('tap');
  const view = document.getElementById('tableView');
  view.classList.add('open');
  view.setAttribute('aria-hidden', 'false');
  renderTableView();
}

function closeTableView() {
  cancelTableExitHold();
  const view = document.getElementById('tableView');
  view.classList.remove('open');
  view.setAttribute('aria-hidden', 'true');
}

function startTableExitHold(e) {
  if (e) e.preventDefault();
  cancelTableExitHold();
  document.getElementById('btnTableExit').classList.add('holding');
  tableExitTimer = setTimeout(() => {
    tableExitTimer = null;
    vibrate('reveal');
    closeTableView();
  }, 900);
}

function cancelTableExitHold() {
  if (tableExitTimer) clearTimeout(tableExitTimer);
  tableExitTimer = null;
  document.getElementById('btnTableExit').classList.remove('holding');
}

function renderTableView() {
  if (!activeMatch || !isTableViewOpen()) return;
  const isDay = activeMatch.phase === 'day';
  document.getElementById('tablePhase').textContent = isDay ? `☀️ Giorno ${activeMatch.turn}` : `🌙 Notte ${activeMatch.turn}`;
  const ev = currentRoundEvent();
  const showEvent = ev && (isDay ? ev.phase === 'day' : true);
  document.getElementById('tableEvent').textContent = showEvent ? `${ev.icon} ${ev.name}: ${isDay ? eventTextToday(ev) : ev.text}` : (isDay ? '' : 'Il villaggio dorme...');
  document.getElementById('tableTimerBox').style.display = isDay ? 'flex' : 'none';
  updateTimerUI();

  // Giocatori: vivi prima, poi i morti (con il ruolo solo se si gioca con i ruoli svelati)
  const colors = getMatchColors();
  const reveal = !!activeMatch.revealDead;
  const alive = activeMatch.players.filter(p => !p.isDead);
  const dead = activeMatch.players.filter(p => p.isDead);
  document.getElementById('tableAliveCount').textContent = alive.length;
  document.getElementById('tablePlayers').innerHTML = alive.concat(dead).map(p => {
    let note = '';
    if (p.isGhost) note = '👻 Fantasma: vota';
    else if (p.isDead) note = '💀 Morto';
    if (p.isDead && reveal) {
      const role = getRoleById(p.roleId);
      note += ` • ${role.icon} ${role.name}`;
    }
    return `<div class="table-player${p.isDead ? ' dead' : ''}">
      ${avatarHtml(p.name, colors[p.id], 'sm')}
      <span style="min-width: 0;"><span class="table-player-name">${escapeHtml(p.name)}</span>${note ? `<span class="table-player-note">${escapeHtml(note)}</span>` : ''}</span>
    </div>`;
  }).join('');

  // Votazione di oggi: conteggio e rogo
  const voteBox = document.getElementById('tableVoteBox');
  const burned = isDay ? findBurnedOnDay(activeMatch.players, activeMatch.turn) : null;
  const vote = isDay && activeMatch.vote && activeMatch.vote.turn === activeMatch.turn ? activeMatch.vote : null;
  let html = '';
  if (burned) {
    html = `<div class="guide-result result-danger">🔥 Oggi è stato bruciato <strong>${escapeHtml(burned.name)}</strong>.</div>`;
  } else if (vote && Object.keys(vote.votes).length) {
    const tally = tallyVotes(activeMatch.players, vote.votes, findRoleOrNull, vote.candidates);
    html = `<div class="card-subtitle">${vote.round > 1 ? '⚖️ Ballottaggio • ' : ''}Hanno votato ${tally.castCount} su ${tally.voterCount}</div>` +
      tally.totals.filter(r => r.votes > 0).map(r => {
        const width = tally.maxVotes ? Math.round((r.votes / tally.maxVotes) * 100) : 0;
        return `<div class="tally-row${tally.leaders.includes(r.playerId) ? ' tally-leader' : ''}">
          <div class="tally-bar" style="width: ${width}%;"></div>
          <span class="tally-name">${escapeHtml(r.name)}</span>
          <span class="tally-votes">${r.votes} ${r.votes === 1 ? 'voto' : 'voti'}</span>
        </div>`;
      }).join('');
  }
  voteBox.style.display = html ? 'flex' : 'none';
  document.getElementById('tableVote').innerHTML = html;
}

/* =========================================================================
   24. NOVITÀ DELLA VERSIONE E LINK PER GLI AMICI
========================================================================= */
function getChangelog() {
  const app = nativeApp();
  return app && Array.isArray(app.changelog) ? app.changelog : [];
}

// Dopo un aggiornamento mostra le novità (non alla prima installazione)
function checkWhatsNew(isFirstRun) {
  const current = getAppVersion();
  if (current === '0.0.0') return;
  let seen = null;
  try {
    seen = localStorage.getItem(STORAGE_KEYS.SEEN_VERSION);
    localStorage.setItem(STORAGE_KEYS.SEEN_VERSION, current);
  } catch (e) {}
  if (seen === current || isFirstRun) return;
  openWhatsNewModal(seen);
}

function formatChangelogDate(iso) {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }) : iso;
}

// sinceVersion: mostra le versioni più nuove di questa; 'all' = tutte quelle disponibili
function openWhatsNewModal(sinceVersion) {
  closeInfoModal();
  const current = getAppVersion();
  const all = getChangelog();
  let versions = all;
  if (sinceVersion !== 'all') {
    versions = all.filter(v => !isNewerVersion(v.version, current) && (!sinceVersion || isNewerVersion(v.version, sinceVersion)));
    if (!versions.length) versions = all.filter(v => v.version === current);
  }
  document.getElementById('whatsNewTitle').textContent = sinceVersion === 'all' ? '📜 Novità delle versioni' : `🆕 Novità di Lupus ${current}`;
  document.getElementById('whatsNewBody').innerHTML = versions.length
    ? versions.map(v => `
        <div class="whatsnew-version">
          <div class="whatsnew-head">Versione ${escapeHtml(v.version)} <span class="card-subtitle">• ${escapeHtml(formatChangelogDate(v.date))}</span></div>
          ${v.intro ? `<div class="whatsnew-intro">${escapeHtml(v.intro)}</div>` : ''}
          <ul class="whatsnew-list">${v.items.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul>
        </div>`).join('')
    : '<div class="card-subtitle">Nessuna novità da mostrare.</div>';
  document.getElementById('modalWhatsNew').classList.add('active');
  document.querySelector('#modalWhatsNew .modal-box').scrollTop = 0;
}

function closeWhatsNewModal() {
  document.getElementById('modalWhatsNew').classList.remove('active');
}

async function shareAppLink() {
  const text = `🐺 Scarica Lupus, l'assistente del Narratore per Lupus in Fabula (Android): ${UPDATE_PAGE_URL}`;
  const app = nativeApp();
  try {
    if (app && app.isNative && app.share) {
      await app.share(text, 'Lupus');
      return;
    }
    if (navigator.share) {
      await navigator.share({ title: 'Lupus', text });
      return;
    }
  } catch (e) {
    // condivisione annullata: si prova a copiare
  }
  const ok = await copyText(text);
  showToast(ok ? '📋 Link copiato: incollalo in un messaggio.' : 'Non sono riuscito a condividere il link.', ok ? 'info' : 'warn');
}
