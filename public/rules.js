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

/* =========================================================================
   5. VOTAZIONE AL ROGO (FUNZIONI PURE)
   Votano i vivi e il Fantasma; il Sindaco vivo vale 2 voti.
========================================================================= */
function isMayorRole(role) {
  return !!role && (role.id === 'sindaco' || String(role.name || '').toLowerCase() === 'sindaco');
}

/** Chi può votare: i vivi e il Fantasma. */
function getVoters(players) {
  return (players || []).filter(p => !p.isDead || p.isGhost);
}

/** Quanto vale il voto di un giocatore (0 = non vota). */
function voteWeight(player, role) {
  if (player.isDead) return player.isGhost ? 1 : 0;
  return isMayorRole(role) ? 2 : 1;
}

/**
 * Conteggio dei voti.
 * votes = { idVotante: idVotato } ('' o assente = non ha ancora votato / astenuto).
 * candidateIds = elenco dei votabili (null = tutti i vivi).
 * Restituisce { totals: [{playerId, name, votes}] in ordine decrescente, leaders: [id], maxVotes, castCount, voterCount }.
 */
function tallyVotes(players, votes, findRole, candidateIds) {
  const list = players || [];
  const allowed = new Set((candidateIds && candidateIds.length ? candidateIds : list.filter(p => !p.isDead).map(p => p.id)));
  const totals = {};
  list.forEach(p => { if (allowed.has(p.id)) totals[p.id] = 0; });
  const voters = getVoters(list);
  let castCount = 0;
  voters.forEach(voter => {
    const target = (votes || {})[voter.id];
    if (!target || !(target in totals)) return;
    totals[target] += voteWeight(voter, findRole(voter.roleId));
    castCount++;
  });
  const rows = list
    .filter(p => p.id in totals)
    .map(p => ({ playerId: p.id, name: p.name, votes: totals[p.id] }))
    .sort((a, b) => b.votes - a.votes);
  const maxVotes = rows.length ? rows[0].votes : 0;
  const leaders = maxVotes > 0 ? rows.filter(r => r.votes === maxVotes).map(r => r.playerId) : [];
  return { totals: rows, leaders, maxVotes, castCount, voterCount: voters.length };
}

/* =========================================================================
   6. CRONOLOGIA DELLA PARTITA (FUNZIONI PURE)
   nightLogs = [{ turn, entries: [{ kind, roleIds, targetId, saved, immune }] }]
   (le partite salvate con le versioni 1.1-1.2 usano { wolfTargets, shielded, probed, flowers }).
========================================================================= */
function legacyLogEntries(log) {
  const entries = [];
  (log.wolfTargets || []).forEach(id => entries.push({ kind: 'wolves', roleIds: ['lupo'], targetId: id, saved: (log.shielded || []).includes(id) }));
  (log.shielded || []).forEach(id => entries.push({ kind: 'protect', roleIds: ['guardia'], targetId: id }));
  (log.probed || []).forEach(id => entries.push({ kind: 'investigate', roleIds: ['veggente'], targetId: id }));
  (log.flowers || []).forEach(id => entries.push({ kind: 'mark', roleIds: ['fioraio'], targetId: id }));
  return entries;
}

function buildTimeline(players, nightLogs, findRole) {
  const list = players || [];
  const byId = id => list.find(p => p.id === id);
  const nameOf = id => (byId(id) || { name: '?' }).name;
  const roleLabel = p => {
    const r = findRole(p.roleId);
    return r ? `${r.icon} ${r.name}` : p.roleId;
  };
  const roleTitle = ids => {
    const r = findRole((ids || [])[0]);
    return r ? `${r.icon} ${r.name}` : 'Un ruolo';
  };
  const turns = new Set();
  (nightLogs || []).forEach(l => turns.add(l.turn));
  list.forEach(p => { if (p.isDead && p.diedOnTurn) turns.add(p.diedOnTurn); });

  const entries = [];
  Array.from(turns).sort((a, b) => a - b).forEach(turn => {
    const log = (nightLogs || []).find(l => l.turn === turn);
    const nightLines = [];
    const logEntries = log ? (Array.isArray(log.entries) ? log.entries : legacyLogEntries(log)) : [];
    logEntries.forEach(e => {
      const who = nameOf(e.targetId);
      const extra = e.saved ? ' (salvato 🛡️)' : e.immune ? ' (Criceto: immune)' : '';
      if (e.kind === 'wolves') nightLines.push(`🐺 I lupi hanno scelto ${who}${extra}`);
      else if (e.kind === 'kill') nightLines.push(`${roleTitle(e.roleIds)} ha colpito ${who}${extra}`);
      else if (e.kind === 'protect') nightLines.push(`${roleTitle(e.roleIds)} ha protetto ${who}`);
      else if (e.kind === 'investigate') nightLines.push(`${roleTitle(e.roleIds)} ha indagato su ${who}`);
      else if (e.kind === 'mark') nightLines.push(`${roleTitle(e.roleIds)}: segno per ${who}`);
      else if (e.kind === 'copy') nightLines.push(`${roleTitle(e.roleIds)} ha copiato ${who}`);
      else if (e.kind === 'note') nightLines.push(`${roleTitle(e.roleIds)} ha indicato ${who}`);
    });
    const dayLines = [];
    list.filter(p => p.isDead && p.diedOnTurn === turn).forEach(p => {
      const ghost = p.isGhost ? ' → 👻 Fantasma' : '';
      if (p.deathCause === 'notte') nightLines.push(`💀 Morto stanotte: ${p.name} (${roleLabel(p)})${ghost}`);
      else if (p.deathCause === 'rogo') dayLines.push(`🔥 Bruciato al rogo: ${p.name} (${roleLabel(p)})${ghost}`);
      else if (p.diedInPhase === 'night') nightLines.push(`💀 Morto: ${p.name} (${roleLabel(p)})${ghost}`);
      else dayLines.push(`💀 Morto: ${p.name} (${roleLabel(p)})${ghost}`);
    });
    if (nightLines.length) entries.push({ turn, phase: 'night', title: `🌙 Notte ${turn}`, lines: nightLines });
    if (dayLines.length) entries.push({ turn, phase: 'day', title: `☀️ Giorno ${turn}`, lines: dayLines });
  });
  return entries;
}

/* =========================================================================
   7. CONDIVIDERE I RUOLI CON GLI AMICI (FUNZIONI PURE)
   Formato: "LUPUS-RUOLI-1:" seguito dai ruoli in JSON codificato in base64 (UTF-8).
========================================================================= */
const ROLES_SHARE_PREFIX = 'LUPUS-RUOLI-1:';
const VALID_FACTIONS = ['Villaggio', 'Branco', 'Alleato dei Lupi', 'Solitario'];
const VALID_WAKE_TIMINGS = ['mai', 'ogni_notte', 'solo_notte_1', 'solo_notte_2', 'dalla_notte_2'];

function utf8ToBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin);
}

function base64ToUtf8(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function cleanText(value, max) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Ruolo importato ripulito e controllato, oppure null se non valido. */
function sanitizeImportedRole(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const name = cleanText(obj.name, 40);
  const whatYouDo = cleanText(obj.whatYouDo, 400);
  const howYouWin = cleanText(obj.howYouWin, 200);
  if (!name || !whatYouDo || !howYouWin) return null;
  const priority = Math.min(10, Math.max(1, parseInt(obj.priority, 10) || 5));
  return {
    id: typeof obj.id === 'string' && /^[a-z0-9_]{1,40}$/i.test(obj.id) ? obj.id : '',
    name,
    icon: Array.from(cleanText(obj.icon, 16)).slice(0, 8).join('') || '🎭',
    faction: VALID_FACTIONS.includes(obj.faction) ? obj.faction : 'Villaggio',
    whatYouDo,
    howYouWin,
    wakeTiming: VALID_WAKE_TIMINGS.includes(obj.wakeTiming) ? obj.wakeTiming : 'mai',
    priority,
    narratorPhrase: cleanText(obj.narratorPhrase, 300),
    narratorNote: cleanText(obj.narratorNote, 300),
    isPair: !!obj.isPair,
    nightAction: NIGHT_ACTION_KEYS.includes(obj.nightAction) ? obj.nightAction : 'none',
    actionRules: cleanActionRules(obj.actionRules)
  };
}

function encodeRolesShare(roles) {
  const payload = (roles || []).map(r => ({
    id: r.id, name: r.name, icon: r.icon, faction: r.faction, whatYouDo: r.whatYouDo, howYouWin: r.howYouWin,
    wakeTiming: r.wakeTiming, priority: r.priority, narratorPhrase: r.narratorPhrase || '', narratorNote: r.narratorNote || '', isPair: !!r.isPair,
    nightAction: roleNightAction(r), actionRules: roleActionRules(r)
  }));
  return ROLES_SHARE_PREFIX + utf8ToBase64(JSON.stringify(payload));
}

/** Legge un messaggio condiviso (anche con altro testo intorno). Restituisce { roles } oppure { error }. */
function decodeRolesShare(text) {
  const raw = String(text || '');
  const start = raw.indexOf(ROLES_SHARE_PREFIX);
  if (start === -1) return { error: 'Non trovo un codice di ruoli di Lupus in questo testo.' };
  // Solo il codice subito dopo il prefisso: il testo che segue (saluti, firme) viene ignorato.
  const match = /^\s*([A-Za-z0-9+/]+={0,2})/.exec(raw.slice(start + ROLES_SHARE_PREFIX.length));
  const code = match ? match[1] : '';
  let data;
  try {
    data = JSON.parse(base64ToUtf8(code));
  } catch (e) {
    return { error: 'Il codice è incompleto o rovinato: fatti rimandare il messaggio intero.' };
  }
  if (!Array.isArray(data)) return { error: 'Il codice non contiene ruoli.' };
  const roles = data.map(sanitizeImportedRole).filter(Boolean).slice(0, 60);
  if (!roles.length) return { error: 'Il codice non contiene ruoli validi.' };
  return { roles };
}

/** Ruoli da proporre nella condivisione: quelli creati o modificati rispetto ai 13 base. */
function isRoleCustomized(role, defaults) {
  const base = (defaults || []).find(d => d.id === role.id);
  if (!base) return true;
  if (roleNightAction(role) !== roleNightAction(base)) return true;
  if (JSON.stringify(roleActionRules(role)) !== JSON.stringify(roleActionRules(base))) return true;
  return ['name', 'icon', 'faction', 'whatYouDo', 'howYouWin', 'wakeTiming', 'priority', 'narratorPhrase', 'narratorNote', 'isPair']
    .some(k => String(base[k] == null ? '' : base[k]) !== String(role[k] == null ? '' : role[k]));
}

/**
 * Unisce i ruoli importati a quelli esistenti: stesso nome = aggiorna, altrimenti aggiunge.
 * makeId() crea l'id dei ruoli nuovi. Restituisce { roles, added, updated }.
 */
function mergeImportedRoles(existing, imported, makeId) {
  const roles = (existing || []).map(r => ({ ...r }));
  let added = 0;
  let updated = 0;
  (imported || []).forEach(imp => {
    const idx = roles.findIndex(r => r.name.trim().toLowerCase() === imp.name.trim().toLowerCase());
    if (idx !== -1) {
      roles[idx] = { ...imp, id: roles[idx].id };
      updated++;
    } else {
      const sameId = imp.id && roles.some(r => r.id === imp.id);
      roles.push({ ...imp, id: !imp.id || sameId ? makeId() : imp.id });
      added++;
    }
  });
  return { roles, added, updated };
}

/* =========================================================================
   8. AZIONI NOTTURNE DEI RUOLI (anche per i ruoli personalizzati)
   Ogni ruolo ha un'azione (nightAction) e delle regole (actionRules):
   la modalità guidata usa questi dati per chiamare i ruoli e risolvere la notte.
========================================================================= */
const NIGHT_ACTIONS = {
  none:        { label: 'Si sveglia e basta (nessuna scelta)', short: 'si sveglia e basta', target: false },
  wolves:      { label: 'Si sveglia con i Lupi e sceglie la vittima', short: 'sceglie la vittima con i Lupi', target: true, question: 'Chi sbranano i lupi?' },
  kill:        { label: 'Uccide un giocatore (muore all\'alba)', short: 'uccide un giocatore', target: true, question: 'Chi colpisce?' },
  protect:     { label: 'Protegge un giocatore dalla morte di stanotte', short: 'protegge un giocatore', target: true, question: 'Chi protegge?' },
  investigate: { label: 'Scopre se un giocatore è un lupo (SÌ/NO)', short: 'scopre se uno è un lupo', target: true, question: 'Chi indica?' },
  medium:      { label: 'Scopre se il bruciato di ieri era un lupo', short: 'scopre se il bruciato di ieri era un lupo', target: false },
  mark:        { label: 'Lascia un segno, annunciato al mattino', short: 'lascia un segno annunciato al mattino', target: true, question: 'A chi lascia il segno?' },
  copy:        { label: 'Copia il ruolo di un giocatore', short: 'copia un ruolo', target: true, question: 'Chi copia?' },
  note:        { label: 'Indica un giocatore (solo da annotare)', short: 'indica un giocatore', target: true, question: 'Chi indica?' }
};
const NIGHT_ACTION_KEYS = Object.keys(NIGHT_ACTIONS);

// Azioni e regole dei 13 ruoli base (usate anche per i ruoli salvati prima della versione 1.3)
const DEFAULT_NIGHT_ACTIONS = {
  lupo: { nightAction: 'wolves', actionRules: { notSelf: false, notSameTwice: false, notWolves: true } },
  veggente: { nightAction: 'investigate', actionRules: { notSelf: true, notSameTwice: false, notWolves: false } },
  guardia: { nightAction: 'protect', actionRules: { notSelf: true, notSameTwice: true, notWolves: false } },
  fioraio: { nightAction: 'mark', actionRules: { notSelf: true, notSameTwice: false, notWolves: false } },
  medium: { nightAction: 'medium', actionRules: { notSelf: false, notSameTwice: false, notWolves: false } },
  copione: { nightAction: 'copy', actionRules: { notSelf: true, notSameTwice: false, notWolves: false } }
};

function cleanActionRules(rules) {
  const r = rules && typeof rules === 'object' ? rules : {};
  return { notSelf: !!r.notSelf, notSameTwice: !!r.notSameTwice, notWolves: !!r.notWolves };
}

function roleNightAction(role) {
  if (!role) return 'none';
  if (NIGHT_ACTION_KEYS.includes(role.nightAction)) return role.nightAction;
  return DEFAULT_NIGHT_ACTIONS[role.id] ? DEFAULT_NIGHT_ACTIONS[role.id].nightAction : 'none';
}

function roleActionRules(role) {
  if (role && role.actionRules && typeof role.actionRules === 'object') return cleanActionRules(role.actionRules);
  return cleanActionRules(role && DEFAULT_NIGHT_ACTIONS[role.id] ? DEFAULT_NIGHT_ACTIONS[role.id].actionRules : null);
}

// I 13 ruoli base hanno già azione e regole scritte dentro
DEFAULT_ROLES.forEach(r => {
  r.nightAction = roleNightAction(r);
  r.actionRules = roleActionRules(r);
});

function wakesOnNight(wakeTiming, turn) {
  if (wakeTiming === 'ogni_notte') return true;
  if (wakeTiming === 'solo_notte_1') return turn === 1;
  if (wakeTiming === 'solo_notte_2') return turn === 2;
  if (wakeTiming === 'dalla_notte_2') return turn >= 2;
  return false;
}

function isWolfPlayer(p, findRole) {
  const r = findRole(p.roleId);
  return !!r && r.faction === 'Branco';
}

/**
 * Passi della notte per la modalità guidata, in ordine di chiamata.
 * Ogni passo: { key, kind, roleIds, holders, aliveHolders, emptyCall }.
 * kind: 'intro' | azione del ruolo (vedi NIGHT_ACTIONS) | 'dawn'.
 * I ruoli che "si svegliano con i Lupi" sono riuniti in un solo passo 'wolves'.
 */
function buildNightPlan(players, roles, turn) {
  const list = players || [];
  const ordered = (roles || [])
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (Number(a.r.priority) || 10) - (Number(b.r.priority) || 10) || a.i - b.i)
    .map(x => x.r);

  const steps = [{ key: 'intro', kind: 'intro', roleIds: [], holders: [], aliveHolders: [], emptyCall: false }];
  let wolvesStep = null;
  ordered.forEach(role => {
    if (!wakesOnNight(role.wakeTiming, turn)) return;
    const holders = list.filter(p => p.roleId === role.id);
    if (!holders.length) return;
    const kind = roleNightAction(role);
    if (kind === 'wolves') {
      if (wolvesStep) {
        wolvesStep.roleIds.push(role.id);
        wolvesStep.holders.push(...holders);
        return;
      }
      wolvesStep = { key: 'wolves', kind: 'wolves', roleIds: [role.id], holders: holders.slice() };
      steps.push(wolvesStep);
      return;
    }
    steps.push({ key: `role:${role.id}`, kind, roleIds: [role.id], holders: holders.slice() });
  });
  steps.forEach(step => {
    if (step.kind === 'intro') return;
    step.aliveHolders = step.holders.filter(p => !p.isDead);
    step.emptyCall = step.aliveHolders.length === 0;
  });
  steps.push({ key: 'dawn', kind: 'dawn', roleIds: [], holders: [], aliveHolders: [], emptyCall: false });
  return steps;
}

/**
 * Giocatori che si possono scegliere in un passo.
 * prevChoices = scelte della notte precedente ({ chiavePasso: idGiocatore }).
 * rulesOn = false: nessun controllo (solo i vivi).
 * Restituisce [{ id, name, disabled, reason }].
 */
function getTargetOptions(step, players, roles, prevChoices, rulesOn) {
  const findRole = id => (roles || []).find(r => r.id === id) || null;
  const rules = { notSelf: false, notSameTwice: false, notWolves: false };
  step.roleIds.forEach(id => {
    const r = roleActionRules(findRole(id));
    rules.notSelf = rules.notSelf || r.notSelf;
    rules.notSameTwice = rules.notSameTwice || r.notSameTwice;
    rules.notWolves = rules.notWolves || r.notWolves;
  });
  const holderIds = new Set((step.holders || []).map(p => p.id));
  const previous = (prevChoices || {})[step.key];
  return (players || []).filter(p => !p.isDead).map(p => {
    let reason = '';
    if (rulesOn) {
      if (rules.notWolves && isWolfPlayer(p, findRole)) reason = 'è un lupo';
      else if (rules.notSelf && holderIds.has(p.id)) reason = 'sé stesso';
      else if (rules.notSameTwice && previous === p.id) reason = 'scelto ieri notte';
    }
    return { id: p.id, name: p.name, disabled: !!reason, reason };
  });
}

/** Risposta al Veggente (o a chi indaga): SÌ se è del Branco. Il Criceto risulta NO ma muore. */
function investigateAnswer(target, findRole) {
  const role = findRole(target.roleId);
  return { isWolf: !!role && role.faction === 'Branco', hamster: isHamsterRole(role) };
}

/** Ruolo che prende chi copia: un lupo o chi indaga lo diventa, altrimenti diventa Contadino. */
function copyResultRoleId(targetRole, roles) {
  if (!targetRole) return null;
  if (targetRole.faction === 'Branco' || roleNightAction(targetRole) === 'investigate') return targetRole.id;
  return (roles || []).some(r => r.id === 'contadino') ? 'contadino' : null;
}

/**
 * Risolve la notte: chi muore, chi è salvo, segni da annunciare, ruoli copiati.
 * choices = { chiavePasso: idGiocatore } della notte.
 */
function resolveNight(players, steps, choices, roles) {
  const list = players || [];
  const findRole = id => (roles || []).find(r => r.id === id) || null;
  const byId = id => list.find(p => p.id === id);
  const picks = (steps || [])
    .filter(st => !st.emptyCall && choices && choices[st.key] && byId(choices[st.key]))
    .map(st => ({ step: st, target: byId(choices[st.key]) }));

  const protectedIds = new Set(picks.filter(x => x.step.kind === 'protect').map(x => x.target.id));
  const result = { deaths: [], saved: [], immune: [], marks: [], copies: [], entries: [] };
  const addDeath = (target, cause, roleIds) => {
    if (target.isDead || result.deaths.some(d => d.playerId === target.id)) return;
    result.deaths.push({ playerId: target.id, cause, roleIds });
  };

  picks.forEach(({ step, target }) => {
    const entry = { kind: step.kind, roleIds: step.roleIds.slice(), targetId: target.id };
    if (step.kind === 'wolves' || step.kind === 'kill') {
      if (protectedIds.has(target.id)) {
        entry.saved = true;
        result.saved.push({ playerId: target.id, from: step.kind, roleIds: step.roleIds.slice() });
      } else if (step.kind === 'wolves' && isHamsterRole(findRole(target.roleId))) {
        entry.immune = true;
        result.immune.push({ playerId: target.id });
      } else {
        addDeath(target, step.kind === 'wolves' ? 'lupi' : 'kill', step.roleIds.slice());
      }
    } else if (step.kind === 'investigate') {
      if (isHamsterRole(findRole(target.roleId))) addDeath(target, 'indagine', step.roleIds.slice());
    } else if (step.kind === 'mark') {
      result.marks.push({ playerId: target.id, roleId: step.roleIds[0] });
    } else if (step.kind === 'copy') {
      const newRoleId = copyResultRoleId(findRole(target.roleId), roles);
      step.aliveHolders.forEach(h => result.copies.push({ playerId: h.id, targetId: target.id, newRoleId }));
    }
    result.entries.push(entry);
  });
  return result;
}

function joinNames(names) {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
}

/** Frasi del mattino da leggere ad alta voce (morti della notte e segni). */
function buildMorningAnnouncement(deadNames, marks, findRole, nameOf) {
  const lines = [];
  if (!deadNames.length) lines.push('«Il villaggio si sveglia... e stanotte non è morto nessuno!»');
  else if (deadNames.length === 1) lines.push(`«Il villaggio si sveglia... ma stanotte è morto ${deadNames[0]}.»`);
  else lines.push(`«Il villaggio si sveglia... ma stanotte sono morti ${joinNames(deadNames)}.»`);
  (marks || []).forEach(m => {
    const role = findRole(m.roleId);
    const who = nameOf(m.playerId);
    if (role && role.id === 'fioraio') lines.push(`«Qualcuno ha lasciato dei fiori davanti alla porta di ${who}!»`);
    else lines.push(`«${who} ha trovato un segno: ${role ? `${role.icon} ${role.name}` : 'un ruolo misterioso'} è passato di lì stanotte.»`);
  });
  return lines;
}

/** Frase da leggere per un ruolo: quella scritta nel ruolo, oppure una frase standard. */
function rolePhrase(role) {
  if (role && role.narratorPhrase && role.narratorPhrase.trim()) return role.narratorPhrase.trim();
  const name = role ? role.name : 'il ruolo';
  return `«Si sveglia ${name}... ${name} chiude gli occhi.»`;
}
