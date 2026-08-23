# Mikkel T. Chávez Petersen — personal site

## Deploy on GitHub Pages

1. Push the contents of this folder to a repo (files at the repo root, not inside a subfolder).
2. Settings → Pages → Source: `Deploy from a branch` → branch `main`, folder `/ (root)`.
3. Wait ~1 min. The site is live at `https://<user>.github.io/<repo>/`.

Pages serves over HTTPS, so the JS modules load and the animation runs.

## Local preview

Opening `index.html` by double-clicking will **not** run the animation — browsers block
JS modules over `file://`. Serve it instead:

```
python3 -m http.server 8000
```

then open http://localhost:8000

`standalone.html` is a single self-contained file that *does* work by double-clicking.

## Files

- `index.html` — the site
- `Blop.dc.html`, `VoiceMaster.dc.html` — linked pages
- `field.js` — noise field, marching-squares contours, name raster, descent
- `scene.js` — animation timeline, pen strokes, ripple
- `math3d.js` — the gradient-descent equation renderer
- `blop/` — mascot (WebGL)
- `support.js` — runtime

## Note

`index.html` links to `cv/thesis.pdf`, which is not in this folder. Add the PDF at that
path or edit the link.
