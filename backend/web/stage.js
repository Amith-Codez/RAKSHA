// The live agent constellation. Every node is a real agent; every beam is a real hand-off from the trace.
import * as THREE from "./vendor/three.module.min.js";

export const AGENTS = [
  { id: "extractor", name: "Extractor", color: "#9C8BFF" },
  { id: "router", name: "Router", color: "#C9BEFF" },
  { id: "registry", name: "Registry", color: "#B26BFF" },
  { id: "web", name: "Web & contact", color: "#4FB3FF" },
  { id: "pattern", name: "Scam-pattern", color: "#FFB224" },
  { id: "link", name: "Link", color: "#4DABF7" },
  { id: "community", name: "Community memory", color: "#F783AC" },
  { id: "prosecutor", name: "Prosecutor", color: "#E11D48" },
  { id: "defender", name: "Defender", color: "#10B981" },
  { id: "arbiter", name: "Arbiter", color: "#FFFFFF" },
];
const CORE_IDS = new Set(["orchestrator", "blackboard", "user"]);
const MOOD = { FRAUD: "#E11D48", SUSPICIOUS: "#FFB224", LIKELY_SAFE: "#10B981", IDLE: "#6B4DFF" };
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.25, "rgba(255,255,255,.55)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

export function createStage(container, labelsEl) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch (e) {
    container.insertAdjacentHTML("beforeend", '<div class="fallback"><span></span></div>');
    const noop = () => {};
    return { activate: noop, beam: noop, setMood: noop, reset: noop, moveTo: (el) => el.appendChild(container) };
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 1.4, 9.2);
  camera.lookAt(0, 0, 0);
  const world = new THREE.Group();
  scene.add(world);
  const tex = glowTexture();

  // core = the shared blackboard every agent writes to
  const core = new THREE.Group();
  world.add(core);
  const coreMat = new THREE.MeshBasicMaterial({ color: MOOD.IDLE, wireframe: true, transparent: true, opacity: 0.55 });
  const coreMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1.05, 1), coreMat);
  core.add(coreMesh);
  const innerMat = new THREE.MeshBasicMaterial({ color: MOOD.IDLE, transparent: true, opacity: 0.22 });
  core.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.72, 2), innerMat));
  const coreGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: MOOD.IDLE, transparent: true, opacity: 0.9,
                                                               depthWrite: false, blending: THREE.AdditiveBlending }));
  coreGlow.scale.set(4.2, 4.2, 1);
  core.add(coreGlow);

  // particle halo
  const N = 700, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const r = 1.6 + Math.random() * 3.4, t = Math.random() * Math.PI * 2, p = Math.acos(2 * Math.random() - 1);
    pos[i * 3] = r * Math.sin(p) * Math.cos(t); pos[i * 3 + 1] = r * Math.cos(p) * 0.55; pos[i * 3 + 2] = r * Math.sin(p) * Math.sin(t);
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ size: 0.035, color: "#B9AEFF", transparent: true, opacity: 0.55 }));
  world.add(dust);

  // orbit ring + agent nodes
  const ring = new THREE.Group();
  ring.rotation.x = 0.36;
  world.add(ring);
  const R = 3.3;
  const ringLine = new THREE.Mesh(new THREE.TorusGeometry(R, 0.008, 8, 160),
                                  new THREE.MeshBasicMaterial({ color: "#8C7BFF", transparent: true, opacity: 0.35 }));
  ringLine.rotation.x = Math.PI / 2;
  ring.add(ringLine);
  const nodes = {};
  AGENTS.forEach((a, i) => {
    const ang = (i / AGENTS.length) * Math.PI * 2;
    const g = new THREE.Group();
    g.position.set(Math.cos(ang) * R, 0, Math.sin(ang) * R);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.17, 24, 24), new THREE.MeshBasicMaterial({ color: a.color }));
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: a.color, transparent: true, opacity: 0.55,
                                                             depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.set(1.1, 1.1, 1);
    g.add(ball, glow);
    ring.add(g);
    const label = document.createElement("div");
    label.className = "node-label";
    label.textContent = a.name;
    labelsEl.appendChild(label);
    nodes[a.id] = { group: g, ball, glow, label, heat: 0, color: new THREE.Color(a.color) };
  });

  const beams = [];
  const bursts = [];
  const moodColor = new THREE.Color(MOOD.IDLE), moodTarget = new THREE.Color(MOOD.IDLE);
  let coreHeat = 0;

  function worldPos(id) {
    const v = new THREE.Vector3();
    if (!id || CORE_IDS.has(id) || !nodes[id]) return v.set(0, 0, 0);
    return nodes[id].group.getWorldPosition(v);
  }

  function activate(id) {
    if (nodes[id]) {
      nodes[id].heat = 1;
    } else if (CORE_IDS.has(id)) coreHeat = 1;
  }

  function beam(from, to) {
    if (from === to) return activate(from);
    const a = worldPos(from), b = worldPos(to);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    mid.y += 1.2 + a.distanceTo(b) * 0.12;
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    const pts = curve.getPoints(48);
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const col = nodes[from]?.color || new THREE.Color("#C9BEFF");
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.9,
                                                                  blending: THREE.AdditiveBlending }));
    geo.setDrawRange(0, 0);
    const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: col, transparent: true, depthWrite: false,
                                                             blending: THREE.AdditiveBlending }));
    head.scale.set(0.7, 0.7, 1);
    world.add(line, head);
    beams.push({ line, head, curve, t: 0, to });
    activate(from);
  }

  function setMood(label) {
    moodTarget.set(MOOD[label] || MOOD.IDLE);
    coreHeat = 1.4;
    const burst = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.18, 64),
                                 new THREE.MeshBasicMaterial({ color: moodTarget, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
    burst.lookAt(camera.position);
    world.add(burst);
    bursts.push({ mesh: burst, t: 0 });
  }

  function reset() {
    moodTarget.set(MOOD.IDLE);
    beams.splice(0).forEach((b) => { world.remove(b.line, b.head); b.line.geometry.dispose(); });
  }

  // interaction: drag to spin, gentle parallax
  let dragging = false, lastX = 0, spin = 0.0016, yaw = 0, tiltTarget = 0, tilt = 0;
  const el = renderer.domElement;
  el.addEventListener("pointerdown", (e) => { dragging = true; lastX = e.clientX; el.setPointerCapture(e.pointerId); });
  el.addEventListener("pointerup", () => { dragging = false; });
  el.addEventListener("pointermove", (e) => {
    const r = el.getBoundingClientRect();
    tiltTarget = ((e.clientY - r.top) / r.height - 0.5) * 0.35;
    if (dragging) { yaw += (e.clientX - lastX) * 0.008; lastX = e.clientX; }
  });

  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.position.z = w < 520 ? 11.5 : 9.2;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container);
  resize();

  const tmp = new THREE.Vector3();
  const clock = new THREE.Clock();
  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    if (!dragging && !reduced) yaw += spin;
    tilt += (tiltTarget - tilt) * 0.05;
    world.rotation.y = yaw;
    world.rotation.x = tilt;
    coreMesh.rotation.y += reduced ? 0 : 0.004;
    coreMesh.rotation.x += reduced ? 0 : 0.002;
    dust.rotation.y -= reduced ? 0 : 0.0007;

    moodColor.lerp(moodTarget, 0.04);
    coreMat.color.copy(moodColor); innerMat.color.copy(moodColor); coreGlow.material.color.copy(moodColor);
    coreHeat = Math.max(0, coreHeat - dt * 1.2);
    const cs = 1 + coreHeat * 0.18 + (reduced ? 0 : Math.sin(t * 1.6) * 0.02);
    core.scale.setScalar(cs);
    coreGlow.material.opacity = 0.65 + coreHeat * 0.35;

    const r = el.getBoundingClientRect();
    for (const id in nodes) {
      const n = nodes[id];
      n.heat = Math.max(0, n.heat - dt * 0.9);
      const s = 1 + n.heat * 0.9;
      n.ball.scale.setScalar(s);
      n.glow.scale.setScalar(1.1 + n.heat * 1.4);
      n.glow.material.opacity = 0.45 + n.heat * 0.55;
      n.group.getWorldPosition(tmp).project(camera);
      n.label.style.left = `${(tmp.x * 0.5 + 0.5) * r.width}px`;
      n.label.style.top = `${(-tmp.y * 0.5 + 0.5) * r.height}px`;
      n.label.style.opacity = tmp.z > 1 ? 0 : 1;
      n.label.classList.toggle("hot", n.heat > 0.25);
    }
    for (let i = beams.length - 1; i >= 0; i--) {
      const b = beams[i];
      b.t += dt * 1.25;
      const k = Math.min(b.t, 1);
      b.line.geometry.setDrawRange(0, Math.floor(k * 49));
      b.head.position.copy(b.curve.getPoint(k));
      if (b.t >= 1 && !b.arrived) { b.arrived = true; activate(b.to); }
      if (b.t > 1) { b.line.material.opacity = Math.max(0, 0.9 - (b.t - 1) * 1.6); b.head.material.opacity = b.line.material.opacity; }
      if (b.t > 1.6) { world.remove(b.line, b.head); b.line.geometry.dispose(); beams.splice(i, 1); }
    }
    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i];
      b.t += dt;
      b.mesh.scale.setScalar(1 + b.t * 3.5);
      b.mesh.material.opacity = Math.max(0, 0.9 - b.t * 0.9);
      b.mesh.lookAt(camera.position);
      if (b.t > 1) { world.remove(b.mesh); bursts.splice(i, 1); }
    }
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return {
    activate, beam, setMood, reset,
    moveTo(parent) { parent.appendChild(container); requestAnimationFrame(resize); },
  };
}
