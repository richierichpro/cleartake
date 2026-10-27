import fs from "node:fs/promises";
import type { Transcript } from "./types";

// Docs: https://www.assemblyai.com/docs/api-reference
const BASE = "https://api.assemblyai.com/v2";

function apiKey() {
  const key = process.env.ASSEMBLYAI_API_KEY;
  if (!key) throw new Error("ASSEMBLYAI_API_KEY is missing from .env.local");
  return key;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { authorization: apiKey(), ...init.headers },
  });
  const text = await res.text();
  let body: { error?: string } = {};
  try {
    body = JSON.parse(text);
  } catch {}
  if (!res.ok) throw new Error(`AssemblyAI ${res.status}: ${body.error ?? text.slice(0, 200)}`);
  return body as T;
}

export async function uploadAudio(file: string) {
  const { upload_url } = await call<{ upload_url: string }>("/upload", {
    method: "POST",
    headers: { "content-type": "application/octet-stream" },
    body: await fs.readFile(file),
  });
  return upload_url;
}

export async function submitTranscript(audioUrl: string, keyterms: string[]) {
  const { id } = await call<{ id: string }>("/transcript", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      audio_url: audioUrl,
      language_code: "en",
      ...(keyterms.length ? { keyterms_prompt: keyterms } : {}),
    }),
  });
  return id;
}

interface AssemblyTranscript {
  id: string;
  status: "queued" | "processing" | "completed" | "error";
  error?: string;
  text?: string;
  words?: { text: string; start: number; end: number; confidence: number }[];
}

/** Polls until the transcript is done. onStatus reports queued/processing for the UI. */
export async function waitForTranscript(id: string, onStatus: (s: string) => void): Promise<Transcript> {
  for (;;) {
    const t = await call<AssemblyTranscript>(`/transcript/${id}`);
    if (t.status === "error") throw new Error(`Transcription failed: ${t.error}`);
    if (t.status === "completed") {
      return {
        assemblyId: t.id,
        createdAt: new Date().toISOString(),
        text: t.text ?? "",
        words: (t.words ?? []).map((w) => ({
          text: w.text,
          start: w.start / 1000,
          end: w.end / 1000,
          confidence: w.confidence,
        })),
      };
    }
    onStatus(t.status);
    await new Promise((r) => setTimeout(r, 2000));
  }
}
