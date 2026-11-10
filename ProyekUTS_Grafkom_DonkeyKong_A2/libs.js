var LIBS = {
    degToRad: function (angle) {
        return (angle * Math.PI / 180);
    },

    get_projection: function (angle, a, zMin, zMax) {
        var tan = Math.tan(LIBS.degToRad(0.5 * angle)),
            A = -(zMax + zMin) / (zMax - zMin),
            B = (-2 * zMax * zMin) / (zMax - zMin);

        return [
            0.5 / tan, 0, 0, 0,
            0, 0.5 * a / tan, 0, 0,
            0, 0, A, -1,
            0, 0, B, 0
        ];
    },

    get_I4: function () {
        return [1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            0, 0, 0, 1];
    },

    set_I4: function (m) {
        m[0] = 1, m[1] = 0, m[2] = 0, m[3] = 0,
            m[4] = 0, m[5] = 1, m[6] = 0, m[7] = 0,
            m[8] = 0, m[9] = 0, m[10] = 1, m[11] = 0,
            m[12] = 0, m[13] = 0, m[14] = 0, m[15] = 1;
    },

    rotateX: function (m, angle) {
        var c = Math.cos(angle);
        var s = Math.sin(angle);
        var mv1 = m[1], mv5 = m[5], mv9 = m[9];
        m[1] = m[1] * c - m[2] * s;
        m[5] = m[5] * c - m[6] * s;
        m[9] = m[9] * c - m[10] * s;

        m[2] = m[2] * c + mv1 * s;
        m[6] = m[6] * c + mv5 * s;
        m[10] = m[10] * c + mv9 * s;
    },

    rotateY: function (m, angle) {
        var c = Math.cos(angle);
        var s = Math.sin(angle);
        var mv0 = m[0], mv4 = m[4], mv8 = m[8];
        m[0] = c * m[0] + s * m[2];
        m[4] = c * m[4] + s * m[6];
        m[8] = c * m[8] + s * m[10];

        m[2] = c * m[2] - s * mv0;
        m[6] = c * m[6] - s * mv4;
        m[10] = c * m[10] - s * mv8;
    },

    rotateZ: function (m, angle) {
        var c = Math.cos(angle);
        var s = Math.sin(angle);
        var mv0 = m[0], mv4 = m[4], mv8 = m[8];
        m[0] = c * m[0] - s * m[1];
        m[4] = c * m[4] - s * m[5];
        m[8] = c * m[8] - s * m[9];

        m[1] = c * m[1] + s * mv0;
        m[5] = c * m[5] + s * mv4;
        m[9] = c * m[9] + s * mv8;
    },

    translateZ: function (m, t) { m[14] += t; },
    translateX: function (m, t) { m[12] += t; },
    translateY: function (m, t) { m[13] += t; },

    set_position: function (m, x, y, z) {
        m[12] = x, m[13] = y, m[14] = z;
    },

    /* ================= TAMBAHAN ================= */

    // Skala pada bagian linear matriks (translasi tidak ikut berubah)
    scaleX: function (m, s) { m[0] *= s; m[4] *= s; m[8] *= s; },
    scaleY: function (m, s) { m[1] *= s; m[5] *= s; m[9] *= s; },
    scaleZ: function (m, s) { m[2] *= s; m[6] *= s; m[10] *= s; },

    // Perkalian matriks standar kolom-mayor: hasil = A * B
    mul4: function (A, B) {
        var R = new Array(16);
        for (var c = 0; c < 4; c++) {
            for (var r = 0; r < 4; r++) {
                var s = 0;
                for (var k = 0; k < 4; k++) s += A[k * 4 + r] * B[c * 4 + k];
                R[c * 4 + r] = s;
            }
        }
        return R;
    },

    // Konvensi praktikum (dipakai mainp.js & MyObject.js):
    // multiply(m1, m2) = m1 dikerjakan DULU, lalu m2  (matematisnya m2 * m1)
    multiply: function (m1, m2) {
        return LIBS.mul4(m2, m1);
    },

    get_T: function (x, y, z) {
        var m = LIBS.get_I4();
        m[12] = x; m[13] = y; m[14] = z;
        return m;
    },

    // Matriks rotasi terhadap sumbu sembarang lewat titik asal (Rodrigues)
    get_rotationAxis: function (axis, angle) {
        var len = Math.hypot(axis[0], axis[1], axis[2]) || 1;
        var x = axis[0] / len, y = axis[1] / len, z = axis[2] / len;
        var c = Math.cos(angle), s = Math.sin(angle), t = 1 - c;
        return [
            c + x * x * t,       y * x * t + z * s,   z * x * t - y * s,   0,
            x * y * t - z * s,   c + y * y * t,       z * y * t + x * s,   0,
            x * z * t + y * s,   y * z * t - x * s,   c + z * z * t,       0,
            0, 0, 0, 1
        ];
    },

    // ARBITRARY ROTATION: putar m sebesar `angle` mengelilingi garis
    // yang melewati `point` [x,y,z] dengan arah `axis` [x,y,z].
    // m' = T(p) * R * T(-p) * m   (translasi ikut berputar, beda dengan rotateX/Y/Z di atas)
    rotateArbitrary: function (m, point, axis, angle) {
        var R = LIBS.get_rotationAxis(axis, angle);
        var Tp = LIBS.get_T(point[0], point[1], point[2]);
        var Tn = LIBS.get_T(-point[0], -point[1], -point[2]);
        var M = LIBS.mul4(Tp, LIBS.mul4(R, LIBS.mul4(Tn, m)));
        for (var i = 0; i < 16; i++) m[i] = M[i];
    },
        // Matriks view: kamera di `eye`, melihat ke `target`, `up` = arah atas (biasanya [0,1,0])
    lookAt: function (eye, target, up) {
        var fx = target[0] - eye[0], fy = target[1] - eye[1], fz = target[2] - eye[2];
        var fl = Math.hypot(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl;
        var sx = fy * up[2] - fz * up[1], sy = fz * up[0] - fx * up[2], sz = fx * up[1] - fy * up[0];
        var sl = Math.hypot(sx, sy, sz) || 1; sx /= sl; sy /= sl; sz /= sl;
        var ux = sy * fz - sz * fy, uy = sz * fx - sx * fz, uz = sx * fy - sy * fx;
        return [
            sx, ux, -fx, 0,
            sy, uy, -fy, 0,
            sz, uz, -fz, 0,
            -(sx * eye[0] + sy * eye[1] + sz * eye[2]),
            -(ux * eye[0] + uy * eye[1] + uz * eye[2]),
             (fx * eye[0] + fy * eye[1] + fz * eye[2]), 1
        ];
    }
};
