/* The update rule, shaded rather than coloured.

   The glyph mask gives a signed distance field; the field gives a rounded
   surface; the surface is then shaded per pixel with a small metal BRDF —
   a vertical studio environment, two specular lobes and a Fresnel rim. It is
   a real render, just baked once into a bitmap instead of a GPU pass, which
   is why it holds up at any size and costs nothing after load. */
import { edt } from "./field.js";

const FONT = (px) => `italic ${px}px 'Iowan Old Style', 'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif`;

function drawRuns(runs, px, ss) {
  const probe = document.createElement("canvas").getContext("2d");
  let w = 0;
  const placed = runs.map((r) => {
    probe.font = FONT(px * (r.scale || 1));
    const width = probe.measureText(r.t).width;
    const x = w;
    w += width;
    return { ...r, x, width };
  });
  const pad = Math.round(px * 0.34);
  const W = Math.ceil(w) + pad * 2;
  const H = Math.ceil(px * 1.5);
  const c = document.createElement("canvas");
  c.width = Math.round(W * ss);
  c.height = Math.round(H * ss);
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.scale(ss, ss);
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "alphabetic";
  const baseline = Math.round(H * 0.72);
  for (const r of placed) {
    ctx.font = FONT(px * (r.scale || 1));
    ctx.fillText(r.t, pad + r.x, baseline + (r.dy || 0) * px);
  }
  return { canvas: c, w: c.width, h: c.height };
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const norm3 = (x, y, z) => {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
};

/* warm studio: bright soft key above, deep amber bounce below */
function environment(ny) {
  const t = clamp01(ny * 0.5 + 0.5);
  const top = [1.0, 0.94, 0.82];
  const mid = [0.5, 0.36, 0.14];
  const bot = [0.07, 0.045, 0.02];
  if (t > 0.55) {
    const u = (t - 0.55) / 0.45;
    return [mid[0] + (top[0] - mid[0]) * u, mid[1] + (top[1] - mid[1]) * u, mid[2] + (top[2] - mid[2]) * u];
  }
  const u = t / 0.55;
  return [bot[0] + (mid[0] - bot[0]) * u, bot[1] + (mid[1] - bot[1]) * u, bot[2] + (mid[2] - bot[2]) * u];
}

function bake(mask, { rim, gold = [0.92, 0.68, 0.28] }) {
  const w = mask.width, h = mask.height;
  const src = mask.getContext("2d").getImageData(0, 0, w, h);
  const a = src.data;

  const outside = new Uint8Array(w * h);
  for (let i = 0; i < outside.length; i++) outside[i] = a[i * 4 + 3] > 128 ? 0 : 1;
  const dist = edt(outside, w, h);

  // rounded shoulder: domed at the edge, flattening to a plateau inside
  const height = new Float32Array(w * h);
  for (let i = 0; i < height.length; i++) {
    const t = clamp01(dist[i] / rim);
    height[i] = Math.sin((t * Math.PI) / 2) ** 0.62;
  }

  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const img = out.getContext("2d").createImageData(w, h);
  const d = img.data;

  const at = (x, y) => height[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
  const relief = rim * 0.8;
  const L1 = norm3(-0.42, 0.78, 0.68);
  const L2 = norm3(0.72, -0.38, 0.55);
  const V = [0, 0, 1];
  const H1 = norm3(L1[0] + V[0], L1[1] + V[1], L1[2] + V[2]);
  const H2 = norm3(L2[0] + V[0], L2[1] + V[1], L2[2] + V[2]);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const alpha = a[i * 4 + 3];
      const o = i * 4;
      if (alpha < 4) { d[o + 3] = 0; continue; }

      const gx = (at(x + 1, y) - at(x - 1, y)) * relief;
      const gy = (at(x, y + 1) - at(x, y - 1)) * relief;
      const [nx, ny, nz] = norm3(-gx, gy, 1);

      // reflected direction drives the environment lookup: this is what makes
      // the surface read as metal rather than as a coloured shape
      const rdot = 2 * nz;
      const ry = rdot * ny;
      const env = environment(ry);

      const s1 = Math.max(0, nx * H1[0] + ny * H1[1] + nz * H1[2]) ** 64;
      const s2 = Math.max(0, nx * H2[0] + ny * H2[1] + nz * H2[2]) ** 30;
      const fres = (1 - Math.max(0, nz)) ** 2.2;

      let r = gold[0] * env[0] * 1.2 + s1 * 2.1 + s2 * 0.62 + fres * 0.55;
      let g = gold[1] * env[1] * 1.2 + s1 * 2.0 + s2 * 0.52 + fres * 0.4;
      let b = gold[2] * env[2] * 1.2 + s1 * 1.8 + s2 * 0.34 + fres * 0.22;

      // filmic-ish shoulder, then gamma
      r = clamp01(r / (1 + r * 0.72)) ** (1 / 2.05);
      g = clamp01(g / (1 + g * 0.72)) ** (1 / 2.05);
      b = clamp01(b / (1 + b * 0.72)) ** (1 / 2.05);

      d[o] = r * 255;
      d[o + 1] = g * 255;
      d[o + 2] = b * 255;
      d[o + 3] = alpha;
    }
  }
  out.getContext("2d").putImageData(img, 0, 0);
  return out;
}

/* The relief is baked per pixel, so the bake has to match the box it will be
   shown in: a fixed size means either a soft upscale or paying for ten times
   the pixels the layout asked for. drawRuns is cheap text measurement, so a
   probe pass gives the px that lands the bake on the box, and the scene calls
   __resize() whenever it re-lays the host. */
export async function mountMath3D(host, { runs, px = 120 } = {}) {
  if (!host || !runs || !runs.length) return { destroy() {} };
  let shaded = null, builtW = 0;

  const paint = () => {
    const cssW = host.clientWidth || host.getBoundingClientRect().width;
    if (!cssW) return;
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    const target = Math.max(140, Math.round(cssW * dpr * 1.35));
    if (shaded && builtW && Math.abs(target - builtW) / builtW < 0.12) return;

    const probeW = drawRuns(runs, 100, 1).canvas.width || 1;
    const size = Math.max(14, Math.min(px * 2, (100 * target) / probeW));
    const { canvas: mask } = drawRuns(runs, size, 1);
    const next = bake(mask, { rim: Math.max(2.5, size * 0.05) });
    next.style.cssText = "width:100%;height:auto;display:block;position:absolute;top:50%;left:0;transform:translateY(-50%)";
    if (shaded && shaded.parentNode) shaded.parentNode.replaceChild(next, shaded);
    else host.appendChild(next);
    shaded = next;
    builtW = target;
  };

  paint();
  host.__resize = paint;

  return {
    get canvas() { return shaded; },
    resize: paint,
    destroy() {
      if (host.__resize === paint) delete host.__resize;
      if (shaded && shaded.parentNode) shaded.parentNode.removeChild(shaded);
    },
  };
}
