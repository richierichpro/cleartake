"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  AudioLines,
  Eye,
  EyeOff,
  FileText,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  TriangleAlert,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { generateVoice, rewriteScript, splitSegment, updateSegment } from "@/lib/client";
import { isSegmentRemoved } from "@/lib/edits";
import { outputToSource, segmentRanges, type SyncPlan } from "@/lib/sync";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { clipStatus, creditCost, estimateSeconds, voiceOf, type ClipStatus } from "@/lib/voice-settings";
import type { Project, Segment } from "@/lib/types";
import type { ProjectUpdate } from "./editor";
import type { Playback } from "./use-playback";

const SAVE_DELAY = 700; // ms after the last keystroke

const pluralize = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// Script tab: reads like a document. Timestamp gutter on the left, editable paragraphs on the right.
export function ScriptView({
  project,
  plan,
  playback,
  onChange,
}: {
  project: Project;
  plan: SyncPlan;
  playback: Playback;
  onChange: ProjectUpdate;
}) {
  const { segments } = project;
  const voice = voiceOf(project);
  const aiMode = voice.mode === "ai";
  const t = playback.currentTime;

  const [polishing, setPolishing] = useState(false);
  const [generating, setGenerating] = useState<Set<string>>(new Set());
  const [showOriginal, setShowOriginal] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(0);
  const [focusId, setFocusId] = useState<string | null>(null);

  // Autosave: local state updates on every keystroke, the server gets the text after a pause.
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const latest = useRef(project);
  useEffect(() => {
    latest.current = project;
  }, [project]);

  /** Applies a server response without clobbering paragraphs that still have unsaved typing. */
  const applyServer = useCallback(
    (server: Project) =>
      onChange((prev) => ({
        ...server,
        segments: server.segments?.map((s) => {
          if (!timers.current.has(s.id)) return s;
          const local = prev.segments?.find((x) => x.id === s.id);
          return local ? { ...s, text: local.text } : s;
        }),
      })),
    [onChange],
  );

  const save = useCallback(
    async (segId: string) => {
      clearTimeout(timers.current.get(segId));
      if (!timers.current.delete(segId)) return; // nothing pending
      const seg = latest.current.segments?.find((s) => s.id === segId);
      if (!seg) return;
      setSaving((n) => n + 1);
      try {
        await updateSegment(project.id, segId, { text: seg.text });
      } catch {
        toast.error("Couldn't save your edit", { description: "Check that the dev server is running." });
      } finally {
        setSaving((n) => n - 1);
      }
    },
    [project.id],
  );

  function editText(segId: string, text: string) {
    onChange((prev) => ({ ...prev, segments: prev.segments?.map((s) => (s.id === segId ? { ...s, text } : s)) }));
    clearTimeout(timers.current.get(segId));
    timers.current.set(
      segId,
      setTimeout(() => save(segId), SAVE_DELAY),
    );
  }

  // Flush pending saves when leaving the editor.
  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((_, id) => save(id));
  }, [save]);

  // ---- AI voice -------------------------------------------------------------
  // The main player plays the edited video with its AI voice, so "Play" just plays the paragraph's output range.
  const ranges = segmentRanges(plan);
  function play(seg: Segment) {
    const r = ranges.get(seg.id);
    if (r) playback.playRange(r.start, r.end);
    else toast("This paragraph is cut from the video", { description: "Restore it or turn off cleanup to hear it." });
  }

  async function regenerate(seg: Segment, quiet = false) {
    await save(seg.id);
    setGenerating((g) => new Set(g).add(seg.id));
    try {
      applyServer(await generateVoice(project.id, seg.id));
      if (!quiet) toast.success("Voice updated");
      return true;
    } catch (err) {
      toast.error("Couldn't generate voice", { description: err instanceof Error ? err.message : undefined });
      return false;
    } finally {
      setGenerating((g) => {
        const next = new Set(g);
        next.delete(seg.id);
        return next;
      });
    }
  }

  const changed = (segments ?? []).filter(
    (s) => ["none", "outdated"].includes(clipStatus(s, voice)) && !isSegmentRemoved(project, s),
  );
  const changedCredits = changed.reduce((n, s) => n + creditCost(s.text, voice.model), 0);

  async function regenerateAll() {
    const id = toast.loading(`Generating voice 1 of ${changed.length}…`);
    let done = 0;
    for (const seg of changed) {
      toast.loading(`Generating voice ${done + 1} of ${changed.length}…`, { id });
      if (!(await regenerate(seg, true))) {
        toast.dismiss(id);
        return;
      }
      done++;
    }
    toast.success(`Voice generated for ${pluralize(done, "paragraph")}`, { id });
  }

  // ---- paragraph actions ----------------------------------------------------
  // Deleting a paragraph cuts its video (restorable); a hand-added empty one merges into the previous paragraph.
  async function setDeleted(seg: Segment, deleted: boolean) {
    await save(seg.id);
    try {
      const updated = await updateSegment(project.id, seg.id, { deleted });
      applyServer(updated);
      if (!deleted) return;
      const merged = !updated.segments?.some((s) => s.id === seg.id);
      if (merged) toast("Paragraph removed", { description: "Its video was merged into the paragraph before it." });
      else toast("Paragraph deleted and its video cut", { action: { label: "Undo", onClick: () => setDeleted(seg, false) } });
    } catch {
      toast.error("Couldn't update the paragraph");
    }
  }

  async function revert(seg: Segment) {
    const text = seg.aiText;
    if (text === undefined) return;
    clearTimeout(timers.current.get(seg.id));
    timers.current.delete(seg.id);
    onChange((prev) => ({ ...prev, segments: prev.segments?.map((s) => (s.id === seg.id ? { ...s, text } : s)) }));
    try {
      await updateSegment(project.id, seg.id, { text });
    } catch {
      toast.error("Couldn't revert the paragraph");
    }
  }

  async function addParagraph() {
    try {
      const { project: updated, id } = await splitSegment(project.id, outputToSource(plan, playback.currentTime));
      applyServer(updated);
      setFocusId(id);
    } catch (err) {
      toast.error("Couldn't add a paragraph", { description: err instanceof Error ? err.message : undefined });
    }
  }

  async function polish() {
    setPolishing(true);
    try {
      const updated = await rewriteScript(project.id);
      onChange(updated);
      const retakes = updated.segments?.filter((s) => s.isRetake).length ?? 0;
      toast.success("Script polished", {
        description: retakes ? `${retakes} retake${retakes > 1 ? "s" : ""} found and muted.` : undefined,
      });
    } catch (err) {
      toast.error("Couldn't polish the script", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setPolishing(false);
    }
  }

  // ---- empty states ---------------------------------------------------------
  if (!segments) {
    if (project.status === "ready") return <ScriptSkeleton />; // being built from the transcript
    return (
      <Empty
        title="No script yet"
        hint="Transcribe your voiceover to start editing the script."
        action={
          <Link href={`/projects/${project.id}/processing`} className={buttonVariants({ className: "mt-5 gap-2 px-4" })}>
            <AudioLines /> Transcribe recording
          </Link>
        }
      />
    );
  }

  if (segments.length === 0) {
    return (
      <Empty
        title="No speech found"
        hint="We couldn't hear any narration in this recording. Check that your microphone was on when you recorded, then upload it again."
      />
    );
  }

  return (
    <div className="pb-10">
      {/* Header */}
      <div className="sticky top-0 z-10 flex h-12 items-center gap-2 border-b border-transparent bg-white/90 px-5 backdrop-blur">
        <span className="text-[13px] font-medium">Script</span>
        <span className="text-xs text-muted-foreground">
          {saving > 0 ? (
            <span className="flex items-center gap-1">
              <Loader2 className="size-3 animate-spin" /> Saving…
            </span>
          ) : (
            pluralize(segments.filter((s) => !isSegmentRemoved(project, s)).length, "paragraph")
          )}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger render={<Button variant="ghost" size="sm" className="gap-1" onClick={addParagraph} />}>
              <Plus /> Add
            </TooltipTrigger>
            <TooltipContent>Add a paragraph at the playhead ({formatTime(t)})</TooltipContent>
          </Tooltip>
          {aiMode && changed.length > 0 && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    onClick={regenerateAll}
                    disabled={generating.size > 0}
                    className="flex h-7 items-center gap-1.5 rounded-lg bg-brand px-2.5 text-[12.5px] font-medium text-white transition-colors duration-150 hover:bg-brand/90 disabled:opacity-60"
                  />
                }
              >
                {generating.size > 0 ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                Generate {changed.length} changed
              </TooltipTrigger>
              <TooltipContent>About {changedCredits.toLocaleString()} ElevenLabs credits</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      <div className="px-4 pt-2">
        <AnimatePresence initial={false}>
          {!project.rewrite && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <Banner icon={<Sparkles className="size-4 shrink-0 text-brand" />}>
                <p className="flex-1 text-[13px] leading-snug text-muted-foreground">
                  <span className="font-medium text-foreground">Polish your script.</span> Fix grammar, remove fillers and
                  retakes. Your original words are kept.
                </p>
                <button
                  onClick={polish}
                  disabled={polishing}
                  className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3 text-[13px] font-medium text-white transition-colors duration-150 hover:bg-brand/90 disabled:opacity-70"
                >
                  {polishing ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                  {polishing ? "Polishing…" : "Polish with AI"}
                </button>
              </Banner>
            </motion.div>
          )}
        </AnimatePresence>

        {!aiMode && (
          <Banner icon={<AudioLines className="size-4 shrink-0 text-muted-foreground" />} muted>
            <p className="text-[13px] text-muted-foreground">
              Using your original voice. Script edits won&apos;t change the narration. Switch in the Voice tab.
            </p>
          </Banner>
        )}

        {segments.map((seg) =>
          isSegmentRemoved(project, seg) ? (
            <DeletedRow key={seg.id} seg={seg} onRestore={() => setDeleted(seg, false)} />
          ) : (
            <Paragraph
              key={seg.id}
              seg={seg}
              outputStart={ranges.get(seg.id)?.start ?? null}
              active={(() => {
                const r = ranges.get(seg.id);
                return !!r && t >= r.start && t < r.end;
              })()}
              status={aiMode ? clipStatus(seg, voice) : "empty"}
              aiMode={aiMode}
              busy={generating.has(seg.id)}
              polishing={polishing}
              originalShown={showOriginal.has(seg.id)}
              autoFocus={focusId === seg.id}
              onText={(text) => editText(seg.id, text)}
              onBlur={() => save(seg.id)}
              onPlay={() => play(seg)}
              onRegenerate={() => regenerate(seg)}
              onToggleOriginal={() =>
                setShowOriginal((set) => {
                  const next = new Set(set);
                  if (!next.delete(seg.id)) next.add(seg.id);
                  return next;
                })
              }
              onRevert={() => revert(seg)}
              onDelete={() => setDeleted(seg, true)}
            />
          ),
        )}
      </div>
    </div>
  );
}

function Paragraph({
  seg,
  outputStart,
  active,
  status,
  aiMode,
  busy,
  polishing,
  originalShown,
  autoFocus,
  onText,
  onBlur,
  onPlay,
  onRegenerate,
  onToggleOriginal,
  onRevert,
  onDelete,
}: {
  seg: Segment;
  outputStart: number | null; // where it starts in the edited video; null = cut
  active: boolean;
  status: ClipStatus;
  aiMode: boolean;
  busy: boolean;
  polishing: boolean;
  originalShown: boolean;
  autoFocus: boolean;
  onText: (text: string) => void;
  onBlur: () => void;
  onPlay: () => void;
  onRegenerate: () => void;
  onToggleOriginal: () => void;
  onRevert: () => void;
  onDelete: () => void;
}) {
  const videoLen = seg.end - seg.start;
  const voiceLen = status === "current" ? seg.voice!.duration : estimateSeconds(seg.text);
  const ratio = voiceLen / videoLen;
  const warn = aiMode && seg.text.trim() && (ratio > 1.3 || ratio < 0.5);
  const canRevert = seg.aiText !== undefined && seg.text !== seg.aiText;

  return (
    <div
      className={cn(
        "group relative mt-1 flex gap-4 rounded-xl px-2 py-3 transition-colors duration-150",
        active ? "bg-[#FAFAFB]" : "hover:bg-[#FAFAFB]",
        "focus-within:bg-[#FAFAFB]",
      )}
    >
      {/* Gutter: timestamp (hover → Play) and voice status */}
      <div className="flex w-11 shrink-0 flex-col items-start gap-1.5 pt-[5px]">
        <button
          onClick={onPlay}
          aria-label={`Play paragraph at ${outputStart === null ? "cut" : formatTime(outputStart)}`}
          className={cn(
            "relative h-5 w-11 rounded-md text-left font-mono text-[11px] tabular-nums transition-colors",
            active ? "text-brand" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <span className="transition-opacity group-hover:opacity-0">
            {outputStart === null ? "cut" : formatTime(outputStart)}
          </span>
          <span className="absolute inset-0 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <Play className="size-3 fill-current" /> Play
          </span>
        </button>
        <StatusDot status={status} busy={busy} />
      </div>

      <div className="min-w-0 flex-1">
        <textarea
          value={seg.text}
          onChange={(e) => onText(e.target.value)}
          onBlur={onBlur}
          autoFocus={autoFocus}
          rows={1}
          placeholder="Enter script text..."
          className={cn(
            "block w-full resize-none bg-transparent text-[14.5px] leading-7 outline-none [field-sizing:content] placeholder:text-muted-foreground/60",
            polishing && "animate-pulse opacity-50",
          )}
        />

        {/* Meta: spoken length vs video length */}
        <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground tabular-nums">
          {seg.isRetake && (
            <span className="rounded border border-dashed px-1.5 font-medium">Retake</span>
          )}
          {aiMode && seg.text.trim() ? (
            <span className={cn("flex items-center gap-1", warn && "font-medium text-amber-600")}>
              {warn && <TriangleAlert className="size-3" />}
              Voice {status === "current" ? "" : "≈"}
              {voiceLen.toFixed(1)}s · Video {videoLen.toFixed(1)}s
              {warn && (ratio > 1 ? " · voice runs long" : " · video runs long")}
            </span>
          ) : (
            <span>{seg.text.trim() ? `Video ${videoLen.toFixed(1)}s` : "No narration"}</span>
          )}
        </div>

        <AnimatePresence initial={false}>
          {originalShown && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-2 rounded-lg border bg-white px-3 py-2">
                <p className="text-[11px] font-medium text-muted-foreground">What you said</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">
                  {seg.originalText || <em>Added by hand, no original recording.</em>}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Hover actions */}
      <div className="pointer-events-none absolute -top-3 right-2 z-10 flex items-center gap-0.5 rounded-lg border bg-white p-0.5 opacity-0 shadow-sm transition-opacity duration-150 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100">
        <Action label="Play" onClick={onPlay}>
          <Play className="fill-current" />
        </Action>
        {aiMode && (
          <Action
            label={status === "current" ? "Regenerate voice" : "Generate voice"}
            onClick={onRegenerate}
            disabled={busy || status === "empty"}
            accent
          >
            {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          </Action>
        )}
        <Action label={originalShown ? "Hide original" : "Show original"} onClick={onToggleOriginal}>
          {originalShown ? <EyeOff /> : <Eye />}
        </Action>
        <Action label="Revert to AI version" onClick={onRevert} disabled={!canRevert}>
          <Undo2 />
        </Action>
        <Action label="Delete paragraph" onClick={onDelete} danger>
          <Trash2 />
        </Action>
      </div>
    </div>
  );
}

function StatusDot({ status, busy }: { status: ClipStatus; busy: boolean }) {
  if (busy) return <Loader2 className="ml-0.5 size-3 animate-spin text-brand" />;
  if (status === "outdated" || status === "none") {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              className={cn(
                "ml-1 block size-2 rounded-full",
                status === "outdated" ? "bg-brand" : "border border-muted-foreground/40",
              )}
            />
          }
        />
        <TooltipContent side="right">
          {status === "outdated" ? "Text changed since the voice was generated" : "No voice generated yet"}
        </TooltipContent>
      </Tooltip>
    );
  }
  return null;
}

function Action({
  label,
  onClick,
  disabled,
  accent,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  accent?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            onClick={onClick}
            disabled={disabled}
            aria-label={label}
            className={cn(
              "flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted disabled:pointer-events-none disabled:opacity-35 [&_svg]:size-3.5",
              accent && "hover:text-brand",
              danger && "hover:text-destructive",
              !accent && !danger && "hover:text-foreground",
            )}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function DeletedRow({ seg, onRestore }: { seg: Segment; onRestore: () => void }) {
  return (
    <div className="mt-1 flex items-center gap-4 rounded-xl px-2 py-2 text-[12px] text-muted-foreground">
      <span className="w-11 shrink-0 font-mono text-[11px] tabular-nums line-through opacity-60">
        {formatTime(seg.start)}
      </span>
      <span className="italic">Paragraph deleted · its video is cut</span>
      <button onClick={onRestore} className="font-medium text-foreground underline-offset-4 hover:underline">
        Restore
      </button>
    </div>
  );
}

function Banner({ icon, muted, children }: { icon: React.ReactNode; muted?: boolean; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "mx-2 mb-3 flex items-center gap-3 rounded-xl border p-3 pl-4",
        muted ? "bg-[#FAFAFB]" : "border-brand/20 bg-brand/[0.04]",
      )}
    >
      {icon}
      {children}
    </div>
  );
}

function ScriptSkeleton() {
  return (
    <div className="space-y-6 px-6 py-7">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex gap-4">
          <Skeleton className="h-4 w-10" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

function Empty({ title, hint, action }: { title: string; hint: string; action?: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-10 py-16 text-center">
      <div className="mb-4 flex size-11 items-center justify-center rounded-xl border bg-[#FAFAFB]">
        <FileText className="size-5 text-muted-foreground" strokeWidth={1.75} />
      </div>
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1.5 max-w-64 text-sm leading-relaxed text-muted-foreground">{hint}</p>
      {action}
    </div>
  );
}
