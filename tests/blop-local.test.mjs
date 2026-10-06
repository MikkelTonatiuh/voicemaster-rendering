/* Tests that blop/local.js hands Blop a payload its existing code (blop/map.js) understands.
   Run with:  node --test tests/engine.test.js tests/blop-local.test.mjs */
import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import { createRequire } from "node:module";
import { toPayload, UNHEARD, STYLES } from "../blop/local.js";
import { fromAnalyzer } from "../blop/map.js";

const E = createRequire(import.meta.url)("../voice/engine.js");
const SR = 8000;

test("a take that copies the example makes Blop happy", () => {
  const example = E.analyze(E.synth("excited", 4, { seed: 9 }), SR, { minVoiced: 0.6 });
  const take = E.analyze(E.synth("excited", 4, { seed: 9 }), SR, { minVoiced: 0.6 });
  const data = toPayload(E, take, "excited", example);
  assert.ok(data.score >= 90, "score " + data.score);
  const drive = fromAnalyzer(data, "excited");
  assert.strictEqual(drive.mood, "happy");
  assert.strictEqual(drive.band, "good");
  assert.deepStrictEqual(data.bars.slice(0, 4).map((b) => b.name), ["melody", "loudness", "pitch range", "timing"]);
  assert.ok(data.tips.length >= 1);
});

test("a take far from the example shows the tone Blop heard instead", () => {
  const example = E.analyze(E.synth("excited", 4, { seed: 9 }), SR, { minVoiced: 0.6 });
  const take = E.analyze(E.synth("calm", 6, { seed: 4 }), SR, { minVoiced: 0.6 });
  const data = toPayload(E, take, "excited", example);
  const drive = fromAnalyzer(data, "excited");
  assert.ok(data.score < 70, "score " + data.score);
  assert.notStrictEqual(drive.mood, "happy");
  assert.ok(/[a-z]/.test(drive.copy), "Blop has something to say: " + drive.copy);
});

test("silence goes to Blop's error line instead of a score", () => {
  const take = E.analyze(new Float32Array(SR * 3), SR, { minVoiced: 0.6 });
  const data = toPayload(E, take, "calm", null);
  assert.strictEqual(data.unheard, true);
  assert.strictEqual(data.copy, UNHEARD.silent);
});

test("every practice line in lines.json has its example recording", () => {
  const lines = JSON.parse(fs.readFileSync(new URL("../voice/models/lines.json", import.meta.url), "utf8"));
  assert.ok(lines.length >= 12, lines.length + " lines");
  const ids = new Set();
  for (const l of lines) {
    assert.ok(STYLES.includes(l.e), l.id + " has tone " + l.e);
    assert.ok(typeof l.t === "string" && l.t.length > 3, l.id + " has text");
    assert.ok(!ids.has(l.id), "duplicate id " + l.id);
    ids.add(l.id);
    assert.ok(fs.statSync(new URL("../voice/models/" + l.id + ".mp3", import.meta.url)).size > 2000, l.id + ".mp3 is missing or empty");
  }
  for (const tone of STYLES) assert.ok(lines.some((l) => l.e === tone), "no " + tone + " lines");
});
