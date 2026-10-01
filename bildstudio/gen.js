'use strict';
// Bildstudio – prozedurale Bild-Generatoren.
// Alles wird lokal aus Mathematik und einer Zufallszahl (Seed) berechnet: kein Netz, kein KI-Modell.
// Gleicher Seed + gleiche Einstellungen = exakt dasselbe Bild.
const Gen = (() => {
  // Schneller, reproduzierbarer Zufallsgenerator (mulberry32)
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashStr(s) {
    let h = 2166136261;
    for (const c of s) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  // Paletten jeweils von dunkel nach hell sortiert
  const PALETTES = {
    sonnenuntergang: { label: 'Sonnenuntergang', colors: ['#1b1036', '#5b1a5e', '#c4325a', '#f47c3c', '#fdd26e'] },
    ozean: { label: 'Ozean', colors: ['#03142b', '#0a3d62', '#1e7fa8', '#5fc4d6', '#e0f7fa'] },
    wald: { label: 'Wald', colors: ['#0d1f12', '#1f4d2b', '#4f8a3a', '#a8c66c', '#f0e8b8'] },
    neon: { label: 'Neon', colors: ['#0b0221', '#3a0ca3', '#f72585', '#4cc9f0', '#b8f2e6'] },
    pastell: { label: 'Pastell', colors: ['#8e7cc3', '#f4a7c0', '#a7c7f4', '#b8e8d8', '#fff1c1'] },
    feuer: { label: 'Feuer', colors: ['#0a0000', '#5c0a00', '#c42a00', '#ff8c00', '#fff3b0'] },
    eis: { label: 'Eis', colors: ['#0b1a2e', '#2a4a6e', '#7aa6c8', '#cfe6f5', '#ffffff'] },
    herbst: { label: 'Herbst', colors: ['#2b1406', '#7a2e0b', '#c8621a', '#e8a33c', '#f4dfae'] },
    mono: { label: 'Schwarzweiss', colors: ['#0a0a0a', '#3a3a3a', '#7a7a7a', '#bdbdbd', '#f5f5f5'] },
  };

  const hex = (c) => { const n = parseInt(c.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  function hslRgb(h, s, l) {
    h = (((h % 360) + 360) % 360) / 360; s /= 100; l /= 100;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => { const k = (n + h * 12) % 12; return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
    return [f(0), f(8), f(4)];
  }
  const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const lum = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
  const tri = (v) => { v -= Math.floor(v / 2) * 2; return v > 1 ? 2 - v : v; }; // Dreieckswelle 0..1..0

  function randomPalette(r) {
    const h = r() * 360, shift = (40 + r() * 120) * (r() < 0.5 ? -1 : 1), sat = 45 + r() * 45;
    return [0, 1, 2, 3, 4].map((i) => hslRgb(h + shift * i / 4, sat, 8 + i * 21));
  }

  // 256 Farben als Nachschlagetabelle für schnelle Pixel-Schleifen
  function lut(cols) {
    const L = new Uint8ClampedArray(256 * 3), n = cols.length - 1;
    for (let i = 0; i < 256; i++) {
      const t = i / 255 * n, k = Math.min(n - 1, Math.floor(t));
      const c = mix(cols[k], cols[k + 1], t - k);
      L[i * 3] = c[0]; L[i * 3 + 1] = c[1]; L[i * 3 + 2] = c[2];
    }
    return L;
  }

  // Value-Noise mit gemischter Permutationstabelle
  function noise(r) {
    const P = new Uint8Array(512), V = new Float32Array(256);
    for (let i = 0; i < 256; i++) { P[i] = i; V[i] = r(); }
    for (let i = 255; i > 0; i--) { const j = (r() * (i + 1)) | 0; const t = P[i]; P[i] = P[j]; P[j] = t; }
    for (let i = 0; i < 256; i++) P[i + 256] = P[i];
    return (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, X = xi & 255, Y = yi & 255;
      const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      const a = V[P[P[X] + Y]], b = V[P[P[X + 1] + Y]], c = V[P[P[X] + Y + 1]], d = V[P[P[X + 1] + Y + 1]];
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    };
  }
  function fbm(n, x, y, oct) {
    let v = 0, a = 0.5, norm = 0;
    for (let o = 0; o < oct; o++) { v += a * n(x, y); norm += a; x *= 2.03; y *= 2.03; a *= 0.5; }
    return v / norm;
  }

  // Jeder Pixel bekommt einen Wert 0..1, der über die Palette eingefärbt wird
  function field(ctx, w, h, L, f) {
    const img = ctx.createImageData(w, h), d = img.data;
    let i = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++, i += 4) {
        const k = ((clamp01(f(x, y)) * 255) | 0) * 3;
        d[i] = L[k]; d[i + 1] = L[k + 1]; d[i + 2] = L[k + 2]; d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  function grain(ctx, w, h, r, amt) {
    const img = ctx.getImageData(0, 0, w, h), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (r() - 0.5) * amt;
      d[i] += n; d[i + 1] += n; d[i + 2] += n;
    }
    ctx.putImageData(img, 0, 0);
  }

  function shuffled(r, arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = (r() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  const MOTIFS = {
    landschaft: {
      label: 'Landschaft',
      draw(ctx, w, h, r, cols) {
        const n = noise(r), m = Math.min(w, h);
        const top = cols[r() < 0.5 ? 1 : 2], horizon = cols[4];
        const sky = ctx.createLinearGradient(0, 0, 0, h * 0.8);
        sky.addColorStop(0, css(mix(top, [0, 0, 0], 0.3)));
        sky.addColorStop(0.6, css(cols[3]));
        sky.addColorStop(1, css(horizon));
        ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);

        if (lum(top) < 80) { // dunkler Himmel: Sterne
          const count = (w * h) / 2500;
          for (let i = 0; i < count; i++) {
            ctx.fillStyle = `rgba(255,255,255,${0.2 + r() * 0.7})`;
            ctx.fillRect(r() * w, r() * r() * h * 0.6, 1 + r() * 1.5, 1 + r() * 1.5);
          }
        }

        const sx = w * (0.15 + r() * 0.7), sy = h * (0.18 + r() * 0.3), sr = m * (0.04 + r() * 0.07);
        const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr * 6);
        glow.addColorStop(0, css(mix(horizon, [255, 255, 255], 0.5), 0.7));
        glow.addColorStop(1, css(horizon, 0));
        ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = css(mix(horizon, [255, 255, 255], 0.6));
        ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();

        const layers = 4 + ((r() * 3) | 0), far = mix(cols[1], horizon, 0.45), near = mix(cols[0], [0, 0, 0], 0.3);
        for (let k = 0; k < layers; k++) {
          const t = k / (layers - 1);
          const base = h * (0.5 + 0.42 * t), amp = h * (0.28 - 0.14 * t);
          const s = (2.5 + r() * 2 - 1.2 * t) / w, oy = k * 7.31 + r() * 50, ridged = t < 0.5;
          const col = mix(far, near, t);
          const g = ctx.createLinearGradient(0, base - amp, 0, h);
          g.addColorStop(0, css(col));
          g.addColorStop(1, css(mix(col, [0, 0, 0], 0.35)));
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.moveTo(0, h);
          for (let x = 0; x <= w + 4; x += 3) {
            let v = clamp01((fbm(n, x * s, oy, 6) - 0.15) * 1.45);
            if (ridged) v = 0.5 * v + 0.5 * (1 - Math.abs(v * 2 - 1));
            ctx.lineTo(x, base - amp * v);
          }
          ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
          if (k < layers - 1) { ctx.fillStyle = css(horizon, 0.07); ctx.fillRect(0, 0, w, h); } // Dunst
        }
      },
    },

    wolken: {
      label: 'Wolken & Marmor',
      draw(ctx, w, h, r, cols) {
        const n = noise(r), s = (1.5 + r() * 3) / Math.max(w, h), warp = r() * 3, ox = r() * 100, oy = r() * 100;
        field(ctx, w, h, lut(cols), (x, y) => {
          const px = x * s + ox, py = y * s + oy;
          const qx = fbm(n, px, py, 4), qy = fbm(n, px + 5.2, py + 1.3, 4);
          return (fbm(n, px + warp * qx, py + warp * qy, 5) - 0.25) * 2;
        });
      },
    },

    fraktal: {
      label: 'Fraktal',
      draw(ctx, w, h, r, cols) {
        const a = r() * Math.PI * 2, cr = 0.7885 * Math.cos(a), ci = 0.7885 * Math.sin(a);
        const zoom = 0.9 + r() * 0.8, rot = r() * Math.PI * 2, cos = Math.cos(rot), sin = Math.sin(rot);
        const sc = 3 / (zoom * Math.min(w, h)), max = 200, cyc = 0.04 + r() * 0.08, off = r() * 2;
        field(ctx, w, h, lut(cols), (x, y) => {
          const dx = (x - w / 2) * sc, dy = (y - h / 2) * sc;
          let zx = dx * cos - dy * sin, zy = dx * sin + dy * cos, i = 0;
          for (; i < max; i++) {
            const xx = zx * zx, yy = zy * zy;
            if (xx + yy > 256) break;
            zy = 2 * zx * zy + ci; zx = xx - yy + cr;
          }
          if (i === max) return 0;
          const sm = i + 1 - Math.log2(Math.log(zx * zx + zy * zy) / 2);
          return tri(sm * cyc + off);
        });
      },
    },

    mosaik: {
      label: 'Mosaik',
      draw(ctx, w, h, r, cols) {
        const N = 24 + ((r() * 90) | 0), L = lut(cols), px = new Float32Array(N), py = new Float32Array(N), pc = [];
        for (let j = 0; j < N; j++) {
          px[j] = r() * w; py[j] = r() * h;
          const k = ((r() * 255) | 0) * 3;
          pc.push([L[k], L[k + 1], L[k + 2]]);
        }
        const m = Math.min(w, h), line = Math.max(1.5, m / 350), edge = mix(cols[0], [0, 0, 0], 0.4);
        const img = ctx.createImageData(w, h), d = img.data;
        let i = 0;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++, i += 4) {
            let d1 = Infinity, d2 = Infinity, b = 0;
            for (let j = 0; j < N; j++) {
              const dx = x - px[j], dy = y - py[j], dd = dx * dx + dy * dy;
              if (dd < d1) { d2 = d1; d1 = dd; b = j; } else if (dd < d2) d2 = dd;
            }
            const s1 = Math.sqrt(d1), f = smooth(line, line * 2, Math.sqrt(d2) - s1);
            const shade = 1 - 0.3 * Math.min(1, s1 / (m * 0.3)), c = pc[b];
            d[i] = edge[0] + (c[0] * shade - edge[0]) * f;
            d[i + 1] = edge[1] + (c[1] * shade - edge[1]) * f;
            d[i + 2] = edge[2] + (c[2] * shade - edge[2]) * f;
            d[i + 3] = 255;
          }
        }
        ctx.putImageData(img, 0, 0);
      },
    },

    formen: {
      label: 'Geometrische Formen',
      draw(ctx, w, h, r, cols) {
        const m = Math.min(w, h), bg = cols[r() < 0.5 ? 4 : 0], others = cols.filter((c) => c !== bg);
        ctx.fillStyle = css(bg); ctx.fillRect(0, 0, w, h);
        const count = 6 + ((r() * 18) | 0);
        for (let i = 0; i < count; i++) {
          const c = others[(r() * others.length) | 0], s = m * (0.05 + r() * 0.3);
          ctx.save();
          ctx.globalAlpha = 0.55 + r() * 0.45;
          ctx.fillStyle = ctx.strokeStyle = css(c);
          ctx.translate(r() * w, r() * h);
          ctx.rotate(((r() * 8) | 0) * Math.PI / 4);
          ctx.beginPath();
          switch ((r() * 6) | 0) {
            case 0: ctx.arc(0, 0, s / 2, 0, Math.PI * 2); ctx.fill(); break;
            case 1: ctx.fillRect(-s / 2, -s / 2, s, s * (0.4 + r() * 0.6)); break;
            case 2: ctx.moveTo(0, -s / 2); ctx.lineTo(s / 2, s / 2); ctx.lineTo(-s / 2, s / 2); ctx.closePath(); ctx.fill(); break;
            case 3: ctx.arc(0, 0, s / 2, 0, Math.PI); ctx.fill(); break;
            case 4: ctx.lineWidth = s * 0.12; ctx.arc(0, 0, s / 2, 0, Math.PI * 2); ctx.stroke(); break;
            default: for (let j = 0; j < 5; j++) ctx.fillRect(-s / 2, -s / 2 + j * s / 5, s, s / 10);
          }
          ctx.restore();
        }
        grain(ctx, w, h, r, 12);
      },
    },

    wellen: {
      label: 'Wellen & Interferenz',
      draw(ctx, w, h, r, cols) {
        const K = 2 + ((r() * 4) | 0), m = Math.max(w, h), src = [];
        for (let k = 0; k < K; k++) src.push([r() * w, r() * h, (Math.PI * 2) / (m * (0.03 + r() * 0.12)), r() * 6]);
        const gain = 0.4 + r() * 0.5, off = r() * 2;
        field(ctx, w, h, lut(cols), (x, y) => {
          let v = 0;
          for (let k = 0; k < K; k++) {
            const s = src[k], dx = x - s[0], dy = y - s[1];
            v += Math.sin(Math.sqrt(dx * dx + dy * dy) * s[2] + s[3]);
          }
          return tri(v * gain + off);
        });
      },
    },

    verlauf: {
      label: 'Farbverlauf',
      draw(ctx, w, h, r, cols) {
        const pick = shuffled(r, cols).slice(0, 2 + ((r() * 3) | 0));
        let g;
        if (r() < 0.6) {
          const a = r() * Math.PI * 2, R = Math.hypot(w, h) / 2, c = Math.cos(a) * R, s = Math.sin(a) * R;
          g = ctx.createLinearGradient(w / 2 - c, h / 2 - s, w / 2 + c, h / 2 + s);
        } else {
          g = ctx.createRadialGradient(w * r(), h * r(), 0, w / 2, h / 2, Math.hypot(w, h) * (0.5 + r() * 0.4));
        }
        pick.forEach((c, i) => g.addColorStop(i / (pick.length - 1), css(c)));
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
        grain(ctx, w, h, r, 6); // verhindert sichtbare Farbstufen
      },
    },

    weltall: {
      label: 'Weltall',
      draw(ctx, w, h, r, cols) {
        const n = noise(r), s = (1.5 + r() * 2) / Math.max(w, h), L = lut(cols), ox = r() * 50, oy = r() * 50;
        const img = ctx.createImageData(w, h), d = img.data;
        let i = 0;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++, i += 4) {
            const t = clamp01((fbm(n, x * s + ox, y * s + oy, 6) - 0.38) * 2.6), I = t * t, k = ((t * 255) | 0) * 3;
            d[i] = 4 + L[k] * I; d[i + 1] = 4 + L[k + 1] * I; d[i + 2] = 12 + L[k + 2] * I; d[i + 3] = 255;
          }
        }
        ctx.putImageData(img, 0, 0);
        const m = Math.min(w, h), count = (w * h) / 900;
        for (let j = 0; j < count; j++) {
          const x = r() * w, y = r() * h, size = Math.pow(r(), 8) * m * 0.006 + 0.5;
          ctx.fillStyle = `rgba(255,255,255,${0.35 + r() * 0.65})`;
          ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill();
          if (r() < 0.004) { // heller Stern mit Schein
            const R = m * (0.02 + r() * 0.03), g = ctx.createRadialGradient(x, y, 0, x, y, R);
            g.addColorStop(0, 'rgba(255,255,255,0.9)');
            g.addColorStop(0.2, css(cols[3], 0.35));
            g.addColorStop(1, css(cols[3], 0));
            ctx.fillStyle = g; ctx.fillRect(x - R, y - R, R * 2, R * 2);
          }
        }
      },
    },
  };

  // Stichworte → Motiv und Farben (einfache Wortliste, kein Sprachmodell)
  const MOTIF_WORDS = [
    ['landschaft', /berg|gebirg|landschaft|hügel|alpen|gipfel|\btal\b|mountain|landscape/],
    ['weltall', /stern|weltall|galax|kosmos|univers|nebel|space/],
    ['fraktal', /fraktal|spirale|julia|psychedel|hypno/],
    ['mosaik', /mosaik|zelle|glas|kachel|voronoi|fenster|kirche/],
    ['formen', /form|bauhaus|geometr|kreis|dreieck|abstrakt|poster|kunst/],
    ['wellen', /welle|interferenz|muster|ring|wasserober|pattern/],
    ['wolken', /wolke|himmel|marmor|rauch|dunst|sky|cloud/],
    ['verlauf', /verlauf|gradient|hintergrund|wallpaper|einfarb/],
  ];
  const PALETTE_WORDS = [
    ['sonnenuntergang', /sonnenunter|abend|sunset|dämmer|\brot|orange|lila/],
    ['feuer', /feuer|lava|flamme|hitze|glut|vulkan/],
    ['ozean', /meer|ozean|blau|see\b|wasser|ocean/],
    ['wald', /wald|grün|natur|baum|wiese|forest/],
    ['neon', /neon|cyber|disco|retro|80er|synth/],
    ['pastell', /pastell|sanft|rosa|zart|baby/],
    ['eis', /\beis|winter|schnee|kalt|frost/],
    ['herbst', /herbst|braun|gold|kupfer|laub/],
    ['mono', /schwarz|weiss|grau|mono/],
  ];
  function interpret(text) {
    const t = (text || '').toLowerCase();
    const find = (list) => (list.find(([, re]) => re.test(t)) || [])[0] || null;
    return { motif: find(MOTIF_WORDS), palette: find(PALETTE_WORDS) };
  }

  // Zeichnet ein Motiv in den (bereits passend grossen) Kontext
  function draw(ctx, { motif, palette, seed }) {
    const r = rng(seed), w = ctx.canvas.width, h = ctx.canvas.height;
    const cols = palette === 'zufall' ? randomPalette(r) : PALETTES[palette].colors.map(hex);
    ctx.save();
    MOTIFS[motif].draw(ctx, w, h, r, cols);
    ctx.restore();
  }

  return { PALETTES, MOTIFS, rng, hashStr, interpret, draw };
})();
