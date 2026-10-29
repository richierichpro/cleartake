import { AudioLines, Captions, FileVideo, ScanSearch } from "lucide-react";
import { Logo } from "@/components/logo";
import { HeroVisual } from "@/components/home/hero-visual";
import { ProjectGrid } from "@/components/home/project-grid";
import { UploadZone } from "@/components/home/upload-zone";

const STEPS = [
  { icon: FileVideo, title: "Upload", text: "Drop a screen recording with your voiceover. Any length, MP4, MOV or WebM." },
  { icon: AudioLines, title: "Rewrite and re-voice", text: "Your voiceover is transcribed, rewritten in clear English and re-recorded by a natural AI voice." },
  { icon: ScanSearch, title: "Retime", text: "Silences are cut and slow parts sped up, so the video follows the new voice." },
  { icon: Captions, title: "Polish and export", text: "Zooms on what you click, captions, step labels and title cards. Export an MP4." },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-[#FAFAFB]">
      <header className="sticky top-0 z-10 border-b bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center px-6">
          <Logo />
          <nav className="ml-auto flex items-center gap-6 text-[13px] text-muted-foreground">
            <a href="#projects" className="transition-colors hover:text-foreground">
              Projects
            </a>
            <a href="#how-it-works" className="transition-colors hover:text-foreground">
              How it works
            </a>
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-14 px-6 pt-16 pb-28 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          <div>
            <p className="text-[13px] font-medium text-brand">AI voiceover and editing for product demos</p>
            <h1 className="mt-3 text-[44px] leading-[1.08] font-semibold tracking-[-0.03em] text-balance">
              Turn a raw recording into a <span className="whitespace-nowrap">studio-quality</span> demo video
            </h1>
            <p className="mt-5 max-w-md text-base leading-relaxed text-muted-foreground">
              Talk through your screen however it comes out, ums, retakes and all. Demopolish rewrites what you said, re-records it in a
              natural AI voice, retimes the video to match and adds zooms, captions and title cards, in minutes.
            </p>
            <div className="mt-8 max-w-md">
              <UploadZone />
            </div>
          </div>
          <div className="hidden lg:block">
            <HeroVisual />
          </div>
        </section>

        <section id="projects" className="mx-auto max-w-6xl scroll-mt-20 px-6 pb-20">
          <h2 className="mb-6 text-lg font-semibold tracking-tight">Your projects</h2>
          <ProjectGrid />
        </section>
        <section id="how-it-works" className="scroll-mt-20 border-t bg-white">
          <div className="mx-auto max-w-6xl px-6 py-16">
            <h2 className="text-[13px] font-medium text-muted-foreground">How it works</h2>
            <ol className="mt-8 grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
              {STEPS.map((s, i) => (
                <li key={s.title}>
                  <div className="flex items-center gap-3">
                    <span className="flex size-9 items-center justify-center rounded-lg border bg-[#FAFAFB]">
                      <s.icon className="size-[18px]" strokeWidth={1.75} />
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">0{i + 1}</span>
                  </div>
                  <h3 className="mt-4 text-[15px] font-semibold tracking-tight">{s.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

      </main>
    </div>
  );
}
