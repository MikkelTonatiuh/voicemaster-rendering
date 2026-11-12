/* Tests for the replay on the result board (blop/replay.js), on made-up analyses.
   Run with:  node --test tests/replay.test.mjs */
import test from "node:test";
import assert from "node:assert";
import { EASE, bezier, contour, labelsFrom, labelsOfText, laneReach, paintLane, pitchAt, settle, speechRuns, syllables, warpContour, wordAt, wordMap, wordSpans } from "../blop/replay.js";

/* an analysis as voice/engine.js gives it: 10 ms frames, with the stretches of speech, the syllable peaks and a pitch */
function fake({ runs, nuclei = [], seconds = 4, hz = (t) => 150 + 20 * Math.sin(t * 5) }) {
  const n = Math.round(seconds * 100), speech = new Uint8Array(n), f0 = new Float32Array(n);
  for (const [a, b] of runs) for (let i = Math.round(a * 100); i < Math.round(b * 100); i += 1) { speech[i] = 1; f0[i] = hz(i / 100); }
  return { ok: true, pitchHz: 150, track: { hop: 0.01, speech, f0, nuclei: nuclei.map((t) => Math.round(t * 100)) } };
}

test("easing starts at 0, ends at 1, and the arriving curve is front-loaded", () => {
  for (const f of [EASE.emphasized, EASE.standard, EASE.leaving]) {
    assert.strictEqual(f(0), 0);
    assert.strictEqual(f(1), 1);
    let prev = -1;
    for (let x = 0; x <= 1; x += 0.05) { const y = f(x); assert.ok(y >= prev - 1e-9, "never goes back"); prev = y; }
  }
  assert.ok(EASE.emphasized(0.25) > 0.6, "most of the move is done early: " + EASE.emphasized(0.25));
  assert.ok(EASE.leaving(0.25) < 0.1, "a leaving move starts slowly: " + EASE.leaving(0.25));
  assert.ok(Math.abs(bezier(0, 0, 1, 1)(0.3) - 0.3) < 1e-3, "a straight line stays straight");
});

test("syllables are counted well enough to line up the peaks of a take with the words", () => {
  const line = "I would like a new alarm clock".split(" ").map(syllables);
  assert.deepStrictEqual(line, [1, 1, 1, 1, 1, 2, 1]);
  assert.deepStrictEqual("It's eleven o'clock".split(" ").map(syllables), [1, 3, 2]);
  assert.strictEqual(syllables("appointment"), 3);
  assert.strictEqual(syllables("airplane"), 2);
  assert.strictEqual(syllables("couple"), 2);
  assert.strictEqual(syllables("minutes"), 2);
  assert.strictEqual(syllables(""), 0);
});

test("the stretches of speech and the gaps between them are read from the analysis", () => {
  const r = speechRuns(fake({ runs: [[0.5, 1.0], [1.4, 2.2]] }));
  assert.ok(Math.abs(r.from - 0.5) < 1e-9 && Math.abs(r.to - 2.2) < 1e-9);
  assert.strictEqual(r.gaps.length, 1);
  assert.ok(Math.abs(r.gaps[0][0] - 1.0) < 1e-9 && Math.abs(r.gaps[0][1] - 1.4) < 1e-9);
  assert.deepStrictEqual(speechRuns(null), { from: 0, to: 0, gaps: [] });
});

test("words that follow each other meet halfway, and a pause is not given to either", () => {
  const spans = settle([[0.5, 0.7], [0.75, 1.0], [1.8, 2.1]], 0.45, 2.2);
  assert.ok(Math.abs(spans[0][1] - spans[1][0]) < 1e-9, "the first two meet");
  assert.ok(Math.abs(spans[0][1] - 0.725) < 1e-9);
  assert.ok(spans[2][0] - spans[1][1] > 0.5, "the pause stays a gap: " + (spans[2][0] - spans[1][1]));
  assert.ok(Math.abs(spans[0][0] - 0.45) < 1e-9, "the first word starts where the speech does");
  assert.ok(Math.abs(spans[2][1] - 2.2) < 1e-9, "the last ends where it does");
});

test("a word whose sounds were not found sits between its neighbours", () => {
  const spans = settle([[0.5, 0.8], null, null, [1.6, 2.0]], 0.5, 2.0);
  assert.strictEqual(spans.length, 4);
  for (let i = 1; i < 4; i += 1) assert.ok(spans[i][0] >= spans[i - 1][0], "in order");
  assert.ok(spans[1][0] >= 0.79 && spans[2][1] <= 1.61, JSON.stringify(spans));
  assert.strictEqual(settle([], 0, 1).length, 0);
});

test("the words of a take get the stretches its syllable peaks fall in, in order", () => {
  /* six one-syllable words, a pause in the middle */
  const words = ["She", "put", "the", "kids", "to", "bed"];
  const a = fake({ runs: [[0.5, 1.15], [1.5, 2.3]], nuclei: [0.6, 0.8, 1.05, 1.65, 1.95, 2.2] });
  const s = wordSpans(words, a, null);
  assert.strictEqual(s.length, 6);
  assert.deepStrictEqual(s.map((x) => x.w), words);
  for (let i = 0; i < 6; i += 1) assert.ok(s[i].to >= s[i].from);
  for (let i = 1; i < 6; i += 1) assert.ok(s[i].from >= s[i - 1].from, "in order");
  assert.ok(Math.abs(s[0].from - 0.5) < 0.03 && Math.abs(s[5].to - 2.3) < 0.03, "the first and last reach the speech's edges");
  assert.ok(s[2].to <= 1.2 && s[3].from >= 1.45, "the pause is nobody's: " + JSON.stringify([s[2], s[3]]));
  assert.strictEqual(wordAt(s, 0.62), 0);
  assert.strictEqual(wordAt(s, 1.65), 3);
  assert.strictEqual(wordAt(s, 1.3), -1, "nobody is speaking in the pause");
});

test("a word of two syllables takes two peaks", () => {
  const words = ["a", "alarm", "clock"];
  const a = fake({ runs: [[0.5, 2.0]], nuclei: [0.6, 1.0, 1.35, 1.8] });
  const s = wordSpans(words, a, null);
  assert.ok(s[1].to - s[1].from > s[0].to - s[0].from, "alarm is longer than a: " + JSON.stringify(s));
  assert.ok(s[1].from < 1.0 && s[1].to > 1.35);
});

test("with an example, its own words say which peaks belong to which word", () => {
  const exWords = ["Don't", "forget", "a", "jacket"];
  const ex = fake({ runs: [[0.4, 1.6]], nuclei: [0.5, 0.8, 1.0, 1.3] });
  const spans = settle([[0.4, 0.6], [0.65, 0.95], [0.96, 1.05], [1.1, 1.6]], 0.4, 1.6);
  const labels = labelsFrom(ex, spans);
  assert.deepStrictEqual(labels, [0, 1, 2, 3]);
  const take = fake({ runs: [[0.6, 2.2]], nuclei: [0.7, 1.1, 1.4, 1.8] });
  const s = wordSpans(exWords, take, labels);
  assert.ok(wordAt(s, 0.7) === 0 && wordAt(s, 1.8) === 3, JSON.stringify(s));
  assert.deepStrictEqual(labelsOfText(exWords), [0, 1, 1, 2, 3, 3]);
});

test("a take with no peaks still gets its words, shared out by length", () => {
  const s = wordSpans(["a", "banana"], fake({ runs: [[0.5, 1.5]] }), null);
  assert.strictEqual(s.length, 2);
  assert.ok(s[1].to - s[1].from > s[0].to - s[0].from);
  assert.ok(Math.abs(s[1].to - 1.5) < 1e-9);
  const none = wordSpans(["a"], { ok: true, track: { hop: 0.01, speech: new Uint8Array(10), f0: new Float32Array(10), nuclei: [] } }, null);
  assert.deepStrictEqual(none, [{ w: "a", from: 0, to: 0 }]);
});

test("the melody is a line in seconds from the first speech, around the speaker's own pitch", () => {
  const c = contour(fake({ runs: [[0.5, 1.0], [1.4, 2.2]] }));
  assert.ok(c && c.segs.length === 2, "the line breaks where the voice does");
  assert.ok(Math.abs(c.dur - 1.7) < 1e-9);
  assert.ok(c.segs[0][0][0] < 0.02, "starts at the first speech");
  const near = pitchAt(c, 0.3);
  assert.ok(near !== null && Math.abs(near) < 4, "semitones around the usual pitch: " + near);
  assert.strictEqual(pitchAt(c, 0.6), null, "no pitch in the pause");
  assert.strictEqual(pitchAt(null, 0), null);
  assert.strictEqual(contour({ ok: false }), null);
  assert.strictEqual(contour(null), null);
});

test("the lane reaches far enough for both melodies and no less than five semitones", () => {
  assert.strictEqual(laneReach(null, null), 5);
  assert.strictEqual(laneReach({ reach: 3 }, { reach: 8 }), 10);
  assert.strictEqual(laneReach({ reach: 2 }, null), 5);
});

test("a slow take is mapped onto the example word by word, and back", () => {
  const ex = [{ from: 0, to: 0.4 }, { from: 0.4, to: 0.9 }, { from: 1.3, to: 1.8 }];
  const you = [{ from: 0, to: 0.8 }, { from: 0.8, to: 1.9 }, { from: 2.7, to: 3.6 }];   /* about twice as slow, with a longer pause */
  const m = wordMap(you, ex);
  assert.ok(Math.abs(m.fwd(0)) < 1e-9 && Math.abs(m.fwd(0.8) - 0.4) < 1e-9 && Math.abs(m.fwd(3.6) - 1.8) < 1e-9, "word edges land on word edges");
  assert.ok(Math.abs(m.fwd(0.4) - 0.2) < 1e-9, "halfway through a word is halfway through the other");
  assert.ok(Math.abs(m.fwd(2.3) - 1.1) < 1e-9, "the pause lands on the pause: " + m.fwd(2.3));
  for (const t of [0, 0.3, 0.8, 1.5, 2.3, 3.1, 3.6]) assert.ok(Math.abs(m.inv(m.fwd(t)) - t) < 1e-9, "round trip at " + t);
  assert.ok(Math.abs(m.fwd(-0.5) + 0.5) < 1e-9 && Math.abs(m.fwd(4.1) - 2.3) < 1e-9, "beyond the ends the slope is 1");
});

test("the map copes with empty words, no words and a single point", () => {
  const m = wordMap([{ from: 0, to: 0 }, { from: 0, to: 0.5 }], [{ from: 0, to: 0 }, { from: 0, to: 0.25 }]);
  assert.ok(Math.abs(m.fwd(0.5) - 0.25) < 1e-9, "a zero-length word adds nothing");
  const none = wordMap([], []);
  assert.strictEqual(none.fwd(1.5), 1.5);
  assert.strictEqual(none.inv(1.5), 1.5);
  const one = wordMap([{ from: 1, to: 1 }], [{ from: 2, to: 2 }]);
  assert.ok(Math.abs(one.fwd(1.5) - 2.5) < 1e-9, "a single point shifts");
});

test("a melody warped onto the example's seconds keeps its pitches and ends where the example ends", () => {
  const c = contour(fake({ runs: [[0.5, 2.5]] }));
  const you = [{ from: 0, to: 1 }, { from: 1, to: c.dur }], ex = [{ from: 0, to: 0.5 }, { from: 0.5, to: 1.1 }];
  const m = wordMap(you, ex);
  const w = warpContour(c, m.fwd);
  assert.ok(Math.abs(w.dur - 1.1) < 1e-9, "its length is now the example's: " + w.dur);
  assert.strictEqual(w.segs.length, c.segs.length);
  assert.deepStrictEqual(w.segs.flat().map((p) => p[1]), c.segs.flat().map((p) => p[1]), "same pitches");
  assert.ok(w.segs.flat().every((p, i, a) => i === 0 || p[0] >= a[i - 1][0]), "still in order");
  assert.strictEqual(warpContour(null, m.fwd), null);
});

test("drawing the lane works with one melody, two, or a playhead", () => {
  const calls = [];
  const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (...a) => { calls.push(String(k)); }), set: (t, k, v) => { t[k] = v; return true; } });
  const you = contour(fake({ runs: [[0.5, 2.0]] })), ex = contour(fake({ runs: [[0.4, 1.8]], hz: (t) => 130 + 30 * Math.cos(t * 4) }));
  const o = { you, ex, T: 2, R: 8, voice: "you", at: null, shown: 1, tint: [160, 240, 180], spans: [{ from: 0, to: 1 }, { from: 1, to: 1.9 }] };
  paintLane(ctx, 300, 100, o);
  paintLane(ctx, 300, 100, { ...o, ex: null });
  paintLane(ctx, 300, 100, { ...o, at: 0.8 });
  paintLane(ctx, 300, 100, { ...o, voice: "example", at: 1.2, shown: 0.4 });
  paintLane(ctx, 300, 100, { T: 2, R: 5, voice: "you", at: null });
  assert.ok(calls.includes("stroke") && calls.includes("arc"), "lines and a playhead dot were drawn");
});
