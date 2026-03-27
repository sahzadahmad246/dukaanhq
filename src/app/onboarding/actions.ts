"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import type { OnboardingActionState } from "@/app/onboarding/state";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const workingDayValues = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

const tenDigitPhone = z.string().regex(/^\d{10}$/, "Enter a valid 10-digit mobile number.");

const onboardingSchema = z.object({
  shopName: z.string().min(2, "Shop name is required."),
  legalName: z.string().optional(),
  slug: z
    .string()
    .min(3, "Slug must be at least 3 characters.")
    .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers, and hyphens only."),
  phone: tenDigitPhone,
  email: z.email("Enter a valid business email."),
  whatsapp: z.union([z.literal(""), tenDigitPhone]),
  logoUrl: z.url().optional().or(z.literal("")),
  addressLine1: z.string().min(4, "Address line 1 is required."),
  addressLine2: z.string().optional(),
  city: z.string().min(2, "City is required."),
  state: z.string().min(2, "State is required."),
  postalCode: z.string().min(4, "Postal code is required."),
  country: z.string().min(2, "Country is required."),
  latitude: z.coerce.number(),
  longitude: z.coerce.number(),
  gstNumber: z.string().optional(),
  invoicePrefix: z
    .string()
    .min(2, "Invoice prefix is required.")
    .max(10, "Keep invoice prefix short.")
    .regex(/^[A-Z0-9-]+$/, "Invoice prefix should use capital letters, numbers, or hyphens."),
  currency: z.string().min(3, "Currency is required.").max(5),
  taxMode: z.enum(["exclusive", "inclusive", "no_tax"]),
  invoiceFooter: z.string().optional(),
  openingTime: z.string().min(1, "Opening time is required."),
  closingTime: z.string().min(1, "Closing time is required."),
  workingDays: z.array(z.enum(workingDayValues)).min(1, "Select at least one working day."),
});

function getString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function createShopAction(
  _prevState: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "error", message: "You must be signed in to create a shop.", fieldErrors: {} };
  }

  const parsed = onboardingSchema.safeParse({
    shopName: getString(formData, "shopName"),
    legalName: getString(formData, "legalName"),
    slug: getString(formData, "slug"),
    phone: getString(formData, "phone"),
    email: getString(formData, "email"),
    whatsapp: getString(formData, "whatsapp"),
    logoUrl: getString(formData, "logoUrl"),
    addressLine1: getString(formData, "addressLine1"),
    addressLine2: getString(formData, "addressLine2"),
    city: getString(formData, "city"),
    state: getString(formData, "state"),
    postalCode: getString(formData, "postalCode"),
    country: getString(formData, "country"),
    latitude: getString(formData, "latitude"),
    longitude: getString(formData, "longitude"),
    gstNumber: getString(formData, "gstNumber"),
    invoicePrefix: getString(formData, "invoicePrefix").toUpperCase(),
    currency: getString(formData, "currency").toUpperCase(),
    taxMode: getString(formData, "taxMode"),
    invoiceFooter: getString(formData, "invoiceFooter"),
    openingTime: getString(formData, "openingTime"),
    closingTime: getString(formData, "closingTime"),
    workingDays: formData.getAll("workingDays").map(String),
  });

  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Please check the form and try again.",
      fieldErrors: Object.fromEntries(
        Object.entries(fieldErrors).map(([key, value]) => [key, value?.[0] ?? ""]),
      ),
    };
  }

  const values = parsed.data;

  const { data: existingMembership } = await supabase
    .from("shop_members")
    .select("shop_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingMembership) {
    return {
      status: "error",
      message: "This account is already linked to a shop. Multi-shop switching can be added later.",
      fieldErrors: {},
    };
  }

  const adminSupabase = createSupabaseAdminClient();
  const { data: existingSlug } = await (adminSupabase ?? supabase)
    .from("shops")
    .select("id")
    .eq("slug", values.slug)
    .maybeSingle();

  if (existingSlug) {
    return {
      status: "error",
      message: "This shop slug is already taken.",
      fieldErrors: { slug: "Slug is already taken." },
    };
  }

  const { data: shop, error: shopError } = await supabase
    .from("shops")
    .insert({
      name: values.shopName,
      legal_name: values.legalName || null,
      slug: values.slug,
      category: "electronics_mobile",
      logo_url: values.logoUrl || null,
      phone: values.phone,
      email: values.email,
      whatsapp: values.whatsapp || null,
      gst_number: values.gstNumber || null,
      address_line_1: values.addressLine1,
      address_line_2: values.addressLine2 || null,
      city: values.city,
      state: values.state,
      postal_code: values.postalCode,
      country: values.country,
      latitude: values.latitude,
      longitude: values.longitude,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (shopError || !shop) {
    if (shopError?.code === "23505") {
      return {
        status: "error",
        message: "This shop slug is already taken.",
        fieldErrors: { slug: "Slug is already taken." },
      };
    }

    return {
      status: "error",
      message: shopError?.message ?? "Could not create the shop. Check SQL setup first.",
      fieldErrors: {},
    };
  }

  const { error: memberError } = await supabase.from("shop_members").insert({
    shop_id: shop.id,
    user_id: user.id,
    role: "owner",
    invited_by: user.id,
  });

  if (memberError) {
    return { status: "error", message: memberError.message, fieldErrors: {} };
  }

  const { error: settingsError } = await supabase.from("shop_settings").insert({
    shop_id: shop.id,
    invoice_prefix: values.invoicePrefix,
    currency: values.currency,
    tax_mode: values.taxMode,
    invoice_footer: values.invoiceFooter || null,
    opening_time: values.openingTime,
    closing_time: values.closingTime,
    working_days: values.workingDays,
    onboarding_completed: true,
  });

  if (settingsError) {
    return { status: "error", message: settingsError.message, fieldErrors: {} };
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ role: "owner" })
    .eq("id", user.id);

  if (profileError) {
    return { status: "error", message: profileError.message, fieldErrors: {} };
  }

  await supabase.from("onboarding_drafts").delete().eq("user_id", user.id);

  redirect("/dashboard?toast=shop-created");
}
