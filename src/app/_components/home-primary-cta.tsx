"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

type HomePrimaryCtaProps = {
  href: string;
  label: string;
};

export function HomePrimaryCta({ href, label }: HomePrimaryCtaProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [hasStartedNavigation, setHasStartedNavigation] = useState(false);

  const loading = isPending || hasStartedNavigation;

  useEffect(() => {
    router.prefetch(href);
  }, [href, router]);

  return (
    <button
      type="button"
      disabled={loading}
      onClick={() => {
        if (loading) return;
        setHasStartedNavigation(true);
        startTransition(() => {
          router.push(href);
        });
      }}
      className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#f5c542] text-[15px] font-black tracking-tight text-[#080e1a] transition hover:bg-[#f0bb2a] active:scale-[0.98] disabled:cursor-wait disabled:opacity-85"
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      <span>{loading ? "Opening..." : `${label} →`}</span>
    </button>
  );
}
