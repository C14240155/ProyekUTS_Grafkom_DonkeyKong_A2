"use strict";
/* Torso (badan) dan Chest (area dada & perut berwarna tan).
 * Titik asal Torso = pinggul. Sumbu +y ke atas, +z = arah hadap Donkey Kong. */

/* Definisi ellipsoid (pusat c, jari-jari r) -> dipakai untuk membangun mesh
 * sekaligus untuk menghitung permukaan depan tempat dasi menempel. */
const TORSO_BODY = [
  { c: [0, 0.12, -0.02], r: [0.66, 0.52, 0.56] },   // pinggul & perut (bulu)
  { c: [0, 0.88, -0.04], r: [0.98, 0.82, 0.70] },   // dada atas & punggung (bulu)
];
const CHEST_PATCH = [
  { c: [0, 0.86, 0.30], r: [0.62, 0.64, 0.46] },    // dada tengah
  { c: [0.30, 1.02, 0.4], r: [0.36, 0.32, 0.34] }, // otot dada kiri
  { c: [-0.30, 1.02, 0.4], r: [0.36, 0.32, 0.34] },// otot dada kanan
  { c: [0, 0.28, 0.30], r: [0.48, 0.48, 0.40] },    // perut
  { c: [0, 1.28, 0.28], r: [0.34, 0.34, 0.30] },    // pangkal leher
];

/** z permukaan depan torso pada (x, y) lokal torso */
function torsoFrontZ(x, y) {
  let z = -Infinity;
  for (const e of TORSO_BODY.concat(CHEST_PATCH)) z = Math.max(z, ellipsoidZ(e.c, e.r, x, y));
  return z;
}

class Chest extends BodyPart {
  constructor() {
    super('Chest');
    for (const e of CHEST_PATCH) this.ellipsoid(C.tan, e.r, e.c, { shine: 0.08 });
  }
}

class Torso extends BodyPart {
  constructor() {
    super('Torso');
    for (const e of TORSO_BODY) this.ellipsoid(C.fur, e.r, e.c, { fur: true });
    this.ellipsoid(C.fur, [0.62, 0.42, 0.42], [0, 1.38, -0.30], { fur: true });        // punuk bahu belakang
    this.ellipsoid(C.furDark, [0.7, 0.5, 0.5], [0, 0.55, -0.34], { fur: true });       // punggung bawah
    this.chest = this.add(new Chest());
  }
}
