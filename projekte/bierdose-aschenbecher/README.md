# Bierdose 500 ml als versteckter Aschenbecher

Eine 3D-druckbare Bierdose, die von aussen wie eine echte, bereits geöffnete 500-ml-Aludose aussieht.
Erloschene Zigarettenstummel werden durch die normale Trinköffnung eingeworfen. Zum Leeren wird der Boden abgeschraubt.

> **Nur für kalte Asche und vollständig erloschene Stummel.** PLA wird ab ca. 55–60 °C weich, PETG ab ca. 75–80 °C.
> Beides ist brennbar. Das Teil ist kein Ersatz für einen feuerfesten Aschenbecher.

![Produktbild](bilder/01_produkt_vorne.png)

## Dateien

| Datei | Inhalt |
|---|---|
| `stl/dosenkoerper.stl` | Hauptkörper mit Etikett-Relief und angeformter Zuglasche – **Standardversion** |
| `stl/dosenkoerper_ohne_lasche.stl` | Hauptkörper mit Nietstift, für die separat gedruckte Lasche |
| `stl/schraubboden.stl` | Abschraubbarer Boden mit Aussengewinde |
| `stl/zuglasche.stl` | Zuglasche (optional, separat drucken und auf den Nietstift kleben) |
| `stl/mehrfarbig/dosenkoerper_basis.stl` + `etikett_relief.stl` | Für Mehrfarbdruck: Relief als zweites Teil am selben Ursprung laden |
| `step/bierdose_baugruppe.step` | Bearbeitbare Baugruppe (Rumpf, Etikett-Relief, Schraubboden) für Fusion 360, FreeCAD usw. |
| `step/dosenkoerper.step`, `schraubboden.step`, `zuglasche.step` | Einzelteile als STEP |
| `cad/bierdose.py` | Parametrisches Quellmodell (CadQuery). Alle Masse stehen oben im Block `PARAMETER` |
| `cad/kennwerte.json` | Volumen, Abmessungen und Ergebnis der Kollisionsprüfung |
| `bilder/` | Produktbilder |
| `video/bierdose_aschenbecher.mp4` | 3D-Produktanimation (7 Szenen, 1920×1080) |
| `viewer/index.html` | Interaktives 3D-Modell (drehen, zoomen, Schnitt, Explosion, Boden abschrauben) |

Fusion 360 kann STEP direkt öffnen (*Datei → Öffnen → STEP*). Eine native `.f3d`-Datei lässt sich ausserhalb von
Fusion nicht erzeugen. Die STEP-Baugruppe ist die Austauschdatei, das Python-Skript ist die parametrische Quelle.

## Abmessungen

| | |
|---|---|
| Aussenmass | Ø 66 × 168 mm |
| Wandstärke | 2,6 mm |
| Innenvolumen (Sammelraum) | ca. 344 ml |
| Deckelfalz | Ø 56 mm (Deckel Typ 202) |
| Trinköffnung | ca. 18,5 × 17 mm, Scharnier 4 mm neben der Niete |
| Gewinde | Trapez, 45°-Flanken, Steigung 3,5 mm, Tiefe 1,3 mm, ca. 3,5 Umdrehungen |
| Spiel | 0,35 mm radial, ca. 0,4 mm axial je Flanke |
| Trennfuge | 10 mm über dem Tisch, auf der Kante zwischen Zylinder und Bodeneinzug |

## Konstruktion

**Unsichtbare Trennfuge.** Echte Dosen haben unten eine Kante, wo der Zylinder in den eingezogenen Boden übergeht.
Genau dort liegt die Fuge. Das Gewinde sitzt komplett innen.

**Stützenfreier Innenraum.** Unter dem Deckel wächst der Hohlraum mit höchstens 45° von der Trinköffnung bis zur
vollen Zylinderbreite (Trichter). Der Körper druckt deshalb stehend ohne Stützen. Gleichzeitig führt der Trichter
die Stummel beim Ausleeren zur Öffnung hin. Die Innenwand ist glatt und hat keine Taschen oder Hinterschnitte.

**Eingedrücktes Verschlussblech.** Auf der Scharnierseite hängt das Blech mit 85° in den Hohlraum, wie bei einer
echten geöffneten Dose. Es ist mit der Trichterwand verbunden und braucht keine Stütze.

**Gewinde.** Die Rippen laufen an beiden Enden über eine Viertelumdrehung weich aus (kein scharfer Gewindeanfang).
Unten hat der Rumpf eine 45°-Einführfase. Das Skript prüft die Schraubbewegung in 9 Stellungen von 0° bis 1080°.
Die Überschneidung ist jedes Mal 0 mm³. Als Gegenprobe kollidieren falsche Bewegungen (nur drehen, nur anheben),
die Prüfung greift also tatsächlich (siehe `cad/kennwerte.json`).

**Standfläche.** Der Boden hat den typischen Standring (Ø ca. 49 mm) und die nach innen gewölbte Kuppel.

## Druckeinstellungen (FDM, 0,4-mm-Düse)

| Teil | Ausrichtung | Hinweise |
|---|---|---|
| Dosenkörper | stehend, Falz oben (so wie die STL liegt) | ohne Stützen, **Brim 5 mm empfohlen** (schmale Auflage, 168 mm hoch) |
| Schraubboden | kopfüber, Gewindezapfen auf dem Bett (so wie die STL liegt) | ohne Stützen. Die Kuppel ist dann eine offene Schale nach oben |
| Zuglasche | flach | 0,12 mm Schicht für saubere Rundungen |

- Schichthöhe 0,16 mm (Gewinde und Schrift profitieren von 0,12 mm), 3 Perimeter, 15 % Gyroid-Füllung
- Material: PETG (wärmebeständiger) oder PLA. Silber-Seiden-PLA wirkt sehr nah an Aluminium
- Kein „Ironing“ auf dem Deckel nötig. Die Nahtposition (Seam) auf die Rückseite legen (Strichcode-Seite, +Y)
- Falls das Gewinde zu streng läuft: Elefantenfuss-Kompensation aktivieren oder `SPIEL_RAD` auf 0,45 erhöhen

**Optik wie echt:** Rumpf grün und Relief silber/gold im Mehrfarbdruck. Alternativ silbern drucken, den Rumpf
grün lackieren und die erhabenen Schriftzüge mit einem Silberstift nachziehen. Die Druckbilder in den Renderings
zeigen das bemalte Endergebnis.

## Trinköffnung an die eigene Referenzdose anpassen

Die Deckel verschiedener Hersteller unterscheiden sich. Masse an einer leeren, geöffneten 500-ml-Dose nehmen
(Messschieber) und im Block `PARAMETER` von `cad/bierdose.py` eintragen:

1. **Falzdurchmesser** aussen → `R_FALZ` (Hälfte)
2. **Senkentiefe** von der Falzoberkante bis zum Deckelspiegel → `Z_PANEL = 168 − Tiefe`
3. **Öffnung**: Länge (radial) und grösste Breite, Abstand des Scharniers von der Nietmitte → `OEFFNUNG_KREISE`,
   `X_SCHARNIER`. Die Öffnung ist die konvexe Hülle der angegebenen Kreise `(x, y, r)`
4. **Dosenhöhe/-durchmesser** → `H_DOSE`, `R_DOSE`

Danach neu erzeugen:

```bash
pip install cadquery shapely trimesh
cd cad && python3 bierdose.py
```

Das Skript schreibt alle STL- und STEP-Dateien neu und wiederholt die Kollisionsprüfung.
Der Schriftpfad (`FONT`) zeigt auf DejaVu Sans Bold und muss auf Windows/macOS ggf. angepasst werden.

## Benutzung

1. Nur vollständig erloschene, kalte Stummel durch die Trinköffnung einwerfen.
2. Zum Leeren die Dose umdrehen und den Boden abschrauben: Rechtsgewinde, also mit Blick auf den Boden gegen den
   Uhrzeigersinn drehen. Dann ausschütten. Der Innentrichter führt die Stummel zur Öffnung.
3. Innen mit warmem Wasser ausspülen, trocknen lassen, Boden wieder aufschrauben.

## Interaktives Modell und Animation

- `viewer/index.html` braucht einen Webserver (z.B. `python3 -m http.server` im Ordner `viewer` oder die
  App-Seite auf GitHub Pages). Steuerung mit Maus oder Finger. Schalter für Schnitt, Transparenz, Drehen,
  Stummel-Einwurf, Regler für Schraubboden und Explosion
- `viewer/animation.html` ist die Zeitleiste der Produktanimation. Daraus wurden Video und Bilder gerendert
  (three.js, headless Chromium, ffmpeg)

Szenen der Animation: 1 Produktvorstellung · 2 Oberseite/Trinköffnung · 3 Einwurf · 4 Transparenz und Schnitt ·
5 Schraubboden · 6 Explosionsdarstellung · 7 Zusammenbau und 360°-Drehung.

Marke und Etikett („Silberfalke“) sind frei erfunden.
