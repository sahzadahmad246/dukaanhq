"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

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
  invoice_footer: z.string().trim().optional().default(""),
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
