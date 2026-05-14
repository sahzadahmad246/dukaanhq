"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { isValidInvoiceFooter, normalizeInvoiceFooter } from "@/lib/invoice-footer";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function requireSuperadmin(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "superadmin") {
    redirect("/");
  }

  return { user, profile };
}

function getAdminSupabase() {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    throw new Error("Supabase admin client is not configured.");
  }
  return supabase;
}

export async function updateSaasSettingsAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  await requireSuperadmin(supabase);

  const trial_enabled = formData.get("trial_enabled") === "on";
  const trial_duration_days = Math.min(
    365,
    Math.max(1, Math.floor(Number(formData.get("trial_duration_days")) || 30)),
  );
  const plan_display_name = String(formData.get("plan_display_name") ?? "").trim() || "DukaanHQ Pro";
  const plan_price_rupees = Number(formData.get("plan_price_rupees"));
  const plan_price_paise = Math.round((Number.isFinite(plan_price_rupees) ? plan_price_rupees : 499) * 100);

  const { error } = await supabase
    .from("saas_platform_settings")
    .update({
      trial_enabled,
      trial_duration_days,
      plan_display_name,
      plan_price_paise,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);

  if (error) {
    redirect(`/admin/saas?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/saas");
  redirect("/admin/saas?saved=1");
}

const PlanBenefitSchema = z.object({
  plan_id: z.string().uuid(),
  display_name: z.string().trim().min(2, "Plan name is required."),
  tagline: z.string().trim().min(2, "Short tagline is required."),
  description: z.string().trim().optional().default(""),
  monthly_price_rupees: z.coerce.number().min(0, "Monthly price must be 0 or more."),
  yearly_price_rupees: z.coerce.number().min(0, "Yearly price must be 0 or more."),
  monthly_provider_product_id: z.string().trim().optional().default(""),
  yearly_provider_product_id: z.string().trim().optional().default(""),
  monthly_provider_trial_days: z.coerce.number().int().min(0).max(365).default(0),
  yearly_provider_trial_days: z.coerce.number().int().min(0).max(365).default(0),
  monthly_discount_enabled: z.boolean(),
  monthly_discount_type: z.enum(["none", "percent", "amount"]),
  monthly_discount_value: z.coerce.number().min(0).default(0),
  monthly_discount_ends_at: z.string().trim().optional().default(""),
  yearly_discount_enabled: z.boolean(),
  yearly_discount_type: z.enum(["none", "percent", "amount"]),
  yearly_discount_value: z.coerce.number().min(0).default(0),
  yearly_discount_ends_at: z.string().trim().optional().default(""),
  support_level: z.enum(["standard", "priority"]),
  is_active: z.boolean(),
});

function rupeesToPaise(value: number) {
  return Math.round(value * 100);
}

function discountedPaise(
  regularPricePaise: number,
  enabled: boolean,
  discountType: "none" | "percent" | "amount",
  discountValue: number,
) {
  if (!enabled || discountType === "none" || discountValue <= 0) {
    return null;
  }

  if (discountType === "percent") {
    const bounded = Math.min(99, discountValue);
    return Math.max(0, Math.round(regularPricePaise * (1 - bounded / 100)));
  }

  return Math.max(0, regularPricePaise - rupeesToPaise(discountValue));
}

function normalizeDateInput(value: string) {
  if (!value) {
    return null;
  }

  const date = new Date(`${value}T23:59:59.999+05:30`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

const fixedPlanLimits = {
  starter: {
    products: 25,
    invoices_per_month: 50,
    staff: 1,
    whatsapp_messages_per_month: 0,
  },
  growth: {
    products: 250,
    invoices_per_month: 500,
    staff: 3,
    whatsapp_messages_per_month: 0,
  },
  pro: {
    products: null,
    invoices_per_month: null,
    staff: null,
    whatsapp_messages_per_month: null,
  },
} as const;

const fixedPlanEntitlements = {
  starter: {
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
  growth: {
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
  pro: {
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
} as const;

const defaultPlanFeatures = {
  starter: [
    "Add up to 25 inventory products",
    "Create 50 invoices per month",
    "Basic PDF invoice",
    "Loan/EMI details inside bills",
    "Standard support",
  ],
  growth: [
    "Everything in Starter",
    "Add up to 250 inventory products",
    "Create 500 invoices per month",
    "Invite staff to manage the shop",
    "Customer signature and shop stamp on PDF invoices",
    "Public shop page",
    "Priority support",
  ],
  pro: [
    "Everything in Growth",
    "Unlimited products and invoices",
    "WhatsApp invoice sending",
    "Auto EMI WhatsApp reminders",
    "All current and future advanced features",
    "Priority support",
  ],
} as const;

export async function updateSaasPlanAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  await requireSuperadmin(supabase);

  const parsed = PlanBenefitSchema.safeParse({
    plan_id: formData.get("plan_id"),
    display_name: formData.get("display_name"),
    tagline: formData.get("tagline"),
    description: formData.get("description"),
    monthly_price_rupees: formData.get("monthly_price_rupees"),
    yearly_price_rupees: formData.get("yearly_price_rupees"),
    monthly_provider_product_id: formData.get("monthly_provider_product_id"),
    yearly_provider_product_id: formData.get("yearly_provider_product_id"),
    monthly_provider_trial_days: formData.get("monthly_provider_trial_days") || "0",
    yearly_provider_trial_days: formData.get("yearly_provider_trial_days") || "0",
    monthly_discount_enabled: formData.get("monthly_discount_enabled") === "on",
    monthly_discount_type: formData.get("monthly_discount_type") || "none",
    monthly_discount_value: formData.get("monthly_discount_value") || "0",
    monthly_discount_ends_at: formData.get("monthly_discount_ends_at") || "",
    yearly_discount_enabled: formData.get("yearly_discount_enabled") === "on",
    yearly_discount_type: formData.get("yearly_discount_type") || "none",
    yearly_discount_value: formData.get("yearly_discount_value") || "0",
    yearly_discount_ends_at: formData.get("yearly_discount_ends_at") || "",
    support_level: formData.get("support_level") || "standard",
    is_active: formData.get("is_active") === "on",
  });

  if (!parsed.success) {
    redirect(`/admin/saas/plans?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid plan details.")}`);
  }

  const { data: currentPlan, error: planReadError } = await supabase
    .from("saas_plans")
    .select("id, code")
    .eq("id", parsed.data.plan_id)
    .maybeSingle();

  if (planReadError || !currentPlan) {
    redirect(`/admin/saas/plans?error=${encodeURIComponent(planReadError?.message ?? "Plan not found.")}`);
  }

  const code = String(currentPlan.code) as keyof typeof fixedPlanLimits;
  if (!Object.prototype.hasOwnProperty.call(fixedPlanLimits, code)) {
    redirect("/admin/saas/plans?error=Only%20Starter,%20Growth,%20and%20Pro%20plans%20can%20be%20edited.");
  }

  const { error: planUpdateError } = await supabase
    .from("saas_plans")
    .update({
      display_name: parsed.data.display_name,
      tagline: parsed.data.tagline,
      description: parsed.data.description || null,
      support_level: parsed.data.support_level,
      is_active: parsed.data.is_active,
      limits: fixedPlanLimits[code],
      entitlements: fixedPlanEntitlements[code],
      features: defaultPlanFeatures[code],
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.plan_id);

  if (planUpdateError) {
    redirect(`/admin/saas/plans?error=${encodeURIComponent(planUpdateError.message)}`);
  }

  const monthlyRegular = rupeesToPaise(parsed.data.monthly_price_rupees);
  const yearlyRegular = rupeesToPaise(parsed.data.yearly_price_rupees);
  const priceRows = [
    {
      plan_id: parsed.data.plan_id,
      interval: "month",
      interval_count: 1,
      regular_price_paise: monthlyRegular,
      discounted_price_paise: discountedPaise(
        monthlyRegular,
        parsed.data.monthly_discount_enabled,
        parsed.data.monthly_discount_type,
        parsed.data.monthly_discount_value,
      ),
      discount_enabled: parsed.data.monthly_discount_enabled,
      discount_type: parsed.data.monthly_discount_enabled ? parsed.data.monthly_discount_type : "none",
      discount_value: parsed.data.monthly_discount_enabled ? parsed.data.monthly_discount_value : 0,
      discount_ends_at: parsed.data.monthly_discount_enabled ? normalizeDateInput(parsed.data.monthly_discount_ends_at) : null,
      provider: "dodo",
      provider_product_id: parsed.data.monthly_provider_product_id || null,
      provider_trial_days: parsed.data.monthly_provider_trial_days,
      currency: "INR",
      is_active: parsed.data.is_active,
      updated_at: new Date().toISOString(),
    },
    {
      plan_id: parsed.data.plan_id,
      interval: "year",
      interval_count: 1,
      regular_price_paise: yearlyRegular,
      discounted_price_paise: discountedPaise(
        yearlyRegular,
        parsed.data.yearly_discount_enabled,
        parsed.data.yearly_discount_type,
        parsed.data.yearly_discount_value,
      ),
      discount_enabled: parsed.data.yearly_discount_enabled,
      discount_type: parsed.data.yearly_discount_enabled ? parsed.data.yearly_discount_type : "none",
      discount_value: parsed.data.yearly_discount_enabled ? parsed.data.yearly_discount_value : 0,
      discount_ends_at: parsed.data.yearly_discount_enabled ? normalizeDateInput(parsed.data.yearly_discount_ends_at) : null,
      provider: "dodo",
      provider_product_id: parsed.data.yearly_provider_product_id || null,
      provider_trial_days: parsed.data.yearly_provider_trial_days,
      currency: "INR",
      is_active: parsed.data.is_active,
      updated_at: new Date().toISOString(),
    },
  ];

  const { error: priceError } = await supabase.from("saas_plan_prices").upsert(priceRows, {
    onConflict: "plan_id,interval,interval_count",
  });

  if (priceError) {
    redirect(`/admin/saas/plans?error=${encodeURIComponent(priceError.message)}`);
  }

  revalidatePath("/admin/saas");
  revalidatePath("/admin/saas/plans");
  redirect("/admin/saas/plans?saved=1");
}

export async function setShopStatusAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  await requireSuperadmin(supabase);

  const shop_id = String(formData.get("shop_id") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();

  if (!shop_id) {
    redirect("/admin/saas/shops?error=Missing%20shop%20id");
  }

  const { error } = await supabase.rpc("superadmin_set_shop_status", { p_shop_id: shop_id, p_status: status });
  if (error) {
    redirect(`/admin/saas/shops/${encodeURIComponent(shop_id)}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/saas/shops");
  revalidatePath(`/admin/saas/shops/${shop_id}`);
  redirect(`/admin/saas/shops/${encodeURIComponent(shop_id)}?saved=1`);
}

export async function superadminExtendSubscriptionAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  await requireSuperadmin(supabase);

  const shopId = String(formData.get("shop_id") ?? "").trim();
  const days = Math.min(3650, Math.max(1, Math.floor(Number(formData.get("days")) || 365)));

  if (!shopId) {
    redirect("/admin/saas/subscriptions?error=Missing%20shop%20id");
  }

  const admin = getAdminSupabase();
  const validUntil = new Date();
  validUntil.setDate(validUntil.getDate() + days);

  const { error } = await admin.from("shop_entitlements").upsert(
    {
      shop_id: shopId,
      billing_status: "active",
      subscription_valid_until: validUntil.toISOString(),
      access_expires_at: validUntil.toISOString(),
      grace_ends_at: null,
      locked_reason: null,
      cancel_at_period_end: false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "shop_id" },
  );

  if (error) {
    redirect(`/admin/saas/subscriptions?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/saas/subscriptions");
  redirect("/admin/saas/subscriptions?saved=1");
}

export async function superadminLockSubscriptionAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  await requireSuperadmin(supabase);

  const shopId = String(formData.get("shop_id") ?? "").trim();
  if (!shopId) {
    redirect("/admin/saas/subscriptions?error=Missing%20shop%20id");
  }

  const admin = getAdminSupabase();
  const { error } = await admin
    .from("shop_entitlements")
    .update({
      billing_status: "locked",
      locked_reason: "superadmin_locked",
      updated_at: new Date().toISOString(),
    })
    .eq("shop_id", shopId);

  if (error) {
    redirect(`/admin/saas/subscriptions?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/saas/subscriptions");
  redirect("/admin/saas/subscriptions?saved=1");
}

const SuperadminUpdateShopSchema = z.object({
  shop_id: z.string().uuid(),
  name: z.string().trim().min(1, "Shop name is required."),
  phone: z.string().trim().min(1, "Phone is required."),
  email: z.string().trim().email("Enter a valid email."),
  address_line_1: z.string().trim().min(1, "Address line 1 is required."),
  address_line_2: z.string().trim().optional().default(""),
  city: z.string().trim().min(1, "City is required."),
  state: z.string().trim().min(1, "State is required."),
  postal_code: z.string().trim().min(1, "Postal code is required."),
  logo_url: z.string().trim().optional().default(""),
  invoice_prefix: z.string().trim().min(1, "Invoice prefix is required."),
  invoice_footer: z
    .string()
    .refine(isValidInvoiceFooter, "Add up to 7 footer lines, with 140 characters per line.")
    .transform(normalizeInvoiceFooter)
    .optional()
    .default(""),
});

export async function superadminUpdateShopInfoAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  await requireSuperadmin(supabase);

  const parsed = SuperadminUpdateShopSchema.safeParse({
    shop_id: formData.get("shop_id"),
    name: formData.get("name"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    address_line_1: formData.get("address_line_1"),
    address_line_2: formData.get("address_line_2"),
    city: formData.get("city"),
    state: formData.get("state"),
    postal_code: formData.get("postal_code"),
    logo_url: formData.get("logo_url"),
    invoice_prefix: formData.get("invoice_prefix"),
    invoice_footer: formData.get("invoice_footer"),
  });

  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid shop details.";
    redirect(`/admin/saas/shops/${encodeURIComponent(String(formData.get("shop_id") ?? ""))}?error=${encodeURIComponent(msg)}`);
  }

  const admin = getAdminSupabase();

  const { error: shopErr } = await admin
    .from("shops")
    .update({
      name: parsed.data.name,
      phone: parsed.data.phone,
      email: parsed.data.email,
      address_line_1: parsed.data.address_line_1,
      address_line_2: parsed.data.address_line_2 || null,
      city: parsed.data.city,
      state: parsed.data.state,
      postal_code: parsed.data.postal_code,
      logo_url: parsed.data.logo_url || null,
    })
    .eq("id", parsed.data.shop_id);

  if (shopErr) {
    redirect(`/admin/saas/shops/${parsed.data.shop_id}?error=${encodeURIComponent(shopErr.message)}`);
  }

  const { error: settingsErr } = await admin
    .from("shop_settings")
    .update({
      invoice_prefix: parsed.data.invoice_prefix,
      invoice_footer: parsed.data.invoice_footer || null,
      updated_at: new Date().toISOString(),
    })
    .eq("shop_id", parsed.data.shop_id);

  if (settingsErr) {
    redirect(`/admin/saas/shops/${parsed.data.shop_id}?error=${encodeURIComponent(settingsErr.message)}`);
  }

  revalidatePath(`/admin/saas/shops/${parsed.data.shop_id}`);
  redirect(`/admin/saas/shops/${parsed.data.shop_id}?saved=1`);
}
