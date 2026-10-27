import { credits, listVoices } from "@/lib/elevenlabs";

// Voice list + remaining credits for the Voice tab. Neither call costs credits.
export async function GET() {
  try {
    const [voices, usage] = await Promise.all([listVoices(), credits()]);
    return Response.json({ voices, credits: usage });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Couldn't load voices" }, { status: 502 });
  }
}
