// RambiHead.js : model kepala Rambi (hierarkis + instance)
// Kulit utama kurva Bezier (hull) membentuk tempurung dan dahi sekaligus,
// ditambah ellipsoid (pipi, moncong), cone (cula), elliptic paraboloid (rahang, telinga), sphere (mata).
import {
    generateEllipsoid, generateSphere, generateCone,
    generateEllipticParaboloid, generateBezierLathe
} from "./geometry.js";
import { Mesh, SceneObject } from "./SceneObject.js";

const SKIN      = [0.56, 0.50, 0.54];
const SKIN_DARK = [0.46, 0.41, 0.45];

export function createRambiHead(ctx) {
    const GL = ctx.GL;
    const mesh = (geo) => new Mesh(GL, geo);
    const obj = (m, name) => new SceneObject(ctx, m, name);
    const at = (o, x, y, z) => { LIBS.set_position(o.POSITION_MATRIX, x, y, z); return o; };

    /* ===================== MESH ===================== */
    const hullProfile = [[-1.1, 0], [-1.1, 1.25], [-0.2, 1.15], [1.0, 0.90], [1.15, 0]];
    const HULL_SX = 1.05, HULL_SY = 1.00;
    const MESH = {
        hull:     mesh(generateBezierLathe(hullProfile, HULL_SX, HULL_SY, 48, 48, SKIN)),
        cheek:    mesh(generateEllipsoid(0.75, 0.70, 0.7, 24, 32, SKIN)),
        snout:    mesh(generateEllipsoid(0.60, 0.62, 0.85, 32, 40, SKIN)),
        jaw:      mesh(generateEllipticParaboloid(0.60, 1.05, 0.60, 24, 36, SKIN_DARK)),
        nostril:  mesh(generateEllipsoid(0.12, 0.07, 0.09, 12, 16, [0.15, 0.12, 0.14])),
        horn:     mesh(generateCone(0.3, 2.2, 40, 20,
                        (x, y, z, t) => [0.50 + 0.46 * t, 0.46 + 0.47 * t, 0.44 + 0.38 * t])),
        ear:      mesh(generateEllipticParaboloid(0.30, 0.13, 1.3, 20, 28, SKIN_DARK)),
        eyeball:  mesh(generateSphere(0.30, 24, 32, [0.97, 0.97, 0.97])),
        pupil:    mesh(generateSphere(0.13, 16, 20, [0.28, 0.07, 0.10])),
        eyelid:   mesh(generateEllipsoid(0.33, 0.17, 0.33, 16, 24, SKIN)),
    };

    // head
    //  ├─ hull (kulit Bezier: tempurung + dahi)
    //  ├─ cheekL/R (ellipsoid)
    //  ├─ snout ── nostril x2, horn
    //  ├─ jawPivot ── jaw
    //  ├─ earPivot x2 ── ear
    //  └─ eye x2 ── pupil, eyelid
    const head = obj(null, "head");

    // hull: diskala seragam supaya bisa diperbesar tanpa mengubah profil kurva
    const hullObj = at(obj(MESH.hull, "hull"), 0, 0.10, 0);
    const HS = 1.15;
    LIBS.scaleX(hullObj.POSITION_MATRIX, HS);
    LIBS.scaleY(hullObj.POSITION_MATRIX, HS);
    LIBS.scaleZ(hullObj.POSITION_MATRIX, HS);
    head.add(hullObj);

    // pipi (ellipsoid)
    for (const sx of [-1, 1]) {
        head.add(at(obj(MESH.cheek, sx < 0 ? "cheekL" : "cheekR"), sx * 0.60, -0.30, -0.10));
    }

    // ---- Moncong (ellipsoid) + cula + lubang hidung ----
    const snout = at(obj(MESH.snout, "snout"), 0, -0.40, 1.10);
    for (const sx of [-1, 1]) {
        snout.add(at(obj(MESH.nostril, sx < 0 ? "nostrilL" : "nostrilR"), sx * 0.3, 0.15, 0.80));
    }
    const horn = obj(MESH.horn, "horn");
    LIBS.rotateX(horn.POSITION_MATRIX, 0.45);
    at(horn, 0, 0.40, 0.45);
    snout.add(horn);
    head.add(snout);

    // ---- Rahang bawah (elliptic paraboloid), pivot di engsel ----
    const jawPivot = at(obj(null, "jawPivot"), 0, -0.85, -0.10);
    const jaw = obj(MESH.jaw, "jaw");
    LIBS.rotateX(jaw.POSITION_MATRIX, -Math.PI / 2);
    at(jaw, 0, -0.45, 0.30);
    jawPivot.add(jaw);
    head.add(jawPivot);

    // ---- Telinga (elliptic paraboloid), pivot di pangkal ----
    const ears = {};
    for (const sx of [-1, 1]) {
        const pivot = obj(null, sx < 0 ? "earPivotL" : "earPivotR");
        LIBS.rotateZ(pivot.POSITION_MATRIX, -sx * 0.2);
        at(pivot, sx * 0.60, 0.65, -0.20);

        const ear = obj(MESH.ear, sx < 0 ? "earL" : "earR");
        LIBS.rotateX(ear.POSITION_MATRIX, Math.PI / 2);
        at(ear, 0, 1.3, 0);
        pivot.add(ear);
        head.add(pivot);
        ears[sx < 0 ? "L" : "R"] = pivot;
    }

    // ---- Mata (sphere) + pupil (sphere) + kelopak ----
    for (const sx of [-1, 1]) {
        const eye = at(obj(MESH.eyeball, sx < 0 ? "eyeL" : "eyeR"), sx * 0.50, 0.50, 0.9);
        eye.add(at(obj(MESH.pupil, "pupil"), sx * 0.08, 0.0, 0.19));
        const lid = obj(MESH.eyelid, "eyelid");
        LIBS.rotateX(lid.POSITION_MATRIX, 0.35);
        at(lid, 0, 0.2, 0);
        eye.add(lid);
        head.add(eye);
    }

    return {
        root: head,
        parts: { head, snout, horn, jawPivot, jaw, earL: ears.L, earR: ears.R }
    };
}