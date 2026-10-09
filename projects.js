'use strict';
// ---------- Projekte: Kunden, Projekte, Aufgaben, Notizen und Fotos ----------
// Alles liegt im privaten Repo material-daten (siehe GH_PRIVATE in app.js), Fotos unter photos/<id>.jpg.
// Lokal: Texte im state (localStorage), Fotos in IndexedDB (localStorage wäre zu klein).

function applyBasic(items, op) {
  if (op.type === 'add') return items.some((i) => i.id === op.item.id) ? items : [...items, { ...op.item }];
  if (op.type === 'update') return items.map((i) => (i.id === op.id ? { ...i, ...op.fields } : i));
  if (op.type === 'delete') return items.filter((i) => i.id !== op.id);
  return items;
}

function applyProjOp(items, op) {
  const onEntries = (fn) => items.map((p) => (p.id === op.pid ? { ...p, entries: fn(p.entries || []) } : p));
  if (op.type === 'entryAdd') return onEntries((es) => (es.some((e) => e.id === op.entry.id) ? es : [...es, { ...op.entry }]));
  if (op.type === 'entryUpdate') return onEntries((es) => es.map((e) => (e.id === op.eid ? { ...e, ...op.fields } : e)));
  if (op.type === 'entryDelete') return onEntries((es) => es.filter((e) => e.id !== op.eid));
  return applyBasic(items, op);
}

DOCS.customers = { path: 'customers.json', label: 'Kunden', repo: GH_PRIVATE, private: true, apply: applyBasic,
  get: () => state.customers, set: (v) => { state.customers = v; } };
DOCS.projects = { path: 'projects.json', label: 'Projekte', repo: GH_PRIVATE, private: true, apply: applyProjOp,
  get: () => state.projects, set: (v) => { state.projects = v; } };

const custOp = (op) => docOp('customers', op);
const projOp = (op) => docOp('projects', op);
const customerOf = (p) => state.customers.find((c) => c.id === p.customerId) || { name: 'Unbekannter Kunde' };
const openTasks = (p) => (p.entries || []).filter((e) => e.type === 'task' && !e.done).length;
const fmtDateTime = (ts) => new Date(ts).toLocaleString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

let prFilter = 'offen';
let prQuery = '';
let currentProjectId = null;
let prTab = 'tasks';
let newEntryPhotos = { tasks: [], notes: [] }; // Fotos für den nächsten Eintrag, noch nicht gespeichert

// ---------- Fotos ----------
let idbPromise;
function idb() {
  if (!idbPromise) {
    idbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open('material-transit', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('photos');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return idbPromise;
}
async function idbDo(mode, fn) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('photos', mode);
    const req = fn(tx.objectStore('photos'));
    tx.oncomplete = () => resolve(req && req.result);
    tx.onerror = () => reject(tx.error);
  });
}
const idbGet = (id) => idbDo('readonly', (s) => s.get(id));
const idbPut = (id, blob) => idbDo('readwrite', (s) => s.put(blob, id));
const idbDel = (id) => idbDo('readwrite', (s) => s.delete(id));

// Foto verkleinern (max. 1600 px, JPEG), damit Upload und Speicher klein bleiben
async function resizePhoto(file) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((resolve) => c.toBlob(resolve, 'image/jpeg', 0.8));
}

async function addPhotoFiles(files) {
  const ids = [];
  for (const f of files) {
    try {
      const blob = await resizePhoto(f);
      const id = uid();
      await idbPut(id, blob);
      state.photoQueue.push({ op: 'put', id });
      ids.push(id);
    } catch (e) { toast('Foto konnte nicht gelesen werden'); }
  }
  save(); scheduleSync();
  return ids;
}
function removePhotos(ids) {
  (ids || []).forEach((id) => {
    state.photoQueue = state.photoQueue.filter((q) => q.id !== id); // noch nicht hochgeladen: gar nicht erst hochladen
    state.photoQueue.push({ op: 'del', id });
    idbDel(id).catch(() => {});
    photoUrls.delete(id);
  });
  save(); scheduleSync();
}

const photoUrls = new Map();
async function photoUrl(id) {
  if (photoUrls.has(id)) return photoUrls.get(id);
  let blob = await idbGet(id).catch(() => null);
  if (!blob && state.settings.ghToken && navigator.onLine) {
    const res = await fetch(`${GH_PRIVATE.base}photos/${id}.jpg?ref=${GH_PRIVATE.branch}`,
      { headers: { ...ghHeaders(), Accept: 'application/vnd.github.raw+json' }, cache: 'no-store' });
    if (res.ok) { blob = await res.blob(); idbPut(id, blob).catch(() => {}); }
  }
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  photoUrls.set(id, url);
  return url;
}
function thumbsHtml(ids, removable) {
  if (!ids || !ids.length) return '';
  return `<div class="thumbs">${ids.map((id) => `<span class="thumbwrap"><img class="thumb" data-photo="${esc(id)}" alt="Foto">${
    removable ? `<button class="thumbdel" data-rmphoto="${esc(id)}" aria-label="Foto entfernen">×</button>` : ''}</span>`).join('')}</div>`;
}
// Bilder nachladen und Klick zum Vergrössern
function hydratePhotos(root) {
  root.querySelectorAll('img[data-photo]').forEach(async (img) => {
    img.addEventListener('click', (ev) => { ev.stopPropagation(); if (img.src) viewPhoto(img.src); });
    const url = await photoUrl(img.dataset.photo).catch(() => null);
    if (url) img.src = url; else img.classList.add('missing');
  });
}
function viewPhoto(src) {
  $('#photoViewImg').src = src;
  $('#photoView').classList.add('show');
}
$('#photoView').addEventListener('click', () => $('#photoView').classList.remove('show'));

async function blobToB64(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

// Foto-Warteschlange abarbeiten (wird von der Synchronisation in app.js aufgerufen)
async function syncPhotos() {
  for (const job of state.photoQueue.slice()) {
    const url = `${GH_PRIVATE.base}photos/${job.id}.jpg`;
    if (job.op === 'put') {
      const blob = await idbGet(job.id).catch(() => null);
      if (blob) {
        const res = await fetch(url, { method: 'PUT', headers: { ...ghHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'Foto hinzugefügt', content: await blobToB64(blob), branch: GH_PRIVATE.branch }) });
        if (!res.ok && res.status !== 422) throw new Error('Foto-Upload fehlgeschlagen (' + res.status + ')'); // 422: existiert schon
      }
    } else {
      const meta = await fetch(`${url}?ref=${GH_PRIVATE.branch}`, { headers: ghHeaders(), cache: 'no-store' });
      if (meta.ok) {
        const { sha } = await meta.json();
        await fetch(url, { method: 'DELETE', headers: { ...ghHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'Foto gelöscht', sha, branch: GH_PRIVATE.branch }) });
      }
    }
    state.photoQueue = state.photoQueue.filter((q) => q !== job && !(q.id === job.id && q.op === job.op));
    save();
  }
}

// ---------- Projektliste ----------
function renderProjectList() {
  const q = prQuery.trim().toLowerCase();
  const count = (st) => state.projects.filter((p) => (p.status || 'offen') === st).length;
  $('#prFilter').innerHTML = [['offen', `Offen (${count('offen')})`], ['abgeschlossen', `Abgeschlossen (${count('abgeschlossen')})`]]
    .map(([k, l]) => `<button class="chip ${prFilter === k ? 'on' : ''}" data-f="${k}">${l}</button>`).join('');
  $('#prFilter').querySelectorAll('.chip').forEach((b) => b.addEventListener('click', () => { prFilter = b.dataset.f; renderProjectList(); }));

  const list = state.projects
    .filter((p) => (p.status || 'offen') === prFilter)
    .filter((p) => !q || [p.name, customerOf(p).name, p.address, p.contact].some((t) => (t || '').toLowerCase().includes(q)));

  if (!state.projects.length) {
    $('#prList').innerHTML = `<div class="empty"><b>Noch keine Projekte</b>Unter „Erfassen“ ein neues Projekt eröffnen.</div>`;
    return;
  }
  if (!list.length) {
    $('#prList').innerHTML = `<div class="empty"><b>Nichts gefunden</b>${q ? 'Anderen Suchbegriff versuchen.' : 'Keine Projekte in dieser Ansicht.'}</div>`;
    return;
  }
  const groups = new Map();
  list.forEach((p) => {
    const c = customerOf(p);
    if (!groups.has(c.name)) groups.set(c.name, []);
    groups.get(c.name).push(p);
  });
  $('#prList').innerHTML = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([name, ps]) =>
    `<h2>${esc(name)}</h2><div class="card">` + ps.sort((a, b) => b.created - a.created).map((p) => {
      const n = openTasks(p);
      return `<button class="row rowbtn" data-open-project="${esc(p.id)}">
        <div class="main"><div class="title">${esc(p.name)}</div>
          <div class="meta">${esc(p.address || p.contact || 'eröffnet ' + fmtDate(p.created))}</div></div>
        ${n ? `<span class="pill">${n} offen</span>` : ''}<span class="chev">›</span>
      </button>`;
    }).join('') + `</div>`).join('');
  $('#prList').querySelectorAll('[data-open-project]').forEach((b) => b.addEventListener('click', () => openProject(b.dataset.openProject)));
}
$('#prSearch').addEventListener('input', (e) => { prQuery = e.target.value; renderProjectList(); });

// ---------- Neues Projekt ----------
let pnCustomerId = null;
function renderNewProject() {
  const c = state.customers.find((x) => x.id === pnCustomerId);
  $('#pnCustomer').innerHTML = c
    ? `<span class="main"><span class="title">${esc(c.name)}</span>${c.phone || c.email ? `<span class="meta">${esc([c.phone, c.email].filter(Boolean).join(' · '))}</span>` : ''}</span><span class="chev">›</span>`
    : `<span class="main placeholder">Kunde wählen oder neu erfassen …</span><span class="chev">›</span>`;
}
$('#pnCustomer').addEventListener('click', () => openCustomerPicker((id) => { pnCustomerId = id; renderNewProject(); }));
$('#pnSave').addEventListener('click', () => {
  const name = $('#pnName').value.trim();
  if (!pnCustomerId) { toast('Bitte zuerst einen Kunden wählen'); return; }
  if (!name) { $('#pnName').focus(); toast('Bitte einen Projektnamen eingeben'); return; }
  const p = {
    id: uid(), customerId: pnCustomerId, name,
    address: $('#pnAddress').value.trim(), contact: $('#pnContact').value.trim(),
    phone: $('#pnPhone').value.trim(), email: $('#pnEmail').value.trim(),
    status: 'offen', created: Date.now(), entries: [],
  };
  projOp({ type: 'add', item: p });
  ['#pnName', '#pnAddress', '#pnContact', '#pnPhone', '#pnEmail'].forEach((s) => { $(s).value = ''; });
  pnCustomerId = null; renderNewProject();
  toast(`Projekt „${name}“ eröffnet`);
  openProject(p.id);
});

// Bottom-Sheet: Kunde suchen/wählen oder schnell neu anlegen
function openCustomerPicker(onPick) {
  let q = '';
  const listHtml = () => {
    const list = state.customers.filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (!list.length) return `<div class="hint" style="padding:12px 2px">${state.customers.length ? 'Kein Kunde gefunden.' : 'Noch keine Kunden erfasst.'}</div>`;
    return `<div class="card">${list.map((c) => {
      const n = state.projects.filter((p) => p.customerId === c.id).length;
      return `<button class="row rowbtn" data-pick="${esc(c.id)}"><div class="main"><div class="title">${esc(c.name)}</div>
        <div class="meta">${n} Projekt${n === 1 ? '' : 'e'}</div></div><span class="chev">›</span></button>`;
    }).join('')}</div>`;
  };
  $('#sheet').innerHTML = `
    <div class="grab"></div>
    <h3>Kunde wählen</h3>
    <input type="search" id="cpSearch" placeholder="Kunde suchen" autocomplete="off" style="margin:10px 0">
    <div id="cpList">${listHtml()}</div>
    <details class="fold card" id="cpNewWrap" style="margin-top:12px">
      <summary class="foldhead"><span class="foldtitle" style="color:var(--accent)">+ Neuer Kunde</span><span class="foldchev">›</span></summary>
      <div style="padding:0 14px 14px">
        <label class="f" for="cpName">Name / Firma</label><input type="text" id="cpName" autocomplete="off">
        <label class="f" for="cpPhone">Telefon (optional)</label><input type="tel" id="cpPhone" autocomplete="off">
        <label class="f" for="cpEmail">E-Mail (optional)</label><input type="email" id="cpEmail" autocomplete="off">
        <button class="btn" id="cpCreate">Kunde anlegen &amp; wählen</button>
      </div>
    </details>
    <button class="btn secondary" id="cpCancel">Abbrechen</button>`;
  const bindList = () => $('#cpList').querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => {
    onPick(b.dataset.pick); closeSheet();
  }));
  bindList();
  $('#cpSearch').addEventListener('input', (e) => {
    q = e.target.value; $('#cpList').innerHTML = listHtml(); bindList();
    if (q && !$('#cpName').value) $('#cpName').value = q; // Suchbegriff gleich als Name vorschlagen
  });
  $('#cpCreate').addEventListener('click', () => {
    const name = $('#cpName').value.trim();
    if (!name) { $('#cpName').focus(); return; }
    const dup = state.customers.find((c) => c.name.toLowerCase() === name.toLowerCase());
    if (dup) { onPick(dup.id); closeSheet(); toast('Kunde gab es schon – ausgewählt'); return; }
    const c = { id: uid(), name, phone: $('#cpPhone').value.trim(), email: $('#cpEmail').value.trim(), created: Date.now() };
    custOp({ type: 'add', item: c });
    onPick(c.id); closeSheet();
    toast(`Kunde „${name}“ angelegt`);
  });
  $('#cpCancel').addEventListener('click', closeSheet);
  if (!state.customers.length) $('#cpNewWrap').open = true;
  openSheet();
}

// ---------- Projekt-Detail ----------
function openProject(id) {
  currentProjectId = id;
  prTab = 'tasks';
  newEntryPhotos = { tasks: [], notes: [] };
  show('projekt');
}

const telHref = (t) => 'tel:' + t.replace(/[^\d+]/g, '');
const mapHref = (a) => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(a);

function renderProjectDetail() {
  const p = state.projects.find((x) => x.id === currentProjectId);
  if (!p) { show('projekte'); return; }
  const c = customerOf(p);
  const closed = p.status === 'abgeschlossen';
  const entries = p.entries || [];
  const tasks = entries.filter((e) => e.type === 'task');
  const notes = entries.filter((e) => e.type === 'note').sort((a, b) => b.created - a.created);
  const open = tasks.filter((t) => !t.done).sort((a, b) => a.created - b.created);
  const done = tasks.filter((t) => t.done).sort((a, b) => b.doneAt - a.doneAt);

  const infoRows = [
    p.address && `<a class="inforow" href="${mapHref(p.address)}" target="_blank" rel="noopener"><span class="ico">📍</span>${esc(p.address)}</a>`,
    p.contact && `<div class="inforow"><span class="ico">👤</span>${esc(p.contact)}</div>`,
    p.phone && `<a class="inforow" href="${telHref(p.phone)}"><span class="ico">📞</span>${esc(p.phone)}</a>`,
    p.email && `<a class="inforow" href="mailto:${encodeURIComponent(p.email)}"><span class="ico">✉️</span>${esc(p.email)}</a>`,
  ].filter(Boolean).join('');

  const taskRow = (t) => `
    <div class="row entry ${t.done ? 'done' : ''}">
      <button class="check ${t.done ? 'on' : ''}" data-toggle="${esc(t.id)}" aria-label="Erledigt">✓</button>
      <button class="main rowlink" data-edit-entry="${esc(t.id)}">
        <div class="title pre">${esc(t.text)}</div>
        <div class="meta">${t.done ? 'erledigt ' + fmtDate(t.doneAt) : 'erfasst ' + fmtDate(t.created)}${(t.photos || []).length ? ` · 📷 ${t.photos.length}` : ''}</div>
        ${thumbsHtml(t.photos)}
      </button>
    </div>`;

  const composer = (kind) => `
    <div class="card composer">
      ${kind === 'tasks'
        ? `<input type="text" id="cmpText" placeholder="Neue Aufgabe, z.B. Switch im Rack tauschen" autocomplete="off">`
        : `<textarea id="cmpText" placeholder="Notiz schreiben …"></textarea>`}
      ${thumbsHtml(newEntryPhotos[kind], true)}
      <div class="cmpbar">
        <label class="btn secondary photobtn">📷 Foto<input type="file" accept="image/*" multiple hidden id="cmpPhoto"></label>
        <button class="btn" id="cmpAdd">${kind === 'tasks' ? 'Aufgabe hinzufügen' : 'Notiz speichern'}</button>
      </div>
    </div>`;

  $('#prDetail').innerHTML = `
    <button class="backlink" id="prBack">‹ Projekte</button>
    <div class="card prhead">
      <div class="prtitle">${esc(p.name)}</div>
      <div class="prcust">${esc(c.name)} · <span class="status ${closed ? 'closed' : ''}">${closed ? 'Abgeschlossen' : 'Offen'}</span></div>
      ${infoRows ? `<div class="infos">${infoRows}</div>` : ''}
      <div class="btnrow">
        <button class="btn secondary" id="prEdit">Bearbeiten</button>
        <button class="btn ${closed ? 'secondary' : 'ok'}" id="prStatus">${closed ? 'Wieder eröffnen' : 'Abschliessen'}</button>
      </div>
    </div>
    <div class="seg">
      <button class="${prTab === 'tasks' ? 'on' : ''}" data-tab="tasks">Aufgaben${open.length ? ` (${open.length})` : ''}</button>
      <button class="${prTab === 'notes' ? 'on' : ''}" data-tab="notes">Notizen${notes.length ? ` (${notes.length})` : ''}</button>
    </div>
    ${prTab === 'tasks' ? `
      ${composer('tasks')}
      ${open.length ? `<div class="card" style="margin-top:12px">${open.map(taskRow).join('')}</div>`
        : `<div class="empty" style="padding:20px">${tasks.length ? 'Alle Aufgaben erledigt 👍' : 'Noch keine Aufgaben.'}</div>`}
      ${done.length ? `<details class="fold card" style="margin-top:12px"><summary class="foldhead"><span class="foldtitle">Erledigt</span>
        <span class="foldcount">${done.length}</span><span class="foldchev">›</span></summary>${done.map(taskRow).join('')}</details>` : ''}
    ` : `
      ${composer('notes')}
      ${notes.length ? notes.map((n) => `
        <button class="card note rowlink" data-edit-entry="${esc(n.id)}">
          <div class="meta">${fmtDateTime(n.created)}</div>
          <div class="pre" style="margin-top:4px">${esc(n.text)}</div>
          ${thumbsHtml(n.photos)}
        </button>`).join('') : `<div class="empty" style="padding:20px">Noch keine Notizen.</div>`}
    `}`;

  const root = $('#prDetail');
  $('#prBack').addEventListener('click', () => show('projekte'));
  $('#prEdit').addEventListener('click', () => openProjectEdit(p));
  $('#prStatus').addEventListener('click', () => {
    projOp({ type: 'update', id: p.id, fields: closed ? { status: 'offen', closedAt: null } : { status: 'abgeschlossen', closedAt: Date.now() } });
    toast(closed ? 'Projekt wieder eröffnet' : 'Projekt abgeschlossen – im Archiv unter „Abgeschlossen“');
  });
  root.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => { prTab = b.dataset.tab; renderProjectDetail(); }));
  root.querySelectorAll('[data-toggle]').forEach((b) => b.addEventListener('click', () => {
    const t = entries.find((e) => e.id === b.dataset.toggle);
    projOp({ type: 'entryUpdate', pid: p.id, eid: t.id, fields: t.done ? { done: false, doneAt: null } : { done: true, doneAt: Date.now() } });
  }));
  root.querySelectorAll('[data-edit-entry]').forEach((b) => b.addEventListener('click', () =>
    openEntryEdit(p, entries.find((e) => e.id === b.dataset.editEntry))));

  // Eingabe für neue Aufgabe/Notiz
  const kind = prTab;
  const draft = $('#cmpText');
  draft.value = renderProjectDetail.drafts?.[p.id + kind] || '';
  draft.addEventListener('input', () => { (renderProjectDetail.drafts ||= {})[p.id + kind] = draft.value; });
  if (kind === 'tasks') draft.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#cmpAdd').click(); });
  $('#cmpPhoto').addEventListener('change', async (e) => {
    const ids = await addPhotoFiles([...e.target.files]);
    newEntryPhotos[kind].push(...ids);
    renderProjectDetail();
  });
  root.querySelectorAll('.composer [data-rmphoto]').forEach((b) => b.addEventListener('click', () => {
    newEntryPhotos[kind] = newEntryPhotos[kind].filter((id) => id !== b.dataset.rmphoto);
    removePhotos([b.dataset.rmphoto]);
    renderProjectDetail();
  }));
  $('#cmpAdd').addEventListener('click', () => {
    const text = draft.value.trim();
    if (!text && !newEntryPhotos[kind].length) { draft.focus(); return; }
    projOp({ type: 'entryAdd', pid: p.id, entry: {
      id: uid(), type: kind === 'tasks' ? 'task' : 'note', text: text || 'Foto', photos: newEntryPhotos[kind],
      created: Date.now(), ...(kind === 'tasks' ? { done: false, doneAt: null } : {}),
    } });
    newEntryPhotos[kind] = [];
    (renderProjectDetail.drafts ||= {})[p.id + kind] = '';
    renderProjectDetail();
    if (kind === 'tasks') setTimeout(() => $('#cmpText') && $('#cmpText').focus(), 50);
  });
  hydratePhotos(root);
}

// Bottom-Sheet: Aufgabe oder Notiz bearbeiten (Text, Fotos, löschen)
function openEntryEdit(p, entry) {
  let photos = [...(entry.photos || [])];
  const added = [];
  const isTask = entry.type === 'task';
  const render = () => {
    $('#eePhotos').innerHTML = thumbsHtml(photos, true) || '<div class="hint">Keine Fotos</div>';
    $('#eePhotos').querySelectorAll('[data-rmphoto]').forEach((b) => b.addEventListener('click', () => {
      photos = photos.filter((id) => id !== b.dataset.rmphoto); render();
    }));
    hydratePhotos($('#eePhotos'));
  };
  $('#sheet').innerHTML = `
    <div class="grab"></div>
    <h3>${isTask ? 'Aufgabe' : 'Notiz'} bearbeiten</h3>
    <div class="hint">erfasst ${fmtDateTime(entry.created)}</div>
    <label class="f" for="eeText">Text</label>
    <textarea id="eeText" style="min-height:${isTask ? 80 : 140}px">${esc(entry.text)}</textarea>
    <label class="f">Fotos</label>
    <div id="eePhotos"></div>
    <label class="btn secondary photobtn" style="margin-top:8px">📷 Foto hinzufügen<input type="file" accept="image/*" multiple hidden id="eeAdd"></label>
    <button class="btn" id="eeSave">Speichern</button>
    <button class="btn danger" id="eeDel">${isTask ? 'Aufgabe' : 'Notiz'} löschen</button>
    <button class="btn secondary" id="eeCancel">Abbrechen</button>`;
  render();
  $('#eeAdd').addEventListener('change', async (e) => {
    const ids = await addPhotoFiles([...e.target.files]);
    added.push(...ids); photos.push(...ids); render();
  });
  $('#eeCancel').addEventListener('click', () => { removePhotos(added); closeSheet(); });
  $('#eeSave').addEventListener('click', () => {
    const removed = (entry.photos || []).filter((id) => !photos.includes(id));
    projOp({ type: 'entryUpdate', pid: p.id, eid: entry.id, fields: { text: $('#eeText').value.trim() || entry.text, photos } });
    removePhotos(removed);
    closeSheet(); toast('Gespeichert');
  });
  $('#eeDel').addEventListener('click', () => {
    if (!confirm(`${isTask ? 'Aufgabe' : 'Notiz'} wirklich löschen?`)) return;
    projOp({ type: 'entryDelete', pid: p.id, eid: entry.id });
    removePhotos([...(entry.photos || []), ...added]);
    closeSheet(); toast('Gelöscht');
  });
  openSheet();
}

// Bottom-Sheet: Projektangaben bearbeiten oder Projekt löschen
function openProjectEdit(p) {
  let customerId = p.customerId;
  const custLabel = () => esc((state.customers.find((c) => c.id === customerId) || { name: 'Kunde wählen …' }).name);
  $('#sheet').innerHTML = `
    <div class="grab"></div>
    <h3>Projekt bearbeiten</h3>
    <label class="f">Kunde</label>
    <button class="pickbtn" id="peCust"><span class="main title">${custLabel()}</span><span class="chev">›</span></button>
    <label class="f" for="peName">Projektname</label><input type="text" id="peName" value="${esc(p.name)}">
    <label class="f" for="peAddress">Adresse</label><input type="text" id="peAddress" value="${esc(p.address || '')}">
    <label class="f" for="peContact">Kontaktperson</label><input type="text" id="peContact" value="${esc(p.contact || '')}">
    <label class="f" for="pePhone">Telefon</label><input type="tel" id="pePhone" value="${esc(p.phone || '')}">
    <label class="f" for="peEmail">E-Mail</label><input type="email" id="peEmail" value="${esc(p.email || '')}">
    <button class="btn" id="peSave">Speichern</button>
    <button class="btn danger" id="peDel">Projekt löschen</button>
    <button class="btn secondary" id="peCancel">Abbrechen</button>`;
  const vals = () => ({ name: $('#peName').value, address: $('#peAddress').value, contact: $('#peContact').value, phone: $('#pePhone').value, email: $('#peEmail').value });
  $('#peCust').addEventListener('click', () => {
    const keep = vals();
    openCustomerPicker((id) => { customerId = id; openProjectEdit({ ...p, ...keep, customerId: id }); });
  });
  $('#peCancel').addEventListener('click', closeSheet);
  $('#peSave').addEventListener('click', () => {
    const v = vals();
    if (!v.name.trim()) { $('#peName').focus(); return; }
    const fields = { customerId };
    Object.entries(v).forEach(([k, val]) => { fields[k] = val.trim(); });
    projOp({ type: 'update', id: p.id, fields });
    closeSheet(); toast('Projekt gespeichert');
  });
  $('#peDel').addEventListener('click', () => {
    if (!confirm(`Projekt „${p.name}“ mit allen Aufgaben, Notizen und Fotos löschen?`)) return;
    const orig = state.projects.find((x) => x.id === p.id);
    removePhotos((orig.entries || []).flatMap((e) => e.photos || []));
    projOp({ type: 'delete', id: p.id });
    closeSheet(); show('projekte'); toast('Projekt gelöscht');
  });
  openSheet();
}

function renderProjectViews(fromSync) {
  if ($('#v-projekte').classList.contains('active')) renderProjectList();
  // nicht neu zeichnen, während im Eingabefeld getippt wird (Fokus/Tastatur bliebe sonst nicht stehen)
  if ($('#v-projekt').classList.contains('active') && !(fromSync && document.activeElement === $('#cmpText'))) renderProjectDetail();
  if ($('#v-projekt-neu').classList.contains('active')) renderNewProject();
}
