/* =========================================================================
   lab.js — the interactive modules.
   Everything here is computed client-side: no data is fetched, nothing is
   pre-rendered. Three modules: Monte Carlo, Black-Scholes, order book.
   ========================================================================= */
(function () {
  'use strict';

  const root = document.documentElement;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------------- shared helpers ---------------------- */

  function colour(name) {
    return getComputedStyle(root).getPropertyValue(name).trim();
  }

  function hexA(c, a) {
    if (c.charAt(0) !== '#') return c;
    let hex = c.slice(1);
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    const n = parseInt(hex, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  let spare = null;
  function gauss() {
    if (spare !== null) { const s = spare; spare = null; return s; }
    let u = 0, v = 0, s = 0;
    do {
      u = Math.random() * 2 - 1;
      v = Math.random() * 2 - 1;
      s = u * u + v * v;
    } while (s === 0 || s >= 1);
    const f = Math.sqrt(-2 * Math.log(s) / s);
    spare = v * f;
    return u * f;
  }

  function fit(cv) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = cv.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    cv.width = Math.round(r.width * dpr);
    cv.height = Math.round(r.height * dpr);
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: r.width, h: r.height };
  }

  function set(id, txt, cls) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = txt;
    if (cls !== undefined) el.className = 'stat__v' + (cls ? ' ' + cls : '');
  }

  function pct(x) { return (x >= 0 ? '+' : '') + x.toFixed(1) + '%'; }

  function quantile(sorted, q) {
    const pos = (sorted.length - 1) * q;
    const lo = Math.floor(pos), hi = Math.ceil(pos);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }

  function dashed(ctx, on) {
    if (ctx.setLineDash) ctx.setLineDash(on ? [4, 4] : []);
  }


  /* =======================================================================
     MODULE 1 — MONTE CARLO
     GBM paths, drawn incrementally. The distribution and the statistics are
     measured off the simulated paths as the horizon advances.
     ======================================================================= */
  const MC = (function () {
    const cv = document.getElementById('mcCanvas');
    if (!cv) return null;

    const els = {
      mu: document.getElementById('mcMu'),
      sig: document.getElementById('mcSig'),
      T: document.getElementById('mcT'),
      N: document.getElementById('mcN'),
      run: document.getElementById('mcRun')
    };

    const S0 = 100;
    const PADT = 16, PADB = 24, PADL = 10, PADR = 10, GAP = 16;

    let ctx = null, w = 0, h = 0;
    let paths = [], N = 240, T = 252;
    let lo = 0, hi = 0;
    let day = 0, raf = 0, running = false;
    let peak = null, maxdd = null, cur = null;

    function geom() {
      const histW = Math.max(90, Math.min(160, w * 0.24));
      return {
        px0: PADL,
        px1: w - PADR - histW - GAP,
        hx0: w - PADR - histW,
        hx1: w - PADR,
        py0: PADT,
        py1: h - PADB
      };
    }

    function simulate() {
      const mu = (+els.mu.value) / 100;
      const sig = (+els.sig.value) / 100;
      T = +els.T.value;
      N = +els.N.value;

      const dt = 1 / 252;
      const drift = (mu - 0.5 * sig * sig) * dt;
      const vol = sig * Math.sqrt(dt);

      paths = new Array(N);
      lo = Infinity; hi = -Infinity;

      for (let i = 0; i < N; i++) {
        const p = new Float32Array(T + 1);
        p[0] = S0;
        for (let t = 1; t <= T; t++) {
          p[t] = p[t - 1] * Math.exp(drift + vol * gauss());
          if (p[t] < lo) lo = p[t];
          if (p[t] > hi) hi = p[t];
        }
        paths[i] = p;
      }

      if (lo > S0) lo = S0;
      if (hi < S0) hi = S0;
      const pad = (hi - lo) * 0.06 || 1;
      lo -= pad; hi += pad;

      peak = new Float32Array(N).fill(S0);
      maxdd = new Float32Array(N);
      cur = new Float64Array(N).fill(S0);
      day = 0;
    }

    function yv(v, g) {
      return g.py1 - ((v - lo) / (hi - lo)) * (g.py1 - g.py0);
    }
    function xv(t, g) {
      return g.px0 + (t / T) * (g.px1 - g.px0);
    }

    function backdrop() {
      const g = geom();
      ctx.clearRect(0, 0, w, h);

      const line = colour('--line');
      const dim = colour('--text-3');

      ctx.strokeStyle = line;
      ctx.lineWidth = 1;
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillStyle = dim;

      // horizontal gridlines on nice levels
      const span = hi - lo;
      const raw = span / 5;
      const mag = Math.pow(10, Math.floor(Math.log10(raw)));
      const stepv = [1, 2, 2.5, 5, 10].reduce(function (best, m) {
        return Math.abs(m * mag - raw) < Math.abs(best * mag - raw) ? m : best;
      }, 1) * mag;

      for (let v = Math.ceil(lo / stepv) * stepv; v < hi; v += stepv) {
        const y = yv(v, g);
        ctx.globalAlpha = 0.55;
        ctx.beginPath();
        ctx.moveTo(g.px0, y);
        ctx.lineTo(g.px1, y);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillText(v.toFixed(0), g.px0 + 3, y - 3);
      }

      // start level
      const y0 = yv(S0, g);
      ctx.strokeStyle = colour('--text-3');
      dashed(ctx, true);
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.moveTo(g.px0, y0);
      ctx.lineTo(g.px1, y0);
      ctx.stroke();
      dashed(ctx, false);
      ctx.globalAlpha = 1;

      // histogram frame
      ctx.strokeStyle = line;
      ctx.beginPath();
      ctx.moveTo(g.hx0 - GAP / 2, g.py0);
      ctx.lineTo(g.hx0 - GAP / 2, g.py1);
      ctx.stroke();

      ctx.fillStyle = dim;
      ctx.fillText('t = 0', g.px0, h - 8);
      ctx.fillText(T + 'd', g.px1 - 24, h - 8);
      ctx.fillText('distribution', g.hx0, h - 8);
    }

    function segment(from, to) {
      const g = geom();
      const up = colour('--up'), down = colour('--down');
      const alpha = Math.max(0.05, Math.min(0.3, 26 / N));

      ctx.lineWidth = 1;
      ctx.globalAlpha = alpha;

      // one pass per colour keeps strokeStyle changes to two per frame
      for (let pass = 0; pass < 2; pass++) {
        ctx.strokeStyle = pass === 0 ? up : down;
        ctx.beginPath();
        for (let i = 0; i < N; i++) {
          const p = paths[i];
          const isUp = p[T] >= S0;
          if ((pass === 0) !== isUp) continue;
          ctx.moveTo(xv(from, g), yv(p[from], g));
          for (let t = from + 1; t <= to; t++) ctx.lineTo(xv(t, g), yv(p[t], g));
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    function advance(to) {
      for (let i = 0; i < N; i++) {
        const p = paths[i];
        for (let t = day + 1; t <= to; t++) {
          const v = p[t];
          if (v > peak[i]) peak[i] = v;
          const dd = (peak[i] - v) / peak[i];
          if (dd > maxdd[i]) maxdd[i] = dd;
        }
        cur[i] = p[to];
      }
    }

    function histogram() {
      const g = geom();
      ctx.clearRect(g.hx0 - GAP / 2 + 1, 0, w - (g.hx0 - GAP / 2), h);

      const BUCKETS = 34;
      const counts = new Int32Array(BUCKETS);
      let most = 1;
      for (let i = 0; i < N; i++) {
        let b = Math.floor(((cur[i] - lo) / (hi - lo)) * BUCKETS);
        if (b < 0) b = 0; if (b >= BUCKETS) b = BUCKETS - 1;
        counts[b]++;
        if (counts[b] > most) most = counts[b];
      }

      const bw = (g.py1 - g.py0) / BUCKETS;
      const up = colour('--up'), down = colour('--down');
      const midB = Math.floor(((S0 - lo) / (hi - lo)) * BUCKETS);

      for (let b = 0; b < BUCKETS; b++) {
        if (!counts[b]) continue;
        const len = (counts[b] / most) * (g.hx1 - g.hx0);
        const y = g.py1 - (b + 1) * bw;
        ctx.fillStyle = hexA(b >= midB ? up : down, 0.55);
        ctx.fillRect(g.hx0, y + 0.6, len, Math.max(1, bw - 1.2));
      }

      // start-level reference
      const y0 = yv(S0, g);
      ctx.strokeStyle = colour('--text-3');
      ctx.globalAlpha = 0.7;
      dashed(ctx, true);
      ctx.beginPath();
      ctx.moveTo(g.hx0, y0);
      ctx.lineTo(g.hx1, y0);
      ctx.stroke();
      dashed(ctx, false);
      ctx.globalAlpha = 1;

      ctx.fillStyle = colour('--text-3');
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillText('distribution', g.hx0, h - 8);
    }

    function stats() {
      const sorted = Array.prototype.slice.call(cur).sort(function (a, b) { return a - b; });
      let sum = 0, wins = 0;
      for (let i = 0; i < N; i++) { sum += cur[i]; if (cur[i] > S0) wins++; }

      const med = quantile(sorted, 0.5);
      const mean = sum / N;

      const ddSorted = Array.prototype.slice.call(maxdd).sort(function (a, b) { return a - b; });

      set('mcMed', pct(med - S0), med >= S0 ? 'up' : 'down');
      set('mcMean', pct(mean - S0), mean >= S0 ? 'up' : 'down');
      set('mcP5', pct(quantile(sorted, 0.05) - S0), 'down');
      set('mcP95', pct(quantile(sorted, 0.95) - S0), 'up');
      set('mcPw', (wins / N * 100).toFixed(0) + '%', '');
      set('mcDD', '-' + (quantile(ddSorted, 0.5) * 100).toFixed(1) + '%', 'down');
    }

    function medianPath() {
      const g = geom();
      const idx = Array.from({ length: N }, function (_, i) { return i; })
        .sort(function (a, b) { return paths[a][T] - paths[b][T]; })[Math.floor(N / 2)];
      const p = paths[idx];

      ctx.strokeStyle = colour('--accent');
      ctx.lineWidth = 1.6;
      ctx.globalAlpha = 0.95;
      ctx.beginPath();
      ctx.moveTo(xv(0, g), yv(p[0], g));
      for (let t = 1; t <= T; t++) ctx.lineTo(xv(t, g), yv(p[t], g));
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    function frame() {
      if (!running) return;
      const perFrame = Math.max(1, Math.ceil(T / 90));
      const to = Math.min(T, day + perFrame);

      segment(day, to);
      advance(to);
      day = to;

      histogram();
      stats();

      if (day >= T) {
        medianPath();
        running = false;
        return;
      }
      raf = requestAnimationFrame(frame);
    }

    function restart() {
      cancelAnimationFrame(raf);
      const m = fit(cv);
      if (!m) return;
      ctx = m.ctx; w = m.w; h = m.h;

      simulate();
      backdrop();

      if (reduced) {
        segment(0, T);
        advance(T);
        day = T;
        histogram();
        stats();
        medianPath();
        return;
      }
      running = true;
      raf = requestAnimationFrame(frame);
    }

    function redraw() {
      // theme/resize: repaint the finished state without re-simulating
      const m = fit(cv);
      if (!m || !paths.length) return;
      ctx = m.ctx; w = m.w; h = m.h;
      backdrop();
      segment(0, day);
      histogram();
      if (day >= T) medianPath();
    }

    // wiring
    const label = function (input, out, fmt) {
      const o = document.getElementById(out);
      const upd = function () { o.textContent = fmt(+input.value); };
      input.addEventListener('input', upd);
      upd();
    };
    label(els.mu, 'mcMuV', function (v) { return v + '%'; });
    label(els.sig, 'mcSigV', function (v) { return v + '%'; });
    label(els.T, 'mcTV', function (v) { return v + 'd'; });
    label(els.N, 'mcNV', function (v) { return String(v); });

    [els.mu, els.sig, els.T, els.N].forEach(function (i) {
      i.addEventListener('change', restart);
    });
    els.run.addEventListener('click', restart);

    return {
      start: function () { if (!paths.length) restart(); },
      stop: function () { running = false; cancelAnimationFrame(raf); },
      resize: redraw,
      theme: redraw,
      restart: restart
    };
  })();


  /* =======================================================================
     MODULE 2 — BLACK-SCHOLES
     Closed-form BSM. Curve is value across spot; kinked line is expiry payoff;
     the gap between them is time value.
     ======================================================================= */
  const BS = (function () {
    const cv = document.getElementById('bsCanvas');
    if (!cv) return null;

    const els = {
      S: document.getElementById('bsS'),
      K: document.getElementById('bsK'),
      V: document.getElementById('bsV'),
      T: document.getElementById('bsT'),
      R: document.getElementById('bsR')
    };
    const segBtns = document.querySelectorAll('#panel-bs .seg__btn');

    let type = 'call';
    let ctx = null, w = 0, h = 0;

    const XMIN = 30, XMAX = 170;
    const PADT = 16, PADB = 26, PADL = 42, PADR = 14;

    // Zelen & Severo (A&S 26.2.17), |err| < 7.5e-8
    function ncdf(x) {
      const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741,
            a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
      const sign = x < 0 ? -1 : 1;
      const z = Math.abs(x) / Math.SQRT2;
      const t = 1 / (1 + p * z);
      const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);
      return 0.5 * (1 + sign * y);
    }
    function npdf(x) { return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI); }

    function bsm(S, K, T, r, v, isCall) {
      if (T <= 0 || v <= 0 || S <= 0) {
        const intrinsic = isCall ? Math.max(0, S - K) : Math.max(0, K - S);
        return { price: intrinsic, delta: isCall ? (S > K ? 1 : 0) : (S < K ? -1 : 0),
                 gamma: 0, vega: 0, theta: 0, rho: 0 };
      }
      const sq = Math.sqrt(T);
      const d1 = (Math.log(S / K) + (r + 0.5 * v * v) * T) / (v * sq);
      const d2 = d1 - v * sq;
      const disc = Math.exp(-r * T);
      const nd1 = ncdf(d1), nd2 = ncdf(d2), pd1 = npdf(d1);

      const price = isCall
        ? S * nd1 - K * disc * nd2
        : K * disc * ncdf(-d2) - S * ncdf(-d1);

      const theta = isCall
        ? (-S * pd1 * v / (2 * sq) - r * K * disc * nd2)
        : (-S * pd1 * v / (2 * sq) + r * K * disc * ncdf(-d2));

      return {
        price: price,
        delta: isCall ? nd1 : nd1 - 1,
        gamma: pd1 / (S * v * sq),
        vega: S * pd1 * sq / 100,
        theta: theta / 365,
        rho: (isCall ? K * T * disc * nd2 : -K * T * disc * ncdf(-d2)) / 100
      };
    }

    function payoff(S, K, isCall) {
      return isCall ? Math.max(0, S - K) : Math.max(0, K - S);
    }

    function draw() {
      const m = fit(cv);
      if (!m) return;
      ctx = m.ctx; w = m.w; h = m.h;

      const S = +els.S.value;
      const K = +els.K.value;
      const v = (+els.V.value) / 100;
      const days = +els.T.value;
      const T = days / 365;
      const r = (+els.R.value) / 1000;
      const isCall = type === 'call';

      // readouts
      document.getElementById('bsSV').textContent = S;
      document.getElementById('bsKV').textContent = K;
      document.getElementById('bsVV').textContent = (+els.V.value) + '%';
      document.getElementById('bsTV').textContent = days + 'd';
      document.getElementById('bsRV').textContent = (r * 100).toFixed(1) + '%';

      const g = bsm(S, K, T, r, v, isCall);
      set('bsPx', g.price.toFixed(3));
      set('bsD', g.delta.toFixed(4), g.delta >= 0 ? 'up' : 'down');
      set('bsG', g.gamma.toFixed(4), '');
      set('bsVe', g.vega.toFixed(4), '');
      set('bsTh', g.theta.toFixed(4), g.theta >= 0 ? 'up' : 'down');
      set('bsRh', g.rho.toFixed(4), g.rho >= 0 ? 'up' : 'down');

      // curve sampling
      const STEPS = 180;
      const vals = new Float64Array(STEPS + 1);
      const pays = new Float64Array(STEPS + 1);
      let ymax = 0;
      for (let i = 0; i <= STEPS; i++) {
        const s = XMIN + (XMAX - XMIN) * (i / STEPS);
        vals[i] = bsm(s, K, T, r, v, isCall).price;
        pays[i] = payoff(s, K, isCall);
        if (vals[i] > ymax) ymax = vals[i];
        if (pays[i] > ymax) ymax = pays[i];
      }
      ymax = ymax * 1.12 || 1;

      const x0 = PADL, x1 = w - PADR, y0 = PADT, y1 = h - PADB;
      const X = function (s) { return x0 + ((s - XMIN) / (XMAX - XMIN)) * (x1 - x0); };
      const Y = function (val) { return y1 - (val / ymax) * (y1 - y0); };

      ctx.clearRect(0, 0, w, h);
      ctx.font = '10px ui-monospace, monospace';

      // grid
      const line = colour('--line'), dim = colour('--text-3');
      ctx.strokeStyle = line; ctx.lineWidth = 1; ctx.fillStyle = dim;
      const yStep = Math.max(1, Math.round(ymax / 4));
      for (let val = 0; val <= ymax; val += yStep) {
        const y = Y(val);
        ctx.globalAlpha = 0.55;
        ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillText(val.toFixed(0), 6, y + 3);
      }
      for (let s = 40; s <= XMAX; s += 20) {
        const x = X(s);
        ctx.globalAlpha = 0.35;
        ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillText(String(s), x - 8, h - 9);
      }

      // time value shading
      ctx.beginPath();
      ctx.moveTo(X(XMIN), Y(vals[0]));
      for (let i = 1; i <= STEPS; i++) ctx.lineTo(X(XMIN + (XMAX - XMIN) * i / STEPS), Y(vals[i]));
      for (let i = STEPS; i >= 0; i--) ctx.lineTo(X(XMIN + (XMAX - XMIN) * i / STEPS), Y(pays[i]));
      ctx.closePath();
      ctx.fillStyle = hexA(colour('--accent'), 0.10);
      ctx.fill();

      // payoff at expiry
      ctx.strokeStyle = dim;
      ctx.lineWidth = 1.2;
      dashed(ctx, true);
      ctx.beginPath();
      ctx.moveTo(X(XMIN), Y(pays[0]));
      for (let i = 1; i <= STEPS; i++) ctx.lineTo(X(XMIN + (XMAX - XMIN) * i / STEPS), Y(pays[i]));
      ctx.stroke();
      dashed(ctx, false);

      // strike marker
      ctx.strokeStyle = hexA(colour('--text-2'), 0.5);
      dashed(ctx, true);
      ctx.beginPath(); ctx.moveTo(X(K), y0); ctx.lineTo(X(K), y1); ctx.stroke();
      dashed(ctx, false);
      ctx.fillStyle = colour('--text-2');
      ctx.fillText('K', X(K) + 4, y0 + 10);

      // value curve
      ctx.strokeStyle = colour('--accent');
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(X(XMIN), Y(vals[0]));
      for (let i = 1; i <= STEPS; i++) ctx.lineTo(X(XMIN + (XMAX - XMIN) * i / STEPS), Y(vals[i]));
      ctx.stroke();

      // spot marker
      const sx = X(S), sy = Y(g.price);
      ctx.strokeStyle = hexA(colour('--accent'), 0.45);
      dashed(ctx, true);
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx, y1); ctx.stroke();
      dashed(ctx, false);

      ctx.beginPath();
      ctx.arc(sx, sy, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = colour('--accent');
      ctx.fill();
      ctx.strokeStyle = colour('--bg');
      ctx.lineWidth = 2;
      ctx.stroke();

      // legend
      ctx.fillStyle = dim;
      ctx.fillText('— value now', x1 - 150, y0 + 10);
      ctx.fillText('-- payoff at expiry', x1 - 150, y0 + 24);
    }

    Object.keys(els).forEach(function (k) {
      els[k].addEventListener('input', draw);
    });
    segBtns.forEach(function (b) {
      b.addEventListener('click', function () {
        segBtns.forEach(function (x) { x.classList.remove('is-active'); });
        b.classList.add('is-active');
        type = b.dataset.type;
        draw();
      });
    });

    return { start: draw, stop: function () {}, resize: draw, theme: draw };
  })();


  /* =======================================================================
     MODULE 3 — ORDER BOOK
     Synthetic book: mid random-walks, resting size decays away from touch and
     is refreshed with persistence. Depth is cumulative from the touch outward.
     ======================================================================= */
  const OB = (function () {
    const cv = document.getElementById('obCanvas');
    if (!cv) return null;

    const els = {
      L: document.getElementById('obL'),
      Q: document.getElementById('obQ'),
      V: document.getElementById('obV'),
      pause: document.getElementById('obPause')
    };

    const TICK = 0.05;
    const PADT = 16, PADB = 26, PADL = 44, PADR = 14;

    let ctx = null, w = 0, h = 0;
    let mid = 100, bids = [], asks = [];
    let raf = 0, running = false, paused = false;
    let acc = 0, prev = 0;

    function levels() { return +els.L.value; }
    function liq() { return (+els.Q.value) / 10; }
    function vol() { return (+els.V.value) / 10; }

    function seed() {
      const L = levels();
      bids = new Array(L);
      asks = new Array(L);
      for (let i = 0; i < L; i++) {
        bids[i] = size(i);
        asks[i] = size(i);
      }
    }

    function size(i) {
      // more resting size deeper in the book, with noise
      return liq() * (12 + i * 9) * (0.55 + Math.random() * 0.9);
    }

    function tick() {
      const L = levels();
      if (bids.length !== L) { seed(); return; }

      mid += gauss() * TICK * vol() * 0.9;
      if (mid < 90) mid = 90;
      if (mid > 110) mid = 110;

      // partial refresh: some levels get replenished, others decay
      for (let i = 0; i < L; i++) {
        if (Math.random() < 0.22) bids[i] = size(i);
        else bids[i] *= 0.93 + Math.random() * 0.1;
        if (Math.random() < 0.22) asks[i] = size(i);
        else asks[i] *= 0.93 + Math.random() * 0.1;
        if (bids[i] < 1) bids[i] = size(i) * 0.4;
        if (asks[i] < 1) asks[i] = size(i) * 0.4;
      }
    }

    function draw() {
      const m = fit(cv);
      if (!m) return;
      ctx = m.ctx; w = m.w; h = m.h;

      const L = bids.length;
      if (!L) return;

      const bestBid = mid - TICK / 2;
      const bestAsk = mid + TICK / 2;
      const span = (L + 1) * TICK;

      const x0 = PADL, x1 = w - PADR, y0 = PADT, y1 = h - PADB;
      const X = function (p) { return x0 + ((p - (mid - span)) / (2 * span)) * (x1 - x0); };

      // cumulative depth
      const cumB = new Float64Array(L), cumA = new Float64Array(L);
      let cb = 0, ca = 0, top = 0;
      for (let i = 0; i < L; i++) {
        cb += bids[i]; ca += asks[i];
        cumB[i] = cb; cumA[i] = ca;
      }
      top = Math.max(cb, ca) * 1.1 || 1;
      const Y = function (q) { return y1 - (q / top) * (y1 - y0); };

      ctx.clearRect(0, 0, w, h);
      ctx.font = '10px ui-monospace, monospace';

      const line = colour('--line'), dim = colour('--text-3');
      const up = colour('--up'), down = colour('--down');

      // grid
      ctx.strokeStyle = line; ctx.lineWidth = 1; ctx.fillStyle = dim;
      for (let k = 0; k <= 4; k++) {
        const q = (top / 4) * k;
        const y = Y(q);
        ctx.globalAlpha = 0.55;
        ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillText(q.toFixed(0), 6, y + 3);
      }

      // staircases
      function stair(cum, best, dir, col) {
        ctx.beginPath();
        ctx.moveTo(X(best), y1);
        ctx.lineTo(X(best), Y(cum[0]));
        for (let i = 1; i < L; i++) {
          const p = best + dir * i * TICK;
          ctx.lineTo(X(p), Y(cum[i - 1]));
          ctx.lineTo(X(p), Y(cum[i]));
        }
        const edge = best + dir * L * TICK;
        ctx.lineTo(X(edge), Y(cum[L - 1]));
        ctx.lineTo(X(edge), y1);
        ctx.closePath();

        ctx.fillStyle = hexA(col, 0.16);
        ctx.fill();
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }

      stair(cumB, bestBid, -1, up);
      stair(cumA, bestAsk, +1, down);

      // mid line
      ctx.strokeStyle = hexA(colour('--text-2'), 0.55);
      dashed(ctx, true);
      ctx.beginPath(); ctx.moveTo(X(mid), y0); ctx.lineTo(X(mid), y1); ctx.stroke();
      dashed(ctx, false);

      ctx.fillStyle = colour('--text-2');
      ctx.fillText('mid ' + mid.toFixed(2), X(mid) + 5, y0 + 10);

      // price axis
      ctx.fillStyle = dim;
      for (let k = -2; k <= 2; k++) {
        const p = mid + k * (span / 2.5);
        ctx.fillText(p.toFixed(2), X(p) - 14, h - 9);
      }
      ctx.fillStyle = hexA(up, 0.9);
      ctx.fillText('BIDS', x0 + 4, y0 + 10);
      ctx.fillStyle = hexA(down, 0.9);
      ctx.fillText('ASKS', x1 - 30, y0 + 10);

      // stats
      let b5 = 0, a5 = 0;
      const n5 = Math.min(5, L);
      for (let i = 0; i < n5; i++) { b5 += bids[i]; a5 += asks[i]; }
      const imb = (b5 - a5) / (b5 + a5) * 100;

      set('obBid', bestBid.toFixed(2), 'up');
      set('obAsk', bestAsk.toFixed(2), 'down');
      set('obSpr', TICK.toFixed(2), '');
      set('obMid', mid.toFixed(2), '');
      set('obImb', pct(imb), imb >= 0 ? 'up' : 'down');
      set('obTot', (cb + ca).toFixed(0), '');
    }

    function frame(now) {
      if (!running) return;
      const dt = now - prev; prev = now;
      if (!paused && !document.hidden) {
        acc += dt;
        let stepped = false;
        while (acc >= 130) { tick(); acc -= 130; stepped = true; }
        if (stepped) draw();
      }
      raf = requestAnimationFrame(frame);
    }

    els.L.addEventListener('input', function () {
      document.getElementById('obLV').textContent = els.L.value;
    });
    els.L.addEventListener('change', function () { seed(); draw(); });
    els.Q.addEventListener('input', function () {
      document.getElementById('obQV').textContent = liq().toFixed(1) + '×';
    });
    els.V.addEventListener('input', function () {
      document.getElementById('obVV').textContent = vol().toFixed(1) + '×';
    });
    els.pause.addEventListener('click', function () {
      paused = !paused;
      els.pause.textContent = paused ? 'Resume' : 'Pause';
    });

    return {
      start: function () {
        if (!bids.length) seed();
        draw();
        if (reduced || running) return;
        running = true;
        prev = performance.now();
        raf = requestAnimationFrame(frame);
      },
      stop: function () { running = false; cancelAnimationFrame(raf); },
      resize: draw,
      theme: draw
    };
  })();


  /* ---------------------- tabs + lifecycle ---------------------- */
  const MODULES = { mc: MC, bs: BS, ob: OB };
  const tabs = document.querySelectorAll('.lab__tab');
  let active = 'mc';

  function show(key) {
    if (!MODULES[key]) return;

    tabs.forEach(function (t) {
      const on = t.dataset.panel === key;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', String(on));
    });
    Object.keys(MODULES).forEach(function (k) {
      const p = document.getElementById('panel-' + k);
      if (p) p.hidden = k !== key;
      if (k !== key && MODULES[k]) MODULES[k].stop();
    });

    active = key;
    // The panel is un-hidden synchronously above, so the canvas already has a
    // measurable box — reading it forces layout. Don't defer through rAF here:
    // rAF never fires while the document is hidden, which would leave a tab
    // switched in a background page blank until something else woke it.
    MODULES[key].start();
  }

  tabs.forEach(function (t) {
    t.addEventListener('click', function () { show(t.dataset.panel); });
  });

  // only spin things up once the lab is actually on screen
  const lab = document.getElementById('lab');
  if (lab && 'IntersectionObserver' in window) {
    let booted = false;
    const io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          if (!booted) { booted = true; show(active); }
          else if (MODULES[active]) MODULES[active].start();
        } else if (MODULES[active]) {
          MODULES[active].stop();
        }
      });
    }, { rootMargin: '120px' });
    io.observe(lab);
  } else {
    show(active);
  }

  let rt = 0;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () {
      if (MODULES[active]) MODULES[active].resize();
    }, 160);
  });

  window.addEventListener('ng:theme', function () {
    Object.keys(MODULES).forEach(function (k) {
      if (MODULES[k]) MODULES[k].theme();
    });
  });

  // Coming back to a backgrounded tab: repaint whatever is on screen. Canvases
  // sized while hidden can be stale, and paused loops need restarting.
  document.addEventListener('visibilitychange', function () {
    if (document.hidden || !MODULES[active]) return;
    MODULES[active].resize();
    MODULES[active].start();
  });

})();
