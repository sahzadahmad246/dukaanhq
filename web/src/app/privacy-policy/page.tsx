import type { Metadata } from "next";

import { LegalPageShell, LegalSection } from "@/app/_components/legal-page-shell";
import { LEGAL_SITE } from "@/lib/legal-site";

export const metadata: Metadata = {
  title: "Privacy Policy | DukaanHQ",
  description: "Privacy Policy for DukaanHQ.",
};

export default function PrivacyPolicyPage() {
  return (
    <LegalPageShell
      eyebrow="Privacy"
      title="Privacy Policy"
      description="This policy explains what information DukaanHQ collects and how it is used to provide the service."
    >
      <LegalSection title="Information We Collect">
        <p>We collect account details such as name, email, profile image, shop details, staff details, product data, customer details, invoice data, payment status, and usage information needed to operate DukaanHQ.</p>
      </LegalSection>

      <LegalSection title="How We Use Information">
        <p>We use information to provide billing, inventory, shop management, subscription access, support, security, analytics, and product improvements.</p>
      </LegalSection>

      <LegalSection title="Payments">
        <p>Payments are processed by third-party payment providers such as Dodo Payments. DukaanHQ does not store full card, UPI mandate, or banking credentials.</p>
      </LegalSection>

      <LegalSection title="Data Sharing">
        <p>We share data only with service providers needed to operate DukaanHQ, comply with law, process payments, send communications, or protect the service from misuse.</p>
      </LegalSection>

      <LegalSection title="Data Security">
        <p>We use technical and operational safeguards to protect information. No internet service can guarantee absolute security, so users should also protect account access and devices.</p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          For privacy requests, email{" "}
          <a className="font-semibold text-stone-950 underline" href={`mailto:${LEGAL_SITE.supportEmail}`}>
            {LEGAL_SITE.supportEmail}
          </a>
          .
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}
