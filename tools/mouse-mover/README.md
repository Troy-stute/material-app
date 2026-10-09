# Mouse Mover

Portable Windows-App (eine einzelne `MouseMover.exe`, ca. 1,6 MB), die die Maus im
eingestellten Intervall um 1 Pixel hin- und zurückbewegt. Keine Installation, keine
Admin-Rechte, keine Laufzeitumgebung nötig.

## Benutzung

1. `MouseMover.exe` irgendwohin kopieren (Desktop, USB-Stick …) und starten.
2. Intervall in Sekunden eingeben (Standard: 60).
3. **Start** klicken. Das Fenster kann minimiert werden, die App läuft weiter.
4. **Stopp** klicken oder Fenster schließen zum Beenden.

Während die App aktiv ist:

- bewegt sie die Maus um 1 Pixel hin und zurück (praktisch unsichtbar),
- sendet sie optional die Taste **F15** (gibt es auf normalen Tastaturen nicht, löst nichts aus),
- verhindert sie Standby und das Abschalten des Bildschirms.

## Einstellungen

Über das Zahnrad oben rechts lässt sich das Design wählen: **Klassisch**, **Modern**
(Standard) oder **Pink**. Design, Intervall und F15-Option werden in einer
`MouseMover.ini` direkt neben der `.exe` gespeichert – die App bleibt so portabel.

© 2026 Stutz

Hinweis: Beim ersten Start kann Windows SmartScreen warnen, weil die Datei nicht
signiert ist („Weitere Informationen“ → „Trotzdem ausführen“).

## Selbst bauen

Mit installiertem Go: `./build.sh`
