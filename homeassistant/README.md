# Bunker – Home Assistant auf dem Raspberry Pi

Zentrale Steuerung für Technikraum und Vorraum: Licht, Lüftung, Kühlung,
3D-Drucker, Filamentschrank, Musik und Sicherheit. Von unterwegs per Handy,
vor Ort über das Wanddisplay im Vorraum.

```
homeassistant/
├── config/                    → kommt auf den Pi nach /config
│   ├── configuration.yaml
│   ├── packages/              ein Thema pro Datei
│   │   ├── bunker_basis.yaml  Ankommen, Verlassen, Nachrichten ans Handy
│   │   ├── licht.yaml         Lichtmodi Arbeit / Gemütlich / Party / Aus
│   │   ├── lueftung.yaml      Abluft Drucker + Lötrauch, Luftqualität
│   │   ├── drucker.yaml       Druckstatus, "fertig"-Meldung, Abschalten
│   │   ├── filamentschrank.yaml  Feuchte pro Fach, Entfeuchter
│   │   ├── kuehlung.yaml      Kühlschrank, Rack, Raumtemperatur
│   │   ├── musik.yaml         Music Assistant, zwei Zonen
│   │   └── sicherheit.yaml    Wasser, Rauch, Tür
│   └── dashboards/bunker.yaml Dashboard "Bunker"
└── esphome/
    ├── abluft.yaml            ESP32 für die zwei Abluft-Lüfter + Luftsensor
    └── secrets.yaml.example
```

## Was passiert automatisch

| Wann | Was |
|---|---|
| Tür geht auf oder jemand ist im Vorraum, und alles war aus | Lichtmodus **Gemütlich**, Neon-Schild an, auf Wunsch startet die Playlist |
| Jemand im Technikraum und Modus **Arbeit** | Arbeitslicht an, 10 Minuten nach dem Gehen wieder aus |
| 15 Minuten niemand da | Licht aus, Musik aus, Bunker „abgeschlossen“. Läuft noch ein Druck, kommt eine Nachricht |
| Ein Drucker druckt | Abluft Drucker auf 60 %, danach 10 Minuten Nachlauf |
| Schlechte Luft (VOC über 250 oder Feinstaub über 35 µg/m³) | Abluft auf 100 %, nach 5 Minuten Nachricht |
| Lötstation heizt | Lötrauch-Absaugung an, 5 Minuten nach dem Ausschalten aus |
| Druck fertig | Nachricht aufs Handy. Ist niemand da, nach 30 Minuten Steckdose aus |
| Filamentfach über 30 % Feuchte | Entfeuchter an, unter 20 % wieder aus. Über 40 % für 30 Minuten gibt es eine Nachricht |
| Kühlschrank über 8 °C, Rack über 40 °C, Raum über 32 °C | Nachricht |
| Lichtmodus **Party** | Bunte Effekte, Musik in beiden Räumen |
| Wasser, Rauch oder Hitze | Kritische Nachricht (auch im Lautlos-Modus). Bei Rauch oder Hitze: Drucker stromlos, Abluft voll |
| Tür geht auf, obwohl abgeschlossen und keiner von euch da ist | Kritische Nachricht mit Kamerabild |

Jede Automatik lässt sich im Dashboard abschalten: Licht-Automatik,
Lüftungs-Automatik und Musik beim Ankommen. Die Schwellen für den
Entfeuchter stellt ihr direkt im Dashboard ein.

> **Sicherheit:** Not-Aus, Rauch- und Wärmemelder bleiben fest verdrahtet und
> funktionieren ohne Home Assistant. HA meldet nur zusätzlich und schaltet
> nach. Fällt der Pi aus, muss trotzdem alles sicher sein.

## Einkaufsliste

Die Preise sind Richtwerte (Stand Herbst 2026) und schwanken je nach Händler.

**Zentrale**

| Teil | Anzahl | ca. € |
|---|---|---|
| Raspberry Pi 5, 8 GB | 1 | 90 |
| Offizielles Netzteil 27 W | 1 | 13 |
| NVMe-Gehäuse oder -Aufsatz (z. B. Argon ONE V3, Pimoroni NVMe Base) | 1 | 25–50 |
| NVMe-SSD 256 GB | 1 | 30 |
| Zigbee-Stick: Home Assistant Connect ZBT-1/ZBT-2 oder Sonoff ZBDongle-E | 1 | 30–50 |
| USB-Verlängerung 50 cm (Zigbee-Stick weg vom Pi und der SSD, sonst stört es) | 1 | 5 |

**Licht**

| Teil | Anzahl | ca. € |
|---|---|---|
| Shelly 2PM Gen3 oder Shelly Dimmer Gen3 für die Deckenlichter (Elektriker!) | 2 | 30 je |
| WLED-Controller ESP32 (z. B. Athom, QuinLED Dig-Uno) für RGB-Boden und Neon-Schild | 2 | 25–35 je |
| Zigbee-Leuchtmittel oder Controller für Hex-Lampe und Arbeitslicht | 2 | 15–25 je |

**Lüftung** (siehe Verdrahtung unten)

| Teil | Anzahl | ca. € |
|---|---|---|
| ESP32-Dev-Board | 1 | 8 |
| Sensirion SEN55 (Feinstaub, VOC, Temperatur, Feuchte) | 1 | 30–40 |
| 12-V-PWM-Lüfter für die Schläuche (z. B. 120 mm, 4-Pin) | 2 | 15–25 je |
| Logic-Level-MOSFET-Modul (z. B. IRLZ44N) | 2 | 3 je |
| Netzteil 12 V / 3 A + Step-down auf 5 V für den ESP32 | 1 | 20 |

**Drucker, Filament, Kühlung**

| Teil | Anzahl | ca. € |
|---|---|---|
| Zigbee-Steckdose **mit Strommessung** (Drucker 1, Drucker 2, Lötstation, Entfeuchter) | 4 | 12–15 je |
| Zigbee-Temperatur/Feuchte-Sensor (z. B. Sonoff SNZB-02D): 4 × Filamentfach, Raum, Kühlschrank, Rack | 7 | 12–15 je |

**Präsenz, Sicherheit, Kameras**

| Teil | Anzahl | ca. € |
|---|---|---|
| mmWave-Präsenzsensor (z. B. Apollo MSR-2, Everything Presence Lite) für Vorraum und Technikraum | 2 | 40–50 je |
| Zigbee-Türkontakt | 1–2 | 10 je |
| Zigbee-Wassermelder | 1 | 15 |
| PoE-Kamera lokal ohne Cloud (z. B. Reolink) + kleiner PoE-Switch | 2 + 1 | 50 je + 40 |

**Musik und Bedienung**

| Teil | Anzahl | ca. € |
|---|---|---|
| Audio-Streamer für die PA im Vorraum (z. B. WiiM Mini/Pro) | 1 | 90–150 |
| Lautsprecher Zone 2 Technikraum (WLAN oder zweiter Streamer + Aktivboxen) | 1 | 100–200 |
| Tablet als Wanddisplay im Vorraum, App „Fully Kiosk Browser“ | 1 | 120–200 |

Grob **900–1.300 €** für alles. Ihr könnt aber in Stufen kaufen. Ein
sinnvoller Start (ca. 300 €): Pi, SSD, Zigbee-Stick, 4 Steckdosen und
5 Feuchtesensoren. Damit laufen schon Filamentschrank, Drucker-Meldungen
und Strommessung.

## Einrichtung Schritt für Schritt

1. **Home Assistant OS installieren.** Mit dem Raspberry Pi Imager
   „Other specific-purpose OS → Home assistants → Home Assistant OS (RPi 5)“
   direkt auf die NVMe-SSD schreiben. Pi per LAN ans Rack, starten und nach
   ein paar Minuten `http://homeassistant.local:8123` öffnen.
2. **Konto anlegen**, Ort auf den Bunker setzen (wichtig für „keiner da“).
3. **Add-ons installieren** (Einstellungen → Add-ons):
   *File editor* oder *Studio Code Server*, *ESPHome Device Builder*,
   *Music Assistant*. Für den Zugriff von unterwegs: *Tailscale* (kostenlos)
   oder Home Assistant Cloud (Nabu Casa).
4. **Companion-App** auf beide Handys, anmelden. In
   `packages/bunker_basis.yaml` die zwei `notify.mobile_app_…` auf eure
   Handys ändern (der genaue Name steht unter Entwicklerwerkzeuge → Aktionen).
5. **Zigbee** einrichten (ZHA mit dem Stick), dann Sensoren, Steckdosen und
   Türkontakt anlernen. Die Geräte so umbenennen, dass die Entitäten wie in der
   Tabelle unten heißen. Dann passt alles ohne Änderungen.
6. **Dateien kopieren:** Den Inhalt von `config/` nach `/config` auf dem Pi.
   `automations.yaml`, `scripts.yaml` und `scenes.yaml` dort nicht
   überschreiben. Dann Entwicklerwerkzeuge → „Konfiguration prüfen“ →
   Neustart.
7. **ESPHome:** Im ESPHome-Add-on ein neues Gerät „abluft“ anlegen, den
   Inhalt von `esphome/abluft.yaml` einfügen und die `secrets.yaml` nach dem
   Beispiel füllen. Das erste Mal per USB flashen, danach geht es über WLAN.
8. **Drucker anbinden** (siehe unten), **WLED** und **Kameras** hinzufügen,
   in Music Assistant die Player „Vorraum“ und „Technikraum“ anlegen.

## Entitäten

So müssen die Geräte heißen. Wenn ihr einen anderen Namen wollt: einfach in den
Dateien suchen und ersetzen.

| Entität | Gerät |
|---|---|
| `light.technikraum_decke`, `light.technikraum_arbeitslicht` | Shelly / Zigbee |
| `light.technikraum_rgb_boden`, `light.bunker_schild` | WLED |
| `light.vorraum_decke`, `light.vorraum_hexlampe` | Shelly / Zigbee |
| `fan.abluft_drucker`, `fan.abluft_elektronik` | ESPHome „abluft“ |
| `sensor.abluft_voc_index`, `sensor.abluft_pm2_5` | ESPHome „abluft“ |
| `sensor.technikraum_temperatur`, `sensor.technikraum_feuchte` | Zigbee-Sensor |
| `sensor.filament_fach_1_feuchte` … `_4_feuchte` und `…_batterie` | Zigbee-Sensoren in der DETOLF |
| `switch.entfeuchter` | Zigbee-Steckdose |
| `switch.drucker_1_steckdose`, `sensor.drucker_1_leistung` (dasselbe für 2) | Zigbee-Steckdose mit Messung |
| `sensor.drucker_1_status`, `sensor.drucker_1_fortschritt` (dasselbe für 2) | Drucker-Integration |
| `sensor.loetstation_leistung` | Zigbee-Steckdose mit Messung |
| `sensor.kuehlschrank_temperatur`, `sensor.rack_temperatur` | Zigbee-Sensoren |
| `binary_sensor.vorraum_praesenz`, `binary_sensor.technikraum_praesenz` | mmWave |
| `binary_sensor.bunkertuer`, `binary_sensor.wassermelder` | Zigbee |
| `binary_sensor.rauchmelder_technikraum`, `binary_sensor.waermemelder_drucker` | nur falls vernetzbar, sonst weglassen |
| `media_player.vorraum`, `media_player.technikraum` | Music Assistant |
| `camera.vorraum`, `camera.technikraum` | Reolink |

Fehlt ein Gerät noch, ist das kein Problem. Die Automatik dafür greift dann
einfach nicht, und die Kachel im Dashboard zeigt „nicht verfügbar“.

## 3D-Drucker (Anycubic mit ACE Pro)

„Druckt gerade“ funktioniert **sofort über die Steckdose**: Über 60 W heizt
das Druckbett, also läuft ein Druck. Das reicht für Abluft und
„fertig“-Meldung.

Für Fortschritt, Restzeit und Temperaturen gibt es zwei Wege:

- **Anycubic Cloud** über HACS (Community-Integration). Geht ohne Eingriff am
  Drucker, braucht aber die Anycubic-Cloud.
- **Eigene Firmware mit Moonraker** (z. B. Rinkhals für Kobra 3/S1). Läuft
  dann lokal mit der offiziellen Moonraker-Integration. Ist aufwendiger und
  auf eigenes Risiko.

Danach die Status- und Fortschrittssensoren auf `sensor.drucker_1_status` und
`sensor.drucker_1_fortschritt` umbenennen. Prüft in den Entwicklerwerkzeugen,
welchen Text der Status beim Drucken zeigt. Steht da nicht `printing` oder
`busy`, tragt ihn in `packages/drucker.yaml` in die Liste ein.

## Verdrahtung Abluft-ESP32

```
12 V Netzteil ──┬── Step-down 5 V ── ESP32 VIN
                ├── MOSFET 1 (Gate GPIO32) ── Lüfter Drucker   +12 V
                └── MOSFET 2 (Gate GPIO33) ── Lüfter Elektronik +12 V

Lüfter Drucker:    PWM (blau) → GPIO25   Tacho (gelb) → GPIO27
Lüfter Elektronik: PWM (blau) → GPIO26   Tacho (gelb) → GPIO14
SEN55:             SDA → GPIO21  SCL → GPIO22  VDD 5 V  GND
Alle Massen (GND) verbinden.
```

Den SEN55 in den Raum hängen, nicht direkt in den Abluftschlauch. Er soll
messen, was ihr einatmet.
