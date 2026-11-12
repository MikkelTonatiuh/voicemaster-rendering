/* Tests for when a take is over (blop/turn.js), on made-up level readings.
   Run with:  node --test tests/turn.test.mjs */
import test from "node:test";
import assert from "node:assert";
import { TURN, createTurn, shareDone, speechSpan } from "../blop/turn.js";

const SPEECH = -25, ROOM = -60;

/* speech over the given [from, to) seconds, the quiet of a room otherwise; stops at the first thing the take says */
function drive(turn, talk, { until = 30, room = ROOM, onTick } = {}) {
  for (let t = 0; t < until; t += 1 / 60) {
    const on = talk.some(([a, b]) => t >= a && t < b);
    const r = turn.tick(t, (on ? SPEECH : room) + Math.sin(t * 40) * 2);
    if (onTick) onTick(t, r);
    if (r.done) return { ...r, t };
  }
  return { done: false, t: until };
}

/* like drive, but also says whether the sound is voiced: speech is, noise is not */
function driveVoiced(turn, { voiced = [], unvoiced = [], noise = [] }, { until = 30 } = {}) {
  const within = (list, t) => list.some(([a, b]) => t >= a && t < b);
  for (let t = 0; t < until; t += 1 / 60) {
    const isVoiced = within(voiced, t), loud = isVoiced || within(unvoiced, t) || within(noise, t);
    const r = turn.tick(t, (loud ? SPEECH : ROOM) + Math.sin(t * 40) * 2, isVoiced);
    if (r.done) return { ...r, t };
  }
  return { done: false, t: until };
}

test("loud noise that is not a voice does not keep a take open", () => {
  /* a mic's noise suppression pumping, a driver's gain coming back up: bursts after the line is said */
  const bursts = Array.from({ length: 20 }, (_, i) => [2.8 + i * 0.8, 3.0 + i * 0.8]);
  const said = { voiced: [[0.5, 2.5]], noise: bursts };
  const r = driveVoiced(createTurn({ expected: 2, listens: false }), said);
  assert.strictEqual(r.reason, "quiet");
  assert.ok(r.t < 2.5 + TURN.quietMax + 0.3, "ended at " + r.t);
  /* the same sounds, with nothing saying which are voiced, go on for as long as the cap allows */
  const blind = drive(createTurn({ expected: 2, listens: false }), [[0.5, 2.5], ...bursts]);
  assert.ok(blind.t > 10, "ended at " + blind.t);
});

test("a consonant next to voiced sound still counts as speech", () => {
  const r = driveVoiced(createTurn({ expected: 1, listens: false }), { voiced: [[0.5, 1.0], [1.12, 1.6]], unvoiced: [[1.0, 1.12]] });
  assert.strictEqual(r.reason, "quiet");
  assert.ok(Math.abs(r.spoke - 1.1) < 0.1, "spoke for " + r.spoke);
});

test("loud sound that is never voiced is taken as speech after a moment (a mic too quiet for a pitch)", () => {
  const r = driveVoiced(createTurn({ expected: 2, listens: false }), { unvoiced: [[0.5, 2.5]] });
  assert.strictEqual(r.reason, "quiet");
  assert.ok(r.spoke > 1.3, "spoke for " + r.spoke);
});

test("a take that starts on digital silence, in a room that is not quiet, still ends", () => {
  /* the analyser reads zeros until the mic's first audio arrives, then the room (-50 dB) and a voice 30 dB above it */
  const turn = createTurn({ expected: 2, listens: false });
  let ended = null;
  for (let t = 0; t < 12 && !ended; t += 1 / 60) {
    const zeros = t < 0.3, talk = t >= 1 && t < 3;
    const db = zeros ? -180 : talk ? -20 + Math.sin(t * 40) * 3 : -50 + Math.sin(t * 7) * 2;
    const r = turn.tick(t, db, talk);
    if (r.done) ended = { ...r, t };
  }
  assert.ok(ended && ended.reason === "quiet", JSON.stringify(ended));
  assert.ok(ended.t < 3 + TURN.quietMax + 0.3, "ended at " + ended.t);
});

test("a take with nothing said is given up after a few seconds", () => {
  const r = drive(createTurn({ expected: 3 }), []);
  assert.strictEqual(r.reason, "none");
  assert.ok(Math.abs(r.t - TURN.idle) < 0.1, "" + r.t);
});

test("a noisy room is not mistaken for speech", () => {
  const r = drive(createTurn({ expected: 3 }), [], { room: -28 });
  assert.strictEqual(r.reason, "none");
});

test("a short click is not the start of speech", () => {
  const r = drive(createTurn({ expected: 3 }), [[1, 1.03]]);
  assert.strictEqual(r.reason, "none");
});

test("without the word model, the take ends after a pause that is shorter once the learner is near the end", () => {
  /* the model voice takes 2 s; this learner spoke for 2.6 s (the median, 1.3 times as long) */
  const a = drive(createTurn({ expected: 2, listens: false }), [[0.5, 3.1]]);
  assert.strictEqual(a.reason, "quiet");
  assert.ok(a.t - 3.1 > TURN.quietMin - 0.1 && a.t - 3.1 < TURN.quietMax, "waited " + (a.t - 3.1));
  /* early in that range, the same pause is not the end */
  const b = drive(createTurn({ expected: 6, listens: false }), [[0.5, 1.5]]);
  assert.ok(b.t - 1.5 > a.t - 3.1 + 0.2, "waited " + (b.t - 1.5) + " against " + (a.t - 3.1));
  assert.ok(b.t - 1.5 <= TURN.quietMax + 0.1);
});

test("short gaps between words do not end a take", () => {
  const r = drive(createTurn({ expected: 2, listens: false }), [[0.5, 1.2], [1.4, 2.0], [2.2, 3.0]]);
  assert.ok(r.t > 3.0 + TURN.quietMin - 0.1, "ended at " + r.t);
});

test("the word model is asked once the learner has been quiet, and only once per pause", () => {
  const turn = createTurn({ expected: 2 });
  let asked = 0, at = null;
  const r = drive(turn, [[0.5, 2.5]], {
    until: 6,
    onTick: () => { if (turn.wantsPeek()) { asked += 1; at = turn.peeking(); } },
  });
  assert.strictEqual(asked, 1);
  assert.ok(Math.abs(at - 2.5) < 0.1, "speech ended at " + at);
  assert.ok(!r.done, "still waiting for an answer");
});

test("when the word model heard the last word, the take ends at once", () => {
  const turn = createTurn({ expected: 2 });
  let at = null, answeredAt = null;
  const r = drive(turn, [[0.5, 2.5]], {
    onTick: (t) => {
      if (turn.wantsPeek()) at = turn.peeking();
      if (at !== null && answeredAt === null && t > 2.5 + 1.8) { answeredAt = t; turn.heard(at, true); }
    },
  });
  assert.strictEqual(r.reason, "heard");
  assert.ok(r.t - answeredAt < 0.05);
});

test("when it did not, the take is held open: longer early in the expected range than at the end of it", () => {
  const held = (expected) => {
    const turn = createTurn({ expected });
    let at = null;
    return drive(turn, [[0.5, 2.5]], {
      onTick: (t) => {
        if (turn.wantsPeek()) at = turn.peeking();
        if (at !== null && t > 2.5 + 1) turn.heard(at, false);
      },
    });
  };
  const early = held(8), late = held(1.5);
  assert.strictEqual(early.reason, "quiet");
  assert.strictEqual(late.reason, "quiet");
  assert.ok(early.t - 2.5 > late.t - 2.5 + 0.5, early.t + " against " + late.t);
  assert.ok(late.t - 2.5 >= TURN.holdMin - 0.1 && early.t - 2.5 <= TURN.holdMax + 0.1);
});

test("an answer about an earlier stretch of the take is ignored once the learner has spoken again", () => {
  const turn = createTurn({ expected: 3 });
  let first = null, second = null;
  const r = drive(turn, [[0.5, 1.5], [3.0, 4.5]], {
    until: 14,
    onTick: (t) => {
      if (turn.wantsPeek()) { const at = turn.peeking(); if (first === null) first = at; else second = at; }
      /* the answer for the first pause arrives after the learner has started again */
      if (first !== null && t > 3.2 && t < 3.3) turn.heard(first, true);
    },
  });
  assert.ok(first !== null && second !== null && second > first, first + " then " + second);
  assert.ok(r.t > 4.5, "ended at " + r.t + " on an old answer");
});

test("without an answer from the word model, a take still ends", () => {
  const turn = createTurn({ expected: 2 });
  const r = drive(turn, [[0.5, 2.5]], { onTick: () => { if (turn.wantsPeek()) turn.peeking(); } });
  assert.strictEqual(r.reason, "quiet");
  assert.ok(Math.abs(r.t - 2.5 - TURN.waitMax) < 0.2, "ended at " + r.t);
});

test("when the word model drops out mid-take, the quiet and the length decide", () => {
  const turn = createTurn({ expected: 2 });
  const r = drive(turn, [[0.5, 3.1]], {
    onTick: (t) => { if (turn.wantsPeek()) { turn.peeking(); turn.listens(false); } },
  });
  assert.strictEqual(r.reason, "quiet");
  assert.ok(r.t - 3.1 < TURN.quietMax + 0.2, "ended at " + r.t);
});

test("a take that never stops is cut after several times the model voice's length", () => {
  /* talk with the breaths of talk: a steady sound is a hum, not speech */
  const r = drive(createTurn({ expected: 2 }), Array.from({ length: 120 }, (_, i) => [0.5 + i * 0.5, 0.9 + i * 0.5]));
  assert.strictEqual(r.reason, "long");
  assert.ok(Math.abs(r.t - 0.5 - (TURN.longest * 2 + 4)) < 0.2, "" + r.t);
});

test("how many learners are done by a given time: half at 1.3 times the model voice's, more later", () => {
  assert.ok(Math.abs(shareDone(2.6, 2) - 0.5) < 1e-6);
  assert.ok(shareDone(1, 2) < shareDone(2.6, 2) && shareDone(2.6, 2) < shareDone(5, 2));
  assert.ok(shareDone(0.3, 2) < 0.05 && shareDone(8, 2) > 0.95);
  assert.strictEqual(shareDone(0, 2), 0);
  assert.strictEqual(shareDone(2, 0), 0);
});

test("the length of a recording's speech is read from its analysis", () => {
  const speech = new Uint8Array(300);
  speech.fill(1, 40, 240);
  assert.ok(Math.abs(speechSpan({ track: { speech, hop: 0.01 } }) - 2) < 1e-9);
  assert.strictEqual(speechSpan({ track: { speech: new Uint8Array(10), hop: 0.01 } }), 0);
  assert.strictEqual(speechSpan(null), 0);
});

test("the time spoken counts the speech and leaves the pauses out", () => {
  const turn = createTurn({ expected: 10, listens: false });
  drive(turn, [[0.5, 1.5], [3.0, 4.0]], { until: 4.3 });
  const st = turn.state();
  assert.ok(Math.abs(st.spoken - 2) < 0.2, "spoke for " + st.spoken);
  assert.ok(Math.abs(st.t0 - 0.5) < 0.1 && Math.abs(st.tl - 4.0) < 0.1, st.t0 + " to " + st.tl);
  assert.strictEqual(createTurn({ expected: 2 }).state().spoken, 0);
});
