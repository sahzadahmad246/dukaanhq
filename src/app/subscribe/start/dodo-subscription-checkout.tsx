"use client";

export function DodoSubscriptionCheckout({
  checkoutUrl,
}: {
  checkoutUrl: string;
}) {
  return (
    <div className="mt-5">
      <a
        href={checkoutUrl}
        className="flex w-full items-center justify-center rounded-2xl bg-stone-950 py-3.5 text-sm font-bold text-white transition hover:bg-stone-800"
      >
        Continue to secure checkout
      </a>
      <p className="mt-3 text-center text-xs leading-5 text-stone-500">
        You will return here after payment setup is complete.
      </p>
    </div>
  );
}
