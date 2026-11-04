'use strict';
// Simulator: verhält sich wie eine kleine Matrix, damit man die App ohne Gerät ausprobieren kann.
const { BaseDriver } = require('./base');

const CONS = ['Regie Platz 1', 'Regie Platz 2', 'Bildmischer', 'Ton', 'Licht', 'Produktion', 'Technik Rack', 'Backstage'];
const CPUS = ['Playout 1', 'Playout 2', 'Grafik', 'Media Server A', 'Media Server B', 'Lichtpult PC',
  'Ton Rechner', 'Streaming', 'Office PC', 'Teleprompter', 'Ersatz 1', 'Ersatz 2'];

class SimDriver extends BaseDriver {
  constructor() { super('Simulator'); }

  start() {
    this.cons = CONS.map((name, i) => ({ id: 3001 + i, name, online: true }));
    this.cpus = CPUS.map((name, i) => ({ id: 1001 + i, name, online: i !== CPUS.length - 1 }));
    this.routes = { 3001: { cpu: 1001, mode: 'full' }, 3002: { cpu: 1003, mode: 'full' }, 3003: { cpu: 1001, mode: 'video' } };
    this.connected = true;
    this.changed();
  }

  async refresh() { this.changed(); }

  async connect(con, cpu, mode) {
    this.checkIds(con, cpu);
    // wie bei der echten Matrix: nur ein Arbeitsplatz hat Vollzugriff auf einen Rechner
    if (mode !== 'video') {
      for (const [c, r] of Object.entries(this.routes)) {
        if (Number(c) !== con && r.cpu === cpu && r.mode !== 'video') r.mode = 'video';
      }
    }
    this.routes[con] = { cpu, mode };
    this.changed();
  }

  async disconnect(con) {
    this.checkIds(con, null);
    delete this.routes[con];
    this.changed();
  }
}

module.exports = { create: () => new SimDriver() };
