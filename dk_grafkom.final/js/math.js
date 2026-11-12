"use strict";
/* =====================================================================
 *  math.js  -  Matematika 3D (tanpa library luar)
 *  Matriks 4x4 disimpan column-major (format yang diminta WebGL):
 *  elemen (baris r, kolom c) ada di indeks  c*4 + r
 * ===================================================================== */

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const deg = (r) => (r * 180) / Math.PI;
const hex = (h) => {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

/* ---- easing: dipakai supaya semua gerakan halus (kecepatan 0 di awal & akhir) ---- */
const ease = (t) => { t = clamp(t); return t * t * t * (t * (t * 6 - 15) + 10); }; // smootherstep
const seg = (p, a, b) => clamp((p - a) / (b - a));            // 0..1 linear di dalam [a,b]
const easeSeg = (p, a, b) => ease(seg(p, a, b));              // 0..1 halus di dalam [a,b]
const pulse = (p, a, b) => 0.5 - 0.5 * Math.cos(2 * Math.PI * seg(p, a, b)); // 0 -> 1 -> 0

/* ---- vektor 3D ---- */
const V3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm(a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  lerp: (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)],
};

/* ---- matriks 4x4 ---- */
const M4 = {
  identity() { return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); },

  /** a * b  (b diterapkan lebih dulu pada titik) */
  multiply(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 4; r++) {
        o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
      }
    }
    return o;
  },

  /* ===== TRANSLASI ===== */
  translate(x, y, z) { const o = M4.identity(); o[12] = x; o[13] = y; o[14] = z; return o; },

  /* ===== SKALA ===== */
  scale(x, y, z) { const o = M4.identity(); o[0] = x; o[5] = y; o[10] = z; return o; },

  /* ===== ROTASI terhadap sumbu X / Y / Z ===== */
  rotateX(a) { const c = Math.cos(a), s = Math.sin(a), o = M4.identity(); o[5] = c; o[6] = s; o[9] = -s; o[10] = c; return o; },
  rotateY(a) { const c = Math.cos(a), s = Math.sin(a), o = M4.identity(); o[0] = c; o[2] = -s; o[8] = s; o[10] = c; return o; },
  rotateZ(a) { const c = Math.cos(a), s = Math.sin(a), o = M4.identity(); o[0] = c; o[1] = s; o[4] = -s; o[5] = c; return o; },

  /* ===== ROTASI SUMBU BEBAS (rumus Rodrigues) =====
   *  R = cosθ·I + (1-cosθ)·a·aᵀ + sinθ·[a]ₓ   dengan a = sumbu satuan  */
  rotateAxis(axis, angle) {
    const [x, y, z] = V3.norm(axis);
    const c = Math.cos(angle), s = Math.sin(angle), t = 1 - c;
    const o = M4.identity();
    o[0] = t * x * x + c;      o[4] = t * x * y - s * z;  o[8] = t * x * z + s * y;
    o[1] = t * x * y + s * z;  o[5] = t * y * y + c;      o[9] = t * y * z - s * x;
    o[2] = t * x * z - s * y;  o[6] = t * y * z + s * x;  o[10] = t * z * z + c;
    return o;
  },

  /** rotasi sekitar garis sembarang: sumbu `axis` yang melewati titik `pivot`
   *  M = T(pivot) · R(axis, θ) · T(-pivot)  */
  rotateAxisAt(axis, angle, pivot) {
    return M4.multiply(M4.translate(pivot[0], pivot[1], pivot[2]),
      M4.multiply(M4.rotateAxis(axis, angle), M4.translate(-pivot[0], -pivot[1], -pivot[2])));
  },

  /** M = T · Ry · Rx · Rz · S   (pos, rot[x,y,z] dalam radian, skala) */
  compose(p, r, s) {
    let m = M4.translate(p[0], p[1], p[2]);
    if (r[1]) m = M4.multiply(m, M4.rotateY(r[1]));
    if (r[0]) m = M4.multiply(m, M4.rotateX(r[0]));
    if (r[2]) m = M4.multiply(m, M4.rotateZ(r[2]));
    return M4.multiply(m, M4.scale(s[0], s[1], s[2]));
  },

  perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), o = new Float32Array(16);
    o[0] = f / aspect; o[5] = f; o[10] = (far + near) / (near - far); o[11] = -1; o[14] = (2 * far * near) / (near - far);
    return o;
  },

  lookAt(eye, target, up) {
    const z = V3.norm(V3.sub(eye, target));
    const x = V3.norm(V3.cross(up, z));
    const y = V3.cross(z, x);
    const o = M4.identity();
    o[0] = x[0]; o[1] = y[0]; o[2] = z[0];
    o[4] = x[1]; o[5] = y[1]; o[6] = z[1];
    o[8] = x[2]; o[9] = y[2]; o[10] = z[2];
    o[12] = -V3.dot(x, eye); o[13] = -V3.dot(y, eye); o[14] = -V3.dot(z, eye);
    return o;
  },

  invert(a) {
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3], a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11], a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
    const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10;
    const b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
    const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30;
    const b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!det) return M4.identity();
    det = 1 / det;
    const o = new Float32Array(16);
    o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
    o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
    o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
    o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
    o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
    o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
    o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
    o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
    o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
    o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
    o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
    return o;
  },

  /** matriks normal (mat3, column-major) = invers-transpose dari 3x3 kiri-atas.
   *  Diperlukan supaya pencahayaan benar walau objek diskalakan tidak seragam. */
  normalMatrix(m) {
    const a = m[0], b = m[4], c = m[8], d = m[1], e = m[5], f = m[9], g = m[2], h = m[6], i = m[10];
    const c00 = e * i - f * h, c01 = f * g - d * i, c02 = d * h - e * g;
    const c10 = c * h - b * i, c11 = a * i - c * g, c12 = b * g - a * h;
    const c20 = b * f - c * e, c21 = c * d - a * f, c22 = a * e - b * d;
    let det = a * c00 + b * c01 + c * c02;
    det = det ? 1 / det : 1;
    return new Float32Array([c00 * det, c10 * det, c20 * det, c01 * det, c11 * det, c21 * det, c02 * det, c12 * det, c22 * det]);
  },

  /** transformasi titik 3D oleh matriks */
  point(m, p) {
    return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
            m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
            m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
  },
};

/* ---- Matrix stack: inti dari Hierarchical Transformation ----
 *  push()  -> simpan matriks induk
 *  mul(m)  -> kalikan dengan transformasi lokal anggota tubuh
 *  pop()   -> kembali ke matriks induk
 */
class MatrixStack {
  constructor() { this.s = [M4.identity()]; }
  get top() { return this.s[this.s.length - 1]; }
  push() { this.s.push(new Float32Array(this.top)); }
  pop() { this.s.pop(); }
  mul(m) { this.s[this.s.length - 1] = M4.multiply(this.top, m); }
  reset() { this.s = [M4.identity()]; }
}
