/* =========================================================================
   scene3d.js — the flythrough.

   Reference is a camera drifting through an infinite white void past dark
   matte objects at wildly different scales. No horizon: the ground exists
   only as shadow.

   The python is NOT a static tube. In the reference its body shape changes
   frame to frame — a travelling lateral wave (serpentine locomotion) — so the
   spine here is evaluated analytically every frame and the mesh rebuilt.

   Everything animated is driven off the normalised loop position `u`, with an
   integer number of cycles per loop, so the whole film closes seamlessly.

   Face hook: window.SCENE_FACE = 'assets/images/face.png' before load →
   the standing figure's head uses that photo.
   ========================================================================= */

import * as THREE from '../vendor/three.module.js';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';

const host = document.getElementById('stage');
if (host) boot(host);

function boot(host) {
  const root = document.documentElement;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const LOOP = 56;
  const TAU = Math.PI * 2;
  let dark = root.classList.contains('dark');

  // Low-end heuristic: small screen (phone) or few cores. Drives resolution,
  // shadow-map size and mesh density.
  const LOW = Math.min(screen.width || 1e4, screen.height || 1e4) < 700 ||
              (navigator.hardwareConcurrency || 8) <= 4;

  const PALETTE = {
    light: { void: 0xf0ece2, body: 0x191710, skin: 0xffffff },
    dark:  { void: 0x0d0c0a, body: 0xe6e1d3, skin: 0xffffff }
  };
  const P = () => (dark ? PALETTE.dark : PALETTE.light);

  /* ------------------------------------------------------------- renderer */
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, LOW ? 1.5 : 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  host.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-hidden', 'true');

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.5, 1200);
  // Subjects are framed at 40–100 units; beats sit 250–400 apart. Fog must
  // finish INSIDE that gap (by ~320) or far actors photobomb every shot —
  // and, with no horizon line, distant grounded objects read as floating.
  // NOTE: three.js fog runs on VIEW-SPACE DEPTH, not radial distance — an
  // object 45° off-axis fogs ~30% less than its distance suggests. The far
  // value here is chosen against view-depth, and camera shots are aimed so
  // no far actor sits down the view axis.
  scene.fog = new THREE.Fog(P().void, 110, 190);
  scene.background = new THREE.Color(P().void);

  // Ground is a pure shadow catcher — never a lit surface, so no horizon.
  const floorMat = new THREE.ShadowMaterial({ opacity: dark ? 0.30 : 0.19 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  /* --------------------------------------------------------------- lights */
  const hemi = new THREE.HemisphereLight(0xffffff, 0xbfb9aa, dark ? 0.55 : 1.15);
  scene.add(hemi);
  /* One FIXED sun covering the whole stage. A tight frustum that followed the
     camera seemed clever, but any far actor poking its edge smears the edge
     texel into a long grey streak across the ground (classic directional-
     shadow artifact). Fixed light + full coverage: nothing ever exits the map. */
  const key = new THREE.DirectionalLight(0xffffff, dark ? 1.5 : 2.5);
  key.castShadow = true;
  key.shadow.mapSize.set(LOW ? 1024 : 2048, LOW ? 1024 : 2048);
  key.shadow.bias = -0.0008;
  key.shadow.normalBias = 0.6;
  key.position.set(150, 210, 90);
  key.target.position.set(-30, 0, -40);
  const sc = key.shadow.camera;
  sc.left = -320; sc.right = 320; sc.top = 320; sc.bottom = -320;
  sc.near = 20; sc.far = 700;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(0xffffff, dark ? 0.25 : 0.5);
  fill.position.set(-40, 30, -60);
  scene.add(fill);

  // slight sheen — pure matte renders as a formless slab against the void
  const bodyMat = new THREE.MeshStandardMaterial({ color: P().body, roughness: 0.52, metalness: 0.1 });

  /* ---- baked-geometry helpers -------------------------------------------
     Every static actor is merged into as few meshes as possible; per-mesh
     scene graphs cost one draw call each, and low-end GPUs die by draw call
     count long before they die by triangle count. */
  const QID = new THREE.Quaternion();
  function bakedSphere(x, y, z, rx, ry, rz, seg) {
    seg = seg || (LOW ? 14 : 18);
    const g = new THREE.SphereGeometry(1, seg, Math.max(10, seg - 4));
    g.applyMatrix4(new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z), QID, new THREE.Vector3(rx, ry, rz)));
    return g;
  }
  function bakedCyl(rt, rb, h, x, y, z, seg) {
    const g = new THREE.CylinderGeometry(rt, rb, h, seg || (LOW ? 10 : 14));
    g.applyMatrix4(new THREE.Matrix4().makeTranslation(x, y, z));
    return g;
  }
  function bakedBox(w, h, d, x, y, z) {
    const g = new THREE.BoxGeometry(w, h, d);
    g.applyMatrix4(new THREE.Matrix4().makeTranslation(x, y, z));
    return g;
  }

  /* ================================================ RETICULATED PYTHON SKIN
     The reference skin is a bold irregular net — light seams enclosing dark
     cells — not uniform scales. That net is what makes it read as a python. */
  function pythonSkin() {
    const S = 512;
    const c = document.createElement('canvas');
    c.width = S; c.height = S;
    const x = c.getContext('2d');

    let seed = 20260807;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

    x.fillStyle = '#2b2b2b';
    x.fillRect(0, 0, S, S);

    // jittered diamond lattice; wraps because column 0 == column COLS
    const COLS = 7, ROWS = 7;
    const cw = S / COLS, ch = S / ROWS;
    const pt = [];
    for (let r = 0; r <= ROWS; r++) {
      pt[r] = [];
      for (let cI = 0; cI <= COLS; cI++) {
        const jx = (rnd() - 0.5) * cw * 0.34;
        const jy = (rnd() - 0.5) * ch * 0.34;
        pt[r][cI] = [cI * cw + (cI === COLS ? 0 : jx), r * ch + (r === ROWS ? 0 : jy)];
      }
    }
    for (let r = 0; r <= ROWS; r++) pt[r][COLS] = [S + (pt[r][0][0]), pt[r][0][1]];
    for (let cI = 0; cI <= COLS; cI++) if (pt[ROWS]) pt[ROWS][cI] = [pt[0][cI][0], S + pt[0][cI][1]];

    // cells: mid-tone blotches
    for (let r = 0; r < ROWS; r++) {
      for (let cI = 0; cI < COLS; cI++) {
        const a = pt[r][cI], b = pt[r][cI + 1], d = pt[r + 1][cI + 1], e = pt[r + 1][cI];
        const v = 34 + Math.floor(rnd() * 46);
        x.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
        x.beginPath();
        x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.lineTo(d[0], d[1]); x.lineTo(e[0], e[1]);
        x.closePath(); x.fill();
      }
    }
    // reticulation seams — muted and thin; bright thick seams read as fishnet
    x.strokeStyle = 'rgba(158,150,132,0.72)';
    x.lineJoin = 'round';
    for (let r = 0; r <= ROWS; r++) {
      for (let cI = 0; cI < COLS; cI++) {
        x.lineWidth = 1.8 + rnd() * 1.6;
        x.beginPath();
        x.moveTo(pt[r][cI][0], pt[r][cI][1]);
        x.lineTo(pt[r][cI + 1][0], pt[r][cI + 1][1]);
        x.stroke();
      }
    }
    for (let cI = 0; cI <= COLS; cI++) {
      for (let r = 0; r < ROWS; r++) {
        x.lineWidth = 1.8 + rnd() * 1.6;
        x.beginPath();
        x.moveTo(pt[r][cI][0], pt[r][cI][1]);
        x.lineTo(pt[r + 1][cI][0], pt[r + 1][cI][1]);
        x.stroke();
      }
    }
    // fine scale stipple — this, not the net, carries most of the detail
    for (let i = 0; i < 14000; i++) {
      const px = rnd() * S, py = rnd() * S;
      const g = 90 + Math.floor(rnd() * 110);
      x.fillStyle = 'rgba(' + g + ',' + g + ',' + g + ',0.13)';
      x.beginPath();
      x.ellipse(px, py, 2.0, 1.4, 0, 0, TAU);
      x.fill();
    }

    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  /* ===================================================== THE LIVING PYTHON */
  const SEG = LOW ? 180 : 240, RAD = LOW ? 16 : 20; // spine samples, ring samples
  const HEAD_Z = 118, BODY_L = 224;   // runs +z (head, near camera start) → -z
  const SNAKE_R = 5.4;
  const WAVES = 2.6;                  // wavelengths along the body
  const CYCLES = 6;                   // wave cycles per loop ⇒ seamless

  const snakeTex = pythonSkin();
  snakeTex.repeat.set(26, 4.0);
  const snakeMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, map: snakeTex,
    roughness: 0.88, metalness: 0.0,
    bumpMap: snakeTex, bumpScale: 0.22
  });

  const vCount = (SEG + 1) * (RAD + 1);
  const sPos = new Float32Array(vCount * 3);
  const sNor = new Float32Array(vCount * 3);
  const sUv = new Float32Array(vCount * 2);
  const sIdx = [];
  for (let i = 1; i <= SEG; i++) {
    for (let j = 1; j <= RAD; j++) {
      const a = (RAD + 1) * (i - 1) + (j - 1);
      const b = (RAD + 1) * i + (j - 1);
      const c2 = (RAD + 1) * i + j;
      const d = (RAD + 1) * (i - 1) + j;
      sIdx.push(a, b, d, b, c2, d);
    }
  }
  for (let i = 0; i <= SEG; i++) {
    for (let j = 0; j <= RAD; j++) {
      const k = (i * (RAD + 1) + j) * 2;
      sUv[k] = i / SEG; sUv[k + 1] = j / RAD;
    }
  }
  const snakeGeo = new THREE.BufferGeometry();
  snakeGeo.setIndex(sIdx);
  snakeGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  snakeGeo.setAttribute('normal', new THREE.BufferAttribute(sNor, 3));
  snakeGeo.setAttribute('uv', new THREE.BufferAttribute(sUv, 2));
  // Fixed bounding sphere sized to the whole swept volume — recomputing it
  // per frame walks every vertex on the CPU for nothing.
  snakeGeo.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(0, SNAKE_R, HEAD_Z - BODY_L / 2), BODY_L * 0.62);
  const snake = new THREE.Mesh(snakeGeo, snakeMat);
  snake.castShadow = true;
  scene.add(snake);

  // spine, evaluated analytically — cheaper and smoother than re-fitting a spline
  const AMP = 14;
  const kWave = (TAU * WAVES) / BODY_L;

  function spineAt(s, phase, out) {
    const z = HEAD_Z - s * BODY_L;
    // taper the swing in at the head and out at the tail
    const env = (0.30 + 0.70 * Math.min(1, s / 0.16)) * (1 - 0.45 * Math.max(0, (s - 0.72) / 0.28));
    out.set(AMP * env * Math.sin(kWave * z + phase), SNAKE_R, z);
    return out;
  }

  const radiusAt = (s) =>
    s < 0.05 ? THREE.MathUtils.lerp(0.44, 0.88, s / 0.05) * SNAKE_R :
    s < 0.44 ? THREE.MathUtils.lerp(0.88, 1.0, (s - 0.05) / 0.39) * SNAKE_R :
    THREE.MathUtils.lerp(1.0, 0.05, Math.pow((s - 0.44) / 0.56, 1.3)) * SNAKE_R;

  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
  const _T = new THREE.Vector3(), _N = new THREE.Vector3(), _B = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);
  const headGroup = new THREE.Group();

  function updateSnake(u) {
    const phase = u * TAU * CYCLES;
    for (let i = 0; i <= SEG; i++) {
      const s = i / SEG;
      spineAt(s, phase, _a);
      // tangent by central difference
      spineAt(Math.max(0, s - 0.004), phase, _b);
      spineAt(Math.min(1, s + 0.004), phase, _c);
      _T.subVectors(_c, _b).normalize();
      // world-up framing: stable for a ground-hugging body, no Frenet twist
      _N.crossVectors(UP, _T).normalize();
      _B.crossVectors(_T, _N).normalize();
      const r = radiusAt(s);
      for (let j = 0; j <= RAD; j++) {
        const th = (j / RAD) * TAU;
        const cs = Math.cos(th), sn = Math.sin(th);
        const nx = _N.x * cs + _B.x * sn, ny = _N.y * cs + _B.y * sn, nz = _N.z * cs + _B.z * sn;
        const o = (i * (RAD + 1) + j) * 3;
        sNor[o] = nx; sNor[o + 1] = ny; sNor[o + 2] = nz;
        sPos[o] = _a.x + r * nx; sPos[o + 1] = _a.y + r * ny; sPos[o + 2] = _a.z + r * nz;
      }
    }
    snakeGeo.attributes.position.needsUpdate = true;
    snakeGeo.attributes.normal.needsUpdate = true;

    // head rides the leading end, looking down its own tangent
    spineAt(0, phase, _a);
    spineAt(0.02, phase, _b);
    headGroup.position.copy(_a);
    headGroup.lookAt(_a.clone().add(_a.clone().sub(_b)));
  }

  {
    const hm = new THREE.MeshStandardMaterial({ color: 0xffffff, map: snakeTex, roughness: 0.85 });
    const skullJaw = new THREE.Mesh(mergeGeometries([
      bakedSphere(0, 0, 0, SNAKE_R * 0.80, SNAKE_R * 0.60, SNAKE_R * 1.35),
      bakedSphere(0, -SNAKE_R * 0.32, SNAKE_R * 0.14, SNAKE_R * 0.64, SNAKE_R * 0.28, SNAKE_R * 1.05)
    ]), hm);
    skullJaw.castShadow = true;
    headGroup.add(skullJaw);
    const R = SNAKE_R * 0.14;
    const eyes = new THREE.Mesh(mergeGeometries([
      bakedSphere(-SNAKE_R * 0.54, SNAKE_R * 0.20, SNAKE_R * 0.58, R, R, R, 12),
      bakedSphere(SNAKE_R * 0.54, SNAKE_R * 0.20, SNAKE_R * 0.58, R, R, R, 12)
    ]), new THREE.MeshStandardMaterial({ color: 0x0b0a08, roughness: 0.2, metalness: 0.3 }));
    headGroup.add(eyes);
    scene.add(headGroup);
  }

  /* ============================================================ COLO RACKS */
  // Seven racks merged into exactly three meshes: shells+units, plain LEDs,
  // accent LEDs. The naive version was ~130 meshes = ~130 draw calls.
  const rackCluster = new THREE.Group();
  {
    const shells = [], leds = [], ledsAcc = [];
    const UPv = new THREE.Vector3(0, 1, 0);
    const ONE = new THREE.Vector3(1, 1, 1);
    [[-6.4, 0], [-2.1, 0.7], [2.2, 0], [6.5, 0.5], [-4.2, -5.4], [0.1, -5.0], [4.3, -5.6]]
      .forEach(([x, z], i) => {
        const w = 3.6, h = 9 + (i % 3) * 0.8, d = 2.2;
        const q = new THREE.Quaternion().setFromAxisAngle(UPv, i % 2 ? 0.06 : -0.05);
        const put = (arr, geo, px, py, pz) => {
          const p = new THREE.Vector3(px, py, pz).applyQuaternion(q);
          geo.applyMatrix4(new THREE.Matrix4().compose(p.add(new THREE.Vector3(x, 0, z)), q, ONE));
          arr.push(geo);
        };
        put(shells, new THREE.BoxGeometry(w, h, d), 0, h / 2, 0);
        const units = Math.floor(h / 1.15);
        for (let uI = 0; uI < units; uI++) {
          put(shells, new THREE.BoxGeometry(w * 0.94, 0.82, 0.16), 0, 0.75 + uI * 1.15, d / 2 + 0.06);
          put(uI % 4 === 1 ? ledsAcc : leds,
            new THREE.BoxGeometry(0.2, 0.2, 0.06), w * 0.38, 0.75 + uI * 1.15, d / 2 + 0.16);
        }
      });
    const rackMat = new THREE.MeshStandardMaterial({ color: P().body, roughness: 0.5, metalness: 0.22 });
    const shellMesh = new THREE.Mesh(mergeGeometries(shells), rackMat);
    shellMesh.castShadow = shellMesh.receiveShadow = true;
    rackCluster.add(shellMesh);
    const ledMat = new THREE.MeshBasicMaterial({ color: dark ? 0x8a7f66 : 0x2a2620 });
    rackCluster.add(new THREE.Mesh(mergeGeometries(leds), ledMat));
    rackCluster.add(new THREE.Mesh(mergeGeometries(ledsAcc), new THREE.MeshBasicMaterial({ color: 0xc4632a })));
    rackCluster.userData.ledMat = ledMat;
  }
  /* Actors are spread far apart on purpose: with fog running 150→700, any
     object 300+ units away dissolves into the void, so each camera beat sees
     ONLY its own subject — the reference isolates every beat this way. */
  rackCluster.position.set(150, 0, -130);
  rackCluster.rotation.y = -0.62;
  rackCluster.scale.setScalar(1.6);
  scene.add(rackCluster);

  /* ========================================================= THE BULL HEAD */
  let bull = null, bullReady = false;
  new GLTFLoader().load('assets/models/bull_head.gltf', (gltf) => {
    const m = gltf.scene;
    m.traverse((o) => {
      if (!o.isMesh) return;
      o.material = new THREE.MeshStandardMaterial({ color: P().body, roughness: 0.68, metalness: 0.05 });
      o.castShadow = o.receiveShadow = true;
    });
    /* The scan is authored UPRIGHT (its own bounds run y 0→0.433, plinth at
       the bottom). It once looked inverted here — but that was the camera
       rendering upside down (the rotation.z-after-lookAt bug), not the model.
       No flip: with the camera fixed, a flipped model IS upside down. */
    const raw = new THREE.Box3().setFromObject(m);
    const size = raw.getSize(new THREE.Vector3());
    const k = 21 / Math.max(size.x, size.y, size.z);
    const rig = new THREE.Group();
    m.scale.setScalar(k);
    rig.add(m);
    rig.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(rig);
    const ctr = box.getCenter(new THREE.Vector3());
    rig.position.set(-120 - ctr.x, -box.min.y, -190 - ctr.z);
    rig.rotation.y = 1.15;
    scene.add(rig);
    bull = rig; bullReady = true;
  }, undefined, () => {});

  /* ====================================================== THE COAT FIGURE
     Original geometry — the man in the reference is a real person and is not
     lifted from it. The photo supplies only the face. */
  const figure = new THREE.Group();
  const faceCard = new THREE.Group();
  let faceMat = null;
  {
    /* A boxy knee-length overcoat: square shoulder line, flattened front-to-
       back, straight drop, trousers showing below. The earlier lathe coat was
       radially symmetric — circular cross-section + A-line flare is a gown
       silhouette, which is exactly what it read as. */
    const HEAD_R = 0.86, HEAD_Y = 9.85;
    const parts = [];
    for (const s of [-1, 1]) {
      parts.push(bakedCyl(0.40, 0.36, 3.6, s * 0.62, 1.8, 0));        // trouser
      parts.push(bakedSphere(s * 0.62, 0.24, 0.3, 0.5, 0.24, 0.92));  // shoe
    }
    // Coat with an ELLIPTICAL cross-section — flat front/back, curved sides,
    // chest wider than hem. The circle read as a gown, the box as a robot;
    // the ellipse is what an overcoat actually is.
    const coatG = new THREE.CylinderGeometry(1.95, 1.68, 5.3, 24);
    coatG.applyMatrix4(new THREE.Matrix4().compose(
      new THREE.Vector3(0, 6.0, 0), QID, new THREE.Vector3(1, 1, 0.55)));
    parts.push(coatG);
    parts.push(bakedSphere(0, 8.55, 0, 2.15, 0.75, 1.02));            // rounded shoulder line
    for (const s of [-1, 1]) {
      parts.push(bakedCyl(0.5, 0.56, 4.5, s * 2.02, 6.05, 0));        // sleeve
      parts.push(bakedSphere(s * 2.02, 3.6, 0.15, 0.48, 0.58, 0.48)); // cuff
    }
    parts.push(bakedCyl(0.36, 0.44, 0.7, 0, 9.0, 0));                 // neck
    parts.push(bakedSphere(0, HEAD_Y, 0, HEAD_R * 0.92, HEAD_R * 1.12, HEAD_R));
    const bodyMesh = new THREE.Mesh(mergeGeometries(parts), bodyMat);
    bodyMesh.castShadow = true;
    figure.add(bodyMesh);

    // The face is a billboarded card just proud of the head.
    faceMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    const card = new THREE.Mesh(new THREE.PlaneGeometry(HEAD_R * 1.85, HEAD_R * 2.3), faceMat);
    faceCard.position.y = HEAD_Y;
    // Must clear the head sphere's radius — inside it the depth test fails and
    // the card is silently occluded by the skull.
    card.position.z = HEAD_R * 1.18;
    faceCard.add(card);
    figure.add(faceCard);

    figure.position.set(-150, 0, 185);
    figure.rotation.y = 0.5;
    scene.add(figure);
  }

  /* ---------------------------------------------------- the figure's face
     (The floating photo billboards are gone — the photo lives only on the
     figure's head now.) */
  function applyFace(img) {
    if (img && faceMat) {
      // The figure's face card: crop to the head, grade to match the scene,
      // then feather to an ellipse so it sits on the head as a face rather
      // than hovering there as a rectangle.
      const W = 320, H = 400;
      const fc = document.createElement('canvas');
      fc.width = W; fc.height = H;
      const fx = fc.getContext('2d');

      // head occupies roughly this window of the supplied portrait
      const sx = img.width * 0.13, sy = img.height * 0.04;
      const sw = img.width * 0.74, sh = img.height * 0.84;
      fx.filter = 'grayscale(1) contrast(1.14) brightness(1.04)';
      fx.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
      fx.filter = 'none';

      // feathered elliptical alpha
      const mask = fx.createRadialGradient(W / 2, H * 0.47, W * 0.16, W / 2, H * 0.47, W * 0.56);
      mask.addColorStop(0, 'rgba(0,0,0,1)');
      mask.addColorStop(0.72, 'rgba(0,0,0,1)');
      mask.addColorStop(1, 'rgba(0,0,0,0)');
      fx.globalCompositeOperation = 'destination-in';
      fx.fillStyle = mask;
      fx.fillRect(0, 0, W, H);
      fx.globalCompositeOperation = 'source-over';

      const ft = new THREE.CanvasTexture(fc);
      ft.colorSpace = THREE.SRGBColorSpace;
      faceMat.map = ft;
      faceMat.opacity = 1;
      faceMat.needsUpdate = true;
    }
  }

  if (typeof window.SCENE_FACE === 'string' && window.SCENE_FACE) {
    const im = new Image();
    im.onload = () => applyFace(im);
    im.src = window.SCENE_FACE;
  }

  /* ------------------------------------------------------------ the shots
     Camera position AND aim keyed as 12 shots, evaluated with getPoint() —
     the UNIFORM parameterisation — so key i lands exactly at u = i/12.
     (getPointAt re-parameterises by arc length and slides every shot off its
     intended moment.) Closed curves ⇒ the loop cannot seam. */
  const SHOTS = [
    { c: [ 34, 15, 156], t: [ -4,  4, 118] }, // 0/12 python — the head, front 3/4
    { c: [ 54, 18,  96], t: [ -4,  5,  64] }, // 1 alongside the body
    { c: [ 58, 17,  20], t: [  2,  5,  -6] }, // 2 the long run of it
    { c: [110, 20, -40], t: [146, 10,-124] }, // 3 racks appear out of the haze
    { c: [196, 16,-176], t: [148, 10,-128] }, // 4 past the racks, looking back
    // Bull orbit looks WEST into empty void — aimed north it would frame the
    // python's tail dead-centre in the background, half-fogged.
    { c: [ 60, 24,-216], t: [-56, 10,-198] }, // 5 long empty travel — void beat
    { c: [-30, 22,-248], t: [-120, 11,-190] },// 6 bull, from the south-east
    { c: [-140, 20,-256], t: [-120, 11,-190] },// 7 bull, from the south
    // Height keys change gently — steep drops make the spline overshoot and
    // dip the camera under the floor.
    { c: [-250, 16, -90], t: [-170,  8,  30] }, // 8 void drift — empty beat
    { c: [-225, 13,  80], t: [-155,  7, 160] }, // 9 figure emerges from the fog
    // Figure beat approaches from the SOUTH: from the west, figure, gallery
    // panel and the python's head line up and the half-fogged head floats in
    // frame like a severed pipe.
    { c: [-150, 10, 245], t: [-149,  6.5, 187] },// 10 the figure, head on
    { c: [-52, 13, 228],  t: [-124,  7, 190] }  // 11 pulling away east
  ];
  const camCurve = new THREE.CatmullRomCurve3(SHOTS.map(s => new THREE.Vector3(...s.c)), true, 'catmullrom', 0.5);
  const aimCurve = new THREE.CatmullRomCurve3(SHOTS.map(s => new THREE.Vector3(...s.t)), true, 'catmullrom', 0.5);

  const camPos = new THREE.Vector3(), camAim = new THREE.Vector3();
  let clock = 0.02;

  /* ------------------------------------------------------------ captions */
  const CAPS = [
    { a: 0.01, b: 0.21, k: '01 · Pythonidae', t: 'PYTHON', s: 'Primary language since 2019 — Python and C++' },
    { a: 0.26, b: 0.41, k: '02 · exchange infrastructure', t: 'COLOCATION', s: '18 Solace appliances · 60+ RHEL servers · NSE' },
    { a: 0.49, b: 0.63, k: '03 · Bos taurus', t: 'THE BULL', s: 'Permanent long bias' },
    { a: 0.79, b: 0.98, k: '04 · Homo sapiens', t: 'NILESH GAHLOT', s: 'Quant Developer — backtesting · execution · risk' }
  ];
  const ltEl = document.getElementById('lowerThird');
  const ltK = document.getElementById('ltKicker');
  const ltT = document.getElementById('ltTitle');
  const ltS = document.getElementById('ltSub');
  let capIdx = -1;
  function captions(u) {
    if (!ltEl) return;
    let idx = -1;
    for (let i = 0; i < CAPS.length; i++) if (u >= CAPS[i].a && u <= CAPS[i].b) { idx = i; break; }
    if (idx === capIdx) return;
    capIdx = idx;
    if (idx < 0) { ltEl.classList.remove('is-in'); return; }
    ltK.textContent = CAPS[idx].k; ltT.textContent = CAPS[idx].t; ltS.textContent = CAPS[idx].s;
    ltEl.classList.add('is-in');
  }

  /* --------------------------------------------------------------- frame */
  function frameAt(u) {
    u = ((u % 1) + 1) % 1;
    const wob = u * TAU;

    updateSnake(u);

    figure.rotation.y = 0.5 + Math.sin(wob) * 0.05;

    camCurve.getPoint(u, camPos);
    aimCurve.getPoint(u, camAim);
    camAim.y += Math.sin(wob * 1.3) * 1.4;
    camPos.y += Math.sin(wob * 2.1) * 0.7;
    // Hard guarantee: never fall through the shadow plane. Below it the world
    // renders inverted (back faces, mirrored panels) — unrecoverable on screen.
    if (camPos.y < 3) camPos.y = 3;
    camera.position.copy(camPos);
    camera.lookAt(camAim);
    // Roll must be COMPOSED onto the look-at orientation, not written into
    // rotation.z. lookAt yields an XYZ Euler whose z is ≈π for directions in
    // the +Z hemisphere; assigning z there silently flips the camera 180°.
    camera.rotateZ(Math.sin(wob * 0.9) * 0.016);

    // the face card billboards toward the camera so the photo always reads
    faceCard.rotation.y = Math.atan2(camPos.x - figure.position.x, camPos.z - figure.position.z) - figure.rotation.y;

    captions(u);
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
    camera.fov = r.width < 700 ? 52 : 38;
    camera.updateProjectionMatrix();
    frameAt(clock);
  }
  resize();
  window.addEventListener('resize', resize);
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(host);

  /* --------------------------------------------------------------- theme */
  window.addEventListener('ng:theme', () => {
    dark = root.classList.contains('dark');
    const p = P();
    scene.background.setHex(p.void);
    scene.fog.color.setHex(p.void);
    floorMat.opacity = dark ? 0.30 : 0.19;
    bodyMat.color.setHex(p.body);
    hemi.intensity = dark ? 0.55 : 1.15;
    key.intensity = dark ? 1.5 : 2.5;
    fill.intensity = dark ? 0.25 : 0.5;
    if (bull) bull.traverse(o => { if (o.isMesh) o.material.color.setHex(p.body); });
    rackCluster.traverse(o => {
      if (o.isMesh && o.material.color && !o.material.isMeshBasicMaterial) o.material.color.setHex(p.body);
    });
    if (rackCluster.userData.ledMat) rackCluster.userData.ledMat.color.setHex(dark ? 0x8a7f66 : 0x2a2620);
    frameAt(clock);
  });

  /* ---------------------------------------------------------- run / pause */
  let running = true, held = false;
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((en) => { running = en[0].isIntersecting; last = performance.now(); },
      { threshold: 0.02 }).observe(host);
  }
  window.__scene = {
    seek(sec) { clock = (((sec / LOOP) % 1) + 1) % 1; frameAt(clock); },
    at(u) { clock = ((u % 1) + 1) % 1; frameAt(clock); },
    pause() { held = true; },
    play() { held = false; last = performance.now(); },
    u() { return clock; },
    LOOP,
    ready() { return bullReady; },
    dbg() { return { snake, headGroup, rackCluster, figure, bullRig: bull, floor }; },
    info() { return { calls: renderer.info.render.calls, tris: renderer.info.render.triangles }; },
    // cast a ray through NDC (nx, ny) and report what it hits on the snake
    ray(nx, ny) {
      const rc = new THREE.Raycaster();
      rc.setFromCamera(new THREE.Vector2(nx, ny), camera);
      const h = rc.intersectObject(snake, false)[0];
      if (!h) return null;
      return {
        point: [h.point.x, h.point.y, h.point.z].map(v => +v.toFixed(1)),
        dist: +h.distance.toFixed(1),
        seg: Math.floor(h.faceIndex / (RAD * 2)),
        s: +(Math.floor(h.faceIndex / (RAD * 2)) / SEG).toFixed(3)
      };
    },
    // camera height + how upright it is (world-up · camera-up); upDot must
    // stay well above 0 or the view has rolled over
    probe() {
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
      return { y: camera.position.y, upDot: up.y };
    }
  };

  frameAt(clock);
  host.classList.add('is-ready');
  if (reduced) return;

  let last = performance.now();
  requestAnimationFrame(function tick(now) {
    requestAnimationFrame(tick);
    if (document.hidden || !running || held) { last = now; return; }
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    clock = (clock + dt / LOOP) % 1;
    frameAt(clock);
  });

  document.addEventListener('visibilitychange', () => {
    last = performance.now();
    if (!document.hidden) frameAt(clock);
  });
}
