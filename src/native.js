// Collegamento tra il gioco (public/game.js) e le funzioni del telefono Android.
// Il gioco usa window.LupusApp se c'è; nel browser queste funzioni fanno il minimo indispensabile.
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Share } from '@capacitor/share';
import { Clipboard } from '@capacitor/clipboard';
import { TextToSpeech, QueueStrategy } from '@capacitor-community/text-to-speech';

const isNative = Capacitor.isNativePlatform();
const VOICE_LANG = 'it-IT';
const VOICE_RATE = 0.95;

// Sul telefono: la voce italiana c'è? (si controlla una volta sola)
let italianVoice = null;
function hasItalianVoice() {
  if (!italianVoice) {
    italianVoice = TextToSpeech.isLanguageSupported({ lang: VOICE_LANG })
      .then(r => r.supported !== false)
      .catch(() => true);
  }
  return italianVoice;
}

// Nel browser: voce del browser, se esiste
function webSpeak(text) {
  const synth = window.speechSynthesis;
  if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return Promise.resolve(false);
  return new Promise(resolve => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = VOICE_LANG;
    utterance.rate = VOICE_RATE;
    const voice = synth.getVoices().find(v => v.lang && v.lang.toLowerCase().startsWith('it'));
    if (voice) utterance.voice = voice;
    utterance.onend = () => resolve(true);
    utterance.onerror = e => resolve(e && (e.error === 'interrupted' || e.error === 'canceled'));
    synth.cancel();
    synth.speak(utterance);
  });
}

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

  /** Copia un testo negli appunti. */
  async writeClipboard(text) {
    await Clipboard.write({ string: text });
  },

  /** Legge il testo copiato negli appunti ('' se non c'è). */
  async readClipboard() {
    const { value } = await Clipboard.read();
    return typeof value === 'string' ? value : '';
  },

  /**
   * Legge un testo ad alta voce in italiano e finisce quando ha smesso di parlare.
   * Restituisce false se sul telefono non c'è una voce italiana.
   */
  async speak(text) {
    if (!text) return true;
    if (!isNative) return webSpeak(text);
    if (!(await hasItalianVoice())) return false;
    try {
      await TextToSpeech.speak({ text, lang: VOICE_LANG, rate: VOICE_RATE, pitch: 1.0, volume: 1.0, category: 'playback', queueStrategy: QueueStrategy.Flush });
      return true;
    } catch {
      return false;
    }
  },

  /** Fa smettere di parlare la voce. */
  async stopSpeaking() {
    if (!isNative) {
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      return;
    }
    try {
      await TextToSpeech.stop();
    } catch {
      // niente da fermare
    }
  },

  /** Apre la schermata di Android per scaricare la voce (sintesi vocale). */
  async installVoice() {
    if (!isNative) return;
    italianVoice = null;
    try {
      await TextToSpeech.openInstall();
    } catch {
      // alcuni telefoni non hanno questa schermata
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
