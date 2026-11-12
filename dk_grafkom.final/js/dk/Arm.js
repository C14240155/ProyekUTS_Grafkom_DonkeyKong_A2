"use strict";
/* Rantai lengan (HIERARCHICAL):
 *   Arm (bahu + lengan atas) -> Forearm (siku) -> Hand (pergelangan) -> Finger -> FingerTip
 * Setiap class hanya tahu bentuknya sendiri; posisi sendi ditentukan oleh induknya.
 * Lengan menggantung ke bawah (-y). side=+1 -> sisi +x, side=-1 -> sisi -x. */

const UPPER_ARM = 0.9, FOREARM = 0.9;

class FingerTip extends BodyPart {
  constructor(name, len, rad) {
    super(name);
    this.ellipsoid(C.tan, [rad * 0.92, len * 0.42, rad * 0.88], [0, -len * 0.32, 0]);
  }
}

class Finger extends BodyPart {
  constructor(name, len, rad) {
    super(name);
    this.ellipsoid(C.tan, [rad, len * 0.5, rad * 0.95], [0, -len * 0.45, 0]);
    this.tip = this.add(new FingerTip(name + 'Tip', len, rad)).at(0, -len * 0.85, 0);
  }
}

class Hand extends BodyPart {
  constructor(side) {
    super(side > 0 ? 'HandL' : 'HandR');
    this.side = side;
    this.ellipsoid(C.tan, [0.16, 0.27, 0.27], [0, -0.2, 0.0]);                       // telapak
    for (let i = 0; i < 10; i++) {                                                   // ujung bulu compang-camping di pergelangan (kerucut = quadric)
      const a = (i / 10) * 2 * Math.PI;
      this.cone(C.fur, [0.075, 0.30, 0.075], [0.2 * Math.cos(a), -0.02, 0.2 * Math.sin(a)], { rot: [Math.PI, 0, 0], fur: true });
    }
    const lens = [0.25, 0.31, 0.30, 0.24], zs = [-0.2, -0.07, 0.06, 0.19];
    this.fingers = lens.map((l, i) => this.add(new Finger('Finger' + (i + 1), l, 0.07)).at(0, -0.41, zs[i]));
    this.thumb = this.add(new Finger('Thumb', 0.26, 0.08)).at(0, -0.28, 0.25);
    this.thumb.rotation = [-0.8, 0, 0];
  }
  /** c = 0 (jari lurus) ... 1 (menggenggam). Jari menekuk ke arah telapak. */
  curl(c, wave = null) {
    const s = -this.side;
    this.fingers.forEach((f, i) => {
      const ci = c + (wave ? wave[i] : 0);
      f.rotation[2] = s * ci * 0.95; f.tip.rotation[2] = s * ci * 1.15;
    });
    this.thumb.rotation[2] = s * c * 0.5; this.thumb.tip.rotation[2] = s * c * 0.7;
  }
}

class Forearm extends BodyPart {
  constructor(side) {
    super(side > 0 ? 'ForearmL' : 'ForearmR');
    this.ellipsoid(C.fur, [0.37, 0.37, 0.37], [0, 0, 0], { fur: true });                // sendi siku
    this.ellipsoid(C.fur, [0.40, 0.55, 0.40], [0, -0.45, 0], { fur: true });            // lengan bawah
    this.hand = this.add(new Hand(side)).at(0, -FOREARM, 0);
  }
}

class Arm extends BodyPart {
  constructor(side) {
    super(side > 0 ? 'ArmL' : 'ArmR');
    this.side = side;
    this.ellipsoid(C.fur, [0.50, 0.46, 0.50], [0, 0.02, 0], { fur: true });             // bahu
    this.ellipsoid(C.fur, [0.42, 0.56, 0.42], [0, -0.45, 0], { fur: true });            // lengan atas
    this.forearm = this.add(new Forearm(side)).at(0, -UPPER_ARM, 0);
  }
  get hand() { return this.forearm.hand; }
}
