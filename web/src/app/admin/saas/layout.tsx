import { requireSaasAdmin } from "@/lib/admin/auth";

import { SaasAdminShell } from "@/app/admin/saas/_components/saas-admin-shell";

export default async function SaasAdminLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = await requireSaasAdmin();
  const userName = profile.full_name || user.email?.split("@")[0] || "Admin";
  const userEmail = profile.email || user.email || "";
  const userRole = profile.role;
  const userAvatarUrl = profile.avatar_url ?? null;

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
