"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { FileVideo, UploadCloud } from "lucide-react";
import { toast } from "sonner";
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
      step("Preparing editor…", 1);
      if (info.thumbnail) await uploadThumbnail(project.id, info.thumbnail);
      router.push(`/projects/${project.id}`);
    } catch (err) {
      setPhase({ kind: "idle" });
      toast.error("Upload failed", { description: err instanceof Error ? err.message : undefined });
    }
  }

  return (
    <motion.div
      onClick={() => !busy && inputRef.current?.click()}
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
      whileHover={busy ? undefined : "hover"}
      animate={dragging ? "hover" : "rest"}
      initial="rest"
      className={cn(
        "group relative flex h-72 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed bg-white transition-colors duration-200",
        dragging ? "border-brand bg-brand/[0.03]" : "border-[#D4D4DA] hover:border-[#B4B4BC]",
        busy && "cursor-default",
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
      <div className="dot-grid pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-60" />

      <AnimatePresence mode="wait">
        {phase.kind === "idle" ? (
          <motion.div
            key="idle"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="relative flex flex-col items-center text-center"
          >
            <motion.div
              variants={{ rest: { y: 0, scale: 1 }, hover: { y: -4, scale: 1.04 } }}
              transition={{ type: "spring", stiffness: 400, damping: 22 }}
              className={cn(
                "mb-5 flex size-14 items-center justify-center rounded-2xl border bg-white shadow-sm transition-colors",
                dragging && "border-brand text-brand",
              )}
            >
              <UploadCloud className="size-6" strokeWidth={1.75} />
            </motion.div>
            <p className="text-[15px] font-medium">
              {dragging ? "Drop to upload" : "Drop your screen recording here"}
            </p>
            <p className="mt-1.5 text-sm text-muted-foreground">
              or <span className="font-medium text-foreground underline-offset-4 group-hover:underline">browse files</span>
              {" "}· MP4, MOV or WebM with your voiceover
            </p>
          </motion.div>
        ) : (
          <motion.div
            key="busy"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="relative flex w-full max-w-sm flex-col items-center text-center"
          >
            <div className="mb-5 flex size-14 items-center justify-center rounded-2xl border bg-white shadow-sm">
              <FileVideo className="size-6" strokeWidth={1.75} />
            </div>
            <p className="max-w-full truncate text-[15px] font-medium">{phase.fileName}</p>
            <p className="mt-1.5 text-sm text-muted-foreground tabular-nums">{phase.label}</p>
            <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <motion.div
                className="h-full rounded-full bg-foreground"
                animate={{ width: `${Math.max(4, phase.progress * 100)}%` }}
                transition={{ ease: "easeOut", duration: 0.25 }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
