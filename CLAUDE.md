# Regole di lavoro per il progetto Lupus

- L'app è l'assistente del Narratore per Lupus in Fabula: HTML/CSS/JS semplici (niente framework) impacchettati con Vite + Capacitor 8 Android. Niente CDN né risorse da internet: tutto incluso nell'app, che deve funzionare offline. L'unica richiesta di rete è il controllo aggiornamenti verso l'API Releases di GitHub.
- Struttura: `index.html` (schermate e stile), `public/game.js` (interfaccia, script classico con funzioni globali usate da `onclick`), `public/rules.js` (ruoli, preset e regole pure senza DOM), `src/native.js` (modulo Capacitor che espone `window.LupusApp`).
- Ogni regola nuova o modificata va in `public/rules.js` con un test in `tests/rules.test.js`. Ogni preset deve avere tanti ruoli quanti giocatori (lo controlla il test).
- La modalità guidata del Narratore si basa sull'azione notturna dei ruoli (`nightAction`, `actionRules` in `rules.js`): un ruolo nuovo deve funzionare scegliendo una delle azioni esistenti, senza codice speciale per il suo id. Le scelte della notte stanno in `activeMatch.nightChoices`, l'alba le risolve con `resolveNight`.
- Implementa tutto per intero: niente codice troncato, niente `TODO`, niente funzioni vuote o segnaposto.
- Fine di ogni modifica, sempre in quest'ordine:
  1. `npm run verify` (test + build) deve passare; se possibile anche `python3 tests/smoke.py`;
  2. `npx cap sync android`;
  3. aggiorna `CHANGELOG.md` con una sezione `## [X.Y.Z] - AAAA-MM-GG` e la versione in `package.json`;
  4. commit e push su `main`: quando cambia la versione in `package.json`, GitHub Actions costruisce l'APK firmato e pubblica la Release `vX.Y.Z` (non servono tag a mano). Controlla che i workflow "Controllo" e "Pubblica APK" finiscano con successo;
  5. dai all'utente il link https://github.com/Nikcirri/lupus/releases/latest e un elenco breve di cose da provare sul telefono.
- L'utente è un principiante assoluto e usa solo il telefono: istruzioni passo passo, parole semplici, niente comandi da terminale per lui.
- La chiave di firma non va mai nel repository. Vive solo nei Secrets di GitHub (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, alias `lupus`). Non cambiarla mai: con una chiave diversa gli aggiornamenti non si installano sopra la versione vecchia.
- Non cambiare `appId` (`com.nikcirri.lupus`) né le chiavi di `localStorage` (`lupus_narratore_*_v1`), per non perdere i dati di chi ha già l'app.
- Testi dell'interfaccia in italiano.
