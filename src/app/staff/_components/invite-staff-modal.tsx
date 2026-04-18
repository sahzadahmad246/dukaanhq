"use client";

import { Loader2, X } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { inviteStaffAction } from "@/app/staff/actions";

interface InviteStaffModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function InviteStaffModal({ isOpen, onClose, onSuccess }: InviteStaffModalProps) {
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"owner" | "staff">("staff");
  const [isInvitePending, startInviteTransition] = useTransition();
  const [inviteErrors, setInviteErrors] = useState<{ name?: string; email?: string }>({});

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
        onClose();
        onSuccess?.();
      } else {
        toast.error(result.message);
      }
    });
  }

  if (!isOpen) return null;

  return (
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
            onClick={onClose}
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
  );
}