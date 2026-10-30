"use client";

import { useRef, useState } from "react";
import { Check, Loader2, Music } from "lucide-react";
import { toast } from "sonner";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { composeMusic, updateProject } from "@/lib/client";
import { MUSIC_PRESETS } from "@/lib/music";
import { cn } from "@/lib/utils";
import type { Project } from "@/lib/types";
import type { ProjectUpdate } from "./editor";

// Background music, only when you choose it: pick a mood made for product demos and ElevenLabs Music
// composes an instrumental track as long as your video. It dips under the voice automatically.
export function MusicTab({ project, onChange }: { project: Project; onChange: ProjectUpdate }) {
  const music = project.music;
  const [composing, setComposing] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  async function pick(preset: string) {
    if (composing) return;
    setComposing(preset);
    try {
      onChange(await composeMusic(project.id, preset));
      toast.success("Music added", { description: "It plays under your voice and dips while it speaks." });
    } catch (err) {
      toast.error("Couldn't compose the music", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setComposing(null);
    }
  }

  // Changes show at once and save after a short pause (the slider fires a lot).
  function set(patch: { enabled?: boolean; volume?: number }) {
    onChange((p) => (p.music ? { ...p, music: { ...p.music, ...patch } } : p));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => updateProject(project.id, { music: patch }).catch(() => toast.error("Couldn't save music")), 300);
  }

  return (
    <div className="space-y-5 px-5 py-4">
      {music && (
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border p-4">
          <div className="flex-1">
            <p className="text-sm font-medium">Background music</p>
            <p className="mt-0.5 text-[13px] text-muted-foreground">Plays under your voice and dips while it speaks.</p>
          </div>
          <Switch checked={music.enabled} onCheckedChange={(enabled) => set({ enabled })} className="mt-0.5" />
        </label>
      )}

      <div>
        <p className="mb-1 text-[13px] font-medium">Pick a mood</p>
        <p className="mb-3 text-xs text-muted-foreground">
          Instrumental, made for product demos and as long as your video. Composed by ElevenLabs in about 20 seconds.
        </p>
        <div className="space-y-2">
          {MUSIC_PRESETS.map((m) => {
            const selected = music?.preset === m.id;
            const busy = composing === m.id;
            return (
              <button
                key={m.id}
                onClick={() => (selected ? set({ enabled: true }) : pick(m.id))}
                disabled={!!composing}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors hover:bg-[#FAFAFB] disabled:cursor-default",
                  selected && "border-brand/40 bg-brand/5 hover:bg-brand/5",
                )}
              >
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground",
                    selected && "bg-brand text-white",
                  )}
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : selected ? <Check className="size-4" /> : <Music className="size-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium">{m.name}</span>
                  <span className="block text-xs text-muted-foreground">{busy ? "Composing… about 20 seconds" : m.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {music && (
        <div className={cn("transition-opacity", !music.enabled && "pointer-events-none opacity-40")}>
          <p className="mb-2 text-[13px] font-medium">Volume</p>
          <div className="flex items-center gap-3">
            <Slider
              value={[Math.round(music.volume * 100)]}
              max={100}
              step={1}
              onValueChange={(v) => set({ volume: (Array.isArray(v) ? v[0] : v) / 100 })}
              aria-label="Music volume"
            />
            <span className="w-10 text-right text-xs text-muted-foreground tabular-nums">{Math.round(music.volume * 100)}%</span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">While the voice speaks, the music plays at about a third of this.</p>
        </div>
      )}
    </div>
  );
}
