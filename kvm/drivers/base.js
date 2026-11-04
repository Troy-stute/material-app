'use strict';
// Gemeinsamer Zustand aller Treiber.
// cons:   Arbeitsplätze / Konsolen   [{ id, name, online }]
// cpus:   Rechner / Quellen          [{ id, name, online }]
// routes: { [conId]: { cpu, mode } } mode = 'full' | 'video' | 'private'
const { EventEmitter } = require('events');

class BaseDriver extends EventEmitter {
  constructor(name) {
    super();
    this.name = name;
    this.connected = false;
    this.error = null;
    this.cons = [];
    this.cpus = [];
    this.routes = {};
    this.updatedAt = 0;
  }

  snapshot() {
    return { driver: this.name, connected: this.connected, error: this.error, updatedAt: this.updatedAt,
      cons: this.cons, cpus: this.cpus, routes: this.routes };
  }

  changed() { this.updatedAt = Date.now(); this.emit('change'); }

  checkIds(con, cpu) {
    if (!this.cons.some((c) => c.id === con)) throw new Error(`Arbeitsplatz ${con} unbekannt`);
    if (cpu != null && !this.cpus.some((c) => c.id === cpu)) throw new Error(`Rechner ${cpu} unbekannt`);
  }
}

module.exports = { BaseDriver };
