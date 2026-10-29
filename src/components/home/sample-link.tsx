"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { openSample, sampleInfo } from "@/lib/client";

// "No recording handy?": opens a copy of the sample project. Hidden when this machine has no sample.
export function SampleLink() {
  const router = useRouter();
  const [available, setAvailable] = useState(false);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    sampleInfo()
      .then((s) => setAvailable(s.available))
      .catch(() => {});
  }, []);

  if (!available) return null;

  async function open() {
    setOpening(true);
    try {
      const project = await openSample();
      router.push(`/projects/${project.id}`);
    } catch (err) {
      setOpening(false);
      toast.error("Couldn't open the sample", { description: err instanceof Error ? err.message : undefined });
    }
  }

  return (
    <p className="mt-3 flex items-center gap-1.5 text-[13px] text-muted-foreground">
      No recording handy?
      <button
        onClick={open}
        disabled={opening}
        className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline disabled:opacity-60"
      >
        {opening && <Loader2 className="size-3.5 animate-spin" />}
        Open a sample project
      </button>
    </p>
  );
}
