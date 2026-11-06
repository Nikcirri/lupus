// Test delle regole del gioco (public/rules.js). Si lanciano con: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const code = readFileSync(new URL('../public/rules.js', import.meta.url), 'utf8');
const ctx = vm.createContext({ TextEncoder, TextDecoder, btoa, atob });
vm.runInContext(
  code +
    '\nglobalThis.R = { DEFAULT_ROLES, PRESETS_BY_COUNT, countDeck, getDeckProblems, findBurnedOnDay, evaluateVictory, parseVersion, isNewerVersion, parseRelease, shouldAutoCheck, getVoters, voteWeight, tallyVotes, buildTimeline, encodeRolesShare, decodeRolesShare, sanitizeImportedRole, isRoleCustomized, mergeImportedRoles, NIGHT_ACTIONS, roleNightAction, roleActionRules, wakesOnNight, buildNightPlan, getTargetOptions, investigateAnswer, copyResultRoleId, resolveNight, buildMorningAnnouncement, rolePhrase, PLAYER_COLORS, assignPlayerColors, playerInitial, rememberPlayerNames, suggestPlayerNames };',
  ctx
);
const R = ctx.R;
const findRole = id => R.DEFAULT_ROLES.find(r => r.id === id) || null;

function player(id, roleId, extra = {}) {
  return { id, name: id, roleId, originalRoleId: roleId, isDead: false, isGhost: false, ...extra };
}

test('i 13 ruoli base hanno id unici e tutti i campi', () => {
  assert.equal(R.DEFAULT_ROLES.length, 13);
  const ids = new Set(R.DEFAULT_ROLES.map(r => r.id));
  assert.equal(ids.size, 13);
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
    }
  }
});

test('controllo del mazzo: spiega cosa non va', () => {
  assert.match(R.getDeckProblems({}, 3, findRole)[0], /almeno 5 giocatori/);
  assert.match(R.getDeckProblems({ lupo: 1, contadino: 3 }, 5, findRole)[0], /Manca 1 ruolo|Mancano 1/);
  assert.match(R.getDeckProblems({ lupo: 1, contadino: 6 }, 5, findRole)[0], /di troppo/);
  assert.ok(R.getDeckProblems({ lupo: 1, gemelli: 1, contadino: 3 }, 5, findRole).some(t => /coppie/.test(t)));
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
  const clean = R.sanitizeImportedRole({ name: ' X ', whatYouDo: 'a', howYouWin: 'b', faction: 'Alieni', wakeTiming: 'sempre', priority: 99 });
  assert.equal(clean.name, 'X');
  assert.equal(clean.faction, 'Villaggio');
  assert.equal(clean.wakeTiming, 'mai');
  assert.equal(clean.priority, 10);
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
    player('e', 'gemelli'), player('f', 'gemelli'), player('g', 'medium'), player('h', 'copione'), player('i', 'contadino')
  ];
  assert.deepEqual(keys(plan(players, 1)), ['intro', 'role:gemelli', 'role:veggente', 'role:guardia', 'wolves', 'dawn']);
  assert.deepEqual(keys(plan(players, 2)), ['intro', 'role:veggente', 'role:medium', 'role:guardia', 'wolves', 'role:copione', 'dawn']);
  assert.deepEqual(keys(plan(players, 3)), ['intro', 'role:veggente', 'role:medium', 'role:guardia', 'wolves', 'dawn']);
  const wolves = plan(players, 1).find(st => st.key === 'wolves');
  assert.deepEqual(wolves.holders.map(p => p.id), ['a', 'b']);
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
  assert.deepEqual(steps[1].holders.map(p => p.id), ['a', 'x']);
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
  assert.equal(R.investigateAnswer(player('a', 'criceto'), find).hamster, true);
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
