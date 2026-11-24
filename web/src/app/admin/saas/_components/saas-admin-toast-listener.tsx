"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { toast } from "sonner";

function savedMessage(pathname: string) {
  if (pathname.includes("/admin/saas/plans")) return "Plan saved.";
  if (pathname.includes("/admin/saas/subscriptions")) return "Subscription updated.";
  if (pathname.includes("/admin/saas/shops")) return "Shop updated.";
  return "Saved.";
}

export function SaasAdminToastListener() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const saved = searchParams.get("saved");
    const error = searchParams.get("error");
    const scheduled = searchParams.get("scheduled");

    if (scheduled) toast.success("Price correction scheduled for the next renewal. No immediate charge.");

    if (saved) {
      toast.success(savedMessage(pathname));
    }

    if (error) {
      toast.error(error);
    }

    if (saved || error || scheduled) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("saved");
      params.delete("error");
      params.delete("scheduled");
      const next = params.toString() ? `${pathname}?${params.toString()}` : pathname;
      window.history.replaceState(null, "", next);
    }
  }, [pathname, searchParams]);

  return null;
}
