/* VERTIGO//DRIFT — dodge drones in an arena that keeps being rotated and mirrored.
   The world is a 100 x 100 square; the arrows always move the runner in world directions
   (0 = up, 1 = right, 2 = down, 3 = left), whatever the view currently looks like. */
(() => {
  'use strict';
  const { $, rand, randInt, clamp, sfx, buzz, banner, hud, MAX_LIVES, WARN_MS, reducedMotion } = GG;

  const C = { cy: '#00f0ff', mg: '#ff2bd6', yl: '#f9f002', gr: '#39ff88', rd: '#ff3355' };
  const VIEWS = [
    { name: 'WORLD RESTORED', css: 'none' },
    { name: 'ROTATED 90°', css: 'rotate(90deg)' },
    { name: 'ROTATED 180°', css: 'rotate(180deg)' },
    { name: 'ROTATED 270°', css: 'rotate(-90deg)' },
    { name: 'MIRRORED', css: 'scaleX(-1)' },
    { name: 'UPSIDE DOWN', css: 'scaleY(-1)' }
  ];
  const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const PR = 2.3;      // runner radius
  const SPEED = 46;    // world units per second

  const canvas = $('game'), ctx = canvas.getContext('2d'), stage = $('stage'), pad = $('pad');
  let side = 300, dpr = 1;
  const held = [false, false, false, false];

  let px = 50, py = 50, faceX = 0, faceY = -1;
  let drones = [], particles = [], shard = null, stab = null;
  let score = 0, lives = MAX_LIVES, level = 1, shards = 0, scrambles = 0, view = 0;
  let scrInterval = 1, scrLeft = 1, lastWarnSec = 0, gameTime = 0, lastFrame = 0;
  let spawnLeft = 0, invuln = 0, graceLeft = 0, tickAcc = 0, stabTimer = 0, shake = 0;

  const sh = GG.shell({
    bestKey: 'vertigodrift.best',
    start: startGame,
    onPause() { lastFrame = 0; held.fill(false); },
    onTitle() { setView(0); drones = []; shard = null; stab = null; particles = []; },
    onLayout: fit
  });

  function fit() {
    const s = Math.floor(Math.min(stage.clientWidth, stage.clientHeight) - 10);
    if (s <= 0) return;
    side = s; dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.style.width = canvas.style.height = side + 'px';
    canvas.width = canvas.height = Math.round(side * dpr);
  }
  function setView(v) { view = v; canvas.style.transform = VIEWS[v].css; }
  function mult() { return 1 + scrambles; }

  function burst(x, y, color, n) {
    if (particles.length > 200) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = rand(8, 40);
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, decay: rand(1.4, 3), color });
    }
  }
  function farPoint(minDist) {
    for (let i = 0; i < 40; i++) {
      const x = rand(8, 92), y = rand(8, 92);
      if (Math.hypot(x - px, y - py) >= minDist) return { x, y };
    }
    return { x: 100 - px, y: 100 - py };
  }
  function spawnShard() { const p = farPoint(25); shard = { x: p.x, y: p.y, age: 0 }; }
  function spawnDrone() {
    const edge = randInt(0, 3), along = rand(5, 95);
    let x, y;
    if (edge === 0) { x = along; y = -5; } else if (edge === 1) { x = 105; y = along; } else if (edge === 2) { x = along; y = 105; } else { x = -5; y = along; }
    // Aim near the runner, not exactly at it, so there is always a way out.
    const tx = clamp(px + rand(-22, 22), 5, 95), ty = clamp(py + rand(-22, 22), 5, 95);
    const d = Math.hypot(tx - x, ty - y) || 1;
    const sp = rand(16, 25) + Math.min(level, 10) * 2.4;
    drones.push({ x, y, vx: (tx - x) / d * sp, vy: (ty - y) / d * sp, r: 2.4, spin: rand(0, 6) });
  }
  function scheduleScramble() {
    scrInterval = GG.scrambleInterval(30000, 45000);
    scrLeft = scrInterval; lastWarnSec = 0;
  }
  function startGame() {
    fit();
    px = 50; py = 50; faceX = 0; faceY = -1; held.fill(false);
    drones = []; particles = []; stab = null;
    score = 0; lives = MAX_LIVES; level = 1; shards = 0; scrambles = 0; gameTime = 0;
    spawnLeft = 2500; invuln = 0; graceLeft = 0; tickAcc = 0; shake = 0; stabTimer = rand(20000, 30000);
    setView(0);
    spawnShard();
    scheduleScramble();
    lastFrame = 0;
    banner('JACKED IN', 'YELLOW EDGE = UP');
  }

  function scramble() {
    let v;
    do { v = randInt(1, VIEWS.length - 1); } while (v === view);
    setView(v);
    scrambles++;
    graceLeft = 1600;            // drones slow down briefly while the arena turns
    scheduleScramble();
    banner(VIEWS[v].name, 'MULTIPLIER x' + mult());
    sfx.scramble(); buzz([40, 30, 40, 30, 90]);
  }
  function hitRunner() {
    lives--;
    burst(px, py, C.rd, 26);
    shake = reducedMotion ? 0 : 4;
    drones = drones.filter((d) => Math.hypot(d.x - px, d.y - py) > 28);
    if (lives <= 0) {
      lives = 0;
      sh.gameOver(score, [['SHARDS', shards], ['SHIFTS SURVIVED', scrambles], ['TIME', GG.fmtTime(gameTime)]]);
      return;
    }
    invuln = 1900;
    sfx.bad(); buzz(120);
    banner('INTEGRITY BREACH', lives + ' LEFT');
  }

  function update(dt) {
    const ds = dt / 1000;
    gameTime += dt;
    if (invuln > 0) invuln -= dt;
    if (graceLeft > 0) graceLeft -= dt;

    // Runner
    let mx = 0, my = 0;
    for (let i = 0; i < 4; i++) if (held[i]) { mx += DIRS[i][0]; my += DIRS[i][1]; }
    if (mx || my) {
      const n = Math.hypot(mx, my);
      mx /= n; my /= n; faceX = mx; faceY = my;
      px = clamp(px + mx * SPEED * ds, PR, 100 - PR);
      py = clamp(py + my * SPEED * ds, PR, 100 - PR);
    }

    // Survival points
    tickAcc += dt;
    while (tickAcc >= 1000) { tickAcc -= 1000; score += mult(); }

    // Pickups
    if (shard) {
      shard.age += dt;
      if (Math.hypot(shard.x - px, shard.y - py) < PR + 2.6) {
        score += 10 * mult(); shards++;
        burst(shard.x, shard.y, C.cy, 14); buzz(12);
        const nl = 1 + Math.floor(shards / 5);
        if (nl > level) { level = nl; sfx.level(); } else sfx.good();
        spawnShard();
      }
    }
    stabTimer -= dt;
    if (stabTimer <= 0) {
      stabTimer = rand(22000, 32000);
      if (!stab && view !== 0 && scrLeft > 9000) { const p = farPoint(20); stab = { x: p.x, y: p.y, ttl: 9000 }; }
    }
    if (stab) {
      stab.ttl -= dt;
      if (Math.hypot(stab.x - px, stab.y - py) < PR + 3) {
        burst(stab.x, stab.y, C.gr, 20); stab = null;
        setView(0); sfx.stab(); buzz(30);
        banner('WORLD RESTORED', 'UNTIL NEXT SHIFT');
      } else if (stab.ttl <= 0) stab = null;
    }

    // Drones
    spawnLeft -= dt;
    if (spawnLeft <= 0) {
      spawnLeft = Math.max(340, 1600 - level * 130) * (graceLeft > 0 ? 2 : 1);
      if (drones.length < 40) spawnDrone();
    }
    const k = graceLeft > 0 ? 0.45 : 1;
    for (let i = drones.length - 1; i >= 0; i--) {
      const d = drones[i];
      d.x += d.vx * ds * k; d.y += d.vy * ds * k; d.spin += ds * 4;
      if (d.x < -12 || d.x > 112 || d.y < -12 || d.y > 112) { drones.splice(i, 1); continue; }
      if (invuln <= 0 && Math.hypot(d.x - px, d.y - py) < d.r + PR - 0.5) {
        drones.splice(i, 1);
        hitRunner();
        if (sh.state !== 'play') return;
      }
    }

    // Shift clock
    scrLeft -= dt;
    if (scrLeft <= WARN_MS && scrLeft > 0) {
      const sec = Math.ceil(scrLeft / 1000);
      if (sec !== lastWarnSec) { lastWarnSec = sec; sfx.warn(); buzz(15); }
    }
    if (scrLeft <= 0) scramble();
  }
  function updateFx(dt) {
    const ds = dt / 1000;
    if (shake > 0) shake = Math.max(0, shake - dt * 0.012);
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * ds; p.y += p.vy * ds; p.vx *= 0.94; p.vy *= 0.94; p.life -= p.decay * ds;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function render(now) {
    const u = side / 100;
    ctx.setTransform(dpr * u, 0, 0, dpr * u, 0, 0);
    const bg = ctx.createLinearGradient(0, 0, 0, 100);
    bg.addColorStop(0, '#0a0424'); bg.addColorStop(1, '#050214');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, 100, 100);
    ctx.lineWidth = 0.15;
    for (let i = 0; i <= 100; i += 6.25) {
      ctx.strokeStyle = Math.round(i / 6.25) % 4 === 0 ? 'rgba(0,240,255,.18)' : 'rgba(120,90,255,.1)';
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 100); ctx.moveTo(0, i); ctx.lineTo(100, i); ctx.stroke();
    }
    // The yellow edge marks the world's "up".
    ctx.save();
    ctx.shadowColor = C.yl; ctx.shadowBlur = 3 * dpr * u;
    ctx.fillStyle = C.yl; ctx.fillRect(0, 0, 100, 1.3);
    ctx.beginPath(); ctx.moveTo(46, 1.3); ctx.lineTo(50, 5); ctx.lineTo(54, 1.3); ctx.closePath(); ctx.fill();
    ctx.restore();

    ctx.save();
    if (shake > 0.2) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

    if (shard) {
      const r = 2.4 * Math.min(1, shard.age / 220) * (1 + Math.sin(now / 180) * 0.1);
      ctx.save(); ctx.translate(shard.x, shard.y); ctx.rotate(now / 600);
      ctx.shadowColor = C.cy; ctx.shadowBlur = 4 * dpr * u; ctx.fillStyle = C.cy;
      ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r * 0.7, 0); ctx.lineTo(0, r); ctx.lineTo(-r * 0.7, 0); ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.moveTo(0, -r * 0.45); ctx.lineTo(r * 0.3, 0); ctx.lineTo(0, r * 0.45); ctx.lineTo(-r * 0.3, 0); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    if (stab && !(stab.ttl < 2200 && Math.floor(now / 110) % 2 === 0)) {
      ctx.save(); ctx.translate(stab.x, stab.y);
      ctx.shadowColor = C.gr; ctx.shadowBlur = 4 * dpr * u;
      ctx.strokeStyle = C.gr; ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.arc(0, 0, 2.8 + Math.sin(now / 200) * 0.3, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = C.gr; ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    for (let i = 0; i < drones.length; i++) {
      const d = drones[i];
      const sp = Math.hypot(d.vx, d.vy) || 1;
      ctx.strokeStyle = 'rgba(255,51,85,.35)'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - d.vx / sp * 6, d.y - d.vy / sp * 6); ctx.stroke();
      ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.spin);
      ctx.shadowColor = C.rd; ctx.shadowBlur = 3 * dpr * u;
      ctx.fillStyle = C.rd; ctx.fillRect(-d.r * 0.8, -d.r * 0.8, d.r * 1.6, d.r * 1.6);
      ctx.shadowBlur = 0; ctx.fillStyle = '#1a0006'; ctx.fillRect(-d.r * 0.3, -d.r * 0.3, d.r * 0.6, d.r * 0.6);
      ctx.restore();
    }
    // Runner
    if (sh.state !== 'over' && !(invuln > 0 && Math.floor(now / 100) % 2 === 0)) {
      ctx.save(); ctx.translate(px, py);
      ctx.shadowColor = C.cy; ctx.shadowBlur = 5 * dpr * u;
      ctx.fillStyle = '#eaffff';
      ctx.beginPath(); ctx.arc(0, 0, PR, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = C.mg;
      const ex = faceX * PR * 0.45, ey = faceY * PR * 0.45, sx = -faceY * PR * 0.4, sy = faceX * PR * 0.4;
      ctx.beginPath(); ctx.arc(ex + sx, ey + sy, 0.42, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(ex - sx, ey - sy, 0.42, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      ctx.globalAlpha = clamp(p.life, 0, 1); ctx.fillStyle = p.color;
      const s = 0.4 + 0.6 * p.life;
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (!lastFrame) lastFrame = now;
    const dt = Math.min(100, now - lastFrame);
    lastFrame = now;
    if (!sh.paused) { if (sh.state === 'play') update(dt); updateFx(dt); }
    render(now);
    const playing = sh.state === 'play';
    hud({
      score, best: Math.max(sh.best, score), mult: mult(), level, lives,
      frac: playing ? scrLeft / scrInterval : 1, warn: playing && scrLeft <= WARN_MS,
      label: 'NEXT SHIFT', warnLabel: 'SHIFT INCOMING'
    });
  }

  /* ---------- input (hold to move) ---------- */
  const KEYS = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3, w: 0, d: 1, s: 2, a: 3, W: 0, D: 1, S: 2, A: 3 };
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || !(e.key in KEYS)) return;
    e.preventDefault(); GG.initAudio();
    held[KEYS[e.key]] = true;
  });
  window.addEventListener('keyup', (e) => { if (e.key in KEYS) held[KEYS[e.key]] = false; });
  pad.querySelectorAll('.pb').forEach((b) => {
    const p = parseInt(b.getAttribute('data-d'), 10);
    b.innerHTML = GG.arrowSvg(p);
    const down = (e) => {
      e.preventDefault(); GG.initAudio();
      held[p] = true; b.classList.add('hit');
      if (e.pointerId !== undefined && b.setPointerCapture) { try { b.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } }
    };
    const up = () => { held[p] = false; b.classList.remove('hit'); };
    if (window.PointerEvent) {
      b.addEventListener('pointerdown', down);
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((t) => b.addEventListener(t, up));
    } else {
      b.addEventListener('touchstart', down, { passive: false });
      ['touchend', 'touchcancel'].forEach((t) => b.addEventListener(t, up));
      b.addEventListener('mousedown', down); window.addEventListener('mouseup', up);
    }
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

  fit();
  requestAnimationFrame(frame);
})();
