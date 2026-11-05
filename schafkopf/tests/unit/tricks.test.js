'use strict';
/*
 * Realistische Stiche: Statt vier Karten zu würfeln, wird ein echtes Spiel (Sauspiel, 24 Karten,
 * 4 Spieler à 6 Karten) mit den Regeln durchgespielt – Bedienzwang, Trumpf, Stichgewinner spielt aus.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../../js/logic.js');

const c = (id) => L.cardById(id);
const cards = (...ids) => ids.map(c);
const N = 20000;

function frequencies(gen, n = N) {
  const kinds = {};
  const trumps = [0, 0, 0, 0, 0];
  for (let i = 0; i < n; i++) {
    const p = L.stichProfile(gen());
    kinds[p.kind] = (kinds[p.kind] || 0) + 1;
    trumps[p.trumps]++;
  }
  const pct = (x) => (x / n) * 100;
  return { kind: (k) => pct(kinds[k] || 0), trumps: (k) => pct(trumps[k]) };
}

// ---------------------------------------------------------------------------
test.describe('Trümpfe und ihre Reihenfolge (Sauspiel)', () => {
  test('12 von 24 Karten sind Trumpf: alle Ober, alle Unter und die Herz-Karten', () => {
    const deck = L.createDeck();
    const trumps = deck.filter(L.isTrump);
    assert.equal(trumps.length, 12);
    assert.equal(trumps.filter((x) => x.rank === 'ober').length, 4);
    assert.equal(trumps.filter((x) => x.rank === 'unter').length, 4);
    assert.deepEqual(trumps.filter((x) => x.suit === 'herz' && x.rank !== 'ober' && x.rank !== 'unter').map((x) => x.rank).sort(), ['koenig', 'neun', 'sau', 'zehn']);
    for (const suit of ['eichel', 'gras', 'schellen']) {
      assert.deepEqual(deck.filter((x) => x.suit === suit && !L.isTrump(x)).map((x) => x.rank).sort(), ['koenig', 'neun', 'sau', 'zehn'], `${suit}: nur Sau/Zehn/König/Neun sind Farbkarten`);
    }
  });

  test('Trumpf-Reihenfolge: alle 12 genau einmal, Eichel-Ober vorn, Herz-Neun hinten', () => {
    assert.equal(L.TRUMP_ORDER.length, 12);
    assert.equal(new Set(L.TRUMP_ORDER).size, 12);
    assert.deepEqual([...L.TRUMP_ORDER].sort(), L.createDeck().filter(L.isTrump).map((x) => x.id).sort());
    assert.equal(L.TRUMP_ORDER[0], 'eichel-ober');
    assert.equal(L.TRUMP_ORDER[11], 'herz-neun');
    assert.deepEqual(L.PLAIN_ORDER, ['sau', 'zehn', 'koenig', 'neun']);
  });

  test('„Farbe“ im Sinne des Zwangs: Trümpfe sind eine eigene Farbe, ein Ober gehört nicht zu seiner Kartenfarbe', () => {
    assert.equal(L.playSuit(c('gras-ober')), 'trumpf');
    assert.equal(L.playSuit(c('herz-neun')), 'trumpf');
    assert.equal(L.playSuit(c('gras-sau')), 'gras');
    assert.equal(L.playSuit(c('schellen-neun')), 'schellen');
  });
});

// ---------------------------------------------------------------------------
test.describe('Stichgewinner', () => {
  const winner = (...ids) => L.trickWinnerIndex(cards(...ids));

  test('in der ausgespielten Farbe gewinnt die höchste Karte: Sau > Zehn > König > Neun', () => {
    assert.equal(winner('gras-sau', 'gras-zehn', 'gras-koenig', 'gras-neun'), 0);
    assert.equal(winner('gras-neun', 'gras-koenig', 'gras-zehn', 'gras-sau'), 3);
    assert.equal(winner('gras-koenig', 'gras-neun', 'gras-zehn', 'eichel-sau'), 2, 'Zehn schlägt König und Neun; die Eichel-Sau bedient nicht');
  });

  test('andere Farben stechen nicht, auch nicht mit einer Sau (Abwerfen)', () => {
    assert.equal(winner('eichel-zehn', 'eichel-sau', 'gras-sau', 'schellen-sau'), 1);
    assert.equal(winner('gras-neun', 'eichel-sau', 'schellen-sau', 'eichel-zehn'), 0);
  });

  test('jeder Trumpf schlägt jede Farbkarte, auch Herz-Neun die Eichel-Sau', () => {
    assert.equal(winner('eichel-sau', 'herz-neun', 'gras-zehn', 'schellen-koenig'), 1);
  });

  test('Ober schlagen Unter schlagen Herz; Eichel > Gras > Herz > Schellen', () => {
    assert.equal(winner('herz-sau', 'herz-zehn', 'schellen-unter', 'herz-koenig'), 2, 'Unter schlägt Herz-Sau');
    assert.equal(winner('eichel-unter', 'schellen-ober', 'gras-unter', 'herz-sau'), 1, 'Ober schlägt jeden Unter');
    assert.equal(winner('schellen-ober', 'herz-ober', 'gras-ober', 'eichel-ober'), 3);
    assert.equal(winner('schellen-unter', 'herz-unter', 'gras-unter', 'eichel-unter'), 3);
    assert.equal(winner('herz-neun', 'herz-koenig', 'herz-zehn', 'herz-sau'), 3, 'Herz: Sau > Zehn > König > Neun');
  });

  test('komplette Trumpf-Reihenfolge: jeder Trumpf schlägt alle schwächeren, in beiden Spielreihenfolgen', () => {
    // bewusst hier ausgeschrieben (unabhängig von L.TRUMP_ORDER): Ober E-G-H-S, Unter E-G-H-S, dann Herz Sau-10-König-9
    const order = ['eichel-ober', 'gras-ober', 'herz-ober', 'schellen-ober', 'eichel-unter', 'gras-unter', 'herz-unter', 'schellen-unter',
      'herz-sau', 'herz-zehn', 'herz-koenig', 'herz-neun'];
    for (let i = 0; i < order.length; i++) {
      for (let j = i + 1; j < order.length; j++) {
        assert.equal(winner(order[i], order[j], 'eichel-neun', 'gras-neun'), 0, `${order[i]} muss ${order[j]} schlagen (stärkerer zuerst)`);
        assert.equal(winner(order[j], order[i], 'eichel-neun', 'gras-neun'), 1, `${order[i]} muss ${order[j]} schlagen (schwächerer zuerst)`);
      }
    }
  });

  test('ausgespielter Trumpf: Farbkarten (auch Säue) gewinnen nie', () => {
    assert.equal(winner('herz-neun', 'eichel-sau', 'gras-sau', 'schellen-sau'), 0);
  });

  test('stechen: ein Trumpf auf eine ausgespielte Farbe holt den Stich; höherer Trumpf übersticht', () => {
    assert.equal(winner('gras-neun', 'eichel-sau', 'schellen-sau', 'herz-sau'), 3);
    assert.equal(winner('gras-sau', 'herz-neun', 'schellen-unter', 'gras-zehn'), 2);
  });
});

// ---------------------------------------------------------------------------
test.describe('Bedienzwang', () => {
  test('Farbe ausgespielt: Karten dieser Farbe sind Pflicht, Trümpfe nicht', () => {
    const hand = cards('gras-sau', 'herz-neun', 'eichel-zehn');
    assert.deepEqual(L.legalCards(hand, c('gras-koenig')).map((x) => x.id), ['gras-sau']);
    assert.deepEqual(L.legalCards(hand, c('eichel-neun')).map((x) => x.id), ['eichel-zehn']);
  });

  test('Trumpf ausgespielt: nur Trümpfe sind erlaubt (auch ein Gras-Ober)', () => {
    const hand = cards('gras-sau', 'herz-neun', 'gras-ober');
    assert.deepEqual(L.legalCards(hand, c('schellen-ober')).map((x) => x.id).sort(), ['gras-ober', 'herz-neun']);
  });

  test('ein Ober gehört nicht zur Farbe seines Bildes: er muss auf Gras nicht zugegeben werden', () => {
    const hand = cards('gras-ober', 'eichel-neun');
    assert.deepEqual(L.legalCards(hand, c('gras-sau')).map((x) => x.id).sort(), ['eichel-neun', 'gras-ober'], 'keine Gras-Farbkarte auf der Hand → alles erlaubt');
  });

  test('wer nicht bedienen kann, darf alles legen (und bekommt eine Kopie der Hand)', () => {
    const hand = cards('eichel-sau', 'schellen-neun');
    const legal = L.legalCards(hand, c('gras-zehn'));
    assert.deepEqual(legal.map((x) => x.id), ['eichel-sau', 'schellen-neun']);
    assert.notEqual(legal, hand);
  });
});

// ---------------------------------------------------------------------------
test.describe('Spielsimulation', () => {
  test('Austeilen: 4 Hände à 6 Karten, jede Karte genau einmal', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const hands = L.dealHands(L.createRng(seed));
      assert.equal(hands.length, 4);
      hands.forEach((h) => assert.equal(h.length, 6));
      assert.equal(new Set(hands.flat().map((x) => x.id)).size, 24);
    }
  });

  test('1000 Spiele: jede Karte genau einmal gespielt, Augen ergeben 120, Regeln eingehalten', () => {
    for (let seed = 1; seed <= 1000; seed++) {
      const tricks = L.simulateTricks(L.createRng(seed), 6);
      assert.equal(tricks.length, 6);
      const all = tricks.flatMap((t) => t.plays.map((p) => p.card));
      assert.equal(new Set(all.map((x) => x.id)).size, 24, `Seed ${seed}: Karte doppelt oder fehlt`);
      assert.equal(L.sumPoints(all), 120, `Seed ${seed}: Augen`);
      tricks.forEach((trick, t) => {
        assert.equal(trick.plays.length, 4);
        assert.equal(new Set(trick.plays.map((p) => p.player)).size, 4, 'jeder Spieler genau eine Karte pro Stich');
        for (let k = 0; k < 4; k++) assert.equal(trick.plays[k].player, (trick.plays[0].player + k) % 4, 'Reihenfolge im Uhrzeigersinn');
        const led = L.playSuit(trick.plays[0].card);
        trick.plays.slice(1).forEach((p) => {
          if (p.mustFollow) assert.equal(L.playSuit(p.card), led, `Seed ${seed}, Stich ${t + 1}: Bedienzwang verletzt`);
        });
        assert.equal(trick.winner, L.trickWinnerIndex(trick.plays.map((p) => p.card)));
        if (t < 5) assert.equal(tricks[t + 1].plays[0].player, trick.plays[trick.winner].player, 'der Stichgewinner spielt aus');
      });
    }
  });

  test('Bedienzwang kommt wirklich vor und wird eingehalten (kein toter Test)', () => {
    let followed = 0, couldNotFollow = 0;
    for (let seed = 1; seed <= 300; seed++) {
      for (const trick of L.simulateTricks(L.createRng(seed), 6)) {
        const led = L.playSuit(trick.plays[0].card);
        trick.plays.slice(1).forEach((p) => { if (p.mustFollow) followed++; else if (L.playSuit(p.card) !== led) couldNotFollow++; });
      }
    }
    assert.ok(followed > 1000, `nur ${followed} bediente Karten`);
    assert.ok(couldNotFollow > 200, `nur ${couldNotFollow} Karten, die nicht bedienen konnten`);
  });
});

// ---------------------------------------------------------------------------
test.describe('Art der Stiche', () => {
  test('stichProfile erkennt die Arten', () => {
    const kind = (...ids) => L.stichProfile(cards(...ids)).kind;
    assert.equal(kind('eichel-ober', 'herz-neun', 'gras-unter', 'herz-sau'), 'trumpf4');
    assert.equal(kind('eichel-ober', 'herz-neun', 'gras-unter', 'gras-sau'), 'trumpf3+farbe');
    assert.equal(kind('gras-sau', 'gras-zehn', 'gras-koenig', 'gras-neun'), 'farbe4');
    assert.equal(kind('gras-sau', 'gras-zehn', 'gras-koenig', 'herz-neun'), 'farbe3+trumpf');
    assert.equal(kind('gras-sau', 'gras-zehn', 'gras-koenig', 'eichel-neun'), 'farbe3+andere');
    assert.equal(kind('gras-sau', 'eichel-zehn', 'herz-koenig', 'schellen-ober'), 'gemischt');
    assert.deepEqual(L.stichProfile(cards('gras-sau', 'gras-zehn', 'herz-neun', 'eichel-ober')), { trumps: 2, maxSameSuit: 2, kind: 'gemischt' });
  });

  test('Trümpfe kommen deutlich häufiger zusammen als beim reinen Zufall – aber nicht immer', () => {
    const rnd = L.createRng(1);
    const random = frequencies(() => L.drawCards(L.createDeck(), 4, rnd));
    const rs = L.createRng(1);
    const real = frequencies(() => L.randomStich(rs));
    // reiner Zufall: 4,7 % aller 4 Trümpfe; Simulation: etwa ein Viertel
    assert.ok(random.trumps(4) < 6, `Zufall: ${random.trumps(4)}`);
    assert.ok(real.trumps(4) > 22 && real.trumps(4) < 31, `4 Trümpfe: ${real.trumps(4)} %`);
    assert.ok(real.trumps(4) > random.trumps(4) * 3, 'mindestens dreimal so oft wie beim Zufall');
    assert.ok(real.trumps(4) < 40, 'aber nicht ständig');
    // jede Anzahl Trümpfe kommt vor, keine verschwindet
    for (let k = 0; k <= 4; k++) assert.ok(real.trumps(k) > 8, `${k} Trümpfe nur ${real.trumps(k)} %`);
  });

  test('„drei von einer Farbe und ein Trumpf“ kommt realistisch oft vor (Zufall: nur 1,4 %)', () => {
    const rnd = L.createRng(2);
    const random = frequencies(() => L.drawCards(L.createDeck(), 4, rnd));
    const rs = L.createRng(2);
    const real = frequencies(() => L.randomStich(rs));
    assert.ok(random.kind('farbe3+trumpf') < 3);
    assert.ok(real.kind('farbe3+trumpf') > 10 && real.kind('farbe3+trumpf') < 18, `farbe3+trumpf: ${real.kind('farbe3+trumpf')} %`);
    assert.ok(real.kind('farbe4') > 2, 'auch vier gleiche Farbkarten kommen vor');
  });

  test('es bleibt abwechslungsreich: alle Arten treten auf', () => {
    const rs = L.createRng(3);
    const real = frequencies(() => L.randomStich(rs));
    for (const k of ['trumpf4', 'trumpf3+farbe', 'farbe4', 'farbe3+trumpf', 'farbe3+andere', 'gemischt']) {
      assert.ok(real.kind(k) > 2, `${k}: nur ${real.kind(k)} %`);
    }
  });
});

// ---------------------------------------------------------------------------
test.describe('Ziehen eines realistischen Stichs', () => {
  test('immer 4 verschiedene Karten aus dem Blatt, in Spielreihenfolge', () => {
    const rng = L.createRng(5);
    for (let i = 0; i < 2000; i++) {
      const stich = L.randomStich(rng);
      assert.equal(stich.length, 4);
      assert.equal(new Set(stich.map((x) => x.id)).size, 4);
      stich.forEach((x) => assert.ok(L.cardById(x.id)));
    }
  });

  test('gleicher Seed → gleicher Stich; andere Seeds → andere Stiche', () => {
    const a = L.randomStich(L.createRng(7)).map((x) => x.id);
    assert.deepEqual(a, L.randomStich(L.createRng(7)).map((x) => x.id));
    const others = new Set(Array.from({ length: 30 }, (_, i) => L.randomStich(L.createRng(100 + i)).map((x) => x.id).join()));
    assert.ok(others.size > 20);
  });

  test('ohne Math.random-Seed funktioniert es auch (Standardwerte)', () => {
    assert.equal(L.randomStich().length, 4);
    assert.equal(L.drawRealisticStich().length, 4);
    assert.equal(L.simulateTricks(undefined, 1).length, 1);
    assert.equal(L.dealHands().length, 4);
  });

  test('Schwachstellen kommen auch bei realistischen Stichen häufiger dran – ohne die Regeln zu verletzen', () => {
    const weights = Object.fromEntries(L.createDeck().map((x) => [x.id, x.id === 'gras-koenig' ? 5 : 1]));
    const count = (w, seed) => {
      const rng = L.createRng(seed);
      let hits = 0;
      for (let i = 0; i < 4000; i++) if (L.drawRealisticStich(rng, w).some((x) => x.id === 'gras-koenig')) hits++;
      return hits / 4000;
    };
    const base = count(null, 11);
    const weighted = count(weights, 11);
    assert.ok(weighted > base * 1.4, `ohne ${base}, mit Gewicht ${weighted}`);
    // trotz Gewichtung bleiben es echte Stiche: Trumpf-Verteilung weiter wie bei der Simulation
    const rng = L.createRng(12);
    const f = frequencies(() => L.drawRealisticStich(rng, weights), 8000);
    assert.ok(f.trumps(4) > 18 && f.trumps(4) < 34, `4 Trümpfe: ${f.trumps(4)} %`);
  });

  test('ungültige Gewichte zählen wie 1', () => {
    const rng = L.createRng(13);
    const weights = { 'herz-sau': -2, 'gras-sau': NaN, 'eichel-sau': 'x' };
    for (let i = 0; i < 200; i++) assert.equal(L.drawRealisticStich(rng, weights, 3).length, 4);
  });
});

// ---------------------------------------------------------------------------
test.describe('nextHand (Einstellung „Realistische Stiche“)', () => {
  test('Standard: realistische Stiche; aus: reiner Zufall wie bisher', () => {
    assert.equal(L.DEFAULT_SETTINGS.realisticTricks, true);
    const real = L.nextHand({ realisticTricks: true, adaptive: false }, L.createRng(21), {}).map((x) => x.id);
    assert.deepEqual(real, L.randomStich(L.createRng(21)).map((x) => x.id));
    const random = L.nextHand({ realisticTricks: false, adaptive: false }, L.createRng(21), {}).map((x) => x.id);
    assert.deepEqual(random, L.drawCards(L.createDeck(), 4, L.createRng(21)).map((x) => x.id));
    assert.notDeepEqual(real, random);
  });

  test('„Schwachstellen öfter üben“ wirkt in beiden Arten', () => {
    const stats = { 'herz-ober': { seen: 40, wrong: 40 } };
    for (const realisticTricks of [true, false]) {
      const rng = L.createRng(31);
      let hits = 0;
      const rngOff = L.createRng(31);
      let hitsOff = 0;
      for (let i = 0; i < 3000; i++) {
        if (L.nextHand({ realisticTricks, adaptive: true }, rng, stats).some((x) => x.id === 'herz-ober')) hits++;
        if (L.nextHand({ realisticTricks, adaptive: false }, rngOff, stats).some((x) => x.id === 'herz-ober')) hitsOff++;
      }
      assert.ok(hits > hitsOff * 1.3, `realistisch=${realisticTricks}: mit ${hits}, ohne ${hitsOff}`);
    }
  });

  test('ungültige Einstellungen fallen auf die Standardwerte zurück', () => {
    assert.equal(L.nextHand({ realisticTricks: 'ja' }, L.createRng(1), {}).length, 4);
    assert.equal(L.nextHand(null, L.createRng(1), undefined).length, 4);
    assert.equal(L.sanitizeSettings({ realisticTricks: false }).realisticTricks, false);
    assert.equal(L.sanitizeSettings({ realisticTricks: 'ja' }).realisticTricks, true);
  });

  test('Texte für die Einstellung gibt es in beiden Sprachen', () => {
    assert.equal(L.t('bairisch', 'realistic'), 'Echte Stich');
    assert.equal(L.t('hochdeutsch', 'realistic'), 'Realistische Stiche');
  });
});
