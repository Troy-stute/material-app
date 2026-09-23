'use strict';

const STORE_KEY = 'material-transit-v1';
const CATEGORIES = ['Strom', 'Video', 'Audio', 'Netzwerk', 'Adapter', 'Diverses'];
const LENGTHS = [0.5, 1, 2, 3, 5, 10, 15, 20, 25, 50];

// [Kategorie, Name, hat Länge]
const DEFAULT_CATALOG = [
  ['Strom', 'Verlängerung T13', true],
  ['Strom', 'Verlängerung T23', true],
  ['Strom', 'Kaltgerätekabel C13', true],
  ['Strom', 'Steckerleiste T13', false],
  ['Strom', 'Kabelrolle', false],
  ['Strom', 'CEE16 Kabel', true],
  ['Strom', 'CEE32 Kabel', true],
  ['Strom', 'powerCON Kabel', true],
  ['Video', 'HDMI', true],
  ['Video', 'DisplayPort', true],
  ['Video', 'SDI / BNC', true],
  ['Video', 'VGA', true],
  ['Audio', 'XLR', true],
  ['Audio', 'Klinke 6.3 mm', true],
  ['Audio', 'Klinke 3.5 mm', true],
  ['Audio', 'Cinch', true],
  ['Audio', 'Speakon', true],
  ['Netzwerk', 'RJ45 Cat6', true],
  ['Netzwerk', 'RJ45 Cat6a', true],
  ['Adapter', 'HDMI → DisplayPort', false],
  ['Adapter', 'DisplayPort → HDMI', false],
  ['Adapter', 'Mini-DP → HDMI', false],
  ['Adapter', 'USB-C → HDMI', false],
  ['Adapter', 'HDMI → VGA', false],
  ['Adapter', 'HDMI Kupplung', false],
  ['Adapter', 'XLR → Klinke', false],
  ['Adapter', 'Klinke 3.5 → 6.3 mm', false],
  ['Adapter', 'CEE16 → T13', false],
  ['Diverses', 'Gaffa Tape', false],
  ['Diverses', 'Kabelbinder', false],
  ['Diverses', 'Klettband', false],
  ['Diverses', 'Batterien AA', false],
  ['Diverses', 'Batterien AAA', false],
];

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtLen = (l) => (l == null || l === '' ? '' : String(l).replace('.', ',') + ' m');
const fmtDate = (ts) => new Date(ts).toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });

// gleiche IDs wie in catalog.json auf GitHub, damit Geräte dieselben Artikel erkennen
const slug = (s) => s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/→/g, '-')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
function defaultCatalog() {
  return DEFAULT_CATALOG.map(([cat, name, len]) => ({ id: 'std-' + slug(name), cat, name, len }));
}

// ---------- Zustand ----------
let state = load();

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      s.settings = Object.assign(defaultSettings(), s.settings);
      s.catalog = s.catalog || defaultCatalog();
      s.orders = s.orders || [];
      s.inventory = s.inventory || [];
      // v1.6 hatte nur den Katalog synchronisiert: { remote, pending, syncedAt }
      if (s.sync && 'pending' in s.sync) s.sync = { catalog: s.sync };
      s.sync = Object.assign({ catalog: defaultDocSync(), inventory: defaultDocSync() }, s.sync);
      return s;
    }
  } catch (e) { /* ungültige Daten: neu starten */ }
  return { settings: defaultSettings(), catalog: defaultCatalog(), orders: [], inventory: [],
    sync: { catalog: defaultDocSync(), inventory: defaultDocSync() } };
}
function defaultSettings() {
  return { vehicle: 'Ford Transit', email: 'joel.stutz@avs.ch', ejService: '', ejTemplate: '', ejKey: '', ghToken: '' };
}
function defaultDocSync() {
  // remote: letzter bekannter Stand vom Server, pending: noch nicht hochgeladene Änderungen
  return { remote: null, pending: [], syncedAt: null };
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { toast('Speichern fehlgeschlagen'); }
  renderBadge();
}

let currentCat = CATEGORIES[0];

// ---------- Navigation ----------
function show(view) {
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === 'v-' + view));
  document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('on', b.dataset.view === view));
  if (view === 'auftrag') renderOrders();
  if (view === 'inventar') renderInventory();
  if (view === 'settings') renderSettings();
  window.scrollTo(0, 0);
}
document.querySelectorAll('nav button').forEach((b) => b.addEventListener('click', () => show(b.dataset.view)));

// ---------- Erfassen ----------
function renderCats() {
  $('#cats').innerHTML = CATEGORIES.map((c) =>
    `<button class="chip ${c === currentCat ? 'on' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
  $('#cats').querySelectorAll('.chip').forEach((b) => b.addEventListener('click', () => {
    currentCat = b.dataset.cat; renderCats(); renderItems();
  }));
}

function renderItems() {
  const items = state.catalog.filter((i) => i.cat === currentCat);
  $('#items').innerHTML = items.map((i) =>
    `<button class="tile" data-id="${i.id}">${esc(i.name)}${i.len ? '<small>mit Länge</small>' : ''}</button>`).join('')
    + `<button class="tile add" id="addCustom">+ Eigener Artikel</button>`;
  $('#items').querySelectorAll('.tile[data-id]').forEach((b) => b.addEventListener('click', () => {
    openItemSheet(state.catalog.find((i) => i.id === b.dataset.id));
  }));
  $('#addCustom').addEventListener('click', () => openItemSheet(null));
}

// Bottom-Sheet: Artikel erfassen (item = Katalogeintrag oder null für eigenen Artikel)
function openItemSheet(item) {
  const custom = !item;
  let qty = 1;
  let len = null;
  let hasLen = item ? item.len : false;

  const lensHtml = () => `
    <div class="lens" id="lens">
      ${LENGTHS.map((l) => `<button class="chip ${len === l ? 'on' : ''}" data-l="${l}">${fmtLen(l)}</button>`).join('')}
    </div>
    <input type="number" id="lenCustom" inputmode="decimal" min="0" step="0.5" placeholder="Andere Länge in m"
      style="margin-top:8px" value="${len != null && !LENGTHS.includes(len) ? len : ''}">`;

  $('#sheet').innerHTML = `
    <div class="grab"></div>
    ${custom
      ? `<h3>Eigener Artikel</h3>
         <label class="f" for="cName">Bezeichnung</label>
         <input type="text" id="cName" placeholder="z.B. USB-C Kabel" autocomplete="off">
         <label class="f" for="cCat">Kategorie</label>
         <select id="cCat">${CATEGORIES.map((c) => `<option ${c === currentCat ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
         <label class="switch"><input type="checkbox" id="cHasLen"> Länge angeben</label>
         <label class="switch"><input type="checkbox" id="cKeep" checked> Dauerhaft im Katalog speichern</label>`
      : `<h3>${esc(item.name)}</h3><div class="hint">${esc(item.cat)}</div>`}
    <div id="lenWrap" ${hasLen ? '' : 'hidden'}>
      <label class="f">Länge</label>
      <div id="lenBox">${lensHtml()}</div>
    </div>
    <label class="f">Anzahl</label>
    <div class="bigqty"><button id="qMinus">−</button><span id="qVal">1</span><button id="qPlus">+</button></div>
    <label class="f" for="note">Bemerkung (optional)</label>
    <input type="text" id="note" placeholder="z.B. Stecker defekt" autocomplete="off">
    <button class="btn" id="btnAdd">Zum Auftrag hinzufügen</button>
    <button class="btn secondary" id="btnCancel">Abbrechen</button>`;

  const bindLens = () => {
    $('#lens').querySelectorAll('.chip').forEach((b) => b.addEventListener('click', () => {
      len = parseFloat(b.dataset.l);
      $('#lenBox').innerHTML = lensHtml(); bindLens();
    }));
    $('#lenCustom').addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      len = isNaN(v) ? null : v;
      $('#lens').querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', parseFloat(c.dataset.l) === len));
    });
  };
  bindLens();

  if (custom) {
    $('#cHasLen').addEventListener('change', (e) => { hasLen = e.target.checked; $('#lenWrap').hidden = !hasLen; });
  }
  $('#qMinus').addEventListener('click', () => { qty = Math.max(1, qty - 1); $('#qVal').textContent = qty; });
  $('#qPlus').addEventListener('click', () => { qty += 1; $('#qVal').textContent = qty; });
  $('#btnCancel').addEventListener('click', closeSheet);

  $('#btnAdd').addEventListener('click', () => {
    let name, cat;
    if (custom) {
      name = $('#cName').value.trim();
      cat = $('#cCat').value;
      if (!name) { $('#cName').focus(); return; }
      if ($('#cKeep').checked && !state.catalog.some((i) => i.cat === cat && i.name.toLowerCase() === name.toLowerCase())) {
        catalogOp({ type: 'add', item: { id: uid(), cat, name, len: hasLen } });
      }
    } else {
      name = item.name; cat = item.cat;
    }
    if (hasLen && len == null) {
      toast('Bitte eine Länge wählen'); return;
    }
    addOrder({ name, cat, len: hasLen ? len : null, qty, note: $('#note').value.trim() });
    closeSheet();
    if (custom) { currentCat = cat; renderCats(); renderItems(); }
    toast(`${qty}× ${name}${hasLen ? ' ' + fmtLen(len) : ''} hinzugefügt`);
  });

  openSheet();
  if (custom) setTimeout(() => { const el = $('#cName'); if (el) el.focus(); }, 250);
}

function addOrder({ name, cat, len, qty, note }) {
  // gleiche offene Position zusammenzählen
  const same = state.orders.find((o) => !o.done && o.name === name && o.len === len && (o.note || '') === note);
  if (same) same.qty += qty;
  else state.orders.push({ id: uid(), name, cat, len, qty, note, created: Date.now(), done: null });
  save();
}

// ---------- Sheet / Toast ----------
function openSheet() {
  $('#backdrop').style.display = 'block';
  void $('#sheet').offsetHeight; // Reflow, damit die Animation startet
  $('#sheet').classList.add('open');
}
function closeSheet() {
  $('#sheet').classList.remove('open');
  $('#backdrop').style.display = 'none';
}
$('#backdrop').addEventListener('click', closeSheet);

let toastTimer;
function toast(text, btnText, onBtn) {
  $('#toastText').textContent = text;
  const b = $('#toastBtn');
  b.textContent = btnText || '';
  b.hidden = !btnText;
  b.onclick = () => { $('#toast').classList.remove('show'); onBtn && onBtn(); };
  $('#toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('show'), btnText ? 5000 : 2200);
}

// ---------- Auftrag ----------
const openOrders = () => state.orders.filter((o) => !o.done);
const doneOrders = () => state.orders.filter((o) => o.done).sort((a, b) => b.done - a.done);

function renderBadge() {
  const n = openOrders().length;
  $('#badge').textContent = n ? n : '';
  const low = state.inventory.filter((e) => e.qty < e.target).length;
  $('#badgeInv').textContent = low ? low : '';
}

function orderTitle(o) {
  return `${o.name}${o.len != null ? ' · ' + fmtLen(o.len) : ''}`;
}

function renderOrders() {
  const open = openOrders();
  if (!open.length) {
    $('#openList').innerHTML = `<div class="empty"><b>Alles aufgefüllt</b>Keine offenen Artikel. Unter „Erfassen“ neues Material hinzufügen.</div>`;
    $('#openActions').innerHTML = '';
  } else {
    let html = '';
    CATEGORIES.forEach((cat) => {
      const rows = open.filter((o) => o.cat === cat);
      if (!rows.length) return;
      html += `<h2>${esc(cat)}</h2><div class="card">` + rows.map((o) => `
        <div class="row">
          <button class="check" data-done="${o.id}" aria-label="Erledigt">✓</button>
          <div class="main">
            <div class="title">${esc(orderTitle(o))}</div>
            <div class="meta">${o.note ? esc(o.note) + ' · ' : ''}erfasst ${fmtDate(o.created)}</div>
          </div>
          <div class="qty">
            <button data-minus="${o.id}">−</button><span>${o.qty}</span><button data-plus="${o.id}">+</button>
          </div>
        </div>`).join('') + `</div>`;
    });
    $('#openList').innerHTML = html;
    $('#openActions').innerHTML = `
      <button class="btn" id="btnMail">Per Mail senden</button>
      <button class="btn ok" id="btnAllDone">Alles als erledigt markieren</button>`;
    $('#btnMail').addEventListener('click', sendMail);
    $('#btnAllDone').addEventListener('click', () => {
      if (!confirm(`Alle ${open.length} Positionen als erledigt markieren?`)) return;
      const now = Date.now();
      const restocked = open.filter((o) => completeOrder(o, now)).length;
      save(); renderOrders();
      toast(restocked ? `Alles erledigt · ${restocked} im Inventar eingebucht` : 'Alles erledigt', 'Rückgängig', () => {
        open.forEach(reopenOrder);
        save(); renderOrders();
      });
    });
  }

  $('#openList').querySelectorAll('[data-done]').forEach((b) => b.addEventListener('click', () => {
    const o = state.orders.find((x) => x.id === b.dataset.done);
    const restocked = completeOrder(o, Date.now());
    save(); renderOrders();
    const e = restocked && state.inventory.find((x) => x.id === o.restocked.id);
    toast(`${orderTitle(o)} erledigt${e ? ` · Bestand ${e.qty}/${e.target}` : ''}`, 'Rückgängig', () => { reopenOrder(o); save(); renderOrders(); });
  }));
  $('#openList').querySelectorAll('[data-plus]').forEach((b) => b.addEventListener('click', () => {
    state.orders.find((x) => x.id === b.dataset.plus).qty++; save(); renderOrders();
  }));
  $('#openList').querySelectorAll('[data-minus]').forEach((b) => b.addEventListener('click', () => {
    const o = state.orders.find((x) => x.id === b.dataset.minus);
    if (o.qty > 1) { o.qty--; save(); renderOrders(); return; }
    state.orders = state.orders.filter((x) => x !== o); save(); renderOrders();
    toast(`${orderTitle(o)} entfernt`, 'Rückgängig', () => { state.orders.push(o); save(); renderOrders(); });
  }));

  renderDone();
}

function renderDone() {
  const done = doneOrders();
  if (!done.length) { $('#doneWrap').innerHTML = ''; return; }
  $('#doneWrap').innerHTML = `
    <details style="margin-top:24px">
      <summary><h2 style="margin:0 0 8px">Erledigt (${done.length}) ▾</h2></summary>
      <div class="card">${done.map((o) => `
        <div class="row done">
          <button class="check on" data-undo="${o.id}" aria-label="Wieder öffnen">✓</button>
          <div class="main">
            <div class="title">${o.qty}× ${esc(orderTitle(o))}</div>
            <div class="meta">erledigt ${fmtDate(o.done)}</div>
          </div>
        </div>`).join('')}
      </div>
      <button class="btn danger" id="btnClearDone">Erledigte löschen</button>
    </details>`;
  $('#doneWrap').querySelectorAll('[data-undo]').forEach((b) => b.addEventListener('click', () => {
    reopenOrder(state.orders.find((x) => x.id === b.dataset.undo)); save(); renderOrders();
  }));
  $('#btnClearDone').addEventListener('click', () => {
    if (!confirm('Alle erledigten Positionen endgültig löschen?')) return;
    state.orders = state.orders.filter((o) => !o.done); save(); renderOrders();
  });
}

// ---------- Inventar ----------
// Ein Eintrag pro Katalogartikel und Länge: { id, itemId, name, cat, len, qty, target }.
// Name/Kategorie werden als Rückfall mitgespeichert, angezeigt wird der aktuelle Katalogname.
const invKey = (itemId, len) => `${itemId}@${len == null ? '-' : len}`;
const invItem = (e) => state.catalog.find((i) => i.id === e.itemId) || e;
const invTitle = (e) => `${invItem(e).name}${e.len != null ? ' · ' + fmtLen(e.len) : ''}`;
let invFilter = 'alle';

function invOp(op) { docOp('inventory', op); }

// Fehlende Menge (Soll − Bestand) auf den Nachfüll-Auftrag setzen. Gibt zurück, was geändert wurde (für Rückgängig).
function reconcileOrder(e) {
  const need = e.target - e.qty;
  if (need <= 0) return null;
  const name = invItem(e).name;
  const o = state.orders.find((x) => !x.done && x.name === name && x.len === e.len && !x.note);
  if (o) {
    if (o.qty >= need) return null;
    const change = { orderId: o.id, prevQty: o.qty, added: need - o.qty };
    o.qty = need;
    return change;
  }
  const created = { id: uid(), name, cat: invItem(e).cat, len: e.len, qty: need, note: '', created: Date.now(), done: null };
  state.orders.push(created);
  return { orderId: created.id, prevQty: null, added: need };
}
function undoOrderChange(c) {
  if (!c) return;
  if (c.prevQty == null) state.orders = state.orders.filter((o) => o.id !== c.orderId);
  else { const o = state.orders.find((x) => x.id === c.orderId); if (o) o.qty = c.prevQty; }
}

// Auftrag erledigt: passende Inventar-Position um die Menge erhöhen
function completeOrder(o, when) {
  o.done = when;
  const e = state.inventory.find((x) => invItem(x).name === o.name && x.len === o.len);
  if (!e) return false;
  o.restocked = { id: e.id, d: o.qty };
  invOp({ type: 'delta', id: e.id, d: o.qty });
  return true;
}
function reopenOrder(o) {
  o.done = null;
  if (o.restocked) { invOp({ type: 'delta', id: o.restocked.id, d: -o.restocked.d }); delete o.restocked; }
}

function renderInventory() {
  const all = state.inventory;
  const low = all.filter((e) => e.qty < e.target);
  $('#invSummary').innerHTML = all.length
    ? `<b>${all.length}</b> Positionen · <b class="${low.length ? 'lowtxt' : ''}">${low.length}</b> unter Soll`
    : '';
  $('#invFilter').innerHTML = [['alle', 'Alle'], ['unter', `Unter Soll (${low.length})`]]
    .map(([k, l]) => `<button class="chip ${invFilter === k ? 'on' : ''}" data-f="${k}">${l}</button>`).join('');
  $('#invFilter').querySelectorAll('.chip').forEach((b) => b.addEventListener('click', () => { invFilter = b.dataset.f; renderInventory(); }));

  const list = invFilter === 'unter' ? low : all;
  if (!all.length) {
    $('#invList').innerHTML = `<div class="empty"><b>Noch kein Inventar</b>Füge Artikel hinzu und gib an, wie viele im Fahrzeug sind und wie viele es sein sollen.</div>`;
    return;
  }
  if (!list.length) {
    $('#invList').innerHTML = `<div class="empty"><b>Alles auf Soll</b>Kein Artikel ist unter dem Soll-Bestand.</div>`;
    return;
  }
  let html = '';
  CATEGORIES.forEach((cat) => {
    const rows = list.filter((e) => invItem(e).cat === cat)
      .sort((a, b) => invItem(a).name.localeCompare(invItem(b).name) || (a.len ?? 0) - (b.len ?? 0));
    if (!rows.length) return;
    html += `<h2>${esc(cat)}</h2><div class="card">` + rows.map((e) => `
      <div class="row">
        <button class="main rowlink" data-inv-edit="${esc(e.id)}">
          <div class="title">${esc(invTitle(e))}</div>
          <div class="meta">Soll ${e.target}${e.qty < e.target ? ` · <span class="lowtxt">${e.target - e.qty} fehlen</span>` : ''}</div>
        </button>
        <div class="stock ${e.qty < e.target ? 'low' : ''}">${e.qty}<small>/${e.target}</small></div>
        <div class="qty">
          <button data-inv-minus="${esc(e.id)}" aria-label="Entnehmen">−</button><button data-inv-plus="${esc(e.id)}" aria-label="Einlagern">+</button>
        </div>
      </div>`).join('') + `</div>`;
  });
  $('#invList').innerHTML = html;

  $('#invList').querySelectorAll('[data-inv-edit]').forEach((b) => b.addEventListener('click', () =>
    openInvSheet(state.inventory.find((e) => e.id === b.dataset.invEdit))));
  $('#invList').querySelectorAll('[data-inv-minus]').forEach((b) => b.addEventListener('click', () => takeOut(b.dataset.invMinus)));
  $('#invList').querySelectorAll('[data-inv-plus]').forEach((b) => b.addEventListener('click', () => {
    const id = b.dataset.invPlus;
    invOp({ type: 'delta', id, d: 1 });
    const e = state.inventory.find((x) => x.id === id);
    toast(`${invTitle(e)} eingelagert · Bestand ${e.qty}/${e.target}`, 'Rückgängig', () => invOp({ type: 'delta', id, d: -1 }));
  }));
}

function takeOut(id) {
  const before = state.inventory.find((x) => x.id === id);
  if (!before || before.qty <= 0) { toast('Bestand ist schon 0'); return; }
  invOp({ type: 'delta', id, d: -1 });
  const e = state.inventory.find((x) => x.id === id);
  const change = reconcileOrder(e);
  save(); renderInventory();
  toast(`${invTitle(e)} entnommen · ${e.qty}/${e.target}${change ? ` · ${change.added} auf Auftrag` : ''}`, 'Rückgängig', () => {
    undoOrderChange(change);
    invOp({ type: 'delta', id, d: 1 });
  });
}

// Bottom-Sheet: Artikel ins Inventar aufnehmen (entry = null) oder Bestand/Soll bearbeiten
function openInvSheet(entry) {
  const isNew = !entry;
  let qty = isNew ? 0 : entry.qty;
  let target = isNew ? 1 : entry.target;
  let cat = isNew ? CATEGORIES[0] : invItem(entry).cat;
  let itemId = isNew ? null : entry.itemId;
  let len = isNew ? null : entry.len;

  const itemsOf = (c) => state.catalog.filter((i) => i.cat === c);
  const current = () => state.catalog.find((i) => i.id === itemId);

  const pickerHtml = () => {
    const items = itemsOf(cat);
    if (!items.some((i) => i.id === itemId)) itemId = items[0] ? items[0].id : null;
    const it = current();
    return `
      <label class="f" for="iCat">Kategorie</label>
      <select id="iCat">${CATEGORIES.map((c) => `<option ${c === cat ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
      <label class="f" for="iItem">Artikel</label>
      <select id="iItem">${items.map((i) => `<option value="${esc(i.id)}" ${i.id === itemId ? 'selected' : ''}>${esc(i.name)}</option>`).join('')}</select>
      ${it && it.len ? `
        <label class="f">Länge</label>
        <div class="lens" id="iLens">${LENGTHS.map((l) => `<button class="chip ${len === l ? 'on' : ''}" data-l="${l}">${fmtLen(l)}</button>`).join('')}</div>
        <input type="number" id="iLenCustom" inputmode="decimal" min="0" step="0.5" placeholder="Andere Länge in m" style="margin-top:8px"
          value="${len != null && !LENGTHS.includes(len) ? len : ''}">` : ''}`;
  };

  $('#sheet').innerHTML = `
    <div class="grab"></div>
    <h3>${isNew ? 'Ins Inventar aufnehmen' : esc(invTitle(entry))}</h3>
    ${isNew ? '' : `<div class="hint">${esc(invItem(entry).cat)}</div>`}
    <div id="iPicker">${isNew ? pickerHtml() : ''}</div>
    <label class="f">Bestand im Fahrzeug</label>
    <div class="bigqty"><button id="iqMinus">−</button><span id="iqVal">${qty}</span><button id="iqPlus">+</button></div>
    <label class="f">Soll-Bestand</label>
    <div class="bigqty"><button id="itMinus">−</button><span id="itVal">${target}</span><button id="itPlus">+</button></div>
    <p class="hint" style="text-align:center">Fällt der Bestand unter das Soll, kommt die fehlende Menge auf den Nachfüll-Auftrag.</p>
    <button class="btn" id="iSave">${isNew ? 'Aufnehmen' : 'Speichern'}</button>
    ${isNew ? '' : '<button class="btn danger" id="iDel">Aus Inventar entfernen</button>'}
    <button class="btn secondary" id="iCancel">Abbrechen</button>`;

  const bindPicker = () => {
    if (!isNew) return;
    $('#iCat').addEventListener('change', (ev) => { cat = ev.target.value; len = null; $('#iPicker').innerHTML = pickerHtml(); bindPicker(); });
    $('#iItem').addEventListener('change', (ev) => { itemId = ev.target.value; len = null; $('#iPicker').innerHTML = pickerHtml(); bindPicker(); });
    if ($('#iLens')) {
      $('#iLens').querySelectorAll('.chip').forEach((b) => b.addEventListener('click', () => {
        len = parseFloat(b.dataset.l); $('#iPicker').innerHTML = pickerHtml(); bindPicker();
      }));
      $('#iLenCustom').addEventListener('input', (ev) => {
        const v = parseFloat(ev.target.value); len = isNaN(v) ? null : v;
        $('#iLens').querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', parseFloat(c.dataset.l) === len));
      });
    }
  };
  bindPicker();

  $('#iqMinus').addEventListener('click', () => { qty = Math.max(0, qty - 1); $('#iqVal').textContent = qty; });
  $('#iqPlus').addEventListener('click', () => { qty += 1; $('#iqVal').textContent = qty; });
  $('#itMinus').addEventListener('click', () => { target = Math.max(0, target - 1); $('#itVal').textContent = target; });
  $('#itPlus').addEventListener('click', () => { target += 1; $('#itVal').textContent = target; });
  $('#iCancel').addEventListener('click', closeSheet);

  $('#iSave').addEventListener('click', () => {
    let e;
    if (isNew) {
      const it = current();
      if (!it) { toast('Bitte einen Artikel wählen'); return; }
      if (it.len && len == null) { toast('Bitte eine Länge wählen'); return; }
      const useLen = it.len ? len : null;
      const id = invKey(it.id, useLen);
      if (state.inventory.some((x) => x.id === id)) { toast('Ist schon im Inventar – dort bearbeiten'); return; }
      invOp({ type: 'add', entry: { id, itemId: it.id, name: it.name, cat: it.cat, len: useLen, qty, target } });
      e = state.inventory.find((x) => x.id === id);
    } else {
      // Bestand als Differenz senden, damit gleichzeitige Entnahmen auf anderen Geräten nicht verloren gehen
      if (qty !== entry.qty) invOp({ type: 'delta', id: entry.id, d: qty - entry.qty });
      if (target !== entry.target) invOp({ type: 'update', id: entry.id, fields: { target } });
      e = state.inventory.find((x) => x.id === entry.id);
    }
    const change = e && reconcileOrder(e);
    save(); closeSheet(); renderInventory();
    toast(`${invTitle(e)} gespeichert${change ? ` · ${change.added} auf Auftrag` : ''}`);
  });

  if (!isNew) {
    $('#iDel').addEventListener('click', () => {
      if (!confirm(`„${invTitle(entry)}“ aus dem Inventar entfernen?`)) return;
      invOp({ type: 'delete', id: entry.id });
      closeSheet();
      toast(`${invTitle(entry)} entfernt`, 'Rückgängig', () => invOp({ type: 'add', entry }));
    });
  }
  openSheet();
}
$('#btnInvAdd').addEventListener('click', () => openInvSheet(null));

function applyInvOp(items, op) {
  if (op.type === 'add') return items.some((i) => i.id === op.entry.id) ? items : [...items, { ...op.entry }];
  if (op.type === 'delta') return items.map((i) => (i.id === op.id ? { ...i, qty: Math.max(0, i.qty + op.d) } : i));
  if (op.type === 'update') return items.map((i) => (i.id === op.id ? { ...i, ...op.fields } : i));
  if (op.type === 'delete') return items.filter((i) => i.id !== op.id);
  return items;
}

// ---------- Mail ----------
function buildMail() {
  const s = state.settings;
  const open = openOrders();
  const subject = `Material nachfüllen – ${s.vehicle} – ${fmtDate(Date.now())}`;
  let body = `Material nachfüllen: ${s.vehicle}\nStand: ${new Date().toLocaleString('de-CH')}\n`;
  CATEGORIES.forEach((cat) => {
    const rows = open.filter((o) => o.cat === cat);
    if (!rows.length) return;
    body += `\n${cat.toUpperCase()}\n`;
    rows.forEach((o) => {
      body += `  ${o.qty}× ${o.name}${o.len != null ? ' (' + fmtLen(o.len) + ')' : ''}${o.note ? ' – ' + o.note : ''}\n`;
    });
  });
  const total = open.reduce((n, o) => n + o.qty, 0);
  body += `\nTotal: ${open.length} Positionen, ${total} Stück\n`;
  return { subject, body };
}

async function sendMail() {
  const s = state.settings;
  const { subject, body } = buildMail();
  const auto = s.ejService && s.ejTemplate && s.ejKey;

  if (auto && navigator.onLine) {
    const btn = $('#btnMail');
    btn.disabled = true; btn.textContent = 'Wird gesendet …';
    try {
      const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: s.ejService, template_id: s.ejTemplate, user_id: s.ejKey,
          template_params: { to_email: s.email, subject, message: body },
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast('Mail gesendet ✓');
      btn.disabled = false; btn.textContent = 'Per Mail senden';
      return;
    } catch (e) {
      btn.disabled = false; btn.textContent = 'Per Mail senden';
      toast('Automatisch senden fehlgeschlagen – Mail-App wird geöffnet');
    }
  }
  location.href = `mailto:${encodeURIComponent(s.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// ---------- Einstellungen ----------
function renderSettings() {
  const s = state.settings;
  $('#setVehicle').value = s.vehicle;
  $('#setEmail').value = s.email;
  $('#ejService').value = s.ejService;
  $('#ejTemplate').value = s.ejTemplate;
  $('#ejKey').value = s.ejKey;
  $('#ghToken').value = s.ghToken;
  renderCatalogList();
  renderSyncStatus();
}

[['#setVehicle', 'vehicle'], ['#setEmail', 'email'], ['#ejService', 'ejService'], ['#ejTemplate', 'ejTemplate'], ['#ejKey', 'ejKey'], ['#ghToken', 'ghToken']]
  .forEach(([sel, key]) => $(sel).addEventListener('change', (e) => {
    state.settings[key] = e.target.value.trim();
    if (key === 'vehicle' && !state.settings.vehicle) state.settings.vehicle = 'Ford Transit';
    save(); renderHeader();
  }));

function renderCatalogList() {
  $('#catalogList').innerHTML = CATEGORIES.map((cat) => {
    const items = state.catalog.filter((i) => i.cat === cat);
    if (!items.length) return '';
    return `<div class="row" style="background:var(--bg)"><div class="main meta" style="font-weight:600">${esc(cat)}</div></div>` +
      items.map((i) => `
        <button class="row rowbtn" data-edit="${esc(i.id)}">
          <div class="main"><div class="title">${esc(i.name)}</div>${i.len ? '<div class="meta">mit Länge</div>' : ''}</div>
          <span class="chev">›</span>
        </button>`).join('');
  }).join('');
  $('#catalogList').querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => {
    openCatalogSheet(state.catalog.find((i) => i.id === b.dataset.edit));
  }));
}

// Bottom-Sheet: Katalogartikel neu anlegen (item = null) oder bearbeiten
function openCatalogSheet(item) {
  const isNew = !item;
  $('#sheet').innerHTML = `
    <div class="grab"></div>
    <h3>${isNew ? 'Neuer Katalog-Artikel' : 'Artikel bearbeiten'}</h3>
    <label class="f" for="kName">Bezeichnung</label>
    <input type="text" id="kName" autocomplete="off" value="${isNew ? '' : esc(item.name)}" placeholder="z.B. USB-C Kabel">
    <label class="f" for="kCat">Kategorie</label>
    <select id="kCat">${CATEGORIES.map((c) => `<option ${c === (isNew ? currentCat : item.cat) ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
    <label class="switch"><input type="checkbox" id="kLen" ${!isNew && item.len ? 'checked' : ''}> Länge angeben</label>
    <button class="btn" id="kSave">${isNew ? 'Hinzufügen' : 'Speichern'}</button>
    ${isNew ? '' : '<button class="btn danger" id="kDel">Aus Katalog löschen</button>'}
    <button class="btn secondary" id="kCancel">Abbrechen</button>`;

  $('#kCancel').addEventListener('click', closeSheet);
  $('#kSave').addEventListener('click', () => {
    const name = $('#kName').value.trim();
    const cat = $('#kCat').value;
    const len = $('#kLen').checked;
    if (!name) { $('#kName').focus(); return; }
    const dup = state.catalog.some((i) => i.cat === cat && i.name.toLowerCase() === name.toLowerCase() && (isNew || i.id !== item.id));
    if (dup) { toast('Diesen Artikel gibt es schon'); return; }
    if (isNew) catalogOp({ type: 'add', item: { id: uid(), cat, name, len } });
    else catalogOp({ type: 'update', id: item.id, fields: { cat, name, len } });
    closeSheet();
    toast(isNew ? `${name} hinzugefügt` : `${name} gespeichert`);
  });
  if (!isNew) {
    $('#kDel').addEventListener('click', () => {
      if (!confirm(`„${item.name}“ aus dem Katalog löschen?`)) return;
      catalogOp({ type: 'delete', id: item.id });
      closeSheet();
      toast(`${item.name} gelöscht`, 'Rückgängig', () => catalogOp({ type: 'add', item }));
    });
  }
  openSheet();
  if (isNew) setTimeout(() => { const el = $('#kName'); if (el) el.focus(); }, 250);
}

$('#btnCatNew').addEventListener('click', () => openCatalogSheet(null));
$('#btnSyncNow').addEventListener('click', () => syncCatalog(true, true));
$('#btnTokenSave').addEventListener('click', () => {
  state.settings.ghToken = $('#ghToken').value.trim();
  save();
  syncCatalog(true, true);
});

$('#btnResetCatalog').addEventListener('click', () => {
  if (!confirm('Fehlende Standard-Artikel wieder hinzufügen? Eigene Artikel bleiben erhalten.')) return;
  let n = 0;
  defaultCatalog().forEach((d) => {
    if (!state.catalog.some((i) => i.id === d.id || (i.cat === d.cat && i.name === d.name))) { catalogOp({ type: 'add', item: d }); n++; }
  });
  toast(n ? `${n} Standard-Artikel hinzugefügt` : 'Alle Standard-Artikel sind vorhanden');
});

// ---------- Synchronisation über GitHub (Katalog und Inventar) ----------
// Beide Listen liegen als JSON im Zweig "data" (kein Neubau der Webseite bei Änderungen).
// Lesen geht ohne Anmeldung; Schreiben braucht einen GitHub-Token mit Schreibrecht auf "Contents".
// Geändert wird über Operationen (add/update/delete/delta), die auf den neusten Serverstand
// angewendet werden. So gehen gleichzeitige Änderungen von Handy und PC nicht verloren.
const GH_BASE = 'https://api.github.com/repos/Troy-stute/material-app/contents/';
const GH_BRANCH = 'data';

function applyOp(items, op) {
  if (op.type === 'add') {
    if (items.some((i) => i.id === op.item.id || (i.cat === op.item.cat && i.name.toLowerCase() === op.item.name.toLowerCase()))) return items;
    return [...items, { ...op.item }];
  }
  if (op.type === 'update') return items.map((i) => (i.id === op.id ? { ...i, ...op.fields } : i));
  if (op.type === 'delete') return items.filter((i) => i.id !== op.id);
  return items;
}

const DOCS = {
  catalog: { path: 'catalog.json', label: 'Katalog', apply: applyOp, get: () => state.catalog, set: (v) => { state.catalog = v; } },
  inventory: { path: 'inventory.json', label: 'Inventar', apply: applyInvOp, get: () => state.inventory, set: (v) => { state.inventory = v; } },
};

function rebuildDoc(doc) {
  const d = DOCS[doc], s = state.sync[doc];
  const base = s.remote ? s.remote.items : d.get();
  d.set(s.pending.reduce(d.apply, base.map((i) => ({ ...i }))));
}

function renderAllLists() {
  renderItems(); renderCatalogList(); renderSyncStatus();
  if ($('#v-inventar').classList.contains('active')) renderInventory();
  if ($('#v-auftrag').classList.contains('active')) renderOrders();
}

function docOp(doc, op) {
  const d = DOCS[doc];
  d.set(d.apply(d.get(), op));
  state.sync[doc].pending.push(op);
  save();
  renderAllLists();
  scheduleSync();
}
const catalogOp = (op) => docOp('catalog', op);

let syncTimer, syncBusy = false, lastPull = 0, syncError = '';
function scheduleSync() {
  clearTimeout(syncTimer);
  if (state.settings.ghToken) syncTimer = setTimeout(() => syncCatalog(true), 1500);
}

const b64encode = (str) => btoa(String.fromCharCode(...new TextEncoder().encode(str)));
const b64decode = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), (c) => c.charCodeAt(0)));

function ghHeaders() {
  const h = { Accept: 'application/vnd.github+json' };
  if (state.settings.ghToken) h.Authorization = 'Bearer ' + state.settings.ghToken;
  return h;
}

async function fetchRemote(doc) {
  const res = await fetch(`${GH_BASE}${DOCS[doc].path}?ref=${GH_BRANCH}&t=${Date.now()}`, { headers: ghHeaders(), cache: 'no-store' });
  if (res.status === 401) throw new Error('Token ungültig oder abgelaufen');
  if (res.status === 404 && doc !== 'catalog') return { sha: null, items: [] }; // Datei wird beim ersten Speichern angelegt
  if (!res.ok) throw new Error('Server antwortet nicht (' + res.status + ')');
  const json = await res.json();
  const data = JSON.parse(b64decode(json.content));
  return { sha: json.sha, items: data.items || [] };
}

async function pushRemote(doc, items, sha) {
  const body = {
    message: `${DOCS[doc].label} aktualisiert (${items.length} Einträge)`,
    content: b64encode(JSON.stringify({ updated: Date.now(), items }, null, 2) + '\n'),
    branch: GH_BRANCH,
  };
  if (sha) body.sha = sha;
  const res = await fetch(GH_BASE + DOCS[doc].path, { method: 'PUT', headers: { ...ghHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (res.status === 409 || res.status === 422) return false; // zwischenzeitlich geändert: neu versuchen
  if (res.status === 401) throw new Error('Token ungültig oder abgelaufen');
  if (res.status === 403 || res.status === 404) throw new Error('Token hat kein Schreibrecht');
  if (!res.ok) throw new Error('Speichern fehlgeschlagen (' + res.status + ')');
  return true;
}

async function syncDoc(doc) {
  const s = state.sync[doc];
  for (let attempt = 0; attempt < 3; attempt++) {
    const remote = await fetchRemote(doc);

    // Erster Katalog-Abgleich: eigene Artikel dieses Geräts, die auf dem Server fehlen, als Änderung übernehmen
    if (doc === 'catalog' && !s.syncedAt) {
      const known = new Set(remote.items.map((i) => i.cat + '|' + i.name.toLowerCase()));
      const std = new Set(defaultCatalog().map((i) => i.cat + '|' + i.name.toLowerCase()));
      state.catalog.forEach((i) => {
        const k = i.cat + '|' + i.name.toLowerCase();
        if (!known.has(k) && !std.has(k)) s.pending.push({ type: 'add', item: i });
      });
    }

    const pending = s.pending.slice();
    if (pending.length && state.settings.ghToken) {
      const merged = pending.reduce(DOCS[doc].apply, remote.items);
      if (!(await pushRemote(doc, merged, remote.sha))) continue;
      s.pending = s.pending.slice(pending.length); // währenddessen neu Erfasstes bleibt offen
      s.remote = { items: merged };
    } else {
      s.remote = { items: remote.items };
    }
    s.syncedAt = Date.now();
    return;
  }
  throw new Error('Konflikt beim Speichern – bitte nochmals versuchen');
}

async function syncCatalog(force, manual) {
  if (!navigator.onLine) { renderSyncStatus(); if (manual) toast('Kein Internet – später nochmals versuchen'); return; }
  if (syncBusy) { if (manual) toast('Synchronisation läuft bereits …'); return; }
  if (!force && Date.now() - lastPull < 30000) return;
  syncBusy = true; renderSyncStatus();
  const btns = ['#btnSyncNow', '#btnTokenSave'].map((s) => $(s));
  if (manual) btns.forEach((b) => { b.disabled = true; b.dataset.label = b.dataset.label || b.textContent; b.textContent = 'Synchronisiere …'; });
  // nie länger als 20 s hängen bleiben
  const timeout = setTimeout(() => {
    if (!syncBusy) return;
    syncBusy = false; syncError = 'Zeitüberschreitung – bitte nochmals versuchen'; renderSyncStatus();
    if (manual) { btns.forEach((b) => { b.disabled = false; b.textContent = b.dataset.label; }); toast('⚠ ' + syncError); }
  }, 20000);

  const before = new Map(state.inventory.map((e) => [e.id, e.qty + '/' + e.target]));
  try {
    await syncDoc('catalog');
    await syncDoc('inventory');
    lastPull = Date.now();
    syncError = '';
  } catch (e) {
    syncError = e.message || 'Unbekannter Fehler';
  }
  clearTimeout(timeout);
  syncBusy = false;
  rebuildDoc('catalog');
  rebuildDoc('inventory');
  // Auf anderen Geräten geänderte Bestände: fehlende Mengen auch hier auf den Nachfüll-Auftrag setzen
  state.inventory.forEach((e) => { if (before.get(e.id) !== e.qty + '/' + e.target) reconcileOrder(e); });
  save();
  renderAllLists();
  if (manual) {
    btns.forEach((b) => { b.disabled = false; b.textContent = b.dataset.label; });
    const pend = pendingCount();
    if (syncError) toast('⚠ ' + syncError);
    else if (pend && !state.settings.ghToken) toast('Geladen – eigene Änderungen nur auf diesem Gerät (kein Token)');
    else toast(state.settings.ghToken ? '✓ Katalog und Inventar synchronisiert' : '✓ Katalog und Inventar geladen (nur lesen)');
  }
}

const pendingCount = () => state.sync.catalog.pending.length + state.sync.inventory.pending.length;

function renderSyncStatus() {
  const el = $('#syncStatus');
  if (!el) return;
  const n = pendingCount();
  const times = [state.sync.catalog.syncedAt, state.sync.inventory.syncedAt];
  const syncedAt = times.every(Boolean) ? Math.min(...times) : null;
  let text;
  if (syncBusy) text = '⟳ Synchronisiere …';
  else if (syncError) text = '⚠ ' + syncError;
  else if (!navigator.onLine) text = 'Offline – wird synchronisiert, sobald Internet da ist';
  else if (n && !state.settings.ghToken) text = `${n} Änderung${n > 1 ? 'en' : ''} nur auf diesem Gerät (kein Token hinterlegt)`;
  else if (n) text = `${n} Änderung${n > 1 ? 'en' : ''} noch nicht hochgeladen`;
  else if (syncedAt) text = `✓ Aktuell · ${new Date(syncedAt).toLocaleString('de-CH', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`
    + (state.settings.ghToken ? '' : ' · nur lesen');
  else text = 'Noch nicht synchronisiert';
  el.textContent = text;
  el.style.color = syncError ? 'var(--danger)' : '';
  const dot = $('#syncDot');
  if (dot) dot.className = 'syncdot ' + (syncBusy ? 'busy' : syncError ? 'err' : n || !navigator.onLine ? 'warn' : syncedAt ? 'ok' : '');
}

window.addEventListener('online', () => syncCatalog(true));
window.addEventListener('offline', renderSyncStatus);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncCatalog(false); });

$('#btnExport').addEventListener('click', () => {
  const copy = JSON.parse(JSON.stringify(state));
  copy.settings.ghToken = ''; // Token nie in Sicherungsdateien
  const blob = new Blob([JSON.stringify(copy, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `material-transit-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$('#btnImport').addEventListener('click', () => $('#importFile').click());
$('#importFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.catalog) || !Array.isArray(data.orders)) throw new Error();
    if (!confirm('Aktuelle Daten durch die Sicherung ersetzen?')) return;
    data.settings = Object.assign({}, data.settings, { ghToken: state.settings.ghToken });
    localStorage.setItem(STORE_KEY, JSON.stringify(data));
    state = load(); save(); init(); toast('Sicherung importiert');
  } catch (err) {
    toast('Ungültige Sicherungsdatei');
  }
  e.target.value = '';
});

// ---------- PIN-Sperre (Sichtschutz, kein echter Schutz: der Code ist öffentlich) ----------
const PIN_HASH = '236177825d852dc8a535f6171ac4dd0409e074966cc48ffb423e068bcae956ab';
const PIN_LEN = 4;
const UNLOCK_KEY = 'material-transit-unlock';
let pinInput = '';

async function hashPin(pin) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('material-transit:' + pin));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function isUnlocked() {
  try {
    return sessionStorage.getItem(UNLOCK_KEY) === PIN_HASH || localStorage.getItem(UNLOCK_KEY) === PIN_HASH;
  } catch (e) { return false; }
}
function lock() {
  try { sessionStorage.removeItem(UNLOCK_KEY); localStorage.removeItem(UNLOCK_KEY); } catch (e) { /* egal */ }
  pinInput = '';
  renderDots();
  $('#lockErr').textContent = '';
  $('#lock').classList.remove('hidden');
}
function renderDots() {
  $('#lockDots').innerHTML = Array.from({ length: PIN_LEN }, (_, i) => `<span class="${i < pinInput.length ? 'on' : ''}"></span>`).join('');
}
async function pressKey(k) {
  if (k === 'del') { pinInput = pinInput.slice(0, -1); renderDots(); return; }
  if (pinInput.length >= PIN_LEN) return;
  pinInput += k;
  $('#lockErr').textContent = '';
  renderDots();
  if (pinInput.length < PIN_LEN) return;

  let ok;
  try {
    ok = await hashPin(pinInput) === PIN_HASH;
  } catch (err) {
    $('#lockErr').textContent = 'Prüfung nicht möglich – bitte in Chrome öffnen';
    pinInput = ''; renderDots();
    return;
  }
  if (ok) {
    try {
      sessionStorage.setItem(UNLOCK_KEY, PIN_HASH);
      if ($('#lockRemember').checked) localStorage.setItem(UNLOCK_KEY, PIN_HASH);
    } catch (err) { /* ohne Speicher: nur bis zum Neuladen entsperrt */ }
    setTimeout(() => { $('#lock').classList.add('hidden'); pinInput = ''; renderDots(); }, 120);
  } else {
    $('#lockErr').textContent = 'Falsche PIN';
    const d = $('#lockDots');
    d.classList.remove('shake'); void d.offsetWidth; d.classList.add('shake');
    setTimeout(() => { pinInput = ''; renderDots(); }, 350);
  }
}
$('#keypad').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => pressKey(b.dataset.k)));
document.addEventListener('keydown', (e) => {
  if ($('#lock').classList.contains('hidden')) return;
  if (/^[0-9]$/.test(e.key)) pressKey(e.key);
  else if (e.key === 'Backspace') pressKey('del');
});
$('#btnLock').addEventListener('click', lock);
renderDots();
if (isUnlocked()) $('#lock').classList.add('hidden');

function renderHeader() { $('#hdrVehicle').textContent = state.settings.vehicle; }

function init() {
  renderHeader(); renderCats(); renderItems(); renderBadge();
  if ($('#v-auftrag').classList.contains('active')) renderOrders();
  if ($('#v-settings').classList.contains('active')) renderSettings();
}
init();
syncCatalog(true);

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
