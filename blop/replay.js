/* The replay on the result board: where each word is said in a recording, the melody of a recording, the easing the
   board moves with, and how the melody lane is drawn. The page (Blop.dc.html) owns the audio and the clock; this
   file only turns recordings into things to show, so it can be tested without a browser.

   Words. Where the sounds of a word are is not known for a learner's take the way it is for the example (whose sounds
   were forced onto a phoneme model once, offline: voice/models/lines.json). For a take, the syllable peaks the
   engine finds (voice/engine.js, track.nuclei) are lined up with the syllables the line should have, in order,
   and each word gets the stretch its peaks fall in. */

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/* ---------- easing ---------- */
export function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = (t) => ((ax * t + bx) * t + cx) * t;
  const Y = (t) => ((ay * t + by) * t + cy) * t;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let lo = 0, hi = 1, t = x;
    for (let i = 0; i < 28; i += 1) {
      const v = X(t);
      if (Math.abs(v - x) < 1e-5) break;
      if (v < x) lo = t; else hi = t;
      t = (lo + hi) / 2;
    }
    return Y(t);
  };
}
/* Material Design 3's motion curves (material-components-android, docs/theming/Motion.md): things that arrive
   decelerate hard, things that move across the screen ease both ways */
export const EASE = {
  emphasized: bezier(0.05, 0.7, 0.1, 1),
  standard: bezier(0.2, 0, 0, 1),
  leaving: bezier(0.3, 0, 0.8, 0.15),
};

/* ---------- words ---------- */

/* syllables in an English word, by counting vowel groups: close enough to line peaks up with words */
export function syllables(word) {
  const w = String(word || "").toLowerCase().replace(/[^a-z']/g, "");
  if (!w) return 0;
  let n = (w.replace(/'/g, "").match(/[aeiouy]+/g) || []).length;
  if (/e$/.test(w) && !/(le|ee)$/.test(w) && n > 1) n -= 1;
  else if (/(es|ed)$/.test(w) && !/(ted|ded|ses|zes|ces|ges|xes|shes|ches)$/.test(w) && n > 1) n -= 1;
  return Math.max(1, n);
}

/* the stretches of speech and the gaps between them, in seconds, from an analysis (voice/engine.js) */
export function speechRuns(analysis) {
  const tr = analysis && analysis.track;
  if (!tr || !tr.speech) return { from: 0, to: 0, gaps: [] };
  const hop = tr.hop || 0.01, sp = tr.speech;
  let first = -1, last = -1;
  for (let i = 0; i < sp.length; i += 1) if (sp[i]) { if (first < 0) first = i; last = i; }
  if (first < 0) return { from: 0, to: 0, gaps: [] };
  const gaps = [];
  let start = -1;
  for (let i = first; i <= last; i += 1) {
    if (!sp[i] && start < 0) start = i;
    if (sp[i] && start >= 0) { gaps.push([start * hop, i * hop]); start = -1; }
  }
  return { from: first * hop, to: (last + 1) * hop, gaps };
}

/* Gives every word the stretch of the recording where it is said, from where its sounds are: anchors[i] is
   [from, to] in seconds, or null if unknown. Neighbouring words meet halfway across a gap shorter than `join`;
   across a longer one (a pause) each keeps a little margin; the first and last words reach the speech's edges. */
export function settle(anchors, from, to, { join = 0.16, pad = 0.04, reach = 0.25 } = {}) {
  const n = anchors.length;
  if (!n) return [];
  const a = anchors.map((x) => (x ? [x[0], x[1]] : null));
  /* words with no sounds found share the stretch between their neighbours */
  for (let s = 0; s < n; s += 1) {
    if (a[s]) continue;
    let e = s;
    while (e + 1 < n && !a[e + 1]) e += 1;
    const lo = s > 0 ? a[s - 1][1] : from, hi = e + 1 < n ? a[e + 1][0] : to;
    const k = e - s + 1, slot = Math.max(0, hi - lo) / k;
    for (let m = 0; m < k; m += 1) a[s + m] = [lo + slot * m, lo + slot * (m + 0.85)];
    s = e;
  }
  const out = a.map((x) => [x[0], x[1]]);
  out[0][0] = clamp(from, a[0][0] - reach, a[0][0]);
  out[n - 1][1] = clamp(to, a[n - 1][1], a[n - 1][1] + reach);
  for (let i = 1; i < n; i += 1) {
    const gap = a[i][0] - a[i - 1][1];
    if (gap <= join) { const m = (a[i][0] + a[i - 1][1]) / 2; out[i - 1][1] = m; out[i][0] = m; }
    else { out[i - 1][1] = a[i - 1][1] + Math.min(pad, gap / 2); out[i][0] = a[i][0] - Math.min(pad, gap / 2); }
  }
  return out;
}

/* nuclei times in seconds */
function peaks(analysis) {
  const tr = analysis && analysis.track;
  return tr && tr.nuclei ? tr.nuclei.map((i) => i * (tr.hop || 0.01)) : [];
}

/* For a recording with known word spans (the example), which word each of its syllable peaks belongs to. */
export function labelsFrom(analysis, spans) {
  return peaks(analysis).map((t) => {
    let best = 0, dist = Infinity;
    spans.forEach((s, i) => {
      const d = t < s[0] ? s[0] - t : t > s[1] ? t - s[1] : 0;
      if (d < dist) { dist = d; best = i; }
    });
    return best;
  });
}

/* the same for a line of text: one label per syllable it should have */
export function labelsOfText(words) {
  const out = [];
  words.forEach((w, i) => { for (let k = 0; k < syllables(w); k += 1) out.push(i); });
  return out;
}

/* Where each word of `words` is said in a take. labels says which word each of the reference's syllables belongs to
   (labelsFrom for the example, labelsOfText when there is no example); the take's syllable peaks are lined up with
   them in order. Returns [{ w, from, to }] in seconds from the start of the recording. */
export function wordSpans(words, analysis, labels, opts = {}) {
  const n = words.length;
  if (!n) return [];
  const { from, to, gaps } = speechRuns(analysis);
  if (!(to > from)) return words.map((w) => ({ w, from: 0, to: 0 }));
  const nu = peaks(analysis).filter((t) => t >= from - 0.05 && t <= to + 0.05);
  const ref = labels && labels.length ? labels : labelsOfText(words);
  let anchors;
  if (!nu.length) {
    /* nothing to go on: share the speech out by letters */
    const total = words.reduce((s, w) => s + Math.max(1, String(w).length), 0);
    let at = from;
    anchors = words.map((w) => { const a = at; at += ((to - from) * Math.max(1, String(w).length)) / total; return [a, at]; });
    return anchors.map((x, i) => ({ w: words[i], from: x[0], to: x[1] }));
  }
  const first = new Array(n).fill(null), last = new Array(n).fill(null);
  nu.forEach((t, i) => {
    const j = nu.length === 1 ? Math.floor((ref.length - 1) / 2) : Math.round((i * (ref.length - 1)) / (nu.length - 1));
    const w = clamp(ref[clamp(j, 0, ref.length - 1)], 0, n - 1);
    if (first[w] === null) first[w] = t;
    last[w] = t;
  });
  if (opts.valleys !== false && analysis.track.db) return valleySpans(words, analysis, first, last, from, to, gaps);
  /* a peak is the middle of a vowel: the word starts a little before it and ends a little after */
  anchors = first.map((f, i) => (f === null ? null : [Math.max(from, f - 0.07), Math.min(to, last[i] + 0.07)]));
  const spans = settle(anchors, from, to);
  /* a pause belongs to nobody: a word does not run on into a silence between it and the next */
  spans.forEach((s, i) => {
    if (i === 0) return;
    const prev = spans[i - 1];
    for (const [g0, g1] of gaps) {
      if (g1 - g0 >= 0.13 && g0 >= prev[0] + 0.02 && g1 <= s[1] - 0.02 && g0 <= s[0] + 0.12 && g1 >= prev[1] - 0.12) {
        prev[1] = Math.min(prev[1], g0 + 0.03);
        s[0] = Math.max(s[0], g1 - 0.03);
      }
    }
  });
  return spans.map((s, i) => ({ w: words[i], from: s[0], to: Math.max(s[0], s[1]) }));
}

/* Each word boundary falls in the quietest moment between the last syllable peak of one word and the first of the next
   (a valley in the loudness), and a pause belongs to nobody. */
function valleySpans(words, analysis, first, last, from, to, gaps) {
  const n = words.length, tr = analysis.track, hop = tr.hop || 0.01, db = tr.db;
  const f = first.slice(), l = last.slice();
  /* words with no peak take a place between their neighbours */
  for (let s = 0; s < n; s += 1) {
    if (f[s] !== null) continue;
    let e = s;
    while (e + 1 < n && f[e + 1] === null) e += 1;
    const lo = s > 0 ? l[s - 1] : from, hi = e + 1 < n ? f[e + 1] : to, k = e - s + 1;
    for (let m = 0; m < k; m += 1) { const t = lo + ((hi - lo) * (m + 1)) / (k + 1); f[s + m] = t; l[s + m] = t; }
    s = e;
  }
  const level = (i) => {
    let sum = 0, c = 0;
    for (let k = i - 1; k <= i + 1; k += 1) if (k >= 0 && k < db.length) { sum += db[k]; c += 1; }
    return c ? sum / c : 0;
  };
  const cut = [from];
  for (let i = 1; i < n; i += 1) {
    const lo = l[i - 1], hi = Math.max(f[i], lo);
    let b = (lo + hi) / 2;
    if (hi - lo > 0.04) {
      let best = Infinity;
      for (let k = Math.round(lo / hop); k <= Math.round(hi / hop); k += 1) { const v = level(k); if (v < best) { best = v; b = k * hop; } }
    }
    cut.push(b);
  }
  cut.push(to);
  const spans = words.map((w, i) => [cut[i], cut[i + 1]]);
  for (let i = 1; i < n; i += 1) {
    for (const [g0, g1] of gaps) {
      if (g1 - g0 >= 0.13 && g0 >= l[i - 1] - 0.05 && g1 <= f[i] + 0.05) {
        spans[i - 1][1] = Math.max(spans[i - 1][0], g0 + 0.03);
        spans[i][0] = Math.min(spans[i][1], g1 - 0.03);
      }
    }
  }
  return spans.map((s, i) => ({ w: words[i], from: s[0], to: Math.max(s[0], s[1]) }));
}

/* which word is being said at time t, or -1 between words */
export function wordAt(spans, t) {
  for (let i = 0; i < spans.length; i += 1) if (t >= spans[i].from && t < spans[i].to) return i;
  return -1;
}

/* ---------- melody ---------- */

/* The melody of a recording for the lane: voiced pitch in semitones around the speaker's own usual pitch, as
   stretches (the line breaks where the voice does for more than 0.2 s; a consonant doesn't), smoothed a little, in seconds from egin (the start of the first
   word, or of the speech if not given) to inish. */
export function contour(analysis, begin, finish) {
  const tr = analysis && analysis.ok && analysis.track;
  if (!tr) return null;
  const run = speechRuns(analysis);
  const from = begin === undefined ? run.from : begin, to = finish === undefined ? run.to : finish;
  if (!(to > from)) return null;
  const hop = tr.hop || 0.01, n = tr.f0.length;
  const i0 = Math.max(0, Math.round(from / hop)), i1 = Math.min(n - 1, Math.round(to / hop));
  const segs = [];
  let cur = [], miss = 0;
  const flush = () => { if (cur.length >= 4) segs.push(cur); cur = []; };
  for (let i = i0; i <= i1; i += 1) {
    if (tr.f0[i] > 0) { cur.push([i * hop - from, 12 * Math.log2(tr.f0[i] / analysis.pitchHz)]); miss = 0; }
    else { miss += 1; if (miss > 20) flush(); }
  }
  flush();
  const smooth = segs.map((s) => s.map((p, k) => {
    const near = s.slice(Math.max(0, k - 2), k + 3).map((q) => q[1]).sort((a, b) => a - b);
    return [p[0], near[Math.floor(near.length / 2)]];
  }));
  const all = smooth.flat().map((p) => Math.abs(p[1])).sort((a, b) => a - b);
  return { from, to, dur: to - from, segs: smooth, reach: all.length ? all[Math.floor(0.95 * (all.length - 1))] : 0 };
}

/* the pitch of a contour at time t, or null where the voice isn't pitched */
export function pitchAt(c, t) {
  if (!c) return null;
  for (const s of c.segs) {
    if (t < s[0][0] - 0.04 || t > s[s.length - 1][0] + 0.04) continue;
    let lo = 0, hi = s.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (s[m][0] < t) lo = m + 1; else hi = m; }
    const p = s[lo], q = s[Math.max(0, lo - 1)];
    return Math.abs(p[0] - t) < Math.abs(q[0] - t) ? p[1] : q[1];
  }
  return null;
}

/* ---------- one time axis for two recordings ---------- */

/* A map from the seconds of one recording of a line to the seconds of another, word by word: the start and the end of
   every word are matching points, with straight lines between them (a pause lands on a pause) and a slope of 1 beyond
   the ends. src and dst are word spans [{ from, to }] of the same words in the same order. Returns { fwd, inv }. */
export function wordMap(src, dst) {
  const xs = [], ys = [];
  const add = (x, y) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (xs.length && (x <= xs[xs.length - 1] + 1e-4 || y <= ys[ys.length - 1] + 1e-4)) return;
    xs.push(x); ys.push(y);
  };
  const n = Math.min(src.length, dst.length);
  for (let i = 0; i < n; i += 1) { add(src[i].from, dst[i].from); add(src[i].to, dst[i].to); }
  const line = (X, Y) => (t) => {
    const m = X.length;
    if (m === 0) return t;
    if (m === 1 || t <= X[0]) return Y[0] + (t - X[0]);
    if (t >= X[m - 1]) return Y[m - 1] + (t - X[m - 1]);
    let lo = 0, hi = m - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (X[mid] <= t) lo = mid; else hi = mid; }
    return Y[lo] + ((t - X[lo]) / (X[hi] - X[lo])) * (Y[hi] - Y[lo]);
  };
  return { fwd: line(xs, ys), inv: line(ys, xs) };
}

/* a contour with its times passed through a map such as wordMap's fwd */
export function warpContour(c, fwd) {
  if (!c) return c;
  return { ...c, dur: fwd(c.dur), segs: c.segs.map((s) => s.map((p) => [fwd(p[0]), p[1]])) };
}

/* ---------- drawing the lane ---------- */

/* ctx is a 2d context already scaled to CSS pixels. o: { you, ex (contours), T (seconds across), R (semitones above
   and below the middle), voice ("you" | "example"), at (the playhead in that voice's seconds, or null), shown (how
   much of the take is drawn, 0 to 1), tint ([r, g, b] 0-255), spans (word spans of the voice being played) } */
export function paintLane(ctx, W, H, o) {
  const pad = 8, top = 10, bottom = 12, mid = (H - bottom + top) / 2, half = (H - bottom - top) / 2;
  const X = (t) => pad + (clamp(t, 0, o.T) / o.T) * (W - 2 * pad);
  const Y = (st) => mid - (clamp(st, -o.R, o.R) / o.R) * half * 0.92;
  const rgba = (c, a) => "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")";
  const me = o.tint || [232, 238, 244];
  const playing = o.at !== null && o.at !== undefined;
  ctx.clearRect(0, 0, W, H);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  /* the middle: the speaker's own usual pitch */
  ctx.strokeStyle = "rgba(160,175,195,0.14)";
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 5]);
  ctx.beginPath(); ctx.moveTo(pad, mid); ctx.lineTo(W - pad, mid); ctx.stroke();
  ctx.setLineDash([]);

  /* where the words of the voice that is playing begin */
  if (o.spans) {
    ctx.strokeStyle = "rgba(160,175,195,0.16)";
    ctx.beginPath();
    o.spans.forEach((s, i) => { if (i) { const x = X((s.from + o.spans[i - 1].to) / 2); ctx.moveTo(x, H - bottom + 1); ctx.lineTo(x, H - 3); } });
    ctx.stroke();
  }

  const reach = o.shown === undefined ? 1 : o.shown;
  const meEnd = o.you ? o.you.dur * reach : 0;

  /* the gap between the two melodies, where both have a pitch */
  if (o.you && o.ex) {
    ctx.strokeStyle = rgba(me, 0.10);
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let t = 0; t <= Math.min(meEnd, o.ex.dur); t += 0.03) {
      const a = pitchAt(o.you, t), b = pitchAt(o.ex, t);
      if (a === null || b === null) continue;
      ctx.moveTo(X(t), Y(a)); ctx.lineTo(X(t), Y(b));
    }
    ctx.stroke();
  }

  const trace = (c, upTo, width, color) => {
    if (!c) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    for (const s of c.segs) {
      ctx.beginPath();
      let started = false;
      for (const p of s) {
        if (p[0] > upTo) break;
        if (!started) { ctx.moveTo(X(p[0]), Y(p[1])); started = true; } else ctx.lineTo(X(p[0]), Y(p[1]));
      }
      if (started) ctx.stroke();
    }
  };

  /* the example: a wide, quiet ribbon to follow, brighter where it has been played */
  const exPlayed = o.voice === "example" && playing ? o.at : 0;
  trace(o.ex, o.ex ? o.ex.dur : 0, 8, "rgba(185,200,222,0.30)");
  if (exPlayed) trace(o.ex, exPlayed, 8, "rgba(210,222,238,0.62)");

  /* you: the take's own line, glowing where it has been played */
  const youPlayed = o.voice === "you" && playing ? o.at : meEnd;
  if (o.you) {
    trace(o.you, meEnd, 2.5, rgba(me, o.voice === "example" && playing ? 0.35 : 0.55));
    ctx.save();
    ctx.shadowColor = rgba(me, 0.9);
    ctx.shadowBlur = 8;
    trace(o.you, Math.min(meEnd, youPlayed), 3.2, rgba(me, 1));
    ctx.restore();
  }

  /* the playhead, and a dot on the line of the voice that is playing */
  if (playing) {
    const x = X(o.at);
    ctx.strokeStyle = "rgba(232,238,244,0.55)";
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x, top - 4); ctx.lineTo(x, H - bottom + 2); ctx.stroke();
    const st = pitchAt(o.voice === "example" ? o.ex : o.you, o.at);
    if (st !== null) {
      ctx.fillStyle = "#f4f8fb";
      ctx.shadowColor = o.voice === "example" ? "rgba(200,212,228,0.9)" : rgba(me, 1);
      ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(x, Y(st), 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    }
  }
}

/* how far the lane reaches in semitones: enough for either melody, never less than 5 */
export function laneReach(you, ex) {
  const r = Math.max(you ? you.reach : 0, ex ? ex.reach : 0);
  return Math.max(5, Math.ceil(r * 1.15));
}
