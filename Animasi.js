import { bezierPoint } from "./geometry.js";
import { PATHS, BASE } from "./Environment.js";

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

/* ================= SCENE 4 : lari melingkar 2 putaran ================= */
export const SCENE4_START = 30;
export const SCENE4_END = 40;

const S4_SPAN = SCENE4_END - SCENE4_START;      // 10 detik
const S4_LAPS = 2;                              // jumlah putaran
const S4_RAMP = 1.0;                            // lama percepatan & perlambatan (detik)
const S4_W = S4_LAPS * 2 * Math.PI / (S4_SPAN - S4_RAMP);   // kecepatan sudut saat cruise (rad/s)
const S4_STRIDE = 6;                            // jarak tempuh per siklus galop
const S4_LEAN = 0.32;                           // kemiringan ke dalam tikungan (rad)

// titik awal = tempat Rambi berdiri di akhir scene 3, supaya tidak ada lompatan
const S4_TH0 = Math.atan2(stopPose.z - BASE.z, stopPose.x - BASE.x);
const S4_R0 = Math.hypot(stopPose.x - BASE.x, stopPose.z - BASE.z);
const S4_HDIFF = wrapPi(SEA_HEADING + S4_TH0);  // selisih hadap laut -> arah singgung awal

// sudut tempuh (rad) : trapesium kecepatan, total tepat S4_LAPS putaran
function s4Angle(t) {
    const R = S4_RAMP, W = S4_W;
    if (t < R) return W * t * t / (2 * R);
    if (t <= S4_SPAN - R) return W * (R / 2 + (t - R));
    const q = S4_SPAN - t;
    return W * (S4_SPAN - R) - W * q * q / (2 * R);
}
// kecepatan sudut (rad/s)
function s4Speed(t) {
    const R = S4_RAMP;
    if (t < R) return S4_W * t / R;
    if (t <= S4_SPAN - R) return S4_W;
    return S4_W * (S4_SPAN - t) / R;
}

// TRANSLASI melingkar + ROTASI menghadap singgung
function s4State(T) {
    const t = clamp(T - SCENE4_START, 0, S4_SPAN);
    const u = s4Angle(t);
    const th = S4_TH0 + u;                                      // berlawanan arah jarum jam di bidang xz
    const r = lerp(S4_R0, BASE.ringR, ease(seg(t, 0, 2)));      // masuk halus ke jalur bundar
    const hTan = -th;                                           // heading singgung: (-sin th, cos th)
    const h = hTan + S4_HDIFF * (1 - ease(seg(t, 0, S4_RAMP + 0.5)));  // berbelok halus dari hadap laut
    return {
        x: BASE.x + r * Math.cos(th),
        z: BASE.z + r * Math.sin(th),
        h,
        sf: clamp(s4Speed(t) / S4_W, 0, 1),                     // 0..1 fraksi kecepatan
        arc: BASE.ringR * u                                     // jarak tempuh -> fase galop
    };
}

function poseRambiS4(R, T) {
    const s = s4State(T), pr = R.parts;
    const ph = 2 * Math.PI * s.arc / S4_STRIDE;
    const mv = ease(s.sf);

    // --- HIERARKI: kaki -> lutut (galop: pasangan depan dan pasangan belakang, beda fase) ---
    const gOff = { FL: 0, FR: 0.35, BL: 2.4, BR: 2.75 };
    for (const n of ["FL", "FR", "BL", "BR"]) {
        const q = ph + gOff[n];
        rot(pr["leg" + n], 0.85 * Math.sin(q) * mv);
        rot(pr["knee" + n], 1.0 * Math.max(0, -Math.cos(q)) * mv);   // lutut menekuk saat kaki diayun ke depan
    }

    // kepala mengangguk mengikuti galop, rahang sedikit terbuka
    rot(pr.head, mv * (0.12 * Math.sin(ph + 1.2) - 0.05), 0, 0);
    rot(pr.jawPivot, 0.1 * mv, 0, 0);

    // telinga berkibar ke belakang tertiup angin
    const flap = mv * (0.35 + 0.2 * Math.sin(2 * ph + 0.5));
    rot(pr.earL, 0, 0, flap);
    rot(pr.earR, 0, 0, -flap);

    // ekor terangkat dan mengibas ke samping
    rot(pr.tailPivot, 0.15 + 0.35 * mv * (0.6 + 0.4 * Math.sin(2 * ph)), 0.35 * Math.sin(ph) * mv);

    // --- ROOT: pitch galop (lokal) -> yaw singgung -> posisi (loncat) -> ARBITRARY ROTATION miring ---
    const M = R.root.MOVE_MATRIX;
    LIBS.rotateX(M, 0.07 * Math.sin(ph + 0.6) * mv);            // badan bergoyang depan-belakang
    LIBS.rotateY(M, s.h);                                       // menghadap arah singgung
    LIBS.set_position(M, s.x, 0.35 * mv * Math.abs(Math.sin(ph + 0.3)), s.z);
    // miring ke pusat lingkaran: sumbu = arah depan Rambi, melewati titik tapak di tanah
    LIBS.rotateArbitrary(M, [s.x, 0, s.z], [Math.sin(s.h), 0, Math.cos(s.h)], S4_LEAN * mv);
}

/* ================= SCENE 5 : kebut kanan-kiri hutan -> pesisir ================= */
export const SCENE5_START = 40;
export const SCENE5_END = 50;

const S5_SPAN = SCENE5_END - SCENE5_START;   // 10 detik
const S5_TA = 8;                             // 0-8 dtk: makin cepat, 8-10 dtk: kecepatan puncak

// start = titik akhir scene 4 di lingkaran markas; ujung = pesisir menghadap laut (+X)
const S5_START_PT = [BASE.x + BASE.ringR * Math.cos(S4_TH0), BASE.z + BASE.ringR * Math.sin(S4_TH0)];
const route5 = makeRoute([
    S5_START_PT,
    [-31, 9], [-22, 22], [-12, 26],        // kanan (+z)
    [-12, 8], [-16, -12], [-14, -28],      // menyilang ke kiri (-z)
    [-8, -12], [-9, 8], [-12, 20],         // kembali ke kanan
    [-5, 12], [0, 7], [5, 6]               // berbelok kencang ke pesisir
], 3);

const S5_A = route5.len / (S5_TA * (S5_SPAN - S5_TA / 2));   // percepatan konstan (unit/detik^2)
const S5_VPEAK = S5_A * S5_TA;                               // kecepatan puncak (unit/detik)
const S5_H0 = s4State(SCENE4_END).h;                         // heading akhir scene 4
const S5_HDIFF = wrapPi(S5_H0 - route5.at(0).h);

// TRANSLASI: makin cepat (percepatan konstan), lalu tahan di kecepatan puncak
function s5Dist(t) {
    t = clamp(t, 0, S5_SPAN);
    if (t <= S5_TA) return 0.5 * S5_A * t * t;
    return 0.5 * S5_A * S5_TA * S5_TA + S5_VPEAK * (t - S5_TA);
}
const s5Speed = (t) => (t <= S5_TA ? S5_A * clamp(t, 0, S5_TA) : S5_VPEAK);

// ROTASI: heading mengikuti singgung rute, awalnya disambung halus dari scene 4
const s5Heading = (t) => route5.at(s5Dist(t)).h + S5_HDIFF * (1 - ease(seg(t, 0, 0.8)));

// fase galop: frekuensi naik dari 1,6 Hz ke 3,8 Hz mengikuti kecepatan
function s5Phase(t) {
    t = clamp(t, 0, S5_SPAN);
    const tA = S5_TA;
    const integ = t <= tA ? 2.2 * t * t / (2 * tA) : 2.2 * (tA / 2 + (t - tA));
    return 2 * Math.PI * (1.6 * t + integ);
}

function s5State(T) {
    const t = clamp(T - SCENE5_START, 0, S5_SPAN);
    const p = route5.at(s5Dist(t));
    const v = s5Speed(t);
    const turn = (s5Heading(Math.min(t + 0.05, S5_SPAN)) - s5Heading(Math.max(t - 0.05, 0))) / 0.1;
    return { x: p.x, z: p.z, h: s5Heading(t), v, vf: v / S5_VPEAK, turn, t };
}

function poseRambiS5(R, T) {
    const s = s5State(T), pr = R.parts;
    const ph = s5Phase(s.t);
    const vf = s.vf;
    const mv = ease(seg(vf, 0, 0.3));                      // gerak kaki menyala setelah mulai berlari
    const peak = ease(seg(vf, 0.75, 1));                   // 0 -> 1 saat mendekati kecepatan puncak

    // --- HIERARKI: kaki -> lutut, galop makin cepat dan makin lebar ---
    const gOff = { FL: 0, FR: 0.35, BL: 2.4, BR: 2.75 };
    for (const n of ["FL", "FR", "BL", "BR"]) {
        const q = ph + gOff[n];
        rot(pr["leg" + n], (0.6 + 0.45 * vf) * Math.sin(q) * mv);
        rot(pr["knee" + n], (0.8 + 0.5 * vf) * Math.max(0, -Math.cos(q)) * mv);
    }

    // kepala mengangguk ikut galop, rahang terbuka karena ngos-ngosan
    rot(pr.head, mv * (0.14 * Math.sin(ph + 1.2) - 0.06), 0, 0);
    rot(pr.jawPivot, 0.14 * mv, 0, 0);

    // telinga terlipat ke belakang tertiup angin
    const flap = mv * (0.4 + 0.15 * vf + 0.15 * Math.sin(2 * ph + 0.5));
    rot(pr.earL, 0, 0, flap);
    rot(pr.earR, 0, 0, -flap);

    // EKOR LURUS: terangkat tetap ke belakang, tanpa kibasan samping
    rot(pr.tailPivot, 0.15 + 0.4 * mv, 0, 0);

    // --- ROOT: SCALING (memanjang) -> pitch galop -> yaw singgung -> posisi -> ARBITRARY ROTATION ---
    const M = R.root.MOVE_MATRIX;
    LIBS.scaleZ(M, 1 + 0.2 * peak);                        // badan memanjang di kecepatan puncak
    LIBS.scaleY(M, 1 - 0.07 * peak);                       // sedikit memipih (kesan volume tetap)
    LIBS.scaleX(M, 1 - 0.05 * peak);
    LIBS.rotateX(M, (0.05 + 0.04 * vf) * Math.sin(ph + 0.6) * mv);
    LIBS.rotateY(M, s.h);
    LIBS.set_position(M, s.x, (0.25 + 0.3 * vf) * mv * Math.abs(Math.sin(ph + 0.3)), s.z);

    // miring ke dalam tikungan: sumbu = arah depan, lewat titik tapak di tanah.
    // belok kiri (heading naik) -> miring kiri, jadi tanda minus. Makin cepat dan makin tajam -> makin miring.
    const lean = clamp(-0.015 * s.v * s.turn, -0.45, 0.45);
    LIBS.rotateArbitrary(M, [s.x, 0, s.z], [Math.sin(s.h), 0, Math.cos(s.h)], lean);
}

export function rambiPose(T) {                                  // posisi dunia, untuk kamera tracking
    if (T >= SCENE5_START) {
        const s = s5State(T);
        return { x: s.x, y: 0.5, z: s.z - 0.3, h: s.h };
    }
    if (T >= SCENE4_START) {
        const s = s4State(T);
        return { x: s.x, y: 0.5, z: s.z - 0.3, h: s.h };
    }
    const p = pos(T);
    return { x: p.x, y: 0.5, z: p.z - 0.3, h: p.h + bodyTurn(T) };
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

    // ================= SCENE 5 =================
    if (T >= SCENE5_START) { poseRambiS5(R, T); return; }

    // ================= SCENE 4 =================
    if (T >= SCENE4_START) { poseRambiS4(R, T); return; }

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