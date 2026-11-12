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

(a browser may keep an old copy of a script this server sends; after changing files, reload with Ctrl+Shift+R)

then open http://localhost:8000

## Files

- `index.html` — the site
- `field.js` — noise field, marching-squares contours, name raster, the approach run
- `valley.js` — the letters of the name as valleys in that field, and the descents that write them
- `scene.js` — animation timeline, pen strokes, arrows, ripple
- `math3d.js` — the equation renderer
- `agent.js` — the terminal in the Gemma 4 card: an agent patches a failing test, on a loop
- `blop/` — the mascot (WebGL)
- `support.js` — runtime
- `Blop.dc.html` — the speaking practice app with Blop the mascot (the avatar on the CV opens it)
- `VoiceMaster.dc.html` — an older, plain practice page; nothing links to it
- `blop/local.js` — puts the word check and the engine's comparison into the result Blop's board shows
- `blop/clarity.js`, `blop/clarity.worker.js` — which words were hard to hear (see Practice loop)
- `blop/turn.js` — when a take is over (see Practice loop)
- `blop/replay.js`, `blop/align.js` — the result board's replay: where each word is said, the melody lines, and lining a take
  up with the example (see Practice loop)
- `voice/engine.js` — the analysis engine (see below)
- `voice/models/` — the example voices and `lines.json`, the practice lines: 70 lines (5 to 33 words) read by an AI voice (xAI text-to-speech, the voice Liora), which Blop plays, and 12 neutral readings by real actors from CREMA-D, kept as a fallback
- `tools/crema-d-examples.mjs` — picked the example voices from CREMA-D. The app now uses only its neutral
  readings, so running it again brings back clips the app doesn't use
- `tools/turn-replay.mjs` — replays recorded takes through the rule in `blop/turn.js` to measure how often it cuts a
  speaker off and how long the board takes to come up
- `tests/` — tests for the engine, for the word check, for when a take ends, for how Blop uses them, and for how the name is written
  (`tests/fixtures/` holds the name as the page measured it at four window widths)
- `cv/thesis.pdf` — the bachelor thesis
- `cv/say/` — what Blop on the CV says when the mouse rests on something: one recording per line of `MUTTER` in
  `index.html`, named by a hash of the line, in the voice Blop has in the app. It only talks after the visitor has
  clicked or typed on the page (Chrome's autoplay policy, quoted in `index.html`) and while it is on screen, and the
  Mute button in the top bar turns it off. The voice is switched off for now (`VOICE` in `index.html`); the lines
  still show as text
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

Blop says a practice line first, in an AI voice, moving with the sound. When it has finished, the mic opens
by itself and Blop listens: there is no record button, no stop button and no countdown. Once the user has said
the line and gone quiet, Blop looks thoughtful and the take ends by itself (see "When the take is over").
Then the result board replays the take. It has the clarity score, the sentence with the words that were hard
to hear underlined in Blop's tints (what the model heard instead is under it), and the melody: the take's own
pitch as a glowing line against the example's as a wide quiet ribbon, both in semitones around that speaker's
usual pitch, so a deep voice can follow a high one by shape. The two are laid on the example's timeline word by word:
each word of the take sits under the same word of the example however fast or slow it was said, and both lines begin
together. A line under the melody says how long the take took against the example when it differs by a quarter or more
(speed is not part of the word score; on a first visit, while the word check is still arriving, the number is the melody
and timing comparison, which does count it, and the board says so under the number). As the board
arrives a silent sweep runs once over the sentence, lighting the words and drawing the melody; the play button then
plays the take, or the example with the switch next to it (its colour dots are the key to the two lines), and the
words and the melody follow the sound. A tap on a word plays that word, a tap on the melody plays from there. Try
again and next line are buttons; a tap on Blop tries again too. Blop's mood follows the result: clear words make it
happy (the take has to score 92 or more as well), a few hard ones, or a score just short of that, leave it unsure, a
lot of them make it think. While the user speaks it shows how the first
words are going: pleased once they have scored clear, unsure when two readings in a row found a hard word, and only
listening until then (see "How the take is going"). It is not judged by loudness: an earlier version did, and showed an
angry Blop during takes that then scored 90. For the first two tries of a line the example's
melody is drawn under the line while the user speaks, then it is hidden. A tap on Blop while it listens ends the
take at once; a tap while it is speaking skips to listening. A tap on the line gives another line at any point: before
Blop has said it, while it does, or while the take is running (a double tap counts once); so does a quick double tap
on Blop while it says the line. A tap on Blop just after a take has ended by itself doesn't throw the result away: it
was most likely meant to end the take. If the tab is hidden or the phone locked during a round, the round stops, the
microphone is let go and Blop is home again; a tap on it says the line. A line doesn't come back until three quarters of the others have been shown, also after
the page is reloaded (the last lines shown are kept in the browser). This
follows the research on pronunciation training: model voices, specific feedback after each try, and guidance
that fades out.

- **Which word was hard to hear** (`blop/clarity.js`, `blop/clarity.worker.js`). Whisper tiny.en is given the
  line the user was meant to say and asked how likely each word is given what it heard; a low score means a
  listener would struggle with the word. It runs on the device in a worker, so Blop keeps moving. The
  model is about 43 MB, comes from Hugging Face the first time and is cached by the browser; the library and the
  runtime come from jsDelivr (the runtime is about 5 MB as sent, 27 MB unpacked). The recording is never uploaded. If the model can't load (offline), the board
  shows the melody and timing comparison alone and says so. On the first visit the download takes a while (the model took 43 s
  here, at 0.9 MB/s), so the board comes up at once with the melody and timing, says the word check is on its way,
  and adds the words when the model has arrived.
- How well it works, on 1,220 sentences read by adult learners (speechocean762, Mandarin speakers, expert
  scores for every word): words marked red were unclear 65% of the time and green ones 5%; the sentence average
  correlates 0.71 with the experts' accuracy score. What it misses: a single swapped sound in a word that is easy
  to guess ("think" said as "sink") still passes. Telling which sound was wrong needs a model of sounds, which is
  not in the app yet. The cut-offs are `CUTS` in `blop/clarity.js`.
- **What the number is.** Word clarity: how sure a speech recogniser is that it heard each word of the line, given the
  line. It is not an accent score. Recognisers are built to understand accented speech, and this one is told what the
  user was meant to say, so the finer the difference, the less it sees. On the 1,217 adult takes of the speechocean762
  test split (Mandarin speakers, read sentences of up to 10 words, expert ratings) the score follows the experts'
  accuracy rating for the sentence (r = 0.71), and takes they rated "many mistakes and accent" scored 90 or more 7% of
  the time. Word by word it tells the words they called perfect from "wrong or missing" (rated 0 to 3) with an AUC of
  0.91, from "some sounds wrong" (4 to 6) 0.85, and from "most sounds right, with an accent" (7 to 9) 0.73. The pleased
  face used to need no hard word and at most one soft one; that went to 33% of the takes rated "many mistakes and
  accent" and 76% of "good, a few mistakes". It now needs a score of 92 as well (`PRAISE` in `blop/clarity.js`): 5% and
  43%, with 80% of the "excellent" takes still pleased. Measured on the same takes (speaker-disjoint 5-fold
  cross-validation), what could be added: the pace and pauses that `voice/engine.js` already measures predict the
  experts' fluency and prosody ratings as well as the word score does (r 0.78 and 0.76 from rhythm alone); words and
  rhythm together reach r 0.80 with accuracy, 0.84 with fluency, 0.81 with prosody and 0.82 with the total (words alone
  0.72, 0.71, 0.69, 0.73), and tell "excellent" takes from the rest with an AUC of 0.96 (0.92 for words alone). At the
  pass mark that lets 80% of the "excellent" takes through, words and rhythm pass 40% of the "good, a few mistakes"
  takes and 3% of the "many mistakes and accent" ones (words alone 44% and 6%): rhythm improves the number more than who
  gets praised. The confidence of two phoneme models on each sound lifts the words alone from 0.72 to 0.76 for accuracy;
  pitch variety and phrase endings add nothing. Rhythm and sounds are not part of the score yet.
- **Where each word is said** (`blop/align.js`, `blop/replay.js`). The example's word times are in
  `voice/models/lines.json`: for the AI-voice lines they are the speech service's own, for the CREMA-D fallback they were
  found once, offline, by forcing the sounds of the line (from the CMU pronouncing dictionary) onto a phoneme model's
  output (the model is not shipped); a word runs from its first sound to its last. A take is
  lined up with the example by how the two sound (MFCC frames, dynamic time warping), and the example's word times
  are carried across. The example's speech and the take's begin and end where the engine's speech detector finds them
  (the same detector for both), and the first word starts and the last ends there, so the two lines begin together; the
  example's own word times only place the words in between. On 160 adult learners' takes against a synthetic voice (an
  earlier version, before the edges were matched), the right word was lit for 78% of the speech, with word boundaries a
  median 30 ms from the forced alignment of the take itself (90th percentile 250 ms); it was 65% for the learners rated
  below 7 for fluency, and 86% for other actors' neutral readings. Against other synthetic voices (three voices, 14
  lines, 42 takes at each speed, the speech service's own word times as the truth) the right word was lit for 97% of
  the speech at normal speed, 97% at 0.8 of it, 96% at 0.7 and 92% at 0.49, with boundaries a median 10, 10, 20 and
  36 ms off (90th percentile 30, 40, 75 and 200 ms). Those takes are clean and have no hesitations. Without an
  example, the syllable peaks of the take lined up with the syllables of the text give about 65%. It goes wrong
  where a take is much slower than the example in one stretch. The melody is drawn from the engine's pitch track and
  its short unpitched gaps are bridged, so a consonant doesn't break the line.
- Motion follows Material Design 3's curves (emphasized decelerate for what arrives, standard for the rest). With the
  system's reduced-motion setting on, the slide-in, the scaling and the counting up are dropped and the colour sweep
  stays, since it is the information.
- **When the take is over** (`blop/turn.js`). Nothing tells the user to stop, so the page decides from three
  things. How long they have been quiet. What the word model makes of the take: after half a second of quiet it
  scores the take as it stands, and if nobody speaks meanwhile that scoring is the result, so the answer costs
  no extra wait; a mean score of -2 or better on the line's last two words (`TAIL` in `blop/clarity.js`) means
  they are done, and if those words did not score the take is held open for 1.4 to 3 s more. And how long the
  line takes: the example is a recording, so its length is known, a learner takes about 1.3 times as long give
  or take, and the further into that range they are, the shorter the hold. Without the word model (first visit,
  offline) the quiet and the length decide alone.
- How well that works, replaying 1,217 takes by adult learners from speechocean762 with
  `node tools/turn-replay.mjs` and a scoring pass of one second: the rule ended 0.2% of takes before the speaker
  was done (1.1% of the takes rated below 7 for fluency) and put the board up a median 1.5 s after the last
  word. A fixed quiet of one second cut off 3.0% (12.1% of those rated below 7) and took 2.0 s; a fixed two
  seconds cut off 0.3% but took 3.0 s; the quiet and the length without the word model cut off 2.1% and took
  2.2 s. The length adds nothing to a fixed quiet on its own, since learners differ about threefold in how fast
  they speak; the gain is from the word scores. A mean score of -2 or better on the last two words is reached
  at the end of 80% of takes and at 9% of the pauses in the middle of them, and those 9% only cut a take if the
  speaker stays quiet for as long as scoring takes. A free transcript of the take was a little better at
  telling the two apart (81% and 6%) but is a second pass over the audio. Limits: Mandarin speakers reading
  sentences, not learners talking to an app; the model voice's speed was assumed (4.6 syllables a second); a
  slower scoring pass (3 s) makes the rule safer and the board later; the page has been run with recordings fed in
  as the microphone, not on a phone.
- **How the take is going** (`wordsReached` in `blop/clarity.js`, `liveBand` and `showLive` in `blop/grade.js`,
  `liveStep` in `Blop.dc.html`). While the user speaks, the word model scores the first words of the line that have
  surely been said, on the audio so far, and Blop shows the result: the same scoring as the board's, on less of the
  line. Which words have surely been said comes from how long the user has been speaking, the pauses left out
  (`spoken` in `blop/turn.js`), and when the example says each word: a word counts once the speaking time is three times
  the example's time to the end of it (`LIVE.slowest`), and two words are needed before anything shows. One such scoring
  runs at a time, and none starts when it could still be running as the user reaches the end of the line, so it doesn't
  hold up the scoring that ends the take. A clear reading shows at once ("pleased"); one that finds a hard word shows
  ("unsure") only when the next one finds one too, since a lone reading can be the model's noise. There is no cross
  look while the user is still speaking; that is for the board.
- How well that works, replaying 61 takes of 14 to 30 words made by joining three sentences read by the same adult
  learner (speechocean762) against a Liora reading of the same words, with a scoring pass assumed to take 1.2 s: the
  learner's speaking time (pauses left out) was a median 1.4 times the example's, 2.2 at the 95th percentile and 2.9 at
  most (on 170 single sentences 1.6, 3.1 and 4.6, which is why it is three). Every take got a reading, the first after a
  median 1.3 s of speech and 3.9 readings a take. Of the 36 takes that scored 90 or more at the end, 1 showed "unsure"
  at any point (4 without the two-in-a-row rule); of the 31 whose result was not "clear", 13 did. It judges only the
  first words, so trouble in a stretch said later is not seen until the board. Limits: the scoring was replayed in
  Python with the float model, not in the browser; the takes are sentences joined, not one long line read by a
  learner; it has been run in the page with recordings fed in as the microphone, not on a phone.
- Rooms that are not quiet. The first version judged speech by loudness against a noise floor that fell quickly and
  rose slowly, and it got stuck under the room's noise (when the mic opened on digital silence, or the room was not
  quiet), so the room counted as speech and takes ran on to the length cap: 20% of the replayed takes with 0.3 s of
  digital silence at the start, and nearly all once the room was within 35 dB of the voice. Now the room's level is
  the quiet end of the last 4 seconds, worked out from the readings alone, and loud sound only counts as speech
  when it is voiced (a pitch, `livePitch` in `voice/engine.js`), so noise that is not a voice can't keep a take
  open. `node tools/turn-replay.mjs` can add noise (`--snr`, `--wobble`), bursts like a mic's noise suppression
  pumping (`--bursts`), a room that gets louder after the speech (`--agc`) and digital silence at the start
  (`--zeros`). With white noise down to 20 dB under the voice the take ends 1.3 to 1.5 s after the last word and
  0.2 to 1.4% of takes are cut off. Loudness alone ran on to the cap with noise bursts (median 9 s) and with the
  room 25 dB louder after the speech (median 5.7 s); with the voiced check both end at 1.5 s. Real microphones have
  not been tried here (the preview can't use one).
- The microphone and the audio are started inside the tap that starts a round, so the take can start by itself when
  Blop has finished, and the model starts loading then too. Our choice: an audio context started outside a tap can stay
  suspended on phones.
- The site is served without the two headers that multi-threaded WebAssembly needs (COOP and COEP, which make a page
  cross-origin isolated; MDN, SharedArrayBuffer), so the model runs on one thread: about 1.5 s for a sentence on a laptop (1.8 s in the page, with Blop drawing), slower on a phone.
  Scoring starts while the user is quiet, so most of that overlaps the wait for the take to end.
- The practice lines are in `voice/models/lines.json`; each line's example is
  `voice/models/<id>.mp3`. If the file can't be loaded, Blop falls back to a few built-in lines without
  examples (`PROMPTS` in `Blop.dc.html`). The take still starts by itself, and with no example to compare with, the
  board waits for the word check.
- The examples are read by an AI voice: 70 lines (5 to 33 words; 29 of them 19 or more) made with xAI's text-to-speech, the voice Liora, in four tones asked for with tags: neutral (plain text), excited (`<loud>`), calm (`<soft><slow>`) and sorry (`<low-pitch>`). Their entries in `lines.json` carry `ai` and `tone`; when any entry has `ai`, Blop plays only those. The page doesn't label them; this file and `voice/models/CREDITS.md` say what they are. Each line is the best of three renders: speech recognition (Whisper base.en) had to hear exactly the words of the line, and the render nearest the median length was kept. The word times in `words` are the speech service's own per-character times folded into words; on other Liora clips (203 words) they were within a median 40 ms of a separate phoneme-model alignment. The pace is the voice's own, not evened out: median 5.2 syllables a second (2.6 to 6.3; the calm lines are the slowest).
- The clips are the files the speech service returned, unchanged. xAI's terms for its output are quoted in
  `voice/models/CREDITS.md`, with links.
- The 12 CREMA-D readings (real actors, neutral; entries with a `clip` field) are the fallback when no entry has `ai`. To use your own
  recordings, add an entry to `lines.json` and an MP3 with the same id.
- Credit: CREMA-D (Cao et al., 2014) is under the Open Database License, its recordings under the
  Database Contents License; see `voice/models/CREDITS.md`. Blop shows a "voices: CREMA-D" link
  while a CREMA-D line is on screen. The CREMA-D team asks users of the repository to fill in
  [their form](https://docs.google.com/forms/d/e/1FAIpQLSdvOR994_Hsx7OkBU3oCzluXcmxw2P1nr-zBxcPgVBNLdD9Eg/viewform).
- `blop/local.js` builds the result Blop's board shows, so its moods and lines work as before.
  `blop/api.js`, the old Wav2Vec2 + GAT server client, is no longer used.
- Takes that can't be measured (silence, noise, too short) get a line from Blop and a retry,
  never a made-up score; a take where nothing is said is given up after 8 s the same way. The simulated read is only for "Continue without a microphone".

## Analysis

`voice/engine.js` measures each take in the browser. The recording never leaves the device,
and there is no server or API key. The board uses steps 1 and 2 and `compare` (below); `judge` and
the tone ranges of step 4 are from the first version of the app and are no longer used by it.

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

The board compares the take with the line's example (`compare`). The word check sets the headline score; if it
can't run yet or at all, this comparison sets it, and the board says "melody and timing" under the number. None of
its parts is shown as a bar, only the melody lane and the pace line; loudness and pitch range still count in that
score, though they move with the room and the microphone more than with how clear the speech is:

- **Melody shape** (40%): both melodies are put on the same time scale, each in semitones around
  its speaker's own usual pitch (so a deep voice can copy a high one), lined up with 5% leeway
  for uneven timing. The average gap must be within 0.8 semitones (`SHAPE_OK`).
- **Loudness** (30%): how far apart the loud and quiet parts of the speech are, compared with the
  example's (80–125% counts as the same).
- **Pitch range** (15%): pitch variety compared with the example's (75–135%).
- **Timing** (15%): length of the spoken part compared with the example's (85–118%).
- **Pauses** (15%, only when the example or the take pauses): the same number of pauses.

The weights come from a test on real voices in the first version, when the aim was telling tones apart: `node tools/crema-d-examples.mjs --calibrate` scores
other CREMA-D actors' takes of the same sentence against each example. Takes in the example's tone
should beat takes in the other two tones. On 677 takes they do so 71% of the time (calm 77%,
authoritative 77%, excited 61%), against 62% for the tone ranges alone; the median score is 63 for
takes in the example's tone and 50 for the others. Those actors were not copying the example, so
someone who is copying it should score higher.

The melody score used to be noisy: the same example, recorded again and again through the browser's recorder
(which compresses), scored between 39 and 100 on melody shape, so a perfect copy could read as a poor one. Takes
are now the raw microphone samples, and the same example played into the page four times scored 100 each time.
That is a test with a recording; real voices through a real microphone have not been repeated enough to say the
noise is gone.

Run the tests (Node 18 or newer):

    node --test tests/engine.test.js tests/blop-local.test.mjs tests/clarity.test.mjs tests/turn.test.mjs tests/grade.test.mjs tests/replay.test.mjs tests/align.test.mjs tests/name-writing.test.mjs
