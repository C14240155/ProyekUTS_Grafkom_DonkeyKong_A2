"use strict";
/* =====================================================================
 *  geometry.js  -  Pembuat mesh (semua dihitung sendiri, tanpa file model)
 *
 *  Quadric yang tersedia:
 *    - Ellipsoid            x²/a² + y²/b² + z²/c² = 1
 *    - Cylinder (silinder)
 *    - Cone (kerucut elips)
 *    - Hyperboloid satu lembar   x²/a² + z²/a² - y²/c² = 1   <- OBJECT 3 (Bongo)
 *  Kurva 3D:
 *    - BezierCurve3D (gabungan Bezier kubik) + tube di sepanjang kurva
 * ===================================================================== */

/** Permukaan parametrik P(u,v). Normal dihitung halus dari segitiga sekitarnya. */
function buildSurface(nu, nv, fn, wrapU = true) {
  const W = nu + 1, N = W * (nv + 1);
  const pos = new Float32Array(N * 3), nor = new Float32Array(N * 3), uv = new Float32Array(N * 2);
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i <= nu; i++) {
      const k = j * W + i, p = fn(i / nu, j / nv, i, j);
      pos[k * 3] = p[0]; pos[k * 3 + 1] = p[1]; pos[k * 3 + 2] = p[2];
      uv[k * 2] = i / nu; uv[k * 2 + 1] = j / nv;
    }
  }
  const idx = new Uint16Array(nu * nv * 6), acc = new Float64Array(N * 3);
  const map = (k) => (wrapU && k % W === nu ? k - nu : k); // sambungan u=0 dan u=1 berbagi normal
  const face = (a, b, c) => {
    const ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2];
    const ux = pos[b * 3] - ax, uy = pos[b * 3 + 1] - ay, uz = pos[b * 3 + 2] - az;
    const vx = pos[c * 3] - ax, vy = pos[c * 3 + 1] - ay, vz = pos[c * 3 + 2] - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const q of [a, b, c]) { const m = map(q) * 3; acc[m] += nx; acc[m + 1] += ny; acc[m + 2] += nz; }
  };
  let q = 0;
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * W + i, b = a + 1, c = a + W, d = c + 1;
      idx[q++] = a; idx[q++] = c; idx[q++] = b;
      idx[q++] = b; idx[q++] = c; idx[q++] = d;
      face(a, c, b); face(b, c, d);
    }
  }
  if (wrapU) { // kutub (semua titik satu baris berimpit): rata-ratakan normal
    for (let j = 0; j <= nv; j++) {
      const r = j * W, h = r + (nu >> 1);
      if (Math.hypot(pos[r * 3] - pos[h * 3], pos[r * 3 + 1] - pos[h * 3 + 1], pos[r * 3 + 2] - pos[h * 3 + 2]) < 1e-5) {
        let sx = 0, sy = 0, sz = 0;
        for (let i = 0; i < nu; i++) { sx += acc[(r + i) * 3]; sy += acc[(r + i) * 3 + 1]; sz += acc[(r + i) * 3 + 2]; }
        for (let i = 0; i < nu; i++) { acc[(r + i) * 3] = sx; acc[(r + i) * 3 + 1] = sy; acc[(r + i) * 3 + 2] = sz; }
      }
    }
  }
  for (let k = 0; k < N; k++) {
    const m = map(k) * 3;
    let x = acc[m], y = acc[m + 1], z = acc[m + 2];
    const l = Math.hypot(x, y, z);
    if (l < 1e-12) { x = 0; y = 1; z = 0; } else { x /= l; y /= l; z /= l; }
    nor[k * 3] = x; nor[k * 3 + 1] = y; nor[k * 3 + 2] = z;
  }
  return { pos, nor, uv, idx };
}

function mergeGeo(list) {
  let nv = 0, ni = 0;
  for (const g of list) { nv += g.pos.length / 3; ni += g.idx.length; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), idx = new Uint16Array(ni);
  let vo = 0, io = 0;
  for (const g of list) {
    pos.set(g.pos, vo * 3); nor.set(g.nor, vo * 3); uv.set(g.uv, vo * 2);
    for (let k = 0; k < g.idx.length; k++) idx[io + k] = g.idx[k] + vo;
    vo += g.pos.length / 3; io += g.idx.length;
  }
  return { pos, nor, uv, idx };
}

/* ---------------- QUADRIC (semua berukuran satuan, diskalakan lewat matriks) ---------------- */

/** Ellipsoid: bola jari-jari 1, jadi ellipsoid bila di-scale (rx,ry,rz). */
function geoSphere(nu = 36, nv = 24) {
  return buildSurface(nu, nv, (u, v) => {
    const th = u * 2 * Math.PI, ph = (v - 0.5) * Math.PI;
    return [Math.cos(ph) * Math.cos(th), Math.sin(ph), Math.cos(ph) * Math.sin(th)];
  });
}

function geoDisk(y, r, nu) {
  return buildSurface(nu, 1, (u, v) => {
    const th = u * 2 * Math.PI;
    return [r * v * Math.cos(th), y, r * v * Math.sin(th)];
  });
}

/** Silinder: jari-jari 1, tinggi 1 (y dari -0.5 s/d 0.5) + tutup atas/bawah */
function geoCylinder(nu = 32) {
  const side = buildSurface(nu, 1, (u, v) => [Math.cos(u * 2 * Math.PI), v - 0.5, Math.sin(u * 2 * Math.PI)]);
  return mergeGeo([side, geoDisk(0.5, 1, nu), geoDisk(-0.5, 1, nu)]);
}

/** Kerucut elips: alas jari-jari 1 di y=-0.5, puncak di y=+0.5.   r(y) = (0.5 - y) */
function geoCone(nu = 32, nv = 6) {
  const side = buildSurface(nu, nv, (u, v) => {
    const th = u * 2 * Math.PI, r = 1 - v;
    return [r * Math.cos(th), -0.5 + v, r * Math.sin(th)];
  });
  return mergeGeo([side, geoDisk(-0.5, 1, nu)]);
}

/** Hyperboloid satu lembar:  x² + z² - (y/c)² = 1  ->  r(y) = sqrt(1 + (y/c)²)
 *  Pinggang (y=0) paling sempit r=1, melebar ke kedua ujung (y = ±0.5). */
function geoHyperboloid(nu = 40, nv = 18, c = 0.5) {
  const r = (y) => Math.sqrt(1 + (y / c) * (y / c));
  const side = buildSurface(nu, nv, (u, v) => {
    const th = u * 2 * Math.PI, y = v - 0.5;
    return [r(y) * Math.cos(th), y, r(y) * Math.sin(th)];
  });
  return mergeGeo([side, geoDisk(0.5, r(0.5), nu), geoDisk(-0.5, r(0.5), nu)]);
}

/** z permukaan depan sebuah ellipsoid pada (x,y) - dipakai untuk menempelkan detail di permukaan */
function ellipsoidZ(c, r, x, y) {
  const q = 1 - ((x - c[0]) / r[0]) ** 2 - ((y - c[1]) / r[1]) ** 2;
  return q > 0 ? c[2] + r[2] * Math.sqrt(q) : -Infinity;
}

/* ---------------- KURVA 3D ---------------- */

/** Gabungan kurva Bezier kubik. Jumlah titik kontrol harus 3k+1. */
class BezierCurve3D {
  constructor(points) {
    if ((points.length - 1) % 3 !== 0) throw new Error('Bezier kubik butuh 3k+1 titik kontrol');
    this.p = points;
    this.n = (points.length - 1) / 3;
  }
  /** B(u) = (1-u)³P0 + 3(1-u)²u P1 + 3(1-u)u² P2 + u³ P3 */
  point(t) {
    t = clamp(t);
    const s = t * this.n, i = Math.min(Math.floor(s), this.n - 1), u = s - i, b = i * 3, p = this.p, a = 1 - u;
    const w0 = a * a * a, w1 = 3 * a * a * u, w2 = 3 * a * u * u, w3 = u * u * u;
    return [0, 1, 2].map((k) => w0 * p[b][k] + w1 * p[b + 1][k] + w2 * p[b + 2][k] + w3 * p[b + 3][k]);
  }
  tangent(t) {
    const e = 1e-3;
    return V3.norm(V3.sub(this.point(Math.min(1, t + e)), this.point(Math.max(0, t - e))));
  }
  sample(n) { const r = []; for (let i = 0; i <= n; i++) r.push(this.point(i / n)); return r; }
}

/** Tube (selang) mengikuti kurva. radius(t) = jari-jari di posisi t (0..1).
 *  squash  = pipihkan penampang (untuk daun / rambut)
 *  mod(θ)  = modulasi penampang (untuk pisang yang bersegi)
 *  up      = arah acuan sumbu pipih  */
function geoTube(curve, o = {}) {
  const tSeg = o.tSeg || 40, rSeg = o.rSeg || 12;
  const radius = o.radius || (() => 0.1), squash = o.squash === undefined ? 1 : o.squash, mod = o.mod || (() => 1);
  const P = [], N = [], B = [];
  let b = null;
  for (let j = 0; j <= tSeg; j++) {
    const t = j / tSeg, T = curve.tangent(t);
    let ref = b || o.up || [0, 1, 0];
    ref = V3.sub(ref, V3.scale(T, V3.dot(ref, T)));
    if (V3.len(ref) < 1e-4) ref = V3.sub([1, 0, 0], V3.scale(T, T[0]));
    b = V3.norm(ref);                          // frame ditransport sepanjang kurva (tanpa memelintir)
    P.push(curve.point(t)); B.push(b); N.push(V3.cross(T, b));
  }
  return buildSurface(rSeg, tSeg, (u, v, i, j) => {
    const th = u * 2 * Math.PI, r = radius(v) * mod(th);
    const c = Math.cos(th) * r, s = Math.sin(th) * r * squash;
    return [P[j][0] + N[j][0] * c + B[j][0] * s, P[j][1] + N[j][1] * c + B[j][1] * s, P[j][2] + N[j][2] * c + B[j][2] * s];
  });
}

/** Pita datar. fn(s, c) -> titik; s = sepanjang pita (0..1), c = lebar (-1..1) */
function geoRibbon(rows, cols, fn) {
  return buildSurface(cols, rows, (u, v) => fn(v, u * 2 - 1), false);
}

/** Garis (untuk poligon kontrol kurva) */
function geoLines(points) {
  const n = points.length, pos = new Float32Array(n * 3), idx = new Uint16Array((n - 1) * 2);
  points.forEach((p, i) => pos.set(p, i * 3));
  for (let i = 0; i < n - 1; i++) { idx[i * 2] = i; idx[i * 2 + 1] = i + 1; }
  return { pos, nor: new Float32Array(n * 3), uv: new Float32Array(n * 2), idx, lines: true };
}
