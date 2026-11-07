'use strict';

// Dati del gioco (ruoli e preset) e regole pure, senza DOM.
// Le regole sono controllate dai test in tests/rules.test.js (npm test).

/* =========================================================================
   1. DATABASE DEI RUOLI BASE (DEFAULT_ROLES)
   Le capacità speciali (azione notturna, vittoria, caratteristiche...) sono nella sezione 8.
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
    narratorNote: 'Tocca la vittima scelta dai lupi. La guida tiene conto da sola di chi è protetto e del Criceto Mannaro (immune ai lupi).',
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
    narratorNote: 'Tocca il giocatore scelto: al mattino la guida ti fa annunciare i fiori.',
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
    narratorNote: 'Tocca il protetto. Non può proteggere sé stessa né la persona protetta la notte prima.',
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
    narratorNote: 'Tocca chi ha indicato: all\'alba la guida gli cambia il ruolo da sola. È il Mitomane di Lupus in Tabula.',
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
    narratorNote: 'Vince subito, da solo, se il villaggio lo manda al rogo.',
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
  },
  {
    id: 'strega',
    name: 'Strega',
    icon: '🧪',
    faction: 'Villaggio',
    whatYouDo: 'Ogni notte, dopo i lupi, il Narratore ti mostra la loro vittima. Hai due pozioni, ognuna da usare una sola volta in tutta la partita: quella della vita salva la vittima dei lupi, quella della morte uccide un giocatore a tua scelta.',
    howYouWin: 'Vinci con il villaggio.',
    wakeTiming: 'ogni_notte',
    priority: 6,
    narratorPhrase: '«Si sveglia la Strega... Questa è la vittima dei lupi: vuoi salvarla con la pozione della vita? Vuoi usare la pozione della morte su qualcuno? ...La Strega chiude gli occhi.»',
    narratorNote: 'Ogni pozione si usa una sola volta in tutta la partita: la guida spegne da sola quelle già usate.',
    isPair: false
  },
  {
    id: 'cacciatore',
    name: 'Cacciatore',
    icon: '🏹',
    faction: 'Villaggio',
    whatYouDo: 'Non ti svegli di notte. Quando muori, di notte o al rogo, scegli subito un giocatore che muore con te.',
    howYouWin: 'Vinci con il villaggio.',
    wakeTiming: 'mai',
    priority: 10,
    narratorPhrase: '',
    narratorNote: 'Quando muore, la guida ti chiede chi porta con sé.',
    isPair: false
  },
  {
    id: 'massoni',
    name: 'Massoni',
    icon: '🤝',
    faction: 'Villaggio',
    whatYouDo: 'La prima notte ti svegli insieme agli altri Massoni e vi riconoscete: sapete di potervi fidare l\'uno dell\'altro.',
    howYouWin: 'Vinci con il villaggio.',
    wakeTiming: 'solo_notte_1',
    priority: 1,
    narratorPhrase: '«Si svegliano i Massoni, aprono gli occhi e si riconoscono... I Massoni chiudono gli occhi.»',
    narratorNote: 'Si svegliano insieme solo la prima notte.',
    isPair: true
  },
  {
    id: 'gufo',
    name: 'Gufo',
    icon: '🦉',
    faction: 'Alleato dei Lupi',
    whatYouDo: 'Ogni notte indichi un giocatore: al mattino si annuncia che il Gufo l\'ha scelto e al rogo quel giocatore parte con un voto contro. Al Veggente risulti NON lupo e non conosci i lupi.',
    howYouWin: 'Vinci se vincono i lupi.',
    wakeTiming: 'ogni_notte',
    priority: 6,
    narratorPhrase: '«Si sveglia il Gufo e indica un giocatore... Il Gufo chiude gli occhi.»',
    narratorNote: 'Al mattino la guida ti fa annunciare la scelta del Gufo; nella votazione l\'app gli aggiunge da sola un voto contro.',
    isPair: false
  },
  {
    id: 'lupo_bianco',
    name: 'Lupo Bianco',
    icon: '🐾',
    faction: 'Branco',
    whatYouDo: 'Ti svegli con i lupi e scegli con loro la vittima, ma giochi per te. Una notte sì e una no (la 2ª, la 4ª...) ti svegli di nuovo da solo e puoi sbranare uno dei lupi. Al Veggente risulti lupo.',
    howYouWin: 'Vinci da solo se resti l\'ultimo giocatore vivo.',
    wakeTiming: 'notti_pari',
    priority: 6,
    narratorPhrase: '«Si sveglia il Lupo Bianco e indica, se vuole, un lupo da sbranare... Il Lupo Bianco chiude gli occhi.»',
    narratorNote: 'Finché il Lupo Bianco è vivo insieme ad altri lupi, il branco non vince. Vince lui se resta solo (o solo con un ultimo abitante).',
    isPair: false
  }
];

/* =========================================================================
   2. PRESET CONSIGLIATI (3 PER OGNI NUMERO DI GIOCATORI, DA 5 A 15)
   Ogni preset è controllato con deckBalance: tutti stanno tra -3 e +3 (partita equilibrata).
========================================================================= */
const PRESETS_BY_COUNT = {
  5: [
    { code: '5a', name: 'Primo Villaggio', turns: '~2-3 turni', desc: 'Pochi ruoli e chiari: perfetta per chi gioca la prima volta.', roles: { lupo: 1, indemoniato: 1, veggente: 1, guardia: 1, contadino: 1 } },
    { code: '5b', name: 'Pozioni e Frecce', turns: '~2-3 turni', desc: 'Niente Veggente: la Strega e il Cacciatore difendono il villaggio.', roles: { lupo: 1, strega: 1, cacciatore: 1, contadino: 2 } },
    { code: '5c', name: 'Loggia Segreta', turns: '~2-3 turni', desc: 'I Massoni si conoscono, ma il Gufo manda qualcuno al rogo.', roles: { lupo: 1, gufo: 1, veggente: 1, massoni: 2 } }
  ],
  6: [
    { code: '6a', name: 'Classico', turns: '~2-3 turni', desc: 'Il villaggio di sempre, con un traditore nascosto.', roles: { lupo: 1, indemoniato: 1, veggente: 1, guardia: 1, contadino: 2 } },
    { code: '6b', name: 'Notte delle Streghe', turns: '~2-3 turni', desc: 'Pozioni, frecce e un Gufo che semina sospetti.', roles: { lupo: 1, gufo: 1, strega: 1, cacciatore: 1, contadino: 2 } },
    { code: '6c', name: 'Il Buffone', turns: '~2-3 turni', desc: 'Attenti a chi si fa accusare: potrebbe essere il Giullare.', roles: { lupo: 1, veggente: 1, giullare: 1, contadino: 3 } }
  ],
  7: [
    { code: '7a', name: 'Classico', turns: '~3-4 turni', desc: 'Due lupi contro Veggente e Guardia: la partita base.', roles: { lupo: 2, veggente: 1, guardia: 1, contadino: 3 } },
    { code: '7b', name: 'Fratellanza', turns: '~3-4 turni', desc: 'I Massoni partono con due persone di cui fidarsi.', roles: { lupo: 2, veggente: 1, massoni: 2, contadino: 2 } },
    { code: '7c', name: 'Senza Veggente', turns: '~3-4 turni', desc: 'Nessuno scopre i lupi: si va a intuito, con Strega e Medium.', roles: { lupo: 2, strega: 1, cacciatore: 1, medium: 1, contadino: 2 } }
  ],
  8: [
    { code: '8a', name: 'Classico', turns: '~3-4 turni', desc: 'Veggente, Guardia e Medium contro il branco e il suo complice.', roles: { lupo: 2, indemoniato: 1, veggente: 1, guardia: 1, medium: 1, contadino: 2 } },
    { code: '8b', name: 'Il Gufo nel Bosco', turns: '~3-4 turni', desc: 'Ogni mattina il Gufo mette qualcuno sotto accusa.', roles: { lupo: 2, gufo: 1, strega: 1, veggente: 1, cacciatore: 1, contadino: 2 } },
    { code: '8c', name: 'Il Lupo Bianco', turns: '~3-4 turni', desc: 'Un lupo gioca da solo e tradisce il branco.', roles: { lupo: 2, lupo_bianco: 1, veggente: 1, guardia: 1, strega: 1, contadino: 2 } }
  ],
  9: [
    { code: '9a', name: 'Classico', turns: '~3-4 turni', desc: 'La partita base per un gruppo medio.', roles: { lupo: 2, indemoniato: 1, veggente: 1, guardia: 1, medium: 1, contadino: 3 } },
    { code: '9b', name: 'Massoni e Gufo', turns: '~3-4 turni', desc: 'Alleanze sicure da una parte, accuse pilotate dall\'altra.', roles: { lupo: 2, gufo: 1, veggente: 1, massoni: 2, cacciatore: 1, contadino: 2 } },
    { code: '9c', name: 'Tutti Sospettati', turns: '~3-4 turni', desc: 'Giullare, Criceto e Copione: nessuno è quello che sembra.', roles: { lupo: 2, veggente: 1, strega: 1, giullare: 1, criceto: 1, sindaco: 1, copione: 1, contadino: 1 } }
  ],
  10: [
    { code: '10a', name: 'Classico col Sindaco', turns: '~4-5 turni', desc: 'Il voto del Sindaco vale doppio: chi sarà?', roles: { lupo: 2, indemoniato: 1, veggente: 1, guardia: 1, medium: 1, sindaco: 1, contadino: 3 } },
    { code: '10b', name: 'Caccia Grossa', turns: '~4-5 turni', desc: 'Tanti poteri per il villaggio, ma il Criceto vuole sopravvivere.', roles: { lupo: 2, gufo: 1, strega: 1, veggente: 1, cacciatore: 1, massoni: 2, criceto: 1, contadino: 1 } },
    { code: '10c', name: 'Branco Diviso', turns: '~4-5 turni', desc: 'Il Lupo Bianco tradisce i lupi e il Giullare vuole il rogo.', roles: { lupo: 2, lupo_bianco: 1, veggente: 1, guardia: 1, strega: 1, cacciatore: 1, giullare: 1, contadino: 2 } }
  ],
  11: [
    { code: '11a', name: 'Branco a Tre', turns: '~4-5 turni', desc: 'Tre lupi: il villaggio deve ragionare in fretta.', roles: { lupo: 3, veggente: 1, guardia: 1, medium: 1, sindaco: 1, contadino: 4 } },
    { code: '11b', name: 'Notte Lunga', turns: '~4-5 turni', desc: 'Pozioni, frecce e Massoni contro lupi ben aiutati.', roles: { lupo: 2, indemoniato: 1, gufo: 1, strega: 1, veggente: 1, cacciatore: 1, massoni: 2, contadino: 2 } },
    { code: '11c', name: 'Legami di Sangue', turns: '~4-5 turni', desc: 'Gemelli, Bambina e Copione: legami e segreti.', roles: { lupo: 2, indemoniato: 1, veggente: 1, gemelli: 2, fioraio: 1, bambina: 1, copione: 1, contadino: 2 } }
  ],
  12: [
    { code: '12a', name: 'Classico Grande', turns: '~4-5 turni', desc: 'La partita base per un gruppo numeroso.', roles: { lupo: 3, indemoniato: 1, veggente: 1, guardia: 1, medium: 1, sindaco: 1, cacciatore: 1, contadino: 3 } },
    { code: '12b', name: 'Assedio', turns: '~4-5 turni', desc: 'Tre lupi e un Gufo contro un villaggio pieno di poteri.', roles: { lupo: 3, gufo: 1, strega: 1, veggente: 1, cacciatore: 1, massoni: 2, guardia: 1, contadino: 2 } },
    { code: '12c', name: 'Tradimento', turns: '~4-5 turni', desc: 'Il Lupo Bianco gioca da solo, il Giullare vuole il rogo.', roles: { lupo: 2, lupo_bianco: 1, indemoniato: 1, veggente: 1, guardia: 1, strega: 1, medium: 1, giullare: 1, contadino: 3 } }
  ],
  13: [
    { code: '13a', name: 'Classico Grande', turns: '~5-6 turni', desc: 'La partita base per un gruppo numeroso.', roles: { lupo: 3, indemoniato: 1, veggente: 1, guardia: 1, medium: 1, sindaco: 1, cacciatore: 1, contadino: 4 } },
    { code: '13b', name: 'Pozioni e Logge', turns: '~5-6 turni', desc: 'Strega, Massoni e Cacciatore, con il Criceto in agguato.', roles: { lupo: 3, gufo: 1, strega: 1, veggente: 1, guardia: 1, cacciatore: 1, massoni: 2, criceto: 1, contadino: 2 } },
    { code: '13c', name: 'Mille Sospetti', turns: '~5-6 turni', desc: 'Quasi tutti hanno un potere: per narratori esperti.', roles: { lupo: 2, indemoniato: 1, veggente: 1, guardia: 1, medium: 1, gemelli: 2, bambina: 1, sindaco: 1, copione: 1, giullare: 1, criceto: 1 } }
  ],
  14: [
    { code: '14a', name: 'Classico Grande', turns: '~5-6 turni', desc: 'La partita base per un gruppo numeroso.', roles: { lupo: 3, indemoniato: 1, veggente: 1, guardia: 1, medium: 1, sindaco: 1, cacciatore: 1, contadino: 5 } },
    { code: '14b', name: 'Notte delle Ombre', turns: '~5-6 turni', desc: 'Il branco ha due complici: Gufo e Indemoniato.', roles: { lupo: 3, gufo: 1, indemoniato: 1, strega: 1, veggente: 1, guardia: 1, cacciatore: 1, massoni: 2, medium: 1, contadino: 2 } },
    { code: '14c', name: 'Gran Caos', turns: '~5-6 turni', desc: 'Un ruolo diverso per quasi tutti: per narratori esperti.', roles: { lupo: 3, strega: 1, veggente: 1, guardia: 1, medium: 1, gemelli: 2, bambina: 1, sindaco: 1, copione: 1, giullare: 1, criceto: 1 } }
  ],
  15: [
    { code: '15a', name: 'Grande Villaggio', turns: '~5-6 turni', desc: 'Tanti poteri da entrambe le parti, ben bilanciati.', roles: { lupo: 3, indemoniato: 1, gufo: 1, veggente: 1, guardia: 1, medium: 1, sindaco: 1, cacciatore: 1, strega: 1, contadino: 4 } },
    { code: '15b', name: 'Tradimento nel Branco', turns: '~5-6 turni', desc: 'Quattro lupi, ma uno di loro gioca da solo.', roles: { lupo: 3, lupo_bianco: 1, veggente: 1, guardia: 1, strega: 1, cacciatore: 1, massoni: 2, medium: 1, giullare: 1, contadino: 3 } },
    { code: '15c', name: 'Villaggio al Completo', turns: '~5-6 turni', desc: 'Quasi tutti i ruoli in gioco: per narratori esperti.', roles: { lupo: 3, strega: 1, veggente: 1, guardia: 1, medium: 1, gemelli: 2, bambina: 1, sindaco: 1, fioraio: 1, copione: 1, giullare: 1, criceto: 1 } }
  ]
};

/* =========================================================================
   3. REGOLE DEL GIOCO (FUNZIONI PURE, SENZA DOM)
========================================================================= */
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
 * Le vittorie solitarie dipendono dalla capacità "victory" del ruolo:
 * 'burned' (vince se bruciato al rogo), 'survive' (ruba la vittoria se è vivo),
 * 'lastAlive' (vince se resta l'ultimo vivo; finché è vivo insieme ad altri lupi, il branco non vince).
 */
function evaluateVictory(players, findRole) {
  const list = players || [];
  const roleOf = p => findRole(p.roleId) || { id: p.roleId, name: p.roleId, icon: '🎭', faction: 'Villaggio' };
  const title = p => `${roleOf(p).icon || '🎭'} VITTORIA SOLITARIA: ${String(roleOf(p).name || '').toUpperCase()}!`;

  const burned = list.find(p => p.isDead && p.deathCause === 'rogo' && roleVictory(roleOf(p)) === 'burned');
  if (burned) {
    return { type: 'solo', playerId: burned.id, text: `${title(burned)} ${burned.name} si è fatto bruciare al rogo e ruba la partita!` };
  }

  const alive = list.filter(p => !p.isDead);
  const isWolf = p => roleOf(p).faction === 'Branco';
  const aliveWolves = alive.filter(isWolf).length;
  const aliveOthers = alive.length - aliveWolves;
  const loners = alive.filter(p => roleVictory(roleOf(p)) === 'lastAlive');
  const survivor = alive.find(p => roleVictory(roleOf(p)) === 'survive');

  if (alive.length === 1 && loners.length === 1) {
    return { type: 'solo', playerId: loners[0].id, text: `${title(loners[0])} ${loners[0].name} è rimasto l'ultimo vivo del villaggio!` };
  }

  if (aliveWolves === 0) {
    if (survivor) {
      return { type: 'solo', playerId: survivor.id, text: `${title(survivor)} I lupi sono finiti, ma ${survivor.name} è sopravvissuto e ruba la vittoria al Villaggio!` };
    }
    return { type: 'village', text: '🎉 VITTORIA DEL VILLAGGIO! Tutti i lupi sono stati eliminati!' };
  }

  if (aliveWolves >= aliveOthers) {
    const loneWolf = loners.find(isWolf);
    if (loneWolf) {
      // Il lupo solitario resta solo con l'ultimo abitante: stanotte lo sbranerà
      if (aliveWolves === 1 && aliveOthers <= 1) {
        return { type: 'solo', playerId: loneWolf.id, text: `${title(loneWolf)} ${loneWolf.name} ha tradito il branco ed è rimasto solo contro l'ultimo abitante!` };
      }
      // È vivo insieme ad altri lupi: il branco non ha ancora vinto
      return null;
    }
    if (survivor) {
      return { type: 'solo', playerId: survivor.id, text: `${title(survivor)} I lupi hanno raggiunto la parità, ma ${survivor.name} è vivo e ruba la vittoria al Branco!` };
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
   Votano i vivi e il Fantasma; chi ha "voto doppio" (es. il Sindaco), se vivo, vale 2 voti.
========================================================================= */

/** Chi può votare: i vivi e il Fantasma. */
function getVoters(players) {
  return (players || []).filter(p => !p.isDead || p.isGhost);
}

/** Quanto vale il voto di un giocatore (0 = non vota). */
function voteWeight(player, role) {
  if (player.isDead) return player.isGhost ? 1 : 0;
  return roleTraits(role).doubleVote ? 2 : 1;
}

// Voto "mi astengo": conta come votato, ma non va a nessuno
const VOTE_ABSTAIN = '-';

/** Voti di partenza dati dai segni della notte (es. il Gufo): { idGiocatore: voti }. */
function markVoteBonus(marks, findRole) {
  const bonus = {};
  (marks || []).forEach(m => {
    if (roleMarkEffect(findRole(m.roleId)) === 'voteAgainst') bonus[m.playerId] = (bonus[m.playerId] || 0) + 1;
  });
  return bonus;
}

/**
 * Conteggio dei voti.
 * votes = { idVotante: idVotato } ('' o assente = non ha ancora votato, VOTE_ABSTAIN = si astiene).
 * candidateIds = elenco dei votabili (null = tutti i vivi).
 * bonusVotes = voti di partenza (vedi markVoteBonus), solo per chi è votabile.
 * Restituisce { totals: [{playerId, name, votes, bonus}] in ordine decrescente, leaders: [id], maxVotes, castCount, voterCount }.
 */
function tallyVotes(players, votes, findRole, candidateIds, bonusVotes) {
  const list = players || [];
  const allowed = new Set((candidateIds && candidateIds.length ? candidateIds : list.filter(p => !p.isDead).map(p => p.id)));
  const bonus = bonusVotes || {};
  const totals = {};
  list.forEach(p => { if (allowed.has(p.id)) totals[p.id] = Number(bonus[p.id]) || 0; });
  const voters = getVoters(list);
  let castCount = 0;
  voters.forEach(voter => {
    const target = (votes || {})[voter.id];
    if (target === VOTE_ABSTAIN) {
      castCount++;
      return;
    }
    if (!target || !(target in totals)) return;
    totals[target] += voteWeight(voter, findRole(voter.roleId));
    castCount++;
  });
  const rows = list
    .filter(p => p.id in totals)
    .map(p => ({ playerId: p.id, name: p.name, votes: totals[p.id], bonus: Number(bonus[p.id]) || 0 }))
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
    const event = log && log.eventId ? findSurpriseEvent(log.eventId) : null;
    if (event) nightLines.push(`${event.icon} Evento a sorpresa: ${event.name}`);
    logEntries.forEach(e => {
      const who = nameOf(e.targetId);
      const extra = e.saved ? ' (salvato 🛡️)' : e.immune ? ' (immune ai lupi)' : '';
      if (e.kind === 'wolves') nightLines.push(`🐺 I lupi hanno scelto ${who}${extra}`);
      else if (e.kind === 'kill') nightLines.push(`${roleTitle(e.roleIds)} ha colpito ${who}${extra}`);
      else if (e.kind === 'protect') nightLines.push(`${roleTitle(e.roleIds)} ha protetto ${who}`);
      else if (e.kind === 'investigate') nightLines.push(`${roleTitle(e.roleIds)} ha indagato su ${who}`);
      else if (e.kind === 'mark') nightLines.push(`${roleTitle(e.roleIds)}: segno per ${who}`);
      else if (e.kind === 'copy') nightLines.push(`${roleTitle(e.roleIds)} ha copiato ${who}`);
      else if (e.kind === 'note') nightLines.push(`${roleTitle(e.roleIds)} ha indicato ${who}`);
      else if (e.kind === 'witch-save') nightLines.push(`${roleTitle(e.roleIds)} ha salvato ${who} con la pozione`);
      else if (e.kind === 'witch-kill') nightLines.push(`${roleTitle(e.roleIds)} ha avvelenato ${who}${extra}`);
    });
    const dayLines = [];
    list.filter(p => p.isDead && p.diedOnTurn === turn).forEach(p => {
      const ghost = p.isGhost ? ' → 👻 Fantasma' : '';
      const killer = p.killedBy ? byId(p.killedBy) : null;
      if (p.deathCause === 'notte') nightLines.push(`💀 Morto stanotte: ${p.name} (${roleLabel(p)})${ghost}`);
      else if (p.deathCause === 'rogo') dayLines.push(`🔥 Bruciato al rogo: ${p.name} (${roleLabel(p)})${ghost}`);
      else if (killer) (p.diedInPhase === 'night' ? nightLines : dayLines).push(`🎯 Portato via da ${killer.name} (${roleLabel(killer)}): ${p.name} (${roleLabel(p)})${ghost}`);
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
// Quando si sveglia un ruolo: etichetta breve (menu, elenco) e frase per la guida dei ruoli
const WAKE_TIMING_LABELS = {
  mai: { short: 'Mai (non si sveglia)', long: 'non si sveglia di notte' },
  ogni_notte: { short: 'Ogni notte', long: 'si sveglia ogni notte' },
  solo_notte_1: { short: 'Solo la prima notte', long: 'si sveglia solo la prima notte' },
  solo_notte_2: { short: 'Solo la seconda notte', long: 'si sveglia solo la seconda notte' },
  dalla_notte_2: { short: 'Dalla seconda notte in poi', long: 'si sveglia dalla seconda notte in poi' },
  notti_dispari: { short: 'Notti dispari (1ª, 3ª, 5ª...)', long: 'si sveglia nelle notti dispari (1ª, 3ª, 5ª...)' },
  notti_pari: { short: 'Notti pari (2ª, 4ª, 6ª...)', long: 'si sveglia nelle notti pari (2ª, 4ª, 6ª...)' }
};
const VALID_WAKE_TIMINGS = Object.keys(WAKE_TIMING_LABELS);
const MAX_PRIORITY = 99;

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
  const priority = Math.min(MAX_PRIORITY, Math.max(1, parseInt(obj.priority, 10) || 5));
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
    actionRules: cleanActionRules(obj.actionRules),
    wakesWithWolves: !!obj.wakesWithWolves,
    deathAction: DEATH_ACTION_KEYS.includes(obj.deathAction) ? obj.deathAction : 'none',
    victory: VICTORY_KEYS.includes(obj.victory) ? obj.victory : 'faction',
    traits: cleanFlags(obj.traits, TRAIT_KEYS),
    markText: cleanText(obj.markText, 200),
    markEffect: MARK_EFFECT_KEYS.includes(obj.markEffect) ? obj.markEffect : 'none'
  };
}

function encodeRolesShare(roles) {
  const payload = (roles || []).map(r => ({
    id: r.id, name: r.name, icon: r.icon, faction: r.faction, whatYouDo: r.whatYouDo, howYouWin: r.howYouWin,
    wakeTiming: r.wakeTiming, priority: r.priority, narratorPhrase: r.narratorPhrase || '', narratorNote: r.narratorNote || '', isPair: !!r.isPair,
    nightAction: roleNightAction(r), actionRules: roleActionRules(r), wakesWithWolves: roleWakesWithWolves(r),
    deathAction: roleDeathAction(r), victory: roleVictory(r), traits: roleTraits(r), markText: roleNightAction(r) === 'mark' ? roleMarkText(r) : '',
    markEffect: roleMarkEffect(r)
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

/** Capacità del ruolo in forma confrontabile (per capire se è stato modificato). */
function roleCapabilities(role) {
  const mark = roleNightAction(role) === 'mark' ? [roleMarkText(role), roleMarkEffect(role)] : '';
  return JSON.stringify([roleNightAction(role), roleActionRules(role), roleWakesWithWolves(role), roleDeathAction(role), roleVictory(role), roleTraits(role), mark]);
}

/**
 * Ruoli da proporre nella condivisione: quelli creati o modificati rispetto ai ruoli base.
 * L'ordine di chiamata (priority) non conta: è una preferenza di chi narra.
 */
function isRoleCustomized(role, defaults) {
  const base = (defaults || []).find(d => d.id === role.id);
  if (!base) return true;
  if (roleCapabilities(role) !== roleCapabilities(base)) return true;
  return ['name', 'icon', 'faction', 'whatYouDo', 'howYouWin', 'wakeTiming', 'narratorPhrase', 'narratorNote', 'isPair']
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
   8. CAPACITÀ DEI RUOLI (valgono anche per i ruoli personalizzati)
   Ogni ruolo è descritto da dati, mai da codice scritto per il suo id:
   - nightAction: cosa fa di notte (NIGHT_ACTIONS)
   - actionRules: regole della scelta (non sé stesso, non due notti di fila, non un lupo,
     solo un lupo, una volta per partita)
   - wakesWithWolves: si sveglia anche con i Lupi (sta nel loro passo)
   - deathAction: cosa fa quando muore ('kill' = porta con sé un giocatore)
   - victory: come vince ('faction' | 'burned' | 'survive' | 'lastAlive')
   - traits: caratteristiche (immune ai lupi, muore se indagato, voto doppio, sbircia i lupi)
   - markText: frase del mattino per chi lascia un segno ({nome} = giocatore scelto)
   - balance: peso per l'equilibrio del mazzo (+ aiuta il villaggio, − aiuta i lupi)
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
  witch:       { label: 'Pozioni: salva la vittima dei lupi e/o uccide (una volta ciascuna)', short: 'ha due pozioni, una per salvare e una per uccidere', target: true, question: 'Pozione della morte: chi avvelena?' },
  note:        { label: 'Indica un giocatore (solo da annotare)', short: 'indica un giocatore', target: true, question: 'Chi indica?' }
};
const NIGHT_ACTION_KEYS = Object.keys(NIGHT_ACTIONS);

const DEATH_ACTIONS = {
  none: { label: 'Niente', short: '' },
  kill: { label: 'Porta con sé un giocatore', short: 'quando muore porta con sé un giocatore' }
};
const DEATH_ACTION_KEYS = Object.keys(DEATH_ACTIONS);

const VICTORY_TYPES = {
  faction:   { label: 'Vince con la sua fazione', short: '' },
  burned:    { label: 'Vince se lo bruciano al rogo', short: 'vince da solo se viene bruciato al rogo' },
  survive:   { label: 'Vince se è vivo a fine partita', short: 'ruba la vittoria se è vivo a fine partita' },
  lastAlive: { label: 'Vince se resta l\'ultimo vivo', short: 'vince da solo se resta l\'ultimo vivo' }
};
const VICTORY_KEYS = Object.keys(VICTORY_TYPES);

const TRAIT_LABELS = {
  immuneToWolves: 'Immune ai lupi',
  diesIfInvestigated: 'Muore se qualcuno indaga su di lui',
  doubleVote: 'Il suo voto al rogo vale doppio',
  peeksAtWolves: 'Può sbirciare mentre i lupi sono svegli'
};
const TRAIT_KEYS = Object.keys(TRAIT_LABELS);

// Effetto del segno lasciato di notte (azione 'mark')
const MARK_EFFECTS = {
  none: { label: 'Solo un annuncio al mattino', short: '' },
  voteAgainst: { label: 'Il giocatore scelto parte con 1 voto contro al rogo', short: 'chi sceglie parte con 1 voto contro al rogo' }
};
const MARK_EFFECT_KEYS = Object.keys(MARK_EFFECTS);

const ACTION_RULE_LABELS = {
  notSelf: 'Non può scegliere sé stesso',
  notSameTwice: 'Non può scegliere la stessa persona due notti di fila',
  notWolves: 'Non può scegliere un lupo',
  onlyWolves: 'Può scegliere solo un lupo',
  oncePerGame: 'Può usare il potere una sola volta per partita'
};
const ACTION_RULE_KEYS = Object.keys(ACTION_RULE_LABELS);

// Capacità dei ruoli base (servono anche per i ruoli salvati con le versioni precedenti)
const DEFAULT_ROLE_RULES = {
  lupo: { nightAction: 'wolves', actionRules: { notWolves: true }, balance: -6 },
  contadino: { balance: 1 },
  fioraio: { nightAction: 'mark', actionRules: { notSelf: true }, balance: 1, markText: '«Qualcuno ha lasciato dei fiori davanti alla porta di {nome}!»' },
  veggente: { nightAction: 'investigate', actionRules: { notSelf: true }, balance: 7 },
  guardia: { nightAction: 'protect', actionRules: { notSelf: true, notSameTwice: true }, balance: 3 },
  medium: { nightAction: 'medium', balance: 3 },
  indemoniato: { balance: -5 },
  gemelli: { balance: 2 },
  copione: { nightAction: 'copy', actionRules: { notSelf: true }, balance: -1 },
  criceto: { victory: 'survive', traits: { immuneToWolves: true, diesIfInvestigated: true }, balance: -2 },
  giullare: { victory: 'burned', balance: -2 },
  bambina: { traits: { peeksAtWolves: true }, balance: 2 },
  sindaco: { traits: { doubleVote: true }, balance: 2 },
  strega: { nightAction: 'witch', balance: 4 },
  cacciatore: { deathAction: 'kill', balance: 3 },
  massoni: { balance: 2 },
  gufo: { nightAction: 'mark', actionRules: { notSelf: true }, balance: -3, markText: '«Stanotte il Gufo ha scelto {nome}: oggi parte con un voto contro al rogo.»', markEffect: 'voteAgainst' },
  lupo_bianco: { nightAction: 'kill', actionRules: { notSelf: true, onlyWolves: true }, wakesWithWolves: true, victory: 'lastAlive', balance: -4 }
};

// I primi 13 ruoli: a chi aveva già l'app vengono aggiunti solo quelli nati dopo
const ORIGINAL_DEFAULT_ROLE_IDS = ['lupo', 'contadino', 'fioraio', 'veggente', 'guardia', 'medium', 'indemoniato', 'gemelli', 'copione', 'criceto', 'giullare', 'bambina', 'sindaco'];

function roleDefaults(role) {
  return (role && DEFAULT_ROLE_RULES[role.id]) || {};
}

function cleanFlags(obj, keys) {
  const src = obj && typeof obj === 'object' ? obj : {};
  const out = {};
  keys.forEach(k => { out[k] = !!src[k]; });
  return out;
}

function cleanActionRules(rules) {
  return cleanFlags(rules, ACTION_RULE_KEYS);
}

function roleNightAction(role) {
  if (!role) return 'none';
  if (NIGHT_ACTION_KEYS.includes(role.nightAction)) return role.nightAction;
  return roleDefaults(role).nightAction || 'none';
}

function roleActionRules(role) {
  if (role && role.actionRules && typeof role.actionRules === 'object') return cleanActionRules(role.actionRules);
  return cleanActionRules(roleDefaults(role).actionRules);
}

function roleWakesWithWolves(role) {
  if (!role) return false;
  if (typeof role.wakesWithWolves === 'boolean') return role.wakesWithWolves;
  return !!roleDefaults(role).wakesWithWolves;
}

function roleDeathAction(role) {
  if (!role) return 'none';
  if (DEATH_ACTION_KEYS.includes(role.deathAction)) return role.deathAction;
  return roleDefaults(role).deathAction || 'none';
}

function roleVictory(role) {
  if (!role) return 'faction';
  if (VICTORY_KEYS.includes(role.victory)) return role.victory;
  return roleDefaults(role).victory || 'faction';
}

function roleTraits(role) {
  if (role && role.traits && typeof role.traits === 'object') return cleanFlags(role.traits, TRAIT_KEYS);
  return cleanFlags(roleDefaults(role).traits, TRAIT_KEYS);
}

function roleMarkEffect(role) {
  if (!role) return 'none';
  if (MARK_EFFECT_KEYS.includes(role.markEffect)) return role.markEffect;
  return roleDefaults(role).markEffect || 'none';
}

function roleMarkText(role) {
  if (role && typeof role.markText === 'string' && role.markText.trim()) return role.markText.trim();
  return roleDefaults(role).markText || '«{nome} ha trovato un segno: {ruolo} è passato di lì stanotte.»';
}

/**
 * Peso del ruolo per l'equilibrio: quello dei ruoli base (se fazione e azione notturna non sono
 * state cambiate), altrimenti una stima fatta dalle sue capacità.
 */
function roleBalance(role) {
  if (!role) return 0;
  const def = roleDefaults(role);
  const base = DEFAULT_ROLES.find(r => r.id === role.id);
  if (typeof def.balance === 'number' && base && base.faction === role.faction && roleNightAction(role) === roleNightAction(base)) return def.balance;
  const factionWeight = { 'Villaggio': 1, 'Branco': -6, 'Alleato dei Lupi': -4, 'Solitario': -2 }[role.faction];
  let power = { investigate: 5, protect: 2, witch: 3, medium: 2, kill: 2, mark: 0, copy: -1, note: 0, none: 0, wolves: 0 }[roleNightAction(role)] || 0;
  if (roleNightAction(role) === 'mark' && roleMarkEffect(role) === 'voteAgainst') power = 1;
  if (roleActionRules(role).oncePerGame) power = Math.round(power / 2);
  if (role.faction !== 'Villaggio') power = -Math.abs(power);
  let total = (factionWeight === undefined ? 0 : factionWeight) + power;
  if (roleDeathAction(role) === 'kill') total += role.faction === 'Villaggio' ? 2 : -2;
  if (roleTraits(role).doubleVote) total += role.faction === 'Villaggio' ? 1 : -1;
  return Math.max(-10, Math.min(10, total));
}

// I ruoli base hanno tutte le capacità scritte dentro
DEFAULT_ROLES.forEach(r => {
  r.nightAction = roleNightAction(r);
  r.actionRules = roleActionRules(r);
  r.wakesWithWolves = roleWakesWithWolves(r);
  r.deathAction = roleDeathAction(r);
  r.victory = roleVictory(r);
  r.traits = roleTraits(r);
  r.markText = roleDefaults(r).markText || '';
  r.markEffect = roleMarkEffect(r);
});

// Testi dei ruoli base cambiati in una versione nuova (vecchi testi → si usa quello di adesso).
// Si aggiornano solo se chi ha l'app ha ancora il testo vecchio: quello che ha scritto l'utente non si tocca.
const OUTDATED_ROLE_TEXTS = {
  gufo: {
    whatYouDo: ['Ogni notte indichi un giocatore: al mattino il Narratore annuncia che il Gufo l\'ha scelto e quel giocatore sarà tra i candidati al rogo. Al Veggente risulti NON lupo e non conosci i lupi.'],
    narratorNote: ['Al mattino la guida ti fa annunciare la scelta del Gufo.'],
    markText: ['«Stanotte il Gufo ha scelto {nome}: oggi sarà tra i candidati al rogo.»']
  }
};

/** Aggiorna i testi vecchi dei ruoli base mai modificati. Restituisce { roles, changed }. */
function refreshOutdatedRoleTexts(roles) {
  let changed = false;
  const list = (roles || []).map(r => {
    const outdated = OUTDATED_ROLE_TEXTS[r.id];
    const base = DEFAULT_ROLES.find(d => d.id === r.id);
    if (!outdated || !base) return r;
    const next = { ...r };
    Object.entries(outdated).forEach(([field, oldTexts]) => {
      if (oldTexts.includes(next[field]) && next[field] !== base[field]) {
        next[field] = base[field];
        changed = true;
      }
    });
    return next;
  });
  return { roles: list, changed };
}

/** A chi aveva già l'app aggiunge i ruoli base nuovi (una volta sola). */
function addNewDefaultRoles(roles, knownIds) {
  const known = new Set(Array.isArray(knownIds) ? knownIds : ORIGINAL_DEFAULT_ROLE_IDS);
  const list = (roles || []).slice();
  const added = [];
  DEFAULT_ROLES.forEach(r => {
    if (known.has(r.id) || list.some(x => x.id === r.id)) return;
    list.push(JSON.parse(JSON.stringify(r)));
    added.push(r.id);
  });
  return { roles: list, added, knownIds: DEFAULT_ROLES.map(r => r.id) };
}

function wakesOnNight(wakeTiming, turn) {
  if (wakeTiming === 'ogni_notte') return true;
  if (wakeTiming === 'solo_notte_1') return turn === 1;
  if (wakeTiming === 'solo_notte_2') return turn === 2;
  if (wakeTiming === 'dalla_notte_2') return turn >= 2;
  if (wakeTiming === 'notti_pari') return turn % 2 === 0;
  if (wakeTiming === 'notti_dispari') return turn % 2 === 1;
  return false;
}

function isWolfPlayer(p, findRole) {
  const r = findRole(p.roleId);
  return !!r && r.faction === 'Branco';
}

function mergedStepRules(step, findRole) {
  const rules = cleanActionRules({});
  step.roleIds.forEach(id => {
    const r = roleActionRules(findRole(id));
    ACTION_RULE_KEYS.forEach(k => { rules[k] = rules[k] || r[k]; });
  });
  return rules;
}

/**
 * Passi della notte per la modalità guidata, in ordine di chiamata.
 * Ogni passo: { key, kind, roleIds, holders, aliveHolders, emptyCall, exhausted, saveUsed, killUsed }.
 * kind: 'intro' | azione del ruolo (vedi NIGHT_ACTIONS) | 'dawn'.
 * I ruoli che "si svegliano con i Lupi" stanno nel passo 'wolves'.
 * usedPowers = { idGiocatore: ['power' | 'witch-save' | 'witch-kill'] } (poteri già usati).
 * effects = effetti dell'evento a sorpresa della notte (vedi eventEffects):
 *   wolvesKillTwice → il passo dei lupi ha targets: 2; wolvesNoKill → noKill: true;
 *   blindSeers → i passi che indagano hanno blind: true.
 */
function buildNightPlan(players, roles, turn, usedPowers, effects) {
  const list = players || [];
  const used = usedPowers || {};
  const fx = effects || {};
  const findRole = id => (roles || []).find(r => r.id === id) || null;
  const ordered = (roles || [])
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (Number(a.r.priority) || 10) - (Number(b.r.priority) || 10) || a.i - b.i)
    .map(x => x.r);

  const steps = [{ key: 'intro', kind: 'intro', roleIds: [], holders: [], aliveHolders: [], emptyCall: false }];
  let wolvesStep = null;
  const ensureWolvesStep = () => {
    if (!wolvesStep) {
      wolvesStep = { key: 'wolves', kind: 'wolves', roleIds: [], holders: [] };
      steps.push(wolvesStep);
    }
    return wolvesStep;
  };
  ordered.forEach(role => {
    const holders = list.filter(p => p.roleId === role.id);
    if (!holders.length) return;
    const kind = roleNightAction(role);
    // Il passo dei lupi compare nel punto del primo ruolo del branco chiamato
    if ((kind === 'wolves' && wakesOnNight(role.wakeTiming, turn)) || roleWakesWithWolves(role)) {
      const ws = ensureWolvesStep();
      if (kind === 'wolves') ws.roleIds.push(role.id);
      holders.forEach(h => { if (!ws.holders.includes(h)) ws.holders.push(h); });
    }
    if (kind === 'wolves' || !wakesOnNight(role.wakeTiming, turn)) return;
    steps.push({ key: `role:${role.id}`, kind, roleIds: [role.id], holders: holders.slice() });
  });
  if (wolvesStep && !wolvesStep.roleIds.length) {
    // Solo ruoli che "si svegliano con i lupi" (nessun Lupo Mannaro nel mazzo)
    wolvesStep.roleIds = Array.from(new Set(wolvesStep.holders.map(h => h.roleId)));
  }

  steps.forEach(step => {
    if (step.kind === 'intro') return;
    step.aliveHolders = step.holders.filter(p => !p.isDead);
    step.emptyCall = step.aliveHolders.length === 0;
    const allUsed = slot => step.aliveHolders.length > 0 && step.aliveHolders.every(h => (used[h.id] || []).includes(slot));
    if (step.kind === 'witch') {
      step.saveUsed = allUsed('witch-save');
      step.killUsed = allUsed('witch-kill');
      step.exhausted = step.saveUsed && step.killUsed;
    } else {
      step.exhausted = mergedStepRules(step, findRole).oncePerGame && allUsed('power');
    }
    if (step.kind === 'wolves') {
      step.targets = fx.wolvesKillTwice ? 2 : 1;
      step.noKill = !!fx.wolvesNoKill;
    }
    if (step.kind === 'investigate' || step.kind === 'medium') step.blind = !!fx.blindSeers;
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
  const rules = mergedStepRules(step, findRole);
  const holderIds = new Set((step.holders || []).map(p => p.id));
  const previous = (prevChoices || {})[step.key];
  return (players || []).filter(p => !p.isDead).map(p => {
    let reason = '';
    if (rulesOn) {
      const wolf = isWolfPlayer(p, findRole);
      if (rules.notSelf && holderIds.has(p.id)) reason = 'sé stesso';
      else if (rules.notWolves && wolf) reason = 'è un lupo';
      else if (rules.onlyWolves && !wolf) reason = 'non è un lupo';
      else if (rules.notSameTwice && previous === p.id) reason = 'scelto ieri notte';
    }
    return { id: p.id, name: p.name, disabled: !!reason, reason };
  });
}

/** Risposta a chi indaga: SÌ se è del Branco. Chi "muore se indagato" risulta NO ma muore. */
function investigateAnswer(target, findRole) {
  const role = findRole(target.roleId);
  return { isWolf: !!role && role.faction === 'Branco', dies: roleTraits(role).diesIfInvestigated };
}

/** Ruolo che prende chi copia: un lupo o chi indaga lo diventa, altrimenti diventa Contadino. */
function copyResultRoleId(targetRole, roles) {
  if (!targetRole) return null;
  if (targetRole.faction === 'Branco' || roleNightAction(targetRole) === 'investigate') return targetRole.id;
  return (roles || []).some(r => r.id === 'contadino') ? 'contadino' : null;
}

/** Chiave della pozione della vita della Strega (o di ogni ruolo con azione 'witch'). */
function witchSaveKey(stepKey) {
  return `${stepKey}#save`;
}

// Pozione della vita "sulla vittima dei lupi, chiunque sia" (partite senza Narratore:
// la Strega può fare la sua mossa prima che i lupi abbiano scelto)
const ANY_WOLF_VICTIM = '*';

/** Chi salva la pozione della vita: la vittima indicata, se è una vittima dei lupi (con '*' la prima). */
function witchSavedId(saveChoice, wolvesIds) {
  if (saveChoice === ANY_WOLF_VICTIM) return wolvesIds[0] || null;
  return wolvesIds.includes(saveChoice) ? saveChoice : null;
}

/** Chiave della seconda vittima (quando un passo ha due bersagli, es. Luna rossa). */
function secondTargetKey(stepKey) {
  return `${stepKey}#2`;
}

/** Vittime scelte dai lupi stanotte (0, 1 o 2), senza ripetizioni. */
function wolvesTargetIds(steps, choices) {
  const ch = choices || {};
  const ws = (steps || []).find(st => st.kind === 'wolves' && !st.emptyCall && !st.exhausted);
  if (!ws || ws.noKill) return [];
  const ids = [ch[ws.key]];
  if ((ws.targets || 1) > 1) ids.push(ch[secondTargetKey(ws.key)]);
  return ids.filter((id, i) => id && ids.indexOf(id) === i);
}

/**
 * Risolve la notte: chi muore, chi è salvo, segni da annunciare, ruoli copiati.
 * choices = { chiavePasso: idGiocatore } della notte (per le pozioni: chiavePasso#save = vittima salvata).
 */
function resolveNight(players, steps, choices, roles) {
  const list = players || [];
  const ch = choices || {};
  const findRole = id => (roles || []).find(r => r.id === id) || null;
  const byId = id => list.find(p => p.id === id);
  const active = (steps || []).filter(st => !st.emptyCall && !st.exhausted);
  const wolvesTargets = wolvesTargetIds(active, ch).map(byId).filter(Boolean);

  const result = { deaths: [], saved: [], immune: [], marks: [], copies: [], entries: [] };
  const protectedIds = new Set();
  const savedFromWolves = new Set();
  const addDeath = (target, cause, roleIds) => {
    if (target.isDead || result.deaths.some(d => d.playerId === target.id)) return;
    result.deaths.push({ playerId: target.id, cause, roleIds });
  };
  const hit = (target, kind, roleIds, entry) => {
    if (protectedIds.has(target.id) || (kind === 'wolves' && savedFromWolves.has(target.id))) {
      entry.saved = true;
      result.saved.push({ playerId: target.id, from: kind, roleIds });
    } else if (kind === 'wolves' && roleTraits(findRole(target.roleId)).immuneToWolves) {
      entry.immune = true;
      result.immune.push({ playerId: target.id });
    } else {
      addDeath(target, kind === 'wolves' ? 'lupi' : 'kill', roleIds);
    }
  };

  // Prima le protezioni (Guardia, pozione della vita), poi i colpi
  active.forEach(st => {
    if (st.kind === 'protect' && byId(ch[st.key])) protectedIds.add(ch[st.key]);
    const saveId = witchSavedId(ch[witchSaveKey(st.key)], wolvesTargets.map(t => t.id));
    if (st.kind === 'witch' && !st.saveUsed && saveId) {
      savedFromWolves.add(saveId);
      result.entries.push({ kind: 'witch-save', roleIds: st.roleIds.slice(), targetId: saveId });
    }
  });

  active.forEach(st => {
    if (st.kind === 'wolves') {
      wolvesTargets.forEach(target => {
        const entry = { kind: 'wolves', roleIds: st.roleIds.slice(), targetId: target.id };
        hit(target, 'wolves', st.roleIds.slice(), entry);
        result.entries.push(entry);
      });
      return;
    }
    const target = byId(ch[st.key]);
    if (!target) return;
    const entry = { kind: st.kind, roleIds: st.roleIds.slice(), targetId: target.id };
    if (st.kind === 'kill') {
      hit(target, st.kind, st.roleIds.slice(), entry);
    } else if (st.kind === 'witch') {
      if (st.killUsed) return;
      entry.kind = 'witch-kill';
      hit(target, 'kill', st.roleIds.slice(), entry);
    } else if (st.kind === 'investigate') {
      if (st.blind) return; // nebbia: nessuna indagine
      if (roleTraits(findRole(target.roleId)).diesIfInvestigated) addDeath(target, 'indagine', st.roleIds.slice());
    } else if (st.kind === 'mark') {
      result.marks.push({ playerId: target.id, roleId: st.roleIds[0] });
    } else if (st.kind === 'copy') {
      const newRoleId = copyResultRoleId(findRole(target.roleId), roles);
      st.aliveHolders.forEach(h => result.copies.push({ playerId: h.id, targetId: target.id, newRoleId }));
    }
    result.entries.push(entry);
  });
  return result;
}

/** Poteri usati stanotte (per "una volta per partita" e le pozioni): [{ playerId, slot }]. */
function computePowerUsage(players, steps, choices, roles) {
  const list = players || [];
  const ch = choices || {};
  const findRole = id => (roles || []).find(r => r.id === id) || null;
  const usage = [];
  const active = (steps || []).filter(st => !st.emptyCall && !st.exhausted);
  const wolvesIds = wolvesTargetIds(active, ch);
  active.forEach(st => {
    const add = slot => st.aliveHolders.forEach(h => usage.push({ playerId: h.id, slot }));
    if (st.kind === 'witch') {
      if (!st.saveUsed && witchSavedId(ch[witchSaveKey(st.key)], wolvesIds)) add('witch-save');
      if (!st.killUsed && ch[st.key] && list.some(p => p.id === ch[st.key])) add('witch-kill');
    } else if (mergedStepRules(st, findRole).oncePerGame && ch[st.key]) {
      add('power');
    }
  });
  return usage;
}

/**
 * Capacità speciali del ruolo in parole semplici (per l'elenco dei ruoli e la guida):
 * tutto quello che non si capisce già dalla fazione e dall'azione notturna.
 */
function roleAbilityNotes(role) {
  const notes = [];
  if (!role) return notes;
  const rules = roleActionRules(role);
  if (roleWakesWithWolves(role) && roleNightAction(role) !== 'wolves') notes.push('si sveglia anche con i Lupi');
  if (rules.onlyWolves && NIGHT_ACTIONS[roleNightAction(role)].target) notes.push('può scegliere solo un lupo');
  if (rules.oncePerGame && roleNightAction(role) !== 'witch' && NIGHT_ACTIONS[roleNightAction(role)].target) notes.push('usa il potere una sola volta per partita');
  if (roleNightAction(role) === 'mark' && roleMarkEffect(role) !== 'none') notes.push(MARK_EFFECTS[roleMarkEffect(role)].short);
  if (roleDeathAction(role) !== 'none') notes.push(DEATH_ACTIONS[roleDeathAction(role)].short);
  if (roleVictory(role) !== 'faction') notes.push(VICTORY_TYPES[roleVictory(role)].short);
  const traits = roleTraits(role);
  TRAIT_KEYS.forEach(k => { if (traits[k]) notes.push(TRAIT_LABELS[k].charAt(0).toLowerCase() + TRAIT_LABELS[k].slice(1)); });
  return notes;
}

/** Chi deve agire quando muore (es. il Cacciatore): true se il ruolo porta con sé un giocatore. */
function hasDeathShot(role) {
  return roleDeathAction(role) === 'kill';
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
    const roleName = role ? `${role.icon} ${role.name}` : 'un ruolo misterioso';
    lines.push(roleMarkText(role).split('{nome}').join(nameOf(m.playerId)).split('{ruolo}').join(roleName));
  });
  return lines;
}

/** Frase da leggere per un ruolo: quella scritta nel ruolo, oppure una frase standard. */
function rolePhrase(role) {
  if (role && role.narratorPhrase && role.narratorPhrase.trim()) return role.narratorPhrase.trim();
  const name = role ? role.name : 'il ruolo';
  return `«Si sveglia ${name}... ${name} chiude gli occhi.»`;
}

/* ---------- Equilibrio del mazzo ---------- */
const BALANCE_LEVELS = [
  { max: -9, level: 'wolves-strong', label: 'Molto a favore dei lupi', icon: '🔴' },
  { max: -4, level: 'wolves', label: 'Un po\' a favore dei lupi', icon: '🟠' },
  { max: 3, level: 'balanced', label: 'Partita equilibrata', icon: '⚖️' },
  { max: 8, level: 'village', label: 'Un po\' a favore del villaggio', icon: '🟢' },
  { max: Infinity, level: 'village-strong', label: 'Molto a favore del villaggio', icon: '🟢' }
];

/** Somma dei pesi dei ruoli nel mazzo: vicino a 0 = equilibrata. position: 0 (lupi) … 1 (villaggio). */
function deckBalance(deckMap, findRole) {
  let score = 0;
  Object.entries(deckMap || {}).forEach(([id, qty]) => {
    const role = findRole(id);
    if (role && qty > 0) score += roleBalance(role) * qty;
  });
  const lvl = BALANCE_LEVELS.find(l => score <= l.max);
  return { score, level: lvl.level, label: lvl.label, icon: lvl.icon, position: Math.max(0, Math.min(1, (score + 12) / 24)) };
}

/* ---------- Ordine di chiamata della notte ---------- */
/** Ruoli che si svegliano, nell'ordine in cui li chiama la guida. */
function getNightOrderRoles(roles) {
  return (roles || [])
    .map((r, i) => ({ r, i }))
    .filter(x => x.r.wakeTiming && x.r.wakeTiming !== 'mai')
    .sort((a, b) => (Number(a.r.priority) || 10) - (Number(b.r.priority) || 10) || a.i - b.i)
    .map(x => x.r);
}

/** Nuovo ordine di chiamata: i ruoli in orderedIds prendono priorità 1, 2, 3... */
function applyNightOrder(roles, orderedIds) {
  const pos = new Map((orderedIds || []).map((id, i) => [id, i + 1]));
  return (roles || []).map(r => (pos.has(r.id) ? { ...r, priority: pos.get(r.id) } : { ...r }));
}

/* =========================================================================
   9. VARIANTI DELLA PARTITA, EVENTI A SORPRESA E VOCE DEL NARRATORE
========================================================================= */
// Pareggio al voto: cosa succede quando due o più giocatori hanno gli stessi voti
const TIE_RULES = {
  runoff: { label: 'Ballottaggio tra chi ha pareggiato' },
  none: { label: 'Nessuno va al rogo' },
  decider: { label: 'Decide chi ha il voto doppio (es. il Sindaco)' }
};
const TIE_RULE_KEYS = Object.keys(TIE_RULES);

/**
 * Cosa fare con un pareggio secondo la regola scelta.
 * { kind: 'runoff' } | { kind: 'none' } | { kind: 'decider', deciderId }
 * Se deve decidere chi ha il voto doppio ma nessuno vivo ce l'ha, si fa il ballottaggio.
 */
function tieOutcome(rule, players, findRole) {
  if (rule === 'none') return { kind: 'none' };
  if (rule === 'decider') {
    const decider = (players || []).find(p => !p.isDead && roleTraits(findRole(p.roleId)).doubleVote);
    if (decider) return { kind: 'decider', deciderId: decider.id };
  }
  return { kind: 'runoff' };
}

/** Frase per svelare il ruolo di un morto (variante "ruolo dei morti svelato"). */
function roleRevealLine(name, role) {
  return `«Il ruolo di ${name} era: ${role ? `${role.icon} ${role.name}` : 'sconosciuto'}.»`;
}

/** Frase per annunciare i ruoli in gioco (variante "mazzo annunciato"). */
function deckAnnouncement(deckMap, findRole) {
  const parts = Object.entries(deckMap || {})
    .filter(([, qty]) => qty > 0)
    .map(([id, qty]) => {
      const role = findRole(id);
      if (!role) return null;
      return { faction: role.faction, wakes: role.wakeTiming !== 'mai', text: qty > 1 ? `${role.name} (${qty})` : role.name };
    })
    .filter(Boolean);
  // prima i lupi e i loro alleati, poi i solitari, poi il villaggio (chi si sveglia di notte prima degli altri)
  const order = ['Branco', 'Alleato dei Lupi', 'Solitario', 'Villaggio'];
  parts.sort((a, b) => order.indexOf(a.faction) - order.indexOf(b.faction) || Number(b.wakes) - Number(a.wakes));
  return `«In questa partita ci sono: ${joinNames(parts.map(p => p.text))}.»`;
}

/* ---------- Eventi a sorpresa ---------- */
// phase 'night' = vale per la notte in cui esce; 'day' = vale per il giorno dopo quella notte
const SURPRISE_EVENTS = [
  { id: 'luna_rossa', icon: '🌕', name: 'Luna rossa', phase: 'night', effect: 'wolvesKillTwice',
    text: 'Stanotte i lupi sbranano due volte.',
    phrase: '«Stanotte la luna è rossa come il sangue: i lupi hanno doppia fame!»' },
  { id: 'eclissi', icon: '🌑', name: 'Eclissi', phase: 'night', effect: 'wolvesNoKill',
    text: 'Stanotte i lupi non possono uccidere.',
    phrase: '«Un\'eclissi oscura la luna: stanotte i lupi restano a digiuno.»' },
  { id: 'nebbia', icon: '🌫️', name: 'Nebbia', phase: 'night', effect: 'blindSeers',
    text: 'Stanotte chi indaga (Veggente, Medium...) non vede nulla.',
    phrase: '«Una nebbia fitta avvolge il villaggio: stanotte nessuno riesce a vedere lontano.»' },
  { id: 'veglia', icon: '🕯️', name: 'Veglia funebre', phase: 'day', effect: 'revealNightDeaths',
    text: 'Domattina si svela il ruolo di chi muore stanotte.',
    phrase: '«Il villaggio veglia i suoi morti: domattina si scoprirà chi erano davvero.»',
    today: '«Il villaggio veglia i suoi morti e scopre chi erano davvero.»' },
  { id: 'festa', icon: '🎉', name: 'Festa al villaggio', phase: 'day', effect: 'noBurning',
    text: 'Domani niente rogo: si festeggia.',
    phrase: '«Domani è festa al villaggio: niente rogo, solo chiacchiere e sospetti!»',
    today: '«Oggi è festa al villaggio: niente rogo!»' },
  { id: 'processo_lampo', icon: '⚡', name: 'Processo lampo', phase: 'day', effect: 'shortDebate',
    text: 'Domani il dibattito dura la metà.',
    phrase: '«Un temporale si avvicina: domani bisognerà decidere in fretta!»',
    today: '«Il temporale è vicino: oggi il dibattito dura la metà!»' }
];
const SURPRISE_EVENT_CHANCE = 0.4; // circa una notte su due/tre
const EVENT_EFFECT_KEYS = ['wolvesKillTwice', 'wolvesNoKill', 'blindSeers', 'revealNightDeaths', 'noBurning', 'shortDebate'];

function findSurpriseEvent(id) {
  return SURPRISE_EVENTS.find(e => e.id === id) || null;
}

/** Effetti di un evento: { wolvesKillTwice, wolvesNoKill, ... } tutti false tranne il suo. */
function eventEffects(event) {
  const fx = {};
  EVENT_EFFECT_KEYS.forEach(k => { fx[k] = !!event && event.effect === k; });
  return fx;
}

/**
 * Estrae l'evento di una notte: null (nessun evento) oppure un evento.
 * rand() → numero tra 0 e 1. Mai lo stesso evento due volte di fila; excludeIds = eventi inutili
 * (es. "Veglia funebre" quando i ruoli dei morti sono già svelati).
 */
function drawSurpriseEvent(rand, previousId, excludeIds, chance) {
  const odds = typeof chance === 'number' ? chance : SURPRISE_EVENT_CHANCE;
  if (rand() >= odds) return null;
  return pickSurpriseEvent(rand, [previousId].concat(excludeIds || []));
}

/** Un evento qualsiasi, diverso da quelli indicati (per "pescane un altro"). */
function pickSurpriseEvent(rand, excludeIds) {
  const pool = SURPRISE_EVENTS.filter(e => !(excludeIds || []).includes(e.id));
  if (!pool.length) return null;
  return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))];
}

/* ---------- Voce del Narratore ---------- */
/**
 * Divide la frase di un ruolo in due: quella da dire quando si chiama il ruolo
 * e la chiusura («...chiude gli occhi») da dire quando ha finito.
 * Se non c'è una chiusura, tutta la frase è "open".
 */
function splitPhrase(phrase) {
  const text = String(phrase || '').trim();
  const cut = Math.max(text.lastIndexOf('...'), text.lastIndexOf('…'));
  if (cut > 0) {
    const sep = text.startsWith('...', cut) ? 3 : 1;
    const tail = text.slice(cut + sep).trim();
    if (/chiud/i.test(tail)) return { open: text.slice(0, cut + sep).trim(), close: tail };
  }
  return { open: text, close: '' };
}

/** Testo pulito per la sintesi vocale: senza virgolette, emoji e spazi doppi. */
function speechText(text) {
  return String(text || '')
    .replace(/[«»"“”]/g, '')
    .replace(/\p{Extended_Pictographic}|️|‍/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/* =========================================================================
   10. PARTITA SENZA NARRATORE E BACKUP
========================================================================= */
/**
 * Scelta finale di un gruppo (es. il branco) dalle mosse segrete dei suoi membri.
 * votes = liste di scelte nell'ordine in cui hanno votato ('' = nessuno), targets = quante persone scegliere.
 * Vince chi ha più voti; a parità, chi è stato scelto per primo.
 */
function pickFromVotes(votes, targets) {
  const count = new Map();
  const firstSeen = new Map();
  let position = 0;
  (votes || []).forEach(list => {
    (Array.isArray(list) ? list : [list]).forEach(id => {
      if (!id) return;
      count.set(id, (count.get(id) || 0) + 1);
      if (!firstSeen.has(id)) firstSeen.set(id, position++);
    });
  });
  return Array.from(count.keys())
    .sort((a, b) => count.get(b) - count.get(a) || firstSeen.get(a) - firstSeen.get(b))
    .slice(0, Math.max(1, targets || 1));
}

/** Ordine in cui passa il telefono di notte: i vivi, nell'ordine in cui sono seduti. */
function passOrder(players) {
  return (players || []).filter(p => !p.isDead).map(p => p.id);
}

/* ---------- Statistiche delle partite ---------- */
const STATS_LIMIT = 300;
const WINNER_TYPES = ['village', 'wolves', 'solo'];

/** Chiave che identifica un mazzo (stessi ruoli e quantità = stessa chiave). */
function deckKey(deckMap) {
  return Object.entries(deckMap || {})
    .filter(([, qty]) => Number(qty) > 0)
    .map(([id, qty]) => `${id}:${Number(qty)}`)
    .sort()
    .join(',');
}

/** Riga delle statistiche per una partita finita (win = risultato di evaluateVictory). */
function buildMatchRecord(match, win, nowMs) {
  const solo = win.type === 'solo' && win.playerId ? (match.players || []).find(p => p.id === win.playerId) : null;
  return {
    id: String(match.id || ''),
    date: nowMs,
    deckKey: deckKey(match.initialDeckMap),
    players: (match.players || []).length,
    mode: match.mode === 'auto' ? 'auto' : 'narrator',
    winner: win.type,
    soloRoleId: solo ? solo.roleId : '',
    turns: Number(match.turn) || 1
  };
}

/** Aggiunge (o aggiorna, se la partita c'è già) una partita alle statistiche: le più recenti prima. */
function upsertMatchRecord(records, record, limit) {
  const list = (records || []).filter(r => r && r.id !== record.id);
  list.unshift(record);
  return list.slice(0, limit || STATS_LIMIT);
}

function removeMatchRecord(records, id) {
  return (records || []).filter(r => r && r.id !== id);
}

/** Riassunto: quante partite e chi ha vinto. key = solo le partite con quel mazzo (null = tutte). */
function summarizeRecords(records, key) {
  const out = { played: 0, village: 0, wolves: 0, solo: 0 };
  (records || []).forEach(r => {
    if (!r || (key && r.deckKey !== key) || !WINNER_TYPES.includes(r.winner)) return;
    out.played++;
    out[r.winner]++;
  });
  return out;
}

function sanitizeMatchRecords(list) {
  return (Array.isArray(list) ? list : [])
    .filter(r => r && typeof r.id === 'string' && r.id && WINNER_TYPES.includes(r.winner))
    .map(r => ({
      id: r.id.slice(0, 40),
      date: Number(r.date) || 0,
      deckKey: cleanText(r.deckKey, 600),
      players: Math.max(0, parseInt(r.players, 10) || 0),
      mode: r.mode === 'auto' ? 'auto' : 'narrator',
      winner: r.winner,
      soloRoleId: cleanText(r.soloRoleId, 40),
      turns: Math.max(1, parseInt(r.turns, 10) || 1)
    }))
    .slice(0, STATS_LIMIT);
}

/* ---------- Backup ---------- */
const BACKUP_FORMAT = 'lupus-backup';
const BACKUP_VERSION = 1;
const BACKUP_BOOL_SETTINGS = ['ghostRule', 'autoResolve', 'enforceRules', 'revealDead', 'deckAnnounced', 'surpriseEvents', 'voiceOn', 'soundsOn'];

/** Nome del file di backup, es. lupus-backup-2026-11-07.json */
function backupFileName(date) {
  const d = date instanceof Date ? date : new Date(date);
  const pad = n => String(n).padStart(2, '0');
  return `lupus-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
}

/** Contenuto del backup: ruoli, giocatori, impostazioni e nomi già usati (non la partita in corso). */
function buildBackup(state, nowIso, appVersion) {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    appVersion: appVersion || '',
    createdAt: nowIso,
    data: {
      roles: state.roles || [],
      players: state.players || [],
      settings: state.settings || {},
      knownPlayers: state.knownPlayers || [],
      stats: state.stats || []
    }
  };
}

/** Impostazioni del backup ripulite: solo quelle conosciute e con valori validi. */
function sanitizeBackupSettings(obj) {
  const src = obj && typeof obj === 'object' ? obj : {};
  const out = {};
  BACKUP_BOOL_SETTINGS.forEach(k => { if (typeof src[k] === 'boolean') out[k] = src[k]; });
  if (TIE_RULE_KEYS.includes(src.tieRule)) out.tieRule = src.tieRule;
  if (src.narratorLevel === 'beginner' || src.narratorLevel === 'expert') out.narratorLevel = src.narratorLevel;
  if (src.playMode === 'narrator' || src.playMode === 'auto') out.playMode = src.playMode;
  if (src.activeSetupTab === 'presets' || src.activeSetupTab === 'custom') out.activeSetupTab = src.activeSetupTab;
  const seconds = Number(src.dayTimerSeconds);
  if (seconds >= 30 && seconds <= 1200) out.dayTimerSeconds = Math.round(seconds);
  if (src.selectedDeck && typeof src.selectedDeck === 'object') {
    out.selectedDeck = {};
    Object.entries(src.selectedDeck).forEach(([id, qty]) => {
      const n = parseInt(qty, 10);
      if (/^[a-z0-9_]{1,40}$/i.test(id) && n > 0 && n <= 30) out.selectedDeck[id] = n;
    });
  }
  if (Array.isArray(src.knownDefaultRoleIds)) out.knownDefaultRoleIds = src.knownDefaultRoleIds.filter(id => typeof id === 'string').slice(0, 100);
  return out;
}

/**
 * Legge un backup (testo del file). Restituisce { data, createdAt } oppure { error }.
 * data = { roles, players, settings, knownPlayers }, già controllati.
 */
function parseBackup(text) {
  let obj;
  try {
    obj = JSON.parse(String(text || '').trim());
  } catch (e) {
    return { error: 'Questo non è un file di backup di Lupus (o è rovinato).' };
  }
  if (!obj || obj.format !== BACKUP_FORMAT || !obj.data || typeof obj.data !== 'object') {
    return { error: 'Questo non è un file di backup di Lupus.' };
  }
  if (Number(obj.version) > BACKUP_VERSION) {
    return { error: 'Il backup è stato fatto con una versione più nuova di Lupus: aggiorna l\'app e riprova.' };
  }
  const ids = new Set();
  const roles = (Array.isArray(obj.data.roles) ? obj.data.roles : []).map(r => {
    const clean = sanitizeImportedRole(r);
    if (!clean || !clean.id || ids.has(clean.id)) return null;
    ids.add(clean.id);
    return clean;
  }).filter(Boolean).slice(0, 100);
  if (!roles.length) return { error: 'Il backup non contiene ruoli validi.' };
  const players = (Array.isArray(obj.data.players) ? obj.data.players : [])
    .map(n => cleanText(n, 40)).filter(Boolean).slice(0, 40);
  const knownPlayers = (Array.isArray(obj.data.knownPlayers) ? obj.data.knownPlayers : [])
    .filter(k => k && typeof k.name === 'string' && k.name.trim())
    .map(k => ({ name: cleanText(k.name, 40), count: Math.max(1, parseInt(k.count, 10) || 1), last: Number(k.last) || 0 }))
    .slice(0, 60);
  return {
    createdAt: typeof obj.createdAt === 'string' ? obj.createdAt : '',
    data: { roles, players, settings: sanitizeBackupSettings(obj.data.settings), knownPlayers, stats: sanitizeMatchRecords(obj.data.stats) }
  };
}

/* =========================================================================
   11. GIOCATORI: COLORE, INIZIALE E NOMI GIÀ USATI (FUNZIONI PURE)
========================================================================= */
// Colori dei giocatori: tenui, ben distinti tra loro e leggibili con il testo scuro sopra
const PLAYER_COLORS = [
  '#E58C6B', '#F2C86B', '#8CC08A', '#7FA8E0', '#B79CED', '#E59AB5', '#69C3C0', '#D9A679',
  '#A8C26A', '#F09E5C', '#9DB3CC', '#C98FB0', '#7FD1A8', '#E9D27C', '#94A2F0', '#D97C7C'
];

function hashName(name) {
  let h = 0;
  for (const ch of String(name).trim().toLowerCase()) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return h;
}

/**
 * Un colore per ogni giocatore: dipende dal nome (Anna ha di solito lo stesso colore),
 * ma due giocatori della stessa partita non hanno mai lo stesso colore (fino a 16 giocatori).
 */
function assignPlayerColors(names) {
  const n = PLAYER_COLORS.length;
  const used = new Set();
  return (names || []).map(name => {
    let idx = hashName(name) % n;
    for (let k = 0; k < n && used.has(idx); k++) idx = (idx + 1) % n;
    used.add(idx);
    return PLAYER_COLORS[idx];
  });
}

/** Iniziale da mostrare nel cerchietto del giocatore. */
function playerInitial(name) {
  const text = String(name || '').trim();
  if (!text) return '?';
  return Array.from(text)[0].toLocaleUpperCase('it');
}

/**
 * Ricorda i nomi di chi ha giocato: known = [{ name, count, last }].
 * Restituisce l'elenco aggiornato, dal più recente, al massimo `limit` nomi.
 */
function rememberPlayerNames(known, names, now, limit = 60) {
  const list = (Array.isArray(known) ? known : []).filter(k => k && typeof k.name === 'string' && k.name.trim()).map(k => ({ ...k }));
  (names || []).forEach(raw => {
    const name = String(raw || '').trim();
    if (!name) return;
    const found = list.find(k => k.name.toLowerCase() === name.toLowerCase());
    if (found) {
      found.name = name;
      found.count = (found.count || 0) + 1;
      found.last = now;
    } else {
      list.push({ name, count: 1, last: now });
    }
  });
  return list.sort((a, b) => (b.last || 0) - (a.last || 0) || (b.count || 0) - (a.count || 0)).slice(0, limit);
}

/** Nomi da suggerire: non già in lista, che iniziano con il testo scritto, dal più recente. */
function suggestPlayerNames(known, currentNames, fragment, max = 10) {
  const taken = new Set((currentNames || []).map(n => String(n).trim().toLowerCase()));
  const f = String(fragment || '').trim().toLowerCase();
  return (Array.isArray(known) ? known : [])
    .filter(k => k && typeof k.name === 'string' && !taken.has(k.name.toLowerCase()) && (!f || k.name.toLowerCase().startsWith(f)))
    .sort((a, b) => (b.last || 0) - (a.last || 0) || (b.count || 0) - (a.count || 0))
    .slice(0, max)
    .map(k => k.name);
}
