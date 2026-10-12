// Gemeinsame 3D-Szene für Viewer, Produktbilder und Animation.
// CAD-Koordinaten (mm, Z oben) werden in einer Gruppe nach three.js (Y oben) gedreht.
import * as THREE from 'three';
import { STLLoader } from './vendor/three/STLLoader.js';
import { RoomEnvironment } from './vendor/three/RoomEnvironment.js';
import { toCreasedNormals } from './vendor/three/BufferGeometryUtils.js';

export const MASSE = {
  steigung: 3.5, fuge: 10, zapfen: 22.5, panel: 162.4, hoehe: 168,
  oeffnung: new THREE.Vector3(13, 0, 162.4), // CAD
};
const U_UMFANG = 2 * Math.PI * 33;          // 207.3 mm
const Z_LACK_UNTEN = 10, Z_LACK_OBEN = 164;   // lackierter Bereich (Rumpf + Schulter)

// ---------------------------------------------------------------- Texturen
function etikettTexturen(maxSize) {
  const W = Math.min(4096, maxSize), H = Math.round(W * (Z_LACK_OBEN - Z_LACK_UNTEN) / U_UMFANG);
  const farbe = document.createElement('canvas'); farbe.width = W; farbe.height = H;
  const orm = document.createElement('canvas'); orm.width = W; orm.height = H;
  const c = farbe.getContext('2d'), m = orm.getContext('2d');
  const k = W / U_UMFANG;                         // px pro mm
  const X = (s) => (0.5 + s / U_UMFANG) * W;      // s = Bogen-mm ab Vorderseite (rechts positiv)
  const Y = (z) => (Z_LACK_OBEN - z) * k;
  // ORM-Kanäle: R = 1 (AO), G = Rauheit, B = Metallanteil
  const orm_ = (rough, metal) => `rgb(255,${Math.round(rough * 255)},${Math.round(metal * 255)})`;
  const both = (fill, rough, metal, fn) => { c.fillStyle = fill; m.fillStyle = orm_(rough, metal); fn(c); fn(m); };

  // Grundlack: tiefes Tannengrün, metallic
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#11493a'); g.addColorStop(0.5, '#0d3d30'); g.addColorStop(1, '#082a21');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  m.fillStyle = orm_(0.32, 0.55); m.fillRect(0, 0, W, H);
  // feine Pinsel-/Lackstruktur
  for (let i = 0; i < 9000; i++) {
    c.fillStyle = `rgba(255,255,255,${Math.random() * 0.025})`;
    c.fillRect(Math.random() * W, Math.random() * H, Math.random() * 40 * k / 10 + 2, 1);
  }
  // Schulter: silberner Verlauf (blankes Alu durch den Lack)
  both('#cfd3d8', 0.22, 1, (x) => x.fillRect(0, Y(Z_LACK_OBEN), W, Y(150.5) - Y(Z_LACK_OBEN)));
  const sg = c.createLinearGradient(0, Y(151), 0, Y(146));
  sg.addColorStop(0, 'rgba(207,211,216,1)'); sg.addColorStop(1, 'rgba(207,211,216,0)');
  c.fillStyle = sg; c.fillRect(0, Y(151), W, Y(146) - Y(151));
  // goldene Zierbänder unter den erhabenen Ringen + feine Begleitlinien
  for (const z of [30, 62, 124]) {
    both('#c9a24a', 0.3, 1, (x) => x.fillRect(0, Y(z + 1.6), W, 3.2 * k));
    both('#c9a24a', 0.3, 1, (x) => { x.fillRect(0, Y(z + 3.0), W, 0.35 * k); x.fillRect(0, Y(z - 2.65), W, 0.35 * k); });
  }
  // Markenfeld: dunkleres Band mit Goldlinien
  c.fillStyle = 'rgba(0,0,0,0.28)'; c.fillRect(0, Y(106), W, (106 - 86) * k);
  both('#d8b45a', 0.3, 1, (x) => { x.fillRect(0, Y(106.4), W, 0.5 * k); x.fillRect(0, Y(86.1), W, 0.5 * k); });

  // Alpenpanorama unten (silbern)
  const berge = (offset) => {
    const pts = [];
    for (let s = -U_UMFANG / 2; s <= U_UMFANG / 2 + 1; s += 1.5) {
      const h = 9 + 5 * Math.sin((s + offset) * 0.11) + 3.2 * Math.sin((s + offset) * 0.27 + 1.3)
        + 2.2 * Math.abs(Math.sin((s + offset) * 0.53));
      pts.push([X(s), Y(12 + h)]);
    }
    return pts;
  };
  for (const [ctx, fill] of [[c, '#b9c0c7'], [m, orm_(0.25, 1)]]) {
    ctx.fillStyle = fill; ctx.beginPath(); ctx.moveTo(0, Y(10));
    for (const [x, y] of berge(0)) ctx.lineTo(x, y);
    ctx.lineTo(W, Y(10)); ctx.closePath(); ctx.fill();
  }
  c.fillStyle = 'rgba(255,255,255,0.9)'; c.beginPath(); c.moveTo(0, Y(10));
  for (const [x, y] of berge(0)) c.lineTo(x, y + 2.2 * k); // Schneekanten-Schatten
  c.lineTo(W, Y(10)); c.closePath(); c.globalCompositeOperation = 'source-atop';
  c.fillStyle = '#8e979f'; c.fill(); c.globalCompositeOperation = 'source-over';

  // Falken-Emblem über dem Schriftzug (Vorderseite)
  const falke = (ctx, fill) => {
    const cx = X(0), cy = Y(115), r = 7.2 * k;
    ctx.save(); ctx.translate(cx, cy);
    ctx.strokeStyle = fill; ctx.lineWidth = 0.55 * k;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, r - 0.9 * k, 0, Math.PI * 2); ctx.lineWidth = 0.25 * k; ctx.stroke();
    ctx.fillStyle = fill; ctx.beginPath();
    const s = k * 0.95;
    const P = [[0, -3.2], [1.1, -1.8], [6.2, -3.6], [5.0, -1.3], [6.4, -1.6], [4.2, 0.6], [1.3, 0.8], [1.6, 3.6],
      [0, 5.0], [-1.6, 3.6], [-1.3, 0.8], [-4.2, 0.6], [-6.4, -1.6], [-5.0, -1.3], [-6.2, -3.6], [-1.1, -1.8]];
    P.forEach(([x, y], i) => (i ? ctx.lineTo(x * s, y * s) : ctx.moveTo(x * s, y * s)));
    ctx.closePath(); ctx.fill(); ctx.restore();
  };
  c.save(); falke(c, '#e9edf1'); c.restore(); falke(m, orm_(0.2, 1));

  const text = (str, s, z, px, color, opts = {}) => {
    c.save(); c.font = `${opts.weight || 700} ${px * k}px ${opts.font || 'DejaVu Sans, Arial, sans-serif'}`;
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = color;
    if (opts.spacing) c.letterSpacing = `${opts.spacing * k}px`;
    c.fillText(str, X(s), Y(z)); c.restore();
  };
  text('BRAUEREI SILBERFALKE  ·  SEIT 1887', 0, 69.5, 2.6, '#e3c470', { spacing: 0.5 });
  text('NATÜRLICH GEBRAUT  ·  FEINHERB  ·  GOLDEN', 0, 52, 2.4, '#dfe6ea', { weight: 400, spacing: 0.4 });
  text('KÜHL GENIESSEN', 62, 52, 2.3, '#dfe6ea', { weight: 400, spacing: 0.4 });
  text('ALPENQUELLE', -62, 52, 2.3, '#dfe6ea', { weight: 400, spacing: 0.4 });

  // Rückseite: Zutaten, Strichcode, Recycling
  const back = U_UMFANG / 2;
  const kleintext = [
    'Zutaten: Wasser, GERSTENMALZ, Hopfen, Hefe.',
    'Alkoholgehalt 5,0 % vol. · Inhalt 500 ml',
    'Mindestens haltbar bis: siehe Dosenboden.',
    'Kühl und dunkel lagern. Nicht für Kinder.',
    'Brauerei Silberfalke AG · Alpenstrasse 18',
  ];
  kleintext.forEach((t, i) => text(t, back - 38, 80 - i * 3.6, 2.1, '#d6dde2', { weight: 400 }));
  const bx = X(back + 28 - U_UMFANG), bw = 26 * k, by = Y(78), bh = 17 * k; // Strichcode (rechts der Naht)
  for (const off of [0, U_UMFANG]) {
    const x0 = X(back + 12) - off * k;
    c.fillStyle = '#f4f4f0'; c.fillRect(x0, by, bw, bh);
    let x = x0 + 2 * k; let seed = 7;
    while (x < x0 + bw - 2 * k) {
      seed = (seed * 9301 + 49297) % 233280; const w = (0.25 + (seed / 233280) * 0.6) * k;
      c.fillStyle = '#111'; c.fillRect(x, by + 1.5 * k, w, bh - 5 * k); x += w + (0.3 + ((seed * 7) % 5) * 0.12) * k;
    }
    c.fillStyle = '#111'; c.font = `${1.8 * k}px DejaVu Sans Mono, monospace`; c.textAlign = 'center';
    c.fillText('7 612345 678906', x0 + bw / 2, by + bh - 1.2 * k);
  }
  void bx;
  // Recycling-Symbol
  const rx = X(back - 38), ry = Y(60);
  c.strokeStyle = '#d6dde2'; c.lineWidth = 0.4 * k; c.beginPath(); c.arc(rx, ry, 3.2 * k, 0, Math.PI * 2); c.stroke();
  c.font = `700 ${2.2 * k}px DejaVu Sans, sans-serif`; c.fillStyle = '#d6dde2'; c.textAlign = 'center';
  c.textBaseline = 'middle'; c.fillText('ALU', rx, ry);
  text('Dose recyceln', back - 26, 60, 2.0, '#d6dde2', { weight: 400 });

  const mk = (cv, srgb) => {
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 8; t.wrapS = THREE.RepeatWrapping; return t;
  };
  return { map: mk(farbe, true), orm: mk(orm, false) };
}

function holzTextur() {
  const S = 1024, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const c = cv.getContext('2d');
  c.fillStyle = '#1b130e'; c.fillRect(0, 0, S, S);
  for (let i = 0; i < 260; i++) {
    const y = Math.random() * S, a = 0.03 + Math.random() * 0.08;
    c.strokeStyle = Math.random() < 0.5 ? `rgba(70,45,28,${a})` : `rgba(0,0,0,${a * 1.5})`;
    c.lineWidth = 1 + Math.random() * 5; c.beginPath();
    for (let x = 0; x <= S; x += 16) c.lineTo(x, y + Math.sin(x * 0.006 + i) * 6 + Math.sin(x * 0.03 + i * 3) * 1.5);
    c.stroke();
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3); t.anisotropy = 8; return t;
}

function filterTextur() {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
  const c = cv.getContext('2d');
  c.fillStyle = '#c8823e'; c.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 1400; i++) {
    c.fillStyle = Math.random() < 0.5 ? 'rgba(240,200,140,0.55)' : 'rgba(120,60,20,0.35)';
    c.beginPath(); c.arc(Math.random() * 256, Math.random() * 128, Math.random() * 2.2, 0, 7); c.fill();
  }
  c.fillStyle = '#e9c66f'; c.fillRect(0, 0, 256, 5);   // goldene Ziernaht
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ---------------------------------------------------------------- Zigarettenstummel
export function stummel(seed = 1) {
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const g = new THREE.Group();
  const r = 3.85, lf = 21, lp = 4 + rnd() * 6;
  const filterMat = new THREE.MeshPhysicalMaterial({ map: filterTextur(), roughness: 0.75 });
  const papier = new THREE.MeshPhysicalMaterial({ color: 0xece8df, roughness: 0.85 });
  const asche = new THREE.MeshPhysicalMaterial({ color: 0x2b2826, roughness: 1 });
  const f = new THREE.Mesh(new THREE.CylinderGeometry(r, r, lf, 32, 1), filterMat);
  f.position.y = lf / 2;
  const endFl = new THREE.Mesh(new THREE.CircleGeometry(r, 32), new THREE.MeshStandardMaterial({ color: 0xefe6d2, roughness: 1 }));
  endFl.rotation.x = Math.PI / 2; endFl.position.y = 0;
  // Papierteil, leicht zerdrückt und geknickt
  const pg = new THREE.CylinderGeometry(r * 0.96, r * 0.92, lp, 32, 6);
  const pos = pg.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) + lp / 2, q = y / lp;
    pos.setX(i, pos.getX(i) * (1 - 0.25 * q * q));
    pos.setZ(i, pos.getZ(i) * (1 - 0.1 * q) + Math.sin(i) * 0.08);
  }
  pg.computeVertexNormals();
  const p = new THREE.Mesh(pg, papier);
  const pivot = new THREE.Group(); pivot.position.y = lf; pivot.rotation.z = (rnd() - 0.5) * 0.35;
  p.position.y = lp / 2; pivot.add(p);
  const ag = new THREE.SphereGeometry(r * 0.88, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  ag.scale(0.85, 0.35, 1);
  const a = new THREE.Mesh(ag, asche); a.position.y = lp; pivot.add(a);
  g.add(f, endFl, pivot);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.userData.laenge = lf + lp;
  return g;
}

// ---------------------------------------------------------------- Szene
export async function baueSzene(renderer, opts = {}) {
  const basis = opts.basis || './';
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = opts.exposure ?? 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.localClippingEnabled = true;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07080a);
  scene.fog = new THREE.Fog(0x07080a, 700, 1600);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;

  // Tisch
  const tisch = new THREE.Mesh(new THREE.CircleGeometry(1500, 96),
    new THREE.MeshPhysicalMaterial({ map: holzTextur(), roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.35 }));
  tisch.rotation.x = -Math.PI / 2; tisch.receiveShadow = true; scene.add(tisch);

  // Licht
  const key = new THREE.SpotLight(0xfff1de, 2.0e5, 0, Math.PI / 5, 1.0, 1.6);
  key.position.set(-260, 520, 340); key.target.position.set(0, 80, 0);
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.8;
  key.shadow.camera.near = 200; key.shadow.camera.far = 1200; key.shadow.radius = 6;
  const rim = new THREE.SpotLight(0x9fc4ff, 1.6e5, 0, Math.PI / 8, 0.6, 1.6);
  rim.position.set(320, 300, -380); rim.target.position.set(0, 90, 0);
  const rim2 = new THREE.SpotLight(0xffd29a, 1.1e5, 0, Math.PI / 8, 0.6, 1.6);
  rim2.position.set(-380, 220, -260); rim2.target.position.set(0, 90, 0);
  const fill = new THREE.HemisphereLight(0xb8c4d6, 0x1a120c, 0.35);
  const top = new THREE.SpotLight(0xffffff, 0.8e5, 0, Math.PI / 10, 0.7, 1.6);
  top.position.set(60, 520, 80); top.target.position.set(0, 160, 0);
  scene.add(key, key.target, rim, rim.target, rim2, rim2.target, fill, top, top.target);

  // Materialien
  const tex = etikettTexturen(renderer.capabilities.maxTextureSize);
  const clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
  const M = {
    lack: new THREE.MeshPhysicalMaterial({ map: tex.map, roughnessMap: tex.orm, metalnessMap: tex.orm,
      roughness: 1, metalness: 1, clearcoat: 1, clearcoatRoughness: 0.06 }),
    alu: new THREE.MeshPhysicalMaterial({ color: 0xd9dde2, metalness: 1, roughness: 0.24 }),
    innen: new THREE.MeshPhysicalMaterial({ color: 0x4a4640, metalness: 0.6, roughness: 0.55, envMapIntensity: 0.25 }),
    schrift: new THREE.MeshPhysicalMaterial({ color: 0xf2f4f6, metalness: 0.95, roughness: 0.18, clearcoat: 1 }),
    gold: new THREE.MeshPhysicalMaterial({ color: 0xd8ad4f, metalness: 1, roughness: 0.25, clearcoat: 1 }),
    schnitt: new THREE.MeshStandardMaterial({ color: 0xe0662a, roughness: 0.6, side: THREE.BackSide }),
  };
  const alleDosenMats = [M.lack, M.alu, M.innen, M.schrift, M.gold];

  const loader = new STLLoader();
  const lade = (n) => new Promise((res, rej) => loader.load(basis + 'modell/' + n + '.stl', res, undefined, rej));
  const [gRumpf, gRelief, gBoden, gLasche, gNiet] = await Promise.all(['rumpf', 'relief', 'boden', 'lasche', 'niet'].map(lade));

  // Rumpf in Material-Gruppen aufteilen: 0 Lack, 1 Alu, 2 Innen
  function teileRumpf(geo) {
    const p = geo.attributes.position.array, n = geo.attributes.normal.array;
    const tri = p.length / 9, klasse = new Uint8Array(tri);
    for (let t = 0; t < tri; t++) {
      let cx = 0, cy = 0, cz = 0;
      for (let v = 0; v < 3; v++) { cx += p[t * 9 + v * 3]; cy += p[t * 9 + v * 3 + 1]; cz += p[t * 9 + v * 3 + 2]; }
      cx /= 3; cy /= 3; cz /= 3;
      const r = Math.hypot(cx, cy), nr = (n[t * 9] * cx + n[t * 9 + 1] * cy) / (r || 1);
      if (cz < 160.3 && r < 30.8) klasse[t] = 2;
      else if (cz > Z_LACK_UNTEN + 0.05 && cz < 163.9 && r > 27.0 && nr > 0.15) klasse[t] = 0;
      else klasse[t] = 1;
    }
    const out = new THREE.BufferGeometry();
    const P = new Float32Array(p.length), UV = new Float32Array(tri * 6);
    let o = 0;
    for (const k of [0, 1, 2]) {
      const start = o;
      for (let t = 0; t < tri; t++) {
        if (klasse[t] !== k) continue;
        const us = [];
        for (let v = 0; v < 3; v++) {
          const x = p[t * 9 + v * 3], y = p[t * 9 + v * 3 + 1], z = p[t * 9 + v * 3 + 2];
          P.set([x, y, z], o * 9 + v * 3);
          let a = Math.atan2(y, x) + Math.PI / 2; // Vorderseite (-Y) -> 0
          let u = 0.5 + a / (2 * Math.PI); u = u - Math.floor(u);
          us.push(u); UV[o * 6 + v * 2 + 1] = (z - Z_LACK_UNTEN) / (Z_LACK_OBEN - Z_LACK_UNTEN);
        }
        if (Math.max(...us) - Math.min(...us) > 0.5) for (let v = 0; v < 3; v++) if (us[v] < 0.5) us[v] += 1;
        for (let v = 0; v < 3; v++) UV[o * 6 + v * 2] = us[v];
        o++;
      }
      out.addGroup(start * 3, (o - start) * 3, k);
    }
    out.setAttribute('position', new THREE.BufferAttribute(P, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(UV, 2));
    const groups = out.groups.slice();
    const cr = toCreasedNormals(out, THREE.MathUtils.degToRad(32));
    cr.clearGroups(); groups.forEach((g) => cr.addGroup(g.start, g.count, g.materialIndex));
    return cr;
  }
  const glatt = (geo, deg = 32) => toCreasedNormals(geo, THREE.MathUtils.degToRad(deg));

  // Relief: Ringe gold, Schrift silber (nach Höhe getrennt)
  function teileRelief(geo) {
    const p = geo.attributes.position.array, tri = p.length / 9;
    const ring = (z) => [30, 62, 124].some((zr) => Math.abs(z - zr) < 1.4);
    const P = new Float32Array(p.length); let o = 0; const groups = [];
    for (const k of [0, 1]) {
      const s = o;
      for (let t = 0; t < tri; t++) {
        const z = (p[t * 9 + 2] + p[t * 9 + 5] + p[t * 9 + 8]) / 3;
        if ((ring(z) ? 1 : 0) !== k) continue;
        P.set(p.subarray(t * 9, t * 9 + 9), o * 9); o++;
      }
      groups.push([s * 3, (o - s) * 3, k]);
    }
    const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(P, 3));
    const cr = glatt(out, 40); groups.forEach((g) => cr.addGroup(...g)); return cr;
  }

  const dose = new THREE.Group();             // ganze Dose (CAD-Koordinaten)
  dose.rotation.x = -Math.PI / 2;
  const welt = new THREE.Group(); welt.add(dose); scene.add(welt);

  const rumpf = new THREE.Group(); dose.add(rumpf);
  const mRumpf = new THREE.Mesh(teileRumpf(gRumpf), [M.lack, M.alu, M.innen]);
  const mRelief = new THREE.Mesh(teileRelief(gRelief), [M.schrift, M.gold]);
  const mNiet = new THREE.Mesh(glatt(gNiet), M.alu);
  rumpf.add(mRumpf, mRelief, mNiet);
  const lasche = new THREE.Mesh(glatt(gLasche, 35), M.alu);
  lasche.position.z = 0.0; dose.add(lasche);
  const boden = new THREE.Mesh(glatt(gBoden, 35), M.alu); dose.add(boden);
  const teile = { rumpf, lasche, boden };

  // Schnittdeckel (Rückseiten-Trick): gleiche Geometrie, BackSide, nur bei aktivem Schnitt sichtbar
  const kappen = [];
  for (const [mesh, parent] of [[mRumpf, rumpf], [boden, dose], [mRelief, rumpf]]) {
    const k = new THREE.Mesh(mesh.geometry, M.schnitt); k.visible = false; k.renderOrder = -1;
    (parent === dose ? boden : rumpf).add(k);
    if (parent === dose) k.position.set(0, 0, 0);
    kappen.push(k);
  }
  for (const o of [mRumpf, mRelief, mNiet, lasche, boden]) { o.castShadow = true; o.receiveShadow = true; }

  // Stummel-Vorrat (für Innenansicht)
  const stummelGruppe = new THREE.Group(); dose.add(stummelGruppe);
  const lagen = [ // x, y (CAD), Drehung, Lage
    [8, -9, 0.4, 0], [-11, 6, 2.1, 0], [2, 13, 4.0, 0], [-5, -11, 5.2, 0], [11, 4, 1.2, 0],
    [-9, -3, 3.0, 1], [5, 1, 0.9, 1],
  ];
  lagen.forEach(([x, y, rot, lage], i) => {
    const s = stummel(17 + i * 31);
    s.position.y = -s.userData.laenge / 2;   // Längsachse (lokal Y) liegt in CAD horizontal
    const h = new THREE.Group(); h.add(s);
    h.position.set(x, y, MASSE.zapfen + 3.9 + lage * 7.2);
    h.rotation.set(0, (i % 3 - 1) * 0.6, rot);
    stummelGruppe.add(h);
  });
  stummelGruppe.visible = false;

  // Fallender Stummel (Welt-/three-Koordinaten über der Öffnung)
  const fallend = stummel(99); fallend.visible = false; welt.add(fallend);

  const zustand = {
    setSchnitt(an, normal) {
      const mats = alleDosenMats.concat([M.schnitt]);
      if (normal) clipPlane.normal.copy(normal).normalize();
      mats.forEach((m) => { m.clippingPlanes = an ? [clipPlane] : []; m.needsUpdate = true; });
      kappen.forEach((k) => (k.visible = an));
      this.innenHell(an);
    },
    innenHell(an) {   // im Schnitt/Transparent: Innenwand hell (sonst dunkel wie in echter Dose)
      M.innen.color.set(an ? 0xc9c3b4 : 0x4a4640); M.innen.envMapIntensity = an ? 0.9 : 0.25;
    },
    setTransparenz(op) {
      const t = op < 0.999;
      for (const m of alleDosenMats) {
        if (m.transparent !== t) { m.transparent = t; m.needsUpdate = true; }
        m.opacity = op; m.depthWrite = !t;
      }
      for (const o of [mRumpf, mRelief, mNiet, lasche]) o.castShadow = !t;
      if (t) this.innenHell(true);
    },
  };
  return { scene, dose, welt, teile, stummelGruppe, fallend, zustand, M, clipPlane, tisch };
}

// Kamera aus Kugelkoordinaten (Azimut 0 = Vorderseite)
export function setzeKamera(cam, ziel, az, el, dist) {
  const a = THREE.MathUtils.degToRad(az), e = THREE.MathUtils.degToRad(el);
  cam.position.set(ziel.x + dist * Math.sin(a) * Math.cos(e), ziel.y + dist * Math.sin(e), ziel.z + dist * Math.cos(a) * Math.cos(e));
  cam.lookAt(ziel);
}
