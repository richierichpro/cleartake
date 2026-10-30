import { Suspense } from "react";
import { ResultView, ResultSkeleton } from "@/components/result/result-view";

// The finished video, right after processing (like a share page): watch, then Edit or Export.
export default function ResultPage({ params }: PageProps<"/projects/[id]/result">) {
  return (
    <Suspense fallback={<ResultSkeleton />}>
      {params.then(({ id }) => (
        <ResultView id={id} />
      ))}
    </Suspense>
  );
}
