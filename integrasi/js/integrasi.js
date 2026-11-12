// integrasi.js : plugs DK (Ber) and Enguarde into William's running program WITHOUT editing it.
//
// William's main_bersama.js stays the master script: it creates the GL context, the shader,
// the scene graph (Rambi + environment), the 96-second timeline, the camera shots and the
// render loop. This module only:
//
//   1. CLOCK TAP  : wraps requestAnimationFrame so we see the exact `time` William's animate()
//                   receives, and mirrors his 'c' (cinema) / 'r' (restart) keys. So our T is
//                   always identical to his  T = (time - cineStart) / 1000.
//   2. RENDER HOOK: wraps SceneObject.prototype.render. When William calls scene.render(), we
//                   (a) pose DK + Enguarde for T and re-parent their anchor nodes inside his graph,
//                   (b) let his original render() run (it also computes the anchors' MODEL_MATRIX),
//                   (c) draw DK and Enguarde with their own shaders using his P/V matrices,
//                   (d) restore his GL state. His transparent sea is drawn after this, as before.
//   3. Scenes 7-8 : William left a placeholder camera shot there; we override the view matrix
//                   only inside that slot (see camera78.js).
//
// Extra keys (William's w/a/s/d, c, r and mouse still work exactly as before):
//   1..9, 0 = jump to scene 1..10   Space = pause   <- / -> = -/+ 2 s   H = hide HUD
// URL options: ?t=53 (start the film at T=53)  &pause

import { SceneObject } from "../../ProyekUTS_Grafkom_DonkeyKong_A2/SceneObject.js";
import { initShadowRambi, sceneAt, SCENES, END_T, clamp } from "./timeline.js";
import { initDK, updateDK, drawDK, dkParentName } from "./dk_bridge.js";
import { initEnguarde, updateEnguarde, drawEnguarde } from "./enguarde_bridge.js";
import { cameraOverride } from "./camera78.js";

const params = new URLSearchParams(location.search);
const HORIZON = [0.86, 0.93, 0.98];              // William's sky colour at the horizon (used as fog colour)
// debug: &eye=x,y,z&look=x,y,z forces a camera (for inspecting paths); &shot freezes a frame into an <img>
const vec = (k) => params.has(k) ? params.get(k).split(",").map(Number) : null;
const DEBUG_CAM = vec("eye") && vec("look") ? { eye: vec("eye"), target: vec("look"), shot: "debug" } : null;

/* =====================================================================
 * 1. CLOCK TAP
 * ===================================================================== */
const clock = { offset: 0, paused: false, frozen: 0, lastReal: 0, lastVirt: 0, cinema: false, cineStart: 0, frames: 0 };
const realRAF = window.requestAnimationFrame.bind(window);
window.requestAnimationFrame = (cb) => realRAF((t) => {
    clock.lastReal = t;
    const v = clock.paused ? clock.frozen : t + clock.offset;
    clock.lastVirt = v;
    cb(v);                                         // William's animate(time)
    afterFrame();
});
const filmT = () => (clock.lastVirt - clock.cineStart) / 1000;

function pressKey(key) { window.dispatchEvent(new KeyboardEvent("keydown", { key })); }

function seekTo(Ts) {
    Ts = clamp(Ts, 0, END_T);
    if (!clock.cinema) pressKey("c");              // William's own cinema toggle
    const target = clock.cineStart + Ts * 1000;
    if (clock.paused) clock.frozen = target; else clock.offset = target - clock.lastReal;
}
function togglePause() {
    if (!clock.paused) { clock.frozen = clock.lastVirt; clock.paused = true; }
    else { clock.offset = clock.frozen - clock.lastReal; clock.paused = false; }
}

// registered before William's main() runs, so it sees every key first (same lastTime value)
window.addEventListener("keydown", (e) => {
    if (e.key === "c") { clock.cinema = !clock.cinema; clock.cineStart = clock.lastVirt; }   // mirror William
    else if (e.key === "r") { clock.cineStart = clock.lastVirt; }                            // mirror William
    else if (e.key === " ") { e.preventDefault(); togglePause(); }
    else if (/^[0-9]$/.test(e.key)) { const n = e.key === "0" ? 10 : +e.key; seekTo(SCENES[n - 1].t0); }
    else if (e.key === "ArrowRight") seekTo(filmT() + 2);
    else if (e.key === "ArrowLeft") seekTo(filmT() - 2);
    else if (e.key === "h" || e.key === "H") hud.hidden = !hud.hidden;
});

/* =====================================================================
 * 2. RENDER HOOK
 * ===================================================================== */
let S = null;                                      // integration state (created on the first frame)
let failed = null;
const originalRender = SceneObject.prototype.render;

function setup(scene) {
    const ctx = scene.ctx, GL = ctx.GL;
    const prog = GL.getParameter(GL.CURRENT_PROGRAM);           // William's shader program
    const rambi = scene.childs.find(c => c.name === "body");   // Rambi's root node (RambiBody.js)
    const env = scene.childs.find(c => c.name === "environment");

    initShadowRambi(ctx, rambi);
    const engAnchor = initEnguarde(ctx);
    scene.add(engAnchor);
    initDK(ctx, GL.canvas);                                     // DK's anchor is parented on demand

    GL.useProgram(prog);
    return {
        ctx, GL, prog, rambi, sky: env.find("sky"), engAnchor,
        uP: GL.getUniformLocation(prog, "Pmatrix"),
        uV: GL.getUniformLocation(prog, "Vmatrix"),
        refs: { scene, rambi, enguarde: engAnchor },
        realStart: performance.now(),
    };
}

function restoreWilliamState(S) {
    const { GL, ctx, prog } = S;
    GL.useProgram(prog);
    for (let i = 0; i < 8; i++) GL.disableVertexAttribArray(i);
    GL.enableVertexAttribArray(ctx.aPosition);
    GL.enableVertexAttribArray(ctx.aColor);
    GL.enableVertexAttribArray(ctx.aNormal);
}

// camera position from a rigid view matrix: eye = -R^T t
function eyeFromView(V) {
    return [-(V[0] * V[12] + V[1] * V[13] + V[2] * V[14]),
            -(V[4] * V[12] + V[5] * V[13] + V[6] * V[14]),
            -(V[8] * V[12] + V[9] * V[13] + V[10] * V[14])];
}

SceneObject.prototype.render = function (PARENT_MATRIX) {
    const isRoot = this.name === "scene" && this.childs.some(c => c.name === "body");
    if (!isRoot || failed) return originalRender.call(this, PARENT_MATRIX);

    try {
        if (!S) S = setup(this);
        const T = filmT(), cinema = clock.cinema;
        const idleT = (performance.now() - S.realStart) / 1000;

        // (a) pose + parent our characters for this T (anchors live inside William's graph)
        updateEnguarde(T, cinema, idleT);
        updateDK(T, cinema, idleT, S.refs);

        // scenes 7-8: replace William's placeholder camera shot
        S.camShot = null;
        if (cinema) {
            const cam = DEBUG_CAM || cameraOverride(T);
        if (T >= 58 && T < 78) {
            console.log("CAMERA DEBUG:", {
                time: T,
                shot: cam ? cam.shot : "NULL",
                eye: cam ? cam.eye : null,
                target: cam ? cam.target : null
            });
        }
        if (cam) {
                const cameraMatrix = LIBS.lookAt(cam.eye, cam.target, [0, 1, 0]);

                S.GL.uniformMatrix4fv(S.uV, false, cameraMatrix);

                LIBS.set_position(
                    S.sky.POSITION_MATRIX,
                    cam.eye[0],
                    cam.eye[1],
                    cam.eye[2]
                );

                S.camShot = cam.shot;

                console.log("VIEW MATRIX BEFORE RENDER:", {
                    time: T,
                    shot: cam.shot,
                    matrix: Array.from(S.GL.getUniform(S.prog, S.uV))
                });
            }
        }
    } catch (e) { fail(e); return originalRender.call(this, PARENT_MATRIX); }

    // (b) William's own render (Rambi, environment, our anchors + splash FX)
    originalRender.call(this, PARENT_MATRIX);

    if (filmT() >= 58 && filmT() < 78) {
    const V = S.GL.getUniform(S.prog, S.uV);

    console.log("VIEW MATRIX AFTER RENDER:", {
        time: filmT(),
        matrix: Array.from(V)
    });
}

    // (c) DK + Enguarde with their own shaders, using William's projection + view
    try {
        const GL = S.GL;
        const P = GL.getUniform(S.prog, S.uP), V = GL.getUniform(S.prog, S.uV);
        const frame = { VP: new Float32Array(LIBS.mul4(P, V)), eye: eyeFromView(V), fogColor: HORIZON, time: filmT() };
        drawEnguarde(frame);
        drawDK(frame);
    } catch (e) { fail(e); }
    // (d) hand the GL state back exactly as William's loop expects it (his sea is drawn next)
    restoreWilliamState(S);
};

function fail(e) {
    failed = e;
    console.error("[integrasi]", e);
    hud.hidden = false;
    hud.innerHTML = `<b style="color:#ff8080">Integration error:</b> ${String(e && e.message || e)}`;
}

/* =====================================================================
 * HUD + URL options
 * ===================================================================== */
const hud = document.createElement("div");
hud.id = "hud";
document.addEventListener("DOMContentLoaded", () => document.body.appendChild(hud));
let lastHud = "", shotDone = false;
window.addEventListener("error", (e) => fail(e.error || e.message));

function afterFrame() {
    clock.frames++;
    if (clock.frames === 2) {                      // William's listeners exist now
        if (params.has("pause")) togglePause();
        if (params.has("t")) seekTo(parseFloat(params.get("t")) || 0);
    }
    if (params.has("shot") && !shotDone && performance.now() > 2500 && clock.frames > 10) {   // debug still: copy the canvas while its buffer is valid
        shotDone = true;
        const glc = document.getElementById("mycanvas"), c2 = document.createElement("canvas");
        c2.width = glc.width; c2.height = glc.height;
        const g2 = c2.getContext("2d");
        g2.fillStyle = "#fff"; g2.fillRect(0, 0, c2.width, c2.height);   // composite like the page does
        g2.drawImage(glc, 0, 0);
        const img = document.createElement("img");
        img.src = c2.toDataURL("image/png");
        img.style.cssText = "position:fixed;inset:0;width:100%;height:100%;z-index:5";
        document.body.appendChild(img);
    }
    if (failed || hud.hidden || !S) return;
    let html;
    if (!clock.cinema) {
        html = `<b>Free view</b> (William's orbit viewer) &nbsp;·&nbsp; press <kbd>C</kbd> to play the film`;
    } else {
        const T = filmT(), sc = sceneAt(T);
        const cam = S.camShot ? `teammate shot: ${S.camShot}` : "William's camera";
        html = `<b>T ${Math.min(T, END_T).toFixed(1)} s</b>${clock.paused ? " ⏸" : ""} &nbsp;·&nbsp; Scene ${sc.n}/10 — ${sc.name}`
            + `<br><span class="dim">DK parent: ${dkParentName()} &nbsp;·&nbsp; ${cam}</span>`;
    }
    html += `<br><span class="dim"><kbd>C</kbd> film/free &nbsp;<kbd>R</kbd> restart &nbsp;<kbd>1</kbd>–<kbd>0</kbd> scene &nbsp;<kbd>Space</kbd> pause &nbsp;<kbd>←</kbd><kbd>→</kbd> ±2 s &nbsp;<kbd>H</kbd> hide</span>`;
    if (html !== lastHud) { hud.innerHTML = html; lastHud = html; }
}
