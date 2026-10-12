#!/usr/bin/env python3
"""
Bierdose 500 ml als versteckter Aschenbecher – parametrisches CAD-Modell (CadQuery).

Erzeugt:
  ../step/   bierdose_baugruppe.step + je Bauteil eine STEP-Datei (bearbeitbar, z.B. Fusion 360)
  ../stl/    druckfertige STL-Dateien (bereits in Druckorientierung)
  ../viewer/modell/  STL-Dateien in Baugruppen-Koordinaten (für Renderings / Viewer)

Koordinaten: Z nach oben, Dosenboden (Standring) bei Z = 0, Deckelfalz oben bei Z = 168.
Die Trinköffnung liegt in +X-Richtung, die Etikett-Vorderseite zeigt nach -Y.

Aufruf:  python3 bierdose.py            (alle Dateien)
Alle Masse in Millimeter. Die Werte im Block PARAMETER an die eigene Referenzdose anpassen.
"""
import math, os, sys, json
import numpy as np
import cadquery as cq
from shapely.geometry import Point, Polygon, LineString, box
from shapely.ops import unary_union
from shapely import affinity

# ============================== PARAMETER ==============================
H_DOSE      = 168.0   # Gesamthöhe
R_DOSE      = 33.0    # Rumpfradius (Ø 66)
WAND        = 2.6     # Wandstärke Rumpf
R_INNEN     = R_DOSE - WAND          # 30.4 – Innenradius / Gewinde-Aussenradius Mutter
Z_FUGE      = 10.0    # Trennfuge Rumpf/Boden (liegt auf der natürlichen Kante Zylinder → Bodeneinzug)

# Hals & Deckel (Deckel Typ "202", an Referenzdose messen!)
Z_SCHULTER  = 147.0   # Beginn Schultereinzug
R_HALS      = 27.4    # Halsradius direkt unter dem Falz
R_FALZ      = 28.0    # Aussenradius Doppelfalz (Ø 56)
Z_PANEL     = 162.4   # Oberkante Deckelspiegel (Panel)  -> Senke ca. 5.6 mm unter Falzoberkante
DECKEL_T    = 2.0     # Materialstärke unter dem Panel

# Trinköffnung (konvexe Hülle aus Kreisen: (x, y, r)); Scharnier bei x = 4.0
OEFFNUNG_KREISE = [(6.5, -2.5, 2.5), (6.5, 2.5, 2.5), (15.0, -5.0, 3.5),
                   (15.0, 5.0, 3.5), (18.5, 0.0, 4.0)]
X_SCHARNIER = 4.0
LAPPEN_WINKEL = 85.0  # eingedrücktes Verschlussblech, Grad unter der Horizontalen
LAPPEN_L    = 12.0    # sichtbare Länge des Verschlussblechs
LAPPEN_T    = 0.7

# Gewinde (trapezförmig, 45°-Flanken = stützenfrei druckbar)
STEIGUNG    = 3.5
G_TIEFE     = 1.3
SPIEL_RAD   = 0.35    # radiales Spiel
R_M_MAJ     = R_INNEN - SPIEL_RAD        # 30.05 Bolzen-Aussenradius
R_M_MIN     = R_M_MAJ - G_TIEFE          # 28.75 Bolzen-Kernradius
R_F_MIN     = R_INNEN - G_TIEFE          # 29.10 Mutter-Kernradius (Gewindespitzen innen)
Z_ZAPFEN    = 22.5    # Oberkante Gewindezapfen = Innenboden der Dose
FUGE_FLACH  = 31.5    # Rumpf-Auflagering r in [FUGE_FLACH, R_DOSE]

# Etikett
MARKE       = "SILBERFALKE"
UNTERZEILE  = "PREMIUM LAGER"
ZEILE_UNTEN = "5,0 % VOL  ·  0,5 L"
RUECKSEITE  = "GEBRAUT MIT ALPENQUELLWASSER"
FONT        = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
RELIEF      = 0.6     # erhabene Schrift / Ringe

TOL = 0.02            # STL-Tessellierung (lineare Abweichung)
# =======================================================================

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(HERE, ".."))

def revolve(pts_fn):
    """Rotationskörper aus Profil-Workplane in XZ (x = Radius, y = Höhe)."""
    return pts_fn(cq.Workplane("XZ")).close().revolve(360, (0, 0, 0), (0, 1, 0)).val()

# -------------------------------- Rumpf --------------------------------
SCHULTER_PTS = [(R_DOSE, Z_SCHULTER), (32.75, 151.5), (31.6, 155.5), (29.6, 159.2),
                (28.0, 161.6), (R_HALS, 163.1)]

def r_aussen(z):
    zs = [p[1] for p in SCHULTER_PTS]; rs = [p[0] for p in SCHULTER_PTS]
    if z <= Z_SCHULTER: return R_DOSE
    return float(np.interp(z, zs, rs))

def huelle_rumpf():
    def prof(w):
        w = (w.moveTo(0, Z_FUGE).lineTo(R_DOSE, Z_FUGE).lineTo(R_DOSE, Z_SCHULTER)
              .spline(SCHULTER_PTS[1:], includeCurrent=True)
              .lineTo(R_FALZ, 164.0).lineTo(R_FALZ, 167.2)
              .threePointArc((27.766, 167.766), (27.2, 168.0))
              .lineTo(26.85, 168.0)
              .threePointArc((26.461, 167.839), (26.30, 167.45))
              .lineTo(25.62, 162.0).lineTo(25.5, 161.45)
              .threePointArc((25.05, 161.0), (24.6, 161.45))
              .lineTo(24.45, 162.05)
              .threePointArc((24.27, 162.32), (24.0, Z_PANEL))
              .lineTo(0, Z_PANEL))
        return w
    return revolve(prof)

def oeffnung_2d():
    return unary_union([Point(x, y).buffer(r, 64) for x, y, r in OEFFNUNG_KREISE]).convex_hull

def poly_wire(coords, z):
    pts = [cq.Vector(x, y, z) for x, y in coords]
    return cq.Wire.makePolygon(pts, close=True)

def radial_sample(poly, c, n):
    out = []
    for k in range(n):
        a = 2 * math.pi * k / n
        ray = LineString([c, (c[0] + 200 * math.cos(a), c[1] + 200 * math.sin(a))])
        inter = ray.intersection(poly.exterior)
        pts = [inter] if inter.geom_type == "Point" else list(getattr(inter, "geoms", []))
        d = max(math.hypot(p.x - c[0], p.y - c[1]) for p in pts)
        out.append((c[0] + d * math.cos(a), c[1] + d * math.sin(a)))
    return out

def trichter():
    """Hohlraum unter dem Deckel: wächst von der Öffnung nach unten mit max. 45° (stützenfrei),
    auf der Scharnierseite steht das eingedrückte Verschlussblech (85°)."""
    oe = oeffnung_2d()
    z_top = Z_PANEL - DECKEL_T
    cot = 1 / math.tan(math.radians(LAPPEN_WINKEL))
    x_lap_end = X_SCHARNIER + LAPPEN_L * cot
    c = (13.0, 0.0); n = 120
    sections, h = [], 0.0
    hs = list(np.arange(0, 6, 0.75)) + list(np.arange(6, 70, 1.5))
    for h in hs:
        z = z_top - h
        rc = min(R_INNEN, r_aussen(z) - WAND)
        x_h = X_SCHARNIER + h * cot if h <= LAPPEN_L else x_lap_end - (h - LAPPEN_L)
        s = oe.buffer(h, 64) if h > 0 else oe
        s = s.intersection(box(x_h, -100, 100, 100)).intersection(Point(0, 0).buffer(rc, 256))
        full = Point(0, 0).buffer(rc - 0.01, 256).difference(s).area < 1e-3
        sections.append((z, radial_sample(s, c, n)))
        if full: break
    # Abschluss-Querschnitt minimal grösser als der Zylinder darunter -> sauberer Übergang ohne Splitter
    z0 = sections[-1][0] - 1.0
    sections.append((z0, radial_sample(Point(0, 0).buffer(R_INNEN + 0.05, 512), c, n)))
    # senkrechter Einwurfkanal durch das Deckelblech gehört direkt zum Loft (keine koinzidenten Flächen)
    sections.insert(0, (Z_PANEL + 1.5, sections[0][1]))
    wires = [poly_wire(p, z) for z, p in reversed(sections)]
    loft = cq.Solid.makeLoft(wires, True)
    return loft, z0, oe

def gewinde_solid(r_root, r_apex, half_root, half_apex, z0, turns, fade=0.3, emb=0.3, seg_turns=0.25, n_per_seg=14):
    """Trapezgewinde-Rippe als Volumen aus Regelflächen zwischen Schraubenlinien.
    Ein- und Auslauf werden über `fade` Umdrehungen sanft auf null geführt (kein Verschneiden nötig).
    Die Rippe wird aus Viertelwindungs-Segmenten aufgebaut – lange, mehrfach umlaufende
    B-Spline-Flächen bringen die OpenCascade-Booleans aus dem Tritt."""
    from OCP.BRepBuilderAPI import BRepBuilderAPI_Sewing
    from OCP.ShapeFix import ShapeFix_Solid
    from OCP.TopoDS import TopoDS
    sgn = 1 if r_apex > r_root else -1
    rb, hb = r_root - sgn * emb, half_root + emb
    def fade_f(t):
        f = min(1.0, max(0.0, min(t / fade, (turns - t) / fade)))
        return max(0.5 - 0.5 * math.cos(math.pi * f), 0.04)
    def punkt(t, i):
        f = fade_f(t)
        ra, ha = rb + f * (r_apex - rb), hb + f * (half_apex - hb)
        r, dz = [(rb, -hb), (ra, -ha), (ra, ha), (rb, hb)][i]
        a = 2 * math.pi * t + math.radians(GEWINDE_VERSATZ)
        return cq.Vector(r * math.cos(a), r * math.sin(a), z0 + STEIGUNG * t + dz)
    nseg = max(1, int(math.ceil(turns / seg_turns)))
    grenzen = np.linspace(0, turns, nseg + 1)
    teile = []
    for s0, s1 in zip(grenzen[:-1], grenzen[1:]):
        tt = list(np.linspace(s0, s1, n_per_seg))
        kurven = [cq.Edge.makeSpline([punkt(t, i) for t in tt], parameters=tt) for i in range(4)]
        faces = [cq.Face.makeRuledSurface(kurven[i], kurven[(i + 1) % 4]) for i in range(4)]
        for t in (s0, s1):
            faces.append(cq.Face.makeFromWires(cq.Wire.makePolygon([punkt(t, i) for i in range(4)], close=True)))
        sew = BRepBuilderAPI_Sewing(1e-5)
        for fc in faces:
            sew.Add(fc.wrapped)
        sew.Perform()
        teile.append(cq.Solid(ShapeFix_Solid().SolidFromShell(TopoDS.Shell_s(sew.SewedShape()))))
    return teile

def fuse_teile(basis, teile):
    for t in teile:
        basis = basis.fuse(t)
    return basis.clean()

GEWINDE_VERSATZ = 37.0
HALB_FUSS, HALB_SPITZE = 1.5, 0.2      # Zahnfuss 3.0 mm, Zahnspitze 0.4 mm, Flanken 45°
Z_BOLZEN_START = Z_FUGE + 1.0          # Mitte der ersten Bolzenrippe
Z_BOLZEN_ENDE = Z_ZAPFEN - 2.5
Z_MUTTER_START = Z_BOLZEN_START + STEIGUNG / 2   # Mutterrippe liegt genau zwischen den Bolzenrippen
Z_MUTTER_ENDE = Z_ZAPFEN + 0.5

def gewinde_mutter():
    """Innengewinde im Rumpf (Rippen auf der Innenwand, Spitzen zeigen nach innen)."""
    return gewinde_solid(R_INNEN, R_F_MIN, HALB_FUSS, HALB_SPITZE, Z_MUTTER_START,
                         (Z_MUTTER_ENDE - Z_MUTTER_START) / STEIGUNG)

def gewinde_bolzen():
    return gewinde_solid(R_M_MIN, R_M_MAJ, HALB_FUSS, HALB_SPITZE, Z_BOLZEN_START,
                         (Z_BOLZEN_ENDE - Z_BOLZEN_START) / STEIGUNG, emb=0.15)


def etikett_relief():
    """Erhabene Schriftzüge + Zierringe, exakt auf die Zylinderfläche gewickelt."""
    teile = []
    def zeile(text, fs, z_mitte, winkel_mitte=0.0, sperr=0.10):
        glyphs, breiten = [], []
        for ch in text:
            if ch == " ":
                glyphs.append(None); breiten.append(0.32 * fs); continue
            g = cq.Workplane("XZ").text(ch, fs, 6.0, fontPath=FONT, halign="center", valign="center").val()
            bb = g.BoundingBox()
            g = g.translate((-(bb.xmin + bb.xmax) / 2, 0, 0))
            glyphs.append(g); breiten.append(bb.xlen)
        sp = sperr * fs
        total = sum(breiten) + sp * (len(breiten) - 1)
        s = -total / 2
        for g, bw in zip(glyphs, breiten):
            mitte = s + bw / 2; s += bw + sp
            if g is None: continue
            # Glyph liegt bei y in [-6, 0]; auf r = 31..37 schieben, an Höhe setzen, drehen
            g = g.translate((0, -31.0, z_mitte))
            winkel = winkel_mitte + math.degrees(mitte / R_DOSE)
            teile.append(g.rotate((0, 0, 0), (0, 0, 1), winkel))
    zeile(MARKE, 15.0, 96.0)
    zeile(UNTERZEILE, 7.0, 79.0, sperr=0.22)
    zeile(ZEILE_UNTEN, 5.5, 42.0, sperr=0.12)
    zeile(RUECKSEITE, 5.0, 96.0, winkel_mitte=180.0, sperr=0.10)
    schale = (cq.Solid.makeCylinder(R_DOSE + RELIEF, 140, cq.Vector(0, 0, 8))
              .cut(cq.Solid.makeCylinder(R_DOSE - 0.25, 140, cq.Vector(0, 0, 8))))
    glyph_comp = cq.Compound.makeCompound(teile)
    schrift = glyph_comp.intersect(schale)
    # Zierringe mit 45°-Fasen (druckbar)
    def ring(zc):
        return revolve(lambda w: w.moveTo(R_DOSE - 0.25, zc - 1.2).lineTo(R_DOSE, zc - 1.2)
                       .lineTo(R_DOSE + RELIEF, zc - 1.2 + RELIEF).lineTo(R_DOSE + RELIEF, zc + 1.2 - RELIEF)
                       .lineTo(R_DOSE, zc + 1.2).lineTo(R_DOSE - 0.25, zc + 1.2))
    relief = schrift.fuse(ring(30.0)).fuse(ring(62.0)).fuse(ring(124.0)).clean()
    return relief

def lasche_2d():
    aussen = unary_union([Point(-9.5, 0).buffer(6.6, 64), Point(1.8, -3.4).buffer(3.2, 64),
                          Point(1.8, 3.4).buffer(3.2, 64)]).convex_hull
    finger = unary_union([Point(-10.3, 0).buffer(4.0, 64), Point(-6.3, 0).buffer(2.4, 64)]).convex_hull
    return aussen, finger

def lasche(z_unten, nietloch=None):
    aussen, finger = lasche_2d()
    t = 1.2
    s = cq.Workplane("XY").polyline(list(aussen.exterior.coords)[:-1]).close().extrude(t)
    try:
        s = s.faces(">Z").edges().fillet(0.45)
    except Exception:
        pass
    s = s.cut(cq.Workplane("XY").polyline(list(finger.exterior.coords)[:-1]).close().extrude(t + 1).translate((0, 0, -0.5)))
    if nietloch:
        s = s.cut(cq.Workplane("XY").circle(nietloch).extrude(t + 1).translate((0, 0, -0.5)))
    return s.val().translate((0, 0, z_unten))

def rumpf(mit_relief=True, lasche_integriert=True):
    body = huelle_rumpf()
    loft, z0, oe = trichter()
    unten = revolve(lambda w: w.moveTo(0, Z_FUGE - 1).lineTo(FUGE_FLACH + 1, Z_FUGE - 1)
                    .lineTo(FUGE_FLACH, Z_FUGE).lineTo(R_INNEN, Z_FUGE + FUGE_FLACH - R_INNEN)
                    .lineTo(R_INNEN, z0).lineTo(0, z0))
    # flache Prägung (Deboss) rund um die Öffnung, wie bei echten Deckeln
    prag2d = oe.buffer(1.6, 64).intersection(Point(0, 0).buffer(23.4, 256))
    pragung = (cq.Workplane("XY").polyline(list(prag2d.exterior.coords)[:-1]).close()
               .extrude(2.0).translate((0, 0, Z_PANEL - 0.3)).val())
    hohl = unten.fuse(loft).clean()
    body = body.cut(hohl).cut(pragung)
    # eingedrücktes Verschlussblech (Lappen) an der Scharnierseite
    lap2d = oe.intersection(box(X_SCHARNIER, -100, X_SCHARNIER + LAPPEN_L - 0.5, 100)).buffer(-0.5, 32)
    lap_pts = [(x - X_SCHARNIER, y) for x, y in list(lap2d.exterior.coords)[:-1]]
    lap = cq.Workplane("XY").polyline(lap_pts).close().extrude(LAPPEN_T).val()
    # Plattenebene: x' = Abstand vom Scharnier (wird nach unten gedreht), Dicke Richtung +Z -> Hohlraum
    lap = lap.translate((0, 0, -LAPPEN_T)).rotate((0, 0, 0), (0, 1, 0), LAPPEN_WINKEL)
    lap = lap.translate((X_SCHARNIER, 0, Z_PANEL - DECKEL_T))
    lap = lap.intersect(hohl.translate((0, 0, 0)))
    body = body.fuse(lap)
    body = fuse_teile(body, gewinde_mutter())
    # Niete
    if lasche_integriert:
        body = body.fuse(lasche(Z_PANEL - 0.05))
        niet = cq.Solid.makeSphere(2.0).translate((0, 0, Z_PANEL + 1.15 - 1.3)).intersect(
            cq.Solid.makeCylinder(3, 3, cq.Vector(0, 0, Z_PANEL + 1.1)))
        body = body.fuse(niet)
    else:
        stift = cq.Solid.makeCylinder(1.5, 1.25, cq.Vector(0, 0, Z_PANEL - 0.05))
        kopf = cq.Solid.makeSphere(1.6).translate((0, 0, Z_PANEL + 1.2 - 1.2)).intersect(
            cq.Solid.makeCylinder(3, 3, cq.Vector(0, 0, Z_PANEL + 1.2)))
        body = body.fuse(stift).fuse(kopf)
    if mit_relief:
        body = body.fuse(etikett_relief())
    return body.clean(), z0

def boden():
    top_ch = 0.8
    def prof(w):
        return (w.moveTo(0, Z_ZAPFEN).lineTo(R_M_MIN - top_ch, Z_ZAPFEN).lineTo(R_M_MIN, Z_ZAPFEN - top_ch)
                 .lineTo(R_M_MIN, Z_FUGE + FUGE_FLACH - 0.3 - R_M_MIN).lineTo(FUGE_FLACH - 0.3, Z_FUGE)
                 .lineTo(R_DOSE, Z_FUGE)
                 .spline([(32.6, 8.0), (31.2, 5.6), (28.8, 3.2), (26.6, 1.5), (25.5, 0.65)], includeCurrent=True)
                 .threePointArc((24.85, 0.0), (24.2, 0.65))
                 .lineTo(23.6, 3.0)
                 .threePointArc((12.0, 7.52), (0, 9.0)))
    b = revolve(prof)
    return fuse_teile(b, gewinde_bolzen())

def export_stl(shape, path, ang=0.15):
    """Tesselieren, dann Netz bereinigen (Punkte verschmelzen, entartete Dreiecke entfernen)."""
    import trimesh
    cq.exporters.export(cq.Workplane().add(shape), path, tolerance=TOL, angularTolerance=ang)
    m = trimesh.load(path, process=False)
    m.merge_vertices(digits_vertex=4)
    m.update_faces(m.nondegenerate_faces(height=1e-7))
    m.update_faces(m.unique_faces())
    m.remove_unreferenced_vertices()
    trimesh.repair.fix_normals(m)
    m.export(path)
    print(f"  STL {os.path.relpath(path, OUT)}  ({len(m.faces)} Dreiecke, wasserdicht: {m.is_watertight})")

def export_viewer_stl(shape, path):
    """Viewer-Netz: Rotationsflächen fein (glatte Spiegelungen), Gewinde/Trichter grob (kleine Datei)."""
    import trimesh
    V, F, n = [], [], 0
    for f in shape.Faces():
        typ = f.geomType()
        ang = {"REVOLUTION": 0.04, "CONE": 0.04, "CYLINDER": 0.04, "TORUS": 0.15, "SPHERE": 0.2}.get(typ, 0.3)
        vs, ts = f.tessellate(0.06 if typ != "BSPLINE" else 0.05, ang)
        if not ts: continue
        V.append(np.array([v.toTuple() for v in vs])); F.append(np.array(ts) + n); n += len(vs)
    m = trimesh.Trimesh(np.vstack(V), np.vstack(F), process=True)
    m.export(path)
    print(f"  STL {os.path.relpath(path, OUT)}  ({len(m.faces)} Dreiecke, Viewer)")

def main():
    os.makedirs(f"{OUT}/stl/mehrfarbig", exist_ok=True)
    os.makedirs(f"{OUT}/step", exist_ok=True)
    os.makedirs(f"{OUT}/viewer/modell", exist_ok=True)
    info = {}
    print("Rumpf ...")
    body, z0 = rumpf(True, True)
    print("  gültig:", body.isValid(), "Trichterbasis z =", round(z0, 1))
    body_basis, _ = rumpf(False, True)
    body_ohne_lasche, _ = rumpf(True, False)
    relief = etikett_relief()
    print("Boden ...")
    bod = boden()
    print("  gültig:", bod.isValid())
    las = lasche(0.0, nietloch=1.7)

    # Kollisionsprüfung Gewinde in mehreren Einschraubstellungen
    kol = []
    for grad in (0, 45, 90, 180, 270, 360, 540, 720, 1080):
        b2 = bod.rotate((0, 0, 0), (0, 0, 1), -grad).translate((0, 0, -STEIGUNG * grad / 360))
        kol.append(round(body.intersect(b2).Volume(), 4))
    print("  Überschneidung Rumpf/Boden beim Ausschrauben [mm³]:", kol)
    info["kollision_schraubbewegung_mm3"] = kol
    # Gegenprobe: falsche Bewegungen MÜSSEN kollidieren (zeigt, dass die Prüfung greift)
    info["gegenprobe_nur_drehen_90grad_mm3"] = round(body.intersect(bod.rotate((0, 0, 0), (0, 0, 1), 90)).Volume(), 1)
    info["gegenprobe_1mm_angehoben_mm3"] = round(body.intersect(bod.translate((0, 0, 1))).Volume(), 1)

    # Innenvolumen: Hohlraum oberhalb des Zapfens
    aussen_voll = huelle_rumpf().fuse(cq.Solid.makeCylinder(R_DOSE, Z_FUGE, cq.Vector(0, 0, 0)))
    gesamt = cq.Solid.makeCylinder(40, 200, cq.Vector(0, 0, Z_ZAPFEN))
    innen = aussen_voll.intersect(gesamt).cut(body_basis).cut(bod)
    # nur geschlossener Innenraum (Öffnungskanal ist vernachlässigbar)
    info["innenvolumen_ml"] = round(innen.Volume() / 1000, 1)
    info["trichterbasis_z"] = round(z0, 2)
    print("  Innenvolumen ca.", info["innenvolumen_ml"], "ml")

    # ---- STEP ----
    assy = cq.Assembly(name="Bierdose_Aschenbecher")
    assy.add(body_basis, name="Rumpf", color=cq.Color(0.75, 0.76, 0.78))
    assy.add(relief, name="Etikett_Relief", color=cq.Color(0.85, 0.68, 0.25))
    assy.add(bod, name="Schraubboden", color=cq.Color(0.75, 0.76, 0.78))
    assy.save(f"{OUT}/step/bierdose_baugruppe.step")
    for name, shp in [("dosenkoerper", body), ("schraubboden", bod), ("zuglasche", las)]:
        cq.exporters.export(cq.Workplane().add(shp), f"{OUT}/step/{name}.step")
    print("  STEP geschrieben")

    # ---- STL in Druckorientierung ----
    druck_rumpf = lambda s: s.translate((0, 0, -Z_FUGE))
    druck_boden = lambda s: s.rotate((0, 0, 0), (1, 0, 0), 180).translate((0, 0, Z_ZAPFEN))
    export_stl(druck_rumpf(body), f"{OUT}/stl/dosenkoerper.stl")
    export_stl(druck_rumpf(body_ohne_lasche), f"{OUT}/stl/dosenkoerper_ohne_lasche.stl")
    export_stl(druck_boden(bod), f"{OUT}/stl/schraubboden.stl", ang=0.04)
    export_stl(las, f"{OUT}/stl/zuglasche.stl")
    export_stl(druck_rumpf(body_basis), f"{OUT}/stl/mehrfarbig/dosenkoerper_basis.stl")
    export_stl(druck_rumpf(relief), f"{OUT}/stl/mehrfarbig/etikett_relief.stl")

    # ---- Baugruppen-Koordinaten für Viewer/Renderings ----
    rumpf_ohne_lasche_ohne_relief, _ = rumpf(False, False)
    export_viewer_stl(rumpf_ohne_lasche_ohne_relief, f"{OUT}/viewer/modell/rumpf.stl")
    export_stl(relief, f"{OUT}/viewer/modell/relief.stl")
    export_viewer_stl(bod, f"{OUT}/viewer/modell/boden.stl")
    export_stl(lasche(Z_PANEL + 0.0, nietloch=1.7), f"{OUT}/viewer/modell/lasche.stl")
    niet = cq.Solid.makeSphere(2.0).translate((0, 0, Z_PANEL + 1.15 - 1.3)).intersect(
        cq.Solid.makeCylinder(3, 3, cq.Vector(0, 0, Z_PANEL + 1.15))).fuse(
        cq.Solid.makeCylinder(1.7, 1.25, cq.Vector(0, 0, Z_PANEL - 0.05)))
    export_stl(niet, f"{OUT}/viewer/modell/niet.stl")

    for name, shp in [("dosenkoerper", body), ("schraubboden", bod), ("zuglasche", las)]:
        bb = shp.BoundingBox()
        info[name] = {"volumen_cm3": round(shp.Volume() / 1000, 1),
                      "bbox_mm": [round(bb.xlen, 1), round(bb.ylen, 1), round(bb.zlen, 1)]}
    with open(f"{OUT}/cad/kennwerte.json", "w") as f:
        json.dump(info, f, indent=2, ensure_ascii=False)
    print(json.dumps(info, indent=2, ensure_ascii=False))

if __name__ == "__main__":
    main()
