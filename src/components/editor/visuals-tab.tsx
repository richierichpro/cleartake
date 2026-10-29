"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Check, Clapperboard, ImagePlus, Loader2, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { mediaUrl, removeBackground, updateProject, uploadBackground } from "@/lib/client";
import { cn } from "@/lib/utils";
import { BACKGROUND_PRESETS, PADDING_MAX, RADIUS_MAX, visualsOf } from "@/lib/visuals";
import { DIRECTOR_CONFIG } from "@/lib/director";
import { OVERLAY_CONFIG, scenesOf } from "@/lib/overlays";
import type { Project, Visuals } from "@/lib/types";
import type { ProjectUpdate } from "./editor";
import type { Finalize } from "./use-finalize";

type VisualsPatch = {
  background?: { enabled?: boolean; preset?: string };
  shadow?: Visuals["shadow"];
  radius?: number;
  padding?: number;
};

const SHADOW_OPTIONS = [
  { value: "none", label: "None" },
  { value: "light", label: "Light" },
  { value: "medium", label: "Medium" },
  { value: "strong", label: "Strong" },
];

export function VisualsTab({
  project,
  onChange,
  finalize,
  onFinalize,
}: {
  project: Project;
  onChange: ProjectUpdate;
  finalize: Finalize;
  onFinalize: () => void;
}) {
  const [tab, setTab] = useState<"background" | "scenes">("background");
  return (
    <div className="px-5 py-4">
      <div className="mb-5 grid grid-cols-2 rounded-lg bg-muted p-0.5">
        {(["background", "scenes"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "relative h-7 rounded-md text-[13px] font-medium capitalize transition-colors duration-150",
              tab === t ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab === t && (
              <motion.span
                layoutId="visuals-subtab"
                className="absolute inset-0 rounded-md bg-white shadow-sm"
                transition={{ type: "spring", stiffness: 500, damping: 40 }}
              />
            )}
            <span className="relative">{t}</span>
          </button>
        ))}
      </div>
      {tab === "background" ? (
        <BackgroundSettings project={project} onChange={onChange} />
      ) : (
        <ScenesSettings project={project} onChange={onChange} finalize={finalize} onFinalize={onFinalize} />
      )}
    </div>
  );
}

// Step 15b: intro and outro title cards. Their text comes from the Finalize plan (and is edited in both places).
function ScenesSettings({
  project,
  onChange,
  finalize,
  onFinalize,
}: {
  project: Project;
  onChange: ProjectUpdate;
  finalize: Finalize;
  onFinalize: () => void;
}) {
  const d = project.director;
  const scenes = scenesOf(project);
  const m = DIRECTOR_CONFIG.max;

  if (!d) {
    return (
      <div className="flex flex-col items-center rounded-xl border border-dashed px-6 py-12 text-center">
        <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-muted">
          <Clapperboard className="size-5 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium">Intro and outro scenes</p>
        <p className="mt-1 max-w-64 text-[13px] leading-relaxed text-muted-foreground">
          Title cards at the start and end of your video. Click Finalize and the AI writes them from your script.
        </p>
        <Button size="sm" className="mt-4 gap-1.5" onClick={onFinalize} disabled={finalize.running}>
          {finalize.running ? <Loader2 className="animate-spin" /> : <Sparkles />} Finalize
        </Button>
      </div>
    );
  }

  function toggle(key: "intro" | "outro" | "flyIn", on: boolean) {
    onChange((p) => ({ ...p, scenes: { ...scenesOf(p), [key]: on } }));
    updateProject(project.id, { scenes: { [key]: on } }).catch(() => toast.error("Couldn't save scenes"));
  }

  return (
    <div className="space-y-4">
      <SceneBox
        title="Intro card"
        hint={`${OVERLAY_CONFIG.intro}s title card before the video${scenes.flyIn ? `, then a ${OVERLAY_CONFIG.flyIn}s fly-in` : ""}`}
        on={scenes.intro}
        onToggle={(on) => toggle("intro", on)}
      >
        <SceneField label="Title" value={d.title} max={m.title} onChange={(title) => finalize.edit((x) => ({ ...x, title }))} />
        <SceneField label="Subtitle" value={d.subtitle} max={m.subtitle} onChange={(subtitle) => finalize.edit((x) => ({ ...x, subtitle }))} />
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg bg-[#FAFAFB] px-3 py-2.5">
          <span>
            <span className="block text-[13px] font-medium">3D fly-in</span>
            <span className="block text-xs text-muted-foreground">Your video swoops in, tilted, as the title card leaves</span>
          </span>
          <Switch size="sm" checked={scenes.flyIn} onCheckedChange={(on) => toggle("flyIn", on)} />
        </label>
      </SceneBox>
      <SceneBox
        title="Outro card"
        hint={`${OVERLAY_CONFIG.outro}s closing card after the video`}
        on={scenes.outro}
        onToggle={(on) => toggle("outro", on)}
      >
        <SceneField label="Closing line" value={d.outro} max={m.outro} onChange={(outro) => finalize.edit((x) => ({ ...x, outro }))} />
      </SceneBox>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Press play at 00:00 to watch the intro. An empty title or closing line skips its card.
      </p>
    </div>
  );
}

function SceneBox({
  title,
  hint,
  on,
  onToggle,
  children,
}: {
  title: string;
  hint: string;
  on: boolean;
  onToggle: (on: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border p-4">
      <label className="flex cursor-pointer items-start gap-3">
        <div className="flex-1">
          <p className="text-sm font-medium">{title}</p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">{hint}</p>
        </div>
        <Switch checked={on} onCheckedChange={onToggle} className="mt-0.5" />
      </label>
      <div className={cn("mt-3 space-y-3 transition-opacity duration-200", !on && "pointer-events-none opacity-40")}>{children}</div>
    </div>
  );
}

function SceneField({ label, value, max, onChange }: { label: string; value: string; max: number; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      <Input value={value} maxLength={max} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function BackgroundSettings({ project, onChange }: { project: Project; onChange: ProjectUpdate }) {
  const v = visualsOf(project);
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pending = useRef<VisualsPatch>({});

  // The preview updates instantly; the server gets the settings after a short pause (sliders fire a lot).
  function change(patch: VisualsPatch, { now = false } = {}) {
    onChange((p) => {
      const cur = visualsOf(p);
      return {
        ...p,
        visuals: {
          ...cur,
          ...patch,
          background: {
            ...cur.background,
            ...patch.background,
            ...(patch.background?.preset ? { image: null } : {}),
          },
        } as Visuals,
      };
    });
    pending.current = {
      ...pending.current,
      ...patch,
      background: { ...pending.current.background, ...patch.background },
    };
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, now ? 0 : 300);
  }

  function flush() {
    const patch = pending.current;
    pending.current = {};
    updateProject(project.id, { visuals: patch }).catch(() => toast.error("Couldn't save background settings"));
  }

  useEffect(() => () => clearTimeout(timer.current), []);

  async function upload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      onChange(await uploadBackground(project.id, file));
    } catch (err) {
      toast.error("Couldn't upload the image", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setUploading(false);
    }
  }

  async function removeImage() {
    try {
      onChange(await removeBackground(project.id));
    } catch {
      toast.error("Couldn't remove the image");
    }
  }

  const on = v.background.enabled;

  return (
    <div className="space-y-6">
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors hover:bg-[#FAFAFB]">
        <div className="flex-1">
          <p className="text-sm font-medium">Background</p>
          <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">
            Frame your recording on a 16:9 background. Off exports the recording edge to edge.
          </p>
        </div>
        <Switch checked={on} onCheckedChange={(enabled) => change({ background: { enabled } }, { now: true })} className="mt-0.5" />
      </label>

      <div className={cn("space-y-6 transition-opacity duration-200", !on && "pointer-events-none opacity-40")}>
        <div>
          <p className="mb-2.5 text-[13px] font-medium">Style</p>
          <div className="grid grid-cols-4 gap-2.5">
            {BACKGROUND_PRESETS.map((b) => {
              const selected = !v.background.image && v.background.preset === b.id;
              return (
                <button
                  key={b.id}
                  onClick={() => change({ background: { preset: b.id } }, { now: true })}
                  aria-label={b.name}
                  aria-pressed={selected}
                  className="group text-left"
                >
                  <Swatch background={b.css} selected={selected} />
                  <span className="mt-1 block text-[11px] text-muted-foreground group-hover:text-foreground">{b.name}</span>
                </button>
              );
            })}
          </div>

          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              upload(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          {v.background.image ? (
            <div className="mt-3 flex items-center gap-3 rounded-xl border p-2">
              <div className="w-20 shrink-0">
                <Swatch background={`center / cover url("${mediaUrl(project.id, v.background.image)}")`} selected />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium">Your image</p>
                <button
                  onClick={() => fileInput.current?.click()}
                  className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  Replace
                </button>
              </div>
              <button
                onClick={removeImage}
                aria-label="Remove image"
                className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => fileInput.current?.click()}
              disabled={uploading}
              className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed text-[13px] text-muted-foreground transition-colors hover:border-[#B4B4BC] hover:bg-[#FAFAFB] hover:text-foreground"
            >
              {uploading ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
              {uploading ? "Uploading…" : "Upload your own image"}
              <span className="text-xs text-muted-foreground/70">JPG, PNG, WebP</span>
            </button>
          )}
        </div>

        <div className="flex items-center justify-between">
          <p className="text-[13px] font-medium">Shadow</p>
          <Select
            items={SHADOW_OPTIONS}
            value={v.shadow}
            onValueChange={(shadow) => shadow && change({ shadow: shadow as Visuals["shadow"] }, { now: true })}
          >
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SHADOW_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <SliderRow label="Rounded corners" unit="px" value={v.radius} max={RADIUS_MAX} onChange={(radius) => change({ radius })} />
        <SliderRow label="Padding" unit="%" value={v.padding} max={PADDING_MAX} onChange={(padding) => change({ padding })} />
      </div>
    </div>
  );
}

function Swatch({ background, selected }: { background: string; selected: boolean }) {
  return (
    <div
      className={cn(
        "relative flex aspect-video items-center justify-center overflow-hidden rounded-lg ring-1 transition-all duration-150",
        selected ? "ring-2 ring-brand ring-offset-2" : "ring-black/10 group-hover:ring-black/25",
      )}
      style={{ background }}
    >
      {/* A tiny window, so you can see how the recording will sit on it */}
      <div className="h-[56%] w-[64%] rounded-[3px] bg-white/95 shadow-[0_2px_6px_rgba(0,0,0,0.18)]" />
      {selected && (
        <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-brand text-white">
          <Check className="size-2.5" strokeWidth={3} />
        </span>
      )}
    </div>
  );
}

function SliderRow({
  label,
  unit,
  value,
  max,
  onChange,
}: {
  label: string;
  unit: string;
  value: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const clamp = (n: number) => Math.max(0, Math.min(max, Math.round(n)));
  return (
    <div>
      <p className="mb-2 text-[13px] font-medium">{label}</p>
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <Slider
            value={[value]}
            max={max}
            step={1}
            onValueChange={(v) => onChange(clamp(Array.isArray(v) ? v[0] : v))}
            aria-label={label}
          />
        </div>
        <div className="flex h-8 w-[72px] items-center rounded-lg border px-2 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30">
          <input
            type="number"
            min={0}
            max={max}
            value={value}
            onChange={(e) => e.target.value !== "" && onChange(clamp(Number(e.target.value)))}
            aria-label={`${label} (${unit})`}
            className="w-full min-w-0 bg-transparent text-right text-[13px] tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
          />
          <span className="ml-1 text-xs text-muted-foreground">{unit}</span>
        </div>
      </div>
    </div>
  );
}
