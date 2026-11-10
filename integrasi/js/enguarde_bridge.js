// enguarde_bridge.js : wraps Enguarde (enguardeku/) so it lives inside William's scene.
//
//  - Enguarde's own model + animation code is used UNCHANGED:
//      enguardeku/js/{mat4,geometry,scene,enguarde}.js  ->  window.createEnguarde(upload)
//    (enguardeku/js/main.js is NOT loaded: it owns a canvas + render loop. Its shader,
//     upload() and drawMesh() are reproduced below so the fish keeps its own look.)
//  - Placement in the world is done through an ANCHOR node, a mesh-less William SceneObject.
//    Its MOVE_MATRIX is built with William's LIBS (T, R, S, arbitrary-axis R), and William's
//    own scene traversal computes its MODEL_MATRIX. The fish is then drawn with that
//    MODEL_MATRIX as the base of Enguarde's matrix stack  ->  real hierarchical parenting.
//
// API:  initEnguarde(ctx)  updateEnguarde(T, cinema)  drawEnguarde(frame)  enguardeMatrix(T)

import { SceneObject } from "../../ProyekUTS_Grafkom_DonkeyKong_A2/SceneObject.js";
import {
    clamp, seg, ease, eseg, lerp, wrapPi, lerpAngle, bump, makePath, trapezoid,
    SCENE6_SPLASH, SCENE9_MEET, SEA_Y, BEAT10, SCENE7_START, SCENE8_START,
    ENG_ARRIVE, ENG_AT_MEET, SCENE10_START, END_T
} from "./timeline.js";

export const ENG_SCALE = 0.7;                     // Enguarde model units -> world units
export const ENG_SEAT = [-1.45, -0.02, 0];       // where DK sits, in Enguarde's local frame (behind the dorsal fin)
const SURF_Y = SEA_Y - 0.12;                      // body centre while swimming at the surface

/* =====================================================================
 * STORY (pure functions of T, so seeking / pausing always gives the same frame)
 * ===================================================================== */
const SPL = [SCENE6_SPLASH.x, SCENE6_SPLASH.z];
const MEET = [SCENE9_MEET.x, SCENE9_MEET.z];
const add = (p, dx, dz) => [p[0] + dx, p[1] + dz];

// Scene 7: approach from the open sea (east, deep water) and pull up ALONGSIDE DK (never through him):
// the last stretch runs parallel to DK at a lateral gap LAT, on the side away from the scene-7 camera,
// and stops with the seat level with DK so he can climb sideways onto its back.
const LAT = 2.6;
const SEAT_BACK = -ENG_SEAT[0] * ENG_SCALE;       // seat is this far behind the body centre (world units)
const A_PTS = [add(SPL, 31, -15), add(SPL, 18, -6), add(SPL, 7.5, LAT), add(SPL, 3.0, LAT), add(SPL, -SEAT_BACK, LAT)];
const PATH_A = makePath(A_PTS);
const A_T0 = SCENE7_START - 0.5;                  // starts just before the scene-7 cut, already moving

// Scene 8: carry DK: loop out to deep water (breach + barrel roll), U-turn, glide in to William's meeting point.
const E1 = A_PTS[A_PTS.length - 1];
const PATH_C = makePath([
    E1, add(SPL, -2.4, 1.75), add(SPL, -1.6, 4.15), add(SPL, 2.0, 5.65), add(SPL, 6.9, 6.05),
    add(SPL, 11.9, 7.15), add(MEET, 16.9, 1.0), add(MEET, 13.4, 3.1), add(MEET, 7.9, 2.2), add(MEET, 3.5, 0.7), MEET
]);
const C_T0 = SCENE8_START, C_T1 = ENG_AT_MEET;
const BR_S0 = PATH_C.nearestS(SPL[0] + 3.4, SPL[1] + 5.8);       // breach: leaves the water ...
const BR_S1 = PATH_C.nearestS(SPL[0] + 10.6, SPL[1] + 6.9);      // ... and dives back in
const BR_H = 3.0;

// Scene 9-10: facing in the shallows (toward the camera side, sword away from DK and Rambi)
const YAW_SHORE = Math.atan2(0.95, 0.3);
const DANCE_OFF = [2.6, -1.1], DANCE_SPOT_T0 = 83.0, DANCE_SPOT_T1 = 85.8;

// Enguarde faces +X. With LIBS.rotateY(yaw), +X maps to (cos yaw, -sin yaw) on the ground.
const yawOf = (dx, dz) => Math.atan2(-dz, dx);

const aDist = (T) => trapezoid(T - A_T0, ENG_ARRIVE - A_T0, PATH_A.len, 0.2, 3.0);
const cDist = (T) => trapezoid(T - C_T0, C_T1 - C_T0, PATH_C.len, 1.4, 2.2);
const BOB_W = 2.6;                                              // surface bob frequency (rad/s), same in every phase
const YAW_ARRIVE = (() => { const p = PATH_A.at(PATH_A.len); return yawOf(p.dx, p.dz); })();
const sin2 = (x) => { const v = Math.sin(Math.PI * clamp(x, 0, 1)); return v * v; };
// height offset along the carry path: a short dive, then the breach (sin^2 profiles: smooth, no kinks)
const carryLift = (s) => -0.55 * sin2((s - (BR_S0 - 3.0)) / 3.4) + BR_H * sin2((s - BR_S0) / (BR_S1 - BR_S0)) * (s > BR_S0 && s < BR_S1 ? 1 : 0);

/** full state of Enguarde at time T (world space) */
export function enguardeState(T) {
    T = Math.min(T, END_T);
    const st = { visible: T >= A_T0, x: 0, y: SURF_Y, z: 0, yaw: 0, pitch: 0, bank: 0, scale: 1,
        roll: 0, flip: null, swim: 0 };
    if (!st.visible) return st;

    if (T < C_T0) {                                             // ---- scene 7: approach + wait
        const s = aDist(T), p = PATH_A.at(s);
        const p2 = PATH_A.at(s + 0.6);
        st.x = p.x; st.z = p.z;
        st.yaw = yawOf(p.dx, p.dz);
        const turn = wrapPi(yawOf(p2.dx, p2.dz) - st.yaw);
        st.bank = clamp(-1.4 * turn, -0.35, 0.35);
        // S: grows as it rises out of the deep and comes toward the camera
        st.scale = lerp(0.62, 1.0, eseg(T, A_T0, ENG_ARRIVE - 1.5));
        // T: submerged (only the dorsal fin cuts the surface), rises to the surface near DK
        st.y = lerp(SEA_Y - 1.15, SURF_Y, eseg(T, ENG_ARRIVE - 4.0, ENG_ARRIVE - 0.8));
        st.pitch = 0.12 * bump(T, ENG_ARRIVE - 4.0, ENG_ARRIVE - 0.8);
        // waiting under DK: nudge the nose up while DK climbs on
        st.pitch += 0.08 * bump(T, ENG_ARRIVE + 0.2, C_T0);
        st.y += 0.05 * Math.sin(BOB_W * T) * seg(T, ENG_ARRIVE - 0.5, ENG_ARRIVE);
        st.swim = s;
        return st;
    }

    if (T < C_T1) {                                             // ---- scene 8: carry DK
        const s = cDist(T), p = PATH_C.at(s), p2 = PATH_C.at(s + 0.8);
        const settle = eseg(T, C_T0, C_T0 + 1.2);               // blend in from the waiting pose (no pop at 68 s)
        st.x = p.x; st.z = p.z;
        st.yaw = lerpAngle(YAW_ARRIVE, yawOf(p.dx, p.dz), settle);
        const turn = wrapPi(yawOf(p2.dx, p2.dz) - yawOf(p.dx, p.dz));
        st.bank = clamp(-1.6 * turn, -0.4, 0.4) * settle;
        // T: surface swim + dive + breach arc (smooth height profile along the path)
        st.y = SURF_Y + 0.05 * Math.sin(BOB_W * T) + carryLift(s);
        // R: the nose follows the trajectory (slope of the height profile)
        st.pitch = 0.9 * Math.atan2(carryLift(s + 0.25) - carryLift(s - 0.25), 0.5);
        if (s > BR_S0 && s < BR_S1) {
            const w = (s - BR_S0) / (BR_S1 - BR_S0);
            st.bank *= 1 - 0.8 * Math.sin(Math.PI * w);
            // A: full barrel roll about the body's own forward axis (an arbitrary world axis)
            st.roll = 2 * Math.PI * ease(seg(w, 0.18, 0.82));
        }
        st.swim = PATH_A.len + s;
        return st;
    }

    // ---- scene 9: slow down in the shallows, turn to face the shore side; scene 10: dance
    const pEnd = PATH_C.at(PATH_C.len);
    // T: once DK has hopped off, back out slowly into deeper water (room to jump, sword clear of Rambi)
    const out = eseg(T, DANCE_SPOT_T0, DANCE_SPOT_T1);
    st.x = MEET[0] + DANCE_OFF[0] * out; st.z = MEET[1] + DANCE_OFF[1] * out;
    const yawArr = yawOf(pEnd.dx, pEnd.dz);
    st.yaw = lerpAngle(yawArr, YAW_SHORE, eseg(T, C_T1 + 0.1, C_T1 + 1.6));
    st.y = SURF_Y + 0.05 * Math.sin(BOB_W * T);
    st.yaw += 0.07 * Math.sin(2.4 * T) * seg(T, C_T1 + 1.6, C_T1 + 2.6);    // R: tail wave sways the body
    st.swim = PATH_A.len + PATH_C.len;

    if (T >= SCENE10_START) {                                   // ---- scene 10: rhythmic jumping
        const t = T - SCENE10_START, P = 2 * BEAT10;            // one jump every 2 beats
        const k = Math.floor(t / P), u = t / P - k;
        const g = eseg(t, 0, 0.6);
        // S: beat pulse
        st.scale = 1 + 0.07 * g * Math.pow(Math.max(0, Math.cos(Math.PI * 2 * t / BEAT10)), 6);
        if (u < 0.15) st.y -= 0.35 * g * Math.sin(Math.PI * u / 0.15);                  // crouch under water
        else if (u < 0.85) {
            const w = (u - 0.15) / 0.7, flipJump = (k % 2 === 1);
            const H = (2.2 + (flipJump ? 0.8 : 0)) * g;
            st.y += H * 4 * w * (1 - w);                                                // T: vertical leap
            if (flipJump) {                                                             // A: somersault / spin
                const dir = k === 3 ? -1 : 1;
                st.flip = { angle: dir * 2 * Math.PI * ease(seg(w, 0.1, 0.9)), kind: k === 5 ? "spin" : "somersault" };
            } else st.pitch = 0.9 * (1 - 2 * w) * Math.sin(Math.PI * w) * g;   // nose up, then down; level at take-off / entry
        } else st.y -= 0.22 * g * Math.sin(Math.PI * (u - 0.85) / 0.15);
        st.yaw += 0.25 * Math.sin(2 * Math.PI * t / (4 * BEAT10)) * g;
    }
    return st;
}

/** Enguarde anchor matrix (scene space). Built with William's LIBS:  S -> R -> T -> A */
export function enguardeMatrix(T, st = enguardeState(T)) {
    const M = LIBS.get_I4();
    const s = ENG_SCALE * st.scale;
    LIBS.scaleX(M, s); LIBS.scaleY(M, s); LIBS.scaleZ(M, s);       // S
    LIBS.rotateX(M, st.bank);                                       // R: bank (roll about own forward axis)
    LIBS.rotateZ(M, st.pitch);                                      // R: pitch (nose up = +)
    LIBS.rotateY(M, st.yaw);                                        // R: heading
    LIBS.set_position(M, st.x, st.y, st.z);                         // T
    const fwd = [Math.cos(st.yaw) * Math.cos(st.pitch), Math.sin(st.pitch), -Math.sin(st.yaw) * Math.cos(st.pitch)];
    const C = [st.x, st.y, st.z];
    if (st.roll) LIBS.rotateArbitrary(M, C, fwd, st.roll);         // A: barrel roll about the forward line
    if (st.flip) {
        const side = [Math.sin(st.yaw), 0, Math.cos(st.yaw)];       // fish's right-hand axis on the ground
        const axis = st.flip.kind === "spin"
            ? [0.35 * side[0], 1, 0.35 * side[2]]                     // spin about a tilted vertical axis
            : [side[0], 0.3, side[2]];                                // somersault about a tilted side axis
        LIBS.rotateArbitrary(M, C, axis, st.flip.angle);            // A
    }
    return M;
}

/* =====================================================================
 * GL: Enguarde's own shader / upload / draw (copied from enguardeku/js/main.js)
 * ===================================================================== */
const VS = `
    attribute vec3 aPos;
    attribute vec3 aNormal;
    attribute vec2 aUV;
    uniform mat4 uModel;
    uniform mat4 uViewProj;
    uniform mat3 uNormalMat;
    varying vec3 vWorld;
    varying vec3 vNormal;
    varying vec3 vLocal;
    varying vec2 vUV;
    void main() {
      vec4 w = uModel * vec4(aPos, 1.0);
      vWorld = w.xyz;
      vNormal = uNormalMat * aNormal;
      vLocal = aPos;
      vUV = aUV;
      gl_Position = uViewProj * w;
    }`;

const FS = `
    precision mediump float;
    varying vec3 vWorld;
    varying vec3 vNormal;
    varying vec3 vLocal;
    varying vec2 vUV;
    uniform vec3 uColor;
    uniform vec3 uBellyColor;
    uniform vec2 uBellyRange;
    uniform float uUseBelly;
    uniform float uStripes;
    uniform float uShininess;
    uniform float uSpecular;
    uniform float uEmissive;
    uniform float uUnlit;
    uniform float uAlpha;
    uniform float uTime;
    uniform vec3 uCamPos;
    uniform vec3 uFogColor;
    uniform vec2 uFog;

    void main() {
      if (uUnlit > 0.5) { gl_FragColor = vec4(uColor, uAlpha); return; }

      vec3 n = normalize(vNormal);
      vec3 V = normalize(uCamPos - vWorld);
      if (dot(n, V) < 0.0) n = -n;

      vec3 base = uColor;
      if (uUseBelly > 0.5)
        base = mix(base, uBellyColor, smoothstep(uBellyRange.y, uBellyRange.x, vLocal.y));
      if (uStripes > 0.0) {
        float s = 0.5 + 0.5 * cos(vUV.y * uStripes * 3.14159);
        base *= 1.0 - 0.18 * smoothstep(0.7, 1.0, s);
      }

      vec3 L1 = normalize(vec3(0.35, 1.0, 0.7));
      vec3 L2 = normalize(vec3(-0.6, -0.4, -0.5));
      float d1 = max((dot(n, L1) + 0.25) / 1.25, 0.0);
      float d2 = max(dot(n, L2), 0.0);
      float spec = pow(max(dot(n, normalize(L1 + V)), 0.0), uShininess) * uSpecular;
      float rim = pow(1.0 - max(dot(n, V), 0.0), 3.0);

      float c = sin(vWorld.x * 2.7 + uTime * 1.3) * sin(vWorld.z * 3.1 - uTime * 1.1)
              + sin((vWorld.x + vWorld.z) * 1.9 + uTime * 0.7);
      float caustic = 0.06 * max(c, 0.0) * max(n.y, 0.0);

      vec3 col = base * (0.30 + 0.78 * d1 + 0.18 * d2 * vec3(0.6, 0.8, 1.0))
               + vec3(spec) + rim * 0.25 * vec3(0.55, 0.85, 1.0) + caustic;
      col = mix(col, uColor, uEmissive);

      float f = smoothstep(uFog.x, uFog.y, distance(uCamPos, vWorld));
      gl_FragColor = vec4(mix(col, uFogColor, f), uAlpha);
    }`;

let gl, prog, attr, uni, fish, anchor;

function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error("Enguarde shader: " + gl.getShaderInfoLog(s));
    return s;
}

function upload(data) {
    const buf = (target, arr) => { const b = gl.createBuffer(); gl.bindBuffer(target, b); gl.bufferData(target, arr, gl.STATIC_DRAW); return b; };
    return {
        pos: buf(gl.ARRAY_BUFFER, new Float32Array(data.positions)),
        normal: buf(gl.ARRAY_BUFFER, new Float32Array(data.normals)),
        uv: buf(gl.ARRAY_BUFFER, new Float32Array(data.uvs)),
        index: buf(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(data.indices)),
        count: data.indices.length,
    };
}

function setMaterial(m) {
    gl.uniform3fv(uni.uColor, m.color);
    gl.uniform1f(uni.uUseBelly, m.belly ? 1 : 0);
    if (m.belly) { gl.uniform3fv(uni.uBellyColor, m.belly.color); gl.uniform2f(uni.uBellyRange, m.belly.y0, m.belly.y1); }
    gl.uniform1f(uni.uStripes, m.stripes || 0);
    gl.uniform1f(uni.uShininess, m.shininess || 32);
    gl.uniform1f(uni.uSpecular, m.specular ?? 0.4);
    gl.uniform1f(uni.uEmissive, m.emissive || 0);
    gl.uniform1f(uni.uUnlit, m.unlit ? 1 : 0);
    gl.uniform1f(uni.uAlpha, 1);
}

function drawMesh(mesh, model, material) {
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.pos);
    gl.vertexAttribPointer(attr.pos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.normal);
    gl.vertexAttribPointer(attr.normal, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.uv);
    gl.vertexAttribPointer(attr.uv, 2, gl.FLOAT, false, 0, 0);
    gl.uniformMatrix4fv(uni.uModel, false, model);
    gl.uniformMatrix3fv(uni.uNormalMat, false, mat4.normalMatrix(model));
    setMaterial(material);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.index);
    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
}

/* =====================================================================
 * PUBLIC API
 * ===================================================================== */
export function initEnguarde(ctx) {
    gl = ctx.GL;
    prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    attr = { pos: gl.getAttribLocation(prog, "aPos"), normal: gl.getAttribLocation(prog, "aNormal"), uv: gl.getAttribLocation(prog, "aUV") };
    uni = {};
    for (const n of ["uModel", "uViewProj", "uNormalMat", "uColor", "uBellyColor", "uBellyRange", "uUseBelly",
        "uStripes", "uShininess", "uSpecular", "uEmissive", "uUnlit", "uAlpha", "uTime", "uCamPos", "uFogColor", "uFog"])
        uni[n] = gl.getUniformLocation(prog, n);

    fish = window.createEnguarde(upload);          // <- Enguarde's original model code
    anchor = new SceneObject(ctx, null, "enguardeAnchor");
    return anchor;
}

export const enguardeAnchor = () => anchor;

let visible = false;
/** pose Enguarde for time T (cinema) or a showcase idle pose (free-orbit mode) */
export function updateEnguarde(T, cinema, idleT) {
    if (!cinema) {                                  // William's free-orbit viewer: Enguarde next to Rambi
        visible = true;
        const M = anchor.MOVE_MATRIX;
        LIBS.set_I4(M);
        LIBS.scaleX(M, ENG_SCALE); LIBS.scaleY(M, ENG_SCALE); LIBS.scaleZ(M, ENG_SCALE);
        LIBS.rotateY(M, 0.5);
        LIBS.set_position(M, 6.5, SEA_Y + 0.35 + 0.08 * Math.sin(1.6 * idleT), -3.5);
        fish.update(idleT, { scale: 1 });
        fish.root.pose = mat4.identity();
        return;
    }
    const st = enguardeState(T);
    visible = st.visible;
    if (!visible) return;
    const M = enguardeMatrix(T, st);
    for (let i = 0; i < 16; i++) anchor.MOVE_MATRIX[i] = M[i];

    // H: Enguarde's own hierarchy (tail chain, fins, jaw, eyes, gills). The internal clock
    // runs faster the further it has swum, so the tail beats harder while travelling,
    // and in scene 10 the fins/tail beat to the music.
    const tc = Math.min(T, END_T);
    const tInternal = tc + 0.42 * st.swim + 0.55 * Math.max(0, tc - SCENE10_START);
    fish.update(tInternal, { scale: 1 });
    fish.root.pose = mat4.identity();               // world placement comes from the anchor
}

/** draw with Enguarde's own shader. frame = { VP, eye, fogColor, time } */
export function drawEnguarde(frame) {
    if (!visible) return;
    gl.useProgram(prog);
    gl.uniformMatrix4fv(uni.uViewProj, false, frame.VP);
    gl.uniform3fv(uni.uCamPos, frame.eye);
    gl.uniform3fv(uni.uFogColor, frame.fogColor);
    gl.uniform2f(uni.uFog, 140, 260);               // William's world has no fog: push it far away
    gl.uniform1f(uni.uTime, frame.time);
    for (let i = 0; i < 8; i++) gl.disableVertexAttribArray(i);
    gl.enableVertexAttribArray(attr.pos); gl.enableVertexAttribArray(attr.normal); gl.enableVertexAttribArray(attr.uv);

    const stack = new window.MatrixStack();          // Enguarde's MatrixStack (push/apply/pop)
    stack.current = new Float32Array(anchor.MODEL_MATRIX);   // base = anchor's world matrix from William's traversal
    fish.root.traverse(stack, (node) => { if (node.mesh) drawMesh(node.mesh, node.worldMatrix, node.material); });
}

/** splash events (time + place) for the FX module, found by sampling the story */
export function enguardeSplashes() {
    const ev = [];
    let prev = null;
    for (let T = A_T0; T <= END_T; T += 0.02) {
        const st = enguardeState(T);
        const above = st.y > SURF_Y + 0.55;
        if (prev !== null && above !== prev)
            ev.push({ t: T, x: st.x, z: st.z, size: above ? 0.9 : 1.1 });
        prev = above;
    }
    return ev;
}
