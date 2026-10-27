"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Bug, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LogoMark } from "@/components/logo";
import { ExportButton } from "./export-button";
import { updateProject } from "@/lib/client";
import { cn } from "@/lib/utils";
import type { Project } from "@/lib/types";

interface Props {
  project: Project;
  onChange: (p: Project) => void;
  debugOpen: boolean;
  onToggleDebug: () => void;
  duration: number; // edited video length
}

export function TopBar({ project, onChange, debugOpen, onToggleDebug, duration }: Props) {
  const [title, setTitle] = useState(project.title);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");

  async function save() {
    const next = title.trim();
    if (!next) return setTitle(project.title);
    if (next === project.title) return;
    setSaveState("saving");
    try {
      onChange(await updateProject(project.id, { title: next }));
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 1500);
    } catch {
      setSaveState("idle");
      setTitle(project.title);
      toast.error("Couldn't rename the project");
    }
  }

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-white px-3">
      <Tooltip>
        <TooltipTrigger render={<Link href="/" aria-label="All projects" className={buttonVariants({ variant: "ghost", size: "icon" })} />}>
          <ArrowLeft />
        </TooltipTrigger>
        <TooltipContent side="bottom">All projects</TooltipContent>
      </Tooltip>
      <div className="mx-1 h-5 w-px bg-border" />
      <LogoMark className="size-6" />
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setTitle(project.title);
            requestAnimationFrame(() => e.currentTarget?.blur());
          }
        }}
        aria-label="Project title"
        className="h-8 max-w-[420px] min-w-24 rounded-md border border-transparent bg-transparent px-2 text-sm font-medium transition-colors outline-none [field-sizing:content] hover:border-border focus:border-ring focus:ring-3 focus:ring-ring/30"
      />
      <span className="flex w-16 items-center gap-1 text-xs text-muted-foreground">
        {saveState === "saving" && <Loader2 className="size-3 animate-spin" />}
        {saveState === "saved" && (
          <>
            <Check className="size-3" /> Saved
          </>
        )}
      </span>

      <div className="ml-auto flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                onClick={onToggleDebug}
                aria-label="Debug"
                aria-pressed={debugOpen}
                className={cn("text-muted-foreground", debugOpen && "bg-muted text-foreground")}
              />
            }
          >
            <Bug />
          </TooltipTrigger>
          <TooltipContent side="bottom">Debug</TooltipContent>
        </Tooltip>
        <ExportButton project={project} duration={duration} />
      </div>
    </header>
  );
}
