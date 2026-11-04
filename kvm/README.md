# KVM-Matrix (IHSE Draco tera)

Einzelne Arbeitsplätze (CON) der Draco tera Matrix vom Handy aus auf Rechner (CPU) schalten.
Das Handy muss im selben Netzwerk sein wie ein PC, auf dem die **Brücke** läuft.

```
Handy (Browser)  ──HTTP──▶  Brücke (PC, node kvm/bridge.js)  ──TCP──▶  Draco tera Matrix
```

Warum eine Brücke? Ein Browser kann keine direkte TCP-Verbindung zur Matrix öffnen.
Die Brücke holt die **Namen** der Arbeitsplätze und Rechner aus der Matrix, hält die Schaltungen aktuell
und stellt beides dem Handy zur Verfügung.

## Starten

Nur Node.js nötig, keine weiteren Pakete.

```
node kvm/bridge.js --sim                          # Simulator zum Ausprobieren
node kvm/bridge.js --matrix 192.168.1.10          # echte Matrix (IP der Matrix)
node kvm/bridge.js --matrix 192.168.1.10 --pin 4711 --port 8090
```

Die Brücke zeigt beim Start die Adresse an, z. B. `http://192.168.1.50:8090/`. Diese auf dem Handy öffnen
und «Zum Startbildschirm hinzufügen». In der Material-App führt die Kachel **KVM-Matrix** ebenfalls dorthin
(beim ersten Mal wird die Adresse abgefragt; lange drücken zum Ändern).

| Option          | Bedeutung                                              | Standard |
|-----------------|--------------------------------------------------------|----------|
| `--matrix`      | IP-Adresse der Draco tera                               | –        |
| `--matrix-port` | TCP-Port der API auf der Matrix                         | 5555     |
| `--port`        | Port, auf dem die Brücke für die Handys erreichbar ist  | 8090     |
| `--pin`         | PIN, ohne die nicht geschaltet werden kann              | keine    |
| `--sim`         | Simulator statt Matrix                                  | –        |

## Bedienung

- **Arbeitsplätze**: zeigt jeden CON mit dem aktuell aufgeschalteten Rechner. Antippen → Rechner wählen.
  Modus: *Vollzugriff*, *Nur Video* oder *Privat*. *Trennen* löst die Verbindung.
- **Rechner**: zeigt, welche Arbeitsplätze einen Rechner gerade benutzen.
- ☆ markiert Favoriten (z. B. den eigenen Platz). Sie stehen dann oben.
- ⟳ lädt die Namen neu aus der Matrix (z. B. nachdem sie im Tera Tool umbenannt wurden).
- Änderungen von anderen Handys oder direkt an der Matrix erscheinen automatisch (alle 3 s abgefragt).

## API der Brücke

| Methode | Pfad           | Inhalt |
|---------|----------------|--------|
| GET     | `/api/state`   | `{ connected, error, cons:[{id,name,online}], cpus:[…], routes:{ conId:{cpu,mode} } }` |
| GET     | `/api/events`  | Live-Updates (Server-Sent Events), gleicher Inhalt wie `/api/state` |
| POST    | `/api/connect` | `{ con, cpu, mode }` schalten · `{ con, cpu:null }` trennen |
| POST    | `/api/refresh` | Namen und Schaltungen neu aus der Matrix laden |

Mit PIN: Header `X-KVM-Pin: <pin>` mitschicken.

## Offener Punkt: tera-Protokoll

IHSE veröffentlicht die Beschreibung der Draco tera API nicht; sie ist auf Anfrage bei IHSE erhältlich.
Sobald sie vorliegt, werden nur in [`drivers/tera-protocol.js`](drivers/tera-protocol.js) vier Funktionen
ausgefüllt (CON-Namen lesen, CPU-Namen lesen, Schaltungen lesen, schalten). TCP-Verbindung, Neuverbinden,
Abfrage und App sind fertig. Bis dahin zeigt die App bei `--matrix` einen entsprechenden Hinweis.

Hinweis zum Netzwerk: Die Brücke ist ohne `--pin` für jedes Gerät im Netz bedienbar. In geteilten Netzen
daher eine PIN setzen.
