import Link from "next/link";

import { MarketingHeader } from "@/app/_components/marketing-header";
import { LEGAL_SITE } from "@/lib/legal-site";

type LegalPageShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
};

const links = [
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
  { href: "/terms-and-conditions", label: "Terms" },
  { href: "/privacy-policy", label: "Privacy" },
  { href: "/refund-policy", label: "Refunds" },
  { href: "/pricing", label: "Pricing" },
];

export function LegalPageShell({ eyebrow, title, description, children }: LegalPageShellProps) {
  return (
    <main className="min-h-screen bg-[#fffdf7] pt-[72px] text-stone-950">
      <MarketingHeader
        containerClassName="max-w-5xl"
        actionHref="/"
        actionLabel="Home"
        actionVariant="ghost"
        theme="light"
      />

      <section className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-6 lg:px-8">
        <p className="text-[11px] font-black uppercase tracking-[0.24em] text-[#a16207]">{eyebrow}</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-black tracking-tight text-stone-950 sm:text-5xl">{title}</h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-stone-600">{description}</p>
        <p className="mt-3 text-xs font-semibold text-stone-500">Last updated: {LEGAL_SITE.lastUpdated}</p>

        <div className="mt-8 grid gap-8 lg:grid-cols-[220px_1fr]">
          <aside className="h-fit rounded-2xl border border-stone-200 bg-white p-3">
            <nav className="flex flex-col gap-1">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="rounded-xl px-3 py-2 text-sm font-semibold text-stone-600 transition hover:bg-stone-50 hover:text-stone-950"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </aside>

          <article className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-7">
            <div className="legal-content space-y-6 text-sm leading-7 text-stone-700">{children}</div>
          </article>
        </div>
      </section>
    </main>
  );
}

export function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-lg font-black tracking-tight text-stone-950">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

