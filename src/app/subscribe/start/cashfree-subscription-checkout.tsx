"use client";

import Script from "next/script";
import { useState } from "react";

declare global {
  interface Window {
    Cashfree?: (options: { mode: "sandbox" | "production" }) => {
      subscriptionsCheckout: (options: { subsSessionId: string; redirectTarget?: "_self" | "_blank" | "_top" | "_modal" }) => Promise<{
        error?: { message?: string };
      }>;
    };
  }
}

export function CashfreeSubscriptionCheckout({
  environment,
  subscriptionSessionId,
}: {
  environment: "sandbox" | "production";
  subscriptionSessionId: string;
}) {
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function openCheckout() {
    setMessage(null);
    if (!window.Cashfree) {
      setMessage("Cashfree checkout is still loading. Try again in a moment.");
      return;
    }

    try {
      const cashfree = window.Cashfree({ mode: environment });
      const result = await cashfree.subscriptionsCheckout({
        subsSessionId: subscriptionSessionId,
        redirectTarget: "_self",
      });

      if (result?.error) {
        setMessage(result.error.message ?? "Cashfree checkout could not be opened.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Cashfree checkout failed.");
    }
  }

  return (
    <div className="mt-5">
      <Script src="https://sdk.cashfree.com/js/v3/cashfree.js" strategy="afterInteractive" onLoad={() => setReady(true)} />
      <button
        type="button"
        onClick={openCheckout}
        disabled={!ready}
        className="w-full rounded-2xl bg-stone-950 py-3.5 text-sm font-bold text-white transition hover:bg-stone-800 disabled:bg-stone-300 disabled:text-stone-600"
      >
        {ready ? "Open Cashfree authorization" : "Loading Cashfree..."}
      </button>
      {message ? <p className="mt-3 text-center text-sm text-amber-700">{message}</p> : null}
    </div>
  );
}
