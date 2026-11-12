/* When a take is over. The mic opens by itself once Blop has said the line, so nothing tells the learner to stop:
   the take ends when they have most likely said all of it. That is judged from three things:
   - how long they have been quiet,
   - what the word model makes of the take so far (blop/clarity.js). Once the learner goes quiet it scores the
     take as it is, and a good score on the line's last words means they are done. It takes a second or more to
     answer, which is hidden in the scoring: if nobody speaks meanwhile, that scoring is the result,
   - how long the line takes. The model voice is a recording, so its length is known. A learner takes about 1.3
     times as long, give or take, and the further into that range they are, the less a poor score on the last
     words counts as a pause to wait out.
   Without the word model (first visit, offline) the quiet and the length decide alone. Replayed over 1,217
   takes by adult learners (speechocean762), with a scoring pass of a second, this ended 0.2% of takes before
   the speaker was done and put the board up about 1.5 s after the last word. A fixed quiet of a second cut off
   3% (12% of the takes rated below 7 for fluency) and took 2 s; without the word model, this rule cut off 2%. */

export const TURN = {
  idle: 8,          /* s without any speech before the take is given up */
  onset: 0.08,      /* s of steady sound that count as the start of speech */
  roomWindow: 4,    /* s of sound the level of the room is worked out from */
  voicedHang: 0.15, /* s after voiced sound that an unvoiced loud sound (a consonant) still counts as speech */
  voicedGive: 0.6,  /* s of loud sound that is never voiced before the pitch tracking is taken to be no use */
  peekAt: 0.5,      /* s of quiet before the word model is asked about the take */
  holdMax: 3,       /* s of quiet a take is held open for when the last words did not score, early in the expected range */
  holdMin: 1.4,     /*   ...and at the end of it */
  waitMax: 6,       /* s of quiet after which the take ends whatever the word model has said */
  quietMax: 1.8,    /* without the word model: s of quiet that end a take early in the expected range */
  quietMin: 0.8,    /*   ...and at the end of it */
  slow: 1.3,        /* a learner's speaking time against the model voice's: the median... */
  spread: 0.4,      /*   ...and the spread (log-normal) */
  longest: 4,       /* longest take, in lengths of the model voice (plus 4 s) */
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function quantile(values, p) {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(p * (s.length - 1))];
}

/* Abramowitz and Stegun 7.1.26 */
function erf(x) {
  const s = x < 0 ? -1 : 1;
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
  return s * y;
}

/* the share of learners who are done once they have spoken for `span` seconds, when the model voice takes `expected` */
export function shareDone(span, expected, cfg = TURN) {
  if (!(span > 0) || !(expected > 0)) return 0;
  const z = (Math.log(span / expected) - Math.log(cfg.slow)) / cfg.spread;
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

/* when the model voice's own length isn't known: about 0.4 s a word */
export function guessSpan(text) {
  const n = String(text || "").split(/\s+/).filter(Boolean).length;
  return Math.max(1.5, n * 0.4);
}

/* seconds from the first to the last speech in an analysed recording (voice/engine.js) */
export function speechSpan(analysis) {
  const tr = analysis && analysis.track;
  if (!tr || !tr.speech) return 0;
  let first = -1, last = -1;
  for (let i = 0; i < tr.speech.length; i += 1) if (tr.speech[i]) { if (first < 0) first = i; last = i; }
  return first < 0 ? 0 : (last - first + 1) * tr.hop;
}

/* One take. tick(t, db, voiced) is called with the time in seconds, the level of the last few milliseconds of sound
   in dB and whether they were voiced (optional), about 60 times a second; it says when the take is over. When wantsPeek() turns true the caller has the
   word model score the take so far: peeking() when it starts (it returns where the speech ended), and
   heard(at, said) with the answer, true when the line's last words scored. listens(false) takes the word model
   out of it. */
export function createTurn(opts = {}) {
  const cfg = { ...TURN, ...(opts.config || {}) };
  const expected = opts.expected > 0 ? opts.expected : 3;
  let model = opts.listens !== false;
  let floor = null, peak = null, start = 0, prev = null;
  const seen = [];               /* [time, dB] of the last few seconds of sound */
  let burst = null;              /* when the current run of speech began */
  let lastVoiced = null, loudRun = null, noVoicing = false;
  let t0 = null, tl = null;      /* the first and the last time the learner was speaking */
  let spoken = 0;                /* seconds of speech so far, the pauses between words left out */
  let ev = null;                 /* what the word model said about the take up to tl */
  let over = null;

  const end = (reason, t) => {
    over = { done: true, reason, spoke: t0 === null ? 0 : tl - t0, quiet: t0 === null ? 0 : t - tl };
    return over;
  };

  return {
    tick(t, db, voiced) {
      if (over) return over;
      if (prev === null) start = t;
      const dt = prev === null ? 0.016 : clamp(t - prev, 0, 0.1);
      prev = t;
      /* Sound above the room. The room is the quiet end of the last few seconds: worked out from the readings
         alone, so it can't get stuck under the room's noise (an estimate that only moves down fast and up slowly
         did, when the first readings were the analyser's zeros, and then the room itself passed for speech).
         Digital silence, in the moments after the mic opens and in the gaps of some mics, says nothing about the
         room and counts as quiet. */
      let loud = false;
      if (Number.isFinite(db) && db > -100) {
        seen.push([t, db]);
        while (seen[0][0] < t - cfg.roomWindow) seen.shift();
        peak = peak === null ? db : Math.max(db, peak - dt * 0.5);
        if (seen.length >= 4) {
          floor = quantile(seen.map((r) => r[1]), 0.1);
          loud = db > Math.max(floor + clamp((peak - floor) * 0.25, 9, 14), peak - 40);
        }
      }
      /* Loud is not yet speech. A mic's noise suppression pumping, a fan, a driver turning its gain up all make
         loud sounds that are not a voice; a voice is voiced. A loud sound counts as speech when it is voiced or
         right next to voiced sound (a consonant). Without a voiced reading, or if loud sound is never voiced
         (a mic too quiet for the pitch tracking, a whisper), it is the loudness alone. */
      let speech = loud;
      if (voiced !== undefined && !noVoicing) {
        if (loud && voiced) lastVoiced = t;
        loudRun = loud ? (loudRun === null ? t : loudRun) : null;
        if (lastVoiced === null && loudRun !== null && t - loudRun >= cfg.voicedGive) noVoicing = true;
        speech = loud && (noVoicing || (lastVoiced !== null && t - lastVoiced <= cfg.voicedHang));
      }

      if (speech) {
        if (burst === null) burst = t;
        if (t - burst >= (t0 === null ? cfg.onset : 0.04)) {
          if (t0 === null) { t0 = burst; spoken = t - burst; } else spoken += dt;
          tl = t;
        }
      } else burst = null;

      if (t0 === null) return t - start >= cfg.idle ? end("none", t) : { done: false };
      if (t - t0 >= cfg.longest * expected + 4) return end("long", t);
      const q = t - tl;
      const share = shareDone(tl - t0, expected, cfg);
      if (!model) return q >= cfg.quietMin + (cfg.quietMax - cfg.quietMin) * (1 - share) ? end("quiet", t) : { done: false };
      if (q >= cfg.waitMax) return end("quiet", t);
      if (ev && !ev.pending && ev.at === tl) {
        if (ev.said) return end("heard", t);
        if (q >= cfg.holdMin + (cfg.holdMax - cfg.holdMin) * (1 - share)) return end("quiet", t);
      }
      return { done: false };
    },
    /* true when the take has gone quiet after speech and the word model has not been asked about it yet */
    wantsPeek() {
      if (over || !model || t0 === null || prev === null) return false;
      return prev - tl >= cfg.peekAt && !(ev && ev.at === tl);
    },
    peeking() {
      ev = { at: tl, pending: true, said: null };
      return tl;
    },
    heard(at, said) {
      if (ev && ev.at === at) { ev.pending = false; ev.said = !!said; }
    },
    listens(on) { model = !!on; },
    /* where the take stands, for the caller's own use */
    state() {
      return { speaking: t0 !== null, t0, tl, spoken, over, asked: !!ev && ev.at === tl, pending: !!ev && ev.at === tl && ev.pending };
    },
  };
}
