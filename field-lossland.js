/* One loss surface for the page. Its minimum is the name.

   1. rasterName  – the name drawn as real text, so it spells correctly
   2. edt         – exact Euclidean distance transform of that raster
   3. field       – loss(x,y) = distance-to-name + low-frequency value noise
   4. contours    – marching squares on the field, levels spread to the edges
   5. descend     – momentum GD driven by the field's own gradient

   Everything lives in document pixels, so the trail sits in its own basin. */

export const NAME = "Mikkel T. Ch\u00e1vez Petersen";
export const FONT = (px) => `600 ${px}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif`;

/* ---------- name raster ---------- */
export function rasterName(fontPx, ss = 2) {
  const probe = document.createElement("canvas").getContext("2d");
  probe.font = FONT(fontPx);
  try { probe.letterSpacing = `${(-0.02 * fontPx).toFixed(2)}px`; } catch {}
  const m = probe.measureText(NAME);
  const asc = m.actualBoundingBoxAscent || fontPx * 0.75;
  const desc = m.actualBoundingBoxDescent || fontPx * 0.25;
  const w = Math.ceil(m.width), h = Math.ceil(asc + desc);

  const c = document.createElement("canvas");
  c.width = Math.ceil(w * ss);
  c.height = Math.ceil(h * ss);
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.scale(ss, ss);
  ctx.font = FONT(fontPx);
  try { ctx.letterSpacing = `${(-0.02 * fontPx).toFixed(2)}px`; } catch {}
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#fff";
  ctx.fillText(NAME, 0, asc);

  const px = ctx.getImageData(0, 0, c.width, c.height).data;
  const ink = new Uint8Array(c.width * c.height);
  for (let i = 0, n = ink.length; i < n; i++) ink[i] = px[i * 4 + 3] > 110 ? 1 : 0;
  return { ink, w: c.width, h: c.height, ss, cssW: w, cssH: h };
}

/* ---------- exact EDT (Felzenszwalb & Huttenlocher) ---------- */
const INF = 1e20;
function edt1d(f, d, v, z, n) {
  let k = 0;
  v[0] = 0; z[0] = -INF; z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q; z[k] = s; z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

/* squared EDT of a binary grid: 0 inside ink, growing outward */
export function edt(bin, w, h) {
  const out = new Float64Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = bin[i] ? 0 : INF;
  const n = Math.max(w, h);
  const f = new Float64Array(n), d = new Float64Array(n);
  const v = new Int32Array(n), z = new Float64Array(n + 1);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = out[y * w + x];
    edt1d(f, d, v, z, h);
    for (let y = 0; y < h; y++) out[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    const off = y * w;
    for (let x = 0; x < w; x++) f[x] = out[off + x];
    edt1d(f, d, v, z, w);
    for (let x = 0; x < w; x++) out[off + x] = Math.sqrt(d[x]);
  }
  return out;
}

/* ---------- noise ---------- */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const smoothstep = (t) => t * t * (3 - 2 * t);
function lattice(n, rnd) {
  const v = new Float32Array(n * n);
  for (let i = 0; i < v.length; i++) v[i] = rnd() * 2 - 1;
  return { n, v };
}
function noiseAt(L, x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = smoothstep(x - xi), fy = smoothstep(y - yi);
  const c = (i, j) => L.v[(((j % L.n) + L.n) % L.n) * L.n + (((i % L.n) + L.n) % L.n)];
  const a = c(xi, yi), b = c(xi + 1, yi), d = c(xi, yi + 1), e = c(xi + 1, yi + 1);
  const t = a + (b - a) * fx, u = d + (e - d) * fx;
  return t + (u - t) * fy;
}

/* ---------- the field ---------- */
export function buildField({ docW, docH, raster, nameX, nameY, cell = 4, seed = 0x5eed1a9 }) {
  const cols = Math.ceil(docW / cell) + 1;
  const rows = Math.ceil(docH / cell) + 1;

  // stamp the name into the coarse grid, then distance-transform the whole page
  const bin = new Uint8Array(cols * rows);
  const s = raster.ss;
  for (let j = 0; j < rows; j++) {
    const py = j * cell - nameY;
    const ry = Math.round(py * s);
    if (ry < 0 || ry >= raster.h) continue;
    for (let i = 0; i < cols; i++) {
      const rx = Math.round((i * cell - nameX) * s);
      if (rx < 0 || rx >= raster.w) continue;
      if (raster.ink[ry * raster.w + rx]) bin[j * cols + i] = 1;
    }
  }

  const dist = edt(bin, cols, rows);
  const rnd = mulberry32(seed);
  const L1 = lattice(16, rnd), L2 = lattice(32, rnd), L3 = lattice(64, rnd);

  /* Terrain first, name second. The distance transform is passed through log1p
     so it only dominates within a few tens of pixels of the letters; past that
     the octave noise and the placed features take over, which is what gives
     ridges, saddles and competing basins instead of one set of rings. A wide
     well centred on the name then guarantees it is still the global minimum. */
  const feats = [];
  const band = nameY + raster.cssH;
  for (let i = 0; i < 6; i++) {
    feats.push({
      x: docW * (0.06 + 0.9 * rnd()),
      y: band * (0.05 + 0.95 * rnd()),
      s: 60 + rnd() * 150,
      d: (rnd() < 0.5 ? -1 : 1) * (70 + rnd() * 120),
    });
  }
  for (let i = 0; i < 11; i++) {
    feats.push({
      x: docW * rnd(),
      y: band + (docH - band) * rnd(),
      s: 110 + rnd() * 300,
      d: (rnd() < 0.5 ? -1 : 1) * (90 + rnd() * 190),
    });
  }

  const nameCx = nameX + raster.cssW / 2, nameCy = nameY + raster.cssH / 2;
  const nameS = Math.max(150, raster.cssW * 0.42);

  const f = new Float32Array(cols * rows);
  let max = 0, min = Infinity;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = i * cell, y = j * cell;
      let v = Math.log1p(dist[j * cols + i] * cell) * 36
        + noiseAt(L1, x / 540, y / 540) * 140
        + noiseAt(L2, x / 225, y / 225) * 62
        + noiseAt(L3, x / 92, y / 92) * 24;
      for (let k = 0; k < feats.length; k++) {
        const ft = feats[k];
        const dx = x - ft.x, dy = y - ft.y;
        v += ft.d * Math.exp(-(dx * dx + dy * dy) / (2 * ft.s * ft.s));
      }
      const ndx = x - nameCx, ndy = y - nameCy;
      v -= 330 * Math.exp(-(ndx * ndx + ndy * ndy) / (2 * nameS * nameS));
      f[j * cols + i] = v;
      if (v > max) max = v;
      if (v < min) min = v;
    }
  }

  const sample = (x, y) => {
    const gx = Math.min(cols - 1.001, Math.max(0, x / cell));
    const gy = Math.min(rows - 1.001, Math.max(0, y / cell));
    const i = Math.floor(gx), j = Math.floor(gy);
    const tx = gx - i, ty = gy - j;
    const a = f[j * cols + i], b = f[j * cols + i + 1];
    const c = f[(j + 1) * cols + i], d = f[(j + 1) * cols + i + 1];
    return (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * ty;
  };

  const grad = (x, y) => {
    const e = cell;
    return [(sample(x + e, y) - sample(x - e, y)) / (2 * e), (sample(x, y + e) - sample(x, y - e)) / (2 * e)];
  };

  return { f, cols, rows, cell, max, min, sample, grad };
}

/* ---------- contour extraction ---------- */
const r1 = (n) => Math.round(n * 10) / 10;

export function contours(field, levels = 22) {
  const { f, cols, rows, cell, max, min } = field;
  const isos = [];
  // evenly spaced through the surface's actual range: real topography, not rings
  for (let i = 0; i < levels; i++) isos.push(min + (max - min) * ((i + 0.5) / levels));

  const segs = [];
  isos.forEach((iso) => {
    for (let j = 0; j < rows - 1; j++) {
      for (let i = 0; i < cols - 1; i++) {
        const a = f[j * cols + i], b = f[j * cols + i + 1];
        const c = f[(j + 1) * cols + i + 1], e = f[(j + 1) * cols + i];
        const code = (a > iso ? 8 : 0) | (b > iso ? 4 : 0) | (c > iso ? 2 : 0) | (e > iso ? 1 : 0);
        if (code === 0 || code === 15) continue;
        const x0 = i * cell, y0 = j * cell;
        const T = () => [x0 + cell * ((iso - a) / (b - a)), y0];
        const R = () => [x0 + cell, y0 + cell * ((iso - b) / (c - b))];
        const B = () => [x0 + cell * ((iso - e) / (c - e)), y0 + cell];
        const Lf = () => [x0, y0 + cell * ((iso - a) / (e - a))];
        const seg = (p, q) => { segs.push([p[0], p[1], q[0], q[1]]); };
        switch (code) {
          case 1: case 14: seg(Lf(), B()); break;
          case 2: case 13: seg(B(), R()); break;
          case 3: case 12: seg(Lf(), R()); break;
          case 4: case 11: seg(T(), R()); break;
          case 6: case 9: seg(T(), B()); break;
          case 7: case 8: seg(Lf(), T()); break;
          case 5: seg(Lf(), T()); seg(B(), R()); break;
          case 10: seg(Lf(), B()); seg(T(), R()); break;
          default: break;
        }
      }
    }
  });
  return segs;
}

/* Group contour segments into rings by distance from a point, so a pulse can
   travel outward from an epicentre instead of level by level. */
export function ringsAround(segs, cx, cy, count = 30) {
  let maxD = 0;
  const d = new Float64Array(segs.length);
  for (let i = 0; i < segs.length; i++) {
    const mx = (segs[i][0] + segs[i][2]) / 2, my = (segs[i][1] + segs[i][3]) / 2;
    const v = Math.hypot(mx - cx, my - cy);
    d[i] = v;
    if (v > maxD) maxD = v;
  }
  const step = (maxD || 1) / count;
  const buckets = Array.from({ length: count }, () => "");
  for (let i = 0; i < segs.length; i++) {
    const b = Math.min(count - 1, Math.floor(d[i] / step));
    const s = segs[i];
    buckets[b] += `M${r1(s[0])} ${r1(s[1])}L${r1(s[2])} ${r1(s[3])}`;
  }
  return buckets;
}

/* ---------- centerline writing track ----------
   Zhang-Suen thinning of the name raster gives a one-pixel skeleton: the
   medial axis of the letterforms. Walking it in reading order is what a pen
   does, so the trail writes the letters instead of outlining them. The
   skeleton is also exactly the floor of the distance field the background
   contours, so pen and terrain remain the same object. */
export function skeletonize(src, w, h) {
  const im = Uint8Array.from(src);
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : im[y * w + x]);
  let changed = true;
  const kill = [];
  while (changed) {
    changed = false;
    for (let step = 0; step < 2; step++) {
      kill.length = 0;
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          if (!im[y * w + x]) continue;
          const p2 = at(x, y - 1), p3 = at(x + 1, y - 1), p4 = at(x + 1, y), p5 = at(x + 1, y + 1);
          const p6 = at(x, y + 1), p7 = at(x - 1, y + 1), p8 = at(x - 1, y), p9 = at(x - 1, y - 1);
          const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (b < 2 || b > 6) continue;
          const seq = [p2, p3, p4, p5, p6, p7, p8, p9, p2];
          let a = 0;
          for (let i = 0; i < 8; i++) if (seq[i] === 0 && seq[i + 1] === 1) a++;
          if (a !== 1) continue;
          if (step === 0) {
            if (p2 * p4 * p6 !== 0) continue;
            if (p4 * p6 * p8 !== 0) continue;
          } else {
            if (p2 * p4 * p8 !== 0) continue;
            if (p2 * p6 * p8 !== 0) continue;
          }
          kill.push(y * w + x);
        }
      }
      if (kill.length) { changed = true; for (const k of kill) im[k] = 0; }
    }
  }
  return im;
}

export function nameTrack(raster, nameX, nameY) {
  const { ink, w, h, ss } = raster;

  /* Separate the small marks — i-dots, the period after T, the accent on á —
     before thinning. They are their own connected components, and a skeleton
     of a blob that small is noise; drawing them as marks keeps them, while the
     letters keep the strict spur filter that makes the shapes precise. */
  const label = new Int32Array(w * h).fill(-1);
  const body = new Uint8Array(w * h);
  const marks = [];
  const stack = [];
  let next = 0;
  for (let s = 0; s < ink.length; s++) {
    if (!ink[s] || label[s] !== -1) continue;
    const id = next++;
    stack.length = 0;
    stack.push(s);
    label[s] = id;
    const cells = [];
    while (stack.length) {
      const q = stack.pop();
      cells.push(q);
      const qx = q % w, qy = (q / w) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = qx + dx, ny = qy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const n = ny * w + nx;
          if (!ink[n] || label[n] !== -1) continue;
          label[n] = id;
          stack.push(n);
        }
      }
    }
    if (cells.length <= 34 * ss * ss) {
      let sx = 0, sy = 0;
      for (const q of cells) { sx += q % w; sy += (q / w) | 0; }
      marks.push([sx / cells.length, sy / cells.length]);
    } else {
      for (const q of cells) body[q] = 1;
    }
  }

  const sk = skeletonize(body, w, h);
  const seen = new Uint8Array(w * h);
  const N = [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
  const idx = (x, y) => y * w + x;
  const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && sk[idx(x, y)] === 1;
  const deg = (x, y) => N.reduce((n, [dx, dy]) => n + (on(x + dx, y + dy) ? 1 : 0), 0);

  const strokes = [];
  const walk = (sx, sy) => {
    const line = [];
    let x = sx, y = sy, dir = null;
    for (;;) {
      seen[idx(x, y)] = 1;
      line.push([x, y]);
      let best = null, bestScore = -Infinity;
      for (const [dx, dy] of N) {
        const nx = x + dx, ny = y + dy;
        if (!on(nx, ny) || seen[idx(nx, ny)]) continue;
        const score = dir ? dir[0] * dx + dir[1] * dy : 1;
        if (score > bestScore) { bestScore = score; best = [nx, ny, dx, dy]; }
      }
      if (!best) break;
      dir = [best[2], best[3]];
      x = best[0]; y = best[1];
    }
    if (line.length > 4) strokes.push(line);
  };

  const ends = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (on(x, y) && deg(x, y) === 1) ends.push([x, y]);
  ends.sort((a, b) => a[0] - b[0]);
  for (const [x, y] of ends) if (!seen[idx(x, y)]) walk(x, y);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (on(x, y) && !seen[idx(x, y)]) walk(x, y);

  // each small mark becomes a short stroke, so the pen renders it as a dot
  const rMark = Math.max(0.5, 0.5 * ss);
  for (const [mx, my] of marks) {
    strokes.push([[mx - rMark, my], [mx, my], [mx + rMark, my]]);
  }

  strokes.sort((a, b) => Math.min(...a.map((p) => p[0])) - Math.min(...b.map((p) => p[0])));

  // strict left-to-right, but each stroke is entered from whichever end is
  // nearer the pen: reading order is preserved and the travel moves stay short.
  const ordered = strokes
    .map((s) => s.map(([x, y]) => [nameX + x / ss, nameY + y / ss]))
    .map((pts) => pts.map((p, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      return [(a[0] + p[0] * 2 + b[0]) / 4, (a[1] + p[1] * 2 + b[1]) / 4];
    }));

  const track = [];
  const pen = [];
  let cursor = null;
  ordered.forEach((s, si) => {
    const head = s[0], tail = s[s.length - 1];
    let run = s;
    if (cursor) {
      const dh = (head[0] - cursor[0]) ** 2 + (head[1] - cursor[1]) ** 2;
      const dt = (tail[0] - cursor[0]) ** 2 + (tail[1] - cursor[1]) ** 2;
      if (dt < dh) run = s.slice().reverse();
    }
    // finish on the rightmost point of the last stroke, so the run converges at
    // the end of the name rather than stopping inside a letter
    if (si === ordered.length - 1 && run[run.length - 1][0] < run[0][0]) run = run.slice().reverse();
    run.forEach((p, i) => { track.push(p); pen.push(i > 0 || !cursor); });
    cursor = track[track.length - 1];
  });
  return { pts: track, pen };
}


/* highest grid point inside a box — a real peak to start the descent from */
export function peakIn(field, x0, x1, y0, y1) {
  const { f, cols, rows, cell } = field;
  let best = -Infinity, bx = x0, by = y0;
  const i0 = Math.max(0, Math.floor(x0 / cell)), i1 = Math.min(cols - 1, Math.ceil(x1 / cell));
  const j0 = Math.max(0, Math.floor(y0 / cell)), j1 = Math.min(rows - 1, Math.ceil(y1 / cell));
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const v = f[j * cols + i];
      if (v > best) { best = v; bx = i * cell; by = j * cell; }
    }
  }
  return [bx, by];
}

/* ---------- the run ---------- */
export function descend(field, track, { start, docW = 1e9, docH = 1e9, bandTop = 14, bandBottom = 1e9, seed = 0x13579b } = {}) {
  const targets = track.pts;
  const pen = track.pen;
  const traj = [];
  const mode = [];
  const first = targets[0];
  const clampX = (x) => Math.min(docW - 14, Math.max(14, x));
  const clampY = (y) => Math.min(bandBottom, Math.max(bandTop, y));
  const rnd = mulberry32(seed);

  /* The approach is momentum SGD on the drawn surface itself: every step is
     -lr * (grad f + minibatch noise), so the iterates run down the true
     steepest-descent direction and cross the contours the page draws. */
  let p = start ? start.slice() : [clampX(first[0] - 78), clampY(bandTop + 6)];
  let v = [0, 0];
  let lr = 3, temp = 12;
  const mu = 0.8;
  const STEPS = 220;
  const iterates = [];
  const grads = [];
  for (let i = 0; i < STEPS; i++) {
    const [gx, gy] = field.grad(p[0], p[1]);
    const nx = (rnd() * 2 - 1) * temp, ny = (rnd() * 2 - 1) * temp;
    v = [mu * v[0] - lr * (gx + nx * 0.02), mu * v[1] - lr * (gy + ny * 0.02)];
    const sp = Math.hypot(v[0], v[1]);
    if (sp > 10) { v[0] *= 10 / sp; v[1] *= 10 / sp; }
    grads.push([gx, gy, lr]);
    p = [clampX(p[0] + v[0]), clampY(p[1] + v[1])];
    traj.push([p[0], p[1]]);
    mode.push("run");
    iterates.push([p[0], p[1]]);
    lr *= 0.991;
    temp *= 0.965;
    // the run stops where it lands in the basin. It is never steered toward the
    // pen's starting point, so it cannot slide along an invisible floor.
    if (p[1] >= bandBottom - 10) break;
  }

  // pen lift: landing point to the first stroke, drawn faintly
  const lift = 22;
  const from = traj.length ? traj[traj.length - 1] : [first[0], first[1] - 40];
  for (let i = 1; i <= lift; i++) {
    const t = i / lift;
    traj.push([from[0] + (first[0] - from[0]) * t, from[1] + (first[1] - from[1]) * t]);
    mode.push("travel");
  }
  p = traj[traj.length - 1].slice();

  // writing: the pen tracks the level set; a light pull from the field's own
  // gradient keeps it seated in the stroke instead of cutting corners.
  let vv = [0, 0];
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    const [gx, gy] = field.grad(p[0], p[1]);
    const fx = (t[0] - p[0]) * 0.78 - gx * 0.25;
    const fy = (t[1] - p[1]) * 0.78 - gy * 0.25;
    vv = [0.3 * vv[0] + fx, 0.3 * vv[1] + fy];
    p = [p[0] + vv[0], p[1] + vv[1]];
    traj.push([p[0], p[1]]);
    mode.push(pen[i] ? "draw" : "travel");
  }

  // settle into the minimum
  const last = targets[targets.length - 1];
  for (let i = 0; i < 60; i++) {
    vv = [0.6 * vv[0] - 0.5 * (p[0] - last[0]), 0.6 * vv[1] - 0.5 * (p[1] - last[1])];
    p = [p[0] + vv[0], p[1] + vv[1]];
    traj.push([p[0], p[1]]);
    mode.push("draw");
  }
  return { pts: traj, mode, iterates, grads, runLen: iterates.length };
}

/* split a run into contiguous same-mode pieces, with each piece's start
   distance along the whole run, so the write-on stays one timed sweep */
export function pieces(run) {
  const { pts, mode } = run;
  const out = [];
  let total = 0;
  let cur = { mode: mode[0], pts: [pts[0]], start: 0, len: 0 };
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (mode[i] !== cur.mode) {
      out.push(cur);
      cur = { mode: mode[i], pts: [pts[i - 1]], start: total, len: 0 };
    }
    cur.pts.push(pts[i]);
    cur.len += d;
    total += d;
  }
  out.push(cur);
  return { list: out.filter((p) => p.pts.length > 1), total };
}

export function pathData(pts) {
  return "M" + pts.map(([x, y]) => `${r1(x)} ${r1(y)}`).join("L");
}

export function bounds(pts) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

export function svgEl(tag, attrs) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}
