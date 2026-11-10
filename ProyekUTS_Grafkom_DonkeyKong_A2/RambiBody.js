// RambiBody.js : badan, kaki, kuku, dan ekor Rambi (hierarkis + instance)
//
// Objek yang dipakai (semua dari geometry.js):
//   - Ellipsoid ........... massa badan (bahu, perut, pinggul), kuku, telapak
//   - Hyperbolic Paraboloid  lekukan punggung (pelana di antara bahu & pinggul)   <- QUADRIC
//   - Hyperboloid 1 sheet .. kaki                                                 <- QUADRIC
//   - Kurva Bezier ......... (1) kulit badan (Bezier lathe) yang membungkus ellipsoid
//                            (2) ekor (Bezier tube + jumbai pipih)
//
// Sistem koordinat: badan menghadap +z, atas = +y, pusat badan di (0,0,0).
// Dasar telapak kaki berada di y = GROUND_Y.
import {
    generateEllipsoid, generateBezierLathe,
    generateHyperbolicParaboloid, generateHyperboloidOneSheet, generateBezierTube
} from "./geometry.js";
import { Mesh, SceneObject } from "./SceneObject.js";

const SKIN      = [0.56, 0.50, 0.54];
const SKIN_DARK = [0.46, 0.41, 0.45];
const SKIN_FOLD = [0.50, 0.45, 0.49];
const NAIL      = [0.93, 0.91, 0.84];

export const GROUND_Y = -3.05;

export function createRambiBody(ctx) {
    const GL = ctx.GL;
    const mesh = (geo) => new Mesh(GL, geo);
    const obj = (m, name) => new SceneObject(ctx, m, name);
    const at = (o, x, y, z) => { LIBS.set_position(o.POSITION_MATRIX, x, y, z); return o; };
    const uscale = (o, s) => {
        LIBS.scaleX(o.POSITION_MATRIX, s); LIBS.scaleY(o.POSITION_MATRIX, s); LIBS.scaleZ(o.POSITION_MATRIX, s);
        return o;
    };

    /* ===================== MESH ===================== */
    // Kulit badan: kurva Bezier (z, r) diputar mengelilingi sumbu z. Perut sedikit lebih gelap.
    const bodyProfile = [[-2.75, 0], [-2.75, 2.5], [-0.2, 2.45], [1.5, 2.2], [1.5, 0]];
    const BODY_SX = 0.75, BODY_SY = 0.60;
    const hullColor = (x, y, z, t) => {
        const k = 0.86 + 0.14 * Math.min(1, Math.max(0, (y / BODY_SY + 1.8) / 3.6));
        return [SKIN[0] * k, SKIN[1] * k, SKIN[2] * k];
    };

    const UP_HALF = 0.55;   // setengah tinggi paha
    const LO_HALF = 0.55;   // setengah tinggi betis (total kaki tetap 2.2)
    const MESH = {
        hull:     mesh(generateBezierLathe(bodyProfile, BODY_SX, BODY_SY, 56, 48, hullColor)),
        shoulder: mesh(generateEllipsoid(1.55, 1.65, 1.10, 28, 36, SKIN)),
        hip:      mesh(generateEllipsoid(1.6, 1.36, 1.15, 28, 36, SKIN)),
        belly:    mesh(generateEllipsoid(1.35, 1.05, 1.90, 28, 36, SKIN)),
        // pelana punggung: a, b, kx, kz  (lihat check: y = kz*v^2 - kx*u^2)
        saddle:   mesh(generateHyperbolicParaboloid(1.39, 1.35, 1.32, 0.35, 24, 24, SKIN_FOLD)),
        thigh: mesh(generateHyperboloidOneSheet(0.62, 0.66, UP_HALF, 0.5, 12, 32, SKIN_DARK)),
        shin:  mesh(generateHyperboloidOneSheet(0.62, 0.64, LO_HALF, 0.5, 12, 32, SKIN_DARK)),
        knee:  mesh(generateEllipsoid(0.68, 0.58, 0.74, 16, 24, SKIN_DARK)),   // tempurung lutut
        sole:  mesh(generateEllipsoid(0.62, 0.16, 0.74, 12, 24, SKIN_DARK)),
        nail:  mesh(generateEllipsoid(0.26, 0.21, 0.28, 14, 20, NAIL)),
        tail: mesh(generateBezierTube(
            [[0, 0], [-0.5, -0.4], [-0.6, -1.5], [-1.5, -2.1]],               // kurva Bezier (z, y)
            (t) => {                                                           // lebar (sumbu x)
                if (t < 0.78) return 0.20 - 0.13 * (t / 0.78);
                const s = (t - 0.78) / 0.22;
                return 0.07 * (1 - s) + 0.30 * Math.sin(Math.PI * s);          // jumbai melebar
            },
            (t) => {                                                           // tebal (arah normal)
                if (t < 0.78) return 0.20 - 0.13 * (t / 0.78);
                const s = (t - 0.78) / 0.22;
                return 0.07 * (1 - s) + 0.04 * Math.sin(Math.PI * s);          // jumbai pipih
            },
            72, 16, SKIN_DARK)),
            filler: mesh(generateEllipsoid(0.985, 1.0, 0.1, 20, 20, SKIN)),
    };
        

    // body
    //  ├─ hull (kulit Bezier)
    //  ├─ shoulder, belly, hip (ellipsoid)
    //  ├─ saddle (hyperbolic paraboloid)
    //  ├─ legPivot x4 ── leg (hyperboloid) ── sole, nail x3
    //  └─ tailPivot ── tail (Bezier tube)
    const body = obj(null, "body");
    body.add(at(obj(MESH.hull, "hull"), 0, -0.50, 0));
    body.add(at(obj(MESH.shoulder, "shoulder"), 0, -0.05, 0.75));
    body.add(at(obj(MESH.hip, "hip"), 0, -0.45, -1.75));
    body.add(at(obj(MESH.belly, "belly"), 0, -0.80, -0.50));
    const saddleObj = at(obj(MESH.saddle, "saddle"), 0, 0.98, -0.67);
    LIBS.rotateX(saddleObj.POSITION_MATRIX, -11 * Math.PI / 180); 
    body.add(saddleObj);
    const fillerObj = at(obj(MESH.filler, "filler"), 0, 0.07, -1.95);
    LIBS.rotateX(fillerObj.POSITION_MATRIX, -5 * Math.PI / 180); 
    body.add(fillerObj);

    /* ---- Kaki: hyperboloid 1 sheet. Pivot di pangkal paha (ujung atas kaki) ---- */
    const makeLeg = (name, x, z, s, kneeBend) => {
        const pivot = obj(null, name + "Pivot");
        uscale(pivot, s);
        at(pivot, x, GROUND_Y + (2 * (UP_HALF + LO_HALF) + 0.06) * s + 0.22, z);

        // paha
        pivot.add(at(obj(MESH.thigh, name + "Thigh"), 0, -UP_HALF, 0));

        // lutut: pivot di ujung bawah paha (sendi)
        const kneePivot = at(obj(null, name + "KneePivot"), 0, -2 * UP_HALF, 0);
        LIBS.rotateX(kneePivot.POSITION_MATRIX, kneeBend);   // pose diam
        kneePivot.add(obj(MESH.knee, name + "Knee"));        // tempurung lutut

        // betis menggantung dari lutut
        const shin = at(obj(MESH.shin, name + "Shin"), 0, -LO_HALF, 0);
        shin.add(at(obj(MESH.sole, "sole"), 0, -LO_HALF + 0.08, 0.02));
        shin.add(at(obj(MESH.nail, "nailC"),  0.00, -LO_HALF + 0.10, 0.66));
        shin.add(at(obj(MESH.nail, "nailL"), -0.36, -LO_HALF + 0.10, 0.54));
        shin.add(at(obj(MESH.nail, "nailR"),  0.36, -LO_HALF + 0.10, 0.54));
        kneePivot.add(shin);

        pivot.add(kneePivot);
        body.add(pivot);
        return { pivot, kneePivot };
    };
    const FL = makeLeg("legFL", -0.72,  0.75, 0.85, 0.04);
    const FR = makeLeg("legFR",  0.72,  0.75, 0.85, 0.04);
    const BL = makeLeg("legBL", -0.78, -1.75, 0.85, 0.30);
    const BR = makeLeg("legBR",  0.78, -1.75, 0.85, 0.30);
    const legFL = FL.pivot, legFR = FR.pivot, legBL = BL.pivot, legBR = BR.pivot;

    /* ---- Ekor: kurva Bezier, pivot di pangkal ekor ---- */
    const tailPivot = at(obj(null, "tailPivot"), 0, 0.20, -2.55);
    tailPivot.add(obj(MESH.tail, "tail"));
    body.add(tailPivot);

    return {
        root: body,
        parts: {
            body, legFL, legFR, legBL, legBR, tailPivot,
            kneeFL: FL.kneePivot, kneeFR: FR.kneePivot,
            kneeBL: BL.kneePivot, kneeBR: BR.kneePivot
        }
    };
}