/* Tests for the part of the word check that doesn't need the model (blop/clarity.js).
   Run with:  node --test tests/clarity.test.mjs */
import test from "node:test";
import assert from "node:assert";
import { CUTS, LIVE, PRAISE, TAIL, clarityNote, clarityTips, creditOf, levelOf, summarize, tailHeard, wordScores, wordsReached } from "../blop/clarity.js";

/* the word pieces the model's tokenizer gives for " Could I have a window seat, please?" */
const TOKENS = ["ĠCould", "ĠI", "Ġhave", "Ġa", "Ġwindow", "Ġseat", ",", "Ġplease", "?"];
const WORDS = ["Could", "I", "have", "a", "window", "seat,", "please?"];

test("pieces are grouped into the words they belong to, punctuation included", () => {
  const out = wordScores(WORDS, TOKENS, TOKENS.map(() => -0.5));
  assert.strictEqual(out.length, 7);
  assert.ok(out.every((x) => x.s === -0.5));
  assert.deepStrictEqual(out.map((x) => x.w), WORDS);
});

test("a word split into several pieces scores the mean of them", () => {
  const tokens = ["ĠIt", "'s", "Ġeleven", "Ġo", "'", "clock", "."];
  const lp = [-0.2, -0.4, -1, -3, -1, -2, -9];
  const out = wordScores(["It's", "eleven", "o'clock."], tokens, lp);
  assert.strictEqual(out.length, 3);
  assert.ok(Math.abs(out[0].s - -0.3) < 1e-9);
  assert.ok(Math.abs(out[2].s - -2.5) < 1e-9, "the apostrophe and the full stop do not count: " + out[2].s);
});

test("pieces that don't match the words give nothing, not a wrong answer", () => {
  assert.strictEqual(wordScores(["a", "b"], ["Ġa"], [-1]), null);
  assert.strictEqual(wordScores(["a"], ["Ġa", "Ġb"], [-1, -1]), null);
  assert.strictEqual(wordScores(["a"], ["Ġa"], [-1, -2]), null);
  assert.strictEqual(wordScores([], [], []), null);
});

test("short words get harsher cut-offs than long ones", () => {
  assert.strictEqual(levelOf("window", -3), "mid");
  assert.strictEqual(levelOf("a", -3), "ok");
  assert.strictEqual(levelOf("window", -5.1), "bad");
  assert.strictEqual(levelOf("to", -5.1), "mid");
  assert.strictEqual(levelOf("to", -8.1), "bad");
  assert.ok(CUTS.short.bad < CUTS.long.bad);
});

test("credit falls from 1 to 0 as a word gets harder to hear", () => {
  assert.ok(creditOf("window", -0.1) > 0.97);
  assert.ok(creditOf("window", -2.5) < creditOf("window", -1));
  assert.strictEqual(creditOf("window", -9), 0);
  assert.strictEqual(creditOf("window", 0), 1);
});

const level = (list) => list.map(([w, s]) => ({ w, s, level: levelOf(w, s) }));

test("a clear read scores high, with Blop pleased and nothing named", () => {
  const sum = summarize(level([["Don't", -0.1], ["forget", -0.2], ["a", -0.1], ["jacket.", -0.3]]));
  assert.ok(sum.score >= 95, "score " + sum.score);
  assert.strictEqual(sum.band, "good");
  assert.deepStrictEqual(clarityTips(sum), ["that was clear."]);
  assert.strictEqual(clarityNote(sum), "4 of 4 words were clear");
});

test("one hard word keeps Blop from being pleased and is named", () => {
  const sum = summarize(level([["I", -0.1], ["thought", -5.5], ["my", -0.9], ["life", -0.1], ["was", -0.1], ["about", -0.2], ["to", -0.1], ["end.", -0.5]]));
  assert.strictEqual(sum.band, "mid");
  assert.strictEqual(sum.bad.length, 1);
  assert.ok(sum.score < 95 && sum.score > 75, "score " + sum.score);
  assert.ok(clarityTips(sum)[0].startsWith("'thought' was hard to hear"), clarityTips(sum)[0]);
  assert.strictEqual(clarityNote(sum), "7 of 8 words were clear");
});

test("two hard words are named worst first, and a third is not piled on", () => {
  const sum = summarize(level([["Could", -0.2], ["I", -0.1], ["have", -0.3], ["a", -0.1], ["window", -7], ["seat,", -5.5], ["please?", -0.2]]));
  assert.strictEqual(sum.band, "mid");
  assert.ok(clarityTips(sum)[0].startsWith("'window' and 'seat' were hard to hear"), clarityTips(sum)[0]);
});

test("a soft word on its own is mentioned without calling the read unclear", () => {
  const sum = summarize(level([["Is", -0.1], ["this", -0.3], ["seat", -0.2], ["taken?", -3.1]]));
  assert.strictEqual(sum.band, "good");
  assert.strictEqual(clarityTips(sum)[0], "that was clear. only 'taken' was a bit soft.");
});

test("a finished take has to score well as well as have no hard word to please Blop", () => {
  /* nothing is hard to hear, but every word is a little soft, "window" and "seat" the most: 86 */
  const soft = level([["Could", -0.8], ["I", -0.6], ["have", -0.8], ["a", -0.6], ["window", -1.6], ["seat,", -1.4], ["please?", -0.8]]);
  assert.strictEqual(summarize(soft).band, "good", "while the learner speaks it is the old rule");
  const sum = summarize(soft, PRAISE);
  assert.ok(sum.score < PRAISE, "score " + sum.score);
  assert.strictEqual(sum.bad.length + sum.mid.length, 0);
  assert.strictEqual(sum.band, "mid");
  assert.strictEqual(clarityTips(sum)[0], "nearly. 'window' and 'seat' were the softest.", clarityTips(sum)[0]);
  /* a clear read still gets there */
  assert.strictEqual(summarize(level([["Don't", -0.1], ["forget", -0.2], ["a", -0.1], ["jacket.", -0.3]]), PRAISE).band, "good");
  /* and the cut-off for a poor read is not moved */
  assert.strictEqual(summarize(level([["How", -8], ["much", -9], ["does", -9], ["this", -7], ["cost?", -9]]), PRAISE).band, "bad");
});

const scored = (list) => list.map((s, i) => ({ w: "w" + i, s }));

test("the learner has got to the end when the last two words score well, however the rest went", () => {
  assert.ok(tailHeard(scored([-6, -7, -0.4, -1.2])));
  assert.ok(tailHeard(scored([-0.3, -1, -1, -3])), "a soft last word next to a clear one");
  assert.ok(tailHeard(scored([-0.3, TAIL * 2, 0])), "the mean of the last two is on the cut-off");
  assert.ok(!tailHeard(scored([-0.2, -0.3, -0.1, -6, -9])));
  assert.ok(!tailHeard(scored([-0.2, -0.3, -0.1, -0.4, -8])), "the last word is missing");
});

test("with one word, or none, the last word is all there is to go on", () => {
  assert.ok(tailHeard(scored([-0.5])));
  assert.ok(!tailHeard(scored([-7])));
  assert.ok(!tailHeard([]));
  assert.ok(!tailHeard(null));
});

test("when most words are missed, Blop asks for a slower read instead of listing them", () => {
  const sum = summarize(level([["How", -8], ["much", -9], ["does", -9], ["this", -7], ["cost?", -9]]));
  assert.strictEqual(sum.band, "bad");
  assert.ok(sum.score < 20, "score " + sum.score);
  assert.ok(clarityTips(sum)[0].includes("slower"), clarityTips(sum)[0]);
});

/* the model voice's [start, end] for "Could I have a window": clear of the clip's start, a pause before the last word */
const ANCHORS = [[0.1, 0.3], [0.35, 0.6], [0.65, 1.0], [1.05, 1.5]];

test("a word counts as said once the speaking time is well past the model voice's time to the end of it", () => {
  /* the model voice reaches the ends of its words 0.2, 0.5, 0.9 and 1.4 s after the first starts */
  const at = (n) => (n * LIVE.slowest) + LIVE.lead;
  assert.strictEqual(wordsReached(ANCHORS, 0.5), 0);
  assert.strictEqual(wordsReached(ANCHORS, at(0.2) - 0.01), 0);
  assert.strictEqual(wordsReached(ANCHORS, at(0.2) + 0.01), 1);
  assert.strictEqual(wordsReached(ANCHORS, at(0.5) + 0.01), 2);
  assert.strictEqual(wordsReached(ANCHORS, at(0.9) + 0.01), 3);
  assert.strictEqual(wordsReached(ANCHORS, at(1.4) + 0.01), 4);
  assert.strictEqual(wordsReached(ANCHORS, 60), 4, "never more than the line has");
});

test("without the model voice's word times, or with nothing said, no word is counted", () => {
  assert.strictEqual(wordsReached(null, 5), 0);
  assert.strictEqual(wordsReached([], 5), 0);
  assert.strictEqual(wordsReached(ANCHORS, 0), 0);
  assert.strictEqual(wordsReached(ANCHORS, NaN), 0);
  assert.strictEqual(wordsReached(ANCHORS, 3, { slowest: 1, lead: 0 }), 4, "a learner as quick as the model voice has said it all");
});
