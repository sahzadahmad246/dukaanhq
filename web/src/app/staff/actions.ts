"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import type { ActionResponse } from "@/app/inventory/actions";
import { getAppOrigin } from "@/lib/app-origin";
import { uploadImageToCloudinary, deleteImageFromCloudinary } from "@/lib/cloudinary";
import { sendResendEmail } from "@/lib/email/resend";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkPlanEntitlement, checkPlanLimit } from "@/lib/subscription/plan-limits";
import { getWorkspaceData } from "@/lib/workspace/get-workspace-data";

const InviteStaffSchema = z.object({
  full_name: z.string().trim().min(1, "Name is required."),
  email: z.string().trim().email("Enter a valid email."),
});

const UpdateStaffMemberSchema = z.object({
  member_id: z.string().uuid(),
  full_name: z.string().trim().min(1, "Name is required."),
  mobile_number: z.string().trim().optional().default(""),
});

const UpdateStaffStatusSchema = z.object({
  member_id: z.string().uuid(),
  status: z.enum(["ACTIVE", "SUSPENDED"]),
});

function buildInviteEmail(input: {
  inviteUrl: string;
  logoUrl: string;
  senderName: string;
  shopName: string;
  fullName: string;
}) {
  return `
    <div style="margin:0; background:#f6efdf; padding:24px 12px; font-family:Arial,sans-serif; color:#171717;">
      <div style="max-width:720px; margin:0 auto; background:#fffaf0; border:1px solid #eadfca; border-radius:28px; overflow:hidden; box-shadow:0 22px 70px rgba(15,23,42,0.10);">
        <div style="padding:26px 28px 18px; background:linear-gradient(135deg, #fff2c7 0%, #fffaf0 62%, #fff6df 100%); border-bottom:1px solid #efe3cc;">
          <img src="${escapeHtml(input.logoUrl)}" alt="DukaanHQ" width="72" height="72" style="display:block; width:72px; height:72px; border-radius:18px; background:#ffffff; padding:8px; border:1px solid #efe3cc;" />
          <p style="margin:18px 0 0; font-size:12px; letter-spacing:0.20em; text-transform:uppercase; color:#8a6a18; font-weight:700;">Staff Invitation</p>
          <h1 style="margin:12px 0 0; font-size:34px; line-height:1.15; color:#111827;">You were invited to join ${escapeHtml(input.shopName)}</h1>
          <p style="margin:12px 0 0; color:#57534e; font-size:14px; line-height:1.7;">
            ${escapeHtml(input.senderName)} invited you to join the shop on DukaanHQ.
          </p>
        </div>
        <div style="padding:28px;">
          <p style="margin:0 0 14px; color:#374151; font-size:16px; line-height:1.8;">Hi ${escapeHtml(input.fullName)},</p>
          <p style="margin:0 0 12px; color:#374151; font-size:14px; line-height:1.7;">
            This invitation is reserved for <strong>${escapeHtml(input.fullName)}</strong> at <strong>${escapeHtml(input.shopName)}</strong>.
          </p>
          <div style="margin:20px 0; border:1px solid #efe3cc; border-radius:22px; background:#fffdf8; padding:18px 20px;">
            <p style="margin:0; font-size:12px; letter-spacing:0.16em; text-transform:uppercase; color:#8a6a18; font-weight:700;">Before you continue</p>
            <p style="margin:12px 0 0; color:#111827; font-size:14px; line-height:1.8;"><strong>Use the same email:</strong> open this invite with the exact Google email address that received it.</p>
            <p style="margin:8px 0 0; color:#111827; font-size:14px; line-height:1.8;"><strong>Access:</strong> shop workspace access as staff, except staff management.</p>
          </div>
          <p style="margin:0 0 18px; color:#374151; font-size:14px; line-height:1.8;">
            Tap the button below to open your secure invite page. From there, continue with Google and we will connect you to the shop automatically.
          </p>
          <a href="${escapeHtml(input.inviteUrl)}" style="display:inline-block; padding:15px 22px; border-radius:16px; background:#111827; color:white; text-decoration:none; font-weight:700;">
            Open Invitation
          </a>
          <p style="margin:20px 0 0; color:#6b7280; font-size:12px; line-height:1.8;">
            This invite stays active for 7 days. If the button does not open, use this link:<br />
            <span>${escapeHtml(input.inviteUrl)}</span>
          </p>
          <p style="margin:16px 0 0; color:#78716c; font-size:12px; line-height:1.7;">
            If you were not expecting this email, you can ignore it safely.
          </p>
        </div>
      </div>
    </div>
  `;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getAdminSupabase() {
  const supabase = createSupabaseAdminClient();

  if (!supabase) {
    throw new Error("Supabase admin client is not configured.");
  }

  return supabase;
}

export async function inviteStaffAction(formData: FormData): Promise<ActionResponse> {
  try {
    const { shop, membership, profile, user } = await getWorkspaceData({ requireOwner: true });
    if (!shop || !membership) {
      return { status: "error", message: "Shop access not found." };
    }

    const access = await checkPlanEntitlement(
      getAdminSupabase(),
      shop.id,
      "staff_access",
      "Staff access",
    );
    if (!access.ok) {
      return { status: "error", message: access.message };
    }

    const staffLimit = await checkPlanLimit(getAdminSupabase(), shop.id, "staff");
    if (!staffLimit.ok) {
      return { status: "error", message: staffLimit.message };
    }

    const parsed = InviteStaffSchema.safeParse({
      full_name: formData.get("full_name"),
      email: formData.get("email"),
    });

    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return {
        status: "error",
        message: issue?.message ?? "Invalid invitation details.",
        fieldErrors: issue?.path?.[0] ? { [String(issue.path[0])]: issue.message } : undefined,
      };
    }

    const supabase = getAdminSupabase();
    const normalizedEmail = parsed.data.email.toLowerCase();

    const { data: existingMember } = await supabase
      .from("shop_members")
      .select("id, status")
      .eq("shop_id", shop.id)
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (existingMember) {
      return {
        status: "error",
        message:
          existingMember.status === "SUSPENDED"
            ? "This staff member already exists and is suspended. Reactivate them instead."
            : "This email already belongs to a staff member in your shop.",
      };
    }

    const inviteToken = randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: existingInvite } = await supabase
      .from("shop_member_invitations")
      .select("id")
      .eq("shop_id", shop.id)
      .eq("email", normalizedEmail)
      .eq("status", "PENDING")
      .maybeSingle();

    if (existingInvite) {
      await supabase
        .from("shop_member_invitations")
        .update({
          full_name: parsed.data.full_name,
          role: "staff",
          invite_token: inviteToken,
          invited_by: user.id,
          expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingInvite.id);
    } else {
      const { error: inviteError } = await supabase.from("shop_member_invitations").insert({
        shop_id: shop.id,
        email: normalizedEmail,
        full_name: parsed.data.full_name,
        role: "staff",
        invited_by: user.id,
        invite_token: inviteToken,
        expires_at: expiresAt,
      });

      if (inviteError) {
        return { status: "error", message: inviteError.message || "Failed to create invitation." };
      }
    }

    const headerList = await headers();
    const appUrl = getAppOrigin(headerList);

    if (!appUrl) {
      return { status: "error", message: "Could not determine app URL from headers or environment." };
    }

    const inviteUrl = `${appUrl}/auth/login?invite=${inviteToken}`;
    await sendResendEmail({
      from: "DukaanHQ <hello@dukaanhq.com>",
      to: normalizedEmail,
      subject: `You're invited to join ${shop.name} on DukaanHQ`,
      html: buildInviteEmail({
        inviteUrl,
        logoUrl: `${appUrl}/logo.png`,
        senderName: profile?.full_name ?? user.user_metadata.full_name ?? shop.name,
        shopName: shop.name,
        fullName: parsed.data.full_name,
      }),
    });

    revalidatePath("/staff");
    return { status: "success", message: `Invitation sent to ${normalizedEmail}.` };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Failed to send invitation." };
  }
}

export async function resendStaffInvitationAction(formData: FormData): Promise<ActionResponse> {
  try {
    const { shop, membership, profile, user } = await getWorkspaceData({ requireOwner: true });
    if (!shop || !membership) {
      return { status: "error", message: "Shop access not found." };
    }

    const invitationId = formData.get("invitation_id");
    if (!invitationId || typeof invitationId !== "string") {
      return { status: "error", message: "Invitation ID is required." };
    }

    const supabase = getAdminSupabase();
    const { data: invitation, error: invitationError } = await supabase
      .from("shop_member_invitations")
      .select("id, email, full_name, role, status")
      .eq("id", invitationId)
      .eq("shop_id", shop.id)
      .maybeSingle<{
        id: string;
        email: string;
        full_name: string | null;
        role: "owner" | "staff";
        status: string;
      }>();

    if (invitationError) {
      return { status: "error", message: invitationError.message || "Failed to load invitation." };
    }

    if (!invitation || invitation.status !== "PENDING") {
      return { status: "error", message: "This invitation is no longer pending." };
    }

    const inviteToken = randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { error: updateError } = await supabase
      .from("shop_member_invitations")
      .update({
        role: "staff",
        invite_token: inviteToken,
        invited_by: user.id,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", invitation.id)
      .eq("shop_id", shop.id);

    if (updateError) {
      return { status: "error", message: updateError.message || "Failed to refresh invitation." };
    }

    const headerList = await headers();
    const appUrl = getAppOrigin(headerList);

    if (!appUrl) {
      return { status: "error", message: "Could not determine app URL from headers or environment." };
    }

    const inviteUrl = `${appUrl}/auth/login?invite=${inviteToken}`;
    await sendResendEmail({
      from: "DukaanHQ <hello@dukaanhq.com>",
      to: invitation.email,
      subject: `Reminder: finish joining ${shop.name} on DukaanHQ`,
      html: buildInviteEmail({
        inviteUrl,
        logoUrl: `${appUrl}/logo.png`,
        senderName: profile?.full_name ?? user.user_metadata.full_name ?? shop.name,
        shopName: shop.name,
        fullName: invitation.full_name ?? invitation.email,
      }),
    });

    revalidatePath("/staff");
    return { status: "success", message: `Reminder sent to ${invitation.email}.` };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Failed to resend invitation." };
  }
}

export async function updateStaffMemberAction(formData: FormData): Promise<ActionResponse> {
  try {
    const { shop } = await getWorkspaceData({ requireOwner: true });
    if (!shop) return { status: "error", message: "Shop access not found." };

    const parsed = UpdateStaffMemberSchema.safeParse({
      member_id: formData.get("member_id"),
      full_name: formData.get("full_name"),
      mobile_number: formData.get("mobile_number"),
    });

    if (!parsed.success) {
      return { status: "error", message: parsed.error.issues[0]?.message ?? "Invalid staff details." };
    }

    const supabase = getAdminSupabase();

    // Get the user_id so we can sync to profiles too
    const { data: member } = await supabase
      .from("shop_members")
      .select("user_id")
      .eq("id", parsed.data.member_id)
      .eq("shop_id", shop.id)
      .neq("role", "owner")
      .maybeSingle();

    const { error } = await supabase
      .from("shop_members")
      .update({
        full_name: parsed.data.full_name,
        mobile_number: parsed.data.mobile_number || null,
      })
      .eq("id", parsed.data.member_id)
      .eq("shop_id", shop.id)
      .neq("role", "owner");

    if (error) {
      return { status: "error", message: error.message || "Failed to update staff member." };
    }

    // Sync name to profiles table so staff sees updated name when logged in
    if (member?.user_id) {
      await supabase
        .from("profiles")
        .update({ full_name: parsed.data.full_name })
        .eq("id", member.user_id);
    }

    revalidatePath("/staff");
    return { status: "success", message: "Staff details updated." };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Failed to update staff member." };
  }
}

export async function updateStaffStatusAction(formData: FormData): Promise<ActionResponse> {
  try {
    const { shop } = await getWorkspaceData({ requireOwner: true });
    if (!shop) return { status: "error", message: "Shop access not found." };

    const parsed = UpdateStaffStatusSchema.safeParse({
      member_id: formData.get("member_id"),
      status: formData.get("status"),
    });

    if (!parsed.success) {
      return { status: "error", message: parsed.error.issues[0]?.message ?? "Invalid staff status." };
    }

    const supabase = getAdminSupabase();
    const { error } = await supabase
      .from("shop_members")
      .update({
        status: parsed.data.status,
        suspended_at: parsed.data.status === "SUSPENDED" ? new Date().toISOString() : null,
      })
      .eq("id", parsed.data.member_id)
      .eq("shop_id", shop.id)
      .neq("role", "owner");

    if (error) {
      return { status: "error", message: error.message || "Failed to update staff status." };
    }

    revalidatePath("/staff");
    revalidatePath("/");
    revalidatePath("/dashboard");
    revalidatePath("/billing");
    revalidatePath("/inventory");
    revalidatePath("/profile");
    revalidatePath("/settings");
    revalidatePath("/subscription");
    revalidatePath("/subscribe");
    revalidatePath("/suspended");
    return {
      status: "success",
      message: parsed.data.status === "SUSPENDED" ? "Staff member suspended." : "Staff member reactivated.",
    };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Failed to update staff status." };
  }
}

export async function updateStaffAvatarAction(formData: FormData): Promise<ActionResponse> {
  try {
    const { shop } = await getWorkspaceData({ requireOwner: true });
    if (!shop) return { status: "error", message: "Shop access not found." };

    const memberId = formData.get("member_id");
    const file = formData.get("avatar") as File | null;

    if (!memberId || typeof memberId !== "string") {
      return { status: "error", message: "Member ID is required." };
    }

    if (!file || file.size === 0) {
      return { status: "error", message: "No file provided." };
    }

    const supabase = getAdminSupabase();

    // Check if there's an existing avatar to delete
    const { data: existing } = await supabase
      .from("shop_members")
      .select("avatar_url")
      .eq("id", memberId)
      .eq("shop_id", shop.id)
      .maybeSingle();

    // Try to clean up old cloudinary image
    if (existing?.avatar_url && existing.avatar_url.includes("cloudinary.com")) {
      const parts = existing.avatar_url.split("/upload/");
      if (parts[1]) {
        const publicId = parts[1].replace(/^v\d+\//, "").replace(/\.[^.]+$/, "");
        await deleteImageFromCloudinary(publicId);
      }
    }

    const uploaded = await uploadImageToCloudinary(file);
    if (!uploaded) {
      return { status: "error", message: "Failed to upload profile picture." };
    }

    const { error } = await supabase
      .from("shop_members")
      .update({ avatar_url: uploaded.url })
      .eq("id", memberId)
      .eq("shop_id", shop.id);

    if (error) {
      return { status: "error", message: error.message || "Failed to save avatar." };
    }

    revalidatePath("/staff");
    return { status: "success", message: "Profile picture updated." };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Failed to update avatar." };
  }
}

export type StaffActivityItem = {
  id: string;
  type: string;
  quantity_change: number;
  reason: string | null;
  created_at: string;
  product_name: string;
};

export async function getStaffActivityAction(userId: string): Promise<ActionResponse<StaffActivityItem[]>> {
  try {
    const { shop } = await getWorkspaceData({ requireOwner: true });
    if (!shop) return { status: "error", message: "Shop access not found." };

    const supabase = getAdminSupabase();

    // Fetch stock movements performed by this user
    const { data: movements, error } = await supabase
      .from("stock_movements")
      .select("id, type, quantity_change, reason, created_at, product_id")
      .eq("shop_id", shop.id)
      .eq("performed_by", userId)
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) {
      return { status: "error", message: error.message || "Failed to load activity." };
    }

    if (!movements || movements.length === 0) {
      return { status: "success", message: "No activity found.", data: [] };
    }

    // Fetch product names for all referenced products
    const productIds = Array.from(new Set(movements.map((m) => m.product_id)));
    const { data: products } = await supabase
      .from("products")
      .select("id, name")
      .in("id", productIds);

    const productMap = new Map((products ?? []).map((p) => [p.id, p.name]));

    const items: StaffActivityItem[] = movements.map((m) => ({
      id: m.id,
      type: m.type,
      quantity_change: m.quantity_change,
      reason: m.reason,
      created_at: m.created_at,
      product_name: productMap.get(m.product_id) ?? "Unknown product",
    }));

    return { status: "success", message: "Activity loaded.", data: items };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Failed to load activity." };
  }
}
