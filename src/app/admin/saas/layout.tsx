import { redirect } from "next/navigation";

import { SaasAdminShell } from "@/app/admin/saas/_components/saas-admin-shell";
import { getUserAppState } from "@/lib/auth/user-flow";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function SaasAdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const state = await getUserAppState(supabase);

  if (!state.user) {
    redirect("/auth/login");
  }

  if (!state.isSuperAdmin) {
    redirect("/");
  }

  return <SaasAdminShell>{children}</SaasAdminShell>;
}
