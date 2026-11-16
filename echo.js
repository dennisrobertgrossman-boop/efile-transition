/* ECHO//LOCK — watch a sequence of arrows, then enter it under a rule that keeps being rewritten.
   Arrows are indexed 0 = up, 1 = right, 2 = down, 3 = left; (d + 2) % 4 is the opposite arrow. */
(() => {
  'use strict';
  const { $, randInt, clamp, sfx, buzz, banner, hud, MAX_LIVES, WARN_MS } = GG;

  const opposite = (d) => (d + 2) % 4;
  const RULES = [
    { name: 'ECHO', desc: 'Enter the arrows in the same order', f: (s) => s.slice() },
    { name: 'REVERSE', desc: 'Enter the arrows from last to first', f: (s) => s.slice().reverse() },
    { name: 'OPPOSITE', desc: 'Same order, but the opposite of each arrow', f: (s) => s.map(opposite) },
    { name: 'INVERT', desc: 'Last to first, and the opposite of each arrow', f: (s) => s.slice().reverse().map(opposite) }
  ];
  const NOTES = [523, 659, 392, 440];

  const el = { card: $('card'), slots: $('slots'), status: $('status'), bar: $('timeBar'), ruleName: $('ruleName'), ruleDesc: $('ruleDesc'), pad: $('pad') };
  const buttons = [];
  el.pad.querySelectorAll('.pb').forEach((b) => { buttons[parseInt(b.getAttribute('data-d'), 10)] = b; });

  let rule = 0, seq = [], expect = [], pos = 0;
  let phase = 'hold';          // 'show' | 'input' | 'hold'
  let holdLeft = 0, showIdx = 0, stepT = 0, shownKey = '', inputLeft = 0, inputTotal = 1;
  let score = 0, lives = MAX_LIVES, level = 1, wins = 0, longest = 0, scrambles = 0;
  let scrInterval = 1, scrLeft = 1, lastWarnSec = 0, gameTime = 0, lastFrame = 0, flashTimer = 0;

  const sh = GG.shell({
    bestKey: 'echolock.best',
    start: startGame,
    onPause() { lastFrame = 0; },
    onTitle() { rule = 0; paintRule(); clearRound(); setStatus('', false); }
  });

  function paintRule() { el.ruleName.textContent = RULES[rule].name; el.ruleDesc.textContent = RULES[rule].desc; }
  function setStatus(text, go) { el.status.textContent = text; el.status.classList.toggle('go', !!go); }
  function showArrow(d, mine) {
    el.card.classList.toggle('mine', !!mine);
    el.card.innerHTML = d === null ? '' : GG.arrowSvg(d);
  }
  function flash(cls) {
    el.card.classList.remove('good', 'bad');
    void el.card.offsetWidth;
    el.card.classList.add(cls);
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => el.card.classList.remove('good', 'bad'), 320);
  }
  function clearRound() { seq = []; expect = []; pos = 0; shownKey = ''; showArrow(null); el.slots.textContent = ''; }
  function paintSlots(cur) {
    const kids = el.slots.children;
    for (let i = 0; i < kids.length; i++) {
      kids[i].classList.toggle('on', phase === 'input' && i < pos);
      kids[i].classList.toggle('cur', i === cur);
    }
  }
  function mult() { return 1 + scrambles; }
  function seqLen() { return Math.min(8, 2 + level); }
  function showMs() { return Math.max(330, 640 - level * 32); }

  function startRound() {
    const n = seqLen();
    seq = [];
    for (let i = 0; i < n; i++) seq.push(randInt(0, 3));
    pos = 0; showIdx = 0; stepT = 0; shownKey = '';
    el.slots.textContent = '';
    for (let i = 0; i < n; i++) el.slots.appendChild(document.createElement('i'));
    phase = 'show';
    showArrow(null);
    setStatus('WATCH', false);
  }
  function beginInput() {
    expect = RULES[rule].f(seq);
    pos = 0;
    inputTotal = 1600 + 1150 * seq.length;
    inputLeft = inputTotal;
    phase = 'input';
    showArrow(null);
    paintSlots(-1);
    setStatus('YOUR TURN · ' + RULES[rule].name, true);
  }
  function scheduleScramble() {
    scrInterval = GG.scrambleInterval(30000, 45000);
    scrLeft = scrInterval; lastWarnSec = 0;
  }
  function startGame() {
    score = 0; lives = MAX_LIVES; level = 1; wins = 0; longest = 0; scrambles = 0; gameTime = 0;
    rule = 0; paintRule(); clearRound();
    scheduleScramble();
    phase = 'hold'; holdLeft = 1600; lastFrame = 0;
    setStatus('GET READY', false);
    banner('RULE: ECHO', 'SAME ORDER');
  }

  function rewrite() {
    // The round in progress is discarded without penalty. INVERT unlocks from the second rewrite.
    const pool = [0, 1, 2, 3].filter((r) => r !== rule && (r < 3 || scrambles >= 1));
    rule = pool[randInt(0, pool.length - 1)];
    scrambles++;
    paintRule(); clearRound();
    phase = 'hold'; holdLeft = 2400;
    setStatus('RULE REWRITTEN', false);
    scheduleScramble();
    banner('RULE: ' + RULES[rule].name, 'MULTIPLIER x' + mult());
    sfx.scramble(); buzz([40, 30, 40, 30, 90]);
  }
  function win() {
    const bonus = Math.round(10 * clamp(inputLeft / inputTotal, 0, 1));
    score += (10 * seq.length + bonus) * mult();
    wins++;
    if (seq.length > longest) longest = seq.length;
    const nl = 1 + Math.floor(wins / 3);
    if (nl > level) { level = nl; sfx.level(); } else sfx.bonus();
    buzz(25); flash('good');
    setStatus('LOCKED IN', true);
    phase = 'hold'; holdLeft = 800;
  }
  function miss(reason) {
    lives--;
    flash('bad'); buzz(120);
    setStatus(reason, false);
    phase = 'hold';
    if (lives <= 0) {
      lives = 0;
      sh.gameOver(score, [['SEQUENCES', wins], ['LONGEST', longest], ['REWRITES SURVIVED', scrambles], ['TIME', GG.fmtTime(gameTime)]]);
      return;
    }
    sfx.bad();
    holdLeft = 1300;
  }

  function press(p) {
    const b = buttons[p];
    b.classList.add('hit');
    setTimeout(() => b.classList.remove('hit'), 110);
    if (sh.state !== 'play' || sh.paused || phase !== 'input') return;
    if (p !== expect[pos]) { showArrow(p, true); miss('WRONG ARROW'); return; }
    pos++;
    showArrow(p, true);
    paintSlots(-1);
    GG.tone(NOTES[p], 0.09, 'square', 0.05);
    if (pos >= expect.length) win();
  }

  function update(dt) {
    gameTime += dt;
    scrLeft -= dt;
    if (scrLeft <= WARN_MS && scrLeft > 0) {
      const sec = Math.ceil(scrLeft / 1000);
      if (sec !== lastWarnSec) { lastWarnSec = sec; sfx.warn(); buzz(15); }
    }
    if (scrLeft <= 0) { rewrite(); return; }

    if (phase === 'hold') {
      holdLeft -= dt;
      if (holdLeft <= 0) startRound();
    } else if (phase === 'show') {
      stepT += dt;
      const on = showMs(), step = on + 150;
      if (stepT >= step) { stepT -= step; showIdx++; }
      if (showIdx >= seq.length) { beginInput(); return; }
      const visible = stepT < on;
      const key = showIdx + (visible ? 'v' : 'h');
      if (key !== shownKey) {
        shownKey = key;
        showArrow(visible ? seq[showIdx] : null, false);
        paintSlots(showIdx);
        if (visible) GG.tone(NOTES[seq[showIdx]], 0.12, 'triangle', 0.07);
      }
    } else if (phase === 'input') {
      inputLeft -= dt;
      if (inputLeft <= 0) miss('TOO SLOW');
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (!lastFrame) lastFrame = now;
    const dt = Math.min(100, now - lastFrame);
    lastFrame = now;
    const playing = sh.state === 'play';
    if (playing && !sh.paused) update(dt);
    const frac = playing && phase === 'input' ? clamp(inputLeft / inputTotal, 0, 1) : 0;
    el.bar.style.transform = 'scaleX(' + frac.toFixed(3) + ')';
    el.bar.style.background = frac < 0.3 ? '#ff3355' : '#00f0ff';
    hud({
      score, best: Math.max(sh.best, score), mult: mult(), level, lives,
      frac: playing ? scrLeft / scrInterval : 1, warn: playing && scrLeft <= WARN_MS,
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

  paintRule();
  requestAnimationFrame(frame);
})();
