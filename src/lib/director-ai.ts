import { activeParagraphs, cleanPlan, DIRECTOR_CONFIG, scriptKey } from "./director";
import { chatJson, LLM_MODEL } from "./llm";
import { mutateProject, readProject } from "./projects";
import { loadSyncPlan } from "./sync-server";
import { tokens } from "./text-match";
import { outputZooms } from "./zooms";
import type { DirectorPlan } from "./types";

// Step 15: the AI "director" pass. One LLM call over the final script, timeline and zooms;
// the reply is validated (unknown paragraphs, words not in the text, over the limits) and saved for review.

const SYSTEM = (maxCallouts: number) => `You are the editor of a short screen-recorded product demo. You get the narration split into paragraphs, each with its time in the final video (seconds), and the zooms already placed. Plan the on-screen text that makes the video look professional. Be restrained: less is better.

Return:
- title: the title for the intro card, 2–6 words, Title Case, no trailing punctuation. Use the product name if one is mentioned.
- subtitle: one short line under the title, at most 10 words: what the viewer will see or learn.
- steps: step labels shown where a NEW task begins (for example "Add your friends", "Plan the trip"). Skip parts that only introduce or wrap up. 2–4 words, start with a verb, sentence case. paragraphId = the paragraph where the task begins; phrase: 1–4 words copied exactly from that paragraph's text, said where the task begins (a paragraph can contain more than one task). Steps must be at least 5 seconds apart.
- callouts: short lower-third notes for a key point the viewer shouldn't miss (a benefit, a tip, a number). At most ${maxCallouts}. text: 2–6 words, not a repeat of a step label. phrase: 1–4 words copied exactly from that paragraph's text, said at the moment the callout should appear. Prefer moments without a zoom.
- emphasis: up to ${DIRECTOR_CONFIG.maxEmphasisPerParagraph} important words per paragraph to highlight in the captions (product names, key actions, numbers). One word each, copied exactly from the paragraph's text. Return none for a paragraph with nothing important.
- outro: one closing line for the end card, at most 8 words (a call to action or a summary).
Never invent features or claims that aren't in the narration.`;

const item = (props: Record<string, { type: "string" }>) => ({
  type: "array",
  items: { type: "object", properties: props, required: Object.keys(props), additionalProperties: false },
});

const SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    subtitle: { type: "string" },
    steps: item({ paragraphId: { type: "string" }, phrase: { type: "string" }, label: { type: "string" } }),
    callouts: item({ paragraphId: { type: "string" }, phrase: { type: "string" }, text: { type: "string" } }),
    emphasis: item({ paragraphId: { type: "string" }, word: { type: "string" } }),
    outro: { type: "string" },
  },
  required: ["title", "subtitle", "steps", "callouts", "emphasis", "outro"],
  additionalProperties: false,
};

type Reply = {
  title: string;
  subtitle: string;
  steps: { paragraphId: string; phrase: string; label: string }[];
  callouts: { paragraphId: string; phrase: string; text: string }[];
  emphasis: { paragraphId: string; word: string }[];
  outro: string;
};

const round = (t: number) => Math.round(t * 10) / 10;

export async function runDirector(projectId: string) {
  const project = await readProject(projectId);
  if (!project) throw new Error("Project not found");
  const { plan } = await loadSyncPlan(project);
  const paragraphs = activeParagraphs(project, plan);
  if (!paragraphs.length) throw new Error("There's no narration to plan from yet");

  const maxCallouts = Math.max(1, Math.floor(plan.outputDuration / DIRECTOR_CONFIG.calloutEvery));
  const reply = await chatJson<Reply>({
    system: SYSTEM(maxCallouts),
    user: JSON.stringify({
      ...(project.keyterms?.length ? { productTerms: project.keyterms } : {}),
      videoLength: round(plan.outputDuration),
      paragraphs: paragraphs.map((p) => ({ id: p.seg.id, start: round(p.start), end: round(p.end), text: p.text })),
      zooms: outputZooms(project, plan).map((z) => ({ start: round(z.start), end: round(z.end) })),
    }),
    schemaName: "director_plan",
    schema: SCHEMA,
  });

  // Validate: the model sometimes points at paragraphs that don't exist or "copies" words that aren't there.
  const content = cleanPlan({
    ...reply,
    steps: reply.steps?.map((s) => ({ segmentId: s.paragraphId, phrase: s.phrase, label: s.label })),
    callouts: reply.callouts?.map((c) => ({ segmentId: c.paragraphId, phrase: c.phrase, text: c.text })),
    emphasis: reply.emphasis?.map((e) => ({ segmentId: e.paragraphId, word: e.word })),
  });
  const text = new Map(paragraphs.map((p) => [p.seg.id, new Set(tokens(p.text))]));
  const dropped: DirectorPlan["dropped"] = [];
  const keep = <T extends { segmentId: string }>(kind: DirectorPlan["dropped"][number]["kind"], label: (x: T) => string, check: (x: T, i: number) => string | null) =>
    (x: T, i: number) => {
      const reason = !text.has(x.segmentId) ? "unknown paragraph" : check(x, i);
      if (reason) dropped.push({ kind, text: label(x), reason });
      return !reason;
    };

  content.steps = content.steps.filter(keep("step", (s) => s.label, () => null));
  content.callouts = content.callouts.filter(keep("callout", (c) => c.text, (_, i) => (i >= maxCallouts ? `over the limit (${maxCallouts})` : null)));
  const perParagraph = new Map<string, number>();
  content.emphasis = content.emphasis.filter(
    keep("emphasis", (e) => e.word, (e) => {
      const words = tokens(e.word);
      if (!words.length || !words.every((w) => text.get(e.segmentId)!.has(w))) return "not in the paragraph";
      const n = (perParagraph.get(e.segmentId) ?? 0) + 1;
      perParagraph.set(e.segmentId, n);
      return n > DIRECTOR_CONFIG.maxEmphasisPerParagraph ? `more than ${DIRECTOR_CONFIG.maxEmphasisPerParagraph} in one paragraph` : null;
    }),
  );

  const director: DirectorPlan = { ...content, dropped, scriptKey: scriptKey(project), model: LLM_MODEL, at: new Date().toISOString() };
  return mutateProject(projectId, (p) => {
    p.director = director;
  });
}
