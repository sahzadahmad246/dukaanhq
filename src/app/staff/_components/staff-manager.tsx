"use client";

import { Loader2, Mail, ShieldCheck, UserPlus, Users } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { inviteStaffAction, updateStaffMemberAction, updateStaffStatusAction } from "@/app/staff/actions";

type StaffMember = {
  id: string;
  role: string;
  status: "ACTIVE" | "SUSPENDED";
  email: string | null;
  full_name: string | null;
  mobile_number: string | null;
  joined_at: string | null;
};

type StaffInvitation = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  status: string;
  created_at: string;
  expires_at: string;
};

export function StaffManager({
  members,
  invitations,
}: {
  members: StaffMember[];
  invitations: StaffInvitation[];
}) {
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"owner" | "admin">("admin");
  const [isInvitePending, startInviteTransition] = useTransition();
  const [pendingMemberId, setPendingMemberId] = useState<string | null>(null);

  const staffCount = useMemo(() => members.filter((member) => member.role !== "owner").length, [members]);
  const activeCount = useMemo(() => members.filter((member) => member.status === "ACTIVE" && member.role !== "owner").length, [members]);

  function submitInvite() {
    const formData = new FormData();
    formData.set("full_name", inviteName);
    formData.set("email", inviteEmail);
    formData.set("role", inviteRole);

    startInviteTransition(async () => {
      const result = await inviteStaffAction(formData);
      if (result.status === "success") {
        toast.success(result.message);
        setInviteName("");
        setInviteEmail("");
        setInviteRole("admin");
        setIsInviteOpen(false);
      } else {
        toast.error(result.message);
      }
    });
  }

  async function submitMemberUpdate(member: StaffMember, formData: FormData) {
    setPendingMemberId(member.id);
    const result = await updateStaffMemberAction(formData);
    if (result.status === "success") {
      toast.success(result.message);
    } else {
      toast.error(result.message);
    }
    setPendingMemberId(null);
  }

  async function submitStatusChange(member: StaffMember, nextStatus: "ACTIVE" | "SUSPENDED") {
    setPendingMemberId(member.id);
    const formData = new FormData();
    formData.set("member_id", member.id);
    formData.set("status", nextStatus);
    const result = await updateStaffStatusAction(formData);
    if (result.status === "success") {
      toast.success(result.message);
    } else {
      toast.error(result.message);
    }
    setPendingMemberId(null);
  }

  return (
    <>
      <section className="grid gap-4">
        <div className="rounded-3xl border border-blue-100 bg-white/95 px-4 py-5 shadow-[0_18px_50px_rgba(15,23,42,0.12)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-stone-500">Staff</p>
              <h1 className="mt-2 text-2xl font-semibold text-stone-950">Team access and permissions</h1>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                Invite staff by email, track invitation status, and control whether team members stay active or suspended.
              </p>
            </div>
            <Button type="button" onClick={() => setIsInviteOpen(true)} className="rounded-2xl bg-stone-950 px-4 text-white hover:bg-stone-800">
              <UserPlus className="h-4 w-4" />
              Invite Staff
            </Button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <SummaryCard label="Total Staff" value={String(staffCount)} icon={Users} />
            <SummaryCard label="Active Staff" value={String(activeCount)} icon={ShieldCheck} />
            <SummaryCard label="Pending Invites" value={String(invitations.filter((item) => item.status === "PENDING").length)} icon={Mail} />
          </div>
        </div>

        <div className="rounded-3xl border border-stone-200 bg-white/95 px-4 py-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <p className="text-xs uppercase tracking-[0.18em] text-stone-500">Permission Model</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <PermissionCard
              title="Full Permission"
              description="Owner-level access. Can manage staff, settings, billing, inventory, and reports across the whole shop."
            />
            <PermissionCard
              title="Full Access Staff"
              description="Can create bills, edit or delete bills, add stock, adjust stock, add or edit products, and view reports. Cannot manage staff."
            />
          </div>
        </div>

        <div className="rounded-3xl border border-stone-200 bg-white/95 px-4 py-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <p className="text-xs uppercase tracking-[0.18em] text-stone-500">Staff Members</p>
          <div className="mt-4 space-y-3">
            {members.map((member) => {
              const pending = pendingMemberId === member.id;
              const isOwner = member.role === "owner";
              return (
                <div key={member.id} className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-stone-950">{member.full_name || member.email || "Unnamed member"}</p>
                      <p className="mt-1 text-xs font-medium text-stone-500">{member.email || "Email not set"}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Badge>{isOwner ? "Full Permission" : "Full Access Staff"}</Badge>
                        <Badge tone={member.status === "ACTIVE" ? "green" : "amber"}>{member.status}</Badge>
                      </div>
                    </div>
                    {!isOwner ? (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={pending}
                        className="rounded-xl"
                        onClick={() => submitStatusChange(member, member.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE")}
                      >
                        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        {member.status === "ACTIVE" ? "Suspend" : "Reactivate"}
                      </Button>
                    ) : null}
                  </div>

                  {!isOwner ? (
                    <form
                      action={(formData) => submitMemberUpdate(member, formData)}
                      className="mt-4 grid gap-3 border-t border-stone-200 pt-4 sm:grid-cols-2"
                    >
                      <input type="hidden" name="member_id" value={member.id} />
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-stone-700">Name</Label>
                        <Input name="full_name" defaultValue={member.full_name ?? ""} className="rounded-xl" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-stone-700">Mobile Number</Label>
                        <Input name="mobile_number" defaultValue={member.mobile_number ?? ""} className="rounded-xl" />
                      </div>
                      <div className="sm:col-span-2 flex justify-end">
                        <Button type="submit" disabled={pending} className="rounded-xl">
                          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                          Save Details
                        </Button>
                      </div>
                    </form>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-3xl border border-stone-200 bg-white/95 px-4 py-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <p className="text-xs uppercase tracking-[0.18em] text-stone-500">Pending Invitations</p>
          <div className="mt-4 space-y-3">
            {invitations.length > 0 ? (
              invitations.map((invite) => (
                <div key={invite.id} className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
                  <p className="text-sm font-semibold text-stone-950">{invite.full_name || "Staff invite"}</p>
                  <p className="mt-1 text-xs font-medium text-stone-500">{invite.email}</p>
                  <p className="mt-2 text-xs text-stone-500">
                    {invite.role === "owner" ? "Full Permission" : "Full Access Staff"} · {invite.status} · Expires {new Date(invite.expires_at).toLocaleDateString()}
                  </p>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-center text-sm text-stone-500">
                No invitations sent yet.
              </div>
            )}
          </div>
        </div>
      </section>

      {isInviteOpen ? (
        <div className="fixed inset-0 z-[60] bg-stone-950/45 px-4 py-6 backdrop-blur-sm">
          <div className="mx-auto w-full max-w-md rounded-[2rem] border border-stone-200 bg-[#fcfaf6] shadow-[0_30px_80px_rgba(15,23,42,0.22)]">
            <div className="border-b border-stone-200 px-5 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-stone-500">Invite Staff</p>
              <h2 className="mt-2 text-lg font-semibold text-stone-950">Send team access by email</h2>
              <p className="mt-1 text-sm text-stone-600">The invited person must sign in with the exact same Google email.</p>
            </div>
            <div className="space-y-4 px-5 py-5">
              <div className="space-y-2">
                <Label className="text-sm font-medium text-stone-700">Name</Label>
                <Input value={inviteName} onChange={(event) => setInviteName(event.target.value)} className="rounded-xl" />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium text-stone-700">Email</Label>
                <Input value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} type="email" className="rounded-xl" />
              </div>
              <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.18em] text-stone-500">Access Type</p>
                <div className="mt-2 space-y-3">
                  <Select value={inviteRole} onValueChange={(value: "owner" | "admin") => setInviteRole(value)}>
                    <SelectTrigger className="rounded-xl border-stone-200 bg-white">
                      <SelectValue placeholder="Select access type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="owner">Full Permission</SelectItem>
                      <SelectItem value="admin">Full Access Staff</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <p className="mt-3 text-sm font-semibold text-stone-950">{inviteRole === "owner" ? "Full Permission" : "Full Access Staff"}</p>
                <p className="mt-1 text-xs leading-5 text-stone-500">
                  {inviteRole === "owner"
                    ? "Gets owner-level access across DukaanHQ, including staff management, settings, billing, inventory, and reports."
                    : "Can create bills, edit or delete bills, add stock, adjust stock, add or edit products, and view reports. Cannot manage staff."}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-stone-200 px-5 py-4">
              <Button type="button" variant="ghost" onClick={() => setIsInviteOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={isInvitePending}
                onClick={submitInvite}
                className="rounded-xl"
              >
                {isInvitePending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Send Invite
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Users;
}) {
  return (
    <div className="rounded-2xl bg-stone-50 px-4 py-4">
      <div className="flex items-center gap-2 text-stone-500">
        <Icon className="h-4 w-4" />
        <span className="text-xs uppercase tracking-[0.18em]">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold text-stone-950">{value}</p>
    </div>
  );
}

function PermissionCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4">
      <p className="text-sm font-semibold text-stone-950">{title}</p>
      <p className="mt-2 text-sm leading-6 text-stone-600">{description}</p>
    </div>
  );
}

function Badge({ children, tone = "stone" }: { children: React.ReactNode; tone?: "stone" | "green" | "amber" }) {
  const toneClass =
    tone === "green"
      ? "bg-emerald-50 text-emerald-700"
      : tone === "amber"
        ? "bg-amber-50 text-amber-700"
        : "bg-stone-100 text-stone-700";

  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${toneClass}`}>{children}</span>;
}
