'use strict';
// Treiber für die IHSE Draco tera Matrix über TCP.
// Verbindung, Neuverbinden und Abfrage sind hier; die eigentlichen Befehle stehen in tera-protocol.js.
const net = require('net');
const { BaseDriver } = require('./base');
const proto = require('./tera-protocol');

const POLL_MS = 3000;
const TIMEOUT_MS = 4000;

class TeraDriver extends BaseDriver {
  constructor({ host, port }) {
    super(`Draco tera ${host}`);
    this.host = host;
    this.port = port || proto.defaultPort;
    this.sock = null;
    this.queue = Promise.resolve(); // Anfragen nacheinander, nie parallel
    this.pending = null;
    this.namesLoaded = false;
  }

  start() { this.open(); }

  open() {
    clearTimeout(this.retryTimer);
    const sock = net.createConnection({ host: this.host, port: this.port });
    sock.setNoDelay(true);
    sock.setKeepAlive(true, 10000);
    sock.on('connect', () => {
      this.sock = sock;
      this.connected = true;
      this.error = null;
      this.namesLoaded = false;
      console.log(`Verbunden mit Matrix ${this.host}:${this.port}`);
      this.poll();
    });
    sock.on('data', (chunk) => this.onData(chunk));
    sock.on('error', (e) => { this.error = `Matrix nicht erreichbar: ${e.message}`; });
    sock.on('close', () => {
      if (this.sock === sock) this.sock = null;
      if (this.pending) this.pending.reject(new Error('Verbindung getrennt'));
      clearTimeout(this.pollTimer);
      this.connected = false;
      this.changed();
      this.retryTimer = setTimeout(() => this.open(), 3000);
    });
  }

  onData(chunk) {
    if (!this.pending) return; // unaufgeforderte Meldungen ignorieren
    this.pending.buf = Buffer.concat([this.pending.buf, chunk]);
    if (this.pending.isComplete(this.pending.buf)) this.pending.resolve(this.pending.buf);
  }

  // io.request für tera-protocol.js
  request(buffer, isComplete) {
    const run = () => new Promise((resolve, reject) => {
      if (!this.sock) return reject(new Error('Keine Verbindung zur Matrix'));
      const timer = setTimeout(() => done(reject, new Error('Matrix antwortet nicht')), TIMEOUT_MS);
      const done = (fn, v) => { clearTimeout(timer); this.pending = null; fn(v); };
      this.pending = { buf: Buffer.alloc(0), isComplete,
        resolve: (v) => done(resolve, v), reject: (e) => done(reject, e) };
      this.sock.write(buffer);
    });
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => {});
    return p;
  }

  get io() { return { request: (b, c) => this.request(b, c) }; }

  async poll() {
    clearTimeout(this.pollTimer);
    try {
      await this.refresh(!this.namesLoaded);
    } catch (e) {
      this.error = e.message;
      this.changed();
    }
    if (this.sock) this.pollTimer = setTimeout(() => this.poll(), proto.ready ? POLL_MS : 30000);
  }

  // Namen nur beim Start bzw. auf Knopfdruck neu laden, Schaltungen bei jeder Abfrage
  async refresh(withNames = true) {
    if (withNames) {
      this.cons = await proto.readCons(this.io);
      this.cpus = await proto.readCpus(this.io);
      this.namesLoaded = true;
    }
    const routes = await proto.readRoutes(this.io);
    const changed = withNames || JSON.stringify(routes) !== JSON.stringify(this.routes);
    this.routes = routes;
    this.error = null;
    if (changed) this.changed();
  }

  async connect(con, cpu, mode) {
    this.checkIds(con, cpu);
    await proto.connect(this.io, con, cpu, mode);
    await this.refresh(false);
  }

  async disconnect(con) {
    this.checkIds(con, null);
    await proto.connect(this.io, con, null, 'full');
    await this.refresh(false);
  }
}

module.exports = { create: (opts) => new TeraDriver(opts) };
