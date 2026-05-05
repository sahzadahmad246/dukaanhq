import type { Metadata } from "next";

import { LegalPageShell, LegalSection } from "@/app/_components/legal-page-shell";
import { LEGAL_SITE } from "@/lib/legal-site";

export const metadata: Metadata = {
  title: "Refund Policy | DukaanHQ",
  description: "Refund and cancellation policy for DukaanHQ subscriptions.",
};

export default function RefundPolicyPage() {
  return (
    <LegalPageShell
      eyebrow="Billing"
      title="Refund Policy"
      description="This policy explains cancellations, refunds, and payment issues for DukaanHQ subscriptions."
    >
      <LegalSection title="Subscription Cancellations">
        <p>You can request cancellation of your DukaanHQ subscription by contacting support. Access may continue until the end of the paid billing period unless otherwise communicated.</p>
      </LegalSection>

      <LegalSection title="Refund Eligibility">
        <p>Subscription fees are generally non-refundable once a billing period has started.</p>
        <p>We may consider a refund if there was a duplicate charge, incorrect charge, technical issue that prevented access, or another billing error verified by our team.</p>
      </LegalSection>

      <LegalSection title="Refund Timeline">
        <p>Approved refunds are initiated to the original payment method. After initiation, the refund may take 5 to 10 business days to reflect depending on the bank, card network, UPI provider, or payment method.</p>
      </LegalSection>

      <LegalSection title="Failed or Pending Payments">
        <p>If a payment fails or remains pending, access may be limited according to your billing status. Any amount debited but not captured is normally reversed by the payment provider or bank as per their timelines.</p>
      </LegalSection>

      <LegalSection title="How to Request a Refund">
        <p>
          Email{" "}
          <a className="font-semibold text-stone-950 underline" href={`mailto:${LEGAL_SITE.supportEmail}`}>
            {LEGAL_SITE.supportEmail}
          </a>{" "}
          with your registered email, shop name, plan, payment date, amount, and payment reference.
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}

