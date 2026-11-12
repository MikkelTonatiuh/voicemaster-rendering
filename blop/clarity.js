/* Word clarity, measured on this device. Whisper tiny.en is given the line the learner was meant to say and
   asked how likely each word is given what it heard; a word that scores low is one a listener would have
   trouble making out. On 1,220 sentences read by adult learners, with expert scores to check against, the
   words marked red were unclear 65% of the time and the green ones 5%. The model runs in clarity.worker.js;
   this file is the part that doesn't need it. */
export const MODEL = "Xenova/whisper-tiny.en";
export const LIB = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1/dist/transformers.min.js";

/* A word's score is the mean log-probability of its pieces. Short words are reduced in everyday speech, so
   they get harsher cut-offs. */
export const CUTS = { long: { bad: -5, mid: -2.5 }, short: { bad: -8, mid: -5 } };
const LONG = 4;

const letters = (word) => String(word).replace(/[^A-Za-z]/g, "").length;

export function levelOf(word, s) {
  const c = letters(word) >= LONG ? CUTS.long : CUTS.short;
  return s < c.bad ? "bad" : s < c.mid ? "mid" : "ok";
}

/* how much of a word counts as heard: 1 for a clear word, falling to 0 as it gets harder to make out */
export function creditOf(word, s) {
  const scale = letters(word) >= LONG ? 6 : 10;
  return Math.min(1, Math.max(0, 1 + s / scale));
}

/* tokens are the model's word pieces for " " + line; a piece that starts with "Ġ" starts a new word.
   Returns [{ w, s, level }] in the line's own word order, or null when the pieces don't match the words. */
export function wordScores(words, tokens, logps) {
  if (!words.length || tokens.length !== logps.length) return null;
  let cur = -1;
  const group = tokens.map((t) => { if (t.startsWith("Ġ")) cur += 1; return Math.max(cur, 0); });
  if (cur + 1 !== words.length) return null;
  const per = words.map(() => []);
  tokens.forEach((t, k) => { if (/[A-Za-z0-9]/.test(t)) per[group[k]].push(logps[k]); });
  return words.map((w, i) => {
    const s = per[i].length ? per[i].reduce((a, b) => a + b, 0) / per[i].length : 0;
    return { w, s, level: levelOf(w, s) };
  });
}

/* Blop is pleased with a finished take only when it scores this much as well as having no hard word and at most one
   soft one. Without it, 33% of the takes that experts rated "many mistakes and accent" and 76% of those rated "good, a
   few mistakes" got the pleased face; with it 5% and 43%, while 80% of the "excellent" ones still do (1,217 adult takes,
   speechocean762 test split, Whisper tiny.en). The reading while the learner speaks leaves it out (blop/grade.js). */
export const PRAISE = 92;

/* one number for the board, how Blop should feel about it, and the words behind both. `praise` is the least score at
   which the take can please Blop (the finished take passes PRAISE). */
export function summarize(words, praise = 0) {
  const bad = words.filter((x) => x.level === "bad").sort((a, b) => a.s - b.s);
  const mid = words.filter((x) => x.level === "mid").sort((a, b) => a.s - b.s);
  /* by credit lost, as the score counts it, so the short words that are always reduced don't crowd out the others */
  const weakest = [...words].sort((a, b) => creditOf(a.w, a.s) - creditOf(b.w, b.s)).slice(0, 2);
  const credit = words.reduce((sum, x) => sum + creditOf(x.w, x.s), 0);
  const score = Math.round((100 * credit) / Math.max(1, words.length));
  const band = score < 50 || bad.length >= 0.4 * words.length ? "bad"
    : bad.length === 0 && mid.length <= 1 && score >= praise ? "good"
    : "mid";
  return { score, band, bad, mid, weakest, clear: words.length - bad.length - mid.length, total: words.length };
}

const say = (w) => String(w).replace(/[^A-Za-z']/g, "").toLowerCase();
const quoted = (list) => {
  const q = list.map((x) => "'" + say(x.w) + "'");
  return q.length < 2 ? q[0] : q.slice(0, -1).join(", ") + " and " + q[q.length - 1];
};

/* what Blop says about the take, in its own voice. The first line is the one the board shows. */
export function clarityTips(sum) {
  const { bad, mid } = sum;
  if (sum.band === "bad") return ["a lot of that was hard to make out. listen again and say it a little slower."];
  if (bad.length) {
    const some = bad.slice(0, 3);
    return [quoted(some) + (some.length === 1 ? " was" : " were") + " hard to hear. listen again and try it once more."];
  }
  if (mid.length) {
    const some = mid.slice(0, 2);
    return [(sum.band === "good" ? "that was clear. only " : "nearly. ") + quoted(some) + (some.length === 1 ? " was" : " were") + " a bit soft."];
  }
  /* nothing was hard to hear, but the take is short of the mark that pleases Blop: name where it was least clear */
  if (sum.band === "mid" && sum.weakest.length) {
    return ["nearly. " + quoted(sum.weakest) + (sum.weakest.length === 1 ? " was" : " were") + " the softest."];
  }
  return ["that was clear."];
}

/* the fixed phrase the board shows under the words, like "9 of 11 words were clear" */
export function clarityNote(sum) {
  return sum.clear + " of " + sum.total + " words " + (sum.total === 1 ? "was" : "were") + " clear";
}

/* Has the learner got to the end of the line? When they stop part way, the model scores the words they have not
   said very low: it has nothing in the audio to find them in. Over 1,217 adult takes, a mean score of -2 or
   better on the last two words was reached at the end of 80% of takes and at 9% of the pauses in the middle. */
export const TAIL = -2;

export function tailHeard(words) {
  if (!Array.isArray(words) || !words.length) return false;
  const last = words.slice(-2);
  return last.reduce((a, x) => a + x.s, 0) / last.length >= TAIL;
}

/* How the take is going while the learner is still speaking. The first words of the line can be scored as soon as they
   have been said. Which have surely been said is worked out from how long the learner has been speaking, the pauses
   left out, and when the model voice says each word. On 61 takes of 14 to 30 words made from adult learners' readings
   (speechocean762, against a Liora reading of the same words) the speaking time was 1.4 times the model voice's at
   the median, 2.2 times at the 95th percentile and 2.9 at most; on 170 single sentences 1.6, 3.1 and 4.6. A word
   counts once the speaking time is `slowest` times the model voice's time to the end of it, plus a moment (`lead`) for
   the speech to be picked up. `min` words are needed before Blop shows anything; a last word or two scoring below
   `unsaid` are taken to be not said yet (see liveBand in blop/grade.js). */
export const LIVE = { slowest: 3, lead: 0.3, min: 2, unsaid: -10 };

/* anchors: the model voice's [start, end] for each word of the line (voice/models/lines.json) */
export function wordsReached(anchors, spoken, cfg = LIVE) {
  if (!Array.isArray(anchors) || !anchors.length || !(spoken > 0)) return 0;
  const t0 = anchors[0][0];
  let k = 0;
  while (k < anchors.length && (anchors[k][1] - t0) * cfg.slowest + cfg.lead <= spoken) k += 1;
  return k;
}

/* How much of the word model has arrived, for the first visit's "first time only · NN%". The library adds up every
   file it needs in its "progress_total" events, with the sizes it asked for before downloading. If it could not get
   those sizes, the files that have reported are added up instead, but only once the model's weights are among them:
   the small files come first and would read as nearly done. Returns a function that takes each progress event and
   gives the percentage to show (0 to 99, never going back), or null when there is nothing new to show. */
export function downloadMeter() {
  const files = new Map();
  let shown = 0, whole = false;
  return (p) => {
    let pct = null;
    if (p && p.status === "progress_total" && p.total > 5e6) { whole = true; pct = p.progress; }
    else if (p && !whole && p.status === "progress" && p.total > 0) {
      files.set(p.file, [p.loaded, p.total]);
      if ([...files.keys()].some((f) => /\.onnx$/.test(String(f)))) {
        let loaded = 0, total = 0;
        for (const [l, t] of files.values()) { loaded += l; total += t; }
        pct = (100 * loaded) / total;
      }
    }
    if (pct === null || !Number.isFinite(pct)) return null;
    pct = Math.min(99, Math.round(pct));
    if (pct <= shown) return null;
    shown = pct;
    return shown;
  };
}

function assets() {
  /* a test page on this machine may point at a copy of the model and runtime on another local port */
  const here = typeof location !== "undefined" ? location : null;
  const dev = !!here && /^(localhost|127\.0\.0\.1)$/.test(here.hostname);
  const q = dev ? new URLSearchParams(here.search).get("assets") : null;
  const local = q && /^http:\/\/(localhost|127\.0\.0\.1):\d+\/$/.test(q) ? q : null;
  return { lib: local ? local + "transformers.min.js" : LIB, local };
}

/* starts the worker and returns { ready, score(pcm16k, text, { heard }), hear(id, pcm16k), cancel(id), onHeard(fn),
   stop() }. score() asks for the line's word scores and, unless heard is false, what the model made of the take,
   which arrives later through onHeard; hear() asks for that on its own, for a take that was scored earlier. The
   model is about 40 MB and is cached by the browser after the first time. */
export function startClarity({ onProgress } = {}) {
  const worker = new Worker(new URL("./clarity.worker.js", import.meta.url), { type: "module" });
  const waiting = new Map();
  let heard = null, nextId = 0;
  const ready = new Promise((resolve, reject) => {
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === "progress") { if (onProgress) onProgress(m.pct); }
      else if (m.type === "ready") resolve(true);
      else if (m.type === "scored" && waiting.has(m.id)) { waiting.get(m.id).resolve(m); waiting.delete(m.id); }
      else if (m.type === "heard") { if (heard) heard(m.id, m.text); }
      else if (m.type === "error") {
        const w = waiting.get(m.id);
        if (w) { w.reject(new Error(m.message)); waiting.delete(m.id); } else reject(new Error(m.message));
      }
    };
    worker.onerror = (e) => reject(new Error((e && e.message) || "the word check could not start"));
    worker.postMessage({ type: "init", ...assets() });
  });
  ready.catch(() => undefined);
  return {
    ready,
    score(pcm, text, { heard: hear = true } = {}) {
      const id = (nextId += 1);
      const done = new Promise((resolve, reject) => {
        waiting.set(id, { resolve, reject });
        worker.postMessage({ type: "score", id, pcm, text, heard: hear }, [pcm.buffer]);
      }).then((m) => ({ id, words: m.words, ms: m.ms }));
      done.id = id;
      return done;
    },
    hear(id, pcm) { worker.postMessage({ type: "hear", id, pcm }, [pcm.buffer]); },
    /* a job that has not started yet is dropped; it still resolves, with no words */
    cancel(id) { worker.postMessage({ type: "cancel", id }); },
    onHeard(fn) { heard = fn; },
    stop() { worker.terminate(); },
  };
}
