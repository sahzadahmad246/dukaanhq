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

  const userName = state.profile?.full_name || state.user.email?.split("@")[0] || "Admin";
  const userEmail = state.profile?.email || state.user.email || "";
  const userRole = state.profile?.role || "superadmin";
  const userAvatarUrl = state.profile?.avatar_url ?? null;

  return (
    <SaasAdminShell
      userName={userName}
      userEmail={userEmail}
      userRole={userRole}
      userAvatarUrl={userAvatarUrl}
    >
      {children}
    </SaasAdminShell>
  );
}
