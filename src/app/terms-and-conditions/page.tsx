import type { Metadata } from "next";

import { LegalPageShell, LegalSection } from "@/app/_components/legal-page-shell";
import { LEGAL_SITE } from "@/lib/legal-site";

export const metadata: Metadata = {
  title: "Terms and Conditions | DukaanHQ",
  description: "Terms and Conditions for using DukaanHQ SaaS.",
};

export default function TermsAndConditionsPage() {
  return (
    <LegalPageShell
      eyebrow="Legal"
      title="Terms and Conditions"
      description="These terms explain how shops, owners, and staff may use DukaanHQ."
    >
      <LegalSection title="1. About DukaanHQ">
        <p>{LEGAL_SITE.brandName} is a SaaS product for electronics retailers to manage inventory, invoices, staff access, and related shop operations.</p>
        <p>These terms apply between you and {LEGAL_SITE.legalBusinessName} when you access or use DukaanHQ.</p>
      </LegalSection>

      <LegalSection title="2. Account and Shop Access">
        <p>You are responsible for keeping your login secure and for all activity under your account. Shop owners are responsible for staff invitations, staff permissions, invoice data, product data, and customer data entered into the service.</p>
      </LegalSection>

      <LegalSection title="3. Subscriptions and Billing">
        <p>DukaanHQ is offered through subscription plans shown on the pricing page. Prices are displayed inclusive of applicable taxes unless clearly stated otherwise.</p>
        <p>Access to paid features depends on your active plan, billing status, and any trial or grace period attached to your account or shop.</p>
      </LegalSection>

      <LegalSection title="4. Acceptable Use">
        <p>You must not misuse the service, attempt unauthorized access, upload illegal content, send spam, interfere with service security, or use DukaanHQ for unlawful business activity.</p>
      </LegalSection>

      <LegalSection title="5. Customer and Invoice Data">
        <p>You control the data you enter into DukaanHQ. You confirm that you have the right to store customer, invoice, product, and staff information in the service.</p>
      </LegalSection>

      <LegalSection title="6. Service Availability">
        <p>We work to keep DukaanHQ reliable, but we do not guarantee uninterrupted access. Maintenance, third-party outages, payment-provider issues, or internet problems may affect availability.</p>
      </LegalSection>

      <LegalSection title="7. Termination">
        <p>We may suspend or restrict access if subscription payment fails, the trial expires, these terms are violated, or continued use creates legal, security, or operational risk.</p>
      </LegalSection>

      <LegalSection title="8. Contact">
        <p>
          For questions about these terms, contact us at{" "}
          <a className="font-semibold text-stone-950 underline" href={`mailto:${LEGAL_SITE.supportEmail}`}>
            {LEGAL_SITE.supportEmail}
          </a>
          .
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}

