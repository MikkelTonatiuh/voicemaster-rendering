import { rasterName, buildField, contours, ringsAround, nameTrack, descend, pieces, pathData, bounds, svgEl, peakIn, NAME } from "./field-lossland.js";

/* Field and trail are two views of one surface, both in LAYOUT pixels: the
   background SVG draws the contours, the h1's SVG draws the run that descends
   them. Layout pixels matter — getBoundingClientRect returns visual pixels,
   which page zoom scales, and mixing the two is what tore the header away from
   its own basin when the page was zoomed. */
function offsetIn(el, container) {
  let x = 0, y = 0;
  for (let n = el; n && n !== container; n = n.offsetParent) {
    x += n.offsetLeft;
    y += n.offsetTop;
    if (!n.offsetParent || n.offsetParent === container) break;
  }
  return [x, y];
}

export function mountScene({ fieldSvg, nameHost, mathHost, fontPx = 34, replayMs = 14000 }) {
  let anims = [];
  let timer = 0, resizeTimer = 0;
  let parts = [], dots = [], notes = [], rings = [], leader = null, bloom = null, totalLen = 0, slowLen = 0;
  let sheen = null, sheenRaf = 0;
  let builtKey = "";
  let recheckDepth = 0, recheckTimer = 0;
  const r1 = (n) => Math.round(n * 10) / 10;

  /* Content height, measured WITHOUT the field. Any scrollHeight of an
     ancestor includes the absolutely-positioned field, so feeding one back in
     lets the field read its own height and ratchet upward on every rebuild. */
  const contentHeight = (container) => {
    const cTop = container.getBoundingClientRect().top;
    let h = 0;
    for (const el of container.children) {
      if (el === fieldSvg) continue;
      const r = el.getBoundingClientRect();
      if (r.height) h = Math.max(h, r.bottom - cTop);
    }
    return Math.max(320, Math.round(h), container.clientHeight, window.innerHeight);
  };

  const build = () => {
    const container = fieldSvg.parentElement;
    const docW = Math.max(320, container.clientWidth);
    const docH = contentHeight(container);
    /* The header scales as a whole rather than wrapping or clipping: rasterise
       once at the target size, and if the ink is wider than the column allows,
       rasterise again at the size that fits. Everything downstream — field,
       track, run — is generated from the result, so one measurement governs. */
    const [nameX, nameY] = offsetIn(nameHost, container);
    const margin = 16;
    const avail = Math.max(120, docW - nameX - margin);
    let raster = rasterName(fontPx);
    if (raster.cssW > avail) {
      raster = rasterName(Math.max(17, fontPx * (avail / raster.cssW)));
    }

    const field = buildField({ docW, docH, raster, nameX, nameY, cell: 4 });
    // remember exactly what this build was measured against, so the watcher
    // compares against the built geometry rather than a later DOM snapshot
    builtKey = [nameX, nameY, nameHost.offsetWidth, docW, docH].join("|");
    const track = nameTrack(raster, nameX, nameY);
    // start on a real summit of the surface above the name: the run then
    // visibly crosses contour after contour on its way down into the basin
    const bandTop = 16;
    const bandBottom = nameY - 4;
    const peak = peakIn(field, 16, nameX + raster.cssW * 0.55, bandTop, Math.max(bandTop + 8, bandBottom - 10));
    const run = descend(field, track, { docW, docH, bandTop, bandBottom, start: peak });
    const { list, total } = pieces(run);
    totalLen = total;

    fieldSvg.setAttribute("viewBox", `0 0 ${Math.round(docW)} ${Math.round(docH)}`);
    fieldSvg.setAttribute("preserveAspectRatio", "none");
    fieldSvg.style.height = `${Math.round(docH)}px`;
    const frag = document.createDocumentFragment();
    rings = [];
    /* The contour segments are grouped by distance from where the run converges,
       so the echo can travel outward from that point. Visually identical to
       grouping by level — same lines, same weight. */
    const epi = run.pts[run.pts.length - 1];
    ringsAround(contours(field), epi[0], epi[1]).forEach((d) => {
      if (!d) return;
      const el = svgEl("path", {
        d,
        fill: "none",
        stroke: "var(--line, #E6E2D8)",
        "stroke-width": "0.6",
        "stroke-linecap": "round",
        opacity: "0.09",
      });
      frag.appendChild(el);
      rings.push(el);
    });
    fieldSvg.replaceChildren(frag);

    const bb = bounds(run.pts);
    const pad = 8;
    const svg = svgEl("svg", {
      viewBox: `${bb.x0 - pad} ${bb.y0 - pad} ${bb.w + pad * 2} ${bb.h + pad * 2}`,
      role: "img",
      "aria-label": NAME,
    });
    svg.appendChild(svgEl("title", {})).textContent = NAME;
    svg.style.position = "absolute";
    svg.style.left = `${bb.x0 - pad - nameX}px`;
    svg.style.top = `${bb.y0 - pad - nameY}px`;
    svg.style.width = `${bb.w + pad * 2}px`;
    svg.style.height = `${bb.h + pad * 2}px`;
    svg.style.overflow = "visible";
    svg.style.cursor = "pointer";

    /* One paint server helper, kept for the step annotations. */
    const defs = svgEl("defs", {});
    svg.appendChild(defs);

    parts = list.map((piece) => {
      const len = Math.max(1, Math.round(piece.len));
      const travel = piece.mode === "travel";
      const stepping = piece.mode === "run";
      const el = svgEl("path", {
        d: pathData(piece.pts),
        fill: "none",
        stroke: "var(--line, #E6E2D8)",
        "stroke-width": travel ? "0.9" : stepping ? "0.7" : "1.7",
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        opacity: travel ? "0.2" : stepping ? "0.45" : "1",
        "stroke-dasharray": `${len} ${len}`,
        "stroke-dashoffset": String(len),
      });
      svg.appendChild(el);
      return { el, len, start: piece.start, mode: piece.mode, opacity: travel ? 0.2 : stepping ? 0.45 : 1 };
    });

    slowLen = (list.find((p) => p.mode !== "run") || { start: total }).start || total;

    /* One mark per iterate on the approach: the run is a sequence of steps, and
       the marks are where the optimizer actually evaluated. */
    dots = [];
    let acc = 0;
    const it = run.iterates || [];
    for (let i = 1; i < it.length; i++) {
      acc += Math.hypot(it[i][0] - it[i - 1][0], it[i][1] - it[i - 1][1]);
      if (i % 2) continue;
      const c = svgEl("circle", {
        cx: String(Math.round(it[i][0] * 10) / 10),
        cy: String(Math.round(it[i][1] * 10) / 10),
        r: "2.2",
        fill: "var(--line, #E6E2D8)",
        opacity: "0.95",
      });
      svg.appendChild(c);
      dots.push({ el: c, start: acc });
    }

    leader = svgEl("path", {
      d: pathData(run.pts), fill: "none", stroke: "var(--run, #ffffff)", "stroke-width": "2.6",
      "stroke-linecap": "round", "stroke-linejoin": "round",
      "stroke-dasharray": `18 ${Math.round(total) * 2}`, "stroke-dashoffset": "18", opacity: "0",
    });

    /* The opening seconds show the work: at the first few iterates, the actual
       step vector -η∇L as an arrow with its gradient magnitude, under the
       update rule set in italic serif. Once the run picks up speed the
       annotation clears and it just writes. */
    notes = [];

    const MATH = "'Iowan Old Style', 'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif";
    const mathText = (x, y, str, size, fill, extra) => {
      const t = svgEl("text", Object.assign({
        x: String(r1(x)), y: String(r1(y)),
        fill, "font-size": String(size), "font-style": "italic",
        "font-family": MATH, "letter-spacing": "0.015em", opacity: "0",
      }, extra || {}));
      t.textContent = str;
      svg.appendChild(t);
      return t;
    };

    const gr = run.grads || [];
    let nAcc = 0;
    for (let i = 0; i < Math.min(5, it.length - 1); i++) {
      if (i > 0) nAcc += Math.hypot(it[i][0] - it[i - 1][0], it[i][1] - it[i - 1][1]);
      const g = gr[i];
      if (!g) continue;
      const mag = Math.hypot(g[0], g[1]) || 1;
      const L = Math.min(34, Math.max(17, mag * g[2] * 2.6));
      const ux = -g[0] / mag, uy = -g[1] / mag;
      const ox = it[i][0], oy = it[i][1];
      const ex = ox + ux * L, ey = oy + uy * L;
      const wing = 4.4, px = -uy, py = ux;
      const arrow = svgEl("path", {
        d: `M${r1(ox)} ${r1(oy)}L${r1(ex)} ${r1(ey)}`
          + `M${r1(ex)} ${r1(ey)}L${r1(ex - ux * wing + px * wing * 0.62)} ${r1(ey - uy * wing + py * wing * 0.62)}`
          + `M${r1(ex)} ${r1(ey)}L${r1(ex - ux * wing - px * wing * 0.62)} ${r1(ey - uy * wing - py * wing * 0.62)}`,
        fill: "none",
        stroke: "var(--warm, #E8A33D)",
        "stroke-width": "1",
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        opacity: "0",
      });
      svg.appendChild(arrow);
      notes.push({ el: arrow, start: nAcc, opacity: 0.9 });
      // the number being computed, on two steps only — more reads as clutter
      if (i === 0 || i === 3) {
        const val = mathText(ex + 9, ey + (i === 0 ? -4 : 9), `\u2016\u2207L\u2016 = ${mag.toFixed(2)}`, 9.5, "var(--line, #E6E2D8)");
        notes.push({ el: val, start: nAcc, opacity: 0.5 });
      }
    }

    if (it.length && mathHost) {
      /* The rule is real 3D geometry (math3d.js); this places and sizes it.
         Position and width are both clamped to the container, so it cannot run
         off a narrow column; it reuses the same column measurement as the name. */
      const mw = Math.min(330, Math.max(150, avail));
      const mh = Math.round(mw * 0.29);
      const mx = Math.min(it[0][0] + 96, nameX + Math.max(150, avail) - mw);
      const my = it[0][1] + (nameY - it[0][1]) * 0.42;
      mathHost.style.width = `${Math.round(mw)}px`;
      mathHost.style.height = `${mh}px`;
      mathHost.style.left = `${r1(Math.max(0, mx - nameX))}px`;
      mathHost.style.top = `${r1(my - nameY - mh * 0.48)}px`;
      if (typeof mathHost.__resize === "function") mathHost.__resize();
      notes.push({ el: mathHost, start: 0, opacity: 1, html: true });
    }

    svg.append(leader);

    nameHost.style.position = "relative";
    nameHost.style.height = `${Math.round(raster.cssH)}px`;
    // keep any non-SVG children (the 3D math host lives here)
    nameHost.querySelectorAll(":scope > svg").forEach((el) => el.remove());
    nameHost.appendChild(svg);
  };

  const settle = () => {
    parts.forEach((p) => {
      p.el.setAttribute("stroke-dashoffset", "0");
      p.el.setAttribute("opacity", String(p.opacity));
    });
    if (bloom) bloom.setAttribute("opacity", "0");
    dots.forEach((d) => d.el.setAttribute("opacity", "0.95"));
    notes.forEach((n) => {
      if (n.html) n.el.style.opacity = "0";
      else n.el.setAttribute("opacity", "0");
    });
    leader.setAttribute("opacity", "0");
  };

  /* Two speeds. The descent runs slowly while the step vectors and the update
     rule are on screen, then the run accelerates, the annotation clears, and
     the rest of the time goes to writing the name. */
  const SLOW = 3000, FAST = 3100, DELAY = 350;
  const timeAt = (s) => (s <= slowLen
    ? (slowLen ? (s / slowLen) * SLOW : 0)
    : SLOW + ((s - slowLen) / Math.max(1, totalLen - slowLen)) * FAST);

  const play = () => {
    anims.forEach((a) => a.cancel());
    anims = [];
    if (!leader.animate) { settle(); return; }
    const ease = "linear";
    parts.forEach(({ el, len, start, opacity }) => {
      el.setAttribute("stroke-dashoffset", String(len));
      const delay = DELAY + timeAt(start);
      const dur = Math.max(50, timeAt(start + len) - timeAt(start));
      const a = el.animate(
        { strokeDashoffset: [len, 0] },
        { duration: dur, delay, easing: ease, fill: "forwards" },
      );
      a.onfinish = () => el.setAttribute("stroke-dashoffset", "0");
      anims.push(a);
      /* round caps show a dot at a subpath's start even when the dash is fully
         offset, so each piece stays fully transparent until its sweep begins */
      const fade = el.animate(
        [{ opacity: 0 }, { opacity }],
        { duration: 1, delay, fill: "both" },
      );
      fade.onfinish = () => el.setAttribute("opacity", String(opacity));
      anims.push(fade);
    });
    const lead = leader.animate(
      [
        { strokeDashoffset: 18, opacity: 0.95, offset: 0 },
        { strokeDashoffset: 18 - slowLen, opacity: 0.95, offset: SLOW / (SLOW + FAST) },
        { strokeDashoffset: 18 - totalLen, opacity: 0, offset: 1 },
      ],
      { duration: SLOW + FAST, delay: DELAY, easing: ease, fill: "forwards" },
    );
    lead.onfinish = () => leader.setAttribute("opacity", "0");
    anims.push(lead);
    dots.forEach(({ el, start }) => {
      const at = DELAY + timeAt(start);
      const a = el.animate(
        [{ opacity: 0, offset: 0 }, { opacity: 0, offset: 0.999 }, { opacity: 0.95, offset: 1 }],
        { duration: Math.max(1, at + 90), easing: "linear", fill: "forwards" },
      );
      anims.push(a);
    });
    notes.forEach(({ el, start, opacity, html }) => {
      if (html) el.style.opacity = "0"; else el.setAttribute("opacity", "0");
      const inAt = DELAY + timeAt(start);
      const a = el.animate([{ opacity: 0 }, { opacity }], { duration: 340, delay: inAt, easing: "ease-out", fill: "forwards" });
      anims.push(a);
      const b = el.animate([{ opacity }, { opacity: 0 }], { duration: 420, delay: DELAY + SLOW * 0.92, easing: "ease-in", fill: "forwards" });
      b.onfinish = () => { if (html) el.style.opacity = "0"; else el.setAttribute("opacity", "0"); };
      anims.push(b);
    });

    /* Convergence echo: reaching the minimum sends a faint gold pulse outward
       from that point through the contour field, nearest rings first.
       Deliberately near-threshold. */
    const cs = getComputedStyle(document.documentElement);
    const line = (cs.getPropertyValue("--line") || "#E6E2D8").trim() || "#E6E2D8";
    const warm = (cs.getPropertyValue("--warm") || "#E8A33D").trim() || "#E8A33D";
    rings.forEach((el, i) => {
      const a = el.animate(
        [
          { stroke: line, opacity: 0.09 },
          { stroke: warm, opacity: 0.21, offset: 0.3 },
          { stroke: line, opacity: 0.09 },
        ],
        { duration: 1200, delay: DELAY + SLOW + FAST + 100 + i * 42, easing: "ease-out" },
      );
      anims.push(a);
    });

    if (bloom) {
      bloom.setAttribute("opacity", "0");
    }
  };

  /* The specular band travels along the strokes: a slow pass, a long rest, and
     it only runs while the tab is visible. */
  /* One slow specular pass across the foil, then it stops. A looping shimmer
     is what makes this kind of thing look cheap. */
  const sweepSpecular = (delayMs) => {
    if (!sheen) return;
    cancelAnimationFrame(sheenRaf);
    const t0 = performance.now() + delayMs;
    const DUR = 1500;
    const step = (now) => {
      if (!sheen) return;
      const u = (now - t0) / DUR;
      if (u >= 1) {
        sheen.spec.setAttribute("gradientTransform", `translate(${(sheen.span * 1.2).toFixed(1)} 0)`);
        return;
      }
      const e = u <= 0 ? 0 : u * u * (3 - 2 * u);
      sheen.spec.setAttribute("gradientTransform", `translate(${(e * sheen.span).toFixed(1)} 0)`);
      sheenRaf = requestAnimationFrame(step);
    };
    sheenRaf = requestAnimationFrame(step);
  };

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches && window.self === window.top;
  /* EVERY build re-measures itself after paint, not just the first one. A build
     can land on a transient layout (mid-zoom, fonts still loading, the shaded
     canvas not yet sized); if only the initial start() re-checked, a resize
     rebuild would keep whatever it happened to measure and the watcher key
     would stay permanently out of step with the DOM. The depth guard stops the
     recursion once the measurement is stable, or after a few passes if the
     layout is oscillating. */
  const recheck = () => {
    if (geometryKey() === builtKey) { recheckDepth = 0; return; }
    if (recheckDepth++ > 4) return;
    start();
  };

  const start = () => {
    build();
    if (reduce) { settle(); cancelAnimationFrame(sheenRaf); }
    else { play(); }
    clearTimeout(recheckTimer);
    requestAnimationFrame(() => requestAnimationFrame(recheck));
    recheckTimer = setTimeout(recheck, 420);
  };

  /* Zoom and reflow both move the h1, and the run is generated in layout
     pixels against its position — so rebuild whenever the geometry the build
     was measured against no longer matches the DOM. */
  const geometryKey = () => {
    const container = fieldSvg.parentElement;
    const [x, y] = offsetIn(nameHost, container);
    return [x, y, nameHost.offsetWidth, Math.max(320, container.clientWidth), contentHeight(container)].join("|");
  };

  start();
  nameHost.addEventListener("click", () => { if (!reduce) play(); });
  if (!reduce && replayMs) timer = setInterval(play, replayMs);

  const rebuild = () => { recheckDepth = 0; recheck(); };
  const onResize = () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(rebuild, 200); };
  window.addEventListener("resize", onResize);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", onResize);
    window.visualViewport.addEventListener("scroll", onResize);
  }
  const ro = new ResizeObserver(onResize);
  ro.observe(nameHost);
  ro.observe(document.body);
  ro.observe(fieldSvg.parentElement);
  // fonts land after first paint and change the column height
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(rebuild).catch(() => undefined);

  return {
    destroy() {
      clearInterval(timer);
      clearTimeout(resizeTimer);
      clearTimeout(recheckTimer);
      cancelAnimationFrame(sheenRaf);
      sheen = null;
      window.removeEventListener("resize", onResize);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", onResize);
        window.visualViewport.removeEventListener("scroll", onResize);
      }
      ro.disconnect();
      anims.forEach((a) => a.cancel());
    },
  };
}
