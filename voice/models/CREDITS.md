# Example voices

There are two sets of example lines.

## AI voice (what Blop plays)

The `liora-NN` clips are synthetic speech made with xAI's text-to-speech API (the voice Liora), not recordings of a
person. They are the files the service returned, unchanged. `lines.json` marks them with `ai` and says which tone
each was asked for. The page doesn't label them; this file and the README say what they are.

The terms on x.ai are those of SpaceX Super Intelligence LLC ("SpaceXSI"). What they say about this output, official
(source: the pages linked, read 12 November 2026):

- Which terms: the consumer terms (https://x.ai/legal/terms-of-service, last updated 27 October 2026) say "Our
  Enterprise Terms of Service govern the use of our Services for developers and businesses, including SpaceXSI APIs
  and PromptIDE." These clips were made through the API.
- Terms of Service, Enterprise (https://x.ai/legal/terms-of-service-enterprise, last updated 27 October 2026):
  SpaceXSI "hereby assigns to Customer all of its right, title, and interest in such Output"; "Customer will not, and
  will not permit any third party to: (i) use any Output to train any foundation models, large language models, or
  other artificial intelligence systems except as may be expressly permitted in an Order Form; or (ii) misrepresent
  that any Output was human-generated."; and "Customer will comply with SpaceXSI’s Acceptable Use Policy".
- Acceptable Use Policy (https://x.ai/legal/acceptable-use-policy, effective 14 August 2026), under "Comply with the
  law": "Misleading others or not being transparent regarding your use of AI, including by phishing, creating fake
  accounts, providing services that appear to be from you, when they are in fact from SpaceXSI, or providing services
  that appear to originate from SpaceXSI, when they do not", and "Stripping, altering or circumventing embedded
  provenance metadata or watermarks".

## CREMA-D (fallback)

The `calm-*` lines are recordings from **CREMA-D**, the Crowd-sourced Emotional Multimodal Actors
Dataset: H. Cao, D. G. Cooper, M. K. Keutmann, R. C. Gur, A. Nenkova and R. Verma, "CREMA-D:
Crowd-sourced Emotional Multimodal Actors Dataset", IEEE Transactions on Affective Computing 5(4),
377–390, 2014. https://github.com/CheyneyComputerScience/CREMA-D

CREMA-D is made available under the Open Database License
(http://opendatacommons.org/licenses/odbl/1.0/). Any rights in individual contents of the database
are licensed under the Database Contents License (http://opendatacommons.org/licenses/dbcl/1.0/).

The clips here were trimmed, level-adjusted and converted to MP3 by `tools/crema-d-examples.mjs`.
Only the neutral readings are kept, one per sentence. Blop plays them only when `lines.json` has no AI-voice lines.
`lines.json` names the original CREMA-D clip behind each file and how many of CREMA-D's listeners
heard it as neutral.
