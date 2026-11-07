// Test delle regole del gioco (public/rules.js). Si lanciano con: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const code = readFileSync(new URL('../public/rules.js', import.meta.url), 'utf8');
const ctx = vm.createContext({ TextEncoder, TextDecoder, btoa, atob });
vm.runInContext(
  code +
    '\nglobalThis.R = { DEFAULT_ROLES, PRESETS_BY_COUNT, countDeck, getDeckProblems, findBurnedOnDay, evaluateVictory, parseVersion, isNewerVersion, parseRelease, shouldAutoCheck, getVoters, voteWeight, tallyVotes, buildTimeline, encodeRolesShare, decodeRolesShare, sanitizeImportedRole, isRoleCustomized, mergeImportedRoles, NIGHT_ACTIONS, roleNightAction, roleActionRules, wakesOnNight, buildNightPlan, getTargetOptions, investigateAnswer, copyResultRoleId, resolveNight, buildMorningAnnouncement, rolePhrase, roleActionRules, roleWakesWithWolves, roleDeathAction, roleVictory, roleTraits, roleBalance, roleMarkText, hasDeathShot, computePowerUsage, witchSaveKey, deckBalance, getNightOrderRoles, applyNightOrder, addNewDefaultRoles, ORIGINAL_DEFAULT_ROLE_IDS, VALID_WAKE_TIMINGS, WAKE_TIMING_LABELS, roleAbilityNotes, TIE_RULE_KEYS, tieOutcome, roleRevealLine, deckAnnouncement, SURPRISE_EVENTS, findSurpriseEvent, eventEffects, drawSurpriseEvent, pickSurpriseEvent, secondTargetKey, wolvesTargetIds, backupFileName, buildBackup, parseBackup, sanitizeBackupSettings, roleMarkEffect, markVoteBonus, VOTE_ABSTAIN, deckKey, buildMatchRecord, upsertMatchRecord, removeMatchRecord, summarizeRecords, sanitizeMatchRecords, parseDeckKey, refreshOutdatedRoleTexts, isReplacedRoleId, replacementRoleId, removeReplacedRoles, replaceRolesInDeck, replaceRolesInMatch, PLAYER_COLORS, assignPlayerColors, playerInitial, rememberPlayerNames, suggestPlayerNames };',
  ctx
);
const R = ctx.R;
const findRole = id => R.DEFAULT_ROLES.find(r => r.id === id) || null;

function player(id, roleId, extra = {}) {
  return { id, name: id, roleId, originalRoleId: roleId, isDead: false, isGhost: false, ...extra };
}

test('i 17 ruoli base hanno id unici e tutti i campi', () => {
  assert.equal(R.DEFAULT_ROLES.length, 17);
  const ids = new Set(R.DEFAULT_ROLES.map(r => r.id));
  assert.equal(ids.size, 17);
  assert.ok(!ids.has('gemelli'), 'i Gemelli non ci sono più: restano i Massoni');
  for (const id of ['strega', 'cacciatore', 'massoni', 'gufo', 'lupo_bianco']) assert.ok(ids.has(id), id);
  for (const r of R.DEFAULT_ROLES) assert.ok(R.VALID_WAKE_TIMINGS.includes(r.wakeTiming), `${r.id}.wakeTiming`);
  for (const r of R.DEFAULT_ROLES) {
    for (const f of ['name', 'icon', 'faction', 'whatYouDo', 'howYouWin', 'wakeTiming']) assert.ok(r[f], `${r.id}.${f}`);
  }
});

test('ogni preset ha tanti ruoli quanti giocatori ed è giocabile', () => {
  for (const [count, presets] of Object.entries(R.PRESETS_BY_COUNT)) {
    const n = Number(count);
    const codes = new Set();
    for (const p of presets) {
      assert.ok(!codes.has(p.code), `codice ripetuto ${p.code}`);
      codes.add(p.code);
      assert.equal(R.countDeck(p.roles), n, `preset ${p.code} (${n} giocatori)`);
      for (const id of Object.keys(p.roles)) assert.ok(findRole(id), `preset ${p.code}: ruolo ${id} inesistente`);
      assert.deepEqual([...R.getDeckProblems(p.roles, n, findRole)], [], `preset ${p.code}`);
      assert.equal(R.deckBalance(p.roles, findRole).level, 'balanced', `preset ${p.code} non equilibrato`);
      assert.ok(p.desc && p.name && p.turns, `preset ${p.code}: testi`);
    }
    assert.equal(presets.length, 3, `${n} giocatori: 3 preset`);
  }
});

test('controllo del mazzo: spiega cosa non va', () => {
  assert.match(R.getDeckProblems({}, 3, findRole)[0], /almeno 5 giocatori/);
  assert.match(R.getDeckProblems({ lupo: 1, contadino: 3 }, 5, findRole)[0], /Manca 1 ruolo|Mancano 1/);
  assert.match(R.getDeckProblems({ lupo: 1, contadino: 6 }, 5, findRole)[0], /di troppo/);
  assert.ok(R.getDeckProblems({ lupo: 1, massoni: 1, contadino: 3 }, 5, findRole).some(t => /coppie/.test(t)));
  assert.ok(R.getDeckProblems({ contadino: 5 }, 5, findRole).some(t => /almeno un Lupo/.test(t)));
  assert.ok(R.getDeckProblems({ lupo: 3, contadino: 2 }, 5, findRole).some(t => /meno degli altri/.test(t)));
  assert.ok(R.getDeckProblems({ lupo: 1, sparito: 4 }, 5, findRole).some(t => /non esiste più/.test(t)));
});

test('Medium: trova solo chi è stato bruciato nel giorno giusto', () => {
  const players = [
    player('a', 'lupo', { isDead: true, deathCause: 'rogo', diedOnTurn: 1 }),
    player('b', 'contadino', { isDead: true, deathCause: 'notte', diedOnTurn: 2 })
  ];
  assert.equal(R.findBurnedOnDay(players, 1).id, 'a');
  assert.equal(R.findBurnedOnDay(players, 2), null);
});

test('vittorie: villaggio, lupi, criceto e giullare', () => {
  const base = () => [player('w', 'lupo'), player('v1', 'contadino'), player('v2', 'veggente'), player('v3', 'guardia')];

  assert.equal(R.evaluateVictory(base(), findRole), null);

  const village = base();
  village[0].isDead = true;
  assert.equal(R.evaluateVictory(village, findRole).type, 'village');

  const wolves = base();
  wolves[1].isDead = true;
  wolves[2].isDead = true;
  assert.equal(R.evaluateVictory(wolves, findRole).type, 'wolves');

  const hamster = [...base(), player('h', 'criceto')];
  hamster[0].isDead = true;
  assert.match(R.evaluateVictory(hamster, findRole).text, /CRICETO/);

  // Giullare morto di notte: nessuna vittoria; al rogo: vince lui.
  const jesterNight = [...base(), player('j', 'giullare', { isDead: true, deathCause: 'notte', diedOnTurn: 1 })];
  assert.equal(R.evaluateVictory(jesterNight, findRole), null);
  const jesterDay = [...base(), player('j', 'giullare', { isDead: true, deathCause: 'rogo', diedOnTurn: 1 })];
  assert.match(R.evaluateVictory(jesterDay, findRole).text, /GIULLARE/);
});

test('versioni e aggiornamenti', () => {
  assert.deepEqual([...R.parseVersion('v1.2.3')], [1, 2, 3]);
  assert.equal(R.parseVersion('1.2'), null);
  assert.equal(R.isNewerVersion('1.0.1', '1.0.0'), true);
  assert.equal(R.isNewerVersion('v1.10.0', '1.9.9'), true);
  assert.equal(R.isNewerVersion('1.0.0', '1.0.0'), false);
  assert.equal(R.isNewerVersion('0.9.0', '1.0.0'), false);
  assert.equal(R.isNewerVersion('boh', '1.0.0'), false);

  const rel = R.parseRelease({
    tag_name: 'v1.1.0',
    html_url: 'https://github.com/Nikcirri/lupus/releases/tag/v1.1.0',
    assets: [{ name: 'Lupus-v1.1.0.apk', browser_download_url: 'https://example.com/Lupus-v1.1.0.apk' }]
  });
  assert.equal(rel.version, '1.1.0');
  assert.equal(rel.apkUrl, 'https://example.com/Lupus-v1.1.0.apk');
  assert.equal(R.parseRelease({ message: 'Not Found' }), null);

  const now = new Date('2026-11-06T12:00:00Z');
  assert.equal(R.shouldAutoCheck(null, now), true);
  assert.equal(R.shouldAutoCheck('2026-11-06T01:00:00Z', now), false);
  assert.equal(R.shouldAutoCheck('2026-11-05T11:00:00Z', now), true);
});

test('votazione: Sindaco vale 2, il Fantasma vota, i morti no', () => {
  const players = [
    player('a', 'lupo'),
    player('b', 'sindaco'),
    player('c', 'contadino'),
    player('d', 'veggente', { isDead: true, isGhost: true }),
    player('e', 'guardia', { isDead: true })
  ];
  assert.deepEqual([...R.getVoters(players)].map(p => p.id), ['a', 'b', 'c', 'd']);
  const t = R.tallyVotes(players, { a: 'c', b: 'a', c: 'a', d: 'c', e: 'c' }, findRole, null);
  assert.deepEqual([...t.totals].map(r => `${r.playerId}=${r.votes}`), ['a=3', 'c=2', 'b=0']);
  assert.deepEqual([...t.leaders], ['a']);
  assert.equal(t.castCount, 4);
  assert.equal(t.voterCount, 4);
  // il morto non può essere votato né votare
  assert.ok(![...t.totals].some(r => r.playerId === 'd' || r.playerId === 'e'));
});

test('votazione: pareggio e ballottaggio', () => {
  const players = [player('a', 'lupo'), player('b', 'contadino'), player('c', 'contadino'), player('d', 'contadino')];
  const tie = R.tallyVotes(players, { a: 'b', b: 'a', c: 'a', d: 'b' }, findRole, null);
  assert.deepEqual([...tie.leaders].sort(), ['a', 'b']);
  // al ballottaggio contano solo i voti per i candidati in pareggio
  const runoff = R.tallyVotes(players, { a: 'b', b: 'a', c: 'a', d: 'c' }, findRole, ['a', 'b']);
  assert.deepEqual([...runoff.totals].map(r => r.playerId), ['a', 'b']);
  assert.deepEqual([...runoff.leaders], ['a']);
  assert.equal(R.tallyVotes(players, {}, findRole, null).leaders.length, 0);
});

test('cronologia della partita', () => {
  const players = [
    player('a', 'lupo', { isDead: true, deathCause: 'rogo', diedOnTurn: 1 }),
    player('b', 'contadino', { isDead: true, isGhost: true, deathCause: 'notte', diedOnTurn: 1 }),
    player('c', 'veggente')
  ];
  const logs = [{ turn: 1, wolfTargets: ['b'], shielded: ['c'], probed: ['a'], flowers: [] }];
  const tl = R.buildTimeline(players, logs, findRole);
  assert.deepEqual([...tl].map(e => e.title), ['🌙 Notte 1', '☀️ Giorno 1']);
  const night = tl[0].lines.join('\n');
  assert.match(night, /lupi hanno scelto b/);
  assert.match(night, /Guardia del Corpo ha protetto c/);
  assert.match(night, /Veggente ha indagato su a/);
  assert.match(night, /Morto stanotte: b .*Fantasma/);
  assert.match(tl[1].lines[0], /Bruciato al rogo: a \(🐺 Lupo Mannaro\)/);
});

test('condividere i ruoli: andata e ritorno, emoji comprese', () => {
  const custom = { id: 'custom_1', name: 'Mugnaio', icon: '🧑‍🌾', faction: 'Villaggio', whatYouDo: 'Macina il grano, è così.', howYouWin: 'Col villaggio.', wakeTiming: 'mai', priority: 7, narratorPhrase: '', narratorNote: 'Nota «speciale»', isPair: false };
  const code = R.encodeRolesShare([custom]);
  assert.match(code, /^LUPUS-RUOLI-1:[A-Za-z0-9+/=]+$/);
  const decoded = R.decodeRolesShare(`Ecco i miei ruoli!\n${code}\nCiao`);
  assert.equal(decoded.roles.length, 1);
  assert.equal(decoded.roles[0].icon, '🧑‍🌾');
  assert.equal(decoded.roles[0].narratorNote, 'Nota «speciale»');
  assert.match(R.decodeRolesShare('ciao').error, /Non trovo/);
  assert.match(R.decodeRolesShare('LUPUS-RUOLI-1:abc').error, /incompleto|rovinato|non contiene/);
  // valori strani vengono ripuliti
  const clean = R.sanitizeImportedRole({ name: ' X ', whatYouDo: 'a', howYouWin: 'b', faction: 'Alieni', wakeTiming: 'sempre', priority: 500, victory: 'tutto', deathAction: 'boh', traits: { volare: true, doubleVote: 1 } });
  assert.equal(clean.name, 'X');
  assert.equal(clean.faction, 'Villaggio');
  assert.equal(clean.wakeTiming, 'mai');
  assert.equal(clean.priority, 99);
  assert.equal(clean.victory, 'faction');
  assert.equal(clean.deathAction, 'none');
  assert.equal(clean.traits.doubleVote, true);
  assert.equal('volare' in clean.traits, false);
  assert.equal(R.sanitizeImportedRole({ name: 'Senza testi' }), null);
});

test('ruoli personalizzati e unione dopo l\'importazione', () => {
  const base = R.DEFAULT_ROLES.map(r => ({ ...r }));
  assert.equal(base.some(r => R.isRoleCustomized(r, R.DEFAULT_ROLES)), false);
  base[0].whatYouDo = 'Cambiato';
  assert.equal(R.isRoleCustomized(base[0], R.DEFAULT_ROLES), true);
  let n = 0;
  const merged = R.mergeImportedRoles(base, [
    { ...base[1], name: 'contadino', whatYouDo: 'Nuovo testo' },
    { id: 'custom_9', name: 'Mugnaio', icon: '🌾', faction: 'Villaggio', whatYouDo: 'x', howYouWin: 'y', wakeTiming: 'mai', priority: 5, narratorPhrase: '', narratorNote: '', isPair: false },
    { id: 'lupo', name: 'Lupo Nero', icon: '🐺', faction: 'Branco', whatYouDo: 'x', howYouWin: 'y', wakeTiming: 'ogni_notte', priority: 5, narratorPhrase: '', narratorNote: '', isPair: false }
  ], () => `custom_new_${++n}`);
  assert.equal(merged.updated, 1);
  assert.equal(merged.added, 2);
  assert.equal(merged.roles.find(r => r.id === 'contadino').whatYouDo, 'Nuovo testo');
  assert.ok(merged.roles.some(r => r.id === 'custom_9'));
  assert.ok(merged.roles.some(r => r.name === 'Lupo Nero' && r.id === 'custom_new_1'));
  assert.equal(new Set(merged.roles.map(r => r.id)).size, merged.roles.length);
});

// ---------- Modalità guidata ----------
const roles = () => R.DEFAULT_ROLES.map(r => ({ ...r }));
const plan = (players, turn, list = roles()) => [...R.buildNightPlan(players, list, turn)];
const keys = steps => steps.map(st => st.key);

test('i ruoli base hanno azione notturna e regole', () => {
  const by = id => R.DEFAULT_ROLES.find(r => r.id === id);
  assert.equal(by('lupo').nightAction, 'wolves');
  assert.equal(by('veggente').nightAction, 'investigate');
  assert.equal(by('guardia').actionRules.notSameTwice, true);
  assert.equal(by('contadino').nightAction, 'none');
  // ruoli salvati prima della 1.3 (senza i campi nuovi): si deducono dall'id
  assert.equal(R.roleNightAction({ id: 'guardia', name: 'Guardia' }), 'protect');
  assert.equal(R.roleNightAction({ id: 'custom_1', name: 'X' }), 'none');
  assert.equal(R.roleNightAction({ id: 'custom_1', nightAction: 'boh' }), 'none');
  for (const k of Object.keys(R.NIGHT_ACTIONS)) assert.ok(R.NIGHT_ACTIONS[k].label, k);
});

test('piano della notte: ordine, prima e seconda notte, ruoli assenti', () => {
  const players = [
    player('a', 'lupo'), player('b', 'lupo'), player('c', 'veggente'), player('d', 'guardia'),
    player('e', 'massoni'), player('f', 'massoni'), player('g', 'medium'), player('h', 'copione'), player('i', 'contadino')
  ];
  assert.deepEqual(keys(plan(players, 1)), ['intro', 'role:massoni', 'role:veggente', 'role:guardia', 'wolves', 'dawn']);
  assert.deepEqual(keys(plan(players, 2)), ['intro', 'role:veggente', 'role:medium', 'role:guardia', 'wolves', 'role:copione', 'dawn']);
  assert.deepEqual(keys(plan(players, 3)), ['intro', 'role:veggente', 'role:medium', 'role:guardia', 'wolves', 'dawn']);
  const wolves = plan(players, 1).find(st => st.key === 'wolves');
  assert.deepEqual([...wolves.holders].map(p => p.id), ['a', 'b']);
});

test('chiamata a vuoto se tutti quelli del ruolo sono morti', () => {
  const players = [player('a', 'lupo'), player('c', 'veggente', { isDead: true }), player('d', 'contadino')];
  const seer = plan(players, 1).find(st => st.key === 'role:veggente');
  assert.equal(seer.emptyCall, true);
  assert.equal(plan(players, 1).find(st => st.key === 'wolves').emptyCall, false);
});

test('ruoli personalizzati: si svegliano con i lupi o hanno un passo tutto loro', () => {
  const list = [...roles(),
    { id: 'custom_alfa', name: 'Lupo Alfa', icon: '🐺', faction: 'Branco', wakeTiming: 'ogni_notte', priority: 5, nightAction: 'wolves', actionRules: { notWolves: true } },
    { id: 'custom_strega', name: 'Strega', icon: '🧙', faction: 'Villaggio', wakeTiming: 'ogni_notte', priority: 6, nightAction: 'kill', actionRules: { notSelf: true } }
  ];
  const players = [player('a', 'lupo'), player('x', 'custom_alfa'), player('s', 'custom_strega'), player('c', 'contadino')];
  const steps = plan(players, 1, list);
  assert.deepEqual(keys(steps), ['intro', 'wolves', 'role:custom_strega', 'dawn']);
  assert.deepEqual([...steps[1].holders].map(p => p.id), ['a', 'x']);
  assert.deepEqual([...steps[1].roleIds], ['lupo', 'custom_alfa']);
  assert.equal(steps[2].kind, 'kill');
});

test('bersagli consentiti dalle regole', () => {
  const players = [player('a', 'lupo'), player('d', 'guardia'), player('c', 'contadino'), player('m', 'contadino', { isDead: true })];
  const steps = plan(players, 2);
  const guard = steps.find(st => st.key === 'role:guardia');
  const opts = [...R.getTargetOptions(guard, players, roles(), { 'role:guardia': 'c' }, true)];
  assert.deepEqual(opts.map(o => `${o.id}:${o.reason}`), ['a:', 'd:sé stesso', 'c:scelto ieri notte']);
  const wolves = steps.find(st => st.key === 'wolves');
  const wo = [...R.getTargetOptions(wolves, players, roles(), {}, true)];
  assert.equal(wo.find(o => o.id === 'a').reason, 'è un lupo');
  // regole spente: tutti i vivi si possono scegliere
  assert.ok([...R.getTargetOptions(guard, players, roles(), { 'role:guardia': 'c' }, false)].every(o => !o.disabled));
});

test('risoluzione della notte: protezione, Criceto, uccisioni, segni, copia', () => {
  const list = [...roles(),
    { id: 'custom_strega', name: 'Strega', icon: '🧙', faction: 'Villaggio', wakeTiming: 'ogni_notte', priority: 6, nightAction: 'kill', actionRules: {} }];
  const players = [
    player('a', 'lupo'), player('v', 'veggente'), player('g', 'guardia'), player('f', 'fioraio'),
    player('h', 'criceto'), player('s', 'custom_strega'), player('k', 'copione'), player('c', 'contadino'), player('x', 'contadino')
  ];
  const steps = plan(players, 2, list);
  const r1 = R.resolveNight(players, steps, { wolves: 'c', 'role:guardia': 'c', 'role:custom_strega': 'x', 'role:fioraio': 'v', 'role:copione': 'a' }, list);
  assert.deepEqual([...r1.deaths].map(d => `${d.playerId}:${d.cause}`), ['x:kill']);
  assert.deepEqual([...r1.saved].map(d => d.playerId), ['c']);
  assert.deepEqual([...r1.marks].map(m => `${m.playerId}:${m.roleId}`), ['v:fioraio']);
  assert.deepEqual([...r1.copies].map(c => `${c.playerId}->${c.newRoleId}`), ['k->lupo']);

  const r2 = R.resolveNight(players, steps, { wolves: 'h', 'role:veggente': 'h' }, list);
  assert.deepEqual([...r2.deaths].map(d => `${d.playerId}:${d.cause}`), ['h:indagine']);
  const r3 = R.resolveNight(players, steps, { wolves: 'h' }, list);
  assert.equal(r3.deaths.length, 0);
  assert.deepEqual([...r3.immune].map(d => d.playerId), ['h']);
});

test('risposte e copia', () => {
  const find = id => R.DEFAULT_ROLES.find(r => r.id === id) || null;
  assert.equal(R.investigateAnswer(player('a', 'lupo'), find).isWolf, true);
  assert.equal(R.investigateAnswer(player('a', 'indemoniato'), find).isWolf, false);
  assert.equal(R.investigateAnswer(player('a', 'criceto'), find).dies, true);
  assert.equal(R.investigateAnswer(player('a', 'criceto'), find).isWolf, false);
  assert.equal(R.investigateAnswer(player('a', 'lupo_bianco'), find).isWolf, true);
  assert.equal(R.copyResultRoleId(find('veggente'), roles()), 'veggente');
  assert.equal(R.copyResultRoleId(find('guardia'), roles()), 'contadino');
});

test('annuncio del mattino e frase standard', () => {
  const find = id => R.DEFAULT_ROLES.find(r => r.id === id) || null;
  const nameOf = id => ({ v: 'Vera' })[id] || id;
  assert.match(R.buildMorningAnnouncement([], [], find, nameOf)[0], /non è morto nessuno/);
  assert.match(R.buildMorningAnnouncement(['Dario'], [], find, nameOf)[0], /è morto Dario/);
  assert.match(R.buildMorningAnnouncement(['Dario', 'Elena', 'Fabio'], [], find, nameOf)[0], /sono morti Dario, Elena e Fabio/);
  assert.match(R.buildMorningAnnouncement([], [{ playerId: 'v', roleId: 'fioraio' }], find, nameOf)[1], /fiori davanti alla porta di Vera/);
  assert.match(R.rolePhrase({ name: 'Strega', narratorPhrase: '' }), /Si sveglia Strega/);
});

test('cronologia con il nuovo formato', () => {
  const players = [player('a', 'lupo'), player('c', 'contadino', { isDead: true, deathCause: 'notte', diedOnTurn: 1 })];
  const find = id => R.DEFAULT_ROLES.find(r => r.id === id) || null;
  const tl = R.buildTimeline(players, [{ turn: 1, entries: [
    { kind: 'wolves', roleIds: ['lupo'], targetId: 'c' },
    { kind: 'protect', roleIds: ['guardia'], targetId: 'a' }
  ] }], find);
  const night = tl[0].lines.join('\n');
  assert.match(night, /lupi hanno scelto c/);
  assert.match(night, /Guardia del Corpo ha protetto a/);
});

test('condivisione: azione notturna e regole viaggiano con il ruolo', () => {
  const custom = { id: 'custom_1', name: 'Strega', icon: '🧙', faction: 'Villaggio', whatYouDo: 'x', howYouWin: 'y', wakeTiming: 'ogni_notte', priority: 6, nightAction: 'kill', actionRules: { notSelf: true } };
  const back = R.decodeRolesShare(R.encodeRolesShare([custom])).roles[0];
  assert.equal(back.nightAction, 'kill');
  assert.equal(back.actionRules.notSelf, true);
  assert.equal(back.actionRules.notSameTwice, false);
  const base = R.DEFAULT_ROLES.map(r => ({ ...r }));
  base.find(r => r.id === 'guardia').actionRules = { notSelf: false, notSameTwice: true, notWolves: false };
  assert.equal(R.isRoleCustomized(base.find(r => r.id === 'guardia'), R.DEFAULT_ROLES), true);
});

// ---------- Giocatori: colori e nomi suggeriti ----------
test('colori dei giocatori: stabili e mai uguali nella stessa partita', () => {
  const names = ['Anna', 'Bruno', 'Carla', 'Dario', 'Elena', 'Fabio', 'Gino', 'Ivo', 'Luca', 'Mara', 'Nina', 'Olga', 'Pino', 'Rita', 'Sara', 'Tino'];
  const colors = [...R.assignPlayerColors(names)];
  assert.equal(new Set(colors).size, 16);
  assert.deepEqual([...R.assignPlayerColors(names)], colors);
  assert.equal(R.assignPlayerColors(['anna'])[0], R.assignPlayerColors(['Anna '])[0]);
  assert.equal(R.playerInitial(' élena'), 'É');
  assert.equal(R.playerInitial(''), '?');
});

test('nomi ricordati e suggeriti', () => {
  let known = R.rememberPlayerNames([], ['Anna', 'Bruno'], 100);
  known = R.rememberPlayerNames(known, ['anna', 'Carla'], 200);
  const anna = known.find(k => k.name === 'anna');
  assert.equal(anna.count, 2);
  assert.equal(known.length, 3);
  assert.deepEqual([...R.suggestPlayerNames(known, ['Carla'], '')], ['anna', 'Bruno']);
  assert.deepEqual([...R.suggestPlayerNames(known, [], 'b')], ['Bruno']);
  assert.equal(R.rememberPlayerNames([], Array.from({ length: 80 }, (_, i) => `G${i}`), 1).length, 60);
});

// ---------- 1.5.0: nuovi ruoli, capacità, equilibrio e ordine di chiamata ----------
test('capacità dei ruoli base e dei ruoli salvati con le versioni vecchie', () => {
  assert.equal(R.roleTraits(findRole('sindaco')).doubleVote, true);
  assert.equal(R.roleTraits(findRole('criceto')).immuneToWolves, true);
  assert.equal(R.roleTraits(findRole('bambina')).peeksAtWolves, true);
  assert.equal(R.roleVictory(findRole('giullare')), 'burned');
  assert.equal(R.roleVictory(findRole('lupo_bianco')), 'lastAlive');
  assert.equal(R.roleDeathAction(findRole('cacciatore')), 'kill');
  assert.equal(R.hasDeathShot(findRole('cacciatore')), true);
  assert.equal(R.hasDeathShot(findRole('contadino')), false);
  assert.equal(R.roleWakesWithWolves(findRole('lupo_bianco')), true);
  assert.equal(R.roleActionRules(findRole('lupo_bianco')).onlyWolves, true);
  // ruolo salvato da una versione vecchia, senza i campi nuovi: si deducono dall'id
  assert.equal(R.roleTraits({ id: 'sindaco', name: 'Sindaco' }).doubleVote, true);
  assert.equal(R.roleVictory({ id: 'criceto' }), 'survive');
  // ruolo personalizzato: valgono solo i suoi dati
  assert.equal(R.roleTraits({ id: 'custom_1', traits: { doubleVote: true } }).doubleVote, true);
  assert.equal(R.roleVictory({ id: 'custom_1' }), 'faction');
  assert.match(R.roleMarkText({ id: 'custom_1' }), /\{nome\}/);
});

test('notti pari e dispari', () => {
  assert.deepEqual([1, 2, 3, 4].map(t => R.wakesOnNight('notti_pari', t)), [false, true, false, true]);
  assert.deepEqual([1, 2, 3, 4].map(t => R.wakesOnNight('notti_dispari', t)), [true, false, true, false]);
});

test('Lupo Bianco: sta con i lupi e nelle notti pari sbrana solo un lupo', () => {
  const players = [player('a', 'lupo'), player('b', 'lupo'), player('w', 'lupo_bianco'), player('v', 'veggente'), player('c', 'contadino')];
  assert.deepEqual(keys(plan(players, 1)), ['intro', 'role:veggente', 'wolves', 'dawn']);
  assert.deepEqual(keys(plan(players, 2)), ['intro', 'role:veggente', 'wolves', 'role:lupo_bianco', 'dawn']);
  const steps = plan(players, 2);
  assert.deepEqual([...steps.find(st => st.key === 'wolves').holders].map(p => p.id), ['a', 'b', 'w']);
  const white = steps.find(st => st.key === 'role:lupo_bianco');
  const opts = [...R.getTargetOptions(white, players, roles(), {}, true)];
  assert.deepEqual(opts.filter(o => !o.disabled).map(o => o.id), ['a', 'b']);
  assert.equal(opts.find(o => o.id === 'v').reason, 'non è un lupo');
  assert.equal(opts.find(o => o.id === 'w').reason, 'sé stesso');
  const res = R.resolveNight(players, steps, { wolves: 'c', 'role:lupo_bianco': 'a' }, roles());
  assert.deepEqual([...res.deaths].map(d => `${d.playerId}:${d.cause}`).sort(), ['a:kill', 'c:lupi']);
  // senza lupi normali il Lupo Bianco forma da solo il passo dei lupi
  const alone = plan([player('w', 'lupo_bianco'), player('v', 'veggente'), player('c', 'contadino')], 1);
  assert.deepEqual([...alone.find(st => st.key === 'wolves').roleIds], ['lupo_bianco']);
});

test('Strega: pozione della vita, della morte e pozioni finite', () => {
  const players = [player('a', 'lupo'), player('s', 'strega'), player('c', 'contadino'), player('d', 'contadino'), player('e', 'contadino')];
  const steps = plan(players, 1);
  const witch = steps.find(st => st.key === 'role:strega');
  assert.equal(witch.kind, 'witch');
  const save = R.witchSaveKey('role:strega');
  // salva la vittima dei lupi e avvelena qualcun altro
  const r1 = R.resolveNight(players, steps, { wolves: 'c', [save]: 'c', 'role:strega': 'd' }, roles());
  assert.deepEqual([...r1.deaths].map(d => `${d.playerId}:${d.cause}`), ['d:kill']);
  assert.deepEqual([...r1.saved].map(x => x.playerId), ['c']);
  assert.ok(r1.entries.some(e => e.kind === 'witch-save' && e.targetId === 'c'));
  assert.ok(r1.entries.some(e => e.kind === 'witch-kill' && e.targetId === 'd'));
  const used = [...R.computePowerUsage(players, steps, { wolves: 'c', [save]: 'c', 'role:strega': 'd' }, roles())].map(u => `${u.playerId}:${u.slot}`);
  assert.deepEqual(used, ['s:witch-save', 's:witch-kill']);
  // la pozione della vita vale solo per la vittima dei lupi
  const r2 = R.resolveNight(players, steps, { wolves: 'c', [save]: 'e' }, roles());
  assert.deepEqual([...r2.deaths].map(d => d.playerId), ['c']);
  // pozioni già usate: la notte dopo non hanno effetto
  const later = plan(players, 2, roles());
  const usedPlan = [...R.buildNightPlan(players, roles(), 2, { s: ['witch-save'] })];
  const w2 = usedPlan.find(st => st.key === 'role:strega');
  assert.equal(w2.saveUsed, true);
  assert.equal(w2.killUsed, false);
  assert.equal(w2.exhausted, false);
  const r3 = R.resolveNight(players, usedPlan, { wolves: 'c', [save]: 'c' }, roles());
  assert.deepEqual([...r3.deaths].map(d => d.playerId), ['c']);
  const allUsed = [...R.buildNightPlan(players, roles(), 2, { s: ['witch-save', 'witch-kill'] })];
  assert.equal(allUsed.find(st => st.key === 'role:strega').exhausted, true);
  assert.equal(R.resolveNight(players, allUsed, { wolves: 'c', 'role:strega': 'd' }, roles()).deaths.length, 1);
  assert.equal(later.find(st => st.key === 'role:strega').exhausted, false);
});

test('potere "una volta per partita" per i ruoli personalizzati', () => {
  const list = [...roles(), { id: 'custom_boia', name: 'Boia', icon: '🪓', faction: 'Villaggio', wakeTiming: 'ogni_notte', priority: 8, nightAction: 'kill', actionRules: { oncePerGame: true } }];
  const players = [player('a', 'lupo'), player('b', 'custom_boia'), player('c', 'contadino'), player('d', 'contadino')];
  const steps = [...R.buildNightPlan(players, list, 1, {})];
  const usage = [...R.computePowerUsage(players, steps, { 'role:custom_boia': 'a' }, list)];
  assert.deepEqual(usage.map(u => `${u.playerId}:${u.slot}`), ['b:power']);
  const next = [...R.buildNightPlan(players, list, 2, { b: ['power'] })];
  assert.equal(next.find(st => st.key === 'role:custom_boia').exhausted, true);
  assert.equal(R.resolveNight(players, next, { 'role:custom_boia': 'a' }, list).deaths.length, 0);
});

test('Gufo: annuncio del mattino con la sua frase', () => {
  const nameOf = id => ({ v: 'Vera' })[id] || id;
  const lines = R.buildMorningAnnouncement([], [{ playerId: 'v', roleId: 'gufo' }], findRole, nameOf);
  assert.match(lines[1], /Gufo ha scelto Vera/);
  const custom = { id: 'custom_c', name: 'Corvo', icon: '🐦‍⬛', markText: '«Il Corvo ha beccato {nome}!»' };
  assert.equal(R.buildMorningAnnouncement([], [{ playerId: 'v', roleId: 'custom_c' }], () => custom, nameOf)[1], '«Il Corvo ha beccato Vera!»');
});

test('vittorie: Lupo Bianco e vittorie solitarie dei ruoli personalizzati', () => {
  const w = player('w', 'lupo_bianco');
  // vivo insieme ad altri lupi: il branco non vince ancora
  assert.equal(R.evaluateVictory([player('a', 'lupo'), w, player('c', 'contadino')], findRole), null);
  // solo con l'ultimo abitante: vince lui
  const lone = R.evaluateVictory([player('a', 'lupo', { isDead: true }), w, player('c', 'contadino')], findRole);
  assert.equal(lone.type, 'solo');
  assert.match(lone.text, /LUPO BIANCO/);
  // ultimo vivo
  assert.equal(R.evaluateVictory([player('a', 'lupo', { isDead: true }), w, player('c', 'contadino', { isDead: true })], findRole).type, 'solo');
  // il Lupo Bianco al rogo: il villaggio vince se non restano lupi
  assert.equal(R.evaluateVictory([player('a', 'lupo', { isDead: true }), player('w', 'lupo_bianco', { isDead: true }), player('c', 'contadino'), player('d', 'contadino')], findRole).type, 'village');
  // ruolo personalizzato che vince se bruciato
  const martire = { id: 'custom_m', name: 'Martire', icon: '🕊️', faction: 'Solitario', victory: 'burned' };
  const find = id => (id === 'custom_m' ? martire : findRole(id));
  const res = R.evaluateVictory([player('a', 'lupo'), player('m', 'custom_m', { isDead: true, deathCause: 'rogo' }), player('c', 'contadino'), player('d', 'contadino')], find);
  assert.match(res.text, /MARTIRE/);
});

test('voto doppio anche per i ruoli personalizzati', () => {
  const capo = { id: 'custom_capo', name: 'Capo', faction: 'Villaggio', traits: { doubleVote: true } };
  const find = id => (id === 'custom_capo' ? capo : findRole(id));
  const t = R.tallyVotes([player('a', 'lupo'), player('b', 'custom_capo'), player('c', 'contadino')], { b: 'a' }, find, null);
  assert.equal(t.totals[0].votes, 2);
});

test('equilibrio del mazzo', () => {
  assert.equal(R.deckBalance({ lupo: 1, indemoniato: 1, veggente: 1, guardia: 1, contadino: 1 }, findRole).level, 'balanced');
  assert.equal(R.deckBalance({ lupo: 3, indemoniato: 1, gufo: 1, contadino: 2 }, findRole).level, 'wolves-strong');
  assert.equal(R.deckBalance({ lupo: 1, veggente: 1, guardia: 1, strega: 1, cacciatore: 1, contadino: 3 }, findRole).level, 'village-strong');
  assert.equal(R.deckBalance({ lupo: 1, veggente: 1, contadino: 3 }, findRole).level, 'village');
  const b = R.deckBalance({}, findRole);
  assert.equal(b.score, 0);
  assert.ok(b.position >= 0 && b.position <= 1);
  // ruolo base modificato: il peso viene stimato dalle sue capacità
  assert.equal(R.roleBalance({ ...findRole('veggente'), faction: 'Branco' }) < 0, true);
  assert.equal(R.roleBalance({ id: 'custom_x', faction: 'Villaggio', nightAction: 'investigate' }), 6);
});

test('ordine di chiamata della notte', () => {
  const order = [...R.getNightOrderRoles(roles())].map(r => r.id);
  assert.equal(order[0], 'massoni');
  assert.ok(!order.includes('contadino'));
  const moved = [...R.applyNightOrder(roles(), ['lupo', 'veggente'])];
  assert.equal(moved.find(r => r.id === 'lupo').priority, 1);
  assert.equal(moved.find(r => r.id === 'veggente').priority, 2);
  const players = [player('a', 'lupo'), player('v', 'veggente'), player('c', 'contadino')];
  assert.deepEqual(keys([...R.buildNightPlan(players, moved, 2)]), ['intro', 'wolves', 'role:veggente', 'dawn']);
  // i ruoli non toccati restano uguali
  assert.equal(moved.find(r => r.id === 'contadino').priority, findRole('contadino').priority);
});

test('nuovi ruoli base aggiunti a chi aveva già l\'app', () => {
  const old = R.DEFAULT_ROLES.filter(r => R.ORIGINAL_DEFAULT_ROLE_IDS.includes(r.id)).map(r => ({ ...r }));
  const first = R.addNewDefaultRoles(old, null);
  assert.deepEqual([...first.added], ['strega', 'cacciatore', 'massoni', 'gufo', 'lupo_bianco']);
  assert.equal(first.roles.length, 17);
  // una volta sola: se l'utente ne elimina uno, non torna
  const afterDelete = first.roles.filter(r => r.id !== 'gufo');
  const second = R.addNewDefaultRoles(afterDelete, first.knownIds);
  assert.equal(second.added.length, 0);
  assert.ok(!second.roles.some(r => r.id === 'gufo'));
});

test('cronologia: pozioni e chi è stato portato via dal Cacciatore', () => {
  const players = [
    player('h', 'cacciatore', { isDead: true, deathCause: 'rogo', diedOnTurn: 1, diedInPhase: 'day' }),
    player('a', 'lupo', { isDead: true, deathCause: 'altro', diedOnTurn: 1, diedInPhase: 'day', killedBy: 'h' }),
    player('s', 'strega'), player('c', 'contadino')
  ];
  const tl = R.buildTimeline(players, [{ turn: 1, entries: [
    { kind: 'witch-save', roleIds: ['strega'], targetId: 'c' },
    { kind: 'witch-kill', roleIds: ['strega'], targetId: 'a' }
  ] }], findRole);
  const all = tl.map(e => e.lines.join('\n')).join('\n');
  assert.match(all, /Strega ha salvato c con la pozione/);
  assert.match(all, /Strega ha avvelenato a/);
  assert.match(all, /Portato via da h \(🏹 Cacciatore\): a/);
});

test('condivisione: le capacità nuove viaggiano con il ruolo', () => {
  const custom = { id: 'custom_2', name: 'Corvo', icon: '🐦', faction: 'Alleato dei Lupi', whatYouDo: 'x', howYouWin: 'y', wakeTiming: 'notti_dispari', priority: 40, nightAction: 'mark', actionRules: { oncePerGame: true }, wakesWithWolves: true, deathAction: 'kill', victory: 'survive', traits: { doubleVote: true }, markText: '«Il Corvo ha beccato {nome}»' };
  const back = R.decodeRolesShare(R.encodeRolesShare([custom])).roles[0];
  assert.equal(back.wakeTiming, 'notti_dispari');
  assert.equal(back.priority, 40);
  assert.equal(back.actionRules.oncePerGame, true);
  assert.equal(back.wakesWithWolves, true);
  assert.equal(back.deathAction, 'kill');
  assert.equal(back.victory, 'survive');
  assert.equal(back.traits.doubleVote, true);
  assert.equal(back.markText, '«Il Corvo ha beccato {nome}»');
  // cambiare solo l'ordine di chiamata non rende "modificato" un ruolo base
  assert.equal(R.isRoleCustomized({ ...findRole('veggente'), priority: 1 }, R.DEFAULT_ROLES), false);
  assert.equal(R.isRoleCustomized({ ...findRole('cacciatore'), deathAction: 'none' }, R.DEFAULT_ROLES), true);
});

test('capacità spiegate in parole semplici', () => {
  assert.deepEqual([...R.roleAbilityNotes(findRole('contadino'))], []);
  assert.ok(R.roleAbilityNotes(findRole('cacciatore')).some(n => /porta con sé/.test(n)));
  const white = R.roleAbilityNotes(findRole('lupo_bianco')).join(' | ');
  assert.match(white, /anche con i Lupi/);
  assert.match(white, /solo un lupo/);
  assert.match(white, /ultimo vivo/);
  assert.ok(R.roleAbilityNotes(findRole('sindaco')).some(n => /vale doppio/.test(n)));
  for (const k of R.VALID_WAKE_TIMINGS) assert.ok(R.WAKE_TIMING_LABELS[k].short && R.WAKE_TIMING_LABELS[k].long, k);
});

// ---------- 1.6: varianti, eventi a sorpresa, voce ----------
const seq = values => { let i = 0; return () => values[i++ % values.length]; };

test('pareggio al voto secondo la regola scelta', () => {
  const players = [player('a', 'lupo'), player('s', 'sindaco'), player('c', 'contadino')];
  assert.equal(R.tieOutcome('runoff', players, findRole).kind, 'runoff');
  assert.equal(R.tieOutcome('none', players, findRole).kind, 'none');
  const d = R.tieOutcome('decider', players, findRole);
  assert.equal(d.kind, 'decider');
  assert.equal(d.deciderId, 's');
  // Sindaco morto: si torna al ballottaggio
  const noMayor = [player('a', 'lupo'), player('s', 'sindaco', { isDead: true }), player('c', 'contadino')];
  assert.equal(R.tieOutcome('decider', noMayor, findRole).kind, 'runoff');
  assert.deepEqual([...R.TIE_RULE_KEYS], ['runoff', 'none', 'decider']);
});

test('ruolo dei morti svelato e mazzo annunciato', () => {
  assert.equal(R.roleRevealLine('Dario', findRole('veggente')), '«Il ruolo di Dario era: 🔮 Veggente.»');
  const text = R.deckAnnouncement({ contadino: 3, veggente: 1, lupo: 2, giullare: 1, sparito: 1 }, findRole);
  assert.equal(text, '«In questa partita ci sono: Lupo Mannaro (2), Giullare, Veggente e Contadino (3).»');
});

test('eventi a sorpresa: estrazione', () => {
  assert.equal(R.drawSurpriseEvent(seq([0.9]), null, []), null);
  const e = R.drawSurpriseEvent(seq([0.1, 0]), null, []);
  assert.equal(e.id, R.SURPRISE_EVENTS[0].id);
  // mai lo stesso evento due volte di fila
  assert.notEqual(R.drawSurpriseEvent(seq([0.1, 0]), R.SURPRISE_EVENTS[0].id, []).id, R.SURPRISE_EVENTS[0].id);
  // eventi esclusi
  const all = R.SURPRISE_EVENTS.map(x => x.id);
  assert.equal(R.pickSurpriseEvent(seq([0.5]), all), null);
  assert.equal(R.pickSurpriseEvent(seq([0.99]), all.slice(1)).id, all[0]);
  for (const ev of R.SURPRISE_EVENTS) {
    assert.ok(ev.icon && ev.name && ev.text && ev.phrase && ['night', 'day'].includes(ev.phase), ev.id);
    if (ev.phase === 'day') assert.ok(ev.today, `${ev.id}: frase del giorno`);
    assert.equal(Object.values(R.eventEffects(ev)).filter(Boolean).length, 1, ev.id);
  }
  assert.equal(Object.values(R.eventEffects(null)).some(Boolean), false);
  assert.equal(R.findSurpriseEvent('festa').effect, 'noBurning');
});

test('Luna rossa: i lupi scelgono due vittime', () => {
  const players = [player('a', 'lupo'), player('s', 'strega'), player('c', 'contadino'), player('d', 'contadino'), player('e', 'contadino')];
  const fx = R.eventEffects(R.findSurpriseEvent('luna_rossa'));
  const steps = [...R.buildNightPlan(players, roles(), 1, {}, fx)];
  const wolves = steps.find(st => st.key === 'wolves');
  assert.equal(wolves.targets, 2);
  const ch = { wolves: 'c', [R.secondTargetKey('wolves')]: 'd' };
  assert.deepEqual([...R.wolvesTargetIds(steps, ch)], ['c', 'd']);
  const res = R.resolveNight(players, steps, ch, roles());
  assert.deepEqual([...res.deaths].map(d => d.playerId).sort(), ['c', 'd']);
  // la Strega può salvare una delle due vittime
  const saved = R.resolveNight(players, steps, { ...ch, [R.witchSaveKey('role:strega')]: 'd' }, roles());
  assert.deepEqual([...saved.deaths].map(d => d.playerId), ['c']);
  // senza evento la seconda scelta non conta
  const normal = [...R.buildNightPlan(players, roles(), 1, {})];
  assert.equal(normal.find(st => st.key === 'wolves').targets, 1);
  assert.deepEqual([...R.resolveNight(players, normal, ch, roles()).deaths].map(d => d.playerId), ['c']);
});

test('Eclissi e Nebbia', () => {
  const players = [player('a', 'lupo'), player('v', 'veggente'), player('h', 'criceto'), player('c', 'contadino')];
  const eclipse = [...R.buildNightPlan(players, roles(), 1, {}, R.eventEffects(R.findSurpriseEvent('eclissi')))];
  assert.equal(eclipse.find(st => st.key === 'wolves').noKill, true);
  assert.equal(R.resolveNight(players, eclipse, { wolves: 'c' }, roles()).deaths.length, 0);
  const fog = [...R.buildNightPlan(players, roles(), 1, {}, R.eventEffects(R.findSurpriseEvent('nebbia')))];
  assert.equal(fog.find(st => st.key === 'role:veggente').blind, true);
  // nella nebbia il Veggente non scopre (e non uccide) il Criceto
  assert.equal(R.resolveNight(players, fog, { 'role:veggente': 'h' }, roles()).deaths.length, 0);
  assert.equal(R.resolveNight(players, plan(players, 1), { 'role:veggente': 'h' }, roles()).deaths.length, 1);
});

test('cronologia: evento a sorpresa della notte', () => {
  const tl = R.buildTimeline([player('a', 'lupo'), player('c', 'contadino')], [{ turn: 2, eventId: 'luna_rossa', entries: [] }], findRole);
  assert.match(tl[0].lines[0], /🌕 Evento a sorpresa: Luna rossa/);
});

// ---------- 1.7: backup ----------
test('Strega: la pozione della vita salva solo la vittima dei lupi', () => {
  const players = [player('a', 'lupo'), player('s', 'strega'), player('c', 'contadino'), player('d', 'contadino'), player('e', 'contadino')];
  const steps = plan(players, 1);
  const save = R.witchSaveKey('role:strega');
  const res = R.resolveNight(players, steps, { wolves: 'c', [save]: 'c' }, roles());
  assert.equal(res.deaths.length, 0);
  assert.deepEqual([...res.saved].map(x => x.playerId), ['c']);
  assert.deepEqual([...R.computePowerUsage(players, steps, { wolves: 'c', [save]: 'c' }, roles())].map(u => u.slot), ['witch-save']);
  // pozione su chi non è stato attaccato: non salva nessuno e non si consuma
  const wrong = R.resolveNight(players, steps, { wolves: 'c', [save]: 'd' }, roles());
  assert.deepEqual([...wrong.deaths].map(x => x.playerId), ['c']);
  assert.equal(R.computePowerUsage(players, steps, { wolves: 'c', [save]: 'd' }, roles()).length, 0);
  // senza vittima (Eclissi) la pozione non si consuma
  const eclipse = [...R.buildNightPlan(players, roles(), 1, {}, R.eventEffects(R.findSurpriseEvent('eclissi')))];
  assert.equal(R.computePowerUsage(players, eclipse, { wolves: 'c', [save]: 'c' }, roles()).length, 0);
});

test('backup: andata e ritorno, dati ripuliti', () => {
  const state = {
    roles: R.DEFAULT_ROLES.map(r => ({ ...r })).concat([{ id: 'custom_1', name: 'Mugnaio', icon: '🌾', faction: 'Villaggio', whatYouDo: 'Macina.', howYouWin: 'Col villaggio.', wakeTiming: 'mai', priority: 10 }]),
    players: ['Anna', ' Bruno ', ''],
    settings: { ghostRule: false, tieRule: 'decider', narratorLevel: 'expert', playMode: 'auto', selectedDeck: { lupo: 2, contadino: 3, 'x y': 1 }, dayTimerSeconds: 240, segreto: 'no', voiceOn: 'sì' },
    knownPlayers: [{ name: 'Anna', count: 3, last: 5 }, { name: '' }]
  };
  const file = R.buildBackup(state, '2026-11-07T10:00:00.000Z', '1.7.0');
  const back = R.parseBackup(JSON.stringify(file));
  assert.equal(back.error, undefined);
  assert.equal(back.data.roles.length, 18);
  assert.equal(back.data.roles.find(r => r.id === 'strega').nightAction, 'witch');
  assert.equal(back.data.roles.find(r => r.id === 'custom_1').name, 'Mugnaio');
  assert.deepEqual([...back.data.players], ['Anna', 'Bruno']);
  assert.equal(back.data.settings.ghostRule, false);
  assert.equal(back.data.settings.tieRule, 'decider');
  assert.equal('playMode' in back.data.settings, false);
  assert.deepEqual({ ...back.data.settings.selectedDeck }, { lupo: 2, contadino: 3 });
  assert.equal('segreto' in back.data.settings, false);
  assert.equal('voiceOn' in back.data.settings, false);
  assert.equal(back.data.knownPlayers.length, 1);
  assert.equal(R.backupFileName(new Date(2026, 10, 7)), 'lupus-backup-2026-11-07.json');
  assert.match(R.parseBackup('ciao').error, /non è un file di backup/);
  assert.match(R.parseBackup('{"format":"altro"}').error, /non è un file di backup/);
  assert.match(R.parseBackup(JSON.stringify({ ...file, version: 99 })).error, /versione più nuova/);
  assert.match(R.parseBackup(JSON.stringify({ ...file, data: { roles: [] } })).error, /ruoli validi/);
});

// ---------- 1.8: Gufo, astensione, statistiche ----------
test('Gufo: chi sceglie parte con un voto contro al rogo', () => {
  assert.equal(R.roleMarkEffect(findRole('gufo')), 'voteAgainst');
  assert.equal(R.roleMarkEffect(findRole('fioraio')), 'none');
  assert.equal(R.roleMarkEffect({ id: 'gufo' }), 'voteAgainst');
  const bonus = R.markVoteBonus([{ playerId: 'c', roleId: 'gufo' }, { playerId: 'd', roleId: 'fioraio' }], findRole);
  assert.deepEqual({ ...bonus }, { c: 1 });
  const players = [player('a', 'lupo'), player('b', 'contadino'), player('c', 'contadino'), player('d', 'contadino')];
  const t = R.tallyVotes(players, { a: 'b' }, findRole, null, bonus);
  assert.deepEqual([...t.totals].map(r => `${r.playerId}=${r.votes}`).slice(0, 2), ['b=1', 'c=1']);
  assert.equal(t.totals.find(r => r.playerId === 'c').bonus, 1);
  assert.deepEqual([...t.leaders].sort(), ['b', 'c']);
  assert.equal(t.castCount, 1);
  // il voto in più vale solo per chi si può votare
  assert.equal(R.tallyVotes(players, {}, findRole, ['a', 'b'], bonus).maxVotes, 0);
  assert.match(R.roleAbilityNotes(findRole('gufo')).join(' '), /1 voto contro/);
  const shared = R.decodeRolesShare(R.encodeRolesShare([findRole('gufo')])).roles[0];
  assert.equal(shared.markEffect, 'voteAgainst');
  assert.equal(R.isRoleCustomized({ ...findRole('gufo'), markEffect: 'none' }, R.DEFAULT_ROLES), true);
});

test('votazione: chi si astiene ha votato, ma non dà voti', () => {
  const players = [player('a', 'lupo'), player('b', 'contadino'), player('c', 'contadino')];
  const t = R.tallyVotes(players, { a: R.VOTE_ABSTAIN, b: 'a' }, findRole, null);
  assert.equal(t.castCount, 2);
  assert.equal(t.maxVotes, 1);
  assert.deepEqual([...t.leaders], ['a']);
});

test('statistiche delle partite', () => {
  assert.equal(R.deckKey({ veggente: 1, lupo: 2, contadino: 0 }), 'lupo:2,veggente:1');
  assert.equal(R.deckKey({ lupo: 2, veggente: 1 }), R.deckKey({ veggente: 1, lupo: 2 }));
  const match = { id: 'm1', initialDeckMap: { lupo: 1, contadino: 4 }, players: [player('a', 'lupo'), player('g', 'giullare')], turn: 3 };
  const rec = R.buildMatchRecord(match, { type: 'solo', playerId: 'g' }, 1000);
  assert.equal(rec.soloRoleId, 'giullare');
  assert.equal('mode' in rec, false);
  assert.equal(rec.deckKey, 'contadino:4,lupo:1');
  let list = R.upsertMatchRecord([], rec);
  list = R.upsertMatchRecord(list, { ...rec, id: 'm2', winner: 'village', soloRoleId: '' });
  list = R.upsertMatchRecord(list, { ...rec, winner: 'wolves', soloRoleId: '' }); // stessa partita: si aggiorna
  assert.equal(list.length, 2);
  assert.equal(list[0].id, 'm1');
  assert.deepEqual({ ...R.summarizeRecords(list, null) }, { played: 2, village: 1, wolves: 1, solo: 0 });
  assert.equal(R.summarizeRecords(list, 'altro').played, 0);
  assert.equal(R.removeMatchRecord(list, 'm1').length, 1);
  assert.equal(R.upsertMatchRecord(Array.from({ length: 5 }, (_, i) => ({ ...rec, id: `x${i}` })), rec, 3).length, 3);
  // le statistiche viaggiano nel backup
  const file = R.buildBackup({ roles: R.DEFAULT_ROLES, players: [], settings: {}, knownPlayers: [], stats: [...list, { id: '', winner: 'boh' }] }, '2026-11-07T00:00:00Z', '1.8.0');
  assert.equal(R.parseBackup(JSON.stringify(file)).data.stats.length, 2);
});

test('testi vecchi del Gufo aggiornati, quelli scritti da chi gioca no', () => {
  const oldGufo = {
    ...findRole('gufo'),
    whatYouDo: 'Ogni notte indichi un giocatore: al mattino il Narratore annuncia che il Gufo l\'ha scelto e quel giocatore sarà tra i candidati al rogo. Al Veggente risulti NON lupo e non conosci i lupi.',
    markText: '«Stanotte il Gufo ha scelto {nome}: oggi sarà tra i candidati al rogo.»',
    narratorNote: 'La mia nota personale.'
  };
  const res = R.refreshOutdatedRoleTexts([oldGufo, findRole('lupo')]);
  assert.equal(res.changed, true);
  assert.match(res.roles[0].whatYouDo, /parte con un voto contro/);
  assert.match(res.roles[0].markText, /parte con un voto contro/);
  assert.equal(res.roles[0].narratorNote, 'La mia nota personale.');
  assert.equal(R.refreshOutdatedRoleTexts([findRole('gufo')]).changed, false);
});

// ---------- 1.9: Gemelli tolti, restano i Massoni ----------
test('Gemelli tolti: al loro posto i Massoni, ovunque', () => {
  assert.equal(R.isReplacedRoleId('gemelli'), true);
  assert.equal(R.replacementRoleId('gemelli'), 'massoni');
  assert.equal(R.replacementRoleId('veggente'), 'veggente');
  for (const presets of Object.values(R.PRESETS_BY_COUNT)) {
    for (const p of presets) assert.ok(!('gemelli' in p.roles), `${p.code}: niente Gemelli`);
  }
  // ruoli salvati: via i Gemelli; se mancano i Massoni si aggiungono
  const gemelli = { id: 'gemelli', name: 'Gemelli', icon: '👥', faction: 'Villaggio' };
  const noMassoni = R.removeReplacedRoles([findRole('lupo'), gemelli, findRole('veggente')]);
  assert.equal(noMassoni.changed, true);
  assert.deepEqual([...noMassoni.roles].map(r => r.id), ['lupo', 'veggente', 'massoni']);
  const withMassoni = R.removeReplacedRoles([findRole('lupo'), findRole('massoni'), gemelli]);
  assert.deepEqual([...withMassoni.roles].map(r => r.id), ['lupo', 'massoni']);
  assert.equal(R.removeReplacedRoles(roles()).changed, false);
  // mazzo, partita in corso e statistiche
  assert.deepEqual({ ...R.replaceRolesInDeck({ lupo: 2, gemelli: 2, massoni: 1, contadino: 0 }) }, { lupo: 2, massoni: 3 });
  const match = { players: [player('a', 'gemelli', { originalRoleId: 'gemelli' }), player('b', 'lupo', { originalRoleId: 'copione' })], initialDeckMap: { gemelli: 2, lupo: 1 } };
  assert.equal(R.replaceRolesInMatch(match), true);
  assert.equal(match.players[0].roleId, 'massoni');
  assert.equal(match.players[0].originalRoleId, 'massoni');
  assert.equal(match.players[1].originalRoleId, 'copione');
  assert.deepEqual({ ...match.initialDeckMap }, { massoni: 2, lupo: 1 });
  assert.equal(R.replaceRolesInMatch(match), false);
  assert.deepEqual({ ...R.parseDeckKey('gemelli:2,lupo:1,boh,x:0') }, { gemelli: 2, lupo: 1 });
  const [rec] = R.sanitizeMatchRecords([{ id: 'm1', date: 1, deckKey: 'gemelli:2,lupo:2,veggente:1', players: 5, mode: 'auto', winner: 'village', soloRoleId: '', turns: 3 }]);
  assert.equal(rec.deckKey, 'lupo:2,massoni:2,veggente:1');
  assert.equal('mode' in rec, false);
  // un vecchio codice con i Gemelli importato: diventa un ruolo proprio (non sparisce al riavvio)
  const merged = R.mergeImportedRoles([findRole('lupo')], [gemelli], () => 'custom_1');
  assert.deepEqual([...merged.roles].map(r => r.id), ['lupo', 'custom_1']);
});
