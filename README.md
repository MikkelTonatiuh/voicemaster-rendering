# Mikkel T. Chávez Petersen — personal site

## Upload to GitHub Pages

Put **the contents of this folder** at the repo root (`index.html` at the top level,
not inside a subfolder). Then:

Settings → Pages → Source: *Deploy from a branch* → `main` → `/ (root)` → Save.

The repo must be public for Pages to publish on a free account. Live in ~1 minute at
`https://<user>.github.io/<repo>/`.

## Local preview

Double-clicking `index.html` will not work — browsers block JS modules over `file://`.
Serve it instead:

    python3 -m http.server 8000

then open http://localhost:8000

## Files

- `index.html` — the site
- `field.js` — noise field, marching-squares contours, name raster, gradient descent
- `scene.js` — animation timeline, pen strokes, arrows, ripple
- `math3d.js` — the equation renderer
- `blop/` — the mascot (WebGL)
- `support.js` — runtime
- `Blop.dc.html`, `VoiceMaster.dc.html` — the two linked pages
- `.nojekyll` — stops GitHub Pages filtering files
- `standalone.html` — the whole site inlined into one file. Works by double-clicking,
  no server needed. Not required for GitHub Pages; keep or delete as you like.

## Missing

`index.html` links to `cv/thesis.pdf`, which is not included. Add the PDF at that path
or remove the link.
