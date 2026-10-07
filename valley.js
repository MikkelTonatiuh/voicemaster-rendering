/* The name as a landscape, and the descents that write it.

   Each stroke of the name is a valley cut into the surface: a trench about a pixel wide whose floor slopes down
   from the start of the stroke to its end, where it closes into a pit. A gradient descent started at the top of a
   valley has nowhere to go but down it, so its iterates trace the stroke. Nothing steers the pen and no target is
   followed: the letters are the valleys, and the optimiser only rolls down them.

   One valley per stroke, and one run per valley: when a stroke ends the pen lifts, which is a restart of the
   optimiser at the top of the next valley. Two things keep valleys from pulling on each other. Ends that would
   touch another stroke are trimmed back a pixel or two (the line's round caps hide the gap), and the trench is
   narrow enough that valleys farther apart than that cannot feel each other. A mark (the dot of an i, the period,
   the accent) is a pit instead of a valley.

   The surface, for a point p and the stroke i whose segment is closest to it:

       G_i(p) = min( 0,  W(d) + B (S_i - s) - D_i )          d = distance to the segment, s = arclength there
       W(d)   = D_i (1 - exp(-d^2 / 2 sigma^2))              the trench cross-section, saturating at D_i

   On the floor d = 0, so G_i = B (S_i - s) - D_i falls by B for every pixel along the stroke; off the floor the
   walls rise to the plateau (G = 0) within a few sigma. D_i is a little more than B S_i so that the floor starts
   below the plateau. The landscape is the minimum over every nearby stroke, added to the page's terrain. B is
   set from that terrain (fitToTerrain): the floor has to be steeper than anything the terrain does under it, or
   the terrain would push the pen back up its own valley. */

export const VALLEY = {
  sigma: 0.55,        // trench half-width, px
  slope: 16,          // least floor drop per px along a stroke; fitToTerrain() raises it above the terrain's gradient
  momentum: 0.9,      // heavy-ball momentum of a stroke's descent (0 is plain gradient descent)
  maxStep: 0.05,      // the most a descent moves along the floor per iteration once it is up to speed, px
  depth: 1.35,        // trench depth relative to the drop along its stroke (D = depth * slope * S + base)
  base: 40,
  clearance: 1.9,     // minimum gap between two valleys' floors, px
  step: 0.5,          // spacing of the stored floor, px
  dotLen: 4,          // a stroke shorter than this is a mark: a pit instead of a valley
  dotDepth: 400,
  dotSigma: 0.7,
  dotStart: 1.6,      // a mark's descent starts this far from its pit
  dotClearance: 3.4,  // a mark closer than this to a valley is already inside that stroke's ink, and is dropped
  maxTurn: 0.55,      // radians; sharper corners are rounded (a descent cannot turn a corner sharper than this)
};

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const arcOf = (pts) => { const a = [0]; for (let i = 1; i < pts.length; i++) a.push(a[i - 1] + dist(pts[i], pts[i - 1])); return a; };

/* ---------- from the track to strokes ---------- */
export function strokesFromTrack({ pts, pen }) {
  const strokes = [];
  let cur = null;
  for (let i = 0; i < pts.length; i++) {
    if (!cur || !pen[i]) { cur = []; strokes.push(cur); }
    cur.push([pts[i][0], pts[i][1]]);
  }
  return strokes;
}

/* the same curve at even spacing */
function resample(pts, step) {
  const arc = arcOf(pts), total = arc[arc.length - 1];
  const n = Math.max(1, Math.round(total / step));
  const out = [];
  let j = 0;
  for (let k = 0; k <= n; k++) {
    const target = (k / n) * total;
    while (j < pts.length - 2 && arc[j + 1] < target) j++;
    const seg = arc[j + 1] - arc[j] || 1;
    const t = Math.min(1, Math.max(0, (target - arc[j]) / seg));
    out.push([pts[j][0] + (pts[j + 1][0] - pts[j][0]) * t, pts[j][1] + (pts[j + 1][1] - pts[j][1]) * t]);
  }
  return out;
}

/* binomial smoothing with the ends held in place */
function smooth(pts, passes) {
  let p = pts;
  const w = [1, 4, 6, 4, 1];
  for (let pass = 0; pass < passes; pass++) {
    const q = p.map((v) => v.slice());
    for (let i = 1; i < p.length - 1; i++) {
      let x = 0, y = 0, ws = 0;
      for (let k = -2; k <= 2; k++) {
        const j = i + k;
        if (j < 0 || j >= p.length) continue;
        x += w[k + 2] * p[j][0]; y += w[k + 2] * p[j][1]; ws += w[k + 2];
      }
      q[i] = [x / ws, y / ws];
    }
    p = q;
  }
  return p;
}

function maxTurn(pts) {
  let m = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const a = Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]);
    const b = Math.atan2(pts[i + 1][1] - pts[i][1], pts[i + 1][0] - pts[i][0]);
    let d = Math.abs(b - a);
    if (d > Math.PI) d = 2 * Math.PI - d;
    if (d > m) m = d;
  }
  return m;
}

/* A valley's floor is smoothed until no corner turns faster than maxTurn per step. A descent cannot follow a
   sharper corner: past it the floor no longer pulls forward, only sideways, and the iterate would stop at the bend. */
function shapeFloor(raw, P) {
  let pts = resample(raw, P.step);
  if (pts.length < 4) return pts;
  pts = smooth(pts, 3);
  for (let guard = 0; guard < 24 && maxTurn(pts) > P.maxTurn; guard++) pts = resample(smooth(pts, 2), P.step);
  return resample(pts, P.step);
}

/* Make every stroke the floor of a valley, and every mark a pit. Strokes keep the writing order. */
export function shapeStrokes(strokes, opts = {}) {
  const P = { ...VALLEY, ...opts };
  const items = [];
  for (const raw of strokes) {
    const len = arcOf(raw)[raw.length - 1];
    if (len < P.dotLen) {
      let x = 0, y = 0;
      for (const p of raw) { x += p[0]; y += p[1]; }
      items.push({ kind: "dot", at: [x / raw.length, y / raw.length] });
    } else {
      items.push({ kind: "stroke", floor: shapeFloor(raw, P) });
    }
  }

  /* clearance: trim each stroke's ends back until they sit at least `clearance` from every other floor, and from
     the stroke's own far-away parts (a loop whose end comes round to its start). Strokes are handled in order, so
     of two ends that meet only the first gives way. */
  const clear = (k, idx, floor) => {
    const p = floor[idx];
    const arc = floor.arcs || (floor.arcs = arcOf(floor));
    let best = Infinity;
    for (let j = 0; j < items.length; j++) {
      const o = items[j];
      if (o.kind === "dot") { best = Math.min(best, dist(p, o.at)); continue; }
      const f = o.floor;
      for (let i = 0; i < f.length; i++) {
        if (j === k && Math.abs(arc[i] - arc[idx]) < 8) continue;
        const d = dist(p, f[i]);
        if (d < best) best = d;
      }
    }
    return best;
  };
  items.forEach((it, k) => {
    if (it.kind !== "stroke") return;
    let f = it.floor;
    for (const end of ["tail", "head"]) {
      for (let guard = 0; guard < 40 && f.length > 8; guard++) {
        f.arcs = null;
        const idx = end === "tail" ? f.length - 1 : 0;
        if (clear(k, idx, f) >= P.clearance) break;
        f = end === "tail" ? f.slice(0, -1) : f.slice(1);
        it.floor = f;
      }
    }
    f.arcs = null;
  });

  /* marks: a pit, entered from whichever side is clearest of the valleys. One that sits on a stroke (the thinning
     leaves 1 px specks beside some letters) is dropped: it is already part of that stroke's ink. */
  const floorsNear = (x, y) => {
    let best = Infinity;
    for (const o of items) if (o.kind === "stroke") for (const q of o.floor) { const d = Math.hypot(q[0] - x, q[1] - y); if (d < best) best = d; }
    return best;
  };
  for (const it of items) {
    if (it.kind !== "dot") continue;
    if (floorsNear(it.at[0], it.at[1]) < P.dotClearance) { it.kind = "skip"; continue; }
    let bestDir = null, bestClear = -1;
    for (const [dx, dy] of [[-1, 0], [0, -1], [1, 0], [0, 1]]) {
      const c = floorsNear(it.at[0] + dx * P.dotStart, it.at[1] + dy * P.dotStart);
      if (c > bestClear) { bestClear = c; bestDir = [dx, dy]; }
    }
    it.start = [it.at[0] + bestDir[0] * P.dotStart, it.at[1] + bestDir[1] * P.dotStart];
  }
  return items;
}

/* A valley has to out-slope the terrain it is cut into, or the terrain pushes the pen back up its own valley, and
   a pit has to out-pull it. Both are set from the steepest terrain gradient found under any floor or mark. */
export function fitToTerrain(items, terrainGrad, { slopeFactor = 3, pitFactor = 14 } = {}) {
  let steepest = 0;
  for (const it of items) {
    const pts = it.kind === "stroke" ? it.floor : it.kind === "dot" ? [it.start, it.at] : [];
    for (const p of pts) {
      const g = terrainGrad(p[0], p[1]);
      const m = Math.hypot(g[0], g[1]);
      if (m > steepest) steepest = m;
    }
  }
  return { slope: Math.max(VALLEY.slope, Math.ceil(slopeFactor * steepest)), dotDepth: Math.max(VALLEY.dotDepth, Math.ceil(pitFactor * steepest)) };
}

/* ---------- the landscape ---------- */
export function buildValleys(items, opts = {}) {
  const P = { ...VALLEY, ...opts };
  const s2 = P.sigma * P.sigma;
  const reach = 5 * P.sigma, cell = Math.max(3, reach * 1.2);
  const seg = { ax: [], ay: [], tx: [], ty: [], len: [], s0: [], owner: [], last: [] };
  const owners = [];   // per item: { S, D, kind, at }
  items.forEach((it, k) => {
    if (it.kind === "skip") { owners.push({ kind: "skip" }); return; }
    if (it.kind === "dot") { owners.push({ kind: "dot", at: it.at }); return; }
    const f = it.floor, arc = arcOf(f), S = arc[arc.length - 1];
    owners.push({ kind: "stroke", S, D: P.depth * P.slope * S + P.base, floor: f, arc });
    for (let i = 0; i < f.length - 1; i++) {
      const len = arc[i + 1] - arc[i];
      if (len < 1e-9) continue;
      seg.ax.push(f[i][0]); seg.ay.push(f[i][1]);
      seg.tx.push((f[i + 1][0] - f[i][0]) / len); seg.ty.push((f[i + 1][1] - f[i][1]) / len);
      seg.len.push(len); seg.s0.push(arc[i]); seg.owner.push(k); seg.last.push(i === f.length - 2);
    }
  });
  const nSeg = seg.len.length;

  /* spatial hash: each segment is filed under every cell its reach touches */
  const hash = new Map();
  const key = (cx, cy) => cx * 73856093 ^ cy * 19349663;
  const file = (cx, cy, v) => { const kk = key(cx, cy); let a = hash.get(kk); if (!a) hash.set(kk, (a = [])); a.push(v); };
  for (let i = 0; i < nSeg; i++) {
    const bx = seg.ax[i] + seg.tx[i] * seg.len[i], by = seg.ay[i] + seg.ty[i] * seg.len[i];
    const x0 = Math.floor((Math.min(seg.ax[i], bx) - reach) / cell), x1 = Math.floor((Math.max(seg.ax[i], bx) + reach) / cell);
    const y0 = Math.floor((Math.min(seg.ay[i], by) - reach) / cell), y1 = Math.floor((Math.max(seg.ay[i], by) + reach) / cell);
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) file(cx, cy, i);
  }
  owners.forEach((o, k) => {
    if (o.kind !== "dot") return;
    const x0 = Math.floor((o.at[0] - reach) / cell), x1 = Math.floor((o.at[0] + reach) / cell);
    const y0 = Math.floor((o.at[1] - reach) / cell), y1 = Math.floor((o.at[1] + reach) / cell);
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) file(cx, cy, -1 - k);
  });

  const out = { value: 0, gx: 0, gy: 0, owner: -1, s: 0 };
  /* a few strokes at most are ever within reach of one point */
  const SLOTS = 8;
  const sk = new Int32Array(SLOTS), sD2 = new Float64Array(SLOTS), sS = new Float64Array(SLOTS);
  const sEx = new Float64Array(SLOTS), sEy = new Float64Array(SLOTS), sTx = new Float64Array(SLOTS), sTy = new Float64Array(SLOTS);
  const sIn = new Uint8Array(SLOTS);
  /* value, gradient, and which stroke (and where along it) the surface is following at p.
     Within a stroke the surface uses the nearest point of its floor, found by distance. (Taking whichever segment
     gives the lowest value instead lets the next vertex look slightly ahead, which digs a pocket just behind every
     vertex and stops the descent there.) */
  function at(px, py) {
    let best = 0, gx = 0, gy = 0, who = -1, sBest = 0, used = 0;
    const list = hash.get(key(Math.floor(px / cell), Math.floor(py / cell)));
    if (list) {
      for (let n = 0; n < list.length; n++) {
        const i = list[n];
        if (i < 0) {                                   // a mark: a Gaussian pit
          const o = owners[-1 - i], dx = px - o.at[0], dy = py - o.at[1], r2 = dx * dx + dy * dy;
          const ds2 = P.dotSigma * P.dotSigma, e = Math.exp(-r2 / (2 * ds2)), v = -P.dotDepth * e;
          if (v < best) { best = v; who = -1 - i; sBest = 0; const g = (P.dotDepth * e) / ds2; gx = g * dx; gy = g * dy; }
          continue;
        }
        const dx = px - seg.ax[i], dy = py - seg.ay[i];
        let t = dx * seg.tx[i] + dy * seg.ty[i];
        /* A point just outside a bend is nearest to the vertex, with neither segment under it. There the floor goes
           on along the segment it has just left (every segment but a stroke's last is extended past its end), so the
           slope never switches off; without that the pen can come to rest on the outside of a corner. */
        const ahead = t > seg.len[i] && !seg.last[i];
        const interior = t >= 0 && (t <= seg.len[i] || ahead);   // inclusive: a run starts exactly on the first vertex
        const tu = t;
        if (t < 0) t = 0; else if (t > seg.len[i]) t = seg.len[i];
        const ex = px - (seg.ax[i] + seg.tx[i] * t), ey = py - (seg.ay[i] + seg.ty[i] * t), d2 = ex * ex + ey * ey;
        if (d2 > reach * reach) continue;
        const sAlong = ahead ? tu : t;
        const k = seg.owner[i];
        let j = 0;
        while (j < used && sk[j] !== k) j++;
        if (j === used) { if (used === SLOTS) continue; used++; sk[j] = k; sD2[j] = Infinity; sIn[j] = 0; }
        /* nearest wins; at a tie (a vertex) the segment that has the point inside it wins */
        if (d2 < sD2[j] - 1e-12 || (d2 <= sD2[j] + 1e-12 && interior && !sIn[j])) {
          sD2[j] = d2; sS[j] = seg.s0[i] + sAlong; sEx[j] = ex; sEy[j] = ey; sTx[j] = seg.tx[i]; sTy[j] = seg.ty[i]; sIn[j] = interior ? 1 : 0;
        }
      }
      for (let j = 0; j < used; j++) {
        const o = owners[sk[j]], e = Math.exp(-sD2[j] / (2 * s2));
        const v = o.D * (1 - e) + P.slope * (o.S - sS[j]) - o.D;
        if (v >= best) continue;
        best = v; who = sk[j]; sBest = sS[j];
        const wp = (o.D * e) / s2;                    // dW/dd divided by d, so wp * (ex, ey) is the wall's gradient
        gx = wp * sEx[j]; gy = wp * sEy[j];
        if (sIn[j]) { gx -= P.slope * sTx[j]; gy -= P.slope * sTy[j]; }
      }
    }
    out.value = best; out.gx = gx; out.gy = gy; out.owner = who; out.s = sBest;
    return out;
  }
  return { at, items, owners, params: P, strokes: owners.filter((o) => o.kind === "stroke").length };
}

/* ---------- the descents ---------- */
/* One gradient descent per valley, started at its top at rest:

       v <- mu v - lr (grad terrain(p) + grad valleys(p))        p <- p + v

   This is the same momentum update the approach run uses (mu = 0.9; mu = 0 is plain gradient descent). A valley is
   stiff across and gentle along, which is the case momentum is for: plain steps small enough to be stable across
   it take thousands of iterations to roll down it. lr is set from the trench's own stiffness (D / sigma^2) to be
   stable across the valley. A mark's pit is round, so it needs no momentum. The stored path is every iterate that
   moved at least `keep` pixels from the last one kept. `terrainGrad` is the rest of the surface (the page's
   contour terrain). */
export function writeName(valleys, terrainGrad, { keep = 0.45, gradientOn = true, momentum = valleys.params.momentum } = {}) {
  const P = valleys.params;
  const runs = [];
  valleys.items.forEach((it, k) => {
    const o = valleys.owners[k];
    if (it.kind === "skip") { runs.push({ item: k, kind: "skip", start: null, end: null, path: [], steps: 0, derailed: false, finished: true }); return; }
    const mu = it.kind === "dot" ? 0 : momentum;
    let p, lr, done;
    if (it.kind === "dot") {
      p = it.start.slice();
      lr = 0.8 * P.dotSigma * P.dotSigma / P.dotDepth;
      done = (v, gx, gy) => Math.hypot(gx, gy) * lr < 2e-4;   // converged: the steps have died away at the bottom of the pit
    } else {
      p = o.floor[0].slice();
      /* stable across the trench for any mu below 1, and slow enough along it that the pen travels only a small
         fraction of a trench width per step (a shallow trench would otherwise allow a big step and a ringing pit) */
      lr = Math.min(0.8 * (1 + mu) * P.sigma * P.sigma / o.D, P.maxStep * (1 - mu) / P.slope);
      const margin = 3 * lr * P.slope / (1 - mu);              // three steps at full speed from the end
      done = (v) => v.owner === k && v.s >= o.S - margin;
    }
    const start = p.slice();
    const path = [p.slice()];
    let last = p.slice(), steps = 0, off = 0, arrived = false, settle = 0, vx = 0, vy = 0;
    const settleFor = mu ? 150 : 24;                           // the ring-down at the pit takes longer with momentum
    const cap = it.kind === "dot" ? 600 : 4 * (o.S / (lr * P.slope / (1 - mu))) + 2000;
    while (steps < cap) {
      const v = valleys.at(p[0], p[1]);
      let gx = gradientOn ? v.gx : 0, gy = gradientOn ? v.gy : 0;
      if (terrainGrad) { const g = terrainGrad(p[0], p[1]); gx += g[0]; gy += g[1]; }
      if (it.kind === "stroke") {
        if (v.owner !== k) { if (++off > 60) break; } else off = 0;
      }
      if (arrived || done(v, gx, gy)) { arrived = true; if (++settle > settleFor) break; }
      vx = mu * vx - lr * gx; vy = mu * vy - lr * gy;
      p[0] += vx; p[1] += vy;
      steps++;
      if (Math.hypot(p[0] - last[0], p[1] - last[1]) >= keep) { path.push([p[0], p[1]]); last = [p[0], p[1]]; }
    }
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) > 1e-3) path.push([p[0], p[1]]);
    runs.push({ item: k, kind: it.kind, start, end: [p[0], p[1]], path, steps, derailed: it.kind === "stroke" && off > 60, finished: arrived });
  });
  return runs;
}
