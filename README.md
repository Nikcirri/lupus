# Lupus

L'assistente del Narratore per giocare a **Lupus in Fabula**: giocatori, mazzo dei ruoli, distribuzione segreta passando il telefono e una guida passo-passo per la notte e il giorno (frasi da leggere, scelte con un tocco, morti e vittorie calcolate da sola), votazione al rogo e riepilogo finale. Anche i ruoli inventati da te funzionano nella guida. Funziona senza internet e tutti i dati restano sul telefono.

## Installare l'app (Android)

1. Dal telefono apri https://github.com/Nikcirri/lupus/releases/latest
2. In fondo alla pagina, sotto "Assets", tocca il file `Lupus-vX.Y.Z.apk` per scaricarlo.
3. Apri il file scaricato (dalla notifica o dall'app File).
4. Se Android dice che l'installazione è bloccata, tocca **Impostazioni**, attiva **Consenti da questa origine** e torna indietro.
5. Tocca **Installa**. Se compare un avviso di Play Protect, tocca **Installa comunque**: succede con tutte le app che non arrivano dal Play Store.

Per condividerla con gli amici basta mandare lo stesso link.

## Aggiornare

L'app controlla da sola, al massimo una volta al giorno, se è uscita una versione nuova: in quel caso nella schermata iniziale compare l'avviso **Nuova versione di Lupus** con **Scarica l'aggiornamento**. Puoi controllare anche a mano dal pulsante **ℹ️** in alto (oppure ⚙️ → Informazioni durante la partita).

Apri il file scaricato e tocca **Aggiorna**: la nuova versione si installa sopra quella vecchia e giocatori, ruoli e partita in corso restano.

## Per chi sviluppa

- `index.html`: schermate e stile. `public/game.js`: logica dell'interfaccia. `public/rules.js`: ruoli, preset e regole pure (azioni notturne dei ruoli, piano della notte, bersagli consentiti, risoluzione dell'alba, vittorie, voti, controllo del mazzo, versioni). `src/native.js`: collegamento alle funzioni del telefono (tasto Indietro, vibrazione, condivisione, appunti).
- `npm run dev` avvia la versione web, `npm test` controlla le regole, `npm run verify` fa test e build. `python3 tests/smoke.py` (dopo `npm run build`) gioca una partita completa in Chrome.
- Quando su `main` cambia la versione in `package.json`, GitHub Actions costruisce l'APK firmato e pubblica la Release `vX.Y.Z` (`.github/workflows/release.yml`). A ogni push `.github/workflows/check.yml` fa test, build web e build Android di prova.
- Icona: sorgente in `resources/icon.svg`, file Android in `android/app/src/main/res` (vettoriali + PNG per i telefoni più vecchi).
- `CHANGELOG.md` finisce anche dentro l'app (finestra "Novità", letta da `scripts/changelog.mjs` durante la build). Il QR code di download in `public/qr-scarica.svg` si rigenera con `npm run qr`.
- Regole di lavoro: [`CLAUDE.md`](CLAUDE.md). Novità di ogni versione: [`CHANGELOG.md`](CHANGELOG.md).
