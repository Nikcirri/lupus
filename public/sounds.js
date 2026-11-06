'use strict';

// Effetti sonori della partita, creati al momento con il Web Audio del telefono:
// nessun file da scaricare, funzionano anche senza internet.
// LupusSounds.play(nome) suona l'effetto e restituisce quanto dura (in secondi, 0 se non suona).
const LupusSounds = (() => {
  let ctx = null;
  let out = null;

  function audio() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!ctx) {
      ctx = new AC();
      // il compressore evita che i suoni sovrapposti gracchino
      out = ctx.createDynamicsCompressor();
      const volume = ctx.createGain();
      volume.gain.value = 0.9;
      out.connect(volume);
      volume.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  // Volume che sale in `attack` secondi, resta fino a `holdUntil`, poi sfuma in `release` secondi
  function envelope(param, start, attack, peak, holdUntil, release) {
    param.setValueAtTime(0.0001, start);
    param.exponentialRampToValueAtTime(peak, start + attack);
    param.setValueAtTime(peak, Math.max(start + attack, holdUntil));
    param.exponentialRampToValueAtTime(0.0001, Math.max(start + attack, holdUntil) + release);
  }

  function vibrato(ac, target, rate, depth, start, stop) {
    const lfo = ac.createOscillator();
    const amount = ac.createGain();
    lfo.frequency.value = rate;
    amount.gain.value = depth;
    lfo.connect(amount);
    amount.connect(target);
    lfo.start(start);
    lfo.stop(stop);
  }

  // 🦉 Gufo: "uh... uuuh" morbido, quando cala la notte
  function owl(ac, t) {
    [[0, 0.32, 430, 405], [0.5, 0.9, 440, 385]].forEach(([offset, length, from, to]) => {
      const start = t + offset;
      const stop = start + length + 0.1;
      [[1, 0.32], [2, 0.05]].forEach(([harmonic, level]) => {
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(from * harmonic, start);
        osc.frequency.exponentialRampToValueAtTime(to * harmonic, start + length);
        vibrato(ac, osc.frequency, 5.5, 3 * harmonic, start, stop);
        envelope(gain.gain, start, 0.07, level, start + length * 0.55, length * 0.45);
        osc.connect(gain);
        gain.connect(out);
        osc.start(start);
        osc.stop(stop);
      });
    });
    return 1.5;
  }

  // 🐺 Ululato: la voce sale, resta lunga e poi scende; un secondo lupo risponde più acuto
  function howl(ac, t) {
    [[0, 1, 0.3], [0.45, 1.07, 0.16]].forEach(([offset, pitch, level]) => {
      const start = t + offset;
      const length = 2.8;
      const stop = start + length + 0.1;
      const base = 255 * pitch;
      const osc = ac.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(base, start);
      osc.frequency.exponentialRampToValueAtTime(base * 2, start + 0.75);
      osc.frequency.setValueAtTime(base * 2, start + 1.7);
      osc.frequency.exponentialRampToValueAtTime(base * 1.3, start + length);
      vibrato(ac, osc.frequency, 4.8, 7, start, stop);
      // filtro "bocca": dà la vocale "uuu" e toglie l'asprezza
      const mouth = ac.createBiquadFilter();
      mouth.type = 'lowpass';
      mouth.Q.value = 7;
      mouth.frequency.setValueAtTime(650, start);
      mouth.frequency.linearRampToValueAtTime(1300, start + 0.8);
      mouth.frequency.linearRampToValueAtTime(600, start + length);
      const gain = ac.createGain();
      envelope(gain.gain, start, 0.4, level, start + length - 0.9, 0.9);
      osc.connect(mouth);
      mouth.connect(gain);
      gain.connect(out);
      osc.start(start);
      osc.stop(stop);
    });
    return 3.3;
  }

  // 🐓 Gallo: "chic-chi-ri-chììì" all'alba
  function rooster(ac, t) {
    const syllables = [
      [0, 0.1, 560, 720],
      [0.14, 0.1, 720, 840],
      [0.28, 0.13, 840, 1000],
      [0.46, 0.85, 1080, 660]
    ];
    syllables.forEach(([offset, length, from, to], i) => {
      const start = t + offset;
      const stop = start + length + 0.05;
      const osc = ac.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(from, start);
      osc.frequency.linearRampToValueAtTime(to, start + length);
      if (i === syllables.length - 1) vibrato(ac, osc.frequency, 16, 22, start, stop);
      const throat = ac.createBiquadFilter();
      throat.type = 'bandpass';
      throat.frequency.value = 1700;
      throat.Q.value = 1.1;
      const soft = ac.createBiquadFilter();
      soft.type = 'lowpass';
      soft.frequency.value = 3800;
      const gain = ac.createGain();
      envelope(gain.gain, start, 0.015, 0.35, start + length * 0.7, length * 0.3);
      osc.connect(throat);
      throat.connect(soft);
      soft.connect(gain);
      gain.connect(out);
      osc.start(start);
      osc.stop(stop);
    });
    return 1.45;
  }

  // 🔔 Campanella: rintocchi con armonici da campana
  function bell(ac, t, strikes) {
    const base = 660;
    const partials = [[0.5, 0.18, 2.4], [1, 0.32, 1.9], [1.19, 0.1, 1.3], [1.56, 0.09, 1.1], [2, 0.11, 0.9], [2.51, 0.05, 0.7], [3, 0.035, 0.5]];
    for (let k = 0; k < strikes; k++) {
      const start = t + k * 0.6;
      partials.forEach(([ratio, level, decay]) => {
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = 'sine';
        osc.frequency.value = base * ratio;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.linearRampToValueAtTime(level, start + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + decay);
        osc.connect(gain);
        gain.connect(out);
        osc.start(start);
        osc.stop(start + decay + 0.05);
      });
    }
    return (strikes - 1) * 0.6 + 1.6;
  }

  // 🏆 Vittoria: arpeggio che sale e accordo finale
  function victory(ac, t) {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      const start = t + i * 0.13;
      const last = i === notes.length - 1;
      const length = last ? 1.4 : 0.35;
      [freq, last ? freq * 0.75 : 0, last ? freq * 0.5 : 0].filter(Boolean).forEach(f => {
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = 'triangle';
        osc.frequency.value = f;
        envelope(gain.gain, start, 0.02, last ? 0.16 : 0.22, start + length * 0.5, length * 0.5);
        osc.connect(gain);
        gain.connect(out);
        osc.start(start);
        osc.stop(start + length + 0.05);
      });
    });
    return 1.9;
  }

  const SOUNDS = {
    owl,
    howl,
    rooster,
    bell: (ac, t) => bell(ac, t, 1),
    bells: (ac, t) => bell(ac, t, 3),
    victory
  };

  return {
    names: Object.keys(SOUNDS),
    play(name) {
      const make = SOUNDS[name];
      const ac = make ? audio() : null;
      if (!ac) return 0;
      try {
        return make(ac, ac.currentTime + 0.03);
      } catch (e) {
        // i suoni sono un extra: se il telefono non li supporta si continua senza
        return 0;
      }
    }
  };
})();
