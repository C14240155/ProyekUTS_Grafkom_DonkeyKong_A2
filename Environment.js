// Environment.js : tanah pantai, laut, langit, awan, palem, semak, pakis, batu
import { generateTerrain, generateSphere, generateBezierTube, bezierPoint } from "./geometry.js";
import { Mesh, SceneObject } from "./SceneObject.js";

export const GROUND_W = -2.35;           
export const SEA_Y = GROUND_W - 0.45;    // permukaan laut
const SEABED_Y = GROUND_W - 3.2;         // dasar laut
const WORLD = 240;                       // dunia berukuran 240 x 240

const smooth = (a, b, x) => {           
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
};
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

const rnd = (k) => { const v = Math.sin(k * 12.9898) * 43758.5453; return v - Math.floor(v); };

const HORIZON = [0.86, 0.93, 0.98];

/* ===================== JALAN & MARKAS ===================== */
export const BASE = { x: -46, z: -4, ringR: 10.5 };     // markas Donkey Kong (area pohon pisang)
const PATH_W = 1.7;                                      // setengah lebar jalan

export const PATHS = [
    [[-35.5,  -4], [-28, -12], [-18,   4], [ -4,  -6]],
    [[-46, -14.5], [-44, -28], [-24, -24], [ -4, -32]],
    [[-46,   6.5], [-40,  20], [-22,  12], [ -4,  24]],
];
const PATH_PTS = PATHS.map(c => Array.from({ length: 49 }, (_, i) => bezierPoint(c, i / 48)));

const distSeg = (px, pz, ax, az, bx, bz) => {
    const dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1)));
    return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
};

// jarak ke garis tengah jalan terdekat (3 jalan + lingkaran markas)
const pathDist = (x, z) => {
    if (x > 8 || x < -62 || Math.abs(z) > 50) return 99;         // jauh dari semua jalan
    let d = Math.abs(Math.hypot(x - BASE.x, z - BASE.z) - BASE.ringR);
    for (const pts of PATH_PTS)
        for (let i = 0; i < pts.length - 1; i++)
            d = Math.min(d, distSeg(x, z, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]));
    return d;
};

export const free = (x, z, m = 0) =>
    pathDist(x, z) > PATH_W + m &&
    Math.hypot(x - BASE.x, z - BASE.z) > BASE.ringR + PATH_W + m;

export function createEnvironment(ctx) {
    const GL = ctx.GL;
    const mesh = (geo) => new Mesh(GL, geo);
    const obj = (m, name) => new SceneObject(ctx, m, name);

    const heightFn = (x, z) => {
        const ridge = Math.max(smooth(-60, -100, x),                          // belakang (sisi hutan)
                            Math.max(smooth(-55, -95, z), smooth(55, 95, z)) * smooth(10, -15, x));  // dua sisi, tidak masuk laut
        const bumps = 0.65 + 0.35 * Math.sin(0.09 * z + 0.07 * x);            // supaya puncaknya bergelombang
        return GROUND_W + 0.06 * Math.sin(0.6 * z + 0.3 * x)
            - (GROUND_W - SEABED_Y) * smooth(5, 14, x)
            + 14 * ridge * bumps;
    };

    const terrainColor = (x, y, z) => {
        const d = GROUND_W - y;                                                    // makin turun makin dalam
        let c = mix([0.88, 0.76, 0.52], [0.66, 0.55, 0.38], smooth(0.1, 0.6, d));  // pasir -> pasir basah
        c = mix(c, [0.55, 0.50, 0.40], smooth(0.8, 3.0, d));                       // pasir dasar laut
        c = mix(c, [0.28, 0.52, 0.22], smooth(-6, -11, x));                        // sisi hutan: rumput

            const strength = smooth(-3, -7.5, x);  
            const dirt = (1 - smooth(PATH_W * 0.65, PATH_W, pathDist(x, z))) * strength;
            c = mix(c, [0.55, 0.40, 0.25], dirt);

            const bd = Math.hypot(x - BASE.x, z - BASE.z);
        c = mix(c, [0.50, 0.38, 0.24], 0.5 * (1 - smooth(5, 8.5, bd)));
        c = mix(c, HORIZON, smooth(80, 115, Math.hypot(x, z)));                    
        return c;
    };

    const seaColor = (x, y, z) => mix(
        mix([0.30, 0.80, 0.82], [0.05, 0.28, 0.58], smooth(6, 60, x)),
        HORIZON, smooth(80, 115, Math.hypot(x, z)));

    const bigLeafMesh = (c0, c1) => mesh(generateBezierTube(
        [[0, 0], [0.3, 2.2], [1.2, 3.6], [2.4, 3.4]],                  // kurva Bezier (z, y)
        (t) => 0.06 + 0.80 * Math.sin(Math.PI * Math.pow(t, 0.7)),      // lebar (x)
        (t) => 0.04,                                                    // tebal: pipih
        24, 10,
        (x, y, z, t) => mix(c0, c1, t)));

    const MESH = {
        land: mesh(generateTerrain(WORLD, WORLD, 240, 240, heightFn, terrainColor)),
        sea:  mesh(generateTerrain(WORLD, WORLD, 60, 30, () => SEA_Y, seaColor)),
        sky:  mesh(generateSphere(200, 24, 32, (x, y, z) =>
                  mix([0.86, 0.93, 0.98], [0.20, 0.50, 0.88], smooth(0.0, 0.6, y / 200)))),
        puff: mesh(generateSphere(1, 16, 20, (x, y, z) =>
                  mix([0.78, 0.85, 0.95], [1, 1, 1], smooth(-0.8, 0.6, y)))),

        trunk: mesh(generateBezierTube(
            [[0, 0], [0.4, 3.5], [0.1, 6.5], [1.4, 9.5]],             
            (t) => 0.42 - 0.16 * t,                                     
            (t) => 0.42 - 0.16 * t,                                     
            36, 12,
            (x, y, z, t) => mix([0.34, 0.23, 0.14], [0.52, 0.38, 0.23],
                                0.5 + 0.5 * Math.sin(t * Math.PI * 18)))),   

        frond: mesh(generateBezierTube(
            [[0, 0], [1.6, 1.4], [3.2, 1.2], [4.4, -1.0]],            
            (t) => 0.10 + 0.85 * Math.sin(Math.PI * t),                 
            (t) => 0.05,                                                
            24, 10,
            (x, y, z, t) => mix([0.10, 0.36, 0.12], [0.34, 0.66, 0.22], t))),

        nut:  mesh(generateSphere(1, 14, 18, [0.40, 0.31, 0.16])),      
        rock: mesh(generateSphere(1, 14, 18, (x, y, z) =>
                  mix([0.40, 0.38, 0.40], [0.62, 0.60, 0.58], smooth(-0.8, 0.8, y)))),
        bush: mesh(generateSphere(1, 14, 18, (x, y, z) =>
                  mix([0.10, 0.30, 0.12], [0.30, 0.58, 0.22], smooth(-0.6, 0.9, y)))),

        trunkB: mesh(generateBezierTube(
            [[0, 0], [0.3, 4], [-0.4, 8], [0.3, 12]],                        
            (t) => 0.42 - 0.18 * t + 0.40 * Math.pow(1 - t, 8),               
            (t) => 0.42 - 0.18 * t + 0.40 * Math.pow(1 - t, 8),
            40, 12,
            (x, y, z, t) => mix([0.26, 0.19, 0.13], [0.40, 0.31, 0.22], t))),
        leafA: mesh(generateSphere(1, 16, 20, (x, y, z) =>
                mix([0.05, 0.22, 0.10], [0.22, 0.48, 0.14], smooth(-0.8, 0.9, y)))),

        trunkU: mesh(generateBezierTube(
            [[0, 0], [-0.6, 2.5], [0.7, 4.5], [0, 6.5]],
            (t) => 0.34 - 0.14 * t + 0.25 * Math.pow(1 - t, 8),
            (t) => 0.34 - 0.14 * t + 0.25 * Math.pow(1 - t, 8),
            32, 12,
            (x, y, z, t) => mix([0.34, 0.25, 0.17], [0.46, 0.36, 0.25], t))),
        leafU: mesh(generateSphere(1, 16, 20, (x, y, z) =>
                mix([0.16, 0.36, 0.10], [0.42, 0.62, 0.18], smooth(-0.5, 0.9, y)))),
        leafG:     bigLeafMesh([0.07, 0.30, 0.12], [0.25, 0.58, 0.20]),      
        leafR:     bigLeafMesh([0.40, 0.06, 0.10], [0.72, 0.16, 0.18]),      
        shrubLeaf: mesh(generateSphere(1, 14, 18, (x, y, z) =>
                    mix([0.08, 0.28, 0.14], [0.20, 0.50, 0.30], smooth(-0.6, 0.9, y)))),
        flower:    mesh(generateSphere(1, 10, 12, [1, 1, 1])),               
        cliffRock: mesh(generateSphere(1, 20, 26, (x, y, z) => {
            const strata = 0.5 + 0.5 * Math.sin(y * 8 + x * 1.5);
            const c = mix([0.36, 0.31, 0.28], [0.56, 0.50, 0.44], strata);
            return mix(c, [0.25, 0.22, 0.20], smooth(-0.3, -1.0, y));
        })),
        cliffMoss: mesh(generateSphere(1, 16, 20, (x, y, z) =>
            mix([0.34, 0.30, 0.24], [0.20, 0.46, 0.15], smooth(-0.2, 0.5, y)))),
        trunkP: mesh(generateBezierTube(
            [[0, 0], [0.2, 3], [-0.2, 6], [0.1, 8.5]],
            (t) => 0.70 - 0.32 * t + 0.55 * Math.pow(1 - t, 8),
            (t) => 0.70 - 0.32 * t + 0.55 * Math.pow(1 - t, 8),
            40, 14,
            (x, y, z, t) => mix([0.42, 0.46, 0.24], [0.30, 0.36, 0.17],
                                0.5 + 0.5 * Math.sin(t * Math.PI * 10)))),

        leafP: mesh(generateBezierTube(
            [[0, 0], [1.8, 1.8], [4.0, 1.8], [6.0, -0.9]],
            (t) => 0.10 + 1.00 * Math.sin(Math.PI * Math.pow(t, 0.7)),
            (t) => 0.04,
            28, 10,
            (x, y, z, t) => mix([0.20, 0.50, 0.14], [0.45, 0.72, 0.25], t))),

        banana: mesh(generateBezierTube(
            [[0, 0], [0.5, 0.3], [0.9, 1.0], [0.6, 1.7]],
            (t) => 0.03 + 0.17 * Math.pow(Math.sin(Math.PI * t), 0.6),
            (t) => 0.03 + 0.17 * Math.pow(Math.sin(Math.PI * t), 0.6),
            20, 10,
            (x, y, z, t) => (t < 0.07 || t > 0.93) ? [0.38, 0.27, 0.10] : [0.98, 0.84, 0.15])),
    };

    const root = obj(null, "environment");
    root.add(obj(MESH.land, "land"));

    const sea = obj(MESH.sea, "sea");

    const sky = obj(MESH.sky, "sky");
    sky.unlit = 1;
    root.add(sky);

    /* ===================== HELPER ===================== */
    const groundAt = (x, z, r) => Math.min(
        heightFn(x, z), heightFn(x + r, z), heightFn(x - r, z),
        heightFn(x, z + r), heightFn(x, z - r));

    const putScale = (o, sx, sy, sz) => {
        LIBS.scaleX(o.POSITION_MATRIX, sx);
        LIBS.scaleY(o.POSITION_MATRIX, sy);
        LIBS.scaleZ(o.POSITION_MATRIX, sz);
    };

    /* ===================== AWAN ===================== */
    const puff = (px, py, pz, sx, sy, sz) => {
        const o = obj(MESH.puff, "puff");
        putScale(o, sx, sy, sz);
        LIBS.set_position(o.POSITION_MATRIX, px, py, pz);
        o.unlit = 1;
        return o;
    };
    const makeCloud = (x, y, z, s) => {
        const c = obj(null, "cloud");
        c.add(puff( 0.0,  0.0,  0.0, 7.0, 2.6, 3.5),
              puff(-5.0, -0.4,  0.5, 4.5, 2.0, 2.8),
              puff( 5.5, -0.3, -0.4, 5.0, 2.2, 3.0),
              puff( 1.5,  1.6,  0.0, 4.5, 2.6, 3.0));
        putScale(c, s, s, s);
        LIBS.set_position(c.POSITION_MATRIX, x, y, z);
        return c;
    };
    [[-70, 14, -60, 1.3], [  0, 18, -90, 1.5], [ 75, 15, -55, 1.3],
     [ 95, 20,  15, 1.4], [ 60, 13,  80, 1.2], [-20, 17,  95, 1.5],
     [-85, 16,  40, 1.3], [-100, 19, -20, 1.4]]
        .forEach(p => root.add(makeCloud(...p)));

    /* ===================== POHON KELAPA ==================== */
    const makePalm = (x, z, s, yaw, seed) => {
        const palm = obj(null, "palm");
        palm.add(obj(MESH.trunk, "trunk"));

        const crown = obj(null, "crown");
        LIBS.set_position(crown.POSITION_MATRIX, 0, 9.5, 1.4);

        const ball = (r, bx, by, bz) => {
            const o = obj(MESH.nut, "nut");
            putScale(o, r, r, r);
            LIBS.set_position(o.POSITION_MATRIX, bx, by, bz);
            return o;
        };
        crown.add(ball(0.55, 0, 0, 0));                 
        crown.add(ball(0.32, 0.45, -0.55, 0.20));       
        crown.add(ball(0.32, -0.40, -0.60, 0.25));
        crown.add(ball(0.32, 0.05, -0.55, -0.45));

        const N = 8;
        for (let i = 0; i < N; i++) {
            const f = obj(MESH.frond, "frond");
            const tilt = -0.2 + 0.6 * rnd(seed * 10 + i);        
            const k = rnd(seed * 10 + i + 500);
            f.tint = [0.85 + 0.3 * k, 0.90 + 0.2 * k, 0.85 + 0.3 * k];   
            LIBS.rotateX(f.POSITION_MATRIX, tilt);
            LIBS.rotateY(f.POSITION_MATRIX, i / N * 2 * Math.PI + seed);
            crown.add(f);
        }
        palm.add(crown);

        putScale(palm, s, s, s);
        LIBS.rotateY(palm.POSITION_MATRIX, yaw);
        LIBS.set_position(palm.POSITION_MATRIX, x, heightFn(x, z) - 0.15, z);
        return palm;
    };

    /* ===================== SEMAK, PAKIS, BATU ===================== */
    const makeRock = (x, z, sx, sy, sz, yaw) => {
        const o = obj(MESH.rock, "rock");
        putScale(o, sx, sy, sz);
        LIBS.rotateY(o.POSITION_MATRIX, yaw);
        LIBS.set_position(o.POSITION_MATRIX, x, groundAt(x, z, Math.max(sx, sz) * 0.6) + sy * 0.25, z);
        return o;
    };

    const makeBush = (x, z, s, seed) => {
        const b = obj(null, "bush");
        const blob = (bx, by, bz, sx, sy, sz) => {
            const o = obj(MESH.bush, "blob");
            putScale(o, sx, sy, sz);
            LIBS.set_position(o.POSITION_MATRIX, bx, by, bz);
            o.tint = [0.85 + 0.3 * rnd(seed + bx), 0.9 + 0.2 * rnd(seed + by + 3), 0.85 + 0.3 * rnd(seed + bz + 7)];
            return o;
        };
        b.add(blob( 0.0, 1.00,  0.0, 1.2, 1.6, 1.1),    
            blob(-0.9, 0.70,  0.3, 0.9, 1.2, 0.8),
            blob( 0.8, 0.75, -0.2, 1.0, 1.3, 0.9),
            blob( 0.1, 1.60,  0.1, 0.7, 0.9, 0.7));   
        putScale(b, s, s, s);
        LIBS.set_position(b.POSITION_MATRIX, x, groundAt(x, z, 1.2 * s) - 0.1, z);
        return b;
    };

    // Pakis
    const makeFern = (x, z, s, seed) => {
        const f = obj(null, "fern");
        for (let i = 0; i < 7; i++) {
            const fr = obj(MESH.frond, "frondS");
            fr.tint = [0.80 + 0.3 * rnd(seed + i), 1.0, 0.80 + 0.3 * rnd(seed + i + 40)];
            LIBS.rotateX(fr.POSITION_MATRIX, 0.1 + 0.5 * rnd(seed + i + 80));
            LIBS.rotateY(fr.POSITION_MATRIX, i / 7 * 2 * Math.PI + seed);
            f.add(fr);
        }
        putScale(f, s, s, s);
        LIBS.set_position(f.POSITION_MATRIX, x, groundAt(x, z, 0.5 * s) - 0.05, z);
        return f;
    };

    // helper daun pohon hutan tropis
    const leafBlob = (mk, bx, by, bz, sx, sy, sz, seed) => {
        const o = obj(mk, "leaf");
        putScale(o, sx, sy, sz);
        LIBS.set_position(o.POSITION_MATRIX, bx, by, bz);
        const k = rnd(seed + bx * 3.1 + bz * 1.7);
        o.tint = [0.85 + 0.3 * k, 0.90 + 0.2 * k, 0.85 + 0.3 * k];
        return o;
    };

    // Pohon hutan tropis
    const makeJungleTree = (x, z, s, yaw, seed) => {
        const tree = obj(null, "jungleTree");
        tree.add(obj(MESH.trunkB, "trunk"));

        const crown = obj(null, "crown");                       
        LIBS.set_position(crown.POSITION_MATRIX, 0, 12, 0.3);
        crown.add(
            leafBlob(MESH.leafA,  0.0,  1.2,  0.0, 4.2, 2.6, 4.2, seed),
            leafBlob(MESH.leafA, -3.0,  0.2,  1.0, 3.0, 2.0, 3.0, seed),
            leafBlob(MESH.leafA,  3.0,  0.4, -0.8, 3.2, 2.1, 3.0, seed),
            leafBlob(MESH.leafA,  0.6,  0.0, -3.2, 2.8, 1.9, 2.6, seed),
            leafBlob(MESH.leafA, -0.8, -0.2,  3.0, 2.8, 1.9, 2.6, seed));
        tree.add(crown);

        putScale(tree, s, s, s);
        LIBS.rotateY(tree.POSITION_MATRIX, yaw);
        LIBS.set_position(tree.POSITION_MATRIX, x, groundAt(x, z, 0.8 * s) - 0.3, z);
        return tree;
    };

    const makeUmbrellaTree = (x, z, s, yaw, seed) => {
        const tree = obj(null, "umbrellaTree");
        tree.add(obj(MESH.trunkU, "trunk"));

        const crown = obj(null, "crown");                       
        LIBS.set_position(crown.POSITION_MATRIX, 0, 6.5, 0);
        crown.add(
            leafBlob(MESH.leafU,  0.0, 0.2,  0.0, 4.8, 1.0, 4.8, seed),
            leafBlob(MESH.leafU, -1.5, 0.9,  0.8, 3.2, 0.9, 3.2, seed),
            leafBlob(MESH.leafU,  1.6, 0.8, -0.9, 3.0, 0.85, 3.0, seed),
            leafBlob(MESH.leafU,  0.2, 1.5,  0.0, 2.2, 0.7, 2.2, seed));
        tree.add(crown);

        putScale(tree, s, s, s);
        LIBS.rotateY(tree.POSITION_MATRIX, yaw);
        LIBS.set_position(tree.POSITION_MATRIX, x, groundAt(x, z, 0.6 * s) - 0.25, z);
        return tree;
    };

    const makeBroadPlant = (x, z, s, seed, red) => {
        const p = obj(null, "broadPlant");
        const N = 6;
        for (let i = 0; i < N; i++) {
            const lf = obj(red ? MESH.leafR : MESH.leafG, "bigLeaf");
            const k = rnd(seed * 9 + i + 70);
            lf.tint = [0.85 + 0.3 * k, 0.90 + 0.2 * k, 0.85 + 0.3 * k];
            LIBS.rotateX(lf.POSITION_MATRIX, 0.10 + 0.60 * rnd(seed * 9 + i));   
            LIBS.rotateY(lf.POSITION_MATRIX, i / N * 2 * Math.PI + seed);
            p.add(lf);
        }
        putScale(p, s, s, s);
        LIBS.set_position(p.POSITION_MATRIX, x, groundAt(x, z, 0.8 * s) - 0.05, z);
        return p;
    };

    const FLOWER_COLORS = [[1.0, 0.25, 0.30], [1.0, 0.85, 0.20], [1.0, 0.55, 0.75]];

    const makeFlowerShrub = (x, z, s, seed) => {
        const b = obj(null, "flowerShrub");
        const col = FLOWER_COLORS[Math.floor(rnd(seed * 2.3 + 11) * FLOWER_COLORS.length)];
        const blobs = [[0.0, 0.55, 0.0, 1.3, 0.95, 1.2],
                    [-1.1, 0.40, 0.3, 0.9, 0.70, 0.85],
                    [1.0, 0.40, -0.3, 1.0, 0.75, 0.90]];

        blobs.forEach(([bx, by, bz, sx, sy, sz], bi) => {
            const o = obj(MESH.shrubLeaf, "blob");
            putScale(o, sx, sy, sz);
            LIBS.set_position(o.POSITION_MATRIX, bx, by, bz);
            const k = rnd(seed * 5 + bi);
            o.tint = [0.85 + 0.3 * k, 0.90 + 0.2 * k, 0.85 + 0.3 * k];
            b.add(o);

            for (let j = 0; j < 4; j++) {
                const a = 6.28 * rnd(seed * 13 + bi * 7 + j * 3.1);
                const e = 0.35 + 0.90 * rnd(seed * 17 + bi * 5 + j * 2.3);      
                const f = obj(MESH.flower, "flower");
                putScale(f, 0.17, 0.17, 0.17);
                LIBS.set_position(f.POSITION_MATRIX,
                    bx + sx * Math.cos(e) * Math.cos(a) * 0.98,
                    by + sy * Math.sin(e) * 0.98,
                    bz + sz * Math.cos(e) * Math.sin(a) * 0.98);
                const v = 0.9 + 0.1 * rnd(seed * 19 + bi * 3 + j);
                f.tint = [col[0] * v, col[1] * v, col[2] * v];
                b.add(f);
            }
        });

        putScale(b, s, s, s);
        LIBS.set_position(b.POSITION_MATRIX, x, groundAt(x, z, 1.2 * s) - 0.1, z);
        return b;
    };
    
    const makeCliff = (x, z, w, h, yaw, seed) => {
        const c = obj(null, "cliff");
        const n = Math.max(3, Math.round(w / 3.5));            

        const blob = (mk, bx, by, bz, sx, sy, sz, k) => {
            const o = obj(mk, "cliffBlob");
            putScale(o, sx, sy, sz);
            LIBS.rotateY(o.POSITION_MATRIX, 6.28 * rnd(seed + k));      
            LIBS.set_position(o.POSITION_MATRIX, bx, by, bz);
            const v = 0.88 + 0.24 * rnd(seed * 3 + k);                  
            o.tint = [v, v, v];
            return o;
        };

        for (let row = 0; row < 2; row++) {
            for (let i = 0; i < n; i++) {
                const k = row * 50 + i;
                const cx = -w / 2 + w * (i + 0.5) / n + 1.2 * (rnd(seed + k * 1.7) - 0.5);
                const cz = row * 3.2 - 1.0 + 1.0 * (rnd(seed + k * 2.3) - 0.5);
                const ch = row === 0
                    ? h * (0.55 + 0.45 * rnd(seed + k * 2.9))           // baris depan: lebih rendah
                    : h * (0.80 + 0.40 * rnd(seed + k * 3.7));          // baris belakang: lebih tinggi
                const rx = 3.4 + 0.8 * rnd(seed + k * 4.1);
                const rz = 3.0 + 0.8 * rnd(seed + k * 4.9);

                c.add(blob(MESH.cliffRock, cx,                   ch * 0.45, cz,                   rx,        ch * 0.50, rz,        k),
                    blob(MESH.cliffRock, cx + 0.5 * (rnd(seed + k) - 0.5), ch * 0.80, cz,       rx * 0.80, ch * 0.30, rz * 0.80, k + 100),
                    blob(MESH.cliffMoss, cx,                   ch * 1.00, cz,                   rx * 0.70, ch * 0.18, rz * 0.70, k + 200));
            }
        }

        LIBS.rotateY(c.POSITION_MATRIX, yaw);
        LIBS.set_position(c.POSITION_MATRIX, x, groundAt(x, z, w * 0.35) - 1.2, z);   // pangkal terbenam
        return c;
    };

    const makeBananaBunch = (s) => {
        const g = obj(null, "bunch");
        const stalk = obj(MESH.nut, "stalk");
        putScale(stalk, 0.16, 0.65, 0.16);
        LIBS.set_position(stalk.POSITION_MATRIX, 0, -0.2, 0);
        g.add(stalk);
        for (let row = 0; row < 3; row++) {
            for (let k = 0; k < 3; k++) {
                const b = obj(MESH.banana, "banana");
                putScale(b, 0.5, 0.5, 0.5);
                LIBS.rotateZ(b.POSITION_MATRIX, 2.55 - 0.12 * row);       
                LIBS.rotateY(b.POSITION_MATRIX, k / 3 * 2 * Math.PI + row * 0.9);
                LIBS.set_position(b.POSITION_MATRIX, 0, -0.35 - 0.35 * row, 0);
                g.add(b);
            }
        }
        putScale(g, s, s, s);
        return g;
    };

    const makeBananaTree = (x, z, s, seed) => {
        const tree = obj(null, "bananaTree");
        tree.add(obj(MESH.trunkP, "trunk"));

        const crown = obj(null, "crown");                       
        LIBS.set_position(crown.POSITION_MATRIX, 0, 8.5, 0.1);
        const N = 9;
        for (let i = 0; i < N; i++) {
            const lf = obj(MESH.leafP, "bigLeaf");
            const k = rnd(seed * 11 + i + 90);
            lf.tint = [0.85 + 0.3 * k, 0.90 + 0.2 * k, 0.85 + 0.3 * k];
            LIBS.rotateX(lf.POSITION_MATRIX, 0.15 + 0.90 * rnd(seed * 11 + i));   
            LIBS.rotateY(lf.POSITION_MATRIX, i / N * 2 * Math.PI + seed);
            crown.add(lf);
        }
        for (let i = 0; i < 3; i++) {                           
            const a = i / 3 * 2 * Math.PI + 0.6 + seed;
            const bunch = makeBananaBunch(1.5);
            LIBS.set_position(bunch.POSITION_MATRIX, 1.0 * Math.cos(a), -0.5, 1.0 * Math.sin(a));
            crown.add(bunch);
        }
        tree.add(crown);

        putScale(tree, s, s, s);
        LIBS.set_position(tree.POSITION_MATRIX, x, groundAt(x, z, 0.9 * s) - 0.3, z);
        return tree;
    };

    // Tumpukan pisang di tanah
    const makeBananaPile = (x, z, s, seed) => {
        const p = obj(null, "bananaPile");
        [[5, 0.17, 0.60], [3, 0.42, 0.30], [1, 0.66, 0.0]].forEach(([n, y, r], li) => {
            for (let j = 0; j < n; j++) {
                const b = obj(MESH.banana, "banana");
                putScale(b, 0.75, 0.75, 0.75);
                LIBS.rotateZ(b.POSITION_MATRIX, 1.45 + 0.3 * (rnd(seed * 7 + li * 5 + j) - 0.5));   
                LIBS.rotateY(b.POSITION_MATRIX, 6.28 * rnd(seed * 9 + li * 3 + j + 40));
                const a = j / Math.max(1, n) * 2 * Math.PI + seed;
                LIBS.set_position(b.POSITION_MATRIX, r * Math.cos(a), y, r * Math.sin(a));
                p.add(b);
            }
        });
        putScale(p, s, s, s);
        LIBS.set_position(p.POSITION_MATRIX, x, groundAt(x, z, 0.8 * s), z);
        return p;
    };

    /* ===================== PENEMPATAN ===================== */
    // palem hutan
    for (let i = 0; i < 8; i++) {
        const x = -10 - (i % 2) * 8 - 3 * rnd(i + 1);
        const z = -52 + i * 15 + 4 * rnd(i + 50);
        if (free(x, z, 2.5))
            root.add(makePalm(x, z, 0.8 + 0.5 * rnd(i + 99), 6.28 * rnd(i + 7), i));
    }
    // Palem di tepi pantai
    [[4.5, -14], [5.0, 16], [3.5, 34]].forEach(([px, pz], i) =>
        root.add(makePalm(px, pz, 1.0, Math.PI / 2 + 0.2 * i, 100 + i)));

    // semak
    for (let i = 0; i < 45; i++) {
        const x = -3 - 16 * rnd(i * 7.13 + 300);
        const z = -55 + 110 * rnd(i * 3.71 + 9000);
        if (free(x, z, 1.5))
            root.add(makeBush(x, z, 0.8 + 0.9 * rnd(i * 5.3 + 500), i));
    }
    // pakis
    for (let i = 0; i < 40; i++) {
        const x = -3 - 15 * rnd(i * 6.37 + 700);
        const z = -55 + 110 * rnd(i * 2.93 + 12000);
        if (free(x, z, 1))
            root.add(makeFern(x, z, 0.4 + 0.3 * rnd(i * 4.1 + 800), i * 3));
    }
    // Pohon rindang
    for (let i = 0; i < 24; i++) {
        const x = -15 - 45 * rnd(i * 8.31 + 1500);
        const z = -62 + 124 * rnd(i * 4.17 + 17000);
        if (free(x, z, 3.5))
            root.add(makeJungleTree(x, z, 0.7 + 0.4 * rnd(i * 2.9 + 1600), 6.28 * rnd(i * 1.7 + 1700), i));
    }
    
    // Pohon payung
    for (let i = 0; i < 20; i++) {
        const x = -14 - 36 * rnd(i * 9.07 + 2500);
        const z = -62 + 124 * rnd(i * 5.51 + 21000);
        if (free(x, z, 3))
            root.add(makeUmbrellaTree(x, z, 0.8 + 0.5 * rnd(i * 3.3 + 2600), 6.28 * rnd(i * 2.1 + 2700), i + 50));
    }
    // Tanaman daun lebar
    for (let i = 0; i < 30; i++) {
        const x = -6 - 30 * rnd(i * 6.91 + 3500);
        const z = -60 + 120 * rnd(i * 3.77 + 25000);
        if (free(x, z, 1.5))
            root.add(makeBroadPlant(x, z, 0.8 + 0.6 * rnd(i * 4.9 + 3600), i, i % 3 === 0));
    }
    // Semak berbunga
    for (let i = 0; i < 22; i++) {
        const x = -6 - 34 * rnd(i * 7.77 + 4500);
        const z = -60 + 120 * rnd(i * 5.13 + 29000);
        if (free(x, z, 1.5))
            root.add(makeFlowerShrub(x, z, 0.9 + 0.7 * rnd(i * 3.1 + 4600), i + 200));
    }
    // ===== MARKAS DONKEY KONG (AREA POHON PISANG) =====
    root.add(makeBananaTree(BASE.x, BASE.z, 1.4, 1));

    // Tumpukan pisang di dalam lingkaran 
    for (let i = 0; i < 7; i++) {
        const a = i / 7 * 2 * Math.PI + 0.4;
        const r = 5.5 + 2.0 * rnd(i * 4.3 + 7000);
        root.add(makeBananaPile(BASE.x + r * Math.cos(a), BASE.z + r * Math.sin(a),
                                0.9 + 0.5 * rnd(i * 2.1 + 7100), i));
    }
    // Tumpukan di luar lingkaran, tidak di atas jalan
    for (let i = 0; i < 8; i++) {
        const a = i / 8 * 2 * Math.PI + 0.2;
        const r = 14 + 3 * rnd(i * 5.9 + 7200);
        const px = BASE.x + r * Math.cos(a), pz = BASE.z + r * Math.sin(a);
        if (free(px, pz, 1.0))
            root.add(makeBananaPile(px, pz, 0.9 + 0.5 * rnd(i * 3.7 + 7300), i + 20));
    }
    // Pohon jauh di kaki bukit 
    for (let i = 0; i < 40; i++) {
        const x = -64 - 22 * rnd(i * 5.7 + 6000);          
        const z = -90 + 180 * rnd(i * 3.3 + 33000);
        const o = obj(MESH.leafA, "farTree");
        const s = 3 + 3 * rnd(i + 6100);                   
        putScale(o, s, s * 0.8, s);
        LIBS.set_position(o.POSITION_MATRIX, x, heightFn(x, z) + s * 0.4, z);   
        root.add(o);
    }
    // Tebing
    [[ -4, -68, 18,  9,  0.10],      
    [-72,  -4, 26, 12,  1.57],      
    [-30,  58, 18,  8,  0.40],
    [-60, -52, 16, 10, -0.50]]
        .filter(([cx, cz]) => free(cx, cz, 2))
        .forEach(([cx, cz, w, h, yw], i) => root.add(makeCliff(cx, cz, w, h, yw, i * 7 + 3)));
    // Batu
    [[ 4.0, -12, 0.9, 0.5, 0.8, 0.3], [ 3.5,  9, 1.2, 0.6, 1.0, 1.1],
     [ 4.8,  22, 0.7, 0.4, 0.7, 2.0], [-2.5, -30, 1.0, 0.6, 0.9, 0.7],
     [-1.5,  18, 0.6, 0.35, 0.6, 1.6], [ 2.0, -38, 1.3, 0.7, 1.1, 2.6]]
        .filter(r => free(r[0], r[1], 1))
        .forEach(r => root.add(makeRock(...r)));

    return { root, sea, sky };
}