'use strict';
/*
 * End-to-End-Tests im echten Browser (Chromium über Playwright).
 * Start: npm run test:e2e
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const L = require('../../js/logic.js');

const PAGE_URL = 'file://' + path.resolve(__dirname, '../../index.html');
const FAST = { displaySeconds: 0.5, rounds: 3, sound: false, vibration: false };

let browser;

test.before(async () => {
  browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
});
test.after(async () => { if (browser) await browser.close(); });

/**
 * Öffnet die App mit vorbelegtem Speicher. Sammelt JS-Fehler, die am Ende
 * jedes Tests geprüft werden.
 */
async function open(t, { settings = {}, store = null, raw = null, empty = false, seed = 1, viewport, colorScheme, reducedMotion = 'reduce' } = {}) {
  const context = await browser.newContext({ viewport: viewport || { width: 1000, height: 900 }, colorScheme, reducedMotion });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.text()) && !/ERR_/.test(m.text())) errors.push(m.text()); });
  let data = empty ? undefined : raw;
  if (data === null) {
    const st = store || L.emptyStore();
    st.settings = L.sanitizeSettings({ ...st.settings, ...FAST, ...settings });
    data = JSON.stringify(st);
  }
  // Speicher einmalig vorbelegen, dann neu laden (spätere Reloads behalten den Stand).
  const url = PAGE_URL + (seed === null ? '' : '?seed=' + seed);
  await page.goto(url);
  await page.evaluate(([key, value]) => {
    if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value);
  }, [L.STORAGE_KEY, data === undefined ? null : data]);
  await page.reload();
  await page.waitForSelector('body.ready');
  t.after(async () => {
    await context.close();
    assert.deepEqual(errors, [], 'keine JS-Fehler im Browser');
  });
  return page;
}

const phase = (page) => page.evaluate(() => document.body.dataset.phase);
const waitPhase = (page, p, timeout = 5000) => page.waitForFunction((x) => document.body.dataset.phase === x, p, { timeout });
const handIds = (page) => page.$$eval('#hand .card', (els) => els.map((e) => e.dataset.cardId));
const storeOf = async (page) => L.loadStore(await page.evaluate((k) => localStorage.getItem(k), L.STORAGE_KEY));

async function handSum(page) {
  return L.sumPoints((await handIds(page)).map(L.cardById));
}

async function playNumberRound(page, { wrong = false } = {}) {
  await waitPhase(page, 'answer');
  const sum = await handSum(page);
  await page.fill('#number-input', String(wrong ? sum + 1 : sum));
  await page.press('#number-input', 'Enter');
  await waitPhase(page, 'feedback');
  return sum;
}

// ---------------------------------------------------------------------------
test.describe('Start & Darstellung', () => {
  test('Startseite lädt mit bairischen Texten und allen Einstellungen', async (t) => {
    const page = await open(t);
    assert.equal(await phase(page), 'setup');
    assert.equal(await page.textContent('h1'), 'Augn zähln');
    assert.equal(await page.textContent('#start-btn'), 'Auf geht’s!');
    assert.equal(await page.getAttribute('html', 'lang'), 'bar');
    assert.equal(await page.locator('#settings-form .field').count(), 13);
    assert.ok(await page.isVisible('#screen-setup'));
    assert.ok(!(await page.isVisible('#screen-play')));
  });

  test('alle 24 Karten und die Rückseite sind gültiges SVG und werden gezeichnet', async (t) => {
    const page = await open(t);
    const result = await page.evaluate(() => {
      const L = window.SchafkopfLogic, C = window.SchafkopfCards;
      const parser = new DOMParser();
      const svgs = L.createDeck().map((c) => C.renderCard(c)).concat([C.renderBack()]);
      const bad = svgs.filter((s) => parser.parseFromString(s, 'image/svg+xml').querySelector('parsererror'));
      const host = document.createElement('div');
      host.style.width = '100px';
      host.innerHTML = svgs.join('');
      document.body.appendChild(host);
      const boxes = Array.from(host.querySelectorAll('svg')).map((s) => s.getBBox());
      host.remove();
      return { bad: bad.length, n: svgs.length, empty: boxes.filter((b) => b.width < 150 || b.height < 250).length };
    });
    assert.deepEqual(result, { bad: 0, n: 25, empty: 0 });
  });

  test('kaputter Speicher: App startet trotzdem mit Standardwerten', async (t) => {
    const page = await open(t, { raw: '{kaputt' });
    assert.equal(await page.inputValue('#set-displaySeconds'), String(L.DEFAULT_SETTINGS.displaySeconds));
    await page.click('#start-btn');
    await waitPhase(page, 'reveal');
  });

  test('ohne gespeicherte Daten und ohne Seed', async (t) => {
    const page = await open(t, { empty: true, seed: null });
    assert.equal(await page.isChecked('#set-inputMode-choice'), true);
    await page.click('#start-btn');
    await waitPhase(page, 'reveal');
    assert.equal((await handIds(page)).length, 4);
  });

  test('Handy (360×640): kein seitliches Scrollen, Karten passen in die Breite', async (t) => {
    const page = await open(t, { viewport: { width: 360, height: 640 }, settings: { displaySeconds: 5 } });
    await page.click('#start-btn');
    await page.waitForSelector('#hand .card.up');
    const m = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      inner: window.innerWidth,
      cards: Array.from(document.querySelectorAll('#hand .card')).map((c) => c.getBoundingClientRect()).map((r) => ({ l: r.left, r: r.right, w: r.width }))
    }));
    assert.ok(m.scroll <= m.inner, `scrollWidth ${m.scroll} > ${m.inner}`);
    m.cards.forEach((c) => { assert.ok(c.l >= 0 && c.r <= m.inner, JSON.stringify(c)); assert.ok(c.w >= 90, `Karte zu klein: ${c.w}`); });
  });

  test('Desktop: vier Karten nebeneinander', async (t) => {
    const page = await open(t, { viewport: { width: 1200, height: 900 }, settings: { displaySeconds: 5 } });
    await page.click('#start-btn');
    const tops = await page.$$eval('#hand .card', (els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
    assert.equal(new Set(tops).size, 1);
  });
});

// ---------------------------------------------------------------------------
test.describe('Spielablauf', () => {
  test('Zahlenmodus: drei richtige Runden → Auswertung 100 %', async (t) => {
    const page = await open(t, { settings: { inputMode: 'number', rounds: 3 } });
    await page.click('#start-btn');
    for (let i = 1; i <= 3; i++) {
      assert.equal(await page.textContent('#round-label'), `Runde ${i} vo 3`);
      const sum = await playNumberRound(page);
      assert.equal(await page.textContent('#verdict'), 'Passt!');
      assert.equal(await page.textContent('#equation'), L.formatEquation((await handIds(page)).map(L.cardById)));
      assert.ok((await page.textContent('#equation')).endsWith('= ' + sum));
      assert.ok(await page.evaluate(() => document.body.classList.contains('is-correct')));
      assert.equal(await page.textContent('#next-btn'), i < 3 ? 'Weida' : 'Abrechna');
      await page.click('#next-btn');
    }
    await waitPhase(page, 'summary');
    assert.equal(await page.textContent('#sum-accuracy'), '100 %');
    assert.equal(await page.textContent('#sum-correct'), '3 / 3');
    assert.equal(await page.textContent('#sum-streak'), '3');
    assert.match(await page.textContent('#sum-avg'), /^\d+,\d s$/);

    const st = await storeOf(page);
    assert.equal(st.history.length, 1);
    assert.equal(st.history[0].rounds, 3);
    assert.equal(st.history[0].correct, 3);
    assert.equal(st.history[0].inputMode, 'number');
    assert.equal(Object.values(st.cardStats).reduce((s, c) => s + c.seen, 0), 12);
  });

  test('Auswahlmodus: vier Bierdeckel mit knappen Werten, Lösung dabei', async (t) => {
    const page = await open(t);
    await page.click('#start-btn');
    await waitPhase(page, 'answer');
    const sum = await handSum(page);
    const values = await page.$$eval('#choices button', (bs) => bs.map((b) => Number(b.dataset.value)));
    assert.equal(values.length, 4);
    assert.equal(new Set(values).size, 4);
    assert.ok(values.includes(sum));
    values.forEach((v) => assert.ok(Math.abs(v - sum) <= 6));
    assert.ok(!(await page.isVisible('#number-form')));
  });

  test('falsche Antwort: Lösung, Rechnung und eigene Antwort werden gezeigt', async (t) => {
    const page = await open(t);
    await page.click('#start-btn');
    await waitPhase(page, 'answer');
    const sum = await handSum(page);
    const wrong = await page.$$eval('#choices button', (bs, s) => Number(bs.find((b) => Number(b.dataset.value) !== s).dataset.value), sum);
    await page.click(`#choices button[data-value="${wrong}"]`);
    await waitPhase(page, 'feedback');
    assert.equal(await page.textContent('#verdict'), `Naa, des warn ${sum}.`);
    assert.equal(await page.textContent('#your-answer'), `Du host ${wrong} gsagt.`);
    assert.ok(await page.isVisible('#your-answer'));
    assert.ok(await page.evaluate(() => document.body.classList.contains('is-wrong')));
    assert.equal(await page.textContent('#streak-label'), 'Serie: 0');
    // Punkte-Plaketten zeigen die einzelnen Werte
    const badges = await page.$$eval('#hand .points-badge', (els) => els.map((e) => Number(e.textContent)));
    assert.deepEqual(badges, (await handIds(page)).map((id) => L.cardById(id).points));
    assert.ok(await page.isVisible('#hand .points-badge'));
  });

  test('Karten sind beim Antworten verdeckt und bei der Rückmeldung wieder offen', async (t) => {
    const page = await open(t);
    await page.click('#start-btn');
    await page.waitForFunction(() => document.querySelectorAll('#hand .card.up').length === 4);
    assert.equal(await phase(page), 'reveal');
    assert.ok(!(await page.isVisible('#choices')));
    await waitPhase(page, 'answer');
    assert.equal(await page.locator('#hand .card.up').count(), 0);
    assert.ok(!(await page.isVisible('#hand .points-badge')));
    await page.click('#choices button >> nth=0');
    await waitPhase(page, 'feedback');
    assert.equal(await page.locator('#hand .card.up').count(), 4);
  });

  test('Anzeigedauer wird eingehalten', async (t) => {
    const page = await open(t, { settings: { displaySeconds: 1.5 } });
    const ms = await page.evaluate(() => new Promise((resolve) => {
      const t0 = performance.now();
      new MutationObserver((_, obs) => {
        if (document.body.dataset.phase === 'answer') { obs.disconnect(); resolve(performance.now() - t0); }
      }).observe(document.body, { attributes: true });
      document.getElementById('start-btn').click();
    }));
    // 1500 ms Anzeige + 250 ms Austeilen
    assert.ok(ms >= 1700 && ms < 2300, `Dauer ${ms} ms`);
  });

  test('nacheinander aufdecken: Karten kommen im eingestellten Abstand', async (t) => {
    const page = await open(t, { settings: { revealMode: 'sequential', revealDelaySeconds: 0.5, displaySeconds: 1 } });
    const times = await page.evaluate(() => new Promise((resolve) => {
      const t0 = performance.now();
      const seen = {};
      const obs = new MutationObserver(() => {
        document.querySelectorAll('#hand .card.up').forEach((c) => { if (!(c.dataset.index in seen)) seen[c.dataset.index] = performance.now() - t0; });
        if (document.body.dataset.phase === 'answer') { obs.disconnect(); resolve({ seen, end: performance.now() - t0 }); }
      });
      obs.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class', 'data-phase'] });
      document.getElementById('start-btn').click();
    }));
    const s = [0, 1, 2, 3].map((i) => times.seen[i]);
    for (let i = 1; i < 4; i++) {
      const gap = s[i] - s[i - 1];
      assert.ok(gap > 380 && gap < 650, `Abstand Karte ${i}: ${gap} ms (${s})`);
    }
    const shownAfterLast = times.end - s[3];
    assert.ok(shownAfterLast > 850 && shownAfterLast < 1300, `Anzeige nach letzter Karte: ${shownAfterLast}`);
  });

  test('Zeitdruck: ohne Antwort ist die Runde verloren', async (t) => {
    const page = await open(t, { settings: { answerLimitEnabled: true, answerLimitSeconds: 2 } });
    await page.click('#start-btn');
    await waitPhase(page, 'answer');
    const sum = await handSum(page);
    assert.equal(await page.getAttribute('#timer-bar', 'data-kind'), 'answer');
    await waitPhase(page, 'feedback', 4000);
    assert.equal(await page.textContent('#verdict'), `Z’langsam! Des warn ${sum}.`);
    assert.ok(!(await page.isVisible('#your-answer')));
  });

  test('Zeitdruck: rechtzeitige Antwort zählt normal', async (t) => {
    const page = await open(t, { settings: { answerLimitEnabled: true, answerLimitSeconds: 5, inputMode: 'number' } });
    await page.click('#start-btn');
    await playNumberRound(page);
    assert.equal(await page.textContent('#verdict'), 'Passt!');
  });

  test('ungültige Zahl wird nicht gewertet', async (t) => {
    const page = await open(t, { settings: { inputMode: 'number' } });
    await page.click('#start-btn');
    await waitPhase(page, 'answer');
    for (const bad of ['', 'ab', '-']) {
      await page.fill('#number-input', bad);
      await page.click('#check-btn');
      assert.equal(await phase(page), 'answer');
    }
    assert.ok(await page.evaluate(() => document.getElementById('number-input').classList.contains('shake')));
  });

  test('Endlosmodus: läuft weiter, bis man aufhört', async (t) => {
    const page = await open(t, { settings: { gameMode: 'endless', inputMode: 'number', rounds: 1 } });
    await page.click('#start-btn');
    for (let i = 1; i <= 3; i++) {
      assert.equal(await page.textContent('#round-label'), `Runde ${i}`);
      await playNumberRound(page, { wrong: i === 2 });
      assert.equal(await page.textContent('#next-btn'), 'Weida');
      await page.click('#next-btn');
    }
    await waitPhase(page, 'reveal');
    await page.click('#quit-btn');
    await waitPhase(page, 'summary');
    assert.equal(await page.textContent('#sum-correct'), '2 / 3');
    assert.equal(await page.textContent('#sum-accuracy'), '67 %');
    assert.equal((await storeOf(page)).history[0].mode, 'endless');
  });

  test('Aufhören vor der ersten Antwort: leere Auswertung, nichts gespeichert', async (t) => {
    const page = await open(t);
    await page.click('#start-btn');
    await waitPhase(page, 'answer');
    await page.click('#quit-btn');
    await waitPhase(page, 'summary');
    assert.equal(await page.textContent('#sum-accuracy'), '–');
    assert.equal(await page.textContent('#sum-avg'), '–');
    assert.equal((await storeOf(page)).history.length, 0);
  });

  test('„No amoi“ startet eine neue Sitzung, „Zruck“ führt zu den Einstellungen', async (t) => {
    const page = await open(t, { settings: { rounds: 1, inputMode: 'number' } });
    await page.click('#start-btn');
    await playNumberRound(page);
    await page.click('#next-btn');
    await waitPhase(page, 'summary');
    await page.click('#again-btn');
    await waitPhase(page, 'reveal');
    assert.equal(await page.textContent('#round-label'), 'Runde 1 vo 1');
    await playNumberRound(page);
    await page.click('#next-btn');
    await waitPhase(page, 'summary');
    assert.equal((await storeOf(page)).history.length, 2);
    await page.click('#summary-setup-btn');
    await waitPhase(page, 'setup');
    assert.ok(await page.isVisible('#screen-setup'));
  });

  test('Tastatur: Ziffern 1–4 wählen, Enter geht weiter', async (t) => {
    const page = await open(t, { settings: { rounds: 2 } });
    await page.click('#start-btn');
    await waitPhase(page, 'answer');
    const first = await page.getAttribute('#choices button >> nth=2', 'data-value');
    await page.keyboard.press('3');
    await waitPhase(page, 'feedback');
    const yours = await page.textContent('#your-answer');
    const verdict = await page.textContent('#verdict');
    assert.ok(verdict === 'Passt!' || yours.includes(first));
    await page.keyboard.press('Enter');
    await waitPhase(page, 'reveal');
  });

  test('gleicher Seed → gleiche Karten (reproduzierbar)', async (t) => {
    const a = await open(t, { seed: 4711, settings: { adaptive: false } });
    const b = await open(t, { seed: 4711, settings: { adaptive: false } });
    await a.click('#start-btn');
    await b.click('#start-btn');
    const ha = await handIds(a);
    assert.deepEqual(ha, await handIds(b));
    assert.deepEqual(ha, L.drawCards(L.createDeck(), 4, L.createRng(4711)).map((c) => c.id));
  });

  test('Schwachstellen üben: App zieht mit den gespeicherten Gewichten', async (t) => {
    const store = L.emptyStore();
    store.cardStats = { 'herz-ober': { seen: 40, wrong: 40 }, 'gras-unter': { seen: 40, wrong: 30 } };
    const page = await open(t, { seed: 99, store, settings: { adaptive: true } });
    await page.click('#start-btn');
    const expected = L.drawCards(L.createDeck(), 4, L.createRng(99), L.cardWeights(store.cardStats)).map((c) => c.id);
    assert.deepEqual(await handIds(page), expected);
  });
});

// ---------------------------------------------------------------------------
test.describe('Einstellungen', () => {
  test('werden gespeichert und überleben ein Neuladen', async (t) => {
    const page = await open(t);
    await page.fill('#set-displaySeconds', '6.5');
    await page.dispatchEvent('#set-displaySeconds', 'input');
    assert.equal(await page.textContent('[data-field="displaySeconds"] output'), '6,5 s');
    await page.click('label[for="set-inputMode-number"]');
    await page.click('label[for="set-gameMode-endless"]');
    await page.click('#set-adaptive');
    await page.reload();
    await page.waitForSelector('body.ready');
    assert.equal(await page.inputValue('#set-displaySeconds'), '6.5');
    assert.ok(await page.isChecked('#set-inputMode-number'));
    assert.ok(await page.isChecked('#set-gameMode-endless'));
    assert.ok(!(await page.isChecked('#set-adaptive')));
    const st = await storeOf(page);
    assert.equal(st.settings.displaySeconds, 6.5);
    assert.equal(st.settings.inputMode, 'number');
    assert.equal(st.settings.adaptive, false);
  });

  test('abhängige Felder erscheinen nur bei Bedarf', async (t) => {
    const page = await open(t);
    const visible = (key) => page.isVisible(`[data-field="${key}"]`);
    assert.equal(await visible('revealDelaySeconds'), false);
    await page.click('label[for="set-revealMode-sequential"]');
    assert.equal(await visible('revealDelaySeconds'), true);
    assert.equal(await visible('rounds'), true);
    await page.click('label[for="set-gameMode-endless"]');
    assert.equal(await visible('rounds'), false);
    assert.equal(await visible('answerLimitSeconds'), false);
    await page.click('#set-answerLimitEnabled');
    assert.equal(await visible('answerLimitSeconds'), true);
  });

  test('Sprache umschalten: alles auf Hochdeutsch', async (t) => {
    const page = await open(t);
    await page.click('label[for="set-language-hochdeutsch"]');
    assert.equal(await page.textContent('h1'), 'Augen zählen');
    assert.equal(await page.textContent('#start-btn'), 'Los geht’s!');
    assert.equal(await page.textContent('[data-field="displaySeconds"] label'), 'Anzeigedauer');
    assert.equal(await page.getAttribute('html', 'lang'), 'de');
    assert.ok((await page.title()).startsWith('Augen zählen'));
    await page.click('#start-btn');
    await waitPhase(page, 'answer');
    assert.equal(await page.textContent('#prompt'), 'Wie viele Augen?');
    assert.equal(await page.textContent('#round-label'), 'Runde 1 von 3');
  });

  test('Optik: Tag/Abend/Automatisch', async (t) => {
    const page = await open(t, { colorScheme: 'light' });
    const bg = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--felt-2').trim());
    assert.equal(await page.getAttribute('html', 'data-theme'), 'auto');
    const light = await bg();
    await page.click('label[for="set-theme-dark"]');
    assert.equal(await page.getAttribute('html', 'data-theme'), 'dark');
    const dark = await bg();
    assert.notEqual(light, dark);
    await page.click('label[for="set-theme-light"]');
    assert.equal(await bg(), light);
  });

  test('Automatisch folgt dem System (dunkel)', async (t) => {
    const page = await open(t, { colorScheme: 'dark' });
    const felt = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--felt-2').trim());
    assert.equal(felt, '#12391f');
  });
});

// ---------------------------------------------------------------------------
test.describe('Statistik', () => {
  test('leeres Stammtisch-Buach', async (t) => {
    const page = await open(t);
    await page.click('#stats-btn');
    await waitPhase(page, 'stats');
    assert.equal(await page.textContent('#best-accuracy'), '–');
    assert.equal(await page.textContent('#best-total'), '0');
    assert.match(await page.textContent('#history'), /No nix drin/);
    await page.click('#stats-back-btn');
    await waitPhase(page, 'setup');
  });

  test('zeigt Bestwerte, Verlauf und Schwachstellen', async (t) => {
    const store = L.emptyStore();
    store.history = [
      { date: 1, rounds: 10, correct: 6, avgTimeMs: 3000, bestStreak: 3, mode: 'rounds', inputMode: 'choice' },
      { date: 2, rounds: 10, correct: 9, avgTimeMs: 2000, bestStreak: 6, mode: 'rounds', inputMode: 'choice' }
    ];
    store.best = { accuracy: 0.9, bestStreak: 6, fastestAvgMs: 2000, totalRounds: 20, totalCorrect: 15 };
    store.cardStats = { 'herz-ober': { seen: 6, wrong: 4 }, 'gras-unter': { seen: 5, wrong: 1 }, 'eichel-sau': { seen: 1, wrong: 1 } };
    const page = await open(t, { store });
    await page.click('#stats-btn');
    assert.equal(await page.textContent('#best-accuracy'), '90 %');
    assert.equal(await page.textContent('#best-fastest'), '2,0 s');
    assert.equal(await page.textContent('#best-streak'), '6');
    assert.equal(await page.textContent('#best-total'), '15 / 20');
    assert.equal(await page.locator('#history svg circle').count(), 2);
    assert.equal(await page.locator('#history svg polyline').count(), 1);
    const weak = await page.$$eval('#weak-cards li', (els) => els.map((e) => e.dataset.cardId));
    assert.deepEqual(weak, ['herz-ober', 'gras-unter']);
    assert.equal(await page.textContent('#weak-cards li:first-child .weak-rate'), '4 / 6');
    assert.equal(await page.textContent('#weak-cards li:first-child .weak-name'), 'Herz-Ober');
  });

  test('Löschen: Abbrechen behält alles, Bestätigen löscht (Einstellungen bleiben)', async (t) => {
    const store = L.emptyStore();
    store.history = [{ date: 1, rounds: 5, correct: 5, avgTimeMs: 1000, bestStreak: 5 }];
    store.best.bestStreak = 5;
    const page = await open(t, { store, settings: { rounds: 7 } });
    await page.click('#stats-btn');
    page.once('dialog', (d) => d.dismiss());
    await page.click('#reset-btn');
    assert.equal(await page.textContent('#best-streak'), '5');
    assert.equal((await storeOf(page)).history.length, 1);
    page.once('dialog', (d) => d.accept());
    await page.click('#reset-btn');
    assert.equal(await page.textContent('#best-streak'), '0');
    const st = await storeOf(page);
    assert.equal(st.history.length, 0);
    assert.equal(st.settings.rounds, 7);
  });

  test('nach einem Spiel aus der Auswertung ins Buach', async (t) => {
    const page = await open(t, { settings: { rounds: 1, inputMode: 'number' } });
    await page.click('#start-btn');
    await playNumberRound(page, { wrong: true });
    await page.click('#next-btn');
    await waitPhase(page, 'summary');
    await page.click('#summary-stats-btn');
    await waitPhase(page, 'stats');
    assert.equal(await page.textContent('#best-total'), '0 / 1');
    assert.equal(await page.locator('#history svg circle').count(), 1);
  });
});
