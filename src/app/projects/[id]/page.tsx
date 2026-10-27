import { Suspense } from "react";
import { Editor, EditorSkeleton } from "@/components/editor/editor";

export default function ProjectPage({ params }: PageProps<"/projects/[id]">) {
  return (
    <Suspense fallback={<EditorSkeleton />}>
      {params.then(({ id }) => (
        <Editor id={id} />
      ))}
    </Suspense>
  );
}
