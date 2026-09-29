"use client";
import { lazy, Suspense } from "react";

// The Studio's preview tools (./PreviewTools.tsx), in a file of their own: app/layout.tsx renders
// this only in draft mode, so visitors never download them, only these few lines.
const PreviewTools = lazy(() => import("./PreviewTools"));

export default function PreviewEditing() {
  return (
    <Suspense fallback={null}>
      <PreviewTools />
    </Suspense>
  );
}
