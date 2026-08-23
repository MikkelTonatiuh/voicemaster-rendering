repo: MikkelTonatiuh/voicemaster-web
branch: main
path: anything/apps/web/src

## Last sync
date: 2026-08-23T11:14:00Z

### Updated in this project
- Blop.dc.html — the routed `/` app (WebGL Blop, tap-to-record, score board), built from Blop/App.jsx.
- CV.dc.html — the `/cv` page from Blop/Cv.jsx, restyled: pure black, single 720px column, generated header.
- field.js / scene.js — the loss surface and the optimizer run that writes the name.
- blop/ — pose.js, grade.js, line.js, mix.js, map.js, shaderFrag.js copied verbatim; mount.js is Blop.jsx's render loop ported to plain JS; api.js is lib/voicemasterApi.js.
- VoiceMaster.dc.html — the older VoiceMaster/index.jsx screens (canvas mascot), still in the repo but not routed on main.

### Header / background (generated, no source in repo)
- One surface: log1p(EDT of the name raster) + 3 octaves of value noise + 17 seeded Gaussian features + a wide well on the name. Contours are 22 evenly spaced level sets of it.
- The header is a momentum SGD run on that same surface (iterate marks shown), annealed onto the first pen stroke, then a Zhang-Suen skeleton walk of the letterforms, then settle on the amber minimum.
- Computed in LAYOUT pixels against the h1's offset box, so page zoom and reflow rebuild cleanly.

### Deviations
- The Wav2Vec2 + GAT server at 127.0.0.1:8000 is unreachable from here, so a failed analyze falls back to the app's own simulateResult and the board is labelled "analyzer offline · simulated read".
- cv/thesis.pdf is not in the repo tree, so that link is dead in this project.
- public/cv/name.gif is replaced by the generated trajectory header.

## Screen map
| Screen | Source files |
| --- | --- |
| Blop.dc.html | components/Blop/App.jsx, blop.css, Blop.jsx, line.js, grade.js, map.js, pose.js, mix.js, shaderFrag.js |
| CV.dc.html | components/Blop/Cv.jsx (content/DOM kept; restyled black + contour field, name.gif replaced by the generated name-oneline.svg header) |
| CV (previous).dc.html | the pre-restyle port of Cv.jsx |
| VoiceMaster.dc.html | components/VoiceMaster/index.jsx, styles.css, ui/Mascot.jsx, ui/TakeHistory.jsx, lib/takeHistory.js |
| blop/api.js | lib/voicemasterApi.js |
