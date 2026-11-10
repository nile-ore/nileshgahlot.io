/* =========================================================================
   scene3d.js — the 30-second one-take.

   A single continuous camera move through an off-white cyclorama, following
   a glossy black python:

     0:00  blank white frame (camera high above, everything lost in haze)
     0:01  top-down over the square cover print; the python crosses it
     0:09  tilt up — scattered cash, a duffle, a brushed-steel gull-wing coupé
     0:12  through the open passenger door, over the seats …
     0:14  … and out of the driver's door
     0:21  tilt up off the python's tail onto a walking, jacked black bull
     0:25  the figure in the long fur coat, dead centre; three bullish bulls
           on his left, one bearish bear slumped on his right
     0:30  the bull halts; pan straight up into white  → cut to 0:00

   The cut happens inside a pure-white frame, so the loop is invisible.
   Everything is a pure function of the loop time `t` (seconds), so any frame
   can be reproduced with window.__scene.seek(t).

   Units: 1 = 10 cm. No shadow maps — the studio is "shadowless"; objects are
   grounded by soft contact blobs only.

   Face hook: window.SCENE_FACE = 'assets/images/face.jpg' before load.
   ========================================================================= */

import * as THREE from '../vendor/three.module.js';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';

const host = document.getElementById('stage');
if (host) boot(host);

function boot(host) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const LOOP = 30;
  const TAU = Math.PI * 2;
  const V3 = THREE.Vector3;
  const UP = new V3(0, 1, 0);
  const lerp = THREE.MathUtils.lerp;
  const clamp = THREE.MathUtils.clamp;
  const sstep = (a, b, x) => THREE.MathUtils.smoothstep(x, a, b);

  const LOW = Math.min(screen.width || 1e4, screen.height || 1e4) < 700 ||
              (navigator.hardwareConcurrency || 8) <= 4;

  const VOID = 0xf3f1ec;                 // blown-out off-white

  /* ------------------------------------------------------------- renderer */
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, LOW ? 1.5 : 2));
  // No tone mapping: fog is blended in-shader, the background is a clear
  // colour. Any tone curve would make the two disagree and draw a horizon.
  renderer.toneMapping = THREE.NoToneMapping;
  host.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-hidden', 'true');

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(VOID);
  // Fog runs on view depth. Far = 170 keeps each beat isolated and makes the
  // opening frame (camera 230 up) pure white.
  scene.fog = new THREE.Fog(VOID, 75, 150);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.3, 700);

  /* ---- studio environment: strip softboxes, dark ceiling, pale floor.
     Glossy blacks and the steel need something to reflect. */
  {
    const g = new THREE.SphereGeometry(50, 64, 40);
    const p = g.attributes.position, col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const h = p.getY(i) / 50, dx = p.getX(i) / 50, dz = p.getZ(i) / 50;
      /* NOT a uniform white dome: under one, every glossy black mirrors
         white and reads mid-grey. Dark ceiling, two long strip softboxes at
         45-60 degrees (never at the zenith: the top-down opening would mirror
         it straight back off the print), pale floor bounce below. */
      let v = h < 0 ? lerp(0.42, 0.6, sstep(0, -0.5, h)) : lerp(0.42, 0.07, sstep(0, 0.3, h));
      const band = sstep(0.42, 0.52, h) * (1 - sstep(0.8, 0.88, h));
      v += 2.6 * band * sstep(0.15, 0.4, dx) * (1 - sstep(0.75, 0.95, Math.abs(dz)));
      v += 1.3 * band * sstep(0.3, 0.5, -dx);
      col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const es = new THREE.Scene();
    es.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(es, 0.03).texture;
    pm.dispose();
  }
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd9d6cf, 0.7));
  const top = new THREE.DirectionalLight(0xffffff, 1.1);
  top.position.set(30, 200, 60);
  scene.add(top);

  /* ------------------------------------------------------------- helpers */
  let seed = 20261110;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return [c, c.getContext('2d')];
  }
  function tex(c, srgb) {
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  const QID = new THREE.Quaternion();
  function sph(x, y, z, rx, ry, rz, rotZ, seg) {
    seg = seg || (LOW ? 12 : 16);
    const g = new THREE.SphereGeometry(1, seg, Math.max(8, seg - 4));
    const q = rotZ ? new THREE.Quaternion().setFromAxisAngle(new V3(0, 0, 1), rotZ) : QID;
    g.applyMatrix4(new THREE.Matrix4().compose(new V3(x, y, z), q, new V3(rx, ry, rz)));
    return g;
  }
  function box(w, h, d, x, y, z, rx, ry, rz) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rx || ry || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0)));
    g.translate(x, y, z);
    return g;
  }
  function cyl(rt, rb, h, x, y, z, seg) {
    const g = new THREE.CylinderGeometry(rt, rb, h, seg || 14);
    g.translate(x, y, z);
    return g;
  }
  // box running from point a to point b
  function beam(a, b, w, h) {
    const A = new V3(...a), B = new V3(...b);
    const g = new THREE.BoxGeometry(w, h, A.distanceTo(B));
    const m = new THREE.Matrix4().lookAt(A, B, UP);
    m.setPosition(A.clone().add(B).multiplyScalar(0.5));
    g.applyMatrix4(m);
    return g;
  }
  function quad(a, b, c, d) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...d], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1], 2));
    g.computeVertexNormals();
    return g;
  }
  // side profile (x,y) extruded across the width (z), centred
  function ext(pts, depth) {
    const g = new THREE.ExtrudeGeometry(
      new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], p[1]))),
      { depth, bevelEnabled: false, curveSegments: 1 });
    g.translate(0, 0, -depth / 2);
    return g;
  }
  // merge anything: normalises indexed / non-indexed and attribute sets
  function merge(list) {
    return mergeGeometries(list.map((g) => {
      const n = g.index ? g.toNonIndexed() : g;
      for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') n.deleteAttribute(k);
      if (!n.attributes.normal) n.computeVertexNormals();
      if (!n.attributes.uv) n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
      return n;
    }), false);
  }
  /* Swept tube along a centreline lying in the XY plane, radius varying
     along it, optionally flattened across (sz). Used for every animal part. */
  function tube(pts, radii, o) {
    o = o || {};
    const R = o.radial || (LOW ? 10 : 12), M = o.steps || 14, sz = o.sz || 1;
    const curve = new THREE.CatmullRomCurve3(pts.map(p => new V3(p[0], p[1], p[2] || 0)));
    const pos = [], uv = [], idx = [];
    const P = new V3(), T = new V3();
    for (let i = 0; i <= M; i++) {
      const t = i / M;
      curve.getPoint(t, P); curve.getTangent(t, T);
      const nx = -T.y, ny = T.x, nl = Math.hypot(nx, ny) || 1;
      const f = t * (radii.length - 1), k = Math.min(Math.floor(f), radii.length - 2);
      const r = lerp(radii[k], radii[k + 1], f - k);
      for (let j = 0; j <= R; j++) {
        const th = (j / R) * TAU, cs = Math.cos(th) * r, sn = Math.sin(th) * r * sz;
        pos.push(P.x + (nx / nl) * cs, P.y + (ny / nl) * cs, P.z + sn);
        uv.push(t, j / R);
      }
    }
    for (let i = 0; i < M; i++) for (let j = 0; j < R; j++) {
      const a = i * (R + 1) + j, b = a + R + 1, c = b + 1, d = a + 1;
      idx.push(a, d, b, b, d, c);
    }
    {
      // make sure the faces point OUT, whichever way the centreline runs
      const q = (n) => new V3(pos[n * 3], pos[n * 3 + 1], pos[n * 3 + 2]);
      const A = q(idx[0]), fn = new V3().crossVectors(q(idx[1]).sub(A), q(idx[2]).sub(A));
      if (fn.dot(A.clone().sub(curve.getPoint(0))) < 0) for (let i = 0; i < idx.length; i += 3) { const k = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = k; }
    }
    const g = new THREE.BufferGeometry();
    g.setIndex(idx);
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    return g;
  }

  /* ---- contact shadows: soft blobs, never a cast shadow ---------------- */
  const blobTex = (() => {
    const [c, x] = canvas(128, 128);
    const g = x.createRadialGradient(64, 64, 4, 64, 64, 64);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.45)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    return tex(c);
  })();
  function blob(w, d, opacity) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d),
      new THREE.MeshBasicMaterial({ map: blobTex, color: 0x000000, transparent: true, opacity, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.03;
    m.renderOrder = -1;
    return m;
  }

  /* ================================================== THE PYTHON'S TRACK
     Serpentine locomotion: every point of the body follows the same sinuous
     track over the ground. So the track is fixed in the world and the body
     is simply the stretch of it between tail and head. */
  const CAR_Z = -95;
  const pathCurve = new THREE.CatmullRomCurve3([
    [0, 110], [0, 60], [0, 0], [0, -60], [0, -104], [0, -112],
    [-6, -135], [-38, -165], [-100, -188], [-190, -196], [-300, -196]
  ].map(p => new V3(p[0], 0, p[1])), false, 'centripetal');
  pathCurve.arcLengthDivisions = 1500;
  const PATH_LEN = pathCurve.getLength();
  const PSTEP = 0.25, PN = Math.floor(PATH_LEN / PSTEP);
  const pathTab = new Float32Array((PN + 1) * 2);
  {
    const p = new V3();
    for (let i = 0; i <= PN; i++) {
      pathCurve.getPointAt(i / PN, p);
      pathTab[i * 2] = p.x; pathTab[i * 2 + 1] = p.z;
    }
  }
  function pathAt(s, out) {           // out.x, out.z
    const f = clamp(s / PSTEP, 0, PN - 1e-3), i = Math.floor(f), k = f - i;
    out.x = lerp(pathTab[i * 2], pathTab[i * 2 + 2], k);
    out.z = lerp(pathTab[i * 2 + 1], pathTab[i * 2 + 3], k);
    return out;
  }
  // height of whatever the python is lying on: floor, sill, seats, tunnel
  function ground(x, z) {
    if (Math.abs(x) > 9) return 0;
    const a = Math.abs(z - CAR_Z);
    return 4.2 * (1 - sstep(8.6, 13.5, a)) + 0.9 * (1 - sstep(1.2, 3.2, a));
  }

  const SNAKE_R = 1.35, SNAKE_L = 46;
  const S0 = 87, SPEED = 9.3;          // head arc position = S0 + SPEED·t
  const AMP = 5, KW = TAU / 26;
  const _p = { x: 0, z: 0 }, _q = { x: 0, z: 0 };

  function trackAt(s, out) {
    pathAt(s, _p); pathAt(s + 0.6, _q);
    let tx = _q.x - _p.x, tz = _q.z - _p.z;
    const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    // the wave is squeezed down to almost nothing where it threads the doors
    const env = Math.abs(_p.x) < 40 ? 0.08 + 0.92 * sstep(7, 26, Math.abs(_p.z - CAR_Z)) : 1;
    const off = AMP * env * Math.sin(KW * s);
    const x = _p.x + tz * off, z = _p.z - tx * off;
    out.set(x, ground(x, z), z);
    return out;
  }

  /* ---- scale texture: a height map of overlapping keeled scales -------- */
  const scaleTex = (() => {
    const S = 256, [c, x] = canvas(S, S);
    x.fillStyle = '#000'; x.fillRect(0, 0, S, S);
    const COLS = 4, ROWS = 8, cw = S / COLS, rh = S / ROWS;
    for (let r = -1; r <= ROWS; r++) for (let k = -1; k <= COLS; k++) {
      const cx = (k + (r & 1 ? 0.5 : 0)) * cw + cw / 2, cy = r * rh + rh / 2;
      const g = x.createRadialGradient(cx - cw * 0.12, cy, 1, cx, cy, cw * 0.56);
      g.addColorStop(0, '#fff'); g.addColorStop(0.6, '#999'); g.addColorStop(1, '#000');
      x.fillStyle = g;
      x.beginPath(); x.ellipse(cx, cy, cw * 0.56, rh * 0.98, 0, 0, TAU); x.fill();
    }
    const t = tex(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  })();
  scaleTex.repeat.set(15, 3);
  const skinTex = (() => {
    const S = 256, [c, x] = canvas(S, S);
    x.fillStyle = '#000'; x.fillRect(0, 0, S, S);
    const COLS = 4, ROWS = 8, cw = S / COLS, rh = S / ROWS;
    let sd = 99;
    const r2 = () => (sd = (sd * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let r = 0; r < ROWS; r++) for (let k = 0; k < COLS; k++) {
      const v = Math.round(14 + r2() * r2() * 60);        // mostly black, the odd silvered scale
      for (const ox of [0, S]) for (const oy of [0, S]) {
        const cx = (k + (r & 1 ? 0.5 : 0)) * cw + cw / 2 - (ox && k ? S : 0) + (ox && !k ? S : 0), cy = r * rh + rh / 2 - (oy && r ? S : 0) + (oy && !r ? S : 0);
        x.fillStyle = 'rgb(' + v + ',' + v + ',' + (v + 2) + ')';
        x.beginPath(); x.ellipse(cx, cy, cw * 0.44, rh * 0.8, 0, 0, TAU); x.fill();
      }
    }
    const t = tex(c, true);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.copy(scaleTex.repeat);
    return t;
  })();

  const snakeMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, map: skinTex, roughness: 0.26, metalness: 0,
    bumpMap: scaleTex, bumpScale: 6
  });

  const SEG = LOW ? 150 : 210, RAD = LOW ? 12 : 16;
  const vCount = (SEG + 1) * (RAD + 1);
  const sPos = new Float32Array(vCount * 3), sNor = new Float32Array(vCount * 3), sUv = new Float32Array(vCount * 2);
  const sIdx = [];
  for (let i = 0; i < SEG; i++) for (let j = 0; j < RAD; j++) {
    const a = i * (RAD + 1) + j, b = a + RAD + 1, c = b + 1, d = a + 1;
    // Winding must face OUT. Wound the other way the near wall is culled and
    // you look through the body at the inside of its far wall.
    sIdx.push(a, b, d, b, c, d);
  }
  for (let i = 0; i <= SEG; i++) for (let j = 0; j <= RAD; j++) {
    const k = (i * (RAD + 1) + j) * 2;
    sUv[k] = i / SEG; sUv[k + 1] = j / RAD;
  }
  const snakeGeo = new THREE.BufferGeometry();
  snakeGeo.setIndex(sIdx);
  snakeGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  snakeGeo.setAttribute('normal', new THREE.BufferAttribute(sNor, 3));
  snakeGeo.setAttribute('uv', new THREE.BufferAttribute(sUv, 2));
  const snake = new THREE.Mesh(snakeGeo, snakeMat);
  snake.frustumCulled = false;
  scene.add(snake);

  // soft ribbon of contact shadow under the body
  const ribPos = new Float32Array((SEG + 1) * 2 * 3), ribUv = new Float32Array((SEG + 1) * 2 * 2), ribIdx = [];
  for (let i = 0; i <= SEG; i++) { ribUv[i * 4] = 0; ribUv[i * 4 + 1] = 0.5; ribUv[i * 4 + 2] = 1; ribUv[i * 4 + 3] = 0.5; }
  for (let i = 0; i < SEG; i++) { const a = i * 2; ribIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const ribGeo = new THREE.BufferGeometry();
  ribGeo.setIndex(ribIdx);
  ribGeo.setAttribute('position', new THREE.BufferAttribute(ribPos, 3));
  ribGeo.setAttribute('uv', new THREE.BufferAttribute(ribUv, 2));
  const ribbon = new THREE.Mesh(ribGeo, new THREE.MeshBasicMaterial({
    map: blobTex, color: 0x000000, transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide
  }));
  ribbon.frustumCulled = false;
  ribbon.renderOrder = -1;
  scene.add(ribbon);

  const radiusAt = (b) =>
    b < 0.035 ? lerp(0.62, 0.86, b / 0.035) * SNAKE_R :
    b < 0.4 ? lerp(0.86, 1.0, (b - 0.035) / 0.365) * SNAKE_R :
    lerp(1.0, 0.06, Math.pow((b - 0.4) / 0.6, 1.35)) * SNAKE_R;

  /* ---- the head: a lofted python skull, not a blob. Circular where it meets
     the neck, flaring to the jaw hinge, then a long flat wedge to a blunt
     snout. It wears the same scale skin as the body, continued through the
     UVs, with slit-pupil eyes, nostrils, a lip line and a flicking tongue. */
  const headGroup = new THREE.Group();
  const tongue = new THREE.Group();
  {
    const rn = radiusAt(0), HL = rn * 5.6;
    const key = (K, t) => { let i = 0; while (i < K.length - 2 && t > K[i + 1][0]) i++; const a = K[i], b = K[i + 1]; return lerp(a[1], b[1], clamp((t - a[0]) / (b[0] - a[0]), 0, 1)); };
    const WK = [[0, 1], [0.15, 1.2], [0.38, 1.6], [0.6, 1.42], [0.8, 1.05], [0.92, 0.74], [0.97, 0.52], [0.99, 0.3], [1, 0.02]];
    const HK = [[0, 1], [0.2, 1.02], [0.42, 0.94], [0.7, 0.7], [0.9, 0.5], [0.97, 0.37], [0.99, 0.22], [1, 0.02]];
    const halfW = (t) => key(WK, t) * rn, halfH = (t) => key(HK, t) * rn, cy = (t) => halfH(t) - rn;   // belly stays on the floor
    const M = 30, RN = 22, pos = [], uv = [], idx = [];
    for (let i = 0; i <= M; i++) {
      const t = i / M, w = halfW(t), h = halfH(t);
      // a true circle where it joins the neck (no seam), squaring off forward
      const sq = sstep(0, 0.28, t), eT = lerp(1, 0.78, sq), eB = lerp(1, 0.62, sq), kB = lerp(1, 0.92, sq);
      for (let j = 0; j <= RN; j++) {
        const th = (j / RN) * TAU, c = Math.cos(th), sn = Math.sin(th);
        // squared-off cross-section: flat crown, flatter belly
        const x = w * Math.sign(c) * Math.pow(Math.abs(c), eT);
        const y = sn >= 0 ? h * Math.pow(sn, eT) : -h * kB * Math.pow(-sn, eB);
        pos.push(x, cy(t) + y, t * HL - 0.2);
        uv.push(-(t * HL) / SNAKE_L, j / RN);
      }
    }
    for (let i = 0; i < M; i++) for (let j = 0; j < RN; j++) {
      const a = i * (RN + 1) + j, b = a + RN + 1, c = b + 1, d = a + 1;
      idx.push(a, d, b, b, d, c);          // +z-forward loft: this order faces out
    }
    const hg = new THREE.BufferGeometry();
    hg.setIndex(idx);
    hg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    hg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    hg.computeVertexNormals();
    headGroup.add(new THREE.Mesh(hg, snakeMat));

    const eyeT = 0.66, ex = halfW(eyeT) * 0.86, ey = cy(eyeT) + halfH(eyeT) * 0.42, ez = eyeT * HL;
    const iris = [], pupil = [], dark = [];
    for (const s of [-1, 1]) {
      iris.push(sph(s * ex, ey, ez, 0.17, 0.18, 0.2, 0, 14));
      pupil.push(sph(s * (ex + 0.12), ey, ez + 0.02, 0.065, 0.15, 0.08, 0, 10));      // vertical slit
      dark.push(sph(s * 0.3 * rn, cy(0.955) + halfH(0.955) * 0.55, 0.955 * HL, 0.06, 0.05, 0.07, 0, 8));   // nostril
      for (let i = 0; i < 12; i++) {                                                  // lip line
        const t0 = lerp(0.34, 0.985, i / 12), t1 = lerp(0.34, 0.985, (i + 1) / 12);
        dark.push(beam([s * halfW(t0) * 0.985, cy(t0) - halfH(t0) * 0.3, t0 * HL], [s * halfW(t1) * 0.985, cy(t1) - halfH(t1) * 0.3, t1 * HL], 0.07, 0.05));
      }
    }
    headGroup.add(
      new THREE.Mesh(merge(iris), new THREE.MeshPhysicalMaterial({ color: 0xa9a9a6, roughness: 0.18, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.05 })),
      new THREE.Mesh(merge(pupil), new THREE.MeshPhysicalMaterial({ color: 0x000000, roughness: 0.1, clearcoat: 1 })),
      new THREE.Mesh(merge(dark), new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.9 }))
    );
    tongue.add(new THREE.Mesh(merge([
      box(0.11, 0.035, 1.3, 0, 0, 0.65),
      beam([0, 0, 1.3], [0.24, 0.02, 1.95], 0.06, 0.03), beam([0, 0, 1.3], [-0.24, 0.02, 1.95], 0.06, 0.03)
    ]), new THREE.MeshStandardMaterial({ color: 0x1d1d1f, roughness: 0.5 })));
    tongue.position.set(0, cy(0.985) - 0.05, 0.975 * HL);
    headGroup.add(tongue);
    scene.add(headGroup);
  }

  const cen = new Float32Array((SEG + 2) * 3);
  const _c = new V3(), _T = new V3(), _N = new V3(), _B = new V3(), _h = new V3();
  function updateSnake(t) {
    const sHead = S0 + SPEED * t;
    for (let i = 0; i <= SEG + 1; i++) {
      trackAt(sHead - (i / SEG) * SNAKE_L, _c);
      cen[i * 3] = _c.x; cen[i * 3 + 1] = _c.y; cen[i * 3 + 2] = _c.z;
    }
    for (let i = 0; i <= SEG; i++) {
      const b = i / SEG, r = radiusAt(b);
      const i0 = Math.max(0, i - 1), i1 = i + 1;
      _T.set(cen[i0 * 3] - cen[i1 * 3], cen[i0 * 3 + 1] - cen[i1 * 3 + 1], cen[i0 * 3 + 2] - cen[i1 * 3 + 2]).normalize();
      _N.crossVectors(UP, _T).normalize();
      _B.crossVectors(_T, _N).normalize();
      const cx = cen[i * 3], gy = cen[i * 3 + 1], cz = cen[i * 3 + 2], cy = gy + r * 0.94;
      for (let j = 0; j <= RAD; j++) {
        const th = (j / RAD) * TAU, cs = Math.cos(th), sn = Math.sin(th);
        const nx = _N.x * cs + _B.x * sn, ny = _N.y * cs + _B.y * sn, nz = _N.z * cs + _B.z * sn;
        const o = (i * (RAD + 1) + j) * 3;
        sNor[o] = nx; sNor[o + 1] = ny; sNor[o + 2] = nz;
        sPos[o] = cx + r * nx; sPos[o + 1] = cy + r * ny; sPos[o + 2] = cz + r * nz;
      }
      const w = r * 2.3, o = i * 6;
      ribPos[o] = cx - _N.x * w; ribPos[o + 1] = gy + 0.05; ribPos[o + 2] = cz - _N.z * w;
      ribPos[o + 3] = cx + _N.x * w; ribPos[o + 4] = gy + 0.05; ribPos[o + 5] = cz + _N.z * w;
    }
    snakeGeo.attributes.position.needsUpdate = true;
    snakeGeo.attributes.normal.needsUpdate = true;
    ribGeo.attributes.position.needsUpdate = true;

    _T.set(cen[0] - cen[3], cen[1] - cen[4], cen[2] - cen[5]).normalize();
    headGroup.position.set(cen[0], cen[1] + radiusAt(0) * 0.94, cen[2]);
    headGroup.lookAt(_h.copy(headGroup.position).add(_T));
    // the tongue: a quick double flick every couple of seconds
    const fl = Math.pow(Math.max(0, Math.sin(t * TAU / 2.4)), 6);
    tongue.visible = fl > 0.03;
    tongue.scale.set(1, 1, 0.1 + 0.9 * fl);
    tongue.rotation.x = 0.3 * Math.sin(t * 38) * fl;
  }

  /* ====================================================== THE COVER PRINT
     Stands in for the album sleeve: his own cover. Square to the lens at the
     top-down start, so the python crosses it corner to corner. */
  {
    const S = 1024, [c, x] = canvas(S, S);
    const t = tex(c, true);
    const draw = () => {
      x.fillStyle = '#0a0a0b'; x.fillRect(0, 0, S, S);
      const ink = '#cfcfcb', dim = '#6f6f6c';
      x.textBaseline = 'alphabetic';
      x.fillStyle = ink;
      x.font = '700 40px "Space Grotesk", Inter, sans-serif';
      x.fillText('NILESH GAHLOT', 64, 104);
      x.font = '500 22px "JetBrains Mono", monospace';
      x.fillStyle = dim;
      x.textAlign = 'right'; x.fillText('SIDE A · 2026', S - 64, 100); x.textAlign = 'left';
      // the artwork: an order-book ladder with the price path cut through it
      let sd = 7;
      const r2 = () => (sd = (sd * 1664525 + 1013904223) >>> 0) / 4294967296;
      const y0 = 170, rows = 46, rh = 9.6, mid = S / 2;
      for (let i = 0; i < rows; i++) {
        const y = y0 + i * rh, k = Math.abs(i - rows / 2) / (rows / 2);
        const wl = (0.15 + 0.85 * r2()) * (120 + 260 * (1 - k)), wr = (0.15 + 0.85 * r2()) * (120 + 260 * (1 - k));
        const v = Math.round(70 + 150 * (1 - k));
        x.fillStyle = 'rgb(' + v + ',' + v + ',' + (v - 3) + ')';
        x.fillRect(mid - 6 - wl, y, wl, 4.5);
        x.fillRect(mid + 6, y, wr, 4.5);
      }
      x.strokeStyle = '#f4f4f0'; x.lineWidth = 3; x.lineJoin = 'round';
      x.beginPath();
      let py = y0 + rows * rh * 0.62;
      for (let i = 0; i <= 60; i++) {
        const px = 64 + (S - 128) * i / 60;
        py += (r2() - 0.53) * 34; py = clamp(py, y0 + 20, y0 + rows * rh - 20);
        i ? x.lineTo(px, py) : x.moveTo(px, py);
      }
      x.stroke();
      x.fillStyle = ink;
      x.font = '700 168px "Space Grotesk", Inter, sans-serif';
      x.fillText('QUANT', 56, 800);
      x.fillText('DEVELOPER', 56, 944, S - 112);
      x.font = '500 20px "JetBrains Mono", monospace';
      x.fillStyle = dim;
      x.fillText('PYTHON · C++ · LOW LATENCY · MUMBAI', 64, 984);
      t.needsUpdate = true;
    };
    draw();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);

    const edge = new THREE.MeshStandardMaterial({ color: 0xe9e7e2, roughness: 0.8 });
    const face = new THREE.MeshStandardMaterial({ map: t, roughness: 0.34, metalness: 0 });
    const print = new THREE.Mesh(new THREE.BoxGeometry(30, 0.14, 30), [edge, edge, face, edge, edge, edge]);
    print.position.y = 0.07;
    const g = new THREE.Group();
    g.add(print, blob(37, 37, 0.3));
    g.rotation.y = -Math.PI / 4;
    scene.add(g);
  }

  /* ================================================== CASH AND THE DUFFLE */
  {
    /* The banknote: an obvious parody bill — "Quant Reserve Note", one
       hundred basis points, his portrait in the oval. Monochrome like the
       rest of the film. Drawn once blank, again when the portrait arrives. */
    const NW = 1024, NH = 432;
    const [nc, nx] = canvas(NW, NH);
    const [bc, bx] = canvas(NW, NH);
    const noteT = tex(nc, true), bandT = tex(bc, true);
    const INK = '#23231f', MID = '#5d5d56', SOFT = '#9b9a92';
    // text on a circle; `under` sets it along the bottom, still reading left to right
    const arcText = (c, str, cx, cy, r, a0, a1, font, under) => {
      c.save(); c.font = font; c.textAlign = 'center'; c.textBaseline = 'middle';
      for (let i = 0; i < str.length; i++) {
        const a = lerp(a0, a1, str.length > 1 ? i / (str.length - 1) : 0.5);
        c.save(); c.translate(cx + r * Math.cos(a), cy + r * Math.sin(a)); c.rotate(a + (under ? -Math.PI / 2 : Math.PI / 2)); c.fillText(str[i], 0, 0); c.restore();
      }
      c.restore();
    };
    const seal = (c, cx, cy, r, top, bottom, mid) => {
      c.strokeStyle = INK; c.fillStyle = INK;
      for (let i = 0; i < 40; i++) {                     // toothed edge
        const a = i * TAU / 40;
        c.beginPath(); c.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a)); c.lineTo(cx + (r + 5) * Math.cos(a + TAU / 80), cy + (r + 5) * Math.sin(a + TAU / 80)); c.lineTo(cx + r * Math.cos(a + TAU / 40), cy + r * Math.sin(a + TAU / 40)); c.fill();
      }
      c.lineWidth = 2.5; c.beginPath(); c.arc(cx, cy, r, 0, TAU); c.stroke();
      c.lineWidth = 1; c.beginPath(); c.arc(cx, cy, r - 19, 0, TAU); c.stroke();
      arcText(c, top, cx, cy, r - 10, -Math.PI * 0.84, -Math.PI * 0.16, '700 11px Georgia, serif');
      arcText(c, bottom, cx, cy, r - 10, Math.PI * 0.8, Math.PI * 0.2, '700 11px Georgia, serif', true);
      c.font = '700 ' + Math.round(r * 0.72) + 'px Georgia, serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(mid, cx, cy + 2); c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    };
    function drawNote(portrait) {
      const c = nx;
      c.globalCompositeOperation = 'source-over';
      c.fillStyle = '#e8e6de'; c.fillRect(0, 0, NW, NH);
      // security lattice: two families of fine sine lines
      c.lineWidth = 0.7; c.strokeStyle = 'rgba(70,70,62,0.2)';
      for (let k = 0; k < 2; k++) for (let i = -4; i < 30; i++) {
        c.beginPath();
        for (let x = 40; x <= NW - 40; x += 6) { const y = 30 + i * 15 + 16 * Math.sin(x / 34 + i * 0.5 + k * Math.PI); x === 40 ? c.moveTo(x, y) : c.lineTo(x, y); }
        c.stroke();
      }
      // frame
      c.strokeStyle = INK; c.lineWidth = 12; c.strokeRect(20, 20, NW - 40, NH - 40);
      c.lineWidth = 1.5; c.strokeRect(34, 34, NW - 68, NH - 68); c.strokeRect(40, 40, NW - 80, NH - 80);
      c.strokeStyle = '#e8e6de'; c.lineWidth = 1;
      for (let x = 30; x < NW - 26; x += 7) { c.beginPath(); c.moveTo(x, 15); c.lineTo(x + 5, 26); c.moveTo(x, NH - 26); c.lineTo(x + 5, NH - 15); c.stroke(); }
      // corner numerals in ornate blocks
      c.textBaseline = 'alphabetic';
      for (const [x, y] of [[48, 48], [NW - 48 - 150, 48], [48, NH - 48 - 78], [NW - 48 - 150, NH - 48 - 78]]) {
        c.fillStyle = INK; c.fillRect(x, y, 150, 78);
        c.strokeStyle = '#e8e6de'; c.lineWidth = 1.2; c.strokeRect(x + 5, y + 5, 140, 68);
        c.fillStyle = '#eeece4'; c.font = '700 62px Georgia, serif'; c.textAlign = 'center'; c.fillText('100', x + 75, y + 61);
      }
      c.textAlign = 'center'; c.fillStyle = INK;
      c.font = '700 27px Georgia, serif'; c.fillText('QUANT RESERVE NOTE', NW / 2, 76);
      c.font = '700 15px Georgia, serif'; c.fillStyle = MID;
      c.fillText('THE UNITED STATES OF ALPHA', NW / 2, 100);
      // portrait oval
      const ox = NW / 2, oy = 232, rx = 104, ry = 122;
      c.save(); c.beginPath(); c.ellipse(ox, oy, rx, ry, 0, 0, TAU); c.clip();
      c.fillStyle = '#d2d0c8'; c.fillRect(ox - rx, oy - ry, rx * 2, ry * 2);
      if (portrait) {
        const sc = (ry * 2 * 1.06) / portrait.height;
        c.filter = 'grayscale(1) contrast(1.2)';
        c.drawImage(portrait, ox - portrait.width * sc * 0.5 + 16, oy - ry - 6, portrait.width * sc, portrait.height * sc);
        c.filter = 'none';
        c.globalCompositeOperation = 'multiply'; c.fillStyle = '#e4e1d6'; c.fillRect(ox - rx, oy - ry, rx * 2, ry * 2);   // sink it into the paper
        c.globalCompositeOperation = 'source-over';
        c.strokeStyle = 'rgba(232,230,222,0.3)'; c.lineWidth = 0.8;                                   // engraver's lines
        for (let y = oy - ry; y < oy + ry; y += 3) { c.beginPath(); c.moveTo(ox - rx, y); c.lineTo(ox + rx, y); c.stroke(); }
      }
      c.restore();
      c.strokeStyle = INK; c.lineWidth = 5; c.beginPath(); c.ellipse(ox, oy, rx + 3, ry + 3, 0, 0, TAU); c.stroke();
      c.lineWidth = 1.2; c.beginPath(); c.ellipse(ox, oy, rx + 11, ry + 11, 0, 0, TAU); c.stroke();
      // name ribbon
      c.fillStyle = INK; c.fillRect(ox - 86, oy + ry - 4, 172, 26);
      c.fillStyle = '#eeece4'; c.font = '700 17px Georgia, serif'; c.fillText('N. GAHLOT', ox, oy + ry + 15);
      // seals
      seal(c, 282, 218, 62, 'QUANT RESERVE', 'MUMBAI', 'NG');
      seal(c, NW - 282, 218, 62, 'IN PYTHON', 'WE TRUST', 'α');
      // side copy
      c.fillStyle = MID; c.font = '700 11px Georgia, serif'; c.textAlign = 'left';
      ['THIS NOTE IS LEGAL TENDER', 'FOR ALL ALPHA,', 'PUBLIC AND PRIVATE'].forEach((t, i) => c.fillText(t, 60, 176 + i * 15));
      c.textAlign = 'right';
      ['REDEEMABLE IN', 'BASIS POINTS', 'ON DEMAND'].forEach((t, i) => c.fillText(t, NW - 60, 176 + i * 15));
      c.fillStyle = INK; c.font = '700 17px "JetBrains Mono", monospace';
      c.textAlign = 'left'; c.fillText('NG 20261110 A', 212, 150);
      c.textAlign = 'right'; c.fillText('NG 20261110 A', NW - 212, 150);
      c.textAlign = 'center'; c.font = '700 19px Georgia, serif';
      c.fillText('ONE HUNDRED', 296, 322); c.fillText('BASIS POINTS', NW - 296, 322);
      c.font = '700 9px Georgia, serif'; c.fillStyle = SOFT;
      c.fillText('PARODY  ·  NOT LEGAL TENDER  ·  PAST PERFORMANCE IS NOT INDICATIVE OF FUTURE RETURNS', NW / 2, NH - 46);
      c.textAlign = 'left';

      // the banded bundle: same note under a paper strap
      bx.drawImage(nc, 0, 0);
      bx.fillStyle = '#f6f5f1'; bx.fillRect(650, 0, 170, NH);
      bx.fillStyle = '#2a2a27'; bx.fillRect(650, 0, 4, NH); bx.fillRect(816, 0, 4, NH);
      bx.save(); bx.translate(735, NH / 2); bx.rotate(-Math.PI / 2);
      bx.fillStyle = '#2a2a27'; bx.font = '700 40px "JetBrains Mono", monospace'; bx.textAlign = 'center'; bx.textBaseline = 'middle'; bx.fillText('10,000 bps', 0, 0);
      bx.restore();
      noteT.needsUpdate = true; bandT.needsUpdate = true;
    }
    drawNote(null);
    {
      const pim = new Image();
      pim.onload = () => { drawNote(pim); frameAt(clock); };
      pim.src = 'assets/images/note-portrait.jpg';
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => drawNote(pim.complete && pim.naturalWidth ? pim : null));
    }

    const paper = new THREE.MeshStandardMaterial({ color: 0xd9d8d2, roughness: 0.9 });
    const noteM = new THREE.MeshStandardMaterial({ map: noteT, roughness: 0.85 });
    const bandM = new THREE.MeshStandardMaterial({ map: bandT, roughness: 0.85 });

    const NOTES = LOW ? 70 : 130, BUNDLES = 44;
    const notes = new THREE.InstancedMesh(new THREE.BoxGeometry(2.6, 0.02, 1.1), [paper, paper, noteM, noteM, paper, paper], NOTES);
    const bundles = new THREE.InstancedMesh(new THREE.BoxGeometry(2.6, 0.5, 1.1), [paper, paper, bandM, paper, paper, paper], BUNDLES);
    const o = new THREE.Object3D();
    for (let i = 0; i < NOTES; i++) {
      // two loose drifts either side of the python's line, thickest by the bag
      const nearBag = rnd() < 0.55;
      const x = nearBag ? -15 + (rnd() - 0.5) * 30 : (rnd() - 0.5) * 70;
      const z = nearBag ? -62 + (rnd() - 0.5) * 26 : -34 - rnd() * 48;
      o.position.set(x, 0.03 + rnd() * 0.12, z);
      o.rotation.set((rnd() - 0.5) * 0.1, rnd() * TAU, (rnd() - 0.5) * 0.1);
      o.updateMatrix(); notes.setMatrixAt(i, o.matrix);
    }
    // bundles: a spill out of the bag mouth, plus a few squared-off stacks
    const piles = [[-9.5, -58.5, 5, 0.3], [-8.5, -53, 3, -0.2], [-11, -55, 2, 0.9], [9, -70, 4, 0.5], [12.5, -72, 2, 0.4], [-20, -73, 3, 1.2]];
    let bi = 0;
    for (const [px, pz, n, ry] of piles) for (let k = 0; k < n && bi < BUNDLES; k++, bi++) {
      o.position.set(px + (rnd() - 0.5) * 0.3, 0.25 + k * 0.5, pz + (rnd() - 0.5) * 0.3);
      o.rotation.set(0, ry + (rnd() - 0.5) * 0.25, 0);
      o.updateMatrix(); bundles.setMatrixAt(bi, o.matrix);
    }
    for (; bi < BUNDLES; bi++) {
      o.position.set(-9 - rnd() * 16, 0.25, -60 + (rnd() - 0.5) * 22);     // kept clear of the python's line
      o.rotation.set(0, rnd() * TAU, 0);
      o.updateMatrix(); bundles.setMatrixAt(bi, o.matrix);
    }
    scene.add(notes, bundles);

    // the duffle — black quilted leather, steel hardware, no marks
    const [qc, qx] = canvas(128, 128);
    qx.fillStyle = '#808080'; qx.fillRect(0, 0, 128, 128);
    qx.strokeStyle = '#1a1a1a'; qx.lineWidth = 5;
    for (let i = -128; i <= 256; i += 32) {
      qx.beginPath(); qx.moveTo(i, 0); qx.lineTo(i + 128, 128); qx.stroke();
      qx.beginPath(); qx.moveTo(i, 128); qx.lineTo(i + 128, 0); qx.stroke();
    }
    const quilt = tex(qc);
    quilt.wrapS = quilt.wrapT = THREE.RepeatWrapping; quilt.repeat.set(6, 3);
    const hide = new THREE.MeshPhysicalMaterial({ color: 0x0b0b0b, roughness: 0.46, clearcoat: 0.35, clearcoatRoughness: 0.4, bumpMap: quilt, bumpScale: 1.2 });
    const hardware = new THREE.MeshStandardMaterial({ color: 0xc9cacb, roughness: 0.28, metalness: 1 });

    const bag = new THREE.Group();
    const shell = new THREE.CylinderGeometry(2.7, 2.7, 9.5, 28, 1, true);
    shell.rotateZ(Math.PI / 2);
    const body = new THREE.Mesh(merge([shell, sph(-4.75, 0, 0, 1.1, 2.7, 2.7, 0, 24), sph(4.75, 0, 0, 1.1, 2.7, 2.7, 0, 24)]), hide);
    body.scale.y = 0.82; body.position.y = 2.25;
    const straps = [], metal = [];
    for (const sx of [-2.6, 2.6]) {
      const band = new THREE.TorusGeometry(2.74, 0.2, 8, 36); band.rotateY(Math.PI / 2); band.translate(sx, 0, 0);
      straps.push(band);
      for (const sz of [-1, 1]) {
        const h = new THREE.TorusGeometry(1.9, 0.2, 8, 24, Math.PI); h.rotateX(sz * 1.05); h.translate(0, 2.2, sz * 1.1);
        if (sx < 0) straps.push(h);
        metal.push(box(0.5, 0.3, 0.5, sx, 2.6, sz * 0.9));
      }
    }
    const strapMesh = new THREE.Mesh(merge(straps), new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.6 }));
    strapMesh.scale.y = 0.82; strapMesh.position.y = 2.25;
    metal.push(box(8.6, 0.12, 0.34, 0, 2.72, 0));
    const metalMesh = new THREE.Mesh(merge(metal), hardware);
    metalMesh.scale.y = 0.82; metalMesh.position.y = 2.25;
    bag.add(body, strapMesh, metalMesh, blob(18, 10, 0.5));
    bag.position.set(-13.5, 0, -62);
    bag.rotation.y = 0.55;
    scene.add(bag);
  }

  /* ============================================ THE GULL-WING STEEL COUPÉ
     Local frame: +x nose, +y up, +z the passenger (right) side. The python's
     line runs along world −z through x = 0: in the passenger door, across
     both seats, out of the driver's door.

     Proportions follow a real low wedge coupé at 1 unit = 10 cm: 42 long,
     18.6 wide, 11.3 tall, 24 wheelbase, 6-unit wheels. The body is folded
     sheet — flat planes and hard creases — so realism comes from the plan
     taper, the shoulder crease, bevelled edges, panel detail and wheels. */
  {
    const car = new THREE.Group();
    car.position.set(0, 0, CAR_Z);
    const HW = 9.3, GC = 1.7, SILL = 3.6, CREASE = 6.5, BELT = 7.9, ROOF = 11.3;

    const brushed = (() => {
      const [c, x] = canvas(256, 256);
      x.fillStyle = '#808080'; x.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 3200; i++) {
        const v = Math.floor(rnd() * 255);
        x.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',0.3)';
        x.fillRect(rnd() * 256 - 60, rnd() * 256, 40 + rnd() * 160, 1);
      }
      const t = tex(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(0.1, 0.9);
      return t;
    })();
    const steelM = new THREE.MeshStandardMaterial({
      color: 0xdcdee0, roughness: 0.46, metalness: 1, envMapIntensity: 1.5,
      roughnessMap: brushed, bumpMap: brushed, bumpScale: 0.5
    });
    const fasciaM = new THREE.MeshStandardMaterial({ color: 0x3a3b3d, roughness: 0.7, metalness: 0.1 });
    const blackM = new THREE.MeshStandardMaterial({ color: 0x070708, roughness: 0.65 });
    const rubberM = new THREE.MeshStandardMaterial({ color: 0x0b0b0b, roughness: 0.9 });
    const leatherM = new THREE.MeshPhysicalMaterial({ color: 0x141415, roughness: 0.55, clearcoat: 0.2, clearcoatRoughness: 0.5 });
    const glassM = new THREE.MeshStandardMaterial({ color: 0x0d1114, roughness: 0.04, metalness: 0.9, envMapIntensity: 1.6, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
    const lampM = new THREE.MeshPhysicalMaterial({ color: 0xf2f3f3, roughness: 0.08, metalness: 0.5, clearcoat: 1, envMapIntensity: 1.8 });
    const tailM = new THREE.MeshPhysicalMaterial({ color: 0x2a2a2c, roughness: 0.15, clearcoat: 1 });

    // side profile extruded across the width, with a small bevel on every edge
    const extB = (pts, width, b) => {
      b = b == null ? 0.16 : b;
      const g = new THREE.ExtrudeGeometry(
        new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], p[1]))),
        { depth: width - 2 * b, bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: 2, curveSegments: 1 });
      g.translate(0, 0, -(width - 2 * b) / 2);
      return g;
    };
    const clipY = (pts, yc, above) => {
      const out = [], inside = (p) => (above ? p[1] >= yc : p[1] <= yc);
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length], ia = inside(a), ib = inside(b);
        if (ia) out.push(a);
        if (ia !== ib) { const t = (yc - a[1]) / (b[1] - a[1]); out.push([a[0] + (b[0] - a[0]) * t, yc]); }
      }
      return out.filter((p, i) => { const q = out[(i + 1) % out.length]; return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-3; });
    };
    // plan taper: the nose and tail pinch in; applied to every body part
    const taper = (x) => 1 - 0.1 * sstep(12.5, 22.5, x) - 0.045 * sstep(-12, -20.5, x);
    const shape = (g, fn) => {
      const n = g.index ? g.toNonIndexed() : g, p = n.attributes.position, v = new V3();
      for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); fn(v); p.setXYZ(i, v.x, v.y, v.z); }
      n.computeVertexNormals();
      return n;
    };
    const body = (g) => shape(g, (v) => { v.z *= taper(v.x); });
    const shoulder = (g) => shape(g, (v) => { v.z *= taper(v.x) * (1 - 0.03 * Math.max(0, v.y - CREASE)); });
    // slab between two (y, z) lines, running x0 → x1
    const slab = (x0, x1, ya, za, yb, zb, t) => {
      const g = new THREE.BoxGeometry(x1 - x0, Math.hypot(yb - ya, zb - za), t);
      g.rotateX(Math.atan2(zb - za, yb - ya));
      g.translate((x0 + x1) / 2, (ya + yb) / 2, (za + zb) / 2);
      return g;
    };
    const arch = (cx, R, cy) => {
      const out = [], th0 = Math.asin((GC - cy) / R);
      for (let i = 0; i <= 20; i++) { const th = lerp(th0, Math.PI - th0, i / 20); out.push([cx + R * Math.cos(th), cy + R * Math.sin(th)]); }
      return out;
    };
    const FX = 13.2, RX = -11, FR = 2.9, RR = 3.0;        // axle positions, wheel radii

    const steel = [], fascia = [], black = [], leather = [], lamps = [], tails = [], glass = [];

    /* ---- body shell ---- */
    const front = [[8.5, GC], [8.5, BELT], [21.4, 5.6], [22.0, 4.7], [21.8, 2.3], [20.9, GC], ...arch(FX, FR + 0.45, FR)];
    const rear = [[-6, GC], ...arch(RX, RR + 0.45, RR), [-19.3, GC], [-20.2, 2.6], [-20.2, 7.4], [-19.6, BELT], [-6, BELT]];
    for (const prof of [front, rear]) {
      steel.push(body(extB(clipY(prof, CREASE, false), HW * 2)));         // below the crease: upright
      steel.push(shoulder(extB(clipY(prof, CREASE, true), HW * 2)));      // above it: leans in
    }
    // fastback: full width at the beltline, pinched to the roof (tumblehome)
    const tumble = (y) => lerp(1, 0.66, clamp((y - BELT) / (ROOF - BELT), 0, 1));
    const sideZ = (y) => HW * (1 - 0.03 * (BELT - CREASE)) * tumble(y);
    steel.push(shape(extB([[-6, BELT], [-6, ROOF], [-8, ROOF - 0.05], [-19, 8.3], [-19.6, BELT]], sideZ(BELT) * 2),
      (v) => { v.z *= tumble(v.y) * taper(v.x); }));
    for (const s of [-1, 1]) {
      steel.push(box(14.5, SILL - GC, 1.3, 1.25, (SILL + GC) / 2, s * 8.65));          // sill
      steel.push(beam([8.5, BELT, s * 8.3], [2.6, ROOF, s * 5.75], 0.55, 0.7));        // A-pillar
      glass.push(quad([-6.7, 8.3, s * (sideZ(8.3) + 0.04)], [-12.6, 8.3, s * (sideZ(8.3) + 0.04)],
        [-9.6, 10.5, s * (sideZ(10.5) + 0.04)], [-6.7, 10.9, s * (sideZ(10.9) + 0.04)]));   // quarter light
    }
    steel.push(box(8.8, 0.32, 3.0, -1.7, ROOF - 0.16, 0));                // roof spine
    steel.push(box(1.0, 0.36, 11.6, 2.6, ROOF - 0.16, 0));                // screen header
    glass.push(quad([8.5, BELT, 8.3], [8.5, BELT, -8.3], [2.6, ROOF, -5.75], [2.6, ROOF, 5.75]));

    /* ---- trim: fascias, lamps, strips, louvres ---- */
    fascia.push(body(extB([[21.3, 2.0], [21.3, 5.5], [22.5, 5.2], [22.9, 4.4], [22.9, 2.9], [22.3, 2.0]], HW * 2 - 0.2, 0.2)));
    fascia.push(body(extB([[-19.9, 2.4], [-20.9, 2.9], [-20.9, 7.0], [-19.9, 7.6]], HW * 2 - 0.2, 0.2)));
    black.push(body(box(0.2, 1.25, 15.4, 22.9, 4.45, 0)));                // lamp recess
    for (let i = 0; i < 4; i++) black.push(body(box(0.26, 0.09, 6.2, 22.95, 4.05 + i * 0.27, 0)));   // grille bars
    for (const s of [-1, 1]) {
      lamps.push(body(box(0.22, 0.95, 1.9, 23.0, 4.45, s * 6.6)), body(box(0.22, 0.95, 1.9, 23.0, 4.45, s * 4.5)));
      lamps.push(body(box(0.2, 0.4, 1.6, 22.75, 3.1, s * 6.9)));          // indicator
      // tail-lamp grid: two rows of four blocks
      for (let r = 0; r < 2; r++) for (let k = 0; k < 4; k++)
        tails.push(body(box(0.22, 0.85, 0.95, -20.95, 4.6 + r * 1.0, s * (3.6 + k * 1.1))));
      // black rub strip along the flanks, broken by the arches
      for (const [x0, x1] of [[16.8, 21.4], [-20.1, -14.6]])
        black.push(body(box(x1 - x0, 0.32, 0.12, (x0 + x1) / 2, 5.4, s * (HW + 0.02))));
      black.push(beam([8.9, BELT + 0.03, s * 2.7], [21.1, 5.68, s * 2.4], 0.1, 0.06));    // bonnet grooves
      black.push(box(14.5, 0.5, 0.2, 1.25, GC + 0.25, s * 9.32));         // rocker
    }
    black.push(body(box(0.24, 1.2, 4.2, -20.95, 5.1, 0)));                // plate recess
    black.push(box(0.6, 0.16, 16.4, 8.6, BELT + 0.05, 0));                // cowl
    black.push(box(14.5, 0.5, HW * 2 - 0.4, 1.25, GC + 0.25, 0));         // floor pan
    for (let i = 0; i < 9; i++) {                                        // louvres over the engine
      const k = (i + 0.5) / 9, lx = lerp(-8.6, -18.6, k), ly = lerp(11.2, 8.5, k);
      black.push(box(0.95, 0.12, sideZ(ly) * 2 * 0.86 * taper(lx), lx, ly + 0.1, 0, 0, 0, 0.42));
    }

    /* ---- cabin ---- */
    const seat = [[2.6, 2.2], [2.6, 3.9], [1.8, 4.2], [-3.6, 3.7], [-5.0, 9.6], [-5.3, 10.2], [-6.0, 10.2], [-6.3, 9.4], [-5.4, 2.2]];
    for (const s of [-1, 1]) {
      const g = extB(seat, 5.2, 0.4); g.translate(0, 0, s * 4.9); leather.push(g);
      leather.push(box(0.5, 4.2, 0.7, -4.4, 6.6, s * 2.6, 0, 0, 0.25), box(0.5, 4.2, 0.7, -4.4, 6.6, s * 7.2, 0, 0, 0.25));   // bolsters
    }
    leather.push(extB([[-5.5, 2.2], [-5.5, 4.7], [5.0, 4.9], [7.2, 6.2], [7.2, 2.2]], 2.8, 0.3));   // tunnel + console
    leather.push(extB([[5.6, 5.2], [5.2, 7.2], [6.0, 7.7], [8.5, 7.8], [8.5, 4.4], [7.0, 4.4]], 16.4, 0.25));   // dashboard
    black.push(box(1.6, 1.1, 4.2, 5.4, 7.7, -4.9));                       // binnacle
    black.push(cyl(0.16, 0.16, 1.5, 2.2, 5.5, 0, 8), sph(2.2, 6.3, 0, 0.36, 0.36, 0.36));   // gear lever
    const wheel = new THREE.TorusGeometry(1.5, 0.19, 10, 32);
    wheel.rotateY(Math.PI / 2); wheel.rotateZ(-0.4); wheel.translate(4.3, 7.0, -4.9);
    black.push(wheel, beam([4.3, 7.0, -4.9], [5.6, 6.5, -4.9], 0.3, 0.3), beam([4.3, 5.6, -4.9], [4.3, 8.4, -4.9], 0.2, 0.16));

    /* ---- wheels: rounded tyre, steel rim, turbine face ---- */
    const [wc, wx] = canvas(256, 256);
    wx.fillStyle = '#b4b6b8'; wx.beginPath(); wx.arc(128, 128, 128, 0, TAU); wx.fill();
    wx.strokeStyle = '#e4e5e6'; wx.lineWidth = 9; wx.beginPath(); wx.arc(128, 128, 120, 0, TAU); wx.stroke();
    wx.fillStyle = '#121213';
    for (let i = 0; i < 14; i++) {
      wx.save(); wx.translate(128, 128); wx.rotate(i * TAU / 14);
      wx.beginPath(); wx.moveTo(-5, -46); wx.lineTo(5, -46); wx.lineTo(11, -106); wx.lineTo(-11, -106); wx.closePath(); wx.fill();
      wx.restore();
    }
    wx.fillStyle = '#6d6e70'; wx.beginPath(); wx.arc(128, 128, 30, 0, TAU); wx.fill();
    wx.fillStyle = '#cfd0d1'; wx.beginPath(); wx.arc(128, 128, 15, 0, TAU); wx.fill();
    wx.fillStyle = '#2a2a2b';
    for (let i = 0; i < 5; i++) { wx.beginPath(); wx.arc(128 + 22 * Math.cos(i * TAU / 5), 128 + 22 * Math.sin(i * TAU / 5), 3, 0, TAU); wx.fill(); }
    const rimM = new THREE.MeshStandardMaterial({ map: tex(wc, true), roughness: 0.4, metalness: 0.75 });
    const tyres = [], rims = [], faces = [];
    for (const [wxp, wr] of [[FX, FR], [RX, RR]]) for (const s of [-1, 1]) {
      const z = s * (HW * taper(wxp) - 1.25);
      const ty = new THREE.LatheGeometry([[1.95, -1.15], [2.55, -1.2], [2.86, -1.0], [3.0, -0.6], [3.0, 0.6], [2.86, 1.0], [2.55, 1.2], [1.95, 1.15]]
        .map(p => new THREE.Vector2(p[0] * wr / 3, p[1])), 36);
      ty.rotateX(Math.PI / 2); ty.translate(wxp, wr, z); tyres.push(ty);
      const rm = new THREE.CylinderGeometry(1.98 * wr / 3, 1.98 * wr / 3, 2.1, 28, 1, true); rm.rotateX(Math.PI / 2); rm.translate(wxp, wr, z); rims.push(rm);
      const fc = new THREE.CircleGeometry(1.98 * wr / 3, 36); if (s < 0) fc.rotateY(Math.PI); fc.translate(wxp, wr, z + s * 0.95); faces.push(fc);
      // dark wheel well behind the tyre
      const well = new THREE.CylinderGeometry(wr + 0.4, wr + 0.4, 2.6, 24, 1, false, -Math.PI / 2, Math.PI);
      well.rotateX(Math.PI / 2); well.translate(wxp, wr, z - s * 1.6); black.push(well);
    }

    car.add(
      new THREE.Mesh(merge(steel), steelM),
      new THREE.Mesh(merge(fascia), fasciaM),
      new THREE.Mesh(merge(black), blackM),
      new THREE.Mesh(merge(leather), leatherM),
      new THREE.Mesh(merge(lamps), lampM),
      new THREE.Mesh(merge(tails), tailM),
      new THREE.Mesh(merge(tyres), rubberM),
      new THREE.Mesh(merge(rims), steelM),
      new THREE.Mesh(merge(faces), rimM),
      new THREE.Mesh(merge(glass), glassM)
    );

    /* ---- the doors: hinged on the roof spine, thrown open ---- */
    for (const s of [-1, 1]) {
      const door = new THREE.Group();
      door.position.set(0, ROOF - 0.1, s * 1.5);
      const z = (v) => s * v;
      const skin = [
        box(8.5, 0.3, 4.25, -1.65, -0.05, z(2.125)),                               // roof section
        slab(-5.9, 8.4, -3.3, z(7.4), -7.6, z(7.8), 0.45)                          // door skin
      ];
      const frame = [
        beam([-5.9, -0.1, z(4.25)], [-5.9, -3.3, z(7.4)], 0.4, 0.4),
        beam([2.6, -0.1, z(4.25)], [8.4, -3.3, z(7.4)], 0.4, 0.4),
        beam([-5.9, -3.3, z(7.4)], [8.4, -3.3, z(7.4)], 0.3, 0.3),
        slab(-5.9, 8.4, -5.65, z(7.88), -5.95, z(7.91), 0.1),                      // rub strip
        box(1.3, 0.8, 1.3, 7.4, -2.95, z(8.2)),                                    // mirror
        box(1.5, 0.2, 0.12, -3.8, -4.3, z(7.76))                                   // handle
      ];
      const trim = [slab(-5.5, 8.0, -3.6, z(7.08), -7.3, z(7.42), 0.3), box(5, 0.7, 0.8, 0, -5.4, z(6.9))];
      door.add(
        new THREE.Mesh(merge(skin), steelM),
        new THREE.Mesh(merge(frame), blackM),
        new THREE.Mesh(merge(trim), leatherM),
        new THREE.Mesh(quad([-5.9, -0.1, z(4.25)], [2.6, -0.1, z(4.25)], [8.4, -3.3, z(7.4)], [-5.9, -3.3, z(7.4)]), glassM)
      );
      door.rotation.x = -s * 1.2;
      car.add(door);
    }
    car.add(blob(58, 28, 0.7));
    scene.add(car);
  }

  /* ====================================================== BULLS AND A BEAR
     One joint rig, different meat and poses. Rigid segments on a small
     hierarchy — matte black hides every seam. */
  const furM = new THREE.MeshPhysicalMaterial({
    color: 0x060606, roughness: 0.62, metalness: 0,
    sheen: 1, sheenRoughness: 0.45, sheenColor: new THREE.Color(0x4a4a4a)
  });
  const eyeM = new THREE.MeshStandardMaterial({ color: 0xd8d8d8, roughness: 0.2, metalness: 0.6, emissive: 0x666666 });

  /* ---- the bull: hump, slab shoulders, brisket, heavy neck, silvered horns. */
  const hornM = new THREE.MeshStandardMaterial({ color: 0xcfd0d1, roughness: 0.3, metalness: 0.85 });
  const B = {};
  B.torso = merge([
    tube([[-8, 0.3], [-5.5, 0.5], [-1, 0.0], [3.5, 0.8], [6.5, 1.4]], [2.5, 3.2, 3.0, 4.1, 3.5], { sz: 0.78, steps: 24, radial: 18 }),
    sph(-8, 0.3, 0, 1.7, 2.5, 1.95), sph(6.5, 1.3, 0, 2.2, 3.5, 2.7),
    sph(4.0, 3.5, 0, 3.2, 2.3, 2.3),                                          // the hump
    sph(4.6, 0.2, 2.35, 2.6, 3.3, 1.5), sph(4.6, 0.2, -2.35, 2.6, 3.3, 1.5),  // shoulders
    sph(7.0, -2.0, 1.05, 2.0, 2.3, 1.5), sph(7.0, -2.0, -1.05, 2.0, 2.3, 1.5),// brisket
    sph(-6.0, 0.1, 1.95, 2.8, 3.2, 1.45), sph(-6.0, 0.1, -1.95, 2.8, 3.2, 1.45), // haunches
    sph(-1.0, 1.6, 1.4, 3.6, 1.8, 1.3), sph(-1.0, 1.6, -1.4, 3.6, 1.8, 1.3)   // back
  ]);
  B.neck = merge([
    tube([[-0.8, 0], [1.6, -0.3], [3.6, -1.0]], [3.3, 2.7, 2.05], { sz: 0.85, steps: 12, radial: 16 }),
    sph(4.6, -1.3, 0, 2.0, 1.7, 1.7),                                         // skull
    sph(6.3, -2.3, 0, 1.55, 1.1, 1.2, -0.5),                                  // muzzle
    sph(4.7, -0.2, 0, 1.3, 0.8, 1.5),                                         // poll
    sph(3.7, -0.7, 2.0, 0.4, 0.5, 0.9), sph(3.7, -0.7, -2.0, 0.4, 0.5, 0.9)   // ears
  ]);
  B.eyes = merge([sph(5.65, -0.85, 1.42, 0.2, 0.17, 0.2, 0, 8), sph(5.65, -0.85, -1.42, 0.2, 0.17, 0.2, 0, 8)]);
  B.horns = merge([-1, 1].map((sd) => {
    const h = tube([[0, 0], [1.7, 0.15], [2.9, 1.2], [3.3, 2.7]], [0.62, 0.52, 0.34, 0.05], { steps: 14, radial: 10 });
    h.rotateY(-sd * Math.PI / 2); h.rotateZ(-0.35); h.translate(4.4, -0.1, sd * 1.25);
    return h;
  }));
  B.tail = merge([tube([[0, 0], [-0.8, -2], [-1.0, -5], [-0.9, -7.5]], [0.45, 0.3, 0.25, 0.22], { steps: 12, radial: 8 }), sph(-0.9, -8.3, 0, 0.55, 1.1, 0.55)]);
  B.fUp = merge([tube([[0, 0.5], [0.15, -1.8], [0, -4.0]], [1.6, 1.25, 0.8], { sz: 0.8 }), sph(0, -4.0, 0, 0.8, 0.8, 0.72)]);
  B.fLo = merge([tube([[0, 0], [0, -3.6]], [0.78, 0.62], { steps: 6 }), sph(0, -3.6, 0, 0.62, 0.62, 0.62)]);
  B.hTh = merge([tube([[0, 0.5], [0, -3.6]], [2.1, 1.0], { sz: 0.68 }), sph(0, -3.6, 0, 1.0, 1.0, 0.75)]);
  B.hSh = merge([tube([[0, 0], [0, -3.0]], [0.95, 0.62], { steps: 6 }), sph(0, -3.0, 0, 0.62, 0.62, 0.62)]);
  B.hMt = tube([[0, 0], [0, -2.0]], [0.62, 0.56], { steps: 4 });
  B.paw = cyl(0.72, 0.9, 0.9, 0.1, -0.1, 0, 12);                              // hoof
  const BULL = { G: B, neck: [7.0, 1.6], tail: [-8.6, 1.6], f: [5.0, -2.2, 2.0, 4.0, 3.6], h: [-6.2, -1.6, 1.9, 3.6, 3.0, 2.0], shadow: [28, 12] };

  /* ---- the bear: round, heavy, short-legged, long in the snout. */
  const muzzleM = new THREE.MeshStandardMaterial({ color: 0x343434, roughness: 0.75 });
  const R = {};
  R.torso = merge([
    tube([[-6, 0], [-4, 0.3], [-0.5, 0.2], [3, 0.5], [5.2, 0.6]], [2.9, 3.7, 3.5, 3.6, 3.0], { sz: 0.86, steps: 22, radial: 18 }),
    sph(-6, 0, 0, 2.3, 2.9, 2.6), sph(5.2, 0.6, 0, 2.2, 3.0, 2.6),
    sph(3.2, 2.7, 0, 2.6, 1.8, 2.3),                                          // shoulder hump
    sph(-4.5, -0.3, 1.9, 2.6, 3.0, 1.5), sph(-4.5, -0.3, -1.9, 2.6, 3.0, 1.5),
    sph(-6.9, 1.0, 0, 0.7, 0.7, 0.7)                                          // stub tail
  ]);
  R.neck = merge([
    tube([[-0.8, 0], [1.2, 0.1], [2.6, 0.1]], [2.9, 2.4, 2.05], { sz: 0.9, steps: 10, radial: 16 }),
    sph(3.4, 0.3, 0, 2.1, 1.9, 2.0),                                          // skull
    sph(2.6, 2.05, 1.5, 0.45, 0.75, 0.75), sph(2.6, 2.05, -1.5, 0.45, 0.75, 0.75) // round ears
  ]);
  R.horns = merge([sph(5.3, -0.45, 0, 1.55, 0.95, 0.98), sph(6.75, -0.3, 0, 0.42, 0.36, 0.5)]);   // pale snout + nose
  R.eyes = merge([sph(4.75, 0.7, 1.05, 0.17, 0.15, 0.17, 0, 8), sph(4.75, 0.7, -1.05, 0.17, 0.15, 0.17, 0, 8)]);
  R.tail = sph(0, 0, 0, 0.3, 0.3, 0.3);
  R.fUp = merge([tube([[0, 0.5], [0, -3.2]], [1.8, 1.3], { sz: 0.85 }), sph(0, -3.2, 0, 1.3, 1.3, 1.1)]);
  R.fLo = merge([tube([[0, 0], [0, -2.8]], [1.3, 1.1], { steps: 6 }), sph(0, -2.8, 0, 1.1, 1.1, 1.1)]);
  R.hTh = merge([tube([[0, 0.5], [0, -3.0]], [2.1, 1.3], { sz: 0.8 }), sph(0, -3.0, 0, 1.3, 1.3, 1.05)]);
  R.hSh = merge([tube([[0, 0], [0, -2.4]], [1.25, 1.0], { steps: 6 }), sph(0, -2.4, 0, 1.0, 1.0, 1.0)]);
  R.hMt = tube([[0, 0], [0, -1.2]], [1.0, 0.9], { steps: 4 });
  R.paw = sph(0.5, -0.1, 0, 1.5, 0.6, 1.2);
  const BEAR = { G: R, extraM: muzzleM, neck: [5.6, 0.8], tail: [-6.6, 1.0], f: [3.6, -1.6, 1.9, 3.2, 2.8], h: [-4.4, -1.4, 1.9, 3.0, 2.4, 1.2], shadow: [20, 13] };
  // reared up on its hind legs, forepaws raised, head level: a bear that means it
  const BEAR_REAR = [11.6, 1.2, -1.0, 0, 0, 0, -0.1, -0.5, -0.3, -0.7, -1.0, -0.4, 0.2, -1.05, -0.35, 0.2];

  function makeAnimal(S) {
    const G = S.G;
    const root = new THREE.Group(), body = new THREE.Group();
    root.add(body);
    const part = (geo, parent, x, y, z) => {
      const g = new THREE.Group(); g.position.set(x || 0, y || 0, z || 0);
      if (geo) g.add(new THREE.Mesh(geo, furM));
      parent.add(g); return g;
    };
    body.add(new THREE.Mesh(G.torso, furM));
    const neck = part(G.neck, body, S.neck[0], S.neck[1], 0);
    neck.add(new THREE.Mesh(G.eyes, eyeM));
    if (G.horns) neck.add(new THREE.Mesh(G.horns, S.extraM || hornM));
    const tail = part(G.tail, body, S.tail[0], S.tail[1], 0);
    const front = [], hind = [];
    for (const s of [1, -1]) {
      const u = part(G.fUp, body, S.f[0], S.f[1], s * S.f[2]), l = part(G.fLo, u, 0, -S.f[3], 0), p = part(G.paw, l, 0, -S.f[4], 0);
      front.push([u, l, p]);
      const th = part(G.hTh, body, S.h[0], S.h[1], s * S.h[2]), sh = part(G.hSh, th, 0, -S.h[3], 0), mt = part(G.hMt, sh, 0, -S.h[4], 0), hp = part(G.paw, mt, 0, -S.h[5], 0);
      hind.push([th, sh, mt, hp]);
    }
    const shadow = blob(S.shadow[0], S.shadow[1], 0.5);
    root.add(shadow);
    /* pose: [y, pitch, neck, neckYaw, tail, tailYaw,
              fLu, fLl, fRu, fRl,  hLt, hLs, hLm,  hRt, hRs, hRm] */
    function set(p) {
      body.position.y = p[0]; body.rotation.z = p[1];
      neck.rotation.set(0, p[3], p[2]);
      tail.rotation.set(0, p[5], p[4]);
      for (let i = 0; i < 2; i++) {
        const f = front[i], a = p[6 + i * 2], b = p[7 + i * 2];
        f[0].rotation.z = a; f[1].rotation.z = b; f[2].rotation.z = -(p[1] + a + b);   // paw stays flat
        const h = hind[i], c = p[10 + i * 3], d = p[11 + i * 3], e = p[12 + i * 3];
        h[0].rotation.z = c; h[1].rotation.z = d; h[2].rotation.z = e; h[3].rotation.z = -(p[1] + c + d + e);
      }
    }
    return { root, set, shadow };
  }

  const _pose = new Array(16);
  /* The bull's poses: standing square, and a heavy walk. */
  const BULL_STAND = [10.3, 0, -0.05, 0.3, 0, 0, 0.08, -0.16, 0.08, -0.16, 0.35, -0.8, 0.5, 0.35, -0.8, 0.5];
  function bullWalk(ph, out) {
    const leg = (o, base, phase) => {
      const sn = Math.sin(phase), lift = Math.max(0, Math.cos(phase));
      if (base === 6 || base === 8) { o[base] = 0.08 + 0.3 * sn; o[base + 1] = -0.16 - 0.7 * lift; }
      else { o[base] = 0.35 + 0.26 * sn; o[base + 1] = -0.8 - 0.45 * lift; o[base + 2] = 0.5 + 0.22 * lift; }
    };
    out[0] = 10.3 + 0.12 * Math.sin(ph * 2); out[1] = 0.012 * Math.sin(ph * 2);
    out[2] = -0.1 + 0.05 * Math.sin(ph * 2 + 0.6); out[3] = 0.05 * Math.sin(ph);   // the head nods with the stride
    out[4] = 0.08 * Math.sin(ph); out[5] = 0.3 * Math.sin(ph * 0.5);
    leg(out, 6, ph); leg(out, 8, ph + Math.PI);
    leg(out, 10, ph + Math.PI); leg(out, 13, ph);
    return out;
  }

  // the walker: a jacked bull, in from the right, down the centre line, halts at 0:27
  const stalker = makeAnimal(BULL);
  stalker.root.scale.setScalar(0.8);
  scene.add(stalker.root);
  const walkCurve = new THREE.CatmullRomCurve3(
    [[120, -112], [80, -124], [45, -134], [22, -140], [15, -151], [13.5, -164], [13.5, -175]].map(p => new V3(p[0], 0, p[1])), false, 'centripetal');
  const WALK_LEN = walkCurve.getLength();
  const WALK_T0 = 13, WALK_T1 = 27;
  const _w = new V3(), _wt = new V3();
  function updateStalker(t) {
    const q = clamp((t - WALK_T0) / (WALK_T1 - WALK_T0), 0, 1);
    const k = 1 - Math.pow(1 - q, 1.3);                    // eases to a halt
    walkCurve.getPointAt(k, _w); walkCurve.getTangentAt(Math.min(k, 0.999), _wt);
    stalker.root.position.set(_w.x, 0, _w.z);
    stalker.root.rotation.y = Math.atan2(-_wt.z, _wt.x);
    bullWalk((k * WALK_LEN / 8.2) * TAU, _pose);
    const halt = sstep(26.2, 27.6, t);                     // squares up and stands
    if (halt > 0) for (let i = 0; i < 16; i++) _pose[i] = lerp(_pose[i], BULL_STAND[i], halt);
    stalker.set(_pose);
  }

  // the ones at rest around the figure
  const FIG = new V3(0, 0, -205);
  const BULL_PROUD = [10.3, 0.03, 0.34, 0, 0.1, 0.2, 0.08, -0.16, 0.08, -0.16, 0.35, -0.8, 0.5, 0.35, -0.8, 0.5];   // head up: bullish
  const resting = [
    [-10, 5, BULL_PROUD, -1.2, 0.2, 0.34, BULL, 0.62],
    [-19, -5, BULL_PROUD, -0.95, 0.35, 0.42, BULL, 0.7],
    [-15, 13, BULL_PROUD, -1.5, 0.1, 0.26, BULL, 0.56],
    [9.5, 1, BEAR_REAR, -1.35, 0.25, -1.0, BEAR, 0.78]         // the bearish bear, right of the figure
  ].map(([dx, dz, pose, yaw, look, neck, spec, scale]) => {
    const p = makeAnimal(spec);
    if (scale) p.root.scale.setScalar(scale);
    const ps = pose.slice(); ps[3] = look; ps[2] = neck;
    p.set(ps);
    p.root.position.set(FIG.x + dx, 0, FIG.z + dz);
    p.root.rotation.y = yaw;
    scene.add(p.root);
    return { p, ps, neck, tailYaw: ps[5] };
  });

  /* ================================================= THE FUR-COAT FIGURE
     Built to human proportions (7.5 heads tall, shoulders ~2.5 heads wide).
     The head is a real 3-D form whose outline is traced from the photo, with
     the photo projected onto its front — so it turns in space like a head
     instead of swivelling like a sticker. Hands are in the coat pockets.
     He barely moves: a statue for the camera to find. */
  const figure = new THREE.Group();
  let faceMat = null;
  // head outline, traced on the 512 x 640 source photo: [row, half-width] in px
  const HEAD_CX = 235, HEAD_CY = 310, HEAD_ROWS = [[74, 0], [77, 34], [84, 68], [100, 100], [140, 131], [190, 143], [250, 139], [300, 146],
    [350, 144], [385, 131], [440, 113], [495, 81], [522, 50], [534, 26], [540, 0]];
  const HEAD_S = 3.0 / 454;            // world units per photo pixel: the head is 3.0 tall
  const CROP = { x: 70, y: 56, w: 340, h: 500 };
  {
    const HEAD_Y = 16.75;
    const hwPx = (py) => { let i = 0; while (i < HEAD_ROWS.length - 2 && py > HEAD_ROWS[i + 1][0]) i++; const a = HEAD_ROWS[i], b = HEAD_ROWS[i + 1]; return lerp(a[1], b[1], clamp((py - a[0]) / (b[0] - a[0]), 0, 1)); };
    function headHalf(front) {
      const N = 30, M = 18, pos = [], uv = [], idx = [];
      for (let i = 0; i <= N; i++) {
        const py = lerp(74, 540, (1 - Math.cos(Math.PI * i / N)) / 2);
        const hw = hwPx(py) * HEAD_S, y = (HEAD_CY - py) * HEAD_S;
        const dome = Math.sqrt(Math.max(0, 1 - Math.pow((py - (front ? 307 : 250)) / (front ? 240 : 205), 2)));
        const depth = front ? hw * 0.55 + 0.42 * dome : hw * 0.6 + 0.62 * dome;
        for (let j = 0; j <= M; j++) {
          const ph = (j / M) * Math.PI, x = hw * Math.cos(ph);
          let z = depth * Math.sin(ph) * (front ? 1 : -1);
          if (front) z += 0.2 * Math.exp(-Math.pow(x / 0.2, 2) - Math.pow((py - 350) / 46, 2));   // the nose stands proud
          pos.push(x, y, z);
          uv.push((HEAD_CX + x / HEAD_S - CROP.x) / CROP.w, 1 - (py - CROP.y) / CROP.h);
        }
      }
      for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) {
        const a = i * (M + 1) + j, b = a + M + 1, c = b + 1, d = a + 1;
        front ? idx.push(a, b, d, b, c, d) : idx.push(a, d, b, b, d, c);
      }
      const g = new THREE.BufferGeometry();
      g.setIndex(idx);
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.computeVertexNormals();
      return g;
    }
    faceMat = new THREE.MeshBasicMaterial({ color: 0x0b0b0b, side: THREE.DoubleSide });
    const head = new THREE.Group();
    head.add(new THREE.Mesh(headHalf(true), faceMat),
      new THREE.Mesh(headHalf(false), new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.6, side: THREE.DoubleSide })));
    head.position.y = HEAD_Y;
    figure.add(head);

    /* the coat — narrower through the shoulder than a cartoon would draw it;
       the fur supplies the bulk */
    const coat = new THREE.LatheGeometry([
      [2.5, 2.4], [2.62, 2.7], [2.6, 4.5], [2.45, 8], [2.3, 11], [2.5, 13.2], [2.7, 14.2], [2.25, 14.9], [1.15, 15.4]
    ].map(p => new THREE.Vector2(p[0], p[1])), 40);
    coat.applyMatrix4(new THREE.Matrix4().makeScale(1, 1, 0.66));
    const fur = [coat];
    for (const s of [-1, 1]) {
      // one continuous sleeve: off the shoulder, past the elbow, into the pocket
      fur.push(tube([[s * 1.5, 13.9], [s * 2.6, 13.35], [s * 3.0, 11.2], [s * 2.9, 9.2], [s * 2.3, 8.1], [s * 1.7, 7.9]], [0.75, 0.88, 0.8, 0.74, 0.68, 0.6], { steps: 22, radial: 14, sz: 1.1 }));
      fur.push(sph(s * 0.75, 13.3, 1.3, 0.6, 2.0, 0.55, -s * 0.28));          // shawl lapel
    }
    fur.push(sph(0, 15.0, -0.45, 1.6, 0.7, 1.1));                             // collar
    const furGeo = merge(fur);

    // shell fur: stacked, alpha-tested skins — strands thin out toward the tip
    const [fc, fx] = canvas(256, 256);
    fx.fillStyle = '#000'; fx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 9000; i++) {
      const v = 60 + Math.floor(rnd() * 195);
      fx.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
      fx.beginPath(); fx.arc(rnd() * 256, rnd() * 256, 0.8 + rnd() * 1.1, 0, TAU); fx.fill();
    }
    const furT = tex(fc);
    furT.wrapS = furT.wrapT = THREE.RepeatWrapping; furT.repeat.set(8, 7);
    const SHELLS = LOW ? 9 : 16, FUR_LEN = 0.5;
    figure.add(new THREE.Mesh(furGeo, new THREE.MeshStandardMaterial({ color: 0x030303, roughness: 1 })));
    const bp = furGeo.attributes.position, bn = furGeo.attributes.normal;
    for (let i = 1; i <= SHELLS; i++) {
      const k = i / SHELLS, g = furGeo.clone(), p = g.attributes.position;
      for (let v = 0; v < p.count; v++) {
        p.setXYZ(v,
          bp.getX(v) + bn.getX(v) * FUR_LEN * k,
          bp.getY(v) + bn.getY(v) * FUR_LEN * k - 0.28 * k * k,     // strands droop
          bp.getZ(v) + bn.getZ(v) * FUR_LEN * k);
      }
      const shade = lerp(0.012, 0.2, k * k);
      figure.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({
        color: new THREE.Color(shade, shade, shade), roughness: 0.95,
        alphaMap: furT, alphaTest: 0.2 + 0.72 * k
      })));
    }

    const cloth = [], shoe = [];
    for (const s of [-1, 1]) {
      cloth.push(cyl(0.62, 0.54, 2.9, s * 0.85, 1.55, 0));                    // trouser leg
      shoe.push(box(1.12, 0.2, 2.9, s * 0.88, 0.1, 0.5));                     // sole
      shoe.push(sph(s * 0.88, 0.42, 0.35, 0.54, 0.36, 1.25), sph(s * 0.88, 0.36, 1.35, 0.5, 0.26, 0.55));   // upper, toe
    }
    cloth.push(sph(0, 13.6, 0.72, 0.9, 1.9, 0.5));                            // knit under the lapels
    figure.add(new THREE.Mesh(merge(cloth), new THREE.MeshStandardMaterial({ color: 0x121214, roughness: 0.92 })));
    figure.add(new THREE.Mesh(merge(shoe), new THREE.MeshPhysicalMaterial({ color: 0x060606, roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.25 })));
    figure.add(new THREE.Mesh(cyl(0.58, 0.66, 1.3, 0, 15.2, -0.05), new THREE.MeshStandardMaterial({ color: 0x55514c, roughness: 0.75 })));   // neck

    figure.add(blob(12, 9, 0.5));
    figure.position.copy(FIG);
    scene.add(figure);
  }

  if (typeof window.SCENE_FACE === 'string' && window.SCENE_FACE) {
    const im = new Image();
    im.onload = () => {
      /* The photo, cropped to the head and cut along its outline; everything
         outside the outline becomes hair-black, so any sliver of the head
         form that pokes past the traced edge reads as hair, not background. */
      const kx = im.width / 512, ky = im.height / 640, W = CROP.w, H = CROP.h;
      const [pc, px] = canvas(W, H);
      px.filter = 'grayscale(1) contrast(1.15) brightness(1.03)';
      px.drawImage(im, CROP.x * kx, CROP.y * ky, CROP.w * kx, CROP.h * ky, 0, 0, W, H);
      px.filter = 'none';
      const OUT = [];
      for (const [py, hw] of HEAD_ROWS) OUT.push([HEAD_CX + hw * 0.985 - CROP.x, py - CROP.y]);
      for (let i = HEAD_ROWS.length - 2; i > 0; i--) OUT.push([HEAD_CX - HEAD_ROWS[i][1] * 0.985 - CROP.x, HEAD_ROWS[i][0] - CROP.y]);
      const [mc, mx] = canvas(W, H);
      mx.filter = 'blur(3px)';
      mx.fillStyle = '#fff';
      mx.beginPath();
      OUT.forEach((p, i) => (i ? mx.lineTo(p[0], p[1]) : mx.moveTo(p[0], p[1])));
      mx.closePath(); mx.fill();
      px.globalCompositeOperation = 'destination-in';
      px.drawImage(mc, 0, 0);
      const [c, x] = canvas(W, H);
      x.fillStyle = '#0b0b0b'; x.fillRect(0, 0, W, H);
      x.drawImage(pc, 0, 0);
      faceMat.map = tex(c, true);
      faceMat.color.set(0xffffff);
      faceMat.needsUpdate = true;
      frameAt(clock);
    };
    im.src = window.SCENE_FACE;
  }

  /* ========================================================== THE CAMERA
     One take. Position and aim are keyed in seconds and joined with a
     Hermite spline whose tangents account for uneven key spacing, so speed
     never steps at a key. `k` is how much of the opening 45° roll remains. */
  const KEYS = [
    { t: 0,    p: [0, 230, 0],        a: [0, 0, -0.5],     k: 1 },   // white
    { t: 1.2,  p: [0, 64, 0],         a: [0, 0, -0.5],     k: 1 },   // the cover, top-down
    { t: 3.4,  p: [0, 58, -1.5],      a: [0, 0, -3],       k: 1 },
    { t: 5,    p: [0, 46, -9],        a: [0, 0, -20],      k: 1 },
    { t: 6.8,  p: [0, 30, -16],       a: [0, 0, -40],      k: 0.6 },
    { t: 9,    p: [0, 15, -34],       a: [0, 3, -70],      k: 0 },   // tilt: cash, bag, car
    { t: 11,   p: [0, 10.5, -62],     a: [0, 4, -90],      k: 0 },
    { t: 12,   p: [0, 9.6, -78],        a: [0, 4.5, -98],    k: 0 },   // passenger door
    { t: 13,   p: [0, 9.4, -89],      a: [0, 5, -107],     k: 0 },   // over the seats
    { t: 14,   p: [0, 9.4, -99],      a: [0, 4, -116],     k: 0 },   // driver's door
    { t: 14.8, p: [0, 9.2, -105.5],   a: [0, 2.5, -121],   k: 0 },   // out
    { t: 16,   p: [1.5, 9, -108],     a: [-2, 0, -121.5],  k: 0 },
    { t: 18.5, p: [2.5, 10, -110],    a: [-3, 0, -123.5],  k: 0 },
    { t: 20.3, p: [3, 9.5, -112.5],   a: [-2.5, 0, -122.5], k: 0 },   // the tail
    { t: 21.6, p: [3, 8, -117],       a: [18, 4, -142],    k: 0 },   // up onto the bull
    { t: 23,   p: [2, 7.5, -122],     a: [10, 5, -152],    k: 0 },
    { t: 25,   p: [1, 7, -139],       a: [1.5, 8, -196],   k: 0 },   // the figure, dead centre
    { t: 27,   p: [0, 6.5, -149],     a: [0, 9.5, -205],   k: 0 },
    { t: 28.4, p: [0, 6.5, -151.5],   a: [0, 10, -205],    k: 0 },   // the bull halts
    { t: 29.4, p: [0, 6.5, -152.5],   a: [0, 95, -205],    k: 0 },   // pan up
    { t: 30,   p: [0, 6.5, -153],     a: [0, 220, -200],   k: 0 }    // white
  ];
  function hermite(t, get, out) {
    let i = 0;
    while (i < KEYS.length - 2 && t >= KEYS[i + 1].t) i++;
    const k0 = KEYS[i], k1 = KEYS[i + 1], km = KEYS[Math.max(0, i - 1)], kp = KEYS[Math.min(KEYS.length - 1, i + 2)];
    const dt = k1.t - k0.t, s = clamp((t - k0.t) / dt, 0, 1), s2 = s * s, s3 = s2 * s;
    const h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
    const v0 = get(k0), v1 = get(k1), vm = get(km), vp = get(kp);
    for (let c = 0; c < v0.length; c++) {
      const m0 = (v1[c] - vm[c]) / ((k1.t - km.t) || 1), m1 = (vp[c] - v0[c]) / ((kp.t - k0.t) || 1);
      out[c] = h00 * v0[c] + h10 * dt * m0 + h01 * v1[c] + h11 * dt * m1;
    }
    return out;
  }
  const _cp = [0, 0, 0], _ca = [0, 0, 0], _ck = [0];
  const camAim = new V3();

  /* ------------------------------------------------------------ captions */
  const CAPS = [
    { a: 1.6, b: 7.6, k: '01 · Side A', t: 'PYTHON', s: 'Primary language since 2019 — Python and C++' },
    { a: 9.2, b: 14.6, k: '02 · Execution', t: 'LOW LATENCY', s: '8× faster pipeline · 2,000+ orders a minute' },
    { a: 16, b: 22.6, k: '03 · Long bias', t: 'THE BULL', s: 'OMS + RMS · six venues · ~4 ms submit-to-fill' },
    { a: 24, b: 28.6, k: '04 · Mumbai', t: 'NILESH GAHLOT', s: 'Quantitative Developer — OMS · execution · research' }
  ];
  const ltEl = document.getElementById('lowerThird');
  const ltK = document.getElementById('ltKicker');
  const ltT = document.getElementById('ltTitle');
  const ltS = document.getElementById('ltSub');
  let capIdx = -2;
  function captions(t) {
    if (!ltEl) return;
    let idx = -1;
    for (let i = 0; i < CAPS.length; i++) if (t >= CAPS[i].a && t <= CAPS[i].b) { idx = i; break; }
    if (idx === capIdx) return;
    capIdx = idx;
    if (idx < 0) { ltEl.classList.remove('is-in'); return; }
    ltK.textContent = CAPS[idx].k; ltT.textContent = CAPS[idx].t; ltS.textContent = CAPS[idx].s;
    ltEl.classList.add('is-in');
  }

  /* --------------------------------------------------------------- frame */
  let clock = reduced ? 25.6 : 0;      // seconds into the loop
  function frameAt(t) {
    t = ((t % LOOP) + LOOP) % LOOP;

    updateSnake(t);
    updateStalker(t);
    // living statue: the faintest sway, nothing more
    figure.rotation.y = Math.sin(t * TAU / LOOP) * 0.03;
    for (let i = 0; i < resting.length; i++) {
      const r = resting[i];
      r.ps[2] = r.neck + 0.025 * Math.sin(t * TAU / 10 + i * 1.7);
      r.ps[5] = r.tailYaw + 0.12 * Math.sin(t * TAU / 7.5 + i);
      r.p.set(r.ps);
    }

    hermite(t, k => k.p, _cp); hermite(t, k => k.a, _ca); hermite(t, k => [k.k], _ck);
    const roll = clamp(_ck[0], 0, 1);
    camera.position.set(_cp[0], Math.max(2, _cp[1]), _cp[2]);
    // 45° roll at the top-down start (the print sits square in frame), which
    // unwinds into a level horizon as the camera tilts up.
    camera.up.set(0.7071 * roll, 1 - roll, -0.7071 * roll).normalize();
    camera.lookAt(camAim.set(_ca[0], _ca[1], _ca[2]));


    captions(t);
    renderer.render(scene, camera);
  }

  /* -------------------------------------------------------------- resize */
  let lastW = 0, lastH = 0;
  function resize() {
    const r = host.getBoundingClientRect();
    if (!r.width || !r.height) return;
    if (Math.abs(r.width - lastW) < 1 && Math.abs(r.height - lastH) < 1) return;
    lastW = r.width; lastH = r.height;
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / r.height;
    camera.fov = camera.aspect < 0.8 ? 58 : camera.aspect < 1.3 ? 48 : 40;
    camera.updateProjectionMatrix();
    frameAt(clock);
  }
  resize();
  window.addEventListener('resize', resize);
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(host);

  /* ---------------------------------------------------------- run / pause */
  let running = true, held = false, last = performance.now();
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((en) => { running = en[0].isIntersecting; last = performance.now(); },
      { threshold: 0.02 }).observe(host);
  }
  window.__scene = {
    seek(sec) { clock = ((sec % LOOP) + LOOP) % LOOP; frameAt(clock); },
    pause() { held = true; },
    play() { held = false; last = performance.now(); },
    t() { return clock; },
    LOOP,
    dbg: { snakeMat, scaleTex, skinTex, camera, stalker, renderer, scene, headGroup },
    info() { return { calls: renderer.info.render.calls, tris: renderer.info.render.triangles }; },
    // centre-pixel-free whiteness check: fraction of the frame that is pure void
    blank() {
      const gl = renderer.getContext(), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      frameAt(clock);
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let n = 0;
      for (let i = 0; i < px.length; i += 4) if (px[i] === px[0] && px[i + 1] === px[1] && px[i + 2] === px[2]) n++;
      return { same: n / (w * h), first: [px[0], px[1], px[2]] };
    }
  };

  frameAt(clock);
  host.classList.add('is-ready');
  if (reduced) return;

  requestAnimationFrame(function tick(now) {
    requestAnimationFrame(tick);
    if (document.hidden || !running || held) { last = now; return; }
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    clock = (clock + dt) % LOOP;
    frameAt(clock);
  });

  document.addEventListener('visibilitychange', () => {
    last = performance.now();
    if (!document.hidden) frameAt(clock);
  });
}
