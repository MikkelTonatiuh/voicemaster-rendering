# Mikkel T. Chávez Petersen — personal site

## Upload to GitHub

Put these files at the **root** of the repo (not in a subfolder).
Then: Settings → Pages → Source: *Deploy from a branch* → `main` → `/ (root)` → Save.

The repo must be **public** for Pages to publish on a free account.

## Files

- `index.html` — the whole site. Self-contained: the contour field, the gradient-descent
  handwriting, the equation renderer and the Blop mascot are all written into this one file.
  Works served or opened directly.
- `Blop.dc.html`, `VoiceMaster.dc.html` — the two linked pages. These need `support.js`
  and `blop/` next to them, so keep all of it together.
- `cv/thesis.pdf` — **not included.** `index.html` links to it. Add the PDF at that path
  or remove the link.
