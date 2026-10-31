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
const FONT_FILES = ['LICENSE-Kalam.txt', 'LICENSE-UnifrakturMaguntia.txt', 'kalam-latin-400-normal.woff2', 'kalam-latin-700-normal.woff2', 'unifrakturmaguntia-latin-400-normal.woff2'];

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

  test('enthält Startseite, Schafkopf-Trainer, ZIP und .nojekyll', () => {
    for (const f of ['index.html', 'schafkopf/index.html', 'schafkopf.zip', '.nojekyll']) {
      assert.ok(fs.existsSync(path.join(out, f)), f);
    }
  });

  test('Spiele sind unverändert kopiert', () => {
    const same = (a, b) => assert.ok(fs.readFileSync(a).equals(fs.readFileSync(b)), b);
    same(path.join(REPO, 'schafkopf/index.html'), path.join(out, 'schafkopf/index.html'));
    same(path.join(REPO, 'schafkopf/js/logic.js'), path.join(out, 'schafkopf/js/logic.js'));
    same(path.join(REPO, 'schafkopf/js/cards.js'), path.join(out, 'schafkopf/js/cards.js'));
    same(path.join(REPO, 'schafkopf/js/app.js'), path.join(out, 'schafkopf/js/app.js'));
  });

  test('Schafkopf-Ordner enthält nur das Spiel – keine Tests, Abhängigkeiten oder Konfiguration', () => {
    const files = walk(path.join(out, 'schafkopf')).sort();
    const expected = ['index.html', 'js/app.js', 'js/cards.js', 'js/logic.js', ...FONT_FILES.map((f) => 'assets/fonts/' + f)]
      .concat(L.createDeck().map((c) => 'assets/cards/' + C.cardFile(c))).sort();
    assert.deepEqual(files, expected);
  });

  test('alle relativen Verweise in den Seiten führen zu vorhandenen Dateien', () => {
    const pages = ['index.html', 'schafkopf/index.html'];
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

  test('Startseite verlinkt den Schafkopf-Trainer und den Download', () => {
    const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
    for (const href of ['schafkopf/', 'schafkopf.zip']) assert.ok(html.includes(`href="${href}"`), href);
  });

  test('Verweise sind relativ (funktioniert unter /<repo-name>/ auf Pages)', () => {
    for (const page of ['index.html', 'schafkopf/index.html']) {
      const html = fs.readFileSync(path.join(out, page), 'utf8');
      assert.ok(!/(?:href|src)="\/(?!\/)/.test(html), `${page}: absoluter Pfad mit /`);
    }
  });

  test('Tabu wird nicht veröffentlicht (weder Ordner noch Inhalt noch Verweis)', () => {
    assert.ok(!fs.existsSync(path.join(out, 'tabu')));
    const all = walk(out);
    assert.ok(all.every((f) => !/tabu/i.test(f)), 'Dateiname mit „tabu“');
    for (const f of all.filter((f) => /\.(html|js|svg|txt|md)$/.test(f))) {
      assert.ok(!/tabu/i.test(fs.readFileSync(path.join(out, f), 'utf8')), `${f} erwähnt Tabu`);
    }
    const zipNames = execFileSync('unzip', ['-Z1', path.join(out, 'schafkopf.zip')]).toString();
    assert.ok(!/tabu/i.test(zipNames));
  });

  test('Datenschutz: keine externen Adressen in Seiten, Skripten oder Grafiken', () => {
    const text = walk(out).filter((f) => /\.(html|js|svg|css)$/.test(f));
    assert.equal(text.length, 2 + 3 + 24, 'geprüft werden 2 Seiten, 3 Skripte und 24 Karten');
    for (const f of text) {
      const src = fs.readFileSync(path.join(out, f), 'utf8');
      const urls = [...src.matchAll(/(?:https?:)?\/\/[\w.-]+\.[a-z]{2,}[^\s"')<>]*/gi)].map((m) => m[0])
        .filter((u) => !/^http:\/\/www\.w3\.org\/2000\/svg$/.test(u));
      assert.deepEqual(urls, [], `${f}: externe Adresse(n)`);
      assert.ok(!/@import|googleapis|gstatic|cdn\./i.test(src), `${f}: Verweis auf Schriften-/CDN-Dienst`);
    }
  });

  test('Schriften liegen lokal: @font-face zeigt auf echte WOFF2-Dateien, Lizenztexte liegen dabei', () => {
    const html = fs.readFileSync(path.join(out, 'schafkopf/index.html'), 'utf8');
    const faces = [...html.matchAll(/@font-face\s*\{[^}]*font-family:\s*'([^']+)'[^}]*src:\s*url\('([^']+)'\)\s*format\('woff2'\)/g)];
    assert.deepEqual(faces.map((m) => m[1]).sort(), ['Kalam', 'Kalam', 'UnifrakturMaguntia']);
    assert.deepEqual([...html.matchAll(/font-display:\s*(\w+)/g)].map((m) => m[1]), ['swap', 'swap', 'swap'], 'Text soll sofort sichtbar sein (font-display: swap)');
    for (const [, , url] of faces) {
      const file = path.join(out, 'schafkopf', url);
      assert.ok(fs.existsSync(file), url);
      assert.equal(fs.readFileSync(file).subarray(0, 4).toString('latin1'), 'wOF2', `${url} ist keine WOFF2-Datei`);
    }
    for (const lic of ['LICENSE-Kalam.txt', 'LICENSE-UnifrakturMaguntia.txt']) {
      assert.match(fs.readFileSync(path.join(out, 'schafkopf/assets/fonts', lic), 'utf8'), /SIL Open Font License, Version 1\.1/);
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
