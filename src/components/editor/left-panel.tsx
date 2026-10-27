"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, FileText, ImageIcon, Mic, Music, ZoomIn, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  {
    id: "script",
    label: "Script",
    icon: FileText,
    title: "Your script will appear here",
    hint: "Once your recording is transcribed, you can edit the narration like a document.",
  },
  {
    id: "voice",
    label: "Voice",
    icon: Mic,
    title: "Choose a voice",
    hint: "Pick an AI voice or keep your original narration. Available once the script is ready.",
  },
  {
    id: "music",
    label: "Music",
    icon: Music,
    title: "Background music",
    hint: "Add a soft music bed that automatically ducks under your voice.",
  },
  {
    id: "visuals",
    label: "Visuals",
    icon: ImageIcon,
    title: "Background and scenes",
    hint: "Frame your recording on a background and add intro and outro scenes.",
  },
  {
    id: "zooms",
    label: "Zooms",
    icon: ZoomIn,
    title: "Zoom effects",
    hint: "Zoom into the parts of the screen that matter. Auto-detect them or add your own.",
  },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function LeftPanel() {
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<TabId>("script");
  const active = TABS.find((t) => t.id === tab)!;

  return (
    <div className="relative z-10 flex shrink-0">
      <motion.aside
        initial={false}
        animate={{ width: open ? "clamp(320px, 35vw, 560px)" : 0 }}
        transition={{ type: "spring", stiffness: 380, damping: 38 }}
        className="flex h-full flex-col overflow-hidden border-r bg-white"
      >
        <div className="flex h-full min-w-[320px] flex-col">
          <nav className="flex shrink-0 gap-1 border-b px-3">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "relative flex h-11 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium transition-colors duration-150",
                  tab === t.id ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <t.icon className="size-3.5" />
                {t.label}
                {tab === t.id && (
                  <motion.span
                    layoutId="tab-underline"
                    className="absolute inset-x-1.5 -bottom-px h-0.5 rounded-full bg-brand"
                    transition={{ type: "spring", stiffness: 500, damping: 40 }}
                  />
                )}
              </button>
            ))}
          </nav>

          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
            <AnimatePresence mode="wait">
              <motion.div
                key={tab}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="h-full"
              >
                <EmptyTab icon={active.icon} title={active.title} hint={active.hint} />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </motion.aside>

      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Collapse panel" : "Expand panel"}
        className={cn(
          "absolute top-1/2 z-20 flex h-10 w-6 -translate-y-1/2 items-center justify-center rounded-full border bg-white text-muted-foreground shadow-sm transition-colors duration-150 hover:border-[#D4D4DA] hover:text-foreground",
          open ? "-right-3" : "-right-8",
        )}
      >
        <ChevronLeft className={cn("size-3.5 transition-transform duration-200", !open && "rotate-180")} />
      </button>
    </div>
  );
}

function EmptyTab({ icon: Icon, title, hint }: { icon: LucideIcon; title: string; hint: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-10 py-16 text-center">
      <div className="mb-4 flex size-11 items-center justify-center rounded-xl border bg-[#FAFAFB]">
        <Icon className="size-5 text-muted-foreground" strokeWidth={1.75} />
      </div>
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1.5 max-w-64 text-sm leading-relaxed text-muted-foreground">{hint}</p>
    </div>
  );
}
