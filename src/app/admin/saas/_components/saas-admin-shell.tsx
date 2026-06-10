"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import {
  ArrowLeft,
  BarChart3,
  Building2,
  CreditCard,
  Home,
  LayoutDashboard,
  LifeBuoy,
  Settings,
  ShieldCheck,
  Tags,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { SaasAdminToastListener } from "@/app/admin/saas/_components/saas-admin-toast-listener";
import { SaasAdminDrawer } from "@/app/admin/saas/_components/saas-admin-drawer";

type HeaderConfig = {
  title?: string;
  backHref?: string;
  rightContent?: React.ReactNode;
};

const HeaderContext = createContext<{
  config: HeaderConfig;
  setConfig: (config: HeaderConfig) => void;
}>({
  config: {},
  setConfig: () => {},
});

export function SaasAdminHeader({ title, backHref, rightContent }: HeaderConfig) {
  const { setConfig } = useContext(HeaderContext);
  useEffect(() => {
    setConfig({ title, backHref, rightContent });
    return () => setConfig({});
  }, [title, backHref, rightContent, setConfig]);
  return null;
}

const navItems = [
  { href: "/admin/saas", label: "Home", icon: LayoutDashboard, exact: true },
  { href: "/admin/saas/shops", label: "Shops", icon: Building2 },
  { href: "/admin/saas/plans", label: "Plans", icon: Tags },
  { href: "/admin/saas/subscriptions", label: "Subscriptions", icon: CreditCard },
  { href: "/admin/saas/reports", label: "Reports", icon: BarChart3, disabled: true },
  { href: "/admin/saas/support", label: "Support", icon: LifeBuoy, disabled: true },
  { href: "/admin/saas/settings", label: "Settings", icon: Settings, disabled: true },
];

const primaryBottomItems = [
  { href: "/admin/saas", label: "Home", icon: LayoutDashboard, exact: true },
  { href: "/admin/saas/shops", label: "Shops", icon: Building2 },
  { href: "/admin/saas/plans", label: "Plans", icon: Tags },
];

function isActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SaasAdminShell({
  children,
  userName,
  userEmail,
  userRole,
  userAvatarUrl,
}: {
  children: React.ReactNode;
  userName: string;
  userEmail: string;
  userRole: string;
  userAvatarUrl: string | null;
}) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [scrollDirection, setScrollDirection] = useState<"idle" | "up" | "down">("idle");
  const [headerConfig, setHeaderConfig] = useState<HeaderConfig>({});

  // Scroll-aware hide for bottom nav (match shop shell behavior)
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

  const showBottomNav = scrollDirection !== "down";

  return (
    <HeaderContext.Provider value={{ config: headerConfig, setConfig: setHeaderConfig }}>
      <div className="min-h-screen bg-[#f6f7f9] text-stone-950">
        <SaasAdminToastListener />

        <SaasAdminDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          userName={userName}
          userEmail={userEmail}
          userRole={userRole}
          userAvatarUrl={userAvatarUrl}
        />

      {/* Desktop left sidebar (lg+) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-stone-200 bg-white lg:flex lg:flex-col">
        <div className="flex h-20 items-center gap-3 border-b border-stone-200 px-5">
          <div className="grid h-11 w-11 place-items-center rounded-lg bg-stone-950 text-white">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-base font-bold text-stone-950">DukaanHQ Admin</p>
            <p className="text-xs font-medium text-stone-500">SaaS control center</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.href, item.exact);

            if (item.disabled) {
              return (
                <div
                  key={item.href}
                  className="flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-semibold text-stone-400"
                  title="Coming soon"
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  <span className="truncate">{item.label}</span>
                </div>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-semibold transition",
                  active ? "bg-stone-950 text-white" : "text-stone-700 hover:bg-stone-100 hover:text-stone-950",
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-stone-200 p-3">
          <Link
            href="/"
            className="flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-semibold text-stone-700 transition hover:bg-stone-100 hover:text-stone-950"
          >
            <Home className="h-4 w-4" aria-hidden="true" />
            App home
          </Link>
        </div>
      </aside>

      <div className="lg:pl-72">
        {/* Mobile top slim header (lg:hidden). Profile is now in bottom nav. */}
        <header className="sticky top-0 z-20 border-b border-stone-200 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
          <div className="flex items-center gap-3">
            {headerConfig.backHref ? (
              <Link
                href={headerConfig.backHref}
                className="flex h-8 w-8 items-center justify-center rounded-full text-stone-600 hover:bg-stone-100"
                aria-label="Go back"
              >
                <ArrowLeft className="h-5 w-5" />
              </Link>
            ) : (
              <Link href="/admin/saas" className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5" aria-hidden="true" />
              </Link>
            )}

            <div className="flex-1 text-center min-w-0">
              <span className="text-sm font-bold text-stone-950 truncate inline-block max-w-[180px] align-middle">
                {headerConfig.title || "SaaS Admin"}
              </span>
              {!headerConfig.title && (
                <span className="block text-[10px] font-medium leading-none text-stone-500">
                  Platform control center
                </span>
              )}
            </div>

            {headerConfig.rightContent ? (
              <div className="shrink-0">{headerConfig.rightContent}</div>
            ) : null}
          </div>
        </header>

        {/* Desktop header for custom pages (e.g. shop detail) */}
        {headerConfig.title && headerConfig.backHref && (
          <div className="hidden lg:flex items-center gap-3 border-b border-stone-200 bg-white px-6 py-3">
            <Link
              href={headerConfig.backHref}
              className="flex h-8 w-8 items-center justify-center rounded-full text-stone-600 hover:bg-stone-100"
              aria-label="Go back"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="flex-1 text-center min-w-0">
              <span className="text-base font-semibold text-stone-950 truncate max-w-md inline-block align-middle">
                {headerConfig.title}
              </span>
            </div>

            {headerConfig.rightContent ? (
              <div className="shrink-0">{headerConfig.rightContent}</div>
            ) : null}
          </div>
        )}

        <main className="mx-auto w-full max-w-7xl px-4 py-6 pb-24 sm:px-6 lg:px-8 lg:py-8 lg:pb-8">
          {children}
        </main>
      </div>

      {/* Bottom nav for mobile / small screens (primary 3 + profile pic as 4th) */}
      <nav
        className={[
          "fixed inset-x-0 bottom-0 z-40 border-t border-stone-200 bg-white/96 backdrop-blur transition-transform duration-300 lg:hidden",
          showBottomNav ? "translate-y-0" : "translate-y-full",
        ].join(" ")}
      >
        <div className="mx-auto flex w-full max-w-7xl items-center justify-around px-2 py-2">
          {primaryBottomItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.href, item.exact);
            return (
              <Link
                key={item.href}
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

          {/* 4th item: logged-in user profile pic -> opens right sidebar drawer */}
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="flex min-w-16 flex-col items-center gap-1 text-xs"
            aria-label="Open admin menu"
          >
            <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border-2 border-stone-200 bg-stone-100">
              {userAvatarUrl ? (
                <Image
                  src={userAvatarUrl}
                  alt={userName}
                  width={40}
                  height={40}
                  className="h-10 w-10 rounded-full object-cover"
                />
              ) : (
                <span className="text-sm font-semibold text-stone-700">
                  {userName.slice(0, 1).toUpperCase()}
                </span>
              )}
            </span>
            <span className="text-stone-500">You</span>
          </button>
        </div>
      </nav>
      </div>
    </HeaderContext.Provider>
  );
}
