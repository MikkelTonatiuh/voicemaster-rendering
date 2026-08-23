import { tintFor } from "./grade.js";

export const IDENTITY = {
  eyes: 2,
  drawnBrows: false,
  restTint: [0.97, 0.98, 0.99]
};
export function hash1(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
export const JOY_MOVES = [
  {
    name: "spin",
    min: 0.78,
    dur: 0.62,
    f: (u, amp) => {
      if (u < 0.14) return { sy: -0.14 * amp * (u / 0.14) };
      if (u < 0.82) {
        const v = (u - 0.14) / 0.68;
        return {
          spin: spinAmount(v),
          hop: Math.sin(v * Math.PI) * 0.26 * amp,
          sy: 0.1 * amp - Math.sin(v * Math.PI) * 0.04
        };
      }
      return { sy: -0.16 * amp * (1 - (u - 0.82) / 0.18) };
    }
  },
  {
    name: "doubleHop",
    min: 0.55,
    dur: 0.86,
    f: (u, amp) => {
      const n = Math.abs(Math.sin(u * Math.PI * 2));
      const decay = 1 - u * 0.45;
      return { hop: n * 0.13 * amp * decay, sy: 1 + Math.sin(u * Math.PI * 4) * 0.05 * amp - 1 };
    }
  },
  {
    name: "shimmy",
    min: 0.5,
    dur: 0.66,
    f: (u, amp) => {
      const a = Math.exp(-u * 2.2);
      return { lean: Math.sin(u * 26) * 0.07 * amp * a, sy: Math.sin(u * 20) * 0.02 * amp * a };
    }
  },
  {
    name: "beam",
    min: 0.3,
    dur: 1.05,
    f: (u, amp) => {
      const e = Math.sin(u * Math.PI);
      return { happy: 0.22 * e * amp, sy: 0.035 * e * amp, hop: 0.02 * e * amp };
    }
  },
  {
    name: "wink",
    min: 0.55,
    dur: 0.58,
    f: (u, amp) => {
      const w = winkFace(u);
      return { asymOpen: w.asymOpen * amp, tilt: w.tilt * amp, hop: 0.02 * Math.sin(u * Math.PI) };
    }
  },
  {
    name: "tiltJoy",
    min: 0.3,
    dur: 0.92,
    f: (u, amp) => {
      const e = u < 0.28 ? u / 0.28 : u > 0.72 ? (1 - u) / 0.28 : 1;
      return { tilt: 0.15 * e * amp, lean: 0.05 * e * amp };
    }
  },
  {
    name: "bobble",
    min: 0.3,
    dur: 0.78,
    f: (u, amp) => {
      const a = Math.exp(-u * 2.6);
      return { hop: Math.sin(u * 11) * 0.05 * amp * a, sy: Math.cos(u * 11) * 0.05 * amp * a };
    }
  }
];
export const MAD_MOVES = [
  {
    name: "huff",
    min: 0.3,
    dur: 0.95,
    f: (u, amp) => {
      const e = u < 0.35 ? u / 0.35 : (1 - u) / 0.65;
      return { sy: 0.06 * e * amp, lean: -0.06 * e * amp };
    }
  },
  {
    name: "fume",
    min: 0.72,
    dur: 1.5,
    f: (u, amp) => {
      if (u < 0.55) {
        const e = u / 0.55;
        return { sy: 0.1 * e * amp, lean: Math.sin(u * 44) * 0.03 * e * amp };
      }
      const d = (u - 0.55) / 0.45;
      return { sy: (0.1 - 0.22 * d) * amp, lean: 0.05 * d * amp };
    }
  },
  {
    name: "shake",
    min: 0.5,
    dur: 0.5,
    f: (u, amp) => {
      const a = Math.exp(-u * 3.4);
      return { lean: Math.sin(u * 40) * 0.08 * amp * a };
    }
  },
  {
    name: "stomp",
    min: 0.62,
    dur: 0.55,
    f: (u, amp) => {
      const e = u < 0.3 ? u / 0.3 : Math.exp(-(u - 0.3) * 4);
      return { sy: -0.18 * e * amp, hop: -0.02 * e * amp };
    }
  },
  {
    name: "lookAway",
    min: 0.3,
    dur: 1.2,
    f: (u, amp) => {
      const e = u < 0.2 ? u / 0.2 : u > 0.75 ? (1 - u) / 0.25 : 1;
      return { lookX: 0.9 * e * amp, tilt: -0.06 * e * amp };
    }
  }
];
export const SLOT = 3.8;
export function permutation(round, n) {
  const arr = [];
  for (let i = 0; i < n; i++) arr.push(i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(hash1(round * 97.3 + i * 13.7) * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}
export function flourishAt(t, moves, charge = 1) {
  if (!moves || !moves.length) return null;
  const pool = moves.filter((m) => charge >= (m.min || 0));
  if (!pool.length) return null;
  const slotLen = SLOT - charge * 1.5;
  const slot = Math.floor(t / slotLen);
  const n = pool.length;
  const round = Math.floor(slot / n);
  const pos = slot - round * n;
  const perm = permutation(round, n);
  if (round > 0 && n > 1) {
    const prev = permutation(round - 1, n)[n - 1];
    if (perm[0] === prev) {
      const tmp = perm[0];
      perm[0] = perm[1];
      perm[1] = tmp;
    }
  }
  const move = pool[perm[pos]];
  const gap = 0.3 + hash1(slot * 7.3 + 1.7) * (slotLen - move.dur - 0.35);
  const local = t - slot * slotLen - gap;
  if (local < 0 || local > move.dur) return null;
  return { name: move.name, u: local / move.dur, amp: 0.72 + hash1(slot * 5.9 + 4.2) * 0.5, move };
}
export function applyFlourish(pose, fl) {
  if (!fl) return pose;
  const d = fl.move.f(fl.u, fl.amp);
  if (d.sy !== undefined) pose.sy += d.sy;
  if (d.hop !== undefined) pose.hop += d.hop;
  if (d.lean !== undefined) pose.lean += d.lean;
  if (d.tilt !== undefined) pose.tilt += d.tilt;
  if (d.spin !== undefined) pose.spin = (pose.spin || 0) + d.spin;
  if (d.happy !== undefined) pose.happy = Math.min(1, (pose.happy || 0) + d.happy);
  if (d.asymOpen !== undefined) pose.asymOpen = (pose.asymOpen || 0) + d.asymOpen;
  if (d.lookX !== undefined) pose.lookX += d.lookX;
  return pose;
}
export function skepticalFace(strength = 1) {
  return {
    asymOpen: 0.46 * strength,
    // right eye shortens; left untouched
    asymBrow: 0.4 * strength,
    // and its lid tilts in
    asymY: 0.012 * strength,
    tilt: 0.07 * strength
  };
}
export function winkFace(u) {
  const shut = Math.sin(Math.max(0, Math.min(1, u)) * Math.PI);
  return { asymOpen: 0.97 * shut, asymSize: 0, tilt: 0.07 * shut };
}
export function spinAmount(u) {
  const e = easeInOutCubic(Math.max(0, Math.min(1, u)));
  return e * Math.PI * 2;
}
export function squashX(sy) {
  return 1 / Math.sqrt(Math.max(sy, 0.35));
}
export function easeInOutCubic(u) {
  const t = Math.min(1, Math.max(0, u));
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}
export function easeOutCubic(u) {
  const t = Math.min(1, Math.max(0, u));
  return 1 - (1 - t) ** 3;
}
export function blinkAmount(e) {
  if (e < 0) return 1;
  if (e < 0.055) return 1 - e / 0.055;
  if (e < 0.105) return 0;
  if (e < 0.235) return (e - 0.105) / 0.13;
  return 1;
}
export function mascotMood(view, results, recording) {
  if (view === "rec" && recording) return "listen";
  if (view === "load") return "think";
  if (view === "unsure") return "unsure";
  if (view === "err") return "frustrated";
  if (view === "good") {
    const score = Number(results?.score) || 0;
    if (score >= 80) return "happy";
    if (score >= 50) return "unsure";
    return "frustrated";
  }
  return "idle";
}
function drift(t, seed) {
  return Math.sin(t * 0.37 + seed) * 0.55 + Math.sin(t * 0.598 + seed * 2.1) * 0.3 + Math.sin(t * 0.971 + seed * 3.7) * 0.15;
}
export function lerpKnots(knots, p) {
  const u = (p % 1 + 1) % 1;
  let i = 0;
  while (i < knots.length - 1 && u > knots[i + 1].p - 1e-12) i += 1;
  if (i >= knots.length - 1) return { ...knots[knots.length - 1] };
  const a = knots[i];
  const b = knots[i + 1];
  const span = b.p - a.p || 1;
  const t = easeInOutCubic((u - a.p) / span);
  const out = { p: u };
  for (const key of Object.keys(a)) {
    if (key === "p") continue;
    out[key] = a[key] + (b[key] - a[key]) * t;
  }
  return out;
}
var EAGER_KNOTS = [
  { p: 0, hop: 0.02, sy: 1 },
  { p: 0.14, hop: 0, sy: 0.76 },
  { p: 0.3, hop: 0.2, sy: 1.14 },
  { p: 0.5, hop: 0.1, sy: 0.94 },
  { p: 0.72, hop: 0.16, sy: 1.08 },
  { p: 1, hop: 0.02, sy: 1 }
];
var HAPPY_KNOTS = [
  { p: 0, hop: 0, sy: 1, lookY: 0.04 },
  { p: 0.14, hop: 0.02, sy: 0.74, lookY: 0.28 },
  { p: 0.24, hop: 0.16, sy: 1.18, lookY: -0.2 },
  { p: 0.48, hop: 0.3, sy: 1.05, lookY: -0.22 },
  { p: 0.58, hop: 0.02, sy: 0.76, lookY: 0.12 },
  { p: 0.76, hop: 0.12, sy: 1.07, lookY: -0.08 },
  { p: 1, hop: 0, sy: 1, lookY: 0.04 }
];
var BASE = {
  sy: 1,
  lean: 0,
  hop: 0,
  lookX: 0,
  lookY: 0,
  eye: 1,
  tilt: 0,
  happy: 0,
  brow: 0,
  sag: 0,
  eyeY: 0,
  blinkPeriod: 2.8,
  tint: IDENTITY.restTint
};
var POSE = {
  idle(t) {
    const amp = 0.028;
    return {
      ...BASE,
      sy: 1 + Math.sin(t * 2.15) * amp,
      lean: drift(t, 4.1) * 0.02,
      lookX: Math.sin(t * 0.31) * 0.12,
      lookY: Math.sin(t * 0.27) * 0.06,
      eye: 1,
      blinkPeriod: 2.6
    };
  },
  eager(t) {
    const k = lerpKnots(EAGER_KNOTS, Math.min(1, Math.max(0, t / 1.05)));
    return {
      ...BASE,
      sy: k.sy,
      hop: k.hop,
      lean: 0.1 + drift(t, 2.2) * 0.03,
      lookY: 0.16,
      eye: 1.08,
      sag: -0.28,
      happy: 0.22,
      eyeY: 0.012,
      blinkPeriod: 2.4
    };
  },
  sad() {
    return {
      ...BASE,
      sy: 0.9,
      hop: -0.016,
      lean: 0.03,
      lookY: -0.18,
      eye: 0.98,
      brow: -0.16,
      sag: 0.46,
      eyeY: -0.016,
      blinkPeriod: 3.4
    };
  },
  plead() {
    return {
      ...BASE,
      sy: 0.93,
      hop: 0.03,
      lean: 0.02,
      lookY: 0.34,
      eye: 1.08,
      brow: -0.12,
      sag: 0.32,
      happy: 0,
      eyeY: 0.01,
      blinkPeriod: 2.2
    };
  },
  listen(t, voice = 0.35) {
    const lv = Math.min(1, Math.max(0, voice));
    return {
      ...BASE,
      sy: 0.86 - lv * 0.1,
      lean: drift(t, 2) * 0.03 + 0.04,
      hop: 0.02 + lv * 0.03,
      lookX: Math.sin(t * 0.4) * 0.08,
      lookY: 0.22 + lv * 0.16,
      eye: 1.1 + lv * 0.05,
      sag: -0.18,
      eyeY: 0.01,
      blinkPeriod: 2.2
    };
  },
  think(t) {
    const hold = easeOutCubic((Math.sin(t * 0.55) + 1) / 2);
    return {
      ...BASE,
      sy: 0.985,
      lean: Math.sin(t * 0.42) * 0.05,
      lookX: 0.68 + hold * 0.18,
      lookY: 0.64,
      eye: 0.95,
      tilt: -0.08 + hold * 0.06,
      brow: 0.08,
      sag: -0.05,
      eyeY: 8e-3,
      blinkPeriod: 3.2
    };
  },
  happy(t) {
    const k = lerpKnots(HAPPY_KNOTS, t % 1.35 / 1.35);
    return {
      ...BASE,
      sy: k.sy,
      hop: k.hop,
      lookX: Math.sin(t * 2.1) * 0.12,
      lookY: k.lookY,
      eye: 1.04,
      tilt: Math.sin(t * 6) * 0.05,
      happy: 1,
      sag: -0.55,
      eyeY: 0.022,
      blinkPeriod: 99
    };
  },
  frustrated(t) {
    const tr = 0.7;
    return {
      ...BASE,
      sy: 0.87 + Math.sin(t * 31) * 0.012 * tr,
      lean: 0.07 + Math.sin(t * 27) * 0.022 * tr,
      hop: -0.012,
      lookX: Math.sin(t * 3.4) * 0.42,
      lookY: -0.12,
      eye: 0.94,
      tilt: 0.05,
      brow: 0.62,
      sag: 0.42,
      eyeY: -0.022,
      blinkPeriod: 4.4
    };
  },
  unsure(t) {
    const glance = easeInOutCubic((Math.sin(t * 1.05) + 1) / 2);
    return {
      ...BASE,
      sy: 0.97 + Math.sin(t * 2.1) * 0.015,
      lean: -0.05 + glance * 0.12,
      lookX: -0.35 + glance * 0.7,
      lookY: 0.18,
      eye: 0.98,
      tilt: -0.1 + glance * 0.2,
      brow: -0.22,
      sag: 0.16,
      eyeY: -0.01,
      blinkPeriod: 1.6
    };
  }
};
export function poseFor(mood, t, voice = 0, extras = {}) {
  const fn = POSE[mood] || POSE.idle;
  const pose = fn(t, voice);
  const charge = Math.min(1, Math.max(0, extras.charge || 0));
  const band = extras.band || "rest";
  if (band === "good") {
    pose.hop += 0.04 * charge;
    pose.happy = Math.min(1, (pose.happy || 0) + 0.55 + 0.4 * charge);
    pose.sag -= 0.22 * charge;
    pose.sy += 0.04 * charge;
    if (charge > 0.3) {
      applyFlourish(pose, flourishAt(t, JOY_MOVES, charge));
    }
  } else if (band === "bad") {
    pose.sag += 0.18 + 0.28 * charge;
    pose.brow = Math.max(pose.brow || 0, 0.28 + 0.4 * charge);
    pose.sy -= 0.04 * charge;
    pose.lean += Math.sin(t * 28) * 0.02 * charge;
    pose.asymBrow = (pose.asymBrow || 0) + 0.3 * charge;
    if (charge > 0.3) {
      applyFlourish(pose, flourishAt(t + 11.3, MAD_MOVES, charge));
    }
  } else if (band === "mid") {
    pose.brow = (pose.brow || 0) - 0.12 - 0.18 * charge;
    pose.lookX += 0.12 * charge;
    pose.tilt += 0.04 * charge;
    const sk = skepticalFace(0.5 + 0.5 * charge);
    pose.asymBrow = (pose.asymBrow || 0) + sk.asymBrow;
    pose.asymOpen = (pose.asymOpen || 0) + sk.asymOpen;
    pose.asymY = (pose.asymY || 0) + sk.asymY;
    pose.tilt += sk.tilt;
  }
  pose.sx = squashX(pose.sy);
  pose.asymOpen = pose.asymOpen || 0;
  pose.asymBrow = pose.asymBrow || 0;
  pose.asymSize = pose.asymSize || 0;
  pose.asymY = pose.asymY || 0;
  pose.spin = pose.spin || 0;
  pose.drawnBrows = false;
  pose.eyes = IDENTITY.eyes;
  pose.tint = band === "rest" ? IDENTITY.restTint : tintFor(band, charge);
  return pose;
}
