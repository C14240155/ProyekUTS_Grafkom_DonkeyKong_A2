"use strict";
/* Scene = kumpulan entitas tingkat atas. Menggambar semuanya dan menyimpan referensi
 * ke objek yang dianimasikan (karakter, pisang, bongo, awan). */

class Scene {
  constructor({ characterOnly = false } = {}) {
    this.entities = [];
    if (characterOnly) {
      this.axis = null;
      this.dk = this._add(new DonkeyKong());
      // Empty transform nodes keep the existing demo animator compatible.
      this.heroBanana = new BodyPart('bananaDemo');
      this.bongo = new BodyPart('bongoDemo');
      this.clouds = [];
      [this.dk, this.heroBanana, this.bongo].forEach((e) => e.captureRest());
      return;
    }
    this.axis = null;                  // garis sumbu rotasi (diisi demo "Rotate Arbitrary Axis")

    this.ground = this._add(new Ground());
    // latar: bukit & gunung (kerucut)
    this._add(new Hill(-16, -24, [10, 5, 7], hex('#4b8a3a')));
    this._add(new Hill(12, -27, [13, 7, 8], hex('#3f7d34')));
    this._add(new Hill(32, -16, [9, 4.5, 7], hex('#548f40')));
    this._add(new Hill(-34, -8, [9, 5, 8], hex('#478536')));
    this._add(new Mountain(-4, -42, 15, 17, hex('#6f9c86')));
    this._add(new Mountain(22, -46, 12, 13, hex('#7aa68f')));

    // karakter
    this.dk = this._add(new DonkeyKong());

    // OBJECT 1: pisang melayang (dipakai demo) + tumpukan pisang di tanah
    this.heroBanana = this._add(new Banana());
    this.heroBanana.position = [-2.7, 1.7, 1.6];
    this.heroBanana.scale = [1.3, 1.3, 1.3];
    [[-3.6, 0.24, 2.9, 0.5], [-3.0, 0.24, 3.4, -0.3], [-3.35, 0.47, 3.1, 1.3]].forEach(([x, y, z, ry]) => {
      const b = this._add(new Banana()); b.position = [x, y, z]; b.rotation = [0, ry, 0]; b.scale = [1.1, 1.1, 1.1];
    });

    // OBJECT 3: bongo (hyperboloid)
    this.bongo = this._add(new Bongo());
    this.bongo.position = [4.4, 0, 0.3];
    this.bongo.rotation = [0, -0.7, 0];

    // OBJECT 2: pohon palem + semak + batu
    [[-7, -3, 4.6, 0.9, 0.3], [8, -6, 5.2, -1.0, 1.0], [-9.5, 4, 4.0, 0.7, 2.0], [11, 5, 4.4, -0.8, 0.5], [3, -12, 5.6, 1.1, 2.6], [-12, -10, 5.0, 0.8, 1.4]]
      .forEach(([x, z, h, lean, ry]) => { const t = this._add(new PalmTree(h, lean)); t.position = [x, 0, z]; t.rotation = [0, ry, 0]; });
    [[-5.2, -5, 1.0], [6.5, -2.5, 0.9], [-7.5, 1.0, 1.2], [9, 2, 1.0], [0, -8, 1.3]].forEach(([x, z, s]) => { const b = this._add(new Bush()); b.position = [x, 0, z]; b.scale = [s, s, s]; });
    [[-3.6, -2.4, 0.5], [5.4, 3.2, 0.4], [-6.0, 5.5, 0.6], [2.5, -4.5, 0.45]].forEach(([x, z, r]) => { const k = this._add(new Rock(r)); k.position = [x, 0, z]; });

    // awan
    this.clouds = [[-14, 13, -10, 0.25], [4, 15, -20, 0.18], [18, 12, -6, 0.3], [-4, 14, -30, 0.22], [-24, 16, -22, 0.2]]
      .map(([x, y, z, sp]) => { const c = this._add(new Cloud(sp)); c.position = [x, y, z]; return c; });

    this.entities.forEach((e) => e.captureRest());
  }

  _add(e) { this.entities.push(e); return e; }
  resetPose() {
    this.entities.forEach((e) => e.resetPose());
    if (!this.entities.includes(this.heroBanana)) this.heroBanana.resetPose();
    if (!this.entities.includes(this.bongo)) this.bongo.resetPose();
  }

  draw(ctx) {
    for (const e of this.entities) e.draw(ctx);
    if (ctx.pass === 'overlay' && this.axis) ctx.drawAxis(this.axis);
  }
}
