/* Tests for lining a take up with the example recording (blop/align.js), on made-up sounds.
   Run with:  node --test tests/align.test.mjs */
import test from "node:test";
import assert from "node:assert";
import { carry, exampleSpans, features, takeSpans, warp } from "../blop/align.js";

const SR = 16000;

/* a stand-in for speech: each "word" is a steady mix of tones with its own spectrum, so each sounds different to the
   features; a little noise lies under everything, and the silences before and after are not quite silent */
function say(words, lead, tail) {
  const n = Math.round((lead + words.reduce((s, w) => s + w[1], 0) + tail) * SR);
  const x = new Float32Array(n);
  let seed = 7;
  const noise = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff - 0.5; };
  for (let i = 0; i < n; i += 1) x[i] = 0.0004 * noise();
  let at = lead;
  for (const [hz, dur] of words) {
    for (let i = Math.round(at * SR); i < Math.round((at + dur) * SR) && i < n; i += 1) {
      const t = i / SR;
      x[i] += 0.3 * Math.sin(2 * Math.PI * hz * t) + 0.15 * Math.sin(2 * Math.PI * hz * 2.7 * t) + 0.1 * Math.sin(2 * Math.PI * hz * 0.5 * t);
    }
    at += dur;
  }
  return x;
}
const analysisOf = (from, to) => {
  const speech = new Uint8Array(600);
  speech.fill(1, Math.round(from * 100), Math.round(to * 100));
  return { ok: true, pitchHz: 150, track: { hop: 0.01, speech, f0: new Float32Array(600), nuclei: [] } };
};

test("a recording becomes a frame every 10 ms, each coefficient centred and scaled", () => {
  const f = features(say([[300, 1]], 0, 0), 0, 1);
  assert.strictEqual(f.frames.length, 98);
  assert.strictEqual(f.frames[0].length, 12);
  for (let c = 0; c < 12; c += 1) {
    const mean = f.frames.reduce((s, v) => s + v[c], 0) / f.frames.length;
    const sd = Math.sqrt(f.frames.reduce((s, v) => s + (v[c] - mean) ** 2, 0) / f.frames.length);
    assert.ok(Math.abs(mean) < 1e-4 && Math.abs(sd - 1) < 1e-3, "coefficient " + c + ": " + mean + ", " + sd);
  }
  assert.ok(f.frames.every((v) => Array.from(v).every(Number.isFinite)));
  assert.strictEqual(features(say([[300, 1]], 0, 0), 0.5, 1).from, 0.5);
  assert.strictEqual(features(new Float32Array(100), 0, 1).frames.length, 0);
});

/* frames with one distinct direction per "word" */
const seq = (lengths) => lengths.flatMap((n, w) => Array.from({ length: n }, () => Float32Array.from({ length: 12 }, (_, c) => (c === w ? 3 : 0))));

test("the example is stretched onto a take that is slower in places, and its word edges land where the take's are", () => {
  const ex = seq([20, 30, 25, 25]);            /* 100 frames: edges at 20, 50, 75 */
  const take = seq([30, 20, 40, 30]);          /* 120 frames: edges at 30, 50, 90 */
  const p = warp(ex, take);
  assert.strictEqual(p.length, 100);
  for (let i = 1; i < p.length; i += 1) assert.ok(p[i] >= p[i - 1] - 1e-9, "never goes back");
  /* where inside a word the extra frames go is not fixed, so the ends meet only to within the first and last words */
  assert.ok(p[0] < 10 && p[99] > 109, "the ends meet: " + p[0] + " and " + p[99]);
  assert.ok(Math.abs(p[20] - 30) <= 4, "edge 1 at " + p[20]);
  assert.ok(Math.abs(p[50] - 50) <= 4, "edge 2 at " + p[50]);
  assert.ok(Math.abs(p[75] - 90) <= 6, "edge 3 at " + p[75]);
  assert.deepStrictEqual(warp([], seq([5])), []);
});

test("a take twice as slow is still followed", () => {
  const ex = seq([15, 15, 15]);
  const p = warp(ex, seq([30, 30, 30]));
  assert.ok(Math.abs(p[15] - 30) <= 4 && Math.abs(p[30] - 60) <= 6, p[15] + ", " + p[30]);
});

test("the example's word spans are widened a little at the ends and meet in the middle", () => {
  const s = exampleSpans([[0.5, 0.7], [0.74, 1.0], [1.5, 1.9]]);
  assert.ok(Math.abs(s[0][0] - 0.4) < 1e-9, "starts a little before its sounds");
  assert.ok(Math.abs(s[0][1] - 0.72) < 1e-9 && Math.abs(s[1][0] - 0.72) < 1e-9, "the first two meet");
  assert.ok(s[2][0] - s[1][1] > 0.3, "the pause stays a gap");
  assert.ok(Math.abs(s[2][1] - 2.0) < 1e-9);
});

test("with the example's speech edges given, the first word starts and the last ends there, and never before zero", () => {
  const s = exampleSpans([[0.04, 0.22], [0.26, 0.5], [0.9, 1.3]], 0.12, 1.4);
  assert.ok(Math.abs(s[0][0] - 0.12) < 1e-9 && Math.abs(s[2][1] - 1.4) < 1e-9, "edges: " + s[0][0] + " and " + s[2][1]);
  s.forEach((x, i) => { assert.ok(x[1] >= x[0], "word " + i + " is not backwards"); if (i) assert.ok(x[0] >= s[i - 1][1] - 1e-9, "word " + i + " follows word " + (i - 1)); });
  const early = exampleSpans([[0.04, 0.22], [0.3, 0.6]]);
  assert.ok(early[0][0] >= 0, "a line that starts speaking at once does not start before the recording: " + early[0][0]);
});

test("a take is trimmed the same way as the example: its first word starts and its last ends where its speech does", () => {
  const exX = say([[400, 0.3], [900, 0.4], [1500, 0.3], [2400, 0.4]], 0.5, 0.3);
  const takeX = say([[400, 0.9], [900, 0.6], [1500, 1.1], [2400, 0.7]], 0.8, 0.5);   /* about twice as slow */
  const words = ["a", "b", "c", "d"];
  const exAnchors = [[0.52, 0.78], [0.84, 1.17], [1.22, 1.48], [1.54, 1.88]];
  const out = takeSpans(words, { anchors: exAnchors, pcm: exX, run: { from: 0.5, to: 1.9 } }, { pcm: takeX, analysis: analysisOf(0.8, 4.1) });
  assert.ok(Math.abs(out[0].from - 0.8) < 1e-9 && Math.abs(out[3].to - 4.1) < 1e-9, "the speech edges: " + out[0].from + " and " + out[3].to);
  const truth = [1.7, 2.3, 3.4];
  [0, 1, 2].forEach((i) => assert.ok(Math.abs(out[i].to - truth[i]) < 0.12, "word " + i + " ends at " + out[i].to + ", not " + truth[i]));
});

test("carrying spans across: the words of the example land on the words of the take", () => {
  const exX = say([[400, 0.3], [900, 0.4], [1500, 0.3], [2400, 0.4]], 0.5, 0.3);
  const takeX = say([[400, 0.45], [900, 0.3], [1500, 0.6], [2400, 0.35]], 0.7, 0.4);
  const words = ["a", "b", "c", "d"];
  const exAnchors = [[0.52, 0.78], [0.84, 1.17], [1.22, 1.48], [1.54, 1.88]];
  const out = takeSpans(words, { anchors: exAnchors, pcm: exX }, { pcm: takeX, analysis: analysisOf(0.7, 2.4) });
  /* the take's words: 0.7-1.15, 1.15-1.45, 1.45-2.05, 2.05-2.4 */
  assert.deepStrictEqual(out.map((s) => s.w), words);
  const truth = [1.15, 1.45, 2.05];
  [0, 1, 2].forEach((i) => assert.ok(Math.abs(out[i].to - truth[i]) < 0.08, "word " + i + " ends at " + out[i].to + ", not " + truth[i]));
  assert.ok(Math.abs(out[0].from - 0.7) < 0.1 && Math.abs(out[3].to - 2.4) < 0.1, "the ends of the speech");
  out.forEach((s) => assert.ok(s.to >= s.from));
});

test("spans carried from one recording to another keep their order", () => {
  const a = features(say([[400, 0.3], [900, 0.4]], 0.2, 0.2), 0, 1.1), b = features(say([[400, 0.5], [900, 0.3]], 0.2, 0.2), 0, 1.2);
  const s = carry([[0.2, 0.5], [0.5, 0.9]], a, b);
  assert.ok(s[0][0] <= s[0][1] && s[0][1] <= s[1][1]);
  assert.ok(s[0][1] > 0.5, "the first word is longer in the take: " + s[0][1]);
});
