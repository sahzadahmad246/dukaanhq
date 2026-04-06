"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { ProfileMenu } from "@/app/_components/profile-menu";

type MarketingHeaderProps = {
  containerClassName: string;
  userInitials?: string | null;
  userName?: string | null;
  userEmail?: string | null;
  userAvatarUrl?: string | null;
  actionHref: string;
  actionLabel: string;
  actionVariant?: "primary" | "ghost";
  theme?: "dark" | "light";
};

export function MarketingHeader({
  containerClassName,
  userInitials,
  userName,
  userEmail,
  userAvatarUrl,
  actionHref,
  actionLabel,
  actionVariant = "primary",
  theme = "dark",
}: MarketingHeaderProps) {
  const dark = theme === "dark";

  return (
    <div className="fixed inset-x-0 top-0 z-50">
      <header
        className={[
          dark
            ? "mx-auto flex w-full items-center justify-between border-b border-white/[0.06] bg-[#080e1a]/92 px-5 py-3.5 shadow-[0_12px_30px_rgba(3,7,18,0.35)] backdrop-blur-xl"
            : "mx-auto flex w-full items-center justify-between border-b border-stone-200/80 bg-[#fffdf7]/92 px-5 py-3.5 shadow-[0_12px_30px_rgba(15,23,42,0.08)] backdrop-blur-xl",
          containerClassName,
        ].join(" ")}
      >
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#f5c542] text-[#080e1a] text-[10px] font-black tracking-tight">
            DH
          </div>
          <span className={dark ? "text-[14px] font-bold tracking-tight text-white" : "text-[14px] font-bold tracking-tight text-stone-900"}>DukaanHQ</span>
        </div>

        {userInitials ? (
          <ProfileMenu
            userInitials={userInitials}
            userName={userName}
            userEmail={userEmail}
            userAvatarUrl={userAvatarUrl}
            theme={dark ? "dark" : "light"}
          />
        ) : (
          <Link
            href={actionHref}
            className={
              actionVariant === "ghost"
                ? dark
                  ? "flex h-9 items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 text-[12px] font-semibold text-white/80 transition hover:bg-white/8 hover:text-white"
                  : "flex h-9 items-center justify-center gap-2 rounded-full border border-stone-200 bg-white px-4 text-[12px] font-semibold text-stone-700 transition hover:border-stone-300 hover:text-stone-950"
                : "flex h-9 items-center justify-center rounded-full bg-[#f5c542] px-4 text-[12px] font-black text-[#080e1a] transition hover:bg-[#f0bb2a]"
            }
          >
            {actionVariant === "ghost" ? <ChevronLeft className="h-4 w-4" /> : null}
            {actionLabel}
          </Link>
        )}
      </header>
    </div>
  );
}
