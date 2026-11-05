#!/usr/bin/env node
'use strict';
/*
 * Schutz vor „zu viel veröffentlicht“: prüft die GitHub-Workflows (.github/workflows).
 *
 * Hintergrund: Die GitHub-Vorlage „Static HTML“ (static.yml) lädt mit `path: '.'` das GANZE Repo nach Pages hoch
 * – Tests, Konfiguration, nicht veröffentlichte Spiele. Laufen zwei Pages-Deploys parallel, ist für einige Minuten
 * das ganze Repo öffentlich, bis der kuratierte Deploy (pages.yml, nur _site) fertig ist.
 *
 * Regeln:
 *   1. Genau ein Workflow deployt nach Pages, und zwar pages.yml.
 *   2. Er lädt ausschließlich _site hoch – nie das ganze Repo (. / ./ / Workspace).
 *   3. Der Deploy wartet auf die Tests (needs: test).
 *
 * Aufruf: node scripts/check-workflows.js     (Ausgabe: gefundene Probleme, Exit-Code 1 bei Problemen)
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const WORKFLOW_DIR = path.join(ROOT, '.github', 'workflows');
const EXPECTED_DEPLOYER = 'pages.yml';
const EXPECTED_UPLOAD_PATH = '_site';

// alles, was nach GitHub Pages veröffentlicht
const DEPLOYERS = /actions\/deploy-pages|peaceiris\/actions-gh-pages|JamesIves\/github-pages-deploy-action/;
// Pfade, die das ganze Repo bedeuten
const WHOLE_REPO = new Set(['', '.', './', '/', '$GITHUB_WORKSPACE', '${{ github.workspace }}']);

/** Kommentare entfernen (ganze Zeilen und Zeilenenden nach Leerzeichen). */
function stripComments(text) {
  return text.split('\n').map((line) => line.replace(/(^|\s)#.*$/, '$1')).join('\n');
}

function unquote(value) {
  return value.trim().replace(/^(['"])(.*)\1$/, '$2');
}

/** Alle `path:`-Werte der Schritte, die `upload-pages-artifact` verwenden (ohne Angabe gilt der Standard „_site/“). */
function uploadPaths(text) {
  const lines = stripComments(text).split('\n');
  const found = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/upload-pages-artifact/.test(lines[i])) continue;
    let value = null;
    for (let j = i + 1; j < lines.length && !/^\s*-\s/.test(lines[j]); j++) {
      const m = lines[j].match(/^\s*path:\s*(.*)$/);
      if (m) { value = unquote(m[1]); break; }
    }
    found.push(value === null ? '_site/' : value);
  }
  return found;
}

const normalize = (p) => (WHOLE_REPO.has(p) ? p : p.replace(/\/+$/, ''));

/** @param {Record<string,string>} files  Dateiname → Inhalt */
function checkWorkflows(files) {
  const problems = [];
  const deployers = Object.keys(files).filter((name) => DEPLOYERS.test(stripComments(files[name])));

  if (deployers.length === 0) problems.push('Kein Workflow deployt nach Pages.');
  if (deployers.length > 1) {
    problems.push(`Mehrere Workflows deployen nach Pages (${deployers.join(', ')}): sie überschreiben sich, und ein unkuratierter Deploy ist zwischendurch öffentlich.`);
  }
  for (const name of deployers) {
    if (name !== EXPECTED_DEPLOYER) problems.push(`${name} deployt nach Pages – das soll ausschließlich ${EXPECTED_DEPLOYER} tun.`);
  }

  for (const name of Object.keys(files)) {
    for (const p of uploadPaths(files[name])) {
      const n = normalize(p);
      if (WHOLE_REPO.has(n)) problems.push(`${name} lädt das GANZE Repo nach Pages hoch (path: ${p || '(leer)'}).`);
      else if (n !== EXPECTED_UPLOAD_PATH) problems.push(`${name} lädt „${p}“ hoch; erlaubt ist nur ${EXPECTED_UPLOAD_PATH}.`);
    }
  }

  const pages = files[EXPECTED_DEPLOYER];
  if (pages !== undefined && !/needs:\s*test\b/.test(stripComments(pages))) {
    problems.push(`${EXPECTED_DEPLOYER}: Der Deploy muss auf die Tests warten (needs: test).`);
  }
  return problems;
}

function readWorkflows(dir) {
  const files = {};
  for (const name of fs.readdirSync(dir)) {
    if (/\.ya?ml$/.test(name)) files[name] = fs.readFileSync(path.join(dir, name), 'utf8');
  }
  return files;
}

if (require.main === module) {
  const problems = checkWorkflows(readWorkflows(WORKFLOW_DIR));
  if (problems.length) {
    console.error('Probleme in den Workflows:\n- ' + problems.join('\n- '));
    process.exit(1);
  }
  console.log('Workflows in Ordnung: genau ein Pages-Deploy (' + EXPECTED_DEPLOYER + '), lädt nur ' + EXPECTED_UPLOAD_PATH + ' hoch.');
}

module.exports = { checkWorkflows, readWorkflows, uploadPaths, stripComments, WORKFLOW_DIR };
