/* voice/engine.js
   VoiceMaster's measurement engine. It runs entirely in the browser, so the recording never leaves the device.

   analyze(pcm, sampleRate)  pitch (YIN), loudness, voice activity, pauses, syllable rate and phrase endings
   judge(analysis, tone)     compares those measurements with target ranges for calm / excited / authoritative
                             and writes the score, headline and tips
   capture(ctx, source, cb)  records raw microphone samples (AudioWorklet, with a ScriptProcessor fallback)
   livePitch(buffer, sr)     quick pitch estimate for the live trace while recording
   synth(tone, seconds)      a speech-like test signal, used for the no-microphone demo and the tests

   The target ranges are starting points drawn from prosody research (more energy means faster, wider-pitched,
   more strongly stressed speech; authority leans on steady pace and falling sentence endings). They should be
   recalibrated once real practice takes are available. */
(function (root) {
  "use strict";

  const SR = 8000;              // analysis rate: pitch and syllables need nothing above 4 kHz
  const HOP = 80;               // 10 ms between frames
  const WIN = 200;              // 25 ms loudness window
  const FMIN = 65, FMAX = 400;  // speaking pitch range, Hz
  const YIN_THR = 0.15;         // YIN dip threshold (lower = stricter about calling a frame voiced)
  const MAX_AP = 0.35;          // frames less periodic than this count as unvoiced (CREMA-D speech: 0.35 keeps about 60% of speech frames voiced)
  const WEAK_AP = 0.55;         // ...unless they are at least this periodic and continue a voiced neighbour's pitch

  /* ---------- small helpers ---------- */
  const sum = (a) => { let s = 0; for (const v of a) s += v; return s; };
  const mean = (a) => (a.length ? sum(a) / a.length : NaN);
  const std = (a) => {
    if (a.length < 2) return 0;
    const m = mean(a);
    let q = 0;
    for (const v of a) q += (v - m) ** 2;
    return Math.sqrt(q / (a.length - 1));
  };
  const quantile = (a, q) => {
    if (!a.length) return NaN;
    const s = Float64Array.from(a).sort();
    const i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
    return s[lo] + (s[hi] - s[lo]) * (i - lo);
  };
  const median = (a) => quantile(a, 0.5);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const st = (f, ref) => 12 * Math.log2(f / ref);

  /* ---------- resampling: anti-aliased decimation to the analysis rate ---------- */
  function lowpass(M) {
    const N = 8 * M + 1, K = (N - 1) / 2, fc = 0.45 / M;
    const h = new Float64Array(N);
    let s = 0;
    for (let i = 0; i < N; i += 1) {
      const d = i - K;
      const sinc = d === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * d) / (Math.PI * d);
      const w = 0.42 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)) + 0.08 * Math.cos((4 * Math.PI * i) / (N - 1));
      h[i] = sinc * w;
      s += h[i];
    }
    for (let i = 0; i < N; i += 1) h[i] /= s;
    return h;
  }
  function decimate(x, M) {
    const h = lowpass(M), K = (h.length - 1) / 2;
    const n = Math.floor(x.length / M), out = new Float32Array(n);
    for (let i = 0; i < n; i += 1) {
      const c = i * M;
      let acc = 0;
      for (let k = 0; k < h.length; k += 1) {
        const j = c + k - K;
        if (j >= 0 && j < x.length) acc += h[k] * x[j];
      }
      out[i] = acc;
    }
    return out;
  }
  function linear(x, srIn, srOut) {
    const ratio = srIn / srOut, n = Math.max(1, Math.floor((x.length - 1) / ratio) + 1), out = new Float32Array(n);
    for (let i = 0; i < n; i += 1) {
      const t = i * ratio, j = Math.floor(t), f = t - j;
      out[i] = j + 1 < x.length ? x[j] + (x[j + 1] - x[j]) * f : x[Math.min(j, x.length - 1)] || 0;
    }
    return out;
  }
  function resample(x, srIn, srOut) {
    srIn = Math.round(srIn);
    srOut = Math.round(srOut || SR);
    if (!x || !x.length) return new Float32Array(0);
    if (srIn === srOut) return Float32Array.from(x);
    if (srIn < srOut) return linear(x, srIn, srOut);
    if (srIn % srOut === 0) return decimate(x, srIn / srOut);
    const M = Math.ceil(srIn / srOut);
    return decimate(linear(x, srIn, srOut * M), M);
  }

  /* high-pass at ~50 Hz removes DC and rumble that would confuse the pitch tracker */
  function highpass(x, sr) {
    const rc = 1 / (2 * Math.PI * 50), dt = 1 / sr, a = rc / (rc + dt);
    const y = new Float32Array(x.length);
    let py = 0, px = x.length ? x[0] : 0;
    for (let i = 0; i < x.length; i += 1) {
      py = a * (py + x[i] - px);
      px = x[i];
      y[i] = py;
    }
    return y;
  }

  /* ---------- pitch: YIN (de Cheveigné & Kawahara, 2002) ---------- */
  function yin(x, start, W, sr, d, c) {
    const tauMin = Math.max(2, Math.floor(sr / FMAX)), tauMax = Math.ceil(sr / FMIN);
    if (start + W + tauMax >= x.length) return { f0: 0, ap: 1 };
    for (let tau = 1; tau <= tauMax; tau += 1) {
      let s = 0;
      for (let j = 0; j < W; j += 1) {
        const v = x[start + j] - x[start + j + tau];
        s += v * v;
      }
      d[tau] = s;
    }
    c[0] = 1;
    let run = 0;
    for (let tau = 1; tau <= tauMax; tau += 1) {
      run += d[tau];
      c[tau] = run > 0 ? (d[tau] * tau) / run : 1;
    }
    let tau = -1;
    for (let t = tauMin; t <= tauMax; t += 1) {
      if (c[t] < YIN_THR) {
        while (t + 1 <= tauMax && c[t + 1] < c[t]) t += 1;
        tau = t;
        break;
      }
    }
    if (tau < 0) {
      /* no dip under the threshold: take the deepest one, as YIN does, and let MAX_AP decide whether the
         frame is voiced. Real rooms and mics rarely give dips under YIN_THR */
      tau = tauMin;
      for (let t = tauMin + 1; t <= tauMax; t += 1) if (c[t] < c[tau]) tau = t;
    }
    let t = tau;
    if (tau > 1 && tau < tauMax) {
      const s0 = c[tau - 1], s1 = c[tau], s2 = c[tau + 1], den = s0 + s2 - 2 * s1;
      if (den > 0) t = tau + (s0 - s2) / (2 * den);
    }
    return { f0: sr / t, ap: c[tau] };
  }

  /* ---------- loudness frames and voice activity ---------- */
  function loudness(x) {
    const n = Math.max(0, Math.floor((x.length - WIN) / HOP) + 1);
    const db = new Float64Array(n);
    for (let i = 0; i < n; i += 1) {
      let s = 0;
      const a = i * HOP;
      for (let j = 0; j < WIN; j += 1) s += x[a + j] * x[a + j];
      db[i] = 10 * Math.log10(s / WIN + 1e-12);
    }
    return db;
  }
  function fillGaps(flags, maxGap) {
    let last = -1;
    for (let i = 0; i < flags.length; i += 1) {
      if (!flags[i]) continue;
      if (last >= 0 && i - last - 1 > 0 && i - last - 1 < maxGap) for (let k = last + 1; k < i; k += 1) flags[k] = true;
      last = i;
    }
  }
  function dropShort(flags, minLen) {
    let i = 0;
    while (i < flags.length) {
      if (!flags[i]) { i += 1; continue; }
      let j = i;
      while (j < flags.length && flags[j]) j += 1;
      if (j - i < minLen) for (let k = i; k < j; k += 1) flags[k] = false;
      i = j;
    }
  }
  function runs(flags) {
    const out = [];
    let i = 0;
    while (i < flags.length) {
      if (!flags[i]) { i += 1; continue; }
      let j = i;
      while (j < flags.length && flags[j]) j += 1;
      out.push([i, j]);
      i = j;
    }
    return out;
  }
  function smooth(a, n) {
    const out = new Float64Array(a.length), h = Math.floor(n / 2);
    for (let i = 0; i < a.length; i += 1) {
      let s = 0, c = 0;
      for (let k = i - h; k <= i + h; k += 1) if (k >= 0 && k < a.length) { s += a[k]; c += 1; }
      out[i] = s / c;
    }
    return out;
  }

  /* ---------- the analysis ---------- */
  function analyze(pcm, sampleRate, opts) {
    const minVoiced = opts && opts.minVoiced != null ? opts.minVoiced : 2;   /* seconds of voiced speech needed to judge */
    const raw = resample(pcm, sampleRate || SR, SR);
    for (let i = 0; i < raw.length; i += 1) if (!Number.isFinite(raw[i])) raw[i] = 0;   /* one NaN would poison the filters */
    let clipped = 0;
    for (let i = 0; i < pcm.length; i += 1) if (Math.abs(pcm[i]) > 0.99) clipped += 1;
    const x = highpass(raw, SR);
    const seconds = x.length / SR;
    const db = loudness(x);
    const n = db.length;
    const base = { seconds, clipped: pcm.length ? clipped / pcm.length : 0 };
    if (n < 50) return { ...base, ok: false, reason: "short", speechSeconds: 0, voicedSeconds: 0, track: null };

    /* voice activity: frames clearly above the background */
    const floor = quantile(db, 0.1), peak = quantile(db, 0.99), range = peak - floor;
    const thr = Math.max(floor + clamp(range * 0.25, 6, 12), peak - 40);
    const speech = Array.from(db, (v) => v > thr);
    fillGaps(speech, 12);
    dropShort(speech, 6);

    /* pitch per frame, only where there is speech */
    const W = WIN, tauMax = Math.ceil(SR / FMIN);
    const dBuf = new Float64Array(tauMax + 2), cBuf = new Float64Array(tauMax + 2);
    const f0 = new Float64Array(n), ap = new Float64Array(n), cand = new Float64Array(n);
    for (let i = 0; i < n; i += 1) {
      if (!speech[i]) { ap[i] = 1; continue; }
      const r = yin(x, i * HOP, W, SR, dBuf, cBuf);
      cand[i] = r.f0;
      f0[i] = r.ap < MAX_AP ? r.f0 : 0;
      ap[i] = r.ap;
    }
    /* creaky, breathy or noisy voicing dips less deep but keeps a steady pitch: a weakly periodic frame
       that continues its voiced neighbour's pitch (within 1.5 semitones) is voiced too. Noise jumps around */
    for (const dir of [1, -1]) {
      for (let k = 1; k < n; k += 1) {
        const i = dir > 0 ? k : n - 1 - k, j = i - dir;
        if (f0[i] || !f0[j] || !(ap[i] < WEAK_AP) || !(cand[i] > 0)) continue;
        if (Math.abs(st(cand[i], f0[j])) < 1.5) f0[i] = cand[i];
      }
    }
    /* octave clean-up around the speaker's median, then a 5-frame median filter */
    const rawVoiced = [];
    for (let i = 0; i < n; i += 1) if (f0[i] > 0) rawVoiced.push(f0[i]);
    const med0 = median(rawVoiced);
    if (Number.isFinite(med0)) {
      for (let i = 0; i < n; i += 1) {
        if (!f0[i]) continue;
        if (f0[i] > 1.8 * med0) f0[i] /= 2;
        else if (f0[i] < 0.56 * med0) f0[i] *= 2;
      }
    }
    const voiced = Array.from(f0, (v) => v > 0);
    dropShort(voiced, 4);
    for (let i = 0; i < n; i += 1) if (!voiced[i]) f0[i] = 0;
    const f0s = Float64Array.from(f0);
    for (const [a, b] of runs(voiced)) {
      for (let i = a; i < b; i += 1) {
        const win = [];
        for (let k = Math.max(a, i - 2); k <= Math.min(b - 1, i + 2); k += 1) win.push(f0[k]);
        f0s[i] = median(win);
      }
    }

    const speechRuns = runs(speech);
    const speechSeconds = speech.filter(Boolean).length / 100;
    const voicedHz = [];
    for (let i = 0; i < n; i += 1) if (f0s[i] > 0) voicedHz.push(f0s[i]);
    const voicedSeconds = voicedHz.length / 100;

    const track = { hop: 0.01, f0: Float32Array.from(f0s), speech: Uint8Array.from(speech, Number), db: Float32Array.from(db), nuclei: [] };
    if (peak < -55) return { ...base, ok: false, reason: "silent", speechSeconds, voicedSeconds, track };
    if (range < 12) return { ...base, ok: false, reason: "noisy", speechSeconds, voicedSeconds, track };
    if (voicedSeconds < minVoiced) return { ...base, ok: false, reason: "little", speechSeconds, voicedSeconds, track };

    /* pitch variety in semitones around the speaker's own median, so voice height does not matter */
    const pitchHz = median(voicedHz);
    const semis = voicedHz.map((f) => st(f, pitchHz));
    const pitchSd = std(semis);
    const pitchSpan = quantile(semis, 0.9) - quantile(semis, 0.1);

    /* pauses: silences of 250 ms or more between the first and last word */
    const first = speechRuns[0][0], last = speechRuns[speechRuns.length - 1][1];
    const pauses = [];
    for (let k = 1; k < speechRuns.length; k += 1) {
      const gap = speechRuns[k][0] - speechRuns[k - 1][1];
      if (gap >= 25) pauses.push({ at: speechRuns[k - 1][1] / 100, dur: gap / 100 });
    }
    const span = (last - first) / 100;
    const pauseTime = sum(pauses.map((p) => p.dur));
    const pauseShare = span > 0 ? pauseTime / span : 0;

    /* syllable nuclei: voiced loudness peaks separated by a 2 dB dip (after de Jong & Wempe, 2009) */
    const sm = smooth(db, 5);
    const spVals = [];
    for (let i = 0; i < n; i += 1) if (speech[i]) spVals.push(sm[i]);
    const peakThr = median(spVals) - 3;
    const nuclei = [];
    for (let i = 1; i < n - 1; i += 1) {
      if (!speech[i] || sm[i] < peakThr || !(sm[i] >= sm[i - 1] && sm[i] > sm[i + 1])) continue;
      let v = false;
      for (let k = -3; k <= 3; k += 1) if (voiced[i + k]) { v = true; break; }
      if (!v) continue;
      if (nuclei.length) {
        const p = nuclei[nuclei.length - 1];
        let dip = Infinity;
        for (let k = p + 1; k < i; k += 1) dip = Math.min(dip, sm[k]);
        if (i - p < 7 || dip > Math.min(sm[p], sm[i]) - 2) {
          if (sm[i] > sm[p]) nuclei[nuclei.length - 1] = i;
          continue;
        }
      }
      nuclei.push(i);
    }
    track.nuclei = nuclei;
    const pace = speechSeconds > 0 ? nuclei.length / speechSeconds : 0;
    const stressSd = nuclei.length > 2 ? std(nuclei.map((i) => sm[i])) : 0;

    /* phrase endings: pitch change over the last half second before each pause and at the end */
    const endings = { falling: 0, level: 0, rising: 0, n: 0 };
    const ends = pauses.map((p) => Math.round(p.at * 100)).concat([last]);
    for (const e of ends) {
      const pts = [];
      for (let i = Math.max(first, e - 50); i < e; i += 1) if (f0s[i] > 0) pts.push([i, st(f0s[i], pitchHz)]);
      if (pts.length < 10) continue;
      const tail = pts.slice(-Math.max(3, Math.round(pts.length * 0.3)));
      const head = pts.slice(0, pts.length - tail.length);
      const change = mean(tail.map((q) => q[1])) - mean(head.map((q) => q[1]));
      endings.n += 1;
      if (change < -1) endings.falling += 1;
      else if (change > 1) endings.rising += 1;
      else endings.level += 1;
    }

    /* how far apart the loud and the quiet parts of the speech are: emphatic and angry voices swing wide */
    const speechDb = [];
    for (let i = 0; i < n; i += 1) if (speech[i]) speechDb.push(db[i]);
    const loudRange = quantile(speechDb, 0.9) - quantile(speechDb, 0.1);

    return {
      ...base,
      ok: true,
      speechSeconds,
      voicedSeconds,
      pitchHz,
      pitchSd,
      pitchSpan,
      pace,
      stressSd,
      loudRange,
      pauseShare,
      pauses,
      longestPause: pauses.length ? Math.max(...pauses.map((p) => p.dur)) : 0,
      endings,
      track,
    };
  }

  /* ---------- judging a take against a target tone ---------- */
  const METRICS = {
    pitch:   { label: "Pitch variety", unit: "st", digits: 1, min: 0, max: 7, tol: 1.0, get: (a) => a.pitchSd },
    pace:    { label: "Pace", unit: "syllables/s", digits: 1, min: 2, max: 7, tol: 0.8, get: (a) => a.pace },
    stress:  { label: "Stress", unit: "dB", digits: 1, min: 0, max: 8, tol: 1.5, get: (a) => a.stressSd },
    pauses:  { label: "Pausing", unit: "%", digits: 0, min: 0, max: 0.5, tol: 0.08, get: (a) => a.pauseShare, show: (v) => Math.round(v * 100) },
    endings: { label: "Falling endings", unit: "%", digits: 0, min: 0, max: 1, tol: 0.25, get: (a) => (a.endings && a.endings.n >= 2 ? a.endings.falling / a.endings.n : NaN), show: (v) => Math.round(v * 100) },
  };
  const WEIGHTS = { pitch: 0.3, pace: 0.25, stress: 0.15, pauses: 0.15, endings: 0.15 };
  const TONES = {
    calm:          { pitch: [1.0, 2.8], pace: [2.8, 4.0], stress: [0, 2.5], pauses: [0.2, 0.45], endings: [0.5, 1] },
    excited:       { pitch: [3.2, 7.0], pace: [4.6, 6.5], stress: [4.0, 8], pauses: [0, 0.15], endings: null },
    authoritative: { pitch: [1.8, 3.6], pace: [3.8, 5.0], stress: [2.5, 5.5], pauses: [0.1, 0.25], endings: [0.7, 1] },
  };

  /* a measurement in its range earns full credit; any miss earns at most 60%, fading to 0 */
  function part(v, band, tol) {
    if (!Number.isFinite(v)) return NaN;
    if (v >= band[0] && v <= band[1]) return 1;
    const dist = v < band[0] ? band[0] - v : v - band[1];
    return 0.6 * clamp(1 - dist / (1.5 * tol), 0, 1);
  }
  /* judge the value as it is displayed, so "20%" is never called below a 20% target */
  const shown = (key, v) => {
    if (!Number.isFinite(v)) return v;
    return METRICS[key].unit === "%" ? Math.round(v * 100) / 100 : Math.round(v * 10) / 10;
  };
  function scoreFor(a, tone) {
    const bands = TONES[tone];
    let s = 0, w = 0;
    const parts = {};
    for (const key of Object.keys(METRICS)) {
      if (!bands[key]) continue;
      const p = part(shown(key, METRICS[key].get(a)), bands[key], METRICS[key].tol);
      parts[key] = p;
      if (!Number.isFinite(p)) continue;
      s += WEIGHTS[key] * p;
      w += WEIGHTS[key];
    }
    return { score: w ? Math.round((100 * s) / w) : 0, parts };
  }
  const fmt = (key, v) => {
    const m = METRICS[key];
    const shown = m.show ? m.show(v) : v;
    return (m.digits ? shown.toFixed(m.digits) : String(Math.round(shown))) + (m.unit === "%" ? "%" : " " + m.unit);
  };
  const band = (key, b) => {
    const m = METRICS[key];
    const lo = m.show ? m.show(b[0]) : b[0], hi = m.show ? m.show(b[1]) : b[1];
    const f = (v) => (m.digits ? v.toFixed(m.digits) : String(Math.round(v)));
    if (b[0] <= m.min) return "up to " + f(hi) + (m.unit === "%" ? "%" : " " + m.unit);
    if (b[1] >= m.max) return f(lo) + (m.unit === "%" ? "%" : " " + m.unit) + " or more";
    return f(lo) + "–" + f(hi) + (m.unit === "%" ? "%" : " " + m.unit);
  };

  function tip(key, a, tone) {
    const v = METRICS[key].get(a), b = TONES[tone][key], low = v < b[0];
    const val = fmt(key, v), goal = band(key, b);
    switch (key) {
      case "pitch":
        return low
          ? "Your pitch moved " + val + " on average; " + tone + " needs about " + goal + (tone === "excited" ? ". Let it swing: jump up on the words you are excited about." : ". Lift the first stressed word of each sentence and let the last one fall.")
          : "Your pitch jumped around a lot (" + val + "). For " + tone + ", keep the melody inside " + goal + ".";
      case "pace":
        return low
          ? "About " + val + " is slow for " + tone + "; push toward " + goal + " and shorten the gaps between words."
          : "You spoke at about " + val + "; for " + tone + " aim for " + goal + ". Put a short pause at every comma.";
      case "stress":
        return low
          ? "Your stressed syllables all carried the same weight. Punch one key word per sentence (" + tone + " sits at " + goal + ")."
          : "Your volume swung a lot between syllables (" + val + "). For " + tone + ", carry an even voice (" + goal + ").";
      case "pauses":
        return low
          ? "You barely paused (" + val + " of the time). For " + tone + ", let a half-second pause land after each point (" + goal + ")."
          : "Your pauses took " + val + " of the time, which lets the energy drop. For " + tone + ", keep gaps short (" + goal + ").";
      case "endings": {
        const e = a.endings;
        const rest = e.rising > 0
          ? " and " + e.rising + " of " + e.n + " went up, which sounds like a question"
          : "; the rest stayed level";
        return "Only " + val + " of your sentences ended with a falling pitch" + rest + ". For " + tone + ", let the last word of each sentence drop.";
      }
      default:
        return "";
    }
  }

  function judge(a, tone) {
    if (!TONES[tone]) tone = "calm";
    if (!a || !a.ok) {
      const secs = a ? a.voicedSeconds || 0 : 0;
      const why = !a ? "Nothing came through." : a.reason === "silent"
        ? "I didn't hear anything. Check that the right microphone is selected and not muted, then try again."
        : a.reason === "noisy"
        ? "Your voice was hard to separate from the background. Try a quieter spot, or hold the microphone a little closer."
        : a.reason === "short" ? "That take was too short to measure. Speak for at least five seconds."
        : "I only heard about " + secs.toFixed(1) + " seconds of voice. Speak for at least five seconds, a little closer to the microphone.";
      return { ok: false, tone, reason: a ? a.reason : "none", score: 0, best: tone, headline: "Not enough voice to measure", feedback: why, tips: [why], rows: [], all: {} };
    }
    const all = {};
    for (const t of Object.keys(TONES)) all[t] = scoreFor(a, t).score;
    const { score, parts } = scoreFor(a, tone);
    const best = Object.keys(all).sort((p, q) => all[q] - all[p])[0];
    const weakest = Object.keys(parts).filter((k) => Number.isFinite(parts[k]) && parts[k] < 0.85).sort((p, q) => parts[p] - parts[q]);
    const tips = weakest.slice(0, 2).map((k) => tip(k, a, tone));
    const focus = weakest.length ? METRICS[weakest[0]].label + " is the thing to work on." : "";
    const scored = Object.keys(parts).filter((k) => Number.isFinite(parts[k]));
    const onTarget = scored.filter((k) => parts[k] === 1).length;
    const headline = score >= 85 ? "That came across as " + tone + "." + (weakest.length ? " " + focus : "")
      : best !== tone && all[best] - score >= 15 ? "Closer to " + best + " than " + tone + ". " + focus
      : onTarget * 2 >= scored.length ? "Mostly " + tone + ". " + focus
      : "Not quite " + tone + " yet. " + focus;
    const feedback = tips.length ? tips.join(" ") : "Every measurement sits in the " + tone + " range. Record it again to make it stick, or try a new prompt.";
    const rows = Object.keys(METRICS).map((key) => {
      const m = METRICS[key], v = m.get(a), b = TONES[tone][key];
      if (!b || !Number.isFinite(v)) return null;
      const pos = (u) => clamp((u - m.min) / (m.max - m.min), 0, 1);
      return {
        key,
        label: m.label,
        value: fmt(key, v),
        target: band(key, b),
        inRange: parts[key] === 1,
        bandLeft: pos(b[0]),
        bandWidth: Math.max(0.02, pos(b[1]) - pos(b[0])),
        mark: pos(v),
      };
    }).filter(Boolean);
    return { ok: true, tone, score, best, all, headline, feedback, tips, rows };
  }

  /* ---------- comparing a take with an example recording ---------- */
  /* the melody of a take: voiced pitch in semitones around the speaker's own median, so a deep and a
     high voice can be compared by shape alone. grid is the same melody on GRID steps of the line's own
     time (unvoiced stretches bridged), so a slower or faster take still lines up with the example */
  const GRID = 60, WARP = 3;
  function melody(a) {
    const tr = a.track, n = tr.f0.length;
    let first = -1, last = -1;
    for (let i = 0; i < n; i += 1) if (tr.speech[i]) { if (first < 0) first = i; last = i; }
    const pts = [], total = new Float64Array(GRID), count = new Float64Array(GRID);
    for (let i = Math.max(0, first); i <= last; i += 1) {
      if (!(tr.f0[i] > 0)) continue;
      const t = (i - first) / Math.max(1, last - first), s = st(tr.f0[i], a.pitchHz);
      pts.push([t, s]);
      const k = Math.min(GRID - 1, Math.floor(t * GRID));
      total[k] += s;
      count[k] += 1;
    }
    const grid = new Array(GRID).fill(NaN);
    for (let k = 0; k < GRID; k += 1) if (count[k]) grid[k] = total[k] / count[k];
    let prev = -1;
    for (let k = 0; k < GRID; k += 1) {
      if (Number.isNaN(grid[k])) continue;
      for (let j = prev + 1; j < k; j += 1) grid[j] = prev < 0 ? grid[k] : grid[prev] + ((grid[k] - grid[prev]) * (j - prev)) / (k - prev);
      prev = k;
    }
    for (let j = prev + 1; j < GRID; j += 1) grid[j] = prev < 0 ? 0 : grid[prev];
    return { pts, grid, span: Math.max(0, last - first) / 100 };
  }
  /* the average semitone gap between two melodies once lined up. The time warp may move each moment
     by at most WARP steps (5% of the line): enough for a human's uneven timing, too little to bend one
     sentence's melody into another's */
  function shapeGap(A, B) {
    const ma = mean(A), mb = mean(B), n = GRID;
    const a = A.map((v) => v - ma), b = B.map((v) => v - mb);
    const D = [];
    for (let i = 0; i <= n; i += 1) D.push(new Float64Array(n + 1).fill(Infinity));
    const L = D.map(() => new Float64Array(n + 1));
    D[0][0] = 0;
    for (let i = 1; i <= n; i += 1) {
      for (let j = Math.max(1, i - WARP); j <= Math.min(n, i + WARP); j += 1) {
        let best = D[i - 1][j - 1], len = L[i - 1][j - 1];
        if (D[i - 1][j] < best) { best = D[i - 1][j]; len = L[i - 1][j]; }
        if (D[i][j - 1] < best) { best = D[i][j - 1]; len = L[i][j - 1]; }
        D[i][j] = best + Math.abs(a[i - 1] - b[j - 1]);
        L[i][j] = len + 1;
      }
    }
    return D[n][n] / Math.max(1, L[n][n]);
  }
  /* mean pitch of a melody over a stretch of normalised time */
  function meanOver(pts, a, b) {
    const v = pts.filter((p) => p[0] >= a && p[0] < b).map((p) => p[1]);
    return v.length ? mean(v) : NaN;
  }

  const miss = (dist, width) => 0.6 * clamp(1 - dist / width, 0, 1);
  /* a melody within this many semitones of the example counts as the same melody. Copies of the example
     land under 0.3 and the other example lines over 0.65; the room in between is for human imitation */
  const SHAPE_OK = 0.8;

  function compare(model, user) {
    if (!user || !user.ok) return judge(user, "calm");
    if (!model || !model.ok) return { ok: false, score: 0, headline: "The example did not load", feedback: "Reload the page and try again.", rows: [] };
    const M = melody(model), U = melody(user);
    const gap = shapeGap(M.grid, U.grid);
    const sizeM = model.pitchSd, sizeU = user.pitchSd, ratio = sizeU / Math.max(0.3, sizeM);
    const timing = U.span / Math.max(0.1, M.span);
    const pM = model.pauses.length, pU = user.pauses.length;
    const loudM = model.loudRange, loudU = user.loudRange, loud = loudU / Math.max(1, loudM);

    /* The weights come from scoring 2,484 CREMA-D takes by other actors against the examples
       (tools/crema-d-examples.mjs --calibrate): melody shape and loudness range tell the tones apart best.
       Pauses only count when the example or the take has one. */
    const W = { shape: 0.4, loudness: 0.3, size: 0.15, timing: 0.15 };
    const parts = {
      /* credit runs out 4 semitones off: other actors saying the line their own way sit about 1.7 off */
      shape: gap <= SHAPE_OK ? 1 : miss(gap - SHAPE_OK, 3.2),
      loudness: loud >= 0.8 && loud <= 1.25 ? 1 : miss(loud < 0.8 ? 0.8 - loud : loud - 1.25, 0.5),
      size: ratio >= 0.75 && ratio <= 1.35 ? 1 : miss(ratio < 0.75 ? 0.75 - ratio : ratio - 1.35, 0.6),
      timing: timing >= 0.85 && timing <= 1.18 ? 1 : miss(timing < 0.85 ? 0.85 - timing : timing - 1.18, 0.45),
    };
    if (pM || pU) {
      W.pauses = 0.15;
      parts.pauses = pU === pM ? 1 : miss(Math.abs(pU - pM) - 1, 2);
    }
    let s = 0, total = 0;
    for (const k of Object.keys(W)) { s += W[k] * parts[k]; total += W[k]; }
    const score = Math.round((100 * s) / total);

    const LABEL = { shape: "Melody shape", loudness: "Loudness", size: "Melody size", timing: "Timing", pauses: "Pauses" };
    const thirds = [["start", 0, 1 / 3], ["middle", 1 / 3, 2 / 3], ["end", 2 / 3, 1.01]];
    function tipFor(k) {
      if (k === "shape") {
        let worst = null;
        for (const [name, a, b] of thirds) {
          const d = meanOver(M.pts, a, b) - meanOver(U.pts, a, b);
          if (Number.isFinite(d) && (!worst || Math.abs(d) > Math.abs(worst.d))) worst = { name, d };
        }
        if (worst && worst.d > 0.8) return "At the " + worst.name + " of the line the example sits higher than you. Lift your voice there.";
        if (worst && worst.d < -0.8) return "At the " + worst.name + " of the line the example sits lower than you. Let your voice drop there.";
        return "Your melody moves at different moments than the example's. Listen again and copy where it goes up and down.";
      }
      if (k === "size") {
        return ratio < 0.75
          ? "Your melody was flatter than the example (" + sizeU.toFixed(1) + " vs " + sizeM.toFixed(1) + " st). Exaggerate the ups and downs. It will feel like too much, but it won't sound like it."
          : "Your melody swung more than the example (" + sizeU.toFixed(1) + " vs " + sizeM.toFixed(1) + " st). Keep it a little smaller.";
      }
      if (k === "timing") {
        return timing > 1
          ? "You took " + U.span.toFixed(1) + " s, the example " + M.span.toFixed(1) + " s. Speed up a little."
          : "You took " + U.span.toFixed(1) + " s, the example " + M.span.toFixed(1) + " s. Slow down and let the words land.";
      }
      if (k === "loudness") {
        return loud < 1
          ? "The example hits some words much harder than others. Punch the key words and let the rest fall back."
          : "Your loudness jumped around more than the example's. Keep it more even.";
      }
      return pU < pM
        ? "The example pauses " + pM + (pM === 1 ? " time" : " times") + "; you paused " + pU + ". Leave a clear half-second gap where the example does."
        : "You paused " + pU + (pU === 1 ? " time" : " times") + "; the example only " + pM + ". Keep the words of each phrase together.";
    }
    /* the misses that cost the most points come first */
    const weakest = Object.keys(parts).filter((k) => parts[k] < 1).sort((p, q) => W[q] * (1 - parts[q]) - W[p] * (1 - parts[p]));
    const tips = weakest.slice(0, 2).map(tipFor);
    const focus = weakest.length ? LABEL[weakest[0]] + " is the thing to fix." : "";
    const headline = score >= 85 ? "Very close to the example." + (weakest.length ? " " + focus : "")
      : score >= 60 ? "Getting there. " + focus
      : "Not there yet. " + focus;

    const scaleSize = Math.max(6, sizeM * 2), scaleTime = Math.max(1, M.span * 2), scalePause = Math.max(4, pM + 3), scaleLoud = Math.max(20, loudM * 2);
    const rows = [
      { key: "shape", label: LABEL.shape, value: gap.toFixed(1) + " st off", target: "within " + SHAPE_OK + " st", inRange: parts.shape === 1, bandLeft: 0, bandWidth: SHAPE_OK / 4, mark: clamp(gap / 4, 0, 1) },
      { key: "loudness", label: LABEL.loudness, value: loudU.toFixed(0) + " dB", target: loudM.toFixed(0) + " dB, like the example", inRange: parts.loudness === 1, bandLeft: clamp((0.8 * loudM) / scaleLoud, 0, 1), bandWidth: clamp((0.45 * loudM) / scaleLoud, 0.02, 1), mark: clamp(loudU / scaleLoud, 0, 1) },
      { key: "size", label: LABEL.size, value: sizeU.toFixed(1) + " st", target: sizeM.toFixed(1) + " st, like the example", inRange: parts.size === 1, bandLeft: clamp((0.75 * sizeM) / scaleSize, 0, 1), bandWidth: clamp((0.6 * sizeM) / scaleSize, 0.02, 1), mark: clamp(sizeU / scaleSize, 0, 1) },
      { key: "timing", label: LABEL.timing, value: U.span.toFixed(1) + " s", target: M.span.toFixed(1) + " s, like the example", inRange: parts.timing === 1, bandLeft: clamp((0.85 * M.span) / scaleTime, 0, 1), bandWidth: clamp((0.33 * M.span) / scaleTime, 0.02, 1), mark: clamp(U.span / scaleTime, 0, 1) },
    ];
    if (W.pauses) rows.push({ key: "pauses", label: LABEL.pauses, value: String(pU), target: pM + ", like the example", inRange: parts.pauses === 1, bandLeft: clamp((pM - 0.4) / scalePause, 0, 1), bandWidth: 0.8 / scalePause, mark: clamp(pU / scalePause, 0, 1) });
    return {
      ok: true,
      score,
      headline,
      feedback: tips.length ? tips.join(" ") : "Every part matches the example. Try it once more from memory, then move on to a new line.",
      tips: tips.length ? tips : ["Every part matches the example. Try it once more from memory, then move on to a new line."],
      parts,
      rows,
      overlay: { model: M.pts, user: U.pts },
      gap, ratio, timing, loud,
    };
  }

  /* ---------- live pitch for the trace while recording ---------- */
  let liveD = null, liveC = null;
  function livePitch(buf, sr) {
    const M = Math.max(1, Math.round(sr / SR)), srEff = sr / M;
    const n = Math.floor(buf.length / M);
    const x = new Float32Array(n);
    let e = 0;
    for (let i = 0; i < n; i += 1) {
      let s = 0;
      for (let k = 0; k < M; k += 1) s += buf[i * M + k];
      x[i] = s / M;
      e += x[i] * x[i];
    }
    if (e / Math.max(1, n) < 1e-6) return 0;
    const tauMax = Math.ceil(srEff / FMIN), W = Math.min(Math.round(srEff * 0.025), n - tauMax - 2);
    if (W < 60) return 0;
    if (!liveD || liveD.length < tauMax + 2) { liveD = new Float64Array(tauMax + 2); liveC = new Float64Array(tauMax + 2); }
    const r = yin(x, 0, W, srEff, liveD, liveC);
    return r.ap < MAX_AP ? r.f0 : 0;
  }

  /* ---------- microphone capture ---------- */
  const WORKLET = [
    "class VMRec extends AudioWorkletProcessor {",
    "  constructor() { super(); this.buf = new Float32Array(4096); this.n = 0; }",
    "  process(inputs) {",
    "    const ch = inputs[0] && inputs[0][0];",
    "    if (ch) for (let i = 0; i < ch.length; i += 1) {",
    "      this.buf[this.n++] = ch[i];",
    "      if (this.n === this.buf.length) { this.port.postMessage(this.buf); this.buf = new Float32Array(4096); this.n = 0; }",
    "    }",
    "    return true;",
    "  }",
    "}",
    "registerProcessor('vm-rec', VMRec);",
  ].join("\n");
  async function capture(ctx, source, onChunk) {
    const mute = ctx.createGain();
    mute.gain.value = 0;
    mute.connect(ctx.destination);
    if (ctx.audioWorklet && typeof AudioWorkletNode !== "undefined") {
      try {
        const url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
        await ctx.audioWorklet.addModule(url);
        URL.revokeObjectURL(url);
        const node = new AudioWorkletNode(ctx, "vm-rec");
        node.port.onmessage = (e) => onChunk(e.data);
        source.connect(node);
        node.connect(mute);
        return { stop() { try { node.port.onmessage = null; source.disconnect(node); node.disconnect(); mute.disconnect(); } catch (e) { /* already closed */ } } };
      } catch (e) { /* fall back to ScriptProcessor below */ }
    }
    const sp = ctx.createScriptProcessor(4096, 1, 1);
    sp.onaudioprocess = (e) => onChunk(new Float32Array(e.inputBuffer.getChannelData(0)));
    source.connect(sp);
    sp.connect(mute);
    return { stop() { try { sp.onaudioprocess = null; source.disconnect(sp); sp.disconnect(); mute.disconnect(); } catch (e) { /* already closed */ } } };
  }
  function join(chunks) {
    let n = 0;
    for (const c of chunks) n += c.length;
    const out = new Float32Array(n);
    let o = 0;
    for (const c of chunks) { out.set(c, o); o += c.length; }
    return out;
  }

  /* ---------- a speech-like test signal ---------- */
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function synth(tone, seconds, opts) {
    opts = opts || {};
    const P = {
      calm: { rate: 3.3, range: 2.0, base: 140, pause: 0.7, every: 5, end: -3, stress: 1.7 },
      excited: { rate: 5.4, range: 9.5, base: 190, pause: 0.2, every: 8, end: 2, stress: 9 },
      authoritative: { rate: 4.4, range: 2.8, base: 115, pause: 0.38, every: 6, end: -4, stress: 6 },
    }[tone] || { rate: 4, range: 3, base: 150, pause: 0.4, every: 6, end: -2, stress: 3 };
    Object.assign(P, opts);
    const sr = opts.sr || SR, n = Math.round((seconds || 12) * sr);
    const r = rng(opts.seed || 7);
    /* lay out syllables: onset time, length, pitch target (semitones), loudness */
    const syl = [];
    let t = 0.4, k = 0, phrase = 0;
    while (t < (seconds || 12) - 0.6) {
      const len = (1 / P.rate) * (0.8 + 0.4 * r());
      const pos = k % P.every;
      const lastInPhrase = pos === P.every - 1;
      const decl = -1.2 * (pos / P.every);
      const accent = (r() - 0.5) * 2 * P.range;
      const pitch = lastInPhrase ? decl + P.end : decl + accent;
      syl.push({ t, len, pitch, gain: Math.pow(10, ((r() - 0.5) * 2 * P.stress) / 20) });
      t += len;
      k += 1;
      if (lastInPhrase) { t += P.pause * (0.8 + 0.4 * r()); phrase += 1; }
    }
    const out = new Float32Array(n);
    let ph = 0;
    for (let i = 0; i < n; i += 1) {
      const time = i / sr;
      let env = 0, semi = 0, g = 0;
      for (let s = 0; s < syl.length; s += 1) {
        const q = syl[s];
        if (time < q.t || time > q.t + q.len) continue;
        const u = (time - q.t) / q.len;
        env = Math.max(0, Math.sin(Math.PI * u)) ** 0.8;
        const next = syl[s + 1] && syl[s + 1].t - (q.t + q.len) < 0.05 ? syl[s + 1].pitch : q.pitch;
        semi = q.pitch + (next - q.pitch) * u * 0.5;
        g = q.gain;
        break;
      }
      const f = P.base * Math.pow(2, semi / 12);
      ph += (2 * Math.PI * f) / sr;
      let v = 0;
      if (env > 0) for (let h = 1; h <= 12 && h * f < sr / 2; h += 1) v += Math.sin(h * ph) * (0.6 / h + Math.exp(-0.5 * ((h * f - 700) / 180) ** 2));
      out[i] = 0.25 * env * g * v + 0.002 * (r() - 0.5);
    }
    return out;
  }

  const api = { SR, analyze, judge, compare, resample, livePitch, capture, join, synth, TONES, METRICS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.VoiceEngine = api;
})(typeof window !== "undefined" ? window : globalThis);
