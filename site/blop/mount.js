import { emptyBand, liveBand, stepBand, stepCharge, stepVoice } from "./grade.js";
import { emptyAside, pointerFlags, stepAside } from "./line.js";
import { emptyMix, mixPose, stepMix } from "./mix.js";
import { blinkAmount, poseFor } from "./pose.js";
import { FRAGMENT_SOURCE, VERT } from "./shaderFrag.js";

function Spring(v, k, d) { this.x = v; this.v = 0; this.k = k; this.d = d; }
Spring.prototype.step = function step(t, dt) {
  this.v += ((t - this.x) * this.k - this.v * this.d) * dt;
  this.x += this.v * dt;
  return this.x;
};
Spring.prototype.kick = function kick(v) { this.v += v; };

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "shader");
  return s;
}

/* Ported 1:1 from src/components/Blop/Blop.jsx — same springs, uniforms and loop.
   `read()` returns the live props: {mood, voice, tone, recording, band, target,
   baseLine, allowAsides, ride, cap, page}. */
export function mountBlop(canvas, read) {
  const gl = canvas.getContext("webgl", { antialias: false, alpha: true, premultipliedAlpha: true });
  if (!gl) return { stop() {}, kick() {} };

  const pr = gl.createProgram();
  gl.attachShader(pr, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(pr, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SOURCE));
  gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr) || "link");
  gl.useProgram(pr);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(pr, "a");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const U = {};
  ["uRes","uSquashY","uLean","uOpen","uHappy","uHop","uTilt","uEyeS","uWave","uWavePh","uBrow","uSag","uEyeY","uLook","uDrag","uTint","uPage","uAsymOpen","uAsymBrow","uAsymSize","uAsymY","uSpin"]
    .forEach((k) => { U[k] = gl.getUniformLocation(pr, k); });

  const S = {
    sy: new Spring(1, 190, 17), lean: new Spring(0, 120, 15), hop: new Spring(0, 210, 19),
    lx: new Spring(0, 720, 36), ly: new Spring(0, 720, 36), eye: new Spring(1, 110, 15),
    tilt: new Spring(0, 80, 14), hap: new Spring(0, 55, 12), brow: new Spring(0, 60, 13),
    sag: new Spring(0, 45, 12), eyeY: new Spring(0, 50, 12),
  };

  let wave = 0, wavePh = 0, blinkT = -9, nextBlink = 1.2;
  let last = performance.now(), t0 = last, raf = 0, running = true;
  let lastCap = "", aside = emptyAside(), charge = { charge: 0, band: "rest" };
  let bandState = emptyBand(), voiceEnv = 0, mix = emptyMix();
  let leaveAge = 0, eagerT = -99, wasClose = false, kicks = 0;
  const ptr = { x: 0, y: 0, clientX: null, clientY: null, inside: true };

  const fit = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round((canvas.clientWidth || 380) * dpr));
    const h = Math.max(1, Math.round((canvas.clientHeight || 380) * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h);
    }
  };

  const onPtr = (ev) => {
    const r = canvas.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    ptr.x = (ev.clientX - cx) / Math.max(r.width / 2, 1);
    ptr.y = (ev.clientY - cy) / Math.max(r.height / 2, 1);
    ptr.clientX = ev.clientX; ptr.clientY = ev.clientY; ptr.inside = true;
  };
  const onLeave = () => { ptr.inside = false; };

  window.addEventListener("pointermove", onPtr);
  window.addEventListener("pointerleave", onLeave);
  document.documentElement.addEventListener("mouseleave", onLeave);

  const frame = (now) => {
    if (!running) return;
    const p = read() || {};
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;
    const T = (now - t0) / 1000;
    fit();
    if (kicks) {
      S.sy.kick(-1.8 * kicks); S.hop.kick(0.9 * kicks); wave += 0.03 * kicks; kicks = 0;
    }
    voiceEnv = stepVoice(voiceEnv, p.voice || 0, dt);
    const raw = p.recording ? liveBand(voiceEnv, p.tone ?? 0.4, p.target || "calm") : p.band || "rest";
    bandState = stepBand(bandState, raw, dt);
    const band = bandState.band;
    charge = stepCharge(charge, band, dt);
    const box = canvas.getBoundingClientRect();
    const cx = box.left + box.width / 2;
    const cy = box.top + box.height / 2;
    if (ptr.clientX == null) { ptr.clientX = cx; ptr.clientY = cy; }
    const over = ptr.inside && Math.hypot(ptr.x, ptr.y) < 1.05;
    const flags = pointerFlags({
      x: ptr.clientX, y: ptr.clientY, w: window.innerWidth, h: window.innerHeight,
      cx, cy, inside: ptr.inside, over,
    });
    const home = !!p.allowAsides;
    const leave = home && (flags.edge || !ptr.inside);
    if (leave) leaveAge += dt; else leaveAge = 0;
    if (over && !wasClose) eagerT = T;
    wasClose = over;
    const eagering = home && !leave && T - eagerT >= 0 && T - eagerT < 1.05;
    mix = home
      ? stepMix(mix, { leave, leaveAge, over, eager: eagering, dt })
      : stepMix(mix, { leave: false, leaveAge: 0, over: false, eager: false, dt });
    const pose = home
      ? mixPose(T, p.voice || 0, { ...charge, eagerT: Math.max(0, T - eagerT) }, mix)
      : poseFor(p.mood || "idle", T, p.voice || 0, charge);
    const leaveW = mix.sad + mix.plead;
    let lookX, lookY;
    if (home && leaveW > 0.2) {
      const u = Math.min(1, leaveW);
      const px = ptr.inside ? Math.max(-1.2, Math.min(1.2, ptr.x * 0.7)) : pose.lookX;
      const py = ptr.inside ? Math.max(-1, Math.min(1, -ptr.y * 0.55)) : pose.lookY;
      lookX = px + (pose.lookX - px) * u;
      lookY = py + (pose.lookY - py) * u;
    } else if (ptr.inside) {
      lookX = Math.max(-1.2, Math.min(1.2, ptr.x * 0.7));
      lookY = Math.max(-1, Math.min(1, -ptr.y * 0.55));
    } else {
      lookX = pose.lookX; lookY = pose.lookY;
    }
    if (T > nextBlink) {
      blinkT = T;
      nextBlink = T + (1.2 + Math.random() * 2.8) / Math.max(0.2, 1 / (pose.blinkPeriod / 2.6));
    }
    const open = blinkAmount(T - blinkT);
    S.sy.step(pose.sy, dt); S.lean.step(pose.lean, dt); S.hop.step(pose.hop, dt);
    S.lx.step(lookX, dt); S.ly.step(lookY, dt); S.eye.step(pose.eye, dt);
    S.tilt.step(pose.tilt, dt); S.hap.step(pose.happy, dt); S.brow.step(pose.brow, dt);
    S.sag.step(pose.sag, dt); S.eyeY.step(pose.eyeY, dt);
    const drive = Math.abs(S.sy.v) * 0.03 + Math.abs(S.hop.v) * 0.018;
    wave = Math.max(Math.min(0.052, drive), wave - dt * 0.26);
    wavePh += dt * 11;
    const dragX = -S.lean.v * 0.01 - S.lx.v * 0.0015;
    const dragY = -S.hop.v * 0.014 + S.sy.v * 0.012;
    const tint = pose.tint;
    const page = p.page || [0.035, 0.04, 0.048];
    gl.uniform2f(U.uRes, canvas.width, canvas.height);
    gl.uniform1f(U.uSquashY, S.sy.x);
    gl.uniform1f(U.uLean, S.lean.x);
    gl.uniform1f(U.uOpen, Math.max(0.02, open));
    gl.uniform1f(U.uHappy, Math.max(0, Math.min(1, S.hap.x)));
    gl.uniform1f(U.uBrow, S.brow.x);
    gl.uniform1f(U.uSag, S.sag.x);
    gl.uniform1f(U.uEyeY, S.eyeY.x);
    gl.uniform1f(U.uHop, S.hop.x);
    gl.uniform1f(U.uTilt, S.tilt.x);
    gl.uniform1f(U.uEyeS, S.eye.x);
    gl.uniform1f(U.uWave, wave);
    gl.uniform1f(U.uWavePh, wavePh);
    gl.uniform2f(U.uLook, S.lx.x, S.ly.x);
    gl.uniform2f(U.uDrag, dragX, dragY);
    gl.uniform1f(U.uAsymOpen, pose.asymOpen || 0);
    gl.uniform1f(U.uAsymBrow, pose.asymBrow || 0);
    gl.uniform1f(U.uAsymSize, pose.asymSize || 0);
    gl.uniform1f(U.uAsymY, pose.asymY || 0);
    gl.uniform1f(U.uSpin, pose.spin || 0);
    gl.uniform3f(U.uTint, tint[0], tint[1], tint[2]);
    gl.uniform3f(U.uPage, page[0], page[1], page[2]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (p.ride) {
      const px = S.hop.x * (canvas.clientHeight || 380) * 0.3;
      p.ride.style.transform = `translateY(${-px}px)`;
    }
    if (p.cap) {
      const view = home ? "home" : "rec";
      aside = stepAside(aside, { view, flags, now: T });
      const text = aside.text || p.baseLine || "";
      if (text !== lastCap) { lastCap = text; p.cap.textContent = text; }
    }
    raf = requestAnimationFrame(frame);
  };

  raf = requestAnimationFrame(frame);

  return {
    kick() { kicks += 1; },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onPtr);
      window.removeEventListener("pointerleave", onLeave);
      document.documentElement.removeEventListener("mouseleave", onLeave);
    },
  };
}
