'use strict';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MODES = { full: 'Vollzugriff', video: 'Nur Video', private: 'Privat' };
const store = {
  get(k, d) { try { const v = localStorage.getItem('kvm-' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('kvm-' + k, JSON.stringify(v)); } catch (e) { /* privat-Modus */ } },
};

let S = { connected: false, cons: [], cpus: [], routes: {} };
let tab = 'cons';
let query = '';
let favs = new Set(store.get('favs', []));
let mode = store.get('mode', 'full');
let pin = store.get('pin', '');
let sheetCon = null;

// ---------- Server ----------
async function call(path, body) {
  const res = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', 'X-KVM-Pin': pin },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { askPin(); throw new Error('PIN falsch'); }
  if (!res.ok) throw new Error(data.error || 'Fehler ' + res.status);
  return data;
}

let es = null;
function listen() {
  if (es) es.close();
  es = new EventSource('api/events?pin=' + encodeURIComponent(pin));
  es.onmessage = (e) => { S = JSON.parse(e.data); render(); };
  es.onerror = () => { $('#status').textContent = 'Brücke nicht erreichbar – versuche erneut …'; };
}

async function init() {
  try {
    const info = await call('api/info');
    if (info.pinRequired && !pin) return askPin();
    await call('api/state').then((d) => { S = d; render(); });
    listen();
  } catch (e) {
    $('#status').textContent = 'Brücke nicht erreichbar';
    setTimeout(init, 3000);
  }
}

function askPin() {
  const p = prompt('PIN für die KVM-Steuerung:');
  if (p == null) return;
  pin = p.trim();
  store.set('pin', pin);
  init();
}

// ---------- Anzeige ----------
const byId = (list, id) => list.find((x) => x.id === Number(id));
const match = (name) => !query || name.toLowerCase().includes(query.toLowerCase());
const badge = (m) => `<span class="badge ${m}">${MODES[m] || m}</span>`;

function render() {
  const when = S.updatedAt ? new Date(S.updatedAt).toLocaleTimeString('de-CH') : '';
  $('#status').textContent = S.connected ? `${S.driver} · ${S.cons.length} Arbeitsplätze, ${S.cpus.length} Rechner` : 'Keine Verbindung zur Matrix';
  $('#banner').innerHTML = S.error ? `<div class="banner err">${esc(S.error)}</div>`
    : S.driver === 'Simulator' ? '<div class="banner warn">Simulator – es wird nichts wirklich geschaltet.</div>' : '';
  if (when) $('#status').title = 'Stand ' + when;

  const list = tab === 'cons' ? renderCons() : renderCpus();
  $('#list').innerHTML = list;
  $('#list').querySelectorAll('[data-con]').forEach((b) => b.addEventListener('click', () => openSheet(Number(b.dataset.con))));
  $('#list').querySelectorAll('[data-fav]').forEach((b) => b.addEventListener('click', (ev) => {
    ev.stopPropagation();
    const id = Number(b.dataset.fav);
    favs.has(id) ? favs.delete(id) : favs.add(id);
    store.set('favs', [...favs]);
    render();
  }));
  if (sheetCon != null) renderSheet();
}

function conRow(c) {
  const r = S.routes[c.id];
  const cpu = r && byId(S.cpus, r.cpu);
  return `<button class="row${c.online === false ? ' off' : ''}" data-con="${c.id}">
    <span class="dot${c.online !== false ? ' on' : ''}"></span>
    <span class="main"><span class="title">${esc(c.name)}</span>
      <span class="meta">${cpu ? '→ <b>' + esc(cpu.name) + '</b>' : 'nicht verbunden'}</span></span>
    ${r ? badge(r.mode) : ''}
    <span class="star${favs.has(c.id) ? ' on' : ''}" data-fav="${c.id}" role="button" aria-label="Favorit">${favs.has(c.id) ? '★' : '☆'}</span>
  </button>`;
}

function renderCons() {
  const cons = S.cons.filter((c) => match(c.name));
  if (!cons.length) return `<div class="empty">${S.cons.length ? 'Nichts gefunden' : 'Keine Arbeitsplätze geladen'}</div>`;
  const fav = cons.filter((c) => favs.has(c.id));
  const rest = cons.filter((c) => !favs.has(c.id));
  return (fav.length ? `<h2>Favoriten</h2><div class="card">${fav.map(conRow).join('')}</div>` : '')
    + (rest.length ? `<h2>${fav.length ? 'Alle' : 'Arbeitsplätze'}</h2><div class="card">${rest.map(conRow).join('')}</div>` : '');
}

function renderCpus() {
  const cpus = S.cpus.filter((c) => match(c.name));
  if (!cpus.length) return `<div class="empty">${S.cpus.length ? 'Nichts gefunden' : 'Keine Rechner geladen'}</div>`;
  return `<div class="card">${cpus.map((c) => {
    const users = Object.entries(S.routes).filter(([, r]) => r.cpu === c.id)
      .map(([con, r]) => { const k = byId(S.cons, con); return k ? esc(k.name) + (r.mode === 'video' ? ' (Video)' : '') : null; })
      .filter(Boolean);
    return `<div class="row${c.online === false ? ' off' : ''}">
      <span class="dot${c.online !== false ? ' on' : ''}"></span>
      <span class="main"><span class="title">${esc(c.name)}</span>
        <span class="meta">${users.length ? 'auf ' + users.join(', ') : 'frei'}</span></span>
    </div>`;
  }).join('')}</div>`;
}

// ---------- Schalten ----------
function openSheet(conId) {
  sheetCon = conId;
  renderSheet();
  $('#backdrop').classList.add('open');
  void $('#sheet').offsetHeight;
  $('#sheet').classList.add('open');
  const q = $('#sq'); if (q && matchMedia('(pointer:fine)').matches) q.focus();
}
function closeSheet() {
  sheetCon = null;
  $('#sheet').classList.remove('open');
  $('#backdrop').classList.remove('open');
}
$('#backdrop').addEventListener('click', closeSheet);

let sheetQuery = '';
function renderSheet() {
  const con = byId(S.cons, sheetCon);
  if (!con) return closeSheet();
  const r = S.routes[con.id];
  const cur = r && byId(S.cpus, r.cpu);
  const cpus = S.cpus.filter((c) => !sheetQuery || c.name.toLowerCase().includes(sheetQuery.toLowerCase()));
  const keepScroll = $('#sheet .scroll')?.scrollTop || 0;
  $('#sheet').innerHTML = `
    <div class="grab"></div>
    <h3>${esc(con.name)}</h3>
    <div class="now">${cur ? `Jetzt: <b>${esc(cur.name)}</b> · ${MODES[r.mode] || r.mode}` : 'Nicht verbunden'}</div>
    <div class="seg" id="modes">${Object.entries(MODES).map(([k, v]) => `<button data-mode="${k}" class="${k === mode ? 'on' : ''}">${v}</button>`).join('')}</div>
    <input class="search" id="sq" type="search" placeholder="Rechner suchen …" value="${esc(sheetQuery)}" autocomplete="off">
    <div class="scroll"><div class="card">${cpus.map((c) => `
      <button class="row${c.online === false ? ' off' : ''}${r && r.cpu === c.id ? ' current' : ''}" data-cpu="${c.id}">
        <span class="dot${c.online !== false ? ' on' : ''}"></span>
        <span class="main"><span class="title">${esc(c.name)}</span></span>
        ${r && r.cpu === c.id ? badge(r.mode) : '<span class="chev">›</span>'}
      </button>`).join('') || '<div class="empty">Nichts gefunden</div>'}</div></div>
    <div class="btns">
      <button class="btn plain" id="sClose">Schliessen</button>
      ${r ? '<button class="btn danger" id="sOff">Trennen</button>' : ''}
    </div>`;
  $('#sheet .scroll').scrollTop = keepScroll;
  $('#modes').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { mode = b.dataset.mode; store.set('mode', mode); renderSheet(); }));
  const sq = $('#sq');
  sq.addEventListener('input', () => { sheetQuery = sq.value; renderSheet(); const n = $('#sq'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); });
  $('#sClose').addEventListener('click', closeSheet);
  $('#sOff')?.addEventListener('click', () => doSwitch(con, null));
  $('#sheet').querySelectorAll('[data-cpu]').forEach((b) => b.addEventListener('click', () => doSwitch(con, byId(S.cpus, b.dataset.cpu))));
}

async function doSwitch(con, cpu) {
  try {
    S = await call('api/connect', { con: con.id, cpu: cpu ? cpu.id : null, mode });
    toast(cpu ? `${con.name} → ${cpu.name}` : `${con.name} getrennt`);
    sheetQuery = '';
    closeSheet();
    render();
  } catch (e) {
    toast(e.message, true);
  }
}

let toastTimer;
function toast(text, err) {
  const t = $('#toast');
  t.textContent = text;
  t.className = 'toast show' + (err ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast'; }, err ? 4000 : 2000);
}

// ---------- Bedienung ----------
$('#tabs').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
  tab = b.dataset.tab;
  $('#tabs').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
  render();
}));
$('#q').addEventListener('input', (e) => { query = e.target.value; render(); });
$('#btnRefresh').addEventListener('click', async () => {
  $('#btnRefresh').classList.add('spin');
  try { S = await call('api/refresh', {}); render(); toast('Namen neu geladen'); } catch (e) { toast(e.message, true); }
  $('#btnRefresh').classList.remove('spin');
});

init();
