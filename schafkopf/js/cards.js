/*
 * Schafkopf-Augen-Trainer – SVG-Karten im Stil des bayerischen Blatts.
 * Alle Grafiken sind selbst gezeichnet (keine Verlagsvorlagen) und kommen
 * ohne IDs aus, damit beliebig viele Karten gleichzeitig im DOM liegen dürfen.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SchafkopfCards = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var W = 200;
  var H = 320;
  var INK = '#2b1a0e';
  var PAPER = '#fbf6e9';
  var SKIN = '#f3cda6';
  var GOLD = '#e7b93a';

  var SUIT_LABEL = { eichel: 'Eichel', gras: 'Gras', herz: 'Herz', schellen: 'Schellen' };
  var RANK_LABEL = { neun: 'Neun', zehn: 'Zehn', unter: 'Unter', ober: 'Ober', koenig: 'König', sau: 'Sau' };

  // Trachtfarben je Farbe: Rock, Besatz, Hut, Hose
  var PALETTE = {
    eichel: { coat: '#2e6b3c', trim: '#e2b33c', hat: '#6e4519', legs: '#c9a227', accent: '#7a4e1d' },
    gras: { coat: '#2f5aa6', trim: '#d8a33a', hat: '#1f3b6e', legs: '#3d8b2f', accent: '#3f9a35' },
    herz: { coat: '#b4282a', trim: '#f0c75a', hat: '#5a1414', legs: '#2f5aa6', accent: '#d1201f' },
    schellen: { coat: '#7b4ea0', trim: '#f3b41c', hat: '#2d2d2d', legs: '#b4282a', accent: '#f3b41c' }
  };

  // ---------------------------------------------------------------------------
  // Farbsymbole (zentriert um 0,0, ca. 88 × 88 Einheiten)
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

  function pip(suit, x, y, scale, rotate, attrs) {
    var rot = rotate ? ' rotate(' + rotate + ')' : '';
    return '<g class="pip pip-' + suit + '" data-pip="1" data-x="' + x + '" data-y="' + y + '"' + (attrs || '') +
      ' transform="translate(' + x + ' ' + y + ')' + rot + ' scale(' + scale + ')">' + SUIT_ART[suit] + '</g>';
  }

  /** Kleines Farbsymbol, nicht als „Auge“ gezählt (Ecke). */
  function mark(suit, x, y, scale) {
    return '<g class="mark" transform="translate(' + x + ' ' + y + ') scale(' + scale + ')">' + SUIT_ART[suit] + '</g>';
  }

  // ---------------------------------------------------------------------------
  // Rahmen & Verzierungen
  // ---------------------------------------------------------------------------
  function frame() {
    return '<rect x="2" y="2" width="196" height="316" rx="14" fill="' + PAPER + '" stroke="#8a7a5c" stroke-width="2"/>' +
      '<rect x="9" y="9" width="182" height="302" rx="9" fill="none" stroke="#c9b27a" stroke-width="1.4"/>';
  }

  function vine(y, color) {
    // Weinranke als kleine Verzierung unten
    return '<g class="ornament" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round">' +
      '<path d="M48,' + y + ' C68,' + (y - 12) + ' 84,' + (y + 10) + ' 100,' + y + ' C116,' + (y - 10) + ' 132,' + (y + 12) + ' 152,' + y + '"/>' +
      '<circle cx="72" cy="' + (y - 4) + '" r="3" fill="' + color + '"/>' +
      '<circle cx="128" cy="' + (y + 4) + '" r="3" fill="' + color + '"/>' +
      '<path d="M100,' + y + ' C96,' + (y - 8) + ' 104,' + (y - 12) + ' 106,' + (y - 6) + '"/>' +
      '</g>';
  }

  function numeral(text, color) {
    var style = 'font-family="Georgia, \'Times New Roman\', serif" font-weight="700" font-size="22" fill="' + color + '"';
    return '<text x="24" y="34" text-anchor="middle" ' + style + '>' + text + '</text>' +
      '<text x="176" y="34" text-anchor="middle" ' + style + '>' + text + '</text>';
  }

  // ---------------------------------------------------------------------------
  // Zahlenkarten
  // ---------------------------------------------------------------------------
  var NEUN_POS = [[60, 74], [140, 74], [60, 132], [140, 132], [100, 162], [60, 192], [140, 192], [60, 250], [140, 250]];
  var ZEHN_POS = [[60, 74], [140, 74], [100, 104], [60, 132], [140, 132], [60, 192], [140, 192], [100, 222], [60, 250], [140, 250]];

  function numberCard(suit, rank) {
    var pos = rank === 'neun' ? NEUN_POS : ZEHN_POS;
    var color = PALETTE[suit].accent;
    var out = numeral(rank === 'neun' ? 'IX' : 'X', '#5a3d1a');
    pos.forEach(function (p) { out += pip(suit, p[0], p[1], 0.48, 0); });
    out += vine(290, color);
    return out;
  }

  // ---------------------------------------------------------------------------
  // Sau (Daus): zwei große Farbsymbole mit Zierband
  // ---------------------------------------------------------------------------
  function sauCard(suit) {
    var p = PALETTE[suit];
    var out = '';
    // Zierband / Wappenschild hinten
    out += '<path d="M100,30 C140,30 168,54 168,92 L168,214 C168,256 136,284 100,296 C64,284 32,256 32,214 L32,92 C32,54 60,30 100,30Z" fill="#f4ead0" stroke="#c9b27a" stroke-width="2"/>';
    out += '<path d="M44,160 C70,146 130,174 156,160" fill="none" stroke="' + p.coat + '" stroke-width="10" stroke-linecap="round" opacity=".85"/>';
    out += '<path d="M44,160 C70,146 130,174 156,160" fill="none" stroke="' + p.trim + '" stroke-width="2.5" stroke-linecap="round"/>';
    // Krönchen oben
    out += '<path d="M84,44 L88,30 L94,40 L100,26 L106,40 L112,30 L116,44Z" fill="' + GOLD + '" stroke="#7a5a10" stroke-width="1.8" stroke-linejoin="round"/>';
    out += pip(suit, 82, 106, 0.95, -14);
    out += pip(suit, 118, 220, 0.95, 14);
    out += vine(298, p.accent);
    out += mark(suit, 26, 30, 0.2) + mark(suit, 174, 290, 0.2);
    return out;
  }

  // ---------------------------------------------------------------------------
  // Figuren
  // ---------------------------------------------------------------------------
  function face(cx, cy, opts) {
    opts = opts || {};
    var out = '<circle cx="' + cx + '" cy="' + cy + '" r="17" fill="' + SKIN + '" stroke="' + INK + '" stroke-width="2"/>';
    out += '<circle cx="' + (cx - 6) + '" cy="' + (cy - 3) + '" r="1.8" fill="' + INK + '"/>';
    out += '<circle cx="' + (cx + 6) + '" cy="' + (cy - 3) + '" r="1.8" fill="' + INK + '"/>';
    out += '<path d="M' + cx + ',' + (cy - 1) + ' L' + (cx - 2) + ',' + (cy + 5) + ' L' + (cx + 1) + ',' + (cy + 5) + '" fill="none" stroke="#a0603a" stroke-width="1.4" stroke-linejoin="round"/>';
    out += '<circle cx="' + (cx - 10) + '" cy="' + (cy + 4) + '" r="3" fill="#ec9c88" opacity=".6"/>';
    out += '<circle cx="' + (cx + 10) + '" cy="' + (cy + 4) + '" r="3" fill="#ec9c88" opacity=".6"/>';
    if (opts.beard) {
      out += '<path d="M' + (cx - 15) + ',' + (cy + 4) + ' C' + (cx - 16) + ',' + (cy + 26) + ' ' + (cx - 6) + ',' + (cy + 34) + ' ' + cx + ',' + (cy + 36) +
        ' C' + (cx + 6) + ',' + (cy + 34) + ' ' + (cx + 16) + ',' + (cy + 26) + ' ' + (cx + 15) + ',' + (cy + 4) +
        ' C' + (cx + 8) + ',' + (cy + 12) + ' ' + (cx - 8) + ',' + (cy + 12) + ' ' + (cx - 15) + ',' + (cy + 4) + 'Z" fill="' + opts.beard + '" stroke="' + INK + '" stroke-width="1.6"/>';
    }
    if (opts.moustache) {
      out += '<path d="M' + (cx - 10) + ',' + (cy + 9) + ' C' + (cx - 5) + ',' + (cy + 5) + ' ' + (cx - 1) + ',' + (cy + 7) + ' ' + cx + ',' + (cy + 8) +
        ' C' + (cx + 1) + ',' + (cy + 7) + ' ' + (cx + 5) + ',' + (cy + 5) + ' ' + (cx + 10) + ',' + (cy + 9) + '" fill="none" stroke="' + opts.moustache + '" stroke-width="3" stroke-linecap="round"/>';
    } else {
      out += '<path d="M' + (cx - 4) + ',' + (cy + 10) + ' Q' + cx + ',' + (cy + 12) + ' ' + (cx + 4) + ',' + (cy + 10) + '" fill="none" stroke="' + INK + '" stroke-width="1.4"/>';
    }
    return out;
  }

  function floor(color) {
    return '<path d="M14,296 L186,296" stroke="#8a7a5c" stroke-width="1.6"/>' +
      '<path d="M30,296 l6,-7 l4,7 M60,296 l5,-6 l3,6 M140,296 l5,-7 l4,7 M168,296 l4,-6 l3,6" fill="none" stroke="' + color + '" stroke-width="1.6" stroke-linecap="round"/>';
  }

  function legs(p, y0) {
    return '<rect x="83" y="' + y0 + '" width="14" height="' + (284 - y0) + '" fill="' + p.legs + '" stroke="' + INK + '" stroke-width="1.8"/>' +
      '<rect x="103" y="' + y0 + '" width="14" height="' + (284 - y0) + '" fill="' + p.legs + '" stroke="' + INK + '" stroke-width="1.8"/>' +
      '<path d="M83,' + (y0 + 14) + ' h14 M103,' + (y0 + 14) + ' h14" stroke="' + p.trim + '" stroke-width="3"/>' +
      '<ellipse cx="88" cy="289" rx="12" ry="6" fill="#2a1a10" stroke="' + INK + '" stroke-width="1.5"/>' +
      '<ellipse cx="112" cy="289" rx="12" ry="6" fill="#2a1a10" stroke="' + INK + '" stroke-width="1.5"/>';
  }

  function coat(p, top, bottom) {
    return '<path d="M74,' + top + ' C86,' + (top - 6) + ' 114,' + (top - 6) + ' 126,' + top +
      ' L140,' + bottom + ' C120,' + (bottom + 8) + ' 80,' + (bottom + 8) + ' 60,' + bottom + 'Z" fill="' + p.coat + '" stroke="' + INK + '" stroke-width="2" stroke-linejoin="round"/>' +
      '<path d="M100,' + (top - 2) + ' L100,' + (bottom + 6) + '" stroke="' + p.trim + '" stroke-width="5"/>' +
      '<circle cx="100" cy="' + (top + 18) + '" r="2.6" fill="' + INK + '"/>' +
      '<circle cx="100" cy="' + (top + 36) + '" r="2.6" fill="' + INK + '"/>' +
      '<circle cx="100" cy="' + (top + 54) + '" r="2.6" fill="' + INK + '"/>' +
      '<path d="M62,' + (bottom - 6) + ' C82,' + (bottom + 2) + ' 118,' + (bottom + 2) + ' 138,' + (bottom - 6) + '" fill="none" stroke="' + p.trim + '" stroke-width="3"/>' +
      '<rect x="68" y="' + (top + 62) + '" width="64" height="9" rx="3" fill="#3b2414" stroke="' + INK + '" stroke-width="1.2"/>' +
      '<rect x="95" y="' + (top + 61) + '" width="10" height="11" rx="2" fill="' + GOLD + '" stroke="' + INK + '" stroke-width="1.2"/>';
  }

  function ruff(cy) {
    var out = '<ellipse cx="100" cy="' + cy + '" rx="20" ry="7" fill="#fffdf5" stroke="' + INK + '" stroke-width="1.6"/>';
    for (var i = -15; i <= 15; i += 6) out += '<path d="M' + (100 + i) + ',' + (cy - 6) + ' L' + (100 + i) + ',' + (cy + 6) + '" stroke="#c9b27a" stroke-width="1"/>';
    return out;
  }

  function ober(suit) {
    var p = PALETTE[suit];
    var out = floor(p.accent);
    out += legs(p, 212);
    // Schwert an der Seite
    out += '<path d="M130,180 L152,270" stroke="#b9bfc6" stroke-width="5" stroke-linecap="round"/>' +
      '<path d="M124,184 L138,176" stroke="' + GOLD + '" stroke-width="5" stroke-linecap="round"/>';
    out += coat(p, 108, 214);
    // rechter Arm am Schwertgriff
    out += '<path d="M124,112 C140,130 140,154 132,176" fill="none" stroke="' + p.coat + '" stroke-width="13" stroke-linecap="round"/>' +
      '<path d="M124,112 C140,130 140,154 132,176" fill="none" stroke="' + INK + '" stroke-width="1.5" stroke-dasharray="0" opacity=".25"/>' +
      '<circle cx="131" cy="178" r="6" fill="' + SKIN + '" stroke="' + INK + '" stroke-width="1.6"/>';
    // linker Arm hebt das Farbzeichen (Ober = oben)
    out += '<path d="M76,114 C62,100 56,86 54,72" fill="none" stroke="' + p.coat + '" stroke-width="13" stroke-linecap="round"/>' +
      '<path d="M70,106 L60,96" stroke="' + p.trim + '" stroke-width="3"/>' +
      '<circle cx="54" cy="68" r="6" fill="' + SKIN + '" stroke="' + INK + '" stroke-width="1.6"/>';
    out += pip(suit, 46, 44, 0.42, -8, ' data-role="ober-pip"');
    out += ruff(103);
    out += face(100, 82, { moustache: '#5a3418' });
    // Federhut
    out += '<path d="M100,60 C112,40 132,34 146,36 C132,42 120,50 110,62" fill="' + p.trim + '" stroke="' + INK + '" stroke-width="1.5"/>' +
      '<path d="M78,64 C80,50 90,44 100,44 C112,44 120,50 122,64Z" fill="' + p.hat + '" stroke="' + INK + '" stroke-width="2"/>' +
      '<ellipse cx="100" cy="66" rx="30" ry="6.5" fill="' + p.hat + '" stroke="' + INK + '" stroke-width="2"/>' +
      '<path d="M80,60 L120,60" stroke="' + p.trim + '" stroke-width="3"/>';
    return out;
  }

  function unter(suit) {
    var p = PALETTE[suit];
    var swapped = { coat: p.legs, trim: p.trim, hat: p.hat, legs: p.coat, accent: p.accent };
    var out = floor(p.accent);
    out += legs(swapped, 212);
    out += coat(swapped, 108, 214);
    // rechte Hand in der Hüfte
    out += '<path d="M124,112 C142,124 146,146 128,166" fill="none" stroke="' + swapped.coat + '" stroke-width="13" stroke-linecap="round"/>' +
      '<circle cx="128" cy="168" r="6" fill="' + SKIN + '" stroke="' + INK + '" stroke-width="1.6"/>';
    // linker Arm hängt runter und hält das Farbzeichen tief (Unter = unten)
    out += '<path d="M76,114 C62,140 58,178 56,210" fill="none" stroke="' + swapped.coat + '" stroke-width="13" stroke-linecap="round"/>' +
      '<path d="M66,150 L54,148" stroke="' + p.trim + '" stroke-width="3"/>' +
      '<circle cx="56" cy="214" r="6" fill="' + SKIN + '" stroke="' + INK + '" stroke-width="1.6"/>';
    out += pip(suit, 46, 246, 0.42, 6, ' data-role="unter-pip"');
    out += ruff(103);
    out += face(100, 82, {});
    // Barett mit kleiner Feder
    out += '<path d="M76,70 C74,52 90,46 104,48 C120,50 128,58 124,70 C110,64 90,64 76,70Z" fill="' + p.hat + '" stroke="' + INK + '" stroke-width="2"/>' +
      '<path d="M116,52 C124,40 134,36 140,38" fill="none" stroke="' + p.trim + '" stroke-width="3" stroke-linecap="round"/>' +
      '<path d="M86,70 C84,76 84,80 86,84 M114,70 C116,76 116,80 114,84" fill="none" stroke="#6b3d1a" stroke-width="3" stroke-linecap="round"/>';
    return out;
  }

  function koenig(suit) {
    var p = PALETTE[suit];
    var out = floor(p.accent);
    // Thron
    out += '<path d="M56,96 C56,76 76,70 100,70 C124,70 144,76 144,96 L144,240 L56,240Z" fill="#7a2a1a" stroke="' + INK + '" stroke-width="2"/>' +
      '<path d="M64,100 C64,84 80,78 100,78 C120,78 136,84 136,100 L136,236 L64,236Z" fill="none" stroke="' + GOLD + '" stroke-width="2"/>' +
      '<circle cx="56" cy="96" r="6" fill="' + GOLD + '" stroke="' + INK + '" stroke-width="1.5"/>' +
      '<circle cx="144" cy="96" r="6" fill="' + GOLD + '" stroke="' + INK + '" stroke-width="1.5"/>';
    // Mantel (sitzend, bis zum Boden)
    out += '<path d="M76,124 C86,118 114,118 124,124 L150,286 C120,294 80,294 50,286Z" fill="' + p.coat + '" stroke="' + INK + '" stroke-width="2" stroke-linejoin="round"/>' +
      '<path d="M100,124 L100,290" stroke="' + p.trim + '" stroke-width="5"/>' +
      '<path d="M52,280 C80,288 120,288 148,280" fill="none" stroke="#fffdf5" stroke-width="7"/>' +
      '<path d="M60,282 l0,4 M76,284 l0,4 M92,285 l0,4 M108,285 l0,4 M124,284 l0,4 M140,282 l0,4" stroke="' + INK + '" stroke-width="2"/>';
    // Hermelinkragen
    out += '<path d="M72,126 C84,140 116,140 128,126 C120,118 80,118 72,126Z" fill="#fffdf5" stroke="' + INK + '" stroke-width="1.6"/>' +
      '<path d="M84,128 l0,4 M96,132 l0,4 M108,132 l0,4 M118,128 l0,4" stroke="' + INK + '" stroke-width="2"/>';
    // Zepter in der rechten Hand
    out += '<path d="M132,206 L150,60" stroke="' + GOLD + '" stroke-width="5" stroke-linecap="round"/>' +
      '<circle cx="151" cy="54" r="8" fill="' + GOLD + '" stroke="' + INK + '" stroke-width="1.6"/>' +
      '<path d="M151,42 L151,48 M148,45 L154,45" stroke="' + INK + '" stroke-width="2"/>' +
      '<path d="M122,132 C140,150 140,180 134,200" fill="none" stroke="' + p.coat + '" stroke-width="13" stroke-linecap="round"/>' +
      '<circle cx="134" cy="204" r="6.5" fill="' + SKIN + '" stroke="' + INK + '" stroke-width="1.6"/>';
    // linke Hand auf dem Knie
    out += '<path d="M78,132 C62,150 62,178 74,196" fill="none" stroke="' + p.coat + '" stroke-width="13" stroke-linecap="round"/>' +
      '<circle cx="76" cy="198" r="6.5" fill="' + SKIN + '" stroke="' + INK + '" stroke-width="1.6"/>';
    out += face(100, 100, { beard: '#d8d2c4', moustache: '#bfb8a8' });
    // Krone
    out += '<path d="M80,86 L80,64 L88,74 L94,58 L100,72 L106,58 L112,74 L120,64 L120,86Z" fill="' + GOLD + '" stroke="#7a5a10" stroke-width="2" stroke-linejoin="round"/>' +
      '<rect x="80" y="80" width="40" height="7" fill="' + GOLD + '" stroke="#7a5a10" stroke-width="1.6"/>' +
      '<circle cx="90" cy="83.5" r="2" fill="#c42a1c"/><circle cx="100" cy="83.5" r="2" fill="#2f5aa6"/><circle cx="110" cy="83.5" r="2" fill="#c42a1c"/>';
    out += pip(suit, 38, 40, 0.38, 0, ' data-role="koenig-pip"');
    return out;
  }

  // ---------------------------------------------------------------------------
  // Öffentliche Funktionen
  // ---------------------------------------------------------------------------
  function svgOpen(attrs) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" ' + attrs + '>';
  }

  function renderCard(card) {
    var suit = card.suit;
    var rank = card.rank;
    if (!SUIT_ART[suit] || !RANK_LABEL[rank]) throw new Error('Unbekannte Karte: ' + suit + '/' + rank);
    var label = SUIT_LABEL[suit] + '-' + RANK_LABEL[rank];
    var body;
    if (rank === 'neun' || rank === 'zehn') body = numberCard(suit, rank);
    else if (rank === 'sau') body = sauCard(suit);
    else if (rank === 'ober') body = ober(suit);
    else if (rank === 'unter') body = unter(suit);
    else body = koenig(suit);
    return svgOpen('class="card-svg" role="img" aria-label="' + label + '" data-card="' + suit + '-' + rank + '"') +
      '<title>' + label + '</title>' + frame() + body + '</svg>';
  }

  function renderBack() {
    var out = svgOpen('class="card-svg card-back-svg" aria-hidden="true"');
    out += '<rect x="2" y="2" width="196" height="316" rx="14" fill="#1d4f8f" stroke="#0d2a52" stroke-width="2"/>';
    out += '<rect x="12" y="12" width="176" height="296" rx="8" fill="#2a64ad" stroke="#e9eef7" stroke-width="2"/>';
    var lines = '';
    for (var k = -300; k <= 200; k += 18) {
      lines += 'M' + (12 + k) + ',12 L' + (12 + k + 296) + ',308 ';
      lines += 'M' + (188 - k) + ',12 L' + (188 - k - 296) + ',308 ';
    }
    // Rautenmuster, auf die Innenfläche begrenzt durch inneren Rahmen darüber
    out += '<path d="' + lines.trim() + '" stroke="#e9eef7" stroke-width="1.6" opacity=".55"/>';
    out += '<path d="M16,2 H184 A14,14 0 0 1 198,16 V304 A14,14 0 0 1 184,318 H16 A14,14 0 0 1 2,304 V16 A14,14 0 0 1 16,2Z M12,20 A8,8 0 0 1 20,12 H180 A8,8 0 0 1 188,20 V300 A8,8 0 0 1 180,308 H20 A8,8 0 0 1 12,300Z" fill="#1d4f8f" fill-rule="evenodd"/>';
    out += '<rect x="2" y="2" width="196" height="316" rx="14" fill="none" stroke="#0d2a52" stroke-width="2"/>';
    out += '<rect x="12" y="12" width="176" height="296" rx="8" fill="none" stroke="#e9eef7" stroke-width="2"/>';
    out += '<ellipse cx="100" cy="160" rx="40" ry="56" fill="#1d4f8f" stroke="#e9eef7" stroke-width="2.5"/>';
    out += '<g transform="translate(100 160) scale(0.55)">' + SUIT_ART.eichel + '</g>';
    out += '</svg>';
    return out;
  }

  return {
    WIDTH: W,
    HEIGHT: H,
    SUIT_ART: SUIT_ART,
    PALETTE: PALETTE,
    renderCard: renderCard,
    renderBack: renderBack,
    renderMark: function (suit, size) {
      return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-50 -50 100 100" class="suit-mark" width="' + size +
        '" height="' + size + '" aria-hidden="true">' + SUIT_ART[suit] + '</svg>';
    }
  };
});
