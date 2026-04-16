"use client";

import Image from "next/image";
import { Camera, Loader2, MoreVertical, Pencil, Plus, Search, ShieldOff, ShieldCheck, X } from "lucide-react";
import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  inviteStaffAction,
  updateStaffMemberAction,
  updateStaffStatusAction,
  updateStaffAvatarAction,
} from "@/app/staff/actions";
import { StaffDetailDrawer } from "./staff-detail-drawer";

/* ─── Types ─── */

type StaffMember = {
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

type StaffInvitation = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  status: string;
  created_at: string;
  expires_at: string;
};

/* ─── Color palette for avatar fallbacks ─── */

const AVATAR_COLORS = [
  "bg-rose-500",
  "bg-orange-500",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-teal-500",
  "bg-cyan-500",
  "bg-blue-500",
  "bg-indigo-500",
  "bg-violet-500",
  "bg-purple-500",
  "bg-pink-500",
  "bg-fuchsia-500",
];

function getAvatarColor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

/* ─── Main component ─── */

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
  const [inviteRole, setInviteRole] = useState<"owner" | "staff">("staff");
  const [isInvitePending, startInviteTransition] = useTransition();
  const [inviteErrors, setInviteErrors] = useState<{ name?: string; email?: string }>({});

  const [searchQuery, setSearchQuery] = useState("");
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [editMember, setEditMember] = useState<StaffMember | null>(null);
  const [viewMember, setViewMember] = useState<StaffMember | null>(null);
  const [confirmSuspend, setConfirmSuspend] = useState<StaffMember | null>(null);
  const [pendingMemberId, setPendingMemberId] = useState<string | null>(null);

  // Edit form state
  const [editName, setEditName] = useState("");
  const [editMobile, setEditMobile] = useState("");
  const [editAvatarPreview, setEditAvatarPreview] = useState<string | null>(null);
  const [editAvatarFile, setEditAvatarFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredMembers = useMemo(() => {
    if (!searchQuery.trim()) return members;
    const q = searchQuery.toLowerCase().trim();
    return members.filter(
      (m) =>
        (m.full_name && m.full_name.toLowerCase().includes(q)) ||
        (m.email && m.email.toLowerCase().includes(q)) ||
        (m.mobile_number && m.mobile_number.includes(q))
    );
  }, [members, searchQuery]);

  const pendingInvitations = useMemo(() => invitations.filter((i) => i.status === "PENDING"), [invitations]);

  /* ─── Handlers ─── */

  function submitInvite() {
    const errors: { name?: string; email?: string } = {};
    if (!inviteName.trim()) errors.name = "Name is required.";
    if (!inviteEmail.trim()) {
      errors.email = "Email is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail.trim())) {
      errors.email = "Enter a valid email.";
    }
    if (Object.keys(errors).length > 0) {
      setInviteErrors(errors);
      return;
    }
    setInviteErrors({});

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
        setInviteRole("staff");
        setIsInviteOpen(false);
      } else {
        toast.error(result.message);
      }
    });
  }

  function openEditModal(member: StaffMember) {
    setEditMember(member);
    setEditName(member.full_name ?? "");
    setEditMobile(member.mobile_number ?? "");
    setEditAvatarPreview(member.avatar_url);
    setEditAvatarFile(null);
    setOpenDropdownId(null);
  }

  function handleAvatarSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setEditAvatarFile(file);
    setEditAvatarPreview(URL.createObjectURL(file));
  }

  async function submitEdit() {
    if (!editMember) return;
    setPendingMemberId(editMember.id);

    // Upload avatar first if changed
    if (editAvatarFile) {
      const avatarFormData = new FormData();
      avatarFormData.set("member_id", editMember.id);
      avatarFormData.set("avatar", editAvatarFile);
      const avatarResult = await updateStaffAvatarAction(avatarFormData);
      if (avatarResult.status === "error") {
        toast.error(avatarResult.message);
        setPendingMemberId(null);
        return;
      }
    }

    // Update name and mobile
    const formData = new FormData();
    formData.set("member_id", editMember.id);
    formData.set("full_name", editName);
    formData.set("mobile_number", editMobile);
    const result = await updateStaffMemberAction(formData);
    if (result.status === "success") {
      toast.success(result.message);
      setEditMember(null);
    } else {
      toast.error(result.message);
    }
    setPendingMemberId(null);
  }

  function openSuspendConfirm(member: StaffMember) {
    setConfirmSuspend(member);
    setOpenDropdownId(null);
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
    setConfirmSuspend(null);
  }

  const closeDropdown = useCallback(() => setOpenDropdownId(null), []);

  return (
    <>
      {/* Search + Invite row */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search staff…"
            className="h-11 w-full rounded-2xl bg-white pl-10 pr-4 text-sm text-stone-950 shadow-sm outline-none ring-1 ring-stone-200 placeholder:text-stone-400 focus:ring-2 focus:ring-stone-400 transition-shadow"
          />
        </div>
        <button
          type="button"
          onClick={() => setIsInviteOpen(true)}
          title="Invite Staff"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#f5c542] text-[#080e1a] transition hover:bg-[#f0bb2a] active:scale-95"
        >
          <Plus className="h-5 w-5" strokeWidth={2.5} />
        </button>
      </div>

      {/* Staff list — no box borders, horizontal dividers only */}
      <section className="mt-4">
        {filteredMembers.length > 0 ? (
          <div className="divide-y divide-stone-200">
            {filteredMembers.map((member) => {
              const isOwner = member.role === "owner";
              const initial = (member.full_name || member.email || "?").charAt(0).toUpperCase();
              const colorClass = getAvatarColor(member.id);

              return (
                <div
                  key={member.id}
                  className="-mx-3 relative flex cursor-pointer items-center gap-3 rounded-2xl px-3 py-3.5 transition hover:bg-stone-50"
                  onClick={() => setViewMember(member)}
                >
                  {/* Avatar */}
                  <div
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full overflow-hidden text-sm font-bold text-white ${
                      member.avatar_url ? "" : colorClass
                    }`}
                  >
                    {member.avatar_url ? (
                      <Image
                        src={member.avatar_url}
                        alt={member.full_name ?? "Staff"}
                        width={44}
                        height={44}
                        className="h-11 w-11 rounded-full object-cover"
                      />
                    ) : (
                      <span>{initial}</span>
                    )}
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-stone-950">
                        {member.full_name || member.email || "Unnamed"}
                      </p>
                      <span
                        className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          member.status === "ACTIVE"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {member.status === "ACTIVE" ? "Active" : "Suspended"}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-stone-500">
                      {member.email || "No email"}{isOwner ? " · Owner" : " · Staff"}
                    </p>
                  </div>

                  {/* Three-dot menu */}
                  {!isOwner && (
                    <div className="relative">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenDropdownId(openDropdownId === member.id ? null : member.id);
                        }}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700"
                        aria-label="Member options"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>

                      {/* Dropdown */}
                      {openDropdownId === member.id && (
                        <>
                          {/* Invisible backdrop to close dropdown */}
                          <div className="fixed inset-0 z-30" onClick={closeDropdown} />
                          <div className="absolute right-0 top-9 z-40 min-w-[140px] rounded-xl border border-stone-200 bg-white py-1 shadow-lg">
                            <button
                              type="button"
                              onClick={() => openEditModal(member)}
                              className="flex w-full items-center gap-2 px-3.5 py-2 text-sm text-stone-700 hover:bg-stone-50"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => openSuspendConfirm(member)}
                              className={`flex w-full items-center gap-2 px-3.5 py-2 text-sm ${
                                member.status === "ACTIVE"
                                  ? "text-red-600 hover:bg-red-50"
                                  : "text-emerald-600 hover:bg-emerald-50"
                              }`}
                            >
                              {member.status === "ACTIVE" ? (
                                <>
                                  <ShieldOff className="h-3.5 w-3.5" />
                                  Suspend
                                </>
                              ) : (
                                <>
                                  <ShieldCheck className="h-3.5 w-3.5" />
                                  Activate
                                </>
                              )}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-12 text-center text-sm text-stone-400">
            {searchQuery.trim() ? "No staff matching your search." : "No staff members yet."}
          </div>
        )}
      </section>

      {/* Pending invitations */}
      {pendingInvitations.length > 0 && (
        <section className="mt-6">
          <p className="mb-2.5 text-xs font-medium uppercase tracking-[0.18em] text-stone-400">
            Pending Invites
          </p>
          <div className="divide-y divide-stone-200">
            {pendingInvitations.map((invite) => {
              const initial = (invite.full_name || invite.email).charAt(0).toUpperCase();
              const colorClass = getAvatarColor(invite.id);
              return (
                <div key={invite.id} className="flex items-center gap-3 py-3">
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${colorClass}`}
                  >
                    {initial}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-stone-950">
                      {invite.full_name || invite.email}
                    </p>
                    <p className="truncate text-xs text-stone-500">
                      {invite.email} · Expires{" "}
                      {new Date(invite.expires_at).toLocaleDateString()}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-600">
                    Pending
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ─── Edit Staff Modal ─── */}
      {editMember && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center bg-stone-950/45 px-4 pt-16 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[2rem] border border-stone-200 bg-[#fcfaf6] shadow-[0_30px_80px_rgba(15,23,42,0.22)]">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-stone-950">Edit Staff</h2>
              <button
                type="button"
                onClick={() => setEditMember(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-stone-400 hover:bg-stone-100 hover:text-stone-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="space-y-5 px-5 py-5">
              {/* Avatar picker */}
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="group relative"
                >
                  <div
                    className={`flex h-20 w-20 items-center justify-center overflow-hidden rounded-full text-xl font-bold text-white ${
                      editAvatarPreview ? "" : getAvatarColor(editMember.id)
                    }`}
                  >
                    {editAvatarPreview ? (
                      <Image
                        src={editAvatarPreview}
                        alt="Avatar"
                        width={80}
                        height={80}
                        className="h-20 w-20 rounded-full object-cover"
                      />
                    ) : (
                      <span>
                        {(editMember.full_name || editMember.email || "?")
                          .charAt(0)
                          .toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                    <Camera className="h-5 w-5 text-white" />
                  </div>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarSelect}
                />
              </div>

              {/* Name */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-stone-700">Name</Label>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="rounded-xl"
                />
              </div>

              {/* Mobile */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-stone-700">Mobile</Label>
                <Input
                  value={editMobile}
                  onChange={(e) => setEditMobile(e.target.value)}
                  className="rounded-xl"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-stone-200 px-5 py-4">
              <Button type="button" variant="ghost" onClick={() => setEditMember(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={pendingMemberId === editMember.id}
                onClick={submitEdit}
                className="rounded-xl"
              >
                {pendingMemberId === editMember.id && (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                )}
                Save
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Suspend/Activate Confirmation Modal ─── */}
      {confirmSuspend && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-stone-950/45 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-stone-200 bg-[#fcfaf6] px-6 py-6 shadow-[0_30px_80px_rgba(15,23,42,0.22)]">
            <h3 className="text-lg font-semibold text-stone-950">
              {confirmSuspend.status === "ACTIVE" ? "Suspend Staff?" : "Activate Staff?"}
            </h3>
            <p className="mt-2 text-sm text-stone-600">
              {confirmSuspend.status === "ACTIVE"
                ? `Are you sure you want to suspend ${confirmSuspend.full_name || confirmSuspend.email || "this staff member"}? They will lose access to the shop until reactivated.`
                : `Are you sure you want to reactivate ${confirmSuspend.full_name || confirmSuspend.email || "this staff member"}? They will regain access to the shop.`}
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setConfirmSuspend(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={pendingMemberId === confirmSuspend.id}
                onClick={() =>
                  submitStatusChange(
                    confirmSuspend,
                    confirmSuspend.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE"
                  )
                }
                className={`rounded-xl ${
                  confirmSuspend.status === "ACTIVE"
                    ? "bg-red-600 hover:bg-red-700 text-white"
                    : "bg-emerald-600 hover:bg-emerald-700 text-white"
                }`}
              >
                {pendingMemberId === confirmSuspend.id && (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                )}
                {confirmSuspend.status === "ACTIVE" ? "Suspend" : "Activate"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Invite Staff Modal ─── */}
      {isInviteOpen && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center bg-stone-950/45 px-4 pt-20 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[2rem] border border-stone-200 bg-[#fcfaf6] shadow-[0_30px_80px_rgba(15,23,42,0.22)]">
            <div className="border-b border-stone-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-stone-950">Invite Staff</h2>
              <p className="mt-1 text-sm text-stone-500">
                Must sign in with the same Google email.
              </p>
            </div>
            <div className="space-y-4 px-5 py-5">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-stone-700">Name</Label>
                <Input
                  value={inviteName}
                  onChange={(e) => { setInviteName(e.target.value); setInviteErrors((p) => ({ ...p, name: undefined })); }}
                  className={`rounded-xl ${inviteErrors.name ? "border-red-400 ring-1 ring-red-300" : ""}`}
                />
                {inviteErrors.name && <p className="text-xs text-red-500">{inviteErrors.name}</p>}
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-stone-700">Email</Label>
                <Input
                  value={inviteEmail}
                  onChange={(e) => { setInviteEmail(e.target.value); setInviteErrors((p) => ({ ...p, email: undefined })); }}
                  type="email"
                  className={`rounded-xl ${inviteErrors.email ? "border-red-400 ring-1 ring-red-300" : ""}`}
                />
                {inviteErrors.email && <p className="text-xs text-red-500">{inviteErrors.email}</p>}
              </div>
              <div className="space-y-2.5">
                <Label className="text-sm font-medium text-stone-700">Access Type</Label>
                <RadioGroup
                  value={inviteRole}
                  onValueChange={(value) => setInviteRole(value as "owner" | "staff")}
                  className="grid gap-2"
                >
                  <label className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition ${inviteRole === "staff" ? "border-emerald-300 bg-emerald-50" : "border-stone-200 bg-white hover:border-stone-300"}`}>
                    <RadioGroupItem value="staff" id="role-staff" className="border-emerald-500 text-emerald-600" />
                    <div>
                      <p className="text-sm font-medium text-stone-950">Staff</p>
                      <p className="text-xs text-stone-500">Bills, inventory, reports. Cannot manage staff.</p>
                    </div>
                  </label>
                  <label className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition ${inviteRole === "owner" ? "border-emerald-300 bg-emerald-50" : "border-stone-200 bg-white hover:border-stone-300"}`}>
                    <RadioGroupItem value="owner" id="role-owner" className="border-emerald-500 text-emerald-600" />
                    <div>
                      <p className="text-sm font-medium text-stone-950">Full Permission (Owner)</p>
                      <p className="text-xs text-stone-500">Complete access including staff management.</p>
                    </div>
                  </label>
                </RadioGroup>
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-stone-200 px-5 py-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsInviteOpen(false)}
              >
                Cancel
              </Button>
              <button
                type="button"
                disabled={isInvitePending}
                onClick={submitInvite}
                className="flex h-10 items-center gap-1.5 rounded-xl bg-[#f5c542] px-5 text-sm font-semibold text-[#080e1a] transition hover:bg-[#f0bb2a] active:scale-[0.98] disabled:opacity-60"
              >
                {isInvitePending && <Loader2 className="h-4 w-4 animate-spin" />}
                Send Invite
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Detail Drawer ─── */}
      <StaffDetailDrawer
        member={viewMember}
        onClose={() => setViewMember(null)}
        getAvatarColor={getAvatarColor}
      />
    </>
  );
}
