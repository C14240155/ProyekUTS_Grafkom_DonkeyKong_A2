// Cinema.js : daftar shot kamera. Waktu dalam detik.
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const ease = (t) => t * t * (3 - 2 * t);

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
            return { eye: lerp3(s.eye0, s.eye1, k), target: lerp3(s.tgt0, s.tgt1, k), shot: s.name };
        }
    };
}