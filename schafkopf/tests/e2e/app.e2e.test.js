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
async function open(t, { settings = {}, store = null, raw = null, empty = false, seed = 1, viewport, colorScheme, reducedMotion = 'reduce', recordVibration = false } = {}) {
  const context = await browser.newContext({ viewport: viewport || { width: 1000, height: 900 }, colorScheme, reducedMotion });
  if (recordVibration) {
    // navigator.vibrate durch eine Aufzeichnung ersetzen, damit man die Muster prüfen kann
    await context.addInitScript(() => { window.__vib = []; navigator.vibrate = (p) => { window.__vib.push(p); return true; }; });
  }
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
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

/** Tippt im Zahlenmodus die Summe ein. Richtig → es geht sofort weiter; falsch → Rückmeldung. */
async function playNumberRound(page, { wrong = false } = {}) {
  await waitPhase(page, 'answer');
  const sum = await handSum(page);
  await page.fill('#number-input', String(wrong ? sum + 1 : sum));
  await page.press('#number-input', 'Enter');
  if (wrong) await waitPhase(page, 'feedback');
  else await page.waitForFunction(() => document.body.dataset.phase !== 'answer');
  return sum;
}

/** Klickt im Auswahlmodus gezielt eine richtige oder eine falsche Antwort. */
async function playChoiceRound(page, { wrong = false } = {}) {
  await waitPhase(page, 'answer');
  const sum = await handSum(page);
  const value = await page.$$eval('#choices button', (bs, [s, w]) => Number(bs.find((b) => (Number(b.dataset.value) !== s) === w).dataset.value), [sum, wrong]);
  await page.click(`#choices button[data-value="${value}"]`);
  if (wrong) await waitPhase(page, 'feedback');
  else await page.waitForFunction(() => document.body.dataset.phase !== 'answer');
  return sum;
}

/** Merkt sich, ob der Rückmeldung-Bereich jemals sichtbar wurde (auch für einen Augenblick). */
const watchFeedback = (page) => page.evaluate(() => {
  window.__feedbackShown = false;
  const el = document.getElementById('feedback');
  new MutationObserver(() => { if (!el.hidden) window.__feedbackShown = true; }).observe(el, { attributes: true, attributeFilter: ['hidden'] });
});
const feedbackShown = (page) => page.evaluate(() => window.__feedbackShown);
const vibrations = (page) => page.evaluate(() => window.__vib);
const flashClasses = (page) => page.evaluate(() => ['flash-ok', 'flash-bad'].filter((c) => document.querySelector('.table').classList.contains(c)));

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

  test('alle 24 Kartenbilder laden im Browser (Größe 600×900) und die Rückseite wird gezeichnet', async (t) => {
    const page = await open(t);
    const result = await page.evaluate(async () => {
      const L = window.SchafkopfLogic, C = window.SchafkopfCards;
      const host = document.createElement('div');
      host.innerHTML = L.createDeck().map((c) => C.renderCard(c)).join('') + C.renderBack();
      document.body.appendChild(host);
      const imgs = Array.from(host.querySelectorAll('img'));
      await Promise.all(imgs.map((img) => img.decode().catch(() => null)));
      const broken = imgs.filter((img) => !img.complete || img.naturalWidth !== 600 || img.naturalHeight !== 900).map((i) => i.alt);
      const back = host.querySelector('svg').getBoundingClientRect();
      host.remove();
      return { n: imgs.length, broken, backRatio: Math.round((back.width / back.height) * 1000) / 1000 };
    });
    assert.deepEqual(result, { n: 24, broken: [], backRatio: 0.667 });
  });

  test('gespielte Karten sind echte Bilder mit passendem Alternativtext und Seitenverhältnis 2:3', async (t) => {
    const page = await open(t, { settings: { displaySeconds: 5 } });
    await page.click('#start-btn');
    await page.waitForSelector('#hand .card.up');
    const cards = await page.$$eval('#hand .card', (els) => els.map((e) => {
      const img = e.querySelector('.front img');
      const r = e.getBoundingClientRect();
      return { id: e.dataset.cardId, alt: img.alt, src: img.getAttribute('src'), loaded: img.complete && img.naturalWidth === 600, ratio: Math.round((r.width / r.height) * 100) / 100 };
    }));
    assert.equal(cards.length, 4);
    for (const c of cards) {
      assert.equal(c.alt, L.cardLabel(L.cardById(c.id)));
      assert.match(c.src, /^assets\/cards\/[A-Za-z]+_[A-Za-z]+\.svg$/);
      assert.ok(c.loaded, c.id + ' nicht geladen');
      assert.equal(c.ratio, 0.67);
    }
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

  test('Datenschutz: ein kompletter Spieldurchlauf macht keine einzige Anfrage ins Internet', async (t) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    const requests = [];
    page.on('request', (r) => requests.push(r.url()));
    t.after(() => context.close());
    const store = L.emptyStore();
    store.settings = L.sanitizeSettings({ ...FAST, inputMode: 'number', rounds: 1 });
    await page.goto(PAGE_URL);
    await page.evaluate(([k, v]) => localStorage.setItem(k, v), [L.STORAGE_KEY, JSON.stringify(store)]);
    await page.reload();
    await page.waitForSelector('body.ready');
    await page.click('#start-btn');
    await playNumberRound(page);
    await waitPhase(page, 'summary');
    await page.click('#summary-stats-btn');
    await waitPhase(page, 'stats');
    assert.ok(requests.length > 5, 'es wurden Anfragen aufgezeichnet');
    const foreign = requests.filter((u) => !u.startsWith('file://'));
    assert.deepEqual(foreign, [], 'Anfragen an Fremdserver');
    assert.ok(requests.some((u) => u.endsWith('.woff2')), 'Schriften werden geladen');
  });

  test('die lokalen Schriften sind im Browser wirklich geladen und aktiv', async (t) => {
    const page = await open(t);
    await page.evaluate(() => document.fonts.ready);
    const status = await page.evaluate(() => Array.from(document.fonts).map((f) => `${f.family}|${f.weight}|${f.status}`).sort());
    // Schriften werden erst geladen, wenn Text sie braucht – Titel (Fraktur) und Kreide-Schrift stehen auf der Startseite
    assert.deepEqual(status.map((x) => x.split('|').slice(0, 2).join('|')), ['Kalam|400', 'Kalam|700', 'UnifrakturMaguntia|400']);
    const loaded = await page.evaluate(async () => {
      await Promise.all(Array.from(document.fonts).map((f) => f.load()));
      return Array.from(document.fonts).every((f) => f.status === 'loaded');
    });
    assert.equal(loaded, true);
    const h1 = await page.evaluate(() => getComputedStyle(document.querySelector('h1')).fontFamily);
    assert.match(h1, /^"?UnifrakturMaguntia/);
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

  test('Laptop (breite Kartenfläche): vier Karten nebeneinander', async (t) => {
    const page = await open(t, { viewport: { width: 1280, height: 640 }, settings: { displaySeconds: 5 } });
    await page.click('#start-btn');
    await page.waitForSelector('#hand .card.up');
    const tops = await page.$$eval('#hand .card', (els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
    assert.equal(new Set(tops).size, 1);
  });

  test('Hochformat (Handy): zwei mal zwei, so groß wie der Platz erlaubt', async (t) => {
    const page = await open(t, { viewport: { width: 360, height: 680 }, settings: { displaySeconds: 5 } });
    await page.click('#start-btn');
    await page.waitForSelector('#hand .card.up');
    const r = await page.$$eval('#hand .card', (els) => els.map((e) => { const b = e.getBoundingClientRect(); return { top: Math.round(b.top), left: Math.round(b.left), w: Math.round(b.width) }; }));
    assert.equal(new Set(r.map((c) => c.top)).size, 2, 'zwei Zeilen');
    assert.equal(new Set(r.map((c) => c.left)).size, 2, 'zwei Spalten');
    assert.ok(r[0].w >= 140, `Karten zu klein: ${r[0].w}px`);
  });
});

// ---------------------------------------------------------------------------
test.describe('Spielablauf', () => {
  test('Zahlenmodus: drei richtige Runden gehen ohne Pause durch → Auswertung 100 %', async (t) => {
    const page = await open(t, { settings: { inputMode: 'number', rounds: 3 } });
    await watchFeedback(page);
    await page.click('#start-btn');
    for (let i = 1; i <= 3; i++) {
      await waitPhase(page, 'answer');
      assert.equal(await page.textContent('#round-label'), `Runde ${i} vo 3`);
      assert.equal(await page.textContent('#streak-label'), `Serie: ${i - 1}`);
      await playNumberRound(page);
      assert.equal(await page.textContent('#sr-status'), 'Passt!', 'Screenreader hört „richtig“');
    }
    assert.equal(await feedbackShown(page), false, 'bei richtigen Antworten gibt es keinen Rückmeldung-Bildschirm');
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
    await playChoiceRound(page, { wrong: true });
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

  test('Zeitdruck: rechtzeitige richtige Antwort zählt und geht sofort weiter', async (t) => {
    const page = await open(t, { settings: { answerLimitEnabled: true, answerLimitSeconds: 5, inputMode: 'number' } });
    await page.click('#start-btn');
    await playNumberRound(page);
    assert.equal(await page.textContent('#round-label'), 'Runde 2 vo 3');
    assert.equal(await page.textContent('#streak-label'), 'Serie: 1');
  });

  test('Ziffernblock: Eingabe, Löschen, höchstens zwei Stellen, Prüfen – ohne Handy-Tastatur', async (t) => {
    const page = await open(t, { settings: { inputMode: 'number', rounds: 1 } });
    await page.click('#start-btn');
    await waitPhase(page, 'answer');
    assert.equal(await page.getAttribute('#number-input', 'inputmode'), 'none', 'keine Bildschirmtastatur');
    assert.equal(await page.locator('.keypad .key').count(), 12);
    const val = () => page.inputValue('#number-input');
    await page.click('.key[data-key="1"]');
    await page.click('.key[data-key="7"]');
    assert.equal(await val(), '17');
    await page.click('.key[data-key="3"]');
    assert.equal(await val(), '17', 'dritte Ziffer wird ignoriert');
    await page.click('.key[data-key="del"]');
    assert.equal(await val(), '1');
    await page.click('.key[data-key="del"]');
    await page.click('.key[data-key="del"]');
    assert.equal(await val(), '', 'Löschen im leeren Feld ist harmlos');
    await page.click('#check-btn');
    assert.equal(await phase(page), 'answer', 'leere Eingabe wird nicht gewertet');
    assert.ok(await page.evaluate(() => document.getElementById('number-input').classList.contains('shake')));
    // richtige Summe nur über den Ziffernblock tippen
    const sum = await handSum(page);
    for (const d of String(sum)) await page.click(`.key[data-key="${d}"]`);
    await page.click('#check-btn');
    await waitPhase(page, 'summary'); // eine Runde, richtig → direkt zur Auswertung
    assert.equal(await page.textContent('#sum-accuracy'), '100 %');
  });

  test('Ziffernblock: Tasten sind für Screenreader beschriftet (in beiden Sprachen)', async (t) => {
    const page = await open(t, { settings: { inputMode: 'number', language: 'hochdeutsch' } });
    assert.equal(await page.getAttribute('#check-btn', 'aria-label'), 'Prüfen');
    assert.equal(await page.getAttribute('.key[data-key="del"]', 'aria-label'), 'Löschen');
    await page.click('label[for="set-language-bairisch"]');
    assert.equal(await page.getAttribute('#check-btn', 'aria-label'), 'Schaug ma');
    assert.equal(await page.getAttribute('.key[data-key="del"]', 'aria-label'), 'Löschn');
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
      await waitPhase(page, 'answer');
      assert.equal(await page.textContent('#round-label'), `Runde ${i}`);
      await playNumberRound(page, { wrong: i === 2 }); // Runde 2 absichtlich falsch → mit Rückmeldung
      if (i === 2) {
        assert.equal(await page.textContent('#next-btn'), 'Weida');
        await page.click('#next-btn');
      }
    }
    await waitPhase(page, 'reveal');
    assert.equal(await page.textContent('#round-label'), 'Runde 4');
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
    await waitPhase(page, 'summary');
    await page.click('#again-btn');
    await waitPhase(page, 'reveal');
    assert.equal(await page.textContent('#round-label'), 'Runde 1 vo 1');
    await playNumberRound(page);
    await waitPhase(page, 'summary');
    assert.equal((await storeOf(page)).history.length, 2);
    await page.click('#summary-setup-btn');
    await waitPhase(page, 'setup');
    assert.ok(await page.isVisible('#screen-setup'));
  });

  test('Tastatur: Ziffer 1–4 wählt die Antwort; richtig geht sofort weiter, bei falsch geht Enter weiter', async (t) => {
    const page = await open(t, { settings: { rounds: 2 } });
    await page.click('#start-btn');
    // Runde 1: die richtige Antwort per Ziffer → sofort Runde 2
    await waitPhase(page, 'answer');
    const sum = await handSum(page);
    const values = await page.$$eval('#choices button', (bs) => bs.map((b) => Number(b.dataset.value)));
    await page.keyboard.press(String(values.indexOf(sum) + 1));
    await page.waitForFunction(() => document.getElementById('round-label').textContent === 'Runde 2 vo 2');
    // Runde 2: absichtlich falsch → Rückmeldung, Enter beendet das Spiel
    await waitPhase(page, 'answer');
    const sum2 = await handSum(page);
    const values2 = await page.$$eval('#choices button', (bs) => bs.map((b) => Number(b.dataset.value)));
    await page.keyboard.press(String(values2.findIndex((v) => v !== sum2) + 1));
    await waitPhase(page, 'feedback');
    assert.equal(await page.textContent('#verdict'), `Naa, des warn ${sum2}.`);
    assert.equal(await page.textContent('#next-btn'), 'Abrechna');
    await page.keyboard.press('Enter');
    await waitPhase(page, 'summary');
    assert.equal(await page.textContent('#sum-correct'), '1 / 2');
  });

  test('Auswahlmodus: richtige Antwort → sofort nächste Runde, Serie steigt, kurzes Aufblitzen', async (t) => {
    const page = await open(t);
    await watchFeedback(page);
    await page.click('#start-btn');
    await playChoiceRound(page);
    assert.ok(await page.evaluate(() => document.querySelector('.table').classList.contains('flash-ok')), 'Aufblitzen sofort nach der Antwort');
    assert.equal(await page.textContent('#round-label'), 'Runde 2 vo 3');
    assert.equal(await page.textContent('#streak-label'), 'Serie: 1');
    assert.equal(await phase(page), 'reveal', 'Karten der nächsten Runde werden schon ausgeteilt');
    assert.equal(await feedbackShown(page), false);
    await page.waitForFunction(() => !document.querySelector('.table').classList.contains('flash-ok'), null, { timeout: 3000 });
  });

  test('richtig, dann falsch: bei der falschen Antwort kommt die Rückmeldung mit Rechnung, die Serie ist weg', async (t) => {
    const page = await open(t, { settings: { rounds: 3 } });
    await watchFeedback(page);
    await page.click('#start-btn');
    await playChoiceRound(page); // richtig → weiter
    assert.equal(await feedbackShown(page), false);
    const sum = await playChoiceRound(page, { wrong: true });
    assert.equal(await feedbackShown(page), true);
    assert.equal(await page.textContent('#verdict'), `Naa, des warn ${sum}.`);
    assert.equal(await page.textContent('#equation'), L.formatEquation((await handIds(page)).map(L.cardById)));
    assert.equal(await page.textContent('#streak-label'), 'Serie: 0');
    assert.equal(await page.textContent('#sr-status'), '', 'keine „richtig“-Ansage bei falscher Antwort');
    await page.click('#next-btn');
    await waitPhase(page, 'reveal');
    assert.equal(await page.textContent('#round-label'), 'Runde 3 vo 3');
  });

  test('Aufblitzen: richtig = grün, falsch = rot, abgelaufene Zeit = rot; danach verschwindet es wieder', async (t) => {
    const page = await open(t, { settings: { rounds: 4, answerLimitEnabled: true, answerLimitSeconds: 2 } });
    await page.click('#start-btn');
    await playChoiceRound(page);
    assert.deepEqual(await flashClasses(page), ['flash-ok'], 'richtig: nur grün');
    await page.waitForFunction(() => document.querySelector('.table').className.indexOf('flash') < 0, null, { timeout: 3000 });
    await playChoiceRound(page, { wrong: true });
    assert.deepEqual(await flashClasses(page), ['flash-bad'], 'falsch: nur rot');
    assert.equal(await phase(page), 'feedback', 'rotes Aufblitzen und Rückmeldung zusammen');
    await page.waitForFunction(() => document.querySelector('.table').className.indexOf('flash') < 0, null, { timeout: 3000 });
    await page.click('#next-btn');
    await waitPhase(page, 'answer');
    await waitPhase(page, 'feedback'); // Zeit läuft ab
    assert.deepEqual(await flashClasses(page), ['flash-bad'], 'abgelaufene Zeit zählt als falsch: rot');
  });

  test('Aufblitzen: schnelle Folge richtig → falsch zeigt nur die aktuelle Farbe', async (t) => {
    const page = await open(t, { settings: { rounds: 3, displaySeconds: 0.5 } });
    await page.click('#start-btn');
    await playChoiceRound(page);
    await playChoiceRound(page, { wrong: true });
    const now = await flashClasses(page);
    assert.deepEqual(now, ['flash-bad'], 'grün und rot nie gleichzeitig');
  });

  test('Vibration: richtig = kurzes Antippen, falsch = deutlich längerer Brummer', async (t) => {
    const page = await open(t, { recordVibration: true, settings: { vibration: true, rounds: 4 } });
    await page.click('#start-btn');
    await playChoiceRound(page);
    assert.deepEqual(await vibrations(page), [L.VIBRATION.right], 'richtig: ein kurzer Impuls');
    await playChoiceRound(page, { wrong: true });
    const [right, wrong] = await vibrations(page);
    assert.deepEqual([right, wrong], [L.VIBRATION.right, L.VIBRATION.wrong]);
    assert.ok(wrong >= right * 5, 'falsch ist klar länger als richtig');
  });

  test('Vibration: abgelaufene Zeit vibriert lang wie eine falsche Antwort', async (t) => {
    const page = await open(t, { recordVibration: true, settings: { vibration: true, answerLimitEnabled: true, answerLimitSeconds: 2 } });
    await page.click('#start-btn');
    await waitPhase(page, 'feedback');
    assert.deepEqual(await vibrations(page), [L.VIBRATION.wrong]);
  });

  test('Vibration aus: gar keine Vibration, auch nicht beim Ziffernblock', async (t) => {
    const page = await open(t, { recordVibration: true, settings: { vibration: false, inputMode: 'number', rounds: 3 } });
    await page.click('#start-btn');
    await waitPhase(page, 'answer');
    await page.click('.key[data-key="1"]');
    await playNumberRound(page, { wrong: true });
    assert.deepEqual(await vibrations(page), []);
  });

  test('Vibration: Ziffernblock gibt bei jedem Tastendruck einen ganz leichten Impuls', async (t) => {
    const page = await open(t, { recordVibration: true, settings: { vibration: true, inputMode: 'number' } });
    await page.click('#start-btn');
    await waitPhase(page, 'answer');
    await page.click('.key[data-key="4"]');
    await page.click('.key[data-key="2"]');
    assert.deepEqual(await vibrations(page), [L.VIBRATION.key, L.VIBRATION.key]);
  });

  test('letzte Runde: richtig → direkt Auswertung; falsch → erst die Rechnung, dann Auswertung', async (t) => {
    const right = await open(t, { settings: { rounds: 1 } });
    await right.click('#start-btn');
    await playChoiceRound(right);
    await waitPhase(right, 'summary');
    assert.equal(await right.textContent('#sum-accuracy'), '100 %');

    const wrong = await open(t, { settings: { rounds: 1 } });
    await wrong.click('#start-btn');
    await playChoiceRound(wrong, { wrong: true });
    assert.equal(await wrong.textContent('#next-btn'), 'Abrechna');
    assert.equal(await phase(wrong), 'feedback');
    await wrong.click('#next-btn');
    await waitPhase(wrong, 'summary');
    assert.equal(await wrong.textContent('#sum-accuracy'), '0 %');
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

  test('Layout kennt die Zahl der sichtbaren Einstellungszeilen (damit sie die Höhe teilen)', async (t) => {
    const page = await open(t);
    const rows = () => page.evaluate(() => { const f = document.getElementById('settings-form'); return [f.style.getPropertyValue('--rows'), f.style.getPropertyValue('--rows2')]; });
    assert.deepEqual(await rows(), ['11', '6']);
    await page.click('label[for="set-revealMode-sequential"]');
    assert.deepEqual(await rows(), ['12', '6']);
    await page.click('#set-answerLimitEnabled');
    assert.deepEqual(await rows(), ['13', '7']);
    await page.click('label[for="set-gameMode-endless"]');
    assert.deepEqual(await rows(), ['12', '6']);
    await page.click('label[for="set-language-hochdeutsch"]');
    assert.deepEqual(await rows(), ['12', '6'], 'bleibt nach Sprachwechsel erhalten');
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
