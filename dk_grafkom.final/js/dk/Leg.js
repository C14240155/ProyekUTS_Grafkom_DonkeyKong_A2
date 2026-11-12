"use strict";
/* Rantai kaki (HIERARCHICAL):  Leg (paha) -> Shin (betis, lutut) -> Foot (telapak) -> Toe (jari kaki)
 * Titik asal Leg = sendi pinggul. Kaki menggantung ke bawah (-y). */

class Toe extends BodyPart {
  constructor(i, big) {
    super('Toe' + i);
    const r = big ? 0.095 : 0.075;
    this.ellipsoid(C.tan, [r, r * 0.9, big ? 0.13 : 0.11], [0, 0, 0.07]);
  }
}

class Foot extends BodyPart {
  constructor(side) {
    super(side > 0 ? 'FootL' : 'FootR');
    this.ellipsoid(C.tan, [0.30, 0.15, 0.46], [0, -0.06, 0.14], { shine: 0.08 });        // telapak kaki
    this.ellipsoid(C.fur, [0.29, 0.17, 0.30], [0, 0.0, -0.06], { fur: true });            // tumit berbulu
    this.toes = [];
    const xs = [-0.2, -0.1, 0, 0.1, 0.2];
    xs.forEach((x, i) => {
      const t = this.add(new Toe(i, Math.abs(x) > 0.15)).at(x * side, -0.11, 0.55 - Math.abs(x) * 0.35);
      this.toes.push(t);
    });
  }
}

class Shin extends BodyPart {
  constructor(side) {
    super(side > 0 ? 'ShinL' : 'ShinR');
    this.ellipsoid(C.fur, [0.34, 0.34, 0.34], [0, 0, 0], { fur: true });                  // lutut
    this.ellipsoid(C.fur, [0.31, 0.36, 0.32], [0, -0.22, 0.02], { fur: true });           // betis
    this.foot = this.add(new Foot(side)).at(0, -0.40, 0);
  }
}

class Leg extends BodyPart {
  constructor(side) {
    super(side > 0 ? 'LegL' : 'LegR');
    this.side = side;
    this.ellipsoid(C.fur, [0.40, 0.44, 0.42], [0, -0.22, 0], { fur: true });              // paha
    this.shin = this.add(new Shin(side)).at(0, -0.42, 0);
  }
  get foot() { return this.shin.foot; }
}
