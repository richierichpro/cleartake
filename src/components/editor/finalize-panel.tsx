"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Check, ChevronRight, Flag, Loader2, MessageSquareQuote, RotateCw, Sparkles, TriangleAlert, Type, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DIRECTOR_CONFIG, placeDirector, scriptKey, type Placement } from "@/lib/director";
import { formatRelative, formatTime } from "@/lib/format";
import type { SyncPlan } from "@/lib/sync";
import { cn } from "@/lib/utils";
import type { DirectorPlan, Project, TranscriptWord } from "@/lib/types";
import { outdatedVoices, type Finalize } from "./use-finalize";
import type { Playback } from "./use-playback";

// Step 15: review the AI director's plan. Every item is editable or removable; clicking a time seeks there.
export function FinalizePanel({
  project,
  plan,
  words,
  playback,
  finalize,
  placed,
  onClose,
}: {
  project: Project;
  plan: SyncPlan;
  words: TranscriptWord[]; // transcript, for timing in original-voice mode
  playback: Playback;
  finalize: Finalize;
  placed: Record<string, Placement>; // final times after scheduling (Step 15b), with why items moved
  onClose: () => void;
}) {
  const d = project.director;
  // Phrase times, then the scheduled times of badges and callouts (they may move to avoid another animation).
  const places = useMemo(() => ({ ...(d ? placeDirector(project, plan, words, d) : {}), ...placed }), [project, plan, words, d, placed]);
  const stale = d && (d.scriptKey !== scriptKey(project) || outdatedVoices(project).length > 0);

  return (
    <motion.aside
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 440, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ type: "spring", stiffness: 420, damping: 42 }}
      className="flex shrink-0 flex-col overflow-hidden border-l bg-white"
    >
      <div className="flex h-full w-[440px] flex-col">
        <div className="flex h-11 shrink-0 items-center gap-2 border-b px-4">
          <Sparkles className="size-4 text-brand" />
          <span className="text-sm font-medium">Finalize</span>
          <Button variant="ghost" size="icon-sm" className="ml-auto" onClick={onClose} aria-label="Close finalize">
            <X />
          </Button>
        </div>

        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
          <Progress project={project} finalize={finalize} stale={!!stale} />
          {d && !finalize.running && <Plan d={d} places={places} playback={playback} finalize={finalize} />}
        </div>
      </div>
    </motion.aside>
  );
}

function Progress({ project, finalize, stale }: { project: Project; finalize: Finalize; stale: boolean }) {
  const { state } = finalize;
  if (state.phase === "voice" || state.phase === "director") {
    return (
      <div className="m-4 space-y-2.5 rounded-xl border p-4">
        <ProgressRow
          label="Voice clips"
          status={state.phase === "voice" ? "busy" : "done"}
          detail={state.phase === "voice" ? `Generating ${state.done + 1} of ${state.total}…` : "Up to date"}
        />
        <ProgressRow
          label="Director plan"
          status={state.phase === "director" ? "busy" : "waiting"}
          detail={state.phase === "director" ? "Reading your script and timeline…" : undefined}
        />
      </div>
    );
  }
  if (state.phase === "error") {
    return (
      <div className="m-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
        <p className="flex items-center gap-2 text-[13px] font-medium">
          <TriangleAlert className="size-4 text-destructive" />
          {state.step === "voice" ? "Couldn't generate a voice clip" : "Couldn't make the plan"}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{state.message}</p>
        <Button size="sm" variant="outline" className="mt-3 gap-1.5" onClick={finalize.run}>
          <RotateCw /> Try again
        </Button>
      </div>
    );
  }
  if (!project.director) {
    return (
      <div className="m-4 flex flex-col items-center rounded-xl border border-dashed px-6 py-10 text-center">
        <Sparkles className="mb-2 size-5 text-brand" />
        <p className="text-sm font-medium">Let the AI plan the finishing touches</p>
        <p className="mt-1 max-w-72 text-[13px] leading-relaxed text-muted-foreground">
          Updates any outdated voice, then suggests a title, step labels, callouts and an outro for you to review.
        </p>
        <Button size="sm" className="mt-4 gap-1.5" onClick={finalize.run}>
          <Sparkles /> Finalize
        </Button>
      </div>
    );
  }
  if (stale) {
    return (
      <div className="m-4 flex items-center gap-3 rounded-xl bg-[#FFF4EF] px-3.5 py-3">
        <p className="flex-1 text-xs leading-relaxed text-[#8A3A1E]">
          Your script or voice changed since this plan was made.
        </p>
        <Button size="sm" variant="outline" className="shrink-0 gap-1.5 bg-white" onClick={finalize.run}>
          <RotateCw /> Re-run
        </Button>
      </div>
    );
  }
  return null;
}

function ProgressRow({ label, status, detail }: { label: string; status: "busy" | "done" | "waiting"; detail?: string }) {
  return (
    <div className="flex items-center gap-2.5 text-[13px]">
      <span className="flex size-5 items-center justify-center">
        {status === "busy" && <Loader2 className="size-4 animate-spin text-brand" />}
        {status === "done" && <Check className="size-4 text-emerald-600" />}
        {status === "waiting" && <span className="size-1.5 rounded-full bg-border" />}
      </span>
      <span className={cn("font-medium", status === "waiting" && "text-muted-foreground")}>{label}</span>
      {detail && <span className="ml-auto text-xs text-muted-foreground">{detail}</span>}
    </div>
  );
}

function Plan({
  d,
  places,
  playback,
  finalize,
}: {
  d: DirectorPlan;
  places: Record<string, Placement>;
  playback: Playback;
  finalize: Finalize;
}) {
  const { edit } = finalize;
  // Removes the item that hides another one (too close in time), with Undo.
  function showInstead(otherId: string, kind: "steps" | "callouts") {
    const before = d;
    const other = kind === "steps" ? d.steps.find((y) => y.id === otherId)?.label : d.callouts.find((y) => y.id === otherId)?.text;
    edit((x) => ({ ...x, [kind]: x[kind].filter((y) => y.id !== otherId) }));
    toast(`Removed “${other ?? "item"}”`, { action: { label: "Undo", onClick: () => edit(() => before) } });
  }
  const m = DIRECTOR_CONFIG.max;
  const byTime = <T extends { id: string }>(items: T[]) =>
    [...items].sort((a, b) => (places[a.id]?.time ?? Infinity) - (places[b.id]?.time ?? Infinity));

  return (
    <div className="space-y-6 px-4 pt-1 pb-6">
      <Section icon={<Type />} title="Intro card" hint="Shown for about 2s before the video">
        <Field label="Title" value={d.title} max={m.title} onChange={(title) => edit((x) => ({ ...x, title }))} />
        <Field label="Subtitle" value={d.subtitle} max={m.subtitle} onChange={(subtitle) => edit((x) => ({ ...x, subtitle }))} />
      </Section>

      <Section icon={<Flag />} title="Step labels" hint="A badge where a new task begins" count={d.steps.length}>
        {byTime(d.steps).map((s) => (
          <ItemRow
            key={s.id}
            place={places[s.id]}
            playback={playback}
            value={s.label}
            max={m.label}
            detail={s.phrase ? `when you say “${s.phrase}”` : undefined}
            onChange={(label) => edit((x) => ({ ...x, steps: x.steps.map((y) => (y.id === s.id ? { ...y, label } : y)) }))}
            onRemove={() => edit((x) => ({ ...x, steps: x.steps.filter((y) => y.id !== s.id) }))}
            onShowInstead={(other) => showInstead(other, "steps")}
            otherLabel={(other) => d.steps.find((y) => y.id === other)?.label}
          />
        ))}
      </Section>

      <Section
        icon={<MessageSquareQuote />}
        title="Callouts"
        hint={`A short note at the bottom, at most one per ${DIRECTOR_CONFIG.calloutEvery}s`}
        count={d.callouts.length}
      >
        {byTime(d.callouts).map((c) => (
          <ItemRow
            key={c.id}
            place={places[c.id]}
            playback={playback}
            value={c.text}
            max={m.callout}
            detail={c.phrase ? `when you say “${c.phrase}”` : undefined}
            onChange={(text) => edit((x) => ({ ...x, callouts: x.callouts.map((y) => (y.id === c.id ? { ...y, text } : y)) }))}
            onRemove={() => edit((x) => ({ ...x, callouts: x.callouts.filter((y) => y.id !== c.id) }))}
            onShowInstead={(other) => showInstead(other, "callouts")}
            otherLabel={(other) => d.callouts.find((y) => y.id === other)?.text}
          />
        ))}
      </Section>

      <Section icon={<Sparkles />} title="Emphasized words" hint="Highlighted in the captions" count={d.emphasis.length}>
        {d.emphasis.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {byTime(d.emphasis).map((e) => {
              const place = places[e.id];
              return (
                <span
                  key={e.id}
                  className={cn(
                    "group flex h-7 items-center gap-1 rounded-full border pr-1 pl-2.5 text-xs",
                    place?.time === null && "border-dashed text-muted-foreground",
                  )}
                  title={place?.note}
                >
                  <button
                    onClick={() => place?.time != null && playback.seek(place.time)}
                    className="flex items-center gap-1.5 hover:text-brand"
                  >
                    <span className="font-medium">{e.word}</span>
                    {place?.time != null && <span className="font-mono text-[10px] text-muted-foreground">{formatTime(place.time)}</span>}
                  </button>
                  <button
                    onClick={() => edit((x) => ({ ...x, emphasis: x.emphasis.filter((y) => y.id !== e.id) }))}
                    aria-label={`Remove ${e.word}`}
                    className="flex size-5 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              );
            })}
          </div>
        )}
      </Section>

      <Section icon={<Flag />} title="Outro card" hint="Shown for about 2s at the end">
        <Field label="Closing line" value={d.outro} max={m.outro} onChange={(outro) => edit((x) => ({ ...x, outro }))} />
      </Section>

      <div className="border-t pt-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span>
            Planned by {d.model} · {formatRelative(d.at)}
          </span>
          <Button size="sm" variant="ghost" className="ml-auto gap-1.5" onClick={finalize.run}>
            <RotateCw /> Re-run
          </Button>
        </div>
        {d.dropped.length > 0 && (
          <details className="group mt-2">
            <summary className="flex cursor-pointer list-none items-center gap-1 hover:text-foreground">
              <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" />
              {d.dropped.length} AI suggestion{d.dropped.length > 1 ? "s" : ""} left out
            </summary>
            <ul className="mt-1.5 space-y-1 pl-5">
              {d.dropped.map((x, i) => (
                <li key={i}>
                  <span className="text-foreground">{x.text}</span> ({x.kind}): {x.reason}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  );
}

function Section({
  icon,
  title,
  hint,
  count,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2.5 flex items-baseline gap-2">
        <span className="self-center text-muted-foreground [&_svg]:size-3.5">{icon}</span>
        <h3 className="text-[13px] font-medium">{title}</h3>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </div>
      <div className="space-y-2">
        {children}
        {count === 0 && <p className="rounded-lg border border-dashed px-3 py-2.5 text-xs text-muted-foreground">None suggested.</p>}
      </div>
    </section>
  );
}

function Field({ label, value, max, onChange }: { label: string; value: string; max: number; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      <Input value={value} maxLength={max} onChange={(e) => onChange(e.target.value)} placeholder="Leave empty to skip" />
    </label>
  );
}

function ItemRow({
  place,
  playback,
  value,
  max,
  detail,
  onChange,
  onRemove,
  onShowInstead,
  otherLabel,
}: {
  place?: Placement;
  playback: Playback;
  value: string;
  max: number;
  detail?: string;
  onChange: (v: string) => void;
  onRemove: () => void;
  onShowInstead: (otherId: string) => void; // removes the item this one is hidden by
  otherLabel: (otherId: string) => string | undefined;
}) {
  const off = !place || place.time === null || place.hidden;
  const blocker = place?.hiddenBy;
  return (
    <div className="group rounded-lg">
      <div className={cn("flex items-center gap-2", off && "opacity-60")}>
        <button
          onClick={() => place?.time != null && playback.seek(place.time)}
          disabled={place?.time == null}
          className="w-12 shrink-0 rounded-md py-1 text-left font-mono text-xs text-brand tabular-nums hover:underline disabled:text-muted-foreground disabled:no-underline"
        >
          {place?.time != null ? formatTime(place.time) : "--:--"}
        </button>
        <div className="relative min-w-0 flex-1">
          <Input value={value} maxLength={max} onChange={(e) => onChange(e.target.value)} className={cn("h-8", place?.hidden && "pr-16")} />
          {place?.hidden && (
            <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
              Hidden
            </span>
          )}
        </div>
        <button
          onClick={onRemove}
          aria-label="Remove"
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
        >
          <X className="size-4" />
        </button>
      </div>
      {(detail || place?.note) && (
        <p className="mt-0.5 ml-14 text-[11px] text-muted-foreground">
          {detail}
          {detail && place?.note && " · "}
          {place?.note && <span className={cn(place.hidden && "text-[#B5471F]")}>{place.note}</span>}
        </p>
      )}
      {blocker && (
        <button
          onClick={() => onShowInstead(blocker)}
          className="mt-1 ml-14 rounded-md text-[11px] font-medium text-brand underline-offset-4 hover:underline"
        >
          Show this one instead{otherLabel(blocker) ? ` (removes “${otherLabel(blocker)}”)` : ""}
        </button>
      )}
    </div>
  );
}
