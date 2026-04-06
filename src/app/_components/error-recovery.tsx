"use client";

import { AlertTriangle, RefreshCcw, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";

export function ErrorRecovery({
  title,
  description,
  onRetry,
  showReload = true,
}: {
  title: string;
  description: string;
  onRetry: () => void;
  showReload?: boolean;
}) {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-5 py-10">
      <div className="w-full max-w-md overflow-hidden rounded-[2rem] border border-stone-200 bg-white shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
        <div className="border-b border-stone-200 bg-[#fff8db] px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f5c542] text-[#080e1a]">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-stone-500">Something went wrong</p>
              <h2 className="mt-1 text-lg font-semibold text-stone-950">{title}</h2>
            </div>
          </div>
        </div>

        <div className="space-y-5 px-6 py-6">
          <p className="text-sm leading-6 text-stone-600">{description}</p>

          <div className="flex flex-col gap-3">
            <Button type="button" onClick={onRetry} className="w-full rounded-2xl bg-stone-950 text-white hover:bg-stone-800">
              <RotateCw className="h-4 w-4" />
              Retry
            </Button>

            {showReload ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => window.location.reload()}
                className="w-full rounded-2xl border-stone-200"
              >
                <RefreshCcw className="h-4 w-4" />
                Reload Page
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
