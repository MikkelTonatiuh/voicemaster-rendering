/* Tests that the name on the CV is written by gradient descent on a landscape with the letters cut into it.
   Each fixture in tests/fixtures is the name as the page measured it at one window width: the rasterised
   letters, and where they sit. The tests rebuild the page's surface from that (the contour terrain, then the
   valleys), run the descents, and check what they drew.
   Run with:  node --test tests/name-writing.test.mjs */
import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import { buildField, nameTrack, floorAt, descend } from "../field.js";
import { strokesFromTrack, shapeStrokes, fitToTerrain, buildValleys, writeName } from "../valley.js";

const WIDTHS = [1366, 820, 390, 320];

function layout(width) {
  const fx = JSON.parse(fs.readFileSync(new URL(`./fixtures/layout-${width}.json`, import.meta.url), "utf8"));
  const bin = Buffer.from(fx.raster.ink, "base64");
  const ink = new Uint8Array(fx.raster.w * fx.raster.h);
  for (let i = 0; i < ink.length; i++) ink[i] = (bin[i >> 3] >> (i & 7)) & 1;
  const raster = { ...fx.raster, ink };
  const { docW, docH, nameX, nameY, avail } = fx;
  const field = buildField({ docW, docH, raster, nameX, nameY, cell: 4 });
  const track = nameTrack(raster, nameX, nameY);
  /* where the page starts its approach run (scene.js does the same) */
  const bandTop = 8, bandBottom = nameY + raster.cssH * 0.72;
  let startX = Math.min(docW - 18, nameX + avail - 6), startY = floorAt(field, startX, bandTop, bandBottom);
  for (let k = 0; k < 26; k++) {
    const y = floorAt(field, startX, bandTop, bandBottom);
    if (field.grad(startX, y)[0] > 0.35) { startY = y; break; }
    startX -= 8; startY = y;
  }
  const opts = { docW, docH, bandTop, bandBottom, start: [startX, startY], entry: [-4, 0], vmax: 34 };
  return { field, track, opts };
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const length = (pts) => pts.reduce((a, p, i) => a + (i ? dist(p, pts[i - 1]) : 0), 0);
function distToPolyline(p, poly) {
  let best = Infinity;
  for (let i = 0; i < poly.length - 1; i++) {
    const a = poly[i], b = poly[i + 1], vx = b[0] - a[0], vy = b[1] - a[1], l2 = vx * vx + vy * vy || 1;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / l2));
    best = Math.min(best, Math.hypot(p[0] - a[0] - vx * t, p[1] - a[1] - vy * t));
  }
  return best;
}

for (const width of WIDTHS) {
  const { field, track, opts } = layout(width);
  const run = descend(field, track, opts);
  const strokes = run.runs.filter((r) => r.kind === "stroke");
  const marks = run.runs.filter((r) => r.kind === "dot");
  const floorOf = (r) => run.valleys.items[r.item].floor;

  test(`${width}px: every stroke is a descent that rolls to the end of its valley`, () => {
    assert.ok(strokes.length >= 25, "strokes " + strokes.length);
    for (const r of strokes) {
      assert.ok(r.finished, `stroke ${r.item} stopped after ${r.steps} steps`);
      assert.ok(!r.derailed, `stroke ${r.item} fell into another valley`);
      const f = floorOf(r);
      assert.ok(dist(r.end, f[f.length - 1]) < 0.1, `stroke ${r.item} ended ${dist(r.end, f[f.length - 1]).toFixed(2)} px from the end of its valley`);
    }
  });

  test(`${width}px: the iterates stay on the valley floor, and cover it once`, () => {
    for (const r of strokes) {
      const f = floorOf(r);
      const worst = Math.max(...r.path.map((p) => distToPolyline(p, f)));
      assert.ok(worst < 0.15, `stroke ${r.item} strays ${worst.toFixed(3)} px from its floor`);
      const ratio = length(r.path) / length(f);
      assert.ok(ratio > 0.97 && ratio < 1.06, `stroke ${r.item} draws ${ratio.toFixed(3)} times its floor's length`);
    }
  });

  test(`${width}px: every mark rolls into its pit`, () => {
    assert.ok(marks.length >= 2, "marks " + marks.length);
    for (const r of marks) assert.ok(dist(r.end, run.valleys.owners[r.item].at) < 0.2, `mark ${r.item} ended ${dist(r.end, run.valleys.owners[r.item].at).toFixed(2)} px from its pit`);
  });

  test(`${width}px: the valleys are what writes the name: take their gradient away and the letters are gone`, () => {
    /* share of all the floors that a set of descents has traced (a floor point counts if a path passes within 0.3 px) */
    const traced = (runs) => {
      let hit = 0, all = 0;
      for (const r of runs.filter((o) => o.kind === "stroke")) {
        for (const q of floorOf(r)) { all++; if (distToPolyline(q, r.path) <= 0.3) hit++; }
      }
      return hit / all;
    };
    const off = writeName(run.valleys, (x, y) => field.grad(x, y), { gradientOn: false });
    assert.ok(traced(run.runs) > 0.98, "with the valleys: " + traced(run.runs).toFixed(2));
    assert.ok(traced(off) < 0.25, "without them the descents still traced " + traced(off).toFixed(2) + " of the letters");
    assert.ok(off.filter((o) => o.kind === "stroke").every((o) => !o.finished), "a descent finished with no valley under it");
  });

  test(`${width}px: momentum only makes it faster: plain gradient descent writes the same name`, () => {
    const plain = writeName(run.valleys, (x, y) => field.grad(x, y), { momentum: 0 });
    let stepsPlain = 0, stepsMomentum = 0;
    for (const r of plain) {
      if (r.kind === "skip") continue;
      assert.ok(r.finished && !r.derailed, `item ${r.item} (${r.kind}) did not finish without momentum`);
      if (r.kind !== "stroke") continue;
      const f = floorOf(r);
      assert.ok(dist(r.end, f[f.length - 1]) < 0.1, `stroke ${r.item} ended away from its valley's end without momentum`);
      assert.ok(Math.max(...r.path.map((p) => distToPolyline(p, f))) < 0.15, `stroke ${r.item} left its floor without momentum`);
      stepsPlain += r.steps;
    }
    for (const r of strokes) stepsMomentum += r.steps;
    assert.ok(stepsPlain > 4 * stepsMomentum, `plain ${stepsPlain} steps, with momentum ${stepsMomentum}`);
  });

  test(`${width}px: the valleys alone write the name, with no terrain under them`, () => {
    const items = shapeStrokes(strokesFromTrack(track));
    const flat = () => [0, 0];
    const valleys = buildValleys(items, fitToTerrain(items, flat));
    const runs = writeName(valleys, flat);
    for (const r of runs) if (r.kind !== "skip") assert.ok(r.finished && !r.derailed, `item ${r.item} (${r.kind}) did not finish on flat ground`);
  });

  test(`${width}px: the same surface gives the same name every time`, () => {
    const again = descend(field, track, opts);
    assert.strictEqual(again.pts.length, run.pts.length);
    assert.deepStrictEqual(again.pts.slice(-50), run.pts.slice(-50));
  });
}

/* A regression found on the page. The terrain can push the pen a hair to the outside of a bend, where the nearest
   point of the floor is a vertex and neither of its segments is under the pen. If the slope switched off there, the
   pen came to rest on the corner (it happened to one stroke in thirty). On a floor that bends, about one push
   direction in ten used to trap it. */
test("a descent is not stopped by terrain pushing it to the outside of a bend", () => {
  for (const radius of [1.2, 2.2, 5]) {
    const floor = [];
    const n = Math.round((5.5 * radius) / 0.5);
    for (let k = 0; k <= n; k++) { const a = (k / n) * 5.5; floor.push([40 + radius * Math.cos(a), 40 + radius * Math.sin(a)]); }
    for (let push = 0; push < 72; push++) {
      const angle = (push / 72) * 2 * Math.PI;
      const terrain = () => [24 * Math.cos(angle), 24 * Math.sin(angle)];
      const items = [{ kind: "stroke", floor }];
      const valleys = buildValleys(items, fitToTerrain(items, terrain));
      const [run] = writeName(valleys, terrain);
      assert.ok(run.finished, `on a bend of radius ${radius} px, terrain pushing at ${Math.round((angle * 180) / Math.PI)} degrees stopped the descent at ${run.end.map((v) => v.toFixed(2))}`);
    }
  }
});

/* the unit the page's surface is made of: a straight valley, and a descent that has only the surface to follow */
test("a descent started at the top of a valley rolls down it and stops in the pit at the end", () => {
  const floor = [];
  for (let x = 10; x <= 30.001; x += 0.5) floor.push([x, 20 + 0.4 * Math.sin(x / 3)]);
  const items = [{ kind: "stroke", floor }];
  const valleys = buildValleys(items);
  for (const momentum of [0.9, 0]) {
    const [run] = writeName(valleys, null, { momentum });
    assert.ok(run.finished, `momentum ${momentum}: stopped short`);
    assert.ok(dist(run.end, floor[floor.length - 1]) < 0.05, `momentum ${momentum}: ended ${dist(run.end, floor[floor.length - 1]).toFixed(3)} px from the pit`);
    assert.ok(run.steps > 200, `momentum ${momentum}: took ${run.steps} steps; a descent takes many small steps, not a few big ones`);
    /* the surface is far lower at the end than at the start, and the pen never backs up the valley */
    assert.ok(valleys.at(run.end[0], run.end[1]).value < valleys.at(run.start[0], run.start[1]).value - 0.9 * valleys.params.slope * 20);
    let along = -Infinity;
    for (const p of run.path) {
      const s = valleys.at(p[0], p[1]).s;
      assert.ok(s >= along - 0.05, `momentum ${momentum}: the pen backed up the valley`);
      along = Math.max(along, s);
    }
  }
});
