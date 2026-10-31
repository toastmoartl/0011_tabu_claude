'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../../js/logic.js');
const C = require('../../js/cards.js');

/** Minimaler XML-Prüfer: Tags müssen sauber geöffnet/geschlossen sein. */
function assertWellFormed(svg) {
  const stack = [];
  const re = /<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>/g;
  let m;
  while ((m = re.exec(svg))) {
    const [, closing, name, attrs, selfClosing] = m;
    // Attribute: jedes name="wert"
    const stripped = attrs.replace(/\s+[\w:-]+="[^"]*"/g, '').trim();
    assert.equal(stripped, '', `unsaubere Attribute in <${name}${attrs}>`);
    if (selfClosing) continue;
    if (closing) assert.equal(stack.pop(), name, `falsch geschlossen: </${name}>`);
    else stack.push(name);
  }
  assert.deepEqual(stack, [], 'nicht alle Tags geschlossen');
}

const count = (s, needle) => s.split(needle).length - 1;
const pipYs = (svg) => [...svg.matchAll(/data-pip="1" data-x="([\d.]+)" data-y="([\d.]+)"/g)].map((m) => Number(m[2]));

test.describe('Karten-SVGs', () => {
  const deck = L.createDeck();
  const svgs = Object.fromEntries(deck.map((c) => [c.id, C.renderCard(c)]));

  test('jede der 24 Karten wird erzeugt und ist wohlgeformt', () => {
    for (const [id, svg] of Object.entries(svgs)) {
      assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 200 320"/, id);
      assert.ok(svg.endsWith('</svg>'), id);
      assertWellFormed(svg);
    }
  });

  test('alle Karten sehen unterschiedlich aus', () => {
    const bodies = Object.values(svgs).map((s) => s.replace(/aria-label="[^"]*"|data-card="[^"]*"|<title>.*?<\/title>/g, ''));
    assert.equal(new Set(bodies).size, 24);
  });

  test('Barrierefreiheit: Name als aria-label und title', () => {
    for (const c of deck) {
      const label = L.cardLabel(c);
      assert.ok(svgs[c.id].includes(`aria-label="${label}"`), c.id);
      assert.ok(svgs[c.id].includes(`<title>${label}</title>`), c.id);
      assert.ok(svgs[c.id].includes('role="img"'), c.id);
      assert.ok(svgs[c.id].includes(`data-card="${c.id}"`), c.id);
    }
  });

  test('keine IDs (mehrere Karten gleichzeitig im DOM ohne Konflikte)', () => {
    for (const svg of [...Object.values(svgs), C.renderBack()]) assert.ok(!/\sid="/.test(svg));
  });

  test('Anzahl der Farbzeichen („Augen“ auf der Karte) je Schlag', () => {
    const expected = { neun: 9, zehn: 10, sau: 2, koenig: 1, ober: 1, unter: 1 };
    for (const c of deck) assert.equal(count(svgs[c.id], 'data-pip="1"'), expected[c.rank], c.id);
  });

  test('jede Karte zeigt nur Farbzeichen ihrer eigenen Farbe', () => {
    for (const c of deck) {
      for (const other of L.SUITS) {
        const n = count(svgs[c.id], `class="pip pip-${other}"`);
        if (other === c.suit) assert.ok(n > 0, c.id);
        else assert.equal(n, 0, `${c.id} enthält ${other}`);
      }
    }
  });

  test('Ober hält das Farbzeichen oben, Unter unten (wie im Original)', () => {
    for (const suit of L.SUITS) {
      const oberY = pipYs(svgs[`${suit}-ober`])[0];
      const unterY = pipYs(svgs[`${suit}-unter`])[0];
      assert.ok(oberY < 100, `${suit}-ober: ${oberY}`);
      assert.ok(unterY > 200, `${suit}-unter: ${unterY}`);
    }
  });

  test('König trägt Krone und Zepter, Neun/Zehn tragen römische Zahlen', () => {
    for (const suit of L.SUITS) {
      assert.ok(svgs[`${suit}-koenig`].includes('data-role="koenig-pip"'));
      assert.equal(count(svgs[`${suit}-neun`], '>IX</text>'), 2);
      assert.equal(count(svgs[`${suit}-zehn`], '>X</text>'), 2);
    }
  });

  test('alle Farbzeichen liegen innerhalb der Karte', () => {
    for (const [id, svg] of Object.entries(svgs)) {
      for (const m of svg.matchAll(/data-x="([\d.]+)" data-y="([\d.]+)"/g)) {
        const x = Number(m[1]), y = Number(m[2]);
        assert.ok(x >= 20 && x <= 180 && y >= 20 && y <= 300, `${id}: ${x},${y}`);
      }
    }
  });

  test('Rückseite ist wohlgeformt und für Screenreader versteckt', () => {
    const back = C.renderBack();
    assertWellFormed(back);
    assert.ok(back.includes('aria-hidden="true"'));
    assert.equal(count(back, 'data-pip'), 0);
  });

  test('Farbsymbol einzeln', () => {
    for (const suit of L.SUITS) {
      const svg = C.renderMark(suit, 24);
      assertWellFormed(svg);
      assert.ok(svg.includes('width="24"'));
    }
  });

  test('unbekannte Karten werden abgelehnt', () => {
    assert.throws(() => C.renderCard({ suit: 'pik', rank: 'sau' }), /Unbekannte Karte/);
    assert.throws(() => C.renderCard({ suit: 'herz', rank: 'acht' }), /Unbekannte Karte/);
  });

  test('Trachtfarben für alle vier Farben definiert', () => {
    for (const suit of L.SUITS) {
      for (const k of ['coat', 'trim', 'hat', 'legs', 'accent']) assert.match(C.PALETTE[suit][k], /^#[0-9a-f]{6}$/i);
    }
  });
});
