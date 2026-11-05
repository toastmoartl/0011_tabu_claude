'use strict';
/*
 * Schutz vor „zu viel veröffentlicht“: Es darf genau einen Pages-Deploy geben (pages.yml), und der darf nur _site
 * hochladen. Die GitHub-Vorlage „static.yml“ lädt das GANZE Repo hoch – laufen beide, ist bei jedem Merge für
 * einige Minuten alles öffentlich (Tests, Konfiguration, nicht veröffentlichte Spiele).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { checkWorkflows, readWorkflows, uploadPaths, stripComments, WORKFLOW_DIR } = require('../../../scripts/check-workflows.js');

// Original-Text der GitHub-Vorlage (so lag sie als static.yml im Repo)
const STATIC_TEMPLATE = `# Simple workflow for deploying static content to GitHub Pages
name: Deploy static content to Pages

on:
  push:
    branches: ["main"]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: false

jobs:
  # Single deploy job since we're just deploying
  deploy:
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Setup Pages
        uses: actions/configure-pages@v5
      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          # Upload entire repository
          path: '.'
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v5
`;

const GOOD_PAGES = `name: GitHub Pages
on:
  push:
    branches: [main]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: npm test
  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/upload-pages-artifact@v3
        with:
          path: _site
      - id: deployment
        uses: actions/deploy-pages@v4
`;

const real = () => readWorkflows(WORKFLOW_DIR);

test.describe('Workflows im Repo', () => {
  test('keine Probleme: genau ein Pages-Deploy, nur _site, Deploy wartet auf die Tests', () => {
    assert.deepEqual(checkWorkflows(real()), []);
  });

  test('pages.yml ist der einzige Workflow, der nach Pages deployt', () => {
    const deployers = Object.entries(real()).filter(([, text]) => /deploy-pages/.test(stripComments(text))).map(([name]) => name);
    assert.deepEqual(deployers, ['pages.yml']);
  });

  test('pages.yml lädt genau einmal _site hoch', () => {
    assert.deepEqual(uploadPaths(real()['pages.yml']), ['_site']);
  });

  test('static.yml (GitHub-Vorlage, ganzes Repo) liegt nicht mehr im Repo', () => {
    assert.ok(!fs.existsSync(path.join(WORKFLOW_DIR, 'static.yml')));
    assert.ok(!fs.existsSync(path.join(WORKFLOW_DIR, 'static.yaml')));
  });

  test('der Test-Workflow läuft auch, wenn irgendeine Workflow-Datei geändert wird (sonst bliebe ein neuer Deploy ungeprüft)', () => {
    const text = real()['schafkopf.yml'];
    assert.equal((text.match(/'\.github\/workflows\/\*\*'/g) || []).length, 2, 'bei push und bei pull_request');
  });
});

test.describe('Die Prüfung findet den Fehler (erfundene Fälle)', () => {
  test('die echte GitHub-Vorlage static.yml wird erkannt – mit allen drei Gründen', () => {
    const problems = checkWorkflows({ 'pages.yml': GOOD_PAGES, 'static.yml': STATIC_TEMPLATE });
    assert.equal(problems.length, 3, problems.join(' | '));
    assert.ok(problems.some((p) => /Mehrere Workflows deployen/.test(p) && /static\.yml/.test(p)));
    assert.ok(problems.some((p) => /static\.yml deployt nach Pages/.test(p)));
    assert.ok(problems.some((p) => /GANZE Repo/.test(p) && /static\.yml/.test(p)));
  });

  test('die Vorlage allein (ohne pages.yml) wird auch erkannt', () => {
    const problems = checkWorkflows({ 'static.yml': STATIC_TEMPLATE });
    assert.ok(problems.some((p) => /GANZE Repo/.test(p)));
  });

  test('ein einwandfreier Aufbau besteht', () => {
    assert.deepEqual(checkWorkflows({ 'pages.yml': GOOD_PAGES, 'schafkopf.yml': 'name: Tests\non: push\njobs:\n  test:\n    steps:\n      - run: npm test\n' }), []);
  });

  test('alle Schreibweisen für „ganzes Repo“ werden erkannt', () => {
    for (const value of ['.', './', "'.'", '"./"', '/', '${{ github.workspace }}', '$GITHUB_WORKSPACE', '']) {
      const text = GOOD_PAGES.replace('path: _site', `path: ${value}`);
      const problems = checkWorkflows({ 'pages.yml': text });
      assert.ok(problems.some((p) => /GANZE Repo/.test(p)), `path: ${value} wurde nicht erkannt: ${problems.join(' | ')}`);
    }
  });

  test('andere Ordner als _site sind nicht erlaubt (z. B. das ganze schafkopf/ mit Tests)', () => {
    for (const value of ['schafkopf', 'schafkopf/', 'dist', '_site/schafkopf']) {
      const problems = checkWorkflows({ 'pages.yml': GOOD_PAGES.replace('path: _site', `path: ${value}`) });
      assert.ok(problems.some((p) => /erlaubt ist nur _site/.test(p)), `path: ${value}: ${problems.join(' | ')}`);
    }
  });

  test('_site mit abschließendem Schrägstrich ist in Ordnung (das ist der Standard der Action)', () => {
    assert.deepEqual(checkWorkflows({ 'pages.yml': GOOD_PAGES.replace('path: _site', 'path: _site/') }), []);
    const withoutPath = GOOD_PAGES.replace('        with:\n          path: _site\n', '');
    assert.ok(!withoutPath.includes('path:'), 'Testvorbereitung: die Pfad-Angabe wurde wirklich entfernt');
    assert.deepEqual(uploadPaths(withoutPath), ['_site/'], 'ohne Angabe gilt der Standard');
  });

  test('ein zweiter Deploy mit anderem Werkzeug wird ebenfalls erkannt', () => {
    for (const uses of ['peaceiris/actions-gh-pages@v4', 'JamesIves/github-pages-deploy-action@v4']) {
      const other = `name: x\njobs:\n  d:\n    steps:\n      - uses: ${uses}\n`;
      const problems = checkWorkflows({ 'pages.yml': GOOD_PAGES, 'other.yml': other });
      assert.ok(problems.some((p) => /Mehrere Workflows deployen/.test(p)), uses);
    }
  });

  test('der Deploy muss auf die Tests warten', () => {
    const problems = checkWorkflows({ 'pages.yml': GOOD_PAGES.replace('    needs: test\n', '') });
    assert.ok(problems.some((p) => /needs: test/.test(p)));
  });

  test('ohne irgendeinen Pages-Deploy wird gemeldet, dass keiner existiert', () => {
    assert.ok(checkWorkflows({ 'schafkopf.yml': 'name: t\n' }).some((p) => /Kein Workflow deployt/.test(p)));
  });

  test('Kommentare täuschen nicht: auskommentierte Zeilen zählen nicht, echte Zeilen mit Endkommentar schon', () => {
    const commented = GOOD_PAGES.replace('path: _site', "# path: '.'\n          path: _site");
    assert.deepEqual(checkWorkflows({ 'pages.yml': commented }), []);
    const trailing = GOOD_PAGES.replace('path: _site', "path: '.'   # ganzes Repo");
    assert.ok(checkWorkflows({ 'pages.yml': trailing }).some((p) => /GANZE Repo/.test(p)));
    const commentedDeploy = `${GOOD_PAGES}\n# - uses: actions/deploy-pages@v4\n`;
    assert.deepEqual(checkWorkflows({ 'pages.yml': commentedDeploy }), []);
  });

  test('zwei Upload-Schritte in einer Datei: jeder wird geprüft', () => {
    const two = GOOD_PAGES.replace('      - id: deployment', "      - uses: actions/upload-pages-artifact@v3\n        with:\n          path: .\n      - id: deployment");
    assert.deepEqual(uploadPaths(two), ['_site', '.']);
    assert.ok(checkWorkflows({ 'pages.yml': two }).some((p) => /GANZE Repo/.test(p)));
  });

  test('readWorkflows liest .yml und .yaml, ignoriert andere Dateien', () => {
    const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'wf-'));
    try {
      fs.writeFileSync(path.join(dir, 'a.yml'), 'name: a\n');
      fs.writeFileSync(path.join(dir, 'b.yaml'), 'name: b\n');
      fs.writeFileSync(path.join(dir, 'README.md'), 'x');
      assert.deepEqual(Object.keys(readWorkflows(dir)).sort(), ['a.yml', 'b.yaml']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

test.describe('Aufruf als Skript', () => {
  test('Exit-Code 0 und Meldung, wenn alles in Ordnung ist', () => {
    const { spawnSync } = require('node:child_process');
    const r = spawnSync(process.execPath, [path.resolve(__dirname, '../../../scripts/check-workflows.js')], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Workflows in Ordnung/);
  });
});
