"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { ArrowRightLeft, Loader2, X } from "lucide-react";

export function ChangePlanConfirmButton({
  actionLabel,
  planName,
  billingLabel,
  effectiveDate,
  disabled,
}: {
  actionLabel: string;
  planName: string;
  billingLabel: string;
  effectiveDate: string;
  disabled?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const { pending } = useFormStatus();

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        disabled={disabled || pending}
        className="inline-flex h-10 items-center justify-center rounded-xl bg-stone-950 px-3 text-xs font-bold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-500"
      >
        {pending ? (
          <>
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            Scheduling...
          </>
        ) : (
          actionLabel
        )}
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-950/50 px-3 pb-3 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="w-full max-w-md overflow-hidden rounded-[1.75rem] bg-white shadow-2xl">
            <div className="flex items-start gap-3 border-b border-stone-100 px-5 py-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-stone-100 text-stone-800">
                <ArrowRightLeft className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-base font-bold text-stone-950">Confirm plan change</p>
                <p className="mt-1 text-sm leading-6 text-stone-600">
                  {planName} ({billingLabel}) will start on {effectiveDate}. Your current plan stays active until then.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-500 transition hover:bg-stone-200 hover:text-stone-900"
                aria-label="Close confirmation"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="grid gap-2 px-5 py-4">
              <button
                type="submit"
                disabled={pending}
                className="inline-flex h-11 w-full items-center justify-center rounded-2xl bg-stone-950 px-4 text-sm font-bold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {pending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                    Scheduling...
                  </>
                ) : (
                  "Confirm change"
                )}
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                disabled={pending}
                className="inline-flex h-11 w-full items-center justify-center rounded-2xl border border-stone-200 bg-white px-4 text-sm font-bold text-stone-700 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-70"
              >
                Keep current plan
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
