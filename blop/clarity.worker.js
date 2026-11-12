/* Runs the word scoring off the main thread, so Blop keeps moving while it listens.
   in:  { type: "init", lib, local }       out: { type: "progress", pct } ... { type: "ready" }
        { type: "score", id, pcm, text, heard }    { type: "scored", id, words, ms }, then, unless heard is false,
                                                    { type: "heard", id, text }
        { type: "hear", id, pcm }                  { type: "heard", id, text }
        { type: "cancel", id }                     a score that has not started is dropped (it answers with no words)
   Jobs run one at a time, in the order they came. Errors come back as { type: "error", id?, message }. */
import { MODEL, downloadMeter, wordScores } from "./clarity.js";

let asr = null, proc = null, Tensor = null;
let queue = Promise.resolve();
const dropped = new Set();

function logSoftmaxAt(data, offset, size, target) {
  let top = -Infinity;
  for (let i = 0; i < size; i += 1) if (data[offset + i] > top) top = data[offset + i];
  let sum = 0;
  for (let i = 0; i < size; i += 1) sum += Math.exp(data[offset + i] - top);
  return data[offset + target] - top - Math.log(sum);
}

async function init({ lib, local }) {
  const T = await import(lib);
  const { env, pipeline, AutoProcessor } = T;
  Tensor = T.Tensor;
  if (local) {
    /* a copy of the model and runtime on another local port, for testing: the model's files are read from there
       instead of Hugging Face (a "local" model path can't be another origin) */
    env.remoteHost = local;
    env.remotePathTemplate = "models/{model}/";
    env.backends.onnx.wasm.wasmPaths = local + "ort/";
  }
  const meter = downloadMeter();
  const progress = (p) => {
    const pct = meter(p);
    if (pct !== null) self.postMessage({ type: "progress", pct });
  };
  asr = await pipeline("automatic-speech-recognition", MODEL, { dtype: "q8", device: "wasm", progress_callback: progress });
  proc = await AutoProcessor.from_pretrained(MODEL);
}

/* what it made of the take, for the board to show once the words are up */
async function hear({ id, pcm }) {
  try {
    const out = await asr(pcm);
    self.postMessage({ type: "heard", id, text: String(out.text || "").trim() });
  } catch { /* the words are already on the board */ }
}

async function score({ id, pcm, text, heard }) {
  if (dropped.delete(id)) { self.postMessage({ type: "scored", id, words: null, ms: 0 }); return; }
  const t0 = performance.now();
  const spaced = " " + text;
  const tokens = asr.tokenizer.tokenize(spaced);
  /* encode() wraps the line in the model's start, no-timestamps and end markers */
  const ids = Array.from(asr.tokenizer.encode(spaced));
  const lead = ids.length - tokens.length - 1;
  if (lead < 1) throw new Error("unexpected tokens");
  const inputs = await proc(pcm);
  const dec = new Tensor("int64", BigInt64Array.from(ids.slice(0, -1).map(BigInt)), [1, ids.length - 1]);
  const out = await asr.model({ input_features: inputs.input_features, decoder_input_ids: dec });
  const size = out.logits.dims[2], data = out.logits.data;
  const logps = tokens.map((_, j) => logSoftmaxAt(data, (lead + j - 1) * size, size, ids[lead + j]));
  const words = wordScores(text.split(/\s+/).filter(Boolean), tokens, logps);
  self.postMessage({ type: "scored", id, words, ms: Math.round(performance.now() - t0) });
  if (heard !== false) await hear({ id, pcm });
}

self.onmessage = (e) => {
  const m = e.data;
  if (m.type === "cancel") { dropped.add(m.id); return; }
  queue = queue.then(async () => {
    try {
      if (m.type === "init") { await init(m); self.postMessage({ type: "ready" }); }
      else if (m.type === "score") await score(m);
      else if (m.type === "hear") await hear(m);
    } catch (err) {
      self.postMessage({ type: "error", id: m.id, message: String((err && err.message) || err) });
    }
  });
};
