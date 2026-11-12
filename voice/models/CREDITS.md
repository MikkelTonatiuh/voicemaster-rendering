# Example voices

There are two sets of example lines.

## AI voice (what Blop plays)

The `liora-NN` clips are synthetic speech made with xAI's text-to-speech API (the voice Liora), not recordings of a
person. The page doesn't label them; this file and the README say what they are. Under xAI's Enterprise Terms of Service (last updated 27 October 2026)
the customer owns the output, may not use it to train AI models and may not present it as human-generated.
`lines.json` marks them with `ai` and says which tone each was asked for.

## CREMA-D (fallback)

The `calm-*` lines are recordings from **CREMA-D**, the Crowd-sourced Emotional Multimodal Actors
Dataset: H. Cao, D. G. Cooper, M. K. Keutmann, R. C. Gur, A. Nenkova and R. Verma, "CREMA-D:
Crowd-sourced Emotional Multimodal Actors Dataset", IEEE Transactions on Affective Computing 5(4),
377–390, 2014. https://github.com/CheyneyComputerScience/CREMA-D

CREMA-D is made available under the Open Database License
(http://opendatacommons.org/licenses/odbl/1.0/). Any rights in individual contents of the database
are licensed under the Database Contents License (http://opendatacommons.org/licenses/dbcl/1.0/).

The clips here were trimmed, level-adjusted and converted to MP3 by `tools/crema-d-examples.mjs`.
Only the neutral readings are used, one per sentence, as the voice Blop says each line in.
`lines.json` names the original CREMA-D clip behind each file and how many of CREMA-D's listeners
heard it as neutral.
