#!/usr/bin/env node
'use strict';
/*
 * Baut die Mappe für GitHub Pages:
 *
 *   <out>/index.html          Startseite mit Link zum Spiel
 *   <out>/schafkopf/          Schafkopf-Trainer (nur index.html, js/, assets/ – keine Tests)
 *   <out>/.nojekyll           Pages soll die Dateien unverändert ausliefern
 *
 * Veröffentlicht wird ausschließlich diese Auswahl (Whitelist). Das Tabu-Spiel im
 * Repo-Wurzelordner gehört bewusst nicht dazu.
 *
 * Aufruf: node scripts/build-site.js [ausgabeordner]   (Standard: _site)
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const GAME_FILES = ['index.html', 'js', 'assets'];

function copyRecursive(from, to) {
  fs.cpSync(from, to, { recursive: true, filter: (src) => !path.basename(src).startsWith('.') });
}

function buildSite(outArg) {
  const out = path.resolve(outArg || path.join(ROOT, '_site'));
  if (out === ROOT || ROOT.startsWith(out + path.sep)) throw new Error('Ausgabeordner darf nicht das Repo selbst sein: ' + out);

  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(path.join(out, 'schafkopf'), { recursive: true });

  fs.copyFileSync(path.join(ROOT, 'site', 'index.html'), path.join(out, 'index.html'));
  for (const f of GAME_FILES) copyRecursive(path.join(ROOT, 'schafkopf', f), path.join(out, 'schafkopf', f));
  fs.writeFileSync(path.join(out, '.nojekyll'), '');

  return out;
}

if (require.main === module) {
  const out = buildSite(process.argv[2]);
  console.log('Fertig: ' + out);
}

module.exports = { buildSite };
