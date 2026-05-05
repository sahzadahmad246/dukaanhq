import type { Metadata } from "next";

import { LegalPageShell, LegalSection } from "@/app/_components/legal-page-shell";
import { LEGAL_SITE } from "@/lib/legal-site";

export const metadata: Metadata = {
  title: "About Us | DukaanHQ",
  description: "About DukaanHQ, a SaaS for electronics retail shops.",
};

export default function AboutPage() {
  return (
    <LegalPageShell
      eyebrow="Company"
      title="About DukaanHQ"
      description="DukaanHQ helps electronics shops manage billing, inventory, staff, and customer workflows from one simple workspace."
    >
      <LegalSection title="Who We Are">
        <p>{LEGAL_SITE.brandName} is built for electronics retailers who need fast billing, practical inventory control, professional invoices, and shop operations that work well on mobile.</p>
      </LegalSection>

      <LegalSection title="What We Provide">
        <p>Our service includes inventory management, invoice creation, PDF invoices, staff access, public shop pages, WhatsApp invoice automation, EMI reminder workflows, and subscription-based shop access depending on the selected plan.</p>
      </LegalSection>

      <LegalSection title="Business Details">
        <p>Brand name: {LEGAL_SITE.brandName}</p>
        <p>Registered business name: {LEGAL_SITE.legalBusinessName}</p>
        {LEGAL_SITE.supportAddress ? <p>Registered address: {LEGAL_SITE.supportAddress}</p> : null}
      </LegalSection>
    </LegalPageShell>
  );
}

