/* SYNC//PULSE — a one-button timing test. A marker orbits a ring; press while it is inside the zone.
   Angles are in radians. "rel" is the marker's signed distance from the zone centre measured
   along the direction of travel: negative while approaching, positive once past the centre. */
(() => {
  'use strict';
  const { $, rand, randInt, clamp, sfx, buzz, banner, hud, MAX_LIVES, WARN_MS, reducedMotion } = GG;

  const C = { cy: '#00f0ff', mg: '#ff2bd6', yl: '#f9f002', gr: '#39ff88', rd: '#ff3355' };
  const FONT = '"Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif';
  const DEG = Math.PI / 180;
  const R = 38;                // ring radius in a 100 x 100 world
  const MODES = {
    NOMINAL: 'Tap while the marker is inside the bright zone',
    REVERSED: 'The marker now orbits the other way',
    OVERCLOCK: 'The marker runs 40% faster',
    BLACKOUT: 'The marker goes dark as it nears the zone',
    DRIFT: 'The zone slides toward the marker'
  };
  const SHIFTS = ['REVERSED', 'OVERCLOCK', 'BLACKOUT', 'DRIFT'];

  const canvas = $('game'), ctx = canvas.getContext('2d'), stage = $('stage');
  const el = { ruleName: $('ruleName'), ruleDesc: $('ruleDesc'), ruleBox: $('rule') };
  let side = 300, dpr = 1;

  let ang = 0, dir = 1, zc = 0, mode = 'NOMINAL';
  let score = 0, lives = MAX_LIVES, level = 1, hits = 0, perfects = 0, streak = 0, bestStreak = 0, scrambles = 0;
  let scrInterval = 1, scrLeft = 1, lastWarnSec = 0, gameTime = 0, lastFrame = 0;
  let lockLeft = 0, startHold = 0, flashLeft = 0, flashColor = C.gr, label = '', labelLeft = 0;
  const trail = [];

  const sh = GG.shell({
    bestKey: 'syncpulse.best',
    start: startGame,
    onPause() { lastFrame = 0; },
    onTitle() { setMode('NOMINAL'); },
    onLayout: fit
  });

  function fit() {
    const gap = parseFloat(getComputedStyle(stage).rowGap) || 0;
    const s = Math.floor(Math.min(stage.clientWidth - 30, stage.clientHeight - el.ruleBox.offsetHeight - gap - 22));
    if (s <= 0) return;
    side = Math.min(s, 620); dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.style.width = canvas.style.height = side + 'px';
    canvas.width = canvas.height = Math.round(side * dpr);
  }
  function setMode(m) { mode = m; el.ruleName.textContent = m; el.ruleDesc.textContent = MODES[m]; }
  function mult() { return 1 + scrambles; }
  function speed() { return Math.min(240, 118 + level * 12) * DEG * (mode === 'OVERCLOCK' ? 1.4 : 1); }
  function halfZone() { return Math.max(15, 31 - level * 1.5) * DEG; }
  function norm(a) { a %= Math.PI * 2; if (a > Math.PI) a -= Math.PI * 2; if (a <= -Math.PI) a += Math.PI * 2; return a; }
  function rel() { return norm(ang - zc) * dir; }
  function relocate(far) { zc = ang + dir * (far ? 172 : rand(130, 172)) * DEG; }
  function say(text, color) { label = text; labelLeft = 650; flashColor = color; flashLeft = 260; }

  function scheduleScramble() {
    scrInterval = GG.scrambleInterval(25000, 40000);
    scrLeft = scrInterval; lastWarnSec = 0;
  }
  function startGame() {
    fit();
    ang = -Math.PI / 2; dir = 1; trail.length = 0;
    score = 0; lives = MAX_LIVES; level = 1; hits = 0; perfects = 0; streak = 0; bestStreak = 0; scrambles = 0; gameTime = 0;
    lockLeft = 1300; startHold = 1300; flashLeft = 0; labelLeft = 0;
    setMode('NOMINAL');
    relocate(true);
    scheduleScramble();
    lastFrame = 0;
    banner('ORBIT NOMINAL', 'TAP INSIDE THE ZONE');
  }
  function disrupt() {
    let m;
    do { m = SHIFTS[randInt(0, SHIFTS.length - 1)]; } while (m === mode);
    if (m === 'REVERSED') dir = -dir;
    setMode(m);
    scrambles++;
    trail.length = 0;
    relocate(true);
    lockLeft = 500;
    scheduleScramble();
    banner(m, 'MULTIPLIER x' + mult());
    sfx.scramble(); buzz([40, 30, 40, 30, 90]);
  }
  function fail(text) {
    lives--; streak = 0;
    say(text, C.rd); buzz(120);
    if (lives <= 0) {
      lives = 0;
      sh.gameOver(score, [['HITS', hits], ['PERFECT', perfects], ['BEST STREAK', bestStreak], ['DISRUPTIONS SURVIVED', scrambles], ['TIME', GG.fmtTime(gameTime)]]);
      return;
    }
    sfx.bad();
    relocate(true);
    lockLeft = 450;
  }
  function act() {
    if (sh.state !== 'play' || sh.paused || lockLeft > 0) return;
    const r = rel(), hz = halfZone();
    if (Math.abs(r) > hz) { fail(r < 0 ? 'TOO EARLY' : 'TOO LATE'); return; }
    const perfect = Math.abs(r) <= hz * 0.35;
    score += (perfect ? 20 : 10) * mult();
    hits++; streak++;
    if (perfect) perfects++;
    if (streak > bestStreak) bestStreak = streak;
    const nl = 1 + Math.floor(hits / 6);
    if (nl > level) { level = nl; sfx.level(); } else if (perfect) sfx.bonus(); else sfx.good();
    say(perfect ? 'PERFECT' : 'HIT', perfect ? C.yl : C.gr); buzz(perfect ? 25 : 12);
    relocate(false);
  }

  function update(dt) {
    const ds = dt / 1000;
    gameTime += dt;
    if (lockLeft > 0) lockLeft -= dt;
    if (startHold > 0) { startHold -= dt; return; } // short pause before the first orbit
    ang = norm(ang + dir * speed() * ds);
    if (mode === 'DRIFT') zc = norm(zc - dir * 26 * DEG * ds);
    trail.push(ang); if (trail.length > 9) trail.shift();
    // The marker ran through the zone without a press.
    const r = rel();
    if (r > halfZone() && r < 150 * DEG) { fail('MISSED'); if (sh.state !== 'play') return; }

    scrLeft -= dt;
    if (scrLeft <= WARN_MS && scrLeft > 0) {
      const sec = Math.ceil(scrLeft / 1000);
      if (sec !== lastWarnSec) { lastWarnSec = sec; sfx.warn(); buzz(15); }
    }
    if (scrLeft <= 0) disrupt();
  }

  function render(now, dt) {
    if (flashLeft > 0) flashLeft -= dt;
    if (labelLeft > 0) labelLeft -= dt;
    const u = side / 100;
    ctx.setTransform(dpr * u, 0, 0, dpr * u, 0, 0);
    ctx.clearRect(0, 0, 100, 100);
    const playing = sh.state === 'play';
    const hz = halfZone();

    // Track
    ctx.lineCap = 'butt';
    ctx.strokeStyle = 'rgba(120,90,255,.28)'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(50, 50, R, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,240,255,.18)'; ctx.lineWidth = 0.3;
    for (let i = 0; i < 24; i++) {
      const a = i * Math.PI / 12;
      ctx.beginPath(); ctx.moveTo(50 + Math.cos(a) * (R - 5), 50 + Math.sin(a) * (R - 5)); ctx.lineTo(50 + Math.cos(a) * (R - 3.4), 50 + Math.sin(a) * (R - 3.4)); ctx.stroke();
    }
    // Centre flash
    if (flashLeft > 0 && !reducedMotion) {
      ctx.globalAlpha = clamp(flashLeft / 260, 0, 1) * 0.35;
      ctx.fillStyle = flashColor;
      ctx.beginPath(); ctx.arc(50, 50, R - 6, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (playing) {
      // Zone
      ctx.save();
      ctx.shadowColor = C.cy; ctx.shadowBlur = 4 * dpr * u;
      ctx.strokeStyle = C.cy; ctx.lineWidth = 6.4;
      ctx.beginPath(); ctx.arc(50, 50, R, zc - hz, zc + hz); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 6.4;
      ctx.beginPath(); ctx.arc(50, 50, R, zc - hz * 0.35, zc + hz * 0.35); ctx.stroke();
      ctx.restore();

      // Marker (hidden near the zone during a blackout)
      const dark = mode === 'BLACKOUT' && rel() > -78 * DEG && rel() < 150 * DEG;
      if (!dark) {
        for (let i = 0; i < trail.length; i++) {
          ctx.globalAlpha = (i + 1) / trail.length * 0.4;
          ctx.fillStyle = C.mg;
          ctx.beginPath(); ctx.arc(50 + Math.cos(trail[i]) * R, 50 + Math.sin(trail[i]) * R, 2.2, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.save();
        ctx.shadowColor = C.mg; ctx.shadowBlur = 5 * dpr * u;
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(50 + Math.cos(ang) * R, 50 + Math.sin(ang) * R, 3.4, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        ctx.fillStyle = C.mg;
        ctx.beginPath(); ctx.arc(50 + Math.cos(ang) * R, 50 + Math.sin(ang) * R, 1.6, 0, Math.PI * 2); ctx.fill();
      }
    }
    // Centre read-out
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (labelLeft > 0) {
      ctx.globalAlpha = clamp(labelLeft / 300, 0, 1);
      ctx.fillStyle = flashColor;
      ctx.font = '800 9px ' + FONT;
      ctx.fillText(label, 50, 50);
      ctx.globalAlpha = 1;
    } else if (playing && streak >= 2) {
      ctx.fillStyle = 'rgba(223,230,255,.85)';
      ctx.font = '800 16px ' + FONT;
      ctx.fillText(String(streak), 50, 48);
      ctx.fillStyle = '#6b6f9c';
      ctx.font = '700 3.6px ' + FONT;
      ctx.fillText('STREAK', 50, 59);
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (!lastFrame) lastFrame = now;
    const dt = Math.min(100, now - lastFrame);
    lastFrame = now;
    const playing = sh.state === 'play';
    if (playing && !sh.paused) update(dt);
    render(now, sh.paused ? 0 : dt);
    hud({
      score, best: Math.max(sh.best, score), mult: mult(), level, lives,
      frac: sh.state === 'play' ? scrLeft / scrInterval : 1, warn: sh.state === 'play' && scrLeft <= WARN_MS,
      label: 'NEXT DISRUPTION', warnLabel: 'DISRUPTION INCOMING'
    });
  }

  /* ---------- input: one button ---------- */
  // Registered in the capture phase so that Space acts as the game button during a run
  // instead of reaching the shared pause handler (P and Escape still pause).
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    const isAction = k === ' ' || k === 'Enter' || k === 'ArrowUp' || k === 'ArrowDown' || k === 'ArrowLeft' || k === 'ArrowRight';
    if (!isAction || sh.state !== 'play' || sh.paused) return;
    e.preventDefault(); e.stopPropagation();
    if (!e.repeat) { GG.initAudio(); act(); }
  }, true);
  $('main').addEventListener('pointerdown', (e) => {
    if (e.target.closest && e.target.closest('#sys')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    GG.initAudio(); act();
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

  setMode('NOMINAL');
  fit();
  requestAnimationFrame(frame);
})();
