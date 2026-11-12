"use strict";
/* main.js - titik masuk: membuat renderer, scene, animator, kamera orbit, dan UI */
(function () {
  const canvas = document.getElementById('gl');
  const infoEl = document.getElementById('info');
  const errEl = document.getElementById('error');
  const showError = (e) => { errEl.hidden = false; errEl.textContent = 'Terjadi kesalahan: ' + (e && e.message ? e.message : e); console.error(e); };

  let renderer, scene, anim;
  try {
    renderer = new Renderer(canvas);
    renderer.characterOnly = true;
    renderer.fog = [0.125, 0.141, 0.169];
    initMeshes(renderer);
    scene = new Scene({ characterOnly: true });
    anim = new Animator(scene);
  } catch (e) { showError(e); return; }

  /* ---------- kamera orbit (drag = putar, scroll = zoom) ---------- */
  const cam = { yaw: 0.5, pitch: 0.2, dist: 11.5, fov: 45, target: [0, 1.7, 0], eye: [0, 0, 0] };
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    cam.yaw -= (e.clientX - drag.x) * 0.006;
    cam.pitch = clamp(cam.pitch + (e.clientY - drag.y) * 0.004, -0.05, 1.25);
    drag.x = e.clientX; drag.y = e.clientY;
  });
  const endDrag = () => { drag = null; };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); cam.dist = clamp(cam.dist * Math.exp(e.deltaY * 0.001), 5, 30); }, { passive: false });

  function updateCamera(dt) {
    const dk = scene.dk, k = 1 - Math.exp(-dt * 3);              // kamera mengikuti DK dengan halus
    const want = [dk.position[0] * 0.7, 1.7, dk.position[2] * 0.7];
    cam.target = V3.lerp(cam.target, want, k);
    const cp = Math.cos(cam.pitch);
    cam.eye = [cam.target[0] + cam.dist * Math.sin(cam.yaw) * cp, cam.target[1] + cam.dist * Math.sin(cam.pitch), cam.target[2] + cam.dist * Math.cos(cam.yaw) * cp];
  }

  /* ---------- UI ---------- */
  const buttons = [...document.querySelectorAll('[data-demo]')];
  let playingAll = false;
  const run = (id) => { if (id === 'all') { playingAll = true; anim.playAll(); } else { playingAll = false; anim.play(id); } };
  buttons.forEach((b) => b.addEventListener('click', () => run(b.dataset.demo)));
  anim.onChange = (id) => {
    if (!id) playingAll = false;
    buttons.forEach((b) => b.classList.toggle('active', (id && b.dataset.demo === id) || (playingAll && b.dataset.demo === 'all')));
  };
  document.getElementById('chkCurves').addEventListener('change', (e) => { renderer.showCurves = e.target.checked; });
  document.getElementById('chkWire').addEventListener('change', (e) => { renderer.wireMode = e.target.checked; });
  window.addEventListener('keydown', (e) => {
    const ids = { 1: 'translate', 2: 'rotate', 3: 'scale', 4: 'axis', 5: 'hier', 0: 'all' };
    if (ids[e.key]) run(ids[e.key]); else if (e.key === 'Escape') anim.stop();
  });

  const idleText = 'Pilih demo transformasi di panel, atau seret mouse untuk memutar kamera.';
  let lastInfo = null;

  /* ---------- loop ---------- */
  let last = performance.now(), failed = false;
  function frame(now) {
    if (failed) return;
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    try {
      anim.update(dt);
      updateCamera(dt);
      renderer.render(scene, cam);
      const text = anim.info || idleText;
      if (text !== lastInfo) { infoEl.textContent = text; lastInfo = text; }
    } catch (e) { failed = true; showError(e); return; }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
