// Dosenhalter mit Henkel – umschliesst die Dose komplett (parametrisch)
// Öffnen in OpenSCAD, Werte rechts im Customizer anpassen, F6 rendern, als STL exportieren.
// Druck: aufrecht (Boden aufs Bett), ohne Stützen. Der obere Henkelarm wird als Brücke gedruckt.

/* [Dose] */
// Dosentyp (bei "eigene" gelten die Masse unten)
dose = "330"; // ["330":330 ml Standard, "500":500 ml, "250slim":250 ml Slim, "eigene":Eigene Masse]
// Eigener Dosen-Durchmesser in mm
eigene_d = 66.2;
// Eigene Dosenhöhe in mm
eigene_h = 115.2;
// So viel mm bleiben oben frei (Dosenhals zum Trinken)
oben_frei = 15;

/* [Passung] */
// Spiel am Durchmesser (mm), ohne Klemmrippen
spiel = 1.2;
// Wie weit die Klemmrippen nach innen ragen (mm) – mehr = strammer
rippen_tiefe = 0.7;
// Anzahl Klemmrippen (0 = keine)
rippen_anzahl = 8;

/* [Wand & Boden] */
wand = 2.4;
boden = 2.0;
// Loch im Boden zum Herausdrücken der Dose (0 = geschlossen)
boden_loch = 30;

/* [Henkel] */
// Lichte Weite zwischen Becher und Griff (Fingerdicke)
henkel_weite = 26;
// Dicke des Griffs (radial)
henkel_griff = 11;
// Breite des Henkels (tangential)
henkel_breite = 14;
// Dicke der beiden Arme (vertikal)
henkel_arm = 10;
// Kantenrundung des Henkels
henkel_rundung = 2;

/* [Name im Henkel] */
// Name, der aussen in den Griff eingeprägt wird (leer = kein Name)
name = "";
// Schriftgrösse in mm (wird bei langen Namen automatisch kleiner)
schrift = 7;
// Tiefe der Prägung in mm
praege_tiefe = 0.8;
// Schriftart (muss auf dem Computer installiert sein)
schriftart = "Liberation Sans:style=Bold";

/* [Hidden] */
$fn = 120;
e = 0.01;

can_d = dose == "500" ? 66.2 : dose == "250slim" ? 53.0 : dose == "eigene" ? eigene_d : 66.2;
can_h = dose == "500" ? 168.0 : dose == "250slim" ? 134.0 : dose == "eigene" ? eigene_h : 115.2;

ri = (can_d + spiel) / 2;           // Innenradius
ro = ri + wand;                     // Aussenradius
H  = boden + can_h - oben_frei;     // Gesamthöhe Becher

module becher() {
  difference() {
    union() {
      // Aussenmantel mit kleiner Fase unten (gegen Elefantenfuss) und oben
      rotate_extrude() polygon([
        [0, 0], [ro - 0.6, 0], [ro, 0.6], [ro, H - 0.8], [ro - 0.8, H], [0, H]
      ]);
      henkel();
    }
    // Innenraum mit Einführfase oben
    translate([0, 0, boden]) cylinder(r = ri, h = H);
    name_gravur(ro + henkel_weite + henkel_griff, 8, H - 4 - 8);
    translate([0, 0, H - 1.5]) cylinder(r1 = ri, r2 = ri + 1.2, h = 1.5 + e);
    // Bodenloch mit Fase
    if (boden_loch > 0) {
      translate([0, 0, -e]) cylinder(d = boden_loch, h = boden + 2 * e);
      translate([0, 0, -e]) cylinder(d1 = boden_loch + 1.2, d2 = boden_loch, h = 0.6);
    }
  }
  // Klemmrippen innen, oben angeschrägt zum leichten Einführen
  if (rippen_anzahl > 0)
    for (i = [0 : rippen_anzahl - 1])
      rotate([0, 0, 360 / rippen_anzahl * i + 180 / rippen_anzahl])
        translate([ri + 1.2 - rippen_tiefe, 0, boden - e]) {
          rh = H - boden - 10;
          cylinder(r = 1.2, h = rh, $fn = 24);
          translate([0, 0, rh]) cylinder(r1 = 1.2, r2 = 0.2, h = 6, $fn = 24);
        }
}

// Henkel als D-Form: Unterarm liegt auf dem Druckbett, Oberarm ist eine kurze Brücke,
// die oberen Innenecken sind 45° angefast -> druckbar ohne Stützen.
module henkel() {
  x0 = ro - 1.5;                         // im Mantel verankert
  x1 = ro + henkel_weite;                // Innenkante Griff
  x2 = x1 + henkel_griff;                // Aussenkante Griff
  zt = H - 4;                            // Oberkante Henkel
  zi0 = henkel_arm;                      // Unterkante Fingeröffnung
  zi1 = zt - henkel_arm;                 // Oberkante Fingeröffnung
  c = 6;                                 // Fase oben innen
  r = henkel_rundung;
  intersection() {
    minkowski() {
      rotate([90, 0, 0]) linear_extrude(height = henkel_breite - 2 * r, center = true)
        offset(delta = -r) difference() {
          // Aussenkontur, Griff aussen oben/unten abgerundet
          hull() {
            translate([x0, 0]) square([1, zt]);
            translate([x2 - 8, 8]) circle(r = 8);
            translate([x2 - 8, zt - 8]) circle(r = 8);
          }
          // Fingeröffnung
          offset(r = 3) offset(delta = -3) polygon([
            [x0 - 5, zi0], [x1, zi0], [x1, zi1 - c], [x1 - c, zi1], [x0 - 5, zi1]
          ]);
        }
      sphere(r = r, $fn = 16);
    }
    // nichts unter das Bett, nichts in den Innenraum
    translate([0, -50, 0]) cube([x2 + 10, 100, zt + 5]);
  }
}


// Name senkrecht in die Aussenseite des Griffs prägen (liest sich von unten nach oben)
module name_gravur(x2, za, zb) {
  if (name != "") {
    L = zb - za - 4;
    f = min(1, L / (0.68 * schrift * len(name)));
    translate([x2 - praege_tiefe, 0, (za + zb) / 2]) rotate([90, 0, 90])
      linear_extrude(height = praege_tiefe + 1)
        rotate(90) scale(f) text(name, size = schrift, font = schriftart, halign = "center", valign = "center", $fn = 32);
  }
}

becher();
