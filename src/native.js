// Collegamento tra il gioco (public/game.js) e le funzioni del telefono Android.
// Il gioco usa window.LupusApp se c'è; nel browser queste funzioni fanno il minimo indispensabile.
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Haptics } from '@capacitor/haptics';

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

  /** Schermo intero: nasconde (o mostra) la barra di stato e quella di navigazione. */
  async setFullscreen(on) {
    if (!isNative) return;
    try {
      if (on) await SystemBars.hide();
      else await SystemBars.show();
    } catch {
      // Non disponibile su questo telefono.
    }
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
