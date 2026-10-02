'use strict';
// Bildstudio – KI-Bilder ohne Cloud:
//  1) Im Browser: SD-Turbo (Stable Diffusion, 1 Schritt) über ONNX Runtime + WebGPU.
//     Das Modell (~2,4 GB) wird einmalig geladen und bleibt im Browser-Speicher – danach offline.
//  2) Eigener KI-Server im Heimnetz/auf dem PC mit Automatic1111-/Forge-API.
const KI = (() => {
  const DEFAULT_BASE = 'https://huggingface.co/schmuell/sd-turbo-ort-web/resolve/main/';
  const CACHE = 'ki-modelle-sd-turbo'; // bewusst ohne «bildstudio-»: der Service Worker räumt sonst auf
  const MODELS = [
    { key: 'text_encoder', file: 'text_encoder/model.onnx', mb: 1700, dims: { batch_size: 1 } },
    { key: 'unet', file: 'unet/model.onnx', mb: 640, dims: { batch_size: 1, num_channels: 4, height: 64, width: 64, sequence_length: 77 } },
    { key: 'vae_decoder', file: 'vae_decoder/model.onnx', mb: 95, dims: { batch_size: 1, num_channels_latent: 4, height_latent: 64, width_latent: 64 } },
  ];
  const TOTAL_MB = MODELS.reduce((s, m) => s + m.mb, 0);
  const SIGMA = 14.6146, VAE_SCALE = 0.18215;

  const store = {
    get: (k, d) => { try { return localStorage.getItem('bildstudio.' + k) ?? d; } catch { return d; } },
    set: (k, v) => { try { localStorage.setItem('bildstudio.' + k, v); } catch { /* egal */ } },
  };
  const modelBase = () => { const b = store.get('kiModelBase', DEFAULT_BASE); return b.endsWith('/') ? b : b + '/'; };
  const urlOf = (m) => modelBase() + m.file;

  // ---------- CLIP-Tokenizer (BPE), identisch zu OpenAI/OpenCLIP ----------
  let tokenizer = null;
  async function getTokenizer() {
    if (tokenizer) return tokenizer;
    const res = await fetch('ki/clip-merges.txt');
    if (!res.ok) throw new Error('Tokenizer-Datei fehlt');
    const merges = (await res.text()).split('\n').map((l) => l.split(' '));
    const bs = [];
    for (let b = 33; b <= 126; b++) bs.push(b);
    for (let b = 161; b <= 172; b++) bs.push(b);
    for (let b = 174; b <= 255; b++) bs.push(b);
    const cs = bs.slice();
    for (let b = 0, n = 0; b < 256; b++) if (!bs.includes(b)) { bs.push(b); cs.push(256 + n++); }
    const byteEnc = [];
    bs.forEach((b, i) => { byteEnc[b] = String.fromCodePoint(cs[i]); });
    const vocab = bs.map((b) => byteEnc[b]);
    vocab.push(...vocab.map((v) => v + '</w>'));
    for (const m of merges) vocab.push(m[0] + m[1]);
    vocab.push('<start_of_text>', '<end_of_text>');
    const enc = new Map(vocab.map((v, i) => [v, i]));
    const ranks = new Map(merges.map((m, i) => [m[0] + ' ' + m[1], i]));
    const cache = new Map();
    const utf8 = new TextEncoder();

    function bpe(token) {
      if (cache.has(token)) return cache.get(token);
      const ch = [...token];
      let word = ch.slice(0, -1).concat(ch[ch.length - 1] + '</w>');
      while (word.length > 1) {
        let best = -1, bestRank = Infinity;
        for (let i = 0; i < word.length - 1; i++) {
          const r = ranks.get(word[i] + ' ' + word[i + 1]);
          if (r !== undefined && r < bestRank) { bestRank = r; best = i; }
        }
        if (best < 0) break;
        const a = word[best], b = word[best + 1], next = [];
        for (let i = 0; i < word.length;) {
          if (i < word.length - 1 && word[i] === a && word[i + 1] === b) { next.push(a + b); i += 2; } else { next.push(word[i]); i++; }
        }
        word = next;
      }
      cache.set(token, word);
      return word;
    }
    const PAT = /<start_of_text>|<end_of_text>|'s|'t|'re|'ve|'m|'ll|'d|\p{L}+|\p{N}|[^\s\p{L}\p{N}]+/gu;

    // Liefert immer 77 Token: Start, Text, Ende, mit 0 aufgefüllt (wie OpenCLIP)
    function encode(text) {
      const clean = text.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
      const ids = [];
      for (const m of clean.matchAll(PAT)) {
        const t = Array.from(utf8.encode(m[0]), (b) => byteEnc[b]).join('');
        for (const p of bpe(t)) ids.push(enc.get(p));
      }
      const out = new Int32Array(77);
      out[0] = 49406;
      const n = Math.min(ids.length, 75);
      out.set(ids.slice(0, n), 1);
      out[n + 1] = 49407;
      return out;
    }
    tokenizer = { encode };
    return tokenizer;
  }

  // ---------- Deutsch → Englisch (kleines Wörterbuch; das Modell versteht Englisch am besten) ----------
  const DICT = {
    berg: 'mountain', berge: 'mountains', gebirge: 'mountains', alpen: 'alps', hügel: 'hills', tal: 'valley',
    see: 'lake', meer: 'sea', ozean: 'ocean', strand: 'beach', fluss: 'river', wasserfall: 'waterfall', insel: 'island',
    wald: 'forest', baum: 'tree', bäume: 'trees', blume: 'flower', blumen: 'flowers', wiese: 'meadow', garten: 'garden',
    himmel: 'sky', wolken: 'clouds', wolke: 'cloud', sonne: 'sun', mond: 'moon', sterne: 'stars', stern: 'star',
    sonnenuntergang: 'sunset', sonnenaufgang: 'sunrise', nacht: 'night', tag: 'day', abend: 'evening', morgen: 'morning',
    regen: 'rain', schnee: 'snow', nebel: 'fog', gewitter: 'thunderstorm', winter: 'winter', sommer: 'summer',
    frühling: 'spring', herbst: 'autumn', weltall: 'outer space', galaxie: 'galaxy', planet: 'planet',
    stadt: 'city', dorf: 'village', haus: 'house', häuser: 'houses', burg: 'castle', schloss: 'castle', kirche: 'church',
    strasse: 'street', straße: 'street', brücke: 'bridge', turm: 'tower', zimmer: 'room', küche: 'kitchen', hütte: 'cabin',
    auto: 'car', zug: 'train', schiff: 'ship', boot: 'boat', flugzeug: 'airplane', fahrrad: 'bicycle', rakete: 'rocket',
    hund: 'dog', hunde: 'dogs', katze: 'cat', katzen: 'cats', pferd: 'horse', vogel: 'bird', vögel: 'birds', fisch: 'fish',
    löwe: 'lion', tiger: 'tiger', bär: 'bear', fuchs: 'fox', wolf: 'wolf', drache: 'dragon', einhorn: 'unicorn',
    eule: 'owl', hut: 'hat', brille: 'glasses', krone: 'crown', schal: 'scarf', mütze: 'cap', adler: 'eagle', schmetterling: 'butterfly', hase: 'rabbit', kuh: 'cow', affe: 'monkey',
    mann: 'man', frau: 'woman', kind: 'child', kinder: 'children', mädchen: 'girl', junge: 'boy', mensch: 'person',
    roboter: 'robot', ritter: 'knight', astronaut: 'astronaut', hexe: 'witch', zauberer: 'wizard', prinzessin: 'princess',
    rot: 'red', rote: 'red', roter: 'red', blau: 'blue', blaue: 'blue', blauer: 'blue', grün: 'green', grüne: 'green',
    gelb: 'yellow', orange: 'orange', lila: 'purple', violett: 'violet', rosa: 'pink', schwarz: 'black', weiss: 'white',
    weiß: 'white', grau: 'gray', braun: 'brown', gold: 'gold', golden: 'golden', silber: 'silver', bunt: 'colorful', bunte: 'colorful',
    gross: 'big', groß: 'big', grosse: 'big', große: 'big', klein: 'small', kleine: 'small', kleiner: 'small',
    schön: 'beautiful', schöne: 'beautiful', alt: 'old', alte: 'old', neu: 'new', dunkel: 'dark', dunkle: 'dark', hell: 'bright',
    süss: 'cute', süß: 'cute', niedlich: 'cute', gruselig: 'creepy', magisch: 'magical', ruhig: 'calm', wild: 'wild',
    foto: 'photo', fotografie: 'photograph', gemälde: 'painting', ölgemälde: 'oil painting', zeichnung: 'drawing',
    aquarell: 'watercolor', skizze: 'sketch', comic: 'comic', realistisch: 'realistic', fotorealistisch: 'photorealistic',
    futuristisch: 'futuristic', mittelalterlich: 'medieval', porträt: 'portrait', landschaft: 'landscape',
    im: 'in the', in: 'in', am: 'at the', an: 'at', auf: 'on', unter: 'under', über: 'over', vor: 'in front of',
    hinter: 'behind', neben: 'next to', mit: 'with', ohne: 'without', und: 'and', oder: 'or', bei: 'at', zwischen: 'between',
    der: '', die: '', das: '', den: '', dem: '', des: '', ein: 'a', eine: 'a', einen: 'a', einem: 'a', einer: 'a',
    sehr: 'very', viele: 'many', zwei: 'two', drei: 'three',
  };
  function translate(text) {
    return text.replace(/[\p{L}]+/gu, (w) => {
      const t = DICT[w.toLowerCase()];
      return t === undefined ? w : t;
    }).replace(/\s+/g, ' ').trim();
  }

  // ---------- Halbgenaue Zahlen (float16) ----------
  const f32b = new Float32Array(1), u32b = new Uint32Array(f32b.buffer);
  function toHalf(v) {
    f32b[0] = v;
    const x = u32b[0], sign = (x >>> 16) & 0x8000, e = ((x >>> 23) & 0xff) - 112, m = x & 0x7fffff;
    if (e <= 0) return e < -10 ? sign : sign | (((m | 0x800000) >>> (1 - e)) + 0x1000) >>> 13;
    if (e >= 31) return sign | 0x7c00;
    return (sign | (e << 10)) + ((m + 0x1000) >>> 13);
  }
  function fromHalf(h) {
    const s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 0x1f, f = h & 0x3ff;
    if (e === 0) return s * f * 2 ** -24;
    if (e === 31) return f ? NaN : s * Infinity;
    return s * (1 + f / 1024) * 2 ** (e - 15);
  }
  function toF32(data) {
    if (data instanceof Uint16Array) return Float32Array.from(data, fromHalf);
    return data instanceof Float32Array ? data : Float32Array.from(data);
  }

  // ---------- ONNX Runtime laden (liegt lokal in vendor/ort) ----------
  let ortReady = null;
  function loadOrt() {
    if (ortReady) return ortReady;
    ortReady = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'vendor/ort/ort.webgpu.min.js';
      s.onload = () => {
        ort.env.wasm.wasmPaths = new URL('vendor/ort/', location.href).href;
        ort.env.wasm.numThreads = 1;
        res(ort);
      };
      s.onerror = () => { ortReady = null; rej(new Error('KI-Laufzeit konnte nicht geladen werden')); };
      document.head.appendChild(s);
    });
    return ortReady;
  }

  // ---------- Prüfen, ob dieses Gerät KI im Browser kann ----------
  async function checkDevice() {
    if (!/^https?:$/.test(location.protocol)) return 'KI im Browser braucht die Web-App (https:// oder localhost), nicht die geöffnete Datei.';
    if (!window.caches) return 'Dieser Browser kann keine Modelle speichern.';
    if (store.get('kiEp', 'webgpu') !== 'webgpu') return null; // nur für Tests
    if (!navigator.gpu) return 'Dieser Browser unterstützt kein WebGPU. Nimm einen aktuellen Chrome oder Edge (PC/Mac) oder ab Android 12 Chrome.';
    const adapter = await navigator.gpu.requestAdapter().catch(() => null);
    if (!adapter) return 'Keine passende Grafikkarte gefunden (WebGPU nicht verfügbar).';
    if (!adapter.features.has('shader-f16')) return 'Die Grafikkarte unterstützt kein float16 (shader-f16) – SD-Turbo läuft hier leider nicht.';
    return null;
  }

  async function cachedState() {
    if (!window.caches) return { complete: false, count: 0 };
    const c = await caches.open(CACHE);
    let count = 0;
    for (const m of MODELS) if (await c.match(urlOf(m))) count++;
    return { complete: count === MODELS.length, count };
  }

  // Datei laden: aus dem Browser-Speicher oder einmalig aus dem Netz (mit Fortschritt)
  async function fetchModel(m, onBytes) {
    const c = await caches.open(CACHE), url = urlOf(m);
    const hit = await c.match(url);
    if (hit) { const buf = await hit.arrayBuffer(); onBytes(buf.byteLength); return buf; }
    if (!navigator.onLine) throw new Error('Das KI-Modell ist noch nicht heruntergeladen – dafür einmal Internet nötig.');
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download fehlgeschlagen (${res.status}) – ${m.file}`);
    const reader = res.body.getReader(), chunks = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); onBytes(value.length, true);
    }
    const blob = new Blob(chunks);
    chunks.length = 0;
    await c.put(url, new Response(blob, { headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(blob.size) } }));
    return blob.arrayBuffer();
  }

  let sessions = null, loading = null;
  // Lädt (und wenn nötig herunterladen) alle drei Modellteile; onStatus(text, anteil 0..1)
  function prepare(onStatus = () => {}) {
    if (sessions) return Promise.resolve(sessions);
    if (loading) return loading;
    loading = (async () => {
      const problem = await checkDevice();
      if (problem) throw new Error(problem);
      navigator.storage?.persist?.().catch(() => {});
      const ort = await loadOrt();
      await getTokenizer();
      const out = {}, total = TOTAL_MB * 1e6;
      let done = 0;
      for (const m of MODELS) {
        const before = done;
        const buf = await fetchModel(m, (n, net) => {
          done += n;
          if (net) onStatus(`KI-Modell wird heruntergeladen… ${Math.round(done / 1e6)} von ~${TOTAL_MB} MB`, Math.min(1, done / total));
        });
        done = before + buf.byteLength;
        onStatus(`KI-Modell wird gestartet (${m.key})…`, Math.min(1, done / total));
        out[m.key] = await ort.InferenceSession.create(buf, {
          executionProviders: [store.get('kiEp', 'webgpu')],
          enableMemPattern: false,
          enableCpuMemArena: false,
          freeDimensionOverrides: m.dims,
          extra: { session: { disable_prepacking: '1', use_device_allocator_for_initializers: '1', use_ort_model_bytes_directly: '1', use_ort_model_bytes_for_initializers: '1' } },
        });
      }
      sessions = out;
      return out;
    })();
    loading.catch(() => {}).finally(() => { loading = null; });
    return loading;
  }

  // Tensor im Datentyp, den das Modell für diesen Eingang erwartet
  // (je nach Export z. B. timestep als float16 oder int64)
  function tensor(sess, name, values, dims, fallback) {
    const meta = sess.inputMetadata?.find?.((x) => x.name === name);
    const type = meta?.type || fallback;
    switch (type) {
      case 'float16': return new ort.Tensor('float16', Uint16Array.from(values, toHalf), dims);
      case 'int64': return new ort.Tensor('int64', BigInt64Array.from(values, (v) => BigInt(Math.round(v))), dims);
      case 'int32': return new ort.Tensor('int32', Int32Array.from(values, Math.round), dims);
      default: return new ort.Tensor('float32', Float32Array.from(values), dims);
    }
  }
  const first = (out, name) => out[name] || out[Object.keys(out)[0]];

  // Erzeugt ein 512×512-Bild; gibt ImageData zurück
  async function generate(prompt, seed, onStatus = () => {}) {
    const S = await prepare(onStatus);
    onStatus('KI malt…', 1);
    const ids = (await getTokenizer()).encode(prompt);
    const te = await S.text_encoder.run({ input_ids: tensor(S.text_encoder, 'input_ids', ids, [1, 77], 'int32') });
    const hidden = first(te, 'last_hidden_state');

    // Startrauschen aus dem Seed (Box-Muller)
    const r = Gen.rng(seed), n = 4 * 64 * 64, latent = new Float32Array(n);
    for (let i = 0; i < n; i += 2) {
      const u = Math.max(r(), 1e-12), v = r(), rad = Math.sqrt(-2 * Math.log(u));
      latent[i] = rad * Math.cos(2 * Math.PI * v) * SIGMA;
      latent[i + 1] = rad * Math.sin(2 * Math.PI * v) * SIGMA;
    }
    const k = 1 / Math.sqrt(SIGMA * SIGMA + 1), scaled = latent.map((x) => x * k);
    const un = await S.unet.run({
      sample: tensor(S.unet, 'sample', scaled, [1, 4, 64, 64], 'float16'),
      timestep: tensor(S.unet, 'timestep', [999], [1], 'float16'),
      encoder_hidden_states: hidden,
    });
    const eps = toF32(first(un, 'out_sample').data);
    // Ein Euler-Schritt bis zum Ende, dann für den VAE skalieren
    const lat = new Float32Array(n);
    for (let i = 0; i < n; i++) lat[i] = (latent[i] - SIGMA * eps[i]) / VAE_SCALE;
    const vae = await S.vae_decoder.run({ latent_sample: tensor(S.vae_decoder, 'latent_sample', lat, [1, 4, 64, 64], 'float32') });
    const outT = first(vae, 'sample'), px = toF32(outT.data);
    const H = outT.dims[2], W = outT.dims[3], plane = W * H, img = new ImageData(W, H), d = img.data;
    for (let i = 0; i < plane; i++) {
      d[i * 4] = (px[i] / 2 + 0.5) * 255;
      d[i * 4 + 1] = (px[plane + i] / 2 + 0.5) * 255;
      d[i * 4 + 2] = (px[2 * plane + i] / 2 + 0.5) * 255;
      d[i * 4 + 3] = 255;
    }
    return img;
  }

  async function deleteModel() {
    if (sessions) for (const s of Object.values(sessions)) s.release?.();
    sessions = null;
    await caches.delete(CACHE);
  }

  // ---------- Eigener KI-Server (Automatic1111 / Forge / SD.Next mit --api) ----------
  async function serverGenerate({ url, prompt, negative, seed, width, height, steps }) {
    const base = url.trim().replace(/\/+$/, '');
    let res;
    try {
      res = await fetch(base + '/sdapi/v1/txt2img', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, negative_prompt: negative, seed, width, height, steps, cfg_scale: 7, sampler_name: 'Euler a' }),
      });
    } catch {
      const host = new URL(base, location.href).hostname;
      const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(host);
      if (location.protocol === 'https:' && base.startsWith('http:') && !local) {
        throw new Error(`Der Browser blockiert die unverschlüsselte Adresse ${base}. Den KI-Server auf diesem PC (localhost) nutzen oder bei «KI-Motor» «Im Browser» wählen.`);
      }
      throw new Error(`Kein KI-Server unter ${base} gefunden. Läuft auf dem PC ein Stable-Diffusion-Programm mit --api? Sonst bei «KI-Motor» «Im Browser» wählen.`);
    }
    if (!res.ok) throw new Error(`KI-Server meldet Fehler ${res.status}`);
    const j = await res.json();
    if (!j.images?.length) throw new Error('KI-Server hat kein Bild geliefert');
    const img = new Image();
    img.src = 'data:image/png;base64,' + j.images[0];
    await img.decode();
    return img;
  }

  return {
    TOTAL_MB, store, translate, checkDevice, cachedState, prepare, generate, deleteModel, serverGenerate,
    isLoaded: () => !!sessions, getTokenizer,
  };
})();
