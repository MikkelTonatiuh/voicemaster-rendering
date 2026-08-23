export const STYLES = ["calm", "excited", "authoritative"];
export const MIXED_THRESHOLD = 0.45;

export const SER_TO_STYLE = {
  neutral: "calm",
  calm: "calm",
  sad: "calm",
  happy: "excited",
  surprised: "excited",
  surprise: "excited",
  fearful: "excited",
  fear: "excited",
  excited: "excited",
  angry: "authoritative",
  anger: "authoritative",
  disgusted: "authoritative",
  disgust: "authoritative",
  authority: "authoritative",
  confident: "authoritative",
  authoritative: "authoritative",
};

export function styleOf(label) {
  if (label == null) return null;
  const key = String(label).trim().toLowerCase();
  if (!key || key === "mixed") return null;
  return SER_TO_STYLE[key] || null;
}

export function foldProbs(src) {
  const out = { calm: 0, excited: 0, authoritative: 0 };
  if (!src) return out;
  const add = (label, value) => {
    const style = styleOf(label);
    if (!style) return;
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    out[style] += n;
  };
  if (Array.isArray(src)) {
    for (const item of src) add(item?.label, item?.value);
  } else if (typeof src === "object") {
    for (const [label, value] of Object.entries(src)) add(label, value);
  }
  for (const name of STYLES) {
    out[name] = Math.min(1, Math.max(0, out[name]));
  }
  return out;
}

export function confidenceOf(payload, foldedProbs) {
  const raw = Number(payload?.confidence);
  if (Number.isFinite(raw)) return raw > 1 ? raw / 100 : raw;
  const folded = foldedProbs || { calm: 0, excited: 0, authoritative: 0 };
  return Math.max(folded.calm || 0, folded.excited || 0, folded.authoritative || 0);
}

function voiceCopy(s) {
  return String(s || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function argmaxStyle(folded) {
  let best = null;
  let bestVal = -1;
  for (const name of STYLES) {
    const v = folded[name] || 0;
    if (v > bestVal) {
      bestVal = v;
      best = name;
    }
  }
  return bestVal > 0 ? best : null;
}

function emptyDrive(target) {
  return {
    predicted: null,
    mixed: false,
    match: false,
    mood: "idle",
    band: null,
    bars: STYLES.map((name) => ({ name, value: 0 })),
    copy: "",
    score: 0,
    tips: [],
    prosody: null,
    target: styleOf(target),
    confidence: 0,
  };
}

export function fromAnalyzer(payload, target) {
  if (payload == null) return emptyDrive(target);
  const folded = foldProbs(payload.probs ?? payload.probabilities);
  const confidence = confidenceOf(payload, folded);
  const predicted = styleOf(payload.predicted) || argmaxStyle(folded);
  const mixed = payload.mixed === true || confidence < MIXED_THRESHOLD;
  const targetStyle = styleOf(target || payload.target || payload.targetEmotion);
  const match = !mixed && !!predicted && !!targetStyle && predicted === targetStyle;
  let mood = "idle";
  let band = null;
  if (mixed) {
    mood = "unsure";
    band = "mid";
  } else if (match) {
    mood = "happy";
    band = "good";
  } else if (predicted === "calm") {
    mood = "listen";
    band = "bad";
  } else if (predicted === "excited") {
    mood = "eager";
    band = "bad";
  } else if (predicted === "authoritative") {
    mood = "think";
    band = "bad";
  }
  const firstTip = Array.isArray(payload.tips) && payload.tips[0] ? payload.tips[0] : "";
  return {
    predicted,
    mixed,
    match,
    mood,
    band,
    bars: STYLES.map((name) => ({ name, value: folded[name] })),
    copy: voiceCopy(firstTip || payload.headline || ""),
    score: Number(payload.score) || Math.round(confidence * 100),
    tips: Array.isArray(payload.tips) ? payload.tips : [],
    prosody: payload.prosody || null,
    target: targetStyle,
    confidence,
  };
}
