import { BACKGROUND_PRESETS } from "@/lib/visuals";

// A still of what Demopolish makes: the recording framed on a background with a step badge,
// a zoom focus and a caption. Drawn in HTML so it stays sharp and needs no assets.

const AURORA = BACKGROUND_PRESETS.find((b) => b.id === "aurora")!.css;

export function HeroVisual() {
  return (
    <div className="relative">
      <div className="rounded-[20px] border bg-white p-2 shadow-[0_30px_80px_-30px_rgba(17,17,19,0.35)]">
        <div className="relative aspect-video overflow-hidden rounded-[14px]" style={{ background: AURORA }}>
          {/* The recording */}
          <div className="absolute inset-[9%] overflow-hidden rounded-lg bg-white shadow-[0_14px_40px_-12px_rgba(17,17,19,0.35)]">
            <div className="flex h-[9%] items-center gap-1 border-b bg-[#F7F7F8] px-2.5">
              <span className="size-1.5 rounded-full bg-[#FF5F57]" />
              <span className="size-1.5 rounded-full bg-[#FEBC2E]" />
              <span className="size-1.5 rounded-full bg-[#28C840]" />
              <span className="ml-3 h-1.5 w-1/4 rounded-full bg-[#E4E4E7]" />
            </div>
            <div className="flex h-[91%]">
              <div className="w-[34%] space-y-[6%] border-r p-[4%]">
                <Line w="60%" dark />
                <Line w="85%" />
                <Line w="70%" />
                <Line w="80%" />
                <Line w="55%" />
                <div className="relative mt-[10%]">
                  <div className="flex h-5 items-center justify-center rounded-md bg-[#174A45] text-[7px] font-medium text-white">
                    Plan our trip
                  </div>
                  {/* Zoom focus */}
                  <div className="absolute -inset-2 rounded-lg border-[1.5px] border-dashed border-brand" />
                </div>
              </div>
              <div className="flex-1 space-y-[4%] p-[4%]">
                <Line w="40%" dark />
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex gap-2 rounded-md border p-1.5">
                    <div className="size-6 shrink-0 rounded bg-[#E9E3D9]" />
                    <div className="flex-1 space-y-1">
                      <Line w="55%" dark />
                      <Line w="80%" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Step badge */}
          <div className="absolute top-[4%] left-[3%] flex items-center gap-1.5 rounded-full bg-white/95 py-1 pr-3 pl-1 shadow-md">
            <span className="flex size-4 items-center justify-center rounded-full bg-brand text-[8px] font-bold text-white">2</span>
            <span className="text-[10px] font-semibold text-[#111113]">Plan your trip</span>
          </div>

          {/* Caption */}
          <div className="absolute inset-x-0 bottom-[5%] flex justify-center">
            <div className="rounded-md bg-[#111113]/85 px-2.5 py-1 text-[10px] font-semibold text-white">
              and click{" "}
              <span className="rounded-[3px] bg-brand px-[3px] py-px">Plan</span> Our Trip.
            </div>
          </div>
        </div>
      </div>

      {/* The edit: what was cut and sped up */}
      <div className="absolute -bottom-16 -left-10 w-56 rounded-xl border bg-white p-3.5 shadow-[0_16px_40px_-16px_rgba(17,17,19,0.3)]">
        <div className="flex items-baseline justify-between text-xs">
          <span className="text-muted-foreground">Raw recording</span>
          <span className="font-mono text-muted-foreground tabular-nums">0:36</span>
        </div>
        <div className="mt-1.5 flex h-2 gap-px overflow-hidden rounded-full">
          {[18, 9, 22, 7, 14, 30].map((w, i) => (
            <span key={i} style={{ flex: w }} className={i % 2 ? "bg-[#E4E4E7]" : "bg-[#A1A1AA]"} />
          ))}
        </div>
        <div className="mt-3 flex items-baseline justify-between text-xs">
          <span className="font-medium">Edited</span>
          <span className="font-mono font-medium tabular-nums">0:19</span>
        </div>
        <div className="mt-1.5 flex h-2 gap-px overflow-hidden rounded-full" style={{ width: "53%" }}>
          {[18, 22, 14, 30].map((w, i) => (
            <span key={i} style={{ flex: w }} className="bg-brand" />
          ))}
        </div>
        <p className="mt-2.5 text-[11px] leading-snug text-muted-foreground">Silences cut, dead time sped up to the new voice.</p>
      </div>
    </div>
  );
}

function Line({ w, dark = false }: { w: string; dark?: boolean }) {
  return <div className={dark ? "h-1.5 rounded-full bg-[#D4D4D8]" : "h-1 rounded-full bg-[#ECECEE]"} style={{ width: w }} />;
}
