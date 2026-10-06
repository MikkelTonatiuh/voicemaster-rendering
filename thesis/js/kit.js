/* kit.js: small helpers shared by every demo (DOM, SVG, math, controls, TeX). */
(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const K = (window.K = {});

  /* ---------- DOM / SVG ---------- */
  function setAttrs(e, attrs, svg) {
    for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') svg ? e.setAttribute('class', v) : (e.className = v);
      else if (k === 'text') e.textContent = v;
      else if (k === 'style' && typeof v === 'object') { for (const p in v) (p.startsWith('--') ? e.style.setProperty(p, v[p]) : (e.style[p] = v[p])); }
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
  }
  function append(e, kids) {
    for (const c of kids.flat(Infinity)) if (c != null && c !== false) e.append(c.nodeType ? c : String(c));
  }
  K.h = function (tag, attrs, ...kids) {
    const e = document.createElement(tag);
    if (attrs) setAttrs(e, attrs, false);
    append(e, kids);
    return e;
  };
  K.s = function (tag, attrs, ...kids) {
    const e = document.createElementNS(NS, tag);
    if (attrs) setAttrs(e, attrs, true);
    append(e, kids);
    return e;
  };

  /* ---------- numbers ---------- */
  K.clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  K.lerp = (a, b, t) => a + (b - a) * t;
  K.f = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d).replace(/^-(?=\d)/, '−') : '—');
  K.n = (v) => (Number.isFinite(v) ? Math.round(v).toLocaleString('en-US') : '—');
  K.pct = (v, d = 0) => (Number.isFinite(v) ? (v * 100).toFixed(d) + '%' : '—');
  /* a number for TeX: thousands grouped as 16{,}000, a real minus sign */
  K.tn = function (v, d = 0) {
    if (!Number.isFinite(v)) return '?';
    const [i, f] = Math.abs(v).toFixed(d).split('.');
    return (v < 0 && +Math.abs(v).toFixed(d) !== 0 ? '-' : '') + i.replace(/\B(?=(\d{3})+$)/g, '{,}') + (f ? '.' + f : '');
  };
  K.sci = (v, d = 2) => {
    if (!Number.isFinite(v)) return '—';
    if (v === 0) return '0';
    const e = Math.floor(Math.log10(Math.abs(v)));
    if (e >= -2 && e < 4) return K.f(v, Math.max(0, d - e));
    return K.f(v / Math.pow(10, e), d) + ' × 10' + String(e).replace('-', '⁻').replace(/\d/g, (c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+c]);
  };
  K.scale = function (d0, d1, r0, r1) {
    const f = (v) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);
    f.inv = (p) => d0 + ((p - r0) / (r1 - r0)) * (d1 - d0);
    f.domain = [d0, d1];
    f.range = [r0, r1];
    return f;
  };
  K.ticks = function (a, b, n) {
    n = n || 5;
    const span = b - a;
    const step0 = span / n;
    const mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const err = step0 / mag;
    const step = (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1) * mag;
    const out = [];
    for (let v = Math.ceil(a / step - 1e-9) * step; v <= b + step * 1e-9; v += step) out.push(+v.toFixed(10));
    return out;
  };
  K.path = (pts) => (pts.length ? 'M' + pts.map((p) => p[0].toFixed(2) + ',' + p[1].toFixed(2)).join('L') : '');

  /* ---------- random ---------- */
  K.rng = function (seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  K.randn = function (r) {
    let u = 0, v = 0;
    while (u === 0) u = r();
    while (v === 0) v = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  K.gammaSample = function (r, a) {
    if (a < 1) return K.gammaSample(r, a + 1) * Math.pow(r(), 1 / a);
    const d = a - 1 / 3, c = 1 / Math.sqrt(9 * d);
    for (;;) {
      let x, v;
      do { x = K.randn(r); v = 1 + c * x; } while (v <= 0);
      v = v * v * v;
      const u = r();
      if (u < 1 - 0.0331 * x * x * x * x) return d * v;
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }
  };
  K.betaSample = function (r, a, b) {
    const x = K.gammaSample(r, a), y = K.gammaSample(r, b);
    return x + y > 0 ? x / (x + y) : 0.5;
  };

  /* ---------- special functions ---------- */
  K.erf = function (x) {
    const s = x < 0 ? -1 : 1;
    x = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * x);
    const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return s * y;
  };
  K.Phi = (x) => 0.5 * (1 + K.erf(x / Math.SQRT2));
  K.npdf = (x, mu = 0, sd = 1) => Math.exp(-0.5 * ((x - mu) / sd) ** 2) / (sd * Math.sqrt(2 * Math.PI));
  K.lgamma = function (z) {
    const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - K.lgamma(1 - z);
    z -= 1;
    let x = c[0];
    for (let i = 1; i < 9; i++) x += c[i] / (z + i);
    const t = z + 7.5;
    return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
  };
  K.betaPdf = (x, a, b) => (x <= 0 || x >= 1 ? NaN : Math.exp((a - 1) * Math.log(x) + (b - 1) * Math.log(1 - x) - (K.lgamma(a) + K.lgamma(b) - K.lgamma(a + b))));
  function betacf(x, a, b) {
    const FPMIN = 1e-300;
    const qab = a + b, qap = a + 1, qam = a - 1;
    let c = 1, d = 1 - (qab * x) / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    d = 1 / d;
    let h = d;
    for (let m = 1; m <= 300; m++) {
      const m2 = 2 * m;
      let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d; h *= d * c;
      aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < 3e-14) break;
    }
    return h;
  }
  K.betaCdf = function (x, a, b) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const bt = Math.exp(K.lgamma(a + b) - K.lgamma(a) - K.lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    return x < (a + 1) / (a + b + 2) ? (bt * betacf(x, a, b)) / a : 1 - (bt * betacf(1 - x, b, a)) / b;
  };
  K.softmax = function (z, T) {
    T = T || 1;
    const m = Math.max(...z.map((v) => v / T));
    const e = z.map((v) => Math.exp(v / T - m));
    const s = e.reduce((a, b) => a + b, 0);
    return e.map((v) => v / s);
  };
  /* in-place radix-2 FFT; length must be a power of two */
  K.fft = function (re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang), half = len >> 1;
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < half; k++) {
          const a = i + k, b = a + half;
          const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
          re[b] = re[a] - xr; im[b] = im[a] - xi;
          re[a] += xr; im[a] += xi;
          const t = cr * wr - ci * wi;
          ci = cr * wi + ci * wr;
          cr = t;
        }
      }
    }
  };
  K.hann = (n) => Float64Array.from({ length: n }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));

  /* ---------- colour ---------- */
  K.css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  function hexRgb(hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.replace(/./g, (c) => c + c);
    const n = parseInt(hex, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  K.rgb = hexRgb;
  /* sequential ramp between --seq-lo and --seq-hi; returns {fill, text} */
  K.heat = function (t) {
    const a = hexRgb(K.css('--seq-lo') || '#eef4fc'), b = hexRgb(K.css('--seq-hi') || '#1c5cab');
    t = K.clamp(t, 0, 1);
    const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
    const lum = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    const L = 0.2126 * lum[0] + 0.7152 * lum[1] + 0.0722 * lum[2];
    return { fill: 'rgb(' + c.join(',') + ')', text: L > 0.33 ? '#101214' : '#ffffff', rgb: c };
  };
  K.CLS = [
    { key: 'calm', name: 'calm', tok: '--calm' },
    { key: 'excited', name: 'excited', tok: '--excited' },
    { key: 'auth', name: 'authoritative', tok: '--auth' },
  ];

  /* ---------- controls ---------- */
  let uid = 0;
  K.uid = (p) => (p || 'k') + ++uid;
  K.slider = function (parent, o) {
    const id = o.id || K.uid('s');
    const inp = K.h('input', { type: 'range', id, min: o.min, max: o.max, step: o.step || 'any' });
    inp.value = o.value;
    const out = K.h('output', { class: 'ctl-val', for: id });
    const fmt = o.fmt || ((v) => String(v));
    const wrap = K.h('div', { class: 'ctl ctl-slider' + (o.wide ? ' wide' : '') }, K.h('label', { class: 'ctl-label', for: id }, o.label), inp, out);
    const upd = () => { out.textContent = fmt(+inp.value); };
    inp.addEventListener('input', () => { upd(); if (o.onInput) o.onInput(+inp.value); });
    upd();
    parent.append(wrap);
    return {
      el: wrap, input: inp,
      get: () => +inp.value,
      set(v, fire) { inp.value = v; upd(); if (fire && o.onInput) o.onInput(+inp.value); },
    };
  };
  K.seg = function (parent, o) {
    const wrap = K.h('div', { class: 'ctl ctl-seg' });
    const lab = o.label ? K.h('span', { class: 'ctl-label', id: K.uid('l') }, o.label) : null;
    if (lab) wrap.append(lab);
    const box = K.h('div', { class: 'seg', role: 'radiogroup', 'aria-labelledby': lab ? lab.id : null });
    let value = o.value;
    const btns = o.options.map(([v, text]) => {
      const b = K.h('button', { type: 'button', class: 'seg-btn', role: 'radio' }, text);
      b._v = v;
      b.addEventListener('click', () => set(v, true));
      box.append(b);
      return b;
    });
    function set(v, fire) {
      value = v;
      btns.forEach((b) => b.setAttribute('aria-checked', String(b._v === v)));
      if (fire && o.onChange) o.onChange(v);
    }
    set(value, false);
    wrap.append(box);
    parent.append(wrap);
    return { el: wrap, get: () => value, set };
  };
  K.check = function (parent, o) {
    const id = o.id || K.uid('c');
    const inp = K.h('input', { type: 'checkbox', id });
    inp.checked = !!o.value;
    inp.addEventListener('change', () => o.onChange && o.onChange(inp.checked));
    const wrap = K.h('div', { class: 'ctl ctl-check' }, inp, K.h('label', { for: id }, o.label));
    parent.append(wrap);
    return { el: wrap, get: () => inp.checked, set: (v) => { inp.checked = !!v; } };
  };
  K.btn = function (parent, label, onClick, cls) {
    const b = K.h('button', { type: 'button', class: 'btn ' + (cls || '') }, label);
    b.addEventListener('click', onClick);
    parent.append(b);
    return b;
  };
  K.readouts = function (parent, items) {
    const map = {};
    const box = K.h('dl', { class: 'ro' });
    for (const [key, label] of items) {
      const dd = K.h('dd', null, '—');
      box.append(K.h('div', { class: 'ro-item' }, K.h('dt', null, label), dd));
      map[key] = dd;
    }
    parent.append(box);
    return {
      set(key, text, cls) { const dd = map[key]; if (!dd) return; dd.textContent = text; dd.className = cls || ''; },
    };
  };

  /* ---------- figures ---------- */
  K.fig = function (parent, o) {
    o = o || {};
    const wrap = K.h('div', { class: 'fig-wrap' });
    const svg = K.s('svg', { class: 'fig', role: 'img', 'aria-label': o.label || 'Interactive figure' });
    wrap.append(svg);
    parent.append(wrap);
    const api = {
      wrap, svg, W: 0, H: 0,
      size() {
        const w = Math.max(260, Math.floor(wrap.clientWidth || parent.clientWidth || 520));
        const h = typeof o.h === 'function' ? o.h(w) : o.h || 300;
        api.W = w; api.H = h;
        svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
        svg.setAttribute('width', w);
        svg.setAttribute('height', h);
        return api;
      },
      clear() { while (svg.firstChild) svg.firstChild.remove(); return api; },
      add(...els) { els.forEach((e) => svg.append(e)); return els[0]; },
    };
    return api;
  };
  /* raster helper: draw into an offscreen canvas and return a data URL for an SVG <image> */
  K.raster = function (w, h, paint) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(w, h);
    paint(img.data, w, h);
    ctx.putImageData(img, 0, 0);
    return cv.toDataURL();
  };
  K.axes = function (parent, o) {
    const [x0, x1] = o.x.range;
    const [y0, y1] = o.y.range;
    const G = K.s('g', { class: 'axes' });
    if (o.grid !== false) for (const t of o.yt || []) G.append(K.s('line', { class: 'grid', x1: x0, x2: x1, y1: o.y(t), y2: o.y(t) }));
    if (o.gridX) for (const t of o.xt || []) G.append(K.s('line', { class: 'grid', x1: o.x(t), x2: o.x(t), y1: y0, y2: y1 }));
    if (o.baseline !== false) G.append(K.s('line', { class: 'axis', x1: x0, x2: x1, y1: y0, y2: y0 }));
    if (o.yAxis) G.append(K.s('line', { class: 'axis', x1: x0, x2: x0, y1: y0, y2: y1 }));
    const fx = o.fx || ((v) => String(v)), fy = o.fy || ((v) => String(v));
    for (const t of o.xt || []) G.append(K.s('text', { class: 'tick', x: o.x(t), y: y0 + 15, 'text-anchor': 'middle', text: fx(t) }));
    for (const t of o.yt || []) G.append(K.s('text', { class: 'tick', x: x0 - 6, y: o.y(t) + 4, 'text-anchor': 'end', text: fy(t) }));
    if (o.xl) G.append(K.s('text', { class: 'alabel', x: x1, y: y0 + 31, 'text-anchor': 'end', text: o.xl }));
    if (o.yl) G.append(K.s('text', { class: 'alabel', x: x0 - (o.ylIndent == null ? 0 : o.ylIndent), y: y1 - 9, 'text-anchor': 'start', text: o.yl }));
    parent.append(G);
    return G;
  };
  K.label = (x, y, text, cls, anchor) => K.s('text', { x, y, class: cls || 'lbl', 'text-anchor': anchor || 'start', text });
  K.legend = function (parent, items) {
    const box = K.h('div', { class: 'legend' });
    for (const [tokOrCls, text, kind] of items) {
      const key = K.h('span', { class: 'key ' + (kind || 'dot') });
      key.style.setProperty('--k', tokOrCls.startsWith('--') ? 'var(' + tokOrCls + ')' : tokOrCls);
      box.append(K.h('span', { class: 'legend-item' }, key, text));
    }
    parent.append(box);
    return box;
  };
  /* pointer position in SVG user units */
  K.pt = function (svg, ev) {
    const r = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    return [((ev.clientX - r.left) / r.width) * vb.width, ((ev.clientY - r.top) / r.height) * vb.height];
  };
  /* make an SVG element draggable; cb(x, y) in user units */
  K.drag = function (svg, el, cb, end) {
    el.style.cursor = 'grab';
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      el.setPointerCapture(ev.pointerId);
      el.style.cursor = 'grabbing';
      const move = (e) => { const p = K.pt(svg, e); cb(p[0], p[1]); };
      const up = () => {
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', up);
        el.style.cursor = 'grab';
        if (end) end();
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    });
  };

  /* ---------- tooltip ---------- */
  let tipEl = null;
  K.tip = {
    show(ev, rows) {
      if (!tipEl) { tipEl = K.h('div', { class: 'tip', role: 'tooltip' }); document.body.append(tipEl); }
      tipEl.replaceChildren(...rows.map(([v, lab]) => K.h('div', { class: 'tip-row' }, K.h('b', null, v), lab ? K.h('span', null, lab) : null)));
      tipEl.hidden = false;
      const pad = 14;
      const r = tipEl.getBoundingClientRect();
      let x = ev.clientX + pad, y = ev.clientY + pad;
      if (x + r.width > innerWidth - 8) x = ev.clientX - r.width - pad;
      if (y + r.height > innerHeight - 8) y = ev.clientY - r.height - pad;
      tipEl.style.left = Math.max(8, x) + 'px';
      tipEl.style.top = Math.max(8, y) + 'px';
    },
    hide() { if (tipEl) tipEl.hidden = true; },
  };
  K.hover = function (el, rowsFn) {
    el.addEventListener('pointermove', (ev) => K.tip.show(ev, rowsFn()));
    el.addEventListener('pointerleave', () => K.tip.hide());
    return el;
  };

  /* ---------- TeX (MathJax, loaded from cdnjs) ---------- */
  let chain = null, waited = 0;
  function whenMJ(cb) {
    const mj = window.MathJax;
    if (mj && mj.startup && mj.startup.promise && mj.tex2svgPromise) {
      if (!chain) {
        /* MathJax's own CSS (it hides the screen-reader copy of each formula) is only added
           automatically when it typesets the whole page, so add it once here */
        chain = mj.startup.promise.then(() => { try { document.head.appendChild(mj.svgStylesheet()); } catch (e) { /* ignore */ } });
      }
      chain = chain.then(cb).catch((e) => console.warn('TeX render failed', e));
      return;
    }
    if (waited > 30000) return;
    waited += 150;
    setTimeout(() => whenMJ(cb), 150);
  }
  K.tex = function (el, tex, display) {
    el.classList.add('tex', display ? 'tex-d' : 'tex-i');
    el.textContent = tex;
    whenMJ(() => window.MathJax.tex2svgPromise(tex, { display: !!display }).then((node) => { el.replaceChildren(node); el.classList.add('tex-ok'); }));
    return el;
  };
  /* a formula that follows the figure: set() it again whenever the numbers change. Each line is one display
     formula; renders are coalesced, so dragging only ever typesets the latest state */
  K.eq = function (parent) {
    const el = K.h('div', { class: 'eqlive tex', 'aria-live': 'polite' });
    parent.append(el);
    let want = null, shown = null, busy = false, lastW = -1;
    const key = (lines) => lines.join('\n');
    /* formulas joined by \qquad at the top level become separate pieces that wrap onto new lines */
    function pieces(tex) {
      const out = [];
      let depth = 0, start = 0;
      for (let i = 0; i < tex.length; i += 1) {
        const c = tex[i];
        if (c === '\\' && tex.startsWith('\\qquad', i) && depth === 0) { out.push(tex.slice(start, i)); start = i + 6; i += 5; continue; }
        if (c === '\\') { i += 1; continue; }
        if (c === '{') depth += 1;
        else if (c === '}') depth -= 1;
      }
      out.push(tex.slice(start));
      return out.map((p) => p.trim()).filter(Boolean);
    }
    /* a piece wider than the panel shrinks to fit (not below 11 px) */
    function fit() {
      const avail = el.clientWidth;
      lastW = avail;
      for (const p of el.querySelectorAll('.eqpart')) {
        p.style.fontSize = '';
        const svg = p.querySelector('svg');
        const w = svg ? svg.getBoundingClientRect().width : 0;
        if (w > avail && avail > 0) p.style.fontSize = Math.max(11, Math.floor((parseFloat(getComputedStyle(p).fontSize) * avail) / w)) + 'px';
      }
    }
    new ResizeObserver(() => { if (el.clientWidth !== lastW) fit(); }).observe(el);
    function render() {
      if (busy || want == null || key(want) === shown) return;
      busy = true;
      const lines = want;
      whenMJ(() => Promise.all(lines.map((t) => Promise.all(pieces(t).map((p) => window.MathJax.tex2svgPromise(p, { display: true })))))
        .then((rows) => {
          el.replaceChildren(...rows.map((nodes) => K.h('div', { class: 'eqline' }, nodes.map((n) => K.h('span', { class: 'eqpart' }, n)))));
          el.classList.add('tex-ok');
          shown = key(lines);
          fit();
        })
        .finally(() => { busy = false; render(); }));
    }
    return {
      el,
      touched: false,
      set(tex) { this.touched = true; want = [].concat(tex); render(); },
    };
  };
  /* text with inline $...$ math and **bold** */
  K.rich = function (el, str) {
    const parts = String(str).split(/(\$[^$]+\$|\*\*[^*]+\*\*)/g);
    for (const p of parts) {
      if (!p) continue;
      if (p[0] === '$' && p[p.length - 1] === '$' && p.length > 2) el.append(K.tex(K.h('span'), p.slice(1, -1), false));
      else if (p.startsWith('**') && p.endsWith('**') && p.length > 4) el.append(K.h('strong', null, p.slice(2, -2)));
      else el.append(p);
    }
    return el;
  };
})();
