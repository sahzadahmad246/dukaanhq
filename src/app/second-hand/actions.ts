"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getWorkspaceData } from "@/lib/workspace/get-workspace-data";
import { checkPlanLimit } from "@/lib/subscription/plan-limits";
import { SecondHandPhoneSchema } from "@/lib/types/second-hand";
import { buildShopRoute } from "@/lib/shop-routes";
import type { ActionResponse } from "@/app/inventory/actions";

const INVOICE_BUCKET = "second-hand-invoices";
const INVOICE_TYPES: Record<string, string> = {
  "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
};

export async function addSecondHandPhoneAction(formData: FormData): Promise<ActionResponse> {
  const { shop } = await getWorkspaceData({ requireOwner: true });
  if (!shop) return { status: "error", message: "No active shop found." };
  const parsed = SecondHandPhoneSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "Complete the phone details." };
  const supabase = await createSupabaseServerClient();
  const limit = await checkPlanLimit(supabase, shop.id, "products");
  if (!limit.ok) return { status: "error", message: limit.message };

  let invoicePath: string | null = null;
  const file = formData.get("original_invoice");
  if (file instanceof File && file.size > 0) {
    const extension = INVOICE_TYPES[file.type];
    if (!extension || file.size > 5 * 1024 * 1024) {
      return { status: "error", message: "Original invoice must be a PDF, JPG, PNG or WebP under 5 MB." };
    }
    invoicePath = `${shop.id}/${crypto.randomUUID()}.${extension}`;
    const { error } = await supabase.storage.from(INVOICE_BUCKET).upload(invoicePath, file, { contentType: file.type, upsert: false });
    if (error) return { status: "error", message: "Could not upload the original invoice. Please try again." };
  }
  const { data, error } = await supabase.rpc("create_second_hand_phone", {
    p_shop_id: shop.id,
    p_phone: {
      ...parsed.data,
      seller_phone: `${parsed.data.seller_country_code} ${parsed.data.seller_phone}`,
      original_invoice_path: invoicePath,
    },
  });
  if (error || !data) {
    if (invoicePath) await supabase.storage.from(INVOICE_BUCKET).remove([invoicePath]);
    return { status: "error", message: error?.code === "23505"
      ? "This IMEI is already recorded in your shop. Check both IMEIs."
      : "Could not add the phone. Please check the details and try again." };
  }
  revalidatePath("/second-hand");
  revalidatePath(buildShopRoute(shop.slug, "second-hand"));
  revalidatePath("/dashboard");
  return { status: "success", message: "Second-hand phone added to stock.", data: { product_id: data } };
}

export async function getPurchaseInvoiceAction(purchaseId: string): Promise<{ url?: string; message?: string }> {
  const { shop } = await getWorkspaceData({ requireOwner: true });
  if (!shop) return { message: "No active shop found." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("second_hand_purchases").select("original_invoice_path")
    .eq("id", purchaseId).eq("shop_id", shop.id).maybeSingle();
  if (error || !data?.original_invoice_path) return { message: "Original invoice could not be found." };
  const result = await supabase.storage.from(INVOICE_BUCKET).createSignedUrl(data.original_invoice_path, 60);
  if (result.error) return { message: "Could not open the original invoice." };
  return { url: result.data.signedUrl };
}
