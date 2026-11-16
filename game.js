/* GLITCH//GRID — a cyberpunk grid-runner stress test.
   Directions are indexed 0 = up, 1 = right, 2 = down, 3 = left. */
(() => {
  'use strict';

  const DIRS = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];
  const DIR_NAMES = ['UP', 'RIGHT', 'DOWN', 'LEFT'];
  const FONT = '"Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif';
  const C = { cy: '#00f0ff', mg: '#ff2bd6', yl: '#f9f002', gr: '#39ff88', rd: '#ff3355' };
  const MAX_LIVES = 3;
  const WARN_MS = 3000;
  const REVEAL_MS = 4500;
  const BEST_KEY = 'glitchgrid.best';
  const MUTE_KEY = 'glitchgrid.mute';
  const ASSIST_KEY = 'glitchgrid.assist';

  const $ = (id) => document.getElementById(id);
  const canvas = $('game');
  const ctx = canvas.getContext('2d');
  const stage = $('stage');
  const el = {
    score: $('score'), best: $('best'), mult: $('mult'), level: $('level'), lives: $('lives'),
    scrBox: $('scrambleBox'), scrLbl: $('scrambleLbl'), scrBar: $('scrambleBar'),
    banner: $('banner'), legend: $('legend'), pad: $('pad'),
    ovTitle: $('ovTitle'), ovPause: $('ovPause'), ovOver: $('ovOver'),
    btnPause: $('btnPause'), btnMute: $('btnMute'), btnAssist: $('btnAssist')
  };

  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Optional test parameter: ?scramble=<seconds> fixes the scramble interval.
  const debugScramble = (() => {
    const m = /[?&]scramble=(\d+(?:\.\d+)?)/.exec(location.search);
    return m ? Math.max(4, parseFloat(m[1])) * 1000 : 0;
  })();

  /* ---------- storage (may be unavailable in private modes) ---------- */
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
  };

  /* ---------- audio ---------- */
  let actx = null;
  let muted = store.get(MUTE_KEY) === '1';
  function initAudio() {
    if (actx) { if (actx.state === 'suspended') actx.resume().catch(() => {}); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { actx = new AC(); } catch (e) { actx = null; }
  }
  function tone(freq, dur, type, vol, slideTo, delay) {
    if (muted || !actx || actx.state !== 'running') return;
    try {
      const t = actx.currentTime + (delay || 0);
      const o = actx.createOscillator();
      const g = actx.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol || 0.08, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(actx.destination);
      o.start(t); o.stop(t + dur + 0.02);
    } catch (e) { /* ignore */ }
  }
  const sfx = {
    shard() { tone(880, 0.08, 'square', 0.06, 1320); },
    core() { tone(660, 0.1, 'triangle', 0.1); tone(990, 0.1, 'triangle', 0.1, 0, 0.08); tone(1320, 0.16, 'triangle', 0.1, 0, 0.16); },
    stab() { tone(440, 0.25, 'sine', 0.12, 880); },
    life() { tone(523, 0.1, 'sine', 0.12); tone(784, 0.2, 'sine', 0.12, 0, 0.1); },
    crash() { tone(220, 0.4, 'sawtooth', 0.14, 40); },
    over() { tone(330, 0.3, 'sawtooth', 0.12, 110); tone(165, 0.7, 'sawtooth', 0.12, 40, 0.28); },
    warn() { tone(1400, 0.07, 'square', 0.05); },
    scramble() { for (let i = 0; i < 6; i++) tone(200 + Math.random() * 1600, 0.06, 'sawtooth', 0.07, 0, i * 0.05); },
    level() { tone(520, 0.08, 'square', 0.05); tone(780, 0.12, 'square', 0.05, 0, 0.08); },
    turn() { tone(300, 0.03, 'square', 0.02); }
  };
  function buzz(pattern) {
    if (muted) return;
    try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* ignore */ }
  }

  /* ---------- state ---------- */
  let cols = 17, rows = 17, cell = 20, dpr = 1;
  let gridCanvas = null;
  let state = 'title';           // 'title' | 'playing' | 'reboot' | 'over'
  let paused = false;
  let assist = store.get(ASSIST_KEY) === '1';
  let best = parseInt(store.get(BEST_KEY), 10) || 0;

  let snake = [], prev = [], dir = 1, queue = [], grow = 0;
  let items = [], mines = [], particles = [], floaters = [];
  let score = 0, lives = MAX_LIVES, level = 1, shards = 0, scrambles = 0;
  let map = [0, 1, 2, 3];
  let gameTime = 0, acc = 0, rebootLeft = 0;
  let scrambleInterval = 0, scrambleLeft = 0, lastWarnSec = 0;
  let revealLeft = 0, slowLeft = 0, glitchLeft = 0, shake = 0;
  let coreTimer = 0, bonusTimer = 0;
  let overTimer = 0;
  let lastFrame = 0;
  const hudCache = {};

  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const isIdentity = (m) => m.every((v, i) => v === i);

  /* ---------- layout ---------- */
  function chooseGrid() {
    const W = stage.clientWidth - 8, H = stage.clientHeight - 8;
    if (W <= 0 || H <= 0) return;
    const c0 = clamp(Math.floor(Math.min(W, H) / 17), 14, 36);
    cols = clamp(Math.floor(W / c0), 12, 30);
    rows = clamp(Math.floor(H / c0), 12, 30);
  }
  function fit() {
    if (state === 'title' || state === 'over') chooseGrid();
    const W = stage.clientWidth - 8, H = stage.clientHeight - 8;
    if (W <= 0 || H <= 0) return;
    cell = Math.max(6, Math.floor(Math.min(W / cols, H / rows)));
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = cols * cell, ch = rows * cell;
    canvas.style.width = cw + 'px';
    canvas.style.height = ch + 'px';
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    buildGrid();
  }
  function buildGrid() {
    gridCanvas = document.createElement('canvas');
    gridCanvas.width = canvas.width; gridCanvas.height = canvas.height;
    const g = gridCanvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = cols * cell, h = rows * cell;
    const bg = g.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#0a0424'); bg.addColorStop(1, '#050214');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.lineWidth = 1;
    for (let x = 0; x <= cols; x++) {
      g.strokeStyle = x % 4 === 0 ? 'rgba(0,240,255,.16)' : 'rgba(120,90,255,.09)';
      g.beginPath(); g.moveTo(x * cell + 0.5, 0); g.lineTo(x * cell + 0.5, h); g.stroke();
    }
    for (let y = 0; y <= rows; y++) {
      g.strokeStyle = y % 4 === 0 ? 'rgba(0,240,255,.16)' : 'rgba(120,90,255,.09)';
      g.beginPath(); g.moveTo(0, y * cell + 0.5); g.lineTo(w, y * cell + 0.5); g.stroke();
    }
  }

  /* ---------- helpers ---------- */
  function occupied(x, y) {
    for (let i = 0; i < snake.length; i++) if (snake[i].x === x && snake[i].y === y) return true;
    for (let i = 0; i < items.length; i++) if (items[i].x === x && items[i].y === y) return true;
    for (let i = 0; i < mines.length; i++) if (mines[i].x === x && mines[i].y === y) return true;
    return false;
  }
  function freeCell(minDist) {
    const h = snake[0] || { x: cols >> 1, y: rows >> 1 };
    const far = (x, y) => Math.abs(x - h.x) + Math.abs(y - h.y) >= minDist;
    for (let i = 0; i < 60; i++) {
      const x = randInt(0, cols - 1), y = randInt(0, rows - 1);
      if (!occupied(x, y) && far(x, y)) return { x, y };
    }
    const list = [];
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (!occupied(x, y) && far(x, y)) list.push({ x, y });
    if (!list.length) return null;
    return list[randInt(0, list.length - 1)];
  }
  function spawnItem(type, ttl) {
    const p = freeCell(type === 'shard' ? 2 : 3);
    if (!p) return;
    items.push({ type, x: p.x, y: p.y, ttl: ttl || Infinity, age: 0 });
  }
  function spawnMine() {
    if (mines.length >= Math.min(12, Math.floor(cols * rows / 40))) return;
    const p = freeCell(6);
    if (p) mines.push({ x: p.x, y: p.y, age: 0 });
  }
  function burst(gx, gy, color, n) {
    if (particles.length > 220) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = rand(1.5, 7);
      particles.push({ x: gx + 0.5, y: gy + 0.5, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, decay: rand(1.4, 3), color });
    }
  }
  function floater(gx, gy, text, color) {
    floaters.push({ x: gx + 0.5, y: gy, text, color, life: 1 });
  }
  function banner(text, sub) {
    el.banner.textContent = text;
    if (sub) { const s = document.createElement('small'); s.textContent = sub; el.banner.appendChild(s); }
    el.banner.classList.remove('show');
    void el.banner.offsetWidth; // restart the animation
    el.banner.classList.add('show');
  }
  function stepMs() {
    const base = Math.max(82, 158 - (level - 1) * 7);
    return slowLeft > 0 ? base * 1.7 : base;
  }
  function mult() { return 1 + scrambles; }

  /* ---------- legend + HUD ---------- */
  function arrowSvg(d, cls) {
    return '<svg class="' + (cls || '') + '" viewBox="0 0 24 24" style="transform:rotate(' + (d * 90) + 'deg)" aria-hidden="true"><path d="M12 3 22 20H2Z"/></svg>';
  }
  function renderLegend() {
    const show = assist || revealLeft > 0 || state === 'title' || isIdentity(map);
    const key = map.join('') + (show ? 's' : 'h');
    if (hudCache.legend === key) return;
    hudCache.legend = key;
    let html = '';
    for (let p = 0; p < 4; p++) {
      const out = show ? arrowSvg(map[p], 'out') : '<span class="q">?</span>';
      html += '<div class="chip' + (map[p] !== p ? ' changed' : '') + '" title="' + DIR_NAMES[p] + ' arrow">' + arrowSvg(p) + '<span>&rsaquo;</span>' + out + '</div>';
    }
    el.legend.innerHTML = html;
  }
  function setText(node, key, v) {
    if (hudCache[key] !== v) { hudCache[key] = v; node.textContent = v; }
  }
  function renderHud() {
    setText(el.score, 'score', String(score));
    setText(el.best, 'best', String(Math.max(best, score)));
    setText(el.mult, 'mult', 'x' + mult());
    setText(el.level, 'level', String(level));
    if (hudCache.lives !== lives) {
      hudCache.lives = lives;
      const pips = el.lives.children;
      for (let i = 0; i < pips.length; i++) pips[i].classList.toggle('off', i >= lives);
    }
    const inGame = state === 'playing' || state === 'reboot';
    const frac = inGame && scrambleInterval ? clamp(scrambleLeft / scrambleInterval, 0, 1) : 1;
    el.scrBar.style.transform = 'scaleX(' + frac.toFixed(3) + ')';
    const warn = inGame && scrambleLeft <= WARN_MS;
    if (hudCache.warn !== warn) {
      hudCache.warn = warn;
      el.scrBox.classList.toggle('warn', warn);
      stage.classList.toggle('warn', warn);
      el.scrLbl.textContent = warn ? 'SCRAMBLE INCOMING' : 'NEXT SCRAMBLE';
    }
    renderLegend();
  }

  /* ---------- game flow ---------- */
  function resetRunner() {
    const cx = cols >> 1, cy = rows >> 1;
    snake = [{ x: cx, y: cy }, { x: cx - 1, y: cy }, { x: cx - 2, y: cy }];
    prev = snake.map((s) => ({ x: s.x, y: s.y }));
    dir = 1; queue = []; grow = 0; acc = 0;
    // Clear the spawn area and the lane ahead of the runner.
    const danger = (o) => (Math.abs(o.x - cx) + Math.abs(o.y - cy) < 5) || (o.y === cy && o.x >= cx - 2);
    mines = mines.filter((m) => !danger(m));
    items = items.filter((it) => !(it.y === cy && it.x >= cx - 2 && it.x <= cx));
  }
  function scheduleScramble() {
    scrambleInterval = debugScramble || rand(30000, 45000);
    scrambleLeft = scrambleInterval;
    lastWarnSec = 0;
  }
  function startGame() {
    initAudio();
    state = 'playing'; paused = false;
    fitForNewGame();
    score = 0; lives = MAX_LIVES; level = 1; shards = 0; scrambles = 0;
    map = [0, 1, 2, 3];
    items = []; mines = []; particles = []; floaters = [];
    gameTime = 0; revealLeft = 0; slowLeft = 0; glitchLeft = 0; shake = 0; overTimer = 0;
    coreTimer = rand(9000, 14000); bonusTimer = rand(18000, 26000);
    resetRunner();
    spawnItem('shard');
    scheduleScramble();
    showOverlay(null);
    state = 'reboot'; rebootLeft = 1500;
    banner('JACKED IN', 'CONTROLS NOMINAL');
    lastFrame = 0;
  }
  function fitForNewGame() {
    const s = state; state = 'title'; fit(); state = s;
  }
  function showOverlay(which) {
    // Drop focus from buttons that are about to be hidden so keys reach the game.
    if (document.activeElement && document.activeElement.blur && document.activeElement !== document.body) document.activeElement.blur();
    el.ovTitle.classList.toggle('show', which === 'title');
    el.ovPause.classList.toggle('show', which === 'pause');
    el.ovOver.classList.toggle('show', which === 'over');
  }
  function setPaused(p) {
    if (state !== 'playing' && state !== 'reboot') return;
    if (overTimer > 0) return;
    paused = p;
    showOverlay(p ? 'pause' : null);
    lastFrame = 0;
    if (!p) initAudio();
  }
  function toTitle() {
    state = 'title'; paused = false;
    map = [0, 1, 2, 3];
    items = []; mines = []; snake = []; prev = [];
    showOverlay('title');
    fit();
  }
  function fmtTime(ms) {
    const s = Math.floor(ms / 1000);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }
  function gameOver() {
    state = 'over';
    const isBest = score > best;
    if (isBest) { best = score; store.set(BEST_KEY, String(best)); }
    $('rScore').textContent = score;
    $('rBest').textContent = best;
    $('rShards').textContent = shards;
    $('rScr').textContent = scrambles;
    $('rTime').textContent = fmtTime(gameTime);
    $('newBest').classList.toggle('show', isBest && score > 0);
    overTimer = 900;
    sfx.over(); buzz([80, 60, 200]);
  }

  function scramble() {
    let m;
    do {
      m = [0, 1, 2, 3];
      for (let i = 3; i > 0; i--) { const j = randInt(0, i); const t = m[i]; m[i] = m[j]; m[j] = t; }
    } while (m.some((v, i) => v === i) || m.every((v, i) => v === map[i]));
    map = m;
    scrambles++;
    queue = [];
    revealLeft = REVEAL_MS; slowLeft = 1800; glitchLeft = 550; shake = reducedMotion ? 0 : 10;
    scheduleScramble();
    banner('CONTROLS SCRAMBLED', 'MULTIPLIER x' + mult());
    el.legend.classList.remove('flash'); void el.legend.offsetWidth; el.legend.classList.add('flash');
    if (!reducedMotion) {
      stage.classList.remove('glitching'); void stage.offsetWidth; stage.classList.add('glitching');
    }
    sfx.scramble(); buzz([40, 30, 40, 30, 90]);
  }

  function crash(gx, gy) {
    lives--;
    burst(gx, gy, C.rd, 26);
    for (let i = 1; i < snake.length; i += 2) burst(snake[i].x, snake[i].y, C.mg, 3);
    shake = reducedMotion ? 0 : 14;
    if (lives <= 0) { lives = 0; snake = []; prev = []; gameOver(); return; }
    sfx.crash(); buzz(120);
    resetRunner();
    state = 'reboot'; rebootLeft = 1800;
    banner('INTEGRITY BREACH', lives + ' LEFT');
  }

  function collect(it) {
    const m = mult();
    if (it.type === 'shard') {
      const pts = 10 * m; score += pts; shards++; grow += 1;
      burst(it.x, it.y, C.cy, 12); floater(it.x, it.y, '+' + pts, C.cy); sfx.shard(); buzz(12);
      spawnItem('shard');
      const nl = 1 + Math.floor(shards / 5);
      if (nl > level) {
        level = nl; spawnMine(); sfx.level();
        floater(it.x, it.y - 1, 'LEVEL ' + level, C.yl);
      }
    } else if (it.type === 'core') {
      const pts = 50 * m; score += pts; grow += 2;
      burst(it.x, it.y, C.yl, 22); floater(it.x, it.y, '+' + pts, C.yl); sfx.core(); buzz(25);
    } else if (it.type === 'stab') {
      map = [0, 1, 2, 3]; revealLeft = REVEAL_MS; queue = [];
      burst(it.x, it.y, C.gr, 22); sfx.stab(); buzz(30);
      banner('CONTROLS STABILISED', 'UNTIL NEXT SCRAMBLE');
    } else if (it.type === 'life') {
      if (lives < MAX_LIVES) lives++;
      burst(it.x, it.y, C.gr, 18); floater(it.x, it.y, '+INTEGRITY', C.gr); sfx.life(); buzz(30);
    }
  }

  function step() {
    while (queue.length) {
      const d = queue.shift();
      if (d !== dir && d !== (dir + 2) % 4) { dir = d; break; }
    }
    const h = snake[0];
    const nx = h.x + DIRS[dir].x, ny = h.y + DIRS[dir].y;
    if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) { crash(h.x, h.y); return; }
    const bodyEnd = grow > 0 ? snake.length : snake.length - 1;
    for (let i = 0; i < bodyEnd; i++) if (snake[i].x === nx && snake[i].y === ny) { crash(nx, ny); return; }
    for (let i = 0; i < mines.length; i++) {
      if (mines[i].x === nx && mines[i].y === ny) { mines.splice(i, 1); crash(nx, ny); return; }
    }
    prev = snake.map((s) => ({ x: s.x, y: s.y }));
    snake.unshift({ x: nx, y: ny });
    if (grow > 0) grow--; else snake.pop();
    for (let i = 0; i < items.length; i++) {
      if (items[i].x === nx && items[i].y === ny) { const it = items[i]; items.splice(i, 1); collect(it); break; }
    }
  }

  function update(dt) {
    // Cosmetic timers run in every active state.
    if (glitchLeft > 0) glitchLeft -= dt;
    if (shake > 0) shake = Math.max(0, shake - dt * 0.03);
    const ds = dt / 1000;
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * ds; p.y += p.vy * ds; p.vx *= 0.94; p.vy *= 0.94; p.life -= p.decay * ds;
      if (p.life <= 0) particles.splice(i, 1);
    }
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i]; f.y -= ds * 1.2; f.life -= ds * 1.1;
      if (f.life <= 0) floaters.splice(i, 1);
    }
    for (let i = 0; i < items.length; i++) items[i].age += dt;
    for (let i = 0; i < mines.length; i++) mines[i].age += dt;

    if (state === 'over') {
      if (overTimer > 0) { overTimer -= dt; if (overTimer <= 0) { overTimer = 0; showOverlay('over'); } }
      return;
    }
    if (state === 'reboot') {
      rebootLeft -= dt;
      if (rebootLeft <= 0) { state = 'playing'; acc = 0; queue = []; }
      return;
    }
    if (state !== 'playing') return;

    gameTime += dt;
    if (revealLeft > 0) revealLeft -= dt;
    if (slowLeft > 0) slowLeft -= dt;

    // Timed items
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (it.ttl !== Infinity) { it.ttl -= dt; if (it.ttl <= 0) { burst(it.x, it.y, '#555a88', 5); items.splice(i, 1); } }
    }
    if (!items.some((it) => it.type === 'shard')) spawnItem('shard');
    coreTimer -= dt;
    if (coreTimer <= 0) { coreTimer = rand(11000, 17000); if (!items.some((it) => it.type === 'core')) spawnItem('core', 7500); }
    bonusTimer -= dt;
    if (bonusTimer <= 0) {
      bonusTimer = rand(20000, 30000);
      const opts = [];
      if (!isIdentity(map) && scrambleLeft > 9000) opts.push('stab');
      if (lives < MAX_LIVES) opts.push('life');
      if (opts.length && !items.some((it) => it.type === 'stab' || it.type === 'life')) spawnItem(opts[randInt(0, opts.length - 1)], 9000);
    }

    // Scramble clock
    scrambleLeft -= dt;
    if (scrambleLeft <= WARN_MS && scrambleLeft > 0) {
      const sec = Math.ceil(scrambleLeft / 1000);
      if (sec !== lastWarnSec) { lastWarnSec = sec; sfx.warn(); buzz(15); }
    }
    if (scrambleLeft <= 0) scramble();

    // Movement
    acc += dt;
    let guard = 0;
    while (state === 'playing' && acc >= stepMs() && guard++ < 4) { acc -= stepMs(); step(); }
    if (guard >= 4) acc = 0;
  }

  /* ---------- rendering ---------- */
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
  function drawItem(it, now) {
    const cx = (it.x + 0.5) * cell, cy = (it.y + 0.5) * cell;
    const pop = Math.min(1, it.age / 220);
    if (it.ttl < 2200 && Math.floor(now / 110) % 2 === 0) return; // expiring blink
    const pulse = 1 + Math.sin(now / 180 + it.x) * 0.1;
    const r = cell * 0.34 * pop * pulse;
    ctx.save();
    ctx.translate(cx, cy);
    if (it.type === 'shard') {
      ctx.rotate(now / 600);
      ctx.shadowColor = C.cy; ctx.shadowBlur = cell * 0.6;
      ctx.fillStyle = C.cy;
      ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r * 0.7, 0); ctx.lineTo(0, r); ctx.lineTo(-r * 0.7, 0); ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.moveTo(0, -r * 0.45); ctx.lineTo(r * 0.3, 0); ctx.lineTo(0, r * 0.45); ctx.lineTo(-r * 0.3, 0); ctx.closePath(); ctx.fill();
    } else if (it.type === 'core') {
      ctx.rotate(-now / 900);
      ctx.shadowColor = C.yl; ctx.shadowBlur = cell * 0.8;
      ctx.fillStyle = C.yl;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; ctx.lineTo(Math.cos(a) * r * 1.15, Math.sin(a) * r * 1.15); }
      ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = '#1a1200';
      ctx.beginPath(); ctx.arc(0, 0, r * 0.4, 0, Math.PI * 2); ctx.fill();
    } else if (it.type === 'stab') {
      ctx.shadowColor = C.gr; ctx.shadowBlur = cell * 0.7;
      ctx.strokeStyle = C.gr; ctx.lineWidth = Math.max(2, cell * 0.1);
      ctx.beginPath(); ctx.arc(0, 0, r * 1.1, 0, Math.PI * 2); ctx.stroke();
      // four arrows pointing outward = "controls back to normal"
      ctx.fillStyle = C.gr;
      for (let i = 0; i < 4; i++) {
        ctx.rotate(Math.PI / 2);
        ctx.beginPath(); ctx.moveTo(0, -r * 0.85); ctx.lineTo(r * 0.3, -r * 0.3); ctx.lineTo(-r * 0.3, -r * 0.3); ctx.closePath(); ctx.fill();
      }
    } else {
      ctx.shadowColor = C.gr; ctx.shadowBlur = cell * 0.7;
      ctx.fillStyle = C.gr;
      const t = r * 0.38;
      ctx.fillRect(-t, -r, t * 2, r * 2); ctx.fillRect(-r, -t, r * 2, t * 2);
    }
    ctx.restore();
  }
  function drawMine(m, now) {
    const cx = (m.x + 0.5) * cell, cy = (m.y + 0.5) * cell;
    const pop = Math.min(1, m.age / 400);
    const r = cell * 0.36 * pop;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.shadowColor = C.rd; ctx.shadowBlur = cell * (0.5 + 0.25 * Math.sin(now / 150));
    ctx.strokeStyle = C.rd; ctx.lineWidth = Math.max(2, cell * 0.1);
    ctx.strokeRect(-r, -r, r * 2, r * 2);
    ctx.beginPath(); ctx.moveTo(-r, -r); ctx.lineTo(r, r); ctx.moveTo(r, -r); ctx.lineTo(-r, r); ctx.stroke();
    ctx.restore();
  }
  function drawRunner(t, now) {
    const n = snake.length;
    if (!n) return;
    const blink = state === 'reboot' && Math.floor(now / 120) % 2 === 0;
    for (let i = n - 1; i >= 0; i--) {
      const to = snake[i], from = prev[i] || to;
      const x = (from.x + (to.x - from.x) * t) * cell;
      const y = (from.y + (to.y - from.y) * t) * cell;
      const k = n > 1 ? i / (n - 1) : 0;
      if (i === 0) {
        const pad = cell * 0.06, s = cell - pad * 2;
        ctx.save();
        ctx.shadowColor = C.cy; ctx.shadowBlur = cell * 0.9;
        ctx.fillStyle = blink ? '#fff' : '#eaffff';
        rr(x + pad, y + pad, s, s, cell * 0.28); ctx.fill();
        ctx.shadowBlur = 0;
        // visor
        const d = DIRS[dir], cx = x + cell / 2, cy = y + cell / 2;
        ctx.fillStyle = C.mg;
        const ex = d.x * cell * 0.2, ey = d.y * cell * 0.2;
        const px = -d.y * cell * 0.18, py = d.x * cell * 0.18;
        const e = Math.max(1.5, cell * 0.09);
        ctx.beginPath(); ctx.arc(cx + ex + px, cy + ey + py, e, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + ex - px, cy + ey - py, e, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      } else {
        const pad = cell * (0.12 + 0.1 * k), s = cell - pad * 2;
        ctx.globalAlpha = blink ? 0.4 : 1 - 0.5 * k;
        ctx.fillStyle = 'hsl(' + Math.round(184 + 126 * k) + ',100%,58%)';
        rr(x + pad, y + pad, s, s, cell * 0.2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
  function render(now) {
    const w = cols * cell, h = rows * cell;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (gridCanvas) ctx.drawImage(gridCanvas, 0, 0, w, h);
    else { ctx.fillStyle = '#07031a'; ctx.fillRect(0, 0, w, h); }

    ctx.save();
    if (shake > 0.3) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

    for (let i = 0; i < mines.length; i++) drawMine(mines[i], now);
    for (let i = 0; i < items.length; i++) drawItem(items[i], now);

    const t = state === 'playing' && !paused ? clamp(acc / stepMs(), 0, 1) : 1;
    drawRunner(t, now);

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      ctx.globalAlpha = clamp(p.life, 0, 1);
      ctx.fillStyle = p.color;
      const s = Math.max(1.5, cell * 0.12 * p.life);
      ctx.fillRect(p.x * cell - s / 2, p.y * cell - s / 2, s, s);
    }
    ctx.globalAlpha = 1;

    if (floaters.length) {
      ctx.font = '700 ' + Math.max(11, Math.round(cell * 0.62)) + 'px ' + FONT;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let i = 0; i < floaters.length; i++) {
        const f = floaters[i];
        ctx.globalAlpha = clamp(f.life * 1.5, 0, 1);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, clamp(f.x * cell, 30, w - 30), Math.max(10, f.y * cell));
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    if (state === 'reboot' && !paused) {
      const n = Math.max(1, Math.ceil(rebootLeft / 600));
      ctx.font = '800 ' + Math.round(cell * 3) + 'px ' + FONT;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      ctx.shadowColor = C.mg; ctx.shadowBlur = 20;
      ctx.fillText(String(n), w / 2, h * 0.68);
      ctx.shadowBlur = 0;
    }

    // Slice-displacement glitch right after a scramble.
    if (glitchLeft > 0 && !reducedMotion) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const W = canvas.width, H = canvas.height;
      for (let i = 0; i < 5; i++) {
        const sy = Math.floor(Math.random() * H), sh = Math.floor(rand(4, H * 0.09));
        const dx = Math.floor(rand(-W * 0.07, W * 0.07));
        const hh = Math.min(sh, H - sy);
        if (hh > 0) ctx.drawImage(canvas, 0, sy, W, hh, dx, sy, W, hh);
      }
      ctx.fillStyle = 'rgba(255,43,214,.07)'; ctx.fillRect(0, 0, W, H);
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (!lastFrame) lastFrame = now;
    const dt = Math.min(100, now - lastFrame);
    lastFrame = now;
    if (!paused) update(dt);
    render(now);
    renderHud();
  }

  /* ---------- input ---------- */
  function flashPad(p) {
    const b = el.pad.querySelector('[data-d="' + p + '"]');
    if (!b) return;
    b.classList.add('hit');
    setTimeout(() => b.classList.remove('hit'), 110);
  }
  function press(p) {
    flashPad(p);
    if (paused || state !== 'playing') return;
    const actual = map[p];
    const last = queue.length ? queue[queue.length - 1] : dir;
    if (actual === last || actual === (last + 2) % 4) return;
    if (queue.length < 2) { queue.push(actual); sfx.turn(); }
  }

  const KEYS = {
    ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3,
    w: 0, d: 1, s: 2, a: 3, W: 0, D: 1, S: 2, A: 3
  };
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    if (k in KEYS) {
      e.preventDefault();
      if (!e.repeat) { initAudio(); press(KEYS[k]); }
      return;
    }
    const onButton = document.activeElement && document.activeElement.tagName === 'BUTTON';
    if (k === ' ' || k === 'p' || k === 'P' || k === 'Escape') {
      if (k === ' ' && onButton) return; // let the focused button handle it
      e.preventDefault();
      if (e.repeat) return;
      if (state === 'playing' || state === 'reboot') setPaused(!paused);
      else if (k === ' ' && state === 'title') startGame();
      else if (k === ' ' && state === 'over' && overTimer <= 0) startGame();
      return;
    }
    if (k === 'Enter') {
      if (onButton) return; // let the focused button handle it
      if (state === 'title' || (state === 'over' && overTimer <= 0)) { e.preventDefault(); startGame(); }
      else if (paused) { e.preventDefault(); setPaused(false); }
      return;
    }
    if (k === 'm' || k === 'M') toggleMute();
  });

  // On-screen pad
  el.pad.querySelectorAll('.pb').forEach((b) => {
    const p = parseInt(b.getAttribute('data-d'), 10);
    b.innerHTML = arrowSvg(p);
    const down = (e) => { e.preventDefault(); initAudio(); press(p); };
    if (window.PointerEvent) b.addEventListener('pointerdown', down);
    else { b.addEventListener('touchstart', down, { passive: false }); b.addEventListener('mousedown', down); }
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  });

  // Swipes on the board (subject to the same wiring as the arrows)
  let swipe = null;
  stage.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    swipe = { id: e.pointerId, x: e.clientX, y: e.clientY };
  });
  stage.addEventListener('pointermove', (e) => {
    if (!swipe || e.pointerId !== swipe.id) return;
    const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 26) return;
    press(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0));
    swipe.x = e.clientX; swipe.y = e.clientY;
  });
  const endSwipe = (e) => { if (swipe && e.pointerId === swipe.id) swipe = null; };
  stage.addEventListener('pointerup', endSwipe);
  stage.addEventListener('pointercancel', endSwipe);

  // Stop page scrolling / zoom gestures (overlays keep their own vertical scroll).
  document.addEventListener('touchmove', (e) => {
    if (!(e.target.closest && e.target.closest('.overlay'))) e.preventDefault();
  }, { passive: false });
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault());
  document.addEventListener('contextmenu', (e) => { if (e.target.closest && e.target.closest('#main')) e.preventDefault(); });

  function toggleMute() {
    muted = !muted;
    store.set(MUTE_KEY, muted ? '1' : '0');
    el.btnMute.classList.toggle('off', muted);
    el.btnMute.setAttribute('aria-pressed', String(!muted));
    if (!muted) { initAudio(); tone(880, 0.06, 'square', 0.05); }
  }
  function setAssist(v) {
    assist = v;
    store.set(ASSIST_KEY, v ? '1' : '0');
    el.btnAssist.setAttribute('aria-pressed', String(v));
    el.btnAssist.firstChild.nodeValue = 'ASSIST: ' + (v ? 'ON ' : 'OFF ');
    hudCache.legend = null;
  }

  $('btnStart').addEventListener('click', startGame);
  $('btnAgain').addEventListener('click', startGame);
  $('btnMenu').addEventListener('click', toTitle);
  $('btnQuit').addEventListener('click', toTitle);
  $('btnResume').addEventListener('click', () => setPaused(false));
  el.btnPause.addEventListener('click', () => { el.btnPause.blur(); setPaused(!paused); });
  el.btnMute.addEventListener('click', () => { el.btnMute.blur(); toggleMute(); });
  el.btnAssist.addEventListener('click', () => setAssist(!assist));

  document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });
  window.addEventListener('blur', () => setPaused(true));
  window.addEventListener('pagehide', () => setPaused(true));

  /* ---------- boot ---------- */
  function markTouch() {
    if (document.body.classList.contains('touch')) return;
    document.body.classList.add('touch');
    fit();
  }
  if ((window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window || navigator.maxTouchPoints > 0) {
    document.body.classList.add('touch');
  }
  window.addEventListener('touchstart', markTouch, { passive: true });

  let fitQueued = false;
  function queueFit() {
    if (fitQueued) return;
    fitQueued = true;
    requestAnimationFrame(() => { fitQueued = false; fit(); });
  }
  window.addEventListener('resize', queueFit);
  window.addEventListener('orientationchange', () => setTimeout(queueFit, 250));
  if (window.ResizeObserver) new ResizeObserver(queueFit).observe(stage);

  el.btnMute.classList.toggle('off', muted);
  setAssist(assist);
  fit();
  renderHud();
  requestAnimationFrame(frame);
})();
