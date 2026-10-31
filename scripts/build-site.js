#!/usr/bin/env node
'use strict';
/*
 * Baut die Mappe für GitHub Pages:
 *
 *   <out>/index.html          Startseite mit Links
 *   <out>/tabu/index.html     Tabu-Spiel (liegt im Repo im Wurzelordner)
 *   <out>/schafkopf/          Schafkopf-Trainer (nur index.html, js/, assets/ – keine Tests)
 *   <out>/schafkopf.zip       dasselbe als ZIP zum Herunterladen
 *   <out>/.nojekyll           Pages soll die Dateien unverändert ausliefern
 *
 * Aufruf: node scripts/build-site.js [ausgabeordner]   (Standard: _site)
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const GAME_FILES = ['index.html', 'js', 'assets'];

function copyRecursive(from, to) {
  fs.cpSync(from, to, { recursive: true, filter: (src) => !path.basename(src).startsWith('.') });
}

function buildSite(outArg) {
  const out = path.resolve(outArg || path.join(ROOT, '_site'));
  if (out === ROOT || ROOT.startsWith(out + path.sep)) throw new Error('Ausgabeordner darf nicht das Repo selbst sein: ' + out);

  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(path.join(out, 'tabu'), { recursive: true });
  fs.mkdirSync(path.join(out, 'schafkopf'), { recursive: true });

  fs.copyFileSync(path.join(ROOT, 'site', 'index.html'), path.join(out, 'index.html'));
  fs.copyFileSync(path.join(ROOT, 'index.html'), path.join(out, 'tabu', 'index.html'));
  for (const f of GAME_FILES) copyRecursive(path.join(ROOT, 'schafkopf', f), path.join(out, 'schafkopf', f));
  fs.writeFileSync(path.join(out, '.nojekyll'), '');

  // ZIP zum Herunterladen: entpackt direkt in einen Ordner mit index.html
  const zipPath = path.join(out, 'schafkopf.zip');
  execFileSync('zip', ['-q', '-r', '-X', zipPath, '.'], { cwd: path.join(out, 'schafkopf') });
  return out;
}

if (require.main === module) {
  const out = buildSite(process.argv[2]);
  console.log('Fertig: ' + out);
}

module.exports = { buildSite };
