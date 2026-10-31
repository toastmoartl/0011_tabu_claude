/*
 * Schafkopf-Augen-Trainer – reine Spiellogik (ohne DOM).
 * Läuft als klassisches Browser-Skript (window.SchafkopfLogic) und als
 * CommonJS-Modul in Node (für die Unit-Tests).
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SchafkopfLogic = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Karten
  // ---------------------------------------------------------------------------
  var SUITS = ['eichel', 'gras', 'herz', 'schellen'];
  var RANKS = ['neun', 'zehn', 'unter', 'ober', 'koenig', 'sau'];
  var POINTS = { neun: 0, zehn: 10, unter: 2, ober: 3, koenig: 4, sau: 11 };
  var SUIT_NAMES = { eichel: 'Eichel', gras: 'Gras', herz: 'Herz', schellen: 'Schellen' };
  var RANK_NAMES = { neun: 'Neun', zehn: 'Zehn', unter: 'Unter', ober: 'Ober', koenig: 'König', sau: 'Sau' };
  var HAND_SIZE = 4;
  var MAX_HAND_POINTS = 44; // vier Säue

  function createDeck() {
    var deck = [];
    SUITS.forEach(function (suit) {
      RANKS.forEach(function (rank) {
        deck.push({ id: suit + '-' + rank, suit: suit, rank: rank, points: POINTS[rank] });
      });
    });
    return deck;
  }

  function cardLabel(card) {
    return SUIT_NAMES[card.suit] + '-' + RANK_NAMES[card.rank];
  }

  function cardById(id) {
    var parts = String(id).split('-');
    if (parts.length !== 2 || SUITS.indexOf(parts[0]) < 0 || RANKS.indexOf(parts[1]) < 0) return null;
    return { id: id, suit: parts[0], rank: parts[1], points: POINTS[parts[1]] };
  }

  function sumPoints(cards) {
    return cards.reduce(function (sum, c) { return sum + POINTS[c.rank]; }, 0);
  }

  // ---------------------------------------------------------------------------
  // Zufall (deterministisch mit Seed – wichtig für Tests)
  // ---------------------------------------------------------------------------
  function createRng(seed) {
    if (seed === undefined || seed === null || seed === '' || isNaN(Number(seed))) return Math.random;
    var a = (Number(seed) >>> 0) || 0x9e3779b9;
    return function mulberry32() {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(list, rng) {
    var arr = list.slice();
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }

  /**
   * Zieht n verschiedene Karten. Optional gewichtet (weights: id -> Zahl > 0),
   * z. B. damit oft falsch gezählte Karten häufiger drankommen.
   */
  function drawCards(deck, n, rng, weights) {
    n = n === undefined ? HAND_SIZE : n;
    rng = rng || Math.random;
    if (n > deck.length) throw new Error('Nicht genug Karten im Blatt');
    if (!weights) return shuffle(deck, rng).slice(0, n);
    var pool = deck.slice();
    var hand = [];
    while (hand.length < n) {
      var total = 0;
      var w = pool.map(function (c) {
        var x = Number(weights[c.id]);
        x = isFinite(x) && x > 0 ? x : 1;
        total += x;
        return x;
      });
      var r = rng() * total;
      var idx = 0;
      while (idx < pool.length - 1 && r >= w[idx]) { r -= w[idx]; idx++; }
      hand.push(pool.splice(idx, 1)[0]);
    }
    return hand;
  }

  // ---------------------------------------------------------------------------
  // Mögliche Summen & Antwort-Optionen („knapp daneben“)
  // ---------------------------------------------------------------------------
  var achievableCache = null;
  function achievableSums() {
    if (achievableCache) return achievableCache;
    var deck = createDeck();
    var set = {};
    for (var a = 0; a < deck.length; a++)
      for (var b = a + 1; b < deck.length; b++)
        for (var c = b + 1; c < deck.length; c++)
          for (var d = c + 1; d < deck.length; d++)
            set[deck[a].points + deck[b].points + deck[c].points + deck[d].points] = true;
    achievableCache = Object.keys(set).map(Number).sort(function (x, y) { return x - y; });
    return achievableCache;
  }

  function isAchievable(sum) {
    return achievableSums().indexOf(sum) >= 0;
  }

  /** Typische Zählfehler je Karte als Abweichung vom richtigen Ergebnis. */
  var TYPICAL_ERRORS = {
    neun: [],
    zehn: [+1],          // Zehn als 11 gezählt
    unter: [+1, +2, -2], // als Ober / als König / vergessen
    ober: [+1, -1, -3],  // als König / als Unter / vergessen
    koenig: [-1, -2, -4],// als Ober / als Unter / vergessen
    sau: [-1]            // Sau als 10 gezählt
  };

  function typicalErrorOffsets(cards) {
    var offsets = {};
    cards.forEach(function (c) {
      (TYPICAL_ERRORS[c.rank] || []).forEach(function (o) { offsets[o] = true; });
    });
    return Object.keys(offsets).map(Number);
  }

  /**
   * Liefert `count` falsche, aber knappe Antworten.
   * Bewertung: Abstand zur Lösung, Bonus für typische Zählfehler,
   * Malus für Summen, die mit vier Karten gar nicht möglich sind.
   */
  function makeDistractors(correct, cards, rng, count) {
    count = count === undefined ? 3 : count;
    rng = rng || Math.random;
    var typical = typicalErrorOffsets(cards || []);
    var candidates = [];
    for (var v = 0; v <= MAX_HAND_POINTS; v++) {
      if (v === correct) continue;
      var dist = Math.abs(v - correct);
      var score = dist;
      if (typical.indexOf(v - correct) >= 0) score -= 1.5;
      if (!isAchievable(v)) score += 2;
      score += rng() * 0.9; // etwas Abwechslung bei Gleichstand
      candidates.push({ value: v, score: score });
    }
    candidates.sort(function (x, y) { return x.score - y.score; });
    return candidates.slice(0, count).map(function (c) { return c.value; });
  }

  function makeChoices(correct, cards, rng) {
    rng = rng || Math.random;
    return shuffle([correct].concat(makeDistractors(correct, cards, rng, 3)), rng);
  }

  function parseAnswer(input) {
    var s = String(input === undefined || input === null ? '' : input).trim();
    if (!/^\d{1,3}$/.test(s)) return null;
    return parseInt(s, 10);
  }

  // ---------------------------------------------------------------------------
  // Einstellungen
  // ---------------------------------------------------------------------------
  var DEFAULT_SETTINGS = Object.freeze({
    displaySeconds: 3,
    revealMode: 'together',      // 'together' | 'sequential'
    revealDelaySeconds: 0.6,
    inputMode: 'choice',         // 'choice' | 'number'
    gameMode: 'rounds',          // 'rounds' | 'endless'
    rounds: 10,
    answerLimitEnabled: false,
    answerLimitSeconds: 8,
    sound: true,
    vibration: true,
    theme: 'auto',               // 'auto' | 'light' | 'dark'
    language: 'bairisch',        // 'bairisch' | 'hochdeutsch'
    adaptive: true
  });

  var LIMITS = Object.freeze({
    displaySeconds: { min: 0.5, max: 10, step: 0.5 },
    revealDelaySeconds: { min: 0.2, max: 2, step: 0.1 },
    rounds: { min: 1, max: 50, step: 1 },
    answerLimitSeconds: { min: 2, max: 20, step: 1 }
  });

  var ENUMS = Object.freeze({
    revealMode: ['together', 'sequential'],
    inputMode: ['choice', 'number'],
    gameMode: ['rounds', 'endless'],
    theme: ['auto', 'light', 'dark'],
    language: ['bairisch', 'hochdeutsch']
  });

  function clampStep(value, limit, fallback) {
    var n = Number(value);
    if (value === null || value === '' || typeof value === 'boolean' || !isFinite(n)) return fallback;
    n = Math.min(limit.max, Math.max(limit.min, n));
    var steps = Math.round((n - limit.min) / limit.step);
    return Math.round((limit.min + steps * limit.step) * 1000) / 1000;
  }

  function sanitizeSettings(input) {
    var src = input && typeof input === 'object' ? input : {};
    var out = {};
    Object.keys(DEFAULT_SETTINGS).forEach(function (key) {
      var def = DEFAULT_SETTINGS[key];
      var val = src[key];
      if (LIMITS[key]) out[key] = clampStep(val, LIMITS[key], def);
      else if (ENUMS[key]) out[key] = ENUMS[key].indexOf(val) >= 0 ? val : def;
      else if (typeof def === 'boolean') out[key] = typeof val === 'boolean' ? val : def;
      else out[key] = def;
    });
    return out;
  }

  /** Zeitplan einer Runde in Millisekunden ab Rundenstart. */
  function revealSchedule(settings) {
    var s = sanitizeSettings(settings);
    var step = s.revealMode === 'sequential' ? Math.round(s.revealDelaySeconds * 1000) : 0;
    var cardTimes = [];
    for (var i = 0; i < HAND_SIZE; i++) cardTimes.push(i * step);
    var lastShown = cardTimes[HAND_SIZE - 1];
    return { cardTimes: cardTimes, hideAt: lastShown + Math.round(s.displaySeconds * 1000) };
  }

  // ---------------------------------------------------------------------------
  // Zustandsmaschine des Spiels
  // ---------------------------------------------------------------------------
  var TRANSITIONS = Object.freeze({
    setup: { START: 'reveal', SHOW_STATS: 'stats' },
    stats: { BACK: 'setup', RESET: 'stats' },
    reveal: { HIDE: 'answer', QUIT: 'summary' },
    answer: { ANSWER: 'feedback', TIMEOUT: 'feedback', QUIT: 'summary' },
    feedback: { NEXT: 'reveal', FINISH: 'summary', QUIT: 'summary' },
    summary: { AGAIN: 'reveal', BACK: 'setup', SHOW_STATS: 'stats' }
  });

  function transition(phase, event) {
    var row = TRANSITIONS[phase];
    if (!row || !row[event]) throw new Error('Ungültiger Übergang: ' + phase + ' --' + event + '-->');
    return row[event];
  }

  function canTransition(phase, event) {
    return !!(TRANSITIONS[phase] && TRANSITIONS[phase][event]);
  }

  /** Nach einer Rückmeldung: weiter oder Ende? */
  function afterFeedbackEvent(settings, answeredRounds) {
    var s = sanitizeSettings(settings);
    if (s.gameMode === 'rounds' && answeredRounds >= s.rounds) return 'FINISH';
    return 'NEXT';
  }

  /**
   * Vibrationsdauer in Millisekunden. Wichtig ist nur, dass man „falsch“ klar von „richtig“ unterscheiden kann:
   * richtig = kurzes Antippen, falsch = ein deutlich längerer Brummer (ein einzelner langer Impuls ist
   * zuverlässiger spürbar als eine Folge aus Impulsen mit Pause).
   */
  var VIBRATION = Object.freeze({
    right: 30,
    wrong: 300,
    key: 8
  });

  /**
   * Was passiert direkt nach einer Antwort?
   * Richtig → ohne Umweg weiter ('NEXT') oder Ende ('FINISH').
   * Falsch oder Zeit abgelaufen → erst die Rückmeldung mit der Rechnung ('FEEDBACK').
   */
  function afterAnswerStep(settings, answeredRounds, isCorrect) {
    if (!isCorrect) return 'FEEDBACK';
    return afterFeedbackEvent(settings, answeredRounds);
  }

  // ---------------------------------------------------------------------------
  // Sitzung & Statistik
  // ---------------------------------------------------------------------------
  function createSession(settings) {
    var s = sanitizeSettings(settings);
    return {
      mode: s.gameMode,
      inputMode: s.inputMode,
      displaySeconds: s.displaySeconds,
      answers: [],
      streak: 0,
      bestStreak: 0
    };
  }

  /** Gibt eine neue Sitzung zurück (unveränderlich). */
  function recordAnswer(session, entry) {
    var correctSum = sumPoints(entry.cards);
    var isCorrect = !entry.timedOut && entry.answer === correctSum;
    var streak = isCorrect ? session.streak + 1 : 0;
    var record = {
      cardIds: entry.cards.map(function (c) { return c.id; }),
      correct: correctSum,
      answer: entry.timedOut ? null : entry.answer,
      isCorrect: isCorrect,
      timedOut: !!entry.timedOut,
      timeMs: Math.max(0, Math.round(entry.timeMs || 0))
    };
    return Object.assign({}, session, {
      answers: session.answers.concat([record]),
      streak: streak,
      bestStreak: Math.max(session.bestStreak, streak)
    });
  }

  function summarizeSession(session) {
    var n = session.answers.length;
    var right = session.answers.filter(function (a) { return a.isCorrect; }).length;
    var answered = session.answers.filter(function (a) { return !a.timedOut; });
    var avg = answered.length
      ? Math.round(answered.reduce(function (s, a) { return s + a.timeMs; }, 0) / answered.length)
      : null;
    return {
      rounds: n,
      correct: right,
      accuracy: n ? right / n : 0,
      avgTimeMs: avg,
      bestStreak: session.bestStreak
    };
  }

  // ---------------------------------------------------------------------------
  // Dauerhafter Speicher (versioniert)
  // ---------------------------------------------------------------------------
  var STORE_VERSION = 1;
  var HISTORY_LIMIT = 50;
  var STORAGE_KEY = 'schafkopf-augen-trainer';

  function emptyStore() {
    return {
      version: STORE_VERSION,
      settings: sanitizeSettings({}),
      history: [],
      best: { accuracy: null, bestStreak: 0, fastestAvgMs: null, totalRounds: 0, totalCorrect: 0 },
      cardStats: {}
    };
  }

  function migrateStore(data) {
    if (!data || typeof data !== 'object') return emptyStore();
    var version = Number(data.version) || 0;
    if (version > STORE_VERSION) return emptyStore(); // unbekannte Zukunftsversion
    var store = emptyStore();
    store.settings = sanitizeSettings(data.settings);
    if (Array.isArray(data.history)) {
      store.history = data.history.filter(function (h) {
        return h && typeof h === 'object' && isFinite(h.rounds) && isFinite(h.correct);
      }).slice(-HISTORY_LIMIT);
    }
    if (data.best && typeof data.best === 'object') {
      Object.keys(store.best).forEach(function (k) {
        var v = data.best[k];
        if (v === null || isFinite(v)) store.best[k] = v === undefined ? store.best[k] : v;
      });
    }
    if (data.cardStats && typeof data.cardStats === 'object') {
      Object.keys(data.cardStats).forEach(function (id) {
        var cs = data.cardStats[id];
        if (cardById(id) && cs && isFinite(cs.seen) && isFinite(cs.wrong)) {
          store.cardStats[id] = { seen: Math.max(0, cs.seen | 0), wrong: Math.max(0, Math.min(cs.seen | 0, cs.wrong | 0)) };
        }
      });
    }
    return store;
  }

  function loadStore(raw) {
    if (!raw) return emptyStore();
    try { return migrateStore(JSON.parse(raw)); } catch (e) { return emptyStore(); }
  }

  function serializeStore(store) {
    return JSON.stringify(store);
  }

  /** Übernimmt eine beendete Sitzung in den Speicher. */
  function mergeSession(store, session, timestamp) {
    var sum = summarizeSession(session);
    if (sum.rounds === 0) return store;
    var next = migrateStore(JSON.parse(JSON.stringify(store)));
    next.history = next.history.concat([{
      date: timestamp,
      rounds: sum.rounds,
      correct: sum.correct,
      avgTimeMs: sum.avgTimeMs,
      bestStreak: sum.bestStreak,
      mode: session.mode,
      inputMode: session.inputMode
    }]).slice(-HISTORY_LIMIT);

    var best = next.best;
    best.totalRounds += sum.rounds;
    best.totalCorrect += sum.correct;
    best.bestStreak = Math.max(best.bestStreak, sum.bestStreak);
    // Bestwerte für Quote/Tempo erst ab 5 Runden, sonst zählt Glück zu viel.
    if (sum.rounds >= 5) {
      if (best.accuracy === null || sum.accuracy > best.accuracy) best.accuracy = sum.accuracy;
      if (sum.avgTimeMs !== null && sum.accuracy >= 0.8 &&
          (best.fastestAvgMs === null || sum.avgTimeMs < best.fastestAvgMs)) {
        best.fastestAvgMs = sum.avgTimeMs;
      }
    }

    session.answers.forEach(function (a) {
      a.cardIds.forEach(function (id) {
        var cs = next.cardStats[id] || { seen: 0, wrong: 0 };
        cs.seen += 1;
        if (!a.isCorrect) cs.wrong += 1;
        next.cardStats[id] = cs;
      });
    });
    return next;
  }

  /** Fehlerquote mit Glättung, damit wenige Daten nicht übertreiben. */
  function cardErrorRate(cs) {
    if (!cs) return 0;
    return cs.wrong / (cs.seen + 2);
  }

  /** Gewichte fürs Ziehen: 1 (normal) bis 5 (oft falsch). */
  function cardWeights(cardStats) {
    var weights = {};
    createDeck().forEach(function (c) {
      weights[c.id] = 1 + 4 * cardErrorRate(cardStats && cardStats[c.id]);
    });
    return weights;
  }

  /** Die Karten mit den meisten Fehlern (mind. minSeen-mal gesehen). */
  function weakestCards(cardStats, limit, minSeen) {
    limit = limit === undefined ? 6 : limit;
    minSeen = minSeen === undefined ? 3 : minSeen;
    return Object.keys(cardStats || {})
      .filter(function (id) { return cardStats[id].seen >= minSeen && cardStats[id].wrong > 0; })
      .map(function (id) {
        return { id: id, seen: cardStats[id].seen, wrong: cardStats[id].wrong, rate: cardStats[id].wrong / cardStats[id].seen };
      })
      .sort(function (a, b) { return b.rate - a.rate || b.wrong - a.wrong || (a.id < b.id ? -1 : 1); })
      .slice(0, limit);
  }

  // ---------------------------------------------------------------------------
  // Texte
  // ---------------------------------------------------------------------------
  var TEXTS = {
    bairisch: {
      title: 'Augn zähln',
      subtitle: 'Schafkopf-Trainer · kurz’s Blatt',
      start: 'Auf geht’s!',
      stats: 'Stammtisch-Buach',
      settings: 'Eistellunga',
      displaySeconds: 'Wia lang aufdeckt',
      revealMode: 'Aufdecka',
      revealTogether: 'Olle gleich',
      revealSequential: 'Nacheinand',
      revealDelay: 'Pause zwischn de Kartn',
      inputMode: 'Antwort',
      inputChoice: '4 zum Tippn',
      inputNumber: 'Zahl eigebn',
      gameMode: 'Spuimodus',
      modeRounds: 'Runden',
      modeEndless: 'Endlos',
      rounds: 'Anzahl Runden',
      answerLimit: 'Zeitdruck beim Antwortn',
      answerLimitSeconds: 'Zeit fürs Antwortn',
      sound: 'Ton',
      vibration: 'Vibration',
      theme: 'Stimmung',
      themeAuto: 'Auto',
      themeLight: 'Dog',
      themeDark: 'Nacht',
      language: 'Sprach',
      langBairisch: 'Boarisch',
      langHochdeutsch: 'Hochdeutsch',
      adaptive: 'Schwachstelln öfter übn',
      seconds: '{n} s',
      roundOf: 'Runde {i} vo {n}',
      roundEndless: 'Runde {i}',
      watch: 'Guad aufpassn …',
      question: 'Wia vui Augn?',
      check: 'Schaug ma',
      delete: 'Löschn',
      placeholder: 'Augn',
      correct: 'Passt!',
      wrong: 'Naa, des warn {n}.',
      timeout: 'Z’langsam! Des warn {n}.',
      yourAnswer: 'Du host {n} gsagt.',
      next: 'Weida',
      finish: 'Abrechna',
      quit: 'Aufhörn',
      summaryTitle: 'Abgrechnet is!',
      accuracy: 'Treffer',
      avgTime: 'Schnitt',
      bestStreak: 'Längste Serie',
      again: 'No amoi!',
      toSetup: 'Zruck zu de Eistellunga',
      back: 'Zruck',
      reset: 'Ois löschn',
      confirmReset: 'Wirklich des ganze Stammtisch-Buach löschn?',
      bestValues: 'Bestwerte',
      bestAccuracy: 'Beste Quote',
      fastest: 'Schnellster Schnitt',
      totalRounds: 'Runden insgesamt',
      history: 'Verlauf',
      weakCards: 'Do hakt’s no',
      weakCardsHint: 'Kartn, de oft in falsch zähltn Stichen warn',
      noData: 'No nix drin – erst amoi spuin!',
      streak: 'Serie: {n}',
      dash: '–'
    },
    hochdeutsch: {
      title: 'Augen zählen',
      subtitle: 'Schafkopf-Trainer · kurzes Blatt',
      start: 'Los geht’s!',
      stats: 'Statistik',
      settings: 'Einstellungen',
      displaySeconds: 'Anzeigedauer',
      revealMode: 'Aufdecken',
      revealTogether: 'Gleichzeitig',
      revealSequential: 'Nacheinander',
      revealDelay: 'Pause zwischen den Karten',
      inputMode: 'Antwort',
      inputChoice: '4 Optionen',
      inputNumber: 'Zahl eingeben',
      gameMode: 'Spielmodus',
      modeRounds: 'Runden',
      modeEndless: 'Endlos',
      rounds: 'Anzahl Runden',
      answerLimit: 'Zeitdruck beim Antworten',
      answerLimitSeconds: 'Zeit zum Antworten',
      sound: 'Ton',
      vibration: 'Vibration',
      theme: 'Optik',
      themeAuto: 'Auto',
      themeLight: 'Tag',
      themeDark: 'Abend',
      language: 'Sprache',
      langBairisch: 'Bairisch',
      langHochdeutsch: 'Hochdeutsch',
      adaptive: 'Schwachstellen öfter üben',
      seconds: '{n} s',
      roundOf: 'Runde {i} von {n}',
      roundEndless: 'Runde {i}',
      watch: 'Gut aufpassen …',
      question: 'Wie viele Augen?',
      check: 'Prüfen',
      delete: 'Löschen',
      placeholder: 'Augen',
      correct: 'Richtig!',
      wrong: 'Leider falsch – es waren {n}.',
      timeout: 'Zu langsam! Es waren {n}.',
      yourAnswer: 'Deine Antwort: {n}',
      next: 'Weiter',
      finish: 'Auswerten',
      quit: 'Beenden',
      summaryTitle: 'Auswertung',
      accuracy: 'Treffer',
      avgTime: 'Schnitt',
      bestStreak: 'Längste Serie',
      again: 'Nochmal!',
      toSetup: 'Zurück zu den Einstellungen',
      back: 'Zurück',
      reset: 'Alles löschen',
      confirmReset: 'Wirklich alle Statistiken löschen?',
      bestValues: 'Bestwerte',
      bestAccuracy: 'Beste Quote',
      fastest: 'Schnellster Schnitt',
      totalRounds: 'Runden insgesamt',
      history: 'Verlauf',
      weakCards: 'Schwachstellen',
      weakCardsHint: 'Karten, die oft in falsch gezählten Stichen lagen',
      noData: 'Noch keine Daten – erst einmal spielen!',
      streak: 'Serie: {n}',
      dash: '–'
    }
  };

  function t(language, key, params) {
    var dict = TEXTS[language] || TEXTS[DEFAULT_SETTINGS.language];
    var str = dict[key];
    if (str === undefined) str = TEXTS.hochdeutsch[key];
    if (str === undefined) return key;
    return str.replace(/\{(\w+)\}/g, function (m, name) {
      return params && params[name] !== undefined ? String(params[name]) : m;
    });
  }

  function formatSeconds(ms) {
    if (ms === null || ms === undefined || !isFinite(ms)) return null;
    return (ms / 1000).toFixed(1).replace('.', ',') + ' s';
  }

  function formatPercent(ratio) {
    if (ratio === null || ratio === undefined || !isFinite(ratio)) return null;
    return Math.round(ratio * 100) + ' %';
  }

  function formatEquation(cards) {
    return cards.map(function (c) { return POINTS[c.rank]; }).join(' + ') + ' = ' + sumPoints(cards);
  }

  return {
    SUITS: SUITS,
    RANKS: RANKS,
    POINTS: POINTS,
    SUIT_NAMES: SUIT_NAMES,
    RANK_NAMES: RANK_NAMES,
    HAND_SIZE: HAND_SIZE,
    MAX_HAND_POINTS: MAX_HAND_POINTS,
    createDeck: createDeck,
    cardLabel: cardLabel,
    cardById: cardById,
    sumPoints: sumPoints,
    createRng: createRng,
    shuffle: shuffle,
    drawCards: drawCards,
    achievableSums: achievableSums,
    isAchievable: isAchievable,
    typicalErrorOffsets: typicalErrorOffsets,
    makeDistractors: makeDistractors,
    makeChoices: makeChoices,
    parseAnswer: parseAnswer,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    LIMITS: LIMITS,
    ENUMS: ENUMS,
    sanitizeSettings: sanitizeSettings,
    revealSchedule: revealSchedule,
    TRANSITIONS: TRANSITIONS,
    transition: transition,
    canTransition: canTransition,
    afterFeedbackEvent: afterFeedbackEvent,
    afterAnswerStep: afterAnswerStep,
    VIBRATION: VIBRATION,
    createSession: createSession,
    recordAnswer: recordAnswer,
    summarizeSession: summarizeSession,
    STORE_VERSION: STORE_VERSION,
    HISTORY_LIMIT: HISTORY_LIMIT,
    STORAGE_KEY: STORAGE_KEY,
    emptyStore: emptyStore,
    migrateStore: migrateStore,
    loadStore: loadStore,
    serializeStore: serializeStore,
    mergeSession: mergeSession,
    cardErrorRate: cardErrorRate,
    cardWeights: cardWeights,
    weakestCards: weakestCards,
    TEXTS: TEXTS,
    t: t,
    formatSeconds: formatSeconds,
    formatPercent: formatPercent,
    formatEquation: formatEquation
  };
});
