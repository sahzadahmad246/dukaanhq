"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function updateSaasSettingsAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
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
