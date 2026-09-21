/* Apogee — a little rocket that climbs as much as possible.
   Fully static: no server, no build, no external assets.
   Uses the Atlas Random v2 bridge (globalThis.atlasJeu) when, and only when,
   the capabilities are actually granted. Falls back to localStorage. */
(() => {
  'use strict';

  /* ---------- tiny helpers ---------- */
  const $ = (sel) => document.querySelector(sel);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const fmt = (n) => Math.round(n).toLocaleString('en-US');
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function hexRgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex);
    const v = parseInt(m ? m[1] : '000000', 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }
  function mixHex(a, b, t) {
    const ca = hexRgb(a), cb = hexRgb(b);
    return `rgb(${Math.round(lerp(ca[0], cb[0], t))},${Math.round(lerp(ca[1], cb[1], t))},${Math.round(lerp(ca[2], cb[2], t))})`;
  }

  /* ---------- Atlas Random v2 bridge ---------- */
  const SAVE_KEY = 'apogee-v1';
  const atlas = globalThis.atlasJeu;
  const granted = atlas && atlas.capacites ? atlas.capacites : {};

  const storage = {
    load() {
      let local = {};
      try { local = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}'); } catch (_) { local = {}; }
      let remote = {};
      if (granted.progression && atlas && typeof atlas.charger === 'function') {
        try { remote = atlas.charger() || {}; } catch (_) { remote = {}; }
      }
      return remote && Object.keys(remote).length ? remote : local;
    },
    save(data) {
      try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch (_) { /* opaque storage may be unavailable outside Atlas */ }
      if (granted.progression && atlas && typeof atlas.sauver === 'function') {
        try { atlas.sauver(data); } catch (_) { /* continue with local memory */ }
      }
    }
  };

  function pilotName() {
    return granted.identite && atlas && atlas.identite && atlas.identite.pseudo ? String(atlas.identite.pseudo) : 'Cadet';
  }

  const profile = { best: 0, flights: 0, stars: 0, meters: 0, muted: false };
  try { Object.assign(profile, storage.load() || {}); } catch (_) { /* a corrupt save should never ground the rocket */ }
  profile.best = Number(profile.best) || 0;
  profile.flights = Number(profile.flights) || 0;
  profile.stars = Number(profile.stars) || 0;
  profile.meters = Number(profile.meters) || 0;
  profile.muted = !!profile.muted;
  const persist = () => storage.save(profile);

  /* ---------- audio (WebAudio, no assets) ---------- */
  const audio = {
    ctx: null, master: null, engineOsc: null, engineGain: null, windGain: null,
    muted: profile.muted,
    ensure() {
      if (this.muted) return false;
      try {
        if (!this.ctx) {
          const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
          if (!AC) return false;
          this.ctx = new AC();
          this.master = this.ctx.createGain();
          this.master.gain.value = 0.5;
          this.master.connect(this.ctx.destination);
        }
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return true;
      } catch (_) { return false; }
    },
    engineStart() {
      if (!this.ensure() || this.engineOsc) return;
      try {
        const ctx = this.ctx;
        this.engineOsc = ctx.createOscillator();
        this.engineOsc.type = 'sawtooth';
        this.engineOsc.frequency.value = 48;
        this.engineGain = ctx.createGain();
        this.engineGain.gain.value = 0.0001;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 320;
        this.engineOsc.connect(this.engineGain); this.engineGain.connect(lp); lp.connect(this.master);
        this.engineOsc.start();
        const len = ctx.sampleRate;
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        const noise = ctx.createBufferSource();
        noise.buffer = buf; noise.loop = true;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 0.6;
        this.windGain = ctx.createGain();
        this.windGain.gain.value = 0.0001;
        noise.connect(bp); bp.connect(this.windGain); this.windGain.connect(this.master);
        noise.start();
        this._noise = noise;
        this.engineGain.gain.setTargetAtTime(0.12, ctx.currentTime, 0.3);
        this.windGain.gain.setTargetAtTime(0.035, ctx.currentTime, 0.5);
      } catch (_) { /* silence is also space-worthy */ }
    },
    engineStop() {
      if (!this.ctx || !this.engineOsc) return;
      try {
        const t = this.ctx.currentTime;
        this.engineGain.gain.setTargetAtTime(0.0001, t, 0.12);
        this.windGain.gain.setTargetAtTime(0.0001, t, 0.12);
        const osc = this.engineOsc, noise = this._noise;
        setTimeout(() => { try { osc.stop(); noise.stop(); } catch (_) {} }, 420);
      } catch (_) {}
      this.engineOsc = null; this.engineGain = null; this.windGain = null; this._noise = null;
    },
    setThrottle(k, speedRatio) {
      if (!this.ctx || !this.engineOsc || this.muted) return;
      try {
        this.engineOsc.frequency.setTargetAtTime(46 + k * 44, this.ctx.currentTime, 0.08);
        this.engineGain.gain.setTargetAtTime(0.1 + k * 0.12, this.ctx.currentTime, 0.1);
        this.windGain.gain.setTargetAtTime(0.02 + speedRatio * 0.06, this.ctx.currentTime, 0.2);
      } catch (_) {}
    },
    tone(f0, f1, dur, type, vol) {
      if (!this.ensure()) return;
      try {
        const ctx = this.ctx, osc = ctx.createOscillator(), g = ctx.createGain();
        osc.type = type || 'sine';
        osc.frequency.setValueAtTime(f0, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(Math.max(30, f1), ctx.currentTime + dur);
        g.gain.setValueAtTime(vol || 0.2, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
        osc.connect(g); g.connect(this.master);
        osc.start(); osc.stop(ctx.currentTime + dur + 0.02);
      } catch (_) {}
    },
    pickup() { this.tone(620, 990, 0.12, 'triangle', 0.22); },
    star() { this.tone(880, 1420, 0.16, 'sine', 0.18); },
    damage() { this.tone(170, 55, 0.28, 'square', 0.26); },
    tick() { this.tone(440, 440, 0.07, 'sine', 0.14); },
    go() { this.tone(520, 1040, 0.3, 'triangle', 0.22); },
    record() { this.tone(660, 1320, 0.22, 'sine', 0.2); setTimeout(() => this.tone(880, 1760, 0.3, 'sine', 0.18), 130); },
    gameover() { this.tone(320, 70, 0.7, 'sawtooth', 0.2); },
    layer() { this.tone(520, 780, 0.14, 'sine', 0.13); setTimeout(() => this.tone(650, 975, 0.16, 'sine', 0.11), 110); }
  };

  /* ---------- world definition ---------- */
  const PX = 2; // pixels per meter
  const ROCKET_R = 15;
  const LAYERS = [
    { from: 0, name: 'LOW SKY', toast: 'Backyard altitude. Birds own this sky.' },
    { from: 1500, name: 'AIR CORRIDOR', toast: 'Mind the traffic. The planes are not watching for you.' },
    { from: 5500, name: 'HIGH FRONTIER', toast: 'Meteor country. Keep the nose up.' },
    { from: 12000, name: 'DEEP ORBIT', toast: 'You are the satellite now.' }
  ];
  const SKY_STOPS = [
    [0, '#223a63', '#d9b186'],
    [900, '#1b3059', '#9cc3e8'],
    [1500, '#16264f', '#6ba7dd'],
    [3500, '#0e1b40', '#3f66a8'],
    [5500, '#0a1434', '#2c4a86'],
    [9000, '#050b22', '#17294f'],
    [12000, '#030614', '#0b1630'],
    [22000, '#010208', '#050a18']
  ];
  const SPAWN_TABLES = [
    [['bird', 0.44], ['storm', 0.10], ['fuel', 0.18], ['star', 0.28]],
    [['plane', 0.32], ['storm', 0.14], ['bird', 0.12], ['fuel', 0.16], ['star', 0.26]],
    [['meteor', 0.36], ['storm', 0.15], ['plane', 0.05], ['fuel', 0.16], ['star', 0.28]],
    [['asteroid', 0.32], ['meteor', 0.15], ['satellite', 0.13], ['fuel', 0.13], ['star', 0.27]]
  ];
  const PICKUPS = new Set(['fuel', 'star']);

  function layerIndexFor(alt) {
    let idx = 0;
    for (let i = 0; i < LAYERS.length; i++) if (alt >= LAYERS[i].from) idx = i;
    return idx;
  }
  function skyColors(alt) {
    let i = 0;
    while (i < SKY_STOPS.length - 2 && alt >= SKY_STOPS[i + 1][0]) i++;
    const a = SKY_STOPS[i], b = SKY_STOPS[i + 1];
    const t = clamp((alt - a[0]) / (b[0] - a[0]), 0, 1);
    return [mixHex(a[1], b[1], t), mixHex(a[2], b[2], t)];
  }

  /* ---------- game state ---------- */
  const canvas = $('#sky');
  const ctx = canvas.getContext('2d');
  let W = 800, H = 560, DPR = 1;

  const state = {
    mode: 'home', // home | countdown | flying | paused | dying
    altitude: 0,
    maxAlt: 0,
    prevBest: profile.best,
    vy: 0,
    fuel: 100,
    hull: 3,
    runStars: 0,
    rocket: { x: 0.5, vx: 0, tilt: 0 },
    entities: [],
    particles: [],
    decor: [],
    spawnT: 0.8,
    decorT: 0,
    invulnUntil: 0,
    shake: 0,
    time: 0,
    runTime: 0,
    layerIdx: 0,
    dyingT: 0,
    dyingReason: null,
    recordToastShown: false,
    lowFuelToastShown: false,
    boostOn: false,
    result: null
  };

  const input = { left: false, right: false, boost: false, pointer: false, pointerX: 0 };

  /* ---------- canvas sizing ---------- */
  function resize() {
    const rect = canvas.getBoundingClientRect();
    DPR = clamp(globalThis.devicePixelRatio || 1, 1, 2.5);
    W = Math.max(320, Math.round(rect.width));
    H = Math.max(380, Math.round(rect.height));
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  if (typeof ResizeObserver === 'function') new ResizeObserver(resize).observe(canvas);
  globalThis.addEventListener('resize', resize);
  resize();

  const rocketScreen = () => ({ x: state.rocket.x * W, y: H * 0.62 });

  /* ---------- stars background ---------- */
  const starsField = [];
  for (let i = 0; i < 130; i++) starsField.push({ x: Math.random(), y: Math.random(), depth: rand(0.25, 1), size: rand(0.6, 1.9), tw: rand(0, Math.PI * 2) });

  /* ---------- entities ---------- */
  function pickFromTable(table) {
    let total = 0;
    for (const [, w] of table) total += w;
    let roll = Math.random() * total;
    for (const [type, w] of table) { roll -= w; if (roll <= 0) return type; }
    return table[table.length - 1][0];
  }

  function spawnX(safe) {
    let x = rand(40, W - 40);
    if (!safe) return x;
    const rx = state.rocket.x * W;
    for (let i = 0; i < 6 && Math.abs(x - rx) < 95; i++) x = rand(40, W - 40);
    return x;
  }

  function spawnEntity() {
    const table = SPAWN_TABLES[state.layerIdx];
    const type = pickFromTable(table);
    const alt = state.altitude;
    switch (type) {
      case 'bird':
        state.entities.push({ type, x: spawnX(false), y: -50, vx: (Math.random() < 0.5 ? -1 : 1) * rand(28, 72), vy: rand(4, 16), r: 12, phase: rand(0, 6) });
        break;
      case 'plane': {
        const fromLeft = Math.random() < 0.5;
        state.entities.push({ type, x: fromLeft ? -120 : W + 120, y: rand(-H * 0.45, -70), vx: (fromLeft ? 1 : -1) * rand(150, Math.min(330, 190 + alt / 70)), vy: 0, r: 17, blink: 0, dir: fromLeft ? 1 : -1 });
        break;
      }
      case 'storm':
        state.entities.push({ type, x: spawnX(true), y: -80, vx: rand(-12, 12), vy: rand(2, 10), r: rand(24, 34), bolt: rand(0, 3) });
        break;
      case 'meteor':
        state.entities.push({ type, x: spawnX(true), y: -60, vx: rand(-70, 70), vy: rand(150, 225), r: rand(10, 15), seed: rand(0, 9) });
        break;
      case 'asteroid': {
        const pts = [];
        const n = 8;
        for (let i = 0; i < n; i++) pts.push(rand(0.68, 1.15));
        state.entities.push({ type, x: spawnX(true), y: -90, vx: rand(-16, 16), vy: rand(12, 34), r: rand(19, 33), rot: rand(0, 6), spin: rand(-0.9, 0.9), pts });
        break;
      }
      case 'satellite':
        state.entities.push({ type, x: spawnX(true), y: -80, vx: 0, vy: rand(28, 52), r: 16, phase: rand(0, 6), blink: 0 });
        break;
      case 'fuel':
        state.entities.push({ type, x: spawnX(true), y: -50, vx: rand(-8, 8), vy: rand(-4, 8), r: 13, phase: rand(0, 6) });
        break;
      case 'star':
        state.entities.push({ type, x: spawnX(true), y: -50, vx: rand(-6, 6), vy: 0, r: 10, phase: rand(0, 6) });
        break;
    }
  }

  function spawnDecor() {
    const alt = state.altitude;
    if (alt < 8200 && state.decor.length < 26) {
      state.decor.push({ kind: 'cloud', x: rand(-60, W + 60), y: -70, s: rand(22, 58), drift: rand(-8, 8), lag: rand(0.82, 0.97), alpha: rand(0.35, 0.8) });
    } else if (alt >= 10000 && Math.random() < 0.16) {
      state.decor.push({ kind: 'shooting', x: rand(0, W), y: rand(-100, -40), vx: rand(260, 460) * (Math.random() < 0.5 ? -1 : 1), vy: rand(140, 220), life: 0.9 });
    }
  }

  function burst(x, y, color, count, speed) {
    if (REDUCED) count = Math.ceil(count / 3);
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2), v = rand(0.25, 1) * (speed || 160);
      state.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.3, 0.75), age: 0, color, size: rand(1.5, 3.6) });
    }
  }

  /* ---------- run control ---------- */
  function resetRun() {
    state.altitude = 0;
    state.maxAlt = 0;
    state.prevBest = profile.best;
    state.vy = 0;
    state.fuel = 100;
    state.hull = 3;
    state.runStars = 0;
    state.entities = [];
    state.particles = [];
    state.decor = [];
    state.spawnT = 0.9;
    state.decorT = 0;
    state.invulnUntil = 0;
    state.shake = 0;
    state.runTime = 0;
    state.layerIdx = 0;
    state.dyingT = 0;
    state.dyingReason = null;
    state.recordToastShown = false;
    state.lowFuelToastShown = false;
    state.boostOn = false;
    state.rocket.x = 0.5;
    state.rocket.vx = 0;
    state.rocket.tilt = 0;
    state.result = null;
  }

  function startCountdown() {
    resetRun();
    audio.ensure();
    $('#homeScreen').hidden = true;
    $('#hud').hidden = false;
    state.mode = 'countdown';
    const label = $('#countdownLabel');
    const wrap = $('#countdown');
    wrap.hidden = false;
    const steps = ['3', '2', '1', 'IGNITION'];
    let i = 0;
    const step = () => {
      if (state.mode !== 'countdown') return;
      if (i >= steps.length) {
        wrap.hidden = true;
        state.mode = 'flying';
        audio.go();
        audio.engineStart();
        return;
      }
      label.textContent = steps[i];
      label.style.animation = 'none';
      void label.offsetWidth;
      label.style.animation = '';
      if (i === steps.length - 1) audio.go(); else audio.tick();
      i++;
      setTimeout(step, i === steps.length ? 520 : 480);
    };
    step();
  }

  function startDying(reason) {
    if (state.mode !== 'flying') return;
    state.mode = 'dying';
    state.dyingReason = reason;
    state.dyingT = 0;
    state.boostOn = false;
    audio.engineStop();
    audio.gameover();
    const r = rocketScreen();
    burst(r.x, r.y, '#ffc46b', 34, 260);
    burst(r.x, r.y, '#ff7a45', 22, 190);
    state.shake = REDUCED ? 0 : 20;
  }

  async function endRun() {
    if (state.mode !== 'dying') return; // re-entry guard: the run is reported exactly once
    state.mode = 'report'; // leave the dying loop before any awaited register call
    const altitude = Math.floor(state.maxAlt);
    const layer = LAYERS[layerIndexFor(state.maxAlt)];
    const isRecord = altitude > profile.best;
    profile.best = Math.max(profile.best, altitude);
    profile.flights += 1;
    profile.stars += state.runStars;
    profile.meters += altitude;
    persist();
    updateHome();

    const submitted = granted.classement && atlas && typeof atlas.soumettreScore === 'function';
    let submitNote = 'Saved locally on this device.';
    if (submitted) {
      try {
        await atlas.soumettreScore(altitude, `${layer.name} · ${pilotName()}`);
        submitNote = 'Logged in the Atlas register of highest climbs.';
      } catch (_) {
        submitNote = 'The register is unreachable — your climb is saved locally.';
      }
    }

    const reasonCopy = state.dyingReason === 'fuel'
      ? 'The tanks coughed dry at altitude and gravity filed the paperwork. Fuel cells are not optional decor.'
      : 'Three hull plates gone. The sky keeps what it breaks — fly around the dark bits next time.';

    state.result = { altitude, isRecord };
    $('#hud').hidden = true;

    openModal({
      eyebrow: 'FLIGHT REPORT',
      title: isRecord ? 'A new personal apogee' : 'Flight complete',
      force: true,
      body: `
        <p class="modal-copy">${reasonCopy}</p>
        <div class="final-score">${fmt(altitude)}<small>m</small></div>
        ${isRecord ? '<span class="record-pill">NEW ALTITUDE RECORD</span>' : ''}
        <div class="report-grid">
          <div class="report-card"><b>LAYER REACHED</b><span>${layer.name}</span></div>
          <div class="report-card"><b>STARS CAUGHT</b><span>${state.runStars}</span></div>
          <div class="report-card"><b>FLIGHT TIME</b><span>${Math.round(state.runTime)} s</span></div>
        </div>
        <p class="modal-copy">${submitNote}</p>`,
      actions: [
        { label: 'Fly again', primary: true, handler: () => { closeModal(); startCountdown(); } },
        ...(granted.classement ? [{ label: 'Highest climbs', handler: () => showLeaderboard() }] : []),
        { label: 'Back to pad', handler: () => { closeModal(); resetToHome(); } }
      ]
    });
  }

  function resetToHome() {
    state.mode = 'home';
    resetRun();
    $('#hud').hidden = true;
    $('#homeScreen').hidden = false;
    updateHome();
  }

  function togglePause(force) {
    if (state.mode === 'flying' && force !== false) {
      state.mode = 'paused';
      $('#pauseBanner').hidden = false;
      audio.engineStop();
    } else if (state.mode === 'paused' && force !== true) {
      state.mode = 'flying';
      $('#pauseBanner').hidden = true;
      audio.engineStart();
    }
  }

  /* ---------- simulation ---------- */
  function update(dt) {
    state.time += dt;

    if (state.mode === 'flying' || state.mode === 'dying') {
      updateDecor(dt);
      updateEntities(dt);
      updateParticles(dt);
      if (state.mode === 'dying') {
        state.dyingT += dt;
        state.vy = lerp(state.vy, -150, dt * 2.4);
        state.altitude = Math.max(0, state.altitude + state.vy * dt);
        state.rocket.tilt += dt * 5.2;
        if (state.dyingT > 1.15) endRun();
        state.shake = Math.max(0, state.shake - dt * 26);
        return;
      }
    } else {
      updateDecor(dt * 0.6);
      updateParticles(dt);
      return;
    }

    // --- controls ---
    const rk = state.rocket;
    if (input.pointer) {
      const target = clamp(input.pointerX / W, 0.03, 0.97);
      rk.x = lerp(rk.x, target, clamp(dt * 9, 0, 1));
      rk.vx = lerp(rk.vx, (target - rk.x) * W * 3, clamp(dt * 8, 0, 1));
    } else {
      const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      rk.vx += dir * 2600 * dt;
      rk.vx *= Math.exp(-6.2 * dt);
      rk.vx = clamp(rk.vx, -520, 520);
      rk.x += (rk.vx * dt) / W;
    }
    if (rk.x < 0.03) { rk.x = 0.03; rk.vx = Math.abs(rk.vx) * 0.35; }
    if (rk.x > 0.97) { rk.x = 0.97; rk.vx = -Math.abs(rk.vx) * 0.35; }
    rk.tilt = lerp(rk.tilt, clamp(rk.vx * 0.0011, -0.5, 0.5), clamp(dt * 10, 0, 1));

    // --- climb ---
    state.boostOn = (input.boost || (input.pointer && input.boost)) && state.fuel > 0;
    const cruise = 98 + Math.min(64, state.altitude * 0.0042);
    const targetVy = cruise * (state.boostOn ? 1.62 : 1);
    state.vy = lerp(state.vy, targetVy, clamp(dt * 1.8, 0, 1));
    state.altitude += state.vy * dt;
    state.maxAlt = Math.max(state.maxAlt, state.altitude);
    state.runTime += dt;

    // --- fuel ---
    state.fuel = Math.max(0, state.fuel - (state.boostOn ? 3.5 : 1.8) * dt);
    if (state.fuel <= 25 && !state.lowFuelToastShown) {
      state.lowFuelToastShown = true;
      toast('Fuel reserves low', 'find a fuel cell');
    }
    if (state.fuel <= 0) { startDying('fuel'); return; }

    // --- layers ---
    const li = layerIndexFor(state.altitude);
    if (li !== state.layerIdx) {
      state.layerIdx = li;
      toast(LAYERS[li].name, LAYERS[li].toast);
      audio.layer();
    }

    // --- record moment ---
    if (!state.recordToastShown && state.prevBest > 0 && state.maxAlt > state.prevBest) {
      state.recordToastShown = true;
      toast('New altitude record', `${fmt(state.maxAlt)} m and climbing`);
      audio.record();
    }

    // --- spawning ---
    state.spawnT -= dt;
    if (state.spawnT <= 0) {
      spawnEntity();
      const base = lerp(1.05, 0.58, clamp(state.altitude / 15000, 0, 1));
      state.spawnT = base * rand(0.72, 1.28);
    }
    state.decorT -= dt;
    if (state.decorT <= 0) {
      spawnDecor();
      state.decorT = state.layerIdx >= 3 ? 0.55 : 0.34;
    }

    // --- collisions ---
    const r = rocketScreen();
    const now = state.time;
    for (let i = state.entities.length - 1; i >= 0; i--) {
      const e = state.entities[i];
      const dx = e.x - r.x, dy = e.y - r.y;
      const hitR = e.r + ROCKET_R - 2;
      if (dx * dx + dy * dy > hitR * hitR) continue;
      state.entities.splice(i, 1);
      if (PICKUPS.has(e.type)) {
        if (e.type === 'fuel') {
          state.fuel = Math.min(100, state.fuel + 30);
          burst(e.x, e.y, '#ffc46b', 14, 130);
          toast('Fuel cell secured', '+30%');
          audio.pickup();
        } else {
          state.runStars += 1;
          state.fuel = Math.min(100, state.fuel + 3);
          burst(e.x, e.y, '#ffd76b', 12, 120);
          audio.star();
        }
        continue;
      }
      if (now < state.invulnUntil) continue;
      state.hull -= 1;
      state.invulnUntil = now + 1.4;
      state.shake = REDUCED ? 0 : 15;
      burst(r.x, r.y, '#ff6f6f', 20, 210);
      audio.damage();
      updateHullPips();
      if (state.hull <= 0) { startDying('hull'); return; }
      toast('Hull breach', `${state.hull} plate${state.hull === 1 ? '' : 's'} left`);
    }

    // --- exhaust particles ---
    if (!REDUCED && Math.random() < dt * (state.boostOn ? 90 : 46)) {
      state.particles.push({
        x: r.x + rand(-4, 4) - Math.sin(rk.tilt) * 18,
        y: r.y + 24,
        vx: rand(-18, 18) - rk.vx * 0.12,
        vy: rand(60, 130) + state.vy * 0.35,
        life: rand(0.28, 0.6), age: 0,
        color: Math.random() < 0.5 ? '#ff7a45' : '#ffc46b',
        size: rand(1.6, 3.4)
      });
    }

    state.shake = Math.max(0, state.shake - dt * 24);
    audio.setThrottle(state.boostOn ? 1 : 0.45, clamp(state.vy / 260, 0, 1));
    updateHud();
  }

  function updateEntities(dt) {
    const scroll = state.vy * PX;
    for (let i = state.entities.length - 1; i >= 0; i--) {
      const e = state.entities[i];
      e.y += (scroll + e.vy) * dt;
      e.x += e.vx * dt;
      if (e.type === 'bird') e.phase += dt * 9;
      if (e.type === 'asteroid') e.rot += e.spin * dt;
      if (e.type === 'satellite') { e.phase += dt * 2; e.x += Math.sin(e.phase) * 14 * dt; e.blink += dt; }
      if (e.type === 'plane') { e.blink += dt; }
      if (e.type === 'fuel' || e.type === 'star') e.phase += dt * 3;
      if (e.type === 'storm') e.bolt -= dt;
      if (e.type === 'storm' && e.bolt < -rand(1.5, 4)) e.bolt = rand(0, 0.18);
      if (e.y > H + 140 || e.x < -260 || e.x > W + 260) state.entities.splice(i, 1);
    }
  }

  function updateDecor(dt) {
    const scroll = state.mode === 'flying' || state.mode === 'dying' ? state.vy * PX : 30;
    for (let i = state.decor.length - 1; i >= 0; i--) {
      const d = state.decor[i];
      if (d.kind === 'cloud') {
        d.y += scroll * d.lag * dt;
        d.x += d.drift * dt;
      } else {
        d.y += (scroll * 0.4 + d.vy) * dt;
        d.x += d.vx * dt;
        d.life -= dt;
      }
      if (d.y > H + 120 || d.x < -180 || d.x > W + 180 || d.life < 0) state.decor.splice(i, 1);
    }
  }

  function updateParticles(dt) {
    const scroll = state.mode === 'flying' || state.mode === 'dying' ? state.vy * PX * 0.5 : 0;
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      p.age += dt;
      p.x += p.vx * dt;
      p.y += (p.vy + scroll * 0.4) * dt;
      if (p.age >= p.life) state.particles.splice(i, 1);
    }
  }

  /* ---------- rendering ---------- */
  function render() {
    const alt = state.altitude;
    const [top, bottom] = skyColors(alt);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    if (state.shake > 0.5) ctx.translate(rand(-state.shake, state.shake) * 0.4, rand(-state.shake, state.shake) * 0.4);

    drawStarsField(alt);
    drawMoon(alt);
    drawDecor();
    drawGround(alt);
    drawBestMarker(alt);
    drawEntities();
    drawParticles();
    if (state.mode !== 'home') drawRocket();

    ctx.restore();
  }

  function drawStarsField(alt) {
    const alpha = clamp((alt - 700) / 2400, 0, 1) * 0.95 + 0.05;
    for (const s of starsField) {
      const y = (((s.y * H + alt * PX * s.depth * 0.32) % H) + H) % H;
      const tw = 0.55 + 0.45 * Math.sin(state.time * 2 + s.tw);
      ctx.globalAlpha = alpha * tw * (0.35 + s.depth * 0.65);
      ctx.fillStyle = '#dfe9ff';
      ctx.fillRect(s.x * W, y, s.size, s.size);
    }
    ctx.globalAlpha = 1;
  }

  function drawMoon(alt) {
    if (alt < 2600) return;
    const a = clamp((alt - 2600) / 1800, 0, 0.9);
    const mx = W * 0.82, my = H * 0.16;
    ctx.globalAlpha = a;
    ctx.fillStyle = '#e8edf7';
    ctx.beginPath(); ctx.arc(mx, my, 26, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(160,170,200,.5)';
    ctx.beginPath(); ctx.arc(mx - 8, my - 5, 6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(mx + 7, my + 8, 4, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawGround(alt) {
    if (alt > 260) return;
    const gy = H * 0.62 + 24 + alt * PX;
    if (gy > H + 60) return;
    ctx.fillStyle = '#1b2540';
    ctx.beginPath();
    ctx.moveTo(0, gy + 26);
    for (let x = 0; x <= W; x += 40) ctx.lineTo(x, gy + 14 - Math.sin(x * 0.011) * 10 - Math.sin(x * 0.004 + 2) * 8);
    ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
    // launch gantry
    ctx.fillStyle = '#33415f';
    ctx.fillRect(18, gy - 46, 10, 66);
    ctx.fillRect(10, gy - 46, 26, 4);
    ctx.fillStyle = '#ff7a45';
    ctx.fillRect(21, gy - 43, 4, 4);
  }

  function drawBestMarker(alt) {
    if (state.mode !== 'flying' && state.mode !== 'dying') return;
    if (state.prevBest <= 0) return;
    const my = H * 0.62 - (state.prevBest - alt) * PX;
    if (my < -30 || my > H + 30) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(125,211,252,.6)';
    ctx.setLineDash([7, 7]);
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(0, my); ctx.lineTo(W, my); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(125,211,252,.85)';
    ctx.font = '700 10px "Trebuchet MS", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`◤ PERSONAL BEST · ${fmt(state.prevBest)} m`, 10, my - 6);
    ctx.restore();
  }

  function drawDecor() {
    for (const d of state.decor) {
      if (d.kind === 'cloud') {
        ctx.globalAlpha = d.alpha * clamp((8200 - state.altitude) / 2600, 0, 1);
        ctx.fillStyle = '#e9effc';
        puffCloud(d.x, d.y, d.s);
        ctx.globalAlpha = 1;
      } else {
        ctx.globalAlpha = clamp(d.life * 2, 0, 1);
        ctx.strokeStyle = '#dfe9ff';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - d.vx * 0.14, d.y - d.vy * 0.14);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
  }

  function puffCloud(x, y, s) {
    ctx.beginPath();
    ctx.arc(x, y, s * 0.55, 0, Math.PI * 2);
    ctx.arc(x + s * 0.5, y + s * 0.1, s * 0.42, 0, Math.PI * 2);
    ctx.arc(x - s * 0.5, y + s * 0.12, s * 0.4, 0, Math.PI * 2);
    ctx.arc(x + s * 0.12, y - s * 0.22, s * 0.38, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawEntities() {
    for (const e of state.entities) {
      switch (e.type) {
        case 'bird': drawBird(e); break;
        case 'plane': drawPlane(e); break;
        case 'storm': drawStorm(e); break;
        case 'meteor': drawMeteor(e); break;
        case 'asteroid': drawAsteroid(e); break;
        case 'satellite': drawSatellite(e); break;
        case 'fuel': drawFuel(e); break;
        case 'star': drawStarPickup(e); break;
      }
    }
  }

  function drawBird(e) {
    const flap = Math.sin(e.phase) * 6;
    ctx.strokeStyle = '#22304e';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(e.x - 11, e.y - flap);
    ctx.quadraticCurveTo(e.x - 3, e.y + 4, e.x, e.y);
    ctx.quadraticCurveTo(e.x + 3, e.y + 4, e.x + 11, e.y - flap);
    ctx.stroke();
  }

  function drawPlane(e) {
    ctx.save();
    ctx.translate(e.x, e.y);
    if (e.dir < 0) ctx.scale(-1, 1);
    ctx.fillStyle = '#c7d4ec';
    ctx.beginPath();
    ctx.moveTo(20, 0); ctx.lineTo(8, -5); ctx.lineTo(-16, -5); ctx.lineTo(-22, -1); ctx.lineTo(-16, 3); ctx.lineTo(8, 3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#8fa3c8';
    ctx.fillRect(-4, -12, 5, 9);
    ctx.fillRect(-18, -10, 4, 8);
    ctx.fillStyle = '#3b4c74';
    ctx.fillRect(6, -4, 6, 3);
    const blinkOn = (e.blink % 1) < 0.5;
    ctx.fillStyle = blinkOn ? '#ff6f6f' : 'rgba(255,111,111,.25)';
    ctx.beginPath(); ctx.arc(-21, -1, 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawStorm(e) {
    ctx.fillStyle = '#2a3350';
    ctx.globalAlpha = 0.94;
    puffCloud(e.x, e.y, e.r);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(120,140,190,.5)';
    ctx.lineWidth = 1.2;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(e.x + i * e.r * 0.5, e.y + e.r * 0.5);
      ctx.lineTo(e.x + i * e.r * 0.5 - 2, e.y + e.r * 0.5 + 9);
      ctx.stroke();
    }
    if (e.bolt > 0) {
      ctx.strokeStyle = '#ffd76b';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(e.x + 3, e.y + e.r * 0.35);
      ctx.lineTo(e.x - 3, e.y + e.r * 0.75);
      ctx.lineTo(e.x + 2, e.y + e.r * 0.75);
      ctx.lineTo(e.x - 4, e.y + e.r * 1.15);
      ctx.stroke();
    }
  }

  function drawMeteor(e) {
    const gx = e.x - e.vx * 0.22, gy = e.y - e.vy * 0.22;
    const grad = ctx.createLinearGradient(e.x, e.y, gx, gy);
    grad.addColorStop(0, 'rgba(255,196,107,.9)');
    grad.addColorStop(1, 'rgba(255,122,69,0)');
    ctx.strokeStyle = grad;
    ctx.lineWidth = e.r * 1.1;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(gx, gy); ctx.stroke();
    ctx.fillStyle = '#4b3a33';
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffb35c';
    ctx.beginPath(); ctx.arc(e.x - e.r * 0.25, e.y - e.r * 0.25, e.r * 0.5, 0, Math.PI * 2); ctx.fill();
  }

  function drawAsteroid(e) {
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.rot);
    ctx.fillStyle = '#5d6478';
    ctx.beginPath();
    for (let i = 0; i < e.pts.length; i++) {
      const a = (i / e.pts.length) * Math.PI * 2;
      const rr = e.r * e.pts[i];
      if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#454b5e';
    ctx.beginPath(); ctx.arc(-e.r * 0.25, -e.r * 0.1, e.r * 0.24, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(e.r * 0.3, e.r * 0.28, e.r * 0.16, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawSatellite(e) {
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(Math.sin(e.phase * 0.5) * 0.14);
    ctx.fillStyle = '#31415f';
    ctx.fillRect(-24, -4, 16, 8);
    ctx.fillRect(8, -4, 16, 8);
    ctx.fillStyle = '#7dd3fc';
    for (const sx of [-21, -14, 11, 18]) ctx.fillRect(sx, -2.6, 4.6, 5.2);
    ctx.fillStyle = '#c7d4ec';
    ctx.fillRect(-7, -7, 14, 14);
    ctx.strokeStyle = '#8fa3c8';
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(0, -13); ctx.stroke();
    const blinkOn = (e.blink % 1.2) < 0.6;
    ctx.fillStyle = blinkOn ? '#ff6f6f' : 'rgba(255,111,111,.2)';
    ctx.beginPath(); ctx.arc(0, -14.5, 2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawFuel(e) {
    const bob = Math.sin(e.phase) * 4;
    ctx.save();
    ctx.translate(e.x, e.y + bob);
    ctx.shadowColor = 'rgba(255,196,107,.55)';
    ctx.shadowBlur = 14;
    ctx.fillStyle = '#f5a742';
    roundRect(-9, -11, 18, 22, 4);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#7a4c12';
    ctx.fillRect(-4, -15, 8, 5);
    ctx.fillStyle = '#fff3d6';
    ctx.beginPath();
    ctx.moveTo(1.5, -7); ctx.lineTo(-4, 1); ctx.lineTo(0, 1); ctx.lineTo(-1.5, 8); ctx.lineTo(4.5, -1.5); ctx.lineTo(0.8, -1.5); ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawStarPickup(e) {
    const tw = 0.7 + 0.3 * Math.sin(e.phase * 1.7);
    ctx.save();
    ctx.translate(e.x, e.y + Math.sin(e.phase) * 3);
    ctx.rotate(e.phase * 0.4);
    ctx.globalAlpha = tw;
    ctx.shadowColor = 'rgba(255,215,107,.7)';
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#ffd76b';
    starPath(0, 0, 4, 10.5, 4);
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function starPath(cx, cy, inner, outer, points) {
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? outer : inner;
      const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
      if (i === 0) ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      else ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    ctx.closePath();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawParticles() {
    for (const p of state.particles) {
      ctx.globalAlpha = clamp(1 - p.age / p.life, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  function drawRocket() {
    const r = rocketScreen();
    const rk = state.rocket;
    const invuln = state.time < state.invulnUntil;
    if (invuln && Math.floor(state.time * 14) % 2 === 0) return;

    ctx.save();
    ctx.translate(r.x, r.y);
    ctx.rotate(state.mode === 'dying' ? rk.tilt : rk.tilt);

    if (state.mode === 'flying') {
      const flameLen = (state.boostOn ? 34 : 20) + Math.sin(state.time * 34) * 5 + rand(-2, 2);
      const fg = ctx.createLinearGradient(0, 16, 0, 16 + flameLen);
      fg.addColorStop(0, '#fff3d6');
      fg.addColorStop(0.35, '#ffc46b');
      fg.addColorStop(1, 'rgba(255,122,69,0)');
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.moveTo(-6.5, 16);
      ctx.quadraticCurveTo(0, 16 + flameLen, 6.5, 16);
      ctx.closePath();
      ctx.fill();
    }

    // fins
    ctx.fillStyle = '#ff7a45';
    ctx.beginPath(); ctx.moveTo(-8, 8); ctx.lineTo(-15, 19); ctx.lineTo(-8, 17); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(8, 8); ctx.lineTo(15, 19); ctx.lineTo(8, 17); ctx.closePath(); ctx.fill();
    // body
    const bg = ctx.createLinearGradient(-8, -20, 8, 20);
    bg.addColorStop(0, '#f4f7ff');
    bg.addColorStop(1, '#b9c6e2');
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.moveTo(0, -24);
    ctx.quadraticCurveTo(8.5, -8, 8.5, 8);
    ctx.lineTo(8.5, 16);
    ctx.lineTo(-8.5, 16);
    ctx.lineTo(-8.5, 8);
    ctx.quadraticCurveTo(-8.5, -8, 0, -24);
    ctx.closePath();
    ctx.fill();
    // nose
    ctx.fillStyle = '#ff7a45';
    ctx.beginPath();
    ctx.moveTo(0, -24);
    ctx.quadraticCurveTo(6.4, -12, 7.6, -4);
    ctx.lineTo(-7.6, -4);
    ctx.quadraticCurveTo(-6.4, -12, 0, -24);
    ctx.closePath();
    ctx.fill();
    // window
    ctx.fillStyle = '#0c1730';
    ctx.beginPath(); ctx.arc(0, 3, 5.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#7dd3fc';
    ctx.beginPath(); ctx.arc(-1.4, 1.6, 2.1, 0, Math.PI * 2); ctx.fill();
    // engine base
    ctx.fillStyle = '#3b4c74';
    ctx.fillRect(-7, 16, 14, 4);

    ctx.restore();
  }

  /* ---------- HUD ---------- */
  function updateHud() {
    $('#altitudeLabel').textContent = fmt(state.altitude);
    $('#layerLabel').textContent = LAYERS[state.layerIdx].name;
    $('#speedLabel').textContent = `${fmt(state.vy * 3.6)} km/h`;
    const pct = Math.round(state.fuel);
    $('#fuelBar').style.width = `${pct}%`;
    $('#fuelBar').classList.toggle('low', pct <= 25);
    $('#fuelLabel').textContent = `${pct}%${state.boostOn ? ' · BOOST' : ''}`;
    $('#starsLabel').textContent = String(state.runStars);
    const chip = $('#bestChip');
    chip.hidden = state.prevBest <= 0;
    if (state.prevBest > 0) $('#bestChipValue').textContent = `${fmt(state.prevBest)} m`;
  }

  function updateHullPips() {
    const pips = $('#hullPips').children;
    for (let i = 0; i < pips.length; i++) pips[i].classList.toggle('lost', i >= state.hull);
  }

  function updateHome() {
    $('#bestRunLabel').textContent = profile.best > 0 ? `${fmt(profile.best)} m` : '—';
    $('#flightsLabel').textContent = String(profile.flights);
    $('#totalStarsLabel').textContent = String(profile.stars);
  }

  /* ---------- toasts ---------- */
  function toast(title, sub) {
    const stack = $('#toastStack');
    while (stack.children.length >= 4) stack.firstChild.remove();
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `${escapeHtml(title)}${sub ? `<em>${escapeHtml(sub)}</em>` : ''}`;
    stack.appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, 2400);
  }

  /* ---------- modal ---------- */
  let modalForce = false;
  function openModal({ eyebrow, title, body, actions, force }) {
    modalForce = !!force;
    $('#modalEyebrow').textContent = eyebrow || '';
    $('#modalTitle').textContent = title || '';
    $('#modalBody').innerHTML = body || '';
    const wrap = $('#modalActions');
    wrap.innerHTML = '';
    for (const action of actions || []) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = action.label;
      if (action.primary) btn.classList.add('primary');
      btn.addEventListener('click', action.handler);
      wrap.appendChild(btn);
    }
    $('#modalClose').style.display = modalForce ? 'none' : '';
    $('#modalBackdrop').hidden = false;
  }
  function closeModal() {
    if (modalForce) return;
    $('#modalBackdrop').hidden = true;
  }
  function forceCloseModal() {
    modalForce = false;
    $('#modalBackdrop').hidden = true;
  }

  /* ---------- leaderboard ---------- */
  async function showLeaderboard() {
    if (!granted.classement || !atlas || typeof atlas.classement !== 'function') {
      toast('Register unavailable', 'play while signed in to unlock it');
      return;
    }
    openModal({
      eyebrow: 'ASTRONAUT REGISTER',
      title: 'Highest climbs',
      body: '<p class="modal-copy">The telescope is warming up…</p>',
      actions: [{ label: 'Close', handler: forceCloseModal }]
    });
    try {
      const rows = await atlas.classement(10);
      const list = Array.isArray(rows) ? rows : rows && Array.isArray(rows.scores) ? rows.scores : [];
      $('#modalBody').innerHTML = list.length
        ? `<p class="modal-copy">Altitude is a competitive sport.</p><div class="leaderboard-list">${list.map((row, i) => `<div class="leaderboard-row"><b>${i + 1}</b><strong>${escapeHtml(row.pseudo || row.nom || 'Pilot')}</strong><span>${fmt(Number(row.score) || 0)} m</span></div>`).join('')}</div>`
        : '<p class="modal-copy">No climbs on record yet. The sky is waiting for a name.</p>';
    } catch (_) {
      $('#modalBody').innerHTML = '<p class="modal-copy">The register fell back to Earth. Your local flights are safe.</p>';
    }
  }

  /* ---------- flight manual ---------- */
  function showManual() {
    openModal({
      eyebrow: 'FLIGHT MANUAL',
      title: 'How to stay airborne',
      body: `<p class="modal-copy">The rocket climbs on its own — your job is to aim it, feed it, and keep it in one piece. The run ends when the hull gives out or the tanks run dry. Altitude is the only currency that matters up here.</p>
      <div class="manual-grid">
        <div class="manual-card"><b>STEER</b><span>← → or A / D keys. On touch screens, drag anywhere on the sky and the rocket follows your finger. P pauses the flight.</span></div>
        <div class="manual-card"><b>BOOST</b><span>Hold ↑, W or Space for 60% more climb — at nearly double the fuel burn. Boost is a bet, not a habit.</span></div>
        <div class="manual-card"><b>FEED THE TANK</b><span>Amber fuel cells refill 30%. Golden stars bank glory and a 3% sip of fuel. A dry tank means a long way down.</span></div>
        <div class="manual-card"><b>MIND THE SKY</b><span>Dark storm clouds, birds, planes, meteors, asteroids and satellites each cost a hull plate. You carry three. White clouds are harmless scenery.</span></div>
      </div>`,
      actions: [{ label: 'Understood', primary: true, handler: forceCloseModal }]
    });
  }

  /* ---------- input ---------- */
  const KEYMAP = {
    ArrowLeft: 'left', a: 'left', A: 'left',
    ArrowRight: 'right', d: 'right', D: 'right',
    ArrowUp: 'boost', w: 'boost', W: 'boost', ' ': 'boost'
  };
  globalThis.addEventListener('keydown', (e) => {
    if (e.key === 'p' || e.key === 'P') { togglePause(); return; }
    const k = KEYMAP[e.key];
    if (k && (state.mode === 'flying' || state.mode === 'countdown')) {
      input[k] = true;
      e.preventDefault();
    }
  });
  globalThis.addEventListener('keyup', (e) => {
    const k = KEYMAP[e.key];
    if (k) input[k] = false;
  });

  canvas.addEventListener('pointerdown', (e) => {
    if (state.mode !== 'flying' && state.mode !== 'countdown') return;
    input.pointer = true;
    const rect = canvas.getBoundingClientRect();
    input.pointerX = e.clientX - rect.left;
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!input.pointer) return;
    const rect = canvas.getBoundingClientRect();
    input.pointerX = e.clientX - rect.left;
  });
  const endPointer = () => { input.pointer = false; };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.mode === 'flying') togglePause(true);
  });

  /* ---------- UI wiring ---------- */
  $('#startButton').addEventListener('click', () => { forceCloseModal(); startCountdown(); });
  $('#helpButton').addEventListener('click', showManual);
  $('#leaderboardButton').addEventListener('click', showLeaderboard);
  $('#modalClose').addEventListener('click', closeModal);
  $('#modalBackdrop').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeModal(); });

  const soundButton = $('#soundButton');
  function renderSoundButton() {
    soundButton.textContent = audio.muted ? '🔇' : '🔊';
    soundButton.classList.toggle('muted', audio.muted);
  }
  soundButton.addEventListener('click', () => {
    audio.muted = !audio.muted;
    profile.muted = audio.muted;
    persist();
    if (audio.muted) audio.engineStop();
    else if (state.mode === 'flying') audio.engineStart();
    renderSoundButton();
  });

  /* ---------- main loop ---------- */
  let lastT = 0;
  function tick(t) {
    const dt = clamp((t - lastT) / 1000 || 0, 0, 0.05);
    lastT = t;
    if (state.mode !== 'paused') update(dt);
    render();
    requestAnimationFrame(tick);
  }

  /* ---------- init ---------- */
  if (granted.identite && atlas && atlas.identite && atlas.identite.pseudo) {
    $('#playerName').textContent = String(atlas.identite.pseudo).slice(0, 18).toUpperCase();
  }
  if (granted.classement) $('#leaderboardButton').hidden = false;
  renderSoundButton();
  updateHome();
  updateHullPips();
  requestAnimationFrame(tick);
})();
