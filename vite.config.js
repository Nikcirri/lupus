import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { parseChangelog } from './scripts/changelog.mjs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const changelog = parseChangelog(readFileSync(new URL('./CHANGELOG.md', import.meta.url), 'utf8'), 6);

export default defineConfig({
  // Percorsi relativi: l'app funziona dentro Android senza server e senza internet.
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    // Novità delle ultime versioni, mostrate nell'app dopo un aggiornamento
    __APP_CHANGELOG__: JSON.stringify(changelog),
  },
  build: {
    outDir: 'dist',
    target: 'es2020',
    emptyOutDir: true,
  },
});
