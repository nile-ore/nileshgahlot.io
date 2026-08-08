/* =========================================================================
   scene.js — the title film.
   A ~34s seamless loop, drawn procedurally on one canvas. No assets.

   Acts:
     1. A python approaches from the horizon      (Python — the language)
     2. Colocation racks sketch themselves in     (NSE / exchange infra)
     3. A bull enters left at 2× the python's
        pace — real-world speed ratio             (permanent long bias)
     4. Cut to tableau: the figure, resting
        bulls, one yawning bear, the python
        coiled at the feet
     5. Exhale to blank paper → loop

   Speeds: python ≈1.6 km/h, walking bull ≈3.2 km/h (looked up, 2:1).

   Face hook: set  window.SCENE_FACE = 'assets/images/face.png'  before this
   script loads and the tableau figure's head becomes that photo, treated to
   match the engraving. Until then a drawn head is used.
   ========================================================================= */
(function () {
  'use strict';

  const cv = document.getElementById('scene');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const root = document.documentElement;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ------------------------------ timeline ------------------------------ */
  const LOOP = 34;
  const T = {
    fadeIn: [0, 1.4],        // approach scene materialises
    rackDraw: [5.5, 10.5],   // racks sketch themselves
    bullEnter: 11,           // bull steps in (2× snake pace)
    cut: [21.0, 23.5],       // dissolve approach → tableau
    exhale: [31.8, 33.6]     // tableau fades to blank paper (loop seam)
  };
  const SNAKE_RATE = 0.0357; // z-units / s  (≈1.6 km/h scaled)
  const BULL_RATE = SNAKE_RATE * 2; // 2:1, the real ratio

  /* ------------------------------- colours ------------------------------ */
  let C = {};
  function readColours() {
    const cs = getComputedStyle(root);
    C = {
      paper: cs.getPropertyValue('--paper').trim() || '#f2efe6',
      ink: cs.getPropertyValue('--ink').trim() || '#211e19',
      ink2: cs.getPropertyValue('--ink-2').trim() || '#5c564a',
      accent: cs.getPropertyValue('--accent').trim() || '#8f2f1e'
    };
  }

  function hexRGB(c) {
    if (c.charAt(0) !== '#') return [30, 28, 24];
    let hx = c.slice(1);
    if (hx.length === 3) hx = hx[0] + hx[0] + hx[1] + hx[1] + hx[2] + hx[2];
    const n = parseInt(hx, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function inkA(a) { const r = hexRGB(C.ink); return 'rgba(' + r[0] + ',' + r[1] + ',' + r[2] + ',' + a + ')'; }
  function accA(a) { const r = hexRGB(C.accent); return 'rgba(' + r[0] + ',' + r[1] + ',' + r[2] + ',' + a + ')'; }

  /* ------------------------------ utilities ----------------------------- */
  function mulberry(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let z = s;
      z = Math.imul(z ^ (z >>> 15), z | 1);
      z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
      return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
    };
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, p) { return a + (b - a) * p; }
  function smooth(a, b, v) {
    const p = clamp((v - a) / (b - a), 0, 1);
    return p * p * (3 - 2 * p);
  }

  /* ------------------------------- canvas ------------------------------- */
  let W = 0, H = 0, SF = 1; // SF: stage scale — world lateral units → this viewport
  function fit() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = cv.getBoundingClientRect();
    W = r.width; H = r.height;
    SF = clamp(W / 1440, 0.62, 1);
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildRacks();
    grainTile = null; // rebuild for new theme/size
    vgGrad = null; hgGrad = null;
  }

  /* paper grain — one small noise tile, tiled at low alpha */
  let grainTile = null, vgGrad = null, hgGrad = null;
  function grain() {
    if (!grainTile) {
      const g = document.createElement('canvas');
      g.width = 160; g.height = 160;
      const gx = g.getContext('2d');
      const rnd = mulberry(7);
      const ink = hexRGB(C.ink);
      const id = gx.createImageData(160, 160);
      for (let i = 0; i < id.data.length; i += 4) {
        const v = rnd();
        id.data[i] = ink[0]; id.data[i + 1] = ink[1]; id.data[i + 2] = ink[2];
        id.data[i + 3] = v < 0.16 ? Math.floor(rnd() * 26) : 0;
      }
      gx.putImageData(id, 0, 0);
      grainTile = ctx.createPattern(g, 'repeat');
    }
    ctx.fillStyle = grainTile;
    ctx.fillRect(0, 0, W, H);
  }

  /* ------------------------- ground projection --------------------------
     z: 0 = at the viewer's feet, 1 = on the horizon.                       */
  function horizonY() { return H * 0.16; }
  function prj(z) {
    const k = Math.pow(1 - z, 1.6);
    return {
      y: horizonY() + (H * 1.04 - horizonY()) * k,
      s: 0.10 + 1.30 * k
    };
  }

  /* ======================================================================
     TUBE RENDERER — shared by the moving python and the coiled python.
     pts: [{x, y, r}] screen-space spine, index 0 = head.
     pat: per-point 0..1 banding (python skin).
     ====================================================================== */
  function renderTube(pts, pat, opts) {
    const n = pts.length;
    if (n < 4) return;
    opts = opts || {};

    // tangents & edge points
    const E1 = [], E2 = [];
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      let tx = b.x - a.x, ty = b.y - a.y;
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl; ty /= tl;
      const r = pts[i].r;
      E1.push({ x: pts[i].x - ty * r, y: pts[i].y + tx * r, tx: tx, ty: ty });
      E2.push({ x: pts[i].x + ty * r, y: pts[i].y - tx * r, tx: tx, ty: ty });
    }

    // cast shadow (flattened, offset down-left)
    if (!opts.noShadow) {
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const o = pts[i].r * 0.5;
        const x = E1[i].x - o * 0.9, y = E1[i].y + o * 0.75;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      for (let i = n - 1; i >= 0; i--) {
        const o = pts[i].r * 0.5;
        ctx.lineTo(E2[i].x - o * 0.9, E2[i].y + o * 0.75);
      }
      ctx.closePath();
      ctx.fillStyle = inkA(0.09);
      ctx.fill();
    }

    // body fill — occludes whatever is behind
    ctx.beginPath();
    ctx.moveTo(E1[0].x, E1[0].y);
    for (let i = 1; i < n; i++) ctx.lineTo(E1[i].x, E1[i].y);
    for (let i = n - 1; i >= 0; i--) ctx.lineTo(E2[i].x, E2[i].y);
    ctx.closePath();
    ctx.fillStyle = C.paper;
    ctx.fill();
    ctx.fillStyle = inkA(0.05);
    ctx.fill();

    // rib strokes — the engraved rings (drawn tail → head so near rings sit on top)
    const boost = opts.boost || 1;
    ctx.lineCap = 'round';
    for (let i = n - 1; i >= 1; i--) {
      const r = pts[i].r;
      if (r < 0.7) continue;
      const bulge = r * 0.9; // rings wrap toward the head
      const cxm = pts[i].x + E1[i].tx * bulge;
      const cym = pts[i].y + E1[i].ty * bulge;
      ctx.beginPath();
      ctx.moveTo(E1[i].x, E1[i].y);
      ctx.quadraticCurveTo(cxm, cym, E2[i].x, E2[i].y);
      ctx.strokeStyle = inkA(Math.min(0.9, (0.18 + 0.52 * pat[i % pat.length]) * boost));
      ctx.lineWidth = Math.max(0.55, r * 0.085);
      ctx.stroke();
    }

    // edge outlines
    ctx.beginPath();
    ctx.moveTo(E1[0].x, E1[0].y);
    for (let i = 1; i < n; i++) ctx.lineTo(E1[i].x, E1[i].y);
    ctx.strokeStyle = inkA(0.75);
    ctx.lineWidth = Math.max(0.8, pts[Math.floor(n * 0.35)].r * 0.075);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(E2[0].x, E2[0].y);
    for (let i = 1; i < n; i++) ctx.lineTo(E2[i].x, E2[i].y);
    ctx.stroke();
  }

  function snakeHead(hx, hy, dx, dy, r, t) {
    const px = -dy, py = dx;
    ctx.beginPath();
    ctx.moveTo(hx + px * r * 0.95, hy + py * r * 0.95);
    ctx.bezierCurveTo(
      hx + px * r * 0.95 + dx * r * 1.6, hy + py * r * 0.95 + dy * r * 1.6,
      hx + px * r * 0.34 + dx * r * 2.6, hy + py * r * 0.34 + dy * r * 2.6,
      hx + dx * r * 2.75, hy + dy * r * 2.75);
    ctx.bezierCurveTo(
      hx - px * r * 0.34 + dx * r * 2.6, hy - py * r * 0.34 + dy * r * 2.6,
      hx - px * r * 0.95 + dx * r * 1.6, hy - py * r * 0.95 + dy * r * 1.6,
      hx - px * r * 0.95, hy - py * r * 0.95);
    ctx.closePath();
    ctx.fillStyle = C.paper; ctx.fill();
    ctx.fillStyle = inkA(0.14); ctx.fill();
    ctx.strokeStyle = inkA(0.8);
    ctx.lineWidth = Math.max(0.8, r * 0.09);
    ctx.stroke();

    // eyes
    ctx.fillStyle = inkA(0.95);
    ctx.beginPath();
    ctx.arc(hx + px * r * 0.55 + dx * r * 1.15, hy + py * r * 0.55 + dy * r * 1.15, Math.max(0.8, r * 0.13), 0, 6.3);
    ctx.arc(hx - px * r * 0.55 + dx * r * 1.15, hy - py * r * 0.55 + dy * r * 1.15, Math.max(0.8, r * 0.13), 0, 6.3);
    ctx.fill();

    // tongue flick
    const f = (t % 4.7) / 4.7;
    if (f < 0.09) {
      const e = Math.sin((f / 0.09) * Math.PI);
      const tl = r * 2.1 * e;
      const tipx = hx + dx * (r * 2.75 + tl), tipy = hy + dy * (r * 2.75 + tl);
      ctx.strokeStyle = inkA(0.85);
      ctx.lineWidth = Math.max(0.6, r * 0.06);
      ctx.beginPath();
      ctx.moveTo(hx + dx * r * 2.7, hy + dy * r * 2.7);
      ctx.lineTo(tipx, tipy);
      ctx.lineTo(tipx + (dx * 0.5 + px * 0.5) * r * 0.5, tipy + (dy * 0.5 + py * 0.5) * r * 0.5);
      ctx.moveTo(tipx, tipy);
      ctx.lineTo(tipx + (dx * 0.5 - px * 0.5) * r * 0.5, tipy + (dy * 0.5 - py * 0.5) * r * 0.5);
      ctx.stroke();
    }
  }

  /* ======================================================================
     ACT 1 — THE APPROACHING PYTHON
     ====================================================================== */
  const SN = 120, SLZ = 0.30;
  const snakePat = (function () {
    const rnd = mulberry(41);
    const raw = [];
    for (let i = 0; i <= SN; i++) raw.push(rnd());
    const sm = [];
    for (let i = 0; i <= SN; i++) {
      let s = 0, c = 0;
      for (let k = -3; k <= 3; k++) {
        const j = i + k;
        if (j >= 0 && j <= SN) { s += raw[j]; c++; }
      }
      const band = 0.5 + 0.5 * Math.sin(i * 0.55 + Math.sin(i * 0.13) * 2.2);
      sm.push(clamp(0.25 + 0.75 * (s / c) * band + 0.15, 0, 1));
    }
    return sm;
  })();

  function drawSnake(t) {
    const zHead = clamp(0.92 - SNAKE_RATE * t, 0.14, 0.98);
    const pts = [];
    for (let i = 0; i <= SN; i++) {
      const u = i / SN;
      const zi = clamp(zHead + u * SLZ, 0, 0.985);
      const p = prj(zi);
      const A = 232 * SF * Math.pow(1 - zi, 1.12); // amplitude kept below the half-wavelength so the body never self-crosses
      const xw =
        Math.sin(zi * 29 + 0.35 * t) * A +
        Math.sin(zi * 55 - 1.35 * t) * A * 0.11 +
        85 * SF * (1 - zi); // gentle drift right as it nears
      const profile =
        u < 0.05 ? lerp(0.52, 0.40, u / 0.05) :
        u < 0.5 ? lerp(0.40, 1.0, (u - 0.05) / 0.45) :
        lerp(1.0, 0.10, (u - 0.5) / 0.5);
      pts.push({
        x: W * 0.5 + xw * p.s,
        y: p.y,
        r: Math.max(0.4, 40 * profile * p.s)
      });
    }
    renderTube(pts, snakePat, {});

    // head on top
    const a = pts[0], b = pts[2];
    let dx = a.x - b.x, dy = a.y - b.y;
    const dl = Math.hypot(dx, dy) || 1;
    snakeHead(a.x, a.y, dx / dl, dy / dl, a.r * 1.05, t);
  }

  /* ======================================================================
     ACT 2 — COLOCATION RACKS (right side), self-sketching line art
     ====================================================================== */
  let rackSegs = [], rackLEDs = [];
  function buildRacks() {
    rackSegs = []; rackLEDs = [];
    if (!W) return;
    let order = 0;

    function rack(zr, xw, wW, hW) {
      const p = prj(zr);
      const cx = W * 0.5 + xw * p.s;
      const by = p.y;
      const rw = wW * p.s, rh = hW * p.s;
      const x0 = cx - rw / 2, x1 = cx + rw / 2, y0 = by - rh;
      const off = { x: -rw * 0.34, y: -rh * 0.045 };

      function seg(x1s, y1s, x2s, y2s, alpha, lw) {
        rackSegs.push({ a: [x1s, y1s], b: [x2s, y2s], al: alpha, lw: lw, o: order++ });
      }

      // side face (back-left)
      seg(x0, y0, x0 + off.x, y0 + off.y, 0.55, 1.1);
      seg(x0, by, x0 + off.x, by + off.y, 0.55, 1.1);
      seg(x0 + off.x, y0 + off.y, x0 + off.x, by + off.y, 0.55, 1.1);
      // side hatch
      for (let i = 1; i < 5; i++) {
        const yy = lerp(y0, by, i / 5);
        seg(x0, yy, x0 + off.x, yy + off.y, 0.25, 0.8);
      }
      // front frame
      seg(x0, by, x0, y0, 0.85, 1.5);
      seg(x1, by, x1, y0, 0.85, 1.5);
      seg(x0, y0, x1, y0, 0.85, 1.5);
      seg(x0, by, x1, by, 0.85, 1.5);
      // rails
      const rx0 = lerp(x0, x1, 0.10), rx1 = lerp(x0, x1, 0.90);
      seg(rx0, y0 + rh * 0.03, rx0, by - rh * 0.03, 0.5, 0.9);
      seg(rx1, y0 + rh * 0.03, rx1, by - rh * 0.03, 0.5, 0.9);
      // units
      const rows = 9;
      for (let rI = 0; rI < rows; rI++) {
        const uy0 = lerp(y0 + rh * 0.045, by - rh * 0.05, rI / rows);
        const uy1 = lerp(y0 + rh * 0.045, by - rh * 0.05, (rI + 0.82) / rows);
        seg(rx0, uy0, rx1, uy0, 0.65, 0.9);
        seg(rx0, uy1, rx1, uy1, 0.4, 0.8);
        // vents
        for (let vI = 1; vI <= 3; vI++) {
          const vy = lerp(uy0, uy1, vI / 4);
          seg(lerp(rx0, rx1, 0.07), vy, lerp(rx0, rx1, 0.62), vy, 0.22, 0.7);
        }
        rackLEDs.push({ x: lerp(rx0, rx1, 0.86), y: (uy0 + uy1) / 2, s: Math.max(1.4, rw * 0.016), seed: order * 13 + rI * 7 });
      }
      // feet
      seg(x0, by, x0 - rw * 0.05, by + rh * 0.012, 0.6, 1.2);
      seg(x1, by, x1 + rw * 0.05, by + rh * 0.012, 0.6, 1.2);
      return { top: [cx, y0], topL: [x0, y0], topR: [x1, y0], base: by, s: p.s };
    }

    const A = rack(0.50, 430 * SF, 240 * SF, 560);
    const B = rack(0.635, 1060 * SF, 220 * SF, 520);

    // overhead cable catenaries A → B
    for (let i = 0; i < 3; i++) {
      const y1 = A.topR[1] + i * 6 * A.s, y2 = B.topL[1] + i * 5 * B.s;
      rackSegs.push({
        bez: [A.topR[0], y1,
          lerp(A.topR[0], B.topL[0], 0.5), Math.max(y1, y2) + 34 * A.s + i * 8,
          B.topL[0], y2],
        al: 0.6, lw: 1.0, o: rackSegs.length
      });
    }
    // drop from rack A down to floor, then a floor tray run toward centre
    const dropX = A.topL[0] + 10;
    rackSegs.push({ bez: [dropX, A.topL[1], dropX - 30, lerp(A.topL[1], A.base, 0.5), dropX - 12, A.base + 6], al: 0.5, lw: 1.0, o: rackSegs.length });
    rackSegs.push({ bez: [dropX - 12, A.base + 6, dropX - 170, A.base + 26, dropX - 340, A.base + 30], al: 0.4, lw: 1.0, o: rackSegs.length });

    const total = rackSegs.length;
    rackSegs.forEach(function (s, i) { s.t0 = i / total; });
  }

  function drawRacks(t) {
    if (!rackSegs.length) return;
    const p = smooth(T.rackDraw[0], T.rackDraw[1], t);
    if (p <= 0) return;

    ctx.lineCap = 'round';
    for (let i = 0; i < rackSegs.length; i++) {
      const s = rackSegs[i];
      const lp = clamp((p - s.t0) * 4, 0, 1);
      if (lp <= 0) continue;
      ctx.strokeStyle = inkA(s.al);
      ctx.lineWidth = s.lw;
      ctx.beginPath();
      if (s.bez) {
        if (lp >= 1) {
          ctx.moveTo(s.bez[0], s.bez[1]);
          ctx.quadraticCurveTo(s.bez[2], s.bez[3], s.bez[4], s.bez[5]);
        } else {
          // partial bezier via subdivision
          ctx.moveTo(s.bez[0], s.bez[1]);
          const steps = 14;
          for (let k = 1; k <= Math.floor(steps * lp); k++) {
            const u = k / steps;
            const mx = lerp(lerp(s.bez[0], s.bez[2], u), lerp(s.bez[2], s.bez[4], u), u);
            const my = lerp(lerp(s.bez[1], s.bez[3], u), lerp(s.bez[3], s.bez[5], u), u);
            ctx.lineTo(mx, my);
          }
        }
      } else {
        ctx.moveTo(s.a[0], s.a[1]);
        ctx.lineTo(lerp(s.a[0], s.b[0], lp), lerp(s.a[1], s.b[1], lp));
      }
      ctx.stroke();
    }

    // LEDs blink once the sketch is done
    if (p >= 1) {
      for (let i = 0; i < rackLEDs.length; i++) {
        const L = rackLEDs[i];
        const on = ((Math.imul(L.seed, 2654435761) ^ Math.floor(t * 2.2 + i)) & 7) > 2;
        if (!on) continue;
        const isAcc = (i % 4 === 1);
        ctx.fillStyle = isAcc ? accA(0.85) : inkA(0.7);
        ctx.fillRect(L.x - L.s / 2, L.y - L.s / 2, L.s, L.s);
      }
    }
  }

  /* ======================================================================
     ACT 3 — THE WALKING BULL (left side, 2× the python's pace)
     ====================================================================== */
  function drawBull(t) {
    if (t < T.bullEnter) return;
    const tb = t - T.bullEnter;
    const z = clamp(0.86 - BULL_RATE * tb, 0.10, 0.92);
    const p = prj(z);
    const xw = SF * lerp(-620, -205, smooth(0.86, 0.10, z)); // drifts toward centre-left
    const cx = W * 0.5 + xw * p.s;
    const cy = p.y;

    const S = p.s * 1.06;         // overall scale
    const L = 250 * S, Hh = 130 * S; // body length / height
    const gait = tb * 2.4;        // walk cycle
    const bob = Math.sin(gait * 2) * 0.018 * Hh;
    const by = cy - Hh * 0.92 + bob; // torso centreline y

    ctx.save();

    // contact shadow
    ctx.beginPath();
    ctx.ellipse(cx, cy + Hh * 0.03, L * 0.52, Hh * 0.10, 0, 0, 6.3);
    ctx.fillStyle = inkA(0.10);
    ctx.fill();

    function leg(ax, ay, phase, front, near) {
      const stride = L * 0.20, stepH = Hh * 0.16;
      const cyc = ((gait + phase) % 1 + 1) % 1;
      let fx, lift;
      if (cyc < 0.62) { fx = lerp(stride * 0.5, -stride * 0.5, cyc / 0.62); lift = 0; }
      else { const q = (cyc - 0.62) / 0.38; fx = lerp(-stride * 0.5, stride * 0.5, q * q * (3 - 2 * q)); lift = Math.sin(q * Math.PI) * stepH; }
      const foot = { x: ax + fx, y: cy - lift };
      const knee = {
        x: (ax + foot.x) / 2 + (front ? L * 0.035 : -L * 0.045),
        y: lerp(ay, foot.y, 0.52)
      };
      const wTop = L * (near ? 0.064 : 0.056), wBot = L * 0.028;
      ctx.beginPath();
      ctx.moveTo(ax - wTop, ay);
      ctx.quadraticCurveTo(knee.x - wBot * 1.4, knee.y, foot.x - wBot, foot.y);
      ctx.lineTo(foot.x + wBot, foot.y);
      ctx.quadraticCurveTo(knee.x + wBot * 1.6, knee.y, ax + wTop, ay);
      ctx.closePath();
      ctx.fillStyle = near ? inkA(0.97) : inkA(0.6);
      ctx.fill();
      // hoof
      ctx.fillStyle = near ? inkA(0.98) : inkA(0.65);
      ctx.fillRect(foot.x - wBot * 1.3, foot.y - Hh * 0.025, wBot * 2.6, Hh * 0.035);
    }

    const hipY = by + Hh * 0.20;
    // far legs first
    leg(cx + L * 0.30 - L * 0.045, hipY, 0.50, true, false);
    leg(cx - L * 0.32 - L * 0.045, hipY, 0.00, false, false);

    // torso hull
    ctx.beginPath();
    ctx.moveTo(cx - L * 0.46, by - Hh * 0.05);                      // rump top
    ctx.bezierCurveTo(cx - L * 0.30, by - Hh * 0.34, cx - L * 0.05, by - Hh * 0.30, cx + L * 0.10, by - Hh * 0.42); // back → withers hump
    ctx.bezierCurveTo(cx + L * 0.28, by - Hh * 0.52, cx + L * 0.42, by - Hh * 0.30, cx + L * 0.46, by - Hh * 0.10); // hump → neck base
    ctx.bezierCurveTo(cx + L * 0.52, by + Hh * 0.14, cx + L * 0.42, by + Hh * 0.34, cx + L * 0.26, by + Hh * 0.36); // chest → brisket
    ctx.bezierCurveTo(cx + L * 0.02, by + Hh * 0.44, cx - L * 0.26, by + Hh * 0.42, cx - L * 0.40, by + Hh * 0.28); // belly
    ctx.bezierCurveTo(cx - L * 0.52, by + Hh * 0.16, cx - L * 0.52, by + Hh * 0.02, cx - L * 0.46, by - Hh * 0.05); // rump
    ctx.closePath();
    ctx.fillStyle = inkA(0.94);
    ctx.fill();

    // head — lowered, slight sway
    const sway = Math.sin(gait * 0.5) * L * 0.02;
    const hx = cx + L * 0.55 + sway, hy = by + Hh * 0.06 + Math.sin(gait * 2 + 1.4) * Hh * 0.02;
    ctx.beginPath();
    ctx.ellipse(hx, hy, L * 0.13, Hh * 0.20, -0.32, 0, 6.3);
    ctx.fillStyle = inkA(0.94);
    ctx.fill();
    // muzzle
    ctx.beginPath();
    ctx.ellipse(hx + L * 0.085, hy + Hh * 0.105, L * 0.06, Hh * 0.082, -0.3, 0, 6.3);
    ctx.fillStyle = inkA(0.96);
    ctx.fill();
    // neck join
    ctx.beginPath();
    ctx.moveTo(cx + L * 0.34, by - Hh * 0.40);
    ctx.quadraticCurveTo(cx + L * 0.52, by - Hh * 0.28, hx + L * 0.02, hy - Hh * 0.14);
    ctx.lineTo(hx - L * 0.02, hy + Hh * 0.18);
    ctx.quadraticCurveTo(cx + L * 0.42, by + Hh * 0.26, cx + L * 0.36, by + Hh * 0.30);
    ctx.closePath();
    ctx.fillStyle = inkA(0.94);
    ctx.fill();

    // horns — paper strokes
    ctx.strokeStyle = C.paper;
    ctx.lineWidth = Math.max(1.4, L * 0.020);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(hx - L * 0.02, hy - Hh * 0.16);
    ctx.quadraticCurveTo(hx - L * 0.10, hy - Hh * 0.34, hx - L * 0.005, hy - Hh * 0.44);
    ctx.moveTo(hx + L * 0.045, hy - Hh * 0.14);
    ctx.quadraticCurveTo(hx + L * 0.13, hy - Hh * 0.30, hx + L * 0.075, hy - Hh * 0.42);
    ctx.stroke();
    // ear + eye
    ctx.strokeStyle = 'rgba(255,255,255,0)';
    ctx.fillStyle = C.paper;
    ctx.beginPath();
    ctx.ellipse(hx - L * 0.065, hy - Hh * 0.10, L * 0.035, Hh * 0.035, -0.6, 0, 6.3);
    ctx.globalAlpha = 0.75;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(hx + L * 0.015, hy - Hh * 0.015, Math.max(1, L * 0.011), 0, 6.3);
    ctx.fillStyle = C.paper;
    ctx.fill();

    // tail
    const swish = Math.sin(t * 1.35) * L * 0.05;
    ctx.strokeStyle = inkA(0.9);
    ctx.lineWidth = Math.max(1.2, L * 0.016);
    ctx.beginPath();
    ctx.moveTo(cx - L * 0.47, by - Hh * 0.02);
    ctx.quadraticCurveTo(cx - L * 0.56, by + Hh * 0.22, cx - L * 0.52 + swish, by + Hh * 0.48);
    ctx.stroke();

    // near legs on top
    leg(cx + L * 0.30, hipY, 0.25, true, true);
    leg(cx - L * 0.32, hipY, 0.75, false, true);

    // carve hatches — engraved form lines across the barrel
    ctx.strokeStyle = C.paper;
    ctx.globalAlpha = 0.42;
    ctx.lineWidth = Math.max(0.8, L * 0.006);
    for (let i = 0; i < 7; i++) {
      const fx = lerp(-0.34, 0.30, i / 6);
      ctx.beginPath();
      ctx.moveTo(cx + L * fx, by - Hh * (0.30 - Math.abs(fx) * 0.22));
      ctx.quadraticCurveTo(cx + L * (fx + 0.045), by + Hh * 0.05, cx + L * fx, by + Hh * (0.36 - Math.abs(fx) * 0.1));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  /* ======================================================================
     ACT 4 — THE TABLEAU
     ====================================================================== */
  let faceImg = null, faceReady = false;
  if (typeof window.SCENE_FACE === 'string' && window.SCENE_FACE) {
    faceImg = new Image();
    faceImg.onload = function () { faceReady = true; };
    faceImg.src = window.SCENE_FACE;
  }

  function drawFigure(cx, gy, FH, t) {
    const sw = FH * 0.175;              // half shoulder width
    const top = gy - FH;
    const breathe = 1 + 0.004 * Math.sin(t * 0.9);

    ctx.save();
    ctx.translate(cx, gy);
    ctx.scale(1, breathe);
    ctx.translate(-cx, -gy);

    // shadow
    ctx.beginPath();
    ctx.ellipse(cx, gy + FH * 0.012, FH * 0.37, FH * 0.05, 0, 0, 6.3);
    ctx.fillStyle = inkA(0.13);
    ctx.fill();

    // trousers + shoes (under coat)
    ctx.fillStyle = inkA(0.9);
    ctx.fillRect(cx - sw * 0.42, gy - FH * 0.22, sw * 0.34, FH * 0.22);
    ctx.fillRect(cx + sw * 0.08, gy - FH * 0.22, sw * 0.34, FH * 0.22);
    ctx.beginPath();
    ctx.ellipse(cx - sw * 0.25, gy - FH * 0.008, sw * 0.30, FH * 0.02, 0, 0, 6.3);
    ctx.ellipse(cx + sw * 0.25, gy - FH * 0.008, sw * 0.30, FH * 0.02, 0, 0, 6.3);
    ctx.fill();

    // the long coat
    const cTop = top + FH * 0.135;   // collar line
    const hem = gy - FH * 0.155;
    ctx.beginPath();
    ctx.moveTo(cx - sw * 0.42, cTop + FH * 0.005);
    ctx.bezierCurveTo(cx - sw * 0.95, cTop + FH * 0.02, cx - sw * 1.06, cTop + FH * 0.075, cx - sw * 1.08, cTop + FH * 0.14); // L shoulder
    ctx.bezierCurveTo(cx - sw * 1.16, cTop + FH * 0.38, cx - sw * 1.10, hem - FH * 0.10, cx - sw * 1.02, hem);               // L side fall
    ctx.lineTo(cx + sw * 1.02, hem);
    ctx.bezierCurveTo(cx + sw * 1.10, hem - FH * 0.10, cx + sw * 1.16, cTop + FH * 0.38, cx + sw * 1.08, cTop + FH * 0.14);  // R side
    ctx.bezierCurveTo(cx + sw * 1.06, cTop + FH * 0.075, cx + sw * 0.95, cTop + FH * 0.02, cx + sw * 0.42, cTop + FH * 0.005); // R shoulder
    // collar notch
    ctx.quadraticCurveTo(cx + sw * 0.30, cTop + FH * 0.03, cx, cTop + FH * 0.055);
    ctx.quadraticCurveTo(cx - sw * 0.30, cTop + FH * 0.03, cx - sw * 0.42, cTop + FH * 0.005);
    ctx.closePath();
    ctx.fillStyle = inkA(0.96);
    ctx.fill();

    // fur texture — short paper ticks over the coat, deterministic
    const rnd = mulberry(97);
    ctx.strokeStyle = C.paper;
    ctx.globalAlpha = 0.30;
    ctx.lineWidth = Math.max(0.7, FH * 0.0035);
    ctx.beginPath();
    for (let i = 0; i < 240; i++) {
      const fx = (rnd() * 2 - 1);
      const fy = rnd();
      const px = cx + fx * sw * (0.98 + fy * 0.12);
      const py = lerp(cTop + FH * 0.02, hem - FH * 0.01, fy);
      const len = FH * (0.012 + rnd() * 0.02);
      const ang = 1.35 + (rnd() - 0.5) * 0.5 + fx * 0.22;
      ctx.moveTo(px, py);
      ctx.lineTo(px + Math.cos(ang) * len, py + Math.sin(ang) * len);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    // collar + centre seam carve lines
    ctx.strokeStyle = C.paper;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = Math.max(1, FH * 0.006);
    ctx.beginPath();
    ctx.moveTo(cx - sw * 0.42, cTop + FH * 0.005);
    ctx.quadraticCurveTo(cx - sw * 0.14, cTop + FH * 0.10, cx - sw * 0.06, cTop + FH * 0.30);
    ctx.moveTo(cx + sw * 0.42, cTop + FH * 0.005);
    ctx.quadraticCurveTo(cx + sw * 0.14, cTop + FH * 0.10, cx + sw * 0.06, cTop + FH * 0.30);
    ctx.moveTo(cx, cTop + FH * 0.32);
    ctx.lineTo(cx, hem - FH * 0.02);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // head
    const hr = FH * 0.062;
    const hcy = top + FH * 0.072;
    if (faceReady) {
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(cx, hcy, hr * 0.88, hr * 1.12, 0, 0, 6.3);
      ctx.clip();
      ctx.filter = 'grayscale(1) contrast(1.18) brightness(1.02)';
      const iw = faceImg.width, ih = faceImg.height;
      const scale = (hr * 2.4) / Math.min(iw, ih);
      ctx.drawImage(faceImg, cx - (iw * scale) / 2, hcy - (ih * scale) / 2.05, iw * scale, ih * scale);
      ctx.filter = 'none';
      ctx.restore();
      ctx.beginPath();
      ctx.ellipse(cx, hcy, hr * 0.88, hr * 1.12, 0, 0, 6.3);
      ctx.strokeStyle = inkA(0.85);
      ctx.lineWidth = Math.max(1, hr * 0.09);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.ellipse(cx, hcy, hr * 0.88, hr * 1.12, 0, 0, 6.3);
      ctx.fillStyle = C.paper; ctx.fill();
      ctx.fillStyle = inkA(0.12); ctx.fill();
      ctx.strokeStyle = inkA(0.85);
      ctx.lineWidth = Math.max(1, hr * 0.09);
      ctx.stroke();
      // hair mass
      ctx.beginPath();
      ctx.ellipse(cx, hcy - hr * 0.55, hr * 0.92, hr * 0.62, 0, Math.PI, 0);
      ctx.fillStyle = inkA(0.92);
      ctx.fill();
      // face hints
      ctx.strokeStyle = inkA(0.5);
      ctx.lineWidth = Math.max(0.8, hr * 0.05);
      ctx.beginPath();
      ctx.moveTo(cx - hr * 0.38, hcy - hr * 0.08); ctx.lineTo(cx - hr * 0.12, hcy - hr * 0.08);
      ctx.moveTo(cx + hr * 0.12, hcy - hr * 0.08); ctx.lineTo(cx + hr * 0.38, hcy - hr * 0.08);
      ctx.moveTo(cx - hr * 0.2, hcy + hr * 0.5); ctx.lineTo(cx + hr * 0.2, hcy + hr * 0.5);
      ctx.stroke();
    }

    ctx.restore();
  }

  function lyingBovine(cx, cy, S, flip, phase, t, isBear) {
    // S: body length scale unit; flip: faces left
    const L = 230 * S, Hh = 105 * S;
    const br = 1 + 0.012 * Math.sin(t * 1.05 + phase * 6);

    ctx.save();
    ctx.translate(cx, cy);
    if (flip) ctx.scale(-1, 1);
    ctx.scale(1, br);

    // shadow
    ctx.beginPath();
    ctx.ellipse(0, Hh * 0.30, L * 0.56, Hh * 0.15, 0, 0, 6.3);
    ctx.fillStyle = inkA(0.11);
    ctx.fill();

    // body mound
    ctx.beginPath();
    ctx.moveTo(-L * 0.52, Hh * 0.28);
    ctx.bezierCurveTo(-L * 0.56, -Hh * 0.18, -L * 0.28, -Hh * (isBear ? 0.52 : 0.44), 0, -Hh * (isBear ? 0.50 : 0.42));
    ctx.bezierCurveTo(L * 0.24, -Hh * (isBear ? 0.48 : 0.40), L * 0.46, -Hh * 0.16, L * 0.50, Hh * 0.06);
    ctx.bezierCurveTo(L * 0.52, Hh * 0.22, L * 0.36, Hh * 0.30, L * 0.20, Hh * 0.30);
    ctx.lineTo(-L * 0.40, Hh * 0.30);
    ctx.quadraticCurveTo(-L * 0.54, Hh * 0.32, -L * 0.52, Hh * 0.28);
    ctx.closePath();
    ctx.fillStyle = inkA(0.94);
    ctx.fill();

    // folded foreleg hint
    ctx.strokeStyle = C.paper;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = Math.max(1, L * 0.010);
    ctx.beginPath();
    ctx.moveTo(L * 0.16, Hh * 0.22);
    ctx.quadraticCurveTo(L * 0.30, Hh * 0.16, L * 0.40, Hh * 0.24);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // head + neck
    if (!isBear) {
      // bull: head up, horns
      const hx = L * 0.48, hy = -Hh * 0.42;
      ctx.beginPath();
      ctx.moveTo(L * 0.26, -Hh * 0.34);
      ctx.quadraticCurveTo(L * 0.44, -Hh * 0.52, hx, hy);
      ctx.quadraticCurveTo(L * 0.60, -Hh * 0.30, L * 0.56, -Hh * 0.02);
      ctx.quadraticCurveTo(L * 0.46, Hh * 0.10, L * 0.34, Hh * 0.04);
      ctx.closePath();
      ctx.fillStyle = inkA(0.94);
      ctx.fill();
      // skull + muzzle
      ctx.beginPath();
      ctx.ellipse(hx + L * 0.015, hy + Hh * 0.05, L * 0.085, Hh * 0.16, 0.35, 0, 6.3);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(hx + L * 0.075, hy + Hh * 0.20, L * 0.05, Hh * 0.09, 0.35, 0, 6.3);
      ctx.fillStyle = inkA(0.96);
      ctx.fill();
      // horns
      ctx.strokeStyle = C.paper;
      ctx.lineWidth = Math.max(1.3, L * 0.015);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(hx - L * 0.03, hy - Hh * 0.09);
      ctx.quadraticCurveTo(hx - L * 0.10, hy - Hh * 0.26, hx - L * 0.025, hy - Hh * 0.34);
      ctx.moveTo(hx + L * 0.035, hy - Hh * 0.07);
      ctx.quadraticCurveTo(hx + L * 0.115, hy - Hh * 0.22, hx + L * 0.065, hy - Hh * 0.32);
      ctx.stroke();
      // ear flick occasionally
      const fl = ((t + phase * 3) % 5.3) < 0.22 ? 0.5 : 0;
      ctx.fillStyle = C.paper;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.ellipse(hx - L * 0.055, hy - Hh * 0.02, L * 0.030, Hh * 0.035, -0.5 - fl, 0, 6.3);
      ctx.fill();
      ctx.globalAlpha = 1;
      // eye
      ctx.fillStyle = C.paper;
      ctx.beginPath();
      ctx.arc(hx + L * 0.012, hy + Hh * 0.015, Math.max(1, L * 0.010), 0, 6.3);
      ctx.fill();
    } else {
      /* bear: rounder skull, round ears, and THE YAWN.
         cycle: every 7s — open, hold, close. */
      const ty = ((t - 23 + phase) % 7 + 7) % 7;
      const yv = smooth(1.1, 2.0, ty) * (1 - smooth(3.2, 4.0, ty));
      const hx = L * 0.42, hy = -Hh * 0.46;
      const tilt = -0.30 - yv * 0.34;        // head tips back as it yawns

      // neck
      ctx.beginPath();
      ctx.moveTo(L * 0.20, -Hh * 0.36);
      ctx.quadraticCurveTo(L * 0.36, -Hh * 0.52, hx, hy);
      ctx.quadraticCurveTo(L * 0.56, -Hh * 0.24, L * 0.52, Hh * 0.02);
      ctx.quadraticCurveTo(L * 0.42, Hh * 0.12, L * 0.30, Hh * 0.06);
      ctx.closePath();
      ctx.fillStyle = inkA(0.94);
      ctx.fill();

      ctx.save();
      ctx.translate(hx, hy);
      ctx.rotate(tilt);
      // skull — oversized so the yawn carries at tableau distance
      ctx.beginPath();
      ctx.ellipse(0, 0, L * 0.125, Hh * 0.20, 0, 0, 6.3);
      ctx.fillStyle = inkA(0.95);
      ctx.fill();
      // upper muzzle — rotates up with the yawn
      ctx.save();
      ctx.rotate(-yv * 0.30);
      ctx.beginPath();
      ctx.ellipse(L * 0.13, Hh * 0.01, L * 0.082, Hh * 0.082, 0.08, 0, 6.3);
      ctx.fillStyle = inkA(0.96);
      ctx.fill();
      // nose
      ctx.beginPath();
      ctx.arc(L * 0.20, -Hh * 0.005, Math.max(1.4, L * 0.020), 0, 6.3);
      ctx.fillStyle = inkA(1);
      ctx.fill();
      ctx.restore();
      // lower jaw — swings wide
      ctx.save();
      ctx.rotate(yv * 0.78);
      ctx.beginPath();
      ctx.ellipse(L * 0.115, Hh * 0.09, L * 0.075, Hh * 0.058, 0.26, 0, 6.3);
      ctx.fillStyle = inkA(0.95);
      ctx.fill();
      ctx.restore();
      // mouth interior when open
      if (yv > 0.12) {
        ctx.beginPath();
        ctx.moveTo(L * 0.05, Hh * 0.035);
        ctx.quadraticCurveTo(L * 0.15, Hh * 0.02 + yv * Hh * 0.03, L * 0.175, -Hh * 0.01 - yv * Hh * 0.075);
        ctx.quadraticCurveTo(L * 0.17, Hh * 0.08 + yv * Hh * 0.13, L * 0.065, Hh * 0.085 + yv * Hh * 0.07);
        ctx.closePath();
        ctx.fillStyle = inkA(1);
        ctx.fill();
        // paper teeth, upper and lower
        ctx.fillStyle = C.paper;
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.moveTo(L * 0.145, -yv * Hh * 0.055);
        ctx.lineTo(L * 0.158, Hh * 0.02);
        ctx.lineTo(L * 0.132, Hh * 0.012);
        ctx.closePath();
        ctx.moveTo(L * 0.09, Hh * 0.075 + yv * Hh * 0.055);
        ctx.lineTo(L * 0.108, Hh * 0.04);
        ctx.lineTo(L * 0.078, Hh * 0.045);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      // round ears — the giveaway that this one is a bear
      ctx.fillStyle = inkA(0.95);
      ctx.beginPath();
      ctx.arc(-L * 0.06, -Hh * 0.20, L * 0.040, 0, 6.3);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(L * 0.05, -Hh * 0.225, L * 0.040, 0, 6.3);
      ctx.fill();
      ctx.strokeStyle = C.paper;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = Math.max(0.8, L * 0.008);
      ctx.beginPath();
      ctx.arc(-L * 0.06, -Hh * 0.20, L * 0.022, 0, 6.3);
      ctx.stroke();
      ctx.globalAlpha = 1;
      // eye — squeezed shut mid-yawn
      if (yv > 0.4) {
        ctx.strokeStyle = C.paper;
        ctx.lineWidth = Math.max(1, L * 0.011);
        ctx.beginPath();
        ctx.moveTo(-L * 0.01, -Hh * 0.05);
        ctx.lineTo(L * 0.03, -Hh * 0.062);
        ctx.stroke();
      } else {
        ctx.fillStyle = C.paper;
        ctx.beginPath();
        ctx.arc(L * 0.012, -Hh * 0.052, Math.max(1, L * 0.012), 0, 6.3);
        ctx.fill();
      }
      ctx.restore();
    }

    // tail curled along the flank
    ctx.strokeStyle = C.paper;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = Math.max(1, L * 0.010);
    ctx.beginPath();
    ctx.moveTo(-L * 0.50, Hh * 0.10);
    ctx.quadraticCurveTo(-L * 0.40, Hh * 0.28, -L * 0.18, Hh * 0.26);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // carve hatches
    ctx.strokeStyle = C.paper;
    ctx.globalAlpha = 0.38;
    ctx.lineWidth = Math.max(0.8, L * 0.006);
    for (let i = 0; i < 6; i++) {
      const fx = lerp(-0.38, 0.30, i / 5);
      ctx.beginPath();
      ctx.moveTo(L * fx, -Hh * (0.36 - Math.abs(fx) * 0.28));
      ctx.quadraticCurveTo(L * (fx + 0.05), -Hh * 0.02, L * fx, Hh * 0.28);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawCoiledPython(cx, cy, Sc, t) {
    const turns = 4.4 * Math.PI;
    const N2 = 90;
    const pts = [];
    for (let i = 0; i <= N2; i++) {
      const u = i / N2;                 // 0 = outer tail … 1 = head
      const th = turns * (1 - u);
      const rad = (10 + 66 * (1 - u)) * Sc;
      let x = cx + Math.cos(th) * rad;
      let y = cy + Math.sin(th) * rad * 0.42;
      // head rears up off the coil, gently swaying
      const riseP = smooth(0.80, 1, u);
      y -= riseP * 88 * Sc;
      x += riseP * Math.sin(t * 0.8) * 7 * Sc;
      const profile = u < 0.10 ? lerp(0.12, 0.75, u / 0.10) : u > 0.9 ? lerp(1, 0.66, (u - 0.9) / 0.1) : lerp(0.75, 1, (u - 0.1) / 0.8);
      pts.push({ x: x, y: y, r: Math.max(1, 14 * profile * Sc) });
    }
    pts.reverse(); // head first for the renderer
    renderTube(pts, snakePat, { boost: 1.3 });
    const a = pts[0], b = pts[2];
    let dx = a.x - b.x, dy = a.y - b.y;
    const dl = Math.hypot(dx, dy) || 1;
    snakeHead(a.x, a.y, dx / dl, dy / dl, a.r * 1.25, t);
  }

  function drawTableau(t) {
    const gy = H * 0.80;
    const FH = Math.min(H * 0.46, W * 0.42);
    const cx = W * 0.5;
    const u = Math.min(W, 1250);

    // faint ground line
    ctx.strokeStyle = inkA(0.10);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(W * 0.06, gy + H * 0.055);
    ctx.lineTo(W * 0.94, gy + H * 0.055);
    ctx.stroke();

    // back row first (painter's order)
    lyingBovine(cx - u * 0.345, gy - H * 0.010, u / 1250 * 0.66, false, 0.15, t, false); // bull, far left
    lyingBovine(cx + u * 0.325, gy - H * 0.006, u / 1250 * 0.62, true, 0.55, t, false);  // bull, far right
    drawFigure(cx, gy, FH, t);
    drawCoiledPython(cx - u * 0.025, gy + H * 0.048, FH / 340, t);                        // python at the feet
    lyingBovine(cx - u * 0.245, gy + H * 0.085, u / 1250 * 0.80, false, 0.85, t, false); // bull, front left
    lyingBovine(cx + u * 0.195, gy + H * 0.075, u / 1250 * 0.90, true, 0.0, t, true);    // BEAR, front right — yawns
  }

  /* ------------------------------ captions ------------------------------ */
  const CAPS = [
    { t0: 2.2, t1: 8.8, k: '01 · Pythonidae', ti: 'PYTHON', s: '≈1.6 km/h on open ground — my primary language, five years deep' },
    { t0: 9.4, t1: 13.8, k: '02 · exchange infrastructure', ti: 'COLOCATION', s: '18 Solace appliances · 60+ RHEL servers · National Stock Exchange' },
    { t0: 14.6, t1: 20.4, k: '03 · Bos taurus', ti: 'THE BULL', s: '≈3.2 km/h at a walk — 2× the python · permanent long bias' },
    { t0: 24.0, t1: 31.2, k: '04 · quantitative developer', ti: 'NILESH GAHLOT', s: 'OMS · execution · backtesting — the bear only yawns' }
  ];
  const ltEl = document.getElementById('lowerThird');
  const ltK = document.getElementById('ltKicker');
  const ltT = document.getElementById('ltTitle');
  const ltS = document.getElementById('ltSub');
  let capIdx = -1;

  function captions(t) {
    if (!ltEl) return;
    let idx = -1;
    for (let i = 0; i < CAPS.length; i++) {
      if (t >= CAPS[i].t0 && t <= CAPS[i].t1) { idx = i; break; }
    }
    if (idx === capIdx) return;
    capIdx = idx;
    if (idx === -1) { ltEl.classList.remove('is-in'); return; }
    ltK.textContent = CAPS[idx].k;
    ltT.textContent = CAPS[idx].ti;
    ltS.textContent = CAPS[idx].s;
    ltEl.classList.add('is-in');
  }

  /* ------------------------------ compositor ----------------------------- */
  function alphaApproach(t) {
    return smooth(T.fadeIn[0], T.fadeIn[1], t) * (1 - smooth(T.cut[0], T.cut[1], t));
  }
  function alphaTableau(t) {
    return smooth(T.cut[0] + 0.5, T.cut[1], t) * (1 - smooth(T.exhale[0], T.exhale[1], t));
  }

  function render(t) {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = C.paper;
    ctx.fillRect(0, 0, W, H);

    const aA = alphaApproach(t);
    const aT = alphaTableau(t);

    if (aA > 0.004) {
      ctx.save();
      ctx.globalAlpha = aA;
      // horizon breath — a faint distant ground shadow
      if (!hgGrad) {
        hgGrad = ctx.createLinearGradient(0, horizonY() - H * 0.04, 0, horizonY() + H * 0.30);
        hgGrad.addColorStop(0, inkA(0.055));
        hgGrad.addColorStop(1, inkA(0));
      }
      ctx.fillStyle = hgGrad;
      ctx.fillRect(0, horizonY() - H * 0.04, W, H * 0.34);

      drawRacks(t);
      drawBull(t);
      drawSnake(t);
      ctx.restore();
    }

    if (aT > 0.004) {
      ctx.save();
      ctx.globalAlpha = aT;
      drawTableau(t);
      ctx.restore();
    }

    grain();

    // vignette
    if (!vgGrad) {
      vgGrad = ctx.createRadialGradient(W / 2, H * 0.46, Math.min(W, H) * 0.42, W / 2, H * 0.5, Math.max(W, H) * 0.78);
      vgGrad.addColorStop(0, inkA(0));
      vgGrad.addColorStop(1, inkA(0.10));
    }
    ctx.fillStyle = vgGrad;
    ctx.fillRect(0, 0, W, H);

    captions(t);
  }

  /* ------------------------------- run loop ------------------------------ */
  readColours();
  fit();

  if (reduced) {
    render(26.5); // static tableau, name card up
    window.addEventListener('resize', function () { fit(); render(26.5); });
    window.addEventListener('ng:theme', function () { readColours(); grainTile = null; vgGrad = null; hgGrad = null; buildRacks(); render(26.5); });
    return;
  }

  let acc = 17;              // start mid-python so first paint isn't empty paper
  let last = performance.now();
  let running = true;

  // Only run while the film is on screen
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (en) {
      running = en[0].isIntersecting;
      last = performance.now();
    }, { threshold: 0.02 }).observe(cv);
  }

  window.addEventListener('resize', function () { fit(); render(acc); });
  window.addEventListener('ng:theme', function () {
    readColours(); grainTile = null; vgGrad = null; hgGrad = null; buildRacks();
    render(acc);
  });

  // rAF is throttled/absent while the document is hidden — repaint on return
  document.addEventListener('visibilitychange', function () {
    last = performance.now();
    if (!document.hidden) render(acc);
  });

  // debug/seek hook (used by dev tooling; harmless in production)
  window.__scene = {
    seek: function (s) { acc = ((s % LOOP) + LOOP) % LOOP; render(acc); },
    t: function () { return acc % LOOP; }
  };

  render(acc); // first paint immediately — never a blank canvas

  (function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden || !running) { last = now; return; }
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    acc = (acc + dt) % LOOP;
    render(acc);
  })(last);

})();
