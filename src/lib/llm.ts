// AssemblyAI LLM Gateway (OpenAI-compatible), same key as transcription.
// Docs: https://www.assemblyai.com/docs/llm-gateway/overview
// The model is configurable because availability depends on the AssemblyAI plan.
export const LLM_MODEL = process.env.LLM_MODEL || "gemma-4-31b";

const URL = "https://llm-gateway.assemblyai.com/v1/chat/completions";

/** Sends a system + user message and returns the reply parsed against a JSON schema. */
export async function chatJson<T>(opts: {
  system: string;
  user: string;
  schemaName: string;
  schema: object;
  maxTokens?: number;
}): Promise<T> {
  const key = process.env.ASSEMBLYAI_API_KEY;
  if (!key) throw new Error("ASSEMBLYAI_API_KEY is missing from .env.local");

  const res = await fetch(URL, {
    method: "POST",
    headers: { authorization: key, "content-type": "application/json" },
    body: JSON.stringify({
      model: LLM_MODEL,
      max_tokens: opts.maxTokens ?? 4000,
      temperature: 0.3,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: opts.schemaName, strict: true, schema: opts.schema },
      },
      post_processing_steps: [{ type: "json-repair" }],
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.choices) {
    const reason = body.metadata?.errors?.[0] ?? body.message ?? `HTTP ${res.status}`;
    throw new Error(`LLM Gateway (${LLM_MODEL}): ${reason}`);
  }
  const content: string = body.choices[0].message.content ?? "";
  try {
    return JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, "")) as T;
  } catch {
    throw new Error("The AI returned malformed JSON. Try again.");
  }
}
