// dk_bridge.js : wraps Ber's Donkey Kong (dk-grafkom.final/dk-grafkom/) inside William's scene.
//
//  - Ber's model code is used UNCHANGED (classic scripts loaded by index.html):
//      math.js, geometry.js, renderer.js, bodypart.js, dk/*.js, animation.js (for POSE)
//    -> globals: DonkeyKong, Renderer, initMeshes, M4, POSE, lerpPose, ...
//    Ber's main.js / scene.js are NOT loaded (they own a canvas, camera and loop).
//  - DK is drawn with Ber's own shader (fur noise, "DK" tie texture), on William's GL context.
//  - DK's world placement is an ANCHOR node (mesh-less William SceneObject). Its MOVE_MATRIX
//    is built with William's LIBS (T, R, S, arbitrary-axis R). Hierarchical parenting is done
//    by moving that anchor between parents IN WILLIAM'S SCENE GRAPH:
//        scene root  ->  Rambi's root (scene 3-6)  ->  scene root  ->  Enguarde's anchor (scene 8)  ->  scene root
//    William's own SceneObject.render() then computes DK's world matrix every frame.
//
// API:  initDK(ctx, canvas)  updateDK(T, cinema, idleT, refs)  drawDK(frame)

import { SceneObject } from "../../ProyekUTS_Grafkom_DonkeyKong_A2/SceneObject.js";
import { BASE } from "../../ProyekUTS_Grafkom_DonkeyKong_A2/Environment.js";
import {
    clamp, seg, ease, eseg, lerp, lerp3, wrapPi, lerpAngle, bump, norm3, headingTo,
    rambiPose, rambiWorld, xform, matHeading, groundY,
    SCENE6_SPLASH, SEA_Y, BEAT10, END_T,
    SCENE4_START, SCENE5_START, SCENE10_START,
    DK_JUMP0, DK_LAND_RAMBI, DK_RELEASE, DK_SPLASH_T, ENG_ARRIVE,
    DK_HOP_ON0, DK_ON_ENG, DK_HOP_OFF0, DK_LAND_BEACH
} from "./timeline.js";
import { enguardeMatrix, enguardeState, ENG_SEAT, ENG_SCALE } from "./enguarde_bridge.js";

const SD = 0.75;                                  // DK model units -> world units (DK is ~2.7 tall, Rambi ~4.7)
const RSEAT = [0, 0.55, -0.6];                    // DK's root on Rambi's back (Rambi root-local, behind the shoulders)
const COM = 1.35 * SD;                            // DK's centre of mass above his root (pivot for flips)
const FLOAT_Y = SEA_Y - 1.45;                     // root height while floating (chest at the water line)

let gl, renderer, dk, anchor;
let P = null;                                     // story points, computed once from William's data

function storyPoints() {
    const stop = rambiPose(15);                   // where Rambi stops in scene 2
    const h = stop.h, F = [Math.sin(h), Math.cos(h)], R = [-Math.cos(h), Math.sin(h)];   // forward, Rambi's right
    const S2P = [stop.x + F[0] * 1.0 + R[0] * 3.0, stop.z + F[1] * 1.0 + R[1] * 3.0];     // DK greets Rambi here
    const S3P = [S2P[0] + R[0] * 2.0, S2P[1] + R[1] * 2.0];                               // step back (Rambi turns)
    const RC = 4.2;                                                                        // dance circle round the tree
    const d = [S2P[0] - BASE.x, S2P[1] - BASE.z], dl = Math.hypot(d[0], d[1]);
    const EXIT = [BASE.x + d[0] / dl * RC, BASE.z + d[1] / dl * RC];
    const SPL = [SCENE6_SPLASH.x, SCENE6_SPLASH.z];
    const L = [7.0, 7.6];                                                                  // beach landing (wet sand, clear of Rambi's walk, in front)
    const CAM10 = [11.5, -1.7];                                                            // where William's scene-10 camera sits
    const rel = rambiWorld(DK_RELEASE);
    const eng644 = enguardeState(64.4);
    // Rambi's scale + pitch at the moment DK is thrown (so the throw starts exactly where riding ended)
    const col = (i) => Math.hypot(rel[4 * i], rel[4 * i + 1], rel[4 * i + 2]);
    const relScale = [col(0), col(1), col(2)];
    const relPitch = -Math.asin(clamp(rel[9] / relScale[2], -1, 1));                    // nose-down = lean forward
    return {
        S2P, S3P, RC, EXIT, thetaExit: Math.atan2(EXIT[1] - BASE.z, EXIT[0] - BASE.x), SPL, L,
        yawL: Math.atan2(CAM10[0] - L[0], CAM10[1] - L[1]),
        relPos: xform(rel, RSEAT), relYaw: matHeading(rel), relScale, relPitch,
        yawShore: Math.atan2(-4.9, 5.7),                              // face the scene-7 water-level camera (shore side)
        yawEng: Math.atan2(eng644.x - SPL[0], eng644.z - SPL[1]),
    };
}

/* =====================================================================
 * LIMB HELPERS (DK API: setArm, hand.curl, walk, rotation/scale arrays)
 * ===================================================================== */
const REST = () => POSE.rest;
const UP = [-0.25, 0, 2.6, -0.35, 0, 0];          // arm straight up
const PUMP = [-0.45, 0, 2.15, -1.5, 0, 0];        // arm up, elbow bent (dance pump)
const GRIP = [-1.05, 0, 0.32, -0.45, 0, 0];       // reaching forward, holding on
const FIN = [-1.55, 0, 0.18, -0.55, 0, 0];        // reaching forward-up to the dorsal fin
const CROUCH_ARMS = [0.9, 0, 0.4, -0.3, 0, 0];    // swung back, ready to jump
const throwArm = (a, T) => {                      // windmill flailing while flying through the air
    const ph = 2 * Math.PI * 2.3 * T + (a.side > 0 ? 0 : Math.PI);
    return [-1.5 + 1.6 * Math.sin(ph), 0, 1.3 + 0.4 * Math.cos(ph), -0.4, 0, 0];
};

function setArms(pl, pr) { dk.setArm(dk.armL, pl); dk.setArm(dk.armR, pr); }
// read an arm back as a pose vector (inverse of Ber's setArm mirroring)
const getArm = (a) => [a.rotation[0], a.side * a.rotation[1], a.side * a.rotation[2],
    a.forearm.rotation[0], a.side * a.forearm.rotation[1], a.side * a.forearm.rotation[2]];

function sit(k) {                                  // straddle legs (riding pose)
    for (const l of dk.legs) {
        l.rotation[0] += -1.35 * k;
        l.rotation[2] += l.side * 0.55 * k;
        l.shin.rotation[0] += 1.45 * k;
        l.foot.rotation[0] += -0.3 * k;
    }
    dk.torso.rotation[0] += 0.1 * k;
}

function crouchLegs(k) {
    for (const l of dk.legs) { l.rotation[0] -= 0.75 * k; l.shin.rotation[0] += 1.3 * k; l.foot.rotation[0] -= 0.5 * k; }
    dk.torso.rotation[0] += 0.35 * k;
}

function chestBeat(t, env) {                       // Ber's hierarchical chest-beat (POSE.open / POSE.strike)
    dk.arms.forEach((a, k) => {
        const s = env * (0.5 - 0.5 * Math.cos(2 * Math.PI * (t * 2.4 + k * 0.5)));
        let p = lerpPose(POSE.rest, POSE.open, env);
        p = lerpPose(p, POSE.strike, s);
        dk.setArm(a, p);
        a.hand.curl(lerp(0.45, 1.0, env));
    });
    dk.head.rotation[0] += -0.18 * env;
}

// scene-10 arm routines as poses (so they can be cross-faded): 0 pump, 1 wave overhead, 2 chest beat
function danceArms(part, t, g) {
    const B = BEAT10;
    if (part === 0) {
        const up = 0.5 + 0.5 * Math.sin(Math.PI * t / B * 2);
        return { L: lerpPose(REST(), PUMP, g * up), R: lerpPose(REST(), PUMP, g * (1 - up)), c: 0.45 };
    }
    if (part === 1) {
        const w = Math.sin(2 * Math.PI * t / B);
        return { L: lerpPose(REST(), [-0.2, 0, 2.6, -0.5, 0, 0.6 * w], g), R: lerpPose(REST(), [-0.2, 0, 2.6, -0.5, 0, -0.6 * w], g), c: lerp(0.45, 0.05, g) };
    }
    const pose = (k) => {                                // Ber's chest-beat poses (POSE.open -> POSE.strike)
        const s = g * (0.5 - 0.5 * Math.cos(2 * Math.PI * (t * 2.4 + k * 0.5)));
        return lerpPose(lerpPose(POSE.rest, POSE.open, g), POSE.strike, s);
    };
    return { L: pose(0), R: pose(1), c: lerp(0.45, 1.0, g) };
}

function lookAt(yawBody, target, pos, max = 1.0) {  // head turns toward a world point
    const want = Math.atan2(target[0] - pos[0], target[2] - pos[2]);
    dk.head.rotation[1] += clamp(wrapPi(want - yawBody), -max, max);
}

/* =====================================================================
 * ROOT MATRIX BUILDER (William's LIBS)  :  S -> R(tilt) -> R(yaw) -> T -> A
 * ===================================================================== */
function rootMatrix({ s = [1, 1, 1], k = SD, tiltX = 0, tiltZ = 0, yaw = 0, pos = [0, 0, 0], arb = null }) {
    const M = LIBS.get_I4();
    LIBS.scaleX(M, k * s[0]); LIBS.scaleY(M, k * s[1]); LIBS.scaleZ(M, k * s[2]);   // S
    LIBS.rotateX(M, tiltX); LIBS.rotateZ(M, tiltZ);                                 // R (sway / lean)
    LIBS.rotateY(M, yaw);                                                           // R (facing)
    LIBS.set_position(M, pos[0], pos[1], pos[2]);                                   // T
    if (arb) for (const a of [].concat(arb)) LIBS.rotateArbitrary(M, a.point, a.axis, a.angle);   // A
    return M;
}

const ground = (x, z) => groundY(x, z) - 0.03;
const squash = (q, amt = 0.3) => [1 + amt * 0.5 * q, 1 - amt * q, 1 + amt * 0.5 * q];    // volume-ish preserving

/* =====================================================================
 * THE STORY  (returns { parent, M } and poses the limbs; pure function of T)
 * ===================================================================== */
function storyDK(T) {
    T = Math.min(T, END_T);

    /* ---------------- scenes 1-3 (before the jump): on the ground near the banana tree ---------------- */
    if (T < DK_JUMP0) {
        let x, z, yaw, y = 0, s = [1, 1, 1], tiltZ = 0;
        const B1 = 0.5, steps = T / B1, kk = Math.floor(steps), fr = steps - kk;
        const danceG = 1 - eseg(T, 11.0, 11.7);                 // dance fades out when DK notices Rambi
        const rp = rambiPose(T), rpos = [rp.x, 0, rp.z];

        if (T < 11.4) {
            // SCENE 1 (and the start of 2): T = dance steps all the way round the tree (one step per beat)
            const N = 11.4 / B1;
            const prog = clamp((kk + ease(Math.min(1, fr * 1.7))) / N, 0, 1);
            const th = P.thetaExit - 2 * Math.PI * (1 - prog);
            const g2 = 1 - eseg(T, 10.6, 11.4);                  // steps settle before DK stops
            x = BASE.x + P.RC * Math.cos(th); z = BASE.z + P.RC * Math.sin(th);
            yaw = Math.atan2(-Math.sin(th), Math.cos(th)) + 0.55 * g2 * Math.sin(Math.PI * steps / 2);
            y = 0.22 * g2 * Math.abs(Math.sin(Math.PI * fr));    // hop on every step
        } else if (T < 12.3) {
            x = P.EXIT[0]; z = P.EXIT[1];
            const th = P.thetaExit;
            yaw = lerpAngle(Math.atan2(-Math.sin(th), Math.cos(th)), headingTo([x, 0, z], rpos), eseg(T, 11.6, 12.3));
        } else if (T < 14.6) {
            // SCENE 2: walk over to greet Rambi
            const f = eseg(T, 12.3, 14.6);
            x = lerp(P.EXIT[0], P.S2P[0], f); z = lerp(P.EXIT[1], P.S2P[1], f);
            const dir = Math.atan2(P.S2P[0] - P.EXIT[0], P.S2P[1] - P.EXIT[1]);
            yaw = lerpAngle(lerpAngle(headingTo([P.EXIT[0], 0, P.EXIT[1]], rpos), dir, eseg(T, 12.3, 12.8)),
                headingTo([x, 0, z], rpos), eseg(T, 14.0, 14.6));
            const dist = Math.hypot(P.S2P[0] - P.EXIT[0], P.S2P[1] - P.EXIT[1]) * f;
            dk.walk(dist / 0.9 * 2 * Math.PI, Math.min(1, 3 * bump(T, 12.3, 14.6)));
        } else if (T < 19.0) {
            x = P.S2P[0]; z = P.S2P[1];
            yaw = headingTo([x, 0, z], rpos);
        } else if (T < 19.9) {
            // T: step BACKWARD (Rambi is about to turn round)
            const f = eseg(T, 19.0, 19.9);
            x = lerp(P.S2P[0], P.S3P[0], f); z = lerp(P.S2P[1], P.S3P[1], f);
            yaw = headingTo([x, 0, z], rpos);
            dk.walk(-f * 2.0 / 0.9 * 2 * Math.PI, Math.min(1, 3 * bump(T, 19.0, 19.9)));
        } else {
            x = P.S3P[0]; z = P.S3P[1];
            yaw = headingTo([x, 0, z], rpos);
        }
        const pos = [x, ground(x, z) + y, z];

        // ----- limbs -----
        if (danceG > 0) {                                     // H: shoulders -> elbows -> hands dance cycle
            const up = 0.5 + 0.5 * Math.sin(Math.PI * steps);
            setArms(lerpPose(REST(), lerpPose(PUMP, UP, 0.3 * up), danceG * up),
                lerpPose(REST(), lerpPose(PUMP, UP, 0.3 * (1 - up)), danceG * (1 - up)));
            dk.armL.hand.curl(0.45, [0, 1, 2, 3].map(i => 0.5 * danceG * Math.sin(2 * Math.PI * steps + i)));
            dk.armR.hand.curl(0.45, [0, 1, 2, 3].map(i => 0.5 * danceG * Math.cos(2 * Math.PI * steps + i)));
            dk.walk(Math.PI * steps, 0.55 * danceG);
            dk.torso.rotation[2] += 0.16 * danceG * Math.sin(Math.PI * steps);       // R: sway to the beat
            dk.torso.rotation[1] += 0.22 * danceG * Math.sin(Math.PI * steps / 2);
            dk.head.rotation[0] += 0.12 * danceG * Math.sin(2 * Math.PI * steps);
            tiltZ = 0.1 * danceG * Math.sin(Math.PI * steps);                         // R: whole body sways
            const p = danceG * Math.pow(Math.max(0, Math.cos(Math.PI * fr)), 3);      // S: pulse on the beat
            dk.torso.scale = [1 + 0.07 * p, 1 + 0.1 * p, 1 + 0.07 * p];
        }
        if (T >= 11.4) lookAt(yaw, rpos, pos, 0.9);           // R: head turns toward Rambi

        // S: "pop" of enthusiasm when Rambi stops
        const pop = 0.3 * bump(T, 15.0, 15.5) - 0.07 * bump(T, 15.5, 15.85);
        s = s.map(v => v * (1 + pop));
        const cheer = bump(T, 14.95, 15.95);
        if (cheer > 0) setArms(lerpPose(REST(), UP, cheer), lerpPose(REST(), UP, cheer));
        pos[1] += 0.25 * bump(T, 15.0, 15.45);
        // listening to Rambi's news: nodding
        dk.head.rotation[0] += 0.13 * Math.sin(2 * Math.PI * 1.6 * T) * eseg(T, 16.3, 16.6) * (1 - eseg(T, 18.8, 19.1));
        // stepping back: hands up defensively
        const def = bump(T, 18.9, 20.2);
        if (def > 0) setArms(lerpPose(REST(), GRIP, def), lerpPose(REST(), GRIP, def));
        // scene 3: Rambi snorts, DK beats his chest (Ber's hierarchical chest-beat)
        const env = eseg(T, 22.3, 22.7) * (1 - eseg(T, 24.0, 24.4));
        if (env > 0) chestBeat(T - 22.3, env);
        // crouch before the jump: S squash + legs bend
        const c = eseg(T, 24.5, 25.1);
        if (c > 0) {
            crouchLegs(c);
            s = s.map((v, i) => v * (i === 1 ? 1 - 0.16 * c : 1 + 0.07 * c));
            setArms(lerpPose(REST(), CROUCH_ARMS, c), lerpPose(REST(), CROUCH_ARMS, c));
        }
        return { parent: "world", M: rootMatrix({ s, yaw, pos, tiltZ }) };
    }

    /* ---------------- scene 3: parabolic jump onto Rambi's back + flip on an arbitrary axis ---------------- */
    if (T < DK_LAND_RAMBI) {
        const u = seg(T, DK_JUMP0, DK_LAND_RAMBI);
        const RW = rambiWorld(T);
        const start = [P.S3P[0], ground(P.S3P[0], P.S3P[1]), P.S3P[1]];
        const end = xform(RW, RSEAT);                                 // live seat on Rambi's back
        const pos = lerp3(start, end, u);
        pos[1] += 2.6 * 4 * u * (1 - u);                              // T: parabola
        const r0 = rambiPose(DK_JUMP0);
        const yaw0 = headingTo(start, [r0.x, 0, r0.z]);               // same facing as the last ground frame
        const yaw = lerpAngle(yaw0, matHeading(RW), eseg(u, 0.1, 0.9));
        const jd = norm3([end[0] - start[0], 0, end[2] - start[2]]);
        const axis = norm3([jd[2] + 0.2 * jd[0], 0.35, -jd[0] + 0.2 * jd[2]]);   // tilted side axis
        // S: un-squash out of the crouch, stretch on take-off
        const k0 = eseg(u, 0, 0.12), st = bump(u, 0.04, 0.45);
        const s = [lerp(1.07, 1, k0) - 0.06 * st, lerp(0.84, 1, k0) + 0.15 * st, lerp(1.07, 1, k0) - 0.06 * st];
        const arms = lerpPose(lerpPose(CROUCH_ARMS, UP, k0), GRIP, eseg(u, 0.72, 1));   // up in the air, grab on landing
        setArms(arms, arms);
        dk.armL.hand.curl(lerp(0.45, 0.9, eseg(u, 0.72, 1))); dk.armR.hand.curl(lerp(0.45, 0.9, eseg(u, 0.72, 1)));
        crouchLegs((1 - k0) + 0.8 * bump(u, 0.15, 0.95));                 // tuck in the air
        sit(eseg(u, 0.75, 1));
        return {
            parent: "world",
            M: rootMatrix({ s, yaw, pos, arb: { point: [pos[0], pos[1] + COM, pos[2]], axis, angle: 2 * Math.PI * ease(seg(u, 0.12, 0.88)) } })
        };
    }

    /* ---------------- scenes 3-6: riding Rambi (H: anchor is a child of Rambi's root node) ---------------- */
    if (T < DK_RELEASE) {
        sit(1);
        let s = [1, 1, 1], tiltZ = 0, tiltX = 0, arb = null;
        // landing squash
        const q = bump(T, DK_LAND_RAMBI, DK_LAND_RAMBI + 0.65) * (1 - seg(T, DK_LAND_RAMBI, DK_LAND_RAMBI + 0.65) * 0.5);
        s = squash(q, 0.28);
        setArms(GRIP, GRIP);
        dk.armL.hand.curl(0.9); dk.armR.hand.curl(0.9);

        if (T < SCENE4_START) {                                    // fist pump before the run
            const e = eseg(T, 27.3, 27.7) * (1 - eseg(T, 29.4, 29.9));
            dk.setArm(dk.armR, lerpPose(GRIP, lerpPose(PUMP, UP, 0.5 + 0.5 * Math.sin(2 * Math.PI * 2 * T)), e));
            dk.head.rotation[1] += 0.4 * Math.sin(1.1 * T);
        } else if (T < SCENE5_START) {
            // SCENE 4: R: waving + cheering, S: pulsing to the gallop beat
            const g = eseg(T, SCENE4_START, SCENE4_START + 0.8);
            const beat = 2.2 * T;
            const wave = Math.sin(2 * Math.PI * 2.0 * T);
            const P1 = [-0.2, 0, 2.7, -0.6, 0, 0.55 * wave];
            dk.setArm(dk.armR, lerpPose(GRIP, P1, g));
            dk.armR.hand.curl(lerp(0.9, 0.05, g));
            dk.torso.position[1] += 0.07 * g * Math.abs(Math.sin(Math.PI * beat));
            dk.torso.rotation[2] += 0.08 * g * Math.sin(Math.PI * beat);
            dk.head.rotation[1] += 0.45 * Math.sin(0.9 * T) * g;
            const p = g * Math.pow(Math.max(0, Math.cos(Math.PI * beat)), 4);
            s = s.map(v => v * (1 + 0.06 * p));
        } else {
            // SCENE 5: R: shaking, A: leaning back against the wind, S: stretched by speed
            // same ramp as Rambi's acceleration; everything fades out just before the brake (clean hand-off at 50.2)
            const fade = 1 - eseg(T, 49.3, 49.95);
            const vf = clamp((T - SCENE5_START) / 8, 0, 1) * fade;
            const g = eseg(T, SCENE5_START, SCENE5_START + 1.0) * fade;
            dk.torso.rotation[0] += 0.07 * vf * Math.sin(2 * Math.PI * 11 * T);
            dk.torso.rotation[2] += 0.08 * vf * Math.sin(2 * Math.PI * 13.7 * T + 1);
            dk.head.rotation[0] += -0.25 * g + 0.08 * vf * Math.sin(2 * Math.PI * 9.3 * T);
            dk.head.rotation[2] += 0.07 * vf * Math.sin(2 * Math.PI * 12.1 * T);
            tiltZ = 0.05 * vf * Math.sin(2 * Math.PI * 8.7 * T);
            setArms(lerpPose(GRIP, FIN, 0.5 * g), lerpPose(GRIP, FIN, 0.5 * g));
            dk.armL.hand.curl(1); dk.armR.hand.curl(1);
            s = [1 - 0.05 * vf, 1 + 0.12 * vf, 1 + 0.1 * vf];
            // lean back: rotation about a skewed axis through DK's hip (not through the origin)
            arb = { point: [RSEAT[0], RSEAT[1] + 0.45, RSEAT[2]], axis: norm3([1, 0.15, 0.2]), angle: -(0.25 + 0.3 * vf) * g };
            // scene 6 starts: brace forward just before being thrown
            tiltX = 0.25 * eseg(T, 49.9, DK_RELEASE);
        }
        return { parent: "rambi", M: rootMatrix({ s, tiltX, tiltZ, pos: RSEAT, arb }) };
    }

    /* ---------------- scene 6: thrown into the sea (world again) ---------------- */
    if (T < DK_SPLASH_T) {
        const u = seg(T, DK_RELEASE, DK_SPLASH_T);
        const end = [P.SPL[0], SEA_Y - 0.4, P.SPL[1]];
        const pos = lerp3(P.relPos, end, u);
        pos[1] += 8.0 * 4 * u * (1 - u);                                // T: high parabolic throw
        const yaw = P.relYaw;
        const side = [Math.cos(yaw), 0, -Math.sin(yaw)], fwd = [Math.sin(yaw), 0, Math.cos(yaw)];
        const axis = norm3([side[0] + 0.3 * fwd[0], 0.4, side[2] + 0.3 * fwd[2]]);   // tilted somersault axis
        const angle = 4 * Math.PI * (1 - (1 - u) * (1 - u));             // two turns, upright at the splash
        const st = bump(u, 0, 1);                                        // S: stretched in flight
        const k0 = eseg(u, 0, 0.15);                                     // start from the scale Rambi gave him
        const s = [lerp(P.relScale[0], 1 - 0.1 * st, k0), lerp(P.relScale[1], 1 + 0.25 * st, k0), lerp(P.relScale[2], 1 - 0.1 * st, k0)];
        const tiltX = (0.25 + P.relPitch) * (1 - eseg(u, 0, 0.25));      // ... and from his forward pitch
        const kl = eseg(u, 0, 0.12);                                     // limbs leave the riding pose
        for (const a of dk.arms) {                                       // flailing
            dk.setArm(a, lerpPose(GRIP, throwArm(a, T), kl));
            a.hand.curl(lerp(0.9, 0.1, kl));
        }
        sit(1 - kl);
        dk.walk(2 * Math.PI * 3 * T, 0.9 * kl);
        return { parent: "world", M: rootMatrix({ s, yaw, pos, tiltX, arb: { point: [pos[0], pos[1] + COM, pos[2]], axis, angle } }) };
    }

    /* ---------------- scene 7: impact, floating, flailing; Enguarde comes ---------------- */
    if (T < DK_ON_ENG) {
        let pos, yaw, s = [1, 1, 1];
        const bob = 0.1 * Math.sin(2.6 * T);
        const yFloat = T < 53.8
            ? lerp(SEA_Y - 0.4, FLOAT_Y - 0.6, eseg(T, DK_SPLASH_T, 53.8))
            : lerp(FLOAT_Y - 0.6, FLOAT_Y, eseg(T, 53.8, 54.6)) + bob * eseg(T, 54.2, 55);
        s = squash(bump(T, DK_SPLASH_T, 54.0), 0.35);                  // S: squash on impact
        yaw = lerpAngle(P.relYaw, P.yawShore, eseg(T, 54.6, 56.0));
        yaw = lerpAngle(yaw, P.yawEng, eseg(T, 63.4, 64.4));
        pos = [P.SPL[0], yFloat, P.SPL[1]];

        // R: arm flailing (calms down and waves when Enguarde arrives)
        const calm = eseg(T, ENG_ARRIVE - 0.6, ENG_ARRIVE + 0.2);
        const kF = eseg(T, DK_SPLASH_T + 0.3, DK_SPLASH_T + 1.0);
        const WAVE = [-0.2, 0, 2.6, -0.5, 0, 0.5 * Math.sin(2 * Math.PI * 2 * T)];
        for (const a of dk.arms) {
            const ph = 2 * Math.PI * 1.7 * T + (a.side > 0 ? 0 : 2.2);
            const flail = [-2.4 + 0.9 * Math.sin(ph), 0, 0.9 + 0.5 * Math.sin(ph * 1.3 + 1), -0.6 - 0.4 * Math.sin(ph + 0.7), 0, 0];
            const after = a === dk.armR ? WAVE : REST();             // relieved: wave at Enguarde
            const base = lerpPose(throwArm(a, T), REST(), eseg(T, DK_SPLASH_T, DK_SPLASH_T + 0.4));   // continue from the throw
            dk.setArm(a, lerpPose(lerpPose(base, flail, kF), after, calm));
            a.hand.curl(0.15);
        }
        dk.walk(2 * Math.PI * 1.2 * T, 0.6);                             // treading water
        dk.head.rotation[1] += 0.6 * Math.sin(1.3 * T) * (1 - eseg(T, 63.2, 64.0));
        if (T >= 63.2) lookAt(yaw, (() => { const e = enguardeState(T); return [e.x, 0, e.z]; })(), pos, 0.8);

        if (T >= DK_HOP_ON0) {                                           // climb onto Enguarde's back
            const u = seg(T, DK_HOP_ON0, DK_ON_ENG);
            const EM = enguardeMatrix(T);
            const seat = xform(EM, ENG_SEAT);
            const yFrom = FLOAT_Y + 0.1 * Math.sin(2.6 * DK_HOP_ON0);
            pos = lerp3([P.SPL[0], yFrom, P.SPL[1]], seat, ease(u));
            pos[1] += 1.5 * 4 * u * (1 - u);
            const es = enguardeState(T);
            const yawRide = Math.atan2(Math.cos(es.yaw), -Math.sin(es.yaw));   // Enguarde's forward, as a +Z heading
            yaw = lerpAngle(P.yawEng, yawRide, eseg(u, 0.1, 0.9));
            sit(eseg(u, 0.4, 1));
            const kf = eseg(u, 0.1, 1);                                  // from the waving pose to the fin grip
            setArms(lerpPose(getArm(dk.armL), FIN, kf), lerpPose(getArm(dk.armR), FIN, kf));
        }
        return { parent: "world", M: rootMatrix({ s, yaw, pos }) };
    }

    /* ---------------- scene 8 (+ start of 9): riding Enguarde (anchor is a child of Enguarde's anchor) ---------------- */
    if (T < DK_HOP_OFF0) {
        sit(1);
        setArms(FIN, FIN);
        dk.armL.hand.curl(1); dk.armR.hand.curl(1);
        const woo = eseg(T, 74.6, 75.0) * (1 - eseg(T, 76.4, 76.9));     // "woo!" after the barrel roll
        if (woo > 0) dk.setArm(dk.armR, lerpPose(FIN, [-0.2, 0, 2.7, -0.6, 0, 0.6 * Math.sin(2 * Math.PI * 2.2 * T)], woo));
        dk.torso.rotation[2] += 0.05 * Math.sin(2.6 * T);
        dk.head.rotation[1] += 0.35 * Math.sin(0.8 * T);
        const k = SD / ENG_SCALE;                                        // cancel Enguarde's own scale
        const M = LIBS.get_I4();
        LIBS.scaleX(M, k); LIBS.scaleY(M, k); LIBS.scaleZ(M, k);
        LIBS.rotateY(M, Math.PI / 2);                                    // DK faces +Z, Enguarde faces +X
        LIBS.set_position(M, ENG_SEAT[0], ENG_SEAT[1], ENG_SEAT[2]);
        return { parent: "enguarde", M };
    }

    /* ---------------- scene 9: hop onto the beach, squash, wobble ---------------- */
    if (T < SCENE10_START) {
        let pos, yaw, s = [1, 1, 1];
        const L = [P.L[0], ground(P.L[0], P.L[1]), P.L[1]];
        if (T < DK_LAND_BEACH) {
            const u = seg(T, DK_HOP_OFF0, DK_LAND_BEACH);
            const EM = enguardeMatrix(DK_HOP_OFF0), es = enguardeState(DK_HOP_OFF0);
            const start = xform(EM, ENG_SEAT);
            pos = lerp3(start, L, u);
            pos[1] += 2.2 * 4 * u * (1 - u);
            yaw = lerpAngle(Math.atan2(Math.cos(es.yaw), -Math.sin(es.yaw)), P.yawL, eseg(u, 0.1, 0.9));
            sit(1 - eseg(u, 0, 0.5));
            crouchLegs(0.7 * bump(u, 0.2, 1));
            setArms(lerpPose(FIN, UP, eseg(u, 0, 0.3)), lerpPose(FIN, UP, eseg(u, 0, 0.3)));
        } else {
            pos = L;
            yaw = P.yawL;
            const q = bump(T, DK_LAND_BEACH, DK_LAND_BEACH + 0.6) * (1 - 0.5 * seg(T, DK_LAND_BEACH, DK_LAND_BEACH + 0.6));
            s = squash(q, 0.32);                                         // S: squash on landing
            crouchLegs(0.6 * q);
            const ka = eseg(T, DK_LAND_BEACH, DK_LAND_BEACH + 0.45);     // arms come down from the jump
            setArms(lerpPose(UP, REST(), ka), lerpPose(UP, REST(), ka));
            // R: shoulder / torso wobble after landing (shaking the water off)
            const t = T - DK_LAND_BEACH - 0.5, dec = Math.exp(-Math.max(0, t) * 0.9) * seg(T, DK_LAND_BEACH + 0.4, DK_LAND_BEACH + 0.7);
            dk.torso.rotation[2] += 0.28 * dec * Math.sin(2 * Math.PI * 2.6 * t);
            dk.torso.rotation[1] += 0.2 * dec * Math.sin(2 * Math.PI * 2.6 * t + 1);
            dk.head.rotation[1] += 0.5 * dec * Math.sin(2 * Math.PI * 4.2 * t);
            for (const a of dk.arms) a.rotation[2] += a.side * 0.45 * dec * (0.5 + 0.5 * Math.sin(2 * Math.PI * 2.6 * t + a.side));
            const r = rambiPose(T);
            if (T > 84) lookAt(yaw, [r.x, 0, r.z], pos, 0.9 * eseg(T, 84, 84.6));
        }
        return { parent: "world", M: rootMatrix({ s, yaw, pos }) };
    }

    /* ---------------- scene 10: full dance (William's beat: 0.8 s) ---------------- */
    {
        const t = T - SCENE10_START, B = BEAT10;
        const k = Math.floor(t / B), u = t / B - k;
        const g = eseg(t, 0, 0.5);
        const yaw0 = P.yawL;
        const side = [Math.cos(yaw0), 0, -Math.sin(yaw0)];
        // T: side steps left / right on every beat, with a hop
        const stepTo = (n) => (n % 2 === 0 ? 0.55 : -0.55);
        const off = lerp(k === 0 ? 0 : stepTo(k - 1), stepTo(k), ease(Math.min(1, u * 1.6))) * g;
        const spinBeat = (k === 3 || k === 7 || k === 11);
        const hop = (spinBeat ? 0.85 : 0.28) * Math.abs(Math.sin(Math.PI * u)) * g;
        const L = [P.L[0] + side[0] * off, 0, P.L[1] + side[2] * off];
        const pos = [L[0], ground(L[0], L[2]) + hop, L[2]];
        // R: body choreography
        const sway = Math.sin(Math.PI * t / B);
        dk.torso.rotation[1] += 0.35 * sway * g;
        dk.torso.rotation[2] += 0.12 * Math.sin(2 * Math.PI * t / B) * g;
        dk.head.rotation[2] += 0.1 * sway * g;
        // S: beat pulse
        const p = g * Math.pow(Math.max(0, Math.cos(Math.PI * u)), 4);
        const s = [1 + 0.06 * p, 1 + 0.09 * p, 1 + 0.06 * p];
        // H: arms / elbows / shoulders / hands; the routine changes every 4 beats (cross-faded)
        const part = Math.floor(k / 4) % 3;
        const now = danceArms(part, t, g);
        if (k >= 4 && k % 4 === 0 && u < 0.4) {
            const prev = danceArms((part + 2) % 3, t, g), w = eseg(u, 0, 0.4);
            setArms(lerpPose(prev.L, now.L, w), lerpPose(prev.R, now.R, w));
            dk.armL.hand.curl(lerp(prev.c, now.c, w)); dk.armR.hand.curl(lerp(prev.c, now.c, w));
        } else {
            setArms(now.L, now.R);
            dk.armL.hand.curl(now.c); dk.armR.hand.curl(now.c);
        }
        if (part === 2) dk.head.rotation[0] += -0.18 * g;
        if (spinBeat) {                                              // arms out (T-pose) while spinning
            const e = bump(u, 0, 1);
            setArms(lerpPose(getArm(dk.armL), POSE.tpose, e), lerpPose(getArm(dk.armR), POSE.tpose, e));
        }
        dk.walk(Math.PI * (k + u), 0.45 * g);
        // A: spin about a tilted (arbitrary) axis on the spin beats
        let arb = null;
        if (spinBeat && u > 0.08 && u < 0.92) {
            const f = [Math.sin(yaw0), 0, Math.cos(yaw0)];
            const axis = norm3([0.3 * f[0] + 0.15 * side[0], 1, 0.3 * f[2] + 0.15 * side[2]]);
            const dir = k === 7 ? -1 : 1;
            arb = { point: [pos[0], pos[1] + COM, pos[2]], axis, angle: dir * 2 * Math.PI * ease(seg(u, 0.08, 0.92)) };
        }
        return { parent: "world", M: rootMatrix({ s, yaw: yaw0 + 0.2 * sway * g, pos, tiltZ: 0.1 * sway * g, arb }) };
    }
}

/* =====================================================================
 * PUBLIC API
 * ===================================================================== */
export function initDK(ctx, canvas) {
    gl = ctx.GL;
    renderer = new Renderer(canvas);                 // <- Ber's renderer; getContext returns William's existing context
    // Ber's fog starts at 15 units (his small stage). William's world is 240 units wide with no fog,
    // so DK's main program is re-linked with the fog pushed far away (only change to his shader).
    renderer.main = renderer._link(VS_MAIN, FS_MAIN.replace("smoothstep(15.0, 55.0,", "smoothstep(140.0, 260.0,"),
        ["aPos", "aNormal", "aUV"],
        ["uModel", "uViewProj", "uNormalMat", "uColor", "uLight", "uCam", "uFog", "uUnlit", "uFur", "uUseTex", "uShine", "uTex"]);
    renderer.light = norm3([0.4, 0.7, 0.6]);         // William's light direction
    initMeshes(renderer);                            // <- Ber's shared meshes + "DK" tie texture
    dk = new DonkeyKong();                           // <- Ber's model (hierarchy of BodyPart classes)
    anchor = new SceneObject(ctx, null, "dkAnchor");
    P = storyPoints();
    return anchor;
}

export const dkModel = () => dk;                   // (debug) Ber's DonkeyKong instance

/** DK's world matrix at time T (parent world x local), used to verify there are no pops at hand-offs */
export function dkWorldAt(T) {
    dk.resetPose();
    const r = storyDK(T);
    const parent = r.parent === "rambi" ? rambiWorld(T) : r.parent === "enguarde" ? enguardeMatrix(T) : LIBS.get_I4();
    return { parent: r.parent, M: LIBS.mul4(parent, r.M) };
}

let parentNode = null;
function reparent(node, parent) {                    // H: dynamic parenting inside William's scene graph
    if (parentNode === parent) return;
    if (parentNode) parentNode.childs = parentNode.childs.filter(c => c !== node);
    parent.childs.push(node);
    parentNode = parent;
}
const PARENT_LABEL = { scene: "scene root (world)", body: "Rambi's root node", enguardeAnchor: "Enguarde's anchor" };
export const dkParentName = () => (parentNode ? PARENT_LABEL[parentNode.name] || parentNode.name : "-");

export function updateDK(T, cinema, idleT, refs) {
    dk.resetPose();
    if (!cinema) {                                   // William's free-orbit viewer: DK stands next to Rambi
        reparent(anchor, refs.scene);
        const x = 3.4, z = 3.4;
        const loop = idleT % 8;
        const env = eseg(loop, 4.5, 4.9) * (1 - eseg(loop, 6.6, 7.0));
        dk.torso.scale = [1 + 0.01 * Math.sin(idleT * 1.8), 1 + 0.014 * Math.sin(idleT * 1.8), 1 + 0.01 * Math.sin(idleT * 1.8)];
        dk.head.rotation[1] += 0.3 * Math.sin(idleT * 0.5);
        if (env > 0) chestBeat(loop - 4.5, env);
        const M = rootMatrix({ yaw: -0.3, pos: [x, ground(x, z), z] });
        for (let i = 0; i < 16; i++) anchor.MOVE_MATRIX[i] = M[i];
        return;
    }
    const r = storyDK(T);
    reparent(anchor, r.parent === "rambi" ? refs.rambi : r.parent === "enguarde" ? refs.enguarde : refs.scene);
    for (let i = 0; i < 16; i++) anchor.MOVE_MATRIX[i] = r.M[i];
}

/** draw with Ber's shader. frame = { VP, eye, fogColor } */
export function drawDK(frame) {
    const u = renderer.main.u;
    gl.useProgram(renderer.main);
    for (let i = 0; i < 8; i++) gl.disableVertexAttribArray(i);
    for (let i = 0; i < 3; i++) gl.enableVertexAttribArray(i);   // Ber binds aPos/aNormal/aUV to 0/1/2
    gl.uniformMatrix4fv(u.uViewProj, false, frame.VP);
    gl.uniform3fv(u.uLight, renderer.light);
    gl.uniform3fv(u.uCam, frame.eye);
    gl.uniform3fv(u.uFog, frame.fogColor);
    gl.uniform1i(u.uTex, 0);
    renderer.pass = "main";
    renderer.wireMode = false;
    renderer.stack.s = [new Float32Array(anchor.MODEL_MATRIX)];   // base = DK anchor's world matrix (William's traversal)
    dk.draw(renderer);                                             // Ber's BodyPart.draw (matrix stack hierarchy)
}
