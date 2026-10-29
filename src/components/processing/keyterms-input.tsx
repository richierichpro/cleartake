"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { toast } from "sonner";

const MAX_TERMS = 50;

/** Chip input: Enter or comma adds a term, Backspace on empty removes the last one. */
export function KeytermsInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState("");

  function add(raw: string) {
    const terms = raw.split(/[,\n]/).map((t) => t.trim()).filter(Boolean);
    const next = [...value];
    for (const t of terms) {
      if (t.split(/\s+/).length > 6) {
        toast.error("Keep each term to 6 words or fewer", { description: t });
        continue;
      }
      if (!next.some((v) => v.toLowerCase() === t.toLowerCase())) next.push(t);
    }
    onChange(next.slice(0, MAX_TERMS));
    setDraft("");
  }

  return (
    <div
      className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-xl border bg-white px-2 py-1.5 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30"
      onClick={(e) => (e.currentTarget.querySelector("input") as HTMLInputElement)?.focus()}
    >
      <AnimatePresence initial={false}>
        {value.map((term) => (
          <motion.span
            key={term}
            layout
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.15 }}
            className="flex h-7 items-center gap-1 rounded-lg bg-muted pr-1 pl-2.5 text-[13px]"
          >
            {term}
            <button
              onClick={() => onChange(value.filter((v) => v !== term))}
              aria-label={`Remove ${term}`}
              className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          </motion.span>
        ))}
      </AnimatePresence>
      <input
        value={draft}
        onChange={(e) => (e.target.value.includes(",") ? add(e.target.value) : setDraft(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === "Enter" && draft.trim()) {
            e.preventDefault();
            add(draft);
          }
          if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={() => draft.trim() && add(draft)}
        placeholder={value.length ? "Add another…" : "e.g. Cleartake, Supabase, OAuth"}
        className="h-7 min-w-32 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}
