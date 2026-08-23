import { poseFor, squashX } from "./pose.js";

export function emptyMix() {
  return { eager: 0, sad: 0, unsure: 0, mad: 0, plead: 0 };
}

function approach(x, t, dt, rate) {
  return x + (t - x) * (1 - Math.exp(-rate * Math.max(0, dt)));
}

function stage(t, start, up, hold, down) {
  const a = t - start;
  if (a <= 0) return 0;
  if (a < up) return a / up;
  if (a < up + hold) return 1;
  const d = a - up - hold;
  return d < down ? 1 - d / down : 0;
}

export function leaveTargets(age) {
  const t = Math.max(0, age);
  const unsure = stage(t, 0, 0.5, 1.1, 1.2);
  const sad = stage(t, 1.4, 0.7, 1.6, 1.8);
  const mad = stage(t, 3.2, 0.5, 0.7, 1) * 0.55;
  const plead = stage(t, 4.6, 0.8, 2.2, 2.4);
  const resigned = t < 9 ? 0 : Math.min(1, (t - 9) / 2.2);
  return {
    eager: 0,
    sad: Math.min(1, Math.max(sad, resigned * 0.72)),
    unsure: Math.min(1, unsure),
    mad: Math.min(0.55, mad),
    plead: Math.min(1, plead * (1 - resigned)),
  };
}

export function stepMix(mix, { leave, leaveAge, over, eager, dt }) {
  const cur = mix || emptyMix();
  const d = Math.max(0, dt);
  let want = emptyMix();
  if (leave) want = leaveTargets(leaveAge);
  else if (eager) want.eager = 1;
  else if (over) want = emptyMix();
  return {
    eager: approach(cur.eager, want.eager, d, 7),
    sad: approach(cur.sad, want.sad, d, 5.5),
    unsure: approach(cur.unsure, want.unsure, d, 5),
    mad: approach(cur.mad, want.mad, d, 4.5),
    plead: approach(cur.plead, want.plead, d, 5),
  };
}

const KEYS = ["sy", "lean", "hop", "lookX", "lookY", "eye", "tilt", "happy", "brow", "sag", "eyeY"];

export function lerpPose(a, b, t) {
  const u = Math.min(1, Math.max(0, t));
  const out = { ...a };
  for (const k of KEYS) {
    const av = Number(a[k]) || 0;
    const bv = Number(b[k]) || 0;
    out[k] = av + (bv - av) * u;
  }
  return out;
}

export function mixPose(t, voice, extras, mix) {
  const m = mix || emptyMix();
  let p = poseFor("idle", t, voice, extras);
  if (m.eager > 0.008) p = lerpPose(p, poseFor("eager", extras?.eagerT || 0, voice, extras), m.eager);
  if (m.sad > 0.008) p = lerpPose(p, poseFor("sad", t, voice, extras), m.sad);
  if (m.unsure > 0.008) p = lerpPose(p, poseFor("unsure", t, voice, extras), m.unsure);
  if (m.mad > 0.008) p = lerpPose(p, poseFor("frustrated", t, voice, extras), m.mad);
  if (m.plead > 0.008) p = lerpPose(p, poseFor("plead", t, voice, extras), m.plead);
  p.sx = squashX(p.sy);
  p.drawnBrows = false;
  p.eyes = 2;
  return p;
}
