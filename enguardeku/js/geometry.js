// Geometry generators: quadric surfaces, parametric curves (cubic Bézier,
// uniform cubic B-spline) and swept surfaces built on top of those curves.
// Every generator returns plain CPU-side mesh data:
//   { positions, normals, uvs, indices, lineIndices }
(function (global) {
  "use strict";

  const TAU = Math.PI * 2;

  // ---------------------------------------------------------------------------
  // Grid mesh builder. `fn(u, v)` (u, v in [0,1]) returns { p, n } and the
  // grid of (nu+1) x (nv+1) samples is stitched into triangles.
  // ---------------------------------------------------------------------------
  function buildGrid(nu, nv, fn) {
    const positions = [], normals = [], uvs = [], indices = [], lineIndices = [];
    for (let i = 0; i <= nu; i++) {
      for (let j = 0; j <= nv; j++) {
        const u = i / nu, v = j / nv;
        const s = fn(u, v);
        const n = vec3.normalize(s.n);
        positions.push(s.p[0], s.p[1], s.p[2]);
        normals.push(n[0], n[1], n[2]);
        const uv = s.uv || [u, v];
        uvs.push(uv[0], uv[1]);
      }
    }
    const row = nv + 1;
    for (let i = 0; i < nu; i++) {
      for (let j = 0; j < nv; j++) {
        const a = i * row + j, b = (i + 1) * row + j, c = b + 1, d = a + 1;
        indices.push(a, b, c, a, c, d);
        lineIndices.push(a, b, a, d);
      }
    }
    return { positions, normals, uvs, indices, lineIndices };
  }

  // ---------------------------------------------------------------------------
  // QUADRICS
  // ---------------------------------------------------------------------------

  // Ellipsoid  x²/a² + y²/b² + z²/c² = 1   (sphere when a = b = c)
  function ellipsoid(a, b, c, nu = 48, nv = 32) {
    return buildGrid(nu, nv, (u, v) => {
      const theta = u * TAU;                  // longitude
      const phi = -Math.PI / 2 + v * Math.PI; // latitude
      const p = [
        a * Math.cos(phi) * Math.cos(theta),
        b * Math.sin(phi),
        c * Math.cos(phi) * Math.sin(theta),
      ];
      // gradient of the implicit equation
      return { p, n: [p[0] / (a * a), p[1] / (b * b), p[2] / (c * c)] };
    });
  }

  function sphere(r, nu = 32, nv = 24) {
    return ellipsoid(r, r, r, nu, nv);
  }

  // Elliptic paraboloid opening toward -X with its apex at x = L:
  //   x = L (1 - y²/a² - z²/b²),   0 <= x <= L
  function ellipticParaboloid(L, a, b, nu = 24, nv = 40) {
    return buildGrid(nu, nv, (u, v) => {
      const ang = v * TAU;
      const p = [L * (1 - u * u), a * u * Math.cos(ang), b * u * Math.sin(ang)];
      return { p, n: [1 / L, (2 * p[1]) / (a * a), (2 * p[2]) / (b * b)] };
    });
  }

  // Hyperbolic paraboloid  z = c (x²/a² - y²/b²), trimmed to an arbitrary
  // region of the XY plane. `domain(s, t)` maps the unit square to the (x, y)
  // region (e.g. the area between two Bézier outline curves of a fin).
  function hyperbolicParaboloid(c, a, b, domain, nu = 32, nv = 16) {
    return buildGrid(nu, nv, (s, t) => {
      const [x, y] = domain(s, t);
      const z = c * ((x * x) / (a * a) - (y * y) / (b * b));
      return {
        p: [x, y, z],
        n: [(-2 * c * x) / (a * a), (2 * c * y) / (b * b), 1],
        uv: [s, t],
      };
    });
  }
  // Height of the same saddle, used to lay fin rays onto the membrane.
  function hyperbolicParaboloidZ(c, a, b, x, y) {
    return c * ((x * x) / (a * a) - (y * y) / (b * b));
  }

  // Flattened (elliptic) cone / frustum along the X axis, from x = 0 with
  // semi-axes (a0, b0) to x = L with semi-axes (a1, b1). L may be negative.
  function flattenedCone(L, a0, b0, a1, b1, nu = 16, nv = 40) {
    return buildGrid(nu, nv, (s, v) => {
      const ang = v * TAU;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const ry = a0 + (a1 - a0) * s;
      const rz = b0 + (b1 - b0) * s;
      const p = [s * L, ry * ca, rz * sa];
      // n = dP/dv x dP/ds, oriented outward
      const dS = [L, (a1 - a0) * ca, (b1 - b0) * sa];
      const dV = [0, -ry * sa, rz * ca];
      let n = vec3.cross(dV, dS);
      if (vec3.dot(n, [0, ca, sa]) < 0) n = vec3.scale(n, -1);
      return { p, n };
    });
  }

  // ---------------------------------------------------------------------------
  // CURVES
  // ---------------------------------------------------------------------------

  // Cubic Bézier, works on any dimension (arrays of numbers).
  function bezier3(P, t) {
    const it = 1 - t;
    const b0 = it * it * it, b1 = 3 * it * it * t, b2 = 3 * it * t * t, b3 = t * t * t;
    return P[0].map((_, k) => b0 * P[0][k] + b1 * P[1][k] + b2 * P[2][k] + b3 * P[3][k]);
  }

  // Uniform cubic B-spline. The end control points are tripled so the curve
  // is clamped (starts at the first and ends at the last control point).
  // Control "points" may be numbers (e.g. radii) or arrays (positions).
  function bspline3(ctrl, t) {
    const arr = (x) => (Array.isArray(x) ? x : [x]);
    const P = [ctrl[0], ctrl[0], ...ctrl, ctrl[ctrl.length - 1], ctrl[ctrl.length - 1]].map(arr);
    const segs = P.length - 3;
    const x = Math.min(Math.max(t, 0), 1) * segs;
    const i = Math.min(Math.floor(x), segs - 1);
    const u = x - i, u2 = u * u, u3 = u2 * u;
    const b0 = (1 - 3 * u + 3 * u2 - u3) / 6;
    const b1 = (4 - 6 * u2 + 3 * u3) / 6;
    const b2 = (1 + 3 * u + 3 * u2 - 3 * u3) / 6;
    const b3 = u3 / 6;
    const r = P[i].map((_, k) => b0 * P[i][k] + b1 * P[i + 1][k] + b2 * P[i + 2][k] + b3 * P[i + 3][k]);
    return Array.isArray(ctrl[0]) ? r : r[0];
  }

  // ---------------------------------------------------------------------------
  // SWEEPS
  // ---------------------------------------------------------------------------

  // Sweep an ellipse along a space curve. The cross-section at parameter t
  // has semi-axes radii(t) = [rN, rB] measured along the frame vectors N and
  // B. N is the component of `up` perpendicular to the tangent, B = T x N.
  // With a circular section this is a tube; with rN != rB a flat blade.
  function sweep(center, radii, { up = [0, 0, 1], nu = 48, nv = 16 } = {}) {
    const eps = 1e-3;
    return buildGrid(nu, nv, (t, v) => {
      const c = center(t);
      const ahead = center(Math.min(t + eps, 1));
      const behind = center(Math.max(t - eps, 0));
      const T = vec3.normalize(vec3.sub(ahead, behind));
      let N = vec3.sub(up, vec3.scale(T, vec3.dot(up, T)));
      if (vec3.length(N) < 1e-6) N = vec3.cross(T, [1, 0, 0]);
      N = vec3.normalize(N);
      const B = vec3.cross(T, N);
      const [rN, rB] = radii(t);
      const ang = v * TAU;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const p = vec3.add(c, vec3.add(vec3.scale(N, rN * ca), vec3.scale(B, rB * sa)));
      // gradient of the elliptic cross-section
      const n = vec3.add(
        vec3.scale(N, ca / Math.max(rN, 1e-4)),
        vec3.scale(B, sa / Math.max(rB, 1e-4))
      );
      return { p, n, uv: [t, sa] };
    });
  }

  // Tube with tapering radius around a cubic Bézier curve.
  // `project` optionally snaps each curve sample onto a surface.
  function bezierTube(P, r0, r1, { project = null, nu = 40, nv = 10 } = {}) {
    const center = (t) => (project ? project(bezier3(P, t)) : bezier3(P, t));
    // thickest in the middle, tapering toward both ends
    const radius = (t) => {
      const r = r0 + (r1 - r0) * Math.abs(2 * t - 1);
      return [r, r];
    };
    return sweep(center, radius, { nu, nv });
  }

  // Bézier sweep: a flattened section (thickness x chord) swept along a
  // cubic Bézier spine, with the chord following `chord(t)`.
  function bezierSweep(P, chord, thickness, { up = [0, 0, 1], nu = 48, nv = 16, project = null } = {}) {
    const center = (t) => (project ? project(bezier3(P, t)) : bezier3(P, t));
    return sweep(center, (t) => [thickness(t), chord(t)], { up, nu, nv });
  }

  // Generalized cylinder: the spine AND the radii are uniform cubic
  // B-splines, so the cross-section varies smoothly along the length.
  function bsplineCylinder(spineCtrl, radiusNCtrl, radiusBCtrl, { up = [0, 0, 1], nu = 64, nv = 16 } = {}) {
    return sweep(
      (t) => bspline3(spineCtrl, t),
      (t) => [Math.max(bspline3(radiusNCtrl, t), 1e-3), Math.max(bspline3(radiusBCtrl, t), 1e-3)],
      { up, nu, nv }
    );
  }

  global.Geometry = {
    buildGrid,
    ellipsoid,
    sphere,
    ellipticParaboloid,
    hyperbolicParaboloid,
    hyperbolicParaboloidZ,
    flattenedCone,
    bezier3,
    bspline3,
    sweep,
    bezierTube,
    bezierSweep,
    bsplineCylinder,
  };
})(window);
