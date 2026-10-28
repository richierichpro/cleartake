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
          <h1 className="text-center text-4xl leading-tight font-semibold tracking-tight">
            Turn a raw recording into
            <br />
            <span className="text-brand">a professional demo video in minutes</span>
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-center text-[15px] text-muted-foreground">
            We rewrite your script, give it a clear AI voice, cut the dead air, and add zooms, captions and title cards.
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
