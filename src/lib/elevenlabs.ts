// ElevenLabs API. Docs: https://elevenlabs.io/docs/api-reference
const BASE = "https://api.elevenlabs.io/v1";

function apiKey() {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ELEVENLABS_API_KEY is missing from .env.local");
  return key;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: { "xi-api-key": apiKey(), ...init.headers } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const d = body.detail;
    const reason = typeof d === "string" ? d : d?.message ?? (Array.isArray(d) ? d[0]?.msg : null) ?? `HTTP ${res.status}`;
    throw new Error(`ElevenLabs: ${reason}`);
  }
  return body as T;
}

export interface VoiceOption {
  id: string;
  name: string; // "Matilda"
  tagline: string; // "Knowledgable, Professional"
  gender: string;
  accent: string;
  style: string;
  previewUrl: string | null;
}

interface RawVoice {
  voice_id: string;
  name: string;
  labels?: Record<string, string>;
  preview_url?: string | null;
}

export async function listVoices(): Promise<VoiceOption[]> {
  const { voices } = await call<{ voices: RawVoice[] }>("/voices");
  return voices.map((v) => {
    const [name, tagline = ""] = v.name.split(" - ");
    const l = v.labels ?? {};
    return {
      id: v.voice_id,
      name: name.trim(),
      tagline: tagline.trim(),
      gender: l.gender ?? "",
      accent: l.accent ?? "",
      style: l.descriptive ?? l.use_case?.replace(/_/g, " ") ?? "",
      previewUrl: v.preview_url ?? null,
    };
  });
}

/** Credits used / allowed this month, or null if the key can't read the user. */
export async function credits(): Promise<{ used: number; limit: number } | null> {
  try {
    const s = await call<{ character_count: number; character_limit: number }>("/user/subscription");
    return { used: s.character_count, limit: s.character_limit };
  } catch {
    return null;
  }
}

export interface Alignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

export async function synthesize(opts: {
  text: string;
  voiceId: string;
  model: string;
  previousText?: string;
  nextText?: string;
}) {
  const res = await call<{ audio_base64: string; alignment: Alignment | null }>(
    `/text-to-speech/${opts.voiceId}/with-timestamps?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: opts.text,
        model_id: opts.model,
        // Neighbouring paragraphs keep the intonation continuous across clips.
        ...(opts.previousText ? { previous_text: opts.previousText } : {}),
        ...(opts.nextText ? { next_text: opts.nextText } : {}),
      }),
    },
  );
  return { audio: Buffer.from(res.audio_base64, "base64"), alignment: res.alignment };
}
