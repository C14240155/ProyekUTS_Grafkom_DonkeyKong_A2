import { SceneObject } from "./SceneObject.js";
import { createRambiHead } from "./RambiHead.js";
import { createRambiBody } from "./RambiBody.js";

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

    /*===================== SCENE (hanya karakter) ===================== */
    var scene = new SceneObject(ctx, null, "scene");

    var body = createRambiBody(ctx);
    var head = createRambiHead(ctx);
    LIBS.set_position(head.root.POSITION_MATRIX, 0, -0.25, 2.0);     
    body.root.add(head.root);
    LIBS.set_position(body.root.POSITION_MATRIX, 0, 0.5, -0.3);      
    scene.add(body.root);

    // satu objek untuk akses part: rambi.parts.legFL, rambi.parts.jawPivot, dst.
    var rambi = { root: body.root, parts: { ...body.parts, ...head.parts } };

    var PROJMATRIX = LIBS.get_projection(40, CANVAS.width / CANVAS.height, 1, 100);
    var VIEWMATRIX = LIBS.get_I4();
    var viewZ = -15;
    LIBS.translateZ(VIEWMATRIX, viewZ);

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
        var k = e.key.toLowerCase();
        if (k === 'w') dY -= SPEED;
        else if (k === 'a') dX -= SPEED;
        else if (k === 's') dY += SPEED;
        else if (k === 'd') dX += SPEED;
    });
    window.addEventListener("resize", function () {
        CANVAS.width = window.innerWidth;
        CANVAS.height = window.innerHeight;
        PROJMATRIX = LIBS.get_projection(40, CANVAS.width / CANVAS.height, 1, 100);
    });

    /*===================== DRAW ===================== */
    GL.enable(GL.DEPTH_TEST);
    GL.depthFunc(GL.LEQUAL);
    GL.clearColor(0.0, 0.0, 0.0, 1.0);      // latar hitam
    GL.clearDepth(1.0);

    var animate = function (time) {
        GL.viewport(0, 0, CANVAS.width, CANVAS.height);
        GL.clear(GL.COLOR_BUFFER_BIT | GL.DEPTH_BUFFER_BIT);

        if (!drag) {
            dX *= (1 - FRICTION); dY *= (1 - FRICTION);
            THETA += dX; PHI += dY;
        }

        LIBS.set_I4(scene.MOVE_MATRIX);
        LIBS.rotateY(scene.MOVE_MATRIX, THETA);
        LIBS.rotateX(scene.MOVE_MATRIX, PHI);

        // Tidak ada animasi: semua MOVE_MATRIX part tetap identity (pose diam).

        GL.uniformMatrix4fv(_Pmatrix, false, PROJMATRIX);
        GL.uniformMatrix4fv(_Vmatrix, false, VIEWMATRIX);

        scene.render(LIBS.get_I4());

        GL.flush();
        window.requestAnimationFrame(animate);
    };
    animate(0);
}
window.addEventListener('load', main);