'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../../js/logic.js');

const card = (id) => L.cardById(id);
const hand = (...ids) => ids.map(card);

// ---------------------------------------------------------------------------
test.describe('Blatt & Augen', () => {
  test('kurzes Blatt hat 24 verschiedene Karten (4 Farben × 6 Schläge)', () => {
    const deck = L.createDeck();
    assert.equal(deck.length, 24);
    assert.equal(new Set(deck.map((c) => c.id)).size, 24);
    for (const suit of L.SUITS) assert.equal(deck.filter((c) => c.suit === suit).length, 6);
    for (const rank of L.RANKS) assert.equal(deck.filter((c) => c.rank === rank).length, 4);
  });

  test('Augenwerte nach Schafkopf-Regeln', () => {
    assert.deepEqual(L.POINTS, { neun: 0, zehn: 10, unter: 2, ober: 3, koenig: 4, sau: 11 });
  });

  test('das ganze Blatt hat 120 Augen', () => {
    assert.equal(L.sumPoints(L.createDeck()), 120);
  });

  test('sumPoints zählt richtig', () => {
    assert.equal(L.sumPoints([]), 0);
    assert.equal(L.sumPoints(hand('herz-sau', 'gras-zehn', 'eichel-ober', 'schellen-neun')), 24);
    assert.equal(L.sumPoints(hand('herz-sau', 'gras-sau', 'eichel-sau', 'schellen-sau')), 44);
    assert.equal(L.sumPoints(hand('herz-neun', 'gras-neun', 'eichel-neun', 'schellen-neun')), 0);
    assert.equal(L.sumPoints(hand('herz-unter', 'gras-ober', 'eichel-koenig', 'schellen-unter')), 11);
  });

  test('cardById erkennt gültige und lehnt ungültige IDs ab', () => {
    assert.deepEqual(card('gras-koenig'), { id: 'gras-koenig', suit: 'gras', rank: 'koenig', points: 4 });
    assert.equal(L.cardById('pik-ass'), null);
    assert.equal(L.cardById('herz-acht'), null);
    assert.equal(L.cardById('herz'), null);
    assert.equal(L.cardById(''), null);
    assert.equal(L.cardById('herz-ober-x'), null);
  });

  test('cardLabel liefert lesbare Namen', () => {
    assert.equal(L.cardLabel(card('schellen-koenig')), 'Schellen-König');
    assert.equal(L.cardLabel(card('eichel-sau')), 'Eichel-Sau');
  });

  test('formatEquation zeigt die Rechnung', () => {
    assert.equal(L.formatEquation(hand('herz-sau', 'gras-zehn', 'eichel-ober', 'schellen-neun')), '11 + 10 + 3 + 0 = 24');
  });
});

// ---------------------------------------------------------------------------
test.describe('Zufall & Ziehen', () => {
  test('gleicher Seed → gleiche Folge, anderer Seed → andere Folge', () => {
    const a = L.createRng(42), b = L.createRng(42), c = L.createRng(43);
    const sa = Array.from({ length: 10 }, a);
    assert.deepEqual(sa, Array.from({ length: 10 }, b));
    assert.notDeepEqual(sa, Array.from({ length: 10 }, c));
    sa.forEach((x) => assert.ok(x >= 0 && x < 1));
  });

  test('ohne gültigen Seed wird Math.random verwendet', () => {
    assert.equal(L.createRng(undefined), Math.random);
    assert.equal(L.createRng(null), Math.random);
    assert.equal(L.createRng(''), Math.random);
    assert.equal(L.createRng('abc'), Math.random);
    assert.notEqual(L.createRng('0'), Math.random);
  });

  test('Seed 0 liefert trotzdem eine brauchbare Folge', () => {
    const r = L.createRng(0);
    const values = new Set(Array.from({ length: 50 }, r));
    assert.ok(values.size > 45);
  });

  test('shuffle verändert das Original nicht und behält alle Elemente', () => {
    const list = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = L.shuffle(list, L.createRng(1));
    assert.deepEqual(list, [1, 2, 3, 4, 5, 6, 7, 8]);
    assert.deepEqual([...out].sort(), [...list].sort());
  });

  test('drawCards zieht 4 verschiedene Karten aus dem Blatt', () => {
    const rng = L.createRng(5);
    const deck = L.createDeck();
    for (let i = 0; i < 500; i++) {
      const h = L.drawCards(deck, 4, rng);
      assert.equal(h.length, 4);
      assert.equal(new Set(h.map((c) => c.id)).size, 4);
      h.forEach((c) => assert.ok(deck.some((d) => d.id === c.id)));
    }
    assert.equal(deck.length, 24, 'Blatt bleibt unverändert');
  });

  test('drawCards verteilt ungefähr gleichmäßig', () => {
    const rng = L.createRng(99);
    const deck = L.createDeck();
    const counts = {};
    const N = 12000;
    for (let i = 0; i < N; i++) L.drawCards(deck, 4, rng).forEach((c) => { counts[c.id] = (counts[c.id] || 0) + 1; });
    const expected = (N * 4) / 24; // 2000
    Object.values(counts).forEach((n) => assert.ok(Math.abs(n - expected) < expected * 0.1, `Abweichung zu groß: ${n}`));
  });

  test('drawCards gewichtet: schwere Karten kommen öfter', () => {
    const rng = L.createRng(7);
    const deck = L.createDeck();
    const weights = Object.fromEntries(deck.map((c) => [c.id, c.id === 'herz-ober' ? 5 : 1]));
    let hits = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) if (L.drawCards(deck, 4, rng, weights).some((c) => c.id === 'herz-ober')) hits++;
    // ungewichtet wären es 4/24 ≈ 16,7 %, gewichtet deutlich mehr
    assert.ok(hits / N > 0.4, `nur ${hits / N}`);
  });

  test('drawCards gewichtet: trotzdem nie doppelt, ungültige Gewichte zählen als 1', () => {
    const rng = L.createRng(8);
    const deck = L.createDeck();
    const weights = { 'herz-sau': 1000, 'gras-sau': -3, 'eichel-sau': NaN, 'schellen-sau': 'x' };
    for (let i = 0; i < 300; i++) {
      const h = L.drawCards(deck, 4, rng, weights);
      assert.equal(new Set(h.map((c) => c.id)).size, 4);
    }
  });

  test('drawCards wirft bei zu wenig Karten', () => {
    assert.throws(() => L.drawCards(L.createDeck().slice(0, 3), 4, Math.random), /Nicht genug/);
  });

  test('drawCards mit Standardwerten', () => {
    assert.equal(L.drawCards(L.createDeck()).length, 4);
  });
});

// ---------------------------------------------------------------------------
test.describe('Antwortoptionen („knapp daneben“)', () => {
  test('mögliche Summen: 0 bis 44, aber nicht jede Zahl', () => {
    const sums = L.achievableSums();
    assert.equal(sums[0], 0);
    assert.equal(sums[sums.length - 1], 44);
    assert.ok(!L.isAchievable(1), '1 Auge geht mit vier Karten nicht');
    assert.ok(L.isAchievable(43), '3 Säue + Zehn');
    assert.ok(L.isAchievable(24));
    assert.ok(!L.isAchievable(45));
    assert.ok(!L.isAchievable(-1));
  });

  test('isAchievable stimmt mit Brute-Force überein', () => {
    const vals = [0, 0, 0, 0, 10, 10, 10, 10, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 11, 11, 11, 11];
    const set = new Set();
    for (let a = 0; a < 24; a++) for (let b = a + 1; b < 24; b++) for (let c = b + 1; c < 24; c++) for (let d = c + 1; d < 24; d++) set.add(vals[a] + vals[b] + vals[c] + vals[d]);
    for (let v = -2; v <= 46; v++) assert.equal(L.isAchievable(v), set.has(v), `Summe ${v}`);
  });

  test('typische Zählfehler je Karte', () => {
    assert.deepEqual(L.typicalErrorOffsets(hand('herz-neun')), []);
    assert.deepEqual(L.typicalErrorOffsets(hand('herz-sau')), [-1]);
    assert.deepEqual(L.typicalErrorOffsets(hand('herz-zehn')), [1]);
    assert.deepEqual(L.typicalErrorOffsets(hand('herz-ober')).sort(), [-1, -3, 1].sort());
  });

  test('für jede mögliche Hand: 4 verschiedene Optionen, Lösung dabei, alles 0–44, knapp', () => {
    const rng = L.createRng(2024);
    const deck = L.createDeck();
    for (let i = 0; i < 3000; i++) {
      const h = L.drawCards(deck, 4, rng);
      const correct = L.sumPoints(h);
      const choices = L.makeChoices(correct, h, rng);
      assert.equal(choices.length, 4);
      assert.equal(new Set(choices).size, 4, `doppelt: ${choices}`);
      assert.ok(choices.includes(correct));
      choices.forEach((v) => {
        assert.ok(Number.isInteger(v) && v >= 0 && v <= 44, `außerhalb: ${v}`);
        assert.ok(Math.abs(v - correct) <= 6, `zu weit weg: ${v} statt ${correct}`);
      });
    }
  });

  test('Randfälle: 0 Augen und 44 Augen', () => {
    const rng = L.createRng(3);
    const zero = hand('herz-neun', 'gras-neun', 'eichel-neun', 'schellen-neun');
    const max = hand('herz-sau', 'gras-sau', 'eichel-sau', 'schellen-sau');
    for (let i = 0; i < 50; i++) {
      const d0 = L.makeDistractors(0, zero, rng);
      assert.equal(d0.length, 3);
      d0.forEach((v) => assert.ok(v > 0 && v <= 6));
      const d44 = L.makeDistractors(44, max, rng);
      d44.forEach((v) => assert.ok(v < 44 && v >= 38));
    }
  });

  test('falsche Antworten sind überwiegend mögliche Summen', () => {
    const rng = L.createRng(11);
    const deck = L.createDeck();
    let total = 0, possible = 0;
    for (let i = 0; i < 1000; i++) {
      const h = L.drawCards(deck, 4, rng);
      L.makeDistractors(L.sumPoints(h), h, rng).forEach((v) => { total++; if (L.isAchievable(v)) possible++; });
    }
    assert.ok(possible / total > 0.9, `${possible}/${total}`);
  });

  test('die Lösung steht nicht immer an derselben Stelle', () => {
    const rng = L.createRng(12);
    const deck = L.createDeck();
    const positions = [0, 0, 0, 0];
    for (let i = 0; i < 2000; i++) {
      const h = L.drawCards(deck, 4, rng);
      const c = L.sumPoints(h);
      positions[L.makeChoices(c, h, rng).indexOf(c)]++;
    }
    positions.forEach((n) => assert.ok(n > 400 && n < 600, `Verteilung: ${positions}`));
  });

  test('typische Zählfehler werden bevorzugt angeboten', () => {
    // Sau + Neunen: typischer Fehler „Sau als 10“ → 10 sollte praktisch immer dabei sein
    const rng = L.createRng(13);
    const h = hand('herz-sau', 'gras-neun', 'eichel-neun', 'schellen-neun');
    let seen = 0;
    for (let i = 0; i < 200; i++) if (L.makeDistractors(11, h, rng).includes(10)) seen++;
    assert.ok(seen > 190, `nur ${seen}/200`);
  });

  test('makeDistractors mit Standardwerten', () => {
    const d = L.makeDistractors(20);
    assert.equal(d.length, 3);
    assert.ok(!d.includes(20));
  });
});

// ---------------------------------------------------------------------------
test.describe('Eingabe prüfen', () => {
  test('parseAnswer akzeptiert nur ganze, nicht-negative Zahlen', () => {
    assert.equal(L.parseAnswer('24'), 24);
    assert.equal(L.parseAnswer(' 7 '), 7);
    assert.equal(L.parseAnswer('0'), 0);
    assert.equal(L.parseAnswer('007'), 7);
    assert.equal(L.parseAnswer(13), 13);
    for (const bad of ['', '  ', 'abc', '-3', '2.5', '2,5', '1e2', '1234', null, undefined, '12a']) {
      assert.equal(L.parseAnswer(bad), null, `"${bad}" sollte abgelehnt werden`);
    }
  });
});

// ---------------------------------------------------------------------------
test.describe('Einstellungen', () => {
  test('Standardwerte sind gültig und eingefroren', () => {
    assert.deepEqual(L.sanitizeSettings({}), { ...L.DEFAULT_SETTINGS });
    assert.ok(Object.isFrozen(L.DEFAULT_SETTINGS));
    assert.equal(L.DEFAULT_SETTINGS.displaySeconds, 3);
    assert.equal(L.DEFAULT_SETTINGS.rounds, 10);
    assert.equal(L.DEFAULT_SETTINGS.language, 'bairisch');
    assert.equal(L.DEFAULT_SETTINGS.adaptive, true);
  });

  test('Müll wird zu Standardwerten', () => {
    for (const junk of [null, undefined, 42, 'x', []]) assert.deepEqual(L.sanitizeSettings(junk), { ...L.DEFAULT_SETTINGS });
    const s = L.sanitizeSettings({ displaySeconds: 'viel', revealMode: 'kreuz', sound: 'ja', theme: 7, rounds: null, foo: 1 });
    assert.equal(s.displaySeconds, 3);
    assert.equal(s.revealMode, 'together');
    assert.equal(s.sound, true);
    assert.equal(s.theme, 'auto');
    assert.equal(s.rounds, 10);
    assert.ok(!('foo' in s));
  });

  test('Zahlen werden begrenzt und auf Schrittweite gerundet', () => {
    assert.equal(L.sanitizeSettings({ displaySeconds: 0 }).displaySeconds, 0.5);
    assert.equal(L.sanitizeSettings({ displaySeconds: 99 }).displaySeconds, 10);
    assert.equal(L.sanitizeSettings({ displaySeconds: 2.3 }).displaySeconds, 2.5);
    assert.equal(L.sanitizeSettings({ displaySeconds: '1.5' }).displaySeconds, 1.5);
    assert.equal(L.sanitizeSettings({ displaySeconds: true }).displaySeconds, 3);
    assert.equal(L.sanitizeSettings({ revealDelaySeconds: 0.73 }).revealDelaySeconds, 0.7);
    assert.equal(L.sanitizeSettings({ revealDelaySeconds: 5 }).revealDelaySeconds, 2);
    assert.equal(L.sanitizeSettings({ rounds: 0 }).rounds, 1);
    assert.equal(L.sanitizeSettings({ rounds: 12.6 }).rounds, 13);
    assert.equal(L.sanitizeSettings({ rounds: 500 }).rounds, 50);
    assert.equal(L.sanitizeSettings({ answerLimitSeconds: 1 }).answerLimitSeconds, 2);
    assert.equal(L.sanitizeSettings({ answerLimitSeconds: Infinity }).answerLimitSeconds, 8);
  });

  test('alle Auswahlwerte werden übernommen', () => {
    for (const [key, values] of Object.entries(L.ENUMS)) {
      for (const v of values) assert.equal(L.sanitizeSettings({ [key]: v })[key], v);
    }
    assert.equal(L.sanitizeSettings({ sound: false }).sound, false);
    assert.equal(L.sanitizeSettings({ answerLimitEnabled: true }).answerLimitEnabled, true);
  });
});

// ---------------------------------------------------------------------------
test.describe('Zeitplan beim Aufdecken', () => {
  test('alle gleichzeitig', () => {
    assert.deepEqual(L.revealSchedule({ displaySeconds: 3 }), { cardTimes: [0, 0, 0, 0], hideAt: 3000 });
  });

  test('nacheinander: Anzeigezeit zählt ab der letzten Karte', () => {
    assert.deepEqual(
      L.revealSchedule({ displaySeconds: 2, revealMode: 'sequential', revealDelaySeconds: 0.5 }),
      { cardTimes: [0, 500, 1000, 1500], hideAt: 3500 }
    );
  });

  test('Zeitplan nutzt bereinigte Werte', () => {
    assert.equal(L.revealSchedule({ displaySeconds: -1 }).hideAt, 500);
  });
});

// ---------------------------------------------------------------------------
test.describe('Zustandsmaschine', () => {
  test('normaler Ablauf mit Runden', () => {
    let p = 'setup';
    p = L.transition(p, 'START'); assert.equal(p, 'reveal');
    p = L.transition(p, 'HIDE'); assert.equal(p, 'answer');
    p = L.transition(p, 'ANSWER'); assert.equal(p, 'feedback');
    p = L.transition(p, 'NEXT'); assert.equal(p, 'reveal');
    p = L.transition(p, 'HIDE');
    p = L.transition(p, 'TIMEOUT'); assert.equal(p, 'feedback');
    p = L.transition(p, 'FINISH'); assert.equal(p, 'summary');
    p = L.transition(p, 'AGAIN'); assert.equal(p, 'reveal');
    p = L.transition(p, 'QUIT'); assert.equal(p, 'summary');
    p = L.transition(p, 'SHOW_STATS'); assert.equal(p, 'stats');
    p = L.transition(p, 'RESET'); assert.equal(p, 'stats');
    p = L.transition(p, 'BACK'); assert.equal(p, 'setup');
  });

  test('ungültige Übergänge werfen', () => {
    assert.throws(() => L.transition('setup', 'ANSWER'), /Ungültiger Übergang/);
    assert.throws(() => L.transition('reveal', 'ANSWER'), /Ungültiger Übergang/);
    assert.throws(() => L.transition('nirgends', 'START'), /Ungültiger Übergang/);
    assert.equal(L.canTransition('answer', 'QUIT'), true);
    assert.equal(L.canTransition('setup', 'QUIT'), false);
    assert.equal(L.canTransition('xyz', 'QUIT'), false);
  });

  test('jedes Ziel ist selbst ein gültiger Zustand', () => {
    for (const row of Object.values(L.TRANSITIONS)) for (const target of Object.values(row)) assert.ok(L.TRANSITIONS[target], target);
  });

  test('nach der Rückmeldung: weiter oder Ende', () => {
    assert.equal(L.afterFeedbackEvent({ gameMode: 'rounds', rounds: 3 }, 2), 'NEXT');
    assert.equal(L.afterFeedbackEvent({ gameMode: 'rounds', rounds: 3 }, 3), 'FINISH');
    assert.equal(L.afterFeedbackEvent({ gameMode: 'endless', rounds: 3 }, 300), 'NEXT');
  });

  test('nach einer Antwort: richtig → sofort weiter, falsch oder Zeit abgelaufen → erst Rückmeldung', () => {
    const rounds = { gameMode: 'rounds', rounds: 3 };
    assert.equal(L.afterAnswerStep(rounds, 1, true), 'NEXT');
    assert.equal(L.afterAnswerStep(rounds, 2, true), 'NEXT');
    assert.equal(L.afterAnswerStep(rounds, 3, true), 'FINISH', 'letzte richtige Antwort beendet das Spiel direkt');
    assert.equal(L.afterAnswerStep(rounds, 1, false), 'FEEDBACK');
    assert.equal(L.afterAnswerStep(rounds, 3, false), 'FEEDBACK', 'auch in der letzten Runde zuerst die Rechnung zeigen');
    const endless = { gameMode: 'endless', rounds: 1 };
    assert.equal(L.afterAnswerStep(endless, 500, true), 'NEXT');
    assert.equal(L.afterAnswerStep(endless, 500, false), 'FEEDBACK');
  });

  test('Vibration: falsch ist klar von richtig zu unterscheiden (deutlich länger)', () => {
    const { right, wrong, key } = L.VIBRATION;
    assert.ok(Number.isFinite(right) && Number.isFinite(wrong) && Number.isFinite(key), 'alle Muster sind einfache Zahlen (Millisekunden)');
    assert.ok(right <= 60, 'richtig ist ein kurzes Antippen');
    assert.ok(wrong >= 200, 'falsch ist lang genug, um sicher gespürt zu werden');
    assert.ok(wrong <= 600, 'falsch ist nicht unangenehm lang');
    assert.ok(wrong >= right * 5, 'falsch ist mindestens fünfmal so lang wie richtig – klar unterscheidbar');
    assert.ok(key < right, 'Tastendruck ist das leiseste Signal');
    assert.ok(Object.isFrozen(L.VIBRATION), 'Werte lassen sich nicht aus Versehen ändern');
  });

  test('jede Antwort-Entscheidung passt zur Zustandsmaschine (feedback → NEXT/FINISH ist erlaubt)', () => {
    for (const step of ['NEXT', 'FINISH']) assert.ok(L.canTransition('feedback', step), step);
  });
});

// ---------------------------------------------------------------------------
test.describe('Sitzung', () => {
  const h24 = hand('herz-sau', 'gras-zehn', 'eichel-ober', 'schellen-neun');

  test('richtige/falsche Antworten, Serien und Zeiten', () => {
    let s = L.createSession({ gameMode: 'endless', inputMode: 'number' });
    assert.equal(s.mode, 'endless');
    assert.equal(s.inputMode, 'number');
    s = L.recordAnswer(s, { cards: h24, answer: 24, timeMs: 1000 });
    s = L.recordAnswer(s, { cards: h24, answer: 24, timeMs: 2000 });
    s = L.recordAnswer(s, { cards: h24, answer: 23, timeMs: 3000 });
    s = L.recordAnswer(s, { cards: h24, answer: 24, timeMs: 1500.4 });
    assert.equal(s.streak, 1);
    assert.equal(s.bestStreak, 2);
    const sum = L.summarizeSession(s);
    assert.deepEqual(sum, { rounds: 4, correct: 3, accuracy: 0.75, avgTimeMs: 1875, bestStreak: 2 });
    assert.equal(s.answers[2].isCorrect, false);
    assert.equal(s.answers[2].correct, 24);
    assert.deepEqual(s.answers[0].cardIds, ['herz-sau', 'gras-zehn', 'eichel-ober', 'schellen-neun']);
  });

  test('recordAnswer verändert die alte Sitzung nicht', () => {
    const s0 = L.createSession({});
    const s1 = L.recordAnswer(s0, { cards: h24, answer: 24, timeMs: 10 });
    assert.equal(s0.answers.length, 0);
    assert.equal(s1.answers.length, 1);
  });

  test('Zeit abgelaufen zählt als falsch und nicht in den Schnitt', () => {
    let s = L.createSession({});
    s = L.recordAnswer(s, { cards: h24, answer: 24, timedOut: true, timeMs: 8000 });
    assert.equal(s.answers[0].isCorrect, false);
    assert.equal(s.answers[0].answer, null);
    assert.equal(L.summarizeSession(s).avgTimeMs, null);
    s = L.recordAnswer(s, { cards: h24, answer: 24, timeMs: 1000 });
    assert.equal(L.summarizeSession(s).avgTimeMs, 1000);
  });

  test('leere Sitzung', () => {
    assert.deepEqual(L.summarizeSession(L.createSession({})), { rounds: 0, correct: 0, accuracy: 0, avgTimeMs: null, bestStreak: 0 });
  });

  test('negative oder fehlende Zeiten werden zu 0', () => {
    let s = L.createSession({});
    s = L.recordAnswer(s, { cards: h24, answer: 24, timeMs: -5 });
    s = L.recordAnswer(s, { cards: h24, answer: 24 });
    assert.deepEqual(s.answers.map((a) => a.timeMs), [0, 0]);
  });
});

// ---------------------------------------------------------------------------
test.describe('Dauerhafter Speicher', () => {
  const h24 = hand('herz-sau', 'gras-zehn', 'eichel-ober', 'schellen-neun');
  const h11 = hand('herz-unter', 'gras-ober', 'eichel-koenig', 'schellen-unter');

  function session(results) {
    let s = L.createSession({});
    results.forEach(([cards, answer, ms]) => { s = L.recordAnswer(s, { cards, answer, timeMs: ms || 1000 }); });
    return s;
  }

  test('loadStore: leer, kaputt, falsche Typen, Zukunftsversion → leerer Speicher', () => {
    const empty = L.emptyStore();
    for (const raw of [null, '', '{', 'null', '42', '"x"', JSON.stringify({ version: 999, history: [{ rounds: 1, correct: 1 }] })]) {
      assert.deepEqual(L.loadStore(raw), empty, `raw: ${raw}`);
    }
  });

  test('Speichern und Laden ergibt dasselbe', () => {
    let st = L.emptyStore();
    st.settings = L.sanitizeSettings({ rounds: 20, language: 'hochdeutsch' });
    st = L.mergeSession(st, session([[h24, 24], [h11, 10]]), 1700000000000);
    assert.deepEqual(L.loadStore(L.serializeStore(st)), st);
  });

  test('Migration repariert halbkaputte Daten', () => {
    const raw = JSON.stringify({
      version: 1,
      settings: { rounds: 'zehn', theme: 'dark' },
      history: [{ rounds: 5, correct: 4 }, null, { rounds: 'x' }, 7],
      best: { accuracy: 'gut', bestStreak: 4, fastestAvgMs: null },
      cardStats: { 'herz-ober': { seen: 5, wrong: 9 }, 'pik-ass': { seen: 1, wrong: 1 }, 'gras-sau': { seen: 'x' } }
    });
    const st = L.loadStore(raw);
    assert.equal(st.settings.rounds, 10);
    assert.equal(st.settings.theme, 'dark');
    assert.equal(st.history.length, 1);
    assert.equal(st.best.accuracy, null);
    assert.equal(st.best.bestStreak, 4);
    assert.deepEqual(st.cardStats, { 'herz-ober': { seen: 5, wrong: 5 } });
  });

  test('Version 0 (ohne Versionsnummer) wird übernommen', () => {
    const st = L.loadStore(JSON.stringify({ settings: { rounds: 7 } }));
    assert.equal(st.version, L.STORE_VERSION);
    assert.equal(st.settings.rounds, 7);
  });

  test('mergeSession: Verlauf, Summen, Kartenstatistik', () => {
    const s = session([[h24, 24, 1000], [h11, 12, 2000]]);
    const st = L.mergeSession(L.emptyStore(), s, 123);
    assert.equal(st.history.length, 1);
    assert.deepEqual(st.history[0], { date: 123, rounds: 2, correct: 1, avgTimeMs: 1500, bestStreak: 1, mode: 'rounds', inputMode: 'choice' });
    assert.equal(st.best.totalRounds, 2);
    assert.equal(st.best.totalCorrect, 1);
    assert.equal(st.best.bestStreak, 1);
    assert.equal(st.best.accuracy, null, 'unter 5 Runden kein Quoten-Bestwert');
    assert.deepEqual(st.cardStats['herz-sau'], { seen: 1, wrong: 0 });
    assert.deepEqual(st.cardStats['gras-ober'], { seen: 1, wrong: 1 });
  });

  test('mergeSession verändert den alten Speicher nicht', () => {
    const before = L.emptyStore();
    const copy = JSON.parse(JSON.stringify(before));
    L.mergeSession(before, session([[h24, 24]]), 1);
    assert.deepEqual(before, copy);
  });

  test('leere Sitzung ändert nichts', () => {
    const st = L.emptyStore();
    assert.equal(L.mergeSession(st, L.createSession({}), 1), st);
  });

  test('Bestwerte: Quote und Tempo ab 5 Runden, Tempo nur bei ≥ 80 % Treffern', () => {
    let st = L.emptyStore();
    st = L.mergeSession(st, session(Array(5).fill([h24, 24, 3000])), 1);
    assert.equal(st.best.accuracy, 1);
    assert.equal(st.best.fastestAvgMs, 3000);
    // schneller, aber schlecht → kein Tempo-Rekord
    st = L.mergeSession(st, session([[h24, 1, 500], [h24, 1, 500], [h24, 24, 500], [h24, 1, 500], [h24, 1, 500]]), 2);
    assert.equal(st.best.fastestAvgMs, 3000);
    assert.equal(st.best.accuracy, 1);
    // schneller und gut → neuer Rekord
    st = L.mergeSession(st, session(Array(5).fill([h24, 24, 2000])), 3);
    assert.equal(st.best.fastestAvgMs, 2000);
    assert.equal(st.best.bestStreak, 5);
    assert.equal(st.best.totalRounds, 15);
  });

  test('Verlauf wird auf HISTORY_LIMIT begrenzt', () => {
    let st = L.emptyStore();
    for (let i = 0; i < L.HISTORY_LIMIT + 7; i++) st = L.mergeSession(st, session([[h24, 24]]), i);
    assert.equal(st.history.length, L.HISTORY_LIMIT);
    assert.equal(st.history[0].date, 7);
  });
});

// ---------------------------------------------------------------------------
test.describe('Schwachstellen', () => {
  test('Fehlerquote ist geglättet', () => {
    assert.equal(L.cardErrorRate(undefined), 0);
    assert.equal(L.cardErrorRate({ seen: 0, wrong: 0 }), 0);
    assert.equal(L.cardErrorRate({ seen: 2, wrong: 2 }), 0.5);
    assert.equal(L.cardErrorRate({ seen: 8, wrong: 8 }), 0.8);
  });

  test('Gewichte: 1 ohne Daten, bis knapp 5 bei vielen Fehlern', () => {
    const w0 = L.cardWeights({});
    assert.equal(Object.keys(w0).length, 24);
    Object.values(w0).forEach((w) => assert.equal(w, 1));
    const w = L.cardWeights({ 'herz-ober': { seen: 98, wrong: 98 }, 'gras-sau': { seen: 10, wrong: 0 } });
    assert.ok(w['herz-ober'] > 4.9 && w['herz-ober'] <= 5);
    assert.equal(w['gras-sau'], 1);
    assert.deepEqual(L.cardWeights(undefined), w0);
  });

  test('weakestCards sortiert nach Fehlerquote und filtert seltene Karten', () => {
    const stats = {
      'herz-ober': { seen: 10, wrong: 5 },
      'gras-unter': { seen: 4, wrong: 4 },
      'eichel-sau': { seen: 2, wrong: 2 },  // zu selten
      'schellen-zehn': { seen: 9, wrong: 0 }, // nie falsch
      'herz-koenig': { seen: 10, wrong: 5 }
    };
    const weak = L.weakestCards(stats, 6, 3);
    assert.deepEqual(weak.map((w) => w.id), ['gras-unter', 'herz-koenig', 'herz-ober']);
    assert.equal(weak[0].rate, 1);
    assert.equal(L.weakestCards(stats, 1, 3).length, 1);
    assert.deepEqual(L.weakestCards(undefined), []);
    assert.equal(L.weakestCards(stats).length, 3);
  });
});

// ---------------------------------------------------------------------------
test.describe('Texte', () => {
  test('beide Sprachen haben genau dieselben Schlüssel', () => {
    const a = Object.keys(L.TEXTS.bairisch).sort();
    const b = Object.keys(L.TEXTS.hochdeutsch).sort();
    assert.deepEqual(a, b);
  });

  test('Platzhalter stimmen in beiden Sprachen überein', () => {
    const ph = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
    for (const key of Object.keys(L.TEXTS.hochdeutsch)) {
      assert.equal(ph(L.TEXTS.bairisch[key]), ph(L.TEXTS.hochdeutsch[key]), key);
    }
  });

  test('t() setzt Werte ein und fällt sinnvoll zurück', () => {
    assert.equal(L.t('bairisch', 'wrong', { n: 24 }), 'Naa, des warn 24.');
    assert.equal(L.t('hochdeutsch', 'wrong', { n: 24 }), 'Leider falsch – es waren 24.');
    assert.equal(L.t('hochdeutsch', 'roundOf', { i: 2, n: 10 }), 'Runde 2 von 10');
    assert.equal(L.t('hochdeutsch', 'roundOf', { i: 2 }), 'Runde 2 von {n}');
    assert.equal(L.t('klingonisch', 'question'), L.TEXTS.bairisch.question);
    assert.equal(L.t('bairisch', 'gibtsned'), 'gibtsned');
  });

  test('Formatierung', () => {
    assert.equal(L.formatSeconds(1875), '1,9 s');
    assert.equal(L.formatSeconds(null), null);
    assert.equal(L.formatSeconds(undefined), null);
    assert.equal(L.formatPercent(0.756), '76 %');
    assert.equal(L.formatPercent(null), null);
    assert.equal(L.formatPercent(NaN), null);
  });
});
