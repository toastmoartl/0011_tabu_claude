'use strict';
/*
 * Responsives Layout: In jeder getesteten Bildschirmgröße muss jede Ansicht
 * ohne Scrollen komplett sichtbar sein (Ziel: Samsung Galaxy S23, 360×780 CSS-Pixel,
 * im Browser nach Abzug der Leisten eher 360×~680).
 *
 * Geprüft wird je Ansicht: kein Scrollen (Seite und Ansicht), nichts ragt über den
 * Rand, kein abgeschnittener Text, Bedienelemente sind groß genug, Karten sind
 * gleich groß und überlappen nicht.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const L = require('../../js/logic.js');

const PAGE_URL = 'file://' + path.resolve(__dirname, '../../index.html') + '?seed=21';

const VIEWPORTS = [
  { name: 'Samsung S23 (Vollbild) 360×780', w: 360, h: 780, phone: true, minCard: 130 },
  { name: 'Samsung S23 im Chrome 360×680', w: 360, h: 680, phone: true, minCard: 120 },
  { name: 'kleinstes Zielgerät 360×640', w: 360, h: 640, phone: true, minCard: 110 },
  { name: 'iPhone SE 375×667', w: 375, h: 667, phone: true, minCard: 115 },
  { name: 'iPhone 14 390×844', w: 390, h: 844, phone: true, minCard: 140 },
  { name: 'Galaxy S23 Ultra 412×915', w: 412, h: 915, phone: true, minCard: 150 },
  { name: 'Tablet hoch 768×1024', w: 768, h: 1024, phone: false, minCard: 160 },
  { name: 'S23 quer 780×360', w: 780, h: 360, phone: true, minCard: 90 },
  { name: 'Handy quer groß 844×390', w: 844, h: 390, phone: true, minCard: 100 },
  { name: 'Laptop 1280×720', w: 1280, h: 720, phone: false, minCard: 150 },
  { name: 'Full HD 1920×1080', w: 1920, h: 1080, phone: false, minCard: 190 }
];

let browser;
test.before(async () => { browser = await chromium.launch(); });
test.after(async () => { if (browser) await browser.close(); });

const FAST = { sound: false, vibration: false };

function storeJson(settings, extra) {
  const st = L.emptyStore();
  st.settings = L.sanitizeSettings({ ...FAST, ...settings });
  if (extra) extra(st);
  return JSON.stringify(st);
}

async function load(page, settings, extra) {
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [L.STORAGE_KEY, storeJson(settings, extra)]);
  await page.reload();
  await page.waitForSelector('body.ready');
}

/** Liefert eine Liste von Problemen der gerade sichtbaren Ansicht (leer = alles in Ordnung). */
async function problemsOf(page, { minControl = 26, minCoaster = 44 } = {}) {
  return page.evaluate(([minControlPx, minCoasterPx]) => {
    const problems = [];
    const de = document.documentElement;
    const screen = document.querySelector('.screen:not([hidden])');
    const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
    const name = (el) => (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : '') || el.tagName;

    if (de.scrollWidth > innerWidth + 1) problems.push(`Seite scrollt waagerecht (${de.scrollWidth} > ${innerWidth})`);
    if (de.scrollHeight > innerHeight + 1) problems.push(`Seite scrollt senkrecht (${de.scrollHeight} > ${innerHeight})`);
    if (window.scrollY !== 0 || window.scrollX !== 0) problems.push('Seite ist verschoben');
    if (screen.scrollHeight - screen.clientHeight > 1) problems.push(`Ansicht scrollt senkrecht (${screen.scrollHeight - screen.clientHeight}px zu hoch)`);
    if (screen.scrollWidth - screen.clientWidth > 1) problems.push(`Ansicht scrollt waagerecht (${screen.scrollWidth - screen.clientWidth}px zu breit)`);

    const inside = 'button, .card, .field, .hud, .prompt, .verdict, .equation, .timer, input:not([type=radio]):not([type=checkbox]), .tally, .sparkline, .weak, .coaster, .key, .segment, .switch';
    for (const el of screen.querySelectorAll(inside)) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.left < -0.5 || r.top < -0.5 || r.right > innerWidth + 0.5 || r.bottom > innerHeight + 0.5) {
        problems.push(`${name(el)} ragt aus dem Bildschirm (l${Math.round(r.left)} t${Math.round(r.top)} r${Math.round(r.right)} b${Math.round(r.bottom)})`);
      }
    }

    for (const el of screen.querySelectorAll('.btn, .segment label, .field > label, .field-label, .key, .coaster, .tally dt, .tally dd, .verdict, .equation, .your-answer, .prompt, .weak-name')) {
      if (visible(el) && el.scrollWidth > el.clientWidth + 1) problems.push(`Text abgeschnitten: ${name(el)} „${el.textContent.trim().slice(0, 24)}“`);
    }

    for (const el of screen.querySelectorAll('button, .segment label, .switch, input[type=range]')) {
      if (!visible(el) || el.closest('[hidden]')) continue;
      const r = el.getBoundingClientRect();
      const need = el.classList.contains('coaster') ? minCoasterPx : minControlPx;
      if (r.height < need - 0.5) problems.push(`${name(el)} zu niedrig zum Antippen (${Math.round(r.height)}px < ${need}px)`);
    }
    for (const el of screen.querySelectorAll('.coaster')) {
      const r = el.getBoundingClientRect();
      if (visible(el) && Math.min(r.width, r.height) < minCoasterPx - 0.5) problems.push(`Bierdeckel zu klein (${Math.round(r.width)}px)`);
    }
    return problems;
  }, [minControl, minCoaster]);
}

async function cardProblems(page, minCard) {
  return page.evaluate((min) => {
    const problems = [];
    const rects = [...document.querySelectorAll('#hand .card')].map((c) => c.getBoundingClientRect());
    if (rects.length !== 4) return ['nicht vier Karten: ' + rects.length];
    for (const r of rects) {
      if (Math.abs(r.width - rects[0].width) > 1) problems.push('Karten sind unterschiedlich breit');
      if (Math.abs(r.height / r.width - 1.5) > 0.02) problems.push(`Karte hat falsches Seitenverhältnis (${(r.height / r.width).toFixed(2)})`);
    }
    if (rects[0].width < min) problems.push(`Karten zu klein: ${Math.round(rects[0].width)}px < ${min}px`);
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
      const a = rects[i], b = rects[j];
      if (a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5) problems.push(`Karte ${i + 1} überlappt Karte ${j + 1}`);
    }
    return problems;
  }, minCard);
}

const phase = (page) => page.evaluate(() => document.body.dataset.phase);
const waitPhase = (page, p) => page.waitForFunction((x) => document.body.dataset.phase === x, p, { timeout: 8000 });

const STATS_DATA = (st) => {
  st.history = Array.from({ length: 20 }, (_, i) => ({ date: i, rounds: 10, correct: 5 + (i % 5), avgTimeMs: 2500, bestStreak: 4, mode: 'rounds', inputMode: 'choice' }));
  st.best = { accuracy: 0.9, bestStreak: 7, fastestAvgMs: 1900, totalRounds: 200, totalCorrect: 150 };
  st.cardStats = {
    'schellen-unter': { seen: 15, wrong: 6 }, 'gras-koenig': { seen: 18, wrong: 8 }, 'herz-ober': { seen: 20, wrong: 9 },
    'eichel-zehn': { seen: 12, wrong: 5 }, 'herz-sau': { seen: 10, wrong: 4 }, 'gras-neun': { seen: 9, wrong: 3 }
  };
};

test.describe('Responsives Layout: alles ohne Scrollen sichtbar', { concurrency: 4 }, () => {
  for (const vp of VIEWPORTS) {
    test(vp.name, async () => {
      const context = await browser.newContext({
        viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 1, reducedMotion: 'reduce',
        isMobile: vp.phone, hasTouch: vp.phone
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      const found = [];
      const check = async (label, extra = []) => {
        const list = (await problemsOf(page)).concat(extra);
        for (const p of list) found.push(`[${label}] ${p}`);
      };

      try {
        await page.goto(PAGE_URL);

        // 1–3: Einstellungen – Standard, Höchstzahl an Zeilen (13), und mit den längeren hochdeutschen Texten
        await load(page, {});
        await check('Einstellungen (Standard)');
        await load(page, { revealMode: 'sequential', answerLimitEnabled: true });
        assert.equal(await page.locator('#settings-form .field:visible').count(), 13);
        await check('Einstellungen (alle 13 Zeilen)');
        await load(page, { revealMode: 'sequential', answerLimitEnabled: true, language: 'hochdeutsch' });
        await check('Einstellungen (alle 13 Zeilen, Hochdeutsch)');

        // 4: Karten aufgedeckt
        await load(page, { displaySeconds: 10 });
        await page.click('#start-btn');
        await page.waitForFunction(() => document.querySelectorAll('#hand .card.up').length === 4);
        await page.waitForTimeout(550); // Umdreh-Animation ist mit reduzierter Bewegung kurz
        await check('Karten aufgedeckt', await cardProblems(page, vp.minCard));

        // 5: Frage mit vier Bierdeckeln
        await load(page, { displaySeconds: 0.5 });
        await page.click('#start-btn');
        await page.waitForSelector('#choices:not([hidden])');
        assert.equal(await page.locator('#choices .coaster').count(), 4);
        await check('Antwort: Bierdeckel');

        // 6–8: Zahleneingabe mit Ziffernblock, Rückmeldung (falsch) und Auswertung
        await load(page, { displaySeconds: 0.5, inputMode: 'number', rounds: 1, answerLimitEnabled: true, answerLimitSeconds: 20 });
        await page.click('#start-btn');
        await page.waitForSelector('#number-form:not([hidden])');
        await page.click('.key[data-key="9"]');
        await check('Antwort: Ziffernblock');
        await page.click('#check-btn');
        await waitPhase(page, 'feedback');
        await page.waitForTimeout(550);
        await check('Rückmeldung (falsch)', await cardProblems(page, Math.min(vp.minCard, 100)));
        await page.click('#next-btn');
        await waitPhase(page, 'summary');
        await check('Auswertung');

        // 9: Statistik mit voller Datenlage (20 Verlaufspunkte, 6 Schwachstellen)
        await load(page, { language: 'hochdeutsch' }, STATS_DATA);
        await page.click('#stats-btn');
        await waitPhase(page, 'stats');
        assert.equal(await page.locator('#weak-cards li').count(), 6);
        await check('Statistik (voll)');
      } finally {
        await context.close();
      }

      assert.deepEqual(found, [], `Layout-Probleme bei ${vp.name}:\n  ${found.join('\n  ')}`);
      assert.deepEqual(errors, [], 'keine JS-Fehler');
    });
  }
});

test.describe('Responsives Layout: Eigenschaften', () => {
  test('Seite lässt sich nicht verzoomen oder verschieben (feste Ansicht, kein Scrollen)', async () => {
    const context = await browser.newContext({ viewport: { width: 360, height: 680 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    await page.goto(PAGE_URL);
    await page.waitForSelector('body.ready');
    const info = await page.evaluate(() => ({
      meta: document.querySelector('meta[name=viewport]').content,
      overflow: getComputedStyle(document.body).overflow,
      touch: getComputedStyle(document.body).touchAction,
      themeColors: document.querySelectorAll('meta[name=theme-color]').length
    }));
    await context.close();
    assert.match(info.meta, /width=device-width/);
    assert.match(info.meta, /viewport-fit=cover/);
    assert.equal(info.overflow, 'hidden');
    assert.equal(info.touch, 'manipulation');
    assert.equal(info.themeColors, 2);
  });

  test('Seite nutzt die ganze Höhe: Spieltisch endet knapp über dem unteren Rand', async () => {
    const context = await browser.newContext({ viewport: { width: 360, height: 680 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto(PAGE_URL);
    await load(page, { displaySeconds: 10 });
    await page.click('#start-btn');
    await page.waitForSelector('#hand .card.up');
    const bottom = await page.evaluate(() => Math.round(document.querySelector('.table').getBoundingClientRect().bottom));
    await context.close();
    assert.ok(bottom >= 680 - 20 && bottom <= 680, `Spieltisch endet bei ${bottom}px von 680px`);
  });

  test('Tastaturlos: Zahleneingabe öffnet keine Bildschirmtastatur (inputmode=none)', async () => {
    const context = await browser.newContext({ viewport: { width: 360, height: 680 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    await page.goto(PAGE_URL);
    const mode = await page.getAttribute('#number-input', 'inputmode');
    await context.close();
    assert.equal(mode, 'none');
  });
});
