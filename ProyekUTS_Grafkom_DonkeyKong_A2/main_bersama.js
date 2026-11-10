import { SceneObject } from "./SceneObject.js";
import { createRambiHead } from "../RambiHead.js";
import { createRambiBody } from "../RambiBody.js";
import { createEnvironment, BASE } from "./Environment.js";
import { createCinema } from "./Cinema.js";
import { createAnimation, rambiPose, SCENE6_SPLASH, SCENE9_START, SCENE9_END, SCENE9_MEET, SCENE10_START, SCENE10_END } from "./Animasi.js";

function main() {
    /** @type {HTMLCanvasElement} */
    var CANVAS = document.getElementById("mycanvas");
    CANVAS.width = window.innerWidth;
    CANVAS.height = window.innerHeight;

    /*===================== WEBGL ===================== */
    /** @type {WebGLRenderingContext} */
    var GL;
    try {
        GL = CANVAS.getContext("webgl", { antialias: true });
    } catch (e) { }
    if (!GL) { alert("WebGL context cannot be initialized"); return; }

    /*===================== SHADERS (Gouraud/Lambert sederhana) ===================== */
    var shader_vertex_source = `
        attribute vec3 position;
        attribute vec3 color;
        attribute vec3 normal;
        uniform mat4 Pmatrix, Vmatrix, Mmatrix;
        uniform vec3 uTint;
        varying vec3 vColor;
        varying vec3 vNormal;

        void main(void) {
            gl_Position = Pmatrix * Vmatrix * Mmatrix * vec4(position, 1.);
            vColor = color * uTint;
            vNormal = mat3(Mmatrix) * normal;
        }`;

    var shader_fragment_source = `
        precision mediump float;
        varying vec3 vColor;
        varying vec3 vNormal;
        uniform vec3 uLightDir;
        uniform float uAlpha;
        uniform float uUnlit;

        void main(void) {
            vec3 n = normalize(vNormal);
            float diff = max(dot(n, normalize(uLightDir)), 0.0);
            float amb = 0.38 + 0.10 * n.y;
            vec3 lit = clamp(vColor * (amb + 0.75 * diff), 0.0, 1.0);
            gl_FragColor = vec4(mix(lit, vColor, uUnlit), uAlpha);
        }`;

    var compile_shader = function (source, type, typeString) {
        var shader = GL.createShader(type);
        GL.shaderSource(shader, source);
        GL.compileShader(shader);
        if (!GL.getShaderParameter(shader, GL.COMPILE_STATUS)) {
            alert("ERROR IN " + typeString + " SHADER: " + GL.getShaderInfoLog(shader));
            return false;
        }
        return shader;
    };
    var shader_vertex = compile_shader(shader_vertex_source, GL.VERTEX_SHADER, "VERTEX");
    var shader_fragment = compile_shader(shader_fragment_source, GL.FRAGMENT_SHADER, "FRAGMENT");

    var SHADER_PROGRAM = GL.createProgram();
    GL.attachShader(SHADER_PROGRAM, shader_vertex);
    GL.attachShader(SHADER_PROGRAM, shader_fragment);
    GL.linkProgram(SHADER_PROGRAM);
    GL.useProgram(SHADER_PROGRAM);

    var ctx = {
        GL: GL,
        aPosition: GL.getAttribLocation(SHADER_PROGRAM, "position"),
        aColor: GL.getAttribLocation(SHADER_PROGRAM, "color"),
        aNormal: GL.getAttribLocation(SHADER_PROGRAM, "normal"),
        uM: GL.getUniformLocation(SHADER_PROGRAM, "Mmatrix"),
        uTint: GL.getUniformLocation(SHADER_PROGRAM, "uTint"),
        uAlpha: GL.getUniformLocation(SHADER_PROGRAM, "uAlpha"),
        uUnlit: GL.getUniformLocation(SHADER_PROGRAM, "uUnlit")
    };
    GL.enableVertexAttribArray(ctx.aPosition);
    GL.enableVertexAttribArray(ctx.aColor);
    GL.enableVertexAttribArray(ctx.aNormal);

    var _Pmatrix = GL.getUniformLocation(SHADER_PROGRAM, "Pmatrix");
    var _Vmatrix = GL.getUniformLocation(SHADER_PROGRAM, "Vmatrix");
    GL.uniform3f(GL.getUniformLocation(SHADER_PROGRAM, "uLightDir"), 0.4, 0.7, 0.6);
    GL.uniform1f(ctx.uAlpha, 1.0);

    /*===================== SCENE ===================== */
    var scene = new SceneObject(ctx, null, "scene");

    var body = createRambiBody(ctx);
    var head = createRambiHead(ctx);
    var env = createEnvironment(ctx);
    LIBS.set_position(head.root.POSITION_MATRIX, 0, -0.25, 2.0);     
    body.root.add(head.root);
    LIBS.set_position(body.root.POSITION_MATRIX, 0, 0.5, -0.3);      
    scene.add(body.root);
    scene.add(env.root);

    // satu objek untuk akses part: rambi.parts.legFL, rambi.parts.jawPivot, dst.
    var rambi = { root: body.root, parts: { ...body.parts, ...head.parts } };
    var anim = createAnimation({ rambi: rambi });

    var PROJMATRIX = LIBS.get_projection(40, CANVAS.width / CANVAS.height, 1, 300);
    var VIEWMATRIX = LIBS.get_I4();
    var viewZ = -15;
    LIBS.translateZ(VIEWMATRIX, viewZ);

    // ---- Kamera (durasi shot = batas scene). Saat ini: scene 1 (placeholder) dan scene 2 ----
    var BASE_C = [-46, -4];                                       // pohon pisang (markas)
    var fwd = (p) => [Math.sin(p.h), Math.cos(p.h)];              // arah depan Rambi di bidang xz
    var lft = (p) => [Math.cos(p.h), -Math.sin(p.h)];             // sisi kiri Rambi
    var rambiMid = (T) => { var p = rambiPose(T); return [p.x, -0.2, p.z]; };
    var endPose = rambiPose(15);                                  // tempat Rambi berhenti di akhir scene 2
    var endF = fwd(endPose);
    var endR = lft(endPose);
    // kamera scene 5: heading "tertinggal" 0,4 detik supaya tidak ikut menyentak saat Rambi zigzag
    var lagF = (T) => fwd({ h: rambiPose(T - 0.4).h });
    var lagL = (T) => lft({ h: rambiPose(T - 0.4).h });
    var chase5 = (d, hgt, side) => (T) => {
        var p = rambiPose(T), f = lagF(T), l = lagL(T);
        return [p.x - d * f[0] + side * l[0], hgt, p.z - d * f[1] + side * l[1]];
    };

    // ---- Scene 6: Rambi mengerem, lalu kamera ke laut ----
    var r6 = rambiPose(53);                                       // tempat Rambi berhenti setelah mengerem
    var s6Look = (T) => { var p = rambiPose(T); return [p.x + 2, 1.0, p.z]; };
    var splash = [SCENE6_SPLASH.x, SCENE6_SPLASH.y + 0.8, SCENE6_SPLASH.z];   // titik DK tercebur

    // ---- Scene 9 ----
    var M9 = [SCENE9_MEET.x, SCENE9_MEET.y, SCENE9_MEET.z];       // titik Enguarde + DK tiba
    var R9 = rambiPose(SCENE9_END);                                // tempat Rambi berhenti
    // titik pandang: lebih condong ke Rambi (60%) supaya Rambi jadi fokus, DK + Enguarde tetap masuk frame
    var reveal9 = (T) => { var p = rambiPose(T); return [p.x * 0.6 + M9[0] * 0.4, -0.8, p.z * 0.6 + M9[2] * 0.4]; };
    var seaLook9 = [M9[0] + 2, -1.2, M9[2] + 3];                  // bidikan awal: sedikit menjauh dari Rambi

        // ---- Scene 10: reuni ----
    var C10 = [(R9.x + M9[0]) / 2, 0, (R9.z + M9[2]) / 2];        // pusat kelompok (Rambi + DK + Enguarde)
    var camDir10 = [0.35, -0.94];                                  // arah dari pusat ke kamera: sisi laut
    var eye10 = (d, h) => [C10[0] + camDir10[0] * d, h, C10[2] + camDir10[1] * d];

    var cinema = createCinema([
        // scene 1 (0-8): wide, orbit pelan mengelilingi pohon pisang (Rambi belum tampil)
        { name: "s1-wide-orbit", dur: 8,
          eye0: (T) => [BASE_C[0] + 30 * Math.cos(0.5 + 0.12 * T), 8, BASE_C[1] + 30 * Math.sin(0.5 + 0.12 * T)],
          eye1: (T) => [BASE_C[0] + 30 * Math.cos(0.5 + 0.12 * T), 8, BASE_C[1] + 30 * Math.sin(0.5 + 0.12 * T)],
          tgt0: [BASE_C[0], 4, BASE_C[1]], tgt1: [BASE_C[0], 4, BASE_C[1]], ease: false },

        // scene 2a (8-12): tracking dari belakang Rambi (sedikit di kanan)
        { name: "s2-tracking-belakang", dur: 4,
          eye0: (T) => { var p = rambiPose(T), f = fwd(p), r = lft(p); return [p.x - 8 * f[0] - 1 * r[0], 1.8, p.z - 8 * f[1] - 1 * r[1]]; },
          eye1: (T) => { var p = rambiPose(T), f = fwd(p), r = lft(p); return [p.x - 8 * f[0] - 1 * r[0], 1.8, p.z - 8 * f[1] - 1 * r[1]]; },
          tgt0: (T) => { var p = rambiPose(T), f = fwd(p); return [p.x + 3 * f[0], -0.2, p.z + 3 * f[1]]; },
          tgt1: (T) => { var p = rambiPose(T), f = fwd(p); return [p.x + 3 * f[0], -0.2, p.z + 3 * f[1]]; }, ease: false },

        // scene 2b (12-22): medium dari DEPAN Rambi. Rambi datang, berhenti (detik 15),
        // lalu menoleh ke laut sambil berbicara. Kamera pelan maju.
        { name: "s2-medium-depan", dur: 8,
          eye0: [endPose.x + 8.5 * endF[0], 0.9, endPose.z + 8.5 * endF[1]],
          eye1: [endPose.x + 7.0 * endF[0], 0.9, endPose.z + 7.0 * endF[1]],
          tgt0: rambiMid, tgt1: rambiMid },
        
        // Scene 3 (20-30): medium-samping
        // Rambi berbalik menghadap laut, mengangguk,
        // menggaruk tanah, kemudian mendengus.

        {  name: "s3-medium-kanan", dur: 10,
            eye0: (T) => { var p = rambiPose(T); return [p.x + 5, 5.0, p.z - 13]; },
            eye1: (T) => { var p = rambiPose(T); return [p.x + 4, 4.5, p.z - 10]; },
            tgt0: (T) => { var p = rambiPose(T); return [p.x, 1.0, p.z]; },
            tgt1: (T) => { var p = rambiPose(T); return [p.x, 1.0, p.z]; }
        },

        // Scene 4 (30-40): Rambi + Donkey Kong berlari 2 putaran mengelilingi pohon pisang
        // 4a (30-35): wide, orbit pelan dari atas supaya lintasan melingkar terlihat
        { name: "s4-wide-orbit", dur: 5,
          eye0: (T) => [BASE.x + 28 * Math.cos(1.0 + 0.3 * (T - 30)), 10, BASE.z + 28 * Math.sin(1.0 + 0.3 * (T - 30))],
          eye1: (T) => [BASE.x + 28 * Math.cos(1.0 + 0.3 * (T - 30)), 10, BASE.z + 28 * Math.sin(1.0 + 0.3 * (T - 30))],
          tgt0: (T) => { var p = rambiPose(T); return [p.x, 0.5, p.z]; },
          tgt1: (T) => { var p = rambiPose(T); return [p.x, 0.5, p.z]; }, ease: false },

        // 4b (35-40): chase cam dari belakang-luar tikungan
        { name: "s4-chase", dur: 5,
          eye0: (T) => { var p = rambiPose(T), f = fwd(p), l = lft(p); return [p.x - 7 * f[0] + 3 * l[0], 2.4, p.z - 7 * f[1] + 3 * l[1]]; },
          eye1: (T) => { var p = rambiPose(T), f = fwd(p), l = lft(p); return [p.x - 7 * f[0] + 3 * l[0], 2.4, p.z - 7 * f[1] + 3 * l[1]]; },
          tgt0: (T) => { var p = rambiPose(T), f = fwd(p); return [p.x + 4 * f[0], 0.8, p.z + 4 * f[1]]; },
          tgt1: (T) => { var p = rambiPose(T), f = fwd(p); return [p.x + 4 * f[0], 0.8, p.z + 4 * f[1]]; }, ease: false },

        // Scene 5 (40-50): Rambi kebut kanan-kiri hutan lalu belok ke pesisir.
        // Kamera dari dekat (zoom in) pelan menjauh dan naik (zoom out).
        { name: "s5-zoom-out-chase", dur: 10,
          eye0: chase5(6, 2.2, 2.5),
          eye1: chase5(20, 7.0, 6.0),
          tgt0: (T) => { var p = rambiPose(T), f = lagF(T); return [p.x + 3 * f[0], 0.3, p.z + 3 * f[1]]; },
          tgt1: (T) => { var p = rambiPose(T), f = lagF(T); return [p.x + 3 * f[0], 0.3, p.z + 3 * f[1]]; } },

        // Scene 6a (50-53): Rambi mengerem mendadak (kamera lebih jauh dan sedikit lebih tinggi)
        { name: "s6-rem-mendadak", dur: 3,
          eye0: [r6.x - 7, 3.0, r6.z - 19],
          eye1: [r6.x - 5, 2.8, r6.z - 18],
          tgt0: s6Look, tgt1: s6Look },

        // Scene 6b (53-58): bergeser ke laut dengan pandangan lebar
        { name: "s6-laut-rescue", dur: 5,
          eye0: [r6.x - 5, 2.8, r6.z - 18],
          eye1: [r6.x + 3, 5.5, r6.z - 24],
          tgt0: s6Look,
          tgt1: splash },

        // PLACEHOLDER scene 7-8 (58 sampai SCENE9_START). HAPUS dan ganti dengan shot teman Anda.
        { name: "s7-8-placeholder", dur: SCENE9_START - 58,
          eye0: [splash[0] - 14, 4.5, splash[2] - 24], eye1: [splash[0] - 14, 4.5, splash[2] - 24],
          tgt0: splash, tgt1: splash, ease: false },

        // Scene 9a (3 dtk): dari LAUT, Enguarde membawa DK ke pesisir. Rambi belum masuk frame.
        { name: "s9-enguarde-bawa-dk", dur: 3,
          eye0: [M9[0] + 12, 1.6, M9[2] - 12],
          eye1: [M9[0] + 9, 1.4, M9[2] - 13],
          tgt0: seaLook9, tgt1: seaLook9 },

        // Scene 9b (5 dtk): kamera tetap di sisi laut, bergerak mendekat ke daratan.
        // Rambi mulai terlihat di daratan, kaget, lalu berjalan mendekati DK + Enguarde.
        { name: "s9-mendekat-ke-daratan", dur: 5,
          eye0: [M9[0] + 9, 1.4, M9[2] - 13],
          eye1: [R9.x + 7, 2.4, R9.z - 12],
          tgt0: seaLook9,
          tgt1: reveal9 },

        // Scene 10 (10 dtk): tiga sahabat menari, kamera mulai dari sudut akhir scene 9 lalu pelan zoom out
        { name: "s10-reuni-zoomout", dur: 10,
          eye0: eye10(13.7, 2.4),
          eye1: eye10(36, 9.0),
          tgt0: [C10[0], -0.8, C10[2]],
          tgt1: [C10[0], 0.6, C10[2]] },
    ]);
    var CINEMA = false, cineStart = 0, lastTime = 0;

    /*===================== KONTROL ===================== */
    var THETA = 0.6, PHI = 0.1;
    var drag = false, x_prev, y_prev;
    var FRICTION = 0.05, SPEED = 0.05;
    var dX = 0, dY = 0;

    CANVAS.addEventListener("mousedown", function (e) {
        drag = true; x_prev = e.pageX; y_prev = e.pageY; e.preventDefault();
    });
    var stop = function () { drag = false; };
    CANVAS.addEventListener("mouseup", stop);
    CANVAS.addEventListener("mouseout", stop);
    CANVAS.addEventListener("mousemove", function (e) {
        if (!drag) return;
        dX = (e.pageX - x_prev) * 2 * Math.PI / CANVAS.width;
        dY = (e.pageY - y_prev) * 2 * Math.PI / CANVAS.height;
        THETA += dX; PHI += dY;
        x_prev = e.pageX; y_prev = e.pageY;
        e.preventDefault();
    });
    CANVAS.addEventListener("wheel", function (e) {
        e.preventDefault();
        viewZ = Math.max(-30, Math.min(-4, viewZ - e.deltaY * 0.01));
        LIBS.set_I4(VIEWMATRIX);
        LIBS.translateZ(VIEWMATRIX, viewZ);
    }, { passive: false });
    window.addEventListener("keydown", function (e) {
        if (e.key === 'w') dY -= SPEED;
        else if (e.key === 'a') dX -= SPEED;
        else if (e.key === 's') dY += SPEED;
        else if (e.key === 'd') dX += SPEED;
        else if (e.key === 'c') { CINEMA = !CINEMA; cineStart = lastTime; }   
        else if (e.key === 'r') { cineStart = lastTime; }                      
    });
    window.addEventListener("resize", function () {
        CANVAS.width = window.innerWidth;
        CANVAS.height = window.innerHeight;
        PROJMATRIX = LIBS.get_projection(40, CANVAS.width / CANVAS.height, 1, 300);
    });

    /*===================== DRAW ===================== */
    GL.enable(GL.DEPTH_TEST);
    GL.depthFunc(GL.LEQUAL);
    GL.clearColor(0.53, 0.81, 0.95, 1.0);
    GL.clearDepth(1.0);

    // reset semua MOVE_MATRIX di satu pohon karakter (hanya karakter, bukan environment)
    var resetTree = function (n) {
        LIBS.set_I4(n.MOVE_MATRIX);
        n.childs.forEach(resetTree);
    };

    var animate = function (time) {
        GL.viewport(0, 0, CANVAS.width, CANVAS.height);
        GL.clear(GL.COLOR_BUFFER_BIT | GL.DEPTH_BUFFER_BIT);

        if (!drag) {
            dX *= (1 - FRICTION); dY *= (1 - FRICTION);
            THETA += dX; PHI += dY;
        }

        lastTime = time;
        var T = (time - cineStart) / 1000;            // detik sejak tombol C / R ditekan

        resetTree(rambi.root);                        // semua karakter kembali ke pose diam

        LIBS.set_I4(scene.MOVE_MATRIX);
        if (CINEMA) {
            anim.update(T);                           // semua gerakan adalah fungsi dari T
            var cam = cinema.sample(T);
            VIEWMATRIX = LIBS.lookAt(cam.eye, cam.target, [0, 1, 0]);
            LIBS.set_position(env.sky.POSITION_MATRIX, cam.eye[0], cam.eye[1], cam.eye[2]);
        } else {
            LIBS.rotateY(scene.MOVE_MATRIX, THETA);
            LIBS.rotateX(scene.MOVE_MATRIX, PHI);
            LIBS.set_I4(VIEWMATRIX);
            LIBS.translateZ(VIEWMATRIX, viewZ);
            LIBS.set_position(env.sky.POSITION_MATRIX, 0, 0, 0);
        }

        GL.uniformMatrix4fv(_Pmatrix, false, PROJMATRIX);
        GL.uniformMatrix4fv(_Vmatrix, false, VIEWMATRIX);

        scene.render(LIBS.get_I4());

        // Laut transparan digambar terakhir, setelah semua objek buram
        GL.enable(GL.BLEND);
        GL.blendFunc(GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA);
        GL.depthMask(false);
        GL.uniform1f(ctx.uAlpha, 0.55);
        env.sea.render(env.root.MODEL_MATRIX);
        GL.depthMask(true);
        GL.disable(GL.BLEND);
        GL.uniform1f(ctx.uAlpha, 1.0);

        GL.flush();
        window.requestAnimationFrame(animate);
    };
    animate(0);
}
window.addEventListener('load', main);