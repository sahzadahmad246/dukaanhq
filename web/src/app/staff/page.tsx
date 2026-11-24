import { WorkspaceShell } from "@/app/_components/workspace-shell";
import { StaffManager } from "@/app/staff/_components/staff-manager";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildShopRoute } from "@/lib/shop-routes";
import { getWorkspaceData } from "@/lib/workspace/get-workspace-data";
import { Lock, Sparkles, Users } from "lucide-react";
import Link from "next/link";
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

function StaffLockedView({ shopSlug, planName }: { shopSlug: string | null | undefined; planName: string | null }) {
  return (
    <section className="grid gap-4">
      <div className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
        <div className="bg-stone-950 px-5 py-5 text-white">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10">
              <Lock className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-stone-300">Plan locked</p>
              <h1 className="mt-1 text-xl font-bold">Staff access is available on Growth and Pro</h1>
            </div>
          </div>
        </div>

        <div className="grid gap-4 px-5 py-5">
          <p className="text-sm leading-6 text-stone-600">
            {planName ?? "Your current plan"} keeps staff management locked. Upgrade to invite staff, manage roles, suspend access,
            and review staff activity for this shop.
          </p>

          <div className="grid gap-3">
            <div className="flex items-start gap-3 rounded-2xl bg-stone-50 px-4 py-4">
              <Users className="mt-0.5 h-5 w-5 text-stone-500" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold text-stone-900">Invite and manage team members</p>
                <p className="mt-1 text-xs leading-5 text-stone-500">Give staff access without sharing the owner login.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-2xl bg-stone-50 px-4 py-4">
              <Sparkles className="mt-0.5 h-5 w-5 text-stone-500" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold text-stone-900">Track staff activity</p>
                <p className="mt-1 text-xs leading-5 text-stone-500">See inventory movements and staff actions from one place.</p>
              </div>
            </div>
          </div>

          <Link
            href={shopSlug ? buildShopRoute(shopSlug, "subscription") : "/subscription"}
            className="flex h-12 items-center justify-center rounded-full bg-stone-950 px-5 text-sm font-semibold text-white transition hover:bg-stone-800"
          >
            View upgrade options
          </Link>
        </div>
      </div>
    </section>
  );
}

export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<{ shop?: string }>;
}) {
  const query = await searchParams;
  const { user, profile, shop } = await getWorkspaceData({ requireOwner: true });
  const adminSupabase = createSupabaseAdminClient() ?? (await createSupabaseServerClient());
  const supabase = await createSupabaseServerClient();

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
  let allowStaffAccess = true;
  let planName: string | null = null;

  if (shop) {
    const { data: entitlement } = await supabase
      .from("shop_entitlements")
      .select("saas_plans(display_name, entitlements)")
      .eq("shop_id", shop.id)
      .maybeSingle<{
        saas_plans:
          | { display_name: string; entitlements: Record<string, boolean> | null }
          | { display_name: string; entitlements: Record<string, boolean> | null }[]
          | null;
      }>();
    const plan = Array.isArray(entitlement?.saas_plans) ? entitlement?.saas_plans[0] : entitlement?.saas_plans;
    planName = plan?.display_name ?? null;
    allowStaffAccess = plan?.entitlements ? plan.entitlements.staff_access === true : true;

    if (!allowStaffAccess) {
      return (
        <WorkspaceShell
          title="Staff"
          activeNav="staff"
          shopName={shop.name}
          shopSlug={shop.slug ?? null}
          shopAddress={[shop.address_line_1, shop.city, shop.state].filter(Boolean).join(", ")}
          shopLogoUrl={shop.logo_url ?? null}
          ownerName={profile?.full_name ?? user.user_metadata.full_name ?? "Shop owner"}
          ownerEmail={profile?.email ?? user.email ?? ""}
          ownerRole="owner"
          saasAdminHref={profile?.role === "superadmin" ? "/admin/saas" : undefined}
          userAvatarUrl={profile?.avatar_url ?? user.user_metadata.avatar_url ?? user.user_metadata.picture ?? null}
        >
          <StaffLockedView shopSlug={shop.slug} planName={planName} />
        </WorkspaceShell>
      );
    }

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
