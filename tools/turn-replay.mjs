/* Replays recorded takes through blop/turn.js the way the page feeds it (about 60 level readings a second) and
   reports how often the take would have been ended before the speaker was done, and how long the board takes to
   come up after the last word. This is how the settings in blop/turn.js were chosen.

   The takes are the adult recordings of the speechocean762 test set (Apache-2.0): a folder of u<id>.wav files and
   a meta.json with { id, text, words, syl (syllables in the text), fluency }. The score file holds, for every pause
   of 0.4 s or more in a take and for its end, the word scores the model gives the take up to that point plus half
   a second of quiet: { "<id>": [{ at: seconds, w: [word score, ...] }] } (the model is run as in
   blop/clarity.worker.js, once per cut of the take).

   Run from anywhere (Node 18+):
     node tools/turn-replay.mjs <takes_folder> --sweep
         fixed quiet of 0.5 to 2 s, then the quiet-and-length rule without the word model
     node tools/turn-replay.mjs <takes_folder> --tails <scores.json> [--latency 1] [--score 1]
         the rule as shipped; latency is how long the model takes to score a take, score how long scoring takes
         when it starts only once the take has ended (seconds)
     node tools/turn-replay.mjs <takes_folder> --peek oracle
         the ceiling: a perfect answer to "has the learner finished?"
   Other options: --rate (syllables per second of the model voice, 4.6), --tailcut (-2), --fixed <s>, --limit <n>,
   and any setting of blop/turn.js by name (--peekAt 0.5, --holdMin 1.4, --quietMax 1.8, ...).
   A real room: --snr <dB> --wobble <dB> --bursts <dB> --agc <dB> --zeros <s> --voicing (see below). */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { createTurn } from "../blop/turn.js";
import { TAIL } from "../blop/clarity.js";

const VE = createRequire(import.meta.url)("../voice/engine.js");

const args = process.argv.slice(2);
const dir = args[0];
if (!dir || dir.startsWith("--")) { console.error("usage: node tools/turn-replay.mjs <takes_folder> [--sweep | --fixed s | --tails scores.json | --peek oracle]"); process.exit(1); }
const opt = (name, def) => { const i = args.indexOf("--" + name); return i < 0 ? def : args[i + 1]; };
const flag = (name) => args.includes("--" + name);

const SR = 16000, WIN = 341, HOP = 267;   /* 21 ms windows, 60 a second, like the page's analyser */
const meta = JSON.parse(fs.readFileSync(path.join(dir, "meta.json"), "utf8"));
const limit = +opt("limit", 0);

function readWav(file) {
  const b = fs.readFileSync(file);
  let p = 12;
  while (p < b.length - 8) {
    const id = b.toString("ascii", p, p + 4), n = b.readUInt32LE(p + 4);
    if (id === "data") {
      const m = Math.min(n, b.length - p - 8) >> 1, x = new Float32Array(m);
      for (let i = 0; i < m; i += 1) x[i] = b.readInt16LE(p + 8 + 2 * i) / 32768;
      return x;
    }
    p += 8 + n + (n & 1);
  }
  throw new Error("no data chunk in " + file);
}

/* what the speaker really did: the engine's voice activity over the whole take (cached next to the takes) */
const truthFile = path.join(dir, "truth.json");
const truth = fs.existsSync(truthFile) ? JSON.parse(fs.readFileSync(truthFile, "utf8")) : {};
const clips = [];
let dirty = false;
for (const m of meta) {
  if (limit && clips.length >= limit) break;
  const x = readWav(path.join(dir, "u" + String(m.id).padStart(4, "0") + ".wav"));
  if (!truth[m.id]) {
    const a = VE.analyze(x, SR, { minVoiced: 0.4 });
    let first = -1, last = -1;
    const sp = a.track ? a.track.speech : [];
    for (let i = 0; i < sp.length; i += 1) if (sp[i]) { if (first < 0) first = i; last = i; }
    truth[m.id] = { ok: !!a.ok && first >= 0, start: first * 0.01, end: (last + 1) * 0.01, pauses: a.ok ? a.pauses : [] };
    dirty = true;
  }
  if (truth[m.id].ok) clips.push({ m, x, t: truth[m.id] });
}
if (dirty) fs.writeFileSync(truthFile, JSON.stringify(truth));

/* A real room is noisier than these takes. --snr adds white noise that far (in dB) below the take's loudest
   speech, --wobble makes its level swing that many dB up and down once or twice a second (a fan, typing),
   --bursts adds bursts of noise that far below the speech, 0.1 to 0.25 s long about every second (a mic's noise
   suppression pumping), --agc makes the room get that many dB louder over the two seconds after the speech
   ends (a driver's gain coming back up), and --zeros starts the take with that many seconds of digital silence,
   which is what the page's analyser reads in the moments after the mic opens. --voicing also gives the rule what
   the page gives it: whether the last 43 ms were voiced (voice/engine.js livePitch). */
const SNR = opt("snr", null) === null ? null : +opt("snr");
const ZEROS = +opt("zeros", 0);
const WOBBLE = +opt("wobble", 0);
const BURSTS = opt("bursts", null) === null ? null : +opt("bursts");
const AGC = +opt("agc", 0);
const VOICING = flag("voicing");
const VWIN = Math.round(SR * 0.043);
const randn = () => (Math.random() + Math.random() + Math.random() - 1.5) * 2;

/* the take, then a quiet tail made from its own quietest stretch, then the room's noise on top */
function signal(x, t) {
  const seg = 1600;
  let best = Infinity, at = 0;
  for (let i = 0; i + seg <= x.length; i += seg) {
    let s = 0;
    for (let k = i; k < i + seg; k += 1) s += x[k] * x[k];
    if (s < best) { best = s; at = i; }
  }
  const y = new Float32Array(x.length + SR * 10);
  y.set(x);
  for (let i = x.length; i < y.length; i += 1) y[i] = x[at + ((i - x.length) % seg)];
  if (SNR === null && BURSTS === null) return y;
  let top = 0;
  for (let i = 0; i + WIN <= x.length; i += HOP) {
    let s = 0;
    for (let k = i; k < i + WIN; k += 1) s += x[k] * x[k];
    top = Math.max(top, s / WIN);
  }
  const speech = Math.sqrt(top);
  if (SNR !== null) {
    const sd = speech * Math.pow(10, -SNR / 20);
    const f = 0.4 + 1.6 * Math.random(), ph = 2 * Math.PI * Math.random();
    for (let i = 0; i < y.length; i += 1) {
      const g = Math.pow(10, (WOBBLE * Math.sin((2 * Math.PI * f * i) / SR + ph)) / 20);
      const ramp = AGC ? Math.min(1, Math.max(0, (i / SR - t.end) / 2)) * (Math.pow(10, AGC / 20) - 1) : 0;
      y[i] += sd * g * (1 + ramp) * randn();
    }
  }
  if (BURSTS !== null) {
    const level = speech * Math.pow(10, -BURSTS / 20);
    for (let at2 = Math.random() * SR; at2 < y.length; at2 += (0.4 + 1.2 * Math.random()) * SR) {
      const len = Math.round((0.1 + 0.15 * Math.random()) * SR);
      for (let k = 0; k < len && at2 + k < y.length; k += 1) y[Math.round(at2) + k] += level * randn() * Math.min(1, k / 320, (len - k) / 320);
    }
  }
  return y;
}

/* level readings as the analyser gives them (and whether the last 43 ms were voiced) */
function frames(y) {
  const out = [];
  for (let end = HOP; end <= y.length; end += HOP) {
    let s = 0;
    const from = Math.max(0, end - WIN);
    for (let k = from; k < end; k += 1) s += y[k] * y[k];
    let voiced;
    if (VOICING) voiced = end >= VWIN && VE.livePitch(y.subarray(end - VWIN, end), SR) > 0;
    out.push([end / SR + ZEROS, 20 * Math.log10(Math.sqrt(s / (end - from)) + 1e-9), voiced]);
  }
  /* the analyser reads zeros until the first audio arrives */
  const zeros = [];
  for (let t = HOP / SR; t <= ZEROS; t += HOP / SR) zeros.push([t, -180, false]);
  return zeros.concat(out);
}
for (const c of clips) { c.f = frames(signal(c.x, c.t)); c.t = { ...c.t, start: c.t.start + ZEROS, end: c.t.end + ZEROS, pauses: c.t.pauses.map((p) => ({ ...p, at: p.at + ZEROS })) }; }
const tailsFile = opt("tails", null);
const TAILS = tailsFile ? JSON.parse(fs.readFileSync(tailsFile, "utf8")) : null;
const TAILCUT = +opt("tailcut", TAIL);

/* what the model made of the take up to time tl: the scores recorded for the nearest pause */
function said(c, tl, o) {
  if (o.peek === "oracle") return c.t.end - tl < 0.25;
  const rows = TAILS[c.m.id];
  if (!rows) return true;
  let best = null;
  for (const r of rows) if (!best || Math.abs(r.at - (tl - ZEROS)) < Math.abs(best.at - (tl - ZEROS))) best = r;
  const w = best.w;
  return (w[w.length - 1] + w[w.length - 2]) / 2 >= TAILCUT;
}

function replay(c, config, o) {
  const turn = createTurn({ expected: c.m.syl / o.rate, config, listens: o.peek !== "none" });
  let pending = null, answered = null;
  for (const [t, db, voiced] of c.f) {
    if (pending && t >= pending.at) { turn.heard(pending.tl, pending.said); answered = pending.tl; pending = null; }
    const r = turn.tick(t, db, voiced);
    if (r.done) return { fire: t, reason: r.reason, spec: answered !== null && answered === turn.state().tl };
    if (o.peek !== "none" && !pending && turn.wantsPeek()) {
      const tl = turn.peeking();
      pending = { at: t + o.latency, tl, said: said(c, tl, o) };
    }
  }
  return { fire: Infinity, reason: "never", spec: false };
}

const pct = (a, p) => { const s = [...a].sort((u, v) => u - v); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; };
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : "  - ");

function evaluate(label, config, o) {
  const rows = clips.map((c) => {
    const r = replay(c, config, o);
    const late = r.fire - c.t.end;
    /* from the last word to the board: the scoring has already run when the model scored the whole take */
    return { flu: c.m.fluency, late, board: late + (r.spec ? 0 : o.score), reason: r.reason, cut: late < -0.15, lost: Math.max(0, -late) };
  });
  const cut = rows.filter((r) => r.cut), kept = rows.filter((r) => !r.cut);
  const by = (lo, hi) => rows.filter((r) => r.flu >= lo && r.flu < hi);
  const cutRate = (rs) => (rs.length ? (100 * rs.filter((r) => r.cut).length / rs.length).toFixed(1) + "%" : "-");
  console.log(
    label.padEnd(30),
    "cut", (100 * cut.length / rows.length).toFixed(1).padStart(5) + "%",
    "(fluency <7: " + cutRate(by(0, 7)).padStart(5) + ", 7-8: " + cutRate(by(7, 9)).padStart(4) + ", 9+: " + cutRate(by(9, 11)).padStart(4) + ")",
    "| quiet before the end: median", f2(pct(kept.map((r) => r.late), 0.5)), "p90", f2(pct(kept.map((r) => r.late), 0.9)),
    "| to the board: median", f2(pct(kept.map((r) => r.board), 0.5)), "p90", f2(pct(kept.map((r) => r.board), 0.9)),
  );
  return rows;
}

const base = { rate: +opt("rate", 4.6), peek: tailsFile ? "file" : opt("peek", "none"), latency: +opt("latency", 1), score: +opt("score", 1) };
const cfg = {};
for (const k of ["slow", "spread", "quietMax", "quietMin", "holdMax", "holdMin", "waitMax", "peekAt", "idle", "longest"]) if (opt(k, null) !== null) cfg[k] = +opt(k);

console.log(clips.length, "takes;", "speech span median", f2(pct(clips.map((c) => c.t.end - c.t.start), 0.5)), "s; speaking rate median",
  f2(pct(clips.map((c) => c.m.syl / (c.t.end - c.t.start)), 0.5)), "syllables a second; with a pause of 0.25 s or more:",
  (100 * clips.filter((c) => c.t.pauses.length).length / clips.length).toFixed(0) + "%");

if (flag("sweep")) {
  for (const q of [0.5, 0.6, 0.8, 1.0, 1.2, 1.5, 2.0]) evaluate("fixed quiet " + q + " s", { quietMax: q, quietMin: q }, { ...base, peek: "none" });
  evaluate("quiet by the length, no model", {}, { ...base, peek: "none" });
} else if (opt("fixed", null) !== null) {
  const q = +opt("fixed");
  evaluate("fixed quiet " + q + " s", { quietMax: q, quietMin: q }, { ...base, peek: "none" });
} else {
  const rows = evaluate(base.peek === "none" ? "quiet by the length, no model" : "as shipped", cfg, base);
  const why = {};
  for (const r of rows) why[r.reason] = (why[r.reason] || 0) + 1;
  console.log("ended by:", JSON.stringify(why));
}
