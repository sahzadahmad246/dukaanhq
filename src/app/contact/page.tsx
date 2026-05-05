import type { Metadata } from "next";

import { LegalPageShell, LegalSection } from "@/app/_components/legal-page-shell";
import { LEGAL_SITE } from "@/lib/legal-site";

export const metadata: Metadata = {
  title: "Contact Us | DukaanHQ",
  description: "Contact DukaanHQ support for product, billing, subscription, and account help.",
};

export default function ContactPage() {
  return (
    <LegalPageShell
      eyebrow="Support"
      title="Contact Us"
      description="Need help with DukaanHQ, subscriptions, billing, or your account? Reach our support team using the details below."
    >
      <LegalSection title="Business Details">
        <p>Brand name: {LEGAL_SITE.brandName}</p>
        <p>Registered business name: {LEGAL_SITE.legalBusinessName}</p>
        {LEGAL_SITE.supportAddress ? <p>Registered address: {LEGAL_SITE.supportAddress}</p> : null}
      </LegalSection>

      <LegalSection title="Support Contact">
        <p>
          Email:{" "}
          <a className="font-semibold text-stone-950 underline" href={`mailto:${LEGAL_SITE.supportEmail}`}>
            {LEGAL_SITE.supportEmail}
          </a>
        </p>
        <p>
          X DM:{" "}
          <a className="font-semibold text-stone-950 underline" href={LEGAL_SITE.supportXUrl} target="_blank" rel="noreferrer">
            x.com/shazcodes
          </a>
        </p>
        <p>Support hours: Monday to Saturday, 10:00 AM to 6:00 PM IST.</p>
      </LegalSection>

      <LegalSection title="Response Time">
        <p>We usually respond within 1 to 2 business days. For billing or subscription issues, include your registered email, shop name, and payment reference if available.</p>
      </LegalSection>
    </LegalPageShell>
  );
}
