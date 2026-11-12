"use strict";
/* =====================================================================
 *  renderer.js  -  WebGL 1.0
 *  Satu shader utama (Lambert + specular + rim + noise bulu + fog),
 *  shader langit, bayangan planar (stencil) dan overlay kurva.
 * ===================================================================== */

const VS_MAIN = `
attribute vec3 aPos;
attribute vec3 aNormal;
attribute vec2 aUV;
uniform mat4 uModel;
uniform mat4 uViewProj;
uniform mat3 uNormalMat;
varying vec3 vN;
varying vec3 vW;
varying vec3 vL;
varying vec2 vUV;
void main() {
  vec4 w = uModel * vec4(aPos, 1.0);
  vW = w.xyz;
  vN = uNormalMat * aNormal;
  vL = aPos;
  vUV = aUV;
  gl_Position = uViewProj * w;
}`;

const FS_MAIN = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec3 vN;
varying vec3 vW;
varying vec3 vL;
varying vec2 vUV;
uniform vec3 uColor;
uniform vec3 uLight;
uniform vec3 uCam;
uniform vec3 uFog;
uniform float uUnlit;
uniform float uFur;
uniform float uUseTex;
uniform float uShine;
uniform sampler2D uTex;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float vnoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i + vec3(0.0, 0.0, 0.0)), hash(i + vec3(1.0, 0.0, 0.0)), f.x),
                 mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x),
                 mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}

void main() {
  vec3 col = uColor;
  if (uUseTex > 0.5) col = texture2D(uTex, vUV).rgb;
  if (uUnlit > 0.5) { gl_FragColor = vec4(col, 1.0); return; }

  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;                       // pencahayaan dua sisi

  if (uFur > 0.0) {                                  // tekstur bulu prosedural
    float f = vnoise(vL * 9.0) * 0.6 + vnoise(vL * 23.0) * 0.4;
    col *= 1.0 - uFur * 0.30 + uFur * 0.55 * f;
  }

  vec3 L = normalize(uLight);
  vec3 V = normalize(uCam - vW);
  vec3 H = normalize(L + V);
  float wrap = max((dot(n, L) + 0.35) / 1.35, 0.0);
  vec3 amb = mix(vec3(0.34, 0.30, 0.22), vec3(0.60, 0.72, 0.90), n.y * 0.5 + 0.5) * 0.55;
  float spec = pow(max(dot(n, H), 0.0), 40.0) * uShine;
  float rim = pow(1.0 - max(dot(n, V), 0.0), 3.0) * 0.16;

  vec3 c = col * (amb + vec3(1.0, 0.96, 0.88) * wrap * 0.88) + vec3(spec) + rim * vec3(0.9, 0.95, 1.0);
  float fogF = smoothstep(15.0, 55.0, distance(vW, uCam));
  gl_FragColor = vec4(mix(c, uFog, fogF), 1.0);
}`;

const VS_SKY = `
attribute vec2 aPos;
varying vec2 vNdc;
void main() { vNdc = aPos; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FS_SKY = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vNdc;
uniform mat4 uCamToWorld;
uniform vec2 uTan;
uniform vec3 uSun;
void main() {
  vec3 d = normalize((uCamToWorld * vec4(vNdc.x * uTan.x, vNdc.y * uTan.y, -1.0, 0.0)).xyz);
  float h = clamp(d.y, 0.0, 1.0);
  vec3 col = mix(vec3(0.86, 0.94, 0.90), vec3(0.34, 0.60, 0.92), pow(h, 0.55));
  float s = max(dot(d, uSun), 0.0);
  col += vec3(1.0, 0.93, 0.70) * (pow(s, 700.0) * 1.3 + pow(s, 14.0) * 0.22);
  gl_FragColor = vec4(col, 1.0);
}`;

/** Mesh di GPU */
class Mesh {
  constructor(gl, g) {
    this.gl = gl; this.g = g;
    this.mode = g.lines ? gl.LINES : gl.TRIANGLES;
    this.count = g.idx.length;
    const mk = (target, data) => { const b = gl.createBuffer(); gl.bindBuffer(target, b); gl.bufferData(target, data, gl.STATIC_DRAW); return b; };
    this.bPos = mk(gl.ARRAY_BUFFER, g.pos);
    this.bNor = mk(gl.ARRAY_BUFFER, g.nor);
    this.bUV = mk(gl.ARRAY_BUFFER, g.uv);
    this.bIdx = mk(gl.ELEMENT_ARRAY_BUFFER, g.idx);
    this.bWire = null;
  }
  wire() { // indeks garis (tepi segitiga) untuk mode wireframe
    if (!this.bWire) {
      const gl = this.gl, id = this.g.idx, e = [];
      for (let i = 0; i < id.length; i += 3) e.push(id[i], id[i + 1], id[i + 1], id[i + 2], id[i + 2], id[i]);
      this.bWire = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.bWire);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(e), gl.STATIC_DRAW);
      this.wireCount = e.length;
    }
    return this.bWire;
  }
}

class Renderer {
  constructor(canvas) {
    const opt = { antialias: true, stencil: true, alpha: false };
    const gl = canvas.getContext('webgl', opt) || canvas.getContext('experimental-webgl', opt);
    if (!gl) throw new Error('Browser kamu tidak mendukung WebGL.');
    this.gl = gl; this.canvas = canvas;
    this.stack = new MatrixStack();
    this.pass = 'main';          // 'main' | 'shadow' | 'overlay'
    this.wireMode = false;       // tampilkan wireframe
    this.showCurves = false;     // tampilkan kurva + titik kontrol
    this.light = V3.norm([0.5, 0.85, 0.4]);
    this.fog = [0.86, 0.94, 0.90];

    this.main = this._link(VS_MAIN, FS_MAIN, ['aPos', 'aNormal', 'aUV'],
      ['uModel', 'uViewProj', 'uNormalMat', 'uColor', 'uLight', 'uCam', 'uFog', 'uUnlit', 'uFur', 'uUseTex', 'uShine', 'uTex']);
    this.skyP = this._link(VS_SKY, FS_SKY, ['aPos'], ['uCamToWorld', 'uTan', 'uSun']);
    this.skyBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.skyBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

    // Matriks bayangan planar: memproyeksikan titik ke bidang y=h sepanjang arah cahaya
    const L = this.light, h = 0.035;
    this.shadowMat = new Float32Array([1, 0, 0, 0, -L[0] / L[1], 0, -L[2] / L[1], 0, 0, 0, 1, 0, (L[0] / L[1]) * h, h, (L[2] / L[1]) * h, 1]);
  }

  _link(vs, fs, attribs, uniforms) {
    const gl = this.gl;
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('Shader error: ' + gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    attribs.forEach((a, i) => gl.bindAttribLocation(p, i, a));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Link error: ' + gl.getProgramInfoLog(p));
    p.u = {};
    uniforms.forEach((n) => (p.u[n] = gl.getUniformLocation(p, n)));
    return p;
  }

  createMesh(g) { return new Mesh(this.gl, g); }

  createTexture(canvas) {
    const gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  _attribs(n) { for (let i = 0; i < 3; i++) (i < n ? this.gl.enableVertexAttribArray(i) : this.gl.disableVertexAttribArray(i)); }

  /** awal frame: ukuran canvas, clear, gambar langit, set kamera */
  begin(cam) {
    const gl = this.gl, cv = this.canvas, dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(2, Math.floor(cv.clientWidth * dpr)), h = Math.max(2, Math.floor(cv.clientHeight * dpr));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    gl.viewport(0, 0, w, h);
    gl.clearColor(this.fog[0], this.fog[1], this.fog[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);

    const fovy = (cam.fov * Math.PI) / 180, aspect = w / h;
    const proj = M4.perspective(fovy, aspect, 0.1, 150);
    const view = M4.lookAt(cam.eye, cam.target, [0, 1, 0]);
    const vp = M4.multiply(proj, view);

    // langit (gradasi + matahari) digambar dulu tanpa depth test
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(this.skyP);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.skyBuf);
    this._attribs(1);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.uniformMatrix4fv(this.skyP.u.uCamToWorld, false, M4.invert(view));
    gl.uniform2f(this.skyP.u.uTan, Math.tan(fovy / 2) * aspect, Math.tan(fovy / 2));
    gl.uniform3fv(this.skyP.u.uSun, this.light);
    if (!this.characterOnly) gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.useProgram(this.main);
    this._attribs(3);
    const u = this.main.u;
    gl.uniformMatrix4fv(u.uViewProj, false, vp);
    gl.uniform3fv(u.uLight, this.light);
    gl.uniform3fv(u.uCam, cam.eye);
    gl.uniform3fv(u.uFog, this.fog);
    gl.uniform1i(u.uTex, 0);
    gl.depthFunc(gl.LEQUAL);
    this.stack.reset();
    this.setPass('main');
  }

  setPass(p) {
    const gl = this.gl;
    this.pass = p;
    this.stack.reset();
    gl.disable(gl.STENCIL_TEST); gl.disable(gl.BLEND); gl.disable(gl.POLYGON_OFFSET_FILL);
    if (p === 'main') {
      gl.depthMask(true); gl.enable(gl.DEPTH_TEST);
    } else if (p === 'shadow') {
      // bayangan transparan; stencil memastikan tiap piksel hanya digelapkan sekali
      gl.depthMask(false); gl.enable(gl.DEPTH_TEST);
      gl.enable(gl.STENCIL_TEST); gl.stencilFunc(gl.EQUAL, 0, 0xff); gl.stencilOp(gl.KEEP, gl.KEEP, gl.INCR);
      gl.enable(gl.BLEND); gl.blendColor(0, 0, 0, 0.33); gl.blendFunc(gl.CONSTANT_ALPHA, gl.ONE_MINUS_CONSTANT_ALPHA);
      gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(-2, -2);
    } else { // overlay
      gl.depthMask(false); gl.disable(gl.DEPTH_TEST);
    }
  }

  /** render satu frame penuh */
  render(scene, cam) {
    this.begin(cam);
    scene.draw(this);                       // 1. objek
    if (!this.characterOnly) {
      this.setPass('shadow'); scene.draw(this); // 2. bayangan
      if (this.showCurves || scene.axis) { this.setPass('overlay'); scene.draw(this); } // 3. kurva / sumbu rotasi
    }
    this.setPass('main');
  }

  _bind(mesh) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.bPos); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.bNor); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.bUV); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 0, 0);
  }

  _draw(mesh, M, color, o = {}) {
    const gl = this.gl, u = this.main.u;
    this._bind(mesh);
    gl.uniformMatrix4fv(u.uModel, false, this.pass === 'shadow' ? M4.multiply(this.shadowMat, M) : M);
    gl.uniformMatrix3fv(u.uNormalMat, false, M4.normalMatrix(M));
    const unlit = o.unlit || this.pass !== 'main' || (this.wireMode && !mesh.g.lines);
    gl.uniform1f(u.uUnlit, unlit ? 1 : 0);
    gl.uniform3fv(u.uColor, this.pass === 'shadow' ? [0, 0, 0] : color);
    gl.uniform1f(u.uFur, o.fur || 0);
    gl.uniform1f(u.uShine, o.shine === undefined ? 0.1 : o.shine);
    if (o.tex && !this.wireMode && this.pass === 'main') { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, o.tex); gl.uniform1f(u.uUseTex, 1); }
    else gl.uniform1f(u.uUseTex, 0);
    if (this.wireMode && !mesh.g.lines && this.pass === 'main') {
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.wire());
      gl.drawElements(gl.LINES, mesh.wireCount, gl.UNSIGNED_SHORT, 0);
    } else {
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.bIdx);
      gl.drawElements(mesh.mode, mesh.count, gl.UNSIGNED_SHORT, 0);
    }
  }

  /** dipanggil BodyPart.draw untuk tiap bentuk */
  drawShape(s) {
    if (this.pass === 'shadow' && !s.castShadow) return;
    this._draw(s.mesh, M4.multiply(this.stack.top, s.matrix), s.color, { fur: s.fur, tex: s.tex, shine: s.shine });
  }

  /** overlay kurva: sampel kurva (kuning), poligon kontrol (putih), titik kontrol (merah) */
  drawCurves(part) {
    for (const c of part.curves) {
      this._draw(c.poly, this.stack.top, [1, 1, 1], { unlit: true });
      for (const p of c.samples) this._draw(MESH.sphere, M4.multiply(this.stack.top, M4.compose(p, [0, 0, 0], [0.022, 0.022, 0.022])), [1, 0.85, 0.1], { unlit: true });
      for (const p of c.curve.p) this._draw(MESH.sphere, M4.multiply(this.stack.top, M4.compose(p, [0, 0, 0], [0.045, 0.045, 0.045])), [0.95, 0.15, 0.1], { unlit: true });
    }
  }

  /** garis sumbu rotasi (silinder tipis yang diputar agar sejajar sumbu -> contoh rotasi sumbu bebas) */
  drawAxis(ax) {
    const a = V3.norm(ax.dir), len = ax.to - ax.from, mid = V3.add(ax.p, V3.scale(a, (ax.from + ax.to) / 2));
    const k = V3.cross([0, 1, 0], a);
    const R = V3.len(k) < 1e-6 ? M4.identity() : M4.rotateAxis(k, Math.acos(clamp(a[1], -1, 1)));
    const M = M4.multiply(M4.translate(mid[0], mid[1], mid[2]), M4.multiply(R, M4.scale(0.03, len, 0.03)));
    this._draw(MESH.cylinder, M, ax.color || [1, 0.85, 0.1], { unlit: true });
  }
}
