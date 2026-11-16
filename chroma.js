/* CHROMA//LIE — colour words in the wrong ink, and a rule that keeps being rewritten.
   Pad positions are indexed 0 = up, 1 = right, 2 = down, 3 = left. */
(() => {
  'use strict';
  const { $, rand, randInt, clamp, sfx, buzz, banner, hud, MAX_LIVES, WARN_MS } = GG;

  const COLORS = [
    { name: 'CYAN', css: '#00f0ff' },
    { name: 'PINK', css: '#ff2bd6' },
    { name: 'YELLOW', css: '#f9f002' },
    { name: 'GREEN', css: '#39ff88' }
  ];
  const RULES = [
    { name: 'INK', desc: 'Press the colour the word is painted in' },
    { name: 'WORD', desc: 'Press the colour the word spells out' },
    { name: 'NEITHER', desc: 'Press a colour that is neither the ink nor the word' }
  ];

  const el = { word: $('word'), card: $('card'), bar: $('cardBar'), ruleName: $('ruleName'), ruleDesc: $('ruleDesc'), pad: $('pad'), streak: $('streak') };
  const buttons = [];
  el.pad.querySelectorAll('.pb').forEach((b) => { buttons[parseInt(b.getAttribute('data-d'), 10)] = b; });

  let layout = [0, 1, 2, 3];   // layout[pad position] = colour index
  let rule = 0;
  let card = null;             // { word, ink, total, left }
  let hold = 0;                // pause before the next card
  let score = 0, lives = MAX_LIVES, level = 1, hits = 0, streak = 0, bestStreak = 0, scrambles = 0;
  let scrInterval = 1, scrLeft = 1, lastWarnSec = 0, gameTime = 0, lastFrame = 0;
  let flashTimer = 0;

  const sh = GG.shell({
    bestKey: 'chromalie.best',
    start: startGame,
    onPause() { lastFrame = 0; },
    onTitle() { layout = [0, 1, 2, 3]; rule = 0; card = null; paintPad(); paintRule(); el.word.textContent = ''; }
  });

  function paintPad() {
    for (let p = 0; p < 4; p++) {
      const c = COLORS[layout[p]];
      buttons[p].style.setProperty('--c', c.css);
      buttons[p].setAttribute('aria-label', c.name + ' button');
    }
  }
  function paintRule() {
    el.ruleName.textContent = RULES[rule].name;
    el.ruleDesc.textContent = RULES[rule].desc;
  }
  function flash(cls) {
    el.card.classList.remove('good', 'bad');
    void el.card.offsetWidth;
    el.card.classList.add(cls);
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => el.card.classList.remove('good', 'bad'), 320);
  }
  function cardTime() { return Math.max(1100, 3000 - (level - 1) * 220); }
  function mult() { return 1 + scrambles; }

  function newCard() {
    let word, ink;
    do {
      word = randInt(0, 3);
      ink = (rule === 2 || Math.random() < 0.8) ? (word + randInt(1, 3)) % 4 : word;
    } while (card && card.word === word && card.ink === ink);
    const total = cardTime();
    card = { word, ink, total, left: total };
    el.word.textContent = COLORS[word].name;
    el.word.style.color = COLORS[ink].css;
    el.word.style.textShadow = '0 0 22px ' + COLORS[ink].css;
  }
  function clearCard() { card = null; el.word.textContent = ''; }

  function scheduleScramble() {
    scrInterval = GG.scrambleInterval(25000, 40000);
    scrLeft = scrInterval; lastWarnSec = 0;
  }
  function startGame() {
    score = 0; lives = MAX_LIVES; level = 1; hits = 0; streak = 0; bestStreak = 0; scrambles = 0; gameTime = 0;
    layout = [0, 1, 2, 3]; rule = 0;
    paintPad(); paintRule(); clearCard();
    el.streak.textContent = '';
    scheduleScramble();
    hold = 1500; lastFrame = 0;
    banner('RULE: INK', 'PRESS THE INK COLOUR');
  }

  function scramble() {
    // New rule (NEITHER unlocks from the second rewrite) and a full reshuffle of the buttons.
    const pool = [0, 1, 2].filter((r) => r !== rule && (r < 2 || scrambles >= 1));
    rule = pool[randInt(0, pool.length - 1)];
    let m;
    do {
      m = layout.slice();
      for (let i = 3; i > 0; i--) { const j = randInt(0, i); const t = m[i]; m[i] = m[j]; m[j] = t; }
    } while (m.some((v, i) => v === layout[i]));
    layout = m;
    scrambles++;
    paintPad(); paintRule(); clearCard();
    el.pad.classList.remove('shuffle'); void el.pad.offsetWidth; el.pad.classList.add('shuffle');
    hold = 2200;
    scheduleScramble();
    banner('RULE: ' + RULES[rule].name, 'BUTTONS SHUFFLED · MULTIPLIER x' + mult());
    sfx.scramble(); buzz([40, 30, 40, 30, 90]);
  }

  function isCorrect(colour) {
    if (rule === 0) return colour === card.ink;
    if (rule === 1) return colour === card.word;
    return colour !== card.ink && colour !== card.word;
  }
  function hit() {
    const pts = (10 + Math.round(10 * card.left / card.total)) * mult();
    score += pts; hits++; streak++;
    if (streak > bestStreak) bestStreak = streak;
    el.streak.textContent = streak >= 3 ? 'STREAK ' + streak : '';
    const nl = 1 + Math.floor(hits / 8);
    if (nl > level) { level = nl; sfx.level(); } else sfx.good();
    buzz(12); flash('good');
    clearCard(); hold = 170;
  }
  function miss(reason) {
    lives--; streak = 0;
    el.streak.textContent = reason;
    flash('bad'); buzz(120);
    clearCard();
    if (lives <= 0) {
      lives = 0;
      sh.gameOver(score, [['CORRECT', hits], ['BEST STREAK', bestStreak], ['REWRITES SURVIVED', scrambles], ['TIME', GG.fmtTime(gameTime)]]);
      return;
    }
    sfx.bad();
    hold = 900;
  }

  function press(p) {
    const b = buttons[p];
    b.classList.add('hit');
    setTimeout(() => b.classList.remove('hit'), 110);
    if (sh.state !== 'play' || sh.paused || !card) return;
    if (isCorrect(layout[p])) hit(); else miss('WRONG COLOUR');
  }

  function update(dt) {
    gameTime += dt;
    scrLeft -= dt;
    if (scrLeft <= WARN_MS && scrLeft > 0) {
      const sec = Math.ceil(scrLeft / 1000);
      if (sec !== lastWarnSec) { lastWarnSec = sec; sfx.warn(); buzz(15); }
    }
    if (scrLeft <= 0) { scramble(); return; }
    if (hold > 0) { hold -= dt; if (hold <= 0) newCard(); return; }
    if (card) { card.left -= dt; if (card.left <= 0) miss('TOO SLOW'); }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (!lastFrame) lastFrame = now;
    const dt = Math.min(100, now - lastFrame);
    lastFrame = now;
    const playing = sh.state === 'play';
    if (playing && !sh.paused) update(dt);
    const frac = card ? clamp(card.left / card.total, 0, 1) : 0;
    el.bar.style.transform = 'scaleX(' + frac.toFixed(3) + ')';
    el.bar.style.background = frac < 0.3 ? '#ff3355' : '#00f0ff';
    hud({
      score, best: Math.max(sh.best, score), mult: mult(), level, lives,
      frac: sh.state === 'play' ? scrLeft / scrInterval : 1,
      warn: sh.state === 'play' && scrLeft <= WARN_MS,
      label: 'NEXT REWRITE', warnLabel: 'REWRITE INCOMING'
    });
  }

  /* ---------- input ---------- */
  const KEYS = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3, w: 0, d: 1, s: 2, a: 3, W: 0, D: 1, S: 2, A: 3 };
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || !(e.key in KEYS)) return;
    e.preventDefault();
    if (!e.repeat) { GG.initAudio(); press(KEYS[e.key]); }
  });
  buttons.forEach((b, p) => {
    b.innerHTML = GG.arrowSvg(p);
    const down = (e) => { e.preventDefault(); GG.initAudio(); press(p); };
    if (window.PointerEvent) b.addEventListener('pointerdown', down);
    else { b.addEventListener('touchstart', down, { passive: false }); b.addEventListener('mousedown', down); }
  });

  paintPad(); paintRule();
  requestAnimationFrame(frame);
})();
