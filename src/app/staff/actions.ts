"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { ActionResponse } from "@/app/inventory/actions";
import { uploadImageToCloudinary, deleteImageFromCloudinary } from "@/lib/cloudinary";
import { sendResendEmail } from "@/lib/email/resend";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getWorkspaceData } from "@/lib/workspace/get-workspace-data";

const InviteStaffSchema = z.object({
  full_name: z.string().trim().min(1, "Name is required."),
  email: z.string().trim().email("Enter a valid email."),
  role: z.enum(["owner", "staff"]),
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
  ownerName: string;
  shopName: string;
  fullName: string;
  roleLabel: string;
}) {
  return `
    <div style="font-family: Arial, sans-serif; background:#f8fafc; padding:32px;">
      <div style="max-width:560px; margin:0 auto; background:white; border:1px solid #e2e8f0; border-radius:24px; overflow:hidden; box-shadow:0 20px 60px rgba(15,23,42,0.12);">
        <div style="padding:28px 28px 22px; background:linear-gradient(135deg, #fff4c9 0%, #fffaf0 100%); border-bottom:1px solid #f1f5f9;">
          <div style="display:inline-flex; align-items:center; justify-content:center; width:44px; height:44px; border-radius:14px; background:#f5c542; color:#080e1a; font-weight:800; font-size:16px;">DH</div>
          <p style="margin:16px 0 0; font-size:12px; letter-spacing:0.18em; text-transform:uppercase; color:#78716c; font-weight:700;">DukaanHQ Staff Access</p>
          <h1 style="margin:10px 0 0; font-size:26px; line-height:1.2; color:#111827;">You were invited to join ${escapeHtml(input.shopName)}</h1>
          <p style="margin:12px 0 0; color:#57534e; font-size:14px; line-height:1.7;">
            ${escapeHtml(input.ownerName)} wants to give you <strong>${escapeHtml(input.roleLabel)}</strong> access on DukaanHQ.
          </p>
        </div>
        <div style="padding:28px;">
          <p style="margin:0 0 12px; color:#374151; font-size:14px; line-height:1.7;">Hi ${escapeHtml(input.fullName)},</p>
          <p style="margin:0 0 12px; color:#374151; font-size:14px; line-height:1.7;">
            This invitation is reserved for <strong>${escapeHtml(input.fullName)}</strong> at <strong>${escapeHtml(input.shopName)}</strong>.
          </p>
          <div style="margin:18px 0; border:1px solid #e7e5e4; border-radius:18px; background:#fafaf9; padding:16px 18px;">
            <p style="margin:0; font-size:12px; letter-spacing:0.16em; text-transform:uppercase; color:#78716c; font-weight:700;">Access Details</p>
            <p style="margin:12px 0 0; color:#111827; font-size:14px; line-height:1.7;"><strong>Shop:</strong> ${escapeHtml(input.shopName)}</p>
            <p style="margin:8px 0 0; color:#111827; font-size:14px; line-height:1.7;"><strong>Access Type:</strong> ${escapeHtml(input.roleLabel)}</p>
          </div>
          <p style="margin:0 0 18px; color:#374151; font-size:14px; line-height:1.7;">
            Sign in with Google using the exact same email address that received this invite. If you use another email, DukaanHQ will deny access automatically.
          </p>
          <a href="${escapeHtml(input.inviteUrl)}" style="display:inline-block; padding:13px 20px; border-radius:14px; background:#111827; color:white; text-decoration:none; font-weight:700;">
            Accept Staff Invitation
          </a>
          <p style="margin:18px 0 0; color:#6b7280; font-size:12px; line-height:1.7;">
            This invite stays active for 7 days. If the button does not open, copy this link into your browser:<br />
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

function getRoleLabel(role: "owner" | "staff") {
  return role === "owner" ? "Owner (full access)" : "Staff (bills & inventory)";
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

    const parsed = InviteStaffSchema.safeParse({
      full_name: formData.get("full_name"),
      email: formData.get("email"),
      role: formData.get("role"),
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
          role: parsed.data.role,
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
        role: parsed.data.role,
        invited_by: user.id,
        invite_token: inviteToken,
        expires_at: expiresAt,
      });

      if (inviteError) {
        return { status: "error", message: inviteError.message || "Failed to create invitation." };
      }
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrl) {
      return { status: "error", message: "NEXT_PUBLIC_APP_URL is not configured." };
    }

    const inviteUrl = `${appUrl}/auth/login?invite=${inviteToken}`;
    await sendResendEmail({
      from: "DukaanHQ <hello@unmatchedlines.com>",
      to: normalizedEmail,
      subject: `Join ${shop.name} on DukaanHQ as ${getRoleLabel(parsed.data.role)}`,
      html: buildInviteEmail({
        inviteUrl,
        ownerName: profile?.full_name ?? user.user_metadata.full_name ?? shop.name,
        shopName: shop.name,
        fullName: parsed.data.full_name,
        roleLabel: getRoleLabel(parsed.data.role),
      }),
    });

    revalidatePath("/staff");
    return { status: "success", message: `Invitation sent to ${normalizedEmail}.` };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Failed to send invitation." };
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
