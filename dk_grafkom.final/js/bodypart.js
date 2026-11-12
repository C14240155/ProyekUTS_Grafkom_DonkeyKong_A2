"use strict";
/* =====================================================================
 *  bodypart.js  -  Class dasar semua anggota tubuh / objek
 *
 *  Setiap BodyPart punya transformasi LOKAL (position, rotation, scale,
 *  axisRot) relatif terhadap induknya, dan daftar anak (children).
 *  Saat digambar:   M_dunia = M_induk · M_lokal     (HIERARCHICAL TRANSFORMATION)
 *  Memutar bahu otomatis ikut menggerakkan siku, tangan, dan jari.
 * ===================================================================== */

/* Palet warna Donkey Kong */
const C = {
  fur: hex('#6b4226'), furDark: hex('#47280f'), furLight: hex('#86562f'),
  tan: hex('#f0c58b'), tanDark: hex('#d9a468'),
  white: hex('#fbfbf6'), black: hex('#150f0d'),
  red: hex('#d9291c'), gold: hex('#ffc928'), orange: hex('#e8761a'),
  mouth: hex('#3a1e0e'),
};

/* Mesh dasar yang dipakai bersama (dibuat sekali oleh initMeshes) */
const MESH = {};
function initMeshes(r) {
  MESH.sphere = r.createMesh(geoSphere(36, 24));
  MESH.cylinder = r.createMesh(geoCylinder(32));
  MESH.cone = r.createMesh(geoCone(32, 6));
  MESH.hyperboloid = r.createMesh(geoHyperboloid(44, 18, 0.5));
  MESH.make = (g) => r.createMesh(g);
  MESH.tieTex = makeTieTexture(r);
}

/** tekstur dasi: merah dengan huruf "DK" kuning bergaris oranye (digambar lewat canvas 2D) */
function makeTieTexture(r) {
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 680;
  const g = cv.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 256, 0);
  grad.addColorStop(0, '#b81f15'); grad.addColorStop(0.5, '#e0301f'); grad.addColorStop(1, '#b81f15');
  g.fillStyle = grad; g.fillRect(0, 0, 256, 680);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = "900 190px Impact, 'Arial Black', 'Trebuchet MS', sans-serif";
  g.lineJoin = 'round';
  g.lineWidth = 18; g.strokeStyle = '#e8761a'; g.strokeText('DK', 128, 372);
  g.fillStyle = '#ffd21f'; g.fillText('DK', 128, 372);
  return r.createTexture(cv);
}

class BodyPart {
  constructor(name) {
    this.name = name;
    this.parent = null;
    this.children = [];
    this.shapes = [];
    this.curves = [];
    this.position = [0, 0, 0];     // translasi lokal
    this.rotation = [0, 0, 0];     // rotasi Euler lokal (x, y, z) radian
    this.scale = [1, 1, 1];        // skala lokal (ikut ke anak)
    this.axisRot = null;           // rotasi sumbu bebas: { axis, angle, pivot }
    this.rest = null;
  }

  at(x, y, z) { this.position = [x, y, z]; return this; }
  add(child) { child.parent = this; this.children.push(child); return child; }

  /** tambah bentuk (mesh) ke bagian ini; matrix offset-nya tetap, tidak ikut ke anak */
  addShape(mesh, o = {}) {
    const s = {
      mesh, color: o.color || [1, 1, 1],
      matrix: M4.compose(o.pos || [0, 0, 0], o.rot || [0, 0, 0], o.scale || [1, 1, 1]),
      fur: o.fur ? 0.9 : 0, tex: o.tex || null,
      shine: o.shine === undefined ? 0.12 : o.shine,
      castShadow: o.castShadow !== false,
    };
    this.shapes.push(s);
    return s;
  }
  ellipsoid(color, r, pos, o = {}) { return this.addShape(MESH.sphere, { ...o, color, scale: r, pos }); }
  cylinder(color, r, pos, o = {}) { return this.addShape(MESH.cylinder, { ...o, color, scale: r, pos }); }   // r = [rx, tinggi, rz]
  cone(color, r, pos, o = {}) { return this.addShape(MESH.cone, { ...o, color, scale: r, pos }); }          // r = [rx, tinggi, rz]
  custom(geo, color, o = {}) { return this.addShape(MESH.make(geo), { ...o, color }); }

  /** daftarkan kurva Bezier agar bisa ditampilkan (titik kontrol + kurva) */
  addCurve(curve) {
    this.curves.push({ curve, samples: curve.sample(28), poly: MESH.make(geoLines(curve.p)) });
  }

  /** simpan pose awal; resetPose() mengembalikannya tiap frame sebelum animasi diterapkan */
  captureRest() {
    this.rest = { p: [...this.position], r: [...this.rotation], s: [...this.scale] };
    this.children.forEach((c) => c.captureRest());
  }
  resetPose() {
    this.position = [...this.rest.p]; this.rotation = [...this.rest.r]; this.scale = [...this.rest.s];
    this.axisRot = null;
    this.children.forEach((c) => c.resetPose());
  }

  /** M_lokal = T · [rotasi sumbu bebas] · Ry · Rx · Rz · S */
  localMatrix() {
    let m = M4.translate(this.position[0], this.position[1], this.position[2]);
    if (this.axisRot) m = M4.multiply(m, M4.rotateAxisAt(this.axisRot.axis, this.axisRot.angle, this.axisRot.pivot));
    const r = this.rotation;
    if (r[1]) m = M4.multiply(m, M4.rotateY(r[1]));
    if (r[0]) m = M4.multiply(m, M4.rotateX(r[0]));
    if (r[2]) m = M4.multiply(m, M4.rotateZ(r[2]));
    return M4.multiply(m, M4.scale(this.scale[0], this.scale[1], this.scale[2]));
  }

  /** gambar bagian ini lalu anak-anaknya (matrix stack: push -> mul -> gambar -> anak -> pop) */
  draw(ctx) {
    ctx.stack.push();
    ctx.stack.mul(this.localMatrix());
    if (ctx.pass === 'overlay') { if (ctx.showCurves && this.curves.length) ctx.drawCurves(this); }
    else for (const s of this.shapes) ctx.drawShape(s);
    for (const c of this.children) c.draw(ctx);
    ctx.stack.pop();
  }

  /** posisi titik lokal di ruang dunia (butuh matriks seluruh rantai induk) */
  worldMatrix() {
    const chain = [];
    for (let p = this; p; p = p.parent) chain.unshift(p);
    let m = M4.identity();
    for (const p of chain) m = M4.multiply(m, p.localMatrix());
    return m;
  }
}
