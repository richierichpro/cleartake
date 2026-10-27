import { Logo } from "@/components/logo";
import { ProjectGrid } from "@/components/home/project-grid";
import { UploadZone } from "@/components/home/upload-zone";

export default function Home() {
  return (
    <div className="min-h-screen bg-[#FAFAFB]">
      <header className="sticky top-0 z-10 border-b bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center px-6">
          <Logo />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 pt-14 pb-24">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-center text-3xl font-semibold tracking-tight">
            Turn a raw recording into a polished demo
          </h1>
          <p className="mt-2.5 text-center text-[15px] text-muted-foreground">
            We transcribe your voiceover, rewrite the script, and retime the video so it looks professionally made.
          </p>
          <div className="mt-9">
            <UploadZone />
          </div>
        </div>

        <section className="mt-16">
          <h2 className="mb-5 text-sm font-medium text-muted-foreground">Recent projects</h2>
          <ProjectGrid />
        </section>
      </main>
    </div>
  );
}
