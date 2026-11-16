/* Shared helpers for CHROMA//LIE and VERTIGO//DRIFT: storage, sound, HUD, overlays and pause handling. */
window.GG = (() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const MAX_LIVES = 3;
  const WARN_MS = 3000;

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
  };
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // Optional test parameter: ?scramble=<seconds> fixes the scramble interval.
  const debugScramble = (() => {
    const m = /[?&]scramble=(\d+(?:\.\d+)?)/.exec(location.search);
    return m ? Math.max(4, parseFloat(m[1])) * 1000 : 0;
  })();
  const scrambleInterval = (a, b) => debugScramble || rand(a, b);

  /* ---------- audio ---------- */
  let actx = null;
  let muted = store.get('glitchgrid.mute') === '1';
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
    good() { tone(880, 0.08, 'square', 0.06, 1320); },
    bonus() { tone(660, 0.1, 'triangle', 0.1); tone(990, 0.14, 'triangle', 0.1, 0, 0.08); },
    stab() { tone(440, 0.25, 'sine', 0.12, 880); },
    bad() { tone(220, 0.35, 'sawtooth', 0.14, 40); },
    over() { tone(330, 0.3, 'sawtooth', 0.12, 110); tone(165, 0.7, 'sawtooth', 0.12, 40, 0.28); },
    warn() { tone(1400, 0.07, 'square', 0.05); },
    scramble() { for (let i = 0; i < 6; i++) tone(200 + Math.random() * 1600, 0.06, 'sawtooth', 0.07, 0, i * 0.05); },
    level() { tone(520, 0.08, 'square', 0.05); tone(780, 0.12, 'square', 0.05, 0, 0.08); }
  };
  function buzz(pattern) {
    if (muted) return;
    try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* ignore */ }
  }

  function arrowSvg(d) {
    return '<svg viewBox="0 0 24 24" style="transform:rotate(' + (d * 90) + 'deg)" aria-hidden="true"><path d="M12 3 22 20H2Z"/></svg>';
  }
  function banner(text, sub) {
    const b = $('banner');
    b.textContent = text;
    if (sub) { const s = document.createElement('small'); s.textContent = sub; b.appendChild(s); }
    b.classList.remove('show');
    void b.offsetWidth; // restart the animation
    b.classList.add('show');
  }
  function fmtTime(ms) {
    const s = Math.floor(ms / 1000);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  /* ---------- HUD ---------- */
  const cache = {};
  function setText(id, v) { if (cache[id] !== v) { cache[id] = v; $(id).textContent = v; } }
  function hud(v) {
    setText('score', String(v.score));
    setText('best', String(v.best));
    setText('mult', 'x' + v.mult);
    setText('level', String(v.level));
    if (cache.lives !== v.lives) {
      cache.lives = v.lives;
      const pips = $('lives').children;
      for (let i = 0; i < pips.length; i++) pips[i].classList.toggle('off', i >= v.lives);
    }
    $('scrambleBar').style.transform = 'scaleX(' + clamp(v.frac, 0, 1).toFixed(3) + ')';
    if (cache.warn !== v.warn) {
      cache.warn = v.warn;
      $('scrambleBox').classList.toggle('warn', v.warn);
      $('stage').classList.toggle('warn', v.warn);
      $('scrambleLbl').textContent = v.warn ? v.warnLabel : v.label;
    }
  }

  /* ---------- shell: overlays, pause, results, system keys ---------- */
  function shell(opt) {
    const sh = { state: 'title', paused: false, overReady: false, best: parseInt(store.get(opt.bestKey), 10) || 0 };
    const ov = { title: $('ovTitle'), pause: $('ovPause'), over: $('ovOver') };
    const btnMute = $('btnMute'), btnPause = $('btnPause');

    sh.show = (which) => {
      // Drop focus from buttons that are about to be hidden so keys reach the game.
      const a = document.activeElement;
      if (a && a.blur && a !== document.body) a.blur();
      Object.keys(ov).forEach((k) => ov[k].classList.toggle('show', k === which));
    };
    sh.start = () => {
      initAudio();
      sh.state = 'play'; sh.paused = false; sh.overReady = false;
      sh.show(null);
      opt.start();
    };
    sh.setPaused = (p) => {
      if (sh.state !== 'play' || sh.paused === p) return;
      sh.paused = p;
      sh.show(p ? 'pause' : null);
      if (opt.onPause) opt.onPause(p);
      if (!p) initAudio();
    };
    sh.toTitle = () => {
      sh.state = 'title'; sh.paused = false;
      sh.show('title');
      if (opt.onTitle) opt.onTitle();
    };
    sh.gameOver = (score, rows) => {
      sh.state = 'over'; sh.overReady = false;
      const isBest = score > sh.best;
      if (isBest) { sh.best = score; store.set(opt.bestKey, String(score)); }
      const dl = $('results');
      dl.textContent = '';
      [['SCORE', score], ['BEST', sh.best]].concat(rows).forEach((r) => {
        const dt = document.createElement('dt'); dt.textContent = r[0];
        const dd = document.createElement('dd'); dd.textContent = r[1];
        dl.appendChild(dt); dl.appendChild(dd);
      });
      $('newBest').classList.toggle('show', isBest && score > 0);
      sfx.over(); buzz([80, 60, 200]);
      setTimeout(() => { if (sh.state === 'over') { sh.overReady = true; sh.show('over'); } }, 900);
    };

    function toggleMute() {
      muted = !muted;
      store.set('glitchgrid.mute', muted ? '1' : '0');
      btnMute.classList.toggle('off', muted);
      if (!muted) { initAudio(); tone(880, 0.06, 'square', 0.05); }
    }
    btnMute.classList.toggle('off', muted);
    $('btnStart').addEventListener('click', sh.start);
    $('btnAgain').addEventListener('click', sh.start);
    $('btnMenu').addEventListener('click', sh.toTitle);
    $('btnQuit').addEventListener('click', sh.toTitle);
    $('btnResume').addEventListener('click', () => sh.setPaused(false));
    btnPause.addEventListener('click', () => { btnPause.blur(); sh.setPaused(!sh.paused); });
    btnMute.addEventListener('click', () => { btnMute.blur(); toggleMute(); });

    window.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key;
      const onButton = document.activeElement && document.activeElement.tagName === 'BUTTON';
      const canStart = sh.state === 'title' || (sh.state === 'over' && sh.overReady);
      if (k === ' ' || k === 'p' || k === 'P' || k === 'Escape') {
        if (k === ' ' && onButton) return; // let the focused button handle it
        e.preventDefault();
        if (e.repeat) return;
        if (sh.state === 'play') sh.setPaused(!sh.paused);
        else if (k === ' ' && canStart) sh.start();
      } else if (k === 'Enter') {
        if (onButton) return;
        if (canStart) { e.preventDefault(); sh.start(); }
        else if (sh.paused) { e.preventDefault(); sh.setPaused(false); }
      } else if (k === 'm' || k === 'M') toggleMute();
    });

    document.addEventListener('visibilitychange', () => { if (document.hidden) sh.setPaused(true); });
    window.addEventListener('blur', () => sh.setPaused(true));
    window.addEventListener('pagehide', () => sh.setPaused(true));

    // Stop page scrolling / zoom gestures (overlays keep their own vertical scroll).
    document.addEventListener('touchmove', (e) => {
      if (!(e.target.closest && e.target.closest('.overlay'))) e.preventDefault();
    }, { passive: false });
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('contextmenu', (e) => { if (e.target.closest && e.target.closest('#main')) e.preventDefault(); });

    // Touch layout
    const markTouch = () => {
      if (document.body.classList.contains('touch')) return;
      document.body.classList.add('touch');
      if (opt.onLayout) opt.onLayout();
    };
    if ((window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window || navigator.maxTouchPoints > 0) {
      document.body.classList.add('touch');
    }
    window.addEventListener('touchstart', markTouch, { passive: true });
    return sh;
  }

  return { $, store, rand, randInt, clamp, reducedMotion, scrambleInterval, initAudio, tone, sfx, buzz, arrowSvg, banner, fmtTime, hud, shell, MAX_LIVES, WARN_MS };
})();
