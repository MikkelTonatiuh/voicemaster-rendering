export const REST_TINT = [0.97, 0.98, 0.99];
export const DWELL = 0.16;
export const HOLD_SEC = DWELL;

export const TINTS = {
  rest: REST_TINT,
  good: [0.62, 0.94, 0.7],
  mid: [0.97, 0.9, 0.52],
  bad: [0.98, 0.68, 0.66],
};

export function liveBand(voice, tone = 0.4, target = "calm") {
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

export function stepVoice(prev, raw, dt) {
  const v = Math.min(1, Math.max(0, Number(raw) || 0));
  const p = Number(prev) || 0;
  const rate = v > p ? 9 : 2.1;
  return p + (v - p) * (1 - Math.exp(-rate * Math.max(0, dt)));
}

export function emptyBand() {
  return { band: "rest", candidate: "rest", held: 0 };
}

export function stepBand(prev, raw, dt) {
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

export function stepCharge(prev, band, dt) {
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

export function tintFor(band, charge = 0) {
  if (!band || band === "rest") return REST_TINT.slice();
  const dest = TINTS[band] || REST_TINT;
  const u = 0.42 + 0.38 * Math.min(1, Math.max(0, charge));
  return REST_TINT.map((c, i) => c + (dest[i] - c) * u);
}

const SIM_CENTRE = { calm: 0.24, excited: 0.44, authoritative: 0.36 };

export function simulatedVoice(t, target = "calm") {
  const centre = SIM_CENTRE[target] || 0.3;
  const drift = Math.sin(t * 0.31) * 0.055 + Math.sin(t * 0.73 + 1.1) * 0.03;
  const syllable = Math.abs(Math.sin(t * 4.1)) * 0.04;
  return Math.max(0, Math.min(1, centre + drift + syllable));
}

export function simulatedTone(t, target = "calm") {
  const centre = target === "excited" ? 0.62 : 0.42;
  return Math.max(0, Math.min(1, centre + Math.sin(t * 0.27) * 0.06));
}

export function scoreBand(view, results) {
  if (view !== "good" && view !== "unsure") return null;
  const score = Number(results?.score) || 0;
  if (results?.mixed) return "mid";
  if (score >= 72) return "good";
  if (score >= 45) return "mid";
  return "bad";
}
