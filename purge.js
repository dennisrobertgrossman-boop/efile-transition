/* PURGE//PROTOCOL — tap the nodes that match the purge order, leave the rest,
   while the order itself keeps being rewritten. The board has 16 cells, indexed row by row. */
(() => {
  'use strict';
  const { $, rand, randInt, clamp, sfx, buzz, banner, hud, MAX_LIVES, WARN_MS } = GG;

  const COLORS = [
    { name: 'CYAN', css: '#00f0ff' },
    { name: 'PINK', css: '#ff2bd6' },
    { name: 'YELLOW', css: '#f9f002' },
    { name: 'GREEN', css: '#39ff88' }
  ];
  const SHAPES = [
    { name: 'DIAMONDS', one: 'diamond', svg: '<path d="M12 1 23 12 12 23 1 12Z"/>' },
    { name: 'SQUARES', one: 'square', svg: '<path d="M3 3H21V21H3Z"/>' },
    { name: 'CIRCLES', one: 'circle', svg: '<circle cx="12" cy="12" r="10"/>' },
    { name: 'TRIANGLES', one: 'triangle', svg: '<path d="M12 2 23 21H1Z"/>' }
  ];
  const KEYMAP = '1234qwerasdfzxcv';

  const stage = $('stage'), board = $('board'), note = $('note');
  const el = { ruleName: $('ruleName'), ruleDesc: $('ruleDesc'), ruleBox: $('rule') };
  const cells = [], nodes = new Array(16).fill(null);
  for (let i = 0; i < 16; i++) {
    const b = document.createElement('button');
    b.className = 'cell';
    b.setAttribute('aria-label', 'Cell ' + (i + 1));
    board.appendChild(b);
    cells.push(b);
  }

  let rule = { kind: 'color', idx: 0, neg: false };
  let score = 0, lives = MAX_LIVES, level = 1, hits = 0, streak = 0, bestStreak = 0, scrambles = 0;
  let scrInterval = 1, scrLeft = 1, lastWarnSec = 0, gameTime = 0, lastFrame = 0;
  let spawnLeft = 0, holdLeft = 0;

  const sh = GG.shell({
    bestKey: 'purgeprotocol.best',
    start: startGame,
    onPause(p) { lastFrame = 0; document.body.classList.toggle('paused', p); },
    onTitle() { clearBoard(); document.body.classList.remove('paused'); note.textContent = ''; },
    onLayout: fit
  });

  function fit() {
    const gap = parseFloat(getComputedStyle(stage).rowGap) || 0;
    const s = Math.floor(Math.min(stage.clientWidth - 30, stage.clientHeight - el.ruleBox.offsetHeight - note.offsetHeight - 2 * gap - 22));
    if (s <= 0) return;
    const side = Math.min(s, 560);
    board.style.width = board.style.height = side + 'px';
  }

  function matches(n) { return ((rule.kind === 'color' ? n.c : n.s) === rule.idx) !== rule.neg; }
  function paintRule() {
    const isColor = rule.kind === 'color';
    const base = isColor ? COLORS[rule.idx].name : SHAPES[rule.idx].name;
    el.ruleName.textContent = (rule.neg ? 'NOT ' : '') + base;
    el.ruleName.style.color = isColor && !rule.neg ? COLORS[rule.idx].css : '';
    if (isColor) {
      const c = COLORS[rule.idx].name.toLowerCase();
      el.ruleDesc.textContent = rule.neg ? 'Tap every node that is not ' + c + ', whatever its shape' : 'Tap every ' + c + ' node, whatever its shape';
    } else {
      const s = SHAPES[rule.idx].one;
      el.ruleDesc.textContent = rule.neg ? 'Tap everything except a ' + s + ', whatever its colour' : 'Tap every ' + s + ', whatever its colour';
    }
  }
  function mult() { return 1 + scrambles; }
  function lifeMs() { return Math.max(1000, 2100 - level * 110); }
  function spawnMs() { return Math.max(400, 980 - level * 55); }

  function setCell(i, n) {
    nodes[i] = n;
    const b = cells[i];
    const key = '<kbd>' + KEYMAP[i].toUpperCase() + '</kbd>';
    if (!n) { b.innerHTML = key; return; }
    b.style.setProperty('--c', COLORS[n.c].css);
    b.style.setProperty('--life', n.total + 'ms');
    b.innerHTML = key + '<svg viewBox="0 0 24 24" aria-hidden="true">' + SHAPES[n.s].svg + '</svg>';
  }
  function clearBoard() { for (let i = 0; i < 16; i++) setCell(i, null); }
  function flashCell(i, cls) {
    const b = cells[i];
    b.classList.add(cls);
    setTimeout(() => b.classList.remove(cls), 160);
  }
  function spawn() {
    const free = [];
    let onBoard = 0, targets = 0;
    for (let i = 0; i < 16; i++) { if (nodes[i]) { onBoard++; if (nodes[i].target) targets++; } else free.push(i); }
    if (onBoard >= 5 || !free.length) return;
    const wantTarget = targets < 2 && Math.random() < 0.55;
    let c, s, n;
    do { c = randInt(0, 3); s = randInt(0, 3); n = { c, s }; } while (matches(n) !== wantTarget);
    const total = lifeMs();
    setCell(free[randInt(0, free.length - 1)], { c, s, target: wantTarget, total, left: total });
  }

  function scheduleScramble() {
    scrInterval = GG.scrambleInterval(25000, 40000);
    scrLeft = scrInterval; lastWarnSec = 0;
  }
  function startGame() {
    document.body.classList.remove('paused');
    fit();
    score = 0; lives = MAX_LIVES; level = 1; hits = 0; streak = 0; bestStreak = 0; scrambles = 0; gameTime = 0;
    rule = { kind: 'color', idx: randInt(0, 3), neg: false };
    paintRule(); clearBoard();
    note.textContent = '';
    scheduleScramble();
    holdLeft = 1500; spawnLeft = 0; lastFrame = 0;
    banner('PURGE: ' + el.ruleName.textContent, 'LEAVE THE REST');
  }
  function rewrite() {
    // Always switch between a colour order and a shape order; "NOT" orders unlock from the second rewrite.
    scrambles++;
    rule = { kind: rule.kind === 'color' ? 'shape' : 'color', idx: randInt(0, 3), neg: scrambles >= 2 && Math.random() < 0.45 };
    paintRule(); clearBoard();
    holdLeft = 2300;
    scheduleScramble();
    banner('PURGE: ' + el.ruleName.textContent, 'MULTIPLIER x' + mult());
    sfx.scramble(); buzz([40, 30, 40, 30, 90]);
  }
  function fail(reason) {
    lives--; streak = 0;
    note.textContent = reason;
    buzz(120);
    clearBoard();
    if (lives <= 0) {
      lives = 0;
      sh.gameOver(score, [['PURGED', hits], ['BEST STREAK', bestStreak], ['REWRITES SURVIVED', scrambles], ['TIME', GG.fmtTime(gameTime)]]);
      return;
    }
    sfx.bad();
    holdLeft = 1000;
  }
  function tap(i) {
    if (sh.state !== 'play' || sh.paused) return;
    const n = nodes[i];
    if (!n) return;
    if (n.target) {
      score += (10 + Math.round(10 * n.left / n.total)) * mult();
      hits++; streak++;
      if (streak > bestStreak) bestStreak = streak;
      note.textContent = streak >= 3 ? 'STREAK ' + streak : '';
      const nl = 1 + Math.floor(hits / 10);
      if (nl > level) { level = nl; sfx.level(); } else sfx.good();
      buzz(12);
      setCell(i, null); flashCell(i, 'good');
    } else {
      flashCell(i, 'bad');
      fail('WRONG NODE');
    }
  }

  function update(dt) {
    gameTime += dt;
    scrLeft -= dt;
    if (scrLeft <= WARN_MS && scrLeft > 0) {
      const sec = Math.ceil(scrLeft / 1000);
      if (sec !== lastWarnSec) { lastWarnSec = sec; sfx.warn(); buzz(15); }
    }
    if (scrLeft <= 0) { rewrite(); return; }
    if (holdLeft > 0) { holdLeft -= dt; return; }

    for (let i = 0; i < 16; i++) {
      const n = nodes[i];
      if (!n) continue;
      n.left -= dt;
      if (n.left <= 0) {
        if (n.target) { flashCell(i, 'bad'); fail('TARGET ESCAPED'); return; }
        setCell(i, null);
      }
    }
    spawnLeft -= dt;
    if (spawnLeft <= 0) { spawnLeft = spawnMs() * rand(0.8, 1.2); spawn(); }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (!lastFrame) lastFrame = now;
    const dt = Math.min(100, now - lastFrame);
    lastFrame = now;
    const playing = sh.state === 'play';
    if (playing && !sh.paused) update(dt);
    hud({
      score, best: Math.max(sh.best, score), mult: mult(), level, lives,
      frac: playing ? scrLeft / scrInterval : 1, warn: playing && scrLeft <= WARN_MS,
      label: 'NEXT REWRITE', warnLabel: 'REWRITE INCOMING'
    });
  }

  /* ---------- input ---------- */
  cells.forEach((b, i) => {
    const down = (e) => { e.preventDefault(); GG.initAudio(); tap(i); };
    if (window.PointerEvent) b.addEventListener('pointerdown', down);
    else { b.addEventListener('touchstart', down, { passive: false }); b.addEventListener('mousedown', down); }
  });
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
    const i = KEYMAP.indexOf(e.key.toLowerCase());
    if (i < 0) return;
    e.preventDefault();
    if (!e.repeat) { GG.initAudio(); tap(i); }
  });

  let fitQueued = false;
  function queueFit() {
    if (fitQueued) return;
    fitQueued = true;
    requestAnimationFrame(() => { fitQueued = false; fit(); });
  }
  window.addEventListener('resize', queueFit);
  window.addEventListener('orientationchange', () => setTimeout(queueFit, 250));
  if (window.ResizeObserver) new ResizeObserver(queueFit).observe(stage);

  paintRule(); clearBoard(); fit();
  requestAnimationFrame(frame);
})();
