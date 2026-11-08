// Dosenhalter im Tumbler-Stil: unten verjüngt, Deckelring oben, kräftiger Henkel.
// Die Dose steckt innen, oben bleibt der Dosenhals frei. Druck aufrecht, ohne Stützen.

/* [Dose] */
dose = "330"; // ["330":330 ml Standard, "500":500 ml, "250slim":250 ml Slim, "eigene":Eigene Masse]
eigene_d = 66.2;
eigene_h = 115.2;
// So viel mm bleiben oben frei (Dosenhals zum Trinken)
oben_frei = 15;

/* [Passung] */
spiel = 1.2;
rippen_tiefe = 0.7;
rippen_anzahl = 8;

/* [Form] */
// Wandstärke an der schmalsten Stelle (unten)
wand_unten = 1.8;
// Wie viel dicker der Becher oben ist als unten (Radius, mm)
bauch = 5;
// Höhe der Verjüngung unten
konus_h = 40;
// Höhe des Deckelrings oben
ring_h = 11;
boden = 2.0;
boden_loch = 30;

/* [Henkel] */
henkel_weite = 25;
henkel_griff = 11;
henkel_breite = 18;
henkel_arm = 10;
henkel_rundung = 2.5;

/* [Hidden] */
$fn = 120;
e = 0.01;

can_d = dose == "500" ? 66.2 : dose == "250slim" ? 53.0 : dose == "eigene" ? eigene_d : 66.2;
can_h = dose == "500" ? 168.0 : dose == "250slim" ? 134.0 : dose == "eigene" ? eigene_h : 115.2;

ri = (can_d + spiel) / 2;
rb = ri + wand_unten;          // Radius unten
rk = rb + bauch;               // Radius Körper oben
rr = rk + 1.2;                 // Radius Deckelring
H  = boden + can_h - oben_frei;
g  = 0.9;                      // Tiefe der Zierrillen

module koerper() {
  rotate_extrude() polygon([
    [0, 0], [rb - 0.6, 0], [rb, 0.6],
    [rk, konus_h],                                   // Verjüngung
    [rk - g, konus_h + 1], [rk - g, konus_h + 2.5], [rk, konus_h + 3.5],  // Rille
    [rk, H - ring_h - 2.5],
    [rk - g, H - ring_h - 1.5], [rk - g, H - ring_h],                    // Rille unter Deckel
    [rr, H - ring_h + (rr - rk + g)],                // 45° hinaus zum Deckelring
    [rr, H - 1], [rr - 1, H], [0, H]
  ]);
}

module becher() {
  difference() {
    union() { koerper(); henkel(); }
    translate([0, 0, boden]) cylinder(r = ri, h = H);
    translate([0, 0, H - 1.5]) cylinder(r1 = ri, r2 = ri + 1.2, h = 1.5 + e);
    if (boden_loch > 0) {
      translate([0, 0, -e]) cylinder(d = boden_loch, h = boden + 2 * e);
      translate([0, 0, -e]) cylinder(d1 = boden_loch + 1.2, d2 = boden_loch, h = 0.6);
    }
  }
  if (rippen_anzahl > 0)
    for (i = [0 : rippen_anzahl - 1])
      rotate([0, 0, 360 / rippen_anzahl * i + 180 / rippen_anzahl])
        translate([ri + 1.2 - rippen_tiefe, 0, boden - e]) {
          rh = H - boden - 10;
          cylinder(r = 1.2, h = rh, $fn = 24);
          translate([0, 0, rh]) cylinder(r1 = 1.2, r2 = 0.2, h = 6, $fn = 24);
        }
}

// Henkel: oben am Deckelring (kurze Brücke), unten läuft der Arm unter 45° zum Griff,
// dessen Fuss auf dem Druckbett steht -> keine Stützen nötig.
module henkel() {
  x0 = rk - 4;
  x1 = rk + henkel_weite;
  x2 = x1 + henkel_griff;
  zt = H - 2;
  zb = x2 - x0;                       // Arm-Unterkante am Körper (45°)
  a  = henkel_arm * sqrt(2);          // vertikale Dicke des Schrägarms
  zi1 = zt - henkel_arm - 2;          // Oberkante Fingeröffnung
  c = 7;
  r = henkel_rundung;
  intersection() {
    minkowski() {
      rotate([90, 0, 0]) linear_extrude(height = henkel_breite - 2 * r, center = true)
        offset(delta = -r) difference() {
          offset(r = 4) offset(delta = -4) polygon([
            [x0, zb], [x2 - 12, 12], [x2 - 12, -20], [x2, -20], [x2, zt], [x0, zt]
          ]);   // Griff-Fuss reicht unter z=0 und wird flach abgeschnitten -> steht auf dem Bett
          offset(r = 3) offset(delta = -3) polygon([
            [x0 - 8, zb + a + 8], [x1, zb + a - (x1 - x0)],
            [x1, zi1 - c], [x1 - c, zi1], [x0 - 8, zi1]
          ]);
        }
      sphere(r = r, $fn = 16);
    }
    translate([0, -50, 0]) cube([x2 + 10, 100, zt + 5]);
  }
}

becher();
