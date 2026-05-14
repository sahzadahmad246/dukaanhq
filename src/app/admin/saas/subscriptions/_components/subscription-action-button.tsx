"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";

export function SubscriptionActionButton({
  children,
  className,
}: {
  children: React.ReactNode;
  className: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
      <span>{pending ? "Saving..." : children}</span>
    </button>
  );
}
