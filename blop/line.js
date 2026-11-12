import { clarityNote, clarityTips, levelOf, summarize } from "./clarity.js";

export const INTRO = "practice how you sound.";
export const TAP = "tap me.";
export const FAR = "where you going";
export const EDGE = "please don't leave.";
export const LEAVE = "don't leave";

export function pointerFlags({
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

export function emptyAside() {
  return { text: null, until: 0, coolUntil: 0 };
}

export function stepAside(aside, { view, flags, now }) {
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

export function blopVoice(s) {
  return String(s || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function coachingText(results) {
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

/* a made-up read of the line for "Continue without a microphone": the longest word comes out a little soft */
export function simulateResult(text) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  if (!words.length) words.push("hello");
  const soft = words.reduce((best, w, i) => (w.length > words[best].length ? i : best), 0);
  const scored = words.map((w, i) => {
    const s = i === soft ? -3.4 : -0.3;
    return { w, s, level: levelOf(w, s) };
  });
  const sum = summarize(scored);
  const tips = clarityTips(sum);
  return {
    score: sum.score,
    band: sum.band,
    mixed: sum.band === "mid",
    confidence: 1,
    headline: clarityNote(sum),
    feedback: tips.join(" "),
    tips,
    words: scored,
    wordsNote: clarityNote(sum),
    notice: "",
    heard: "",
    prosody: null,
    bars: [{ name: "clarity", value: sum.score / 100 }],
    overlay: null,
  };
}

export function tryNote(results) {
  if (results?.tips?.[0]) return blopVoice(results.tips[0]);
  const body = coachingText(results);
  if (body) {
    const parts = body.split(/\. /).filter(Boolean);
    return blopVoice(parts[parts.length - 1] || body);
  }
  return "try that one again.";
}

export function baseLine({ view, recording, intro, prompt, results, errorCopy, loadNote } = {}) {
  if (view === "home") return intro ? INTRO : TAP;
  if (view === "rec") return prompt?.t || TAP;
  if (view === "load") return loadNote || "hold on.";
  if (view === "err") return errorCopy || "that didn't work.";
  if (view === "good" || view === "unsure") return tryNote(results);
  return TAP;
}

export function spokenLine(state = {}, aside) {
  if (state.view !== "home") return baseLine(state);
  return aside?.text || baseLine(state);
}
