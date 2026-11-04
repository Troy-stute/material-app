'use strict';
// IHSE Draco tera – Protokoll-Befehle
// =====================================
// Die Draco tera API ist nicht öffentlich dokumentiert; IHSE gibt die Beschreibung
// («Draco tera API», Schaltbefehle über TCP) auf Anfrage heraus: support@ihse.de
//
// Sobald die Doku vorliegt, werden NUR in dieser Datei die vier Funktionen ausgefüllt.
// Der Rest (TCP-Verbindung, Neuverbinden, Abfrage-Intervall, App, Live-Updates) ist fertig.
//
// Jede Funktion bekommt `io` mit:
//   io.request(buffer, isComplete) -> Promise<Buffer>
//       schickt `buffer` an die Matrix und sammelt die Antwort, bis isComplete(buf) true liefert
//
// Begriffe der Matrix:  CON = Arbeitsplatz/Konsole,  CPU = angeschlossener Rechner/Quelle.

const NOT_READY = 'tera-Protokoll noch nicht eingetragen (kvm/drivers/tera-protocol.js). '
  + 'Die API-Beschreibung gibt es bei IHSE auf Anfrage.';

module.exports = {
  // Standard-Port der Matrix für die API. Laut IHSE-Doku prüfen und bei Bedarf mit --matrix-port ändern.
  defaultPort: 5555,

  // true, sobald die Befehle unten eingetragen sind
  ready: false,

  /** Liste der CON-Geräte mit Namen: Promise<[{ id, name, online }]> */
  async readCons(io) { throw new Error(NOT_READY); },

  /** Liste der CPU-Geräte mit Namen: Promise<[{ id, name, online }]> */
  async readCpus(io) { throw new Error(NOT_READY); },

  /** Aktuelle Schaltungen: Promise<{ [conId]: { cpu, mode } }>, mode = 'full' | 'video' | 'private' */
  async readRoutes(io) { throw new Error(NOT_READY); },

  /** CON auf CPU schalten (cpu = null heisst trennen) */
  async connect(io, con, cpu, mode) { throw new Error(NOT_READY); },
};
