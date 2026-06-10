"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  BarChart3,
  Building2,
  ChevronRight,
  CreditCard,
  Home,
  LifeBuoy,
  LogOut,
  Settings,
  ShieldCheck,
  Tags,
} from "lucide-react";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatShopMemberRole } from "@/lib/auth/display-role";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
  exact?: boolean;
};

const secondaryItems: NavItem[] = [
  { href: "/admin/saas/subscriptions", label: "Subscriptions", icon: CreditCard },
  { href: "/admin/saas/reports", label: "Reports", icon: BarChart3, disabled: true },
  { href: "/admin/saas/support", label: "Support", icon: LifeBuoy, disabled: true },
  { href: "/admin/saas/settings", label: "Settings", icon: Settings, disabled: true },
];

export function SaasAdminDrawer({
  open,
  onClose,
  userName,
  userEmail,
  userRole,
  userAvatarUrl,
}: {
  open: boolean;
  onClose: () => void;
  userName: string;
  userEmail: string;
  userRole: string;
  userAvatarUrl: string | null;
}) {
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut();
      window.location.replace("/");
    } catch (error) {
      console.error("Error signing out:", error);
    } finally {
      setIsLoggingOut(false);
    }
  };

  useEffect(() => {
    if (!open) {
      return;
    }
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [open]);

  return (
    <div
      className={[
        "fixed inset-0 z-50 transition",
        open ? "pointer-events-auto bg-stone-950/38" : "pointer-events-none bg-transparent",
      ].join(" ")}
      onClick={onClose}
    >
      <aside
        className={[
          "absolute right-0 top-0 flex h-full w-full flex-col bg-[#f7f8fb] shadow-[-18px_0_60px_rgba(15,23,42,0.16)] transition-transform duration-300 md:max-w-md lg:max-w-lg",
          open ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex-1 overflow-y-auto px-0 pb-6">
          <section className="px-0">
            <div className="overflow-hidden rounded-b-none bg-white px-5 pb-0 pt-3 shadow-[0_12px_40px_rgba(15,23,42,0.08)]">
              <button
                type="button"
                onClick={onClose}
                className="-ml-2 flex h-10 w-10 items-center justify-center rounded-full text-stone-700"
                aria-label="Close admin menu"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>

              <div className="mt-3 flex items-start justify-between gap-5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="line-clamp-2 text-[1.7rem] leading-tight font-semibold tracking-tight text-stone-950">
                      SaaS Admin
                    </h2>
                    <ChevronRight className="mt-0.5 h-6 w-6 shrink-0 text-stone-500" />
                  </div>
                  <p className="mt-2 mb-4 text-base text-stone-500">{userEmail}</p>
                </div>

                <div className="relative shrink-0">
                  <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-full bg-stone-200 text-xl font-semibold text-white">
                    {userAvatarUrl ? (
                      <Image
                        src={userAvatarUrl}
                        alt={userName}
                        width={112}
                        height={112}
                        className="h-28 w-28 object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center rounded-full bg-stone-900">
                        <ShieldCheck className="h-10 w-10 text-white" />
                      </div>
                    )}
                  </div>
                  <div className="absolute bottom-0 right-0 flex h-11 w-11 items-center justify-center rounded-full border-4 border-white bg-white text-stone-900 shadow-sm">
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                </div>
              </div>

              <div className="mt-0 -mx-5 flex items-center justify-between rounded-b-[1rem] bg-stone-950 px-5 py-4 text-white shadow-[0_12px_30px_rgba(15,23,42,0.18)]">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rotate-45 rounded-[2px] bg-blue-400" />
                  <span className="text-sm font-medium">{userName}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{formatShopMemberRole(userRole)}</span>
                  <ChevronRight className="h-4 w-4 text-stone-300" />
                </div>
              </div>
            </div>
          </section>

          <section className="mx-4 mt-4 rounded-[1.5rem] bg-white px-4 py-4 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
            <h3 className="text-sm font-semibold text-stone-950">Platform</h3>
            <div className="mt-2 divide-y divide-stone-100">
              {secondaryItems.map((item) => {
                const Icon = item.icon;
                if (item.disabled) {
                  return (
                    <div
                      key={item.href}
                      className="flex items-center justify-between gap-3 py-3 opacity-60"
                      title="Coming soon"
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-stone-100 text-stone-700">
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="text-sm font-medium text-stone-900">{item.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-rose-600">
                          Soon
                        </span>
                        <ChevronRight className="h-4 w-4 text-stone-400" />
                      </div>
                    </div>
                  );
                }
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    className="flex items-center justify-between gap-3 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-stone-100 text-stone-700">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="text-sm font-medium text-stone-900">{item.label}</span>
                    </div>
                    <ChevronRight className="h-4 w-4 text-stone-400" />
                  </Link>
                );
              })}
            </div>
          </section>

          <section className="mx-4 mt-4 rounded-[1.5rem] bg-white px-4 py-4 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
            <h3 className="text-sm font-semibold text-stone-950">Account</h3>
            <div className="mt-2 divide-y divide-stone-100">
              <Link
                href="/"
                onClick={onClose}
                className="flex items-center justify-between gap-3 py-3"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-stone-100 text-stone-700">
                    <Home className="h-4 w-4" />
                  </span>
                  <span className="text-sm font-medium text-stone-900">App home</span>
                </div>
                <ChevronRight className="h-4 w-4 text-stone-400" />
              </Link>
            </div>
          </section>

          <section className="mx-4 mt-4 mb-8">
            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="flex w-full items-center justify-center gap-2 rounded-[1.5rem] bg-rose-50 px-4 py-4 text-sm font-semibold text-rose-600 transition-colors hover:bg-rose-100 disabled:opacity-50"
            >
              <LogOut className="h-5 w-5" />
              {isLoggingOut ? "Logging out..." : "Log out"}
            </button>
          </section>
        </div>
      </aside>
    </div>
  );
}
