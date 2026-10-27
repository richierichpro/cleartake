import { Suspense } from "react";
import { ProcessingScreen } from "@/components/processing/processing-screen";

export default function ProcessingPage({ params }: PageProps<"/projects/[id]/processing">) {
  return (
    <Suspense fallback={<div className="dot-grid min-h-dvh" />}>
      {params.then(({ id }) => (
        <ProcessingScreen id={id} />
      ))}
    </Suspense>
  );
}
