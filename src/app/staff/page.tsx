import { WorkspaceShell } from "@/app/_components/workspace-shell";
import { StaffManager } from "@/app/staff/_components/staff-manager";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildShopRoute } from "@/lib/shop-routes";
import { getWorkspaceData } from "@/lib/workspace/get-workspace-data";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type StaffMemberRow = {
  id: string;
  user_id: string;
  role: string;
  status: "ACTIVE" | "SUSPENDED";
  email: string | null;
  full_name: string | null;
  mobile_number: string | null;
  avatar_url: string | null;
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

export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<{ shop?: string }>;
}) {
  const query = await searchParams;
  const { user, profile, shop } = await getWorkspaceData({ requireOwner: true });
  const adminSupabase = createSupabaseAdminClient() ?? (await createSupabaseServerClient());

  if (shop?.slug) {
    if (!query.shop) {
      redirect(buildShopRoute(shop.slug, "staff"));
    }

    if (query.shop !== shop.slug) {
      redirect(buildShopRoute(shop.slug, "staff"));
    }
  }

  let members: StaffMemberRow[] = [];
  let invitations: InviteRow[] = [];

  if (shop) {
    const [{ data: memberRows }, { data: invitationRows }] = await Promise.all([
      adminSupabase
        .from("shop_members")
        .select("id, user_id, role, status, email, full_name, mobile_number, avatar_url, joined_at")
        .eq("shop_id", shop.id)
        .in("role", ["owner", "staff"])
        .order("created_at", { ascending: true }),
      adminSupabase
        .from("shop_member_invitations")
        .select("id, email, full_name, role, status, created_at, expires_at")
        .eq("shop_id", shop.id)
        .eq("status", "PENDING")
        .order("created_at", { ascending: false }),
    ]);

    const membersList = (memberRows ?? []) as StaffMemberRow[];

    // Fetch profile data for all members to get avatar_url and fill missing names/emails
    const allUserIds = membersList.map((m) => m.user_id);
    let profileMap = new Map<string, { full_name: string | null; email: string | null; avatar_url: string | null }>();

    if (allUserIds.length > 0) {
      const { data: profiles } = await adminSupabase
        .from("profiles")
        .select("id, full_name, email, avatar_url")
        .in("id", allUserIds);

      profileMap = new Map(
        (profiles ?? []).map((entry) => [
          entry.id,
          { full_name: entry.full_name, email: entry.email, avatar_url: entry.avatar_url },
        ])
      );
    }

    members = membersList.map((member) => {
      const fallback = profileMap.get(member.user_id);
      return {
        ...member,
        full_name: member.full_name ?? fallback?.full_name ?? null,
        email: member.email ?? fallback?.email ?? null,
        avatar_url: member.avatar_url ?? fallback?.avatar_url ?? null,
      };
    });

    invitations = (invitationRows ?? []) as InviteRow[];
  }

  return (
    <WorkspaceShell
      title="Staff"
      activeNav="staff"
      shopName={shop?.name ?? "Shop"}
      shopSlug={shop?.slug ?? null}
      shopAddress={[shop?.address_line_1, shop?.city, shop?.state].filter(Boolean).join(", ")}
      shopLogoUrl={shop?.logo_url ?? null}
      ownerName={profile?.full_name ?? user.user_metadata.full_name ?? "Shop owner"}
      ownerEmail={profile?.email ?? user.email ?? ""}
      ownerRole="owner"
      saasAdminHref={profile?.role === "superadmin" ? "/admin/saas" : undefined}
      userAvatarUrl={profile?.avatar_url ?? user.user_metadata.avatar_url ?? user.user_metadata.picture ?? null}
    >
      <StaffManager members={members} invitations={invitations} />
    </WorkspaceShell>
  );
}
