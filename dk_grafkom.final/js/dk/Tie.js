"use strict";
/* Dasi merah "DK".
 *   NeckBand : pita leher = KURVA BEZIER 3D TERTUTUP (4 busur kubik) lalu dijadikan tube
 *   Knot     : simpul dasi
 *   Blade    : lembar dasi = bidang datar LURUS (vertikal), tidak mengikuti lengkung badan.
 *              Diletakkan tepat di depan bagian dada/perut yang paling menonjol.
 */

const TIE = { top: 1.36, len: 1.18 };

/** z bidang dasi: sedikit di depan titik terdepan badan sepanjang dasi (supaya tidak tertutup bulu/dada) */
const TIE_Z = (() => {
  let m = -Infinity;
  for (let y = TIE.top; y >= TIE.top - TIE.len; y -= 0.02) for (const x of [-0.215, 0, 0.215]) m = Math.max(m, torsoFrontZ(x, y));
  return m + 0.025;
})();

/** setengah lebar dasi pada posisi s (0 = simpul, 1 = ujung runcing) */
function tieHalfWidth(s) {
  const sm = (t) => t * t * (3 - 2 * t);
  if (s < 0.12) return lerp(0.075, 0.10, s / 0.12);
  if (s < 0.40) return lerp(0.10, 0.215, sm((s - 0.12) / 0.28));
  if (s < 0.78) return 0.215;
  return 0.215 * (1 - (s - 0.78) / 0.22);
}

/** Elips mengelilingi leher, dibentuk dari 4 segmen Bezier kubik (13 titik kontrol).
 *  Handle tiap segmen = turunan elips x (Δθ/3) -> hampir sama persis dengan elips. */
function collarCurve() {
  const cz = -0.04, rx = 0.80, rz = 0.58;
  const P = (th) => [rx * Math.sin(th), 1.42 - 0.08 * Math.cos(th), cz + rz * Math.cos(th)];
  const D = (th) => [rx * Math.cos(th), 0.08 * Math.sin(th), -rz * Math.sin(th)];
  const d = Math.PI / 2, pts = [P(0)];
  for (let k = 0; k < 4; k++) {
    const t0 = k * d, t1 = t0 + d, p0 = P(t0), p3 = P(t1);
    pts.push(V3.add(p0, V3.scale(D(t0), d / 3)), V3.sub(p3, V3.scale(D(t1), d / 3)), p3);
  }
  return new BezierCurve3D(pts);
}

class Knot extends BodyPart {
  constructor() {
    super('Knot');
    this.ellipsoid(C.red, [0.135, 0.10, 0.14], [0, TIE.top - 0.02, TIE_Z - 0.09], { shine: 0.25 });   // agak tebal ke belakang -> menyambung ke dada
  }
}

class Blade extends BodyPart {
  constructor() {
    super('Blade');
    // pita datar lurus: x mengikuti lebar dasi, y turun lurus, z konstan (TIE_Z); sedikit tebal agar solid dari samping
    const T = 0.0175, X = (s) => tieHalfWidth(s), Y = (s) => TIE.top - s * TIE.len;
    const front = geoRibbon(30, 2, (s, c) => [c * X(s), Y(s), TIE_Z + T]);
    const back = geoRibbon(30, 2, (s, c) => [c * X(s), Y(s), TIE_Z - T]);
    const edgeL = geoRibbon(30, 1, (s, c) => [-X(s), Y(s), TIE_Z + c * T]);
    const edgeR = geoRibbon(30, 1, (s, c) => [X(s), Y(s), TIE_Z + c * T]);
    this.custom(front, C.red, { tex: MESH.tieTex, shine: 0.3 });                                  // sisi depan bertekstur "DK"
    this.custom(mergeGeo([back, edgeL, edgeR]), hex('#a8221a'), { shine: 0.2 });                   // sisi belakang dan tepi
  }
}

class Tie extends BodyPart {
  constructor() {
    super('Tie');
    this.knot = this.add(new Knot());
    this.blade = this.add(new Blade());
  }
}