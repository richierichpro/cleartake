"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, Pause, Play } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { fetchVoices, updateProject } from "@/lib/client";
import { cn } from "@/lib/utils";
import { voiceOf } from "@/lib/voice-settings";
import type { VoiceOption } from "@/lib/elevenlabs";
import type { Project } from "@/lib/types";
import type { ProjectUpdate } from "./editor";

const describe = (v: VoiceOption) => [v.gender, v.accent, v.style].filter(Boolean).join(", ");

export function VoiceTab({ project, onChange }: { project: Project; onChange: ProjectUpdate }) {
  const settings = voiceOf(project);
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchVoices>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    fetchVoices()
      .then(setData)
      .catch((e) => setError(e.message));
    return () => audio.current?.pause();
  }, []);

  async function save(patch: Parameters<typeof updateProject>[1]["voice"]) {
    const before = project;
    onChange((p) => ({ ...p, voice: { ...voiceOf(p), ...patch } })); // optimistic
    try {
      onChange(await updateProject(project.id, { voice: patch }));
    } catch {
      onChange(before);
      toast.error("Couldn't save voice settings");
    }
  }

  function preview(v: VoiceOption) {
    audio.current?.pause();
    if (previewing === v.id || !v.previewUrl) return setPreviewing(null);
    audio.current = new Audio(v.previewUrl);
    audio.current.onended = () => setPreviewing(null);
    audio.current.play().catch(() => setPreviewing(null));
    setPreviewing(v.id);
  }

  const selected = data?.voices.find((v) => v.id === settings.voiceId);
  const aiOff = settings.mode === "original";

  return (
    <div className="space-y-6 px-5 py-5">
      {/* Original voice toggle */}
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors hover:bg-[#FAFAFB]">
        <div className="flex-1">
          <p className="text-sm font-medium">Use original voice</p>
          <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">
            Keep your recorded narration and ignore the AI voice.
          </p>
        </div>
        <Switch checked={aiOff} onCheckedChange={(on) => save({ mode: on ? "original" : "ai" })} className="mt-0.5" />
      </label>

      {/* Voice picker */}
      <div className={cn("transition-opacity", aiOff && "pointer-events-none opacity-45")}>
        <p className="mb-2 text-[13px] font-medium">AI voice</p>
        {error ? (
          <p className="rounded-xl border border-dashed p-4 text-[13px] text-muted-foreground">{error}</p>
        ) : !data ? (
          <Skeleton className="h-14 w-full rounded-xl" />
        ) : (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger
              render={
                <button className="flex h-14 w-full items-center gap-3 rounded-xl border bg-white px-3.5 text-left transition-colors hover:border-[#D4D4DA] data-[popup-open]:border-ring" />
              }
            >
              <VoiceAvatar name={settings.voiceName} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{settings.voiceName}</p>
                <p className="truncate text-xs text-muted-foreground capitalize">{selected ? describe(selected) : ""}</p>
              </div>
              <ChevronDown className="size-4 text-muted-foreground" />
            </PopoverTrigger>
            <PopoverContent align="start" className="scroll-thin max-h-80 w-(--anchor-width) overflow-y-auto p-1">
              {data.voices.map((v) => (
                <div
                  key={v.id}
                  role="option"
                  aria-selected={v.id === settings.voiceId}
                  onClick={() => {
                    save({ voiceId: v.id, voiceName: v.name });
                    setOpen(false);
                  }}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted"
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      preview(v);
                    }}
                    aria-label={`Preview ${v.name}`}
                    disabled={!v.previewUrl}
                    className="flex size-8 shrink-0 items-center justify-center rounded-full border bg-white transition-colors hover:border-brand hover:text-brand disabled:opacity-40"
                  >
                    {previewing === v.id ? <Pause className="size-3.5 fill-current" /> : <Play className="ml-px size-3.5 fill-current" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium">
                      {v.name} <span className="font-normal text-muted-foreground capitalize">({describe(v)})</span>
                    </p>
                    {v.tagline && <p className="truncate text-xs text-muted-foreground">{v.tagline}</p>}
                  </div>
                  {v.id === settings.voiceId && <Check className="size-4 shrink-0 text-brand" />}
                </div>
              ))}
            </PopoverContent>
          </Popover>
        )}
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Changing the voice marks every paragraph as changed. Generate them again from the Script tab.
        </p>
      </div>

      {/* Model + credits */}
      <div className="rounded-xl bg-[#FAFAFB] p-4 text-[13px]">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Model</span>
          <span className="font-mono text-xs">{settings.model}</span>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-muted-foreground">ElevenLabs credits</span>
          {!data ? (
            <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
          ) : data.credits ? (
            <span className="tabular-nums">
              {data.credits.used.toLocaleString()} / {data.credits.limit.toLocaleString()} used
            </span>
          ) : (
            <span className="text-muted-foreground">Unavailable</span>
          )}
        </div>
        {data?.credits && (
          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-border">
            <div
              className="h-full rounded-full bg-foreground"
              style={{ width: `${Math.min(100, (data.credits.used / data.credits.limit) * 100)}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function VoiceAvatar({ name }: { name: string }) {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#FFB199] to-brand text-[13px] font-semibold text-white">
      {name.slice(0, 1)}
    </span>
  );
}
