/*
 * Schafkopf-Augen-Trainer – Oberfläche, Zeitsteuerung, Ton & Speicher.
 * Die eigentliche Logik steckt in logic.js (unit-getestet), die Karten in cards.js.
 */
(function () {
  'use strict';

  var L = window.SchafkopfLogic;
  var C = window.SchafkopfCards;

  // ---------------------------------------------------------------------------
  // Hilfen
  // ---------------------------------------------------------------------------
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  var params = new URLSearchParams(window.location.search);
  var rng = L.createRng(params.get('seed'));

  // ---------------------------------------------------------------------------
  // Speicher
  // ---------------------------------------------------------------------------
  function readStorage() {
    try { return window.localStorage.getItem(L.STORAGE_KEY); } catch (e) { return null; }
  }
  function writeStorage(store) {
    try { window.localStorage.setItem(L.STORAGE_KEY, L.serializeStore(store)); } catch (e) { /* privater Modus */ }
  }

  var state = {
    phase: 'setup',
    store: L.loadStore(readStorage()),
    session: null,
    hand: [],
    choices: [],
    roundNumber: 0,
    answerStartedAt: 0,
    countdown: null,
    lastSummary: null,
    roundToken: 0
  };

  function settings() { return state.store.settings; }
  function tr(key, p) { return L.t(settings().language, key, p); }

  // ---------------------------------------------------------------------------
  // Pausierbarer Countdown (requestAnimationFrame, pausiert bei verstecktem Tab)
  // ---------------------------------------------------------------------------
  function Countdown(durationMs, onTick, onDone) {
    this.duration = Math.max(0, durationMs);
    this.elapsed = 0;
    this.onTick = onTick;
    this.onDone = onDone;
    this.frame = null;
    this.last = null;
    this.stopped = false;
  }
  Countdown.prototype.start = function () {
    var self = this;
    self.last = performance.now();
    function step(now) {
      if (self.stopped) return;
      if (!document.hidden) {
        var delta = Math.min(250, Math.max(0, now - self.last)); // nach Pausen nicht springen
        self.elapsed += delta;
      }
      self.last = now;
      self.onTick && self.onTick(Math.min(self.elapsed, self.duration), self.duration);
      if (self.elapsed >= self.duration) {
        self.stopped = true;
        self.onDone && self.onDone();
        return;
      }
      self.frame = requestAnimationFrame(step);
    }
    self.onTick && self.onTick(0, self.duration);
    self.frame = requestAnimationFrame(step);
    return self;
  };
  Countdown.prototype.cancel = function () {
    this.stopped = true;
    if (this.frame) cancelAnimationFrame(this.frame);
  };

  function stopCountdown() {
    if (state.countdown) state.countdown.cancel();
    state.countdown = null;
  }

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && state.countdown) state.countdown.last = performance.now();
  });

  // ---------------------------------------------------------------------------
  // Ton & Vibration
  // ---------------------------------------------------------------------------
  var audioCtx = null;
  function audio() {
    if (!settings().sound) return null;
    try {
      if (!audioCtx) {
        var Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        audioCtx = new Ctx();
      }
      if (audioCtx.state === 'suspended') audioCtx.resume();
      return audioCtx;
    } catch (e) { return null; }
  }

  function knock(ctx, at) {
    // Klopfen auf den Holztisch: kurzes, tiefes Rauschen mit schnellem Abklingen
    var len = Math.floor(ctx.sampleRate * 0.12);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4);
    var src = ctx.createBufferSource();
    src.buffer = buf;
    var filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    var gain = ctx.createGain();
    gain.gain.value = 1.6;
    src.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
    src.start(at);
  }

  function playCorrect() {
    var ctx = audio();
    if (!ctx) return;
    try { knock(ctx, ctx.currentTime); knock(ctx, ctx.currentTime + 0.14); } catch (e) { /* egal */ }
  }

  function playWrong() {
    var ctx = audio();
    if (!ctx) return;
    try {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.35);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
      var filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 600;
      osc.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + 0.42);
    } catch (e) { /* egal */ }
  }

  function vibrate(pattern) {
    if (!settings().vibration || !navigator.vibrate) return;
    try { navigator.vibrate(pattern); } catch (e) { /* egal */ }
  }

  // ---------------------------------------------------------------------------
  // Phasen & Bildschirme
  // ---------------------------------------------------------------------------
  var SCREEN_OF = { setup: 'setup', stats: 'stats', reveal: 'play', answer: 'play', feedback: 'play', summary: 'summary' };

  function go(event) {
    state.phase = L.transition(state.phase, event);
    document.body.dataset.phase = state.phase;
    var screen = SCREEN_OF[state.phase];
    $all('.screen').forEach(function (el) { el.hidden = el.dataset.screen !== screen; });
    return state.phase;
  }

  // ---------------------------------------------------------------------------
  // Einstellungen
  // ---------------------------------------------------------------------------
  var FIELDS = [
    { key: 'displaySeconds', type: 'range', label: 'displaySeconds', unit: 'seconds' },
    { key: 'revealMode', type: 'segment', label: 'revealMode', options: [['together', 'revealTogether'], ['sequential', 'revealSequential']] },
    { key: 'revealDelaySeconds', type: 'range', label: 'revealDelay', unit: 'seconds', showIf: function (s) { return s.revealMode === 'sequential'; } },
    { key: 'inputMode', type: 'segment', label: 'inputMode', options: [['choice', 'inputChoice'], ['number', 'inputNumber']] },
    { key: 'gameMode', type: 'segment', label: 'gameMode', options: [['rounds', 'modeRounds'], ['endless', 'modeEndless']] },
    { key: 'rounds', type: 'range', label: 'rounds', showIf: function (s) { return s.gameMode === 'rounds'; } },
    { key: 'answerLimitEnabled', type: 'toggle', label: 'answerLimit' },
    { key: 'answerLimitSeconds', type: 'range', label: 'answerLimitSeconds', unit: 'seconds', showIf: function (s) { return s.answerLimitEnabled; } },
    { key: 'adaptive', type: 'toggle', label: 'adaptive' },
    { key: 'realisticTricks', type: 'toggle', label: 'realistic' },
    { key: 'sound', type: 'toggle', label: 'sound' },
    { key: 'vibration', type: 'toggle', label: 'vibration' },
    { key: 'theme', type: 'segment', label: 'theme', options: [['auto', 'themeAuto'], ['light', 'themeLight'], ['dark', 'themeDark']] },
    { key: 'language', type: 'segment', label: 'language', options: [['bairisch', 'langBairisch'], ['hochdeutsch', 'langHochdeutsch']] }
  ];

  function formatValue(field, value) {
    if (field.unit === 'seconds') return tr('seconds', { n: String(value).replace('.', ',') });
    return String(value);
  }

  function renderSettings() {
    var s = settings();
    var html = FIELDS.map(function (f) {
      var id = 'set-' + f.key;
      var hidden = f.showIf && !f.showIf(s) ? ' hidden' : '';
      var control = '';
      if (f.type === 'range') {
        var lim = L.LIMITS[f.key];
        control = '<div class="range-row"><input type="range" id="' + id + '" name="' + f.key + '" min="' + lim.min + '" max="' + lim.max +
          '" step="' + lim.step + '" value="' + s[f.key] + '"><output for="' + id + '" class="range-value">' + escapeHtml(formatValue(f, s[f.key])) + '</output></div>';
        return '<div class="field" data-field="' + f.key + '"' + hidden + '><label for="' + id + '">' + escapeHtml(tr(f.label)) + '</label>' + control + '</div>';
      }
      if (f.type === 'toggle') {
        return '<div class="field field-toggle" data-field="' + f.key + '"' + hidden + '><label for="' + id + '">' + escapeHtml(tr(f.label)) + '</label>' +
          '<input type="checkbox" role="switch" class="switch" id="' + id + '" name="' + f.key + '"' + (s[f.key] ? ' checked' : '') + '></div>';
      }
      control = '<div class="segment" role="radiogroup" aria-labelledby="lbl-' + f.key + '">' + f.options.map(function (o) {
        var oid = id + '-' + o[0];
        return '<input type="radio" id="' + oid + '" name="' + f.key + '" value="' + o[0] + '"' + (s[f.key] === o[0] ? ' checked' : '') + '>' +
          '<label for="' + oid + '">' + escapeHtml(tr(o[1])) + '</label>';
      }).join('') + '</div>';
      return '<div class="field" data-field="' + f.key + '"' + hidden + '><span class="field-label" id="lbl-' + f.key + '">' + escapeHtml(tr(f.label)) + '</span>' + control + '</div>';
    }).join('');
    $('#settings-form').innerHTML = html;
    updateRowCount();
  }

  /** Die Einstellungszeilen teilen sich die Höhe – dafür muss das CSS wissen, wie viele gerade sichtbar sind. */
  function updateRowCount() {
    var form = $('#settings-form');
    var visible = $all('.field', form).filter(function (el) { return !el.hidden; }).length;
    form.style.setProperty('--rows', visible);
    form.style.setProperty('--rows2', Math.ceil(visible / 2));
  }

  function readField(target) {
    var f = FIELDS.filter(function (x) { return x.key === target.name; })[0];
    if (!f) return null;
    if (f.type === 'toggle') return target.checked;
    if (f.type === 'range') return Number(target.value);
    return target.value;
  }

  function updateSetting(key, value) {
    var next = Object.assign({}, settings());
    next[key] = value;
    state.store.settings = L.sanitizeSettings(next);
    writeStorage(state.store);
  }

  function onSettingsInput(e) {
    var t = e.target;
    if (!t.name) return;
    var value = readField(t);
    if (value === null) return;
    var f = FIELDS.filter(function (x) { return x.key === t.name; })[0];
    updateSetting(t.name, value);
    if (f.type === 'range') {
      // nur die Anzeige aktualisieren, damit der Regler nicht den Fokus verliert
      var out = t.parentNode.querySelector('output');
      if (out) out.textContent = formatValue(f, settings()[t.name]);
      return;
    }
    applyTheme();
    if (t.name === 'language') { applyTexts(); renderSettings(); return; }
    FIELDS.forEach(function (fd) {
      if (!fd.showIf) return;
      var el = $('[data-field="' + fd.key + '"]');
      if (el) el.hidden = !fd.showIf(settings());
    });
    updateRowCount();
  }

  function applyTheme() {
    document.documentElement.dataset.theme = settings().theme;
  }

  function applyTexts() {
    document.documentElement.lang = settings().language === 'bairisch' ? 'bar' : 'de';
    document.title = tr('title') + ' · Schafkopf';
    $all('[data-t]').forEach(function (el) { el.textContent = tr(el.dataset.t); });
    $all('[data-t-aria]').forEach(function (el) { el.setAttribute('aria-label', tr(el.dataset.tAria)); });
    $('#number-input').placeholder = tr('placeholder');
  }

  // ---------------------------------------------------------------------------
  // Spiel
  // ---------------------------------------------------------------------------
  function startSession() {
    state.session = L.createSession(settings());
    state.roundNumber = 0;
    startRound();
  }

  function roundLabel() {
    var s = settings();
    return s.gameMode === 'rounds'
      ? tr('roundOf', { i: state.roundNumber, n: s.rounds })
      : tr('roundEndless', { i: state.roundNumber });
  }

  function renderHud() {
    $('#round-label').textContent = roundLabel();
    $('#streak-label').textContent = tr('streak', { n: state.session ? state.session.streak : 0 });
  }

  function renderHand() {
    var back = C.renderBack();
    $('#hand').innerHTML = state.hand.map(function (card, i) {
      return '<div class="card" data-index="' + i + '" data-card-id="' + card.id + '" data-points="' + card.points + '">' +
        '<div class="card-inner"><div class="face back">' + back + '</div>' +
        '<div class="face front">' + C.renderCard(card) + '<span class="points-badge">' + card.points + '</span></div></div></div>';
    }).join('');
  }

  function setCardsUp(up) {
    $all('#hand .card').forEach(function (el) { el.classList.toggle('up', up); });
  }

  function setBar(progressLeft, kind) {
    var bar = $('#timer-bar');
    bar.style.transform = 'scaleX(' + Math.max(0, Math.min(1, progressLeft)) + ')';
    bar.dataset.kind = kind || '';
  }

  /**
   * Wartet, bis die Vorderseiten der ausgeteilten Karten wirklich geladen UND gezeichnet sind. Sonst würden die
   * Karten umgedreht, bevor das Bild da ist (man sähe nur den grünen Tisch), und die Anzeigezeit wäre schon
   * abgelaufen. Fällt ein Bild aus (auch nach einem zweiten Versuch), tritt eine Textkarte an seine Stelle.
   */
  var CARD_LOAD_TIMEOUT_MS = 8000;

  function loadImage(img) {
    function once() {
      if (img.decode) return img.decode();
      return new Promise(function (resolve, reject) {
        if (img.complete && img.naturalWidth > 0) resolve();
        else { img.onload = resolve; img.onerror = reject; }
      });
    }
    return once().catch(function () {
      // zweiter Versuch (z. B. nach einem kurzen Netzaussetzer); der Parameter umgeht einen zwischengespeicherten Fehler
      img.src = img.getAttribute('src').split('?')[0] + '?retry=' + Date.now();
      return once();
    }).then(function () { return true; }, function () { return false; });
  }

  function useFallbackFace(img, card) {
    if (!card || !img.parentNode) return;
    var holder = document.createElement('div');
    holder.innerHTML = C.renderFallback(card);
    img.parentNode.replaceChild(holder.firstChild, img);
  }

  function whenCardsReady() {
    var imgs = $all('#hand .front img');
    var ok = imgs.map(function () { return false; });
    var jobs = imgs.map(function (img, i) { return loadImage(img).then(function (result) { ok[i] = result; }); });
    var timeout = new Promise(function (resolve) { window.setTimeout(resolve, CARD_LOAD_TIMEOUT_MS); });
    return Promise.race([Promise.all(jobs), timeout]).then(function () {
      imgs.forEach(function (img, i) { if (!ok[i]) useFallbackFace(img, state.hand[i]); });
    });
  }

  function startRound() {
    stopCountdown();
    var token = ++state.roundToken;
    state.roundNumber += 1;
    var s = settings();
    state.hand = L.nextHand(s, rng, state.store.cardStats); // realistischer Stich oder reiner Zufall (Einstellung)
    state.choices = [];
    go(state.phase === 'summary' ? 'AGAIN' : state.phase === 'feedback' ? 'NEXT' : 'START');
    document.body.classList.remove('is-correct', 'is-wrong');
    renderHud();
    renderHand();
    $('#feedback').hidden = true;
    $('#answer-area').hidden = false;
    $('#choices').hidden = true;
    $('#number-form').hidden = true;
    $('#prompt').textContent = tr('watch');
    setBar(1, 'display');

    // Erst aufdecken (und die Anzeigezeit starten), wenn die Bilder da sind. Dauert es länger, sagt es ein Hinweis.
    var slowHint = window.setTimeout(function () {
      if (state.roundToken === token && state.phase === 'reveal') $('#prompt').textContent = tr('loading');
    }, 400);
    whenCardsReady().then(function () {
      window.clearTimeout(slowHint);
      if (state.roundToken !== token || state.phase !== 'reveal') return; // inzwischen beendet oder neue Runde
      $('#prompt').textContent = tr('watch');
      beginReveal(s);
    });
  }

  function beginReveal(s) {
    var schedule = L.revealSchedule(s);
    var lastCardAt = schedule.cardTimes[schedule.cardTimes.length - 1];
    var shown = 0;
    // Karten liegen kurz verdeckt da, damit man das Umdrehen sieht.
    var dealPause = 250;
    state.countdown = new Countdown(schedule.hideAt + dealPause, function (elapsed) {
      var t = elapsed - dealPause;
      while (shown < schedule.cardTimes.length && t >= schedule.cardTimes[shown]) {
        var el = $('#hand .card[data-index="' + shown + '"]');
        if (el) el.classList.add('up');
        shown++;
      }
      var visibleFor = schedule.hideAt - lastCardAt;
      var left = t < lastCardAt ? 1 : 1 - (t - lastCardAt) / visibleFor;
      setBar(left, 'display');
    }, function () {
      state.countdown = null;
      hideAndAsk();
    }).start();
  }

  function hideAndAsk() {
    setCardsUp(false);
    go('HIDE');
    var s = settings();
    var correct = L.sumPoints(state.hand);
    $('#prompt').textContent = tr('question');
    if (s.inputMode === 'choice') {
      state.choices = L.makeChoices(correct, state.hand, rng);
      var box = $('#choices');
      box.innerHTML = state.choices.map(function (v, i) {
        return '<button type="button" class="coaster" data-value="' + v + '" aria-keyshortcuts="' + (i + 1) + '"><span>' + v + '</span></button>';
      }).join('');
      box.hidden = false;
    } else {
      var form = $('#number-form');
      form.hidden = false;
      var input = $('#number-input');
      input.value = '';
      input.classList.remove('shake');
      input.focus({ preventScroll: true });
    }
    state.answerStartedAt = performance.now();
    if (s.answerLimitEnabled) {
      state.countdown = new Countdown(s.answerLimitSeconds * 1000, function (elapsed, total) {
        setBar(1 - elapsed / total, 'answer');
      }, function () {
        state.countdown = null;
        submitAnswer(null, true);
      }).start();
    } else {
      setBar(0, 'idle');
    }
  }

  function submitAnswer(value, timedOut) {
    if (state.phase !== 'answer') return;
    stopCountdown();
    var timeMs = performance.now() - state.answerStartedAt;
    state.session = L.recordAnswer(state.session, { cards: state.hand, answer: value, timedOut: !!timedOut, timeMs: timeMs });
    var last = state.session.answers[state.session.answers.length - 1];
    go(timedOut ? 'TIMEOUT' : 'ANSWER');
    // Richtig → ohne Umweg weiter (oder Ende); falsch / Zeit abgelaufen → erst die Rechnung zeigen
    var step = L.afterAnswerStep(settings(), state.session.answers.length, last.isCorrect);
    if (step === 'FEEDBACK') {
      $('#sr-status').textContent = '';
      showFeedback(last);
      return;
    }
    playCorrect();
    vibrate(L.VIBRATION.right);
    $('#sr-status').textContent = tr('correct');
    if (step === 'FINISH') {
      finishSession('FINISH');
      return;
    }
    startRound();
    flash('ok');
  }

  /**
   * Kurzes Aufblitzen am Spieltisch: grün bei richtig (dazu pulsiert der Serienzähler,
   * weil es keinen eigenen Rückmeldung-Bildschirm gibt), rot bei falsch oder abgelaufener Zeit.
   */
  var flashTimer = null;
  function flash(kind) {
    var table = $('.table');
    var streak = $('#streak-label');
    table.classList.remove('flash-ok', 'flash-bad');
    streak.classList.remove('pulse');
    void table.offsetWidth; // Animation neu starten
    table.classList.add(kind === 'ok' ? 'flash-ok' : 'flash-bad');
    if (kind === 'ok') streak.classList.add('pulse');
    window.clearTimeout(flashTimer);
    flashTimer = window.setTimeout(function () {
      table.classList.remove('flash-ok', 'flash-bad');
      streak.classList.remove('pulse');
    }, 700);
  }

  function showFeedback(record) {
    $('#choices').hidden = true;
    $('#number-form').hidden = true;
    $('#answer-area').hidden = true;
    setCardsUp(true);
    document.body.classList.toggle('is-correct', record.isCorrect);
    document.body.classList.toggle('is-wrong', !record.isCorrect);

    var verdict = record.isCorrect ? tr('correct') : record.timedOut ? tr('timeout', { n: record.correct }) : tr('wrong', { n: record.correct });
    $('#verdict').textContent = verdict;
    $('#equation').textContent = L.formatEquation(state.hand);
    var yours = $('#your-answer');
    yours.textContent = !record.isCorrect && !record.timedOut ? tr('yourAnswer', { n: record.answer }) : '';
    yours.hidden = record.isCorrect || record.timedOut;

    var nextEvent = L.afterFeedbackEvent(settings(), state.session.answers.length);
    var nextBtn = $('#next-btn');
    nextBtn.dataset.event = nextEvent;
    nextBtn.textContent = nextEvent === 'FINISH' ? tr('finish') : tr('next');
    $('#feedback').hidden = false;
    renderHud();
    setBar(0, 'idle');
    nextBtn.focus();

    if (record.isCorrect) { playCorrect(); vibrate(L.VIBRATION.right); } else { playWrong(); vibrate(L.VIBRATION.wrong); flash('bad'); }
  }

  function onNext() {
    if (state.phase !== 'feedback') return;
    if ($('#next-btn').dataset.event === 'FINISH') finishSession('FINISH');
    else startRound();
  }

  function finishSession(event) {
    stopCountdown();
    go(event);
    var summary = L.summarizeSession(state.session);
    state.lastSummary = summary;
    state.store = L.mergeSession(state.store, state.session, Date.now());
    writeStorage(state.store);
    renderSummary(summary);
  }

  function renderSummary(sum) {
    $('#sum-accuracy').textContent = sum.rounds ? L.formatPercent(sum.accuracy) : tr('dash');
    $('#sum-correct').textContent = sum.correct + ' / ' + sum.rounds;
    $('#sum-avg').textContent = L.formatSeconds(sum.avgTimeMs) || tr('dash');
    $('#sum-streak').textContent = String(sum.bestStreak);
  }

  // ---------------------------------------------------------------------------
  // Statistik
  // ---------------------------------------------------------------------------
  function sparkline(history) {
    var items = history.slice(-20);
    if (items.length === 0) return '';
    var w = 300, h = 90, pad = 10;
    var pts = items.map(function (it, i) {
      var x = items.length === 1 ? w / 2 : pad + i * (w - 2 * pad) / (items.length - 1);
      var y = h - pad - (it.rounds ? it.correct / it.rounds : 0) * (h - 2 * pad);
      return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
    });
    var line = pts.map(function (p) { return p.join(','); }).join(' ');
    return '<svg class="sparkline" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="' + escapeHtml(tr('history')) + '">' +
      '<line x1="' + pad + '" y1="' + pad + '" x2="' + (w - pad) + '" y2="' + pad + '" class="grid"/>' +
      '<line x1="' + pad + '" y1="' + (h / 2) + '" x2="' + (w - pad) + '" y2="' + (h / 2) + '" class="grid"/>' +
      '<line x1="' + pad + '" y1="' + (h - pad) + '" x2="' + (w - pad) + '" y2="' + (h - pad) + '" class="grid"/>' +
      (pts.length > 1 ? '<polyline points="' + line + '" class="line"/>' : '') +
      pts.map(function (p) { return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="4" class="dot"/>'; }).join('') +
      '</svg>';
  }

  function renderStats() {
    var st = state.store;
    var best = st.best;
    $('#best-accuracy').textContent = best.accuracy === null ? tr('dash') : L.formatPercent(best.accuracy);
    $('#best-fastest').textContent = L.formatSeconds(best.fastestAvgMs) || tr('dash');
    $('#best-streak').textContent = String(best.bestStreak);
    $('#best-total').textContent = best.totalRounds ? best.totalCorrect + ' / ' + best.totalRounds : '0';

    var hist = $('#history');
    hist.innerHTML = st.history.length ? sparkline(st.history) : '<p class="empty">' + escapeHtml(tr('noData')) + '</p>';

    var weak = L.weakestCards(st.cardStats, 6, 3);
    $('#weak-cards').innerHTML = weak.length ? weak.map(function (w) {
      var card = L.cardById(w.id);
      return '<li class="weak" data-card-id="' + w.id + '"><div class="mini">' + C.renderCard(card) + '</div>' +
        '<span class="weak-name">' + escapeHtml(L.cardLabel(card)) + '</span>' +
        '<span class="weak-rate">' + w.wrong + ' / ' + w.seen + '</span></li>';
    }).join('') : '<li class="empty">' + escapeHtml(tr('noData')) + '</li>';
  }

  function resetStats() {
    if (!window.confirm(tr('confirmReset'))) return;
    var keep = state.store.settings;
    state.store = L.emptyStore();
    state.store.settings = keep;
    writeStorage(state.store);
    go('RESET');
    renderStats();
  }

  // ---------------------------------------------------------------------------
  // Ereignisse
  // ---------------------------------------------------------------------------
  function bind() {
    var form = $('#settings-form');
    form.addEventListener('input', onSettingsInput);
    form.addEventListener('change', onSettingsInput);
    form.addEventListener('submit', function (e) { e.preventDefault(); });

    $('#start-btn').addEventListener('click', function () { audio(); startSession(); });
    $('#stats-btn').addEventListener('click', function () { go('SHOW_STATS'); renderStats(); });
    $('#stats-back-btn').addEventListener('click', function () { go('BACK'); });
    $('#reset-btn').addEventListener('click', resetStats);
    $('#quit-btn').addEventListener('click', function () {
      if (L.canTransition(state.phase, 'QUIT')) finishSession('QUIT');
    });
    $('#next-btn').addEventListener('click', onNext);
    $('#again-btn').addEventListener('click', function () { audio(); startSession(); });
    $('#summary-setup-btn').addEventListener('click', function () { go('BACK'); });
    $('#summary-stats-btn').addEventListener('click', function () { go('SHOW_STATS'); renderStats(); });

    $('#choices').addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-value]');
      if (btn) submitAnswer(Number(btn.dataset.value), false);
    });

    $('.keypad').addEventListener('click', function (e) {
      var key = e.target.closest('button[data-key]');
      if (!key || state.phase !== 'answer') return;
      var input = $('#number-input');
      var k = key.dataset.key;
      if (k === 'del') input.value = input.value.slice(0, -1);
      else if (input.value.length < input.maxLength) input.value += k;
      vibrate(L.VIBRATION.key);
    });

    $('#number-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var input = $('#number-input');
      var value = L.parseAnswer(input.value);
      if (value === null) {
        input.classList.remove('shake');
        void input.offsetWidth; // Animation neu starten
        input.classList.add('shake');
        input.focus();
        return;
      }
      submitAnswer(value, false);
    });

    document.addEventListener('keydown', function (e) {
      if (state.phase === 'answer' && settings().inputMode === 'choice' && /^[1-4]$/.test(e.key)) {
        var btn = $all('#choices button')[Number(e.key) - 1];
        if (btn) { e.preventDefault(); btn.click(); }
      } else if (state.phase === 'feedback' && (e.key === 'Enter' || e.key === ' ') && document.activeElement !== $('#next-btn')) {
        e.preventDefault();
        onNext();
      }
    });
  }

  /** Alle Kartenbilder früh laden und festhalten, damit der Browser sie nicht wieder verwirft. */
  var preloaded = [];
  function preloadCards() {
    L.createDeck().forEach(function (card) { var img = new Image(); img.src = C.cardUrl(card); preloaded.push(img); });
  }

  function init() {
    preloadCards();
    applyTheme();
    renderSettings();
    applyTexts();
    bind();
    document.body.dataset.phase = state.phase;
    $all('.screen').forEach(function (el) { el.hidden = el.dataset.screen !== 'setup'; });
    document.body.classList.add('ready');
  }

  init();
})();
