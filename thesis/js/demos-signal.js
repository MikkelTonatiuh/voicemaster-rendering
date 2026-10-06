/* demos-signal.js: chapter 3, from raw audio to model-ready input (3.1 to 3.11). */
(function () {
  'use strict';
  const s = K.s, h = K.h;

  /* ---------- synthetic voice (harmonics shaped by vowel formants) ---------- */
  K.voice = function (sr, dur, o) {
    o = o || {};
    const n = Math.max(1, Math.round(sr * dur));
    const out = new Float64Array(n);
    const f0 = o.f0 || (() => 150);
    const env = o.env || (() => 1);
    const H = o.harmonics || 24;
    const fmt = o.formants || [[700, 130], [1200, 170], [2500, 240]];
    const shift = o.formantShift || 1;
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const f = f0(t);
      ph += (2 * Math.PI * f) / sr;
      const e = env(t);
      if (e < 1e-4) { out[i] = 0; continue; }
      let v = 0;
      for (let k = 1; k <= H; k++) {
        const fk = k * f;
        if (fk >= sr / 2) break;
        let a = 0.22 / k;
        for (const [F, bw] of fmt) a += Math.exp(-0.5 * ((fk / shift - F) / bw) ** 2);
        v += a * Math.sin(k * ph);
      }
      out[i] = e * v;
    }
    let m = 0;
    for (let i = 0; i < n; i++) m = Math.max(m, Math.abs(out[i]));
    if (m > 0) for (let i = 0; i < n; i++) out[i] *= 0.9 / m;
    return out;
  };
  /* flat-topped syllable envelope */
  K.syll = (list) => (t) => {
    let e = 0;
    for (const [c, w] of list) e = Math.max(e, Math.exp(-Math.pow((t - c) / w, 6)));
    return e;
  };
  /* min/max envelope path of a long signal, for drawing at pixel resolution */
  K.envPath = function (sig, sr, x, y, t0, t1) {
    const px0 = Math.floor(x(t0)), px1 = Math.ceil(x(t1));
    const top = [], bot = [];
    for (let px = px0; px < px1; px++) {
      const a = Math.max(0, Math.floor(x.inv(px) * sr)), b = Math.min(sig.length, Math.ceil(x.inv(px + 1) * sr));
      if (b <= a) continue;
      let lo = Infinity, hi = -Infinity;
      for (let i = a; i < b; i++) { if (sig[i] < lo) lo = sig[i]; if (sig[i] > hi) hi = sig[i]; }
      top.push([px + 0.5, y(hi)]);
      bot.push([px + 0.5, y(lo)]);
    }
    if (!top.length) return '';
    return K.path(top.concat(bot.reverse())) + 'Z';
  };
  const stdOf = (a) => { let m = 0; for (const v of a) m += v; m /= a.length; let q = 0; for (const v of a) q += (v - m) ** 2; return [m, Math.sqrt(q / a.length)]; };

  /* ======================= 3.1 sampling ======================= */
  K.demo({
    id: 'sampling', sec: '3.1', title: 'From sound to numbers', page: 10, y: 0.517, also: [[13, 0.728]],
    hint: 'Slide the tone past fₛ/2.',
    build(api) {
      const LO = 50, HI = 20000;
      const toF = (v) => LO * Math.pow(HI / LO, v), toV = (f) => Math.log(f / LO) / Math.log(HI / LO);
      let f = 1000, fs = 16000;
      const F = K.fig(api.fig, { h: 330, label: 'Two milliseconds of a pure tone, the samples taken from it, and a frequency ruler' });
      K.slider(api.ctl, { label: 'Tone f', min: 0, max: 1, step: 0.001, value: toV(f), wide: true, fmt: (v) => K.n(toF(v)) + ' Hz', onInput: (v) => { f = toF(v); draw(); } });
      K.seg(api.ctl, { label: 'Sampling rate fₛ', value: fs, options: [[8000, '8 kHz'], [16000, '16 kHz'], [44100, '44.1 kHz']], onChange: (v) => { fs = v; draw(); } });
      function draw() {
        F.size().clear();
        const W = F.W, H = F.H;
        const m = { l: 40, r: 16, t: 30, b: 104 };
        const T = 0.002;
        const x = K.scale(0, 2, m.l, W - m.r);
        const y = K.scale(-1.25, 1.25, H - m.b, m.t);
        K.axes(F.svg, { x, y, xt: [0, 0.5, 1, 1.5, 2], yt: [-1, 0, 1], fx: (v) => v + ' ms', fy: (v) => K.f(v, 0), baseline: false });
        F.add(s('line', { x1: m.l, x2: W - m.r, y1: y(0), y2: y(0), class: 'axis' }));
        const N = Math.min(4000, Math.max(400, Math.round(f * T * 50)));
        const pts = [];
        for (let k = 0; k <= N; k++) { const t = (k / N) * T; pts.push([x(t * 1000), y(Math.sin(2 * Math.PI * f * t))]); }
        F.add(s('path', { d: K.path(pts), class: 'ln s-muted', 'stroke-width': 1.25 }));
        const aliased = f > fs / 2;
        const fa = f - Math.round(f / fs) * fs;
        if (aliased) {
          const ap = [];
          for (let k = 0; k <= 800; k++) { const t = (k / 800) * T; ap.push([x(t * 1000), y(Math.sin(2 * Math.PI * fa * t))]); }
          F.add(s('path', { d: K.path(ap), class: 'ln s-t3 dash', 'stroke-width': 2 }));
        }
        const g = s('g');
        for (let i = 0; i / fs <= T + 1e-12; i++) {
          const t = i / fs, v = Math.sin(2 * Math.PI * f * t), px = x(t * 1000);
          g.append(s('line', { x1: px, x2: px, y1: y(0), y2: y(v), class: 's-t1', 'stroke-width': 1 }));
          g.append(s('circle', { cx: px, cy: y(v), r: 3.5, class: 'f-t1 ring' }));
        }
        F.add(g);
        /* frequency ruler, log scale */
        const ry = H - 64;
        const rx = K.scale(Math.log10(50), Math.log10(22050), m.l, W - m.r);
        const X = (hz) => rx(Math.log10(hz));
        F.add(s('rect', { x: X(50), y: ry - 6, width: X(fs / 2) - X(50), height: 12, rx: 3, class: 'f-t2 wash' }));
        F.add(s('line', { x1: X(50), x2: X(22050), y1: ry, y2: ry, class: 'axis' }));
        F.add(s('line', { x1: X(fs / 2), x2: X(fs / 2), y1: ry - 11, y2: ry + 11, class: 's-t2', 'stroke-width': 2 }));
        F.add(K.label(X(fs / 2) + 5, ry - 10, 'fₛ/2', 'lbl-b'));
        for (const t of [100, 1000, 10000]) {
          F.add(s('line', { x1: X(t), x2: X(t), y1: ry, y2: ry + 4, class: 'axis' }));
          F.add(K.label(X(t), ry + 16, t >= 1000 ? t / 1000 + ' kHz' : t + ' Hz', 'tick', 'middle'));
        }
        [[75, 400, 'voice pitch'], [400, 4000, 'vowel detail']].forEach(([a, b, t]) => {
          const yy = ry + 30;
          F.add(s('path', { d: 'M' + X(a) + ',' + (yy - 4) + 'V' + yy + 'H' + X(b) + 'V' + (yy - 4), class: 'ln s-ink2', 'stroke-width': 1 }));
          F.add(K.label((X(a) + X(b)) / 2, yy + 13, t, 'tick', 'middle'));
        });
        F.add(s('circle', { cx: X(Math.min(f, 22050)), cy: ry, r: 5, class: 'f-ink ring' }));
        const tn = K.tn, fr = Math.round(f);
        api.eq.set([
          String.raw`\class{tt1}{w[i]} = \sin\!\Big(2\pi \cdot ${tn(fr)} \cdot \frac{i}{\class{tt2}{${tn(fs)}}}\Big)`,
          aliased
            ? String.raw`${tn(fr)}\ \text{Hz} > \frac{\class{tt2}{${tn(fs)}}}{2} \;\Rightarrow\; \text{the samples spell } \class{tt3}{|${tn(fr)} - ${tn(Math.round(f / fs) * fs)}| = ${tn(Math.abs(fa))}\ \text{Hz}}`
            : String.raw`${tn(fr)}\ \text{Hz} < \frac{\class{tt2}{${tn(fs)}}}{2} = ${tn(fs / 2)}\ \text{Hz}`,
        ]);
      }
      draw();
      api.onResize(draw);
    },
    math: [String.raw`t_i = \frac{i}{\class{tt2}{f_s}}, \qquad f_{\max} = \frac{\class{tt2}{f_s}}{2}`],
  });

  /* ======================= 3.2 labels ======================= */
  K.demo({
    id: 'labels', sec: '3.2', title: 'Three buckets from eight emotions', page: 11, y: 0.525,
    hint: 'Switch the vertical axis to dominance.',
    build(api) {
      /* approximate pleasure / arousal / dominance positions (Mehrabian-style PAD ratings) */
      const E = [
        ['neutral', 0, 0.0, 0.0, 0.0], ['calm', 0, 0.68, -0.46, 0.06], ['sad', 0, -0.63, -0.27, -0.33],
        ['happy', 1, 0.81, 0.51, 0.46], ['surprised', 1, 0.4, 0.67, -0.13], ['fearful', 1, -0.64, 0.6, -0.43],
        ['angry', 2, -0.51, 0.59, 0.25], ['disgust', 2, -0.6, 0.35, 0.11],
      ];
      let axis = 'arousal';
      const F = K.fig(api.fig, { h: (w) => Math.round(K.clamp(w * 0.72, 300, 420)), label: 'Emotion map with the three style buckets' });
      K.seg(api.ctl, { label: 'Vertical axis', value: axis, options: [['arousal', 'Arousal (energy)'], ['dominance', 'Dominance (control)']], onChange: (v) => { axis = v; draw(); } });
      K.legend(api.ctl, [['--calm', 'calm bucket'], ['--excited', 'excited bucket'], ['--auth', 'authoritative bucket']]);
      function hull(pts) {
        if (pts.length < 3) return pts;
        const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
        const lo = [], up = [];
        for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
        for (const q of p.reverse()) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
        return lo.slice(0, -1).concat(up.slice(0, -1));
      }
      function draw() {
        F.size().clear();
        const W = F.W, H = F.H, m = { l: 34, r: 20, t: 26, b: 36 };
        const side = Math.min(W - m.l - m.r, H - m.t - m.b);
        const ox = m.l + (W - m.l - m.r - side) / 2;
        const x = K.scale(-1, 1, ox, ox + side), y = K.scale(-1, 1, m.t + side, m.t);
        F.add(s('rect', { x: x(-1), y: y(1), width: side, height: side, class: 'f-none s-line' }));
        F.add(s('line', { x1: x(0), x2: x(0), y1: y(-1), y2: y(1), class: 'grid' }));
        F.add(s('line', { x1: x(-1), x2: x(1), y1: y(0), y2: y(0), class: 'grid' }));
        F.add(K.label(x(-1), y(-1) + 16, '← unpleasant', 'tick'));
        F.add(K.label(x(1), y(-1) + 16, 'pleasant →', 'tick', 'end'));
        F.add(K.label(x(0), y(-1) + 30, 'valence', 'alabel', 'middle'));
        F.add(K.label(x(-1) + 4, y(1) - 8, axis === 'arousal' ? '↑ high energy' : '↑ in control', 'tick'));
        F.add(K.label(x(-1) + 4, y(-1) - 6, axis === 'arousal' ? 'low energy' : 'submissive', 'tick'));
        const vi = axis === 'arousal' ? 3 : 4;
        const cls = ['calm', 'excited', 'auth'];
        for (let c = 0; c < 3; c++) {
          const pts = E.filter((e) => e[1] === c).map((e) => [x(e[2]), y(e[vi])]);
          const hp = hull(pts);
          if (hp.length >= 3) F.add(s('path', { d: K.path(hp) + 'Z', class: 'f-' + cls[c] + ' wash s-' + cls[c], 'stroke-width': 1.5, 'stroke-linejoin': 'round' }));
          else F.add(s('line', { x1: hp[0][0], y1: hp[0][1], x2: hp[1][0], y2: hp[1][1], class: 's-' + cls[c], 'stroke-width': 10, 'stroke-linecap': 'round', opacity: 0.18 }));
        }
        for (const e of E) {
          const px = x(e[2]), py = y(e[vi]);
          F.add(s('circle', { cx: px, cy: py, r: 6, class: 'f-' + cls[e[1]] + ' ring' }));
          const right = e[2] < 0.55;
          F.add(K.label(px + (right ? 10 : -10), py + 4, e[0], 'lbl-b', right ? 'start' : 'end'));
        }
      }
      draw();
      api.onResize(draw);
    },
    math: [String.raw`\begin{aligned} \class{tcalm}{\text{calm}} &= \{\text{neutral},\ \text{calm},\ \text{sad}\} \\ \class{texc}{\text{excited}} &= \{\text{happy},\ \text{surprised},\ \text{fearful}\} \\ \class{tauth}{\text{authoritative}} &= \{\text{angry},\ \text{disgust}\} \end{aligned}`],
    source: 'Positions are approximate, from published pleasure–arousal–dominance ratings of each emotion word.',
  });

  /* ======================= 3.3 class weights ======================= */
  K.demo({
    id: 'weights', sec: '3.3', title: 'Class weights', page: 12, y: 0.682, also: [[29, 0.502]],
    hint: 'Drag a class size.',
    build(api) {
      const n = [2648, 2654, 2955];
      const F = K.fig(api.fig, { h: 230, label: 'Clips per class and total weight per class' });
      const sl = K.CLS.map((c, i) => K.slider(api.ctl, { label: c.name, min: 300, max: 6000, step: 1, value: n[i], fmt: (v) => K.n(v) + ' clips', onInput: (v) => { n[i] = v; draw(); } }));
      K.btn(api.ctl, 'Thesis training counts', () => { [2648, 2654, 2955].forEach((v, i) => { n[i] = v; sl[i].set(v); }); draw(); }, 'ghost');
      const TC = ['tcalm', 'texc', 'tauth'];
      function draw() {
        F.size().clear();
        const W = F.W, H = F.H;
        const N = n[0] + n[1] + n[2], k = 3;
        const w = n.map((v) => N / (k * v));
        const narrow = W < 520;
        const m = { l: 104, r: 56, t: 34, b: 12 };
        const panelW = narrow ? W - m.l - m.r : (W - m.l - m.r - 40) / 2;
        const rowH = 26, gap = 14;
        const maxN = Math.max(6000, ...n);
        const x1 = K.scale(0, maxN, m.l, m.l + panelW);
        const x2 = K.scale(0, maxN, narrow ? m.l : m.l + panelW + 40, (narrow ? m.l : m.l + panelW + 40) + panelW);
        const y0 = m.t, y1 = narrow ? m.t + 3 * (rowH + gap) + 34 : m.t;
        F.add(K.label(x1(0), y0 - 12, 'Clips nᶜ', 'alabel'));
        F.add(K.label(x2(0), y1 - 12, 'Total weight nᶜ · wᶜ', 'alabel'));
        for (let i = 0; i < 3; i++) {
          const c = K.CLS[i];
          const ya = y0 + i * (rowH + gap), yb = y1 + i * (rowH + gap);
          F.add(K.label(m.l - 10, ya + rowH / 2 + 4, c.name, 'lbl', 'end'));
          F.add(s('rect', { x: x1(0), y: ya, width: Math.max(1, x1(n[i]) - x1(0)), height: rowH, rx: 4, class: 'f-' + c.key }));
          F.add(K.label(x1(n[i]) + 6, ya + rowH / 2 + 4, K.n(n[i]), 'lbl mono'));
          if (narrow) F.add(K.label(m.l - 10, yb + rowH / 2 + 4, c.name, 'lbl', 'end'));
          F.add(s('rect', { x: x2(0), y: yb, width: Math.max(1, x2(n[i] * w[i]) - x2(0)), height: rowH, rx: 4, class: 'f-' + c.key + ' soft' }));
          F.add(K.label(x2(n[i] * w[i]) + 6, yb + rowH / 2 + 4, '×' + K.f(w[i], 2), 'lbl mono'));
        }
        const tall = narrow ? y1 + 3 * (rowH + gap) + 6 : y0 + 3 * (rowH + gap) + 6;
        if (F.H !== tall) { F.H = tall; F.svg.setAttribute('height', tall); F.svg.setAttribute('viewBox', '0 0 ' + W + ' ' + tall); }
        /* one fraction per class, in its colour, then the total every class ends up with */
        api.eq.set([
          String.raw`w_c = \frac{n}{k\,n_c}: \qquad ` + n.map((v, i) => String.raw`\frac{${K.tn(N)}}{3 \cdot \class{${TC[i]}}{${K.tn(v)}}} = \class{${TC[i]}}{${K.f(w[i], 2)}}`).join(String.raw`\qquad `),
          String.raw`n_c\, w_c = \frac{n}{k} = ${K.tn(N / k)} \;\text{ for every class}`,
        ]);
      }
      draw();
      api.onResize(draw);
    },
  });

  /* ======================= 3.5 time stretching ======================= */
  K.demo({
    id: 'timestretch', sec: '3.5', title: 'Time stretching', page: 14, y: 0.592,
    hint: 'Drag r and compare the two 20 ms zooms.',
    build(api) {
      const SR = 8000, DUR = 1.2;
      const f0 = (t) => 150 + 22 * Math.sin(2 * Math.PI * 0.8 * t);
      const env = K.syll([[0.2, 0.12], [0.55, 0.13], [0.9, 0.12]]);
      let r = 1.25;
      const F = K.fig(api.fig, { h: 300, label: 'A clip stretched two ways, with a 20 ms zoom' });
      K.slider(api.ctl, { label: 'Rate r', min: 0.75, max: 1.5, step: 0.01, value: r, fmt: (v) => K.f(v, 2) + (v > 1 ? ' (faster)' : v < 1 ? ' (slower)' : ''), onInput: (v) => { r = v; draw(); } });
      function row(y0, hh, sig, label, W, xMain, zoom, pitch) {
        const y = K.scale(-1, 1, y0 + hh, y0);
        F.add(K.label(xMain.range[0], y0 - 8, label, 'lbl-b'));
        F.add(s('path', { d: K.envPath(sig, SR, xMain, y, 0, sig.length / SR), class: 'f-t1 soft' }));
        const zx = K.scale(0, 20, zoom[0], zoom[1]);
        const tc = 0.55 / r;
        const i0 = Math.round((tc - 0.01) * SR);
        const zp = [];
        for (let k = 0; k <= 160; k++) { const i = i0 + k; if (i >= 0 && i < sig.length) zp.push([zx(k / 8), y(sig[i])]); }
        F.add(s('rect', { x: zoom[0], y: y0, width: zoom[1] - zoom[0], height: hh, class: 'f-panel2 s-line' }));
        F.add(s('path', { d: K.path(zp), class: 'ln s-t1', 'stroke-width': 1.5 }));
        F.add(K.label(zoom[1], y0 - 8, '20 ms zoom: ' + K.n(pitch) + ' Hz', 'tick', 'end'));
        const lx = xMain(tc);
        F.add(s('line', { x1: lx, x2: lx, y1: y0, y2: y0 + hh, class: 's-ink2 dash', 'stroke-width': 1 }));
      }
      function draw() {
        F.size().clear();
        const W = F.W;
        const m = { l: 12, r: 12 };
        const zoomW = Math.max(110, Math.round(W * 0.3));
        const xMain = K.scale(0, 1.6, m.l, W - m.r - zoomW - 18);
        const zoom = [W - m.r - zoomW, W - m.r];
        const dur = DUR / r;
        const resampled = K.voice(SR, dur, { f0: (t) => r * f0(r * t), env: (t) => env(r * t) });
        const vocoded = K.voice(SR, dur, { f0: (t) => f0(r * t), env: (t) => env(r * t) });
        row(34, 92, resampled, 'Resample the samples: w′(t) = w(r·t)', W, xMain, zoom, 150 * r);
        row(172, 92, vocoded, 'Phase vocoder (librosa time_stretch)', W, xMain, zoom, 150);
        const xa = K.scale(0, 1.6, m.l, W - m.r - zoomW - 18);
        for (const t of [0, 0.4, 0.8, 1.2, 1.6]) F.add(K.label(xa(t), 286, t + ' s', 'tick', 'middle'));
        F.add(s('line', { x1: xa(DUR), x2: xa(DUR), y1: 26, y2: 272, class: 's-muted dash', 'stroke-width': 1 }));
        F.add(K.label(xa(DUR) + 4, 272, 'original length', 'tick'));
        const R = String.raw`\class{tt1}{${K.f(r, 2)}}`;
        api.eq.set([
          String.raw`t' = \frac{t}{${R}}: \quad 1.20\ \text{s} \to ${K.f(dur, 2)}\ \text{s}`,
          String.raw`w'(t) = w(${R}\,t): \;\; 150\ \text{Hz} \times ${R} = ${K.tn(150 * r)}\ \text{Hz} \qquad W'(f,t) = W(f, ${R}\,t): \;\; 150\ \text{Hz}`,
        ]);
      }
      draw();
      api.onResize(draw);
    },
  });

  /* ======================= 3.6a STFT ======================= */
  const SR6 = 8000;
  const f0_6 = (t) => 125 + 60 * Math.exp(-(((t - 0.3) / 0.12) ** 2)) + 35 * Math.exp(-(((t - 0.72) / 0.08) ** 2));
  const env6 = K.syll([[0.265, 0.19], [0.735, 0.18]]);
  let sig6 = null;
  const getSig6 = () => sig6 || (sig6 = K.voice(SR6, 1.0, { f0: f0_6, env: env6 }));

  K.demo({
    id: 'stft', sec: '3.6', title: 'Short-time Fourier transform', page: 15, y: 0.304,
    hint: 'Park the window in the gap at 0.5 s, then change its length.',
    build(api) {
      let t = 0.3, win = 32;
      const F = K.fig(api.fig, { h: (w) => (w < 520 ? 470 : 380), label: 'Spectrogram with a sliding window, the windowed signal, and its spectrum' });
      K.slider(api.ctl, { label: 'Window position t', min: 0.04, max: 0.96, step: 0.005, value: t, wide: true, fmt: (v) => K.f(v, 2) + ' s', onInput: (v) => { t = v; drawBottom(); drawCursor(); } });
      K.seg(api.ctl, { label: 'Window length', value: win, options: [[16, '16 ms'], [32, '32 ms'], [64, '64 ms']], onChange: (v) => { win = v; draw(); } });
      let spec = null, lay = null, cursorG = null, bottomG = null;
      function computeSpec() {
        const sig = getSig6();
        const N = (win / 1000) * SR6, hop = 40, fr = Math.floor((sig.length - N) / hop) + 1;
        const bins = Math.round((2000 / SR6) * N);
        const win_ = K.hann(N);
        const db = new Float64Array(fr * bins);
        let mx = -Infinity;
        const re = new Float64Array(N), im = new Float64Array(N);
        for (let j = 0; j < fr; j++) {
          for (let i = 0; i < N; i++) { re[i] = sig[j * hop + i] * win_[i]; im[i] = 0; }
          K.fft(re, im);
          for (let b = 0; b < bins; b++) { const v = 20 * Math.log10(Math.hypot(re[b], im[b]) + 1e-9); db[j * bins + b] = v; if (v > mx) mx = v; }
        }
        spec = { db, fr, bins, hop, N, mx };
      }
      function draw() {
        computeSpec();
        F.size().clear();
        const W = F.W, H = F.H, narrow = W < 520;
        const m = { l: 44, r: 14 };
        const sy0 = 26, sh = narrow ? 130 : 120;
        lay = { W, H, narrow, m, sy0, sh, x: K.scale(0, 1, m.l, W - m.r), fy: K.scale(0, 2000, sy0 + sh, sy0) };
        const { db, fr, bins, mx } = spec;
        const url = K.raster(fr, bins, (d, w, hh) => {
          for (let j = 0; j < w; j++) for (let b = 0; b < hh; b++) {
            const v = K.clamp((db[j * bins + b] - mx + 60) / 60, 0, 1);
            const c = K.heat(v).rgb, o = ((hh - 1 - b) * w + j) * 4;
            d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
          }
        });
        const t0 = (spec.N / 2) / SR6, t1 = ((fr - 1) * spec.hop + spec.N / 2) / SR6;
        F.add(s('image', { href: url, x: lay.x(t0), y: sy0, width: lay.x(t1) - lay.x(t0), height: sh, preserveAspectRatio: 'none' }));
        K.axes(F.svg, { x: lay.x, y: lay.fy, xt: [0, 0.2, 0.4, 0.6, 0.8, 1], yt: [0, 500, 1000, 1500, 2000], fx: (v) => v + ' s', fy: (v) => (v ? v : '0'), grid: false, yl: 'Hz' });
        cursorG = s('g'); F.add(cursorG);
        bottomG = s('g'); F.add(bottomG);
        drawCursor();
        drawBottom();
      }
      function drawCursor() {
        cursorG.replaceChildren();
        const w = win / 1000, { x, sy0, sh } = lay;
        cursorG.append(s('rect', { x: x(t - w / 2), y: sy0 - 2, width: Math.max(2, x(t + w / 2) - x(t - w / 2)), height: sh + 4, class: 'f-none s-t1', 'stroke-width': 2, rx: 2 }));
      }
      function drawBottom() {
        bottomG.replaceChildren();
        const sig = getSig6();
        const { W, H, narrow, m, sy0, sh } = lay;
        const top = sy0 + sh + 50;
        const N = (win / 1000) * SR6;
        const c = Math.round(t * SR6), a = c - N / 2;
        const g = K.hann(N);
        const pw = narrow ? W - m.l - m.r : (W - m.l - m.r - 36) / 2;
        const bh = narrow ? 110 : H - top - 30;
        const xa = K.scale(-win / 2, win / 2, m.l, m.l + pw), ya = K.scale(-1, 1, top + bh, top);
        bottomG.append(K.label(m.l, top - 12, 'Inside the window', 'lbl-b'));
        const pS = [], pG = [], pP = [];
        for (let i = 0; i < N; i++) {
          const v = sig[a + i] || 0, tm = ((i - N / 2) / SR6) * 1000;
          pS.push([xa(tm), ya(v)]); pG.push([xa(tm), ya(g[i])]); pP.push([xa(tm), ya(v * g[i])]);
        }
        bottomG.append(s('line', { x1: xa(-win / 2), x2: xa(win / 2), y1: ya(0), y2: ya(0), class: 'axis' }));
        bottomG.append(s('path', { d: K.path(pS), class: 'ln s-muted', 'stroke-width': 1 }));
        bottomG.append(s('path', { d: K.path(pG), class: 'ln s-t1', 'stroke-width': 2 }));
        bottomG.append(s('path', { d: K.path(pP), class: 'ln s-t2', 'stroke-width': 1.5 }));
        bottomG.append(K.label(xa(-win / 2), top + bh + 15, '−' + win / 2 + ' ms', 'tick'));
        bottomG.append(K.label(xa(win / 2), top + bh + 15, '+' + win / 2 + ' ms', 'tick', 'end'));
        /* spectrum of the window, zero-padded */
        const NF = 2048, re = new Float64Array(NF), im = new Float64Array(NF);
        for (let i = 0; i < N; i++) re[i] = (sig[a + i] || 0) * g[i];
        K.fft(re, im);
        const maxBin = Math.round((2000 / SR6) * NF);
        const mags = [];
        let mx = 1e-12;
        for (let b = 0; b <= maxBin; b++) { const v = Math.hypot(re[b], im[b]); mags.push(v); if (v > mx) mx = v; }
        const sx0 = narrow ? m.l : m.l + pw + 36, top2 = narrow ? top + bh + 64 : top;
        const xs = K.scale(0, 2000, sx0, sx0 + pw), ys = K.scale(-50, 0, top2 + bh, top2);
        bottomG.append(K.label(sx0, top2 - 12, 'Spectrum |W(f, t)| in dB', 'lbl-b'));
        const f0 = f0_6(t), voiced = env6(t) > 0.05;
        if (voiced) for (let k = 1; k * f0 <= 2000; k++) bottomG.append(s('line', { x1: xs(k * f0), x2: xs(k * f0), y1: top2, y2: top2 + bh, class: 'grid' }));
        const pts = mags.map((v, b) => [xs((b * SR6) / NF), ys(Math.max(-50, 20 * Math.log10(v / mx + 1e-9)))]);
        bottomG.append(s('path', { d: K.path(pts), class: 'ln s-t2', 'stroke-width': 1.5 }));
        bottomG.append(s('line', { x1: xs(0), x2: xs(2000), y1: top2 + bh, y2: top2 + bh, class: 'axis' }));
        for (const f of [0, 500, 1000, 1500, 2000]) bottomG.append(K.label(xs(f), top2 + bh + 15, f === 2000 ? '2 kHz' : String(f), 'tick', 'middle'));
        if (narrow) {
          const need = top2 + bh + 26;
          if (F.H !== need) { F.H = need; F.svg.setAttribute('height', need); F.svg.setAttribute('viewBox', '0 0 ' + W + ' ' + need); }
        }
        /* spacing between harmonic peaks (median gap) */
        const peaks = [];
        for (let b = 2; b < mags.length - 1; b++) if (mags[b] > 0.08 * mx && mags[b] >= mags[b - 1] && mags[b] >= mags[b + 1]) peaks.push((b * SR6) / NF);
        const gaps = peaks.slice(1).map((f, i) => f - peaks[i]).sort((a, b) => a - b);
        const pk = gaps.length ? gaps[Math.floor(gaps.length / 2)] : -1;
        const tt = String.raw`\class{tt1}{${K.f(t, 2)}}`;
        api.eq.set([
          String.raw`\class{tt2}{W(f, ${tt})} = \int w(\tau)\;\class{tt1}{g(\tau - ${tt})}\;e^{-i 2\pi f \tau}\,d\tau`,
          (voiced && pk > 0
            ? String.raw`\text{peaks every } ${K.tn(pk)}\ \text{Hz} \;\Rightarrow\; \text{pitch} \approx ${K.tn(f0)}\ \text{Hz}`
            : String.raw`\text{no peaks: silence has no pitch}`) +
            String.raw`\qquad \frac{1}{${win}\ \text{ms}} = ${K.f(SR6 / N, 1)}\ \text{Hz between bins}`,
        ]);
      }
      draw();
      api.onResize(draw);
    },
  });

  /* ======================= 3.6b pitch shift ======================= */
  K.demo({
    id: 'pitchshift', sec: '3.6', title: 'Pitch shifting', page: 15, y: 0.655,
    hint: 'Shift a whole octave, then switch the axis to semitones.',
    build(api) {
      let n = 2, unit = 'hz';
      const F = K.fig(api.fig, { h: (w) => (w < 520 ? 470 : 270), label: 'Harmonics before and after a pitch shift, and the pitch contour' });
      K.slider(api.ctl, { label: 'Shift n', min: -12, max: 12, step: 1, value: n, fmt: (v) => (v > 0 ? '+' : '') + v + ' semitones', onInput: (v) => { n = v; draw(); } });
      K.seg(api.ctl, { label: 'Pitch axis', value: unit, options: [['hz', 'Hz'], ['st', 'Semitones']], onChange: (v) => { unit = v; draw(); } });
      const fmt = [[700, 130], [1200, 170], [2500, 240]];
      const amp = (f, sh) => { let a = 0.22 * 150 / f; for (const [F0, bw] of fmt) a += Math.exp(-0.5 * ((f / sh - F0) / bw) ** 2); return a; };
      function draw() {
        F.size().clear();
        const W = F.W, H = F.H, narrow = W < 520;
        const sc = Math.pow(2, n / 12);
        const m = { l: 44, r: 14, t: 30 };
        const pw = narrow ? W - m.l - m.r : (W - m.l - m.r - 44) / 2;
        const ph = narrow ? 170 : H - m.t - 44;
        /* spectrum */
        const x = K.scale(0, 2400, m.l, m.l + pw), y = K.scale(0, 1.25, m.t + ph, m.t);
        F.add(K.label(m.l, m.t - 12, 'One frame: harmonics of a 150 Hz voice', 'lbl-b'));
        K.axes(F.svg, { x, y, xt: [0, 600, 1200, 1800, 2400], yt: [], fx: (v) => (v ? v : '0') + (v === 2400 ? ' Hz' : ''), grid: false });
        const envO = [], envS = [];
        for (let f = 20; f <= 2400; f += 10) { envO.push([x(f), y(amp(f, 1) / 1.25)]); envS.push([x(f), y(amp(f, sc) / 1.25)]); }
        F.add(s('path', { d: K.path(envO), class: 'ln s-muted dash', 'stroke-width': 1 }));
        F.add(s('path', { d: K.path(envS), class: 'ln s-t1 dash', 'stroke-width': 1 }));
        for (let k = 1; k * 150 <= 2400; k++) {
          const f = k * 150, a = amp(f, 1) / 1.25;
          F.add(s('line', { x1: x(f), x2: x(f), y1: y(0), y2: y(a), class: 's-muted', 'stroke-width': 3, 'stroke-linecap': 'round', opacity: 0.55 }));
        }
        for (let k = 1; k * 150 * sc <= 2400; k++) {
          const f = k * 150 * sc, a = amp(f, sc) / 1.25;
          F.add(s('line', { x1: x(f), x2: x(f), y1: y(0), y2: y(a), class: 's-t1', 'stroke-width': 2, 'stroke-linecap': 'round' }));
          F.add(s('circle', { cx: x(f), cy: y(a), r: 3.5, class: 'f-t1 ring' }));
        }
        F.add(K.label(m.l + pw, m.t + 4, 'grey: original · violet: shifted', 'tick', 'end'));
        /* contour */
        const cx0 = narrow ? m.l : m.l + pw + 44, cy0 = narrow ? m.t + ph + 70 : m.t;
        const ch = narrow ? 170 : ph;
        const tt = [], fo = [], fsft = [];
        for (let i = 0; i <= 200; i++) { const t = i / 200; if (env6(t) < 0.3) { tt.push(null); continue; } tt.push(t); fo.push(f0_6(t)); fsft.push(f0_6(t) * sc); }
        const toU = (f) => (unit === 'hz' ? f : 12 * Math.log2(f / 100));
        const lo = unit === 'hz' ? 0 : -6, hi = unit === 'hz' ? 450 : 24;
        const xc = K.scale(0, 1, cx0, cx0 + pw), yc = K.scale(lo, hi, cy0 + ch, cy0);
        F.add(K.label(cx0, cy0 - 12, 'Pitch contour (' + (unit === 'hz' ? 'Hz' : 'semitones above 100 Hz') + ')', 'lbl-b'));
        K.axes(F.svg, { x: xc, y: yc, xt: [0, 0.5, 1], yt: K.ticks(lo, hi, 4), fx: (v) => v + ' s', fy: (v) => String(v) });
        const seg = (fn) => { const out = []; let cur = []; for (let i = 0; i <= 200; i++) { const t = i / 200; if (env6(t) < 0.3) { if (cur.length) out.push(cur); cur = []; continue; } cur.push([xc(t), yc(toU(fn(t)))]); } if (cur.length) out.push(cur); return out.map(K.path).join(''); };
        F.add(s('path', { d: seg(f0_6), class: 'ln s-muted', 'stroke-width': 2 }));
        F.add(s('path', { d: seg((t) => f0_6(t) * sc), class: 'ln s-t1', 'stroke-width': 2 }));
        const [, sdo] = stdOf(fo), [, sds] = stdOf(fsft);
        const [, sto] = stdOf(fo.map((f) => 12 * Math.log2(f)));
        const S = String.raw`\class{tt1}{${K.f(sc, 3)}}`, N = String.raw`\class{tt2}{${n > 0 ? '+' : ''}${n}}`;
        api.eq.set([
          String.raw`\class{tt1}{s} = 2^{\class{tt2}{n}/12} = 2^{${N}/12} = ${S} \qquad 150\ \text{Hz} \times ${S} = ${K.f(150 * sc, 0)}\ \text{Hz}`,
          String.raw`\text{spread: } ${K.f(sdo, 1)} \to ${K.f(sds, 1)}\ \text{Hz} \qquad ${K.f(sto, 2)} \to ${K.f(sto, 2)}\ \text{semitones}`,
        ]);
        if (narrow) { const need = cy0 + ch + 26; if (F.H !== need) { F.H = need; F.svg.setAttribute('height', need); F.svg.setAttribute('viewBox', '0 0 ' + W + ' ' + need); } }
      }
      draw();
      api.onResize(draw);
    },
  });

  /* ======================= 3.7 additive noise ======================= */
  K.demo({
    id: 'noise', sec: '3.7', title: 'Additive noise', page: 16, y: 0.305,
    hint: 'Find the σ where the SNR hits 0 dB.',
    build(api) {
      const SR = 8000;
      const clean = K.voice(SR, 0.04, { f0: () => 150 });
      let sigma = 0.1, seed = 7;
      const F = K.fig(api.fig, { h: (w) => (w < 520 ? 400 : 250), label: 'A clean and a noisy waveform, and the noise histogram' });
      K.slider(api.ctl, { label: 'Noise level σ', min: 0, max: 0.6, step: 0.005, value: sigma, fmt: (v) => K.f(v, 3), onInput: (v) => { sigma = v; draw(); } });
      K.btn(api.ctl, 'New noise', () => { seed++; draw(); }, 'ghost');
      function draw() {
        F.size().clear();
        const W = F.W, H = F.H, narrow = W < 520;
        const r = K.rng(seed);
        const eps = Array.from(clean, () => sigma * K.randn(r));
        const noisy = clean.map((v, i) => v + eps[i]);
        const m = { l: 36, r: 14, t: 28 };
        const pw = narrow ? W - m.l - m.r : (W - m.l - m.r) * 0.64;
        const ph = narrow ? 170 : H - m.t - 36;
        const x = K.scale(0, 40, m.l, m.l + pw), y = K.scale(-2, 2, m.t + ph, m.t);
        K.axes(F.svg, { x, y, xt: [0, 10, 20, 30, 40], yt: [-2, -1, 0, 1, 2], fx: (v) => v + ' ms', fy: (v) => String(v) });
        F.add(K.label(m.l, m.t - 12, 'w′ = w + ε', 'lbl-b'));
        F.add(s('path', { d: K.path(Array.from(noisy, (v, i) => [x((i / SR) * 1000), y(K.clamp(v, -2.2, 2.2))])), class: 'ln s-t1', 'stroke-width': 1.25 }));
        F.add(s('path', { d: K.path(Array.from(clean, (v, i) => [x((i / SR) * 1000), y(v)])), class: 'ln s-ink', 'stroke-width': 1.5 }));
        F.add(K.label(m.l + pw, m.t - 12, 'black: clean · violet: noisy', 'tick', 'end'));
        /* histogram */
        const hx0 = narrow ? m.l : m.l + pw + 40, hy0 = narrow ? m.t + ph + 60 : m.t;
        const hw = narrow ? W - m.l - m.r : W - m.r - hx0, hh = narrow ? 120 : ph;
        const lim = Math.max(0.05, 4 * sigma), bins = 21;
        const cnt = new Array(bins).fill(0);
        for (const e of eps) { const b = Math.floor(((e + lim) / (2 * lim)) * bins); if (b >= 0 && b < bins) cnt[b]++; }
        const bw = (2 * lim) / bins;
        const peak = sigma > 0 ? (eps.length * bw) / (sigma * Math.sqrt(2 * Math.PI)) : eps.length;
        const hxs = K.scale(-lim, lim, hx0, hx0 + hw), hys = K.scale(0, Math.max(peak, ...cnt) * 1.1, hy0 + hh, hy0);
        F.add(K.label(hx0, hy0 - 12, 'Values of ε', 'lbl-b'));
        cnt.forEach((c, b) => {
          const xa = hxs(-lim + b * bw) + 1, xb = hxs(-lim + (b + 1) * bw) - 1;
          if (c > 0) F.add(s('rect', { x: xa, y: hys(c), width: Math.max(1, xb - xa), height: hys(0) - hys(c), class: 'f-t1 soft', rx: 1.5 }));
        });
        if (sigma > 0) {
          const gp = [];
          for (let i = 0; i <= 80; i++) { const e = -lim + (2 * lim * i) / 80; gp.push([hxs(e), hys(eps.length * bw * K.npdf(e, 0, sigma))]); }
          F.add(s('path', { d: K.path(gp), class: 'ln s-t2', 'stroke-width': 2 }));
        }
        F.add(s('line', { x1: hx0, x2: hx0 + hw, y1: hy0 + hh, y2: hy0 + hh, class: 'axis' }));
        F.add(K.label(hx0, hy0 + hh + 15, K.f(-lim, 2), 'tick'));
        F.add(K.label(hx0 + hw, hy0 + hh + 15, K.f(lim, 2), 'tick', 'end'));
        F.add(K.label(hx0 + hw / 2, hy0 + hh + 15, '0', 'tick', 'middle'));
        if (narrow) { const need = hy0 + hh + 24; if (F.H !== need) { F.H = need; F.svg.setAttribute('height', need); F.svg.setAttribute('viewBox', '0 0 ' + W + ' ' + need); } }
        let P = 0;
        for (const v of clean) P += v * v;
        P /= clean.length;
        const SG = String.raw`\class{tt2}{${K.f(sigma, 3)}}`;
        api.eq.set([
          String.raw`w'[i] = w[i] + \class{tt1}{\epsilon_i}, \qquad \class{tt1}{\epsilon_i} \sim \mathcal{N}(0,\ ${SG}^2)`,
          sigma > 0
            ? String.raw`\text{SNR} = 10 \log_{10} \frac{P_{\text{signal}}}{\sigma^2} = 10 \log_{10} \frac{${K.f(P, 3)}}{${SG}^2} = ${K.f(10 * Math.log10(P / (sigma * sigma)), 1)}\ \text{dB}`
            : String.raw`\sigma = 0: \ \text{no noise}`,
        ]);
      }
      draw();
      api.onResize(draw);
    },
  });

  /* ======================= 3.8 volume scaling ======================= */
  K.demo({
    id: 'volume', sec: '3.8', title: 'Volume scaling', page: 16, y: 0.612,
    hint: 'Drag v, then add noise.',
    build(api) {
      const SR = 8000;
      const base = K.voice(SR, 0.05, { f0: () => 140 });
      const noise = (() => { const r = K.rng(11); return Array.from(base, () => 0.06 * K.randn(r)); })();
      let v = 1.6, withNoise = false;
      const F = K.fig(api.fig, { h: 300, label: 'Original, scaled and normalized waveforms' });
      K.slider(api.ctl, { label: 'Volume v', min: 0.25, max: 2, step: 0.01, value: v, fmt: (x) => K.f(x, 2) + ' (thesis 0.8–1.2)', onInput: (x) => { v = x; draw(); }, wide: true });
      K.check(api.ctl, { label: 'Add background noise after scaling', value: withNoise, onChange: (x) => { withNoise = x; draw(); } });
      const norm = (a) => { const [mu, sd] = stdOf(a); return a.map((x) => (x - mu) / sd); };
      function draw() {
        F.size().clear();
        const W = F.W, m = { l: 36, r: 12 };
        const scaled = base.map((x, i) => v * x + (withNoise ? noise[i] : 0));
        const ref = base.map((x, i) => x + (withNoise ? noise[i] : 0));
        const nS = norm(scaled), nR = norm(ref);
        let diff = 0;
        for (let i = 0; i < nS.length; i++) diff += (nS[i] - nR[i]) ** 2;
        diff = Math.sqrt(diff / nS.length);
        const x = K.scale(0, 50, m.l, W - m.r);
        const rows = [
          ['Original w', ref, 2.2, 's-muted'],
          ['Scaled v·w' + (withNoise ? ' + noise' : ''), scaled, 2.2, 's-t1'],
          ['Normalized (w′ − μ) / σ', nS, 4.4, 's-t2'],
        ];
        rows.forEach(([lab, sig, lim, cls], k) => {
          const y0 = 22 + k * 94, hh = 64;
          const y = K.scale(-lim, lim, y0 + hh, y0);
          F.add(K.label(m.l, y0 - 6, lab, 'lbl-b'));
          F.add(s('line', { x1: m.l, x2: W - m.r, y1: y(0), y2: y(0), class: 'grid' }));
          if (k === 2) F.add(s('path', { d: K.path(Array.from(nR, (q, i) => [x((i / SR) * 1000), y(q)])), class: 'ln s-muted', 'stroke-width': 4, opacity: 0.35 }));
          F.add(s('path', { d: K.path(Array.from(sig, (q, i) => [x((i / SR) * 1000), y(K.clamp(q, -lim, lim))])), class: 'ln ' + cls, 'stroke-width': 1.5 }));
        });
        /* the volume factor appears in the formula, and cancels unless noise was added after scaling */
        const V = String.raw`\class{tt1}{${K.f(v, 2)}}`;
        api.eq.set(withNoise
          ? [
            String.raw`w' = ${V}\,w + \epsilon`,
            String.raw`\class{tt2}{\tilde w} = \frac{${V}\,w + \epsilon - \mu_{w'}}{\sigma_{w'}} \;\ne\; \frac{w + \epsilon - \mu}{\sigma} \qquad \text{off by } ${K.f(diff, 3)}`,
          ]
          : [
            String.raw`w' = ${V}\,w`,
            String.raw`\class{tt2}{\tilde w} = \frac{w' - \mu_{w'}}{\sigma_{w'}} = \frac{\cancel{${V}}\,(w - \mu_w)}{\cancel{${V}}\,\sigma_w} = \frac{w - \mu_w}{\sigma_w}`,
          ]);
      }
      draw();
      api.onResize(draw);
    },
  });

  /* ======================= 3.9 mixup ======================= */
  K.demo({
    id: 'mixup', sec: '3.9', title: 'Mixup', page: 17, y: 0.171, also: [[17, 0.488]],
    hint: 'Press Draw a few times, then set α to 1.',
    build(api) {
      const SR = 8000;
      const w1 = K.voice(SR, 0.05, { f0: () => 118 });
      const w2e = K.voice(SR, 0.05, { f0: (t) => 230 + 40 * Math.sin(2 * Math.PI * 30 * t), formants: [[800, 140], [1600, 180], [2700, 240]] });
      const w2a = K.voice(SR, 0.05, { f0: () => 170, formants: [[650, 110], [1100, 150], [2400, 200]] }).map((q) => K.clamp(q * 1.6, -0.95, 0.95));
      let alpha = 0.2, lam = 0.8, other = 1, seed = 1;
      const draws = [];
      const F = K.fig(api.fig, { h: (w) => (w < 520 ? 520 : 300), label: 'Beta distribution of the mixing weight and a mixed example' });
      const aS = K.slider(api.ctl, { label: 'α', min: 0.1, max: 2, step: 0.05, value: alpha, fmt: (v) => K.f(v, 2), onInput: (v) => { alpha = v; draws.length = 0; draw(); } });
      const lS = K.slider(api.ctl, { label: 'λ', min: 0, max: 1, step: 0.01, value: lam, fmt: (v) => K.f(v, 2), onInput: (v) => { lam = v; draw(); } });
      K.btn(api.ctl, 'Draw λ ~ Beta(α, α)', () => { const r = K.rng(seed++ * 7919); lam = K.betaSample(r, alpha, alpha); draws.push(lam); if (draws.length > 60) draws.shift(); lS.set(Math.round(lam * 100) / 100); draw(); });
      K.seg(api.ctl, { label: 'Clip 2 is', value: other, options: [[1, 'excited'], [2, 'authoritative']], onChange: (v) => { other = v; draw(); } });
      void aS;
      function draw() {
        F.size().clear();
        const W = F.W, narrow = W < 520;
        const m = { l: 36, r: 12, t: 30 };
        const pw = narrow ? W - m.l - m.r : (W - m.l - m.r) * 0.42;
        const ph = narrow ? 170 : F.H - m.t - 40;
        /* Beta density */
        const x = K.scale(0, 1, m.l, m.l + pw), y = K.scale(0, 4, m.t + ph, m.t);
        F.add(K.label(m.l, m.t - 12, 'Density of λ ~ Beta(' + K.f(alpha, 2) + ', ' + K.f(alpha, 2) + ')', 'lbl-b'));
        K.axes(F.svg, { x, y, xt: [0, 0.1, 0.5, 0.9, 1], yt: [0, 1, 2, 3, 4], fx: (v) => String(v), fy: (v) => String(v) });
        const pts = [];
        for (let i = 1; i < 400; i++) { const t = i / 400; pts.push([x(t), y(Math.min(4, K.betaPdf(t, alpha, alpha)))]); }
        const area = [[x(0.0025), y(0)]].concat(pts, [[x(0.9975), y(0)]]);
        F.add(s('path', { d: K.path(area) + 'Z', class: 'f-t1 wash' }));
        const mid = [[x(0.1), y(0)]].concat(pts.filter((p) => p[0] >= x(0.1) && p[0] <= x(0.9)), [[x(0.9), y(0)]]);
        F.add(s('path', { d: K.path(mid) + 'Z', class: 'f-t1 soft' }));
        F.add(s('path', { d: K.path(pts), class: 'ln s-t1', 'stroke-width': 2 }));
        const pMid = K.betaCdf(0.9, alpha, alpha) - K.betaCdf(0.1, alpha, alpha);
        F.add(K.label(x(0.5), y(0) - 10, K.pct(pMid, 0) + ' of draws', 'lbl-b', 'middle'));
        for (const d of draws) F.add(s('line', { x1: x(d), x2: x(d), y1: y(0) + 3, y2: y(0) + 11, class: 's-t1', 'stroke-width': 1.5 }));
        F.add(s('path', { d: 'M' + x(lam) + ',' + (m.t + 2) + 'V' + y(0), class: 'ln s-ink dash', 'stroke-width': 1.5 }));
        /* the mix */
        const mx0 = narrow ? m.l : m.l + pw + 40, my0 = narrow ? m.t + ph + 58 : m.t;
        const mw = narrow ? W - m.l - m.r : W - m.r - mx0;
        const w2 = other === 1 ? w2e : w2a, key2 = other === 1 ? 'excited' : 'auth';
        const mix = w1.map((q, i) => lam * q + (1 - lam) * w2[i]);
        const xs = K.scale(0, w1.length - 1, mx0 + 40, mx0 + mw);
        const rows = [['w₁', w1, 's-calm'], ['w₂', w2, 's-' + key2], ['w_mix', mix, 's-ink']];
        rows.forEach(([lab, sig, cls], k) => {
          const y0 = my0 + k * 44, ys = K.scale(-1, 1, y0 + 34, y0);
          F.add(K.label(mx0, y0 + 21, lab, 'lbl-b'));
          F.add(s('path', { d: K.path(Array.from(sig, (q, i) => [xs(i), ys(q)])), class: 'ln ' + cls, 'stroke-width': 1.25 }));
        });
        const lab0 = my0 + 3 * 44 + 8;
        const Y = [[1, 0, 0], other === 1 ? [0, 1, 0] : [0, 0, 1]];
        const ymix = [0, 1, 2].map((c) => lam * Y[0][c] + (1 - lam) * Y[1][c]);
        [['y₁', Y[0]], ['y₂', Y[1]], ['y_mix', ymix]].forEach(([lab, vec], k) => {
          const y0 = lab0 + k * 28;
          F.add(K.label(mx0, y0 + 14, lab, 'lbl-b'));
          let acc = mx0 + 40;
          const tot = mw - 40;
          vec.forEach((p, c) => {
            if (p <= 0.0001) return;
            const wpx = tot * p;
            F.add(s('rect', { x: acc, y: y0, width: Math.max(1, wpx - 2), height: 20, rx: 3, class: 'f-' + K.CLS[c].key }));
            if (wpx > 44) F.add(K.label(acc + 6, y0 + 14, K.pct(p, 0) + ' ' + (c === 2 ? 'auth.' : K.CLS[c].name), 'lbl-on on-' + K.CLS[c].key));
            acc += wpx;
          });
        });
        const need = narrow ? lab0 + 3 * 28 + 8 : Math.max(F.H, lab0 + 3 * 28 + 4);
        if (F.H !== need) { F.H = need; F.svg.setAttribute('height', need); F.svg.setAttribute('viewBox', '0 0 ' + W + ' ' + need); }
        /* the same λ mixes the sounds and the labels */
        const L = String.raw`\class{tt1}{${K.f(lam, 2)}}`, L1 = String.raw`\class{tt1}{${K.f(1 - lam, 2)}}`;
        const C2 = other === 1 ? 'texc' : 'tauth', vec = (v) => '[' + v.map((q) => K.f(q, 2).replace(/\.00$/, '')).join(',\\ ') + ']';
        api.eq.set([
          String.raw`\class{tt1}{\lambda} \sim \mathrm{Beta}(${K.f(alpha, 2)},\ ${K.f(alpha, 2)}): \quad P(0.1 < \class{tt1}{\lambda} < 0.9) = ${K.f(pMid * 100, 0)}\%`,
          String.raw`y_{\text{mix}} = ${L}\,\class{tcalm}{${vec(Y[0])}} + ${L1}\,\class{${C2}}{${vec(Y[1])}} = ${vec(ymix)}`,
        ]);
      }
      draw();
      api.onResize(draw);
    },
  });

  /* ======================= 3.10 masking ======================= */
  K.demo({
    id: 'masking', sec: '3.10', title: 'Time masking', page: 18, y: 0.17,
    hint: 'Press New random mask, or raise p.',
    build(api) {
      const T = 60, D = 24;
      const r0 = K.rng(5);
      const feat = [];
      for (let t = 0; t < T; t++) for (let d = 0; d < D; d++) feat.push(K.clamp(0.5 + 0.28 * Math.sin(0.23 * t + 0.55 * d) * Math.cos(0.07 * t * (1 + d / 12)) + 0.12 * K.randn(r0), 0, 1));
      let p = 0.2, seed = 3, band = false;
      const F = K.fig(api.fig, { h: 250, label: 'Feature sequence with a masked block' });
      K.slider(api.ctl, { label: 'Share hidden p', min: 0, max: 0.5, step: 0.01, value: p, fmt: (v) => K.pct(v, 0), onInput: (v) => { p = v; draw(); } });
      K.btn(api.ctl, 'New random mask', () => { seed++; draw(); }, 'ghost');
      K.check(api.ctl, { label: 'Also hide a feature band (SpecAugment does both)', value: band, onChange: (v) => { band = v; draw(); } });
      function draw() {
        F.size().clear();
        const W = F.W, m = { l: 44, r: 12, t: 22 };
        const r = K.rng(seed * 131);
        const len = Math.floor(p * T);
        const t0 = Math.floor(r() * (T - len + 1));
        const d0 = Math.floor(r() * (D - 4));
        const cw = (W - m.l - m.r) / T, chh = 7;
        const url = K.raster(T, D, (dd, w, hh) => {
          for (let t = 0; t < w; t++) for (let d = 0; d < hh; d++) {
            const masked = (t >= t0 && t < t0 + len) || (band && d >= d0 && d < d0 + 4);
            const c = masked ? K.rgb(K.css('--panel') || '#ffffff') : K.heat(feat[t * D + d]).rgb;
            const o = ((hh - 1 - d) * w + t) * 4;
            dd[o] = c[0]; dd[o + 1] = c[1]; dd[o + 2] = c[2]; dd[o + 3] = 255;
          }
        });
        F.add(K.label(m.l, m.t - 8, 'Features over time (one column per 20 ms step)', 'lbl-b'));
        F.add(s('image', { href: url, x: m.l, y: m.t, width: W - m.l - m.r, height: D * chh, preserveAspectRatio: 'none', class: 'pix' }));
        if (len > 0) F.add(s('rect', { x: m.l + t0 * cw, y: m.t, width: len * cw, height: D * chh, class: 'f-hatch s-t1', 'stroke-width': 1.5 }));
        if (band) F.add(s('rect', { x: m.l, y: m.t + (D - d0 - 4) * chh, width: W - m.l - m.r, height: 4 * chh, class: 'f-hatch s-t3', 'stroke-width': 1.5 }));
        F.add(K.label(m.l - 8, m.t + 10, 'dim', 'tick', 'end'));
        const sy = m.t + D * chh + 22;
        F.add(K.label(m.l - 8, sy + 10, 'kept', 'tick', 'end'));
        for (let t = 0; t < T; t++) {
          const on = !(t >= t0 && t < t0 + len);
          F.add(s('rect', { x: m.l + t * cw + 0.5, y: sy, width: Math.max(1, cw - 1), height: 12, rx: 1.5, class: on ? 'f-ink2' : 'f-none s-t1' }));
        }
        F.add(K.label(m.l, sy + 30, 't = 0', 'tick'));
        F.add(K.label(W - m.r, sy + 30, 't = ' + (T - 1), 'tick', 'end'));
        const M = String.raw`\class{tt1}{${len}}`;
        const lines = [len > 0
          ? String.raw`\class{tt1}{m} = \lfloor p\,T \rfloor = \lfloor ${K.f(p, 2)} \times ${T} \rfloor = ${M} \qquad \tilde x_t = \mathbf{0}\ \text{ for } \class{tt1}{${t0} \le t < ${t0 + len}}`
          : String.raw`\class{tt1}{m} = \lfloor ${K.f(p, 2)} \times ${T} \rfloor = 0:\ \text{nothing hidden}`];
        if (band) lines.push(String.raw`\tilde x_{t,d} = 0\ \text{ for features } \class{tt3}{${d0} \le d < ${d0 + 4}}`);
        api.eq.set(lines);
      }
      draw();
      api.onResize(draw);
    },
  });

  /* ======================= 3.11 normalize and pad ======================= */
  K.demo({
    id: 'padding', sec: '3.11', title: 'Normalize, pad, mask', page: 18, y: 0.414,
    hint: 'Make one clip 4 s long.',
    build(api) {
      const L = [2.1, 3.4, 2.8];
      const SR = 2000;
      const sig = [110, 180, 140].map((f, k) => K.voice(SR, 4, { f0: (t) => f * (1 + 0.1 * Math.sin(2 * Math.PI * (0.6 + k * 0.2) * t)), env: K.syll([[0.35, 0.22], [0.95, 0.25], [1.6, 0.22], [2.25, 0.3], [2.95, 0.25], [3.6, 0.22]]), harmonics: 6 }));
      const F = K.fig(api.fig, { h: 280, label: 'Three clips padded to the same length, with their masks' });
      L.forEach((v, i) => K.slider(api.ctl, { label: 'Clip ' + (i + 1), min: 0.8, max: 4, step: 0.1, value: v, fmt: (x) => K.f(x, 1) + ' s', onInput: (x) => { L[i] = x; draw(); } }));
      function draw() {
        F.size().clear();
        const W = F.W, m = { l: 56, r: 12, t: 16 };
        const Lmax = Math.max(...L);
        const x = K.scale(0, Lmax, m.l, W - m.r);
        L.forEach((len, k) => {
          const y0 = m.t + k * 82;
          const y = K.scale(-3.2, 3.2, y0 + 44, y0);
          const n = Math.round(len * SR);
          const cut = sig[k].slice(0, n);
          const [mu, sd] = stdOf(cut);
          const z = cut.map((q) => (q - mu) / (sd || 1));
          F.add(K.label(m.l - 10, y0 + 26, 'clip ' + (k + 1), 'lbl', 'end'));
          F.add(s('path', { d: K.envPath(z, SR, x, y, 0, len), class: 'f-ink2' }));
          if (len < Lmax - 1e-9) {
            F.add(s('rect', { x: x(len), y: y0 + 4, width: x(Lmax) - x(len), height: 36, class: 'f-hatch s-line', rx: 3 }));
            if (x(Lmax) - x(len) > 64) F.add(K.label((x(len) + x(Lmax)) / 2, y0 + 26, '0 0 0 …', 'tick mono', 'middle'));
          }
          const my = y0 + 52;
          F.add(s('rect', { x: x(0), y: my, width: x(len) - x(0) - 1, height: 12, rx: 3, class: 'f-t1' }));
          if (len < Lmax - 1e-9) F.add(s('rect', { x: x(len) + 1, y: my + 0.75, width: x(Lmax) - x(len) - 1.5, height: 10.5, rx: 3, class: 'f-none s-t1', 'stroke-width': 1.5 }));
          F.add(K.label(m.l - 10, my + 10, 'mask', 'tick', 'end'));
        });
        const ax = m.t + 3 * 82 - 4;
        for (const t of K.ticks(0, Lmax, 4)) F.add(K.label(x(t), ax, t + ' s', 'tick', 'middle'));
        const Ls = L.map((q) => Math.round(q * 16000)), Lm = Math.max(...Ls);
        const pad = 1 - Ls.reduce((a, b) => a + b, 0) / (3 * Lm);
        api.eq.set([
          String.raw`\tilde w[i] = \frac{w[i] - \mu_w}{\sigma_w}, \qquad \class{tt1}{m[i]} = \begin{cases} 1 & i < L \\ 0 & \text{padding} \end{cases}`,
          String.raw`\text{batch } [3 \times ${K.tn(Lm)}]: \quad \textstyle\sum_i \class{tt1}{m[i]} = ${Ls.map((q) => K.tn(q)).join(',\\ ')} \quad (${K.f(pad * 100, 0)}\%\ \text{padding})`,
        ]);
      }
      draw();
      api.onResize(draw);
    },
  });
})();
