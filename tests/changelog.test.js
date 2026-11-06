// Test della lettura di CHANGELOG.md per la finestra "Novità".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseChangelog } from '../scripts/changelog.mjs';

test('legge versioni, date e punti del changelog', () => {
  const md = '# Novità\n\n## [1.1.0] - 2026-11-07\n\nIntro della versione.\n\n- **Primo** punto\n- Secondo `codice`\n\n## [1.0.0] - 2026-11-06\n\n- Vecchio\n';
  const out = parseChangelog(md);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], { version: '1.1.0', date: '2026-11-07', intro: 'Intro della versione.', items: ['Primo punto', 'Secondo codice'] });
  assert.equal(parseChangelog(md, 1).length, 1);
});

test('il CHANGELOG.md vero ha la versione di package.json in cima', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const out = parseChangelog(readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8'));
  assert.equal(out[0].version, pkg.version);
  assert.ok(out[0].items.length > 0);
});
