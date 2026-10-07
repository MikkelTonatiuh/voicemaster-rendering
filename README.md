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
- `field.js` — noise field, marching-squares contours, name raster, the approach run
- `valley.js` — the letters of the name as valleys in that field, and the descents that write them
- `scene.js` — animation timeline, pen strokes, arrows, ripple
- `math3d.js` — the equation renderer
- `blop/` — the mascot (WebGL)
- `support.js` — runtime
- `Blop.dc.html` — the speaking practice app with Blop the mascot (the avatar on the CV opens it)
- `VoiceMaster.dc.html` — an older, plain practice page; nothing links to it
- `blop/local.js` — connects Blop to the analysis engine and the example voices
- `voice/engine.js` — the analysis engine (see below)
- `voice/models/` — the example voices (real actors from CREMA-D) and `lines.json`, the practice lines
- `tools/crema-d-examples.mjs` — picks the example voices from CREMA-D and tests the scoring on real voices
- `tests/` — tests for the engine, for how Blop uses it, and for how the name is written
  (`tests/fixtures/` holds the name as the page measured it at four window widths)
- `cv/thesis.pdf` — the bachelor thesis
- `thesis/` — the thesis explained: its pages beside an interactive figure for each method and
  result (the thesis title on the CV opens it; the PDF stays one click away)
- `.nojekyll` — stops GitHub Pages filtering files
- `standalone.html` — the whole site inlined into one file. Works by double-clicking,
  no server needed. Not required for GitHub Pages; keep or delete as you like. It predates
  the practice loop below and does not include it.

## How the name is written

The name at the top is written by gradient descent. The page draws the contours of a loss surface
(`buildField` in `field.js`). A point comes in from the right and rolls down that terrain, with momentum
and annealed noise, until it reaches the name. The letters are then cut into the same surface as
valleys (`valley.js`): every stroke is a trench about a pixel wide whose floor slopes down from the start
of the stroke to its end, and every mark (the dot of the i, the period, the accent) is a small pit. The pen
is a point doing gradient descent with momentum on the terrain plus the valleys, started at the top of a
stroke's valley. It has nowhere to go but down it, so its iterates are the stroke. When a stroke ends the
pen lifts, which is a restart of the optimiser at the top of the next valley (the faint straight lines).

What is arranged rather than found: the shape of each valley comes from thinning a raster of the name
(`nameTrack`); where two strokes would touch, one is trimmed back a pixel or two; the specks the thinning
leaves beside some letters are dropped; the valley's slope is set to three times the steepest terrain under
the name, so the terrain can't push the pen back up it; and the terrain has a corridor that slopes down into
the name. `tests/name-writing.test.mjs` rebuilds the page's surface at four window widths and checks that
every stroke rolls to the end of its valley, that plain gradient descent without momentum writes the same
name more slowly, and that with the valleys' gradient switched off nothing is written.

## Practice loop

Blop says each practice line first, moving with the sound. Then the user says it the same way,
and Blop compares the take with the example: melody shape, loudness, pitch range, timing and
pauses. For the first two tries of a line the example's melody is drawn under it, then it is
hidden ("show the melody" brings it back). The board shows both melodies on top of each other,
with buttons to replay the example and the take. This follows the research on intonation
training: model voices, visible pitch, and guidance that fades out.

- The practice lines are in `voice/models/lines.json`; each line's example is
  `voice/models/<id>.mp3`. If the file can't be loaded, Blop falls back to its original prompts
  without examples (`PROMPTS` in `Blop.dc.html`).
- The examples are real actors from CREMA-D, the dataset the thesis trained on: its 12 sentences,
  each said calm (neutral), excited (happy) and authoritative (angry), 34 lines in all. For each one
  `tools/crema-d-examples.mjs` takes the clips most listeners recognised from the voice alone and
  keeps the cleanest one that fits the tone, for example angry takes that stay near the actor's
  normal pitch rather than shouting. Run it again with `node tools/crema-d-examples.mjs` (Node 18+
  and ffmpeg); it downloads only the clips it needs.
- To use your own recordings, add an entry to `lines.json` and an MP3 with the same id.
- Credit: CREMA-D (Cao et al., 2014) is under the Open Database License, its recordings under the
  Database Contents License; see `voice/models/CREDITS.md`. Blop shows a "voices: CREMA-D" link
  while a CREMA-D line is on screen. The CREMA-D team asks users of the repository to fill in
  [their form](https://docs.google.com/forms/d/e/1FAIpQLSdvOR994_Hsx7OkBU3oCzluXcmxw2P1nr-zBxcPgVBNLdD9Eg/viewform).
- `blop/local.js` hands Blop's board the same kind of result the old Wav2Vec2 + GAT server sent,
  so Blop's moods and lines work as before. `blop/api.js`, the server client, is no longer used.
- Takes that can't be measured (silence, noise, too short) get a line from Blop and a retry,
  never a made-up score. The simulated read is only for "Continue without a microphone".

## Analysis

`voice/engine.js` measures each take in the browser. The recording never leaves the device,
and there is no server or API key.

1. The microphone is captured as raw samples (AudioWorklet) and resampled to 8 kHz.
2. For every 10 ms frame it measures loudness and pitch (YIN), and separates speech from pauses.
   Weakly periodic frames still count as voiced when they continue a neighbour's pitch, which
   keeps creaky, breathy and laptop-mic voices trackable.
3. From those tracks it computes five measurements:
   - **Pitch variety**: spread of the pitch in semitones around the speaker's own median
   - **Pace**: syllables per second of speech (loudness peaks in voiced sound)
   - **Stress**: how much loudness varies from syllable to syllable, in dB
   - **Pausing**: share of time spent in pauses of 250 ms or more
   - **Falling endings**: share of sentences whose pitch falls on the last words
4. Each prompt's target tone (calm, excited, authoritative) has a target range for each
   measurement. The score is how well the take fits those ranges, and the tips name the
   measurements that missed.

The target ranges are starting points based on prosody research, not yet calibrated on real
practice takes. Adjust `TONES` in `voice/engine.js` once there are recordings to calibrate against.

When the line has an example, the take is scored against the example instead (`compare`):

- **Melody shape** (40%): both melodies are put on the same time scale, each in semitones around
  its speaker's own usual pitch (so a deep voice can copy a high one), lined up with 5% leeway
  for uneven timing. The average gap must be within 0.8 semitones (`SHAPE_OK`).
- **Loudness** (30%): how far apart the loud and quiet parts of the speech are, compared with the
  example's (80–125% counts as the same).
- **Pitch range** (15%): pitch variety compared with the example's (75–135%).
- **Timing** (15%): length of the spoken part compared with the example's (85–118%).
- **Pauses** (15%, only when the example or the take pauses): the same number of pauses.

The weights come from a test on real voices: `node tools/crema-d-examples.mjs --calibrate` scores
other CREMA-D actors' takes of the same sentence against each example. Takes in the example's tone
should beat takes in the other two tones. On 677 takes they do so 71% of the time (calm 77%,
authoritative 77%, excited 61%), against 62% for the tone ranges alone; the median score is 63 for
takes in the example's tone and 50 for the others. Those actors were not copying the example, so
someone who is copying it should score higher.

Run the tests (Node 18 or newer):

    node --test tests/engine.test.js tests/blop-local.test.mjs tests/name-writing.test.mjs
