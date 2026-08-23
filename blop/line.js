export const INTRO = "practice how you sound.";
export const TAP = "tap me.";
export const FAR = "where you going";
export const EDGE = "please don't leave.";
export const LEAVE = "don't leave";
export const TONES = ["calm", "excited", "authoritative"];

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

export function noteFor(results, target) {
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

export function simulateResult(target) {
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

export function toneBars(results) {
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

export function tryNote(results, target) {
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

export function toneCue(target) {
  const key = String(target || "").toLowerCase();
  return TONE_CUE[key] || `say it ${key || "naturally"}`;
}

export function baseLine({ view, recording, intro, prompt, results, errorCopy } = {}) {
  if (view === "home") return intro ? INTRO : TAP;
  if (view === "rec") return prompt?.t || TAP;
  if (view === "cue") return toneCue(prompt?.e);
  if (view === "load") return "hold on.";
  if (view === "err") return errorCopy || "that didn't work.";
  if (view === "good" || view === "unsure") return tryNote(results, prompt?.e);
  return TAP;
}

export function spokenLine(state = {}, aside) {
  if (state.view !== "home") return baseLine(state);
  return aside?.text || baseLine(state);
}
