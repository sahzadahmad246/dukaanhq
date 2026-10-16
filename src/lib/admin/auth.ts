import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// Authenticate before creating an elevated client. Request-scoped caching never
// shares an admin session, role, or tenant data between users.
export const requireSaasAdmin = cache(async () => {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/auth/login");
  const { data: profile, error: profileError } = await supabase.from("profiles")
    .select("id, role, full_name, email, avatar_url").eq("id", user.id).maybeSingle();
  if (profileError || profile?.role !== "superadmin") redirect("/");
  return { user, profile, supabase };
});

export const getAdminReadClient = cache(async () => {
  await requireSaasAdmin();
  const admin = createSupabaseAdminClient();
  if (!admin) throw new Error("Admin management requires a server-side Supabase service role key.");
  return admin;
});
