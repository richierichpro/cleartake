import { chatJson, LLM_MODEL } from "./llm";
import type { Project } from "./types";

const SYSTEM = `You polish the voiceover script of a screen-recorded product demo.

The speaker is not a native English speaker, so the transcript has grammar mistakes, wrong word choices and broken sentences.

Rewrite each segment into clear, natural, professional English that sounds good read aloud.
- Remove filler words (um, uh, so, okay, "no?", like), repeated words and false starts.
- Keep the original meaning. Never add information, features or claims that were not said.
- Keep each segment roughly the same length as the original, so it still fits its part of the video. Do not merge or split segments.
- Keep product names and technical terms exactly as written.
- Return every segment with the same id, in the same order.
- Set "isRetake": true only for a segment that is purely a mistake or retake (for example "sorry, let me do that again"). For those, return "text": "".`;

const SCHEMA = {
  type: "object",
  properties: {
    segments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          text: { type: "string" },
          isRetake: { type: "boolean" },
        },
        required: ["id", "text", "isRetake"],
        additionalProperties: false,
      },
    },
  },
  required: ["segments"],
  additionalProperties: false,
};

type Reply = { segments: { id: string; text: string; isRetake: boolean }[] };

/**
 * Rewrites every segment in one LLM call (so the model sees the whole script)
 * and applies the result: aiText + isRetake are stored, text becomes the AI version.
 * originalText is never touched. Segments the model skipped keep their text.
 */
export async function rewriteScript(project: Project, keyterms: string[] = []) {
  const segments = project.segments ?? [];
  if (!segments.length) return { segments, missing: 0 };

  const user = JSON.stringify({
    ...(keyterms.length ? { productTerms: keyterms } : {}),
    segments: segments.map((s) => ({ id: s.id, text: s.originalText })),
  });
  const words = segments.reduce((n, s) => n + s.originalText.split(/\s+/).length, 0);
  const reply = await chatJson<Reply>({
    system: SYSTEM,
    user,
    schemaName: "script_rewrite",
    schema: SCHEMA,
    maxTokens: Math.max(1000, words * 4 + 500),
  });

  const byId = new Map(reply.segments.map((r) => [r.id, r]));
  let missing = 0;
  const updated = segments.map((s) => {
    const r = byId.get(s.id);
    if (!r) {
      missing++;
      return s;
    }
    const aiText = r.isRetake ? "" : r.text.trim();
    return { ...s, aiText, isRetake: r.isRetake, text: aiText };
  });
  return { segments: updated, missing, model: LLM_MODEL };
}
