import { MarketingHeader } from "@/app/_components/marketing-header";
import { PublicPricingBoard, type PublicPlan } from "@/app/pricing/_components/public-pricing-board";
import { getUserAppState } from "@/lib/auth/user-flow";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const fallbackPlans: PublicPlan[] = [
  {
    id: "starter",
    code: "starter",
    display_name: "Starter",
    tagline: "Run basic billing and inventory.",
    description: "For small shops starting with inventory and invoice control.",
    features: [
      "Add up to 25 inventory products",
      "Create 50 invoices per month",
      "Basic PDF invoice",
      "Loan/EMI details inside bills",
      "Standard support",
    ],
    limits: { products: 25, invoices_per_month: 50, staff: 1 },
    entitlements: {
      inventory: true,
      invoices: true,
      basic_pdf_invoice: true,
      loan_emi_details: true,
      customer_signature: false,
      shop_stamp: false,
      staff_access: false,
      public_shop_page: false,
      whatsapp_invoice_sending: false,
      auto_emi_reminders: false,
    },
    support_level: "standard",
    saas_plan_prices: [
      { interval: "month", regular_price_paise: 49900, discounted_price_paise: null, discount_enabled: false, discount_type: "none", discount_value: 0, discount_ends_at: null },
      { interval: "year", regular_price_paise: 499000, discounted_price_paise: null, discount_enabled: false, discount_type: "none", discount_value: 0, discount_ends_at: null },
    ],
  },
  {
    id: "growth",
    code: "growth",
    display_name: "Growth",
    tagline: "Add team access and professional invoices.",
    description: "For daily shop operations with staff, branding, and higher limits.",
    features: [
      "Everything in Starter",
      "Add up to 250 inventory products",
      "Create 500 invoices per month",
      "Invite staff to manage the shop",
      "Customer signature and shop stamp on PDF invoices",
      "Public shop page",
      "Priority support",
    ],
    limits: { products: 250, invoices_per_month: 500, staff: 3 },
    entitlements: {
      inventory: true,
      invoices: true,
      basic_pdf_invoice: true,
      loan_emi_details: true,
      customer_signature: true,
      shop_stamp: true,
      staff_access: true,
      public_shop_page: true,
      whatsapp_invoice_sending: false,
      auto_emi_reminders: false,
    },
    support_level: "priority",
    saas_plan_prices: [
      { interval: "month", regular_price_paise: 99900, discounted_price_paise: null, discount_enabled: false, discount_type: "none", discount_value: 0, discount_ends_at: null },
      { interval: "year", regular_price_paise: 999000, discounted_price_paise: null, discount_enabled: false, discount_type: "none", discount_value: 0, discount_ends_at: null },
    ],
  },
  {
    id: "pro",
    code: "pro",
    display_name: "Pro",
    tagline: "Unlock automation and unlimited scale.",
    description: "For serious shops that want WhatsApp automation, EMI reminders, and no product or invoice limits.",
    features: [
      "Everything in Growth",
      "Unlimited products and invoices",
      "WhatsApp invoice sending",
      "Auto EMI WhatsApp reminders",
      "All current and future advanced features",
      "Priority support",
    ],
    limits: { products: null, invoices_per_month: null, staff: null },
    entitlements: {
      inventory: true,
      invoices: true,
      basic_pdf_invoice: true,
      loan_emi_details: true,
      customer_signature: true,
      shop_stamp: true,
      staff_access: true,
      public_shop_page: true,
      whatsapp_invoice_sending: true,
      auto_emi_reminders: true,
    },
    support_level: "priority",
    saas_plan_prices: [
      { interval: "month", regular_price_paise: 149900, discounted_price_paise: null, discount_enabled: false, discount_type: "none", discount_value: 0, discount_ends_at: null },
      { interval: "year", regular_price_paise: 1499000, discounted_price_paise: null, discount_enabled: false, discount_type: "none", discount_value: 0, discount_ends_at: null },
    ],
  },
];

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function normalizePlan(row: PublicPlan): PublicPlan {
  return {
    ...row,
    features: Array.isArray(row.features) ? row.features : [],
    limits: row.limits ?? {},
    entitlements: row.entitlements ?? {},
    saas_plan_prices: Array.isArray(row.saas_plan_prices) ? row.saas_plan_prices : [],
  };
}

export default async function PricingPage() {
  const supabase = await createSupabaseServerClient();
  const state = await getUserAppState(supabase);

  const { data } = await supabase
    .from("saas_plans")
    .select("id, code, display_name, tagline, description, features, limits, entitlements, support_level, saas_plan_prices(interval, regular_price_paise, discounted_price_paise, discount_enabled, discount_type, discount_value, discount_ends_at)")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  const plans = data && data.length > 0 ? (data as PublicPlan[]).map(normalizePlan) : fallbackPlans;
  const displayName = state.profile?.full_name ?? state.user?.user_metadata.full_name ?? state.user?.email ?? "";
  const userEmail = state.profile?.email ?? state.user?.email ?? "";
  const initials = displayName ? getInitials(displayName) : null;

  return (
    <main className="min-h-screen bg-[#fffdf7] pt-[72px] text-stone-950">
      <MarketingHeader
        containerClassName="max-w-7xl"
        userInitials={state.user ? initials || "DH" : null}
        userName={state.user ? displayName : null}
        userEmail={state.user ? userEmail : null}
        userAvatarUrl={state.profile?.avatar_url ?? state.user?.user_metadata.avatar_url ?? state.user?.user_metadata.picture ?? null}
        actionHref="/auth/login"
        actionLabel="Sign in"
        theme="light"
      />

      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <PublicPricingBoard plans={plans} />
      </div>
    </main>
  );
}
