# Bildstudio

Bilder **erzeugen** und **bearbeiten** – komplett offline, direkt im Browser. Keine Installation,
keine Abhängigkeiten, kein Konto, kein Upload: Die Bilder verlassen das Gerät nie.

## Online öffnen

**https://troy-stute.github.io/material-app/bildstudio/** – einmal öffnen, «App installieren» bzw.
«Zum Startbildschirm hinzufügen», danach läuft sie auch ohne Internet.

## Starten

- **Ohne alles:** `bildstudio/index.html` doppelklicken. Läuft sofort, auch ganz ohne Internet.
- **Als App (PC, Handy, Tablet):** Im Hauptordner `node serve.js` starten und
  `http://localhost:8080/bildstudio/` öffnen. Über «Zum Startbildschirm hinzufügen» bzw.
  «App installieren» wird es eine eigene App. Nach dem ersten Aufruf funktioniert sie auch im Flugmodus.

## Funktionen

**Erzeugen (Mathematisch)**: 8 Motive (Landschaft, Wolken & Marmor, Fraktal, Mosaik, Geometrische Formen,
Wellen, Farbverlauf, Weltall) × 10 Farbpaletten, in Grössen bis 2048 × 2048.
Stichworte wie «Sterne im Neon-Look» oder «Berge im Winter» wählen Motiv und Farben.
Gleiche Stichworte und gleicher Seed ergeben immer dasselbe Bild.

**Bearbeiten**
- Anpassen: Helligkeit, Kontrast, Sättigung, Wärme, Farbton, Auto-Kontrast
- Filter: Schwarzweiss, Sepia, Vintage, Negativ, Weichzeichnen, Schärfen, Verpixeln, Poster,
  Schwellwert, Vignette, Körnung, Leuchtkanten, Bleistift, Relief (mit Live-Vorschau)
- Zuschnitt: frei oder 1:1 / 4:3 / 16:9 / 9:16, drehen, spiegeln, Grösse ändern
- Malen: Pinsel, Radierer, Füllen, Pipette, Deckkraft
- Text: mehrzeilig, 5 Schriften, Kontur und Schatten
- Rückgängig/Wiederholen, Öffnen per Knopf, Drag & Drop oder Einfügen (Strg+V)
- Speichern als PNG, JPEG oder WebP, auf dem Handy auch direkt teilen

Tastenkürzel: Strg+Z / Strg+Y (Rückgängig/Wiederholen), Strg+O (Öffnen), Strg+S (Speichern).

## Zwei Arten zu erzeugen – oben im Reiter «Erzeugen» umschaltbar

| | 🧮 Mathematisch | 🤖 KI |
|---|---|---|
| Was | Muster, Landschaften, Fraktale … aus Formeln | Beliebige Beschreibung → Bild («eine Katze mit Hut im Wald, Aquarell») |
| Geräte | jedes, auch alte Handys | PC/Mac mit aktuellem Chrome/Edge und Grafikkarte (WebGPU) |
| Download | keiner | einmalig ~2,4 GB, danach offline |
| Tempo | sofort | ca. 1–5 s pro Bild (je nach Grafikkarte), 512 × 512 |

### KI im Browser (SD-Turbo)

Das Modell **SD-Turbo** (Stable Diffusion, Stability AI) läuft über ONNX Runtime Web direkt auf der
Grafikkarte. Beim ersten Mal wird es heruntergeladen (WLAN empfohlen) und im Browser gespeichert;
danach braucht es kein Internet mehr. «Modell löschen» gibt den Speicher wieder frei.
Deutsche Beschreibungen werden mit einem eingebauten Wörterbuch ins Englische übertragen,
weil das Modell Englisch am besten versteht – englisch schreiben funktioniert natürlich direkt.

Voraussetzungen: Chrome oder Edge (ab Version 121) auf Windows, macOS oder ChromeOS, eine Grafikkarte
mit WebGPU und float16 sowie genügend Arbeitsspeicher (8 GB+ empfohlen). Die App prüft das selbst und sagt,
wenn es nicht geht. Funktioniert nicht, wenn die Datei per Doppelklick geöffnet ist – dafür die Web-App nutzen.
SD-Turbo steht unter der «Stability AI Community License» (nichtkommerzielle Nutzung frei).

### Eigener KI-Server (optional)

Wer auf dem PC bereits **Automatic1111**, **Forge** oder **SD.Next** hat, kann diesen als Motor wählen –
dann rechnet der PC, auch für Handy und Tablet im gleichen WLAN, mit beliebigen Modellen und Grössen.
Server starten mit:

```
--api --listen --cors-allow-origins=https://troy-stute.github.io
```

und in der App die Adresse eintragen (z. B. `http://127.0.0.1:7860` oder `http://192.168.1.20:7860`).
