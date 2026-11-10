// geometry.js : generator bentuk. Format vertex: [x,y,z, r,g,b, nx,ny,nz] (9 float)

const pick = (color, x, y, z, t) =>
    (typeof color === 'function' ? color(x, y, z, t) : color);

function gridFaces(rows, cols, faces) {
    for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
            const first = i * (cols + 1) + j;
            const second = first + 1;
            const third = first + (cols + 1);
            const fourth = third + 1;
            faces.push(first, second, fourth, first, fourth, third);
        }
    }
}

// Hitung normal halus (titik yang posisinya sama di-weld, jadi seam hilang),
// arah normal otomatis dibuat menghadap keluar.
function build(pos, col, faces, invert = false, hint = null) {
    const n = pos.length / 3;
    const keys = new Array(n);
    const acc = new Map();
    for (let i = 0; i < n; i++) {
        keys[i] = Math.round(pos[3 * i] * 1e4) + '_' +
                  Math.round(pos[3 * i + 1] * 1e4) + '_' +
                  Math.round(pos[3 * i + 2] * 1e4);
        if (!acc.has(keys[i])) acc.set(keys[i], [0, 0, 0]);
    }
    for (let f = 0; f < faces.length; f += 3) {
        const a = faces[f], b = faces[f + 1], c = faces[f + 2];
        const ux = pos[3 * b] - pos[3 * a], uy = pos[3 * b + 1] - pos[3 * a + 1], uz = pos[3 * b + 2] - pos[3 * a + 2];
        const vx = pos[3 * c] - pos[3 * a], vy = pos[3 * c + 1] - pos[3 * a + 1], vz = pos[3 * c + 2] - pos[3 * a + 2];
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        for (const i of [a, b, c]) {
            const s = acc.get(keys[i]);
            s[0] += nx; s[1] += ny; s[2] += nz;
        }
    }
    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < n; i++) { cx += pos[3 * i]; cy += pos[3 * i + 1]; cz += pos[3 * i + 2]; }
    cx /= n; cy /= n; cz /= n;
    let score = 0;
    for (let i = 0; i < n; i++) {
        const s = acc.get(keys[i]);
        score += s[0] * (pos[3 * i] - cx) + s[1] * (pos[3 * i + 1] - cy) + s[2] * (pos[3 * i + 2] - cz);
    }
    if (hint) {   // permukaan terbuka (mis. saddle): arah normal ditentukan oleh hint, bukan centroid
        score = 0;
        for (let i = 0; i < n; i++) {
            const s = acc.get(keys[i]);
            score += s[0] * hint[0] + s[1] * hint[1] + s[2] * hint[2];
        }
    }
    let sign = score < 0 ? -1 : 1;
    if (invert) sign = -sign;

    const vertices = [];
    for (let i = 0; i < n; i++) {
        const s = acc.get(keys[i]);
        const len = Math.hypot(s[0], s[1], s[2]) || 1;
        vertices.push(
            pos[3 * i], pos[3 * i + 1], pos[3 * i + 2],
            col[3 * i], col[3 * i + 1], col[3 * i + 2],
            sign * s[0] / len, sign * s[1] / len, sign * s[2] / len
        );
    }
    return { vertices, faces };
}

/* ---------- ELLIPSOID / SPHERE ---------- */
export function generateEllipsoid(a, b, c, stacks = 32, sectors = 32, color = [0.7, 0.7, 0.7]) {
    const pos = [], col = [], faces = [];
    for (let i = 0; i <= stacks; i++) {
        const u = i / stacks * Math.PI - Math.PI / 2;
        for (let j = 0; j <= sectors; j++) {
            const v = j / sectors * 2 * Math.PI - Math.PI;
            const x = a * Math.cos(v) * Math.cos(u);
            const y = b * Math.sin(u);
            const z = c * Math.sin(v) * Math.cos(u);
            pos.push(x, y, z);
            col.push(...pick(color, x, y, z, i / stacks));
        }
    }
    gridFaces(stacks, sectors, faces);
    return build(pos, col, faces);
}

export function generateSphere(r, stacks = 24, sectors = 24, color = [0.7, 0.7, 0.7]) {
    return generateEllipsoid(r, r, r, stacks, sectors, color);
}

/* ---------- CONE (alas di y=0, puncak di y=height) ---------- */
export function generateCone(radius, height, sectors = 32, stacks = 16, color = [0.9, 0.9, 0.8]) {
    const pos = [], col = [], faces = [];
    for (let i = 0; i <= stacks; i++) {
        const t = i / stacks;
        const y = t * height;
        const r = radius * (1 - t);
        for (let j = 0; j <= sectors; j++) {
            const v = 2 * Math.PI * j / sectors;
            const x = r * Math.cos(v), z = r * Math.sin(v);
            pos.push(x, y, z);
            col.push(...pick(color, x, y, z, t));
        }
    }
    gridFaces(stacks, sectors, faces);
    return build(pos, col, faces);
}

/* ---------- ELLIPTIC PARABOLOID ---------- */
export function generateEllipticParaboloid(a, b, c, uSteps = 24, vSteps = 32, color = [0.6, 0.6, 0.6]) {
    const pos = [], col = [], faces = [];
    for (let i = 0; i <= uSteps; i++) {
        const u = i / uSteps;
        for (let j = 0; j <= vSteps; j++) {
            const v = 2 * Math.PI * j / vSteps;
            const x = a * u * Math.cos(v);
            const y = b * u * Math.sin(v);
            const z = c * u * u;
            pos.push(x, y, z);
            col.push(...pick(color, x, y, z, u));
        }
    }
    gridFaces(uSteps, vSteps, faces);
    return build(pos, col, faces);
}

/* ---------- BEZIER ---------- */
function binom(n, k) {
    let r = 1;
    for (let i = 1; i <= k; i++) r = r * (n - k + i) / i;
    return r;
}

// titik pada kurva Bezier 2D, ctrl = [[x,y], ...], t di [0,1]
export function bezierPoint(ctrl, t) {
    const n = ctrl.length - 1;
    let x = 0, y = 0;
    for (let i = 0; i <= n; i++) {
        const B = binom(n, i) * Math.pow(1 - t, n - i) * Math.pow(t, i);
        x += ctrl[i][0] * B;
        y += ctrl[i][1] * B;
    }
    return [x, y];
}

// Permukaan putar dengan profil kurva Bezier (z, r) mengelilingi sumbu z.
// sx, sy mengubah penampang lingkaran menjadi elips. Dipakai untuk "kulit halus" kepala.
export function generateBezierLathe(profile, sx, sy, tSteps = 40, vSteps = 40, color = [0.6, 0.6, 0.6]) {
    const pos = [], col = [], faces = [];
    for (let i = 0; i <= tSteps; i++) {
        const t = i / tSteps;
        const [zz, r] = bezierPoint(profile, t);
        for (let j = 0; j <= vSteps; j++) {
            const v = 2 * Math.PI * j / vSteps;
            const x = sx * r * Math.cos(v);
            const y = sy * r * Math.sin(v);
            pos.push(x, y, zz);
            col.push(...pick(color, x, y, zz, t));
        }
    }
    gridFaces(tSteps, vSteps, faces);
    return build(pos, col, faces);
}

/* ---------- HYPERBOLIC PARABOLOID (patch pelana) ----------
   x = a*u,  z = b*v,  y = kz*v^2 - kx*u^2,   u,v di [-1,1]
   Naik di sepanjang sumbu z, turun di sepanjang sumbu x  -> bentuk pelana. */
export function generateHyperbolicParaboloid(a, b, kx, kz, uSteps = 24, vSteps = 24, color = [0.6, 0.6, 0.6]) {
    const pos = [], col = [], faces = [];
    for (let i = 0; i <= vSteps; i++) {
        const v = -1 + 2 * i / vSteps;
        for (let j = 0; j <= uSteps; j++) {
            const u = -1 + 2 * j / uSteps;
            const x = a * u, z = b * v, y = kz * v * v - kx * u * u;
            pos.push(x, y, z);
            col.push(...pick(color, x, y, z, i / vSteps));
        }
    }
    gridFaces(vSteps, uSteps, faces);
    return build(pos, col, faces, false, [0, 1, 0]);   // normal menghadap ke atas
}

/* ---------- HYPERBOLOID OF ONE SHEET (sumbu y) ----------
   x = a*sqrt(1+w^2)*cos(v),  z = b*sqrt(1+w^2)*sin(v),  y = halfH * w / wMax
   Pinggang paling sempit di y=0, melebar ke atas & bawah (bentuk kaki). */
export function generateHyperboloidOneSheet(a, b, halfH, wMax = 0.8, hSteps = 16, vSteps = 28, color = [0.6, 0.6, 0.6]) {
    const pos = [], col = [], faces = [];
    for (let i = 0; i <= hSteps; i++) {
        const w = -wMax + 2 * wMax * i / hSteps;
        const k = Math.sqrt(1 + w * w);
        const y = halfH * w / wMax;
        for (let j = 0; j <= vSteps; j++) {
            const v = 2 * Math.PI * j / vSteps;
            const x = a * k * Math.cos(v), z = b * k * Math.sin(v);
            pos.push(x, y, z);
            col.push(...pick(color, x, y, z, i / hSteps));
        }
    }
    gridFaces(hSteps, vSteps, faces);
    return build(pos, col, faces);
}

/* ---------- BEZIER TUBE (ekor) ----------
   path = kontrol Bezier [z,y] pada bidang simetri (x=0).
   rx(t) = radius ke arah sumbu x (lebar), rn(t) = radius ke arah normal kurva (tebal).
   rx != rn di ujung -> ujung ekor pipih seperti daun/jumbai. */
export function generateBezierTube(path, rx, rn, tSteps = 60, vSteps = 16, color = [0.6, 0.6, 0.6]) {
    const pos = [], col = [], faces = [];
    const e = 1e-3;
    for (let i = 0; i <= tSteps; i++) {
        const t = i / tSteps;
        const [pz, py] = bezierPoint(path, t);
        const [az, ay] = bezierPoint(path, Math.max(0, t - e));
        const [bz, by] = bezierPoint(path, Math.min(1, t + e));
        let tz = bz - az, ty = by - ay;
        const tl = Math.hypot(tz, ty) || 1; tz /= tl; ty /= tl;
        const nz = -ty, ny = tz;                       // normal 2D (tegak lurus tangen)
        const RX = rx(t), RN = rn(t);
        for (let j = 0; j <= vSteps; j++) {
            const v = 2 * Math.PI * j / vSteps;
            const x = RX * Math.cos(v);
            const s = RN * Math.sin(v);
            const y = py + s * ny, z = pz + s * nz;
            pos.push(x, y, z);
            col.push(...pick(color, x, y, z, t));
        }
    }
    gridFaces(tSteps, vSteps, faces);
    return build(pos, col, faces);
}

/* ---------- TERRAIN (height field) ----------
   y = heightFn(x, z) pada grid sizeX x sizeZ berpusat di origin */
export function generateTerrain(sizeX, sizeZ, nx, nz, heightFn, color = [0.6, 0.6, 0.6]) {
    const pos = [], col = [], faces = [];
    for (let i = 0; i <= nz; i++) {
        const z = -sizeZ / 2 + sizeZ * i / nz;
        for (let j = 0; j <= nx; j++) {
            const x = -sizeX / 2 + sizeX * j / nx;
            const y = heightFn(x, z);
            pos.push(x, y, z);
            col.push(...pick(color, x, y, z, i / nz));
        }
    }
    gridFaces(nz, nx, faces);
    return build(pos, col, faces, false, [0, 1, 0]);   // normal menghadap atas
}