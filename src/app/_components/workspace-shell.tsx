"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import {
  House,
  Package,
  ReceiptText,
  Users,
} from "lucide-react";

import { DashboardToastListener } from "@/app/_components/dashboard-toast-listener";
import { OwnerDrawer } from "@/app/_components/owner-drawer";

type NavKey = "dashboard" | "billing" | "inventory" | "staff";

const navItems: Array<{
  href: string;
  key: NavKey;
  label: string;
  icon: typeof House;
}> = [
  { href: "/dashboard", key: "dashboard", label: "Home", icon: House },
  { href: "/billing", key: "billing", label: "Bill", icon: ReceiptText },
  { href: "/inventory", key: "inventory", label: "Inventory", icon: Package },
  { href: "/staff", key: "staff", label: "Staff", icon: Users },
];

export function WorkspaceShell({
  title,
  activeNav,
  shopName,
  shopAddress,
  shopLogoUrl,
  ownerName,
  ownerEmail,
  ownerRole,
  userAvatarUrl,
  hideHeader = false,
  children,
}: {
  title: string;
  activeNav: NavKey;
  shopName: string;
  shopAddress: string;
  shopLogoUrl: string | null;
  ownerName: string;
  ownerEmail: string;
  ownerRole: string;
  userAvatarUrl: string | null;
  hideHeader?: boolean;
  children: React.ReactNode;
}) {
  const [scrollDirection, setScrollDirection] = useState<"idle" | "up" | "down">("idle");
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    let lastY = window.scrollY;

    const onScroll = () => {
      const nextY = window.scrollY;
      const delta = nextY - lastY;

      if (nextY <= 8) {
        setScrollDirection("idle");
        lastY = nextY;
        return;
      }

      if (Math.abs(delta) < 6) {
        return;
      }

      setScrollDirection(delta > 0 ? "down" : "up");
      lastY = nextY;
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const showHeader = !hideHeader && scrollDirection !== "up";
  const showBottomNav = scrollDirection !== "down";
  const visibleNavItems = navItems.filter((item) => item.key !== "staff" || ownerRole === "owner");

  return (
    <main className="min-h-screen bg-stone-100 text-stone-950">
      <Suspense fallback={null}>
        <DashboardToastListener />
      </Suspense>
      <OwnerDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        shopName={shopName}
        shopAddress={shopAddress}
        shopLogoUrl={shopLogoUrl}
        ownerName={ownerName}
        ownerEmail={ownerEmail}
        ownerRole={ownerRole}
        userAvatarUrl={userAvatarUrl}
      />

      <div className="mx-auto min-h-screen w-full max-w-3xl bg-[#f7f8fb] shadow-[0_18px_80px_rgba(15,23,42,0.08)] lg:border-x lg:border-stone-200">
        {!hideHeader ? (
          <header
            className={[
              "fixed inset-x-0 top-0 z-40 transition-transform duration-300",
              showHeader ? "translate-y-0" : "-translate-y-full",
            ].join(" ")}
          >
            <div className="mx-auto flex w-full max-w-3xl items-center justify-between border-b border-stone-200 bg-[#f7f8fb]/95 px-4 py-3 text-stone-950 backdrop-blur">
              <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl bg-stone-900 text-sm font-semibold text-white">
                {shopLogoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={shopLogoUrl} alt={shopName} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-sm font-semibold">{shopName.slice(0, 1).toUpperCase()}</span>
                )}
              </div>
              <div className="text-sm font-semibold tracking-[0.18em] uppercase">{title}</div>
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-stone-900 text-sm font-semibold text-white"
                aria-label="Open owner menu"
              >
                {userAvatarUrl ? (
                  <Image
                    src={userAvatarUrl}
                    alt="Profile"
                    width={44}
                    height={44}
                    className="h-11 w-11 rounded-full object-cover"
                  />
                ) : (
                  <span>{shopName.slice(0, 1).toUpperCase()}</span>
                )}
              </button>
            </div>
          </header>
        ) : null}

        <div className={`mx-auto flex w-full max-w-3xl flex-col px-3 pb-28 ${hideHeader ? "pt-0" : "pt-20"}`}>
          {children}
        </div>

        <nav
          className={[
            "fixed inset-x-0 bottom-0 z-40 transition-transform duration-300",
            showBottomNav ? "translate-y-0" : "translate-y-full",
          ].join(" ")}
        >
          <div className="mx-auto flex w-full max-w-3xl items-center justify-around border-t border-stone-200 bg-white/96 px-3 py-3 backdrop-blur">
            {visibleNavItems.map((item) => {
              const Icon = item.icon;
              const active = item.key === activeNav;
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className="flex min-w-16 flex-col items-center gap-1 text-xs"
                >
                  <span
                    className={[
                      "flex h-10 w-10 items-center justify-center rounded-2xl transition",
                      active ? "bg-stone-950 text-white" : "bg-stone-100 text-stone-600",
                    ].join(" ")}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className={active ? "font-semibold text-stone-950" : "text-stone-500"}>
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </main>
  );
}
