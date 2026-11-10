// Cinema.js : daftar shot kamera. Waktu dalam detik.
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const ease = (t) => t * t * (3 - 2 * t);
// eye0/eye1/tgt0/tgt1 boleh berupa array [x,y,z] ATAU fungsi (T) => [x,y,z]  (untuk kamera yang mengikuti karakter)
const val = (v, T) => (typeof v === 'function' ? v(T) : v);

// shot = { name, dur, eye0, eye1, tgt0, tgt1, ease }
// kamera bergerak dari eye0 ke eye1, titik pandang dari tgt0 ke tgt1. ease:false -> gerak konstan
export function createCinema(shots) {
    let t0 = 0;
    const list = shots.map(s => { const o = { ...s, start: t0, end: t0 + s.dur }; t0 += s.dur; return o; });
    const duration = t0;
    return {
        duration,
        sample(t) {
            const tt = Math.min(Math.max(t, 0), duration - 1e-6);     // setelah shot terakhir: tahan di akhir
            const s = list.find(sh => tt >= sh.start && tt < sh.end);
            const u = (tt - s.start) / s.dur;
            const k = s.ease === false ? u : ease(u);
            return {
                eye: lerp3(val(s.eye0, tt), val(s.eye1, tt), k),
                target: lerp3(val(s.tgt0, tt), val(s.tgt1, tt), k),
                shot: s.name
            };
        }
    };
}