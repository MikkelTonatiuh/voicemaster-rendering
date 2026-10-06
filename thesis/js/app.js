/* app.js: demo registry, thesis reader, scroll sync and navigation. */
(function () {
  'use strict';
  const h = K.h;
  const DEMOS = [];
  const byId = {};
  K.demo = function (d) { DEMOS.push(d); byId[d.id] = d; };
  K.go = function (id) { activate(id, { scroll: true }); };

  const FIRST_PAGE = 2, LAST_PAGE = 50;
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

    pane.addEventListener('scroll', () => { if (!raf) raf = setTimeout(syncFromScroll, 60); }, { passive: true });
    pane.addEventListener('scrollend', () => { quietUntil = 0; });

    let rt = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(rt);
      rt = requestAnimationFrame(() => { computeAnchors(); resizeFns.forEach((f) => safe(f)); });
    });
    ro.observe(stage);
    ro.observe(pane);

    const rerender = () => resizeFns.forEach((f) => safe(f));
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', rerender);
    new MutationObserver(rerender).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    soloMQ.addEventListener('change', setSolo);
    setSolo();
    window.addEventListener('hashchange', () => { const id = location.hash.slice(1); if (byId[id]) activate(id, { scroll: true }); });

    const start = byId[location.hash.slice(1)] ? location.hash.slice(1) : 'overview';
    computeAnchors();
    activate(start, { scroll: true, instant: true });
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
    for (const a of anchors) { if (a.abs <= line + 1) best = a; else break; }
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
  }

  function setSolo() {
    solo = soloMQ.matches;
    document.documentElement.classList.toggle('solo', solo);
    if (solo) showSoloPage(active ? active.page : FIRST_PAGE);
    else {
      for (const p in pageEls) pageEls[p].hidden = false;
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
