import { bezierPoint } from "./geometry.js";
import { PATHS } from "./Environment.js";

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const seg = (T, a, b) => clamp((T - a) / (b - a), 0, 1);
const ease = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;
const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// ================== SCENE 2 ===============
const S2 = 8;                   // Rambi muncul dan mulai berjalan
const WALK_END = 15;            // Rambi benar-benar berhenti
const DECEL = 2.0;              // lama melambat sebelum berhenti (13 - 15)
const HEAD_T0 = 15.6, HEAD_T1 = 17.0;   // Rambi mulai menoleh ke laut
const BODY_T0 = 15.9, BODY_T1 = 17.6;
const TALK_T0 = 16.4, TALK_T1 = 19.0; // Rambi berbicara
const HEAD_BACK_T0 = 18.2, HEAD_BACK_T1 = 19.0; // Rambi mulai menoleh kembali ke kamera
const BODY_BACK_T0 = 18.5, BODY_BACK_T1 = 19.5;

export const SCENE2_END = 20;

// ================= SCENE 3 =================
export const SCENE3_START = 20;
export const SCENE3_END = 30;

const S3_TURN_T0 = 20.0;    // Rambi berputar menghadap laut
const S3_TURN_T1 = 21.5;

const S3_NOD_T0 = 21.5;     // Rambi menganggukkan kepala
const S3_NOD_T1 = 22.5;

const S3_SCRATCH_T0 = 22.5;     // Rambi menggaruk tanah
const S3_SCRATCH_T1 = 23.7;

const S3_SNORT_T0 = 23.7;       // Rambi mendengus dan membesar
const S3_SNORT_T1 = 25.0;

const STRIDE = 4;               // jarak tempuh per siklus langkah (supaya kaki tidak meluncur)
const TURN_STEP = 5;            // "jarak" langkah per radian saat badan berputar di tempat
const LOOK_MAX = 1.6;           // total putaran menuju laut (kepala + badan), rad
const BODY_FRAC = 0.3;          // porsi putaran yang dikerjakan badan (sisanya kepala)

/* ---------- rute scene 2: jalan 0 dari pantai ke lingkaran markas ---------- */
function makeRoute(pts, half = 4) {
    const ds = 0.25, rs = [pts[0]];
    let carry = 0;
    for (let i = 1; i < pts.length; i++) {                      // resample jarak seragam
        const [ax, az] = pts[i - 1], [bx, bz] = pts[i], d = Math.hypot(bx - ax, bz - az);
        let pos = ds - carry;
        while (pos <= d) { const t = pos / d; rs.push([ax + (bx - ax) * t, az + (bz - az) * t]); pos += ds; }
        carry = d - (pos - ds);
    }
    rs.push(pts[pts.length - 1]);
    const n = rs.length, w = Math.round(half / ds);
    const p = rs.map((_, i) => {                                // haluskan, ujung tetap
        const k = Math.min(w, i, n - 1 - i);
        let x = 0, z = 0;
        for (let j = i - k; j <= i + k; j++) { x += rs[j][0]; z += rs[j][1]; }
        return [x / (2 * k + 1), z / (2 * k + 1)];
    });
    const s = [0], hd = [];
    for (let i = 1; i < n; i++) s.push(s[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
    for (let i = 0; i < n; i++) {
        const a = p[Math.max(0, i - 4)], b = p[Math.min(n - 1, i + 4)];
        let h = Math.atan2(b[0] - a[0], b[1] - a[1]);
        if (i) h = hd[i - 1] + wrapPi(h - hd[i - 1]);
        hd.push(h);
    }
    const len = s[n - 1];
    return {
        len,
        at(d) {
            d = clamp(d, 0, len);
            let lo = 0, hi = n - 1;
            while (hi - lo > 1) { const m = (lo + hi) >> 1; if (s[m] <= d) lo = m; else hi = m; }
            const t = (d - s[lo]) / ((s[hi] - s[lo]) || 1);
            return { x: lerp(p[lo][0], p[hi][0], t), z: lerp(p[lo][1], p[hi][1], t), h: lerp(hd[lo], hd[hi], t) };
        }
    };
}
const route0 = makeRoute(Array.from({ length: 49 }, (_, i) => bezierPoint(PATHS[0], i / 48)).reverse());

/* ---------- berjalan: kecepatan tetap, lalu melambat halus sampai berhenti ---------- */
const WALK_T = WALK_END - S2;
const VW = route0.len / (WALK_T - DECEL / 2);                   // kecepatan jalan (unit/detik)
function walkDist(T) {
    const t = clamp(T - S2, 0, WALK_T), tc = WALK_T - DECEL;
    if (t <= tc) return VW * t;
    const q = (t - tc) / DECEL;                                  // kecepatan = VW * (1 + cos(pi q)) / 2
    return VW * tc + VW * DECEL * (q / 2 + Math.sin(Math.PI * q) / (2 * Math.PI));
}
function pos(T) {
    if (T < S2) return { x: 0, z: 0, h: 0, hide: true };
    return route0.at(walkDist(T));
}

/* ---------- menoleh ke laut: kepala (cepat) + badan (sedikit, menyusul) ---------- */
const stopPose = route0.at(route0.len);
const LOOK = clamp(wrapPi(Math.PI / 2 - stopPose.h), -LOOK_MAX, LOOK_MAX);
const SEA_HEADING = Math.PI / 2;    // SCENE 3: arah akhir tepat menghadap laut (+X)
const SCENE3_TURN = wrapPi(SEA_HEADING - stopPose.h);
const headTurn = (T) => {
    const look = ease(seg(T, HEAD_T0, HEAD_T1));
    const back = ease(seg(T, HEAD_BACK_T0, HEAD_BACK_T1));

    return LOOK * (1 - BODY_FRAC) * look * (1 - back);
};
const bodyTurn = (T) => {
    const look = ease(seg(T, BODY_T0, BODY_T1));
    const back = ease(seg(T, BODY_BACK_T0, BODY_BACK_T1));

    return LOOK * BODY_FRAC * look * (1 - back);
};

/* ---------- mulut: frasa bicara dengan jeda, suku kata ~3,6 Hz ---------- */
function talk(T) {
    const t = T - TALK_T0;
    if (t < 0 || T > TALK_T1) return 0;
    const gate = ease(seg(t, 0, 0.25)) * (1 - ease(seg(T, TALK_T1 - 0.4, TALK_T1)));
    const phrase = ease(clamp((Math.sin(2 * Math.PI * 0.45 * t + 1.2) + 0.35) / 0.5, 0, 1));
    const syll = Math.abs(Math.sin(Math.PI * 3.6 * t + 0.8 * Math.sin(2 * Math.PI * 0.9 * t)));
    return gate * phrase * (0.35 + 0.65 * syll);
}

/* ---------- animasi scene 3 ---------- */

// Rambi berbalik dari arah Donkey Kong menuju laut
function scene3Turn(T) {
    return SCENE3_TURN * ease(seg(T, S3_TURN_T0, S3_TURN_T1));
}

// Kepala mengangguk (amplitudenya diperbesar)
function scene3Nod(T) {
    const gate =
        ease(seg(T, S3_NOD_T0, S3_NOD_T0 + 0.3)) *
        (1 - ease(seg(T, S3_NOD_T1 - 0.3, S3_NOD_T1)));

    return 0.35 * Math.sin(2 * Math.PI * 1.4 * (T - S3_NOD_T0)) * gate;
}

// Kaki depan kiri menggaruk: angkat ke depan (lutut tekuk), sapu ke belakang (lutut lurus)
function scene3Scratch(T) {
    const gate =
        ease(seg(T, S3_SCRATCH_T0, S3_SCRATCH_T0 + 0.25)) *
        (1 - ease(seg(T, S3_SCRATCH_T1 - 0.25, S3_SCRATCH_T1)));

    const phase = 2 * Math.PI * 2.2 * (T - S3_SCRATCH_T0);
    const s = Math.sin(phase);

    return {
        gate,
        swing: gate * (-0.35 - 0.6 * s),            // sudut - = kaki ke depan
        knee: gate * 1.0 * Math.max(0, s),          // lutut menekuk saat kaki terangkat
        lean: gate * (0.05 + 0.03 * Math.max(0, -s)) // badan condong ke depan saat menyapu
    };
}

// Dengusan: satu pulsa mengembang lalu kembali normal
function scene3Snort(T) {
    const gate =
        ease(seg(T, S3_SNORT_T0, S3_SNORT_T0 + 0.4)) *
        (1 - ease(seg(T, S3_SNORT_T1 - 0.5, S3_SNORT_T1)));

    const pulse = Math.sin(Math.PI * seg(T, S3_SNORT_T0 + 0.4, S3_SNORT_T1 - 0.5));
    return gate * Math.max(0, pulse);
}

// Langkah kaki saat berputar di tempat
function scene3TurnStep(T) {
    const ang = (t) => Math.abs(scene3Turn(t));
    const ph = 2 * Math.PI * TURN_STEP * ang(T) / STRIDE;
    const v = TURN_STEP * Math.abs(ang(T + 0.03) - ang(T - 0.03)) / 0.06;
    const mv = ease(seg(v, 0.4, 2.5));      // 0 = diam, 1 = melangkah
    return { ph, mv };
}

export function rambiPose(T) {                                  // posisi dunia, untuk kamera tracking
    const p = pos(T);
    return { x: p.x, y: 0.5, z: p.z - 0.3, h: p.h + bodyTurn(T) };   // body.root.POSITION = (0, 0.5, -0.3)
}

/* ---------- jarak tempuh total -> fase langkah ---------- */
const DT = 1 / 60, ODO = [0];
for (let i = 1; i <= 81 * 60; i++) {
    const t0 = (i - 1) * DT;
    if (t0 < S2) { ODO.push(0); continue; }
    const a = pos(t0), b = pos(i * DT);
    ODO.push(ODO[i - 1] + Math.hypot(b.x - a.x, b.z - a.z) + TURN_STEP * Math.abs(bodyTurn(i * DT) - bodyTurn(t0)));
}
const odoAt = (T) => { const f = clamp(T, 0, 80) / DT, i = Math.floor(f); return lerp(ODO[i], ODO[i + 1], f - i); };
const speedAt = (T) => {
    const a = pos(T - 0.03), b = pos(T + 0.03);
    if (a.hide || b.hide) return 0;
    return (Math.hypot(b.x - a.x, b.z - a.z) + TURN_STEP * Math.abs(bodyTurn(T + 0.03) - bodyTurn(T - 0.03))) / 0.06;
};

const rot = (n, rx = 0, ry = 0, rz = 0) => {                    // R pada MOVE_MATRIX (pivot = titik asal node)
    LIBS.rotateX(n.MOVE_MATRIX, rx); LIBS.rotateY(n.MOVE_MATRIX, ry); LIBS.rotateZ(n.MOVE_MATRIX, rz);
};

function poseRambi(R, T) {
    const P = pos(T), pr = R.parts;
    // ================= SCENE 3 =================
    if (T >= SCENE3_START) {

        const turn = scene3Turn(T);
        const nod = scene3Nod(T);
        const scratch = scene3Scratch(T);
        const snort = scene3Snort(T);
        const { ph, mv } = scene3TurnStep(T);

        // Kaki melangkah (trot: FL+BR sefase, FR+BL berlawanan) saat badan berbalik
        const off = { FL: 0, BR: 0, FR: Math.PI, BL: Math.PI };
        for (const n of ["FL", "FR", "BL", "BR"]) {
            const q = ph + off[n];
            rot(pr["leg" + n], 0.5 * Math.sin(q) * mv);
            rot(pr["knee" + n], 0.54 * Math.max(0, -Math.cos(q)) * mv);
        }

        // --- ROOT: scale -> pitch (lokal) -> yaw -> posisi ---
        const M = R.root.MOVE_MATRIX;
        const S = 1 + 0.22 * snort;                  // badan MEMBESAR saat mendengus
        LIBS.scaleX(M, S); LIBS.scaleY(M, S); LIBS.scaleZ(M, S);
        LIBS.rotateX(M, scratch.lean);               // badan condong saat menggaruk
        LIBS.rotateY(M, P.h + turn);                 // menghadap laut (+X)
        LIBS.set_position(M, P.x, 0.12 * mv * Math.abs(Math.sin(ph)), P.z);   // badan naik-turun saat melangkah

        // --- Anak-anak (mewarisi transformasi root) ---
        rot(pr.head, nod + 0.2 * scratch.gate - 0.15 * snort, 0, 0);   // mengangguk, menunduk lihat tanah, mendongak saat mendengus
        rot(pr.legFL, scratch.swing, 0, 0);          // kaki depan kiri
        rot(pr.kneeFL, scratch.knee, 0, 0);          // lutut (anak dari legFL)
        rot(pr.jawPivot, 0.3 * snort, 0, 0);         // rahang terbuka
        rot(pr.earL, 0, 0, -0.25 * snort);           // telinga mengembang
        rot(pr.earR, 0, 0, 0.25 * snort);
        rot(pr.tailPivot, 0.15, 0.4 * Math.sin(2 * Math.PI * 1.5 * T) * snort);  // ekor ikut bergetar
        return;
    }

    // ================= SCENE 2 =================
    const v = speedAt(T), ph = 2 * Math.PI * odoAt(T) / STRIDE;
    const mv = ease(seg(v, 0.4, 2.5));                          // 0 = diam, 1 = bergerak (juga saat badan berputar)
    const tk = talk(T);

    // H kaki (trot: FL+BR sefase, FR+BL berlawanan). Sudut + = kaki ke belakang.
    const off = { FL: 0, BR: 0, FR: Math.PI, BL: Math.PI };
    for (const n of ["FL", "FR", "BL", "BR"]) {
        const q = ph + off[n];
        rot(pr["leg" + n], 0.5 * Math.sin(q) * mv);
        rot(pr["knee" + n], 0.9 * Math.max(0, -Math.cos(q)) * mv * 0.6);   // lutut menekuk saat kaki diayun ke depan
    }

    // H kepala: mengangguk mengikuti langkah, lalu menoleh ke laut (rotasi Y), sedikit mendongak saat bicara
    rot(pr.head, 0.07 * Math.sin(2 * ph) * mv - 0.04 * tk, headTurn(T));

    // H rahang: membuka-menutup seperti berbicara
    rot(pr.jawPivot, 0.28 * tk);

    // H telinga & ekor: telinga ikut langkah, saat bicara bergerak kecil; ekor mengibas pelan saat menunggu
    const flap = 0.15 * Math.sin(ph + 0.8) * mv + 0.08 * tk * Math.sin(2 * Math.PI * 2.2 * T);
    rot(pr.earL, 0, 0, flap); rot(pr.earR, 0, 0, -flap);
    rot(pr.tailPivot, 0.15, 0.35 * Math.sin(ph * 0.5 + 1) * mv + 0.12 * (1 - mv) * Math.sin(1.3 * T));

    // T: badan = yaw mengikuti jalan (+ putaran menoleh), translasi di tanah, sedikit naik-turun
    const M = R.root.MOVE_MATRIX;
    LIBS.rotateY(M, P.h + bodyTurn(T));
    LIBS.set_position(M, P.x, P.hide ? -300 : 0.12 * mv * Math.abs(Math.sin(ph)), P.z);
}

export function createAnimation(chars) {
    return { update(T) { poseRambi(chars.rambi, T); } };
}