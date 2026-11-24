"use server";

import { revalidatePath } from "next/cache";

import type { ActionResponse } from "@/app/inventory/actions";
import { uploadImageToCloudinary, deleteImageFromCloudinary } from "@/lib/cloudinary";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkPlanEntitlement } from "@/lib/subscription/plan-limits";
import { getWorkspaceData } from "@/lib/workspace/get-workspace-data";

export async function updateShopStampAction(formData: FormData): Promise<ActionResponse> {
  try {
    const { shop } = await getWorkspaceData({ requireOwner: false });
    if (!shop) return { status: "error", message: "Shop access not found." };

    const file = formData.get("stamp") as File | null;

    if (!file || file.size === 0) {
      return { status: "error", message: "No file provided." };
    }

    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      return { status: "error", message: "Supabase admin client not configured." };
    }

    const access = await checkPlanEntitlement(supabase, shop.id, "shop_stamp", "Shop stamp");
    if (!access.ok) {
      return { status: "error", message: access.message };
    }

    // Check if there's an existing stamp to delete
    const { data: existing } = await supabase
      .from("shops")
      .select("shop_stamp_url")
      .eq("id", shop.id)
      .maybeSingle();

    // Try to clean up old cloudinary image
    if (existing?.shop_stamp_url && existing.shop_stamp_url.includes("cloudinary.com")) {
      const parts = existing.shop_stamp_url.split("/upload/");
      if (parts[1]) {
        const publicId = parts[1].replace(/^v\d+\//, "").replace(/\.[^.]+$/, "");
        await deleteImageFromCloudinary(publicId);
      }
    }

    const uploaded = await uploadImageToCloudinary(file);
    if (!uploaded) {
      return { status: "error", message: "Failed to upload shop stamp." };
    }

    const { error } = await supabase
      .from("shops")
      .update({ shop_stamp_url: uploaded.url })
      .eq("id", shop.id);

    if (error) {
      return { status: "error", message: error.message || "Failed to save shop stamp." };
    }

    revalidatePath("/settings");
    return { status: "success", message: "Shop stamp updated successfully." };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Failed to update shop stamp." };
  }
}
