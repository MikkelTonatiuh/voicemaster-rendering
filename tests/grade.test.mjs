/* Tests for Blop's tint while it listens (blop/grade.js): it follows the words scored so far.
   Run with:  node --test tests/grade.test.mjs */
import test from "node:test";
import assert from "node:assert";
import { liveBand, showLive } from "../blop/grade.js";
import { levelOf } from "../blop/clarity.js";

const scored = (list) => list.map(([w, s]) => ({ w, s, level: levelOf(w, s) }));

test("before two words can be judged, Blop only listens", () => {
  assert.strictEqual(liveBand(undefined), "rest");
  assert.strictEqual(liveBand(null), "rest");
  assert.strictEqual(liveBand([]), "rest");
  assert.strictEqual(liveBand(scored([["Could", -0.2]])), "rest");
});

test("clear words so far make Blop pleased", () => {
  assert.strictEqual(liveBand(scored([["Could", -0.3], ["I", -0.2], ["have", -0.4]])), "good");
  assert.strictEqual(liveBand(scored([["Could", -0.3], ["window", -3]])), "good", "one soft word is still a good start");
});

test("a word that was hard to hear shows, as unsure and never as cross: the result says the rest", () => {
  assert.strictEqual(liveBand(scored([["Could", -0.3], ["I", -0.2], ["window", -6]])), "mid");
  assert.strictEqual(liveBand(scored([["Could", -9], ["window", -7], ["seat", -8]])), "mid");
});

test("a last word or two the model can't find in the audio were not said yet, and are left out", () => {
  const clear = [["Could", -0.3], ["I", -0.2], ["have", -0.4]];
  assert.strictEqual(liveBand(scored([...clear, ["a", -14]])), "good");
  assert.strictEqual(liveBand(scored([...clear, ["a", -14], ["window", -16]])), "good");
  /* only two words are ever left out; a stretch of nothing before that is a verdict */
  assert.strictEqual(liveBand(scored([["Could", -0.3], ["I", -14], ["have", -15], ["a", -14], ["window", -16]])), "mid");
  assert.strictEqual(liveBand(scored([["Could", -14], ["I", -15]])), "rest");
});

test("one reading that finds trouble is not shown; two in a row are, and a clear one shows at once", () => {
  assert.strictEqual(showLive("rest", "rest", "mid"), "rest");
  assert.strictEqual(showLive("good", "good", "mid"), "good", "a lone reading of trouble leaves Blop pleased");
  assert.strictEqual(showLive("good", "mid", "mid"), "mid");
  assert.strictEqual(showLive("mid", "mid", "good"), "good");
  assert.strictEqual(showLive("rest", "rest", "good"), "good");
  assert.strictEqual(showLive("mid", "mid", "rest"), "mid", "a reading that says nothing changes nothing");
  assert.strictEqual(showLive(undefined, undefined, "rest"), "rest");
});
