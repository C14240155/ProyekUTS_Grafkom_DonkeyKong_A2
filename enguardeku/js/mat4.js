// Minimal matrix / vector library (column-major, WebGL convention).
// Every transformation used by the project is implemented here by hand:
// translation, rotation (X/Y/Z), scaling, rotation about an arbitrary axis
// (Rodrigues' formula) and rotation about an arbitrary line in space.
(function (global) {
  "use strict";

  const vec3 = {
    add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
    sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    scale: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
    dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    cross: (a, b) => [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ],
    length: (a) => Math.hypot(a[0], a[1], a[2]),
    normalize(a) {
      const l = Math.hypot(a[0], a[1], a[2]);
      return l > 1e-12 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0];
    },
    lerp: (a, b, t) => [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
      a[2] + (b[2] - a[2]) * t,
    ],
  };

  const mat4 = {
    identity() {
      const m = new Float32Array(16);
      m[0] = m[5] = m[10] = m[15] = 1;
      return m;
    },

    // out = a * b
    multiply(a, b) {
      const out = new Float32Array(16);
      for (let c = 0; c < 4; c++) {
        for (let r = 0; r < 4; r++) {
          out[c * 4 + r] =
            a[r] * b[c * 4] +
            a[4 + r] * b[c * 4 + 1] +
            a[8 + r] * b[c * 4 + 2] +
            a[12 + r] * b[c * 4 + 3];
        }
      }
      return out;
    },

    // Multiply any number of matrices left to right: mul(A, B, C) = A*B*C
    mul(...ms) {
      return ms.reduce((acc, m) => mat4.multiply(acc, m));
    },

    translation(tx, ty, tz) {
      const m = mat4.identity();
      m[12] = tx;
      m[13] = ty;
      m[14] = tz;
      return m;
    },

    scaling(sx, sy, sz) {
      const m = mat4.identity();
      m[0] = sx;
      m[5] = sy;
      m[10] = sz;
      return m;
    },

    rotationX(a) {
      const c = Math.cos(a), s = Math.sin(a);
      const m = mat4.identity();
      m[5] = c; m[6] = s;
      m[9] = -s; m[10] = c;
      return m;
    },

    rotationY(a) {
      const c = Math.cos(a), s = Math.sin(a);
      const m = mat4.identity();
      m[0] = c; m[2] = -s;
      m[8] = s; m[10] = c;
      return m;
    },

    rotationZ(a) {
      const c = Math.cos(a), s = Math.sin(a);
      const m = mat4.identity();
      m[0] = c; m[1] = s;
      m[4] = -s; m[5] = c;
      return m;
    },

    // Rotation by angle `a` about an arbitrary unit axis through the origin
    // (Rodrigues' rotation formula):
    //   R = cos(a) I + (1 - cos(a)) k k^T + sin(a) [k]x
    rotationAxis(a, axis) {
      const [x, y, z] = vec3.normalize(axis);
      const c = Math.cos(a), s = Math.sin(a), t = 1 - c;
      const m = mat4.identity();
      m[0] = t * x * x + c;     m[4] = t * x * y - s * z; m[8] = t * x * z + s * y;
      m[1] = t * x * y + s * z; m[5] = t * y * y + c;     m[9] = t * y * z - s * x;
      m[2] = t * x * z - s * y; m[6] = t * y * z + s * x; m[10] = t * z * z + c;
      return m;
    },

    // Rotation about an arbitrary line passing through `point` with direction
    // `dir`: translate the line to the origin, rotate, translate back.
    //   M = T(p) * R(axis, a) * T(-p)
    rotationAboutLine(a, point, dir) {
      return mat4.mul(
        mat4.translation(point[0], point[1], point[2]),
        mat4.rotationAxis(a, dir),
        mat4.translation(-point[0], -point[1], -point[2])
      );
    },

    perspective(fovy, aspect, near, far) {
      const f = 1 / Math.tan(fovy / 2);
      const m = new Float32Array(16);
      m[0] = f / aspect;
      m[5] = f;
      m[10] = (far + near) / (near - far);
      m[11] = -1;
      m[14] = (2 * far * near) / (near - far);
      return m;
    },

    lookAt(eye, target, up) {
      const z = vec3.normalize(vec3.sub(eye, target));
      const x = vec3.normalize(vec3.cross(up, z));
      const y = vec3.cross(z, x);
      const m = mat4.identity();
      m[0] = x[0]; m[4] = x[1]; m[8] = x[2];
      m[1] = y[0]; m[5] = y[1]; m[9] = y[2];
      m[2] = z[0]; m[6] = z[1]; m[10] = z[2];
      m[12] = -vec3.dot(x, eye);
      m[13] = -vec3.dot(y, eye);
      m[14] = -vec3.dot(z, eye);
      return m;
    },

    invert(m) {
      const inv = new Float32Array(16);
      inv[0] = m[5]*m[10]*m[15] - m[5]*m[11]*m[14] - m[9]*m[6]*m[15] + m[9]*m[7]*m[14] + m[13]*m[6]*m[11] - m[13]*m[7]*m[10];
      inv[4] = -m[4]*m[10]*m[15] + m[4]*m[11]*m[14] + m[8]*m[6]*m[15] - m[8]*m[7]*m[14] - m[12]*m[6]*m[11] + m[12]*m[7]*m[10];
      inv[8] = m[4]*m[9]*m[15] - m[4]*m[11]*m[13] - m[8]*m[5]*m[15] + m[8]*m[7]*m[13] + m[12]*m[5]*m[11] - m[12]*m[7]*m[9];
      inv[12] = -m[4]*m[9]*m[14] + m[4]*m[10]*m[13] + m[8]*m[5]*m[14] - m[8]*m[6]*m[13] - m[12]*m[5]*m[10] + m[12]*m[6]*m[9];
      inv[1] = -m[1]*m[10]*m[15] + m[1]*m[11]*m[14] + m[9]*m[2]*m[15] - m[9]*m[3]*m[14] - m[13]*m[2]*m[11] + m[13]*m[3]*m[10];
      inv[5] = m[0]*m[10]*m[15] - m[0]*m[11]*m[14] - m[8]*m[2]*m[15] + m[8]*m[3]*m[14] + m[12]*m[2]*m[11] - m[12]*m[3]*m[10];
      inv[9] = -m[0]*m[9]*m[15] + m[0]*m[11]*m[13] + m[8]*m[1]*m[15] - m[8]*m[3]*m[13] - m[12]*m[1]*m[11] + m[12]*m[3]*m[9];
      inv[13] = m[0]*m[9]*m[14] - m[0]*m[10]*m[13] - m[8]*m[1]*m[14] + m[8]*m[2]*m[13] + m[12]*m[1]*m[10] - m[12]*m[2]*m[9];
      inv[2] = m[1]*m[6]*m[15] - m[1]*m[7]*m[14] - m[5]*m[2]*m[15] + m[5]*m[3]*m[14] + m[13]*m[2]*m[7] - m[13]*m[3]*m[6];
      inv[6] = -m[0]*m[6]*m[15] + m[0]*m[7]*m[14] + m[4]*m[2]*m[15] - m[4]*m[3]*m[14] - m[12]*m[2]*m[7] + m[12]*m[3]*m[6];
      inv[10] = m[0]*m[5]*m[15] - m[0]*m[7]*m[13] - m[4]*m[1]*m[15] + m[4]*m[3]*m[13] + m[12]*m[1]*m[7] - m[12]*m[3]*m[5];
      inv[14] = -m[0]*m[5]*m[14] + m[0]*m[6]*m[13] + m[4]*m[1]*m[14] - m[4]*m[2]*m[13] - m[12]*m[1]*m[6] + m[12]*m[2]*m[5];
      inv[3] = -m[1]*m[6]*m[11] + m[1]*m[7]*m[10] + m[5]*m[2]*m[11] - m[5]*m[3]*m[10] - m[9]*m[2]*m[7] + m[9]*m[3]*m[6];
      inv[7] = m[0]*m[6]*m[11] - m[0]*m[7]*m[10] - m[4]*m[2]*m[11] + m[4]*m[3]*m[10] + m[8]*m[2]*m[7] - m[8]*m[3]*m[6];
      inv[11] = -m[0]*m[5]*m[11] + m[0]*m[7]*m[9] + m[4]*m[1]*m[11] - m[4]*m[3]*m[9] - m[8]*m[1]*m[7] + m[8]*m[3]*m[5];
      inv[15] = m[0]*m[5]*m[10] - m[0]*m[6]*m[9] - m[4]*m[1]*m[10] + m[4]*m[2]*m[9] + m[8]*m[1]*m[6] - m[8]*m[2]*m[5];
      let det = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12];
      if (Math.abs(det) < 1e-12) return mat4.identity();
      det = 1 / det;
      for (let i = 0; i < 16; i++) inv[i] *= det;
      return inv;
    },

    // Upper-left 3x3 of the inverse-transpose: correct normals under
    // non-uniform scaling.
    normalMatrix(m) {
      const i = mat4.invert(m);
      return new Float32Array([
        i[0], i[4], i[8],
        i[1], i[5], i[9],
        i[2], i[6], i[10],
      ]);
    },

    transformPoint(m, p) {
      const x = p[0], y = p[1], z = p[2];
      const w = m[3] * x + m[7] * y + m[11] * z + m[15];
      return [
        (m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
        (m[1] * x + m[5] * y + m[9] * z + m[13]) / w,
        (m[2] * x + m[6] * y + m[10] * z + m[14]) / w,
      ];
    },
  };

  // Classic matrix stack used to walk the hierarchical model.
  class MatrixStack {
    constructor() {
      this.current = mat4.identity();
      this.stack = [];
    }
    push() {
      this.stack.push(this.current);
    }
    pop() {
      this.current = this.stack.pop();
    }
    apply(m) {
      this.current = mat4.multiply(this.current, m);
    }
  }

  global.vec3 = vec3;
  global.mat4 = mat4;
  global.MatrixStack = MatrixStack;
})(window);
