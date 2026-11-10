// Enguarde the Swordfish: modelling + animation.
//
// Coordinate frame of the character: the fish faces +X, +Y is up and +Z
// points out of the fish's right-hand side (toward the default camera).
//
// Primitive -> body part
//   Sphere ................ eyes, pupils (flattened), eye highlights
//   Ellipsoid ............. main body, head, lower body (belly), mouth inside
//   Elliptic paraboloid ... upper snout (mouth area -> sword), lower jaw
//   Hyperbolic paraboloid . dorsal fin membrane, lower (anal) fin membrane
//   Flattened cone ........ sword, tail stalk (peduncle)
//   Bézier tubes .......... mouth lines, gills
//   Bézier sweeps ......... dorsal fin rays + leading edge, side (pectoral) fins
//   B-spline gen. cylinders tail lobes, lower (pelvic) fins, lower fin rays
//
// createEnguarde(upload) builds the hierarchy; `upload` turns CPU mesh data
// into a GPU mesh. The returned object exposes `root` and `update(t, opts)`.
(function (global) {
  "use strict";

  const G = Geometry;
  const M = mat4;

  // ---------------------------------------------------------------- materials
  const BLUE = [0.1, 0.6, 0.9];
  const GREEN = [0.36, 0.72, 0.3];
  const MAT = {
    body: { color: BLUE, belly: { color: GREEN, y0: -0.78, y1: -0.3 }, shininess: 70, specular: 0.55 },
    head: { color: BLUE, belly: { color: GREEN, y0: -0.62, y1: -0.25 }, shininess: 70, specular: 0.55 },
    belly: { color: GREEN, shininess: 40, specular: 0.3 },
    snout: { color: BLUE, shininess: 90, specular: 0.6 },
    jaw: { color: [0.3, 0.68, 0.38], shininess: 50, specular: 0.4 },
    fin: { color: [0.12, 0.62, 0.92], stripes: 5, shininess: 50, specular: 0.45 },
    membrane: { color: [0.14, 0.64, 0.93], stripes: 0, shininess: 40, specular: 0.35 },
    ray: { color: [0.08, 0.52, 0.82], shininess: 50, specular: 0.4 },
    eye: { color: [0.97, 0.97, 0.97], shininess: 120, specular: 0.8 },
    pupil: { color: [0.03, 0.03, 0.05], shininess: 160, specular: 1.0 },
    shine: { color: [1, 1, 1], shininess: 10, specular: 0, emissive: 1 },
    mouth: { color: [0.72, 0.24, 0.34], shininess: 30, specular: 0.25 },
    tongue: { color: [0.93, 0.5, 0.58], shininess: 60, specular: 0.5 },
    line: { color: [0.04, 0.32, 0.55], shininess: 30, specular: 0.2 },
  };

  function createEnguarde(upload) {
    const node = (name, data, material, base) =>
      new SceneNode(name, { mesh: data ? upload(data) : null, material, base });
    const T = (x, y, z) => M.translation(x, y, z);

    // ================================================================ BODY
    const root = new SceneNode("enguarde");
    const body = new SceneNode("body");
    root.add(body);

    // main body, lower body (belly) — ellipsoids
    body.add(node("mainBody", G.ellipsoid(1.45, 0.88, 0.74, 64, 40), MAT.body, T(-0.05, 0.05, 0)));
    body.add(node("lowerBody", G.ellipsoid(1.2, 0.5, 0.62, 48, 32), MAT.belly, T(0.2, -0.4, 0)));

    // ================================================================ HEAD
    // The head group yaws about a vertical line through x = 0.35 so the
    // whole front end counter-swings against the tail while swimming.
    const head = new SceneNode("headPivot");
    head.debugAxis = { point: [0.35, 0, 0], dir: [0, 1, 0] };
    body.add(head);

    const HEAD_C = [0.82, 0.12, 0], HEAD_R = [0.88, 0.72, 0.6];
    head.add(node("head", G.ellipsoid(...HEAD_R, 56, 40), MAT.head, T(...HEAD_C)));

    // ---- upper snout: elliptic paraboloid, apex forward; sword continues it
    const SN = { L: 1.6, a: 0.5, b: 0.48 };
    const snout = node("snout", G.ellipticParaboloid(SN.L, SN.a, SN.b, 32, 48), MAT.snout,
      M.mul(T(0.98, 0.02, 0), M.rotationZ(-0.05)));
    head.add(snout);
    // sword: flattened cone (wider than tall), starting inside the paraboloid
    snout.add(node("sword", G.flattenedCone(2.5, 0.15, 0.17, 0.012, 0.016, 12, 32), MAT.snout, T(1.42, 0, 0)));

    // Projects a point radially onto the snout paraboloid (snout-local).
    const onParaboloid = (P, off) => ([x, y, z]) => {
      x = Math.min(Math.max(x, 0), P.L * 0.98);
      const r = Math.sqrt(1 - x / P.L) * (1 + off);
      const d = Math.hypot(y / P.a, z / P.b) || 1;
      return [x, (r * y) / d, (r * z) / d];
    };
    // point on a paraboloid given axial position x and angle around the axis
    const parPt = (P, x, ang) => {
      const r = Math.sqrt(Math.max(1 - x / P.L, 0));
      return [x, P.a * r * Math.cos(ang), P.b * r * Math.sin(ang)];
    };

    // upper mouth line (Bézier tube) along the lower edge of the snout
    for (const side of [1, -1]) {
      const ang = (deg) => side * (deg * Math.PI) / 180;
      const cps = [
        parPt(SN, 0.25, ang(-122)),
        parPt(SN, 0.55, ang(-112)),
        parPt(SN, 0.85, ang(-104)),
        parPt(SN, 1.1, ang(-98)),
      ];
      snout.add(node("upperLip" + side, G.bezierTube(cps, 0.028, 0.012, { project: onParaboloid(SN, 0.02) }), MAT.line));
    }

    // ---- mouth inside (ellipsoid), visible when the jaw opens
    head.add(node("mouthInside", G.ellipsoid(0.5, 0.24, 0.28), MAT.mouth, T(1.38, -0.4, 0)));

    // ---- lower jaw: elliptic paraboloid hinged at the back of the mouth
    const JW = { L: 0.95, a: 0.2, b: 0.4 };
    const jaw = node("jawPivot", null, null, T(0.98, -0.34, 0));
    jaw.debugAxis = { point: [0, 0, 0], dir: [0, 0, 1] };
    head.add(jaw);
    jaw.add(node("jaw", G.ellipticParaboloid(JW.L, JW.a, JW.b), MAT.jaw));
    jaw.add(node("tongue", G.ellipsoid(0.38, 0.07, 0.2), MAT.tongue, T(0.42, 0.12, 0)));
    for (const side of [1, -1]) {
      const ang = (deg) => side * (deg * Math.PI) / 180;
      const cps = [
        parPt(JW, 0.03, ang(80)),
        parPt(JW, 0.3, ang(78)),
        parPt(JW, 0.6, ang(72)),
        parPt(JW, 0.85, ang(65)),
      ];
      jaw.add(node("lowerLip" + side, G.bezierTube(cps, 0.026, 0.012, { project: onParaboloid(JW, 0.03) }), MAT.line));
    }

    // ---- gills: Bézier tubes snapped onto whichever of head / body is outermost
    const BODY_IN_HEAD = [-0.87, -0.07, 0], BODY_R = [1.45, 0.88, 0.74];
    const ontoEllipsoid = (p, c, r, off) => {
      const d = vec3.sub(p, c);
      const k = Math.hypot(d[0] / r[0], d[1] / r[1], d[2] / r[2]) || 1;
      return vec3.add(c, vec3.scale(d, (1 + off) / k));
    };
    const onHeadOrBody = (p) => {
      const a = ontoEllipsoid(p, [0, 0, 0], HEAD_R, 0.015);
      const b = ontoEllipsoid(p, BODY_IN_HEAD, BODY_R, 0.015);
      return Math.abs(a[2]) > Math.abs(b[2]) ? a : b;
    };
    const gillArcs = [
      [[0.12, 0.28, 0.6], [-0.08, 0.1, 0.7], [-0.08, -0.22, 0.66], [0.1, -0.42, 0.55]],
      [[-0.08, 0.2, 0.6], [-0.26, 0.05, 0.7], [-0.26, -0.18, 0.66], [-0.1, -0.34, 0.55]],
    ];
    const gills = [];
    for (const side of [1, -1]) {
      const g = node("gills" + side, null, null, T(...HEAD_C));
      g.gillCenter = [-0.05, -0.05, 0.6 * side];
      gillArcs.forEach((arc, i) => {
        const cps = arc.map(([x, y, z]) => [x, y, z * side]);
        g.add(node(`gill${side}_${i}`, G.bezierTube(cps, 0.03, 0.01, { project: onHeadOrBody }), MAT.line));
      });
      gills.push(g);
      head.add(g);
    }

    // ---- eyes: eyeball -> pupil -> highlight (hierarchy)
    const eyes = [];
    for (const side of [1, -1]) {
      const eye = node("eye" + side, G.sphere(0.34), MAT.eye,
        M.mul(T(1.12, 0.8, 0.27 * side), M.rotationY(-0.5 * side)));
      const pupil = node("pupil" + side, G.ellipsoid(0.07, 0.15, 0.14, 24, 16), MAT.pupil, T(0.29, 0.02, 0));
      pupil.add(node("shine" + side, G.sphere(0.038, 12, 8), MAT.shine, T(0.06, 0.07, 0.05 * side)));
      eye.add(pupil);
      eye.side = side;
      eyes.push(eye);
      head.add(eye);
    }

    // ================================================================ DORSAL FIN
    // Membrane: hyperbolic paraboloid trimmed by two Bézier outline curves.
    // Rays + leading edge: Bézier sweeps laid onto the membrane.
    const dorsal = node("dorsalPivot", null, null, T(0.0, 0.78, 0));
    const dorsalAxis = { point: [0, -0.2, 0], dir: [1, 0.1, 0] };
    dorsal.debugAxis = dorsalAxis;
    body.add(dorsal);
    {
      const lead = [[0.72, -0.2], [0.5, 0.55], [0.1, 1.35], [-0.45, 2.1]];
      const trail = [[-0.75, -0.2], [-0.5, 0.4], [-0.33, 1.25], [-0.45, 2.1]];
      const HP = { c: 0.16, a: 1.0, b: 2.0 };
      const domain = (s, t) => {
        const l = G.bezier3(lead, s), r = G.bezier3(trail, s);
        return [l[0] + (r[0] - l[0]) * t, l[1] + (r[1] - l[1]) * t];
      };
      const lift = ([x, y]) => [x, y, G.hyperbolicParaboloidZ(HP.c, HP.a, HP.b, x, y)];
      dorsal.add(node("dorsalMembrane", G.hyperbolicParaboloid(HP.c, HP.a, HP.b, domain, 40, 20), MAT.membrane));

      const raySweep = (cps2d, r0, r1) =>
        G.bezierSweep(cps2d.map(lift), (t) => r0 + (r1 - r0) * t, (t) => r0 + (r1 - r0) * t,
          { project: (p) => lift(p), nu: 36, nv: 8 });
      dorsal.add(node("dorsalLeadingEdge", raySweep(lead, 0.055, 0.008), MAT.fin));
      dorsal.add(node("dorsalTrailingEdge", raySweep(trail, 0.025, 0.008), MAT.fin));
      for (let k = 1; k <= 6; k++) {
        const t = k / 7;
        const cps = [0, 0.35, 0.7, 1].map((s) => domain(s, t));
        dorsal.add(node("dorsalRay" + k, raySweep(cps, 0.024, 0.006), MAT.ray));
      }
    }

    // ================================================================ SIDE FINS
    // Pectoral fins: flat blades swept along cubic Bézier spines.
    const pectorals = [];
    for (const side of [1, -1]) {
      const fin = node("pectoralPivot" + side, null, null, T(0.78, -0.32, 0.48 * side));
      fin.hinge = [1, 0.25, 0.3 * side];
      fin.debugAxis = { point: [0, 0, 0], dir: fin.hinge };
      fin.side = side;
      const spine = [[0, 0, 0], [-0.12, -0.45, 0.1 * side], [-0.32, -0.95, 0.16 * side], [-0.55, -1.4, 0.18 * side]];
      fin.add(node("pectoralFin" + side,
        G.bezierSweep(spine, (t) => 0.21 * Math.sin(Math.PI * (0.12 + 0.88 * t)), (t) => 0.04 * (1 - t) + 0.006,
          { up: [0, 0, 1], nu: 48, nv: 16 }),
        MAT.fin));
      pectorals.push(fin);
      body.add(fin);
    }

    // ================================================================ LOWER FINS
    // Pelvic fins: B-spline generalized cylinders (spine + radii are B-splines).
    const pelvics = [];
    for (const side of [1, -1]) {
      const fin = node("pelvicPivot" + side, null, null, T(-0.2, -0.68, 0.3 * side));
      fin.hinge = [1, -0.1, 0.4 * side];
      fin.debugAxis = { point: [0, 0, 0], dir: fin.hinge };
      fin.side = side;
      const spine = [[0, 0, 0], [-0.12, -0.5, 0.04 * side], [-0.32, -1.1, 0.09 * side], [-0.55, -1.7, 0.12 * side], [-0.78, -2.25, 0.12 * side]];
      fin.add(node("pelvicFin" + side,
        G.bsplineCylinder(spine, [0.05, 0.04, 0.03, 0.02, 0.005], [0.1, 0.2, 0.24, 0.16, 0.01]),
        MAT.fin));
      pelvics.push(fin);
      body.add(fin);
    }

    // Anal (lower) fin: hyperbolic-paraboloid membrane trimmed by B-spline
    // outlines, stiffened by B-spline generalized-cylinder rays.
    const anal = node("analPivot", null, null, T(-0.95, -0.55, 0));
    const analAxis = { point: [0, 0.1, 0], dir: [1, -0.2, 0] };
    anal.debugAxis = analAxis;
    body.add(anal);
    {
      const lead = [[0.32, 0.1], [0.22, -0.4], [0.02, -0.85], [-0.25, -1.25], [-0.5, -1.5]];
      const trail = [[-0.35, 0.1], [-0.42, -0.4], [-0.45, -0.85], [-0.48, -1.2], [-0.5, -1.5]];
      const HP = { c: -0.12, a: 0.8, b: 1.5 };
      const domain = (s, t) => {
        const l = G.bspline3(lead, s), r = G.bspline3(trail, s);
        return [l[0] + (r[0] - l[0]) * t, l[1] + (r[1] - l[1]) * t];
      };
      const lift = ([x, y]) => [x, y, G.hyperbolicParaboloidZ(HP.c, HP.a, HP.b, x, y)];
      anal.add(node("analMembrane", G.hyperbolicParaboloid(HP.c, HP.a, HP.b, domain, 32, 16), MAT.membrane));
      for (let k = 0; k <= 5; k++) {
        const t = k / 5;
        const spine = [0, 0.25, 0.5, 0.75, 1].map((s) => lift(domain(s, t)));
        const r = k === 0 ? 0.04 : 0.02;
        anal.add(node("analRay" + k, G.bsplineCylinder(spine, [r, r * 0.8, r * 0.6, r * 0.4, 0.004], [r, r * 0.8, r * 0.6, r * 0.4, 0.004], { nu: 32, nv: 8 }), MAT.ray));
      }
    }

    // ================================================================ TAIL
    // tail stalk: flattened cone pointing backwards (-X); its pivot is a
    // parent of the tail-fin pivot, giving a 2-link swinging chain.
    const peduncle = node("pedunclePivot", null, null, T(-1.05, 0.05, 0));
    peduncle.debugAxis = { point: [0, 0, 0], dir: [0, 1, 0] };
    body.add(peduncle);
    peduncle.add(node("peduncle", G.flattenedCone(-1.5, 0.62, 0.52, 0.14, 0.09), MAT.body));

    const tail = node("tailPivot", null, null, T(-1.45, 0, 0));
    tail.debugAxis = { point: [0, 0, 0], dir: [0, 1, 0] };
    peduncle.add(tail);
    tail.add(node("tailHub", G.ellipsoid(0.26, 0.2, 0.1, 24, 16), MAT.fin));
    // tail lobes: B-spline generalized cylinders, flat (thin in Z)
    tail.add(node("tailUpper",
      G.bsplineCylinder(
        [[0.1, 0, 0], [-0.2, 0.3, 0], [-0.5, 0.85, 0], [-0.75, 1.4, 0], [-0.95, 1.95, 0]],
        [0.06, 0.05, 0.04, 0.025, 0.005],
        [0.18, 0.42, 0.5, 0.34, 0.02]),
      MAT.fin));
    tail.add(node("tailLower",
      G.bsplineCylinder(
        [[0.1, 0, 0], [-0.2, -0.28, 0], [-0.45, -0.75, 0], [-0.62, -1.2, 0], [-0.72, -1.6, 0]],
        [0.06, 0.05, 0.04, 0.025, 0.005],
        [0.18, 0.38, 0.42, 0.26, 0.02]),
      MAT.fin));

    // Mouth position (jaw-local) used to emit bubbles.
    const mouthLocal = [0.5, 0.12, 0];

    // ================================================================ ANIMATION
    const smooth = (x) => x * x * (3 - 2 * x);

    function update(t, opts = {}) {
      const {
        swimPath = false,
        scale = 1,
        rollStart = null, // time a barrel roll was triggered
        pathPhase = t,
      } = opts;
      const w = 2 * Math.PI * 0.9; // tail beat frequency (rad/s)

      // ---- ROOT: translation along a figure-eight path + heading rotation
      if (swimPath) {
        const A = 5.5, B = 7;
        const pathAt = (th) => [A * Math.sin(th), 0.8 * Math.sin(2 * th), B * Math.sin(th) * Math.cos(th)];
        const dirAt = (th) => [A * Math.cos(th), 1.6 * Math.cos(2 * th), B * Math.cos(2 * th)];
        const headingAt = (th) => Math.atan2(-dirAt(th)[2], dirAt(th)[0]);
        const th = pathPhase * 0.28;
        const d = dirAt(th);
        const heading = headingAt(th);
        const pitch = 0.6 * Math.atan2(d[1], Math.hypot(d[0], d[2]));
        // bank into turns: proportional to the rate of change of heading
        let turn = headingAt(th + 0.01) - heading;
        turn = Math.atan2(Math.sin(turn), Math.cos(turn)) / 0.01;
        const bank = Math.max(-0.5, Math.min(0.5, -0.12 * turn));
        root.pose = M.mul(T(...pathAt(th)), M.rotationY(heading), M.rotationZ(pitch), M.rotationX(bank),
          M.scaling(scale, scale, scale));
      } else {
        root.pose = M.scaling(scale, scale, scale);
      }

      // ---- BODY: bob (translation), breathing (scaling), barrel roll
      // (rotation about an arbitrary line through the body)
      let roll = M.identity();
      if (rollStart !== null && t - rollStart < 1.6) {
        const a = 2 * Math.PI * smooth(Math.max(t - rollStart, 0) / 1.6);
        roll = M.rotationAboutLine(a, [0.4, 0.05, 0], [1, -0.08, 0.06]);
      }
      const breathe = 1 + 0.02 * Math.sin(2.1 * t);
      body.pose = M.mul(
        T(0, 0.12 * Math.sin(1.1 * t), 0),
        M.rotationZ(0.05 * Math.sin(1.1 * t + 1)),
        roll,
        M.scaling(1, breathe, 1 + 0.6 * (breathe - 1))
      );

      // ---- tail chain (hierarchical rotation with phase lag) + head counter-swing
      peduncle.pose = M.rotationY(0.28 * Math.sin(w * t));
      tail.pose = M.rotationY(0.42 * Math.sin(w * t - 1.1));
      head.pose = M.rotationAboutLine(-0.07 * Math.sin(w * t), head.debugAxis.point, head.debugAxis.dir);

      // ---- fins: rotations about arbitrary axes
      dorsal.pose = M.rotationAboutLine(0.14 * Math.sin(w * t - 0.6), dorsalAxis.point, dorsalAxis.dir);
      anal.pose = M.rotationAboutLine(-0.16 * Math.sin(w * t - 1.4), analAxis.point, analAxis.dir);
      for (const f of pectorals)
        f.pose = M.rotationAxis(-f.side * (0.3 + 0.28 * Math.sin(1.7 * t + (f.side > 0 ? 0 : 0.5))), f.hinge);
      for (const f of pelvics)
        f.pose = M.rotationAxis(-f.side * (0.12 + 0.12 * Math.sin(1.3 * t + 1 + (f.side > 0 ? 0 : 0.7))), f.hinge);

      // ---- jaw: open/close
      const talk = 0.5 + 0.5 * Math.sin(0.9 * t);
      jaw.pose = M.rotationZ(-(0.22 + 0.3 * talk));

      // ---- eyes: look around (rotation) + blink (scaling)
      const look = Math.sin(0.55 * t) + 0.35 * Math.sin(1.7 * t);
      const blinkPhase = t % 3.7;
      const blink = blinkPhase < 0.22 ? 1 - 0.88 * Math.sin((Math.PI * blinkPhase) / 0.22) : 1;
      for (const e of eyes)
        e.pose = M.mul(M.rotationY(0.22 * look), M.rotationZ(0.12 + 0.1 * Math.sin(0.43 * t)), M.scaling(1, blink, 1));

      // ---- gills: pulse (scaling about the gill centre)
      const g = 1 + 0.07 * Math.sin(2.4 * t);
      for (const gl of gills) {
        const c = gl.gillCenter;
        gl.pose = M.mul(T(...c), M.scaling(g, g, 1), T(-c[0], -c[1], -c[2]));
      }
    }

    function mouthWorld() {
      return M.transformPoint(jaw.worldMatrix, mouthLocal);
    }

    update(0);
    return { root, update, mouthWorld };
  }

  global.createEnguarde = createEnguarde;
})(window);
