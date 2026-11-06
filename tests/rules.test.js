// Test delle regole del gioco (public/rules.js). Si lanciano con: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const code = readFileSync(new URL('../public/rules.js', import.meta.url), 'utf8');
const ctx = vm.createContext({});
vm.runInContext(
  code +
    '\nglobalThis.R = { DEFAULT_ROLES, PRESETS_BY_COUNT, countDeck, getDeckProblems, computeNightOutcome, findBurnedOnDay, evaluateVictory, parseVersion, isNewerVersion, parseRelease, shouldAutoCheck };',
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

test('riepilogo della notte: scudo, criceto immune, criceto sondato', () => {
  const players = [
    player('a', 'contadino', { wolfTarget: true }),
    player('b', 'veggente', { wolfTarget: true, shieldTonight: true }),
    player('c', 'criceto', { wolfTarget: true }),
    player('d', 'criceto', { seerProbed: true }),
    player('e', 'contadino', { wolfTarget: true, isDead: true })
  ];
  const out = [...R.computeNightOutcome(players, findRole)].map(i => `${i.playerId}:${i.outcome}:${i.cause}`);
  assert.deepEqual(out, ['a:muore:lupi', 'b:salvo:lupi', 'c:immune:lupi', 'd:muore:veggente', 'e:giaMorto:lupi']);
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
