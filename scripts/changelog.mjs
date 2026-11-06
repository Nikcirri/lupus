// Legge CHANGELOG.md e restituisce le ultime versioni per la finestra "Novità" dell'app.
// Usato da vite.config.js (durante la build) e dai test.

/** Toglie la formattazione Markdown che nell'app non serve (grassetti, codice). */
function plain(text) {
  return text.replace(/\*\*(.+?)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1').trim();
}

/**
 * @returns {{ version: string, date: string, intro: string, items: string[] }[]}
 */
export function parseChangelog(markdown, max = 6) {
  const sections = String(markdown).split(/^## \[/m).slice(1);
  return sections.slice(0, max).map(section => {
    const [head, ...lines] = section.split('\n');
    const m = /^([^\]]+)\]\s*-\s*(.+)$/.exec(head.trim());
    const items = [];
    const intro = [];
    lines.forEach(line => {
      const t = line.trim();
      if (!t) return;
      if (t.startsWith('- ')) items.push(plain(t.slice(2)));
      else if (!items.length) intro.push(plain(t));
    });
    return { version: m ? m[1].trim() : '', date: m ? m[2].trim() : '', intro: intro.join(' '), items };
  }).filter(v => v.version);
}
