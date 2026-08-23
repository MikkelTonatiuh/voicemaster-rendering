/* Ported from src/lib/voicemasterApi.js — same two-URL attempt and payload guard. */
export const VOICEMASTER_API = "http://127.0.0.1:8000";

const FALLBACK = "Could not analyse that take.";
const LEAK = /VoiceMaster|start\.ps1|fetch failed|Failed to fetch|NetworkError|Load failed|empty response|web page instead/i;

export function publicAnalyzerError(error) {
  const message = error?.message || (typeof error === "string" ? error : "");
  if (!message || LEAK.test(message)) return FALLBACK;
  return message;
}

export async function readJsonResponse(response) {
  const text = await response.text();
  const trimmed = (text || "").trim();
  if (!trimmed) throw new Error(FALLBACK);
  if (trimmed.startsWith("<")) throw new Error(FALLBACK);
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new Error("The analyzer sent a bad response. Try a slightly longer take.");
  }
}

export function errorFromPayload(data) {
  if (!data) return FALLBACK;
  if (typeof data.detail === "string") return publicAnalyzerError(data.detail);
  if (Array.isArray(data.detail) && data.detail[0]?.msg) return publicAnalyzerError(data.detail[0].msg);
  return publicAnalyzerError(data.error || FALLBACK);
}

export function parseAnalyzerPayload(data) {
  const predicted = data?.predicted ?? data?.emotion;
  const probs = data?.probs ?? data?.probabilities;
  const ok =
    predicted != null && predicted !== "" &&
    probs != null && typeof probs === "object" &&
    data?.score != null && typeof data?.mixed === "boolean" &&
    Array.isArray(data?.tips) &&
    data?.prosody != null && typeof data.prosody === "object" && !Array.isArray(data.prosody);
  if (!ok) throw new Error(publicAnalyzerError(FALLBACK));
  return data;
}

export async function postToAnalyzer(path, formData) {
  const urls = [path, `${VOICEMASTER_API}${path}`];
  let lastError = null;
  for (const url of urls) {
    try {
      const body = new FormData();
      for (const [key, value] of formData.entries()) body.append(key, value);
      const response = await fetch(url, { method: "POST", body });
      const data = await readJsonResponse(response);
      if (!response.ok) throw new Error(errorFromPayload(data));
      return parseAnalyzerPayload(data);
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(publicAnalyzerError(lastError || FALLBACK));
}

export async function analyzeDemo(id, target) {
  const formData = new FormData();
  if (target) {
    formData.append("target", target);
    formData.append("targetEmotion", target);
  }
  return postToAnalyzer(`/api/analyze-demo/${id}`, formData);
}
