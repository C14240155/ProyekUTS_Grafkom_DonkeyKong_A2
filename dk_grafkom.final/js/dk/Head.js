"use strict";
/* Kepala Donkey Kong. Titik asal Head = pusat tengkorak.
 * side = +1 -> sisi +x (kiri DK, karena DK menghadap +z), side = -1 -> sisi -x (kanan DK) */

class Pupil extends BodyPart {
  constructor() {
    super('Pupil');
    this.ellipsoid(C.black, [0.045, 0.06, 0.022], [0, 0, 0.062], { shine: 0.8 });
  }
}

class Eye extends BodyPart {
  constructor(side) {
    super(side > 0 ? 'EyeL' : 'EyeR');
    this.ellipsoid(C.white, [0.10, 0.115, 0.08], [0, 0, 0], { shine: 0.6 });
    this.pupil = this.add(new Pupil());
    this.pupil.at(-side * 0.012, 0, 0);       // pupil sedikit ke tengah -> tatapan tajam
    this.rotation = [0, side * 0.12, 0];
  }
}

class Brow extends BodyPart {
  constructor(side) {
    super(side > 0 ? 'BrowL' : 'BrowR');
    this.ellipsoid(C.tanDark, [0.25, 0.10, 0.15], [0, 0, 0]);                       // tonjolan alis
    this.ellipsoid(C.furDark, [0.23, 0.05, 0.12], [0, 0.085, -0.02], { fur: true }); // bulu alis
    this.rotation = [0, 0, side * 0.32];                                             // ujung dalam lebih rendah -> marah
  }
}

class Ear extends BodyPart {
  constructor(side) {
    super(side > 0 ? 'EarL' : 'EarR');
    this.ellipsoid(C.fur, [0.07, 0.17, 0.15], [0, 0, -0.02], { fur: true });
    this.ellipsoid(C.tan, [0.055, 0.135, 0.115], [side * 0.04, 0, 0.0]);
  }
}

class Nostril extends BodyPart {
  constructor(side) {
    super(side > 0 ? 'NostrilL' : 'NostrilR');
    this.ellipsoid(C.mouth, [0.05, 0.03, 0.025], [0, 0, 0], { shine: 0.4 });
    this.rotation = [0, 0, -side * 0.5];
  }
}

/* Moncong + dagu */
const MUZZLE = { c: [0, -0.2, 0.4], r: [0.40, 0.28, 0.34] };

/** Mulut = kurva Bezier 3D yang menempel di permukaan moncong */
class Mouth extends BodyPart {
  constructor() {
    super('Mouth');
    const z = (x, y) => { const v = Math.max(ellipsoidZ(MUZZLE.c, MUZZLE.r, x, y)); return (isFinite(v) ? v : 0.55) + 0.06; };
    const pts = [[-0.30, -0.30], [-0.14, -0.43], [0.14, -0.43], [0.30, -0.30]].map(([x, y]) => [x, y, z(x, y)]);
    const curve = new BezierCurve3D(pts);
    this.custom(geoTube(curve, { tSeg: 24, rSeg: 6, radius: () => 0.014 }), C.mouth);
    this.addCurve(curve);
  }
}

class Muzzle extends BodyPart {
  constructor() {
    super('Muzzle');
    this.ellipsoid(C.tan, MUZZLE.r, MUZZLE.c, { shine: 0.1 });
    for (const s of [1, -1]) {
      const x = s * 0.1, y = -0.11, zz = ellipsoidZ(MUZZLE.c, MUZZLE.r, x, y);
      this.add(new Nostril(s)).at(x, y, zz - 0.005);
    }
    this.mouth = this.add(new Mouth());
  }
}

/** Jambul rambut: tiga tube Bezier 3D yang meruncing di ujung */
class Hair extends BodyPart {
  constructor() {
    super('Hair');
    const tuft = (x, scale, dz) => {
      const pts = [[x, 0.42, -0.2 + dz], [x, 0.72 * scale + 0.1, -0.24 + dz], [x * 1.2, 0.92 * scale + 0.05, 0.02 + dz], [x * 1.3, 0.78 * scale + 0.06, 0.40 + dz]];
      const curve = new BezierCurve3D(pts);
      this.custom(geoTube(curve, {
        tSeg: 32, rSeg: 12, squash: 0.7, up: [0, 1, 0],
        radius: (t) => 0.025 + 0.19 * Math.pow(1 - t, 0.7) * Math.min(1, t * 8 + 0.5),
      }), C.furDark, { fur: true });
      this.addCurve(curve);
    };
    tuft(0, 1.0, 0);
    tuft(0.17, 0.78, -0.04);
    tuft(-0.17, 0.78, -0.04);
  }
}

class Head extends BodyPart {
  constructor() {
    super('Head');
    this.ellipsoid(C.fur, [0.56, 0.52, 0.56], [0, 0.05, -0.05], { fur: true });           // tengkorak
    this.ellipsoid(C.fur, [0.24, 0.30, 0.32], [0.40, -0.12, 0.06], { fur: true });        // pipi berbulu kiri
    this.ellipsoid(C.fur, [0.24, 0.30, 0.32], [-0.40, -0.12, 0.06], { fur: true });       // pipi berbulu kanan
    this.ellipsoid(C.tan, [0.40, 0.35, 0.26], [0, 0.0, 0.33]);                            // topeng wajah
    this.muzzle = this.add(new Muzzle());
    this.hair = this.add(new Hair());
    this.eyeL = this.add(new Eye(1)).at(0.155, 0.04, 0.525);
    this.eyeR = this.add(new Eye(-1)).at(-0.155, 0.04, 0.525);
    this.browL = this.add(new Brow(1)).at(0.2, 0.2, 0.47);
    this.browR = this.add(new Brow(-1)).at(-0.2, 0.2, 0.47);
    this.earL = this.add(new Ear(1)).at(0.57, 0.0, -0.02);
    this.earR = this.add(new Ear(-1)).at(-0.57, 0.0, -0.02);
    this.scale = [1.0, 1.0, 1.0];
  }
}
