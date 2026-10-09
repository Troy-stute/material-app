'use strict';
// Bildstudio – KI-Hochskalieren (Super-Resolution) mit ESRGAN/RDN über TensorFlow.js.
// Modell (~2,8 MB) und Laufzeit liegen in der App – kein Download, läuft offline auf jedem Gerät.
const Upscale = (() => {
  const TILE = 128, PAD = 10; // Bild in Kacheln rechnen (wenig Speicher), mit Rand gegen sichtbare Nähte
  let tfReady = null;
  const models = {};

  function loadTf() {
    if (tfReady) return tfReady;
    tfReady = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'vendor/tfjs/tf.min.js';
      s.onload = async () => {
        try { if (!(await tf.setBackend('webgl'))) await tf.setBackend('cpu'); } catch { await tf.setBackend('cpu'); }
        await tf.ready();
        res(tf);
      };
      s.onerror = () => { tfReady = null; rej(new Error('Hochskalier-Laufzeit konnte nicht geladen werden')); };
      document.head.appendChild(s);
    });
    return tfReady;
  }

  function getModel(scale) {
    if (!models[scale]) {
      models[scale] = tf.loadLayersModel(`ki/upscale/x${scale}/model.json`);
      models[scale].catch(() => { delete models[scale]; });
    }
    return models[scale];
  }

  // src: Canvas; scale: 2 oder 4; gibt ein neues Canvas zurück
  async function run(src, scale, onProgress = () => {}) {
    await loadTf();
    const model = await getModel(scale);
    const w = src.width, h = src.height, W = w * scale, H = h * scale;
    const sd = src.getContext('2d').getImageData(0, 0, w, h).data;

    // Alpha separat weich vergrössern (das Modell kennt nur RGB)
    const out = document.createElement('canvas');
    out.width = W; out.height = H;
    const octx = out.getContext('2d', { willReadFrequently: true });
    octx.imageSmoothingQuality = 'high';
    octx.drawImage(src, 0, 0, W, H);
    const res = octx.getImageData(0, 0, W, H), od = res.data;

    const tiles = [];
    for (let y = 0; y < h; y += TILE) for (let x = 0; x < w; x += TILE) tiles.push([x, y]);
    for (let n = 0; n < tiles.length; n++) {
      const [x0, y0] = tiles[n], tw = Math.min(TILE, w - x0), th = Math.min(TILE, h - y0);
      const px0 = Math.max(0, x0 - PAD), py0 = Math.max(0, y0 - PAD);
      const pw = Math.min(w, x0 + tw + PAD) - px0, ph = Math.min(h, y0 + th + PAD) - py0;
      const buf = new Float32Array(pw * ph * 3);
      for (let y = 0; y < ph; y++) {
        for (let x = 0; x < pw; x++) {
          const i = ((py0 + y) * w + px0 + x) * 4, j = (y * pw + x) * 3;
          buf[j] = sd[i]; buf[j + 1] = sd[i + 1]; buf[j + 2] = sd[i + 2];
        }
      }
      const t = tf.tidy(() => model.predict(tf.tensor4d(buf, [1, ph, pw, 3])).clipByValue(0, 255));
      const data = await t.data();
      t.dispose();
      const ow = pw * scale, ox = (x0 - px0) * scale, oy = (y0 - py0) * scale;
      for (let y = 0; y < th * scale; y++) {
        for (let x = 0; x < tw * scale; x++) {
          const j = ((oy + y) * ow + ox + x) * 3, i = ((y0 * scale + y) * W + x0 * scale + x) * 4;
          od[i] = data[j]; od[i + 1] = data[j + 1]; od[i + 2] = data[j + 2];
        }
      }
      onProgress((n + 1) / tiles.length);
      await new Promise((r) => setTimeout(r, 0)); // Oberfläche bleibt bedienbar
    }
    octx.putImageData(res, 0, 0);
    return out;
  }

  return { run };
})();
