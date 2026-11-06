'use strict';

// Dati del gioco (ruoli e preset) e regole pure, senza DOM.
// Le regole sono controllate dai test in tests/rules.test.js (npm test).

/* =========================================================================
   1. DATABASE DEI 13 RUOLI BASE (DEFAULT_ROLES)
   Isolato, commentato e sincronizzato in localStorage.
========================================================================= */
const DEFAULT_ROLES = [
  {
    id: 'lupo',
    name: 'Lupo Mannaro',
    icon: '🐺',
    faction: 'Branco',
    whatYouDo: 'Di notte ti svegli con gli altri lupi e scegliete chi sbranare. Di giorno fingiti buono.',
    howYouWin: 'Vinci se i lupi pareggiano il numero degli altri giocatori vivi.',
    wakeTiming: 'ogni_notte',
    priority: 5,
    narratorPhrase: '«Si svegliano i Lupi Mannari, aprono gli occhi e scelgono chi sbranare... I Lupi chiudono gli occhi.»',
    narratorNote: 'Segna con 🐺 la vittima scelta. Ricorda che il Criceto Mannaro è immune al morso dei lupi!',
    isPair: false
  },
  {
    id: 'contadino',
    name: 'Contadino',
    icon: '🧑‍🌾',
    faction: 'Villaggio',
    whatYouDo: 'Non hai poteri notturni. Di giorno ragiona con gli altri per mandare al rogo i lupi.',
    howYouWin: 'Vinci se eliminate tutti i lupi.',
    wakeTiming: 'mai',
    priority: 10,
    narratorPhrase: '',
    narratorNote: 'Ruolo passivo senza risveglio notturno.',
    isPair: false
  },
  {
    id: 'fioraio',
    name: 'Fioraio',
    icon: '🌸',
    faction: 'Villaggio',
    whatYouDo: 'Sei un contadino speciale: ogni notte ti svegli e scegli a chi lasciare dei fiori davanti alla porta (non dà protezioni, serve come segnale psicologico).',
    howYouWin: 'Vinci col villaggio.',
    wakeTiming: 'ogni_notte',
    priority: 6,
    narratorPhrase: '«Si sveglia il Fioraio e indica a chi lasciare i fiori davanti alla porta... Il Fioraio chiude gli occhi.»',
    narratorNote: 'Assegna il badge 🌸 al giocatore scelto per annunciarlo al risveglio del villaggio.',
    isPair: false
  },
  {
    id: 'veggente',
    name: 'Veggente',
    icon: '🔮',
    faction: 'Villaggio',
    whatYouDo: 'Ogni notte indichi un giocatore al Narratore, che ti farà SÌ con la testa se è un Lupo, o NO se non lo è.',
    howYouWin: 'Vinci col villaggio.',
    wakeTiming: 'ogni_notte',
    priority: 2,
    narratorPhrase: '«Si sveglia il Veggente e indica un giocatore di cui vuole conoscere la natura... Il Veggente chiude gli occhi.»',
    narratorNote: 'Fai SÌ solo per i Lupi (Branco). L\'Indemoniato risulta NON lupo (NO). Se sonda il Criceto Mannaro, il Criceto muore all\'istante!',
    isPair: false
  },
  {
    id: 'guardia',
    name: 'Guardia del Corpo',
    icon: '🛡️',
    faction: 'Villaggio',
    whatYouDo: 'Ogni notte indichi un giocatore da proteggere dal morso dei lupi. Non puoi proteggere te stesso né la stessa persona per due notti di fila.',
    howYouWin: 'Vinci col villaggio.',
    wakeTiming: 'ogni_notte',
    priority: 4,
    narratorPhrase: '«Si sveglia la Guardia del Corpo e indica chi vuole proteggere stanotte... La Guardia chiude gli occhi.»',
    narratorNote: 'Assegna il badge 🛡️ al protetto. Non può proteggere sé stessa né chi ha il badge "🛡️ Ieri".',
    isPair: false
  },
  {
    id: 'medium',
    name: 'Medium',
    icon: '🕯️',
    faction: 'Villaggio',
    whatYouDo: 'Dalla seconda notte in poi, il Narratore ti dice (SÌ/NO) se la persona bruciata al rogo il giorno prima era un Lupo.',
    howYouWin: 'Vinci col villaggio.',
    wakeTiming: 'dalla_notte_2',
    priority: 3,
    narratorPhrase: '«Si sveglia il Medium e scopre se il condannato al rogo di ieri era un Lupo... Il Medium chiude gli occhi.»',
    narratorNote: 'Fai SÌ con la testa se il morto al rogo di ieri era un Lupo, altrimenti fai NO.',
    isPair: false
  },
  {
    id: 'indemoniato',
    name: 'Indemoniato',
    icon: '😈',
    faction: 'Alleato dei Lupi',
    whatYouDo: 'Sei umano (al Veggente risulti NON lupo) e non conosci i lupi, ma tifi per loro. Di giorno crea confusione per far vincere il branco.',
    howYouWin: 'Vinci se vincono i Lupi Mannari.',
    wakeTiming: 'mai',
    priority: 10,
    narratorPhrase: '',
    narratorNote: 'Umano alleato del branco: al Veggente e al Medium risulta NON Lupo.',
    isPair: false
  },
  {
    id: 'gemelli',
    name: 'Gemelli',
    icon: '👥',
    faction: 'Villaggio',
    whatYouDo: 'La prima notte aprite gli occhi insieme e vi riconoscete: sapete con certezza di essere entrambi buoni.',
    howYouWin: 'Vincete col villaggio.',
    wakeTiming: 'solo_notte_1',
    priority: 1,
    narratorPhrase: '«Si svegliano i Gemelli, aprono gli occhi e si riconoscono... I Gemelli chiudono gli occhi.»',
    narratorNote: 'Si svegliano insieme solo nella Notte 1 per guardarsi.',
    isPair: true
  },
  {
    id: 'copione',
    name: 'Copione',
    icon: '🎭',
    faction: 'Villaggio',
    whatYouDo: 'Alla fine della seconda notte indichi un giocatore: se hai indicato un Lupo o il Veggente diventi anche tu quel ruolo, altrimenti resti un normale Contadino.',
    howYouWin: 'Vinci col villaggio (o col Branco se copi un Lupo).',
    wakeTiming: 'solo_notte_2',
    priority: 7,
    narratorPhrase: '«Si sveglia il Copione e indica il giocatore di cui vuole imitare il destino... Il Copione chiude gli occhi.»',
    narratorNote: 'Seleziona dal menu a tendina qui sotto chi ha indicato per aggiornare il suo ruolo in automatico.',
    isPair: false
  },
  {
    id: 'criceto',
    name: 'Criceto Mannaro',
    icon: '🐹',
    faction: 'Solitario',
    whatYouDo: 'Giochi da solo. I lupi non possono sbranarti di notte, ma se il Veggente ti controlla muori all\'istante.',
    howYouWin: 'Se sei ancora vivo quando la partita finisce (che vincano i buoni o i lupi), rubi la vittoria a tutti e vinci da solo!',
    wakeTiming: 'mai',
    priority: 10,
    narratorPhrase: '',
    narratorNote: 'Immune al morso dei Lupi. Muore se sondato dal Veggente. Al Veggente risulterebbe NON lupo ma muore al mattino.',
    isPair: false
  },
  {
    id: 'giullare',
    name: 'Giullare',
    icon: '🃏',
    faction: 'Solitario',
    whatYouDo: 'Giochi da solo. Il tuo unico obiettivo è farti votare e mandare al rogo dal villaggio durante il giorno.',
    howYouWin: 'Se ti bruciano al rogo, la partita finisce subito e vinci da solo!',
    wakeTiming: 'mai',
    priority: 10,
    narratorPhrase: '',
    narratorNote: 'Vince istantaneamente solo se eliminato con ❌ durante la fase GIORNO (al rogo).',
    isPair: false
  },
  {
    id: 'bambina',
    name: 'Bambina',
    icon: '👀',
    faction: 'Villaggio',
    whatYouDo: 'Di notte, mentre i lupi scelgono la vittima, puoi sbirciare socchiudendo gli occhi. Attenta a non farti scoprire dai lupi!',
    howYouWin: 'Vinci col villaggio.',
    wakeTiming: 'mai',
    priority: 5,
    narratorPhrase: '',
    narratorNote: 'Può sbirciare di nascosto mentre i Lupi sono svegli.',
    isPair: false
  },
  {
    id: 'sindaco',
    name: 'Sindaco',
    icon: '🎖️',
    faction: 'Villaggio',
    whatYouDo: 'Sei un normale abitante del villaggio, ma durante le votazioni del giorno il tuo voto vale doppio (2x).',
    howYouWin: 'Vinci col villaggio.',
    wakeTiming: 'mai',
    priority: 10,
    narratorPhrase: '',
    narratorNote: 'Durante il giorno il suo voto per il rogo vale doppio (2x).',
    isPair: false
  }
];

/* =========================================================================
   2. DATABASE DEI 30 PRESET CONSIGLIATI (DA 5 A 15 GIOCATORI)
========================================================================= */
const PRESETS_BY_COUNT = {
  5: [
    { code: 'a', name: 'Classico', turns: '~2-3 turni', roles: { lupo: 1, veggente: 1, guardia: 1, fioraio: 1, contadino: 1 } },
    { code: 'b', name: 'Bluff & Caos', turns: '~2-3 turni', roles: { lupo: 1, giullare: 1, veggente: 1, sindaco: 1, fioraio: 1 } },
    { code: 'c', name: 'Tattico', turns: '~2-3 turni', roles: { lupo: 1, medium: 1, copione: 1, gemelli: 2 } }
  ],
  6: [
    { code: 'd', name: 'Classico', turns: '~2-4 turni', roles: { lupo: 1, indemoniato: 1, veggente: 1, guardia: 1, fioraio: 1, contadino: 1 } },
    { code: 'e', name: 'Mind-Games', turns: '~2-4 turni', roles: { lupo: 1, giullare: 1, veggente: 1, guardia: 1, sindaco: 1, bambina: 1 } },
    { code: 'f', name: 'Gemelli', turns: '~2-4 turni', roles: { lupo: 1, veggente: 1, gemelli: 2, copione: 1, contadino: 1 } }
  ],
  7: [
    { code: 'g', name: 'Classico', turns: '~3-4 turni', roles: { lupo: 2, veggente: 1, guardia: 1, fioraio: 1, contadino: 2 } },
    { code: 'h', name: 'Caos Solitario', turns: '~3-4 turni', roles: { lupo: 1, indemoniato: 1, criceto: 1, veggente: 1, guardia: 1, sindaco: 1, fioraio: 1 } },
    { code: 'i', name: 'Indagine', turns: '~3-4 turni', roles: { lupo: 2, veggente: 1, medium: 1, bambina: 1, giullare: 1, contadino: 1 } }
  ],
  8: [
    { code: 'j', name: 'Classico Psicologico', turns: '~3-5 turni', roles: { lupo: 2, veggente: 1, guardia: 1, fioraio: 1, giullare: 1, contadino: 2 } },
    { code: 'k', name: 'Paranoia', turns: '~3-5 turni', roles: { lupo: 2, veggente: 1, medium: 1, bambina: 1, sindaco: 1, copione: 1, contadino: 1 } },
    { code: 'l', name: 'Solitari & Ombrosi', turns: '~3-5 turni', roles: { lupo: 1, indemoniato: 1, criceto: 1, veggente: 1, guardia: 1, fioraio: 1, contadino: 2 } }
  ],
  9: [
    { code: 'm', name: 'Investigativo', turns: '~4-5 turni', roles: { lupo: 2, veggente: 1, medium: 1, guardia: 1, giullare: 1, fioraio: 1, contadino: 2 } },
    { code: 'n', name: 'Gemelli in Gioco', turns: '~4-5 turni', roles: { lupo: 2, indemoniato: 1, veggente: 1, gemelli: 2, bambina: 1, sindaco: 1, contadino: 1 } },
    { code: 'o', name: 'Caccia al Criceto', turns: '~4-5 turni', roles: { lupo: 2, criceto: 1, veggente: 1, guardia: 1, copione: 1, fioraio: 1, contadino: 2 } }
  ],
  10: [
    { code: 'p', name: 'Mind-Games', turns: '~4-6 turni', roles: { lupo: 2, indemoniato: 1, veggente: 1, guardia: 1, medium: 1, giullare: 1, fioraio: 1, sindaco: 1, contadino: 1 } },
    { code: 'q', name: 'Caccia Grossa', turns: '~4-6 turni', roles: { lupo: 2, criceto: 1, veggente: 1, guardia: 1, gemelli: 2, copione: 1, bambina: 1, fioraio: 1 } },
    { code: 'r', name: 'Classico Spinto', turns: '~4-6 turni', roles: { lupo: 2, veggente: 1, guardia: 1, medium: 1, gemelli: 2, giullare: 1, fioraio: 1, contadino: 1 } }
  ],
  11: [
    { code: 's', name: 'Caos Bilanciato', turns: '~4-6 turni', roles: { lupo: 2, indemoniato: 1, veggente: 1, guardia: 1, medium: 1, gemelli: 2, giullare: 1, criceto: 1, fioraio: 1 } },
    { code: 't', name: 'Imprevedibile', turns: '~4-6 turni', roles: { lupo: 2, indemoniato: 1, copione: 1, veggente: 1, guardia: 1, bambina: 1, sindaco: 1, fioraio: 1, criceto: 1, contadino: 1 } },
    { code: 'u', name: 'Branco a 3', turns: '~4-6 turni', roles: { lupo: 3, veggente: 1, guardia: 1, medium: 1, gemelli: 2, bambina: 1, sindaco: 1, fioraio: 1 } }
  ],
  12: [
    { code: 'v', name: 'Caos Totale', turns: '~5-6 turni', roles: { lupo: 2, indemoniato: 1, veggente: 1, guardia: 1, medium: 1, gemelli: 2, giullare: 1, criceto: 1, fioraio: 1, contadino: 1 } },
    { code: 'w', name: 'Chi sta con chi?', turns: '~5-6 turni', roles: { lupo: 2, indemoniato: 1, copione: 1, veggente: 1, guardia: 1, bambina: 1, sindaco: 1, fioraio: 1, criceto: 1, contadino: 2 } },
    { code: 'x', name: 'Branco Pesante', turns: '~5-6 turni', roles: { lupo: 3, veggente: 1, guardia: 1, medium: 1, gemelli: 2, bambina: 1, sindaco: 1, fioraio: 1, contadino: 1 } }
  ],
  13: [
    { code: 'y', name: 'Gran Villaggio', turns: '~5-7 turni', roles: { lupo: 3, indemoniato: 1, veggente: 1, guardia: 1, medium: 1, gemelli: 2, bambina: 1, sindaco: 1, fioraio: 1, giullare: 1 } },
    { code: 'z', name: 'Quasi Tutti i Ruoli', turns: '~5-7 turni', roles: { lupo: 2, indemoniato: 1, veggente: 1, guardia: 1, medium: 1, gemelli: 2, bambina: 1, sindaco: 1, copione: 1, giullare: 1, criceto: 1 } }
  ],
  14: [
    { code: 'aa', name: 'Gran Caos', turns: '~5-7 turni', roles: { lupo: 3, indemoniato: 1, veggente: 1, guardia: 1, medium: 1, gemelli: 2, bambina: 1, sindaco: 1, copione: 1, giullare: 1, criceto: 1 } },
    { code: 'ab', name: 'Tradizionale Esteso', turns: '~5-7 turni', roles: { lupo: 3, indemoniato: 1, veggente: 1, guardia: 1, medium: 1, gemelli: 2, bambina: 1, sindaco: 1, fioraio: 1, contadino: 2 } }
  ],
  15: [
    { code: 'ac', name: 'Villaggio al Completo', turns: '~6-8 turni', roles: { lupo: 3, indemoniato: 1, veggente: 1, guardia: 1, medium: 1, gemelli: 2, bambina: 1, sindaco: 1, fioraio: 1, copione: 1, giullare: 1, criceto: 1 } },
    { code: 'ad', name: 'Assedio del Branco', turns: '~6-8 turni', roles: { lupo: 4, veggente: 1, guardia: 1, medium: 1, gemelli: 2, bambina: 1, sindaco: 1, fioraio: 1, copione: 1, contadino: 2 } }
  ]
};

/* =========================================================================
   3. REGOLE DEL GIOCO (FUNZIONI PURE, SENZA DOM)
========================================================================= */
function isJesterRole(role) {
  return !!role && (role.id === 'giullare' || String(role.name || '').toLowerCase() === 'giullare');
}

function isHamsterRole(role) {
  return !!role && (role.id === 'criceto' || String(role.name || '').toLowerCase().includes('criceto'));
}

function countDeck(deckMap) {
  return Object.values(deckMap || {}).reduce((acc, v) => acc + (Number(v) || 0), 0);
}

/**
 * Motivi per cui il mazzo non è pronto (lista vuota = si può distribuire).
 * findRole(id) restituisce il ruolo o null se non esiste.
 */
function getDeckProblems(deckMap, playerCount, findRole) {
  const problems = [];
  const total = countDeck(deckMap);
  if (playerCount < 5) {
    problems.push(`Servono almeno 5 giocatori (ora ${playerCount}).`);
    return problems;
  }
  if (total < playerCount) {
    const missing = playerCount - total;
    problems.push(`Mancano ${missing} ${missing === 1 ? 'ruolo' : 'ruoli'} nel mazzo.`);
  } else if (total > playerCount) {
    const extra = total - playerCount;
    problems.push(`${extra === 1 ? 'C\'è 1 ruolo' : `Ci sono ${extra} ruoli`} di troppo nel mazzo.`);
  }
  let wolves = 0;
  for (const [roleId, qty] of Object.entries(deckMap || {})) {
    if (!(qty > 0)) continue;
    const role = findRole(roleId);
    if (!role) {
      problems.push(`Un ruolo del mazzo non esiste più: azzera il mazzo e ricomponilo.`);
      continue;
    }
    if (role.isPair && qty % 2 !== 0) problems.push(`${role.name}: vanno messi a coppie (numero pari).`);
    if (role.faction === 'Branco') wolves += qty;
  }
  if (total === playerCount) {
    if (wolves === 0) problems.push('Nel mazzo serve almeno un Lupo (fazione Branco).');
    else if (wolves >= total - wolves) problems.push('I lupi devono essere meno degli altri giocatori.');
  }
  return problems;
}

/**
 * Riepilogo della notte per l'annuncio del mattino, dai segnalini messi dal Narratore.
 * outcome: 'muore' | 'salvo' (protetto dalla Guardia) | 'immune' (Criceto) | 'giaMorto'
 * cause: 'lupi' | 'veggente'
 */
function computeNightOutcome(players, findRole) {
  const items = [];
  (players || []).forEach(p => {
    const role = findRole(p.roleId);
    const hamster = isHamsterRole(role);
    const probedHamster = hamster && p.seerProbed;
    if (p.wolfTarget && !probedHamster) {
      let outcome = 'muore';
      if (p.isDead) outcome = 'giaMorto';
      else if (p.shieldTonight) outcome = 'salvo';
      else if (hamster) outcome = 'immune';
      items.push({ playerId: p.id, name: p.name, outcome, cause: 'lupi' });
    }
    if (probedHamster) {
      items.push({ playerId: p.id, name: p.name, outcome: p.isDead ? 'giaMorto' : 'muore', cause: 'veggente' });
    }
  });
  return items;
}

/** Il giocatore bruciato al rogo nel giorno indicato (per il Medium), oppure null. */
function findBurnedOnDay(players, dayTurn) {
  return (players || []).find(p => p.isDead && p.deathCause === 'rogo' && p.diedOnTurn === dayTurn) || null;
}

/**
 * Condizione di vittoria attuale, oppure null se la partita continua.
 * type: 'village' | 'wolves' | 'solo'
 */
function evaluateVictory(players, findRole) {
  const list = players || [];
  const roleOf = p => findRole(p.roleId) || { id: p.roleId, name: p.roleId, faction: 'Villaggio' };

  // Il Giullare vince subito se viene bruciato al rogo.
  const jester = list.find(p => p.isDead && p.deathCause === 'rogo' && isJesterRole(roleOf(p)));
  if (jester) {
    return { type: 'solo', text: `🃏 VITTORIA DEL GIULLARE! ${jester.name} si è fatto bruciare al rogo e ruba la partita!` };
  }

  let aliveWolves = 0;
  let aliveOthers = 0;
  list.forEach(p => {
    if (p.isDead) return;
    if (roleOf(p).faction === 'Branco') aliveWolves++;
    else aliveOthers++;
  });
  const hamster = list.find(p => !p.isDead && isHamsterRole(roleOf(p)));

  if (aliveWolves === 0) {
    if (hamster) {
      return { type: 'solo', text: `🐹 VITTORIA DEL CRICETO MANNARO! I lupi sono finiti, ma ${hamster.name} (Criceto) è sopravvissuto e ruba la vittoria al Villaggio!` };
    }
    return { type: 'village', text: '🎉 VITTORIA DEL VILLAGGIO! Tutti i lupi sono stati eliminati!' };
  }
  if (aliveWolves >= aliveOthers) {
    if (hamster) {
      return { type: 'solo', text: `🐹 VITTORIA DEL CRICETO MANNARO! I lupi hanno raggiunto la parità, ma ${hamster.name} (Criceto) è vivo e ruba la vittoria al Branco!` };
    }
    return { type: 'wolves', text: '🐺 VITTORIA DEI LUPI MANNARI! Il branco ha raggiunto la parità numerica!' };
  }
  return null;
}

/* =========================================================================
   4. AGGIORNAMENTI DELL'APP (FUNZIONI PURE)
========================================================================= */
const UPDATE_API_URL = 'https://api.github.com/repos/Nikcirri/lupus/releases/latest';
const UPDATE_PAGE_URL = 'https://github.com/Nikcirri/lupus/releases/latest';
const UPDATE_AUTO_CHECK_HOURS = 24;

/** "v1.2.3" o "1.2.3" → [1, 2, 3], altrimenti null. */
function parseVersion(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(v || '').trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function isNewerVersion(candidate, current) {
  const a = parseVersion(candidate);
  const b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

/** Dati utili dalla risposta di GitHub (null se non è una Release valida). */
function parseRelease(json) {
  if (!json || typeof json !== 'object' || typeof json.tag_name !== 'string' || !parseVersion(json.tag_name)) return null;
  const assets = Array.isArray(json.assets) ? json.assets : [];
  const apk = assets.find(a => a && typeof a.name === 'string' && a.name.endsWith('.apk') && typeof a.browser_download_url === 'string');
  return {
    version: json.tag_name.replace(/^v/, ''),
    apkUrl: apk ? apk.browser_download_url : null,
    pageUrl: typeof json.html_url === 'string' ? json.html_url : UPDATE_PAGE_URL
  };
}

/** Controllo automatico al massimo una volta ogni 24 ore. */
function shouldAutoCheck(lastCheckIso, now) {
  if (!lastCheckIso) return true;
  const last = new Date(lastCheckIso).getTime();
  return !Number.isFinite(last) || now.getTime() - last >= UPDATE_AUTO_CHECK_HOURS * 3600000;
}
