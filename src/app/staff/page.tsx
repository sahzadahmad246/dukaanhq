import { WorkspaceShell } from "@/app/_components/workspace-shell";
import { StaffManager } from "@/app/staff/_components/staff-manager";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getWorkspaceData } from "@/lib/workspace/get-workspace-data";

type StaffMemberRow = {
  id: string;
  user_id: string;
  role: string;
  status: "ACTIVE" | "SUSPENDED";
  email: string | null;
  full_name: string | null;
  mobile_number: string | null;
  joined_at: string | null;
};

type InviteRow = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  status: string;
  created_at: string;
  expires_at: string;
};

export default async function StaffPage() {
  const { user, profile, shop } = await getWorkspaceData({ requireOwner: true });
  const adminSupabase = createSupabaseAdminClient() ?? (await createSupabaseServerClient());

  let members: StaffMemberRow[] = [];
  let invitations: InviteRow[] = [];

  if (shop) {
    const [{ data: memberRows }, { data: invitationRows }] = await Promise.all([
      adminSupabase
        .from("shop_members")
        .select("id, user_id, role, status, email, full_name, mobile_number, joined_at")
        .eq("shop_id", shop.id)
        .in("role", ["owner", "admin"])
        .order("created_at", { ascending: true }),
      adminSupabase
        .from("shop_member_invitations")
        .select("id, email, full_name, role, status, created_at, expires_at")
        .eq("shop_id", shop.id)
        .eq("status", "PENDING")
        .order("created_at", { ascending: false }),
    ]);

    const membersList = (memberRows ?? []) as StaffMemberRow[];
    const missingProfileIds = membersList.filter((member) => !member.full_name || !member.email).map((member) => member.user_id);

    let profileMap = new Map<string, { full_name: string | null; email: string | null }>();

    if (missingProfileIds.length > 0) {
      const { data: profiles } = await adminSupabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", missingProfileIds);

      profileMap = new Map((profiles ?? []).map((entry) => [entry.id, { full_name: entry.full_name, email: entry.email }]));
    }

    members = membersList.map((member) => {
      const fallback = profileMap.get(member.user_id);
      return {
        ...member,
        full_name: member.full_name ?? fallback?.full_name ?? null,
        email: member.email ?? fallback?.email ?? null,
      };
    });

    invitations = (invitationRows ?? []) as InviteRow[];
  }

  return (
    <WorkspaceShell
      title="Staff"
      activeNav="staff"
      shopName={shop?.name ?? "Shop"}
      shopAddress={[shop?.address_line_1, shop?.city, shop?.state].filter(Boolean).join(", ")}
      shopLogoUrl={shop?.logo_url ?? null}
      ownerName={profile?.full_name ?? user.user_metadata.full_name ?? "Shop owner"}
      ownerEmail={profile?.email ?? user.email ?? ""}
      ownerRole="owner"
      userAvatarUrl={profile?.avatar_url ?? user.user_metadata.avatar_url ?? user.user_metadata.picture ?? null}
    >
      <StaffManager members={members} invitations={invitations} />
    </WorkspaceShell>
  );
}
