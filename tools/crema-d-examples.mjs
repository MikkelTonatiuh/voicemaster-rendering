/* Picks Blop's example voice lines from CREMA-D: 91 real actors saying 12 sentences in different emotions.

   For every sentence and tone it ranks the clips by how clearly listeners heard the intended emotion from
   the voice alone (CREMA-D's crowd ratings), downloads the best few, measures them with voice/engine.js and
   keeps the one that is clean, easy to pitch-track and fits the tone. It writes voice/models/<id>.mp3 and
   voice/models/lines.json, which Blop reads.

   With --calibrate it then plays the real test: other actors' takes of the same sentence are scored against
   each example. Takes in the example's emotion should score higher than takes in the other two.

   Run from anywhere (Node 18+, ffmpeg on the PATH):
     node tools/crema-d-examples.mjs
     node tools/crema-d-examples.mjs --calibrate

   Downloads are cached in the system temp folder (crema-d). CREMA-D: Cao et al. 2014,
   https://github.com/CheyneyComputerScience/CREMA-D. Open Database License; the recordings themselves
   under the Database Contents License. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { MIN_VOICED } from "../blop/local.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const E = createRequire(import.meta.url)(path.join(ROOT, "voice", "engine.js"));
const OUT = path.join(ROOT, "voice", "models");
const CACHE = path.join(os.tmpdir(), "crema-d");
const META = "https://raw.githubusercontent.com/CheyneyComputerScience/CREMA-D/master/";
/* the audio comes from the project's own GitLab mirror, which CREMA-D recommends over GitHub's LFS quota */
const AUDIO = "https://gitlab.com/cs-cooper-lab/crema-d-mirror/-/raw/main/AudioWAV/";

const SENTENCES = {
  IEO: "It's eleven o'clock",
  TIE: "That is exactly what happened",
  IOM: "I'm on my way to the meeting",
  IWW: "I wonder what this is about",
  TAI: "The airplane is almost full",
  MTI: "Maybe tomorrow it will be cold",
  IWL: "I would like a new alarm clock",
  ITH: "I think I have a doctor's appointment",
  DFA: "Don't forget a jacket",
  ITS: "I think I've seen this before",
  TSI: "The surface is slick",
  WSI: "We'll stop in a couple of minutes",
};
/* the thesis grouped emotions into three speaking styles; the example for each style is that group's
   clearest emotion */
const TONES = {
  calm: { emo: "NEU", vote: "N", word: "neutral" },
  excited: { emo: "HAP", vote: "H", word: "happy" },
  authoritative: { emo: "ANG", vote: "A", word: "angry" },
};
const EMO_TONE = Object.fromEntries(Object.entries(TONES).map(([tone, t]) => [t.emo, tone]));
const PER_LINE = 6;      /* best-rated clips measured for each sentence and tone */
const TAKES = 12;        /* other actors' takes per emotion in the calibration */

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const quantile = (arr, q) => {
  const v = Array.from(arr).sort((p, r) => p - r);
  return v.length ? v[Math.min(v.length - 1, Math.floor(q * v.length))] : NaN;
};
const median = (arr) => quantile(arr, 0.5);

/* ---------- downloads ---------- */
fs.mkdirSync(path.join(CACHE, "wav"), { recursive: true });

async function download(url, file) {
  if (fs.existsSync(file) && fs.statSync(file).size > 1000) return file;
  for (let attempt = 1; ; attempt += 1) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error("HTTP " + r.status + " for " + url);
      fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
      return file;
    } catch (err) {
      if (attempt >= 3) throw err;
      await new Promise((res) => setTimeout(res, 1500 * attempt));
    }
  }
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (next < items.length) {
      const k = next++;
      out[k] = await fn(items[k], k);
    }
  }));
  return out;
}

function parseCsv(text) {
  const rows = [];
  for (const line of text.trim().split(/\r?\n/)) {
    const out = [];
    let cur = "", quoted = false;
    for (const ch of line) {
      if (ch === "\"") quoted = !quoted;
      else if (ch === "," && !quoted) { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur);
    rows.push(out);
  }
  return rows;
}

function readWav(file) {
  const b = fs.readFileSync(file);
  if (b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WAVE") throw new Error("not a WAV file: " + file);
  let p = 12, fmt = null;
  while (p + 8 <= b.length) {
    const id = b.toString("ascii", p, p + 4), size = b.readUInt32LE(p + 4), body = p + 8;
    if (id === "fmt ") fmt = { format: b.readUInt16LE(body), channels: b.readUInt16LE(body + 2), sr: b.readUInt32LE(body + 4), bits: b.readUInt16LE(body + 14) };
    if (id === "data") {
      if (!fmt || fmt.format !== 1 || fmt.bits !== 16) throw new Error("unsupported WAV format: " + file);
      const frames = Math.floor(Math.min(size, b.length - body) / (2 * fmt.channels));
      const pcm = new Float32Array(frames);
      for (let i = 0; i < frames; i += 1) pcm[i] = b.readInt16LE(body + i * 2 * fmt.channels) / 32768;
      return { pcm, sr: fmt.sr };
    }
    p = body + size + (size & 1);
  }
  throw new Error("no audio in " + file);
}

const clipFile = (name) => path.join(CACHE, "wav", name + ".wav");
const fetchClips = (names) => pool([...new Set(names)], 8, (name) => download(AUDIO + name + ".wav", clipFile(name)));

const analysed = new Map();
function measure(name) {
  if (!analysed.has(name)) {
    const { pcm, sr } = readWav(clipFile(name));
    let peak = 0;
    for (const v of pcm) peak = Math.max(peak, Math.abs(v));
    analysed.set(name, { a: E.analyze(pcm, sr, { minVoiced: MIN_VOICED }), peak });
  }
  return analysed.get(name);
}

/* ---------- what listeners heard (voice-only ratings) ---------- */
const metaFile = async (name, url) => fs.readFileSync(await download(url, path.join(CACHE, name)), "utf8");
const votesCsv = parseCsv(await metaFile("tabulatedVotes.csv", META + "processedResults/tabulatedVotes.csv"));
const peopleCsv = parseCsv(await metaFile("VideoDemographics.csv", META + "VideoDemographics.csv"));
const people = new Map(peopleCsv.slice(1).map((r) => [r[0], { age: +r[1], sex: r[2] }]));

const LETTERS = ["A", "D", "F", "H", "N", "S"];
const LEVEL_COL = { A: 12, H: 15, N: 16 };   /* mean rated strength of that emotion, 0-100 */
const clips = new Map();
for (const r of votesCsv.slice(1)) {
  if (!r[0].startsWith("1")) continue;   /* ids 1xxxxx are the voice-only ratings, 2 face-only, 3 audio-visual */
  const name = r[7], [actor, sentence, emo, level] = name.split("_");
  const votes = Object.fromEntries(LETTERS.map((l, i) => [l, +r[1 + i]]));
  const strength = Object.fromEntries(Object.entries(LEVEL_COL).map(([l, col]) => [l, +r[col]]));
  clips.set(name, { name, actor, sentence, emo, level, votes, strength, n: +r[8] });
}

/* how clearly listeners heard the intended emotion: share of votes (shrunk toward 1/2, so 3 of 3 does not
   beat 9 of 10), times how strongly they heard it */
function heard(c) {
  const want = TONES[EMO_TONE[c.emo]];
  if (!want || c.n < 6) return null;
  const top = Math.max(...Object.values(c.votes));
  if (c.votes[want.vote] !== top) return null;
  const share = (c.votes[want.vote] + 1) / (c.n + 2);
  const strength = want.vote === "N" ? 100 : clamp(c.strength[want.vote], 0, 100);
  return { share, strength, rank: share * (0.6 + 0.4 * (strength / 100)), label: c.votes[want.vote] + " of " + c.n + " listeners heard " + want.word };
}
for (const c of clips.values()) c.heard = heard(c);

const neutralOf = (actor, sentence) => {
  for (const level of ["XX", "LO", "MD", "HI"]) if (clips.has(actor + "_" + sentence + "_NEU_" + level)) return actor + "_" + sentence + "_NEU_" + level;
  return null;
};

/* ---------- is a clip a good example? ---------- */
/* clean recording, a pitch track without octave slips, no clipping */
function quality(m) {
  const a = m.a;
  if (!a.ok) return 0;
  const db = a.track.db, f0 = a.track.f0;
  const snr = quantile(db, 0.99) - quantile(db, 0.1);
  const voicedShare = a.voicedSeconds / Math.max(0.1, a.speechSeconds);
  let pairs = 0, slips = 0;
  for (let i = 1; i < f0.length; i += 1) {
    if (!(f0[i] > 0 && f0[i - 1] > 0)) continue;
    pairs += 1;
    if (Math.abs(12 * Math.log2(f0[i] / f0[i - 1])) > 3) slips += 1;
  }
  const slip = pairs ? slips / pairs : 1;
  /* CREMA-D's median clip has speech 29 dB above the background and 78% of it pitch-tracked */
  if (snr < 22 || voicedShare < 0.5 || a.clipped > 0.001 || slip > 0.03) return 0;
  return clamp((snr - 22) / 20, 0.3, 1) * clamp(voicedShare / 0.8, 0.3, 1) * (1 - 10 * slip);
}

/* fits the tone, judged against the same actor's neutral take of the sentence */
function fit(tone, a, neutral) {
  const lift = neutral && neutral.ok ? 12 * Math.log2(a.pitchHz / neutral.pitchHz) : null;   /* semitones above their neutral voice */
  const falls = a.endings && a.endings.n ? a.endings.falling / a.endings.n : 0.5;
  if (tone === "excited") return clamp(a.pitchSd / 4, 0.2, 1) * (lift == null ? 0.8 : clamp(0.5 + lift / 6, 0.3, 1));
  if (tone === "authoritative") {
    /* firm rather than shouting: close to their usual pitch, falling at the end, clear stress */
    const steady = lift == null ? 0.7 : lift <= 3 ? 1 : clamp(1 - (lift - 3) / 5, 0.1, 1);
    return steady * (0.6 + 0.4 * falls) * clamp(a.stressSd / 4, 0.4, 1);
  }
  /* calm: unhurried and settled */
  return clamp((5 - a.pace) / 2, 0.3, 1) * (0.6 + 0.4 * falls) * (a.pitchSd <= 3 ? 1 : 0.6);
}

/* ---------- pick ---------- */
const plan = [];
for (const tone of Object.keys(TONES)) {
  for (const sentence of Object.keys(SENTENCES)) {
    const cands = [...clips.values()]
      .filter((c) => c.sentence === sentence && c.emo === TONES[tone].emo && c.heard)
      .sort((p, q) => q.heard.rank - p.heard.rank)
      .slice(0, PER_LINE);
    plan.push({ tone, sentence, cands });
  }
}
const wanted = [];
for (const p of plan) for (const c of p.cands) wanted.push(c.name, neutralOf(c.actor, c.sentence));
console.log("downloading " + new Set(wanted.filter(Boolean)).size + " clips to " + CACHE + " ...");
await fetchClips(wanted.filter(Boolean));

const uses = new Map();
const lines = [];
for (const { tone, sentence, cands } of plan) {
  let best = null;
  for (const c of cands) {
    const m = measure(c.name);
    const q = quality(m);
    if (!q) continue;
    const nName = neutralOf(c.actor, c.sentence);
    const neutral = nName ? measure(nName).a : null;
    /* spread the lines over many voices */
    const score = c.heard.rank * q * fit(tone, m.a, neutral) * Math.pow(0.8, uses.get(c.actor) || 0);
    if (!best || score > best.score) best = { c, m, score };
  }
  if (!best) { console.warn("no usable clip for " + tone + " " + sentence); continue; }
  uses.set(best.c.actor, (uses.get(best.c.actor) || 0) + 1);
  const id = tone + "-" + sentence.toLowerCase();
  const gain = -1.5 - 20 * Math.log10(Math.max(1e-4, best.m.peak));   /* peaks at -1.5 dBFS */
  execFileSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y", "-i", clipFile(best.c.name), "-af",
    "volume=" + gain.toFixed(2) + "dB,silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,adelay=250,apad=pad_dur=0.3,asetpts=N/SR/TB",
    "-ac", "1", "-ar", "24000", "-b:a", "64k", path.join(OUT, id + ".mp3"),
  ]);
  const who = people.get(best.c.actor) || {};
  lines.push({
    id, t: SENTENCES[sentence] + (tone === "excited" ? "!" : "."), e: tone,
    clip: best.c.name, voice: (who.sex || "").toLowerCase(), heard: best.c.heard.label,
  });
  console.log(id.padEnd(20) + best.c.name.padEnd(18) + (who.sex || "").padEnd(8) + best.c.heard.label);
}
fs.writeFileSync(path.join(OUT, "lines.json"), "[\n" + lines.map((l) => "  " + JSON.stringify(l)).join(",\n") + "\n]\n");
console.log("wrote " + lines.length + " lines to voice/models/lines.json");

/* ---------- the real test: other actors' takes against each example ---------- */
if (process.argv.includes("--calibrate")) {
  const jobs = [];
  for (const line of lines) {
    const [actor, sentence] = line.clip.split("_");
    for (const emo of Object.keys(EMO_TONE)) {
      const pool_ = [...clips.values()]
        .filter((c) => c.sentence === sentence && c.emo === emo && c.actor !== actor && c.heard)
        .sort((p, q) => p.actor.localeCompare(q.actor));
      const step = Math.max(1, Math.floor(pool_.length / TAKES));
      for (let i = 0; i < pool_.length && i / step < TAKES; i += step) jobs.push({ line, take: pool_[i], same: EMO_TONE[emo] === line.e });
    }
  }
  console.log("\ncalibrating on " + new Set(jobs.map((j) => j.take.name)).size + " takes by other actors ...");
  await fetchClips(jobs.map((j) => j.take.name));

  const auc = (pos, neg) => {
    let s = 0;
    for (const p of pos) for (const q of neg) s += p > q ? 1 : p === q ? 0.5 : 0;
    return pos.length && neg.length ? s / (pos.length * neg.length) : NaN;
  };
  const rows = [];
  for (const j of jobs) {
    const ex = measure(j.line.clip).a, take = measure(j.take.name).a;
    if (!take.ok) continue;
    const c = E.compare(ex, take);
    rows.push({ line: j.line.id, tone: j.line.e, same: j.same, score: c.score, parts: c.parts, judged: E.judge(take, j.line.e).score });
  }
  const pick = (rs, f) => rs.map(f);
  const report = (label, rs) => {
    const pos = rs.filter((r) => r.same), neg = rs.filter((r) => !r.same);
    const parts = ["shape", "loudness", "size", "timing"].map((k) => k + " " + auc(pick(pos, (r) => r.parts[k]), pick(neg, (r) => r.parts[k])).toFixed(2)).join("  ");
    console.log(
      label.padEnd(16) + "same tone " + String(median(pick(pos, (r) => r.score))).padStart(3) +
      "   other tones " + String(median(pick(neg, (r) => r.score))).padStart(3) +
      "   AUC " + auc(pick(pos, (r) => r.score), pick(neg, (r) => r.score)).toFixed(2) +
      "   (tone ranges alone " + auc(pick(pos, (r) => r.judged), pick(neg, (r) => r.judged)).toFixed(2) + ")   per part: " + parts,
    );
  };
  console.log("\nmedian score of takes in the example's tone vs the other tones, and how often a same-tone take beats an");
  console.log("other-tone take (AUC: 0.5 = chance, 1 = always)");
  for (const tone of Object.keys(TONES)) report(tone, rows.filter((r) => r.tone === tone));
  report("all", rows);
  fs.writeFileSync(path.join(CACHE, "calibration.json"), JSON.stringify(rows));
  console.log("\nevery score is in " + path.join(CACHE, "calibration.json"));
}
