"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { devActivateShopSubscriptionAction } from "@/app/subscribe/actions";
import { Button } from "@/components/ui/button";

export function DevActivateSubscriptionButton() {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      disabled={pending}
      className="mt-3 w-full rounded-2xl border-dashed border-amber-400 text-amber-950"
      onClick={() => {
        startTransition(async () => {
          const res = await devActivateShopSubscriptionAction();
          if (res.ok) {
            toast.success(res.message);
            window.location.href = res.redirectTo ?? "/dashboard";
          } else {
            toast.error(res.message);
          }
        });
      }}
    >
      {pending ? "Working…" : "Dev: mark shop as subscribed"}
    </Button>
  );
}
