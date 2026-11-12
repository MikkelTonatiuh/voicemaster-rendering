/* Turns a take's result into what the board shows and how Blop feels about it:
   clear words make Blop happy, a few hard ones leave it unsure, a lot of them make it think. */
function voiceCopy(s) {
  return String(s || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function emptyDrive() {
  return { mixed: false, match: false, mood: "idle", band: null, bars: [], copy: "", score: 0, tips: [], prosody: null };
}

export const MOODS = { good: "happy", mid: "unsure", bad: "think" };

export function fromAnalyzer(payload) {
  if (payload == null) return emptyDrive();
  const score = Math.round(Number(payload.score) || 0);
  const band = payload.band || (score >= 70 ? "good" : score >= 45 ? "mid" : "bad");
  const firstTip = Array.isArray(payload.tips) && payload.tips[0] ? payload.tips[0] : "";
  return {
    mixed: band === "mid",
    match: band === "good",
    mood: MOODS[band],
    band,
    bars: (payload.bars || []).map((b) => ({ name: b.name, value: Math.min(1, Math.max(0, Number(b.value) || 0)) })),
    copy: voiceCopy(firstTip || payload.headline || ""),
    score,
    tips: Array.isArray(payload.tips) ? payload.tips : [],
    prosody: payload.prosody || null,
  };
}
