"use server";

import { assertDodoPriceMatches, changeDodoSubscriptionPlan, retrieveDodoSubscription } from "@/lib/dodo/client";
import { effectivePlanAmount, type ExpectedDodoPrice } from "@/lib/dodo/price-validation";
import { requireSaasAdmin } from "@/lib/admin/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { isValidInvoiceFooter, normalizeInvoiceFooter } from "@/lib/invoice-footer";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function getAdminSupabase() {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    throw new Error("Supabase admin client is not configured.");
  }
  return supabase;
}

export async function updateSaasSettingsAction(formData: FormData) {
  await requireSaasAdmin();

  const parsed = z.object({
    trial_enabled: z.boolean(),
    trial_duration_days: z.coerce.number().int().min(1).max(365),
    plan_display_name: z.string().trim().min(2).max(100),
    plan_price_rupees: z.coerce.number().min(0).max(1000000),
  }).safeParse({ trial_enabled: formData.get("trial_enabled") === "on", trial_duration_days: formData.get("trial_duration_days"), plan_display_name: formData.get("plan_display_name"), plan_price_rupees: formData.get("plan_price_rupees") });
  if (!parsed.success) redirect(`/admin/saas/settings?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid settings")}`);
  const admin = getAdminSupabase();
  const { error } = await admin.from("saas_platform_settings").upsert({
    id: 1, trial_enabled: parsed.data.trial_enabled, trial_duration_days: parsed.data.trial_duration_days,
    plan_display_name: parsed.data.plan_display_name, plan_price_paise: Math.round(parsed.data.plan_price_rupees * 100),
    updated_at: new Date().toISOString(),
  });
  if (error) redirect(`/admin/saas/settings?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/admin/saas", "layout");
  redirect("/admin/saas/settings?saved=1");
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
  await requireSaasAdmin();
  const supabase = getAdminSupabase();

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

  const code = String(currentPlan.code) as keyof typeof fixedPlanEntitlements;
  if (!Object.prototype.hasOwnProperty.call(fixedPlanEntitlements, code)) {
    redirect("/admin/saas/plans?error=Only%20Starter,%20Growth,%20and%20Pro%20plans%20can%20be%20edited.");
  }

  const limits: Record<string, number | null> = {};
  for (const key of ["products", "invoices_per_month", "staff", "whatsapp_messages_per_month"]) {
    const raw = String(formData.get(`limit_${key}`) ?? "").trim();
    if (raw === "") limits[key] = null;
    else {
      const parsedLimit = z.coerce.number().int().min(0).max(100000000).safeParse(raw);
      if (!parsedLimit.success) redirect(`/admin/saas/plans?error=Limits%20must%20be%20nonnegative%20whole%20numbers`);
      limits[key] = parsedLimit.data;
    }
  }
  const entitlements = Object.fromEntries(Object.keys(fixedPlanEntitlements[code]).map(key => [key, formData.get(`entitlement_${key}`) === "on"]));
  const features = String(formData.get("features") ?? "").split(/\r?\n/).map(line => line.trim()).filter(Boolean).slice(0, 30);
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

  try {
    await Promise.all(priceRows.filter(row => row.is_active && row.provider_product_id).map(row =>
      assertDodoPriceMatches({ ...row, interval: row.interval as "month" | "year" }),
    ));
  } catch (error) {
    redirect(`/admin/saas/plans?error=${encodeURIComponent(error instanceof Error ? error.message : "Could not verify Dodo pricing.")}`);
  }

  const { error: planUpdateError } = await supabase
    .from("saas_plans")
    .update({
      display_name: parsed.data.display_name,
      tagline: parsed.data.tagline,
      description: parsed.data.description || null,
      support_level: parsed.data.support_level,
      is_active: parsed.data.is_active,
      limits,
      entitlements,
      features: features.length ? features : defaultPlanFeatures[code],
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.plan_id);

  if (planUpdateError) {
    redirect(`/admin/saas/plans?error=${encodeURIComponent(planUpdateError.message)}`);
  }

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
  await requireSaasAdmin();

  const shop_id = String(formData.get("shop_id") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();

  if (!shop_id) {
    redirect("/admin/saas/shops?error=Missing%20shop%20id");
  }

  if (!z.string().uuid().safeParse(shop_id).success || !["active", "inactive", "suspended"].includes(status)) {
    redirect("/admin/saas/shops?error=Invalid%20shop%20or%20status");
  }
  const admin = getAdminSupabase();
  if (status === "active") {
    const { data: previous, error: previousError } = await admin.from("shops").select("status").eq("id", shop_id).maybeSingle();
    if (previousError || !previous) redirect(`/admin/saas/shops/${shop_id}?error=Could%20not%20read%20shop%20status`);
    if (previous.status === "suspended") {
      // Older shop-suspension RPCs also suspended owners. Recover those owners
      // while preserving staff suspensions, whose original cause is unknown.
      const { error: ownerError } = await admin.from("shop_members").update({ status: "ACTIVE", suspended_at: null })
        .eq("shop_id", shop_id).eq("role", "owner").eq("status", "SUSPENDED");
      if (ownerError) redirect(`/admin/saas/shops/${shop_id}?error=${encodeURIComponent(ownerError.message)}`);
    }
  }
  const { data, error } = await admin.from("shops").update({ status }).eq("id", shop_id).select("id").maybeSingle();
  if (error || !data) redirect(`/admin/saas/shops/${encodeURIComponent(shop_id)}?error=${encodeURIComponent(error?.message ?? "Shop not found")}`);
  revalidatePath("/admin/saas");

  revalidatePath("/admin/saas/shops");
  revalidatePath(`/admin/saas/shops/${shop_id}`);
  redirect(`/admin/saas/shops/${encodeURIComponent(shop_id)}?saved=1`);
}

export async function superadminExtendSubscriptionAction(formData: FormData) {
  await requireSaasAdmin();

  const shopId = String(formData.get("shop_id") ?? "").trim();
  const days = Math.min(3650, Math.max(1, Math.floor(Number(formData.get("days")) || 365)));

  if (!z.string().uuid().safeParse(shopId).success) {
    redirect("/admin/saas/subscriptions?error=Invalid%20shop%20id");
  }

  const admin = getAdminSupabase();
  if (!z.string().uuid().safeParse(shopId).success || !Number.isInteger(Number(formData.get("days"))) || Number(formData.get("days")) < 1 || Number(formData.get("days")) > 3650) {
    redirect("/admin/saas/subscriptions?error=Enter%20between%201%20and%203650%20days");
  }
  const { data: existing, error: readError } = await admin.from("shop_entitlements")
    .select("subscription_valid_until, access_expires_at, grace_ends_at, trial_ends_at").eq("shop_id", shopId).maybeSingle();
  if (readError) redirect(`/admin/saas/subscriptions?error=${encodeURIComponent(readError.message)}`);
  const basis = Math.max(Date.now(), new Date(existing?.subscription_valid_until ?? 0).getTime() || 0, new Date(existing?.trial_ends_at ?? 0).getTime() || 0, new Date(existing?.access_expires_at ?? 0).getTime() || 0, new Date(existing?.grace_ends_at ?? 0).getTime() || 0);
  const validUntil = new Date(basis + days * 86400000);

  const { error } = await admin.from("shop_entitlements").upsert(
    {
      shop_id: shopId,
      billing_status: "active",
      subscription_valid_until: validUntil.toISOString(),
      access_expires_at: validUntil.toISOString(),
      grace_ends_at: null,
      locked_reason: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "shop_id" },
  );

  if (error) {
    redirect(`/admin/saas/subscriptions?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/saas", "layout");
  redirect("/admin/saas/subscriptions?saved=1");
}

export async function superadminLockSubscriptionAction(formData: FormData) {
  await requireSaasAdmin();

  const shopId = String(formData.get("shop_id") ?? "").trim();
  if (!z.string().uuid().safeParse(shopId).success) {
    redirect("/admin/saas/subscriptions?error=Invalid%20shop%20id");
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

  revalidatePath("/admin/saas", "layout");
  redirect("/admin/saas/subscriptions?saved=1");
}

export async function superadminUnlockSubscriptionAction(formData: FormData) {
  await requireSaasAdmin();

  const shopId = String(formData.get("shop_id") ?? "").trim();
  if (!z.string().uuid().safeParse(shopId).success) {
    redirect("/admin/saas/subscriptions?error=Invalid%20shop%20id");
  }

  const admin = getAdminSupabase();
  const { data: entitlement, error: entitlementError } = await admin
    .from("shop_entitlements")
    .select("trial_ends_at, subscription_valid_until, access_expires_at")
    .eq("shop_id", shopId)
    .maybeSingle<{
      trial_ends_at: string | null;
      subscription_valid_until: string | null;
      access_expires_at: string | null;
    }>();

  if (entitlementError) redirect(`/admin/saas/subscriptions?error=${encodeURIComponent(entitlementError.message)}`);
  const nowMs = Date.now();
  const trialEndsMs = entitlement?.trial_ends_at ? new Date(entitlement.trial_ends_at).getTime() : 0;
  const validUntil = entitlement?.subscription_valid_until ?? entitlement?.access_expires_at ?? null;
  if (!entitlement || (trialEndsMs <= nowMs && (validUntil ? new Date(validUntil).getTime() <= nowMs : Boolean(entitlement.trial_ends_at)))) {
    redirect("/admin/saas/subscriptions?error=Access%20has%20expired.%20Extend%20access%20before%20unlocking.");
  }
  const nextStatus = trialEndsMs > nowMs ? "trialing" : "active";

  const { error } = await admin
    .from("shop_entitlements")
    .update({
      billing_status: nextStatus,
      subscription_valid_until: nextStatus === "active" ? validUntil : entitlement?.subscription_valid_until ?? null,
      access_expires_at: validUntil,
      grace_ends_at: null,
      locked_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq("shop_id", shopId);

  if (error) {
    redirect(`/admin/saas/subscriptions?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/saas", "layout");
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
  logo_url: z.union([z.literal(""), z.url().refine(value => value.startsWith("https://"), "Logo URL must use HTTPS.")]).optional().default(""),
  invoice_prefix: z.string().trim().min(1, "Invoice prefix is required."),
  invoice_footer: z
    .string()
    .refine(isValidInvoiceFooter, "Add up to 7 footer lines, with 140 characters per line.")
    .transform(normalizeInvoiceFooter)
    .optional()
    .default(""),
});

export async function superadminUpdateShopInfoAction(formData: FormData) {
  await requireSaasAdmin();

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

  revalidatePath("/admin/saas", "layout");
  redirect(`/admin/saas/shops/${parsed.data.shop_id}?saved=1`);
}

export async function setAdminStaffStatusAction(formData: FormData) {
  await requireSaasAdmin();
  const parsed = z.object({ shop_id: z.string().uuid(), member_id: z.string().uuid(), status: z.enum(["ACTIVE", "SUSPENDED"]) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/admin/saas/shops?error=Invalid%20staff%20request");
  const { shop_id, member_id, status } = parsed.data;
  // Only staff can be changed here; owner access cannot be removed accidentally.
  const { data, error } = await getAdminSupabase().from("shop_members").update({ status, suspended_at: status === "SUSPENDED" ? new Date().toISOString() : null })
    .eq("id", member_id).eq("shop_id", shop_id).eq("role", "staff").select("id").maybeSingle();
  if (error || !data) redirect(`/admin/saas/shops/${shop_id}?tab=team&error=${encodeURIComponent(error?.message ?? "Staff member not found")}`);
  revalidatePath("/admin/saas", "layout");
  redirect(`/admin/saas/shops/${shop_id}?tab=team&saved=1`);
}

export async function setAdminShopPlanAction(formData: FormData) {
  await requireSaasAdmin();
  const parsed = z.object({ shop_id: z.string().uuid(), plan_id: z.string().uuid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/admin/saas/shops?error=Choose%20a%20valid%20shop%20and%20plan");
  const { shop_id, plan_id } = parsed.data;
  const admin = getAdminSupabase();
  const { data: plan, error: planError } = await admin.from("saas_plans").select("id").eq("id", plan_id).eq("is_active", true).maybeSingle();
  if (planError || !plan) redirect(`/admin/saas/shops/${shop_id}?tab=access&error=Plan%20is%20not%20available`);
  const { data, error } = await admin.from("shop_entitlements").update({ plan_id, updated_at: new Date().toISOString() }).eq("shop_id", shop_id).select("shop_id").maybeSingle();
  if (error || !data) redirect(`/admin/saas/shops/${shop_id}?tab=access&error=${encodeURIComponent(error?.message ?? "Create shop access before assigning a plan")}`);
  revalidatePath("/admin/saas", "layout");
  redirect(`/admin/saas/shops/${shop_id}?tab=access&saved=1`);
}

export async function scheduleAdminPriceCorrectionAction(formData: FormData) {
  await requireSaasAdmin();
  const parsed = z.object({ shop_id: z.string().uuid(), price_id: z.string().uuid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/admin/saas/subscriptions/health?error=Invalid%20subscription%20request");
  const admin = getAdminSupabase(), { shop_id, price_id } = parsed.data;
  const [subscriptionResult, priceResult] = await Promise.all([
    admin.from("shop_subscriptions").select("id, plan_id, price_id, provider, provider_subscription_id").eq("shop_id", shop_id).maybeSingle(),
    admin.from("saas_plan_prices").select("id, plan_id, provider_product_id, currency, interval, interval_count, regular_price_paise, discounted_price_paise, discount_enabled, discount_ends_at, is_active").eq("id", price_id).maybeSingle<ExpectedDodoPrice & { id: string; plan_id: string }>(),
  ]);
  const subscription = subscriptionResult.data, price = priceResult.data;
  if (subscriptionResult.error || priceResult.error || !subscription || !price || !price.is_active || subscription.provider !== "dodo" || !subscription.provider_subscription_id || subscription.price_id !== price.id || subscription.plan_id !== price.plan_id) {
    redirect("/admin/saas/subscriptions/health?error=Could%20not%20verify%20the%20shop%20and%20its%20current%20plan");
  }
  try {
    const current = await retrieveDodoSubscription(subscription.provider_subscription_id);
    if (current.status !== "active" || current.cancel_at_next_billing_date === true) throw new Error("Only an active subscription with renewal enabled can be corrected here. Review its provider status first.");
    if (current.quantity !== 1 || (Array.isArray(current.addons) && current.addons.length > 0) || current.discount_id || (Array.isArray(current.discounts) && current.discounts.length > 0)) {
      throw new Error("This subscription has a custom quantity, add-ons, or discounts. Review its agreed pricing in Dodo before changing it.");
    }
    const renewal = current.next_billing_date ? new Date(current.next_billing_date).getTime() : NaN;
    if (!Number.isFinite(renewal) || renewal <= Date.now()) throw new Error("The provider has not returned a future renewal date. Review this subscription in Dodo.");
    // The shared client verifies the target product before this POST. Never use
    // an immediate proration or charge endpoint to correct a configuration error.
    const response = await changeDodoSubscriptionPlan(subscription.provider_subscription_id, {
      product_id: price.provider_product_id ?? "", quantity: 1,
      proration_billing_mode: "do_not_bill", effective_at: "next_billing_date", on_payment_failure: "prevent_change",
      metadata: { dukaanhq_shop_id: shop_id, dukaanhq_target_price_id: price.id, dukaanhq_reason: "admin_price_correction" },
    }, price);
    const { error: auditError } = await admin.from("subscription_events").insert({
      shop_id, subscription_id: subscription.id, provider: "dodo", event_type: "ADMIN_SCHEDULED_PRICE_CORRECTION",
      processed_status: "scheduled", processed_message: "Verified plan price correction scheduled for the next billing date; no immediate charge.",
      payload: { response, price_id: price.id, target_amount_minor: effectivePlanAmount(price), target_currency: price.currency, effective_at: "next_billing_date", next_billing_date: current.next_billing_date },
    });
    if (auditError) throw new Error("Dodo accepted the schedule, but the local audit record could not be saved. Check the provider before retrying.");
  } catch (error) {
    redirect(`/admin/saas/subscriptions/health?error=${encodeURIComponent(error instanceof Error ? error.message : "Could not schedule the price correction.")}`);
  }
  revalidatePath("/admin/saas", "layout");
  redirect("/admin/saas/subscriptions/health?scheduled=1");
}
