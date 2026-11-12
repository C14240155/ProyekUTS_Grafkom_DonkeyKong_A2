"use strict";
/* Donkey Kong = akar (root) hierarki. Titik asal di tanah, di antara kedua kaki.
 *
 *   DonkeyKong
 *    ├─ Torso ─┬─ Chest
 *    │         ├─ Head ─┬─ Muzzle ─┬─ Nostril ×2, Mouth (kurva)
 *    │         │        ├─ Hair (3 kurva) ├─ Eye ×2 ─ Pupil ├─ Brow ×2 └─ Ear ×2
 *    │         ├─ Tie ─┬─ NeckBand (kurva) ├─ Knot └─ Blade
 *    │         └─ Arm ×2 ─ Forearm ─ Hand ─ Finger ×4 + Thumb ─ FingerTip
 *    └─ Leg ×2 ─ Shin ─ Foot ─ Toe ×5
 */

/* pose lengan sisi kiri (+x): [bahu x,y,z, siku x,y,z] dalam radian.
 * Sisi kanan dicerminkan otomatis (y dan z dibalik tandanya). */
const ARM_REST = [-0.12, 0, 0.30, -0.35, 0, 0];

class DonkeyKong extends BodyPart {
  constructor() {
    super('DonkeyKong');
    this.torso = this.add(new Torso()).at(0, 1.0, 0);
    this.head = this.torso.add(new Head()).at(0, 1.95, 0.18);
    this.tie = this.torso.add(new Tie());
    this.armL = this.torso.add(new Arm(1)).at(0.95, 1.15, 0);
    this.armR = this.torso.add(new Arm(-1)).at(-0.95, 1.15, 0);
    this.legL = this.add(new Leg(1)).at(0.46, 1.02, 0);
    this.legR = this.add(new Leg(-1)).at(-0.46, 1.02, 0);

    // pose awal: sedikit membungkuk, lengan menggantung, jari setengah menggenggam
    this.torso.rotation[0] = 0.08;
    this.head.rotation[0] = -0.06;
    for (const a of [this.armL, this.armR]) { this.setArm(a, ARM_REST); a.hand.curl(0.45); }
    for (const l of [this.legL, this.legR]) { l.rotation[2] = l.side * 0.10; l.foot.rotation[1] = l.side * 0.15; }
    this.captureRest();
  }

  get arms() { return [this.armL, this.armR]; }
  get legs() { return [this.legL, this.legR]; }

  /** terapkan pose [sx,sy,sz, ex,ey,ez] ke satu lengan (dicerminkan sesuai sisi) */
  setArm(arm, P) {
    const s = arm.side;
    arm.rotation = [P[0], s * P[1], s * P[2]];
    arm.forearm.rotation = [P[3], s * P[4], s * P[5]];
  }

  /** siklus jalan: kaki & lengan berayun berlawanan. amp = 0..1 */
  walk(phase, amp) {
    for (const l of this.legs) {
      const ph = phase + (l.side > 0 ? 0 : Math.PI);
      l.rotation[0] += -0.55 * amp * Math.sin(ph);                       // ayun paha (negatif = ke depan)
      l.shin.rotation[0] += 0.8 * amp * Math.max(0, Math.cos(ph));        // lutut menekuk saat kaki diangkat
      l.foot.rotation[0] += 0.12 * amp * Math.sin(ph);
    }
    for (const a of this.arms) {
      const ph = phase + (a.side > 0 ? 0 : Math.PI);
      a.rotation[0] += 0.40 * amp * Math.sin(ph);                         // lengan berlawanan dengan kaki
      a.forearm.rotation[0] += -0.25 * amp * (1 + Math.sin(ph)) * 0.5;
    }
    this.position[1] += 0.10 * amp;                                       // sedikit terangkat agar telapak tidak menembus tanah
    this.torso.position[1] += 0.05 * amp * Math.abs(Math.sin(phase));     // badan naik-turun
    this.torso.rotation[2] += 0.05 * amp * Math.sin(phase);
  }
}
