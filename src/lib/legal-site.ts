export const LEGAL_SITE = {
  brandName: "DukaanHQ",
  legalBusinessName: process.env.NEXT_PUBLIC_LEGAL_BUSINESS_NAME?.trim() || "DukaanHQ",
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "hello@dukaanhq.com",
  supportXUrl: process.env.NEXT_PUBLIC_SUPPORT_X_URL?.trim() || "https://x.com/shazcodes",
  supportAddress: process.env.NEXT_PUBLIC_SUPPORT_ADDRESS?.trim() || "",
  lastUpdated: "May 5, 2026",
};
