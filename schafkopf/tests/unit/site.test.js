'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const L = require('../../js/logic.js');
const C = require('../../js/cards.js');
const { buildSite } = require('../../../scripts/build-site.js');

const REPO = path.resolve(__dirname, '../../..');

function walk(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p, base) : [path.relative(base, p).split(path.sep).join('/')];
  });
}

test.describe('Auslieferungs-Mappe für GitHub Pages', () => {
  let out;
  test.before(() => {
    out = fs.mkdtempSync(path.join(os.tmpdir(), 'site-'));
    buildSite(path.join(out, '_site'));
    out = path.join(out, '_site');
  });
  test.after(() => fs.rmSync(path.dirname(out), { recursive: true, force: true }));

  test('enthält Startseite, beide Spiele, ZIP und .nojekyll', () => {
    for (const f of ['index.html', 'tabu/index.html', 'schafkopf/index.html', 'schafkopf.zip', '.nojekyll']) {
      assert.ok(fs.existsSync(path.join(out, f)), f);
    }
  });

  test('Spiele sind unverändert kopiert', () => {
    const same = (a, b) => assert.ok(fs.readFileSync(a).equals(fs.readFileSync(b)), b);
    same(path.join(REPO, 'index.html'), path.join(out, 'tabu/index.html'));
    same(path.join(REPO, 'schafkopf/index.html'), path.join(out, 'schafkopf/index.html'));
    same(path.join(REPO, 'schafkopf/js/logic.js'), path.join(out, 'schafkopf/js/logic.js'));
    same(path.join(REPO, 'schafkopf/js/cards.js'), path.join(out, 'schafkopf/js/cards.js'));
    same(path.join(REPO, 'schafkopf/js/app.js'), path.join(out, 'schafkopf/js/app.js'));
  });

  test('Schafkopf-Ordner enthält nur das Spiel – keine Tests, Abhängigkeiten oder Konfiguration', () => {
    const files = walk(path.join(out, 'schafkopf')).sort();
    const expected = ['index.html', 'js/app.js', 'js/cards.js', 'js/logic.js']
      .concat(L.createDeck().map((c) => 'assets/cards/' + C.cardFile(c))).sort();
    assert.deepEqual(files, expected);
  });

  test('alle relativen Verweise in den Seiten führen zu vorhandenen Dateien', () => {
    const pages = ['index.html', 'tabu/index.html', 'schafkopf/index.html'];
    for (const page of pages) {
      const html = fs.readFileSync(path.join(out, page), 'utf8');
      const refs = [...html.matchAll(/\s(?:href|src)="([^"#]+)"/g)].map((m) => m[1])
        .filter((r) => !/^(?:[a-z]+:|\/\/|data:)/i.test(r));
      for (const ref of refs) {
        const target = path.join(out, path.dirname(page), ref);
        const resolved = fs.existsSync(target) && fs.statSync(target).isDirectory() ? path.join(target, 'index.html') : target;
        assert.ok(fs.existsSync(resolved), `${page}: ${ref} nicht gefunden`);
      }
    }
  });

  test('Startseite verlinkt beide Spiele und den Download', () => {
    const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
    for (const href of ['schafkopf/', 'tabu/', 'schafkopf.zip']) assert.ok(html.includes(`href="${href}"`), href);
  });

  test('Verweise sind relativ (funktioniert unter /<repo-name>/ auf Pages)', () => {
    for (const page of ['index.html', 'tabu/index.html', 'schafkopf/index.html']) {
      const html = fs.readFileSync(path.join(out, page), 'utf8');
      assert.ok(!/(?:href|src)="\/(?!\/)/.test(html), `${page}: absoluter Pfad mit /`);
    }
  });

  test('ZIP enthält genau die Spieldateien, index.html liegt oben, und ist unverändert lesbar', () => {
    const zip = path.join(out, 'schafkopf.zip');
    execFileSync('unzip', ['-tq', zip]);
    const listed = execFileSync('unzip', ['-Z1', zip]).toString().split('\n').filter((l) => l && !l.endsWith('/')).sort();
    assert.deepEqual(listed, walk(path.join(out, 'schafkopf')).sort());
    assert.ok(listed.includes('index.html'));
  });

  test('entpacktes ZIP funktioniert wirklich im Browser (Spiel startet, Karten laden)', async () => {
    const { chromium } = require('playwright');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unz-'));
    try {
      execFileSync('unzip', ['-q', path.join(out, 'schafkopf.zip'), '-d', dir]);
      const browser = await chromium.launch();
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto('file://' + path.join(dir, 'index.html') + '?seed=3');
      await page.waitForSelector('body.ready');
      await page.click('#start-btn');
      await page.waitForSelector('#hand .card.up');
      const loaded = await page.$$eval('#hand .front img', (imgs) => imgs.map((i) => i.complete && i.naturalWidth === 600));
      await browser.close();
      assert.deepEqual(loaded, [true, true, true, true]);
      assert.deepEqual(errors, []);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('Ausgabeordner darf nicht das Repo selbst sein', () => {
    assert.throws(() => buildSite(REPO), /nicht das Repo/);
  });
});
