// WebGL setup, shaders, camera, UI and the render loop.
(function () {
  "use strict";

  const canvas = document.getElementById("gl");
  const gl = canvas.getContext("webgl", { antialias: true, premultipliedAlpha: true });
  if (!gl) {
    document.body.innerHTML = "<p style='color:#fff;padding:2em'>WebGL is not available in this browser.</p>";
    return;
  }

  // ------------------------------------------------------------------ shaders
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
    uniform vec2 uBellyRange;   // (y fully belly, y fully body) in mesh space
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
    uniform vec2 uFog;          // (near, far)

    void main() {
      if (uUnlit > 0.5) { gl_FragColor = vec4(uColor, uAlpha); return; }

      vec3 n = normalize(vNormal);
      vec3 V = normalize(uCamPos - vWorld);
      if (dot(n, V) < 0.0) n = -n;      // two-sided lighting for thin fins

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

      // soft animated caustics from above
      float c = sin(vWorld.x * 2.7 + uTime * 1.3) * sin(vWorld.z * 3.1 - uTime * 1.1)
              + sin((vWorld.x + vWorld.z) * 1.9 + uTime * 0.7);
      float caustic = 0.06 * max(c, 0.0) * max(n.y, 0.0);

      vec3 col = base * (0.30 + 0.78 * d1 + 0.18 * d2 * vec3(0.6, 0.8, 1.0))
               + vec3(spec) + rim * 0.25 * vec3(0.55, 0.85, 1.0) + caustic;
      col = mix(col, uColor, uEmissive);

      float f = smoothstep(uFog.x, uFog.y, distance(uCamPos, vWorld));
      gl_FragColor = vec4(mix(col, uFogColor, f), uAlpha);
    }`;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);

  const attr = {
    pos: gl.getAttribLocation(prog, "aPos"),
    normal: gl.getAttribLocation(prog, "aNormal"),
    uv: gl.getAttribLocation(prog, "aUV"),
  };
  const uni = {};
  for (const name of ["uModel", "uViewProj", "uNormalMat", "uColor", "uBellyColor", "uBellyRange",
    "uUseBelly", "uStripes", "uShininess", "uSpecular", "uEmissive", "uUnlit", "uAlpha", "uTime",
    "uCamPos", "uFogColor", "uFog"]) {
    uni[name] = gl.getUniformLocation(prog, name);
  }

  // ------------------------------------------------------------------ meshes
  function upload(data) {
    const buf = (target, arr) => {
      const b = gl.createBuffer();
      gl.bindBuffer(target, b);
      gl.bufferData(target, arr, gl.STATIC_DRAW);
      return b;
    };
    return {
      pos: buf(gl.ARRAY_BUFFER, new Float32Array(data.positions)),
      normal: buf(gl.ARRAY_BUFFER, new Float32Array(data.normals)),
      uv: buf(gl.ARRAY_BUFFER, new Float32Array(data.uvs)),
      index: buf(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(data.indices)),
      lines: buf(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(data.lineIndices)),
      count: data.indices.length,
      lineCount: data.lineIndices.length,
    };
  }

  function bindMesh(mesh) {
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.pos);
    gl.vertexAttribPointer(attr.pos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.normal);
    gl.vertexAttribPointer(attr.normal, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.uv);
    gl.vertexAttribPointer(attr.uv, 2, gl.FLOAT, false, 0, 0);
  }
  gl.enableVertexAttribArray(attr.pos);
  gl.enableVertexAttribArray(attr.normal);
  gl.enableVertexAttribArray(attr.uv);

  function setMaterial(m, alpha = 1) {
    gl.uniform3fv(uni.uColor, m.color);
    gl.uniform1f(uni.uUseBelly, m.belly ? 1 : 0);
    if (m.belly) {
      gl.uniform3fv(uni.uBellyColor, m.belly.color);
      gl.uniform2f(uni.uBellyRange, m.belly.y0, m.belly.y1);
    }
    gl.uniform1f(uni.uStripes, m.stripes || 0);
    gl.uniform1f(uni.uShininess, m.shininess || 32);
    gl.uniform1f(uni.uSpecular, m.specular ?? 0.4);
    gl.uniform1f(uni.uEmissive, m.emissive || 0);
    gl.uniform1f(uni.uUnlit, m.unlit ? 1 : 0);
    gl.uniform1f(uni.uAlpha, alpha);
  }

  function drawMesh(mesh, model, material, { wire = false, alpha = 1 } = {}) {
    bindMesh(mesh);
    gl.uniformMatrix4fv(uni.uModel, false, model);
    gl.uniformMatrix3fv(uni.uNormalMat, false, mat4.normalMatrix(model));
    if (wire) {
      setMaterial({ color: [0.85, 0.97, 1.0], unlit: true });
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.lines);
      gl.drawElements(gl.LINES, mesh.lineCount, gl.UNSIGNED_SHORT, 0);
    } else {
      setMaterial(material, alpha);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.index);
      gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
    }
  }

  // ------------------------------------------------------------------ scene
  const fish = createEnguarde(upload);

  // Environment: sandy floor + rocks (ellipsoids), bubbles (spheres).
  const env = new SceneNode("environment");
  const sand = { color: [0.82, 0.74, 0.52], shininess: 8, specular: 0.05 };
  const rock = { color: [0.42, 0.47, 0.5], shininess: 12, specular: 0.1 };
  env.add(new SceneNode("floor", { mesh: upload(Geometry.ellipsoid(18, 0.6, 18, 64, 24)), material: sand, base: mat4.translation(0, -6, 0) }));
  const rockMesh = upload(Geometry.ellipsoid(1, 0.6, 0.8, 24, 16));
  [[-4, -5.5, -3, 1.2], [5, -5.55, -4, 0.9], [-6, -5.6, 3, 0.8], [3.5, -5.6, 4, 0.6]].forEach(([x, y, z, s], i) =>
    env.add(new SceneNode("rock" + i, { mesh: rockMesh, material: rock, base: mat4.mul(mat4.translation(x, y, z), mat4.rotationY(i * 1.3), mat4.scaling(s, s, s)) })));

  const bubbleMesh = upload(Geometry.sphere(1, 16, 12));
  const bubbleMat = { color: [0.8, 0.95, 1.0], shininess: 120, specular: 0.9 };
  const bubbles = [];
  let nextBubble = 0;

  // ------------------------------------------------------------------ camera
  const cam = { yaw: 0.25, pitch: 0.12, dist: 11, target: [0.7, 0, 0] };
  let dragging = false, lastX = 0, lastY = 0;
  canvas.addEventListener("pointerdown", (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener("pointerup", () => (dragging = false));
  canvas.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    cam.yaw -= (e.clientX - lastX) * 0.008;
    cam.pitch = Math.max(-1.4, Math.min(1.4, cam.pitch + (e.clientY - lastY) * 0.008));
    lastX = e.clientX; lastY = e.clientY;
  });
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    cam.dist = Math.max(4, Math.min(40, cam.dist * Math.exp(e.deltaY * 0.001)));
  }, { passive: false });

  // ------------------------------------------------------------------ UI state
  const ui = {
    playing: true,
    speed: 1,
    scale: 1,
    swimPath: false,
    wire: false,
    axes: false,
    floor: true,
    rollStart: null,
  };
  const $ = (id) => document.getElementById(id);
  $("play").onclick = () => { ui.playing = !ui.playing; $("play").textContent = ui.playing ? "Pause" : "Play"; };
  $("roll").onclick = () => (ui.rollStart = animT);
  $("reset").onclick = () => Object.assign(cam, { yaw: 0.25, pitch: 0.12, dist: ui.swimPath ? 20 : 11 });
  $("speed").oninput = (e) => { ui.speed = +e.target.value; $("speedVal").textContent = ui.speed.toFixed(2) + "×"; };
  $("scale").oninput = (e) => { ui.scale = +e.target.value; $("scaleVal").textContent = ui.scale.toFixed(2) + "×"; };
  $("swim").onchange = (e) => { ui.swimPath = e.target.checked; cam.dist = ui.swimPath ? 20 : 11; };
  $("wire").onchange = (e) => (ui.wire = e.target.checked);
  $("axes").onchange = (e) => (ui.axes = e.target.checked);
  $("floor").onchange = (e) => (ui.floor = e.target.checked);
  window.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT") return;
    if (e.key === " ") { e.preventDefault(); $("play").click(); }
    else if (e.key === "r" || e.key === "R") $("roll").click();
    else if (e.key === "w" || e.key === "W") { $("wire").click(); }
    else if (e.key === "a" || e.key === "A") { $("axes").click(); }
    else if (e.key === "s" || e.key === "S") { $("swim").click(); }
  });

  // Line buffer for visualising the arbitrary rotation axes.
  const axisBuf = gl.createBuffer();
  const zeroBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, zeroBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(1024), gl.STATIC_DRAW);

  function drawAxes(lines) {
    if (!lines.length) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, axisBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(lines), gl.DYNAMIC_DRAW);
    gl.vertexAttribPointer(attr.pos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, zeroBuf);
    gl.vertexAttribPointer(attr.normal, 3, gl.FLOAT, false, 0, 0);
    gl.vertexAttribPointer(attr.uv, 2, gl.FLOAT, false, 0, 0);
    gl.uniformMatrix4fv(uni.uModel, false, mat4.identity());
    setMaterial({ color: [1.0, 0.85, 0.2], unlit: true });
    gl.disable(gl.DEPTH_TEST);
    gl.drawArrays(gl.LINES, 0, lines.length / 3);
    gl.enable(gl.DEPTH_TEST);
  }

  // ------------------------------------------------------------------ loop
  const FOG = [0.05, 0.27, 0.42];
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);

  let animT = 0, pathT = 0, lastTime = performance.now();
  const camTarget = cam.target.slice();

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(canvas.clientWidth * dpr), h = Math.floor(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  function frame(now) {
    const dt = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;
    if (ui.playing) {
      animT += dt * ui.speed;
      if (ui.swimPath) pathT += dt * ui.speed;
    }
    resize();

    fish.update(animT, { swimPath: ui.swimPath, scale: ui.scale, rollStart: ui.rollStart, pathPhase: pathT });

    // camera follows the fish (smoothly) when it swims along the path
    const fishPos = mat4.transformPoint(fish.root.pose, [0.7, 0, 0]);
    const goal = ui.swimPath ? fishPos : [0.7 * ui.scale, 0, 0];
    for (let i = 0; i < 3; i++) camTarget[i] += (goal[i] - camTarget[i]) * Math.min(1, dt * 3);
    const eye = [
      camTarget[0] + cam.dist * Math.cos(cam.pitch) * Math.sin(cam.yaw),
      camTarget[1] + cam.dist * Math.sin(cam.pitch),
      camTarget[2] + cam.dist * Math.cos(cam.pitch) * Math.cos(cam.yaw),
    ];
    const view = mat4.lookAt(eye, camTarget, [0, 1, 0]);
    const proj = mat4.perspective(Math.PI / 4, canvas.width / canvas.height, 0.1, 200);
    gl.uniformMatrix4fv(uni.uViewProj, false, mat4.multiply(proj, view));
    gl.uniform3fv(uni.uCamPos, eye);
    gl.uniform3fv(uni.uFogColor, FOG);
    gl.uniform2f(uni.uFog, 14, 60);
    gl.uniform1f(uni.uTime, now / 1000);

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // ---- hierarchical draw: the matrix stack accumulates base*pose
    const stack = new MatrixStack();
    const axisLines = [];
    const visit = (node, pivotFrame) => {
      if (node.mesh) drawMesh(node.mesh, node.worldMatrix, node.material, { wire: ui.wire });
      if (ui.axes && node.debugAxis) {
        const { point, dir } = node.debugAxis;
        const d = vec3.scale(vec3.normalize(dir), 0.9);
        axisLines.push(...mat4.transformPoint(pivotFrame, vec3.sub(point, d)), ...mat4.transformPoint(pivotFrame, vec3.add(point, d)));
      }
    };
    if (ui.floor) env.traverse(stack, visit);
    fish.root.traverse(stack, visit);

    // ---- bubbles: spawned at the mouth, rise (translation) and grow (scaling)
    if (ui.playing && animT > nextBubble) {
      nextBubble = animT + 0.35 + Math.random() * 0.9;
      bubbles.push({ p: fish.mouthWorld(), born: animT, r: 0.05 + Math.random() * 0.06, ph: Math.random() * 6 });
    }
    gl.depthMask(false);
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      const age = animT - b.born;
      if (age > 6 || age < 0) { bubbles.splice(i, 1); continue; }
      const r = b.r * (1 + age * 0.35) * ui.scale;
      const m = mat4.mul(
        mat4.translation(b.p[0] + 0.15 * Math.sin(age * 3 + b.ph), b.p[1] + age * 1.1, b.p[2] + 0.1 * Math.cos(age * 2.3 + b.ph)),
        mat4.scaling(r, r, r)
      );
      drawMesh(bubbleMesh, m, bubbleMat, { wire: ui.wire, alpha: 0.45 * Math.min(1, (6 - age) / 1.5) });
    }
    gl.depthMask(true);

    if (ui.axes) drawAxes(axisLines);
    requestAnimationFrame(frame);
  }
  window.app = { cam, ui, fish, frame }; // handy for debugging from the console
  frame(performance.now()); // draw the first frame immediately
})();
