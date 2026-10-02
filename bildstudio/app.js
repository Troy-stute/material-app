'use strict';
// Bildstudio – Bedienoberfläche: Erzeugen, Anpassen, Filter, Zuschnitt, Malen, Text, Speichern.
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const canvas = $('#doc'), ctx = canvas.getContext('2d', { willReadFrequently: true });
const overlay = $('#overlay'), octx = overlay.getContext('2d');
const wrap = $('#wrap'), stage = $('#stage');

const MAX_SIDE = 4096, MAX_PIXELS = 16e6, HISTORY_BYTES = 400e6;

let hasImage = false, dirty = false, fileBase = 'bild', tab = 'gen';
let history = [], hIdx = -1;
let preview = null; // laufende Vorschau (Anpassen/Filter), noch nicht übernommen

// ---------- Hilfen ----------
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), Math.max(2400, msg.length * 70));
}
// Schwere Arbeit erst nach dem nächsten Bildaufbau, damit «Einen Moment…» sichtbar wird
function busy(text, work) {
  const b = $('#busy');
  b.textContent = text; b.classList.add('show');
  return new Promise((res) => requestAnimationFrame(() => setTimeout(() => {
    try { work(); } catch (e) { console.error(e); toast('Fehler: ' + e.message); }
    b.classList.remove('show'); res();
  }, 20)));
}
// Fortschrittsanzeige über dem Bild für längere, asynchrone Arbeiten (KI)
function setBusy(text, frac) {
  const b = $('#busy');
  if (text == null) { b.classList.remove('show'); return; }
  b.innerHTML = '';
  b.append(text);
  if (frac != null && frac < 1) { const s = document.createElement('small'); s.textContent = Math.round(frac * 100) + ' %'; b.firstChild.after(s); }
  b.classList.add('show');
}
const hexRgb = (h) => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const rgbHex = (r, g, b) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
function needImage() {
  if (!hasImage) toast('Zuerst ein Bild erzeugen oder öffnen');
  return hasImage;
}
function copyCanvas() {
  const c = document.createElement('canvas');
  c.width = canvas.width; c.height = canvas.height;
  c.getContext('2d').drawImage(canvas, 0, 0);
  return c;
}
function setSize(w, h) {
  canvas.width = w; canvas.height = h;
  fit();
}
// Schieberegler mit Zahlenanzeige
function bindOutput(input, fmt = (v) => v) {
  const out = input.parentElement.querySelector('output');
  const show = () => { out.textContent = fmt(input.value); };
  input.addEventListener('input', show); show();
  return show;
}

// ---------- Verlauf (Rückgängig/Wiederholen) ----------
function commit() {
  history = history.slice(0, hIdx + 1);
  history.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
  let bytes = history.reduce((s, im) => s + im.data.length, 0);
  while (history.length > 2 && bytes > HISTORY_BYTES) bytes -= history.shift().data.length;
  hIdx = history.length - 1;
  hasImage = true; dirty = true;
  updateUi();
}
function restore(i) {
  const im = history[i];
  if (canvas.width !== im.width || canvas.height !== im.height) setSize(im.width, im.height);
  ctx.putImageData(im, 0, 0);
}
function undo() {
  endPreview(false); clearCrop();
  if (hIdx > 0) { hIdx--; restore(hIdx); dirty = true; updateUi(); }
}
function redo() {
  endPreview(false); clearCrop();
  if (hIdx < history.length - 1) { hIdx++; restore(hIdx); dirty = true; updateUi(); }
}

function updateUi() {
  $('#undoBtn').disabled = hIdx <= 0;
  $('#redoBtn').disabled = hIdx >= history.length - 1;
  $('#saveBtn').disabled = !hasImage;
  $('#empty').hidden = hasImage;
  wrap.classList.toggle('show', hasImage);
  $('#dims').textContent = hasImage ? `${canvas.width} × ${canvas.height}` : '';
  if (hasImage) fit();
  syncResizeInputs();
}

// ---------- Anzeige ----------
function fit() {
  const aw = stage.clientWidth - 24, ah = stage.clientHeight - 24;
  if (aw <= 0 || ah <= 0) return;
  const s = Math.min(aw / canvas.width, ah / canvas.height, 4);
  wrap.style.width = Math.max(1, Math.floor(canvas.width * s)) + 'px';
  wrap.style.height = Math.max(1, Math.floor(canvas.height * s)) + 'px';
}
new ResizeObserver(fit).observe(stage);

function toImg(e) {
  const r = wrap.getBoundingClientRect();
  return { x: (e.clientX - r.left) * canvas.width / r.width, y: (e.clientY - r.top) * canvas.height / r.height };
}

// ---------- Tabs ----------
function setTab(t) {
  if (t === tab) return;
  endPreview(true); clearCrop();
  tab = t;
  $$('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
  $$('.pane').forEach((p) => p.classList.toggle('active', p.dataset.pane === t));
  wrap.dataset.tool = { paint: 'paint', text: 'text', transform: 'crop' }[t] || '';
  $('#panel').scrollTop = 0;
}
$$('#tabs button').forEach((b) => { b.onclick = () => setTab(b.dataset.tab); });

// ---------- Vorschau für Anpassungen und Filter ----------
function runPreview(fn) {
  if (!needImage()) return;
  if (!preview) preview = { raf: 0 };
  preview.fn = fn;
  if (preview.raf) return;
  preview.raf = requestAnimationFrame(() => {
    if (!preview) return;
    preview.raf = 0;
    ctx.putImageData(preview.fn(Fx.copy(history[hIdx])), 0, 0);
  });
}
function endPreview(apply) {
  if (!preview) return;
  const p = preview;
  preview = null;
  if (p.raf) { cancelAnimationFrame(p.raf); if (apply) ctx.putImageData(p.fn(Fx.copy(history[hIdx])), 0, 0); }
  if (apply) commit(); else restore(hIdx);
  resetAdjustSliders(); resetFilter();
}

// ---------- Erzeugen ----------
const motifSel = $('#motif'), palSel = $('#palette');
motifSel.innerHTML = '<option value="auto">Automatisch</option>' +
  Object.entries(Gen.MOTIFS).map(([k, m]) => `<option value="${k}">${m.label}</option>`).join('');
palSel.innerHTML = '<option value="auto">Automatisch</option>' +
  Object.entries(Gen.PALETTES).map(([k, p]) => `<option value="${k}">${p.label}</option>`).join('') +
  '<option value="zufall">Zufällig</option>';

$('#prompt').addEventListener('input', () => { $('#seed').value = ''; });
$('#prompt').addEventListener('keydown', (e) => { if (e.key === 'Enter') generate(); });

const slug = (t) => t.toLowerCase().replace(/[^a-z0-9äöü]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'bild';
function currentSeed(prompt) {
  let seed = parseInt($('#seed').value, 10);
  if (!(seed >= 0)) seed = prompt ? Gen.hashStr(prompt) % 1e6 : (Math.random() * 1e6) | 0;
  $('#seed').value = seed;
  return seed;
}
const generate = () => (genMode === 'ki' ? generateKi() : generateMath());

function generateMath() {
  const prompt = $('#prompt').value.trim(), seed = currentSeed(prompt);

  const r = Gen.rng(seed ^ 0x9e3779b9), hint = Gen.interpret(prompt);
  const pick = (arr) => arr[(r() * arr.length) | 0];
  const motif = motifSel.value !== 'auto' ? motifSel.value : hint.motif || pick(Object.keys(Gen.MOTIFS));
  const palette = palSel.value !== 'auto' ? palSel.value : hint.palette || pick([...Object.keys(Gen.PALETTES), 'zufall']);
  const [w, h] = $('#size').value.split('x').map(Number);

  endPreview(true); clearCrop();
  return busy('Bild wird erzeugt…', () => {
    canvas.width = w; canvas.height = h;
    Gen.draw(ctx, { motif, palette, seed });
    fileBase = slug(prompt || Gen.MOTIFS[motif].label);
    commit();
    const palLabel = palette === 'zufall' ? 'Zufallsfarben' : Gen.PALETTES[palette].label;
    $('#genInfo').textContent = `${Gen.MOTIFS[motif].label} · ${palLabel} · Seed ${seed} · ${w} × ${h}`;
  });
}
$('#genBtn').onclick = generate;

// ---------- Umschalter Mathematisch / KI ----------
let genMode = KI.store.get('mode', 'math') === 'ki' ? 'ki' : 'math';
const kiEngine = $('#kiEngine');
kiEngine.value = KI.store.get('kiEngine', 'browser') === 'server' ? 'server' : 'browser';
$('#kiUrl').value = KI.store.get('kiUrl', $('#kiUrl').value);
$('#kiUrl').addEventListener('change', () => KI.store.set('kiUrl', $('#kiUrl').value.trim()));
function setMode(m) {
  genMode = m;
  KI.store.set('mode', m);
  const ki = m === 'ki', browser = kiEngine.value === 'browser';
  $$('#modeSeg button').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
  $('#kiOpts').hidden = !ki;
  $$('[data-math]').forEach((el) => { el.hidden = ki; });
  $('#sizeLabel').hidden = ki && browser; // SD-Turbo rechnet immer in 512 × 512
  $('#kiBrowser').hidden = !browser;
  $('#kiServer').hidden = browser;
  $('#promptLabel').textContent = ki ? 'Was soll auf dem Bild sein?' : 'Stichworte (optional)';
  $('#prompt').placeholder = ki ? 'z. B. eine Katze mit Hut im Wald, Aquarell' : 'z. B. Berge im Sonnenuntergang';
  $('#genInfo').textContent = ki
    ? (browser ? 'Die KI rechnet direkt auf deiner Grafikkarte – nach dem einmaligen Download ganz ohne Internet.'
      : 'Nutzt deinen eigenen Stable-Diffusion-Server (z. B. auf dem PC im gleichen WLAN).')
    : 'Stichworte wählen Motiv und Farben aus. Gleiche Stichworte und gleicher Seed ergeben immer dasselbe Bild.';
  if (ki && browser) refreshKiStatus();
}
$$('#modeSeg button').forEach((b) => { b.onclick = () => setMode(b.dataset.mode); });
kiEngine.onchange = () => { KI.store.set('kiEngine', kiEngine.value); setMode('ki'); };

function kiProgress(frac) {
  const p = $('#kiProg');
  p.hidden = frac == null;
  if (frac != null) p.firstElementChild.style.width = Math.round(frac * 100) + '%';
}
async function refreshKiStatus() {
  const st = $('#kiStatus'), dl = $('#kiDownload'), del = $('#kiDelete');
  const problem = await KI.checkDevice();
  const cached = await KI.cachedState().catch(() => ({ complete: false, count: 0 }));
  del.hidden = !cached.count;
  if (problem) {
    st.textContent = '⚠️ ' + problem + ' Auf diesem Gerät geht KI deshalb nicht direkt im Browser. Der Modus «Mathematisch» funktioniert aber immer.';
    dl.hidden = true;
    return;
  }
  dl.hidden = cached.complete;
  dl.textContent = `Modell herunterladen (~${(KI.TOTAL_MB / 1000).toFixed(1).replace('.', ',')} GB, einmalig)`;
  st.textContent = KI.isLoaded() ? '✅ KI ist bereit.'
    : cached.complete ? '✅ Modell ist gespeichert – funktioniert offline. Der erste Start dauert ein paar Sekunden.'
      : 'Für KI im Browser wird das Modell SD-Turbo einmalig heruntergeladen (WLAN empfohlen). Danach läuft alles offline.';
}
async function prepareKi() {
  if (kiBusy) return;
  const b = $('#kiDownload');
  b.disabled = true; lockGen(true);
  try {
    await KI.prepare((msg, frac) => { $('#kiStatus').textContent = msg; kiProgress(frac); setBusy(msg, frac); });
    toast('KI-Modell bereit');
  } catch (e) {
    console.error(e); toast(e.message);
  } finally {
    b.disabled = false; lockGen(false); kiProgress(null); setBusy(null); refreshKiStatus();
  }
}
$('#kiDownload').onclick = prepareKi;
$('#kiDelete').onclick = async () => {
  if (!confirm('Gespeichertes KI-Modell löschen? Es kann später erneut heruntergeladen werden.')) return;
  await KI.deleteModel();
  toast('KI-Modell gelöscht');
  refreshKiStatus();
};

let kiBusy = false; // die KI darf nur einen Auftrag gleichzeitig rechnen
function lockGen(on) {
  kiBusy = on;
  $('#genBtn').disabled = $('#varBtn').disabled = on;
}
async function generateKi() {
  if (kiBusy) return;
  const prompt = $('#prompt').value.trim();
  if (!prompt) { toast('Beschreibe zuerst, was auf dem Bild sein soll'); $('#prompt').focus(); return; }
  const seed = currentSeed(prompt), browser = kiEngine.value === 'browser';
  const text = $('#kiTranslate').checked ? KI.translate(prompt) : prompt;
  if (browser && !KI.isLoaded()) {
    const problem = await KI.checkDevice();
    if (problem) { toast(problem); refreshKiStatus(); return; }
    const cached = await KI.cachedState();
    if (!cached.complete && !confirm(`Das KI-Modell (~${(KI.TOTAL_MB / 1000).toFixed(1).replace('.', ',')} GB) wird jetzt einmalig heruntergeladen. Fortfahren?`)) return;
  }
  endPreview(true); clearCrop();
  lockGen(true);
  setBusy('KI startet…');
  try {
    const t0 = performance.now();
    let src;
    if (browser) {
      src = await KI.generate(text, seed, (msg, frac) => { setBusy(msg, frac); kiProgress(frac < 1 ? frac : null); });
    } else {
      const [width, height] = $('#size').value.split('x').map(Number);
      src = await KI.serverGenerate({ url: $('#kiUrl').value, prompt: text, negative: $('#kiNeg').value, seed, width, height, steps: +$('#kiSteps').value || 20 });
    }
    setSize(src.width, src.height);
    ctx.clearRect(0, 0, src.width, src.height);
    if (src instanceof ImageData) ctx.putImageData(src, 0, 0); else ctx.drawImage(src, 0, 0);
    fileBase = slug(prompt);
    commit();
    const secs = ((performance.now() - t0) / 1000).toFixed(1);
    $('#genInfo').textContent = `KI (${browser ? 'SD-Turbo' : 'Server'}) · Seed ${seed} · ${src.width} × ${src.height} · ${secs} s` +
      (text !== prompt ? ` · verstanden als: «${text}»` : '');
  } catch (e) {
    console.error(e); toast(e.message);
  } finally {
    setBusy(null); kiProgress(null); lockGen(false);
    if (browser) refreshKiStatus();
  }
}
$('#varBtn').onclick = () => { $('#seed').value = (Math.random() * 1e6) | 0; generate(); };

$('#blankBtn').onclick = () => {
  endPreview(true); clearCrop();
  const [w, h] = $('#size').value.split('x').map(Number);
  setSize(w, h);
  ctx.clearRect(0, 0, w, h);
  if (!$('#blankTransparent').checked) { ctx.fillStyle = $('#blankColor').value; ctx.fillRect(0, 0, w, h); }
  fileBase = 'zeichnung';
  commit();
  setTab('paint');
};

// ---------- Öffnen ----------
async function loadFile(file) {
  if (!file || !file.type.startsWith('image/')) { toast('Das ist keine Bilddatei'); return; }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    let w = img.naturalWidth, h = img.naturalHeight;
    const s = Math.min(1, MAX_SIDE / Math.max(w, h), Math.sqrt(MAX_PIXELS / (w * h)));
    if (s < 1) { w = Math.round(w * s); h = Math.round(h * s); toast(`Zum Bearbeiten auf ${w} × ${h} verkleinert`); }
    endPreview(false); clearCrop();
    setSize(w, h);
    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);
    fileBase = file.name.replace(/\.[^.]+$/, '') || 'bild';
    commit();
    dirty = false;
    if (tab === 'gen') setTab('adjust');
  } catch (e) {
    toast('Bild konnte nicht geladen werden');
  } finally {
    URL.revokeObjectURL(url);
  }
}
const fileInput = $('#file');
const openFile = () => fileInput.click();
fileInput.onchange = () => { loadFile(fileInput.files[0]); fileInput.value = ''; };
$('#openBtn').onclick = openFile;
$$('#empty [data-act]').forEach((b) => {
  b.onclick = () => (b.dataset.act === 'open' ? openFile() : (setTab('gen'), generate()));
});
stage.addEventListener('dragover', (e) => e.preventDefault());
stage.addEventListener('drop', (e) => { e.preventDefault(); loadFile(e.dataTransfer.files[0]); });
window.addEventListener('paste', (e) => {
  const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
  if (item) { e.preventDefault(); loadFile(item.getAsFile()); }
});

// ---------- Anpassen ----------
const ADJ = [
  ['brightness', 'Helligkeit', -100, 100],
  ['contrast', 'Kontrast', -100, 100],
  ['saturation', 'Sättigung', -100, 100],
  ['warmth', 'Wärme', -100, 100],
  ['hue', 'Farbton', -180, 180],
];
$('#sliders').innerHTML = ADJ.map(([id, label, min, max]) =>
  `<div class="slider"><span>${label}</span><input type="range" id="a-${id}" min="${min}" max="${max}" value="0"><output></output></div>`).join('');
const adjShow = ADJ.map(([id]) => bindOutput($('#a-' + id)));
function adjValues() {
  const o = {};
  for (const [id] of ADJ) o[id] = +$('#a-' + id).value;
  return o;
}
function resetAdjustSliders() {
  ADJ.forEach(([id], i) => { $('#a-' + id).value = 0; adjShow[i](); });
}
ADJ.forEach(([id]) => $('#a-' + id).addEventListener('input', () => {
  const o = adjValues();
  if (Object.values(o).every((v) => v === 0)) { endPreview(false); return; }
  runPreview((img) => Fx.adjust(img, o));
}));
// Doppelklick setzt einen Regler zurück
ADJ.forEach(([id]) => $('#a-' + id).addEventListener('dblclick', (e) => {
  e.target.value = 0; e.target.dispatchEvent(new Event('input'));
}));
$('#adjApply').onclick = () => { if (preview) { endPreview(true); toast('Übernommen'); } };
$('#adjReset').onclick = () => endPreview(false);
$('#autoBtn').onclick = () => {
  if (!needImage()) return;
  endPreview(true);
  ctx.putImageData(Fx.autoLevels(Fx.copy(history[hIdx])), 0, 0);
  commit();
  toast('Tonwerte automatisch angepasst');
};

// ---------- Filter ----------
let activeFilter = null;
const fVal = $('#fVal'), showF = () => { $('#fOut').textContent = fVal.value; };
$('#filterGrid').innerHTML = Fx.FILTERS.map((f) => `<button data-f="${f.id}">${f.label}</button>`).join('');
$$('#filterGrid button').forEach((b) => {
  b.onclick = () => {
    if (!needImage()) return;
    if (preview) endPreview(false);
    activeFilter = Fx.FILTERS.find((f) => f.id === b.dataset.f);
    $$('#filterGrid button').forEach((x) => x.classList.toggle('on', x === b));
    const p = activeFilter.param;
    $('#filterCtl').hidden = false;
    $('#filterCtl .slider').hidden = !p;
    if (p) { $('#fLabel').textContent = p[0]; fVal.min = p[1]; fVal.max = p[2]; fVal.value = p[3]; showF(); }
    previewFilter();
  };
});
function previewFilter() {
  const f = activeFilter, v = +fVal.value;
  if (f) runPreview((img) => f.fn(img, v));
}
fVal.addEventListener('input', () => { showF(); previewFilter(); });
function resetFilter() {
  activeFilter = null;
  $('#filterCtl').hidden = true;
  $$('#filterGrid button').forEach((x) => x.classList.remove('on'));
}
$('#fApply').onclick = () => endPreview(true);
$('#fCancel').onclick = () => endPreview(false);

// ---------- Drehen, Spiegeln, Grösse ----------
$$('[data-rot]').forEach((b) => {
  b.onclick = () => {
    if (!needImage()) return;
    endPreview(true); clearCrop();
    const src = copyCanvas();
    setSize(src.height, src.width);
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(+b.dataset.rot * Math.PI / 2);
    ctx.drawImage(src, -src.width / 2, -src.height / 2);
    ctx.restore();
    commit();
  };
});
$$('[data-flip]').forEach((b) => {
  b.onclick = () => {
    if (!needImage()) return;
    endPreview(true); clearCrop();
    const src = copyCanvas(), hz = b.dataset.flip === 'h';
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.translate(hz ? canvas.width : 0, hz ? 0 : canvas.height);
    ctx.scale(hz ? -1 : 1, hz ? 1 : -1);
    ctx.drawImage(src, 0, 0);
    ctx.restore();
    commit();
  };
});

const rw = $('#rw'), rh = $('#rh');
function syncResizeInputs() {
  if (hasImage) { rw.value = canvas.width; rh.value = canvas.height; }
}
rw.addEventListener('input', () => { if ($('#rlock').checked && rw.value > 0) rh.value = Math.max(1, Math.round(rw.value * canvas.height / canvas.width)); });
rh.addEventListener('input', () => { if ($('#rlock').checked && rh.value > 0) rw.value = Math.max(1, Math.round(rh.value * canvas.width / canvas.height)); });
$('#resizeBtn').onclick = () => {
  if (!needImage()) return;
  const w = Math.round(+rw.value), h = Math.round(+rh.value);
  if (!(w >= 1 && h >= 1 && w <= 8192 && h <= 8192 && w * h <= MAX_PIXELS)) { toast('Ungültige Grösse (max. 8192 px, 16 Megapixel)'); return; }
  endPreview(true); clearCrop();
  const src = copyCanvas();
  setSize(w, h);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, w, h);
  commit();
};

// ---------- Zuschneiden ----------
let crop = null, cropStart = null, cropRatio = 0;
const cropBox = $('#crop');
$$('#ratios button').forEach((b) => {
  b.onclick = () => {
    cropRatio = +b.dataset.r;
    $$('#ratios button').forEach((x) => x.classList.toggle('on', x === b));
    clearCrop();
  };
});
function drawCrop() {
  const ok = crop && crop.w >= 2 && crop.h >= 2;
  cropBox.style.display = crop ? 'block' : 'none';
  if (crop) {
    Object.assign(cropBox.style, {
      left: crop.x / canvas.width * 100 + '%', top: crop.y / canvas.height * 100 + '%',
      width: crop.w / canvas.width * 100 + '%', height: crop.h / canvas.height * 100 + '%',
    });
  }
  $('#cropApply').disabled = !ok;
  $('#cropClear').disabled = !crop;
}
function clearCrop() { crop = null; cropStart = null; drawCrop(); }
function cropMove(p) {
  const W = canvas.width, H = canvas.height, x0 = cropStart.x, y0 = cropStart.y;
  const dx = p.x - x0, dy = p.y - y0;
  const availX = dx >= 0 ? W - x0 : x0, availY = dy >= 0 ? H - y0 : y0;
  let cw = Math.min(Math.abs(dx), availX), ch = Math.min(Math.abs(dy), availY);
  if (cropRatio) {
    cw = Math.min(Math.max(cw, ch * cropRatio), availX, availY * cropRatio);
    ch = cw / cropRatio;
  }
  crop = { x: dx >= 0 ? x0 : x0 - cw, y: dy >= 0 ? y0 : y0 - ch, w: cw, h: ch };
  drawCrop();
}
$('#cropClear').onclick = clearCrop;
$('#cropApply').onclick = () => {
  if (!crop) return;
  const x = Math.round(crop.x), y = Math.round(crop.y);
  const w = Math.min(canvas.width - x, Math.round(crop.w)), h = Math.min(canvas.height - y, Math.round(crop.h));
  const im = ctx.getImageData(x, y, w, h);
  clearCrop();
  setSize(w, h);
  ctx.putImageData(im, 0, 0);
  commit();
};

// ---------- Malen ----------
const paint = { tool: 'brush' };
const pColor = $('#pColor'), pSize = $('#pSize'), pAlpha = $('#pAlpha'), pTol = $('#pTol');
bindOutput(pSize, (v) => v + ' px'); bindOutput(pAlpha, (v) => v + ' %'); bindOutput(pTol);
['#000000', '#ffffff', '#e8443a', '#f5a524', '#f4e04d', '#3bb273', '#2f80ed', '#8e44ad'].forEach((c) => {
  const b = document.createElement('button');
  b.style.background = c; b.title = c; b.setAttribute('aria-label', 'Farbe ' + c);
  b.onclick = () => { pColor.value = c; };
  $('#swatches').appendChild(b);
});
function setPaintTool(t) {
  paint.tool = t;
  $$('#tools button').forEach((b) => b.classList.toggle('on', b.dataset.tool === t));
  $('#tolRow').hidden = t !== 'fill';
  $('#sizeRow').hidden = t === 'fill' || t === 'picker';
}
$$('#tools button').forEach((b) => { b.onclick = () => setPaintTool(b.dataset.tool); });

let stroke = null;
function paintDown(e, p) {
  const x = Math.floor(p.x), y = Math.floor(p.y);
  if (paint.tool === 'picker') {
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;
    const d = ctx.getImageData(x, y, 1, 1).data;
    pColor.value = rgbHex(d[0], d[1], d[2]);
    setPaintTool('brush');
    toast('Farbe übernommen: ' + pColor.value);
    return;
  }
  if (paint.tool === 'fill') {
    if (floodFill(x, y)) commit();
    return;
  }
  wrap.setPointerCapture(e.pointerId);
  const size = +pSize.value;
  let g;
  if (paint.tool === 'brush') {
    // Strich zuerst deckend auf eine Folie, dann mit Deckkraft aufs Bild – so entstehen keine dunklen Überlappungen
    overlay.width = canvas.width; overlay.height = canvas.height;
    overlay.style.opacity = pAlpha.value / 100;
    g = octx;
  } else {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.globalAlpha = pAlpha.value / 100;
    g = ctx;
  }
  g.lineCap = g.lineJoin = 'round';
  g.lineWidth = size;
  g.strokeStyle = g.fillStyle = pColor.value;
  g.beginPath(); g.arc(p.x, p.y, size / 2, 0, Math.PI * 2); g.fill();
  stroke = { g, last: p };
}
function paintMove(e) {
  if (!stroke) return;
  const list = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
  const g = stroke.g;
  g.beginPath();
  g.moveTo(stroke.last.x, stroke.last.y);
  for (const ev of list.length ? list : [e]) { const p = toImg(ev); g.lineTo(p.x, p.y); stroke.last = p; }
  g.stroke();
}
function paintUp() {
  if (!stroke) return;
  if (paint.tool === 'brush') {
    ctx.save();
    ctx.globalAlpha = pAlpha.value / 100;
    ctx.drawImage(overlay, 0, 0);
    ctx.restore();
    overlay.width = overlay.height = 1;
  } else {
    ctx.restore();
  }
  stroke = null;
  commit();
}

function floodFill(x0, y0) {
  const w = canvas.width, h = canvas.height;
  if (x0 < 0 || y0 < 0 || x0 >= w || y0 >= h) return false;
  const img = ctx.getImageData(0, 0, w, h), d = img.data, i0 = (y0 * w + x0) * 4;
  const tr = d[i0], tg = d[i0 + 1], tb = d[i0 + 2], ta = d[i0 + 3], tol = pTol.value * 2.55;
  const [cr, cg, cb] = hexRgb(pColor.value), a = pAlpha.value / 100;
  const seen = new Uint8Array(w * h);
  const match = (j) => {
    const k = j * 4;
    return Math.abs(d[k] - tr) <= tol && Math.abs(d[k + 1] - tg) <= tol && Math.abs(d[k + 2] - tb) <= tol && Math.abs(d[k + 3] - ta) <= tol;
  };
  const stack = [y0 * w + x0];
  while (stack.length) {
    const j = stack.pop();
    if (seen[j]) continue;
    const y = (j / w) | 0, rowStart = y * w, rowEnd = rowStart + w - 1;
    let l = j, r = j;
    while (l > rowStart && !seen[l - 1] && match(l - 1)) l--;
    while (r < rowEnd && !seen[r + 1] && match(r + 1)) r++;
    for (let k = l; k <= r; k++) {
      seen[k] = 1;
      if (y > 0 && !seen[k - w] && match(k - w)) stack.push(k - w);
      if (y < h - 1 && !seen[k + w] && match(k + w)) stack.push(k + w);
    }
  }
  // Erst nach der Suche einfärben, damit der Vergleich immer mit den Originalfarben läuft
  for (let j = 0; j < seen.length; j++) {
    if (!seen[j]) continue;
    const k = j * 4;
    d[k] += (cr - d[k]) * a; d[k + 1] += (cg - d[k + 1]) * a; d[k + 2] += (cb - d[k + 2]) * a; d[k + 3] += (255 - d[k + 3]) * a;
  }
  ctx.putImageData(img, 0, 0);
  return true;
}

// ---------- Text ----------
bindOutput($('#tSize'), (v) => v + ' %');
function placeText(p) {
  const txt = $('#txt').value.replace(/\s+$/, '');
  if (!txt.trim()) { toast('Zuerst oben einen Text eingeben'); $('#txt').focus(); return; }
  const size = Math.max(6, Math.round(Math.min(canvas.width, canvas.height) * $('#tSize').value / 100));
  const lines = txt.split('\n'), lh = size * 1.2, y0 = p.y - (lines.length - 1) * lh / 2;
  ctx.save();
  ctx.font = `${$('#tBold').checked ? 700 : 400} ${size}px ${$('#tFont').value}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = $('#tColor').value;
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, size * 0.1);
  const light = hexRgb($('#tColor').value).reduce((s, v) => s + v, 0) > 382;
  ctx.strokeStyle = light ? 'rgba(0,0,0,.85)' : 'rgba(255,255,255,.9)';
  if ($('#tShadow').checked) {
    ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = size * 0.18; ctx.shadowOffsetY = size * 0.06;
  }
  lines.forEach((line, i) => {
    const y = y0 + i * lh;
    if ($('#tOutline').checked) ctx.strokeText(line, p.x, y);
    ctx.fillText(line, p.x, y);
  });
  ctx.restore();
  commit();
}

// ---------- Zeiger auf dem Bild ----------
wrap.addEventListener('pointerdown', (e) => {
  if (!hasImage || e.button > 0) return;
  e.preventDefault();
  const p = toImg(e);
  if (tab === 'paint') paintDown(e, p);
  else if (tab === 'text') placeText(p);
  else if (tab === 'transform') {
    wrap.setPointerCapture(e.pointerId);
    cropStart = { x: Math.min(canvas.width, Math.max(0, p.x)), y: Math.min(canvas.height, Math.max(0, p.y)) };
    crop = { x: cropStart.x, y: cropStart.y, w: 0, h: 0 };
    drawCrop();
  }
});
wrap.addEventListener('pointermove', (e) => {
  if (stroke) paintMove(e);
  else if (cropStart) cropMove(toImg(e));
});
const pointerEnd = () => {
  if (stroke) paintUp();
  if (cropStart) { cropStart = null; if (crop && (crop.w < 2 || crop.h < 2)) clearCrop(); }
};
wrap.addEventListener('pointerup', pointerEnd);
wrap.addEventListener('pointercancel', pointerEnd);

// ---------- Speichern ----------
const dlg = $('#saveDlg'), fmt = $('#fmt'), qual = $('#qual');
bindOutput(qual, (v) => v + ' %');
const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
fmt.onchange = () => { $('#qualRow').hidden = fmt.value === 'image/png'; };
function openSave() {
  if (!needImage()) return;
  endPreview(true); clearCrop();
  $('#fname').value = fileBase;
  $('#shareBtn').hidden = !(navigator.canShare && navigator.canShare({ files: [new File([''], 'x.png', { type: 'image/png' })] }));
  dlg.showModal();
}
function exportBlob() {
  let src = canvas;
  if (fmt.value === 'image/jpeg') { // JPEG kennt keine Transparenz: weisser Hintergrund
    src = document.createElement('canvas');
    src.width = canvas.width; src.height = canvas.height;
    const g = src.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, src.width, src.height);
    g.drawImage(canvas, 0, 0);
  }
  return new Promise((res) => src.toBlob(res, fmt.value, qual.value / 100));
}
async function exportFile() {
  const blob = await exportBlob();
  if (!blob) throw new Error('Export fehlgeschlagen');
  const ext = EXT[blob.type] || 'png'; // z. B. Safari ohne WebP-Export liefert PNG
  const name = ($('#fname').value.trim() || 'bild').replace(/[\\/:*?"<>|]+/g, '-') + '.' + ext;
  return new File([blob], name, { type: blob.type });
}
$('#saveBtn').onclick = openSave;
$('#dlgCancel').onclick = () => dlg.close();
$('#dlBtn').onclick = async () => {
  try {
    const file = await exportFile();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file); a.download = file.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    dirty = false; dlg.close();
    toast('Gespeichert: ' + file.name);
  } catch (e) { toast(e.message); }
};
$('#shareBtn').onclick = async () => {
  try {
    const file = await exportFile();
    await navigator.share({ files: [file], title: file.name });
    dirty = false; dlg.close();
  } catch (e) { if (e.name !== 'AbortError') toast('Teilen nicht möglich'); }
};

// ---------- Tastatur ----------
document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey)) return;
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && e.target.type !== 'range';
  const k = e.key.toLowerCase();
  if (k === 's') { e.preventDefault(); openSave(); }
  else if (k === 'o') { e.preventDefault(); openFile(); }
  else if (typing) return;
  else if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
  else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
});
$('#undoBtn').onclick = undo;
$('#redoBtn').onclick = redo;

window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

setMode(genMode);
updateUi();
