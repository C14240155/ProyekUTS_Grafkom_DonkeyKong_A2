"use strict";
/* =====================================================================
 *  animation.js  -  Lima demo transformasi sesuai kriteria penilaian.
 *
 *  Tiap frame:  resetPose() -> idle() -> demo.run(p)   (p = 0..1 progres demo)
 *  Semua gerakan memakai easing (ease/pulse) sehingga halus dan pose
 *  kembali persis ke pose awal di akhir demo.
 * ===================================================================== */

/* Pose lengan sisi kiri: [bahu x,y,z, siku x,y,z]. Sisi kanan dicerminkan. */
const POSE = {
  rest: ARM_REST,
  tpose: [0, 0, 1.5, 0, 0, 0],              // lengan lurus ke samping (seperti gambar referensi)
  open: [-0.60, 0.23, 1.46, -2.24, -0.44, 0.24], // lengan terangkat, siap memukul dada
  strike: [-1.17, -0.43, 0.96, -2.36, -0.26, -0.76], // kepalan menghantam dada (hasil kalibrasi numerik)
};
const lerpPose = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));
const f2 = (v) => (Math.abs(v) < 0.005 ? 0 : v).toFixed(2);   // format angka (tanpa -0.00)

const DEMOS = [
  /* ---------- 1. TRANSLATE ---------- */
  {
    id: 'translate', name: 'Translate', dur: 14,
    run(p, A) {
      const dk = A.dk, PI = Math.PI;
      const wp = [[0, 0], [2.6, 0], [2.6, -3], [-1.8, -3], [0, 0]];               // titik tujuan (x, z)
      const win = [[0.06, 0.26], [0.31, 0.50], [0.55, 0.72], [0.78, 0.93]];       // waktu tiap ruas jalan
      const yawKeys = [[0, 0], [0.06, PI / 2], [0.26, PI / 2], [0.31, PI], [0.50, PI], [0.55, 1.5 * PI],
        [0.72, 1.5 * PI], [0.78, 6.823], [0.93, 6.823], [1.0, 2 * PI]];             // arah hadap DK (menoleh ke arah jalan)
      let x = 0, z = 0, dist = 0, amp = 0;
      win.forEach((w, i) => {
        const e = easeSeg(p, w[0], w[1]);
        const dx = wp[i + 1][0] - wp[i][0], dz = wp[i + 1][1] - wp[i][1];
        x += dx * e; z += dz * e; dist += Math.hypot(dx, dz) * e;
        if (p > w[0] && p < w[1]) amp = clamp(Math.sin(PI * seg(p, w[0], w[1])) * 2.5);
      });
      let yaw = 0;
      for (let i = 0; i < yawKeys.length - 1; i++) if (p >= yawKeys[i][0]) yaw = lerp(yawKeys[i][1], yawKeys[i + 1][1], easeSeg(p, yawKeys[i][0], yawKeys[i + 1][0]));
      const jh = Math.sin(PI * seg(p, 0.93, 1.0));                                   // lompat kecil di akhir
      dk.position = [x, 0.6 * jh, z];
      dk.rotation[1] = yaw;
      dk.walk((dist / 1.3) * 2 * PI, amp);
      for (const l of dk.legs) { l.shin.rotation[0] += 0.9 * jh; l.rotation[0] -= 0.4 * jh; }
      const b = A.scene.heroBanana;                                                  // pisang ikut bergeser
      b.position[0] += 3.0 * pulse(p, 0, 1);
      b.position[1] += 0.5 * Math.sin(4 * PI * p);
      return `Translate   T(x, y, z) = (${f2(x)}, ${f2(0.6 * jh)}, ${f2(z)})   M = T · Ry(arah hadap)`;
    },
  },

  /* ---------- 2. ROTATE ---------- */
  {
    id: 'rotate', name: 'Rotate', dur: 10,
    run(p, A) {
      const dk = A.dk, PI = Math.PI;
      const ry = 2 * PI * easeSeg(p, 0, 0.45);                                       // putar 360° terhadap sumbu Y
      const rx = 0.45 * pulse(p, 0.48, 0.72);                                        // membungkuk (sumbu X)
      const rz = 0.35 * Math.sin(2 * PI * easeSeg(p, 0.74, 0.98));                   // miring kiri-kanan (sumbu Z)
      dk.rotation = [0, ry, 0];                                                      // seluruh badan berputar di sumbu Y
      dk.torso.rotation[0] += rx;                                                    // torso membungkuk (sumbu X) -> kaki tetap di tanah
      dk.torso.rotation[2] += rz;                                                    // torso miring (sumbu Z)
      dk.head.rotation[0] -= rx * 0.6;
      dk.head.rotation[1] += 0.7 * Math.sin(2 * PI * easeSeg(p, 0.1, 0.4));
      const open = lerpPose(POSE.rest, [-0.05, 0, 0.85, -0.1, 0, 0], pulse(p, 0, 0.5));
      dk.arms.forEach((a) => dk.setArm(a, open));
      A.scene.bongo.rotation[1] += 2 * PI * easeSeg(p, 0, 0.9);
      return `Rotate   Rx = ${deg(rx).toFixed(0)}°   Ry = ${deg(ry % (2 * PI)).toFixed(0)}°   Rz = ${deg(rz).toFixed(0)}°   M = Ry · Rx · Rz`;
    },
  },

  /* ---------- 3. SCALING ---------- */
  {
    id: 'scale', name: 'Scaling', dur: 9,
    run(p, A) {
      const dk = A.dk;
      const u = 1 + 0.6 * pulse(p, 0, 0.36);                                         // membesar seragam
      const sq = pulse(p, 0.38, 0.68), st = pulse(p, 0.7, 1.0);                      // gepeng, lalu menjulang (tidak seragam)
      const sx = u * (1 + 0.3 * sq - 0.2 * st), sy = u * (1 - 0.28 * sq + 0.4 * st);
      dk.scale = [sx, sy, sx];
      const k = 1 + pulse(p, 0, 0.5);
      A.scene.heroBanana.scale = A.scene.heroBanana.scale.map((v) => v * k);
      const kb = 1 + 0.5 * pulse(p, 0.2, 0.7);
      A.scene.bongo.scale = [kb, kb, kb];
      return `Scaling   S(sx, sy, sz) = (${f2(sx)}, ${f2(sy)}, ${f2(sx)})   M = T · R · S`;
    },
  },

  /* ---------- 4. ROTATE ARBITRARY AXIS ---------- */
  {
    id: 'axis', name: 'Rotate Arbitrary Axis', dur: 12,
    run(p, A) {
      const dk = A.dk, PI = Math.PI, b = A.scene.heroBanana;
      const axis = V3.norm([0.22, 1, 0.16]);                                         // sumbu sembarang (miring ~15°)
      const ang = 2 * PI * easeSeg(p, 0.05, 0.7);
      const jump = 0.3 * Math.sin(PI * seg(p, 0.05, 0.7));
      dk.position[1] += jump;
      dk.axisRot = { axis, angle: ang, pivot: [0, 0, 0] };                           // DK berputar di sekitar sumbu miring
      const q = [0, jump, 0];                                                        // titik yang dilalui sumbu
      b.axisRot = { axis, angle: 4 * PI * easeSeg(p, 0, 0.95), pivot: V3.sub(q, b.position) }; // pisang mengorbit sumbu yang sama
      A.scene.axis = { p: q, dir: axis, from: -1.5, to: 6.5, color: [1, 0.85, 0.1] };
      return `Rotate Arbitrary Axis   a = (${axis.map((v) => v.toFixed(2)).join(', ')})   θ = ${deg(ang).toFixed(0)}°   R = T(q) · Rodrigues(a, θ) · T(-q)`;
    },
  },

  /* ---------- 5. HIERARCHICAL TRANSFORMATION ---------- */
  {
    id: 'hier', name: 'Hierarchical', dur: 16,
    run(p, A) {
      const dk = A.dk, PI = Math.PI;
      const aT = easeSeg(p, 0, 0.16), aOpen = easeSeg(p, 0.30, 0.38), aBack = easeSeg(p, 0.86, 1.0);
      const env = easeSeg(p, 0.38, 0.43) * (1 - easeSeg(p, 0.82, 0.86));            // selubung pemukulan dada
      const bt = seg(p, 0.38, 0.86), cycles = 4;
      const waveEnv = Math.sin(PI * seg(p, 0.16, 0.30)), ws = seg(p, 0.16, 0.30);
      let Pshow = POSE.rest;
      const strikes = [0, 0];
      dk.arms.forEach((a, k) => {
        let P = lerpPose(POSE.rest, POSE.tpose, aT);                                 // 1. bahu naik -> T-pose (siku, tangan, jari ikut)
        P = lerpPose(P, POSE.open, aOpen);                                           // 2. siap memukul
        const s = env * (0.5 - 0.5 * Math.cos(2 * PI * (bt * cycles + k * 0.5)));    // 3. pukul dada bergantian
        strikes[k] = s;
        P = lerpPose(P, POSE.strike, s);
        P = lerpPose(P, POSE.rest, aBack);                                           // 4. kembali
        dk.setArm(a, P);
        if (k === 0) Pshow = P;
        let curl = lerp(lerp(0.45, 0.05, aT), 0.9, aOpen);
        curl = lerp(curl, 1.0, s);
        curl = lerp(curl, 0.45, aBack);
        const wave = [0, 1, 2, 3].map((i) => 0.55 * waveEnv * (0.5 - 0.5 * Math.cos(2 * PI * (3 * ws + i * 0.12))));
        a.hand.curl(curl, wave);                                                     // 5. jari (anak paling bawah) ikut menekuk
      });
      dk.head.rotation[0] += -0.18 * env;
      dk.head.rotation[2] += 0.06 * (strikes[0] - strikes[1]);
      dk.torso.rotation[2] += 0.05 * (strikes[0] - strikes[1]);
      const impact = Math.max(strikes[0], strikes[1]);
      dk.torso.scale[0] *= 1 + 0.025 * impact;
      return `Hierarchical   R_tangan = R_bahu · R_siku · R_pergelangan · R_jari   (bahu ${deg(Pshow[2]).toFixed(0)}°, siku ${deg(Math.abs(Pshow[3])).toFixed(0)}°)`;
    },
  },
];

class Animator {
  constructor(scene) {
    this.scene = scene; this.dk = scene.dk;
    this.t = 0; this.cur = null; this.elapsed = 0; this.queue = [];
    this.info = ''; this.onChange = null;
  }
  play(id) { this.queue = []; this._start(DEMOS.find((d) => d.id === id)); }
  playAll() { this.queue = DEMOS.slice(1); this._start(DEMOS[0]); }
  stop() { this.queue = []; this.cur = null; if (this.onChange) this.onChange(null); }
  _start(d) { this.cur = d; this.elapsed = 0; if (this.onChange) this.onChange(d.id); }

  /** gerakan kecil yang selalu ada: bernapas, kepala bergoyang, pisang melayang, awan bergeser */
  idle() {
    const t = this.t, dk = this.dk, b = Math.sin(t * 1.8);
    dk.torso.scale = [1 + 0.010 * b, 1 + 0.014 * b, 1 + 0.010 * b];
    dk.head.rotation[0] += 0.03 * Math.sin(t * 1.2);
    dk.head.rotation[1] += 0.14 * Math.sin(t * 0.5);
    for (const a of dk.arms) { a.rotation[2] += a.side * 0.02 * b; a.forearm.rotation[0] += 0.03 * Math.sin(t * 1.8 + 1); }
    const hb = this.scene.heroBanana;
    hb.position[1] += 0.15 * Math.sin(t * 1.4);
    hb.rotation[1] += t * 0.6;
    for (const c of this.scene.clouds) c.position[0] = ((c.rest.p[0] + t * c.speed + 45) % 90) - 45;
  }

  update(dt) {
    dt = Math.min(dt, 0.05);
    this.t += dt;
    this.scene.resetPose();
    this.scene.axis = null;
    this.idle();
    this.info = '';
    if (this.cur) {
      this.elapsed += dt;
      const p = Math.min(1, this.elapsed / this.cur.dur);
      this.info = this.cur.run(p, this) || '';
      if (this.elapsed >= this.cur.dur) {
        const next = this.queue.shift();
        if (next) this._start(next); else this.stop();
      }
    }
  }
}
