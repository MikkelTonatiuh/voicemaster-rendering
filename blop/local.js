/* Runs the analysis on this device (voice/engine.js) instead of the Wav2Vec2 + GAT server, and hands
   Blop the same payload the server sent, so the board, moods and lines work unchanged.
   When a line has an example recording, the score is how close the take is to that example. */
export const STYLES = ["calm", "excited", "authoritative"];

/* seconds of pitched voice a take needs before it is scored. Short lines like "It's eleven o'clock"
   have only about half a second of it */
export const MIN_VOICED = 0.4;

/* Blop says these when a take can't be scored */
export const UNHEARD = {
  silent: "i didn't hear anything. is the right mic on?",
  little: "i only caught a bit of that. say the whole line.",
  noisy: "too much noise around you. try somewhere quieter.",
  short: "that take was too short.",
  none: "that didn't work. try again.",
};

export function exampleUrl(line) {
  return line && line.id ? "./voice/models/" + line.id + ".mp3" : null;
}

export async function decodeBuffer(buf) {
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const ctx = new OAC(1, 1, 44100);
  const audio = await new Promise((res, rej) => ctx.decodeAudioData(buf, res, rej));
  return { pcm: audio.getChannelData(0), sr: audio.sampleRate };
}

export async function decode(blob) {
  return decodeBuffer(await blob.arrayBuffer());
}

export async function loadExample(line, VE) {
  const url = exampleUrl(line);
  if (!url) return null;
  const r = await fetch(url);
  if (!r.ok) throw new Error("HTTP " + r.status);
  const { pcm, sr } = await decodeBuffer(await r.arrayBuffer());
  return { url, analysis: VE.analyze(pcm, sr, { minVoiced: MIN_VOICED }) };
}

const BAR_NAMES = { shape: "melody", loudness: "loudness", size: "pitch range", timing: "timing", pauses: "pauses" };

export function toPayload(VE, take, target, example) {
  const judged = VE.judge(take, target);
  if (!judged.ok) return { unheard: true, copy: UNHEARD[judged.reason] || UNHEARD.none };
  const probs = {};
  for (const s of STYLES) probs[s] = (judged.all[s] || 0) / 100;
  const cmp = example && example.ok ? VE.compare(example, take) : null;
  const score = cmp ? cmp.score : judged.score;
  /* close enough = Blop is happy; in between = unsure; far off = Blop shows which tone it heard instead */
  const ranked = STYLES.slice().sort((p, q) => probs[q] - probs[p]);
  const heard = ranked[0] === target ? ranked[1] : ranked[0];
  const mixed = score >= 45 && score < 70;
  return {
    score,
    predicted: score >= 70 ? target : heard,
    mixed,
    confidence: 1,
    target,
    probs,
    headline: cmp ? cmp.headline : judged.headline,
    feedback: cmp ? cmp.feedback : judged.feedback,
    tips: cmp ? cmp.tips : judged.tips,
    prosody: {
      pitchHz: take.pitchHz,
      pitchVariety: take.pitchSd,
      pace: take.pace,
      stress: take.stressSd,
      pausing: take.pauseShare,
      endings: take.endings,
    },
    /* one bar per part of the comparison, biggest weight first; pauses only when either side paused */
    bars: cmp ? Object.keys(cmp.parts).map((k) => ({ name: BAR_NAMES[k] || k, value: cmp.parts[k] })) : null,
    overlay: cmp ? cmp.overlay : null,
  };
}

/* semitones the drawing spans above and below the middle: enough for 95% of the melody's points */
export function melodyRange(...lists) {
  const v = [];
  for (const pts of lists) for (const p of pts || []) v.push(Math.abs(p[1]));
  v.sort((a, b) => a - b);
  return Math.max(6, v.length ? v[Math.floor(0.95 * (v.length - 1))] : 0);
}

/* a melody over normalised time: [t 0..1, semitones around the speaker's usual pitch], drawn as the tune
   rather than the tracker: short gaps (consonants) are bridged and only pauses break the line, a median
   filter drops tracker slips, and stretches under 40 ms are left out */
export function strokeMelody(ctx, pts, w, h, color, width, dash, range = 8) {
  const segs = [[]];
  for (let k = 0; k < pts.length; k += 1) {
    if (k && pts[k][0] - pts[k - 1][0] >= 0.08) segs.push([]);
    segs[segs.length - 1].push(pts[k]);
  }
  const around = (arr, k, r) => arr.slice(Math.max(0, k - r), k + r + 1);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.setLineDash(dash || []);
  ctx.beginPath();
  for (const s of segs) {
    if (s.length < 4) continue;
    const med = s.map((_, k) => around(s, k, 3).map((p) => p[1]).sort((a, b) => a - b)[Math.floor(around(s, k, 3).length / 2)]);
    for (let k = 0; k < s.length; k += 1) {
      const near = around(med, k, 3);
      const v = near.reduce((a, b) => a + b, 0) / near.length;
      const x = 4 + s[k][0] * (w - 8);
      const y = Math.max(3, Math.min(h - 3, h / 2 - (v / range) * (h * 0.46)));
      if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
  }
  ctx.stroke();
  ctx.restore();
}

export function melodyOf(analysis) {
  if (!analysis || !analysis.ok) return [];
  const tr = analysis.track, n = tr.f0.length;
  let first = -1, last = -1;
  for (let i = 0; i < n; i += 1) if (tr.speech[i]) { if (first < 0) first = i; last = i; }
  const pts = [];
  for (let i = Math.max(0, first); i <= last; i += 1) {
    if (tr.f0[i] > 0) pts.push([(i - first) / Math.max(1, last - first), 12 * Math.log2(tr.f0[i] / analysis.pitchHz)]);
  }
  return pts;
}
