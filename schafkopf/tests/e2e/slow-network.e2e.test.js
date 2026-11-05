'use strict';
/*
 * Schlechtes Netz: Auf der veröffentlichten Seite kommen die Kartenbilder übers Internet.
 * Früher wurden Karten umgedreht, bevor ihr Bild da war – man sah nur eine grüne Fläche,
 * und die Anzeigezeit lief trotzdem ab. Diese Tests simulieren das Netz mit einem Test-Server.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const L = require('../../js/logic.js');
const C = require('../../js/cards.js');
const { startServer } = require('./helpers/static-server.js');

const ROOT = path.resolve(__dirname, '../..');
const SEED = 21;

let browser;
const servers = [];
test.before(async () => { browser = await chromium.launch(); });
test.after(async () => { for (const s of servers) await s.close(); if (browser) await browser.close(); });

/** Die Karten, die die App mit diesem Startwert und leerer Statistik zieht (gleiche Rechnung wie die App). */
const handFor = () => L.nextHand(L.DEFAULT_SETTINGS, L.createRng(SEED), {});

async function openSlow(t, netz, settings = {}) {
  const server = await startServer(ROOT, netz);
  servers.push(server);
  const context = await browser.newContext({ viewport: { width: 360, height: 680 } });
  const st = L.emptyStore();
  st.settings = L.sanitizeSettings({ sound: false, vibration: false, displaySeconds: 2, rounds: 3, ...settings });
  await context.addInitScript(([key, value]) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, value);
    // Merkt sich jede Karte, die umgedreht wird, obwohl ihr Bild noch nicht geladen ist (der gemeldete Fehler)
    window.__violations = [];
    new MutationObserver((records) => {
      for (const r of records) {
        const el = r.target;
        if (el.classList && el.classList.contains('card') && el.classList.contains('up')) {
          const img = el.querySelector('.front img');
          if (img && !(img.complete && img.naturalWidth > 0)) window.__violations.push(el.dataset.cardId);
        }
      }
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['class'] });
  }, [L.STORAGE_KEY, JSON.stringify(st)]);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // 404/503 der absichtlich ausgefallenen Bilder erscheinen als Konsolenmeldung – die sind hier gewollt
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  // Nicht auf das Ende des Ladens warten – ein Nutzer tippt auf „Start“, sobald die Seite zu sehen ist
  await page.goto(server.url + `?seed=${SEED}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('body.ready');
  t.after(async () => { await context.close(); assert.deepEqual(errors, [], 'keine JS-Fehler'); });
  return { page, server };
}

const states = (page) => page.evaluate(() => [...document.querySelectorAll('#hand .card')].map((c) => {
  const img = c.querySelector('.front img');
  return { up: c.classList.contains('up'), loaded: img ? img.complete && img.naturalWidth > 0 : null, fallback: !!c.querySelector('.card-fallback') };
}));

test.describe('Kartenanzeige im schlechten Netz', () => {
  test('Langsames Netz: Karten bleiben verdeckt, bis alle vier Bilder da sind – nie nur eine grüne Fläche', async (t) => {
    const { page } = await openSlow(t, { delayMs: 1500 });
    await page.click('#start-btn');
    const t0 = Date.now();
    let sawLoadingHint = false;
    let firstAllUp = null;
    while (Date.now() - t0 < 12000 && firstAllUp === null) {
      const list = await states(page);
      if (list.some((c) => c.up)) assert.ok(list.every((c) => c.loaded), `Karte umgedreht ohne Bild: ${JSON.stringify(list)}`);
      if ((await page.textContent('#prompt')) === 'Karten werdn gladn …') sawLoadingHint = true;
      if (list.length === 4 && list.every((c) => c.up)) firstAllUp = Date.now();
      await page.waitForTimeout(60);
    }
    assert.ok(firstAllUp, 'Karten werden irgendwann aufgedeckt');
    assert.ok(sawLoadingHint, 'während des Ladens steht ein Hinweis da');
    assert.deepEqual(await page.evaluate(() => window.__violations), [], 'keine Karte wurde ohne Bild umgedreht');
    assert.equal(await page.textContent('#prompt'), 'Guad aufpassn …', 'danach wieder der normale Hinweis');
    // Die Anzeigezeit (2 s) zählt erst ab dem Aufdecken, nicht schon während des Ladens
    await page.waitForFunction(() => document.body.dataset.phase === 'answer', null, { timeout: 8000 });
    assert.ok(Date.now() - firstAllUp >= 1800, `Anzeigezeit zu kurz: ${Date.now() - firstAllUp} ms`);
  });

  test('Schnelles Netz: kein Hinweis, Karten werden gleich aufgedeckt (nichts wird langsamer)', async (t) => {
    const { page } = await openSlow(t, { delayMs: 0 }, { displaySeconds: 5 });
    await page.waitForFunction(() => performance.getEntriesByType('resource').filter((r) => r.name.endsWith('.svg')).length >= 24);
    await page.click('#start-btn');
    const t0 = Date.now();
    await page.waitForFunction(() => document.querySelectorAll('#hand .card.up').length === 4, null, { timeout: 3000 });
    assert.ok(Date.now() - t0 < 1500, `Aufdecken dauert ${Date.now() - t0} ms`);
    assert.equal(await page.textContent('#prompt'), 'Guad aufpassn …');
    assert.deepEqual(await page.evaluate(() => window.__violations), []);
  });

  test('Ein Bild fehlt dauerhaft (404): Textkarte statt grüner Fläche, Spiel geht weiter', async (t) => {
    const missing = handFor()[1];
    const { page, server } = await openSlow(t, { fail: [C.cardFile(missing)] }, { displaySeconds: 3 });
    await page.click('#start-btn');
    await page.waitForFunction(() => document.querySelectorAll('#hand .card.up').length === 4, null, { timeout: 10000 });
    const list = await states(page);
    assert.deepEqual(list.map((c) => c.fallback), handFor().map((c) => c.id === missing.id), 'nur die Karte mit fehlendem Bild wird zur Textkarte');
    const text = await page.locator(`.card-fallback[data-card="${missing.id}"]`);
    assert.equal(await text.getAttribute('aria-label'), L.cardLabel(missing));
    assert.ok((await text.textContent()).includes(L.RANK_NAMES[missing.rank]) && (await text.textContent()).includes(L.SUIT_NAMES[missing.suit]));
    assert.ok(await text.isVisible());
    const box = await text.boundingBox();
    assert.ok(box.width > 60 && box.height > 90, 'Textkarte hat Kartengröße');
    assert.ok(server.hits.filter((h) => h.includes(C.cardFile(missing))).length >= 2, 'es gab einen zweiten Versuch');
    assert.deepEqual(await page.evaluate(() => window.__violations), []);
    // Spiel läuft weiter: richtige Antwort (Punkte der Textkarte zählen normal)
    await page.waitForFunction(() => document.body.dataset.phase === 'answer', null, { timeout: 8000 });
    const sum = L.sumPoints(handFor());
    const value = await page.$$eval('#choices button', (bs, s) => Number(bs.find((b) => Number(b.dataset.value) === s).dataset.value), sum);
    await page.click(`#choices button[data-value="${value}"]`);
    await page.waitForFunction(() => document.getElementById('round-label').textContent === 'Runde 2 vo 3');
  });

  test('Kurzer Netzaussetzer: der zweite Versuch holt das Bild nach, es gibt keine Textkarte', async (t) => {
    const flaky = handFor()[2];
    const { page, server } = await openSlow(t, { failUntilRetry: [C.cardFile(flaky)] });
    await page.click('#start-btn');
    await page.waitForFunction(() => document.querySelectorAll('#hand .card.up').length === 4, null, { timeout: 10000 });
    const list = await states(page);
    assert.ok(list.every((c) => c.loaded && !c.fallback), JSON.stringify(list));
    const mine = server.hits.filter((h) => h.includes(C.cardFile(flaky)));
    assert.ok(mine.some((h) => !h.includes('retry=')), 'erster Versuch fiel aus');
    assert.ok(mine.some((h) => h.includes('retry=')), 'zweiter Versuch wurde gemacht');
    assert.deepEqual(await page.evaluate(() => window.__violations), []);
  });

  test('Aufhören, während die Bilder laden: danach startet nichts mehr von allein', async (t) => {
    const { page } = await openSlow(t, { delayMs: 1500 });
    await page.click('#start-btn');
    await page.waitForTimeout(300);
    await page.click('#quit-btn');
    await page.waitForFunction(() => document.body.dataset.phase === 'summary');
    await page.waitForTimeout(3500); // länger als das Laden dauert
    assert.equal(await page.evaluate(() => document.body.dataset.phase), 'summary');
    assert.equal(await page.locator('#hand .card.up').count(), 0);
  });

  test('Neue Runde im schlechten Netz: auch jede weitere Runde wartet auf ihre Bilder', async (t) => {
    const { page } = await openSlow(t, { delayMs: 600 }, { displaySeconds: 1, rounds: 3 });
    await page.click('#start-btn');
    for (let round = 1; round <= 2; round++) {
      await page.waitForFunction(() => document.body.dataset.phase === 'answer', null, { timeout: 15000 });
      const sum = L.sumPoints(await page.$$eval('#hand .card', (els) => els.map((e) => e.dataset.cardId)).then((ids) => ids.map(L.cardById)));
      const value = await page.$$eval('#choices button', (bs, s) => Number(bs.find((b) => Number(b.dataset.value) !== s).dataset.value), sum);
      await page.click(`#choices button[data-value="${value}"]`); // falsch → Rückmeldung
      await page.waitForFunction(() => document.body.dataset.phase === 'feedback');
      await page.click('#next-btn');
    }
    await page.waitForFunction(() => document.body.dataset.phase === 'answer', null, { timeout: 15000 });
    assert.deepEqual(await page.evaluate(() => window.__violations), [], 'in keiner Runde eine Karte ohne Bild umgedreht');
  });
});
