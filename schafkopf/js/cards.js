/*
 * Schafkopf-Augen-Trainer – Karten.
 * Die Vorderseiten sind die mitgelieferten SVG-Dateien in assets/cards/
 * (bayerisches Blatt, 600×900). Sie werden als <img> eingebunden; in dieser
 * Einbindung können SVGs keine Skripte ausführen. Die Rückseite und das
 * kleine Farbsymbol werden hier als Inline-SVG erzeugt (das Set hat keine
 * Rückseite) – ohne IDs, damit beliebig viele davon im DOM liegen dürfen.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SchafkopfCards = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var W = 600;
  var H = 900;
  var BASE_PATH = 'assets/cards/';

  var SUIT_LABEL = { eichel: 'Eichel', gras: 'Gras', herz: 'Herz', schellen: 'Schellen' };
  var RANK_LABEL = { neun: 'Neun', zehn: 'Zehn', unter: 'Unter', ober: 'Ober', koenig: 'König', sau: 'Sau' };
  // Dateinamen ohne Umlaut: Eichel_Koenig.svg
  var RANK_FILE = { neun: 'Neun', zehn: 'Zehn', unter: 'Unter', ober: 'Ober', koenig: 'Koenig', sau: 'Sau' };

  // ---------------------------------------------------------------------------
  // Farbsymbole (zentriert um 0,0, ca. 88 × 88 Einheiten) – für Rückseite & Marker
  // ---------------------------------------------------------------------------
  var SUIT_ART = {
    herz:
      '<path d="M0,36 C-6,29 -44,6 -44,-14 C-44,-34 -18,-40 0,-21 C18,-40 44,-34 44,-14 C44,6 6,29 0,36Z" fill="#d1201f" stroke="#5a0b0b" stroke-width="2.5" stroke-linejoin="round"/>' +
      '<path d="M-31,-21 C-27,-30 -17,-31 -11,-25" fill="none" stroke="#ff9a8a" stroke-width="4.5" stroke-linecap="round"/>' +
      '<path d="M0,-12 C10,-28 34,-28 34,-12" fill="none" stroke="#8e1212" stroke-width="1.6" opacity=".55"/>',
    schellen:
      '<circle cx="0" cy="-38" r="5.5" fill="none" stroke="#5b3300" stroke-width="2.6"/>' +
      '<circle cx="0" cy="0" r="33" fill="#f3b41c" stroke="#5b3300" stroke-width="2.6"/>' +
      '<path d="M-32,-7 Q0,-14 32,-7 L32,7 Q0,0 -32,7Z" fill="#c42a1c" stroke="#5b1a0a" stroke-width="1.6"/>' +
      '<circle cx="-16" cy="-4" r="2.4" fill="#f9dc7a"/><circle cx="0" cy="-6" r="2.4" fill="#f9dc7a"/><circle cx="16" cy="-4" r="2.4" fill="#f9dc7a"/>' +
      '<path d="M0,-33 L0,-12 M0,7 L0,12" stroke="#a86c00" stroke-width="1.6"/>' +
      '<path d="M-13,19 L13,19" stroke="#3a1f00" stroke-width="3.2" stroke-linecap="round"/>' +
      '<circle cx="-15" cy="19" r="4" fill="#3a1f00"/><circle cx="15" cy="19" r="4" fill="#3a1f00"/>' +
      '<ellipse cx="-13" cy="-20" rx="8" ry="4.5" fill="#fff4b8" opacity=".85" transform="rotate(-25 -13 -20)"/>',
    gras:
      '<path d="M0,-42 C14,-30 38,-15 36,8 C34,26 14,30 4,22 L7,42 L-7,42 L-4,22 C-14,30 -34,26 -36,8 C-38,-15 -14,-30 0,-42Z" fill="#3f9a35" stroke="#163d12" stroke-width="2.5" stroke-linejoin="round"/>' +
      '<path d="M0,-34 L0,32" stroke="#163d12" stroke-width="2"/>' +
      '<path d="M0,-20 L-14,-28 M0,-20 L14,-28 M0,-6 L-24,-14 M0,-6 L24,-14 M0,8 L-24,2 M0,8 L24,2 M0,18 L-13,17 M0,18 L13,17" stroke="#1d5a17" stroke-width="1.6" fill="none" stroke-linecap="round"/>' +
      '<path d="M-26,-6 C-28,-14 -20,-24 -12,-28" fill="none" stroke="#9fdc7c" stroke-width="3" stroke-linecap="round" opacity=".8"/>',
    eichel:
      '<path d="M3,-30 C5,-38 11,-42 16,-44" stroke="#4a2c0c" stroke-width="4" fill="none" stroke-linecap="round"/>' +
      '<path d="M-20,-6 C-22,18 -10,38 0,41 C10,38 22,18 20,-6Z" fill="#dab43e" stroke="#5a3d0a" stroke-width="2.5" stroke-linejoin="round"/>' +
      '<path d="M-10,6 C-11,18 -7,28 -2,33" stroke="#fbe7a0" stroke-width="3.2" fill="none" stroke-linecap="round"/>' +
      '<path d="M-25,-4 C-27,-22 -12,-32 0,-32 C12,-32 27,-22 25,-4 C12,1 -12,1 -25,-4Z" fill="#7a4e1d" stroke="#3a220a" stroke-width="2.5" stroke-linejoin="round"/>' +
      '<path d="M-19,-14 L-9,-4 M-13,-23 L3,-3 M-5,-29 L14,-5 M6,-30 L21,-12 M-20,-8 L-7,-26 M-9,-3 L8,-30 M3,-2 L19,-22 M13,-3 L23,-12" stroke="#4a2c0c" stroke-width="1.3" stroke-linecap="round"/>'
  };

  // ---------------------------------------------------------------------------
  // Vorderseiten
  // ---------------------------------------------------------------------------
  function assertKnown(card) {
    if (!card || !SUIT_LABEL[card.suit] || !RANK_LABEL[card.rank]) {
      throw new Error('Unbekannte Karte: ' + (card && card.suit) + '/' + (card && card.rank));
    }
  }

  function cardFile(card) {
    assertKnown(card);
    return SUIT_LABEL[card.suit] + '_' + RANK_FILE[card.rank] + '.svg';
  }

  function cardUrl(card) {
    return BASE_PATH + cardFile(card);
  }

  function renderCard(card) {
    var label = SUIT_LABEL[card.suit] + '-' + RANK_LABEL[card.rank];
    return '<img class="card-img" src="' + cardUrl(card) + '" alt="' + label + '" width="' + W + '" height="' + H +
      '" draggable="false" data-card="' + card.suit + '-' + card.rank + '">';
  }

  /** Notfall-Vorderseite aus Text, falls ein Kartenbild nicht geladen werden kann (Spiel bleibt spielbar). */
  function renderFallback(card) {
    assertKnown(card);
    var label = SUIT_LABEL[card.suit] + '-' + RANK_LABEL[card.rank];
    return '<div class="card-fallback" role="img" aria-label="' + label + '" data-card="' + card.suit + '-' + card.rank +
      '" data-suit="' + card.suit + '"><span class="fb-rank">' + RANK_LABEL[card.rank] + '</span><span class="fb-suit">' +
      SUIT_LABEL[card.suit] + '</span></div>';
  }

  // ---------------------------------------------------------------------------
  // Rückseite (Rautenmuster, Eichel im Medaillon)
  // ---------------------------------------------------------------------------
  var BACK_BOX = { x: 36, y: 36, w: 528, h: 828 };

  /** Diagonale Linien, exakt auf das Innenfeld zugeschnitten. */
  function latticePath(step) {
    var b = BACK_BOX;
    var d = [];
    var c, lo, hi;
    for (c = -b.w; c <= b.h; c += step) { // fallend: v = u + c
      lo = Math.max(0, -c); hi = Math.min(b.w, b.h - c);
      if (lo < hi) d.push('M' + (b.x + lo) + ',' + (b.y + lo + c) + ' L' + (b.x + hi) + ',' + (b.y + hi + c));
    }
    for (c = 0; c <= b.w + b.h; c += step) { // steigend: v = c - u
      lo = Math.max(0, c - b.h); hi = Math.min(b.w, c);
      if (lo < hi) d.push('M' + (b.x + lo) + ',' + (b.y + c - lo) + ' L' + (b.x + hi) + ',' + (b.y + c - hi));
    }
    return d.join(' ');
  }

  function renderBack() {
    var b = BACK_BOX;
    var inner = 'M' + (b.x + 22) + ',' + b.y + ' H' + (b.x + b.w - 22) + ' A22,22 0 0 1 ' + (b.x + b.w) + ',' + (b.y + 22) +
      ' V' + (b.y + b.h - 22) + ' A22,22 0 0 1 ' + (b.x + b.w - 22) + ',' + (b.y + b.h) + ' H' + (b.x + 22) +
      ' A22,22 0 0 1 ' + b.x + ',' + (b.y + b.h - 22) + ' V' + (b.y + 22) + ' A22,22 0 0 1 ' + (b.x + 22) + ',' + b.y + 'Z';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" class="card-back-svg" aria-hidden="true">' +
      '<rect x="12" y="12" width="576" height="876" rx="34" fill="#1d4f8f" stroke="#0d2a52" stroke-width="12"/>' +
      '<path d="' + inner + '" fill="#2a64ad"/>' +
      '<path d="' + latticePath(48) + '" stroke="#e9eef7" stroke-width="4" opacity=".55"/>' +
      // Ecken des Gitters (quadratischer Zuschnitt) unter dem abgerundeten Rahmen verdecken
      '<path d="M30,30 H570 V870 H30Z ' + inner + '" fill="#1d4f8f" fill-rule="evenodd"/>' +
      '<path d="' + inner + '" fill="none" stroke="#e9eef7" stroke-width="6"/>' +
      '<ellipse cx="300" cy="450" rx="118" ry="165" fill="#1d4f8f" stroke="#e9eef7" stroke-width="7"/>' +
      '<g transform="translate(300 450) scale(1.65)">' + SUIT_ART.eichel + '</g>' +
      '</svg>';
  }

  function renderMark(suit, size) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-50 -50 100 100" class="suit-mark" width="' + size +
      '" height="' + size + '" aria-hidden="true">' + SUIT_ART[suit] + '</svg>';
  }

  return {
    WIDTH: W,
    HEIGHT: H,
    BASE_PATH: BASE_PATH,
    SUIT_ART: SUIT_ART,
    cardFile: cardFile,
    cardUrl: cardUrl,
    renderCard: renderCard,
    renderFallback: renderFallback,
    renderBack: renderBack,
    renderMark: renderMark
  };
});
