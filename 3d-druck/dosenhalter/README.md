# Dosenhalter mit Henkel

Becher, der die Dose rundum umschliesst, mit seitlichem Henkel. Oben bleiben 15 mm frei, damit man aus der Dose trinken kann.

![Vorschau](vorschau_330.png)

| Datei | Dose | Becher (Ø aussen × Höhe) |
|---|---|---|
| `dosenhalter_330.stl` | 330 ml Standard (Ø 66,2 × 115 mm) | 72,2 × 102 mm |
| `dosenhalter_500.stl` | 500 ml (Ø 66,2 × 168 mm) | 72,2 × 155 mm |
| `dosenhalter_250slim.stl` | 250 ml Slim (Ø 53 × 134 mm) | 59 × 121 mm |

## Druck
- Aufrecht drucken, Boden aufs Bett, **keine Stützen** nötig (der obere Henkelarm ist eine kurze Brücke, die Innenecke oben ist 45° angefast).
- 0,2 mm Schichthöhe, 3 Wände, 15–20 % Infill. PETG oder PLA.

## Passung
- Die 8 Klemmrippen innen halten die Dose. Sitzt sie zu locker oder zu stramm: in `dosenhalter.scad` den Wert `rippen_tiefe` ändern (Standard 0,7 mm).
- Durch das Loch im Boden kann man die leere Dose herausdrücken.

## Anpassen
`dosenhalter.scad` in OpenSCAD öffnen. Im Customizer kann man Dosentyp, eigene Masse, Wandstärke und Henkelgrösse einstellen. Danach F6 drücken und als STL exportieren.
