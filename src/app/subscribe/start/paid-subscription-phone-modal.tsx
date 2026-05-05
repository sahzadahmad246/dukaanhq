"use client";

import { useMemo, useState } from "react";
import { CreditCard, Loader2, Phone, X } from "lucide-react";
import { useFormStatus } from "react-dom";

import { createPaidSubscriptionIntentAction } from "@/app/subscribe/start/actions";

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-stone-950 px-5 text-sm font-bold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-400"
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CreditCard className="h-4 w-4" aria-hidden="true" />}
      Continue to Cashfree
    </button>
  );
}

export function PaidSubscriptionPhoneModal({
  planCode,
  billingInterval,
  planName,
}: {
  planCode: "growth" | "pro";
  billingInterval: "month" | "year";
  planName: string;
}) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [touched, setTouched] = useState(false);
  const isValid = /^\d{10}$/.test(phone);
  const error = useMemo(() => {
    if (!touched || isValid) {
      return "";
    }
    return "Enter a valid 10-digit mobile number.";
  }, [isValid, touched]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-5 w-full rounded-2xl bg-stone-950 py-3.5 text-sm font-bold text-white transition hover:bg-stone-800"
      >
        Create Cashfree subscription
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-950/40 px-4 py-4 sm:items-center">
          <div className="w-full max-w-md rounded-[1.75rem] border border-stone-200 bg-white p-5 shadow-[0_24px_90px_rgba(15,23,42,0.22)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-stone-100 text-stone-900">
                  <Phone className="h-5 w-5" aria-hidden="true" />
                </div>
                <h3 className="mt-4 text-xl font-black tracking-tight text-stone-950">Confirm mobile number</h3>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  Cashfree needs this number to create the recurring payment authorization for {planName}.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-600 transition hover:bg-stone-200 hover:text-stone-950"
                aria-label="Close"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <form action={createPaidSubscriptionIntentAction} className="mt-5 grid gap-4">
              <input type="hidden" name="plan" value={planCode} />
              <input type="hidden" name="billing" value={billingInterval} />
              <label className="grid gap-2">
                <span className="text-xs font-bold uppercase tracking-widest text-stone-500">Mobile number</span>
                <input
                  name="customerPhone"
                  value={phone}
                  onBlur={() => setTouched(true)}
                  onChange={(event) => {
                    const digits = event.target.value.replace(/\D/g, "").slice(0, 10);
                    setPhone(digits);
                    if (digits.length > 0) {
                      setTouched(true);
                    }
                  }}
                  inputMode="numeric"
                  maxLength={10}
                  placeholder="9876543210"
                  className={[
                    "h-12 rounded-2xl border bg-white px-4 text-base font-semibold text-stone-950 outline-none transition placeholder:text-stone-400",
                    error ? "border-red-300 ring-2 ring-red-100" : "border-stone-300 focus:border-stone-500",
                  ].join(" ")}
                />
                {error ? <span className="text-sm font-medium text-red-600">{error}</span> : null}
              </label>
              <SubmitButton disabled={!isValid} />
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
