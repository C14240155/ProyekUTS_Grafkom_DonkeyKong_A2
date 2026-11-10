// timeline.js : shared timeline + reference points, all DERIVED from William's code.
//
// William's code (ProyekUTS_Grafkom_DonkeyKong_A2) is the master timeline. Nothing here
// changes it: we only import its exported constants/functions and read them.
//
// William's real scene boundaries (global seconds T, from Animasi.js / main_bersama.js):
//   1:  0-8   DK dances alone            6: 50-58  sudden brake, DK thrown into the sea
//   2:  8-20  Rambi arrives with news     7: 58-68  water impact aftermath, Enguarde approaches
//   3: 20-30  DK jumps onto Rambi         8: 68-78  Enguarde rescues + carries DK
//   4: 30-40  run around banana tree      9: 78-86  arrival at the shore
//   5: 40-50  sprint to the coast        10: 86-96  trio victory dance
// Scenes 7-8 are the slot William left as a placeholder ("s7-8-placeholder") for teammates.

import { SceneObject } from "../../ProyekUTS_Grafkom_DonkeyKong_A2/SceneObject.js";
import {
    createAnimation, rambiPose,
    SCENE3_START, SCENE4_START, SCENE5_START, SCENE6_START, SCENE6_END,
    SCENE6_SPLASH, SCENE9_START, SCENE9_END, SCENE9_MEET, SCENE10_START, SCENE10_END
} from "../../ProyekUTS_Grafkom_DonkeyKong_A2/Animasi.js";
import { GROUND_W, SEA_Y } from "../../ProyekUTS_Grafkom_DonkeyKong_A2/Environment.js";

export {
    rambiPose, SCENE6_SPLASH, SCENE9_MEET, SEA_Y, GROUND_W,
    SCENE3_START, SCENE4_START, SCENE5_START, SCENE6_START, SCENE6_END,
    SCENE9_START, SCENE9_END, SCENE10_START, SCENE10_END
};

/* ---------------- small math helpers (same style as William's Animasi.js) ---------------- */
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const seg = (T, a, b) => clamp((T - a) / (b - a), 0, 1);
export const ease = (t) => t * t * (3 - 2 * t);
export const eseg = (T, a, b) => ease(seg(T, a, b));
export const lerp = (a, b, t) => a + (b - a) * t;
export const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));
export const lerpAngle = (a, b, t) => a + wrapPi(b - a) * t;
export const bump = (T, a, b) => Math.sin(Math.PI * seg(T, a, b));          // 0 -> 1 -> 0
export const norm3 = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
// heading for a model that faces +Z (William's convention, also DK): forward = (sin h, cos h)
export const headingTo = (from, to) => Math.atan2(to[0] - from[0], to[2] - from[2]);

/* ---------------- scene table ---------------- */
export const SCENE7_START = SCENE6_END;                                   // 58
export const SCENE8_START = (SCENE6_END + SCENE9_START) / 2;              // 68
export const SCENES = [
    { n: 1,  t0: 0,             t1: 8,             name: "DK dancing alone under the banana tree" },
    { n: 2,  t0: 8,             t1: SCENE3_START,  name: "Rambi arrives with news" },
    { n: 3,  t0: SCENE3_START,  t1: SCENE4_START,  name: "DK jumps onto Rambi's back" },
    { n: 4,  t0: SCENE4_START,  t1: SCENE5_START,  name: "Running around the banana tree" },
    { n: 5,  t0: SCENE5_START,  t1: SCENE6_START,  name: "Fast sprint to the coast" },
    { n: 6,  t0: SCENE6_START,  t1: SCENE6_END,    name: "Sudden brake, DK thrown into the sea" },
    { n: 7,  t0: SCENE7_START,  t1: SCENE8_START,  name: "Water impact, Enguarde approaching" },
    { n: 8,  t0: SCENE8_START,  t1: SCENE9_START,  name: "Enguarde rescues and escorts DK" },
    { n: 9,  t0: SCENE9_START,  t1: SCENE9_END,    name: "Arrival at the shore" },
    { n: 10, t0: SCENE10_START, t1: SCENE10_END,   name: "Trio victory dance" },
];
export const END_T = SCENE10_END;
export const sceneAt = (T) => SCENES.find(s => T >= s.t0 && T < s.t1) || (T < 0 ? SCENES[0] : SCENES[SCENES.length - 1]);

/* ---------------- story beats shared by DK, Enguarde, camera and FX ---------------- */
export const BEAT10 = 0.8;                        // = William's S10_BEAT (Rambi jumps once per 0.8 s in scene 10)
export const DK_JUMP0 = 25.2, DK_LAND_RAMBI = 26.5;              // scene 3
export const DK_RELEASE = 50.2;                                  // scene 6: thrown off when Rambi's rear rises
export const DK_SPLASH_T = SCENE6_SPLASH.t;                      // 53.4 (William's splash time)
export const ENG_ARRIVE = 66.4;                                  // Enguarde stops next to DK
export const DK_HOP_ON0 = 67.0, DK_ON_ENG = SCENE8_START;        // DK climbs on, then parented (68)
export const ENG_AT_MEET = SCENE9_MEET.t;                        // 80 (William's meeting time)
export const DK_HOP_OFF0 = 81.6, DK_LAND_BEACH = 82.6;           // scene 9

/* ---------------- terrain height (read-only copy of William's heightFn formula) ----------------
   heightFn is private inside Environment.createEnvironment(), so it is mirrored here
   with the same constants to place DK's feet on the sand. */
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export function groundY(x, z) {
    const SEABED_Y = GROUND_W - 3.2;
    const ridge = Math.max(smooth(-60, -100, x),
        Math.max(smooth(-55, -95, z), smooth(55, 95, z)) * smooth(10, -15, x));
    const bumps = 0.65 + 0.35 * Math.sin(0.09 * z + 0.07 * x);
    return GROUND_W + 0.06 * Math.sin(0.6 * z + 0.3 * x)
        - (GROUND_W - SEABED_Y) * smooth(5, 14, x)
        + 14 * ridge * bumps;
}

/* ---------------- "shadow" Rambi ----------------
   A mesh-less copy of Rambi's node tree, posed by William's own createAnimation().
   It lets us ask "where is Rambi's root at time T?" for ANY T (deterministic, works
   when seeking), without touching the real Rambi that William renders. */
const RAMBI_PARTS = ["body", "legFL", "legFR", "legBL", "legBR", "kneeFL", "kneeFR", "kneeBL", "kneeBR",
    "tailPivot", "head", "snout", "horn", "jawPivot", "jaw", "earL", "earR"];
let shadow = null;

export function initShadowRambi(ctx, realRambiRoot) {
    const parts = {};
    for (const n of RAMBI_PARTS) parts[n] = new SceneObject(ctx, null, n);
    const rambi = { root: parts.body, parts };
    shadow = { rambi, anim: createAnimation({ rambi }), pos: realRambiRoot.POSITION_MATRIX.slice() };
}

// Rambi root matrix in scene space at time T  ( = POSITION * MOVE, William's convention )
export function rambiWorld(T) {
    for (const k in shadow.rambi.parts) LIBS.set_I4(shadow.rambi.parts[k].MOVE_MATRIX);
    shadow.anim.update(T);
    return LIBS.multiply(shadow.rambi.root.MOVE_MATRIX, shadow.pos);
}

// transform a point by a column-major 4x4 matrix
export function xform(m, p) {
    return [
        m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
        m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
        m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]
    ];
}
// heading (+Z model) of a matrix's local +Z axis projected on the ground
export const matHeading = (m) => Math.atan2(m[8], m[10]);

/* ---------------- Catmull-Rom path with arc-length lookup (used by Enguarde + camera) ---------------- */
export function makePath(pts, samplesPerSeg = 24) {
    const P = (i) => pts[clamp(i, 0, pts.length - 1)];
    const cr = (a, b, c, d, t) => {
        const t2 = t * t, t3 = t2 * t;
        return 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
    };
    const xs = [], zs = [], ss = [0];
    for (let i = 0; i < pts.length - 1; i++) {
        for (let k = 0; k < samplesPerSeg; k++) {
            const t = k / samplesPerSeg;
            xs.push(cr(P(i - 1)[0], P(i)[0], P(i + 1)[0], P(i + 2)[0], t));
            zs.push(cr(P(i - 1)[1], P(i)[1], P(i + 1)[1], P(i + 2)[1], t));
        }
    }
    xs.push(pts[pts.length - 1][0]); zs.push(pts[pts.length - 1][1]);
    for (let i = 1; i < xs.length; i++) ss.push(ss[i - 1] + Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]));
    const len = ss[ss.length - 1];
    const at = (s) => {
        s = clamp(s, 0, len);
        let lo = 0, hi = ss.length - 1;
        while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ss[m] <= s) lo = m; else hi = m; }
        const t = (s - ss[lo]) / ((ss[hi] - ss[lo]) || 1);
        const dx = xs[hi] - xs[lo], dz = zs[hi] - zs[lo], dl = Math.hypot(dx, dz) || 1;
        return { x: lerp(xs[lo], xs[hi], t), z: lerp(zs[lo], zs[hi], t), dx: dx / dl, dz: dz / dl };
    };
    const nearestS = (x, z) => {
        let best = 0, bd = Infinity;
        for (let i = 0; i < xs.length; i++) { const d = Math.hypot(xs[i] - x, zs[i] - z); if (d < bd) { bd = d; best = ss[i]; } }
        return best;
    };
    return { len, at, nearestS };
}

// distance along a path for a "trapezoid" speed profile: accelerate for ra seconds,
// cruise, decelerate for rd seconds; covers exactly `len` in `span` seconds.
export function trapezoid(t, span, len, ra, rd) {
    t = clamp(t, 0, span);
    const v = len / (span - ra / 2 - rd / 2);
    if (t < ra) return v * t * t / (2 * ra);
    if (t <= span - rd) return v * (ra / 2 + (t - ra));
    const q = span - t;
    return len - v * q * q / (2 * rd);
}
