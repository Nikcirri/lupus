// Collegamento tra il gioco (public/game.js) e le funzioni del telefono Android.
// Il gioco usa window.LupusApp se c'è; nel browser queste funzioni fanno il minimo indispensabile.
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Haptics } from '@capacitor/haptics';
import { Share } from '@capacitor/share';
import { Clipboard } from '@capacitor/clipboard';

const isNative = Capacitor.isNativePlatform();

window.LupusApp = {
  version: __APP_VERSION__,
  isNative,

  /** 'short' = vibrazione breve (morte di un giocatore), 'long' = fine del timer. */
  async vibrate(kind) {
    if (!isNative) return;
    try {
      if (kind === 'long') {
        await Haptics.vibrate({ duration: 900 });
      } else {
        await Haptics.vibrate({ duration: 40 });
      }
    } catch {
      // La vibrazione è un extra: se il telefono non la supporta si continua senza.
    }
  },

  /** Apre il menu "Condividi" del telefono (WhatsApp, Telegram, email...). */
  async share(text) {
    await Share.share({ title: 'Ruoli per Lupus', text, dialogTitle: 'Condividi i ruoli' });
  },

  /** Copia un testo negli appunti. */
  async writeClipboard(text) {
    await Clipboard.write({ string: text });
  },

  /** Legge il testo copiato negli appunti ('' se non c'è). */
  async readClipboard() {
    const { value } = await Clipboard.read();
    return typeof value === 'string' ? value : '';
  },

  /** Manda l'app in secondo piano (come il tasto Home): la partita resta salvata. */
  minimize() {
    if (!isNative) return;
    App.minimizeApp().catch(() => App.exitApp());
  },

  /** Apre un link fuori dall'app, nel browser del telefono (che scarica l'APK). */
  openExternal(url) {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.append(a);
    a.click();
    a.remove();
  },
};

if (isNative) {
  SystemBars.setStyle({ style: SystemBarsStyle.Dark }).catch(() => {});

  // Tasto Indietro: prima chiude finestre e schermate interne; se non c'è niente da chiudere, l'app va in secondo piano.
  App.addListener('backButton', () => {
    const handled = typeof window.handleAndroidBack === 'function' && window.handleAndroidBack();
    if (!handled) window.LupusApp.minimize();
  });
}
