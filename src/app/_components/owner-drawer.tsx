"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect } from "react";
import {
  ArrowLeft,
  BadgePercent,
  ChartColumn,
  ChevronRight,
  CircleHelp,
  ReceiptText,
  Settings2,
  ShoppingBag,
  SquareUserRound,
  Tickets,
  Users,
} from "lucide-react";

type DrawerSection = {
  title: string;
  items: Array<{
    href: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: string;
  }>;
};

const drawerSections: DrawerSection[] = [
  {
    title: "Operations",
    items: [
      { href: "/staff", label: "Staff and roles", icon: Users },
      { href: "/inventory", label: "Inventory catalog", icon: ShoppingBag },
      { href: "/billing", label: "Billing and invoices", icon: ReceiptText },
    ],
  },
  {
    title: "Growth",
    items: [
      { href: "/dashboard", label: "Offers and campaigns", icon: BadgePercent, badge: "Soon" },
      { href: "/dashboard", label: "Reports and analytics", icon: ChartColumn },
    ],
  },
  {
    title: "Support",
    items: [
      { href: "/profile", label: "Owner profile", icon: SquareUserRound },
      { href: "/dashboard", label: "Help centre", icon: CircleHelp },
      { href: "/dashboard", label: "Support tickets", icon: Tickets },
      { href: "/settings", label: "Shop settings", icon: Settings2 },
    ],
  },
];

export function OwnerDrawer({
  open,
  onClose,
  shopName,
  shopAddress,
  shopLogoUrl,
  ownerName,
  ownerEmail,
  ownerRole,
  userAvatarUrl,
}: {
  open: boolean;
  onClose: () => void;
  shopName: string;
  shopAddress: string;
  shopLogoUrl: string | null;
  ownerName: string;
  ownerEmail: string;
  ownerRole: string;
  userAvatarUrl: string | null;
}) {
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
                aria-label="Close owner drawer"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>

              <div className="mt-3 flex items-start justify-between gap-5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="line-clamp-2 text-[1.7rem] leading-tight font-semibold tracking-tight text-stone-950">{shopName}</h2>
                    <ChevronRight className="mt-0.5 h-6 w-6 shrink-0 text-stone-500" />
                  </div>
                  <p className="mt-2 mb-4 text-base text-stone-500">{shopAddress || ownerEmail}</p>
                </div>

                <div className="relative shrink-0">
                  <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-full bg-stone-200 text-xl font-semibold text-white">
                    {userAvatarUrl ? (
                      <Image
                        src={userAvatarUrl}
                        alt={ownerName}
                        width={112}
                        height={112}
                        className="h-28 w-28 object-cover"
                      />
                    ) : shopLogoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={shopLogoUrl} alt={shopName} className="h-28 w-28 object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center rounded-full bg-stone-900">
                        <span>{shopName.slice(0, 1).toUpperCase()}</span>
                      </div>
                    )}
                  </div>
                  <div className="absolute bottom-0 right-0 flex h-11 w-11 items-center justify-center rounded-full border-4 border-white bg-white text-stone-900 shadow-sm">
                    <SquareUserRound className="h-4 w-4" />
                  </div>
                </div>
              </div>

              <div className="mt-0 -mx-5 flex items-center justify-between rounded-b-[1rem] bg-stone-950 px-5 py-4 text-white shadow-[0_12px_30px_rgba(15,23,42,0.18)]">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rotate-45 rounded-[2px] bg-blue-400" />
                  <span className="text-sm font-medium">{ownerName}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold capitalize">{ownerRole}</span>
                  <ChevronRight className="h-4 w-4 text-stone-300" />
                </div>
              </div>
            </div>
          </section>

          <section className="mt-4 grid grid-cols-3 gap-3 px-4">
            <Link href="/staff" className="rounded-[1.4rem] bg-white px-3 py-4 text-center shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
              <div className="text-lg font-semibold text-stone-950">04</div>
              <div className="mt-1 text-xs text-stone-600">Staff</div>
            </Link>
            <Link href="/billing" className="rounded-[1.4rem] bg-white px-3 py-4 text-center shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
              <div className="text-lg font-semibold text-stone-950">₹</div>
              <div className="mt-1 text-xs text-stone-600">Billing</div>
            </Link>
            <Link href="/inventory" className="rounded-[1.4rem] bg-white px-3 py-4 text-center shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
              <div className="text-lg font-semibold text-stone-950">#</div>
              <div className="mt-1 text-xs text-stone-600">Stock</div>
            </Link>
          </section>

          {drawerSections.map((section) => (
            <section key={section.title} className="mx-4 mt-4 rounded-[1.5rem] bg-white px-4 py-4 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
              <h3 className="text-sm font-semibold text-stone-950">{section.title}</h3>
              <div className="mt-2 divide-y divide-stone-100">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={`${section.title}-${item.label}`}
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
                      <div className="flex items-center gap-2">
                        {item.badge ? (
                          <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-rose-600">
                            {item.badge}
                          </span>
                        ) : null}
                        <ChevronRight className="h-4 w-4 text-stone-400" />
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </aside>
    </div>
  );
}
