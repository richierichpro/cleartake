import { Mic } from "lucide-react";
import { BACKGROUND_PRESETS } from "@/lib/visuals";

// A still of what Demopolish makes, on a made-up product (not a real project): the recording framed on a
// background with a step badge, a zoom on the button you click and a caption, each labelled, plus
// the voiceover: what you said and what the AI voice says instead. Drawn in HTML so it stays sharp and needs no assets.

const AURORA = BACKGROUND_PRESETS.find((b) => b.id === "aurora")!.css;

export function HeroVisual() {
  return (
    <div className="relative pt-8 pb-44">
      {/* Labels outside the frame */}
      <Label className="top-0 left-[4%]" line="down">
        Step labels
      </Label>
      <Label className="bottom-[110px] left-[56%]" line="up" length={40}>
        Captions follow the AI voice
      </Label>

      <div className="rounded-[20px] border bg-white p-2 shadow-[0_30px_80px_-30px_rgba(17,17,19,0.35)]">
        <div className="relative aspect-video overflow-hidden rounded-[14px]" style={{ background: AURORA }}>
          {/* The recording: a made-up analytics app */}
          <div className="absolute inset-[9%] flex flex-col overflow-hidden rounded-lg bg-white text-[#111113] shadow-[0_14px_40px_-12px_rgba(17,17,19,0.35)]">
            <div className="flex h-5 shrink-0 items-center gap-1 border-b bg-[#F7F7F8] px-2.5">
              <span className="size-1.5 rounded-full bg-[#FF5F57]" />
              <span className="size-1.5 rounded-full bg-[#FEBC2E]" />
              <span className="size-1.5 rounded-full bg-[#28C840]" />
              <span className="ml-3 rounded bg-white px-2 text-[7px] leading-3 text-[#71717A]">app.acme.io/overview</span>
            </div>
            <div className="flex min-h-0 flex-1">
              <div className="w-[24%] space-y-0.5 border-r bg-[#FAFAFB] px-2 py-2.5">
                <p className="mb-2 flex items-center gap-1 px-1 text-[9px] font-bold">
                  <span className="size-2.5 rounded-[3px] bg-[#4F46E5]" /> Acme
                </p>
                {["Overview", "Reports", "Customers", "Settings"].map((item, i) => (
                  <p
                    key={item}
                    className={i === 0 ? "rounded bg-white px-1.5 py-0.5 text-[8px] font-medium shadow-sm" : "px-1.5 py-0.5 text-[8px] text-[#71717A]"}
                  >
                    {item}
                  </p>
                ))}
              </div>
              <div className="flex min-w-0 flex-1 flex-col px-3 py-2.5">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-semibold">Overview</p>
                  <div className="relative">
                    <div className="flex h-4 items-center rounded bg-[#4F46E5] px-2 text-[7px] font-semibold text-white">+ New report</div>
                    {/* Zoom focus */}
                    <div className="absolute -inset-1.5 rounded-md border-[1.5px] border-dashed border-brand" />
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-1.5">
                  <Stat label="Revenue" value="$48.2k" change="+12%" />
                  <Stat label="Active users" value="3,912" change="+8%" />
                  <Stat label="Conversion" value="4.6%" change="+0.4" />
                </div>
                <div className="mt-2 flex min-h-0 flex-1 items-end gap-1 rounded-md border px-2 pt-2 pb-1.5">
                  {[38, 52, 45, 61, 57, 70, 66, 78, 74, 88, 82, 95].map((h, i) => (
                    <span key={i} className="flex-1 rounded-t-[2px] bg-[#C7D2FE]" style={{ height: `${h}%`, opacity: i === 11 ? 1 : 0.85 }} />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Step badge */}
          <div className="absolute top-[3.5%] left-[3%] flex items-center gap-1.5 rounded-full bg-white/95 py-1 pr-3 pl-1 shadow-md">
            <span className="flex size-4 items-center justify-center rounded-full bg-brand text-[8px] font-bold text-white">2</span>
            <span className="text-[10px] font-semibold text-[#111113]">Create a report</span>
          </div>

          {/* Zoom label, next to the button it zooms into */}
          <div className="absolute top-[22.5%] right-[23%] flex -translate-y-1/2 items-center">
            <span className="rounded-full bg-brand px-2 py-0.5 text-[9px] font-semibold whitespace-nowrap text-white shadow-sm">
              Auto-zoom on what you click
            </span>
            <span className="h-px w-5 bg-brand" />
          </div>

          {/* Caption */}
          <div className="absolute inset-x-0 bottom-[4%] flex justify-center">
            <div className="rounded-md bg-[#111113]/85 px-2.5 py-1 text-[10px] font-semibold text-white">
              …then click <span className="rounded-[3px] bg-brand px-[3px] py-px">New</span> report.
            </div>
          </div>
        </div>
      </div>

      {/* The voice: what you said → what the AI voice says */}
      <div className="absolute bottom-0 -left-10 w-80 rounded-xl border bg-white p-3.5 shadow-[0_16px_40px_-16px_rgba(17,17,19,0.3)]">
        <div className="flex items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-md bg-brand/10 text-brand">
            <Mic className="size-3.5" />
          </span>
          <p className="text-[13px] font-semibold">Voiceover</p>
          <p className="ml-auto text-[11px] text-muted-foreground">Rewritten and re-voiced</p>
        </div>
        <p className="mt-3 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">You said</p>
        <p className="mt-0.5 text-xs leading-snug text-muted-foreground italic">
          “so <s>uh</s> basically you just, <s>you click on the,</s> the new report thing”
        </p>
        <p className="mt-2.5 text-[10px] font-medium tracking-wide text-brand uppercase">AI voice</p>
        <div className="mt-1 flex items-center gap-2.5">
          <span className="flex h-5 items-center gap-[2px]">
            {[5, 9, 14, 8, 17, 11, 6, 13, 18, 10, 7, 12, 15, 8, 5].map((h, i) => (
              <span key={i} className="w-[2px] rounded-full bg-brand" style={{ height: h }} />
            ))}
          </span>
          <p className="text-[13px] font-medium">“Then click New report.”</p>
        </div>
        <p className="mt-3 border-t pt-2 text-[11px] text-muted-foreground">
          Video retimed to the new voice ·{" "}
          <span className="font-mono tabular-nums">
            <span className="line-through">0:36</span> → <span className="font-medium text-foreground">0:19</span>
          </span>
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value, change }: { label: string; value: string; change: string }) {
  return (
    <div className="rounded-md border px-1.5 py-1">
      <p className="text-[6.5px] text-[#71717A]">{label}</p>
      <p className="flex items-baseline gap-1 text-[10px] font-semibold">
        {value} <span className="text-[6.5px] font-medium text-emerald-600">{change}</span>
      </p>
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
