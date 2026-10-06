/* demos-results.js: chapter 4 (results), plus the start panel. */
(function () {
  'use strict';
  const s = K.s, h = K.h;
  const setH = (F, need) => { if (F.H !== need) { F.H = need; F.svg.setAttribute('height', need); F.svg.setAttribute('viewBox', '0 0 ' + F.W + ' ' + need); } };

  /* numbers reported in the thesis */
  const SPLITS = [['train', [2648, 2654, 2955]], ['validation', [331, 332, 369]], ['test', [331, 332, 370]]];
  const NTEST = [331, 332, 370];
  const CM = [[0.8, 0.06, 0.14], [0.28, 0.47, 0.25], [0.2, 0.07, 0.73]];
  const AUC = [0.86, 0.81, 0.85], AP = [0.65, 0.71, 0.74];
  /* two-Gaussian score model per class (negatives ~ N(0,1), positives ~ N(mu, sd^2)),
     fitted so that AUC and AP both match the values reported in 4.5 and 4.6 */
  const FIT = [{ mu: 1.2489, sd: 0.58 }, { mu: 1.3512, sd: 1.17 }, { mu: 1.3603, sd: 0.85 }];
  const shortName = (c) => (c === 2 ? 'auth.' : K.CLS[c].name);

  /* ======================= overview panel ======================= */
  K.demo({
    id: 'overview', sec: '', title: 'Start here', page: 1, y: 0.02, also: [[25, 0.477]],
    build(api) {
      const steps = [
        ['Audio and labels', [['sampling', '3.1 Sampling'], ['labels', '3.2 Emotions → styles'], ['weights', '3.3 Class weights']]],
        ['Augmentation (training only)', [['timestretch', '3.5 Time stretch'], ['stft', '3.6 STFT'], ['pitchshift', '3.6 Pitch shift'], ['noise', '3.7 Noise'], ['volume', '3.8 Volume'], ['mixup', '3.9 Mixup'], ['masking', '3.10 Masking']]],
        ['Into the model', [['padding', '3.11 Normalize and pad'], ['wav2vec2', '3.12 Wav2Vec2'], ['attention', '3.13 Attention'], ['pooling', '3.13 Pool → softmax']]],
        ['Learning', [['lora', '3.14 LoRA'], ['kl', '3.15 KL loss'], ['schedule', '3.16 Schedule']]],
        ['Feedback and evaluation', [['confidence', '3.17 Score'], ['classdist', '4.1 Splits'], ['uar', '4.3 UAR'], ['confusion', '4.4 Confusion'], ['roc', '4.5 ROC'], ['pr', '4.6 Precision–recall'], ['appsim', '4.8 In the app']]],
      ];
      const wrap = h('div', { class: 'panel' });
      wrap.append(h('p', { class: 'howto' }, 'Scroll the thesis and the figure follows the passage you are reading. Point at a coloured symbol to find it in the picture.'));
      wrap.append(h('h3', null, 'The pipeline, from waveform to feedback'));
      const pipe = h('div', { class: 'pipe' });
      steps.forEach(([label, chips], i) => {
        const row = h('div', { class: 'pipe-step' }, h('p', { class: 'pipe-label' }, label));
        const box = h('div', { class: 'chips' });
        chips.forEach(([id, text]) => box.append(K.chip(id, text)));
        row.append(box);
        pipe.append(row);
        if (i < steps.length - 1) pipe.append(h('div', { class: 'pipe-arrow', 'aria-hidden': 'true' }, '↓'));
      });
      wrap.append(pipe);
      wrap.append(h('p', { class: 'howto', style: { marginTop: '18px' } }, 'The app it was written for: ', h('a', { href: '../Blop.dc.html' }, 'VoiceMaster'), '.'));
      api.fig.append(wrap);
    },
  });

  /* ======================= 4.1 class distribution ======================= */
  K.demo({
    id: 'classdist', sec: '4.1', title: 'Class distribution per split', page: 27, y: 0.17,
    hint: 'Switch to counts.',
    build(api) {
      let mode = 'share';
      const F = K.fig(api.fig, { h: 200, label: 'Class mix in each split' });
      K.seg(api.ctl, { label: 'Show', value: mode, options: [['share', 'Shares'], ['count', 'Counts']], onChange: (v) => { mode = v; draw(); } });
      K.legend(api.ctl, [['--calm', 'calm'], ['--excited', 'excited'], ['--auth', 'authoritative']]);
      const TC = ['tcalm', 'texc', 'tauth'];
      function draw() {
        F.size().clear();
        const W = F.W, m = { l: 86, r: 70, t: 18 };
        const maxN = 8257;
        SPLITS.forEach(([name, n], k) => {
          const tot = n[0] + n[1] + n[2];
          const y0 = m.t + k * 58;
          const full = W - m.l - m.r;
          const len = mode === 'share' ? full : Math.max(40, (full * tot) / maxN);
          F.add(K.label(m.l - 10, y0 + 19, name, 'lbl', 'end'));
          let acc = m.l;
          n.forEach((v, c) => {
            const wpx = (len * v) / tot;
            const r = s('rect', { x: acc, y: y0, width: Math.max(1, wpx - 2), height: 28, rx: 4, class: 'f-' + K.CLS[c].key });
            K.hover(r, () => [[K.n(v) + ' clips', ' ' + K.CLS[c].name + ' in ' + name], [K.pct(v / tot, 1), ' of the split']]);
            F.add(r);
            if (wpx > 62) F.add(K.label(acc + 7, y0 + 19, mode === 'share' ? K.pct(v / tot, 1) : K.n(v), 'lbl-on on-' + K.CLS[c].key));
            acc += wpx;
          });
          F.add(K.label(m.l + len + 8, y0 + 19, K.n(tot), 'lbl mono'));
        });
        setH(F, m.t + 3 * 58);
        const tot = SPLITS.map((q) => q[1][0] + q[1][1] + q[1][2]);
        api.eq.set(mode === 'share'
          ? String.raw`p_c = \frac{n_c}{N}: \qquad ` + SPLITS[0][1].map((v, c) => String.raw`\frac{\class{${TC[c]}}{${K.tn(v)}}}{${K.tn(tot[0])}} = \class{${TC[c]}}{${K.f((100 * v) / tot[0], 1)}\%}`).join(String.raw`\qquad `)
          : String.raw`N_{\text{train}} : N_{\text{val}} : N_{\text{test}} = ${tot.map((v) => K.tn(v)).join(' : ')} \approx 8 : 1 : 1`);
      }
      draw();
      api.onResize(draw);
    },
  });

  /* ======================= 4.3 accuracy vs UAR ======================= */
  K.demo({
    id: 'uar', sec: '4.3', title: 'Accuracy vs UAR', page: 33, y: 0.586, also: [[23, 0.409]],
    hint: 'Shrink the excited share.',
    build(api) {
      const R = [0.8, 0.47, 0.73];
      let ex = 332 / 1033;
      const F = K.fig(api.fig, { h: (w) => (w < 520 ? 470 : 250), label: 'Recall bars with widths set by class share (accuracy) and equal widths (UAR)' });
      K.slider(api.ctl, { label: 'Excited share of test data', min: 0.05, max: 0.9, step: 0.01, value: ex, wide: true, fmt: (v) => K.pct(v, 0), onInput: (v) => { ex = v; draw(); } });
      K.btn(api.ctl, 'Thesis test mix', () => { ex = 332 / 1033; draw(); api.ctl.querySelector('input').value = ex; api.ctl.querySelector('output').textContent = K.pct(ex, 0); }, 'ghost');
      const TC = ['tcalm', 'texc', 'tauth'];
      const rc = (c) => String.raw`\class{${TC[c]}}{${K.f(R[c], 2)}}`;
      function panel(x0, y0, pw, ph, widths, title, val) {
        F.add(K.label(x0, y0 - 12, title, 'lbl-b'));
        const y = K.scale(0, 1, y0 + ph, y0);
        [0, 0.5, 1].forEach((t) => { F.add(s('line', { x1: x0, x2: x0 + pw, y1: y(t), y2: y(t), class: 'grid' })); F.add(K.label(x0 - 6, y(t) + 4, String(t), 'tick', 'end')); });
        let acc = x0;
        widths.forEach((wv, c) => {
          const wpx = pw * wv;
          const r = s('rect', { x: acc + 1, y: y(R[c]), width: Math.max(1, wpx - 2), height: y(0) - y(R[c]), rx: 3, class: 'f-' + K.CLS[c].key });
          K.hover(r, () => [['recall ' + K.f(R[c], 2), ' ' + K.CLS[c].name], ['width ' + K.pct(wv, 0), ' of the average']]);
          F.add(r);
          if (wpx > 44) F.add(K.label(acc + wpx / 2, y(0) + 15, shortName(c), 'tick', 'middle'));
          acc += wpx;
        });
        F.add(s('line', { x1: x0, x2: x0 + pw, y1: y(val), y2: y(val), class: 's-ink dash', 'stroke-width': 2 }));
        F.add(K.label(x0 + pw, y(val) - 7, K.f(val, 3), 'lbl-b', 'end'));
      }
      function draw() {
        F.size().clear();
        const W = F.W, narrow = W < 520;
        const rest = 1 - ex, sh = [rest * (331 / 701), ex, rest * (370 / 701)];
        const acc = sh.reduce((a, v, c) => a + v * R[c], 0), uar = (R[0] + R[1] + R[2]) / 3;
        const m = { l: 34, r: 14, t: 30 };
        const pw = narrow ? W - m.l - m.r : (W - m.l - m.r - 50) / 2, ph = narrow ? 160 : F.H - m.t - 36;
        panel(m.l, m.t, pw, ph, sh, 'Accuracy: widths = class shares', acc);
        panel(narrow ? m.l : m.l + pw + 50, narrow ? m.t + ph + 64 : m.t, pw, ph, [1 / 3, 1 / 3, 1 / 3], 'UAR: equal widths', uar);
        setH(F, narrow ? m.t + 2 * ph + 64 + 26 : F.H);
        /* the same three recalls, weighted by class share (accuracy) or equally (UAR) */
        api.eq.set([
          String.raw`\text{Accuracy} = \sum_c \tfrac{n_c}{n}\,\text{Recall}_c = ` + sh.map((v, c) => String.raw`${K.f(v, 2)} \cdot ${rc(c)}`).join(' + ') + String.raw` = ${K.f(acc, 3)}`,
          String.raw`\text{UAR} = \tfrac13 \sum_c \text{Recall}_c = \tfrac13(${rc(0)} + ${rc(1)} + ${rc(2)}) = ${K.f(uar, 3)}`,
        ]);
      }
      draw();
      api.onResize(draw);
    },
  });

  /* ======================= 4.4 confusion matrix ======================= */
  K.demo({
    id: 'confusion', sec: '4.4', title: 'Confusion matrix', page: 35, y: 0.562, also: [[37, 0.214]],
    hint: 'Switch views, and hover a cell.',
    build(api) {
      let view = 'rows';
      const F = K.fig(api.fig, { h: 330, label: 'Test confusion matrix' });
      K.seg(api.ctl, { label: 'View', value: view, options: [['rows', 'Rows (recall)'], ['counts', 'Counts (rebuilt)'], ['cols', 'Columns (precision)']], onChange: (v) => { view = v; draw(); } });
      const TC = ['tcalm', 'texc', 'tauth'];
      const C = CM.map((row, i) => row.map((v) => v * NTEST[i]));
      const colTot = [0, 1, 2].map((j) => C[0][j] + C[1][j] + C[2][j]);
      const prec = [0, 1, 2].map((j) => C[j][j] / colTot[j]);
      function draw() {
        F.size().clear();
        const W = F.W;
        const cell = Math.floor(Math.min(92, (W - 170) / 3.4));
        const gx = 118, gy = 58;
        F.add(K.label(gx + 1.5 * cell, 16, 'predicted style', 'alabel', 'middle'));
        F.add(K.label(8, gy - 8, 'true style', 'alabel'));
        for (let j = 0; j < 3; j++) {
          F.add(s('circle', { cx: gx + j * cell + cell / 2 - 28, cy: gy - 14, r: 4.5, class: 'f-' + K.CLS[j].key }));
          F.add(K.label(gx + j * cell + cell / 2 - 20, gy - 10, shortName(j), 'tick'));
        }
        for (let i = 0; i < 3; i++) {
          F.add(s('circle', { cx: 16, cy: gy + i * cell + cell / 2, r: 4.5, class: 'f-' + K.CLS[i].key }));
          F.add(K.label(26, gy + i * cell + cell / 2 + 4, K.CLS[i].name, 'lbl'));
          for (let j = 0; j < 3; j++) {
            const v = view === 'rows' ? CM[i][j] : view === 'cols' ? C[i][j] / colTot[j] : C[i][j];
            const t = view === 'counts' ? v / 280 : v;
            const col = K.heat(t);
            const r = s('rect', { x: gx + j * cell + 1, y: gy + i * cell + 1, width: cell - 2, height: cell - 2, rx: 5, style: 'fill:' + col.fill });
            K.hover(r, () => [
              [K.f(CM[i][j], 2), '  P(predicted ' + K.CLS[j].name + ' | truly ' + K.CLS[i].name + ')'],
              ['≈ ' + K.n(C[i][j]) + ' clips', ' of ' + NTEST[i] + ' truly ' + K.CLS[i].name],
              [K.f(C[i][j] / colTot[j], 2), '  share of all “' + K.CLS[j].name + '” verdicts'],
            ]);
            F.add(r);
            F.add(s('text', { x: gx + j * cell + cell / 2, y: gy + i * cell + cell / 2 + 5, 'text-anchor': 'middle', class: 'cellt big', style: 'fill:' + col.text, text: view === 'counts' ? K.n(v) : K.f(v, 2) }));
          }
          if (view === 'counts') F.add(K.label(gx + 3 * cell + 10, gy + i * cell + cell / 2 + 4, '= ' + NTEST[i], 'tick mono'));
        }
        const hi = s('g');
        for (let k = 0; k < 3; k++) hi.append(s('rect', { x: gx + k * cell + 1, y: gy + k * cell + 1, width: cell - 2, height: cell - 2, rx: 5, class: 'f-none s-ink', 'stroke-width': 2 }));
        F.add(hi);
        if (view === 'counts') for (let j = 0; j < 3; j++) F.add(K.label(gx + j * cell + cell / 2, gy + 3 * cell + 18, 'Σ ' + K.n(colTot[j]), 'tick mono', 'middle'));
        setH(F, gy + 3 * cell + (view === 'counts' ? 30 : 12));
        /* what the diagonal means in the current view */
        const diag = (f) => [0, 1, 2].map((k) => String.raw`\class{${TC[k]}}{${f(k)}}`).join(',\\ ');
        api.eq.set(view === 'rows'
          ? String.raw`\text{Recall}_i = P(\hat y = i \mid y = i) = (${diag((k) => K.f(CM[k][k], 2))}) \qquad \text{UAR} = ${K.f((CM[0][0] + CM[1][1] + CM[2][2]) / 3, 3)}`
          : view === 'counts'
            ? String.raw`\text{count}(i,i) \approx n_i \cdot \text{Recall}_i = (${diag((k) => NTEST[k] + String.raw` \times ${K.f(CM[k][k], 2)} = ${K.n(C[k][k])}`)}) \qquad \text{Accuracy} = \tfrac{${K.n(C[0][0] + C[1][1] + C[2][2])}}{1{,}033} = ${K.f((C[0][0] + C[1][1] + C[2][2]) / 1033, 3)}`
            : String.raw`\text{Precision}_j = \frac{\text{count}(j,j)}{\sum_i \text{count}(i,j)} = (${diag((k) => K.f(prec[k], 2))})`);
      }
      draw();
      api.onResize(draw);
    },
  });

  /* ======================= shared score-model helpers ======================= */
  const tpr = (c, t) => 1 - K.Phi((t - FIT[c].mu) / FIT[c].sd);
  const fpr = (t) => 1 - K.Phi(t);
  function curvePts(c) { const out = []; for (let i = 0; i <= 240; i++) { const t = 6 - (12 * i) / 240; out.push([fpr(t), tpr(c, t), t]); } return out; }
  function apOf(c, pi) {
    let ap = 0, prevR = 0;
    for (let i = 0; i <= 1600; i++) {
      const t = 8 - (16 * i) / 1600, R = tpr(c, t), Fp = fpr(t);
      const den = pi * R + (1 - pi) * Fp;
      ap += (R - prevR) * (den > 1e-12 ? (pi * R) / den : 1);
      prevR = R;
    }
    return ap;
  }

  /* ======================= 4.5 ROC ======================= */
  K.demo({
    id: 'roc', sec: '4.5', title: 'ROC curves and thresholds', page: 38, y: 0.567, also: [[40, 0.175]],
    hint: 'Drag the threshold from one end to the other.',
    build(api) {
      let c = 0, th = 1.0, others = true;
      const F = K.fig(api.fig, { h: (w) => (w < 560 ? 560 : 300), label: 'Score distributions with a threshold, and the ROC curve' });
      K.seg(api.ctl, { label: 'Class', value: c, options: [[0, 'calm'], [1, 'excited'], [2, 'authoritative']], onChange: (v) => { c = v; draw(); } });
      K.slider(api.ctl, { label: 'Threshold θ', min: -2.5, max: 4.5, step: 0.01, value: th, wide: true, fmt: (v) => K.f(v, 2), onInput: (v) => { th = v; draw(); } });
      K.check(api.ctl, { label: 'Show the other classes', value: others, onChange: (v) => { others = v; draw(); } });
      const TC = ['tcalm', 'texc', 'tauth'];
      function draw() {
        F.size().clear();
        const W = F.W, narrow = W < 560;
        const m = { l: 40, r: 14, t: 30 };
        const pw = narrow ? W - m.l - m.r : (W - m.l - m.r - 50) * 0.55, ph = narrow ? 170 : F.H - m.t - 40;
        const key = K.CLS[c].key;
        /* densities */
        const x = K.scale(-3.2, 5, m.l, m.l + pw), y = K.scale(0, 0.75, m.t + ph, m.t);
        F.add(K.label(m.l, m.t - 12, 'Model score for “' + K.CLS[c].name + '”', 'lbl-b'));
        K.axes(F.svg, { x, y, xt: [-2, 0, 2, 4], yt: [], fx: String, grid: false });
        const neg = [], pos = [];
        for (let i = 0; i <= 200; i++) { const v = -3.2 + (8.2 * i) / 200; neg.push([v, K.npdf(v)]); pos.push([v, K.npdf(v, FIT[c].mu, FIT[c].sd)]); }
        const area = (arr, cls, from) => {
          const pts = arr.filter((p) => p[0] >= from);
          if (pts.length < 2) return;
          F.add(s('path', { d: K.path([[x(pts[0][0]), y(0)]].concat(pts.map((p) => [x(p[0]), y(p[1])]), [[x(pts[pts.length - 1][0]), y(0)]])) + 'Z', class: cls }));
        };
        area(neg, 'f-muted wash', -9);
        area(pos, 'f-' + key + ' wash', -9);
        area(neg, 'f-hatch', th);
        area(pos, 'f-' + key + ' soft', th);
        F.add(s('path', { d: K.path(neg.map((p) => [x(p[0]), y(p[1])])), class: 'ln s-muted', 'stroke-width': 2 }));
        F.add(s('path', { d: K.path(pos.map((p) => [x(p[0]), y(p[1])])), class: 'ln s-' + key, 'stroke-width': 2 }));
        F.add(s('line', { x1: x(th), x2: x(th), y1: m.t, y2: m.t + ph, class: 's-ink', 'stroke-width': 2 }));
        F.add(K.label(x(th) + 5, y(0) - 6, 'threshold', 'tick'));
        F.add(K.label(x(-3), y(0.42), 'not ' + K.CLS[c].name, 'tick'));
        F.add(K.label(x(FIT[c].mu), y(K.npdf(0, 0, FIT[c].sd)) - 8, K.CLS[c].name, 'lbl-b', 'middle'));
        /* ROC */
        const rx0 = narrow ? m.l : m.l + pw + 50, ry0 = narrow ? m.t + ph + 66 : m.t;
        const side = narrow ? Math.min(W - m.l - m.r, 260) : Math.min(W - m.r - rx0, ph);
        const rx = K.scale(0, 1, rx0, rx0 + side), ry = K.scale(0, 1, ry0 + side, ry0);
        F.add(K.label(rx0, ry0 - 12, 'ROC curve (TPR against FPR)', 'lbl-b'));
        K.axes(F.svg, { x: rx, y: ry, xt: [0, 0.5, 1], yt: [0, 0.5, 1], fx: String, fy: String, xl: 'FPR', yAxis: true });
        F.add(s('line', { x1: rx(0), y1: ry(0), x2: rx(1), y2: ry(1), class: 's-muted dash', 'stroke-width': 1 }));
        if (others) for (let k = 0; k < 3; k++) if (k !== c) F.add(s('path', { d: K.path(curvePts(k).map((p) => [rx(p[0]), ry(p[1])])), class: 'ln s-' + K.CLS[k].key, 'stroke-width': 1.25, opacity: 0.45 }));
        const pts = curvePts(c);
        F.add(s('path', { d: K.path([[rx(0), ry(0)]].concat(pts.map((p) => [rx(p[0]), ry(p[1])]), [[rx(1), ry(0)]])) + 'Z', class: 'f-' + key + ' wash' }));
        F.add(s('path', { d: K.path(pts.map((p) => [rx(p[0]), ry(p[1])])), class: 'ln s-' + key, 'stroke-width': 2.5 }));
        const T = tpr(c, th), Fp = fpr(th);
        F.add(s('circle', { cx: rx(Fp), cy: ry(T), r: 6, class: 'f-ink ring' }));
        F.add(K.label(rx(1), ry(0) - 8, 'AUC = ' + K.f(AUC[c], 2), 'lbl-b', 'end'));
        setH(F, narrow ? ry0 + side + 36 : Math.max(m.t + ph + 30, ry0 + side + 36));
        /* the threshold turns the two bells into one point on the curve */
        const SP = String.raw`\class{${TC[c]}}{s_+}`;
        api.eq.set([
          String.raw`\theta = ${K.f(th, 2)}: \quad \text{TPR} = P(${SP} > \theta) = \class{${TC[c]}}{${K.f(T, 2)}} \qquad \text{FPR} = P(s_- > \theta) = ${K.f(Fp, 2)}`,
          String.raw`\text{AUC} = \int_0^1 \text{TPR}\; d\,\text{FPR} = P(${SP} > s_-) = \class{${TC[c]}}{${K.f(AUC[c], 2)}}`,
        ]);
      }
      draw();
      api.onResize(draw);
    },
    source: 'Curves rebuilt from the reported AUC and AP with a two-bell-curve score model, so they match those numbers, not every step of the plots in the thesis.',
  });

  /* ======================= 4.6 precision-recall ======================= */
  K.demo({
    id: 'pr', sec: '4.6', title: 'Precision and recall', page: 40, y: 0.523, also: [[41, 0.54]],
    hint: 'Set the class share to 10%, then raise the threshold.',
    build(api) {
      let c = 2, th = 1.2, prev = 'test';
      const F = K.fig(api.fig, { h: (w) => (w < 560 ? 540 : 290), label: 'Precision-recall curve and precision and recall against the threshold' });
      K.seg(api.ctl, { label: 'Class', value: c, options: [[0, 'calm'], [1, 'excited'], [2, 'authoritative']], onChange: (v) => { c = v; draw(); } });
      K.slider(api.ctl, { label: 'Threshold', min: -2, max: 4.5, step: 0.01, value: th, fmt: (v) => K.f(v, 2), onInput: (v) => { th = v; draw(); } });
      K.seg(api.ctl, { label: 'Class share π', value: prev, options: [['test', 'as in the test set'], ['0.5', '50%'], ['0.1', '10%']], onChange: (v) => { prev = v; draw(); } });
      function draw() {
        F.size().clear();
        const W = F.W, narrow = W < 560;
        const pi = prev === 'test' ? NTEST[c] / 1033 : +prev;
        const key = K.CLS[c].key;
        const m = { l: 40, r: 14, t: 30 };
        const side = narrow ? Math.min(W - m.l - m.r, 260) : Math.min((W - m.l - m.r - 50) * 0.45, F.H - m.t - 40);
        const x = K.scale(0, 1, m.l, m.l + side), y = K.scale(0, 1, m.t + side, m.t);
        F.add(K.label(m.l, m.t - 12, 'Precision (up) against recall', 'lbl-b'));
        K.axes(F.svg, { x, y, xt: [0, 0.5, 1], yt: [0, 0.5, 1], fx: String, fy: String, xl: 'recall', yAxis: true });
        F.add(s('line', { x1: x(0), x2: x(1), y1: y(pi), y2: y(pi), class: 's-muted dash', 'stroke-width': 1.25 }));
        F.add(K.label(x(1), y(pi) - 6, 'baseline ' + K.f(pi, 2), 'tick', 'end'));
        const pts = [];
        for (let i = 0; i <= 300; i++) {
          const t = 5 - (8 * i) / 300, R = tpr(c, t), Fp = fpr(t), den = pi * R + (1 - pi) * Fp;
          pts.push([R, den > 1e-12 ? (pi * R) / den : 1]);
        }
        F.add(s('path', { d: K.path([[x(0), y(0)]].concat(pts.map((p) => [x(p[0]), y(p[1])]), [[x(1), y(0)]])) + 'Z', class: 'f-' + key + ' wash' }));
        F.add(s('path', { d: K.path(pts.map((p) => [x(p[0]), y(p[1])])), class: 'ln s-' + key, 'stroke-width': 2.5 }));
        const R = tpr(c, th), Fp = fpr(th), den = pi * R + (1 - pi) * Fp, P = den > 1e-12 ? (pi * R) / den : 1;
        F.add(s('circle', { cx: x(R), cy: y(P), r: 6, class: 'f-ink ring' }));
        /* precision and recall against threshold */
        const tx0 = narrow ? m.l : m.l + side + 50, ty0 = narrow ? m.t + side + 70 : m.t;
        const tw = narrow ? W - m.l - m.r : W - m.r - tx0, tph = narrow ? 170 : side;
        const xt = K.scale(-2, 4.5, tx0, tx0 + tw), yt = K.scale(0, 1, ty0 + tph, ty0);
        F.add(K.label(tx0, ty0 - 12, 'As the threshold rises', 'lbl-b'));
        K.axes(F.svg, { x: xt, y: yt, xt: [-2, 0, 2, 4], yt: [0, 0.5, 1], fx: String, fy: String, xl: 'threshold' });
        const pl = [], rl = [];
        for (let i = 0; i <= 200; i++) {
          const t = -2 + (6.5 * i) / 200, R2 = tpr(c, t), F2 = fpr(t), d2 = pi * R2 + (1 - pi) * F2;
          pl.push([xt(t), yt(d2 > 1e-12 ? (pi * R2) / d2 : 1)]); rl.push([xt(t), yt(R2)]);
        }
        F.add(s('path', { d: K.path(pl), class: 'ln s-t1', 'stroke-width': 2 }));
        F.add(s('path', { d: K.path(rl), class: 'ln s-t2', 'stroke-width': 2 }));
        F.add(K.label(tx0 + tw, yt(0.97), 'precision', 'tick', 'end'));
        F.add(K.label(tx0 + 4, yt(0.93), 'recall', 'tick'));
        F.add(s('line', { x1: xt(th), x2: xt(th), y1: ty0, y2: ty0 + tph, class: 's-ink', 'stroke-width': 1.5 }));
        setH(F, narrow ? ty0 + tph + 36 : Math.max(F.H, m.t + side + 40));
        /* precision with the current share and threshold plugged in */
        const PI = K.f(pi, 2), R2 = K.f(R, 2);
        api.eq.set([
          String.raw`\class{tt1}{\text{Precision}} = \frac{\pi\,\text{TPR}}{\pi\,\text{TPR} + (1 - \pi)\,\text{FPR}} = \frac{${PI} \cdot ${R2}}{${PI} \cdot ${R2} + ${K.f(1 - pi, 2)} \cdot ${K.f(Fp, 2)}} = \class{tt1}{${K.f(P, 2)}}`,
          String.raw`\class{tt2}{\text{Recall}} = \text{TPR} = \class{tt2}{${R2}} \qquad \text{AP} = \int_0^1 \text{Precision}\; d\,\text{Recall} = ${K.f(apOf(c, pi), 2)}`,
        ]);
      }
      draw();
      api.onResize(draw);
    },
    source: 'Same score model as 4.5.',
  });

  /* ======================= 4.8 in the app ======================= */
  K.demo({
    id: 'appsim', sec: '4.8', title: 'What a user would hear', page: 45, y: 0.499,
    hint: 'Switch speakers.',
    build(api) {
      let who = 1;
      const F = K.fig(api.fig, { h: 280, label: '100 practice attempts coloured by what the app says' });
      K.seg(api.ctl, { label: 'The speaker really sounds', value: who, options: [[0, 'calm'], [1, 'excited'], [2, 'authoritative']], onChange: (v) => { who = v; draw(); } });
      K.legend(api.ctl, [['--calm', 'app says calm'], ['--excited', 'app says excited'], ['--auth', 'app says authoritative']]);
      const TC = ['tcalm', 'texc', 'tauth'];
      function draw() {
        F.size().clear();
        const W = F.W;
        const counts = CM[who].map((v) => Math.round(v * 100));
        const cell = Math.floor(Math.min(24, (W - 40) / 10));
        const gx = Math.max(12, (W - cell * 10) / 2), gy = 20;
        const seq = [];
        const ord = [who].concat([0, 1, 2].filter((k) => k !== who));
        ord.forEach((k) => { for (let q = 0; q < counts[k]; q++) seq.push(k); });
        seq.forEach((k, i) => {
          const col = i % 10, row = Math.floor(i / 10);
          F.add(s('rect', { x: gx + col * cell + 1, y: gy + row * cell + 1, width: cell - 3, height: cell - 3, rx: 3, class: 'f-' + K.CLS[k].key + (k === who ? '' : ' soft') }));
        });
        setH(F, gy + cell * 10 + 12);
        /* one row of the confusion matrix, as 100 attempts */
        api.eq.set(String.raw`100 \times P(\hat y \mid y = \class{${TC[who]}}{\text{${K.CLS[who].name}}}) = (${counts.map((v, k) => String.raw`\class{${TC[k]}}{${k === who ? String.raw`\underline{${v}}` : v}}`).join(',\\ ')})`);
      }
      draw();
      api.onResize(draw);
    },
  });

})();
