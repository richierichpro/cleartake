"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { FileVideo, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { readVideoInfo, uploadThumbnail, uploadVideo } from "@/lib/client";
import { cn } from "@/lib/utils";

type Phase =
  | { kind: "idle" }
  | { kind: "busy"; fileName: string; label: string; progress: number };

export function UploadZone() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const busy = phase.kind === "busy";

  async function handleFile(file: File | undefined) {
    if (!file || busy) return;
    if (!file.type.startsWith("video/")) {
      toast.error("That doesn't look like a video", { description: "Drop an MP4, MOV or WebM screen recording." });
      return;
    }
    const step = (label: string, progress: number) =>
      setPhase({ kind: "busy", fileName: file.name, label, progress });

    try {
      step("Reading video…", 0);
      const info = await readVideoInfo(file);
      const project = await uploadVideo(file, info, (p) => step(`Uploading ${Math.round(p * 100)}%`, p));
      step("Almost there…", 1);
      if (info.thumbnail) await uploadThumbnail(project.id, info.thumbnail);
      router.push(`/projects/${project.id}/processing`);
    } catch (err) {
      setPhase({ kind: "idle" });
      toast.error("Upload failed", { description: err instanceof Error ? err.message : undefined });
    }
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handleFile(e.dataTransfer.files[0]);
      }}
      className={cn(
        "rounded-2xl border bg-white p-2 shadow-[0_1px_2px_rgba(17,17,19,0.04),0_8px_24px_-12px_rgba(17,17,19,0.12)] transition-colors duration-200",
        dragging && "border-brand ring-4 ring-brand/10",
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => {
          handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <div
        className={cn(
          "rounded-xl border border-dashed px-5 py-5 transition-colors duration-200",
          dragging ? "border-brand/50 bg-brand/[0.03]" : "border-[#E4E4E7]",
        )}
      >
        <AnimatePresence mode="wait" initial={false}>
          {phase.kind === "idle" ? (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex items-center gap-4"
            >
              <div
                className={cn(
                  "flex size-11 shrink-0 items-center justify-center rounded-xl border bg-[#FAFAFB] transition-colors",
                  dragging && "border-brand text-brand",
                )}
              >
                <UploadCloud className="size-5" strokeWidth={1.75} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{dragging ? "Drop to upload" : "Upload a screen recording"}</p>
                <p className="mt-0.5 text-[13px] text-muted-foreground">or drag it here · MP4, MOV, WebM</p>
              </div>
              <Button onClick={() => inputRef.current?.click()} className="shrink-0">
                Choose file
              </Button>
            </motion.div>
          ) : (
            <motion.div key="busy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-4">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border bg-[#FAFAFB]">
                <FileVideo className="size-5" strokeWidth={1.75} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="truncate text-sm font-medium">{phase.fileName}</p>
                  <p className="shrink-0 text-xs text-muted-foreground tabular-nums">{phase.label}</p>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <motion.div
                    className="h-full rounded-full bg-foreground"
                    animate={{ width: `${Math.max(4, phase.progress * 100)}%` }}
                    transition={{ ease: "easeOut", duration: 0.25 }}
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
