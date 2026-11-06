'use strict';

/* =========================================================================
   3. CHIAVI LOCALSTORAGE E STATO DELL'APPLICAZIONE
========================================================================= */
const STORAGE_KEYS = {
  ROLES: 'lupus_narratore_roles_v1',
  PLAYERS: 'lupus_narratore_players_v1',
  SETTINGS: 'lupus_narratore_settings_v1',
  MATCH: 'lupus_narratore_match_v1',
  UPDATES: 'lupus_updates_v1'
};

const DEFAULT_DAY_TIMER_SECONDS = 180;

let rolesDB = [];
let setupPlayers = [];
let appSettings = {
  ghostRule: true,
  selectedDeck: {}, // mappa { roleId: count }
  selectedPresetCode: null,
  activeSetupTab: 'presets'
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
    try { navigator.vibrate(kind === 'long' ? [400, 150, 400] : 30); } catch (e) {}
  }
}

/* =========================================================================
   4. INIZIALIZZAZIONE E FUNZIONI DI SISTEMA (WAKE LOCK, FULLSCREEN, STORAGE)
========================================================================= */
window.addEventListener('DOMContentLoaded', () => {
  loadAllFromStorage();
  dayTimerSeconds = getTimerDuration();
  renderSetupScreen();
  showScreen('screenSetup');
  requestScreenWakeLock();
  renderUpdateBanner();
  setTimeout(autoCheckForUpdates, 1500);
});

// Tasto Indietro di Android (chiamato da src/native.js).
// Restituisce true se l'ha gestito l'app; false = l'app va in secondo piano.
window.handleAndroidBack = function handleAndroidBack() {
  const isOpen = id => document.getElementById(id).classList.contains('active');

  if (isOpen('modalConfirm')) { closeConfirmModal(); return true; }
  if (isOpen('modalDeathCause')) { closeDeathCauseModal(); return true; }
  if (isOpen('modalVote')) { closeVoteModal(); return true; }
  if (isOpen('modalSummary')) { closeSummaryModal(); return true; }
  if (isOpen('modalGuide')) { closeGuideModal(); return true; }
  if (isOpen('modalShareRoles')) { closeShareRolesModal(); return true; }
  if (isOpen('modalImportRoles')) { closeImportRolesModal(); return true; }
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
  pruneDeckOfMissingRoles();
}

// Toglie dal mazzo i ruoli che non esistono più (eliminati o dopo il ripristino dei 13 base).
function pruneDeckOfMissingRoles() {
  let changed = false;
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
  document.getElementById('toggleGhostRule').checked = !!appSettings.ghostRule;
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
  updateSetupDeckCounters();
}

function renderPlayerChips() {
  const count = setupPlayers.length;
  document.getElementById('playerCountLabel').textContent = count;
  document.getElementById('btnClearPlayers').style.display = count > 0 ? 'inline-flex' : 'none';

  const container = document.getElementById('playerChipsList');
  container.innerHTML = '';

  if (count === 0) {
    container.innerHTML = `<div style="text-align:center; padding: 12px; color: var(--text-muted); font-size: 0.9rem;">
      Nessun giocatore inserito. Aggiungi almeno 5 giocatori per iniziare.
    </div>`;
    return;
  }

  setupPlayers.forEach((name, idx) => {
    const row = document.createElement('div');
    row.className = 'player-chip';
    row.innerHTML = `
      <div class="player-chip-name">
        <span class="player-chip-num">${idx + 1}</span>
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
  setupPlayers.splice(index, 1);
  savePlayersToStorage();
  autoSelectFirstPresetIfMatch();
  renderSetupScreen();
}

function confirmClearPlayers() {
  openConfirmModal(
    'Svuota Lista Giocatori',
    'Vuoi rimuovere tutti i giocatori dalla lista?',
    () => {
      setupPlayers = [];
      appSettings.selectedDeck = {};
      appSettings.selectedPresetCode = null;
      savePlayersToStorage();
      saveSettingsToStorage();
      renderSetupScreen();
    }
  );
}

function onGhostRuleToggle(checked) {
  appSettings.ghostRule = checked;
  document.getElementById('toggleGhostRule').checked = checked;
  const inGameToggle = document.getElementById('toggleGhostRuleInGame');
  if (inGameToggle) inGameToggle.checked = checked;
  saveSettingsToStorage();

  if (activeMatch) {
    activeMatch.ghostRule = checked;
    saveMatchToStorage();
    if (document.getElementById('screenNarrator').classList.contains('active')) {
      renderNarratorDashboard();
    }
  }
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
  presets.forEach(preset => {
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
        <div class="preset-name">${isSelected ? '✅ ' : ''}${preset.code.toUpperCase()}. "${escapeHtml(preset.name)}"</div>
        <span class="preset-turns">⏱️ ${preset.turns}</span>
      </div>
      <div class="preset-roles">${roleStrings}</div>
      ${missingRoles.length ? `<div class="card-subtitle" style="color: var(--accent-warning);">⚠️ Usa ruoli che hai eliminato (${escapeHtml(missingRoles.join(', '))}). Ripristinali da "Gestisci / Crea Ruoli".</div>` : ''}
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
    showToast('Questo preset usa ruoli che hai eliminato: ripristina i 13 ruoli predefiniti per usarlo.', 'warn');
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
  const stickyStatus = document.getElementById('stickyDeckStatus');
  const btnStart = document.getElementById('btnStartDistribution');

  badge.textContent = `${deckTotal} / ${playerCount} ruoli`;
  stickyStatus.textContent = `${deckTotal} / ${playerCount} ruoli`;

  // Motivi per cui non si può ancora distribuire (vedi getDeckProblems in rules.js)
  const problems = getDeckProblems(appSettings.selectedDeck, playerCount, findRoleOrNull);
  const isValid = problems.length === 0;
  btnStart.disabled = !isValid;

  const problemEl = document.getElementById('stickyDeckProblem');
  problemEl.textContent = problems[0] || '';
  problemEl.style.display = problems.length ? 'block' : 'none';

  if (playerCount < 5) {
    stickyStatus.style.color = 'var(--text-muted)';
    stickyStatus.textContent = `Giocatori: ${playerCount}/5`;
    badge.className = 'badge';
  } else if (isValid) {
    stickyStatus.style.color = 'var(--accent-success)';
    badge.className = 'badge badge-villaggio';
  } else {
    stickyStatus.style.color = 'var(--accent-warning)';
    badge.className = 'badge badge-alleato';
  }
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
  const container = document.getElementById('editorRolesList');
  container.innerHTML = '';

  rolesDB.forEach(role => {
    const factionClass = getFactionBadgeClass(role.faction);
    const wakeLabels = {
      mai: 'Passivo / Mai',
      ogni_notte: 'Ogni notte',
      solo_notte_1: 'Solo Notte 1',
      solo_notte_2: 'Solo Notte 2',
      dalla_notte_2: 'Dalla Notte 2+'
    };

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
          <button class="icon-btn" onclick="openRoleFormModal('${role.id}')" title="Modifica">✏️</button>
          <button class="icon-btn" style="color: var(--accent-danger);" onclick="confirmDeleteRole('${role.id}')" title="Elimina">🗑️</button>
        </div>
      </div>
      <div style="font-size: 0.85rem; color: var(--text-main);">
        <strong>Cosa fai:</strong> ${escapeHtml(role.whatYouDo)}<br>
        <strong>Come vinci:</strong> ${escapeHtml(role.howYouWin)}
      </div>
      <div style="font-size: 0.78rem; color: var(--text-muted); display: flex; gap: 10px; flex-wrap: wrap;">
        <span>🌙 Risveglio: <strong>${wakeLabels[role.wakeTiming] || role.wakeTiming}</strong></span>
        <span>🔢 Priorità: <strong>${role.priority}</strong></span>
      </div>
    `;
    container.appendChild(item);
  });
}

function openRoleFormModal(roleId) {
  const isEdit = !!roleId;
  document.getElementById('roleFormTitle').textContent = isEdit ? '✏️ Modifica Ruolo' : '➕ Crea Nuovo Ruolo';

  if (isEdit) {
    const r = getRoleById(roleId);
    document.getElementById('rfId').value = r.id;
    document.getElementById('rfIcon').value = r.icon;
    document.getElementById('rfName').value = r.name;
    document.getElementById('rfFaction').value = r.faction;
    document.getElementById('rfWhat').value = r.whatYouDo;
    document.getElementById('rfWin').value = r.howYouWin;
    document.getElementById('rfWake').value = r.wakeTiming;
    document.getElementById('rfPriority').value = r.priority;
    document.getElementById('rfNarratorPhrase').value = r.narratorPhrase || '';
    document.getElementById('rfNarratorNote').value = r.narratorNote || '';
    document.getElementById('rfIsPair').checked = !!r.isPair;
  } else {
    document.getElementById('rfId').value = '';
    document.getElementById('rfIcon').value = '🧙‍♀️';
    document.getElementById('rfName').value = '';
    document.getElementById('rfFaction').value = 'Villaggio';
    document.getElementById('rfWhat').value = '';
    document.getElementById('rfWin').value = 'Vinci col villaggio.';
    document.getElementById('rfWake').value = 'ogni_notte';
    document.getElementById('rfPriority').value = 5;
    document.getElementById('rfNarratorPhrase').value = '';
    document.getElementById('rfNarratorNote').value = '';
    document.getElementById('rfIsPair').checked = false;
  }

  document.getElementById('modalRoleForm').classList.add('active');
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
  const priority = Math.min(10, Math.max(1, parseInt(document.getElementById('rfPriority').value, 10) || 5));
  const narratorPhrase = document.getElementById('rfNarratorPhrase').value.trim();
  const narratorNote = document.getElementById('rfNarratorNote').value.trim();
  const isPair = document.getElementById('rfIsPair').checked;

  if (!name || !whatYouDo || !howYouWin) {
    showToast('Compila Nome, "Cosa fai" e "Come vinci"!', 'warn');
    return;
  }

  if (rolesDB.some(r => r.id !== idVal && r.name.trim().toLowerCase() === name.toLowerCase())) {
    showToast(`Esiste già un ruolo chiamato "${name}".`, 'warn');
    return;
  }

  if (idVal) {
    const idx = rolesDB.findIndex(r => r.id === idVal);
    if (idx !== -1) {
      rolesDB[idx] = { id: idVal, name, icon, faction, whatYouDo, howYouWin, wakeTiming, priority, narratorPhrase, narratorNote, isPair };
    }
  } else {
    const newId = 'custom_' + Date.now();
    rolesDB.push({ id: newId, name, icon, faction, whatYouDo, howYouWin, wakeTiming, priority, narratorPhrase, narratorNote, isPair });
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
  openConfirmModal(
    'Elimina Ruolo',
    `Vuoi eliminare il ruolo "${r.name}"? Potrai sempre ripristinare i 13 ruoli predefiniti in qualsiasi momento.`,
    () => {
      rolesDB = rolesDB.filter(item => item.id !== roleId);
      saveRolesToStorage();
      pruneDeckOfMissingRoles();
      saveSettingsToStorage();
      renderEditorRolesList();
      showToast(`Ruolo "${r.name}" eliminato.`);
    }
  );
}

function confirmResetDefaultRoles() {
  openConfirmModal(
    '🔄 Ripristina i 13 Ruoli Predefiniti',
    'Sei sicuro di voler ripristinare i 13 ruoli originali? Eventuali modifiche o ruoli personalizzati verranno sostituiti.',
    () => {
      rolesDB = JSON.parse(JSON.stringify(DEFAULT_ROLES));
      saveRolesToStorage();
      pruneDeckOfMissingRoles();
      renderEditorRolesList();
      showToast('I 13 ruoli predefiniti sono stati ripristinati!');
    }
  );
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

  activeMatch = {
    status: 'distributing',
    distIndex: 0,
    turn: 1,
    phase: 'night', // 'night' | 'day'
    ghostRule: !!appSettings.ghostRule,
    initialDeckMap: { ...appSettings.selectedDeck },
    lastBurnedPlayerId: null,
    victoryDismissed: false,
    completedSteps: [],
    copioneTargetId: null,
    players: setupPlayers.map((name, idx) => ({
      id: 'p_' + idx,
      name: name,
      roleId: deckArray[idx],
      originalRoleId: deckArray[idx],
      isDead: false,
      isGhost: false,
      shieldTonight: false,
      shieldYesterday: false,
      wolfTarget: false,
      flowerTonight: false,
      seerProbed: false,
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
    renderNarratorDashboard();
    showScreen('screenNarrator');
  }
}

function confirmClearSavedMatch() {
  openConfirmModal(
    'Scarta Partita Salvata',
    'Vuoi cancellare la partita in corso e configurarne una nuova?',
    () => {
      activeMatch = null;
      saveMatchToStorage();
      renderSetupScreen();
    }
  );
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

  const phaseBadge = document.getElementById('narratorPhaseBadge');
  phaseBadge.textContent = isNight ? `🌙 Notte ${turn}` : `☀️ Giorno ${turn}`;
  phaseBadge.className = 'phase-badge ' + (isNight ? 'phase-night' : 'phase-day');

  const btnPhase = document.getElementById('btnTogglePhase');
  if (isNight) {
    btnPhase.textContent = `☀️ Vai al Giorno ${turn}`;
    btnPhase.className = 'btn btn-warning';
  } else {
    btnPhase.textContent = `🌙 Vai alla Notte ${turn + 1}`;
    btnPhase.className = 'btn btn-primary';
  }

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

  // Scaletta Notturna o Diurna
  if (isNight) {
    renderNightScaletta();
  } else {
    renderDayScaletta();
  }

  // Lista giocatori interattiva
  renderNarratorPlayersList();
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
  if (!activeMatch) return null;
  // Regole in rules.js: Giullare bruciato al rogo, lupi finiti, parità dei lupi, Criceto sopravvissuto.
  return evaluateVictory(activeMatch.players, findRoleOrNull);
}

function renderVictoryBanner() {
  const banner = document.getElementById('victoryBanner');
  const winInfo = evaluateVictoryCondition();

  if (winInfo && !activeMatch.victoryDismissed) {
    banner.style.display = 'flex';
    banner.className = 'victory-banner ' + (winInfo.type === 'wolves' ? 'wolves' : winInfo.type === 'solo' ? 'solo' : '');
    document.getElementById('victoryBannerText').textContent = winInfo.text;
  } else {
    banner.style.display = 'none';
  }
}

function dismissVictoryBanner() {
  if (!activeMatch) return;
  activeMatch.victoryDismissed = true;
  saveMatchToStorage();
  document.getElementById('victoryBanner').style.display = 'none';
}

function toggleTurnPhase() {
  if (!activeMatch) return;
  stopDayTimer();

  // Copia della fase attuale, per poter tornare indietro se il pulsante è stato toccato per sbaglio.
  // Si tengono le ultime fasi (UNDO_MAX_STEPS), così ↩️ si può premere più volte di fila.
  const snapshot = JSON.parse(JSON.stringify(activeMatch));
  trimUndoChain(snapshot, UNDO_MAX_STEPS - 1);
  activeMatch.undo = snapshot;

  activeMatch.vote = null;

  if (activeMatch.phase === 'night') {
    // Passa da NOTTE a GIORNO dello stesso turno
    activeMatch.phase = 'day';
    activeMatch.completedSteps = [];
    dayTimerSeconds = getTimerDuration();
  } else {
    // Passa da GIORNO a una nuova NOTTE:
    // Pulisce i badge temporanei (🐺, 🌸, 👁️, 📌) e trasforma 🛡️ in "🛡️ Ieri"
    // Prima di pulire i segnalini, li salva nella cronologia della partita (riepilogo finale).
    recordNightLog();
    activeMatch.turn += 1;
    activeMatch.phase = 'night';
    activeMatch.completedSteps = [];

    activeMatch.players.forEach(p => {
      p.shieldYesterday = !!p.shieldTonight;
      p.shieldTonight = false;
      p.wolfTarget = false;
      p.flowerTonight = false;
      p.seerProbed = false;
      p.extraPin = false;
    });
  }

  saveMatchToStorage();
  renderNarratorDashboard();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  showToast(activeMatch.phase === 'day'
    ? `☀️ Giorno ${activeMatch.turn}. Se hai sbagliato, tocca ↩️ in alto.`
    : `🌙 Notte ${activeMatch.turn}. Se hai sbagliato, tocca ↩️ in alto.`);
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
  openConfirmModal(
    '↩️ Torna alla fase precedente',
    `Torni a ${getPhaseLabel(previous).replace(/^\S+ /, '')} com'era prima del cambio di fase (segnalini e morti di quel momento).`,
    () => {
      stopDayTimer();
      activeMatch = previous;
      saveMatchToStorage();
      renderNarratorDashboard();
      showToast(`↩️ Sei tornato a: ${getPhaseLabel(activeMatch)}`);
    },
    { yesLabel: 'Torna indietro', yesClass: 'btn-primary' }
  );
}

/* =========================================================================
   10. SCALETTA NOTTURNA E DIURNA DEL NARRATORE
========================================================================= */
function isRoleScheduledForNight(role, turn) {
  const w = role.wakeTiming;
  if (!w || w === 'mai') return false;
  if (w === 'ogni_notte') return true;
  if (w === 'solo_notte_1') return turn === 1;
  if (w === 'solo_notte_2') return turn === 2;
  if (w === 'dalla_notte_2') return turn >= 2;
  return false;
}

function renderNightScaletta() {
  const turn = activeMatch.turn;
  document.getElementById('scalettaTitle').textContent = `🌙 Scaletta Notte ${turn}`;
  document.getElementById('scalettaSubtitle').textContent =
    'Solo i ruoli presenti in partita e previsti per questa notte (tocca uno step per segnarlo fatto)';

  const container = document.getElementById('scalettaContainer');
  container.innerHTML = '';

  // Ruoli presenti nel mazzo iniziale o attuali
  const presentRoleIds = new Set(Object.keys(activeMatch.initialDeckMap).filter(k => activeMatch.initialDeckMap[k] > 0));
  activeMatch.players.forEach(p => {
    presentRoleIds.add(p.roleId);
    presentRoleIds.add(p.originalRoleId);
  });

  const nightRoles = Array.from(presentRoleIds)
    .map(id => getRoleById(id))
    .filter(role => isRoleScheduledForNight(role, turn))
    .sort((a, b) => a.priority - b.priority);

  if (nightRoles.length === 0) {
    container.innerHTML = `<div class="card-subtitle">Nessun ruolo attivo previsto per questa notte.</div>`;
    return;
  }

  nightRoles.forEach((role, stepIndex) => {
    // Giocatori che possiedono questo ruolo (o lo avevano come Copione in Notte 2)
    const holders = activeMatch.players.filter(p =>
      p.roleId === role.id || (role.id === 'copione' && turn === 2 && p.originalRoleId === 'copione')
    );
    const aliveHolders = holders.filter(p => !p.isDead);
    const isRoleCompletelyDead = holders.length === 0 || aliveHolders.length === 0;
    const isStepDone = (activeMatch.completedSteps || []).includes(role.id);

    const stepEl = document.createElement('div');
    stepEl.className = 'scaletta-step' + (isStepDone ? ' step-done' : '') + (isRoleCompletelyDead ? ' step-dead' : '');

    const holderNamesHtml = holders.map(p => {
      const st = p.isDead ? (p.isGhost ? '👻' : '💀') : '🟢';
      return `${st} <strong>${escapeHtml(p.name)}</strong>`;
    }).join(', ');

    // Costruisci promemoria specifici per ruolo
    let extraDynamicHtml = '';

    // b. Veggente -> ricorda Indemoniato NON lupo e Criceto muore se sondato
    if (role.id === 'veggente') {
      const indemoniati = activeMatch.players.filter(p => p.roleId === 'indemoniato').map(p => p.name);
      const criceti = activeMatch.players.filter(p => p.roleId === 'criceto').map(p => p.name);
      let notes = [];
      notes.push('• L\'Indemoniato risulta <strong>NON lupo (NO)</strong>' + (indemoniati.length ? ` (${escapeHtml(indemoniati.join(', '))})` : '') + '.');
      notes.push('• Il Criceto Mannaro <strong>muore all\'istante</strong> se sondato' + (criceti.length ? ` (${escapeHtml(criceti.join(', '))})` : '') + '!');
      extraDynamicHtml += `<div class="scaletta-highlight">${notes.join('<br>')}</div>`;
    }

    // c. Medium -> chi è stato bruciato al rogo nel giorno precedente (non in giorni più vecchi)
    if (role.id === 'medium') {
      const burnedPlayer = findBurnedOnDay(activeMatch.players, turn - 1);
      if (burnedPlayer) {
        const burnedRole = getRoleById(burnedPlayer.roleId);
        const wasWolf = burnedRole.faction === 'Branco';
        extraDynamicHtml += `
          <div class="scaletta-highlight" style="border-color: ${wasWolf ? 'var(--accent-danger)' : 'var(--accent-success)'};">
            🔥 Ieri al rogo è morto <strong>${escapeHtml(burnedPlayer.name)}</strong> (${escapeHtml(burnedRole.icon)} ${escapeHtml(burnedRole.name)})<br>
            👉 <strong>${wasWolf ? 'Fai SÌ con la testa (era Lupo)' : 'Fai NO con la testa (NON era Lupo)'}</strong>
          </div>
        `;
      } else {
        extraDynamicHtml += `<div class="scaletta-highlight">🔥 Ieri nessuno è stato bruciato al rogo: fai NO con la testa o chiamalo a vuoto.</div>`;
      }
    }

    // d. Guardia del Corpo -> ricorda sé stessa + Scudato ieri
    if (role.id === 'guardia') {
      const shieldedYesterdayPlayers = activeMatch.players.filter(p => p.shieldYesterday).map(p => p.name);
      const selfNames = holders.map(p => p.name).join(', ');
      extraDynamicHtml += `
        <div class="scaletta-highlight">
          🛡️ Non può proteggere sé stessa (${escapeHtml(selfNames)}) né chi ha il badge <strong>"🛡️ Ieri"</strong>:
          <strong>${shieldedYesterdayPlayers.length ? escapeHtml(shieldedYesterdayPlayers.join(', ')) : 'Nessuno'}</strong>.
        </div>
      `;
    }

    // e. Lupi Mannari -> nota per la Bambina se presente + Criceto immune
    if (role.id === 'lupo') {
      const bambinaHolders = activeMatch.players.filter(p => p.roleId === 'bambina');
      const cricetoHolders = activeMatch.players.filter(p => p.roleId === 'criceto' && !p.isDead);
      let wolfExtras = [];
      if (bambinaHolders.length > 0) {
        const bNames = bambinaHolders.map(b => `${b.name}${b.isDead ? ' (Morta 💀)' : ' (Viva 👀)'}`).join(', ');
        wolfExtras.push(`👀 <strong>Bambina presente nel mazzo:</strong> ${escapeHtml(bNames)} può sbirciare mentre i Lupi scelgono.`);
      }
      if (cricetoHolders.length > 0) {
        wolfExtras.push(`🐹 <strong>Criceto Mannaro immune al morso:</strong> ${escapeHtml(cricetoHolders.map(c => c.name).join(', '))} non può essere sbranato!`);
      }
      if (wolfExtras.length > 0) {
        extraDynamicHtml += `<div class="scaletta-highlight">${wolfExtras.join('<br>')}</div>`;
      }
    }

    // g. Copione -> menu a tendina rapido direttamente nello step (fine Notte 2)
    if (role.id === 'copione') {
      const copionePlayer = activeMatch.players.find(p => p.originalRoleId === 'copione' || p.roleId === 'copione');
      if (copionePlayer) {
        const otherPlayers = activeMatch.players.filter(p => p.id !== copionePlayer.id);
        const optionsHtml = otherPlayers.map(op => {
          const opRole = getRoleById(op.roleId);
          const selected = activeMatch.copioneTargetId === op.id ? 'selected' : '';
          return `<option value="${op.id}" ${selected}>${escapeHtml(op.name)} (${escapeHtml(opRole.icon)} ${escapeHtml(opRole.name)})</option>`;
        }).join('');

        const currentRoleObj = getRoleById(copionePlayer.roleId);
        extraDynamicHtml += `
          <div class="scaletta-highlight" onclick="event.stopPropagation()">
            <div style="margin-bottom: 6px;">🎭 <strong>Copia ruolo di:</strong></div>
            <select class="select-field" onchange="handleCopioneCopy('${copionePlayer.id}', this.value)">
              <option value="">-- Seleziona giocatore indicato --</option>
              ${optionsHtml}
            </select>
            <div style="margin-top: 6px; font-size: 0.82rem;">
              Ruolo attuale di ${escapeHtml(copionePlayer.name)}: <strong>${escapeHtml(currentRoleObj.icon)} ${escapeHtml(currentRoleObj.name)}</strong>
            </div>
          </div>
        `;
      }
    }

    stepEl.innerHTML = `
      <div class="scaletta-step-header" onclick="toggleScalettaStepDone('${role.id}')" style="cursor:pointer;">
        <div class="scaletta-role-name">
          <span>${stepIndex + 1}. ${escapeHtml(role.icon)} ${escapeHtml(role.name)}</span>
          <span style="font-size: 0.84rem; font-weight: 400; color: var(--text-muted);">(${holderNamesHtml})</span>
        </div>
        <span class="badge">${isStepDone ? '✅ Fatto' : 'Tocca'}</span>
      </div>
      ${isRoleCompletelyDead ? `<div class="scaletta-dead-alert">⚠️ [RUOLO MORTO: Chiamalo a vuoto per bluffare e non dare indizi al tavolo]</div>` : ''}
      ${role.narratorPhrase ? `<div class="scaletta-phrase">🗣️ ${escapeHtml(role.narratorPhrase)}</div>` : ''}
      ${role.narratorNote ? `<div class="scaletta-note">💡 ${escapeHtml(role.narratorNote)}</div>` : ''}
      ${extraDynamicHtml}
    `;
    container.appendChild(stepEl);
  });
}

function toggleScalettaStepDone(roleId) {
  if (!activeMatch.completedSteps) activeMatch.completedSteps = [];
  const idx = activeMatch.completedSteps.indexOf(roleId);
  if (idx === -1) {
    activeMatch.completedSteps.push(roleId);
  } else {
    activeMatch.completedSteps.splice(idx, 1);
  }
  saveMatchToStorage();
  renderNightScaletta();
}

function handleCopioneCopy(copionePlayerId, targetPlayerId) {
  const copionePlayer = activeMatch.players.find(p => p.id === copionePlayerId);
  if (!copionePlayer) return;

  activeMatch.copioneTargetId = targetPlayerId || null;

  if (!targetPlayerId) {
    copionePlayer.roleId = 'copione';
    saveMatchToStorage();
    renderNarratorDashboard();
    return;
  }

  const targetPlayer = activeMatch.players.find(p => p.id === targetPlayerId);
  if (!targetPlayer) return;

  const targetRole = getRoleById(targetPlayer.roleId);
  // Se indica un Lupo o il Veggente diventa quel ruolo, altrimenti diventa Contadino
  if (targetRole.id === 'lupo' || targetRole.faction === 'Branco') {
    copionePlayer.roleId = 'lupo';
    showToast(`🎭 ${copionePlayer.name} ha indicato ${targetPlayer.name} ed è diventato un Lupo Mannaro!`);
  } else if (targetRole.id === 'veggente') {
    copionePlayer.roleId = 'veggente';
    showToast(`🎭 ${copionePlayer.name} ha indicato ${targetPlayer.name} ed è diventato il Veggente!`);
  } else {
    copionePlayer.roleId = 'contadino';
    showToast(`🎭 ${copionePlayer.name} ha indicato ${targetPlayer.name} ed è diventato un Contadino.`);
  }

  saveMatchToStorage();
  renderNarratorDashboard();
}

function renderDayScaletta() {
  const turn = activeMatch.turn;
  document.getElementById('scalettaTitle').textContent = `☀️ Scaletta Giorno ${turn}`;
  document.getElementById('scalettaSubtitle').textContent = 'Annunci del mattino, dibattito e votazione per il rogo';

  const container = document.getElementById('scalettaContainer');

  // Riepilogo automatico della notte (dai segnalini 🐺 🛡️ 👁️ messi stanotte)
  const nightItems = computeNightOutcome(activeMatch.players, findRoleOrNull);
  const outcomeText = {
    muore: { lupi: 'è stato sbranato dai lupi', veggente: 'è il Criceto e il Veggente lo ha sondato: muore' },
    salvo: { lupi: 'era il bersaglio dei lupi ma la Guardia lo ha protetto: è salvo' },
    immune: { lupi: 'era il bersaglio dei lupi ma è il Criceto Mannaro: è immune, non muore' },
    giaMorto: { lupi: 'è morto stanotte (già segnato)', veggente: 'è morto stanotte (già segnato)' }
  };
  const nightRows = nightItems.map(item => {
    const text = (outcomeText[item.outcome] || {})[item.cause] || '';
    const icon = item.outcome === 'muore' ? '💀' : item.outcome === 'giaMorto' ? '✔️' : '😮‍💨';
    const action = item.outcome === 'muore'
      ? `<button class="btn btn-sm btn-danger" style="margin-top: 6px;" onclick="markNightDeath('${item.playerId}')">💀 Segna ${escapeHtml(item.name)} come morto</button>`
      : '';
    return `<div>${icon} <strong>${escapeHtml(item.name)}</strong> ${text}${action ? '<br>' + action : ''}</div>`;
  }).join('');
  const nightDeathsAlreadyMarked = activeMatch.players.filter(p =>
    p.isDead && p.deathCause === 'notte' && p.diedOnTurn === turn && !nightItems.some(i => i.playerId === p.id)
  ).map(p => p.name);

  // Chi ha ricevuto i fiori 🌸 stanotte
  const flowerReceivers = activeMatch.players.filter(p => p.flowerTonight).map(p => p.name);
  // Chi è il Fantasma 👻
  const ghosts = activeMatch.players.filter(p => p.isGhost).map(p => p.name);
  // Chi è il Sindaco 🎖️ vivo
  const mayors = activeMatch.players.filter(p => !p.isDead && p.roleId === 'sindaco').map(p => p.name);
  // Chi è stato bruciato al rogo oggi
  const burnedToday = findBurnedOnDay(activeMatch.players, turn);

  container.innerHTML = `
    <div class="scaletta-step">
      <div class="scaletta-role-name">1. 🌅 Risveglio & Annuncio Morti Notturne</div>
      <div class="scaletta-highlight" style="display: flex; flex-direction: column; gap: 8px;">
        ${nightRows || '🌙 Nessun bersaglio dei lupi segnato stanotte (segnalino 🐺). Se qualcuno è morto, premi ❌ sulla sua riga e scegli "Morto stanotte".'}
        ${nightDeathsAlreadyMarked.length ? `<div>✔️ Morti stanotte già segnati: <strong>${escapeHtml(nightDeathsAlreadyMarked.join(', '))}</strong></div>` : ''}
      </div>
      <div class="scaletta-note">«Il villaggio si sveglia...» Annuncia chi è morto, senza rivelare il suo ruolo se giocate così.</div>
    </div>

    <div class="scaletta-step">
      <div class="scaletta-role-name">2. 🌸 Annuncio dei Fiori</div>
      <div class="scaletta-highlight">
        ${flowerReceivers.length > 0
          ? `🌸 «Stanotte qualcuno ha lasciato dei fiori davanti alla porta di: <strong>${escapeHtml(flowerReceivers.join(', '))}</strong>!»`
          : `🌸 Nessun giocatore ha il badge fiori (🌸) assegnato stanotte.`}
      </div>
    </div>

    <div class="scaletta-step">
      <div class="scaletta-role-name">3. ⚖️ Regole Speciali Votazione & Dibattito</div>
      <div class="scaletta-note">
        • 👻 <strong>Fantasma:</strong> ${ghosts.length ? `<strong>${escapeHtml(ghosts.join(', '))}</strong> (deve restare in assoluto silenzio, ma <strong>PUÒ VOTARE</strong> al rogo)` : 'Nessun Fantasma attivo'}<br>
        • 🎖️ <strong>Sindaco (voto 2x):</strong> ${mayors.length ? `<strong>${escapeHtml(mayors.join(', '))}</strong> ha il voto che vale doppio!` : 'Nessun Sindaco vivo in gioco'}
      </div>

      <!-- Timer del dibattito: durata regolabile -->
      <div class="timer-box">
        <div>
          <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600;">⏱️ TIMER DIBATTITO</div>
          <div id="dayTimerDisplay" class="timer-display ${dayTimerSeconds === 0 ? 'expired' : ''}">${formatTimer(dayTimerSeconds)}</div>
        </div>
        <div class="timer-controls">
          <button class="btn btn-sm" onclick="adjustDayTimer(-30)" aria-label="Togli 30 secondi">−30s</button>
          <button class="btn btn-sm" onclick="adjustDayTimer(30)" aria-label="Aggiungi 30 secondi">+30s</button>
          <button class="btn btn-sm btn-primary" onclick="startPauseDayTimer()" id="btnDayTimerPlay">
            ${dayTimerInterval ? '⏸️ Pausa' : '▶️ Via'}
          </button>
          <button class="btn btn-sm" onclick="resetDayTimer()" aria-label="Ricomincia">🔄</button>
        </div>
      </div>
    </div>

    <div class="scaletta-step">
      <div class="scaletta-role-name">4. 🔥 Condanna al Rogo</div>
      <div class="scaletta-note">
        Apri la votazione e segna chi vota chi: l'app conta i voti (Sindaco doppio, Fantasma compreso) e gestisce i pareggi. Oppure premi <strong>❌</strong> sulla riga del condannato e scegli <strong>"Bruciato al rogo"</strong>.
      </div>
      ${burnedToday ? '' : `<button class="btn btn-warning" onclick="openVoteModal()">🗳️ Apri la votazione</button>`}
      ${burnedToday
        ? `<div class="scaletta-highlight">🔥 Bruciato al rogo oggi: <strong>${escapeHtml(burnedToday.name)}</strong> (${escapeHtml(getRoleById(burnedToday.roleId).icon)} ${escapeHtml(getRoleById(burnedToday.roleId).name)})</div>`
        : ''}
    </div>
  `;
}

function markNightDeath(playerId) {
  const p = activeMatch.players.find(item => item.id === playerId);
  if (!p || p.isDead) return;
  killPlayer(p, 'notte');
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
  const disp = document.getElementById('dayTimerDisplay');
  const btn = document.getElementById('btnDayTimerPlay');
  if (disp) {
    disp.textContent = formatTimer(dayTimerSeconds);
    disp.classList.toggle('expired', dayTimerSeconds === 0);
  }
  if (btn) {
    btn.textContent = dayTimerInterval ? '⏸️ Pausa' : '▶️ Via';
  }
}

function getTimerDuration() {
  const saved = Number(appSettings.dayTimerSeconds);
  return saved >= 30 && saved <= 1200 ? saved : DEFAULT_DAY_TIMER_SECONDS;
}

// Il timer usa l'orario di fine: resta preciso anche se il telefono rallenta o lo schermo si spegne.
let dayTimerEndsAt = 0;

function startPauseDayTimer() {
  if (dayTimerInterval) {
    stopDayTimer();
  } else {
    if (dayTimerSeconds <= 0) dayTimerSeconds = getTimerDuration();
    dayTimerEndsAt = Date.now() + dayTimerSeconds * 1000;
    dayTimerInterval = setInterval(() => {
      dayTimerSeconds = Math.max(0, Math.ceil((dayTimerEndsAt - Date.now()) / 1000));
      updateTimerUI();
      if (dayTimerSeconds === 0) {
        stopDayTimer();
        vibrate('long');
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
    // La durata scelta da fermo diventa quella predefinita delle prossime volte.
    appSettings.dayTimerSeconds = dayTimerSeconds;
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
  dayTimerSeconds = getTimerDuration();
  updateTimerUI();
}

/* =========================================================================
   12. LISTA GIOCATORI INTERATTIVA (CONTROLLO 100% MANUALE)
========================================================================= */
function renderNarratorPlayersList() {
  const container = document.getElementById('narratorPlayersList');
  container.innerHTML = '';

  activeMatch.players.forEach(p => {
    const role = getRoleById(p.roleId);
    const origRole = getRoleById(p.originalRoleId);
    const factionClass = getFactionBadgeClass(role.faction);

    // Costruisci pillole di stato e badge attivi
    let badgesHtml = '';
    const deathWhen = describeDeath(p);
    if (p.isGhost) {
      badgesHtml += `<span class="status-pill status-ghost">👻 FANTASMA (Vota in silenzio)${deathWhen ? ' • ' + deathWhen : ''}</span>`;
    } else if (p.isDead) {
      badgesHtml += `<span class="status-pill status-dead">💀 MORTO${deathWhen ? ' • ' + deathWhen : ''}</span>`;
    } else {
      badgesHtml += `<span class="status-pill status-alive">● Vivo</span>`;
    }

    if (p.shieldYesterday) {
      badgesHtml += `<span class="status-pill status-shield-prev">🛡️ Ieri (Non proteggibile)</span>`;
    }
    if (p.shieldTonight) {
      badgesHtml += `<span class="status-pill status-active-badge">🛡️ Scudato</span>`;
    }
    if (p.wolfTarget) {
      badgesHtml += `<span class="status-pill status-dead">🐺 Bersaglio</span>`;
    }
    if (p.flowerTonight) {
      badgesHtml += `<span class="status-pill status-active-badge">🌸 Fiori</span>`;
    }
    if (p.seerProbed) {
      badgesHtml += `<span class="status-pill status-active-badge">👁️ Sondato</span>`;
    }
    if (p.extraPin) {
      badgesHtml += `<span class="status-pill status-active-badge">📌 Segnalino</span>`;
    }


    const wasCopione = p.originalRoleId === 'copione' && p.roleId !== 'copione';

    const card = document.createElement('div');
    card.className = 'narrator-player-card' + (p.isDead ? ' is-dead' : '') + (p.isGhost ? ' is-ghost' : '');
    card.innerHTML = `
      <div class="np-top">
        <div class="np-identity">
          <div class="np-name-row">
            <span class="np-name">${escapeHtml(p.name)}</span>
            <span class="badge ${factionClass}">${escapeHtml(role.icon)} ${escapeHtml(role.name)}</span>
            ${wasCopione ? `<span class="badge">🎭 Ex-${escapeHtml(origRole.name)}</span>` : ''}
          </div>
          <div class="np-badges" style="margin-top: 4px;">
            ${badgesHtml}
          </div>
        </div>
        <button class="icon-btn" style="height: 34px; min-width: 34px; font-size: 0.85rem;" onclick="openAntiAmnesiaForPlayer('${p.id}')" title="Mostra carta ruolo a questo giocatore">
          🃏
        </button>
      </div>

      <div class="np-actions">
        <button class="np-action-btn ${p.shieldTonight ? 'active-shield' : ''}" onclick="togglePlayerBadge('${p.id}', 'shieldTonight')" title="Scudato stanotte dalla Guardia">🛡️</button>
        <button class="np-action-btn ${p.wolfTarget ? 'active-wolf' : ''}" onclick="togglePlayerBadge('${p.id}', 'wolfTarget')" title="Bersaglio stanotte dei Lupi">🐺</button>
        <button class="np-action-btn ${p.flowerTonight ? 'active-flower' : ''}" onclick="togglePlayerBadge('${p.id}', 'flowerTonight')" title="Ha ricevuto i fiori stanotte">🌸</button>
        <button class="np-action-btn ${p.seerProbed ? 'active-seer' : ''}" onclick="togglePlayerBadge('${p.id}', 'seerProbed')" title="Sondato stanotte dal Veggente">👁️</button>
        <button class="np-action-btn ${p.extraPin ? 'active-pin' : ''}" onclick="togglePlayerBadge('${p.id}', 'extraPin')" title="Segnalino generico extra">📌</button>
        <button class="np-action-btn ${p.isDead ? 'active-kill' : ''}" onclick="togglePlayerKill('${p.id}')" title="Elimina / Uccidi giocatore">❌</button>
        <button class="np-action-btn ${p.isGhost ? 'active-ghost' : ''}" onclick="togglePlayerGhost('${p.id}')" title="Attiva/Disattiva Fantasma">👻</button>
      </div>
    `;
    container.appendChild(card);
  });
}

function togglePlayerBadge(playerId, badgeField) {
  const p = activeMatch.players.find(item => item.id === playerId);
  if (!p) return;
  p[badgeField] = !p[badgeField];
  saveMatchToStorage();
  renderNarratorDashboard();
}

function describeDeath(p) {
  if (!p.isDead || !p.diedOnTurn) return '';
  if (p.deathCause === 'rogo') return `🔥 Rogo G${p.diedOnTurn}`;
  if (p.deathCause === 'notte') return `🌙 Notte ${p.diedOnTurn}`;
  return `G${p.diedOnTurn}`;
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

function killPlayer(p, cause) {
  const role = getRoleById(p.roleId);
  p.isDead = true;
  p.deathCause = cause;
  p.diedOnTurn = activeMatch.turn;
  p.diedInPhase = cause === 'notte' ? 'night' : cause === 'rogo' ? 'day' : activeMatch.phase;

  // Riattiva controllo banner vittoria a ogni nuova eliminazione
  activeMatch.victoryDismissed = false;

  if (cause === 'rogo') {
    activeMatch.lastBurnedPlayerId = p.id;
    showToast(`🔥 ${p.name} è stato bruciato al rogo.`);
  }

  // Logica del Fantasma: se la regola è attiva, ancora nessuno è Fantasma, e il giocatore è della fazione "Villaggio"
  const anyGhostAlready = activeMatch.players.some(other => other.isGhost);
  if (activeMatch.ghostRule && !anyGhostAlready && role.faction === 'Villaggio') {
    p.isGhost = true;
    showToast(`👻 È il primo buono a morire: ${p.name} diventa il Fantasma!`, 'ghost');
  }

  vibrate('short');
  saveMatchToStorage();
  renderNarratorDashboard();
}

function revivePlayer(p) {
  p.isDead = false;
  p.isGhost = false;
  p.deathCause = null;
  p.diedOnTurn = null;
  p.diedInPhase = null;
  if (activeMatch.lastBurnedPlayerId === p.id) {
    activeMatch.lastBurnedPlayerId = null;
  }
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
    document.getElementById('toggleGhostRuleInGame').checked = !!activeMatch.ghostRule;
  }
  document.getElementById('menuVersionLabel').textContent = `Lupus v${getAppVersion()}`;
  document.getElementById('modalGameMenu').classList.add('active');
}

function closeGameMenuModal() {
  document.getElementById('modalGameMenu').classList.remove('active');
}

function isMatchOver() {
  return !!(activeMatch && evaluateVictoryCondition());
}

// Dal menu ⚙️ chiede conferma se la partita non è ancora finita (dal banner di vittoria no).
function confirmQuickRematch() {
  if (isMatchOver()) { quickRematch(); return; }
  openConfirmModal(
    '🔄 Rivincita Rapida',
    'La partita in corso verrà chiusa: stessi giocatori e stesso mazzo, ma ruoli rimescolati.',
    quickRematch,
    { yesLabel: 'Rimescola', yesClass: 'btn-primary' }
  );
}

function confirmReturnToSetup() {
  if (isMatchOver()) { returnToSetupScreen(); return; }
  openConfirmModal(
    '🏠 Torna al Setup',
    'La partita in corso verrà chiusa. I nomi dei giocatori e i ruoli restano per la prossima partita.',
    returnToSetupScreen,
    { yesLabel: 'Chiudi partita' }
  );
}

function quickRematch() {
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

  if (startDistributionPhase()) {
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
   Ogni votante sceglie chi vuole al rogo; il Sindaco vale 2, il Fantasma vota.
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
  getVoters(activeMatch.players).forEach(voter => {
    const weight = voteWeight(voter, findRoleOrNull(voter.roleId));
    const tags = [];
    if (weight === 2) tags.push('<span class="badge badge-alleato">🎖️ vale 2</span>');
    if (voter.isGhost) tags.push('<span class="badge badge-solitario">👻 Fantasma</span>');
    const current = vote.votes[voter.id] || '';
    const options = candidates.map(c =>
      `<option value="${c.id}" ${current === c.id ? 'selected' : ''}>${escapeHtml(c.name)}${c.id === voter.id ? ' (sé stesso)' : ''}</option>`
    ).join('');
    const row = document.createElement('div');
    row.className = 'vote-row';
    row.innerHTML = `
      <div class="vote-voter">
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
    actions.innerHTML = `
      <div class="scaletta-highlight">⚖️ Pareggio tra <strong>${escapeHtml(names.join(', '))}</strong> con ${tally.maxVotes} voti.</div>
      <button class="btn btn-primary" onclick="startRunoff()">⚖️ Ballottaggio tra ${escapeHtml(names.join(' e '))}</button>`;
  } else {
    actions.innerHTML = '';
  }
  document.getElementById('btnVoteRestart').style.display = vote.round > 1 ? 'inline-flex' : 'none';
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
  openConfirmModal(
    '🔥 Condanna al rogo',
    `Il villaggio manda al rogo ${p.name}. Confermi?`,
    () => {
      closeVoteModal();
      killPlayer(p, 'rogo');
    },
    { yesLabel: '🔥 Brucia', yesClass: 'btn-warning' }
  );
}

/* =========================================================================
   18. RIEPILOGO DELLA PARTITA (RUOLI SVELATI E CRONOLOGIA)
========================================================================= */
function currentNightMarkers() {
  const ids = field => activeMatch.players.filter(p => p[field]).map(p => p.id);
  return {
    turn: activeMatch.turn,
    wolfTargets: ids('wolfTarget'),
    shielded: ids('shieldTonight'),
    probed: ids('seerProbed'),
    flowers: ids('flowerTonight')
  };
}

function recordNightLog() {
  const logs = (activeMatch.nightLogs || []).filter(l => l.turn !== activeMatch.turn);
  logs.push(currentNightMarkers());
  activeMatch.nightLogs = logs;
}

function openSummaryModal() {
  if (!activeMatch) return;
  closeGameMenuModal();

  // Cronologia: notti già salvate + i segnalini della notte in corso
  const logs = (activeMatch.nightLogs || []).filter(l => l.turn !== activeMatch.turn);
  logs.push(currentNightMarkers());
  const timeline = buildTimeline(activeMatch.players, logs, findRoleOrNull);

  const win = evaluateVictoryCondition();
  document.getElementById('summaryWinner').innerHTML = win
    ? `<div class="victory-title">${escapeHtml(win.text)}</div>`
    : `<div class="card-subtitle">Partita ancora in corso: ${escapeHtml(getPhaseLabel(activeMatch))}.</div>`;

  const factions = ['Branco', 'Alleato dei Lupi', 'Solitario', 'Villaggio'];
  const groups = factions.map(faction => {
    const members = activeMatch.players.filter(p => getRoleById(p.roleId).faction === faction);
    if (!members.length) return '';
    const rows = members.map(p => {
      const role = getRoleById(p.roleId);
      const wasCopione = p.originalRoleId !== p.roleId ? ` <span class="card-subtitle">(era ${escapeHtml(getRoleById(p.originalRoleId).name)})</span>` : '';
      const status = p.isGhost ? '👻' : p.isDead ? '💀' : '🟢';
      const when = describeDeath(p);
      return `<div class="summary-player">${status} <strong>${escapeHtml(p.name)}</strong> — ${escapeHtml(role.icon)} ${escapeHtml(role.name)}${wasCopione}${when ? ` <span class="card-subtitle">• ${escapeHtml(when)}</span>` : ''}</div>`;
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
    : '<div class="card-subtitle">Ancora niente da raccontare: usa i segnalini 🐺 🛡️ 👁️ 🌸 e ❌ durante la partita.</div>';

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
  document.getElementById(prefix + 'PlayerName').textContent = player.name;
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
  vibrate('short');
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
  vibrate('short');
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

  const wakeLabels = {
    mai: 'non si sveglia di notte',
    ogni_notte: 'si sveglia ogni notte',
    solo_notte_1: 'si sveglia solo la prima notte',
    solo_notte_2: 'si sveglia solo la seconda notte',
    dalla_notte_2: 'si sveglia dalla seconda notte in poi'
  };
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
            <div class="card-subtitle">🏆 ${escapeHtml(r.howYouWin)} • 🌙 ${escapeHtml(wakeLabels[r.wakeTiming] || '')}</div>
          </div>`).join('')}
      </div>`;
  }).join('') || '<div class="card-subtitle">Nessun ruolo da mostrare.</div>';

  document.getElementById('guideGhostRule').style.display = ghostOn ? 'block' : 'none';
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
    `Per aggiungerli: apri Lupus → 🛠️ Gestisci / Crea Ruoli → 📥 Importa ruoli e incolla tutto questo messaggio.\n\n` +
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
