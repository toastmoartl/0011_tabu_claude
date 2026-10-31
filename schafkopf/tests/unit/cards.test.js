'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const L = require('../../js/logic.js');
const C = require('../../js/cards.js');

const CARD_DIR = path.resolve(__dirname, '../../assets/cards');
const read = (card) => fs.readFileSync(path.join(CARD_DIR, C.cardFile(card)), 'utf8');

/** Minimaler XML-Prüfer: Tags müssen sauber geöffnet/geschlossen sein. */
function assertWellFormed(svg, name) {
  const stack = [];
  const re = /<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>/g;
  let m;
  while ((m = re.exec(svg))) {
    const [, closing, tag, attrs, selfClosing] = m;
    const stripped = attrs.replace(/\s+[\w:-]+="[^"]*"/g, '').trim();
    assert.equal(stripped, '', `${name}: unsaubere Attribute in <${tag}${attrs}>`);
    if (selfClosing) continue;
    if (closing) assert.equal(stack.pop(), tag, `${name}: falsch geschlossen: </${tag}>`);
    else stack.push(tag);
  }
  assert.deepEqual(stack, [], `${name}: nicht alle Tags geschlossen`);
}

const SUIT_UPPER = { eichel: 'EICHEL', gras: 'GRAS', herz: 'HERZ', schellen: 'SCHELLEN' };
const INDEX_OF = { neun: '9', zehn: '10', unter: 'U', ober: 'O', koenig: 'K', sau: 'A' };
const RANK_TITLE = { neun: 'Neun', zehn: 'Zehn', unter: 'Unter', ober: 'Ober', koenig: 'König', sau: 'Sau' };

test.describe('Kartendateien (assets/cards)', () => {
  const deck = L.createDeck();

  test('zu jeder der 24 Karten gibt es genau eine Datei, und es liegen keine überzähligen im Ordner', () => {
    const expected = deck.map((c) => C.cardFile(c)).sort();
    assert.equal(new Set(expected).size, 24);
    const actual = fs.readdirSync(CARD_DIR).sort();
    assert.deepEqual(actual, expected);
  });

  test('Dateinamen: Farbe_Schlag.svg ohne Umlaut', () => {
    assert.equal(C.cardFile(L.cardById('herz-koenig')), 'Herz_Koenig.svg');
    assert.equal(C.cardFile(L.cardById('eichel-sau')), 'Eichel_Sau.svg');
    assert.equal(C.cardFile(L.cardById('schellen-zehn')), 'Schellen_Zehn.svg');
    assert.equal(C.cardUrl(L.cardById('gras-unter')), 'assets/cards/Gras_Unter.svg');
  });

  test('jede Datei ist wohlgeformtes SVG im Format 600×900', () => {
    for (const c of deck) {
      const svg = read(c);
      assertWellFormed(svg, c.id);
      assert.match(svg, /<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="600" height="900" viewBox="0 0 600 900">/, c.id);
      assert.ok(svg.trim().endsWith('</svg>'), c.id);
    }
  });

  test('Inhalt passt zum Dateinamen: Titel, Index und Farbname stimmen (keine vertauschten Karten)', () => {
    for (const c of deck) {
      const svg = read(c);
      assert.ok(svg.includes(`<title>${RANK_TITLE[c.rank]} ${L.SUIT_NAMES[c.suit]} –`), `${c.id}: Titel`);
      assert.ok(svg.includes(`font-weight="bold">${INDEX_OF[c.rank]}</text>`), `${c.id}: Index ${INDEX_OF[c.rank]}`);
      assert.ok(svg.includes(`>${SUIT_UPPER[c.suit]}</text>`), `${c.id}: Farbname`);
      // die Karte zeigt nur ihren eigenen Farbnamen
      for (const other of L.SUITS) {
        if (other !== c.suit) assert.ok(!svg.includes(`>${SUIT_UPPER[other]}</text>`), `${c.id} zeigt ${other}`);
      }
    }
  });

  test('alle 24 Karten sehen unterschiedlich aus', () => {
    assert.equal(new Set(deck.map(read)).size, 24);
  });

  test('Sicherheit: keine Skripte, Ereignis-Handler, externe Verweise oder eingebettete Bilder', () => {
    const forbidden = /<script|<foreignObject|<image|<iframe|<object|<embed|<style|\son[a-z]+\s*=|(?:xlink:)?href\s*=|javascript:|data:|url\(\s*['"]?https?:|@import/i;
    for (const c of deck) assert.ok(!forbidden.test(read(c)), `${c.id}: enthält unerwünschten Inhalt`);
  });

  test('Dateien sind klein (Ladezeit) und stehen im UTF-8-Format', () => {
    for (const c of deck) {
      const buf = fs.readFileSync(path.join(CARD_DIR, C.cardFile(c)));
      assert.ok(buf.length > 1500 && buf.length < 20000, `${c.id}: ${buf.length} Bytes`);
      assert.ok(buf.toString('utf8').startsWith('<?xml version="1.0" encoding="UTF-8"?>'), c.id);
      assert.ok(!buf.toString('utf8').includes('�'), `${c.id}: ungültige UTF-8-Zeichen`);
    }
  });
});

// ---------------------------------------------------------------------------
test.describe('renderCard (Einbindung als Bild)', () => {
  const deck = L.createDeck();

  test('erzeugt ein <img> mit Pfad, Alternativtext und Größe', () => {
    for (const c of deck) {
      const html = C.renderCard(c);
      assert.ok(html.startsWith('<img '), c.id);
      assert.ok(html.includes(`src="assets/cards/${C.cardFile(c)}"`), c.id);
      assert.ok(html.includes(`alt="${L.cardLabel(c)}"`), c.id);
      assert.ok(html.includes(`data-card="${c.id}"`), c.id);
      assert.ok(html.includes('width="600" height="900"'), c.id);
      assert.ok(html.includes('draggable="false"'), c.id);
      assert.equal((html.match(/"/g) || []).length % 2, 0, `${c.id}: Anführungszeichen unausgeglichen`);
    }
  });

  test('jeder Dateipfad im erzeugten HTML zeigt auf eine vorhandene Datei', () => {
    for (const c of deck) {
      const src = C.renderCard(c).match(/src="([^"]+)"/)[1];
      assert.ok(fs.existsSync(path.resolve(__dirname, '../..', src)), src);
    }
  });

  test('unbekannte Karten werden abgelehnt', () => {
    assert.throws(() => C.renderCard({ suit: 'pik', rank: 'sau' }), /Unbekannte Karte/);
    assert.throws(() => C.renderCard({ suit: 'herz', rank: 'acht' }), /Unbekannte Karte/);
    assert.throws(() => C.renderCard({ suit: 'herz', rank: 'sieben' }), /Unbekannte Karte/);
    assert.throws(() => C.cardFile(null), /Unbekannte Karte/);
    assert.throws(() => C.cardUrl({ suit: 'x', rank: 'y' }), /Unbekannte Karte/);
  });
});

// ---------------------------------------------------------------------------
test.describe('Rückseite & Farbsymbole (Inline-SVG)', () => {
  test('Rückseite ist wohlgeformt, im Kartenformat und für Screenreader versteckt', () => {
    const back = C.renderBack();
    assertWellFormed(back, 'Rückseite');
    assert.ok(back.includes('viewBox="0 0 600 900"'));
    assert.ok(back.includes('aria-hidden="true"'));
  });

  test('Rückseite enthält keine IDs und keine externen Verweise (mehrere gleichzeitig im DOM)', () => {
    const back = C.renderBack();
    assert.ok(!/\sid="/.test(back));
    assert.ok(!/href|url\(|<script|<image/i.test(back));
  });

  test('Rautenmuster liegt vollständig im Innenfeld', () => {
    const back = C.renderBack();
    const lattice = back.match(/<path d="(M[^"]+)" stroke="#e9eef7" stroke-width="4"/)[1];
    const nums = [...lattice.matchAll(/([\d.]+),([\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
    assert.ok(nums.length > 20);
    for (const [x, y] of nums) assert.ok(x >= 36 && x <= 564 && y >= 36 && y <= 864, `${x},${y}`);
  });

  test('Rückseite hat das gleiche Seitenverhältnis wie die Vorderseiten', () => {
    assert.equal(C.WIDTH / C.HEIGHT, 600 / 900);
  });

  test('Farbsymbol einzeln, für alle Farben', () => {
    for (const suit of L.SUITS) {
      const svg = C.renderMark(suit, 24);
      assertWellFormed(svg, suit);
      assert.ok(svg.includes('width="24"'));
    }
  });
});
