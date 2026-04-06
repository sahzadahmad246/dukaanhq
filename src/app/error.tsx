"use client";

import { useEffect } from "react";

import { ErrorRecovery } from "@/app/_components/error-recovery";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App route error:", error);
  }, [error]);

  return (
    <ErrorRecovery
      title="We couldn't load this screen"
      description="A temporary app error happened while opening this page. Try again first. If it still happens, reload the page."
      onRetry={reset}
    />
  );
}
