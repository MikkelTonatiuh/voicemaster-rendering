/* Tests that blop/local.js hands Blop a payload its existing code (blop/map.js) understands.
   Run with:  node --test tests/engine.test.js tests/blop-local.test.mjs tests/clarity.test.mjs */
import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import { createRequire } from "node:module";
import { toPayload, UNHEARD, wordAudio } from "../blop/local.js";
import { fromAnalyzer } from "../blop/map.js";
import { simulateResult } from "../blop/line.js";
import { levelOf } from "../blop/clarity.js";

const E = createRequire(import.meta.url)("../voice/engine.js");
const SR = 8000;
const clear = (text) => text.split(" ").map((w) => ({ w, s: -0.2, level: levelOf(w, -0.2) }));

test("clear words make Blop happy, and the clarity bar leads the board", () => {
  const example = E.analyze(E.synth("calm", 5, { seed: 9 }), SR, { minVoiced: 0.6 });
  const take = E.analyze(E.synth("calm", 5, { seed: 9 }), SR, { minVoiced: 0.6 });
  const data = toPayload(E, take, example, { words: clear("Could I have a window seat, please?") });
  assert.ok(data.score >= 90, "score " + data.score);
  const drive = fromAnalyzer(data);
  assert.strictEqual(drive.mood, "happy");
  assert.strictEqual(drive.band, "good");
  assert.deepStrictEqual(data.bars.map((b) => b.name).slice(0, 3), ["clarity", "melody", "timing"]);
  assert.ok(data.bars.every((b) => ["clarity", "melody", "timing", "pauses"].includes(b.name)), "no loudness or pitch-range bar");
  assert.strictEqual(data.words.length, 7);
  assert.ok(/[a-z]/.test(drive.copy), "Blop has something to say: " + drive.copy);
});

test("a word that was hard to hear makes Blop unsure and is named", () => {
  const take = E.analyze(E.synth("calm", 5, { seed: 4 }), SR, { minVoiced: 0.6 });
  const words = clear("I thought my life was about to end.");
  words[1] = { w: "thought", s: -5.3, level: levelOf("thought", -5.3) };
  const data = toPayload(E, take, null, { words });
  const drive = fromAnalyzer(data);
  assert.strictEqual(drive.band, "mid");
  assert.strictEqual(drive.mood, "unsure");
  assert.ok(drive.copy.includes("'thought'"), drive.copy);
  assert.deepStrictEqual(data.bars.map((b) => b.name), ["clarity"]);
});

test("words that were all a little soft leave Blop unsure, with the softest named, not 'that was clear'", () => {
  const take = E.analyze(E.synth("calm", 5, { seed: 4 }), SR, { minVoiced: 0.6 });
  const words = "Could I have a window seat, please?".split(" ").map((w) => ({ w, s: -0.9, level: levelOf(w, -0.9) }));
  const data = toPayload(E, take, null, { words });
  const drive = fromAnalyzer(data);
  assert.ok(data.score < 92 && data.score > 80, "score " + data.score);
  assert.strictEqual(drive.band, "mid");
  assert.strictEqual(drive.mood, "unsure");
  assert.ok(drive.copy.includes("softest"), drive.copy);
});

test("most words missed makes Blop think, and the score is low", () => {
  const take = E.analyze(E.synth("calm", 5, { seed: 4 }), SR, { minVoiced: 0.6 });
  const words = "Could I have a window seat please".split(" ").map((w) => ({ w, s: -9, level: levelOf(w, -9) }));
  const data = toPayload(E, take, null, { words });
  assert.ok(data.score < 30, "score " + data.score);
  assert.strictEqual(fromAnalyzer(data).mood, "think");
});

test("without the word check the board falls back to the melody and timing comparison", () => {
  const example = E.analyze(E.synth("calm", 5, { seed: 9 }), SR, { minVoiced: 0.6 });
  const take = E.analyze(E.synth("calm", 5, { seed: 9 }), SR, { minVoiced: 0.6 });
  const data = toPayload(E, take, example, null);
  assert.strictEqual(data.words, null);
  assert.ok(data.score >= 90, "score " + data.score);
  assert.ok(data.notice.includes("melody"), data.notice);
  assert.ok(!data.bars.some((b) => b.name === "clarity" || b.name === "loudness" || b.name === "pitch range"));
  assert.strictEqual(fromAnalyzer(data).mood, "happy");
});

test("silence goes to Blop's error line instead of a score", () => {
  const take = E.analyze(new Float32Array(SR * 3), SR, { minVoiced: 0.6 });
  const data = toPayload(E, take, null, { words: clear("Is this seat taken?") });
  assert.strictEqual(data.unheard, true);
  assert.strictEqual(data.copy, UNHEARD.silent);
});

test("a take with neither a word check nor an example is not scored", () => {
  const take = E.analyze(E.synth("calm", 5, { seed: 4 }), SR, { minVoiced: 0.6 });
  assert.strictEqual(toPayload(E, take, null, null).unheard, true);
});

test("the word model gets 16 kHz audio, and a quiet take is raised", () => {
  const sr = 44100;
  const quiet = new Float32Array(sr).map((_, i) => 0.05 * Math.sin((2 * Math.PI * 220 * i) / sr));
  const out = wordAudio(E, quiet, sr);
  assert.ok(Math.abs(out.length - 16000) <= 2, "length " + out.length);
  assert.ok(Math.max(...out) > 0.4, "peak " + Math.max(...out));
});

test("the made-up read for 'continue without a microphone' is a board Blop understands", () => {
  const data = simulateResult("Don't forget a jacket.");
  assert.strictEqual(data.words.length, 4);
  assert.ok(data.words.some((x) => x.level !== "ok"));
  assert.ok(["happy", "unsure", "think"].includes(fromAnalyzer(data).mood));
});

test("every practice line in lines.json has its example recording", () => {
  const lines = JSON.parse(fs.readFileSync(new URL("../voice/models/lines.json", import.meta.url), "utf8"));
  assert.ok(lines.length >= 12, lines.length + " lines");
  const ids = new Set();
  for (const l of lines) {
    assert.ok(typeof l.t === "string" && l.t.length > 3, l.id + " has text");
    assert.ok(!ids.has(l.id), "duplicate id " + l.id);
    ids.add(l.id);
    assert.ok(fs.statSync(new URL("../voice/models/" + l.id + ".mp3", import.meta.url)).size > 2000, l.id + ".mp3 is missing or empty");
  }
  const files = fs.readdirSync(new URL("../voice/models/", import.meta.url)).filter((f) => f.endsWith(".mp3"));
  assert.deepStrictEqual(files.sort(), [...ids].map((id) => id + ".mp3").sort(), "every clip in voice/models is a practice line");
});
