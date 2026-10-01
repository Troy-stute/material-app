'use strict';
// Bildstudio – Pixel-Operationen (Anpassungen und Filter), rein in JavaScript.
// Jede Funktion bekommt ImageData, verändert sie und gibt sie zurück.
const Fx = (() => {
  const copy = (img) => new ImageData(new Uint8ClampedArray(img.data), img.width, img.height);
  const smooth = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

  function mul3(A, B) {
    const C = new Array(9);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      C[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j];
    }
    return C;
  }

  // o: brightness, contrast, saturation, warmth (−100..100), hue (−180..180)
  function adjust(img, o) {
    const d = img.data, h = o.hue * Math.PI / 180, cs = Math.cos(h), sn = Math.sin(h);
    const H = [ // Farbton-Drehung wie CSS hue-rotate()
      0.213 + cs * 0.787 - sn * 0.213, 0.715 - cs * 0.715 - sn * 0.715, 0.072 - cs * 0.072 + sn * 0.928,
      0.213 - cs * 0.213 + sn * 0.143, 0.715 + cs * 0.285 + sn * 0.140, 0.072 - cs * 0.072 - sn * 0.283,
      0.213 - cs * 0.213 - sn * 0.787, 0.715 - cs * 0.715 + sn * 0.715, 0.072 + cs * 0.928 + sn * 0.072,
    ];
    const s = 1 + o.saturation / 100, lr = 0.2126 * (1 - s), lg = 0.7152 * (1 - s), lb = 0.0722 * (1 - s);
    const S = [lr + s, lg, lb, lr, lg + s, lb, lr, lg, lb + s];
    const cf = o.contrast >= 0 ? 1 + o.contrast / 100 * 1.5 : 1 + o.contrast / 100;
    const M = mul3(S, H).map((v) => v * cf);
    const k = 128 * (1 - cf) + o.brightness * 1.28, ar = k + o.warmth * 0.4, ag = k, ab = k - o.warmth * 0.4;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      d[i] = M[0] * r + M[1] * g + M[2] * b + ar;
      d[i + 1] = M[3] * r + M[4] * g + M[5] * b + ag;
      d[i + 2] = M[6] * r + M[7] * g + M[8] * b + ab;
    }
    return img;
  }

  // Tonwerte automatisch spreizen (0,5 % dunkelste/hellste Pixel abschneiden)
  function autoLevels(img) {
    const d = img.data, hist = new Uint32Array(256);
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      hist[(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) | 0]++; n++;
    }
    const cut = n * 0.005;
    let lo = 0, hi = 255, acc = 0;
    while (lo < 255 && (acc += hist[lo]) <= cut) lo++;
    acc = 0;
    while (hi > 0 && (acc += hist[hi]) <= cut) hi--;
    if (hi - lo < 10) return img;
    const f = 255 / (hi - lo);
    for (let i = 0; i < d.length; i += 4) {
      d[i] = (d[i] - lo) * f; d[i + 1] = (d[i + 1] - lo) * f; d[i + 2] = (d[i + 2] - lo) * f;
    }
    return img;
  }

  // Box-Blur über Präfixsummen, drei Durchgänge ≈ Gauss
  function boxH(src, dst, w, h, r) {
    const S = new Float64Array((w + 1) * 4);
    for (let y = 0; y < h; y++) {
      const row = y * w * 4;
      for (let x = 0; x < w; x++) for (let c = 0; c < 4; c++) S[(x + 1) * 4 + c] = S[x * 4 + c] + src[row + x * 4 + c];
      for (let x = 0; x < w; x++) {
        const lo = Math.max(0, x - r), hi = Math.min(w - 1, x + r), n = hi - lo + 1;
        for (let c = 0; c < 4; c++) dst[row + x * 4 + c] = (S[(hi + 1) * 4 + c] - S[lo * 4 + c]) / n;
      }
    }
  }
  function boxV(src, dst, w, h, r) {
    const S = new Float64Array((h + 1) * 4);
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) for (let c = 0; c < 4; c++) S[(y + 1) * 4 + c] = S[y * 4 + c] + src[(y * w + x) * 4 + c];
      for (let y = 0; y < h; y++) {
        const lo = Math.max(0, y - r), hi = Math.min(h - 1, y + r), n = hi - lo + 1;
        for (let c = 0; c < 4; c++) dst[(y * w + x) * 4 + c] = (S[(hi + 1) * 4 + c] - S[lo * 4 + c]) / n;
      }
    }
  }
  function blur(img, radius) {
    const r = Math.max(1, Math.round(radius / 1.7)), w = img.width, h = img.height;
    const a = new Float32Array(img.data), b = new Float32Array(a.length);
    for (let pass = 0; pass < 3; pass++) { boxH(a, b, w, h, r); boxV(b, a, w, h, r); }
    img.data.set(a);
    return img;
  }

  function sharpen(img, amount) {
    const e = blur(copy(img), 2).data, d = img.data, k = amount / 40;
    for (let i = 0; i < d.length; i += 4) {
      d[i] += (d[i] - e[i]) * k; d[i + 1] += (d[i + 1] - e[i + 1]) * k; d[i + 2] += (d[i + 2] - e[i + 2]) * k;
    }
    return img;
  }

  function gray(img, amt) {
    const d = img.data, k = amt / 100;
    for (let i = 0; i < d.length; i += 4) {
      const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      d[i] += (l - d[i]) * k; d[i + 1] += (l - d[i + 1]) * k; d[i + 2] += (l - d[i + 2]) * k;
    }
    return img;
  }

  function sepia(img, amt) {
    const d = img.data, k = amt / 100;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      d[i] = r + (0.393 * r + 0.769 * g + 0.189 * b - r) * k;
      d[i + 1] = g + (0.349 * r + 0.686 * g + 0.168 * b - g) * k;
      d[i + 2] = b + (0.272 * r + 0.534 * g + 0.131 * b - b) * k;
    }
    return img;
  }

  function invert(img) {
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) { d[i] = 255 - d[i]; d[i + 1] = 255 - d[i + 1]; d[i + 2] = 255 - d[i + 2]; }
    return img;
  }

  function threshold(img, v) {
    const d = img.data, t = v * 2.55;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = d[i + 1] = d[i + 2] = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) > t ? 255 : 0;
    }
    return img;
  }

  function posterize(img, levels) {
    const d = img.data, n = Math.max(2, Math.round(levels)) - 1;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = Math.round(d[i] / 255 * n) / n * 255;
      d[i + 1] = Math.round(d[i + 1] / 255 * n) / n * 255;
      d[i + 2] = Math.round(d[i + 2] / 255 * n) / n * 255;
    }
    return img;
  }

  function pixelate(img, size) {
    const s = Math.max(2, Math.round(size)), w = img.width, h = img.height, d = img.data;
    for (let by = 0; by < h; by += s) {
      for (let bx = 0; bx < w; bx += s) {
        const ex = Math.min(w, bx + s), ey = Math.min(h, by + s), sum = [0, 0, 0, 0];
        for (let y = by; y < ey; y++) for (let x = bx; x < ex; x++) {
          const i = (y * w + x) * 4;
          sum[0] += d[i]; sum[1] += d[i + 1]; sum[2] += d[i + 2]; sum[3] += d[i + 3];
        }
        const n = (ex - bx) * (ey - by);
        for (let y = by; y < ey; y++) for (let x = bx; x < ex; x++) {
          const i = (y * w + x) * 4;
          d[i] = sum[0] / n; d[i + 1] = sum[1] / n; d[i + 2] = sum[2] / n; d[i + 3] = sum[3] / n;
        }
      }
    }
    return img;
  }

  function vignette(img, amt) {
    const w = img.width, h = img.height, d = img.data, cx = w / 2, cy = h / 2, R = Math.hypot(cx, cy), k = amt / 100;
    for (let y = 0, i = 0; y < h; y++) {
      for (let x = 0; x < w; x++, i += 4) {
        const f = 1 - k * smooth(0.35, 1.05, Math.hypot(x - cx, y - cy) / R);
        d[i] *= f; d[i + 1] *= f; d[i + 2] *= f;
      }
    }
    return img;
  }

  function grain(img, amt) {
    const d = img.data, a = amt * 1.2;
    let s = 12345; // fester Seed: Vorschau flackert nicht beim Schieben
    for (let i = 0; i < d.length; i += 4) {
      s = (Math.imul(s, 1103515245) + 12345) >>> 0;
      const n = (s / 4294967296 - 0.5) * a;
      d[i] += n; d[i + 1] += n; d[i + 2] += n;
    }
    return img;
  }

  function vintage(img, amt) {
    const k = amt / 100, d = img.data;
    sepia(img, 55 * k);
    for (let i = 0; i < d.length; i += 4) { // ausgeblichene Schwärzen
      d[i] = d[i] * (1 - 0.18 * k) + 30 * k; d[i + 1] = d[i + 1] * (1 - 0.18 * k) + 22 * k; d[i + 2] = d[i + 2] * (1 - 0.18 * k) + 14 * k;
    }
    vignette(img, 55 * k);
    return grain(img, 25 * k);
  }

  // Sobel-Kanten auf der Helligkeit
  function sobel(img, mode, amt) {
    const w = img.width, h = img.height, d = img.data, L = new Float32Array(w * h), k = amt / 50;
    for (let i = 0, j = 0; j < L.length; i += 4, j++) L[j] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    for (let y = 0; y < h; y++) {
      const ym = (y > 0 ? y - 1 : y) * w, yc = y * w, yp = (y < h - 1 ? y + 1 : y) * w;
      for (let x = 0; x < w; x++) {
        const xm = x > 0 ? x - 1 : x, xp = x < w - 1 ? x + 1 : x;
        const gx = L[ym + xp] + 2 * L[yc + xp] + L[yp + xp] - L[ym + xm] - 2 * L[yc + xm] - L[yp + xm];
        const gy = L[yp + xm] + 2 * L[yp + x] + L[yp + xp] - L[ym + xm] - 2 * L[ym + x] - L[ym + xp];
        const i = (yc + x) * 4;
        if (mode === 'relief') {
          d[i] = d[i + 1] = d[i + 2] = 128 + (gx + gy) * 0.25 * k;
        } else {
          const mag = Math.sqrt(gx * gx + gy * gy) * k;
          if (mode === 'bleistift') {
            d[i] = d[i + 1] = d[i + 2] = 255 - mag * 0.6;
          } else { // Leuchtkanten in Originalfarbe
            const f = Math.min(2.5, mag / 120);
            d[i] *= f; d[i + 1] *= f; d[i + 2] *= f;
          }
        }
      }
    }
    return img;
  }

  // param: [Beschriftung, min, max, Standard]
  const FILTERS = [
    { id: 'sw', label: 'Schwarzweiss', param: ['Stärke', 0, 100, 100], fn: gray },
    { id: 'sepia', label: 'Sepia', param: ['Stärke', 0, 100, 80], fn: sepia },
    { id: 'vintage', label: 'Vintage', param: ['Stärke', 0, 100, 70], fn: vintage },
    { id: 'invert', label: 'Negativ', param: null, fn: invert },
    { id: 'blur', label: 'Weichzeichnen', param: ['Radius', 1, 40, 6], fn: blur },
    { id: 'sharpen', label: 'Schärfen', param: ['Stärke', 0, 100, 50], fn: sharpen },
    { id: 'pixel', label: 'Verpixeln', param: ['Blockgrösse', 2, 80, 12], fn: pixelate },
    { id: 'poster', label: 'Poster', param: ['Farbstufen', 2, 10, 4], fn: posterize },
    { id: 'threshold', label: 'Schwellwert', param: ['Grenze', 0, 100, 50], fn: threshold },
    { id: 'vignette', label: 'Vignette', param: ['Stärke', 0, 100, 50], fn: vignette },
    { id: 'grain', label: 'Körnung', param: ['Stärke', 0, 100, 30], fn: grain },
    { id: 'edges', label: 'Leuchtkanten', param: ['Stärke', 0, 100, 50], fn: (img, v) => sobel(img, 'kanten', v) },
    { id: 'pencil', label: 'Bleistift', param: ['Stärke', 0, 100, 50], fn: (img, v) => sobel(img, 'bleistift', v) },
    { id: 'emboss', label: 'Relief', param: ['Stärke', 0, 100, 50], fn: (img, v) => sobel(img, 'relief', v) },
  ];

  return { copy, adjust, autoLevels, FILTERS };
})();
