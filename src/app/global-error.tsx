"use client";

import { useEffect } from "react";

import { ErrorRecovery } from "@/app/_components/error-recovery";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global app error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen bg-stone-100 text-stone-950">
        <ErrorRecovery
          title="The app hit an unexpected problem"
          description="This usually clears up after a retry or page reload. If it keeps happening in production, we should inspect the browser console or Vercel logs for the exact client exception."
          onRetry={reset}
        />
      </body>
    </html>
  );
}
