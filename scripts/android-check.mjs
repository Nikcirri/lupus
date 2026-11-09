// Controlli dell'app vera dentro l'emulatore Android (usato da scripts/android-emulator-test.sh).
// Parla con la pagina attraverso il "debug remoto" del WebView (Chrome DevTools Protocol, porta 9222)
// e chiama ogni funzione del telefono che l'app usa: se R8 avesse tolto qualcosa di necessario, qui si vede.
// Uso: node scripts/android-check.mjs <cartella risultati>
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2] || '.';
const PKG = 'com.nikcirri.lupus';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const adb = args => execSync(`adb ${args}`, { encoding: 'utf8' });
const failures = [];

function screenshot(name) {
  writeFileSync(join(OUT, name), execSync('adb exec-out screencap -p'));
}

/** Finestra in primo piano sul telefono (per capire se l'app è davanti o no). */
function focusedWindow() {
  return adb('shell dumpsys window').split('\n').find(l => l.includes('mCurrentFocus')) || '';
}

const appInFront = () => focusedWindow().includes(PKG);

function check(ok, message, detail = '') {
  if (ok) {
    console.log(`  ok - ${message}`);
  } else {
    failures.push(message);
    console.log(`  ERRORE - ${message}${detail ? ` (${detail})` : ''}`);
  }
}

class DevTools {
  constructor(url) {
    this.url = url;
    this.nextId = 0;
    this.pending = new Map();
    this.exceptions = [];
    this.consoleErrors = [];
  }

  open() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);
      this.ws.onopen = resolve;
      this.ws.onerror = () => reject(new Error('Collegamento al debug della pagina non riuscito'));
      this.ws.onmessage = event => this.receive(JSON.parse(event.data));
    });
  }

  receive(msg) {
    if (msg.id && this.pending.has(msg.id)) {
      const { resolve, reject } = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
      return;
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      this.exceptions.push((d.exception && d.exception.description) || d.text);
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      this.consoleErrors.push(msg.params.args.map(a => a.value ?? a.description ?? '').join(' '));
    }
  }

  send(method, params = {}) {
    const id = ++this.nextId;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  /** Esegue codice nella pagina (anche con await) e restituisce il risultato. */
  async run(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression: `(async () => { ${expression} })()`,
      awaitPromise: true,
      returnByValue: true
    });
    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      throw new Error((d.exception && d.exception.description) || d.text);
    }
    return r.result.value;
  }

  /** Come run, ma un errore diventa il testo 'ERRORE: ...' invece di fermare tutto. */
  async attempt(expression) {
    try {
      return await this.run(expression);
    } catch (e) {
      return `ERRORE: ${e.message.split('\n')[0]}`;
    }
  }
}

async function findPage() {
  for (let i = 0; i < 40; i++) {
    try {
      const targets = await (await fetch('http://127.0.0.1:9222/json')).json();
      const page = targets.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page;
    } catch {
      // il WebView non è ancora pronto
    }
    await sleep(1000);
  }
  throw new Error("La pagina dell'app non compare nel debug remoto");
}

async function waitFor(dt, expression, label, seconds = 30) {
  for (let i = 0; i < seconds * 2; i++) {
    if (await dt.attempt(expression) === true) return true;
    await sleep(500);
  }
  check(false, label, `dopo ${seconds} secondi`);
  return false;
}

async function main() {
  const page = await findPage();
  console.log(`Pagina trovata: ${page.url}`);
  const dt = new DevTools(page.webSocketDebuggerUrl);
  await dt.open();
  const ready = "return document.readyState === 'complete' && typeof window.LupusApp === 'object' && typeof setupNext === 'function';";
  await waitFor(dt, ready, "l'app si carica");

  console.log('Primo avvio');
  check(appInFront(), "l'app è in primo piano", focusedWindow().trim());
  const welcome = await dt.attempt("return document.getElementById('modalWelcome').classList.contains('active');");
  check(welcome === true, 'al primo avvio compare il benvenuto');
  screenshot('1-benvenuto.png');

  console.log('Tasto Indietro (plugin App)');
  // contatore: il tasto arriva alla funzione dell'app? (senza aggiungere altri ascoltatori del tasto)
  await dt.run("window.__backCalls = 0; const orig = window.handleAndroidBack; window.handleAndroidBack = function () { window.__backCalls++; return orig.apply(this, arguments); }; return true;");
  await sleep(1000);
  adb('shell input keyevent KEYCODE_BACK');
  await waitFor(dt, "return !document.getElementById('modalWelcome').classList.contains('active');", 'Indietro chiude il benvenuto', 10);
  console.log(`  (tasto Indietro arrivato all'app: ${await dt.attempt('return window.__backCalls;')} volta)`);
  await sleep(500);
  check(appInFront(), "dopo Indietro l'app resta aperta", focusedWindow().trim());

  // Si ricarica la pagina con il controllo degli errori già acceso, per vedere anche quelli dell'avvio.
  await dt.send('Runtime.enable');
  await dt.send('Page.enable');
  await dt.send('Page.reload', { ignoreCache: true });
  await sleep(1500);
  await waitFor(dt, ready, "l'app si ricarica");
  await sleep(2500);

  console.log('Avvio');
  check(await dt.attempt('return window.LupusApp.isNative;') === true, 'gira come app Android (Capacitor attivo)');
  const version = await dt.attempt('return window.LupusApp.version;');
  check(typeof version === 'string' && /^\d+\.\d+\.\d+/.test(version), `versione nell'app: ${version}`);

  console.log('Funzioni del telefono');
  const info = await dt.attempt('return await Capacitor.Plugins.App.getInfo();');
  check(info && info.id === PKG, 'App.getInfo risponde', JSON.stringify(info));
  const haptics = await dt.attempt("await Capacitor.Plugins.Haptics.impact({ style: 'LIGHT' }); await Capacitor.Plugins.Haptics.vibrate({ duration: 40 }); await Capacitor.Plugins.Haptics.notification({ type: 'SUCCESS' }); return 'ok';");
  check(haptics === 'ok', 'vibrazioni', haptics);
  const clip = await dt.attempt("await window.LupusApp.writeClipboard('lupus-prova'); return await window.LupusApp.readClipboard();");
  check(clip === 'lupus-prova', 'appunti: copia e incolla', clip);
  const file = await dt.attempt("const fs = Capacitor.Plugins.Filesystem; await fs.writeFile({ path: 'prova.txt', data: 'lupo', directory: 'CACHE', encoding: 'utf8' }); const r = await fs.readFile({ path: 'prova.txt', directory: 'CACHE', encoding: 'utf8' }); await fs.deleteFile({ path: 'prova.txt', directory: 'CACHE' }); return r.data;");
  check(file === 'lupo', 'file: scrivi, leggi e cancella', file);
  const canShare = await dt.attempt('return (await Capacitor.Plugins.Share.canShare()).value;');
  check(canShare === true, 'Condividi disponibile', String(canShare));

  console.log('Backup: file + Condividi');
  await dt.run("window.__shareResult = null; window.LupusApp.shareFile('lupus-backup-prova.json', JSON.stringify({ app: 'lupus', prova: true })).then(r => { window.__shareResult = String(r); }, e => { window.__shareResult = 'ERRORE: ' + e.message; }); return true;");
  let focus = '';
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    focus = focusedWindow();
    if (/chooser|resolver/i.test(focus)) break;
  }
  check(/chooser|resolver/i.test(focus), 'si apre la finestra Condividi del telefono', focus.trim());
  await sleep(1000);
  screenshot('2-condividi.png');
  adb('shell input keyevent KEYCODE_BACK');
  await waitFor(dt, 'return window.__shareResult !== null;', 'Condividi chiusa: la promessa finisce', 15);
  const shareResult = await dt.attempt('return window.__shareResult;');
  check(shareResult === 'false' || shareResult === 'true', 'backup: chiudere Condividi non è un errore', shareResult);
  await sleep(500);
  check(appInFront(), 'chiusa Condividi si torna all\'app', focusedWindow().trim());

  console.log('Aggiornamento dentro l\'app (plugin AppUpdater)');
  const allowed = await dt.attempt('return (await Capacitor.Plugins.AppUpdater.canInstall()).allowed;');
  check(allowed === false, 'all\'inizio Android chiede il permesso per installare', String(allowed));
  for (const bad of ['https://example.com/Lupus.apk', 'https://github.com/Nikcirri/nutrizione/releases/download/v1.0.0/x.apk', 'http://github.com/Nikcirri/lupus/releases/download/v1.9.1/Lupus-v1.9.1.apk', 'https://github.com/Nikcirri/lupus/releases/download/v1.9.1/Lupus.zip']) {
    const r = await dt.attempt(`await Capacitor.Plugins.AppUpdater.downloadAndInstall({ url: ${JSON.stringify(bad)} }); return 'scaricato';`);
    check(/non valido/.test(String(r)), `rifiuta ${bad}`, String(r));
  }
  const checked = await dt.attempt('return (await checkForUpdates()).kind;');
  if (checked === 'error') console.log('  (controllo su GitHub non riuscito: forse troppe richieste dal server di prova, non è un errore dell\'app)');
  else check(checked === 'current' || checked === 'available', `l'app chiede a GitHub l'ultima versione (${checked})`, String(checked));

  // Versione finta 99.0.0 che punta a un APK vero di Lupus (1.9.1): permesso, impostazioni, ritorno, download, installazione
  const apk = 'https://github.com/Nikcirri/lupus/releases/download/v1.9.1/Lupus-v1.9.1.apk';
  await dt.run(`localStorage.setItem('lupus_updates_v1', JSON.stringify({ lastCheck: new Date().toISOString(), latestVersion: '99.0.0', apkUrl: ${JSON.stringify(apk)}, notes: ['Prima novità', 'Seconda novità'] })); updateBannerHidden = false; renderUpdateBanner(); return true;`);
  check(await dt.attempt("return getComputedStyle(document.getElementById('updateBanner')).display !== 'none' && document.getElementById('updateBanner').textContent.includes('99.0.0');") === true, 'avviso in alto con la nuova versione');
  screenshot('7-avviso-aggiornamento.png');
  await dt.run("document.querySelector('#updateBanner .btn-primary').click(); return true;");
  await waitFor(dt, "return document.getElementById('modalUpdatePermission').classList.contains('active');", 'senza permesso spiega cosa toccare', 10);
  await dt.run("document.querySelector('#modalUpdatePermission .btn-primary').click(); return true;");
  let settings = '';
  for (let i = 0; i < 20 && !/settings/i.test(settings); i++) { await sleep(500); settings = focusedWindow(); }
  check(/settings/i.test(settings), 'si aprono le impostazioni "Installa app sconosciute"', settings.trim());
  await sleep(1000);
  screenshot('8-permesso.png');
  adb(`shell appops set ${PKG} REQUEST_INSTALL_PACKAGES allow`);
  adb('shell input keyevent KEYCODE_BACK');
  await waitFor(dt, "return updatePhase === 'download' || updatePhase === 'install';", 'tornati nell\'app il download riparte da solo', 20);
  let maxPercent = 0;
  for (let i = 0; i < 120; i++) {
    const st = await dt.attempt('return { phase: updatePhase, percent: updatePercent };');
    if (st && typeof st.percent === 'number') maxPercent = Math.max(maxPercent, st.percent);
    if (st && st.phase !== 'download') break;
    await sleep(500);
  }
  check(maxPercent === 100, 'download completo (percentuale fino a 100)', String(maxPercent));
  let installer = '';
  for (let i = 0; i < 30 && !/packageinstaller/i.test(installer); i++) { await sleep(500); installer = focusedWindow(); }
  check(/packageinstaller/i.test(installer), 'si apre l\'installazione di Android', installer.trim());
  check(await dt.attempt('return updatePhase;') === 'install', 'l\'avviso dice cosa toccare nell\'installazione');
  await sleep(1000);
  screenshot('9-installazione.png');
  adb('shell input keyevent KEYCODE_BACK');
  await sleep(1500);
  if (!appInFront()) { adb('shell input keyevent KEYCODE_BACK'); await sleep(1500); }
  await waitFor(dt, "return updatePhase === 'idle' && document.getElementById('updateBanner').textContent.includes('Aggiorna');", 'annullata l\'installazione si può riprovare', 10);
  await dt.run("localStorage.removeItem('lupus_updates_v1'); renderUpdateBanner(); return true;");

  console.log('Una partita, come farebbe una persona');
  await dt.run("const input = document.getElementById('playerNameInput'); input.value = 'Anna, Bruno, Carla, Dario, Elena, Fabio'; addPlayerFromInput(); return true;");
  check(await dt.attempt("return document.querySelectorAll('.player-chip').length;") === 6, '6 giocatori aggiunti');
  await dt.run('setupNext(); return true;');
  check(await dt.attempt("return getComputedStyle(document.getElementById('setupPane2')).display !== 'none';") === true, 'tappa del mazzo');
  await dt.run('setupNext(); return true;');
  check(await dt.attempt("return getComputedStyle(document.getElementById('setupPane3')).display !== 'none';") === true, 'tappa delle opzioni');
  screenshot('3-opzioni.png');
  await dt.run('setupNext(); return true;');
  await waitFor(dt, "return document.getElementById('screenDistribution').classList.contains('active');", 'parte la distribuzione dei ruoli', 10);
  const fonts = await dt.attempt("await document.fonts.ready; return document.fonts.check('700 20px Alegreya') && document.fonts.check('400 16px \"Alegreya Sans\"');");
  check(fonts === true, 'caratteri Alegreya caricati', String(fonts));
  screenshot('4-distribuzione.png');
  adb('shell input keyevent KEYCODE_BACK');
  await waitFor(dt, "return document.getElementById('modalConfirm').classList.contains('active');", 'Indietro durante la partita chiede se uscire', 10);
  screenshot('5-uscire.png');
  adb('shell input keyevent KEYCODE_BACK');
  await waitFor(dt, "return !document.getElementById('modalConfirm').classList.contains('active');", 'Indietro chiude la domanda', 10);

  console.log('Errori nella pagina');
  check(dt.exceptions.length === 0, 'nessun errore JavaScript', dt.exceptions.join(' | '));
  if (dt.consoleErrors.length) console.log(`  (messaggi di errore in console: ${dt.consoleErrors.join(' | ')})`);

  dt.ws.close();
  if (failures.length) {
    console.log(`\n${failures.length} controlli non riusciti.`);
    process.exit(1);
  }
  console.log('\nTutto ok sul telefono finto.');
}

main().catch(e => {
  console.error(`ERRORE: ${e.message}`);
  process.exit(1);
});
