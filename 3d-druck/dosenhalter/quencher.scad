// Dosenhalter in Quencher-Form (Trinkbecher mit Henkel), skaliert für eine Dose.
// Standard: Red Bull 250 ml (Ø 53 x 134 mm). Oben bleibt der Dosenhals frei.
// Druck: aufrecht. Der untere Henkelarm braucht Stützen ("nur auf dem Druckbett").

/* [Dose] */
dose = "redbull250"; // ["redbull250":Red Bull 250 ml (Ø53 x 134), "330":330 ml Standard (Ø66 x 115), "500":500 ml (Ø66 x 168), "eigene":Eigene Masse]
eigene_d = 53;
eigene_h = 134;
// So viel mm schaut die Dose oben heraus (zum Trinken)
oben_frei = 12;

/* [Passung] */
spiel = 1.0;
rippen_tiefe = 0.6;
rippen_anzahl = 8;

/* [Form] */
// Wand unten an der schmalsten Stelle
wand_unten = 1.8;
// Verhältnis Durchmesser oben / unten (Original ca. 1.3)
verhaeltnis = 1.3;
// Beginn des Übergangs (Anteil der Höhe)
uebergang_start = 0.22;
// Ende des Übergangs (Anteil der Höhe)
uebergang_ende = 0.40;
// Höhe des Deckelrings oben
deckel_h = 15;
boden = 2.0;
boden_loch = 26;

/* [Henkel] */
// Abstand Becher - Griff (Fingerdicke)
henkel_weite = 22;
henkel_griff = 12;
henkel_breite = 20;
// Höhe der unteren Henkelbefestigung (Anteil der Höhe)
henkel_unten = 0.31;
henkel_arm_oben = 12;
henkel_arm_unten = 11;
henkel_rundung = 3;

/* [Hidden] */
$fn = 120;
e = 0.01;

can_d = dose == "330" ? 66.2 : dose == "500" ? 66.2 : dose == "eigene" ? eigene_d : 53.0;
can_h = dose == "330" ? 115.2 : dose == "500" ? 168.0 : dose == "eigene" ? eigene_h : 134.0;

ri = (can_d + spiel) / 2;
rb = ri + wand_unten;          // Radius am Fuss
R  = rb * verhaeltnis;         // Radius oben
H  = boden + can_h - oben_frei;
z0 = H * uebergang_start;
z1 = H * uebergang_ende;
zd = H - deckel_h;             // Deckelfuge

// Radius-Verlauf des Körpers
function r_at(z) =
  z <= z0 ? rb + 1.2 * z / z0 :
  z <= z1 ? let(t = (z - z0) / (z1 - z0), s = (1 - cos(180 * t)) / 2) (rb + 1.2) + (R - 0.6 - rb - 1.2) * s :
  (R - 0.6) + 0.6 * (z - z1) / (zd - z1);

module koerper() {
  n = 60;
  pts = concat(
    [[0, 0], [rb - 0.8, 0]],
    [for (i = [1 : n]) let(z = 0.8 + (zd - 1.2 - 0.8) * i / n) [r_at(z), z]],
    [[R - 0.8, zd - 0.6], [R - 0.8, zd + 0.6]],               // Deckelfuge
    [[R + 0.3, zd + 1.2], [R + 0.3, H - 3]],                   // Deckelring
    [for (a = [0 : 15 : 90]) [R + 0.3 - 3 + 3 * cos(a), H - 3 + 3 * sin(a)]],
    [[R - 3.5, H], [R - 5, H - 1.5], [0, H - 1.5]]             // erhöhter Rand, innen abgesenkt
  );
  rotate_extrude() polygon(pts);
}

module henkel() {
  x0 = ri + 1;
  x1 = R + henkel_weite;
  x2 = x1 + henkel_griff;
  zt = zd - 2;
  zl = H * henkel_unten;
  h0 = zl + henkel_arm_unten;       // Unterkante Öffnung
  h1 = zt - henkel_arm_oben;        // Oberkante Öffnung
  r = henkel_rundung;
  minkowski() {
    rotate([90, 0, 0]) linear_extrude(height = henkel_breite - 2 * r, center = true)
      offset(delta = -r) difference() {
        hull() {
          translate([x0, zl]) square([1, zt - zl]);
          translate([x2 - 11, zt - 11]) circle(r = 11);       // grosse Rundung oben aussen
          translate([x2 - 13, zl + 13]) circle(r = 13);       // grosse Rundung unten aussen
        }
        hull() {
          translate([x0 - 10, h0]) square([1, h1 - h0]);
          translate([x1 - 6, h1 - 6]) circle(r = 6);
          translate([x1 - 8, h0 + 8]) circle(r = 8);
        }
      }
    sphere(r = r, $fn = 16);
  }
}

module becher() {
  difference() {
    union() { koerper(); henkel(); }
    translate([0, 0, boden]) cylinder(r = ri, h = H);
    translate([0, 0, H - 1.5 - 1.2]) cylinder(r1 = ri, r2 = ri + 1.2, h = 1.2 + e);
    if (boden_loch > 0) {
      translate([0, 0, -e]) cylinder(d = boden_loch, h = boden + 2 * e);
      translate([0, 0, -e]) cylinder(d1 = boden_loch + 1.2, d2 = boden_loch, h = 0.6);
    }
  }
  if (rippen_anzahl > 0)
    for (i = [0 : rippen_anzahl - 1])
      rotate([0, 0, 360 / rippen_anzahl * i + 180 / rippen_anzahl])
        translate([ri + 1.2 - rippen_tiefe, 0, boden - e]) {
          rh = H - boden - 12;
          cylinder(r = 1.2, h = rh, $fn = 24);
          translate([0, 0, rh]) cylinder(r1 = 1.2, r2 = 0.2, h = 6, $fn = 24);
        }
}

becher(); // Hauptobjekt
