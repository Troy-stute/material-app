#!/usr/bin/env node
// KVM-Brücke: verbindet Handys im Netzwerk mit der IHSE Draco tera Matrix.
//
//   node kvm/bridge.js --sim                        (Simulator, ohne Matrix)
//   node kvm/bridge.js --matrix 192.168.1.10        (echte Matrix)
//
// Optionen: --port 8090   --pin 1234   --matrix-port 5555
// Danach auf dem Handy http://<IP-dieses-PCs>:8090/ öffnen.
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const args = parseArgs(process.argv.slice(2));
const PORT = Number(args.port || process.env.KVM_PORT || 8090);
const PIN = String(args.pin || process.env.KVM_PIN || '');
const PUBLIC = path.join(__dirname, 'public');

const driver = args.sim || !args.matrix
  ? require('./drivers/sim').create()
  : require('./drivers/tera').create({ host: args.matrix, port: Number(args['matrix-port'] || 5555) });

if (!args.sim && !args.matrix) console.log('Keine --matrix angegeben: Simulator wird verwendet.');

// ---------- Live-Updates (Server-Sent Events) ----------
const clients = new Set();
function broadcast() {
  const data = `data: ${JSON.stringify(driver.snapshot())}\n\n`;
  for (const res of clients) res.write(data);
}
driver.on('change', broadcast);

// ---------- HTTP ----------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.css': 'text/css' };

function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 1e5) req.destroy(); });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { reject(new Error('Ungültiges JSON')); } });
    req.on('error', reject);
  });
}

function authorized(req, url) {
  if (!PIN) return true;
  return req.headers['x-kvm-pin'] === PIN || url.searchParams.get('pin') === PIN;
}

async function api(req, res, url) {
  if (url.pathname === '/api/info') return send(res, 200, { pinRequired: !!PIN, driver: driver.name });
  if (!authorized(req, url)) return send(res, 401, { error: 'PIN falsch oder fehlt' });

  if (req.method === 'GET' && url.pathname === '/api/state') return send(res, 200, driver.snapshot());

  if (req.method === 'GET' && url.pathname === '/api/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    res.write(`data: ${JSON.stringify(driver.snapshot())}\n\n`);
    clients.add(res);
    const ping = setInterval(() => res.write(': ping\n\n'), 25000);
    req.on('close', () => { clearInterval(ping); clients.delete(res); });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/connect') {
    const b = await readBody(req);
    if (b.con == null) return send(res, 400, { error: '«con» fehlt' });
    const mode = b.mode || 'full';
    if (!['full', 'video', 'private'].includes(mode)) return send(res, 400, { error: 'Unbekannter Modus' });
    if (b.cpu == null) await driver.disconnect(Number(b.con));
    else await driver.connect(Number(b.con), Number(b.cpu), mode);
    return send(res, 200, driver.snapshot());
  }

  if (req.method === 'POST' && url.pathname === '/api/refresh') {
    await driver.refresh();
    return send(res, 200, driver.snapshot());
  }

  send(res, 404, { error: 'Unbekannter Pfad' });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    let p = decodeURIComponent(url.pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(PUBLIC, path.normalize(p));
    if (!file.startsWith(PUBLIC)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404).end('Nicht gefunden'); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(data);
    });
  } catch (e) {
    send(res, 500, { error: e.message });
  }
}).listen(PORT, () => {
  console.log(`KVM-Brücke (${driver.name}) läuft. Auf dem Handy öffnen:`);
  for (const ip of lanAddresses()) console.log(`  http://${ip}:${PORT}/`);
  if (PIN) console.log('  PIN ist aktiv.');
  driver.start();
});

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  }
  return out.length ? out : ['localhost'];
}

function parseArgs(list) {
  const out = {};
  for (let i = 0; i < list.length; i++) {
    if (!list[i].startsWith('--')) continue;
    const key = list[i].slice(2);
    const next = list[i + 1];
    if (next == null || next.startsWith('--')) out[key] = true;
    else { out[key] = next; i++; }
  }
  return out;
}
