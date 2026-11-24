"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

const toastMessages: Record<string, string> = {
  "shop-created": "Shop created successfully.",
  "already-has-shop": "You already have a shop. Redirected to dashboard.",
};

export function DashboardToastListener() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const toastKey = searchParams.get("toast");
    if (!toastKey || !toastMessages[toastKey]) {
      return;
    }

    toast.success(toastMessages[toastKey]);

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("toast");
    const nextQuery = nextParams.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  return null;
}
