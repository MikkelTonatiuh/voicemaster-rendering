/* app.js: demo registry, thesis reader, scroll sync and navigation. */
(function () {
  'use strict';
  const h = K.h;
  const DEMOS = [];
  const byId = {};
  K.demo = function (d) { DEMOS.push(d); byId[d.id] = d; };
  K.go = function (id) { activate(id, { scroll: true }); };

  const FIRST_PAGE = 1, LAST_PAGE = 50;
  const PAGE_PT = 595;                      /* A4 page width in PDF points */
  const READ = 0.3;                         /* reading line: 30% down the thesis pane */
  const GROUPS = [
    ['Start', (d) => !d.sec],
    ['3 Methods', (d) => d.sec && d.sec[0] === '3'],
    ['4 Results', (d) => d.sec && d.sec[0] === '4'],
    ['5 Discussion', (d) => d.sec && d.sec[0] === '5'],
  ];

  let stage, pane, sel, pageInd, holdBtn, soloNav, soloLabel;
  let active = null, cleanup = null, held = false;
  let resizeFns = [];
  let anchors = [];
  const pageEls = {};
  let quietUntil = 0, raf = 0, solo = false, soloPage = FIRST_PAGE;
  const soloMQ = window.matchMedia('(max-width: 899px)');

  function init() {
    stage = document.getElementById('stage');
    pane = document.getElementById('pane');
    sel = document.getElementById('sel');
    pageInd = document.getElementById('pageind');
    holdBtn = document.getElementById('hold');
    soloNav = document.getElementById('solonav');
    soloLabel = document.getElementById('solo-label');
    wireFocus();

    DEMOS.sort((a, b) => a.page - b.page || a.y - b.y);
    buildSelect();
    buildPages();
    wireZoom();
    wireSplitter();

    sel.addEventListener('change', () => activate(sel.value, { scroll: true }));
    holdBtn.addEventListener('click', () => {
      held = !held;
      holdBtn.setAttribute('aria-pressed', String(held));
      holdBtn.textContent = held ? 'Holding demo' : 'Hold demo';
      if (!held) syncFromScroll();
    });
    document.getElementById('help').addEventListener('click', () => activate('overview', { scroll: true }));
    document.getElementById('solo-prev').addEventListener('click', () => showSoloPage(soloPage - 1));
    document.getElementById('solo-next').addEventListener('click', () => showSoloPage(soloPage + 1));

    pane.addEventListener('scroll', () => { notePlace(); if (!raf) raf = setTimeout(syncFromScroll, 60); }, { passive: true });
    pane.addEventListener('scrollend', () => { quietUntil = 0; });

    /* runs right after layout, before the frame is painted, so the page never visibly jumps */
    const ro = new ResizeObserver(() => { keepPlace(fitPages); resizeFns.forEach((f) => safe(f)); });
    ro.observe(stage);
    ro.observe(pane);

    const rerender = () => resizeFns.forEach((f) => safe(f));
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', rerender);
    new MutationObserver(rerender).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    soloMQ.addEventListener('change', setSolo);
    setSolo();
    window.addEventListener('hashchange', () => { const id = location.hash.slice(1); if (byId[id]) activate(id, { scroll: true }); });

    const start = byId[location.hash.slice(1)] ? location.hash.slice(1) : 'overview';
    fitPages();
    computeAnchors();
    activate(start, { scroll: true, instant: true });
    loadPdf();
  }

  /* ---------- page size: fits the pane, times the zoom; the two sides share the width ---------- */
  let zoom = 1, zoomLabel = null;
  function fitPages() {
    if (solo) pane.style.removeProperty('--page-w');
    else {
      const cs = getComputedStyle(pane);
      const inner = pane.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      pane.style.setProperty('--page-w', Math.round(Math.min(780, inner) * zoom) + 'px');
    }
    const el = pageEls[solo ? soloPage : FIRST_PAGE];
    if (el && el.clientWidth) pane.style.setProperty('--scale-factor', (el.clientWidth / PAGE_PT).toFixed(5));
    schedulePdf();
  }
  /* where the reading line sits (page and fraction of it), noted after every scroll. A window resize has
     already moved things by the time it is reported, so the place is taken from before it */
  let place = null;
  function notePlace() {
    if (solo || !pane.clientHeight) return;
    const line = pane.scrollTop + pane.clientHeight * READ;
    const p = pageAt(line), el = pageEls[p];
    place = { p, frac: (line - el.offsetTop) / el.offsetHeight };
  }
  /* change the page size without losing the line being read */
  function keepPlace(fn) {
    if (solo || !pane.clientHeight) { fn(); computeAnchors(); return; }
    if (!place) notePlace();
    const { p, frac } = place, el = pageEls[p];
    const xMid = pane.scrollWidth > pane.clientWidth ? (pane.scrollLeft + pane.clientWidth / 2) / pane.scrollWidth : 0.5;
    fn();
    pane.scrollTop = el.offsetTop + frac * el.offsetHeight - pane.clientHeight * READ;
    if (pane.scrollWidth > pane.clientWidth) pane.scrollLeft = xMid * pane.scrollWidth - pane.clientWidth / 2;
    computeAnchors();
    quietUntil = Math.max(quietUntil, Date.now() + 250);
  }
  function setZoom(z) {
    zoom = K.clamp(z, 0.5, 3);
    keepPlace(fitPages);
    zoomLabel.textContent = Math.round(zoom * 100) + '%';
    try { localStorage.setItem('thesis-zoom', String(zoom)); } catch (e) { /* storage blocked */ }
  }
  function wireZoom() {
    zoomLabel = document.getElementById('zoom-fit');
    try { zoom = K.clamp(parseFloat(localStorage.getItem('thesis-zoom')) || 1, 0.5, 3); } catch (e) { /* storage blocked */ }
    zoomLabel.textContent = Math.round(zoom * 100) + '%';
    document.getElementById('zoom-in').addEventListener('click', () => setZoom(zoom * 1.2));
    document.getElementById('zoom-out').addEventListener('click', () => setZoom(zoom / 1.2));
    zoomLabel.addEventListener('click', () => setZoom(1));
    /* pinch on a trackpad, or Ctrl + scroll, zooms the thesis */
    pane.addEventListener('wheel', (e) => { if (!e.ctrlKey) return; e.preventDefault(); setZoom(zoom * Math.exp(-e.deltaY * 0.002)); }, { passive: false });
  }
  function wireSplitter() {
    const split = document.querySelector('.split'), bar = document.getElementById('splitter');
    const MIN_L = 340, MIN_R = 300;
    let f = 0.5;
    try { f = parseFloat(localStorage.getItem('thesis-split')) || 0.5; } catch (e) { /* storage blocked */ }
    const apply = (v, save) => {
      const W = split.clientWidth - 10;
      if (W <= 0) return;
      f = K.clamp(v, Math.min(0.5, MIN_L / W), Math.max(0.5, 1 - MIN_R / W));
      keepPlace(() => { split.style.setProperty('--split', f.toFixed(4)); fitPages(); });
      bar.setAttribute('aria-valuenow', String(Math.round(f * 100)));
      if (save) { try { localStorage.setItem('thesis-split', String(f)); } catch (e) { /* storage blocked */ } }
    };
    bar.setAttribute('aria-valuemin', '0');
    bar.setAttribute('aria-valuemax', '100');
    apply(f, false);
    bar.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      try { bar.setPointerCapture(ev.pointerId); } catch (e) { /* keep dragging without capture */ }
      document.documentElement.classList.add('resizing');
      const r = split.getBoundingClientRect();
      const move = (e) => apply((e.clientX - r.left - 5) / (r.width - 10), false);
      const up = () => {
        bar.removeEventListener('pointermove', move);
        bar.removeEventListener('pointerup', up);
        bar.removeEventListener('pointercancel', up);
        document.documentElement.classList.remove('resizing');
        apply(f, true);
      };
      bar.addEventListener('pointermove', move);
      bar.addEventListener('pointerup', up);
      bar.addEventListener('pointercancel', up);
    });
    bar.addEventListener('dblclick', () => apply(0.5, true));
    bar.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      apply(f + (e.key === 'ArrowLeft' ? -0.03 : 0.03), true);
    });
  }

  /* ---------- the thesis itself: the PDF drawn by PDF.js over each page's picture ---------- */
  const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/';
  let pdfLib = null, pdfDoc = null, pdfTimer = 0;
  const pdfState = {};       /* page number -> { w, canvas, busy, again, text } */
  const near = new Set();    /* pages in view or close to it; only these keep a canvas */
  async function loadPdf() {
    try {
      pdfLib = await import(PDFJS + 'pdf.min.mjs');
      /* workers must come from this site, so a tiny local module imports the one on the CDN */
      const boot = URL.createObjectURL(new Blob(['import "' + PDFJS + 'pdf.worker.min.mjs";'], { type: 'text/javascript' }));
      pdfLib.GlobalWorkerOptions.workerPort = new Worker(boot, { type: 'module' });
      pdfDoc = await pdfLib.getDocument({ url: '../cv/thesis.pdf' }).promise;
    } catch (e) {
      console.warn('The PDF could not be loaded; the page pictures stay.', e);
      return;
    }
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) {
        const p = +en.target.dataset.page;
        if (en.isIntersecting) { near.add(p); renderPage(p); }
        else { near.delete(p); releasePage(p); }
      }
    }, { root: pane, rootMargin: '120% 0px' });
    for (const p in pageEls) io.observe(pageEls[p]);
  }
  function schedulePdf() {
    clearTimeout(pdfTimer);
    pdfTimer = setTimeout(() => near.forEach((p) => renderPage(p)), 180);
  }
  async function renderPage(p) {
    const el = pageEls[p];
    if (!pdfDoc || !el || el.hidden) return;
    const st = pdfState[p] || (pdfState[p] = {});
    const w = el.clientWidth;
    if (!w || (st.canvas && st.w === w)) return;
    if (st.busy) { st.again = true; return; }
    st.busy = true;
    try {
      const page = await pdfDoc.getPage(p);
      const base = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: w / base.width });
      /* sharp on high-density screens, but never more than 16 megapixels per page */
      const dpr = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(16e6 / (vp.width * vp.height)));
      const cv = h('canvas', { class: 'pdf', 'aria-hidden': 'true' });
      cv.width = Math.round(vp.width * dpr);
      cv.height = Math.round(vp.height * dpr);
      await page.render({ canvasContext: cv.getContext('2d'), viewport: vp, transform: dpr === 1 ? null : [dpr, 0, 0, dpr, 0, 0] }).promise;
      if (!near.has(p) && !solo) { cv.width = 0; return; }
      if (st.canvas) st.canvas.replaceWith(cv); else el.insertBefore(cv, el.querySelector('.pno'));
      st.canvas = cv;
      st.w = w;
      if (!st.text) {
        /* selectable text and links; both are laid out in page units, so they follow any later resize */
        st.text = true;
        const tl = h('div', { class: 'textLayer' });
        el.insertBefore(tl, el.querySelector('.pno'));
        await new pdfLib.TextLayer({ textContentSource: page.streamTextContent(), container: tl, viewport: vp }).render();
        await addLinks(page, el);
      }
    } catch (e) {
      console.warn('Page ' + p + ' did not render.', e);
    } finally {
      st.busy = false;
      if (st.again) { st.again = false; renderPage(p); }
    }
  }
  function releasePage(p) {
    const st = pdfState[p];
    if (!st || !st.canvas || st.busy) return;
    st.canvas.width = 0;
    st.canvas.remove();
    st.canvas = null;
    st.w = 0;
  }
  const pct = (v) => (v * 100).toFixed(3) + '%';
  async function addLinks(page, el) {
    const [x0, y0, x1, y1] = page.view, W = x1 - x0, H = y1 - y0;
    const box = h('div', { class: 'links' });
    for (const a of await page.getAnnotations({ intent: 'display' })) {
      if (a.subtype !== 'Link' || !(a.url || a.dest)) continue;
      const [ax0, ay0, ax1, ay1] = a.rect;
      const l = (Math.min(ax0, ax1) - x0) / W, r = (Math.max(ax0, ax1) - x0) / W;
      const t = (y1 - Math.max(ay0, ay1)) / H, b = (y1 - Math.min(ay0, ay1)) / H;
      const link = h('a', { style: { left: pct(l), top: pct(t), width: pct(r - l), height: pct(b - t) } });
      if (a.url) { link.href = a.url; link.target = '_blank'; link.rel = 'noopener'; link.title = a.url; }
      else { link.href = '#'; link.addEventListener('click', (ev) => { ev.preventDefault(); goToDest(a.dest); }); }
      box.append(link);
    }
    if (box.childNodes.length) el.insertBefore(box, el.querySelector('.pno'));
  }
  /* a link inside the thesis (contents, figure and section references) scrolls to its target, and the figure follows */
  async function goToDest(dest) {
    try {
      const d = typeof dest === 'string' ? await pdfDoc.getDestination(dest) : dest;
      if (!Array.isArray(d)) return;
      const p = (typeof d[0] === 'object' ? await pdfDoc.getPageIndex(d[0]) : d[0]) + 1;
      let y = 0;
      if (d[1] && d[1].name === 'XYZ' && typeof d[3] === 'number') {
        const [, py0, , py1] = (await pdfDoc.getPage(p)).view;
        y = K.clamp((py1 - d[3]) / (py1 - py0), 0, 1);
      }
      if (solo) { showSoloPage(p); return; }
      const el = pageEls[p];
      if (!el) return;
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      pane.scrollTo({ top: Math.max(0, el.offsetTop + y * el.offsetHeight - pane.clientHeight * READ + 8), behavior: reduce ? 'auto' : 'smooth' });
    } catch (e) {
      console.warn('Link target not found.', e);
    }
  }

  function safe(f) { try { f(); } catch (e) { console.error(e); } }

  function buildSelect() {
    for (const [label, test] of GROUPS) {
      const items = DEMOS.filter(test);
      if (!items.length) continue;
      const g = h('optgroup', { label });
      for (const d of items) g.append(h('option', { value: d.id }, (d.sec ? d.sec + '  ' : '') + d.title));
      sel.append(g);
    }
  }

  function buildPages() {
    const marks = {};
    for (const d of DEMOS) {
      for (const [p, y] of [[d.page, d.y]].concat(d.also || [])) (marks[p] = marks[p] || []).push({ d, y });
    }
    for (let p = FIRST_PAGE; p <= LAST_PAGE; p++) {
      const num = String(p).padStart(2, '0');
      const img = h('img', { src: 'pages/p' + num + '.webp', alt: 'Thesis page ' + p, width: 953, height: 1348, loading: p <= FIRST_PAGE + 1 ? 'eager' : 'lazy', decoding: 'async' });
      const el = h('div', { class: 'page', 'data-page': p }, img, h('span', { class: 'pno', 'aria-hidden': 'true' }, String(p)));
      for (const { d, y } of marks[p] || []) {
        const b = h('button', { type: 'button', class: 'mark', 'data-id': d.id, title: (d.sec ? d.sec + ' ' : '') + d.title, 'aria-label': 'Show demo: ' + d.title, style: { top: (y * 100).toFixed(2) + '%' } });
        b.addEventListener('click', () => activate(d.id, { scroll: true }));
        el.append(b);
      }
      pageEls[p] = el;
      pane.append(el);
    }
  }

  function computeAnchors() {
    anchors = [];
    for (const d of DEMOS) {
      for (const [p, y] of [[d.page, d.y]].concat(d.also || [])) {
        const el = pageEls[p];
        if (!el) continue;
        anchors.push({ id: d.id, page: p, abs: el.offsetTop + y * el.offsetHeight });
      }
    }
    anchors.sort((a, b) => a.abs - b.abs);
  }

  function pageAt(line) {
    let cur = FIRST_PAGE;
    for (let p = FIRST_PAGE; p <= LAST_PAGE; p++) { if (pageEls[p].offsetTop <= line) cur = p; else break; }
    return cur;
  }

  function syncFromScroll() {
    raf = 0;
    if (solo) return;
    const line = pane.scrollTop + pane.clientHeight * READ;
    pageInd.textContent = 'p. ' + pageAt(line);
    if (held || Date.now() < quietUntil || !anchors.length) return;
    let best = anchors[0];
    for (const a of anchors) { if (a.abs <= line + 4) best = a; else break; }   /* a few px of slack for rounding after a resize or zoom */
    if (active && best.id !== active.id) activate(best.id, { scroll: false });
  }

  function scrollToDemo(d, instant) {
    if (solo) { showSoloPage(d.page); return; }
    const el = pageEls[d.page];
    if (!el) return;
    const target = el.offsetTop + d.y * el.offsetHeight - pane.clientHeight * READ;
    quietUntil = Date.now() + 1200;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    pane.scrollTo({ top: Math.max(0, target), behavior: instant || reduce ? 'auto' : 'smooth' });
    if (instant || reduce) notePlace();
  }

  function setSolo() {
    solo = soloMQ.matches;
    document.documentElement.classList.toggle('solo', solo);
    if (solo) showSoloPage(active ? active.page : FIRST_PAGE);
    else {
      for (const p in pageEls) pageEls[p].hidden = false;
      fitPages();
      computeAnchors();
      if (active) scrollToDemo(active, true);
    }
  }

  function showSoloPage(p) {
    p = K.clamp(p, FIRST_PAGE, LAST_PAGE);
    soloPage = p;
    for (const k in pageEls) pageEls[k].hidden = +k !== p;
    soloLabel.textContent = 'Thesis page ' + p;
    document.getElementById('solo-prev').disabled = p <= FIRST_PAGE;
    document.getElementById('solo-next').disabled = p >= LAST_PAGE;
    pageInd.textContent = 'p. ' + p;
    fitPages();
    near.add(p);
    renderPage(p);
  }

  function updateMarks() {
    for (const b of pane.querySelectorAll('.mark')) b.classList.toggle('on', !!active && b.dataset.id === active.id);
  }

  function activate(id, opts) {
    opts = opts || {};
    const d = byId[id];
    if (!d) return;
    if (active === d) { if (opts.scroll) scrollToDemo(d, opts.instant); return; }
    if (cleanup) safe(cleanup);
    cleanup = null;
    resizeFns = [];
    K.tip.hide();
    active = d;
    renderStage(d);
    sel.value = d.id;
    updateMarks();
    try { history.replaceState(null, '', '#' + d.id); } catch (e) { /* sandboxed */ }
    if (opts.scroll) scrollToDemo(d, opts.instant);
    else if (!solo) pageInd.textContent = 'p. ' + pageAt(pane.scrollTop + pane.clientHeight * READ);
  }

  function step(dir) {
    const i = DEMOS.indexOf(active);
    const next = DEMOS[K.clamp(i + dir, 0, DEMOS.length - 1)];
    if (next && next !== active) activate(next.id, { scroll: true });
  }

  function renderStage(d) {
    stage.replaceChildren();
    stage.scrollTop = 0;
    const i = DEMOS.indexOf(d);
    const prev = h('button', { type: 'button', class: 'btn ghost icon', 'aria-label': 'Previous demo', title: 'Previous demo' }, '↑');
    const next = h('button', { type: 'button', class: 'btn ghost icon', 'aria-label': 'Next demo', title: 'Next demo' }, '↓');
    prev.disabled = i <= 0;
    next.disabled = i >= DEMOS.length - 1;
    prev.addEventListener('click', () => step(-1));
    next.addEventListener('click', () => step(1));
    stage.append(
      h('div', { class: 'stage-head' },
        h('p', { class: 'eyebrow' }, d.sec ? h('span', { class: 'sec' }, d.sec) : null, d.title),
        h('div', { class: 'stage-nav' }, prev, next))
    );
    /* the formula sits on top of the figure and follows it: panels set it again with live numbers */
    const eqHost = h('div', { class: 'eq-host' });
    const fig = h('div', { class: 'fig-host' });
    const ctl = h('div', { class: 'controls' });
    const ro = h('div', { class: 'readouts' });
    stage.append(eqHost, fig, ctl, ro);
    if (d.hint) stage.append(K.rich(h('p', { class: 'hint' }), d.hint));
    if (d.source) stage.append(K.rich(h('p', { class: 'source' }), d.source));

    const eq = K.eq(eqHost);
    const api = {
      fig, ctl, ro, eq,
      onResize(fn) { resizeFns.push(fn); },
      go: (id) => activate(id, { scroll: true }),
    };
    try { cleanup = d.build ? d.build(api) || null : null; }
    catch (e) { console.error(e); fig.append(h('p', { class: 'err' }, 'This demo failed to load (' + e.message + ').')); }
    /* panels without live numbers show their formula as written */
    if (!eq.touched && d.math) eq.set(d.math.flatMap((t) => t.split('\\qquad')).map((p) => p.trim().replace(/,\s*$/, '')).filter(Boolean));
  }

  /* point at a coloured symbol in the formula, or at its part of the figure, and both light up */
  const FOCUS = [['t1', 'tt1'], ['t2', 'tt2'], ['t3', 'tt3'], ['calm', 'tcalm'], ['excited', 'texc'], ['auth', 'tauth']];
  function focusFrom(target) {
    for (let el = target; el && el !== stage; el = el.parentNode) {
      const c = el.classList;
      if (!c) continue;
      for (const [k, texCls] of FOCUS) {
        if (c.contains(texCls) || c.contains('s-' + k) || c.contains('f-' + k)) return k;
      }
    }
    return null;
  }
  function wireFocus() {
    stage.addEventListener('pointerover', (ev) => {
      const k = focusFrom(ev.target);
      if (k) stage.dataset.focus = k;
      else delete stage.dataset.focus;
    });
    stage.addEventListener('pointerleave', () => { delete stage.dataset.focus; });
  }

  /* chip that jumps to another demo, for use inside panels */
  K.chip = function (id, text) {
    const b = h('button', { type: 'button', class: 'chip' }, text);
    b.addEventListener('click', () => activate(id, { scroll: true }));
    return b;
  };

  window.addEventListener('DOMContentLoaded', init);
})();
