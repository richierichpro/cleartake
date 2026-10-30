import fs from "node:fs/promises";
import { chatJson } from "./llm";
import { ocrFrames, type OcrItem } from "./ocr";
import { projectFile, readJson, readProject } from "./projects";
import { pointerBefore } from "./pointer";
import { findPhraseTime, norm, tokens } from "./text-match";
import { detectZoomCandidates, type ZoomCandidate } from "./zoom-detect";
import type { Motion } from "./sync";
import type { Project, Transcript } from "./types";

// Step 12 (revised): zoom where the narration points. The AI lists UI elements the speaker names,
// the transcript says when, OCR says where. Screen-change detection is only a backup (typing).

export const ZOOM_SUGGEST_CONFIG = {
  leadIn: 0.4, // start zooming this long before the phrase is spoken
  hold: 1.2, // stay zoomed this long after it's spoken (short: a quick look, then back)
  minGap: 3, // spec: no zooms closer than this
  ocrOffsets: [-1, -0.5, 0, 1], // OCR around the phrase: people name a button as they click it (it changes), or just before it appears
  minMatch: 0.6, // how closely on-screen text must match the phrase (0–1)
  typingMinLength: 1, // a small region changing this long (s) counts as typing
  typingMaxArea: 0.08, // …if it covers at most this share of the screen
  clickMaxArea: 0.25, // any other change up to this share of the screen (a button press, a menu opening) = a click: a subtle zoom
};

export interface ZoomSuggestion extends ZoomCandidate {
  reason: "narration" | "typing" | "click";
  phrase?: string; // what you said
  ocrText?: string; // what it matched on screen
  confirmedByChange?: boolean; // the screen also changed there
  atPointer?: boolean; // a click zoom centred on the mouse pointer (found in the frames)
  score: number;
}

export interface Mention {
  phrase: string;
  segmentId: string;
  status: "zoom" | "not-spoken" | "not-on-screen" | "too-close";
  time?: number; // source seconds it was spoken
  ocrText?: string;
}

export interface ZoomSuggestions {
  candidates: ZoomSuggestion[];
  mentions: Mention[];
  config: typeof ZOOM_SUGGEST_CONFIG;
}

/** 0–1: how well an on-screen text line matches the phrase. */
export function matchScore(screenText: string, phrase: string) {
  const a = norm(screenText);
  const b = norm(phrase);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b)) return 0.9 * Math.min(1, b.length / a.length + 0.4); // phrase inside a longer line
  if (b.includes(a) && a.length >= 4) return 0.8 * (a.length / b.length);
  const ta = new Set(tokens(a));
  const tb = tokens(b);
  return tb.filter((t) => ta.has(t)).length / Math.max(ta.size, tb.length);
}

/** The AI picks the on-screen things the speaker refers to by name, as spoken. */
async function extractMentions(project: Project): Promise<{ segmentId: string; phrase: string }[]> {
  const segments = (project.segments ?? []).filter((s) => s.originalText.trim());
  if (!segments.length) return [];
  const reply = await chatJson<{ mentions: { id: string; phrase: string }[] }>({
    system: `You read the narration of a screen-recorded product demo and list the on-screen UI elements the speaker refers to by name: button labels, menu items, tabs, links, field names, section headings, product names shown on screen.
- Copy each phrase exactly as it appears in the narration (it will be matched against the transcript), 1–6 words.
- Only things that would be visible as text on screen. Skip generic words ("here", "this page", "the app").
- At most 3 per segment, in the order they're mentioned. Return an empty list if there are none.`,
    user: JSON.stringify({
      ...(project.keyterms?.length ? { productTerms: project.keyterms } : {}),
      segments: segments.map((s) => ({ id: s.id, text: s.originalText })),
    }),
    schemaName: "ui_mentions",
    schema: {
      type: "object",
      properties: {
        mentions: {
          type: "array",
          items: {
            type: "object",
            properties: { id: { type: "string" }, phrase: { type: "string" } },
            required: ["id", "phrase"],
            additionalProperties: false,
          },
        },
      },
      required: ["mentions"],
      additionalProperties: false,
    },
  });
  return reply.mentions.map((m) => ({ segmentId: m.id, phrase: m.phrase.trim() })).filter((m) => m.phrase);
}

export async function suggestZooms(projectId: string): Promise<ZoomSuggestions> {
  const c = ZOOM_SUGGEST_CONFIG;
  const project = await readProject(projectId);
  if (!project) throw new Error("Project not found");
  const transcript = await readJson<Transcript>(projectId, "transcript.json");
  if (!transcript) throw new Error("Transcribe the recording first");
  const words = transcript.words;

  // Screen changes (backup signal), from the Step 6 frames.
  const motion = await readJson<Motion>(projectId, "motion.json");
  const raw = await fs.readFile(projectFile(projectId, "frames.gray")).catch(() => null);
  const changes =
    motion && raw ? detectZoomCandidates(new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength), motion).candidates : [];

  // 1. What you mention, and when you say it.
  const mentions: Mention[] = [];
  const spoken: { mention: Mention; time: number }[] = [];
  for (const m of await extractMentions(project)) {
    const seg = project.segments?.find((s) => s.id === m.segmentId);
    const time =
      (seg && findPhraseTime(words, m.phrase, seg.wordStart, seg.wordEnd)) ?? findPhraseTime(words, m.phrase);
    const mention: Mention = { ...m, status: time === null ? "not-spoken" : "zoom", ...(time !== null && { time }) };
    mentions.push(mention);
    if (time !== null) spoken.push({ mention, time });
  }

  // 2. Where it is on screen: OCR a few frames around the moment you say it.
  const clampT = (t: number) => Math.max(0, Math.min(project.video.duration - 0.05, t));
  const times = spoken.flatMap((s) => c.ocrOffsets.map((o) => clampT(s.time + o)));
  const screens = await ocrFrames(projectFile(projectId, project.video.file), times);

  const found: ZoomSuggestion[] = [];
  spoken.forEach(({ mention, time }, i) => {
    let best: { item: OcrItem; score: number; at: number } | null = null;
    for (const [k, o] of c.ocrOffsets.entries()) {
      for (const item of screens[i * c.ocrOffsets.length + k] ?? []) {
        const score = matchScore(item.text, mention.phrase);
        // Prefer the better match; on ties, the smaller (more specific) box.
        if (!best || score > best.score + 0.01 || (Math.abs(score - best.score) <= 0.01 && item.w * item.h < best.item.w * best.item.h)) {
          best = { item, score, at: clampT(time + o) };
        }
      }
    }
    if (!best || best.score < c.minMatch) {
      mention.status = "not-on-screen";
      return;
    }
    mention.ocrText = best.item.text;
    const { x, y, w, h } = best.item;
    const confirmed = changes.some(
      (z) => Math.abs(z.start - time) < 2 && z.x < x + w && x < z.x + z.w && z.y < y + h && y < z.y + z.h,
    );
    found.push({
      id: `n${Math.round(time * 10)}`,
      // Start early enough to show the element before it changes (e.g. a button you click as you name it).
      start: Math.max(0, Math.min(time - c.leadIn, best.at)),
      end: time + c.hold,
      x,
      y,
      w,
      h,
      changedPx: 0,
      reason: "narration",
      phrase: mention.phrase,
      ocrText: best.item.text,
      confirmedByChange: confirmed,
      score: confirmed ? 1.3 : 1,
    });
  });

  // 3. Backup: typing (a small region changing for a while), then clicks (any other change in part of
  // the screen: a recording has no click data, but a button press or a menu opening shows up as one).
  for (const z of changes) {
    if (z.end - z.start >= c.typingMinLength && z.w * z.h <= c.typingMaxArea) {
      found.push({ ...z, id: `t${z.id}`, reason: "typing", score: 0.5 });
    } else if (z.w * z.h <= c.clickMaxArea) {
      found.push({ ...z, id: `c${z.id}`, reason: "click", score: 0.3 });
    }
  }

  // 4. Spacing: best first, nothing within minGap seconds of a kept zoom.
  const kept: ZoomSuggestion[] = [];
  for (const z of [...found].sort((a, b) => b.score - a.score)) {
    if (kept.every((k) => Math.abs(k.start - z.start) >= c.minGap)) kept.push(z);
    else if (z.reason === "narration") {
      const m = mentions.find((x) => x.phrase === z.phrase && x.time !== undefined && x.time >= z.start && x.time <= z.end);
      if (m) m.status = "too-close";
    }
  }
  // 5. Clicks zoom where you clicked: find the mouse pointer just before the change (fallback: the change).
  for (const z of kept) {
    if (z.reason !== "click") continue;
    const at = await pointerBefore(projectFile(projectId, project.video.file), z.start, project.video.width, project.video.height, {
      x: z.x + z.w / 2,
      y: z.y + z.h / 2,
    }).catch(() => null);
    if (!at) continue;
    const half = 0.04; // a small box around the pointer, so the zoom centres on it
    Object.assign(z, { x: Math.max(0, at.x - half), y: Math.max(0, at.y - half), w: 2 * half, h: 2 * half, atPointer: true });
  }
  return { candidates: kept.sort((a, b) => a.start - b.start), mentions, config: c };
}
