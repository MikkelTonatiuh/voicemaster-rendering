import { LIVE, summarize } from "./clarity.js";

export const REST_TINT = [0.97, 0.98, 0.99];
export const DWELL = 0.16;
export const HOLD_SEC = DWELL;

export const TINTS = {
  rest: REST_TINT,
  good: [0.62, 0.94, 0.7],
  mid: [0.97, 0.9, 0.52],
  bad: [0.98, 0.68, 0.66],
};

/* While you speak, Blop shows how the words scored so far are going: the word check scores the first words of the
   line as soon as they have been said (blop/clarity.js, wordsReached), so what Blop shows comes from the same
   scoring as the result. "good" when they are clear, "mid" when some were hard to hear; never "bad", that is for the
   result. Until two words can be judged it only listens. A last word or two that the model can't find in the audio
   at all (below cfg.unsaid) were most likely not said yet, and are left out. How loud the voice is says nothing about
   this: an earlier version judged the loudness, and showed an angry or confused Blop during takes that then scored
   90 and more. */
export function liveBand(words, cfg = LIVE) {
  if (!Array.isArray(words)) return "rest";
  let n = words.length;
  while (n > 0 && words.length - n < 2 && words[n - 1].s < cfg.unsaid) n -= 1;
  if (n < cfg.min) return "rest";
  return summarize(words.slice(0, n)).band === "good" ? "good" : "mid";
}

/* One reading that finds trouble can be the model's noise: on 61 learner takes of 14 to 30 words, a lone one showed
   on 2 of the 30 that ended clear, and none did when two in a row were needed. So Blop shows "mid" once two readings
   in a row say so; a clear reading shows at once, and a reading that says nothing (rest) leaves things as they are.
   shown is what Blop shows now, prev the reading before this one, read this one. */
export function showLive(shown, prev, read) {
  if (read === "good") return "good";
  if (read === "mid" && prev === "mid") return "mid";
  return shown || "rest";
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

export function simulatedVoice(t) {
  const drift = Math.sin(t * 0.31) * 0.055 + Math.sin(t * 0.73 + 1.1) * 0.03;
  const syllable = Math.abs(Math.sin(t * 4.1)) * 0.04;
  return Math.max(0, Math.min(1, 0.3 + drift + syllable));
}

export function simulatedTone(t) {
  return Math.max(0, Math.min(1, 0.42 + Math.sin(t * 0.27) * 0.06));
}

export function scoreBand(view, results) {
  if (view !== "good" && view !== "unsure") return null;
  if (results?.band) return results.band;
  const score = Number(results?.score) || 0;
  if (score >= 72) return "good";
  if (score >= 45) return "mid";
  return "bad";
}
