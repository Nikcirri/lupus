import { defineConfig, minifySync } from 'vite';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseChangelog } from './scripts/changelog.mjs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const changelog = parseChangelog(readFileSync(new URL('./CHANGELOG.md', import.meta.url), 'utf8'), 6);

// Script classici dell'app (in public/): Vite li copia così come sono, qui vengono compressi.
const CLASSIC_SCRIPTS = ['game.js', 'rules.js', 'sounds.js'];

/**
 * App più leggera: comprime gli script classici (i nomi globali restano uguali, servono agli onclick)
 * e toglie i commenti dalla pagina.
 */
function lupusCompact() {
  let outDir = 'dist';
  return {
    name: 'lupus-compact',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        return html.replace(/<!--(?!\[if)[\s\S]*?-->\s*/g, '');
      }
    },
    closeBundle() {
      for (const name of CLASSIC_SCRIPTS) {
        const file = resolve(outDir, name);
        if (!existsSync(file)) continue;
        const result = minifySync(name, readFileSync(file, 'utf8'), {
          compress: { target: 'es2020' },
          mangle: { toplevel: false },
          codegen: { removeWhitespace: true },
          module: false
        });
        if (result.errors && result.errors.length) {
          throw new Error(`Compressione di ${name} non riuscita: ${result.errors.map(e => e.message).join('; ')}`);
        }
        writeFileSync(file, result.code);
      }
    }
  };
}

export default defineConfig({
  // Percorsi relativi: l'app funziona dentro Android senza server e senza internet.
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    // Novità delle ultime versioni, mostrate nell'app dopo un aggiornamento
    __APP_CHANGELOG__: JSON.stringify(changelog),
  },
  plugins: [lupusCompact()],
  build: {
    outDir: 'dist',
    target: 'es2020',
    emptyOutDir: true,
  },
});
