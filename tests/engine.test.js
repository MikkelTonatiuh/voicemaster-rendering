/* Tests for voice/engine.js with synthetic voices whose answers are known.
   Run with:  node --test tests/engine.test.js */
const test = require("node:test");
const assert = require("node:assert");
const E = require("../voice/engine.js");

const SR = 8000;

/* a voiced sound: harmonics of f0(t), switched on by env(t) */
function voice(seconds, f0, env, sr = SR) {
  const n = Math.round(seconds * sr), out = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i += 1) {
    const t = i / sr, f = f0(t), e = env(t);
    ph += (2 * Math.PI * f) / sr;
    let v = 0;
    for (let h = 1; h <= 10 && h * f < sr / 2; h += 1) v += Math.sin(h * ph) / h;
    out[i] = 0.3 * e * v + 0.001 * Math.sin(i * 12.9898);
  }
  return out;
}
/* syllables of a given length, grouped into phrases separated by pauses */
function syllables({ rate = 4, perPhrase = 6, phrases = 3, pause = 0.6, lead = 0.4 } = {}) {
  const list = [];
  let t = lead;
  for (let p = 0; p < phrases; p += 1) {
    for (let s = 0; s < perPhrase; s += 1) { list.push([t, 1 / rate]); t += 1 / rate; }
    t += pause;
  }
  const env = (x) => {
    for (const [a, len] of list) if (x >= a && x <= a + len) return Math.max(0, Math.sin((Math.PI * (x - a)) / len)) ** 0.8;
    return 0;
  };
  return { env, end: t - pause + lead, count: list.length };
}

test("resampling 48 kHz to 8 kHz keeps a 1 kHz tone", () => {
  const n = 48000, x = new Float32Array(n);
  for (let i = 0; i < n; i += 1) x[i] = Math.sin((2 * Math.PI * 1000 * i) / 48000);
  const y = E.resample(x, 48000, 8000);
  assert.strictEqual(y.length, 8000);
  let crossings = 0, peak = 0;
  for (let i = 100; i < y.length - 100; i += 1) {
    if (y[i - 1] < 0 && y[i] >= 0) crossings += 1;
    peak = Math.max(peak, Math.abs(y[i]));
  }
  const hz = crossings / ((y.length - 200) / 8000);
  assert.ok(Math.abs(hz - 1000) < 5, "frequency " + hz);
  assert.ok(peak > 0.95 && peak < 1.05, "amplitude " + peak);
});

test("measures a steady 120 Hz voice", () => {
  const s = syllables({ rate: 3, perPhrase: 5, phrases: 2 });
  const a = E.analyze(voice(s.end, () => 120, s.env), SR);
  assert.ok(a.ok, "analysis should succeed: " + a.reason);
  assert.ok(Math.abs(a.pitchHz - 120) < 2.5, "pitch " + a.pitchHz);
  assert.ok(a.pitchSd < 0.4, "a flat voice should have almost no pitch variety: " + a.pitchSd);
});

test("measures a 220 Hz voice at 44.1 kHz input", () => {
  const s = syllables({ rate: 3, perPhrase: 5, phrases: 2 });
  const a = E.analyze(voice(s.end, () => 220, s.env, 44100), 44100);
  assert.ok(a.ok);
  assert.ok(Math.abs(a.pitchHz - 220) < 4, "pitch " + a.pitchHz);
});

test("pitch variety of a voice swinging ±3 semitones is about 2.1 semitones", () => {
  const s = syllables({ rate: 3, perPhrase: 8, phrases: 3, pause: 0.4 });
  const f0 = (t) => 150 * Math.pow(2, (3 * Math.sin(2 * Math.PI * 0.7 * t)) / 12);
  const a = E.analyze(voice(s.end, f0, s.env), SR);
  assert.ok(a.ok);
  assert.ok(Math.abs(a.pitchSd - 3 / Math.SQRT2) < 0.45, "pitch variety " + a.pitchSd);
});

test("finds the pauses between phrases", () => {
  const s = syllables({ rate: 4, perPhrase: 6, phrases: 3, pause: 0.6 });
  const a = E.analyze(voice(s.end, () => 140, s.env), SR);
  assert.ok(a.ok);
  assert.strictEqual(a.pauses.length, 2, JSON.stringify(a.pauses));
  for (const p of a.pauses) assert.ok(Math.abs(p.dur - 0.6) < 0.12, "pause " + p.dur);
});

test("counts syllables at about the right rate", () => {
  for (const rate of [3, 4.5, 6]) {
    const s = syllables({ rate, perPhrase: 10, phrases: 3, pause: 0.5 });
    const f0 = (t) => 140 * Math.pow(2, (1.5 * Math.sin(2 * Math.PI * 1.3 * t)) / 12);
    const a = E.analyze(voice(s.end, f0, s.env), SR);
    assert.ok(a.ok);
    assert.ok(Math.abs(a.pace - rate) < 0.25 * rate, "rate " + rate + " measured " + a.pace.toFixed(2));
  }
});

test("hears falling phrase endings", () => {
  const s = syllables({ rate: 4, perPhrase: 6, phrases: 4, pause: 0.5 });
  const phraseLen = 6 / 4 + 0.5;
  const f0 = (t) => {
    const u = ((t - 0.4) % phraseLen) / (6 / 4);
    return 160 * Math.pow(2, (u > 0.7 ? -8 * (u - 0.7) : 0) / 12);
  };
  const a = E.analyze(voice(s.end, f0, s.env), SR);
  assert.ok(a.ok);
  assert.ok(a.endings.n >= 3, "endings found: " + a.endings.n);
  assert.ok(a.endings.falling >= a.endings.n - 1, JSON.stringify(a.endings));
});

test("refuses to score silence", () => {
  const a = E.analyze(new Float32Array(SR * 5), SR);
  assert.strictEqual(a.ok, false);
  const j = E.judge(a, "calm");
  assert.strictEqual(j.ok, false);
  assert.ok(j.feedback.length > 20);
});

test("the demo voices land closest to the tone they imitate", () => {
  for (const tone of ["calm", "excited", "authoritative"]) {
    const a = E.analyze(E.synth(tone, 14, { seed: 3 }), SR);
    assert.ok(a.ok, tone + ": " + a.reason);
    const j = E.judge(a, tone);
    assert.strictEqual(j.best, tone, tone + " scored " + JSON.stringify(j.all));
    assert.ok(j.rows.length >= 4);
  }
});

test("copying the example scores high, even in a much deeper voice", () => {
  const s = syllables({ rate: 4, perPhrase: 6, phrases: 2, pause: 0.5 });
  const melody = (t) => 150 * Math.pow(2, (3 * Math.sin(2 * Math.PI * 0.6 * t)) / 12);
  const model = E.analyze(voice(s.end, melody, s.env), SR, { minVoiced: 0.6 });
  const copy = E.analyze(voice(s.end, (t) => 0.6 * melody(t), s.env), SR, { minVoiced: 0.6 });
  const c = E.compare(model, copy);
  assert.ok(c.ok);
  assert.ok(c.score >= 90, "copy scored " + c.score + " (" + c.feedback + ")");
});

test("the same rhythm with the melody turned upside down is not a copy", () => {
  const s = syllables({ rate: 4, perPhrase: 6, phrases: 2, pause: 0.5 });
  const melody = (t) => 150 * Math.pow(2, (3 * Math.sin(2 * Math.PI * 0.6 * t)) / 12);
  const model = E.analyze(voice(s.end, melody, s.env), SR, { minVoiced: 0.6 });
  const upside = E.analyze(voice(s.end, (t) => (150 * 150) / melody(t), s.env), SR, { minVoiced: 0.6 });
  const c = E.compare(model, upside);
  assert.ok(c.parts.shape < 0.5, "melody part " + c.parts.shape + " (gap " + c.gap.toFixed(2) + " st)");
  /* rhythm, loudness and range are a perfect match here, so the total stays below "very close" only */
  assert.ok(c.score < 85, "scored " + c.score);
  assert.ok(/Melody shape/.test(c.headline), c.headline);
});

test("a flat or slow take gets the matching tip", () => {
  const s = syllables({ rate: 4, perPhrase: 6, phrases: 2, pause: 0.5 });
  const melody = (t) => 150 * Math.pow(2, (3 * Math.sin(2 * Math.PI * 0.6 * t)) / 12);
  const model = E.analyze(voice(s.end, melody, s.env), SR, { minVoiced: 0.6 });
  const flat = E.compare(model, E.analyze(voice(s.end, () => 150, s.env), SR, { minVoiced: 0.6 }));
  assert.ok(flat.score < 70, "flat scored " + flat.score);
  assert.ok(/flatter/.test(flat.feedback), flat.feedback);
  const slowS = syllables({ rate: 4 / 1.4, perPhrase: 6, phrases: 2, pause: 0.7 });
  const slow = E.compare(model, E.analyze(voice(slowS.end, (t) => melody(0.4 + (t - 0.4) / 1.4), slowS.env), SR, { minVoiced: 0.6 }));
  assert.ok(/Speed up/.test(slow.feedback), slow.feedback);
});

test("analysis of a 20 s take is fast enough for a phone", () => {
  const x = E.synth("excited", 20, { sr: 48000 });
  const t0 = Date.now();
  E.judge(E.analyze(x, 48000), "excited");
  const ms = Date.now() - t0;
  assert.ok(ms < 2000, "took " + ms + " ms");
});
