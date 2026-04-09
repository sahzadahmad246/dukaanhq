type PwaBranding = {
  name: string;
  shortName: string;
  description: string;
  iconUrl: string;
  startUrl: string;
};

const DEFAULT_BRANDING: PwaBranding = {
  name: "DukaanHQ",
  shortName: "DukaanHQ",
  description: "DukaanHQ is a SaaS for electronics shops to manage products, create bills, and generate invoices faster.",
  iconUrl: "/logo.png",
  startUrl: "/dashboard",
};

export async function getPwaBranding(): Promise<PwaBranding> {
  return DEFAULT_BRANDING;
}
