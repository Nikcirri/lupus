// Collegamento tra il gioco (public/game.js) e le funzioni del telefono Android.
// Il gioco usa window.LupusApp se c'è; nel browser queste funzioni fanno il minimo indispensabile.
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Share } from '@capacitor/share';
import { Clipboard } from '@capacitor/clipboard';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';

const isNative = Capacitor.isNativePlatform();

window.LupusApp = {
  version: __APP_VERSION__,
  changelog: __APP_CHANGELOG__,
  isNative,

  /**
   * Vibrazioni, sempre le stesse per lo stesso tipo di momento:
   * 'tap' = scelta (leggera), 'reveal' = ruolo mostrato, 'death' = morte (forte),
   * 'victory' = vittoria, 'alert' = fine del timer (lunga).
   */
  async vibrate(kind) {
    if (!isNative) return;
    try {
      if (kind === 'tap') await Haptics.impact({ style: ImpactStyle.Light });
      else if (kind === 'reveal') await Haptics.impact({ style: ImpactStyle.Medium });
      else if (kind === 'death') await Haptics.vibrate({ duration: 220 });
      else if (kind === 'victory') await Haptics.notification({ type: NotificationType.Success });
      else if (kind === 'alert') await Haptics.vibrate({ duration: 900 });
    } catch {
      // La vibrazione è un extra: se il telefono non la supporta si continua senza.
    }
  },

  /** Apre il menu "Condividi" del telefono (WhatsApp, Telegram, email...). */
  async share(text, title = 'Ruoli per Lupus') {
    await Share.share({ title, text, dialogTitle: 'Condividi' });
  },

  /**
   * Salva un file di testo e apre "Condividi" per metterlo dove si vuole (Drive, WhatsApp, email...).
   * Restituisce false se la persona chiude "Condividi" senza scegliere.
   */
  async shareFile(name, text) {
    const { uri } = await Filesystem.writeFile({ path: name, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
    try {
      await Share.share({ title: name, files: [uri], dialogTitle: 'Salva il backup' });
      return true;
    } catch (e) {
      if (/cancel/i.test(String(e && e.message))) return false;
      throw e;
    }
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
