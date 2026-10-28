import { Scissors } from "lucide-react";
import { BACKGROUND_PRESETS } from "@/lib/visuals";

// A still of what Demopolish makes: a recording framed on a background with a step badge, a zoom on
// the button you click and a caption, each labelled. Drawn in HTML so it stays sharp and needs no assets.

const AURORA = BACKGROUND_PRESETS.find((b) => b.id === "aurora")!.css;

export function HeroVisual() {
  return (
    <div className="relative pt-8 pb-24">
      {/* Labels outside the frame */}
      <Label className="top-0 left-[4%]" line="down">
        Step labels
      </Label>
      <Label className="bottom-[54px] left-[52%]" line="up" length={40}>
        Captions follow the AI voice
      </Label>

      <div className="rounded-[20px] border bg-white p-2 shadow-[0_30px_80px_-30px_rgba(17,17,19,0.35)]">
        <div className="relative aspect-video overflow-hidden rounded-[14px]" style={{ background: AURORA }}>
          {/* The recording: a trip planner */}
          <div className="absolute inset-[9%] flex flex-col overflow-hidden rounded-lg bg-white text-[#111113] shadow-[0_14px_40px_-12px_rgba(17,17,19,0.35)]">
            <div className="flex h-5 shrink-0 items-center gap-1 border-b bg-[#F7F7F8] px-2.5">
              <span className="size-1.5 rounded-full bg-[#FF5F57]" />
              <span className="size-1.5 rounded-full bg-[#FEBC2E]" />
              <span className="size-1.5 rounded-full bg-[#28C840]" />
              <span className="ml-3 rounded bg-white px-2 text-[7px] leading-3 text-[#71717A]">milo.app/plan</span>
            </div>
            <div className="flex min-h-0 flex-1">
              <div className="w-[38%] border-r bg-[#FBF8F3] px-3 py-2.5">
                <p className="font-serif text-[13px] leading-none font-semibold text-[#174A45]">Milo</p>
                <Field label="Where to?" value="Goa" />
                <Field label="Dates" value="20 – 23 Nov" />
                <Field label="Friends" value="Aarav, Meera, Kabir" />
                <div className="relative mt-3">
                  <div className="flex h-5 items-center justify-center rounded-md bg-[#174A45] text-[8px] font-semibold text-white">
                    Plan our trip
                  </div>
                  {/* Zoom focus */}
                  <div className="absolute -inset-1.5 rounded-lg border-[1.5px] border-dashed border-brand" />
                </div>
              </div>
              <div className="flex-1 space-y-1.5 px-3 py-2.5">
                <p className="text-[9px] font-semibold">Your itinerary</p>
                <Day n={1} place="Baga Beach" note="Sunset, beach shacks" />
                <Day n={2} place="Fort Aguada" note="Lighthouse, Candolim" />
                <Day n={3} place="Dudhsagar Falls" note="Jeep safari" />
              </div>
            </div>
          </div>

          {/* Step badge */}
          <div className="absolute top-[3.5%] left-[3%] flex items-center gap-1.5 rounded-full bg-white/95 py-1 pr-3 pl-1 shadow-md">
            <span className="flex size-4 items-center justify-center rounded-full bg-brand text-[8px] font-bold text-white">2</span>
            <span className="text-[10px] font-semibold text-[#111113]">Plan your trip</span>
          </div>

          {/* Zoom label, next to the button it zooms into */}
          <div className="absolute top-[67%] left-[41%] flex -translate-y-1/2 items-center">
            <span className="h-px w-6 bg-brand" />
            <span className="rounded-full bg-brand px-2 py-0.5 text-[9px] font-semibold whitespace-nowrap text-white shadow-sm">
              Auto-zoom on what you click
            </span>
          </div>

          {/* Caption */}
          <div className="absolute inset-x-0 bottom-[4%] flex justify-center">
            <div className="rounded-md bg-[#111113]/85 px-2.5 py-1 text-[10px] font-semibold text-white">
              …and click <span className="rounded-[3px] bg-brand px-[3px] py-px">Plan</span> our trip.
            </div>
          </div>
        </div>
      </div>

      {/* The automatic edit */}
      <div className="absolute bottom-0 -left-10 w-72 rounded-xl border bg-white p-3.5 shadow-[0_16px_40px_-16px_rgba(17,17,19,0.3)]">
        <div className="flex items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-md bg-brand/10 text-brand">
            <Scissors className="size-3.5" />
          </span>
          <p className="text-[13px] font-semibold whitespace-nowrap">Dead air removed</p>
          <p className="ml-auto font-mono text-xs whitespace-nowrap tabular-nums">
            <span className="text-muted-foreground line-through">0:36</span> → <span className="font-semibold">0:19</span>
          </p>
        </div>
        <div className="mt-3 flex h-2.5 gap-0.5">
          {[
            [18, true],
            [9, false],
            [22, true],
            [7, false],
            [14, true],
            [30, false],
          ].map(([w, kept], i) => (
            <span
              key={i}
              style={{ flex: w as number }}
              className={
                kept
                  ? "rounded-sm bg-brand"
                  : "rounded-sm bg-[repeating-linear-gradient(135deg,#E4E4E7_0_3px,transparent_3px_6px)] ring-1 ring-[#E4E4E7] ring-inset"
              }
            />
          ))}
        </div>
        <div className="mt-2 flex gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-sm bg-brand" /> Kept, timed to the voice
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-sm bg-[repeating-linear-gradient(135deg,#D4D4D8_0_2px,transparent_2px_4px)] ring-1 ring-[#E4E4E7]" />{" "}
            Cut
          </span>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-2">
      <p className="text-[7px] font-medium text-[#71717A]">{label}</p>
      <p className="mt-0.5 truncate rounded border bg-white px-1.5 py-0.5 text-[8px]">{value}</p>
    </div>
  );
}

function Day({ n, place, note }: { n: number; place: string; note: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border px-1.5 py-1">
      <span className="flex size-5 shrink-0 items-center justify-center rounded bg-[#E9E3D9] text-[7px] font-semibold text-[#174A45]">
        D{n}
      </span>
      <div className="min-w-0">
        <p className="truncate text-[8px] font-semibold">
          Day {n} · {place}
        </p>
        <p className="truncate text-[7px] text-[#71717A]">{note}</p>
      </div>
    </div>
  );
}

// A small annotation outside the frame, with a line pointing at what it names.
function Label({
  className,
  line,
  length = 16,
  children,
}: {
  className: string;
  line: "up" | "down";
  length?: number; // of the pointer line, px
  children: React.ReactNode;
}) {
  return (
    <div className={`absolute z-10 flex flex-col items-start ${className}`}>
      {line === "up" && <span className="ml-6 w-px bg-[#A1A1AA]" style={{ height: length }} />}
      <span className="flex items-center gap-1.5 rounded-full border bg-white px-2.5 py-1 text-[11px] font-medium shadow-sm">
        <span className="size-1.5 rounded-full bg-brand" />
        {children}
      </span>
      {line === "down" && <span className="ml-6 w-px bg-[#A1A1AA]" style={{ height: length }} />}
    </div>
  );
}
