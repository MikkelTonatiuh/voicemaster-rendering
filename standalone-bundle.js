/* standalone bundle — generated; do not edit by hand */
(function(){
"use strict";

// ==== blop/grade.js ====
const REST_TINT = [0.97, 0.98, 0.99];
const DWELL = 0.16;
const HOLD_SEC = DWELL;

const TINTS = {
  rest: REST_TINT,
  good: [0.62, 0.94, 0.7],
  mid: [0.97, 0.9, 0.52],
  bad: [0.98, 0.68, 0.66],
};

function liveBand(voice, tone = 0.4, target = "calm") {
  const v = Math.min(1, Math.max(0, Number(voice) || 0));
  const tn = Math.min(1, Math.max(0, Number(tone) || 0));
  if (v < 0.08) return "bad";
  if (target === "excited") {
    if (v >= 0.32) return "good";
    if (v >= 0.16) return "mid";
    return "bad";
  }
  if (target === "calm") {
    if (v >= 0.1 && v <= 0.38 && tn < 0.72) return "good";
    if (v >= 0.08 && v <= 0.55) return "mid";
    return "bad";
  }
  if (target === "authoritative") {
    if (v >= 0.18 && v <= 0.55) return "good";
    if (v >= 0.12 && v <= 0.7) return "mid";
    return "bad";
  }
  if (v >= 0.18 && v <= 0.55) return "good";
  if (v >= 0.1 && v <= 0.7) return "mid";
  return "bad";
}

function stepVoice(prev, raw, dt) {
  const v = Math.min(1, Math.max(0, Number(raw) || 0));
  const p = Number(prev) || 0;
  const rate = v > p ? 9 : 2.1;
  return p + (v - p) * (1 - Math.exp(-rate * Math.max(0, dt)));
}

function emptyBand() {
  return { band: "rest", candidate: "rest", held: 0 };
}

function stepBand(prev, raw, dt) {
  const p = prev || emptyBand();
  const d = Math.max(0, dt);
  if (raw === p.band) return { band: p.band, candidate: p.band, held: 0 };
  if (raw === "rest") return { band: "rest", candidate: "rest", held: 0 };
  if (raw !== p.candidate) return { band: p.band, candidate: raw, held: 0 };
  const held = p.held + d;
  if (held >= DWELL) {
    return { band: raw, candidate: raw, held: 0 };
  }
  return { band: p.band, candidate: raw, held };
}

function stepCharge(prev, band, dt) {
  const p = prev || { charge: 0, band: "rest" };
  const d = Math.max(0, dt);
  if (band === "rest") {
    return { charge: Math.max(0, p.charge - d * 2.4), band: "rest" };
  }
  if (p.band !== band) {
    return { charge: Math.max(0, p.charge - d * 2.4), band };
  }
  return { charge: Math.min(1, p.charge + d * 0.38), band };
}

function tintFor(band, charge = 0) {
  if (!band || band === "rest") return REST_TINT.slice();
  const dest = TINTS[band] || REST_TINT;
  const u = 0.42 + 0.38 * Math.min(1, Math.max(0, charge));
  return REST_TINT.map((c, i) => c + (dest[i] - c) * u);
}

const SIM_CENTRE = { calm: 0.24, excited: 0.44, authoritative: 0.36 };

function simulatedVoice(t, target = "calm") {
  const centre = SIM_CENTRE[target] || 0.3;
  const drift = Math.sin(t * 0.31) * 0.055 + Math.sin(t * 0.73 + 1.1) * 0.03;
  const syllable = Math.abs(Math.sin(t * 4.1)) * 0.04;
  return Math.max(0, Math.min(1, centre + drift + syllable));
}

function simulatedTone(t, target = "calm") {
  const centre = target === "excited" ? 0.62 : 0.42;
  return Math.max(0, Math.min(1, centre + Math.sin(t * 0.27) * 0.06));
}

function scoreBand(view, results) {
  if (view !== "good" && view !== "unsure") return null;
  const score = Number(results?.score) || 0;
  if (results?.mixed) return "mid";
  if (score >= 72) return "good";
  if (score >= 45) return "mid";
  return "bad";
}


// ==== blop/pose.js ====


const IDENTITY = {
  eyes: 2,
  drawnBrows: false,
  restTint: [0.97, 0.98, 0.99]
};
function hash1(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
const JOY_MOVES = [
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
const MAD_MOVES = [
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
const SLOT = 3.8;
function permutation(round, n) {
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
function flourishAt(t, moves, charge = 1) {
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
function applyFlourish(pose, fl) {
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
function skepticalFace(strength = 1) {
  return {
    asymOpen: 0.46 * strength,
    // right eye shortens; left untouched
    asymBrow: 0.4 * strength,
    // and its lid tilts in
    asymY: 0.012 * strength,
    tilt: 0.07 * strength
  };
}
function winkFace(u) {
  const shut = Math.sin(Math.max(0, Math.min(1, u)) * Math.PI);
  return { asymOpen: 0.97 * shut, asymSize: 0, tilt: 0.07 * shut };
}
function spinAmount(u) {
  const e = easeInOutCubic(Math.max(0, Math.min(1, u)));
  return e * Math.PI * 2;
}
function squashX(sy) {
  return 1 / Math.sqrt(Math.max(sy, 0.35));
}
function easeInOutCubic(u) {
  const t = Math.min(1, Math.max(0, u));
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}
function easeOutCubic(u) {
  const t = Math.min(1, Math.max(0, u));
  return 1 - (1 - t) ** 3;
}
function blinkAmount(e) {
  if (e < 0) return 1;
  if (e < 0.055) return 1 - e / 0.055;
  if (e < 0.105) return 0;
  if (e < 0.235) return (e - 0.105) / 0.13;
  return 1;
}
function mascotMood(view, results, recording) {
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
function lerpKnots(knots, p) {
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
function poseFor(mood, t, voice = 0, extras = {}) {
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


// ==== blop/mix.js ====


function emptyMix() {
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

function leaveTargets(age) {
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

function stepMix(mix, { leave, leaveAge, over, eager, dt }) {
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

function lerpPose(a, b, t) {
  const u = Math.min(1, Math.max(0, t));
  const out = { ...a };
  for (const k of KEYS) {
    const av = Number(a[k]) || 0;
    const bv = Number(b[k]) || 0;
    out[k] = av + (bv - av) * u;
  }
  return out;
}

function mixPose(t, voice, extras, mix) {
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


// ==== blop/line.js ====
const INTRO = "practice how you sound.";
const TAP = "tap me.";
const FAR = "where you going";
const EDGE = "please don't leave.";
const LEAVE = "don't leave";
const TONES = ["calm", "excited", "authoritative"];

function pointerFlags({
  x = 0,
  y = 0,
  w = 1280,
  h = 800,
  cx = 640,
  cy = 400,
  inside = true,
  over = false,
} = {}) {
  if (!inside) return { far: false, edge: true, inside: false, over: false };
  const edge = x < 48 || y < 48 || x > w - 48 || y > h - 48;
  const far = Math.hypot(x - cx, y - cy) > 0.42 * Math.min(w, h);
  return { far, edge, inside: true, over: !!over && !edge };
}

function emptyAside() {
  return { text: null, until: 0, coolUntil: 0 };
}

function stepAside(aside, { view, flags, now }) {
  if (view !== "home") return emptyAside();
  if (flags?.over) return emptyAside();
  const a = aside || emptyAside();
  const t = Number(now) || 0;
  if (a.text && t < a.until) return a;
  if (a.text && t >= a.until) {
    return { text: null, until: 0, coolUntil: t + 1.35 };
  }
  if (t < a.coolUntil) return a;
  if (!flags?.inside) {
    return { text: LEAVE, until: t + 2.2, coolUntil: 0 };
  }
  if (flags.edge) {
    return { text: EDGE, until: t + 2.2, coolUntil: 0 };
  }
  if (flags.far) {
    return { text: FAR, until: t + 1.9, coolUntil: 0 };
  }
  return a;
}

function blopVoice(s) {
  return String(s || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function coachingText(results) {
  if (!results) return "";
  const bits = [];
  const raw = results.feedback ?? results.analysis ?? results.comment;
  if (raw) bits.push(String(raw));
  if (Array.isArray(results.tips)) {
    let have = bits.join(" ");
    for (const tip of results.tips) {
      const t = tip ? String(tip) : "";
      if (t && !have.includes(t)) {
        bits.push(t);
        have += ` ${t}`;
      }
    }
  }
  if (!bits.length && results.headline) bits.push(String(results.headline));
  return blopVoice(bits.join(" "));
}

function noteFor(results, target) {
  if (!results) return "";
  const predicted = results.predicted || results.emotion || results.style || "";
  const heard = predicted ? String(predicted).toLowerCase() : "";
  const tgt = String(target || results.target || results.targetEmotion || "").toLowerCase();
  const body = coachingText(results);
  if (body) {
    if (heard && !body.includes(heard)) return blopVoice(`that read as ${heard}. ${body}`);
    return body;
  }
  if (results.mixed) {
    return blopVoice(
      `that mixed ${tgt || "the ask"} with another tone. pick one and hold the pace to the last word.`,
    );
  }
  if (heard && tgt && heard !== tgt) {
    return `that read as ${heard}, not ${tgt}. slow the pace and settle the intonation on the last beat.`;
  }
  if (heard) {
    return `that read as ${heard}. keep the volume even and land the last word a little quieter.`;
  }
  return "the tone never locked. try again a little slower and finish the last word.";
}

function simulateResult(target) {
  const e = String(target || "calm").toLowerCase();
  const feedback =
    e === "excited"
      ? `that read as ${e}. energy is there, but the pitch still settles too soon. punch the first stress and keep the brightness through the last word.`
      : e === "authoritative"
        ? `that read as ${e}. it is a bit light. ground the voice, cut the hedging pauses, and finish like you mean it.`
        : `that read as ${e}. the pace is even. let the pauses sit half a beat longer and land the last word more quietly so the intonation does not rush off.`;
  const probs =
    e === "excited"
      ? { calm: 0.16, excited: 0.66, authoritative: 0.18 }
      : e === "authoritative"
        ? { calm: 0.18, excited: 0.2, authoritative: 0.62 }
        : { calm: 0.64, excited: 0.22, authoritative: 0.14 };
  return {
    mixed: false,
    score: Math.round(probs[e] * 100),
    predicted: e,
    target: e,
    headline: `you hit ${e}`,
    feedback,
    tips: ["keep the volume even through the last beat."],
    probs,
    probabilities: TONES.map((name) => ({ label: name, value: probs[name] })),
  };
}

function toneBars(results) {
  const src = results?.probs || {};
  const list = results?.probabilities;
  const bars = TONES.map((name) => {
    let v = Number(src[name]);
    if (!Number.isFinite(v) && Array.isArray(list)) {
      const hit = list.find((p) => p.label === name);
      v = Number(hit?.value);
    }
    if (!Number.isFinite(v)) v = 0;
    return { name, value: Math.min(1, Math.max(0, v)) };
  });
  if (bars.every((b) => b.value === 0) && results?.predicted) {
    const hit = String(results.predicted).toLowerCase();
    return TONES.map((name) => ({ name, value: name === hit ? 0.7 : 0.15 }));
  }
  return bars;
}

function tryNote(results, target) {
  if (results?.tips?.[0]) return blopVoice(results.tips[0]);
  const body = coachingText(results);
  if (body) {
    const parts = body.split(/\. /).filter(Boolean);
    return blopVoice(parts[parts.length - 1] || body);
  }
  return noteFor(results, target);
}

const TONE_CUE = {
  calm: "say it calmly",
  excited: "say it with excitement",
  authoritative: "say it with authority",
};

function toneCue(target) {
  const key = String(target || "").toLowerCase();
  return TONE_CUE[key] || `say it ${key || "naturally"}`;
}

function baseLine({ view, recording, intro, prompt, results, errorCopy } = {}) {
  if (view === "home") return intro ? INTRO : TAP;
  if (view === "rec") return prompt?.t || TAP;
  if (view === "cue") return toneCue(prompt?.e);
  if (view === "load") return "hold on.";
  if (view === "err") return errorCopy || "that didn't work.";
  if (view === "good" || view === "unsure") return tryNote(results, prompt?.e);
  return TAP;
}

function spokenLine(state = {}, aside) {
  if (state.view !== "home") return baseLine(state);
  return aside?.text || baseLine(state);
}


// ==== blop/shaderFrag.js ====
const VERT = "attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}";
  const FRAGMENT_SOURCE = `
precision highp float;
uniform vec2 uRes,uLook,uDrag;
uniform float uSquashY,uLean,uOpen,uHappy,uHop,uTilt,uEyeS,uWave,uWavePh,uBrow,uSag,uEyeY;
uniform float uAsymOpen,uAsymBrow,uAsymSize,uAsymY,uSpin;
uniform vec3 uTint,uPage;

const vec3 KEY = vec3(-0.38, 0.68, 0.72);
const float SEP   = 0.26;
const float MID_Y = -0.013;
const float ER    = 0.107;
const float EL    = 0.079;

vec3 env(vec3 n){
  float t = clamp(n.y*0.5+0.5, 0.0, 1.0);
  vec3 sky  = vec3(1.10, 1.12, 1.16);
  vec3 mid  = vec3(0.62, 0.64, 0.70);
  vec3 grnd = vec3(0.18, 0.19, 0.22);
  return t > 0.5 ? mix(mid, sky, (t-0.5)*2.0) : mix(grnd, mid, t*2.0);
}

float capsule(vec2 p, vec2 a, vec2 b, float r){
  vec2 pa = p-a, ba = b-a;
  float hh = clamp(dot(pa,ba)/dot(ba,ba), 0.0, 1.0);
  return length(pa-ba*hh)-r;
}

// Every eye parameter now takes a per-side offset. Symmetry is only wanted
// when the point is stiffness; the rest of the time a mirrored face reads as
// dead. On an angry or surprised face one side stretches while the other
// squishes, and that tension is the expression.
float eyeField(vec2 q){
  float d = 1e9;
  for(int i=0;i<2;i++){
    float side = (i==0) ? -1.0 : 1.0;

    // ONE-SIDED. The sign picks which eye is affected; the other keeps its
    // baseline exactly. A raised brow is one eye unchanged and the other
    // shorter, not both moving in opposite directions.
    float mine  = (uAsymOpen*side > 0.0) ? abs(uAsymOpen) : 0.0;
    float bmine = (uAsymBrow*side > 0.0) ? uAsymBrow : 0.0;
    float smine = (uAsymSize*side > 0.0) ? abs(uAsymSize) : 0.0;
    float ymine = (uAsymY*side > 0.0) ? uAsymY : 0.0;

    float k    = clamp(uOpen*(1.0 - mine), 0.045, 1.8);
    float brow = uBrow + bmine;
    float sz   = max(0.35, uEyeS*(1.0 + smine));

    vec2 ctr = vec2(side*SEP, MID_Y + uEyeY + ymine);
    vec2 p = q - ctr;
    vec2 dir = vec2(sin(uTilt), cos(uTilt));
    vec2 pp = vec2(p.x, p.y/k);
    float dCap = capsule(pp, -dir*EL*sz, dir*EL*sz, ER*sz)*k;

    vec2 bn = vec2(side*sin(brow*1.15), cos(brow*1.15));
    // The lid must scale with how far the eye is open. It never mattered
    // while k was capped at 1; now that an eye can open WIDER than normal,
    // an unscaled lid clips it back into a square.
    float lid = (EL+ER)*sz*k*(1.0 - abs(brow)*0.72);
    dCap = max(dCap, dot(p, bn) - lid);

    float hh  = (EL+ER)*sz;
    float lidR = 1.55*hh;
    vec2  lc  = vec2(0.0, mix(-(lidR+hh+0.04), -lidR+hh*0.52, uHappy));
    dCap = max(dCap, (lidR - length(pp - lc))*k);

    d = min(d, dCap);
  }
  return d;
}

float bodyR(vec3 q){
  float w = uWave*sin(q.y*3.0 - uWavePh)*(1.0 - q.y*q.y*0.55);
  float sg = uSag*(smoothstep(0.50,-1.0,q.y)*0.20 - smoothstep(-0.30,1.0,q.y)*0.11);
  return 1.0 + w + sg;
}

vec3 shade(vec2 uv, out float alpha){
  float sy = uSquashY;
  float sx = 1.0/sqrt(max(sy,0.35));
  float mn = min(sx, sy);
  vec3 ro = vec3(0.0, 0.16 - uHop, 3.05);
  vec3 rd = normalize(vec3(uv*1.34, -2.6));

  mat3 Minv  = mat3(1.0/sx, 0.0, 0.0,  -uLean/sx, 1.0/sy, 0.0,  0.0, 0.0, 1.0/sx);
  mat3 MinvT = mat3(1.0/sx, -uLean/sx, 0.0,  0.0, 1.0/sy, 0.0,  0.0, 0.0, 1.0/sx);

  vec3 o = Minv*ro, d = Minv*rd;
  float rb = 1.0 + abs(uWave);
  float A = dot(d,d), B = 2.0*dot(o,d), C = dot(o,o)-rb*rb;
  float disc = B*B-4.0*A*C;
  if(disc < 0.0){ alpha = 0.0; return vec3(0.0); }
  float t = (-B-sqrt(disc))/(2.0*A);
  if(t < 0.0){ alpha = 0.0; return vec3(0.0); }

  float hit = 0.0;
  for(int i=0;i<16;i++){
    vec3 qq = Minv*(ro+rd*t);
    float dist = (length(qq) - bodyR(qq))*mn;
    if(dist < 0.0009){ hit = 1.0; break; }
    t += dist;
    if(t > 6.0) break;
  }
  if(hit < 0.5){ alpha = 0.0; return vec3(0.0); }
  alpha = 1.0;

  vec3 po = Minv*(ro+rd*t);
  vec2 e2 = vec2(0.0018, 0.0);
  vec3 nq = normalize(vec3(
    (length(po+e2.xyy)-bodyR(po+e2.xyy)) - (length(po-e2.xyy)-bodyR(po-e2.xyy)),
    (length(po+e2.yxy)-bodyR(po+e2.yxy)) - (length(po-e2.yxy)-bodyR(po-e2.yxy)),
    (length(po+e2.yyx)-bodyR(po+e2.yyx)) - (length(po-e2.yyx)-bodyR(po-e2.yyx))));
  vec3 n = normalize(MinvT*nq);
  vec3 v = -normalize(rd);

  vec3 K = normalize(KEY);
  float wrap = pow(clamp(dot(n,K)*0.5+0.5, 0.0, 1.0), 1.45);
  vec3 amb = env(n);
  vec3 hv = normalize(K+v);
  float spec = pow(clamp(dot(n,hv),0.0,1.0), 36.0)*0.22;

  vec3 col = uTint*(amb*0.92 + wrap*0.22) + spec*0.42;
  vec3 nBase = normalize(MinvT*normalize(po));
  float edge = smoothstep(0.17, 0.045, dot(nBase,v));
  col = mix(col, vec3(0.07,0.08,0.10), edge*0.88);

  float cs = cos(uSpin), sn = sin(uSpin);
  vec3 pr = vec3(cs*po.x + sn*po.z, po.y, -sn*po.x + cs*po.z);
  vec2 q2 = pr.xy - vec2(uLook.x*0.175, uLook.y*0.125) - uDrag;
  float ef = eyeField(q2);
  float m = 1.0-smoothstep(0.0, 0.006, ef);
  m *= smoothstep(0.0, 0.25, pr.z);   // the rotated face, so a spin hides it round the back
  col = mix(col, vec3(0.022) + spec*0.12, m);

  return col;
}

void main(){
  vec2 base = (gl_FragCoord.xy*2.0-uRes)/uRes.y;
  float px = 2.0/uRes.y;
  vec3 acc = vec3(0.0);
  float aacc = 0.0;
  for(int i=0;i<2;i++) for(int j=0;j<2;j++){
    float a;
    vec2 uv = base + vec2(float(i)-0.5, float(j)-0.5)*px*0.5;
    vec3 c = shade(uv, a);
    acc += c*a; aacc += a;
  }
  float alpha = aacc*0.25;
  vec3 col = aacc > 0.0 ? acc/aacc : vec3(0.0);

  float sy = uSquashY;
  vec2 sp = (base - vec2(0.0, -0.82))/vec2((0.60+uHop*0.35)/sqrt(max(sy,0.35)), 0.085+uHop*0.05);
  float sh = exp(-dot(sp,sp)*1.6)*0.45*clamp(1.0-uHop*1.1, 0.12, 1.0);

  /* Composite over transparency instead of over uPage, so the canvas is not an
     opaque rectangle sitting on top of whatever the page draws behind it.
     Premultiplied: shadow layer first, body over it. */
  vec3 shadeCol = vec3(0.02,0.022,0.028);
  float shA = sh*0.9;
  float a = alpha + shA*(1.0-alpha);
  vec3 pre = col*alpha + shadeCol*shA*(1.0-alpha);
  gl_FragColor = vec4(pre, a);
}
`;


// ==== blop/mount.js ====






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
function mountBlop(canvas, read) {
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


// ==== field.js ====
/* One loss surface for the page. Its minimum is the name.

   1. rasterName  – the name drawn as real text, so it spells correctly
   2. edt         – exact Euclidean distance transform of that raster
   3. field       – loss(x,y) = distance-to-name + low-frequency value noise
   4. contours    – marching squares on the field, levels spread to the edges
   5. descend     – momentum GD driven by the field's own gradient

   Everything lives in document pixels, so the trail sits in its own basin. */

const NAME = "Mikkel T. Ch\u00e1vez Petersen";
/* A hand, not a typeface set in a hand's clothing: the skeleton we trace is
   only ever as good as the letterforms it comes from, and a monoline script
   thins to a clean single centreline where a grotesque leaves stubs at every
   stem join. */
const FONT = (px) => `600 ${px}px Caveat, "Segoe Script", "Bradley Hand", cursive`;

/* ---------- name raster ---------- */
function rasterName(fontPx, ss = 2) {
  const probe = document.createElement("canvas").getContext("2d");
  probe.font = FONT(fontPx);
  try { probe.letterSpacing = `${(0.005 * fontPx).toFixed(2)}px`; } catch {}
  const m = probe.measureText(NAME);
  const asc = m.actualBoundingBoxAscent || fontPx * 0.75;
  const desc = m.actualBoundingBoxDescent || fontPx * 0.25;
  const w = Math.ceil(m.width), h = Math.ceil(asc + desc);

  const c = document.createElement("canvas");
  c.width = Math.ceil(w * ss);
  c.height = Math.ceil(h * ss);
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.scale(ss, ss);
  ctx.font = FONT(fontPx);
  try { ctx.letterSpacing = `${(0.005 * fontPx).toFixed(2)}px`; } catch {}
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#fff";
  ctx.fillText(NAME, 0, asc);

  const px = ctx.getImageData(0, 0, c.width, c.height).data;
  const ink = new Uint8Array(c.width * c.height);
  for (let i = 0, n = ink.length; i < n; i++) ink[i] = px[i * 4 + 3] > 110 ? 1 : 0;

  /* The period is the one glyph thinning cannot survive: a round blob has no
     centreline, so the skeletonizer lays it down as a row of cells and the
     initial reads "T_". It is also the one glyph whose position we can compute
     exactly, so lift it out of the raster and hand its centre to the track,
     which draws it the same way it draws the i-dots. */
  const dots = [];
  const di = NAME.indexOf(".");
  if (di > 0) {
    const x0 = probe.measureText(NAME.slice(0, di)).width;
    const x1 = probe.measureText(NAME.slice(0, di + 1)).width;
    const cx = (x0 + x1) / 2, cy = asc - fontPx * 0.045;
    const bx0 = Math.max(0, Math.floor(x0 * ss)), bx1 = Math.min(c.width, Math.ceil(x1 * ss));
    const by0 = Math.max(0, Math.floor((asc - fontPx * 0.17) * ss));
    const by1 = Math.min(c.height, Math.ceil((asc + fontPx * 0.07) * ss));
    for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) ink[y * c.width + x] = 0;
    dots.push([cx * ss, cy * ss]);
  }
  return { ink, w: c.width, h: c.height, ss, cssW: w, cssH: h, fontPx, dots };
}

/* ---------- exact EDT (Felzenszwalb & Huttenlocher) ---------- */
const INF = 1e20;
function edt1d(f, d, v, z, n) {
  let k = 0;
  v[0] = 0; z[0] = -INF; z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q; z[k] = s; z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

/* squared EDT of a binary grid: 0 inside ink, growing outward */
function edt(bin, w, h) {
  const out = new Float64Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = bin[i] ? 0 : INF;
  const n = Math.max(w, h);
  const f = new Float64Array(n), d = new Float64Array(n);
  const v = new Int32Array(n), z = new Float64Array(n + 1);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = out[y * w + x];
    edt1d(f, d, v, z, h);
    for (let y = 0; y < h; y++) out[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    const off = y * w;
    for (let x = 0; x < w; x++) f[x] = out[off + x];
    edt1d(f, d, v, z, w);
    for (let x = 0; x < w; x++) out[off + x] = Math.sqrt(d[x]);
  }
  return out;
}

/* ---------- noise ---------- */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const smoothstep = (t) => t * t * (3 - 2 * t);
function lattice(n, rnd) {
  const v = new Float32Array(n * n);
  for (let i = 0; i < v.length; i++) v[i] = rnd() * 2 - 1;
  return { n, v };
}
function noiseAt(L, x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = smoothstep(x - xi), fy = smoothstep(y - yi);
  const c = (i, j) => L.v[(((j % L.n) + L.n) % L.n) * L.n + (((i % L.n) + L.n) % L.n)];
  const a = c(xi, yi), b = c(xi + 1, yi), d = c(xi, yi + 1), e = c(xi + 1, yi + 1);
  const t = a + (b - a) * fx, u = d + (e - d) * fx;
  return t + (u - t) * fy;
}

/* ---------- the field ---------- */
function buildField({ docW, docH, raster, nameX, nameY, cell = 4, seed = 0x5eed1a9 }) {
  const cols = Math.ceil(docW / cell) + 1;
  const rows = Math.ceil(docH / cell) + 1;

  // stamp the name into the coarse grid, then distance-transform the whole page
  const bin = new Uint8Array(cols * rows);
  const s = raster.ss;
  for (let j = 0; j < rows; j++) {
    const py = j * cell - nameY;
    const ry = Math.round(py * s);
    if (ry < 0 || ry >= raster.h) continue;
    for (let i = 0; i < cols; i++) {
      const rx = Math.round((i * cell - nameX) * s);
      if (rx < 0 || rx >= raster.w) continue;
      if (raster.ink[ry * raster.w + rx]) bin[j * cols + i] = 1;
    }
  }

  const dist = edt(bin, cols, rows);
  const rnd = mulberry32(seed);
  const L1 = lattice(16, rnd), L2 = lattice(32, rnd), L3 = lattice(64, rnd);

  /* Terrain first, name second. The distance transform is passed through log1p
     so it only dominates within a few tens of pixels of the letters; past that
     the octave noise and the placed features take over, which is what gives
     ridges, saddles and competing basins instead of one set of rings. A wide
     well centred on the name then guarantees it is still the global minimum. */
  const feats = [];
  const band = nameY + raster.cssH;
  for (let i = 0; i < 6; i++) {
    feats.push({
      x: docW * (0.06 + 0.9 * rnd()),
      y: band * (0.05 + 0.95 * rnd()),
      s: 60 + rnd() * 150,
      d: (rnd() < 0.5 ? -1 : 1) * (70 + rnd() * 120),
    });
  }
  for (let i = 0; i < 11; i++) {
    feats.push({
      x: docW * rnd(),
      y: band + (docH - band) * rnd(),
      s: 110 + rnd() * 300,
      d: (rnd() < 0.5 ? -1 : 1) * (90 + rnd() * 190),
    });
  }

  const nameCx = nameX + raster.cssW / 2, nameCy = nameY + raster.cssH / 2;
  const nameS = Math.max(150, raster.cssW * 0.42);

  const f = new Float32Array(cols * rows);
  let max = 0, min = Infinity;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = i * cell, y = j * cell;
      let v = Math.log1p(dist[j * cols + i] * cell) * 36
        + noiseAt(L1, x / 540, y / 540) * 140
        + noiseAt(L2, x / 225, y / 225) * 62
        + noiseAt(L3, x / 92, y / 92) * 24;
      for (let k = 0; k < feats.length; k++) {
        const ft = feats[k];
        const dx = x - ft.x, dy = y - ft.y;
        v += ft.d * Math.exp(-(dx * dx + dy * dy) / (2 * ft.s * ft.s));
      }
      const ndx = x - nameCx, ndy = y - nameCy;
      v -= 330 * Math.exp(-(ndx * ndx + ndy * ndy) / (2 * nameS * nameS));
      f[j * cols + i] = v;
      if (v > max) max = v;
      if (v < min) min = v;
    }
  }

  const sample = (x, y) => {
    const gx = Math.min(cols - 1.001, Math.max(0, x / cell));
    const gy = Math.min(rows - 1.001, Math.max(0, y / cell));
    const i = Math.floor(gx), j = Math.floor(gy);
    const tx = gx - i, ty = gy - j;
    const a = f[j * cols + i], b = f[j * cols + i + 1];
    const c = f[(j + 1) * cols + i], d = f[(j + 1) * cols + i + 1];
    return (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * ty;
  };

  const grad = (x, y) => {
    const e = cell;
    return [(sample(x + e, y) - sample(x - e, y)) / (2 * e), (sample(x, y + e) - sample(x, y - e)) / (2 * e)];
  };

  return { f, cols, rows, cell, max, min, sample, grad };
}

/* ---------- contour extraction ---------- */
const r1 = (n) => Math.round(n * 10) / 10;

function contours(field, levels = 22) {
  const { f, cols, rows, cell, max, min } = field;
  const isos = [];
  // evenly spaced through the surface's actual range: real topography, not rings
  for (let i = 0; i < levels; i++) isos.push(min + (max - min) * ((i + 0.5) / levels));

  const segs = [];
  isos.forEach((iso) => {
    for (let j = 0; j < rows - 1; j++) {
      for (let i = 0; i < cols - 1; i++) {
        const a = f[j * cols + i], b = f[j * cols + i + 1];
        const c = f[(j + 1) * cols + i + 1], e = f[(j + 1) * cols + i];
        const code = (a > iso ? 8 : 0) | (b > iso ? 4 : 0) | (c > iso ? 2 : 0) | (e > iso ? 1 : 0);
        if (code === 0 || code === 15) continue;
        const x0 = i * cell, y0 = j * cell;
        const T = () => [x0 + cell * ((iso - a) / (b - a)), y0];
        const R = () => [x0 + cell, y0 + cell * ((iso - b) / (c - b))];
        const B = () => [x0 + cell * ((iso - e) / (c - e)), y0 + cell];
        const Lf = () => [x0, y0 + cell * ((iso - a) / (e - a))];
        const seg = (p, q) => { segs.push([p[0], p[1], q[0], q[1]]); };
        switch (code) {
          case 1: case 14: seg(Lf(), B()); break;
          case 2: case 13: seg(B(), R()); break;
          case 3: case 12: seg(Lf(), R()); break;
          case 4: case 11: seg(T(), R()); break;
          case 6: case 9: seg(T(), B()); break;
          case 7: case 8: seg(Lf(), T()); break;
          case 5: seg(Lf(), T()); seg(B(), R()); break;
          case 10: seg(Lf(), B()); seg(T(), R()); break;
          default: break;
        }
      }
    }
  });
  return segs;
}

/* Group contour segments into rings by distance from a point, so a pulse can
   travel outward from an epicentre instead of level by level. */
function ringsAround(segs, cx, cy, count = 30) {
  let maxD = 0;
  const d = new Float64Array(segs.length);
  for (let i = 0; i < segs.length; i++) {
    const mx = (segs[i][0] + segs[i][2]) / 2, my = (segs[i][1] + segs[i][3]) / 2;
    const v = Math.hypot(mx - cx, my - cy);
    d[i] = v;
    if (v > maxD) maxD = v;
  }
  const step = (maxD || 1) / count;
  const buckets = Array.from({ length: count }, () => "");
  for (let i = 0; i < segs.length; i++) {
    const b = Math.min(count - 1, Math.floor(d[i] / step));
    const s = segs[i];
    buckets[b] += `M${r1(s[0])} ${r1(s[1])}L${r1(s[2])} ${r1(s[3])}`;
  }
  return buckets;
}

/* ---------- centerline writing track ----------
   Zhang-Suen thinning of the name raster gives a one-pixel skeleton: the
   medial axis of the letterforms. Walking it in reading order is what a pen
   does, so the trail writes the letters instead of outlining them. The
   skeleton is also exactly the floor of the distance field the background
   contours, so pen and terrain remain the same object. */
function skeletonize(src, w, h) {
  const im = Uint8Array.from(src);
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : im[y * w + x]);
  let changed = true;
  const kill = [];
  while (changed) {
    changed = false;
    for (let step = 0; step < 2; step++) {
      kill.length = 0;
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          if (!im[y * w + x]) continue;
          const p2 = at(x, y - 1), p3 = at(x + 1, y - 1), p4 = at(x + 1, y), p5 = at(x + 1, y + 1);
          const p6 = at(x, y + 1), p7 = at(x - 1, y + 1), p8 = at(x - 1, y), p9 = at(x - 1, y - 1);
          const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (b < 2 || b > 6) continue;
          const seq = [p2, p3, p4, p5, p6, p7, p8, p9, p2];
          let a = 0;
          for (let i = 0; i < 8; i++) if (seq[i] === 0 && seq[i + 1] === 1) a++;
          if (a !== 1) continue;
          if (step === 0) {
            if (p2 * p4 * p6 !== 0) continue;
            if (p4 * p6 * p8 !== 0) continue;
          } else {
            if (p2 * p4 * p8 !== 0) continue;
            if (p2 * p6 * p8 !== 0) continue;
          }
          kill.push(y * w + x);
        }
      }
      if (kill.length) { changed = true; for (const k of kill) im[k] = 0; }
    }
  }
  return im;
}

function nameTrack(raster, nameX, nameY) {
  const { ink, w, h, ss } = raster;
  // the raster knows its own em; fall back to its height if it was built elsewhere
  const fontPx = raster.fontPx || h / ss / 1.32;
  const given = raster.dots || [];

  /* Separate the small marks — i-dots, the period after T, the accent on á —
     before thinning. They are their own connected components, and a skeleton
     of a blob that small is noise; drawing them as marks keeps them, while the
     letters keep the strict spur filter that makes the shapes precise. */
  const label = new Int32Array(w * h).fill(-1);
  const body = new Uint8Array(w * h);
  const marks = [];
  const stack = [];
  let next = 0;
  for (let s = 0; s < ink.length; s++) {
    if (!ink[s] || label[s] !== -1) continue;
    const id = next++;
    stack.length = 0;
    stack.push(s);
    label[s] = id;
    const cells = [];
    while (stack.length) {
      const q = stack.pop();
      cells.push(q);
      const qx = q % w, qy = (q / w) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = qx + dx, ny = qy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const n = ny * w + nx;
          if (!ink[n] || label[n] !== -1) continue;
          label[n] = id;
          stack.push(n);
        }
      }
    }
    /* A dot is a fraction of the em, not a fixed number of cells: this
       threshold has to grow with the raster or a period at a larger size
       falls through to the thinner, which collapses a round blob into a
       one-pixel dash sitting on the baseline. */
    if (cells.length <= 34 * ss * ss) {
      let sx = 0, sy = 0;
      for (const q of cells) { sx += q % w; sy += (q / w) | 0; }
      marks.push([sx / cells.length, sy / cells.length]);
    } else {
      for (const q of cells) body[q] = 1;
    }
  }

  const sk = skeletonize(body, w, h);
  const seen = new Uint8Array(w * h);
  const N = [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
  const idx = (x, y) => y * w + x;
  const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && sk[idx(x, y)] === 1;
  const deg = (x, y) => N.reduce((n, [dx, dy]) => n + (on(x + dx, y + dy) ? 1 : 0), 0);

  const strokes = [];
  const walk = (sx, sy) => {
    const line = [];
    let x = sx, y = sy, dir = null;
    for (;;) {
      seen[idx(x, y)] = 1;
      line.push([x, y]);
      let best = null, bestScore = -Infinity;
      for (const [dx, dy] of N) {
        const nx = x + dx, ny = y + dy;
        if (!on(nx, ny) || seen[idx(nx, ny)]) continue;
        const score = dir ? dir[0] * dx + dir[1] * dy : 1;
        if (score > bestScore) { bestScore = score; best = [nx, ny, dx, dy]; }
      }
      if (!best) break;
      dir = [best[2], best[3]];
      x = best[0]; y = best[1];
    }
    if (line.length > 4) strokes.push(line);
  };

  const ends = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (on(x, y) && deg(x, y) === 1) ends.push([x, y]);
  ends.sort((a, b) => a[0] - b[0]);
  for (const [x, y] of ends) if (!seen[idx(x, y)]) walk(x, y);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (on(x, y) && !seen[idx(x, y)]) walk(x, y);

  /* Second net, after thinning. A period whose ink area lands just over the
     component threshold survives to the skeletonizer, which collapses a round
     blob to a single row of cells — a dash on the baseline where a dot
     belongs. Anything this short and this flat was a dot before it was
     thinned, so take it back out of the letters and re-file it as a mark. */
  const flatMax = 0.10 * fontPx * ss, spanMax = 0.34 * fontPx * ss;
  for (let i = strokes.length - 1; i >= 0; i--) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [sx, sy] of strokes[i]) {
      if (sx < x0) x0 = sx;
      if (sx > x1) x1 = sx;
      if (sy < y0) y0 = sy;
      if (sy > y1) y1 = sy;
    }
    const bw = x1 - x0, bh = y1 - y0;
    // flat in Y specifically: a thin vertical sliver is a real stem, not a dot
    if (bw <= spanMax && bh <= flatMax) {
      marks.push([(x0 + x1) / 2, (y0 + y1) / 2]);
      strokes.splice(i, 1);
    }
  }

  // each small mark becomes a short stroke, so the pen renders it as a dot
  const rMark = Math.max(0.5, 0.5 * ss);
  for (const [mx, my] of marks.concat(given)) {
    strokes.push([[mx - rMark, my], [mx, my], [mx + rMark, my]]);
  }

  strokes.sort((a, b) => Math.min(...a.map((p) => p[0])) - Math.min(...b.map((p) => p[0])));

  // strict left-to-right, but each stroke is entered from whichever end is
  // nearer the pen: reading order is preserved and the travel moves stay short.
  const ordered = strokes
    .map((s) => s.map(([x, y]) => [nameX + x / ss, nameY + y / ss]))
    .map((pts) => pts.map((p, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      return [(a[0] + p[0] * 2 + b[0]) / 4, (a[1] + p[1] * 2 + b[1]) / 4];
    }));

  const track = [];
  const pen = [];
  let cursor = null;
  ordered.forEach((s, si) => {
    const head = s[0], tail = s[s.length - 1];
    let run = s;
    if (cursor) {
      const dh = (head[0] - cursor[0]) ** 2 + (head[1] - cursor[1]) ** 2;
      const dt = (tail[0] - cursor[0]) ** 2 + (tail[1] - cursor[1]) ** 2;
      if (dt < dh) run = s.slice().reverse();
    }
    // finish on the rightmost point of the last stroke, so the run converges at
    // the end of the name rather than stopping inside a letter
    if (si === ordered.length - 1 && run[run.length - 1][0] < run[0][0]) run = run.slice().reverse();
    run.forEach((p, i) => { track.push(p); pen.push(i > 0 || !cursor); });
    cursor = track[track.length - 1];
  });
  return { pts: track, pen };
}


/* highest grid point inside a box — a real peak to start the descent from */
function peakIn(field, x0, x1, y0, y1) {
  const { f, cols, rows, cell } = field;
  let best = -Infinity, bx = x0, by = y0;
  const i0 = Math.max(0, Math.floor(x0 / cell)), i1 = Math.min(cols - 1, Math.ceil(x1 / cell));
  const j0 = Math.max(0, Math.floor(y0 / cell)), j1 = Math.min(rows - 1, Math.ceil(y1 / cell));
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const v = f[j * cols + i];
      if (v > best) { best = v; bx = i * cell; by = j * cell; }
    }
  }
  return [bx, by];
}

/* ---------- the run ---------- */
function descend(field, track, { start, docW = 1e9, docH = 1e9, bandTop = 14, bandBottom = 1e9, seed = 0x13579b } = {}) {
  const targets = track.pts;
  const pen = track.pen;
  const traj = [];
  const mode = [];
  const first = targets[0];
  const clampX = (x) => Math.min(docW - 14, Math.max(14, x));
  const clampY = (y) => Math.min(bandBottom, Math.max(bandTop, y));
  const rnd = mulberry32(seed);

  /* The approach is momentum SGD on the drawn surface itself: every step is
     -lr * (grad f + minibatch noise), so the iterates run down the true
     steepest-descent direction and cross the contours the page draws. */
  let p = start ? start.slice() : [clampX(first[0] - 78), clampY(bandTop + 6)];
  let v = [0, 0];
  let lr = 3, temp = 12;
  const mu = 0.8;
  const STEPS = 220;
  const iterates = [];
  const grads = [];
  for (let i = 0; i < STEPS; i++) {
    const [gx, gy] = field.grad(p[0], p[1]);
    const nx = (rnd() * 2 - 1) * temp, ny = (rnd() * 2 - 1) * temp;
    v = [mu * v[0] - lr * (gx + nx * 0.02), mu * v[1] - lr * (gy + ny * 0.02)];
    const sp = Math.hypot(v[0], v[1]);
    if (sp > 10) { v[0] *= 10 / sp; v[1] *= 10 / sp; }
    grads.push([gx, gy, lr]);
    p = [clampX(p[0] + v[0]), clampY(p[1] + v[1])];
    traj.push([p[0], p[1]]);
    mode.push("run");
    iterates.push([p[0], p[1]]);
    lr *= 0.991;
    temp *= 0.965;
    // the run stops where it lands in the basin. It is never steered toward the
    // pen's starting point, so it cannot slide along an invisible floor.
    if (p[1] >= bandBottom - 10) break;
  }

  // pen lift: landing point to the first stroke, drawn faintly
  const lift = 22;
  const from = traj.length ? traj[traj.length - 1] : [first[0], first[1] - 40];
  for (let i = 1; i <= lift; i++) {
    const t = i / lift;
    traj.push([from[0] + (first[0] - from[0]) * t, from[1] + (first[1] - from[1]) * t]);
    mode.push("travel");
  }
  p = traj[traj.length - 1].slice();

  // writing: the pen tracks the level set; a light pull from the field's own
  // gradient keeps it seated in the stroke instead of cutting corners.
  const writeStart = traj.length;
  const penStart = p.slice();
  let vv = [0, 0];
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    const [gx, gy] = field.grad(p[0], p[1]);
    const fx = (t[0] - p[0]) * 0.78 - gx * 0.25;
    const fy = (t[1] - p[1]) * 0.78 - gy * 0.25;
    vv = [0.3 * vv[0] + fx, 0.3 * vv[1] + fy];
    p = [p[0] + vv[0], p[1] + vv[1]];
    traj.push([p[0], p[1]]);
    mode.push(pen[i] ? "draw" : "travel");
  }

  // settle into the minimum
  const last = targets[targets.length - 1];
  for (let i = 0; i < 60; i++) {
    vv = [0.6 * vv[0] - 0.5 * (p[0] - last[0]), 0.6 * vv[1] - 0.5 * (p[1] - last[1])];
    p = [p[0] + vv[0], p[1] + vv[1]];
    traj.push([p[0], p[1]]);
    mode.push("draw");
  }
  return { pts: traj, mode, iterates, grads, runLen: iterates.length, writeStart, penStart };
}

/* ---------- the handwriting model ----------

   θ is the state of a hand, not of the letters: per stroke, an affine
   (scale, slant, shear, offset) plus two low-frequency warp terms. The target
   θ* is the identity, so the model at θ* reproduces the signature exactly.

   L(θ) = mean squared distance from the target strokes. The model is linear
   in θ, so L is a genuine convex quadratic and the gradient below is its
   exact derivative — no finite differences. Steps are minibatch (a random
   subset of points each step), so the loss falls the way a real training
   curve falls: downward, but not monotonically.

   Per-parameter step sizes are 1/H on the diagonal of the Hessian, constant
   here and precomputed. That is diagonal Newton; without it a single lr
   cannot serve both a 40px letter and a 2px i-dot. */
function makeTrainer(track, { seed = 0x51ed270b, lr = 0.35, mu = 0.86, batch = 0.45, epochSteps = 15, epochs = 8 } = {}) {
  const rnd = mulberry32(seed);
  const n0 = (s) => s * (rnd() * 2 - 1);
  const strokes = [];
  let cur = null;
  for (let i = 0; i < track.pts.length; i++) {
    if (!cur || !track.pen[i]) { cur = { i0: i, q: [] }; strokes.push(cur); }
    cur.q.push(track.pts[i]);
  }

  /* Mostly per-letter, with a light shared drift on top. A purely global error
     just slides the whole word into place, which reads as text being nudged
     rather than a hand learning to write. */
  const G = [n0(0.05), n0(0.18), n0(2.0), n0(0.04), n0(0.07), n0(1.8), n0(0.8), n0(1.2)];

  for (const s of strokes) {
    const n = s.q.length;
    let cx = 0, cy = 0;
    for (const [x, y] of s.q) { cx += x; cy += y; }
    cx /= n; cy /= n;
    let r2 = 0;
    for (const [x, y] of s.q) r2 += (x - cx) ** 2 + (y - cy) ** 2;
    const R = Math.max(1.2, Math.sqrt(r2 / n));
    s.cx = cx; s.cy = cy; s.R = R; s.n = n;
    s.u = new Float64Array(n); s.v = new Float64Array(n);
    s.sx = new Float64Array(n); s.sy = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      s.u[i] = (s.q[i][0] - cx) / R;
      s.v[i] = (s.q[i][1] - cy) / R;
      const t = n > 1 ? i / (n - 1) : 0;
      s.sx[i] = Math.sin(Math.PI * t);
      s.sy[i] = Math.sin(2 * Math.PI * t);
    }
    let hu = 0, hv = 0, hsx = 0, hsy = 0;
    for (let i = 0; i < n; i++) {
      hu += (s.u[i] * R) ** 2; hv += (s.v[i] * R) ** 2;
      hsx += s.sx[i] ** 2; hsy += s.sy[i] ** 2;
    }
    const inv = (h) => 1 / Math.max(1e-4, (2 / n) * h);
    s.ih = [inv(hu), inv(hv), 0.5, inv(hu), inv(hv), 0.5, inv(hsx), inv(hsy)];
    s.init = Float64Array.from([
      1 + G[0] + n0(0.16), G[1] + n0(0.42), G[2] + n0(4.5),
      G[3] + n0(0.14), 1 + G[4] + n0(0.20), G[5] + n0(4.0),
      G[6] + n0(2.4), G[7] + n0(3.0),
    ]);
    s.p = Float64Array.from(s.init);
    s.vel = new Float64Array(8);
  }

  const maxSteps = epochSteps * epochs;
  const out = new Array(track.pts.length);
  let steps = 0;

  const render = () => {
    for (const s of strokes) {
      const [a, b, e, c, d, f, wx, wy] = s.p;
      for (let i = 0; i < s.n; i++) {
        out[s.i0 + i] = [
          s.cx + (a * s.u[i] + b * s.v[i]) * s.R + e + wx * s.sx[i],
          s.cy + (c * s.u[i] + d * s.v[i]) * s.R + f + wy * s.sy[i],
        ];
      }
    }
    return out;
  };

  const loss = () => {
    let sum = 0, N = 0;
    for (const s of strokes) {
      const [a, b, e, c, d, f, wx, wy] = s.p;
      for (let i = 0; i < s.n; i++) {
        const rx = (a - 1) * s.u[i] * s.R + b * s.v[i] * s.R + e + wx * s.sx[i];
        const ry = c * s.u[i] * s.R + (d - 1) * s.v[i] * s.R + f + wy * s.sy[i];
        sum += rx * rx + ry * ry; N++;
      }
    }
    return N ? sum / N : 0;
  };

  const step = () => {
    if (steps >= maxSteps) return;
    for (const s of strokes) {
      const [a, b, e, c, d, f, wx, wy] = s.p;
      const g = [0, 0, 0, 0, 0, 0, 0, 0];
      let N = 0;
      for (let i = 0; i < s.n; i++) {
        if (s.n > 6 && rnd() > batch) continue;
        const u = s.u[i], v = s.v[i], R = s.R, px = s.sx[i], py = s.sy[i];
        const rx = (a - 1) * u * R + b * v * R + e + wx * px;
        const ry = c * u * R + (d - 1) * v * R + f + wy * py;
        g[0] += rx * u * R; g[1] += rx * v * R; g[2] += rx; g[6] += rx * px;
        g[3] += ry * u * R; g[4] += ry * v * R; g[5] += ry; g[7] += ry * py;
        N++;
      }
      if (!N) continue;
      for (let k = 0; k < 8; k++) {
        s.vel[k] = mu * s.vel[k] - lr * s.ih[k] * ((2 / N) * g[k]);
        s.p[k] += s.vel[k];
      }
    }
    steps++;
  };

  const L0 = loss();
  return {
    epochs, epochSteps, maxSteps,
    get steps() { return steps; },
    get epoch() { return Math.min(epochs, Math.floor(steps / epochSteps) + 1); },
    get done() { return steps >= maxSteps; },
    get loss() { return L0 ? loss() / L0 : 0; },
    step,
    points: render,
    reset() {
      steps = 0;
      for (const s of strokes) { s.p.set(s.init); s.vel.fill(0); }
      return render();
    },
    snap() {
      steps = maxSteps;
      for (const s of strokes) { s.p.set([1, 0, 0, 0, 1, 0, 0, 0]); s.vel.fill(0); }
      return render();
    },
  };
}

/* The pen has mass: the same spring that seats the written line inside the
   stroke in descend(), so a trained frame and the finished drawing are made
   the same way and the handoff between them is invisible. */
function penFilter(field, start, pts, pen) {
  let p = start.slice(), vv = [0, 0];
  const out = new Array(pts.length);
  for (let i = 0; i < pts.length; i++) {
    const t = pts[i];
    /* A stroke start is a landing, not a continuation. Carrying the velocity
       of a long travel move into it makes the pen overshoot and spring back,
       which is survivable inside a letter and fatal on a mark: a one-pixel
       period smears into a six-pixel dash. Set the nib down where it was
       aimed and let the spring start from rest. */
    if (pen && !pen[i]) { p = t.slice(); vv = [0, 0]; out[i] = p; continue; }
    const [gx, gy] = field.grad(p[0], p[1]);
    vv = [0.3 * vv[0] + (t[0] - p[0]) * 0.78 - gx * 0.25, 0.3 * vv[1] + (t[1] - p[1]) * 0.78 - gy * 0.25];
    p = [p[0] + vv[0], p[1] + vv[1]];
    out[i] = p;
  }
  return out;
}

/* split a run into contiguous same-mode pieces, with each piece's start
   distance along the whole run, so the write-on stays one timed sweep */
function pieces(run) {
  const { pts, mode } = run;
  const out = [];
  let total = 0;
  let cur = { mode: mode[0], pts: [pts[0]], start: 0, len: 0, i0: 0 };
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (mode[i] !== cur.mode) {
      out.push(cur);
      cur = { mode: mode[i], pts: [pts[i - 1]], start: total, len: 0, i0: i - 1 };
    }
    cur.pts.push(pts[i]);
    cur.len += d;
    total += d;
  }
  out.push(cur);
  return { list: out.filter((p) => p.pts.length > 1), total };
}

function pathData(pts) {
  return "M" + pts.map(([x, y]) => `${r1(x)} ${r1(y)}`).join("L");
}

function bounds(pts) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

function svgEl(tag, attrs) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}


// ==== scene.js ====


/* Field and trail are two views of one surface, both in LAYOUT pixels: the
   background SVG draws the contours, the h1's SVG draws the run that descends
   them. Layout pixels matter — getBoundingClientRect returns visual pixels,
   which page zoom scales, and mixing the two is what tore the header away from
   its own basin when the page was zoomed. */
function offsetIn(el, container) {
  let x = 0, y = 0;
  for (let n = el; n && n !== container; n = n.offsetParent) {
    x += n.offsetLeft;
    y += n.offsetTop;
    if (!n.offsetParent || n.offsetParent === container) break;
  }
  return [x, y];
}

function mountScene({ fieldSvg, nameHost, mathHost, fontPx = 50, replayMs = 26000 }) {
  let anims = [];
  let timer = 0, resizeTimer = 0;
  let parts = [], dots = [], notes = [], rings = [], leader = null, bloom = null, totalLen = 0, slowLen = 0;
  let sheen = null, sheenRaf = 0;
  let trainer = null, fieldRef = null, writeStart = 0, penStart = [0, 0], penFlags = null;
  let trainTick = 0, trainTimer = 0, descClock = null, playT0 = 0;
  let builtKey = "";
  let recheckDepth = 0, recheckTimer = 0;
  const r1 = (n) => Math.round(n * 10) / 10;

  /* Content height, measured WITHOUT the field. Any scrollHeight of an
     ancestor includes the absolutely-positioned field, so feeding one back in
     lets the field read its own height and ratchet upward on every rebuild. */
  const contentHeight = (container) => {
    const cTop = container.getBoundingClientRect().top;
    let h = 0;
    for (const el of container.children) {
      if (el === fieldSvg) continue;
      const r = el.getBoundingClientRect();
      if (r.height) h = Math.max(h, r.bottom - cTop);
    }
    return Math.max(320, Math.round(h), container.clientHeight, window.innerHeight);
  };

  const build = () => {
    const container = fieldSvg.parentElement;
    const docW = Math.max(320, container.clientWidth);
    const docH = contentHeight(container);
    /* The header scales as a whole rather than wrapping or clipping: rasterise
       once at the target size, and if the ink is wider than the column allows,
       rasterise again at the size that fits. Everything downstream — field,
       track, run — is generated from the result, so one measurement governs. */
    const [nameX, nameY] = offsetIn(nameHost, container);
    const margin = 16;
    const avail = Math.max(120, docW - nameX - margin);
    let raster = rasterName(fontPx);
    if (raster.cssW > avail) {
      raster = rasterName(Math.max(17, fontPx * (avail / raster.cssW)));
    }

    const field = buildField({ docW, docH, raster, nameX, nameY, cell: 4 });
    // remember exactly what this build was measured against, so the watcher
    // compares against the built geometry rather than a later DOM snapshot
    builtKey = [nameX, nameY, nameHost.offsetWidth, docW, docH].join("|");
    const track = nameTrack(raster, nameX, nameY);
    /* The pen starts untrained. θ₀ is a perturbed hand — wrong slant, wrong
       size, drifting baseline — and the first pass writes the name with it;
       the training loop below descends L(θ) until the letters are right. */
    trainer = makeTrainer(track);
    fieldRef = field;
    penFlags = track.pen;
    const drawn = { pts: trainer.snap(), pen: track.pen };
    // start on a real summit of the surface above the name: the run then
    // visibly crosses contour after contour on its way down into the basin
    const bandTop = 16;
    const bandBottom = nameY - 4;
    const peak = peakIn(field, 16, nameX + raster.cssW * 0.55, bandTop, Math.max(bandTop + 8, bandBottom - 10));
    const run = descend(field, drawn, { docW, docH, bandTop, bandBottom, start: peak });
    writeStart = run.writeStart;
    penStart = run.penStart;
    const { list, total } = pieces(run);
    totalLen = total;

    fieldSvg.setAttribute("viewBox", `0 0 ${Math.round(docW)} ${Math.round(docH)}`);
    fieldSvg.setAttribute("preserveAspectRatio", "none");
    fieldSvg.style.height = `${Math.round(docH)}px`;
    const frag = document.createDocumentFragment();
    rings = [];
    /* The contour segments are grouped by distance from where the run converges,
       so the echo can travel outward from that point. Visually identical to
       grouping by level — same lines, same weight. */
    const epi = run.pts[run.pts.length - 1];
    ringsAround(contours(field), epi[0], epi[1]).forEach((d) => {
      if (!d) return;
      const el = svgEl("path", {
        d,
        fill: "none",
        stroke: "var(--line, #E6E2D8)",
        "stroke-width": "0.6",
        "stroke-linecap": "round",
        opacity: "0.09",
      });
      frag.appendChild(el);
      rings.push(el);
    });
    fieldSvg.replaceChildren(frag);

    const bb = bounds(run.pts);
    const pad = 8;
    const svg = svgEl("svg", {
      viewBox: `${bb.x0 - pad} ${bb.y0 - pad} ${bb.w + pad * 2} ${bb.h + pad * 2}`,
      role: "img",
      "aria-label": NAME,
    });
    svg.appendChild(svgEl("title", {})).textContent = NAME;
    svg.style.position = "absolute";
    svg.style.left = `${bb.x0 - pad - nameX}px`;
    svg.style.top = `${bb.y0 - pad - nameY}px`;
    svg.style.width = `${bb.w + pad * 2}px`;
    svg.style.height = `${bb.h + pad * 2}px`;
    svg.style.overflow = "visible";
    svg.style.cursor = "pointer";

    /* One paint server helper, kept for the step annotations. */
    const defs = svgEl("defs", {});
    svg.appendChild(defs);

    parts = list.map((piece) => {
      const len = Math.max(1, Math.round(piece.len));
      const travel = piece.mode === "travel";
      const stepping = piece.mode === "run";
      const el = svgEl("path", {
        d: pathData(piece.pts),
        fill: "none",
        stroke: "var(--line, #E6E2D8)",
        "stroke-width": travel ? "0.9" : stepping ? "0.7" : "1.7",
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        opacity: travel ? "0.2" : stepping ? "0.45" : "1",
        "stroke-dasharray": `${len} ${len}`,
        "stroke-dashoffset": String(len),
      });
      svg.appendChild(el);
      return { el, len, start: piece.start, mode: piece.mode, i0: piece.i0, pts: piece.pts, dash: `${len} ${len}`, opacity: travel ? 0.2 : stepping ? 0.45 : 1 };
    });

    slowLen = (list.find((p) => p.mode !== "run") || { start: total }).start || total;

    /* One mark per iterate on the approach: the run is a sequence of steps, and
       the marks are where the optimizer actually evaluated. */
    dots = [];
    let acc = 0;
    const it = run.iterates || [];
    for (let i = 1; i < it.length; i++) {
      acc += Math.hypot(it[i][0] - it[i - 1][0], it[i][1] - it[i - 1][1]);
      if (i % 2) continue;
      const c = svgEl("circle", {
        cx: String(Math.round(it[i][0] * 10) / 10),
        cy: String(Math.round(it[i][1] * 10) / 10),
        r: "2.2",
        fill: "var(--line, #E6E2D8)",
        opacity: "0.95",
      });
      svg.appendChild(c);
      dots.push({ el: c, start: acc });
    }

    leader = svgEl("path", {
      d: pathData(run.pts), fill: "none", stroke: "var(--run, #ffffff)", "stroke-width": "2.6",
      "stroke-linecap": "round", "stroke-linejoin": "round",
      "stroke-dasharray": `18 ${Math.round(total) * 2}`, "stroke-dashoffset": "18", opacity: "0",
    });

    /* The opening seconds show the work: at the first few iterates, the actual
       step vector -η∇L as an arrow with its gradient magnitude, under the
       update rule set in italic serif. Once the run picks up speed the
       annotation clears and it just writes. */
    notes = [];

    const MATH = "'Iowan Old Style', 'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif";
    const mathText = (x, y, str, size, fill, extra) => {
      const t = svgEl("text", Object.assign({
        x: String(r1(x)), y: String(r1(y)),
        fill, "font-size": String(size), "font-style": "italic",
        "font-family": MATH, "letter-spacing": "0.015em", opacity: "0",
      }, extra || {}));
      t.textContent = str;
      svg.appendChild(t);
      return t;
    };

    const gr = run.grads || [];
    let nAcc = 0;
    for (let i = 0; i < Math.min(5, it.length - 1); i++) {
      if (i > 0) nAcc += Math.hypot(it[i][0] - it[i - 1][0], it[i][1] - it[i - 1][1]);
      const g = gr[i];
      if (!g) continue;
      const mag = Math.hypot(g[0], g[1]) || 1;
      const L = Math.min(34, Math.max(17, mag * g[2] * 2.6));
      const ux = -g[0] / mag, uy = -g[1] / mag;
      const ox = it[i][0], oy = it[i][1];
      const ex = ox + ux * L, ey = oy + uy * L;
      const wing = 4.4, px = -uy, py = ux;
      const arrow = svgEl("path", {
        d: `M${r1(ox)} ${r1(oy)}L${r1(ex)} ${r1(ey)}`
          + `M${r1(ex)} ${r1(ey)}L${r1(ex - ux * wing + px * wing * 0.62)} ${r1(ey - uy * wing + py * wing * 0.62)}`
          + `M${r1(ex)} ${r1(ey)}L${r1(ex - ux * wing - px * wing * 0.62)} ${r1(ey - uy * wing - py * wing * 0.62)}`,
        fill: "none",
        stroke: "var(--warm, #E8A33D)",
        "stroke-width": "1",
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        opacity: "0",
      });
      svg.appendChild(arrow);
      notes.push({ el: arrow, start: nAcc, opacity: 0.9 });
      // the number being computed, on two steps only — more reads as clutter
      if (i === 0 || i === 3) {
        const val = mathText(ex + 9, ey + (i === 0 ? -4 : 9), `\u2016\u2207L\u2016 = ${mag.toFixed(2)}`, 9.5, "var(--line, #E6E2D8)");
        notes.push({ el: val, start: nAcc, opacity: 0.5 });
      }
    }

    if (it.length && mathHost) {
      /* The rule is real 3D geometry (math3d.js); this places and sizes it.
         Position and width are both clamped to the container, so it cannot run
         off a narrow column; it reuses the same column measurement as the name. */
      const mw = Math.min(158, Math.max(108, avail * 0.27));
      const mh = Math.round(mw * 0.29);
      const mx = Math.min(it[0][0] + 62, nameX + Math.max(150, avail) - mw);
      const my = it[0][1] + (nameY - it[0][1]) * 0.30;
      mathHost.style.width = `${Math.round(mw)}px`;
      mathHost.style.height = `${mh}px`;
      mathHost.style.left = `${r1(Math.max(0, mx - nameX))}px`;
      mathHost.style.top = `${r1(my - nameY - mh * 0.48)}px`;
      if (typeof mathHost.__resize === "function") mathHost.__resize();
      notes.push({ el: mathHost, start: 0, opacity: 1, html: true });
    }

    svg.append(leader);

    nameHost.style.position = "relative";
    nameHost.style.height = `${Math.round(raster.cssH)}px`;
    // keep any non-SVG children (the 3D math host lives here)
    nameHost.querySelectorAll(":scope > svg").forEach((el) => el.remove());
    nameHost.appendChild(svg);

    paint();
  };

  /* One frame of the model: current θ through the pen spring, then straight
     onto the paths that were already drawn. Only the writing pieces move —
     the descent above the name is the run that got here and stays put. */
  const paint = () => {
    if (!trainer || !fieldRef) return;
    const pts = penFilter(fieldRef, penStart, trainer.points(), penFlags);
    const last = pts.length - 1;
    for (const p of parts) {
      if (p.mode === "run") continue;
      const n = p.pts.length;
      const arr = new Array(n);
      for (let j = 0; j < n; j++) {
        const ti = p.i0 + j - writeStart;
        arr[j] = ti < 0 ? p.pts[j] : pts[Math.min(last, ti)];
      }
      p.el.setAttribute("d", pathData(arr));
    }
  };

  const DELAY = 350, SLOW = 3000, FAST = 3100;
  const timeAt = (x) => (x <= slowLen
    ? (slowLen ? (x / slowLen) * SLOW : 0)
    : SLOW + ((x - slowLen) / Math.max(1, totalLen - slowLen)) * FAST);

  const settle = () => {
    clearInterval(trainTick);
    clearTimeout(trainTimer);
    if (trainer) { trainer.snap(); paint(); }
    parts.forEach((p) => {
      p.el.removeAttribute("stroke-dasharray");
      p.el.setAttribute("stroke-dashoffset", "0");
      p.el.setAttribute("opacity", String(p.opacity));
    });
    if (bloom) bloom.setAttribute("opacity", "0");
    dots.forEach((d) => d.el.setAttribute("opacity", "0.95"));
    notes.forEach((n) => {
      if (n.html) n.el.style.opacity = "0";
      else n.el.setAttribute("opacity", "0");
    });
    leader.setAttribute("opacity", "0");
  };

  /* Two speeds. The descent runs slowly while the step vectors and the update
     rule are on screen, then the run accelerates, the annotation clears, and
     the rest of the time goes to writing the name. */
  const play = () => {
    anims.forEach((a) => a.cancel());
    anims = [];
    if (!leader.animate) { settle(); return; }
    const ease = "linear";

    parts.forEach(({ el, len, start, opacity, dash }) => {
      el.setAttribute("stroke-dasharray", dash);
      el.setAttribute("stroke-dashoffset", String(len));
      const delay = DELAY + timeAt(start);
      const dur = Math.max(50, timeAt(start + len) - timeAt(start));
      const a = el.animate({ strokeDashoffset: [len, 0] }, { duration: dur, delay, easing: ease, fill: "forwards" });
      a.onfinish = () => el.setAttribute("stroke-dashoffset", "0");
      anims.push(a);
      /* round caps show a dot at a subpath's start even when the dash is fully
         offset, so each piece stays fully transparent until its sweep begins */
      const fade = el.animate([{ opacity: 0 }, { opacity }], { duration: 1, delay, fill: "both" });
      fade.onfinish = () => el.setAttribute("opacity", String(opacity));
      anims.push(fade);
    });

    const lead = leader.animate(
      [
        { strokeDashoffset: 18, opacity: 0.95, offset: 0 },
        { strokeDashoffset: 18 - slowLen, opacity: 0.95, offset: SLOW / (SLOW + FAST) },
        { strokeDashoffset: 18 - totalLen, opacity: 0, offset: 1 },
      ],
      { duration: SLOW + FAST, delay: DELAY, easing: ease, fill: "forwards" },
    );
    lead.onfinish = () => leader.setAttribute("opacity", "0");
    anims.push(lead);

    dots.forEach(({ el, start }) => {
      const at = DELAY + timeAt(start);
      const a = el.animate(
        [{ opacity: 0, offset: 0 }, { opacity: 0, offset: 0.999 }, { opacity: 0.95, offset: 1 }],
        { duration: Math.max(1, at + 90), easing: "linear", fill: "forwards" },
      );
      anims.push(a);
    });

    notes.forEach(({ el, start, opacity, html }) => {
      if (html) el.style.opacity = "0"; else el.setAttribute("opacity", "0");
      const inAt = DELAY + timeAt(start);
      const a = el.animate([{ opacity: 0 }, { opacity }], { duration: 340, delay: inAt, easing: "ease-out", fill: "forwards" });
      anims.push(a);
      const b = el.animate([{ opacity }, { opacity: 0 }], { duration: 420, delay: DELAY + SLOW * 0.92, easing: "ease-in", fill: "forwards" });
      b.onfinish = () => { if (html) el.style.opacity = "0"; else el.setAttribute("opacity", "0"); };
      anims.push(b);
    });

    /* Convergence echo: reaching the minimum sends a faint gold pulse outward
       from that point through the contour field, nearest rings first.
       Deliberately near-threshold. */
    const cs = getComputedStyle(document.documentElement);
    const line = (cs.getPropertyValue("--line") || "#E6E2D8").trim() || "#E6E2D8";
    const warm = (cs.getPropertyValue("--warm") || "#E8A33D").trim() || "#E8A33D";
    rings.forEach((el, i) => {
      const a = el.animate(
        [
          { stroke: line, opacity: 0.09 },
          { stroke: warm, opacity: 0.21, offset: 0.3 },
          { stroke: line, opacity: 0.09 },
        ],
        { duration: 1200, delay: DELAY + SLOW + FAST + 100 + i * 42, easing: "ease-out" },
      );
      anims.push(a);
    });

    if (bloom) bloom.setAttribute("opacity", "0");
  };

  /* The specular band travels along the strokes: a slow pass, a long rest, and
     it only runs while the tab is visible. */
  /* One slow specular pass across the foil, then it stops. A looping shimmer
     is what makes this kind of thing look cheap. */
  const sweepSpecular = (delayMs) => {
    if (!sheen) return;
    cancelAnimationFrame(sheenRaf);
    const t0 = performance.now() + delayMs;
    const DUR = 1500;
    const step = (now) => {
      if (!sheen) return;
      const u = (now - t0) / DUR;
      if (u >= 1) {
        sheen.spec.setAttribute("gradientTransform", `translate(${(sheen.span * 1.2).toFixed(1)} 0)`);
        return;
      }
      const e = u <= 0 ? 0 : u * u * (3 - 2 * u);
      sheen.spec.setAttribute("gradientTransform", `translate(${(e * sheen.span).toFixed(1)} 0)`);
      sheenRaf = requestAnimationFrame(step);
    };
    sheenRaf = requestAnimationFrame(step);
  };

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches && window.self === window.top;
  /* EVERY build re-measures itself after paint, not just the first one. A build
     can land on a transient layout (mid-zoom, fonts still loading, the shaded
     canvas not yet sized); if only the initial start() re-checked, a resize
     rebuild would keep whatever it happened to measure and the watcher key
     would stay permanently out of step with the DOM. The depth guard stops the
     recursion once the measurement is stable, or after a few passes if the
     layout is oscillating. */
  const recheck = () => {
    if (geometryKey() === builtKey) { recheckDepth = 0; return; }
    if (recheckDepth++ > 4) return;
    start();
  };

  const start = () => {
    build();
    if (reduce) { settle(); cancelAnimationFrame(sheenRaf); }
    else { play(); }
    clearTimeout(recheckTimer);
    requestAnimationFrame(() => requestAnimationFrame(recheck));
    recheckTimer = setTimeout(recheck, 420);
  };

  /* Zoom and reflow both move the h1, and the run is generated in layout
     pixels against its position — so rebuild whenever the geometry the build
     was measured against no longer matches the DOM. */
  const geometryKey = () => {
    const container = fieldSvg.parentElement;
    const [x, y] = offsetIn(nameHost, container);
    return [x, y, nameHost.offsetWidth, Math.max(320, container.clientWidth), contentHeight(container)].join("|");
  };

  start();
  nameHost.addEventListener("click", () => { if (!reduce) play(); });
  if (!reduce && replayMs) timer = setInterval(play, replayMs);

  const rebuild = () => { recheckDepth = 0; recheck(); };
  const onResize = () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(rebuild, 200); };
  window.addEventListener("resize", onResize);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", onResize);
    window.visualViewport.addEventListener("scroll", onResize);
  }
  const ro = new ResizeObserver(onResize);
  ro.observe(nameHost);
  ro.observe(document.body);
  ro.observe(fieldSvg.parentElement);
  // fonts land after first paint and change the column height
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(rebuild).catch(() => undefined);

  return {
    destroy() {
      clearInterval(timer);
      clearTimeout(resizeTimer);
      clearTimeout(recheckTimer);
      clearTimeout(trainTimer);
      clearInterval(trainTick);
      cancelAnimationFrame(sheenRaf);
      sheen = null;
      window.removeEventListener("resize", onResize);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", onResize);
        window.visualViewport.removeEventListener("scroll", onResize);
      }
      ro.disconnect();
      anims.forEach((a) => a.cancel());
    },
  };
}


// ==== math3d.js ====
/* The update rule, shaded rather than coloured.

   The glyph mask gives a signed distance field; the field gives a rounded
   surface; the surface is then shaded per pixel with a small metal BRDF —
   a vertical studio environment, two specular lobes and a Fresnel rim. It is
   a real render, just baked once into a bitmap instead of a GPU pass, which
   is why it holds up at any size and costs nothing after load. */


const FONT_M3D = (px) => `italic ${px}px 'Iowan Old Style', 'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif`;

function drawRuns(runs, px, ss) {
  const probe = document.createElement("canvas").getContext("2d");
  let w = 0;
  const placed = runs.map((r) => {
    probe.font = FONT_M3D(px * (r.scale || 1));
    const width = probe.measureText(r.t).width;
    const x = w;
    w += width;
    return { ...r, x, width };
  });
  const pad = Math.round(px * 0.34);
  const W = Math.ceil(w) + pad * 2;
  const H = Math.ceil(px * 1.5);
  const c = document.createElement("canvas");
  c.width = Math.round(W * ss);
  c.height = Math.round(H * ss);
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.scale(ss, ss);
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "alphabetic";
  const baseline = Math.round(H * 0.72);
  for (const r of placed) {
    ctx.font = FONT_M3D(px * (r.scale || 1));
    ctx.fillText(r.t, pad + r.x, baseline + (r.dy || 0) * px);
  }
  return { canvas: c, w: c.width, h: c.height };
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const norm3 = (x, y, z) => {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
};

/* warm studio: bright soft key above, deep amber bounce below */
function environment(ny) {
  const t = clamp01(ny * 0.5 + 0.5);
  const top = [1.0, 0.94, 0.82];
  const mid = [0.5, 0.36, 0.14];
  const bot = [0.07, 0.045, 0.02];
  if (t > 0.55) {
    const u = (t - 0.55) / 0.45;
    return [mid[0] + (top[0] - mid[0]) * u, mid[1] + (top[1] - mid[1]) * u, mid[2] + (top[2] - mid[2]) * u];
  }
  const u = t / 0.55;
  return [bot[0] + (mid[0] - bot[0]) * u, bot[1] + (mid[1] - bot[1]) * u, bot[2] + (mid[2] - bot[2]) * u];
}

function bake(mask, { rim, gold = [0.92, 0.68, 0.28] }) {
  const w = mask.width, h = mask.height;
  const src = mask.getContext("2d").getImageData(0, 0, w, h);
  const a = src.data;

  const outside = new Uint8Array(w * h);
  for (let i = 0; i < outside.length; i++) outside[i] = a[i * 4 + 3] > 128 ? 0 : 1;
  const dist = edt(outside, w, h);

  // rounded shoulder: domed at the edge, flattening to a plateau inside
  const height = new Float32Array(w * h);
  for (let i = 0; i < height.length; i++) {
    const t = clamp01(dist[i] / rim);
    height[i] = Math.sin((t * Math.PI) / 2) ** 0.62;
  }

  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const img = out.getContext("2d").createImageData(w, h);
  const d = img.data;

  const at = (x, y) => height[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
  const relief = rim * 0.8;
  const L1 = norm3(-0.42, 0.78, 0.68);
  const L2 = norm3(0.72, -0.38, 0.55);
  const V = [0, 0, 1];
  const H1 = norm3(L1[0] + V[0], L1[1] + V[1], L1[2] + V[2]);
  const H2 = norm3(L2[0] + V[0], L2[1] + V[1], L2[2] + V[2]);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const alpha = a[i * 4 + 3];
      const o = i * 4;
      if (alpha < 4) { d[o + 3] = 0; continue; }

      const gx = (at(x + 1, y) - at(x - 1, y)) * relief;
      const gy = (at(x, y + 1) - at(x, y - 1)) * relief;
      const [nx, ny, nz] = norm3(-gx, gy, 1);

      // reflected direction drives the environment lookup: this is what makes
      // the surface read as metal rather than as a coloured shape
      const rdot = 2 * nz;
      const ry = rdot * ny;
      const env = environment(ry);

      const s1 = Math.max(0, nx * H1[0] + ny * H1[1] + nz * H1[2]) ** 64;
      const s2 = Math.max(0, nx * H2[0] + ny * H2[1] + nz * H2[2]) ** 30;
      const fres = (1 - Math.max(0, nz)) ** 2.2;

      let r = gold[0] * env[0] * 1.2 + s1 * 2.1 + s2 * 0.62 + fres * 0.55;
      let g = gold[1] * env[1] * 1.2 + s1 * 2.0 + s2 * 0.52 + fres * 0.4;
      let b = gold[2] * env[2] * 1.2 + s1 * 1.8 + s2 * 0.34 + fres * 0.22;

      // filmic-ish shoulder, then gamma
      r = clamp01(r / (1 + r * 0.72)) ** (1 / 2.05);
      g = clamp01(g / (1 + g * 0.72)) ** (1 / 2.05);
      b = clamp01(b / (1 + b * 0.72)) ** (1 / 2.05);

      d[o] = r * 255;
      d[o + 1] = g * 255;
      d[o + 2] = b * 255;
      d[o + 3] = alpha;
    }
  }
  out.getContext("2d").putImageData(img, 0, 0);
  return out;
}

/* The relief is baked per pixel, so the bake has to match the box it will be
   shown in: a fixed size means either a soft upscale or paying for ten times
   the pixels the layout asked for. drawRuns is cheap text measurement, so a
   probe pass gives the px that lands the bake on the box, and the scene calls
   __resize() whenever it re-lays the host. */
async function mountMath3D(host, { runs, px = 120 } = {}) {
  if (!host || !runs || !runs.length) return { destroy() {} };
  let shaded = null, builtW = 0;

  const paint = () => {
    const cssW = host.clientWidth || host.getBoundingClientRect().width;
    if (!cssW) return;
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    const target = Math.max(140, Math.round(cssW * dpr * 1.35));
    if (shaded && builtW && Math.abs(target - builtW) / builtW < 0.12) return;

    const probeW = drawRuns(runs, 100, 1).canvas.width || 1;
    const size = Math.max(14, Math.min(px * 2, (100 * target) / probeW));
    const { canvas: mask } = drawRuns(runs, size, 1);
    const next = bake(mask, { rim: Math.max(2.5, size * 0.05) });
    next.style.cssText = "width:100%;height:auto;display:block;position:absolute;top:50%;left:0;transform:translateY(-50%)";
    if (shaded && shaded.parentNode) shaded.parentNode.replaceChild(next, shaded);
    else host.appendChild(next);
    shaded = next;
    builtW = target;
  };

  paint();
  host.__resize = paint;

  return {
    get canvas() { return shaded; },
    resize: paint,
    destroy() {
      if (host.__resize === paint) delete host.__resize;
      if (shaded && shaded.parentNode) shaded.parentNode.removeChild(shaded);
    },
  };
}


window.__dcBundle = { mountScene: mountScene, mountMath3D: mountMath3D, mountBlop: mountBlop };
})();