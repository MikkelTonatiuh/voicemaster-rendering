/* demos-model.js: chapter 3, the model, the loss and the training setup (3.12 to 3.17). */
(function () {
  'use strict';
  const s = K.s;
  const setH = (F, need) => { if (F.H !== need) { F.H = need; F.svg.setAttribute('height', need); F.svg.setAttribute('viewBox', '0 0 ' + F.W + ' ' + need); } };

  /* ======================= 3.12 wav2vec2 shapes ======================= */
  K.demo({
    id: 'wav2vec2', sec: '3.12', title: 'Wav2Vec2 shapes', page: 18, y: 0.709,
    hint: 'Change the clip length.',
    build(api) {
      const KS = [10, 3, 3, 3, 3, 2, 2], ST = [5, 2, 2, 2, 2, 2, 2];
      let dur = 3, B = 8, big = 0;
      const F = K.fig(api.fig, { h: 400, label: 'Sequence length through the convolution stack, frame timing, and the output tensor' });
      K.slider(api.ctl, { label: 'Clip length', min: 0.5, max: 6, step: 0.1, value: dur, fmt: (v) => K.f(v, 1) + ' s', onInput: (v) => { dur = v; draw(); } });
      K.slider(api.ctl, { label: 'Batch size B', min: 1, max: 16, step: 1, value: B, fmt: (v) => String(v), onInput: (v) => { B = v; draw(); } });
      K.seg(api.ctl, { label: 'Model', value: big, options: [[0, 'base'], [1, 'large']], onChange: (v) => { big = v; draw(); } });
      const lengths = (L) => { const out = [L]; for (let i = 0; i < 7; i++) { L = Math.floor((L - KS[i]) / ST[i]) + 1; out.push(L); } return out; };
      function draw() {
        F.size().clear();
        const W = F.W, narrow = W < 540;
        const m = { l: 10, r: 12, t: 24 };
        const Ls = lengths(Math.round(dur * 16000)), T = Ls[7], D = big ? 1024 : 768, layers = big ? 24 : 12;
        /* A: lengths per layer, log scale */
        const labW = narrow ? 118 : 150;
        const bx = K.scale(1, 5, m.l + labW, W - m.r - 58);
        F.add(K.label(m.l, m.t - 8, 'Length after each convolution (log scale)', 'lbl-b'));
        Ls.forEach((L, i) => {
          const y = m.t + 8 + i * 21;
          const lab = i === 0 ? 'waveform' : 'conv ' + i + '  k' + KS[i - 1] + ' s' + ST[i - 1];
          F.add(K.label(m.l + labW - 10, y + 10, lab, 'tick mono', 'end'));
          F.add(s('rect', { x: bx(1), y, width: Math.max(2, bx(Math.log10(Math.max(10, L))) - bx(1)), height: 13, rx: 3, class: i === 0 ? 'f-muted' : i === 7 ? 'f-t1' : 'f-t1 soft' }));
          F.add(K.label(bx(Math.log10(Math.max(10, L))) + 6, y + 10, K.n(L), i === 7 ? 'lbl-b mono' : 'tick mono'));
        });
        /* B: frame timing in the first 100 ms */
        const by = m.t + 8 + 8 * 21 + 30;
        const tw = narrow ? W - m.l - m.r : (W - m.l - m.r) * 0.55;
        const tx = K.scale(0, 100, m.l + 8, m.l + tw);
        F.add(K.label(m.l, by - 10, 'First 100 ms: a new vector every 20 ms, each seeing 25 ms', 'lbl-b'));
        F.add(s('line', { x1: tx(0), x2: tx(100), y1: by + 64, y2: by + 64, class: 'axis' }));
        for (let k = 0; k <= 4; k++) {
          const a = k * 20, b = a + 25, yy = by + 8 + (k % 2) * 22;
          F.add(s('rect', { x: tx(a), y: yy, width: tx(b) - tx(a) - 1, height: 16, rx: 3, class: 'f-t1 wash s-t1', 'stroke-width': 1.25 }));
          F.add(K.label((tx(a) + tx(b)) / 2, yy + 12, 'h' + String.fromCharCode(8321 + k), 'tick', 'middle'));
        }
        for (const t of [0, 20, 40, 60, 80, 100]) F.add(K.label(tx(t), by + 80, t + ' ms', 'tick', 'middle'));
        /* C: transformer and tensor */
        const cx0 = narrow ? m.l : m.l + tw + 34, cy0 = narrow ? by + 104 : by - 6;
        F.add(s('rect', { x: cx0, y: cy0, width: 150, height: 30, rx: 6, class: 'f-panel2 s-line' }));
        F.add(K.label(cx0 + 75, cy0 + 19, 'transformer ×' + layers, 'lbl', 'middle'));
        const bw = K.clamp(20 + T * 0.35, 30, narrow ? W - cx0 - 70 : W - cx0 - 70), bh = 34 + (big ? 10 : 0), dp = 4 + B * 1.4;
        const X0 = cx0, Y0 = cy0 + 50 + dp;
        F.add(s('path', { d: 'M' + X0 + ',' + Y0 + 'l' + dp + ',' + -dp + 'h' + bw + 'l' + -dp + ',' + dp + 'Z', class: 'f-t1 soft' }));
        F.add(s('path', { d: 'M' + (X0 + bw) + ',' + Y0 + 'l' + dp + ',' + -dp + 'v' + bh + 'l' + -dp + ',' + dp + 'Z', class: 'f-t1' }));
        F.add(s('rect', { x: X0, y: Y0, width: bw, height: bh, class: 'f-t1 wash s-t1', 'stroke-width': 1.25 }));
        F.add(K.label(X0 + bw / 2, Y0 + bh + 16, 'T = ' + T, 'lbl-b', 'middle'));
        F.add(K.label(X0 + bw + dp + 6, Y0 + bh / 2, 'D = ' + D, 'lbl-b'));
        F.add(K.label(X0 + bw + dp + 6, Y0 - dp / 2 + 2, 'B = ' + B, 'lbl-b'));
        setH(F, Math.max(narrow ? Y0 + bh + 26 : 0, by + 90));
        /* the seven convolutions together: a 400-sample window that moves 320 samples (20 ms) at a time */
        const TT = String.raw`\class{tt1}{${T}}`;
        api.eq.set([
          String.raw`\class{tt1}{T} = \left\lfloor \frac{L - 400}{320} \right\rfloor + 1 = \left\lfloor \frac{${K.tn(Ls[0])} - 400}{320} \right\rfloor + 1 = ${TT}`,
          String.raw`h \in \mathbb{R}^{B \times \class{tt1}{T} \times D} = \mathbb{R}^{${B} \times ${TT} \times ${D}}: \quad ${K.tn(B * T * D)}\ \text{numbers}`,
        ]);
      }
      draw();
      api.onResize(draw);
    },
  });

  /* ======================= 3.13 attention ======================= */
  K.demo({
    id: 'attention', sec: '3.13', title: 'Attention fusion', page: 19, y: 0.564, also: [[20, 0.175]],
    hint: 'Drag a state, or make the vectors longer.',
    build(api) {
      const PRE = {
        groups: [[1.3, 0.5], [1.0, 0.95], [1.55, 0.05], [-0.9, 1.1], [-1.35, 0.55], [-0.3, -1.35]],
        spread: [[1.4, 0.2], [0.5, 1.3], [-0.9, 1.0], [-1.4, -0.3], [-0.4, -1.3], [1.0, -1.0]],
        similar: [[1.0, 0.6], [1.1, 0.5], [0.9, 0.7], [1.05, 0.65], [0.95, 0.55], [1.1, 0.7]],
      };
      let P = PRE.groups.map((p) => p.slice()), sel = 0, c = 1, drag = -1, lay = null;
      const F = K.fig(api.fig, { h: (w) => (w < 540 ? 640 : 350), label: 'Hidden states you can drag, and the attention matrix' });
      K.seg(api.ctl, { label: 'Hidden states', value: 'groups', options: [['groups', 'Two groups'], ['spread', 'Spread out'], ['similar', 'All alike']], onChange: (v) => { P = PRE[v].map((p) => p.slice()); draw(); } });
      const selSeg = K.seg(api.ctl, { label: 'Step i', value: 0, options: [0, 1, 2, 3, 4, 5].map((i) => [i, String(i + 1)]), onChange: (v) => { sel = v; draw(); } });
      K.slider(api.ctl, { label: 'Vector length ×', min: 0.5, max: 3, step: 0.05, value: c, fmt: (v) => K.f(v, 2), onInput: (v) => { c = v; draw(); } });
      const sub = (i) => String.fromCharCode(8321 + i);
      function compute() {
        const e = P.map((a) => P.map((b) => c * c * (a[0] * b[0] + a[1] * b[1])));
        const al = e.map((row) => K.softmax(row));
        const ht = al.map((row) => [row.reduce((acc, w, j) => acc + w * P[j][0], 0), row.reduce((acc, w, j) => acc + w * P[j][1], 0)]);
        return { e, al, ht };
      }
      F.svg.addEventListener('pointerdown', (ev) => {
        const t = ev.target.closest('[data-j]');
        if (!t) return;
        ev.preventDefault();
        drag = +t.getAttribute('data-j');
        sel = drag;
        selSeg.set(sel);
        try { F.svg.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
        draw();
      });
      F.svg.addEventListener('pointermove', (ev) => {
        if (drag < 0 || !lay) return;
        const [px, py] = K.pt(F.svg, ev);
        P[drag] = [K.clamp(lay.x.inv(px), -2, 2), K.clamp(lay.y.inv(py), -2, 2)];
        draw();
      });
      const end = () => { drag = -1; };
      F.svg.addEventListener('pointerup', end);
      F.svg.addEventListener('pointercancel', end);
      function draw() {
        F.size().clear();
        const W = F.W, narrow = W < 540;
        const { e, al, ht } = compute();
        const m = { l: 14, r: 14, t: 26 };
        const side = narrow ? Math.min(W - m.l - m.r, 330) : Math.min(300, W * 0.44);
        const x = K.scale(-2, 2, m.l, m.l + side), y = K.scale(-2, 2, m.t + side, m.t);
        lay = { x, y };
        F.add(K.label(m.l, m.t - 10, 'Hidden states hᵢ (in 2-D; drag them)', 'lbl-b'));
        F.add(s('rect', { x: x(-2), y: y(2), width: side, height: side, class: 'f-panel2 s-line' }));
        F.add(s('line', { x1: x(0), x2: x(0), y1: y(-2), y2: y(2), class: 'grid' }));
        F.add(s('line', { x1: x(-2), x2: x(2), y1: y(0), y2: y(0), class: 'grid' }));
        const i = sel;
        P.forEach((p, j) => {
          if (j === i) return;
          const a = al[i][j];
          F.add(s('line', { x1: x(P[i][0]), y1: y(P[i][1]), x2: x(p[0]), y2: y(p[1]), class: 's-t1', 'stroke-width': (1 + 12 * a).toFixed(2), 'stroke-linecap': 'round', opacity: (0.18 + 0.8 * a).toFixed(2) }));
        });
        F.add(s('line', { x1: x(P[i][0]), y1: y(P[i][1]), x2: x(ht[i][0]), y2: y(ht[i][1]), class: 's-t3 dash', 'stroke-width': 1.5 }));
        F.add(s('circle', { cx: x(ht[i][0]), cy: y(ht[i][1]), r: 7, class: 'f-panel s-t3', 'stroke-width': 2.5 }));
        F.add(K.label(x(ht[i][0]) + 10, y(ht[i][1]) + 16, 'h̃' + sub(i), 'lbl-b'));
        P.forEach((p, j) => {
          const g = s('g', { 'data-j': j, class: 'drag' });
          g.append(s('circle', { cx: x(p[0]), cy: y(p[1]), r: 16, class: 'hit' }));
          g.append(s('circle', { cx: x(p[0]), cy: y(p[1]), r: 10, class: (j === i ? 'f-t1' : 'f-ink2') + ' ring' }));
          g.append(K.label(x(p[0]), y(p[1]) + 4, String(j + 1), 'lbl-on on-dark', 'middle'));
          F.add(g);
        });
        /* matrix */
        const mx0 = narrow ? m.l + 30 : m.l + side + 64, my0 = narrow ? m.t + side + 64 : m.t + 10;
        const cell = Math.floor(Math.min(narrow ? (W - mx0 - m.r) / 6 : (W - mx0 - m.r) / 6, 42));
        F.add(K.label(mx0 - 28, my0 - 18, 'Attention weights αᵢⱼ (rows sum to 1)', 'lbl-b'));
        for (let a = 0; a < 6; a++) {
          F.add(K.label(mx0 - 8, my0 + a * cell + cell / 2 + 4, 'i=' + (a + 1), 'tick', 'end'));
          F.add(K.label(mx0 + a * cell + cell / 2, my0 - 4, 'j=' + (a + 1), 'tick', 'middle'));
          for (let b2 = 0; b2 < 6; b2++) {
            const v = al[a][b2], col = K.heat(v);
            const r = s('rect', { x: mx0 + b2 * cell + 1, y: my0 + a * cell + 1, width: cell - 2, height: cell - 2, rx: 3, style: 'fill:' + col.fill, 'data-row': a });
            K.hover(r, () => [['α = ' + K.f(v, 3), ' step ' + (a + 1) + ' → step ' + (b2 + 1)], ['e = ' + K.f(e[a][b2], 2), ' dot-product score']]);
            r.addEventListener('click', () => { sel = a; selSeg.set(a); draw(); });
            F.add(r);
            if (cell >= 34) F.add(s('text', { x: mx0 + b2 * cell + cell / 2, y: my0 + a * cell + cell / 2 + 4, 'text-anchor': 'middle', class: 'cellt', style: 'fill:' + col.text, text: K.f(v, 2).replace(/^0/, '') }));
          }
        }
        F.add(s('rect', { x: mx0 - 1, y: my0 + i * cell - 1, width: cell * 6 + 2, height: cell + 2, rx: 4, class: 'f-none s-t1', 'stroke-width': 2.5 }));
        /* row bars */
        const ry0 = my0 + 6 * cell + 34, rh = 60;
        F.add(K.label(mx0 - 28, ry0 - 10, 'Row ' + (i + 1) + ': how much step ' + (i + 1) + ' listens to each step', 'lbl-b'));
        al[i].forEach((v, j) => {
          const bxp = mx0 + j * cell + cell * 0.2, bw = cell * 0.6;
          F.add(s('rect', { x: bxp, y: ry0 + rh * (1 - v), width: bw, height: Math.max(1, rh * v), rx: 3, class: 'f-t1' }));
          F.add(K.label(bxp + bw / 2, ry0 + rh + 14, String(j + 1), 'tick', 'middle'));
        });
        F.add(s('line', { x1: mx0, x2: mx0 + 6 * cell, y1: ry0 + rh, y2: ry0 + rh, class: 'axis' }));
        setH(F, Math.max(narrow ? 0 : m.t + side + 16, ry0 + rh + 24));
        /* row i of the softmax, live, and the weighted average it produces */
        const I = i + 1, row = al[i].map((v) => K.f(v, 2).replace(/^0/, '')).join(',\\ ');
        api.eq.set([
          String.raw`\class{tt1}{\alpha_{${I}j}} = \frac{\exp(\class{tt2}{h_${I} \cdot h_j})}{\sum_k \exp(\class{tt2}{h_${I} \cdot h_k})} = \class{tt1}{(${row})}`,
          String.raw`\class{tt3}{\tilde h_${I}} = \sum_j \class{tt1}{\alpha_{${I}j}}\, h_j = \class{tt3}{(${K.f(ht[i][0], 2)},\ ${K.f(ht[i][1], 2)})}`,
        ]);
      }
      draw();
      api.onResize(draw);
    },
  });

  /* ======================= 3.13 pooling ======================= */
  K.demo({
    id: 'pooling', sec: '3.13', title: 'Pooling to a prediction', page: 20, y: 0.52, also: [[21, 0.175]],
    hint: 'Raise the burst, then add the padded steps.',
    build(api) {
      const T0 = 6, D = 4;
      const Wm = [[0.9, 0.2, -0.3, 0.1, -0.4, -0.6, -0.2, 0.0], [-0.2, 0.3, 0.4, 0.0, 0.2, 0.9, 0.3, 0.1], [0.1, -0.1, 0.6, 0.5, 0.3, 0.1, 0.5, 0.4]];
      const bias = [0.1, -0.1, 0.0];
      let seed = 2, spike = 0, pad = false;
      const F = K.fig(api.fig, { h: (w) => (w < 560 ? 560 : 330), label: 'Fused states, their mean and max, the logits and the probabilities' });
      K.slider(api.ctl, { label: 'Burst at step 5, feature 2', min: 0, max: 3, step: 0.05, value: spike, fmt: (v) => '+' + K.f(v, 2), onInput: (v) => { spike = v; draw(); } });
      K.check(api.ctl, { label: 'Add 2 padded steps without a mask', value: pad, onChange: (v) => { pad = v; draw(); } });
      K.btn(api.ctl, 'New clip', () => { seed++; draw(); }, 'ghost');
      function draw() {
        F.size().clear();
        const W = F.W, narrow = W < 560;
        const r = K.rng(seed * 97);
        const S = [];
        for (let t = 0; t < T0; t++) { const row = []; for (let d = 0; d < D; d++) row.push(Math.round((r() * 2 - 0.7) * 100) / 100); S.push(row); }
        S[4][1] = Math.round((S[4][1] + spike) * 100) / 100;
        if (pad) S.push([0, 0, 0, 0], [0, 0, 0, 0]);
        const T = S.length;
        const mean = [0, 1, 2, 3].map((d) => S.reduce((a, row) => a + row[d], 0) / T);
        const argmax = [0, 1, 2, 3].map((d) => S.reduce((bi, row, k) => (row[d] > S[bi][d] ? k : bi), 0));
        const mx = argmax.map((k, d) => S[k][d]);
        const hp = mean.concat(mx);
        const z = Wm.map((row, c) => row.reduce((a, w, k) => a + w * hp[k], bias[c]));
        const p = K.softmax(z);
        /* grid */
        const m = { l: 12, t: 26 };
        const cw = narrow ? Math.min(58, (W - 80) / 4) : 54, chh = 24;
        const gx = m.l + 52, gy = m.t + 16;
        F.add(K.label(m.l, m.t - 10, 'Fused states h̃ (' + T + ' steps × 4 features)', 'lbl-b'));
        for (let d = 0; d < D; d++) F.add(K.label(gx + d * cw + cw / 2, gy - 4, 'd' + (d + 1), 'tick', 'middle'));
        S.forEach((row, k) => {
          const yy = gy + k * chh;
          const isPad = pad && k >= T0;
          F.add(K.label(gx - 8, yy + 16, isPad ? 'pad' : 'h̃' + String.fromCharCode(8321 + k), 'tick', 'end'));
          row.forEach((v, d) => {
            const isMax = argmax[d] === k;
            F.add(s('rect', { x: gx + d * cw + 1, y: yy + 1, width: cw - 2, height: chh - 2, rx: 3, class: isPad ? 'f-hatch s-line' : isMax ? 'f-t2 wash s-t2' : 'f-panel2', 'stroke-width': isMax ? 1.5 : 1 }));
            F.add(K.label(gx + d * cw + cw / 2, yy + 16, K.f(v, 2), 'cellt mono', 'middle'));
          });
        });
        const my = gy + T * chh + 10;
        [['mean', mean, 't1'], ['max', mx, 't2']].forEach(([lab, vec, tk], q) => {
          const yy = my + q * (chh + 4);
          F.add(K.label(gx - 8, yy + 16, lab, 'lbl-b', 'end'));
          vec.forEach((v, d) => {
            F.add(s('rect', { x: gx + d * cw + 1, y: yy + 1, width: cw - 2, height: chh - 2, rx: 3, class: 'f-' + tk + ' soft' }));
            F.add(K.label(gx + d * cw + cw / 2, yy + 16, K.f(v, 2), 'cellt mono', 'middle'));
          });
        });
        /* pooled vector, logits, probabilities */
        const px0 = narrow ? m.l : gx + 4 * cw + 50, py0 = narrow ? my + 2 * (chh + 4) + 40 : m.t + 16;
        const pw = narrow ? W - m.l - 12 : W - px0 - 12;
        F.add(K.label(px0, py0 - 10, 'h_pool = [mean ‖ max]  (8 numbers)', 'lbl-b'));
        const pc = Math.min(40, pw / 8);
        hp.forEach((v, k) => {
          F.add(s('rect', { x: px0 + k * pc + 1, y: py0, width: pc - 2, height: 22, rx: 3, class: (k < 4 ? 'f-t1' : 'f-t2') + ' soft' }));
          if (pc >= 34) F.add(K.label(px0 + k * pc + pc / 2, py0 + 15, K.f(v, 1), 'cellt mono', 'middle'));
        });
        const zy = py0 + 60;
        F.add(K.label(px0, zy - 10, 'z = W·h_pool + b   →   softmax', 'lbl-b'));
        const bw = Math.max(60, pw - 150);
        K.CLS.forEach((cl, c) => {
          const yy = zy + c * 34;
          F.add(K.label(px0, yy + 15, cl.name, 'lbl'));
          F.add(K.label(px0 + 118, yy + 15, K.f(z[c], 2), 'lbl mono', 'end'));
          F.add(s('rect', { x: px0 + 130, y: yy + 2, width: bw, height: 18, rx: 4, class: 'f-panel2' }));
          F.add(s('rect', { x: px0 + 130, y: yy + 2, width: Math.max(2, bw * p[c]), height: 18, rx: 4, class: 'f-' + cl.key }));
          F.add(K.label(px0 + 136 + Math.max(2, bw * p[c]), yy + 15, K.pct(p[c], 0), 'lbl-b'));
        });
        setH(F, Math.max(my + 2 * (chh + 4) + 12, zy + 3 * 34 + 8));
        /* the pooled vector, then logits and probabilities in each class's colour */
        const v1 = (arr) => arr.map((q) => K.f(q, 1)).join(',\\ ');
        const TC = ['tcalm', 'texc', 'tauth'];
        const each = (arr, f) => arr.map((q, c) => String.raw`\class{${TC[c]}}{${f(q)}}`).join(',\\ ');
        api.eq.set([
          String.raw`h_{\text{pool}} = [\,\class{tt1}{\text{mean}} \,\|\, \class{tt2}{\text{max}}\,] = [\,\class{tt1}{${v1(mean)}} \,\|\, \class{tt2}{${v1(mx)}}\,]`,
          String.raw`\hat y = \mathrm{softmax}(W h_{\text{pool}} + b) = \mathrm{softmax}(${each(z, (q) => K.f(q, 2))}) = (${each(p, (q) => K.f(q * 100, 0) + '\\%')})`,
        ]);
      }
      draw();
      api.onResize(draw);
    },
  });

  /* ======================= 3.14 LoRA ======================= */
  K.demo({
    id: 'lora', sec: '3.14', title: 'LoRA', page: 21, y: 0.392,
    hint: 'Set r to 1, then tick the start of training.',
    build(api) {
      const RS = [1, 2, 4, 8, 16, 32, 64];
      const PRE = { a: [768, 768], f: [3072, 768], l: [1024, 1024] };
      let ri = 4, pre = 'a', init = false;
      const F = K.fig(api.fig, { h: (w) => (w < 560 ? 610 : 360), label: 'LoRA diagram, the low-rank update, and parameter counts' });
      K.slider(api.ctl, { label: 'Rank r', min: 0, max: 6, step: 1, value: ri, fmt: (v) => String(RS[v]) + (RS[v] === 16 ? ' (thesis)' : ''), onInput: (v) => { ri = v; draw(); } });
      K.seg(api.ctl, { label: 'Matrix W', value: pre, options: [['a', '768 × 768 attention'], ['f', '3072 × 768 feed-forward'], ['l', '1024 × 1024 large']], onChange: (v) => { pre = v; draw(); } });
      K.check(api.ctl, { label: 'At the start of training (B = 0)', value: init, onChange: (v) => { init = v; draw(); } });
      function draw() {
        F.size().clear();
        const W = F.W, narrow = W < 560;
        const r = RS[ri], [d, k] = PRE[pre];
        const m = { l: 14, t: 24 };
        /* diagram: x feeds the frozen W and the thin A then B path; the two results are added */
        const dw = narrow ? Math.min(W - 28, 330) : 290, dh = 270;
        const ox = m.l, oy = m.t + 16;
        const cx = ox + dw * 0.5, cxW = ox + dw * 0.26, cxL = ox + dw * 0.74;
        const outY = oy + 22, sumY = oy + 54, inY = oy + dh - 22;
        const big = 92, wTop = oy + 100;
        F.add(K.label(ox, m.t - 8, 'Forward pass: h = Wx + BAx', 'lbl-b'));
        F.add(s('rect', { x: cx - 70, y: outY - 14, width: 140, height: 14, rx: 3, class: 'f-ink2' }));
        F.add(K.label(cx, outY - 20, 'output h  (d = ' + d + ')', 'tick', 'middle'));
        F.add(s('line', { x1: cx, x2: cx, y1: sumY - 11, y2: outY, class: 's-ink2', 'stroke-width': 1.5 }));
        F.add(s('path', { d: 'M' + cxW + ',' + (inY - 2) + 'V' + (wTop + big) + 'M' + cxW + ',' + wTop + 'V' + sumY + 'H' + (cx - 11), class: 'ln s-muted', 'stroke-width': 1.5 }));
        F.add(s('rect', { x: cxW - big / 2, y: wTop, width: big, height: big, rx: 6, class: 'f-hatch s-muted', 'stroke-width': 1.5 }));
        F.add(K.label(cxW, wTop + big / 2, 'W', 'eqlab', 'middle'));
        F.add(K.label(cxW, wTop + big / 2 + 18, 'frozen', 'tick', 'middle'));
        const neck = K.clamp((80 * r) / 64, 3, 80);
        const aBot = inY - 12, aTop = oy + 176, bBot = oy + 164, bTop = oy + 90;
        F.add(s('path', { d: 'M' + cxL + ',' + bTop + 'V' + sumY + 'H' + (cx + 11) + 'M' + cxL + ',' + (inY - 2) + 'V' + aBot, class: 'ln s-muted', 'stroke-width': 1.5 }));
        F.add(s('path', { d: 'M' + (cxL - 40) + ',' + aBot + 'L' + (cxL + 40) + ',' + aBot + 'L' + (cxL + neck / 2) + ',' + aTop + 'L' + (cxL - neck / 2) + ',' + aTop + 'Z', class: 'f-t2 soft' }));
        F.add(K.label(cxL + 46, (aTop + aBot) / 2 + 4, 'A', 'eqlab'));
        F.add(s('path', { d: 'M' + (cxL - neck / 2) + ',' + bBot + 'L' + (cxL + neck / 2) + ',' + bBot + 'L' + (cxL + 40) + ',' + bTop + 'L' + (cxL - 40) + ',' + bTop + 'Z', class: init ? 'f-panel s-t1' : 'f-t1 soft', 'stroke-width': 1.5 }));
        F.add(K.label(cxL + 46, (bTop + bBot) / 2 + 4, init ? 'B = 0' : 'B', 'eqlab'));
        F.add(K.label(cxL - neck / 2 - 8, (aTop + bBot) / 2 + 4, 'r = ' + r, 'lbl-b', 'end'));
        F.add(s('circle', { cx, cy: sumY, r: 11, class: 'f-panel s-ink2', 'stroke-width': 1.5 }));
        F.add(K.label(cx, sumY + 5, '+', 'lbl-b', 'middle'));
        F.add(s('rect', { x: cxW - 24, y: inY, width: cxL - cxW + 48, height: 14, rx: 3, class: 'f-ink2' }));
        F.add(K.label(cx, inY + 30, 'input x  (k = ' + k + ')', 'tick', 'middle'));
        /* update heatmap */
        const hx = narrow ? m.l : ox + dw + 36, hy = narrow ? oy + dh + 60 : m.t + 4;
        const hs = narrow ? Math.min(W - 28, 240) : Math.min(W - hx - 14, 230);
        const n = 48, rr = Math.min(r, n);
        const rg = K.rng(1234);
        const Bm = [], Am = [];
        for (let i = 0; i < n; i++) { Bm.push([]); for (let q = 0; q < rr; q++) Bm[i].push(K.randn(rg)); }
        for (let q = 0; q < rr; q++) { Am.push([]); for (let j = 0; j < n; j++) Am[q].push(K.randn(rg)); }
        const M = [];
        let mxv = 1e-9;
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { let v = 0; for (let q = 0; q < rr; q++) v += Bm[i][q] * Am[q][j]; v = init ? 0 : v; M.push(v); mxv = Math.max(mxv, Math.abs(v)); }
        const neg = K.rgb(K.css('--div-neg')), mid = K.rgb(K.css('--div-mid')), pos = K.rgb(K.css('--div-pos'));
        const url = K.raster(n, n, (dd, w) => {
          for (let q = 0; q < n * n; q++) {
            const t = M[q] / mxv, a = t < 0 ? neg : pos, u = Math.abs(t);
            const o = q * 4;
            for (let ch = 0; ch < 3; ch++) dd[o + ch] = Math.round(mid[ch] + (a[ch] - mid[ch]) * u);
            dd[o + 3] = 255;
          }
          void w;
        });
        F.add(K.label(hx, hy - 8, init ? 'ΔW = BA = 0 at the start' : 'ΔW = BA, rank at most ' + r, 'lbl-b'));
        F.add(s('image', { href: url, x: hx, y: hy, width: hs, height: hs, preserveAspectRatio: 'none', class: 'pix' }));
        F.add(s('rect', { x: hx, y: hy, width: hs, height: hs, class: 'f-none s-line' }));
        F.add(K.label(hx, hy + hs + 16, 'a 48 × 48 corner, blue = positive, red = negative', 'tick'));
        /* parameter bars */
        const py = narrow ? hy + hs + 50 : oy + dh + 40;
        const full = d * k, lo = r * (d + k);
        const bx = m.l + 92, bw = W - bx - 110;
        F.add(K.label(m.l, py - 10, 'Numbers to train', 'lbl-b'));
        [['full fine-tune', full, 'f-muted'], ['LoRA', lo, 'f-t1']].forEach(([lab, v, cls], q) => {
          const yy = py + q * 30;
          F.add(K.label(bx - 10, yy + 14, lab, 'lbl', 'end'));
          F.add(s('rect', { x: bx, y: yy, width: Math.max(2, (bw * v) / full), height: 18, rx: 4, class: cls }));
          F.add(K.label(bx + Math.max(2, (bw * v) / full) + 8, yy + 14, K.n(v), 'lbl mono'));
        });
        setH(F, py + 64);
        api.eq.set([
          init
            ? String.raw`W' = W + \class{tt1}{B}\,\class{tt2}{A} = W + \class{tt1}{0} \cdot \class{tt2}{A} = W`
            : String.raw`W' = W + \class{tt1}{B}\,\class{tt2}{A}, \qquad \class{tt1}{B} \in \mathbb{R}^{${d} \times ${r}},\ \ \class{tt2}{A} \in \mathbb{R}^{${r} \times ${k}}`,
          String.raw`r\,(d + k) = ${r} \times (${d} + ${k}) = ${K.tn(lo)} \;\text{ instead of }\; d\,k = ${K.tn(full)} \quad (${K.f((100 * lo) / full, 1)}\%)`,
        ]);
      }
      draw();
      api.onResize(draw);
    },
  });

  /* ======================= 3.15 KL loss ======================= */
  K.demo({
    id: 'kl', sec: '3.15', title: 'KL divergence loss', page: 22, y: 0.17, also: [[31, 0.573]],
    hint: 'Move the logits until the bars fill their outlines.',
    build(api) {
      let pair = '01', lam = 0.8, z = [0.5, 0.2, -0.4], sweep = 1;
      const F = K.fig(api.fig, { h: (w) => (w < 540 ? 520 : 290), label: 'Target and predicted distributions, and KL as one logit changes' });
      K.seg(api.ctl, { label: 'Target mixes', value: pair, options: [['01', 'calm + excited'], ['02', 'calm + auth.'], ['12', 'excited + auth.']], onChange: (v) => { pair = v; draw(); } });
      K.slider(api.ctl, { label: 'λ', min: 0, max: 1, step: 0.01, value: lam, fmt: (v) => K.f(v, 2), onInput: (v) => { lam = v; draw(); } });
      const zs = K.CLS.map((c, i) => K.slider(api.ctl, { label: 'z ' + (i === 2 ? 'auth.' : c.name), min: -3, max: 3, step: 0.05, value: z[i], fmt: (v) => K.f(v, 2), onInput: (v) => { z[i] = v; draw(); } }));
      void zs;
      K.seg(api.ctl, { label: 'Curve varies', value: sweep, options: [[0, 'z calm'], [1, 'z excited'], [2, 'z auth.']], onChange: (v) => { sweep = v; draw(); } });
      const target = () => { const y = [0, 0, 0]; y[+pair[0]] += lam; y[+pair[1]] += 1 - lam; return y; };
      const kl = (y, q) => y.reduce((a, v, c) => a + (v > 0 ? v * Math.log(v / q[c]) : 0), 0);
      function draw() {
        F.size().clear();
        const W = F.W, narrow = W < 540;
        const y = target(), q = K.softmax(z);
        const KL = kl(y, q), H = y.reduce((a, v) => a + (v > 0 ? -v * Math.log(v) : 0), 0), CE = H + KL;
        const m = { l: 40, r: 14, t: 28 };
        const pw = narrow ? W - m.l - m.r : (W - m.l - m.r - 50) * 0.5;
        const ph = narrow ? 170 : F.H - m.t - 64;
        const x = K.scale(0, 3, m.l, m.l + pw), yy = K.scale(0, 1, m.t + ph, m.t);
        F.add(K.label(m.l, m.t - 12, 'Target y (outline) vs prediction ŷ (filled)', 'lbl-b'));
        K.axes(F.svg, { x, y: yy, xt: [], yt: [0, 0.5, 1], fy: (v) => String(v) });
        K.CLS.forEach((cl, c) => {
          const cx = x(c + 0.5), bw = Math.min(26, pw / 9);
          F.add(s('rect', { x: cx - bw - 2, y: yy(y[c]), width: bw, height: yy(0) - yy(y[c]), rx: 3, class: 'f-none s-' + cl.key, 'stroke-width': 2 }));
          F.add(s('rect', { x: cx + 2, y: yy(q[c]), width: bw, height: Math.max(0, yy(0) - yy(q[c])), rx: 3, class: 'f-' + cl.key }));
          F.add(K.label(cx, yy(0) + 15, cl.key === 'auth' ? 'auth.' : cl.name, 'tick', 'middle'));
          const contrib = y[c] > 0 ? y[c] * Math.log(y[c] / q[c]) : 0;
          F.add(K.label(cx, yy(0) + 31, (y[c] > 0 ? (contrib >= 0 ? '+' : '') + K.f(contrib, 3) : '0'), 'tick mono', 'middle'));
        });
        F.add(K.label(m.l - 6, yy(0) + 31, 'y·log(y/ŷ)', 'tick', 'end'));
        /* KL curve along one logit */
        const cx0 = narrow ? m.l : m.l + pw + 50, cy0 = narrow ? m.t + ph + 84 : m.t;
        const cw = narrow ? W - m.l - m.r : W - m.r - cx0, ch = narrow ? 150 : ph;
        const pts = [];
        let top = 0.5;
        for (let i = 0; i <= 160; i++) { const v = -4 + (8 * i) / 160; const zz = z.slice(); zz[sweep] = v; const val = kl(y, K.softmax(zz)); pts.push([v, val]); top = Math.max(top, Math.min(val, 4)); }
        const xc = K.scale(-4, 4, cx0, cx0 + cw), yc = K.scale(0, Math.ceil(top * 2) / 2, cy0 + ch, cy0);
        F.add(K.label(cx0, cy0 - 12, 'KL as ' + (sweep === 2 ? 'z auth.' : 'z ' + K.CLS[sweep].name) + ' changes', 'lbl-b'));
        K.axes(F.svg, { x: xc, y: yc, xt: [-4, -2, 0, 2, 4], yt: K.ticks(0, Math.ceil(top * 2) / 2, 3), fx: String, fy: (v) => K.f(v, 1) });
        F.add(s('path', { d: K.path(pts.map(([a, b]) => [xc(a), yc(Math.min(b, Math.ceil(top * 2) / 2))])), class: 'ln s-t2', 'stroke-width': 2 }));
        F.add(s('circle', { cx: xc(z[sweep]), cy: yc(Math.min(KL, Math.ceil(top * 2) / 2)), r: 5, class: 'f-t2 ring' }));
        setH(F, narrow ? cy0 + ch + 26 : Math.max(F.H, m.t + ph + 40));
        /* one term per class in the target, in that class's colour; the total is the dot on the curve */
        const TC = ['tcalm', 'texc', 'tauth'];
        const terms = y.map((v, c) => (v > 0 ? String.raw`\class{${TC[c]}}{${K.f(v, 2)} \log \tfrac{${K.f(v, 2)}}{${K.f(q[c], 2)}}}` : null)).filter(Boolean);
        api.eq.set([
          String.raw`D_{\mathrm{KL}}(y \,\|\, \hat y) = \sum_c y_c \log \frac{y_c}{\hat y_c} = ${terms.join(' + ')} = \class{tt2}{${K.f(KL, 3)}}`,
          String.raw`\text{cross-entropy} = H(y) + D_{\mathrm{KL}} = ${K.f(H, 3)} + \class{tt2}{${K.f(KL, 3)}} = ${K.f(CE, 3)}`,
        ]);
      }
      draw();
      api.onResize(draw);
    },
  });

  /* ======================= 3.16 training schedule ======================= */
  K.demo({
    id: 'schedule', sec: '3.16', title: 'Warmup, cosine decay, early stopping', page: 23, y: 0.17, also: [[23, 0.611]],
    hint: 'Set warmup to 0%, or raise the minimum improvement.',
    build(api) {
      const ACC = [0.556, 0.646, 0.66, 0.672, 0.677];
      const UAR = [0.571, 0.656, 0.669, 0.68, 0.684];
      let wu = 0.1, pat = 1, delta = 0.005;
      const F = K.fig(api.fig, { h: (w) => (w < 540 ? 470 : 280), label: 'Learning-rate schedule and validation metrics per epoch' });
      K.slider(api.ctl, { label: 'Warmup', min: 0, max: 0.3, step: 0.01, value: wu, fmt: (v) => K.pct(v, 0) + ' of steps', onInput: (v) => { wu = v; draw(); } });
      K.slider(api.ctl, { label: 'Patience', min: 1, max: 3, step: 1, value: pat, fmt: (v) => v + (v === 1 ? ' check' : ' checks'), onInput: (v) => { pat = v; draw(); } });
      K.slider(api.ctl, { label: 'Min. improvement δ', min: 0, max: 0.03, step: 0.001, value: delta, fmt: (v) => K.f(v, 3), onInput: (v) => { delta = v; draw(); } });
      const lr = (u) => (u < wu ? u / wu : 0.5 * (1 + Math.cos((Math.PI * (u - wu)) / (1 - wu))));
      function draw() {
        F.size().clear();
        const W = F.W, narrow = W < 540;
        const m = { l: 42, r: 14, t: 28 };
        const pw = narrow ? W - m.l - m.r : (W - m.l - m.r - 50) / 2;
        const ph = narrow ? 160 : F.H - m.t - 44;
        const x = K.scale(0, 5, m.l, m.l + pw), y = K.scale(0, 1, m.t + ph, m.t);
        F.add(K.label(m.l, m.t - 12, 'Learning rate over training', 'lbl-b'));
        K.axes(F.svg, { x, y, xt: [0, 1, 2, 3, 4, 5], yt: [0, 0.5, 1], fx: (v) => 'ep ' + v, fy: (v) => (v === 1 ? 'ηmax' : v === 0 ? '0' : '½') });
        if (wu > 0) F.add(s('rect', { x: x(0), y: m.t, width: x(5 * wu) - x(0), height: ph, class: 'f-t1 wash' }));
        const pts = [];
        for (let i = 0; i <= 300; i++) { const u = i / 300; pts.push([x(5 * u), y(lr(u))]); }
        F.add(s('path', { d: K.path(pts), class: 'ln s-t1', 'stroke-width': 2 }));
        if (wu > 0.04) F.add(K.label(x(2.5 * wu), m.t + 14, 'warmup', 'tick', 'middle'));
        /* early stopping on validation UAR */
        let best = UAR[0], cnt = 0, stop = 5;
        for (let e = 1; e < 5; e++) {
          if (UAR[e] - best > delta) cnt = 0; else cnt++;
          best = Math.max(best, UAR[e]);
          if (cnt >= pat) { stop = e + 1; break; }
        }
        const cx0 = narrow ? m.l : m.l + pw + 50, cy0 = narrow ? m.t + ph + 70 : m.t;
        const xe = K.scale(0.7, 5.3, cx0, cx0 + pw), ye = K.scale(0.5, 0.72, cy0 + ph, cy0);
        F.add(K.label(cx0, cy0 - 12, 'Validation per epoch (Figure 4.3)', 'lbl-b'));
        K.axes(F.svg, { x: xe, y: ye, xt: [1, 2, 3, 4, 5], yt: [0.5, 0.6, 0.7], fx: (v) => 'ep ' + v, fy: (v) => K.f(v, 1) });
        if (stop < 5) F.add(s('rect', { x: xe(stop + 0.5), y: cy0, width: xe(5.3) - xe(stop + 0.5), height: ph, class: 'f-hatch' }));
        [[ACC, 's-muted', 'f-muted'], [UAR, 's-t2', 'f-t2']].forEach(([arr, sc, fc]) => {
          F.add(s('path', { d: K.path(arr.map((v, i) => [xe(i + 1), ye(v)])), class: 'ln ' + sc, 'stroke-width': 2 }));
          arr.forEach((v, i) => F.add(s('circle', { cx: xe(i + 1), cy: ye(v), r: 4, class: fc + ' ring' })));
        });
        F.add(K.label(xe(5) - 4, ye(UAR[4]) - 10, 'UAR', 'tick', 'end'));
        F.add(K.label(xe(5) - 4, ye(ACC[4]) + 18, 'accuracy', 'tick', 'end'));
        F.add(s('line', { x1: xe(stop), x2: xe(stop), y1: cy0, y2: cy0 + ph, class: 's-t2 dash', 'stroke-width': 1.5 }));
        F.add(K.label(xe(stop) - 6, cy0 + 14, 'stop', 'lbl-b', 'end'));
        setH(F, cy0 + ph + 26);
        /* the schedule with the current warmup, and each epoch's gain against δ (gains that don't count are greyed) */
        const UW = String.raw`\class{tt1}{${K.f(wu, 2)}}`;
        const cos = String.raw`\eta_{\max} \cdot \tfrac12 \left[ 1 + \cos\!\left( \pi\, \frac{u - ${UW}}{1 - ${UW}} \right) \right]`;
        const gains = UAR.slice(1).map((v, i) => { const g = v - Math.max(...UAR.slice(0, i + 1)); return g > delta ? K.f(g, 3) : String.raw`\class{tmut}{${K.f(g, 3)}}`; });
        api.eq.set([
          wu > 0 ? String.raw`\eta(u) = \begin{cases} \eta_{\max}\, u / ${UW} & u < ${UW} \\ ${cos} & \text{after} \end{cases}` : String.raw`\eta(u) = ${cos}`,
          String.raw`\Delta\text{UAR} = ${gains.join(',\\ ')} \;\text{ vs }\; \delta = ${K.f(delta, 3)} \;\Rightarrow\; \class{tt2}{\text{stop after epoch } ${stop}}`,
        ]);
      }
      draw();
      api.onResize(draw);
    },
    source: 'Validation values from Figure 4.3; UAR is read off the plot, so approximate.',
  });

  /* ======================= 3.17 confidence and feedback ======================= */
  K.demo({
    id: 'confidence', sec: '3.17', title: 'From probabilities to feedback', page: 24, y: 0.235, also: [[40, 0.429]],
    hint: 'Drag the point to the centre, then raise T.',
    build(api) {
      let p = [0.55, 0.3, 0.15], tau = 0.5, T = 1, drag = false, lay = null;
      const F = K.fig(api.fig, { h: (w) => Math.round(K.clamp(w * 0.72, 300, 400)), label: 'Probability triangle with decision regions and a mixed zone' });
      K.slider(api.ctl, { label: 'Threshold τ', min: 0.34, max: 0.9, step: 0.01, value: tau, fmt: (v) => K.f(v, 2), onInput: (v) => { tau = v; draw(); } });
      K.slider(api.ctl, { label: 'Temperature T', min: 0.25, max: 4, step: 0.05, value: T, fmt: (v) => K.f(v, 2), onInput: (v) => { T = v; draw(); } });
      const calib = () => K.softmax(p.map((v) => Math.log(Math.max(v, 1e-6))), T);
      F.svg.style.touchAction = 'none';
      const setFrom = (ev) => {
        if (!lay) return;
        const [px, py] = K.pt(F.svg, ev);
        const { A, B, C } = lay;
        const det = (B[1] - C[1]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[1] - C[1]);
        let l1 = ((B[1] - C[1]) * (px - C[0]) + (C[0] - B[0]) * (py - C[1])) / det;
        let l2 = ((C[1] - A[1]) * (px - C[0]) + (A[0] - C[0]) * (py - C[1])) / det;
        let l3 = 1 - l1 - l2;
        l1 = Math.max(0.001, l1); l2 = Math.max(0.001, l2); l3 = Math.max(0.001, l3);
        const sm = l1 + l2 + l3;
        p = [l1 / sm, l2 / sm, l3 / sm];
        draw();
      };
      F.svg.addEventListener('pointerdown', (ev) => { drag = true; try { F.svg.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ } setFrom(ev); });
      F.svg.addEventListener('pointermove', (ev) => { if (drag) setFrom(ev); });
      F.svg.addEventListener('pointerup', () => { drag = false; });
      F.svg.addEventListener('pointercancel', () => { drag = false; });
      function clip(poly, c) {
        const out = [];
        for (let i = 0; i < poly.length; i++) {
          const a = poly[i], b = poly[(i + 1) % poly.length];
          const ia = a[c] <= tau, ib = b[c] <= tau;
          if (ia) out.push(a);
          if (ia !== ib) { const t = (tau - a[c]) / (b[c] - a[c]); out.push(a.map((v, k) => v + (b[k] - v) * t)); }
        }
        return out;
      }
      function draw() {
        F.size().clear();
        const W = F.W, H = F.H;
        const side = Math.min(W - 40, (H - 60) / 0.866);
        const cx = W / 2, top = 30;
        const A = [cx - side / 2, top + side * 0.866], B = [cx, top], C = [cx + side / 2, top + side * 0.866];
        lay = { A, B, C };
        const xy = (b) => [b[0] * A[0] + b[1] * B[0] + b[2] * C[0], b[0] * A[1] + b[1] * B[1] + b[2] * C[1]];
        const cen = [1 / 3, 1 / 3, 1 / 3];
        const corners = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
        for (let k = 0; k < 3; k++) {
          const a = corners[k], nx = corners[(k + 1) % 3], pv = corners[(k + 2) % 3];
          const m1 = a.map((v, q) => (v + nx[q]) / 2), m2 = a.map((v, q) => (v + pv[q]) / 2);
          F.add(s('path', { d: K.path([a, m1, cen, m2].map(xy)) + 'Z', class: 'f-' + K.CLS[k].key + ' wash' }));
        }
        let mixed = corners.slice();
        for (let c = 0; c < 3; c++) mixed = clip(mixed, c);
        if (mixed.length >= 3) F.add(s('path', { d: K.path(mixed.map(xy)) + 'Z', class: 'f-hatch s-ink2', 'stroke-width': 1 }));
        F.add(s('path', { d: K.path([A, B, C]) + 'Z', class: 'f-none s-axis', 'stroke-width': 1.5 }));
        F.add(K.label(A[0], A[1] + 20, 'calm', 'lbl-b', 'start'));
        F.add(K.label(B[0], B[1] - 10, 'excited', 'lbl-b', 'middle'));
        F.add(K.label(C[0], C[1] + 20, 'authoritative', 'lbl-b', 'end'));
        if (mixed.length >= 3) { const mc = xy(cen); F.add(K.label(mc[0], mc[1] + 4, 'mixed', 'tick', 'middle')); }
        const base = p.map((v) => Math.log(Math.max(v, 1e-6)));
        const path = [];
        for (let i = 0; i <= 60; i++) { const tt = Math.exp(Math.log(0.25) + (i / 60) * (Math.log(4) - Math.log(0.25))); path.push(xy(K.softmax(base, tt))); }
        F.add(s('path', { d: K.path(path), class: 'ln s-t2 dash', 'stroke-width': 1.25 }));
        const q = calib();
        const P0 = xy(p), P1 = xy(q);
        if (Math.abs(T - 1) > 0.01) F.add(s('circle', { cx: P0[0], cy: P0[1], r: 6, class: 'f-none s-ink2', 'stroke-width': 1.5 }));
        F.add(s('circle', { cx: P1[0], cy: P1[1], r: 8, class: 'f-ink ring' }));
        const mx = Math.max(...q), k = q.indexOf(mx);
        const TC = ['tcalm', 'texc', 'tauth'];
        const verdict = mx < tau ? String.raw`\text{“Your tone sounds mixed.”}` : String.raw`\text{“You sound }\class{${TC[k]}}{\text{${K.CLS[k].name}}}\text{.”}`;
        api.eq.set([
          String.raw`\hat y = \mathrm{softmax}(z / \class{tt2}{${K.f(T, 2)}}) = (${q.map((v, c) => String.raw`\class{${TC[c]}}{${K.f(v, 2)}}`).join(',\\ ')})`,
          String.raw`\text{score} = 100 \cdot \max_c \hat y_c = ${K.f(100 * mx, 0)} \;${mx < tau ? '<' : '\\ge'}\; 100\,\tau = ${K.f(100 * tau, 0)} \;\Rightarrow\; ${verdict}`,
        ]);
      }
      draw();
      api.onResize(draw);
    },
  });
})();
