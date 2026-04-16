"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { X, Loader2, TrendingUp, TrendingDown, Clock, ShieldCheck, Mail, Phone } from "lucide-react";
import { format } from "date-fns";
import { formatShopMemberRole } from "@/lib/auth/display-role";

import { getStaffActivityAction, type StaffActivityItem } from "../actions";

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

export function StaffDetailDrawer({
  member,
  onClose,
  getAvatarColor,
}: {
  member: StaffMember | null;
  onClose: () => void;
  getAvatarColor: (id: string) => string;
}) {
  const [activity, setActivity] = useState<StaffActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!member?.user_id) return;

    let mounted = true;
    (async () => {
      setIsLoading(true);
      setError(null);
      const result = await getStaffActivityAction(member.user_id);
      if (mounted) {
        if (result.status === "success") {
          setActivity(result.data ?? []);
        } else {
          setError(result.message);
        }
        setIsLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [member?.user_id]);

  const initial = (member?.full_name || member?.email || "?").charAt(0).toUpperCase();

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-stone-900/30 backdrop-blur-[2px] transition-opacity duration-300 ${
          member ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 flex h-[85vh] flex-col rounded-t-3xl bg-[#FAFAF8] shadow-2xl transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] sm:left-auto sm:right-4 sm:top-20 sm:h-[calc(100vh-6rem)] sm:w-[460px] sm:rounded-2xl ${
          member ? "translate-y-0 sm:translate-x-0" : "translate-y-full sm:translate-x-[120%]"
        }`}
      >
        {/* Drag handle (mobile) */}
        <div className="flex justify-center pb-1 pt-3 sm:hidden">
          <div className="h-1 w-10 rounded-full bg-stone-300" />
        </div>

        {/* Header */}
        <div className="flex shrink-0 items-center justify-between px-5 py-3.5 sm:px-6 sm:py-4">
          <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-stone-400">
            Staff Details
          </span>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-stone-200/70 text-stone-500 transition-all hover:bg-stone-200 hover:text-stone-800"
            aria-label="Close"
          >
            <X className="h-3.5 w-3.5 stroke-[2.5]" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          {member && (
            <div className="flex flex-col pb-10">
              {/* ── Profile Header ── */}
              <div className="mt-2 flex flex-col items-center px-6 text-center">
                <div
                  className={`flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full text-3xl font-bold text-white shadow-sm ${
                    member.avatar_url ? "bg-white" : getAvatarColor(member.id)
                  }`}
                >
                  {member.avatar_url ? (
                    <Image
                      src={member.avatar_url}
                      alt={member.full_name ?? "Staff Avatar"}
                      width={96}
                      height={96}
                      className="h-24 w-24 rounded-full object-cover"
                    />
                  ) : (
                    <span>{initial}</span>
                  )}
                </div>

                <h1
                  className="mt-4 text-[22px] font-bold leading-snug tracking-tight text-stone-900"
                  style={{ fontFamily: "'Georgia', serif" }}
                >
                  {member.full_name || "Unnamed Staff"}
                </h1>
                <div className="mt-2 flex items-center justify-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold tracking-wide ${
                      member.status === "ACTIVE"
                        ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/60"
                        : "bg-amber-50 text-amber-700 ring-1 ring-amber-200/60"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        member.status === "ACTIVE" ? "bg-emerald-500" : "bg-amber-500"
                      }`}
                    />
                    {member.status === "ACTIVE" ? "Active" : "Suspended"}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-3 py-1 text-[11px] font-semibold tracking-wide text-stone-700 ring-1 ring-stone-200/60">
                    <ShieldCheck className="h-3 w-3" />
                    {formatShopMemberRole(member.role)}
                  </span>
                </div>
              </div>

              {/* ── Contact Info ── */}
              <div className="mt-8 px-6">
                <div className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white">
                  <div className="flex items-center gap-4 px-4 py-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-50">
                      <Mail className="h-4 w-4 text-stone-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-stone-400">
                        Email
                      </p>
                      <p className="truncate text-[13px] font-medium text-stone-800">
                        {member.email || "—"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 px-4 py-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-50">
                      <Phone className="h-4 w-4 text-stone-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-stone-400">
                        Mobile
                      </p>
                      <p className="text-[13px] font-medium text-stone-800">
                        {member.mobile_number || "—"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 px-4 py-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-50">
                      <Clock className="h-4 w-4 text-stone-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-stone-400">
                        Joined
                      </p>
                      <p className="text-[13px] font-medium text-stone-800">
                        {member.joined_at
                          ? format(new Date(member.joined_at), "MMM d, yyyy")
                          : "—"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Activity Feed ── */}
              <div className="mt-8 px-6">
                <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.14em] text-stone-400">
                  Recent Activity
                </p>
                {isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-stone-300" />
                  </div>
                ) : error ? (
                  <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-center">
                    <p className="text-sm text-red-600">{error}</p>
                  </div>
                ) : activity.length > 0 ? (
                  <div className="space-y-2">
                    {activity.map((movement) => {
                      const isPositive = movement.quantity_change > 0;
                      return (
                        <div
                          key={movement.id}
                          className="flex items-center gap-3.5 rounded-xl border border-stone-100 bg-white px-4 py-3"
                        >
                          <div
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                              isPositive ? "bg-emerald-50" : "bg-red-50"
                            }`}
                          >
                            {isPositive ? (
                              <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
                            ) : (
                              <TrendingDown className="h-3.5 w-3.5 text-red-500" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] font-semibold text-stone-800">
                              {movement.product_name}
                            </p>
                            <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-stone-400">
                              <span className="capitalize text-stone-500">
                                {movement.type.toLowerCase().replace(/_/g, " ")}
                              </span>
                              <span>·</span>
                              <span>
                                {format(new Date(movement.created_at), "MMM d, h:mm a")}
                              </span>
                            </p>
                          </div>
                          <span
                            className={`shrink-0 text-[13px] font-bold ${
                              isPositive ? "text-emerald-600" : "text-red-500"
                            }`}
                          >
                            {isPositive ? "+" : "−"}
                            {Math.abs(movement.quantity_change)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-xl border border-stone-200 border-dashed bg-transparent p-6 text-center">
                    <p className="text-sm text-stone-500">No recent activity found.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
