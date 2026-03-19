"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CreateInvoicePayloadSchema } from "@/lib/types/billing";
import { getWorkspaceData } from "@/lib/workspace/get-workspace-data";
import type { ActionResponse } from "@/app/inventory/actions";

function parseJsonField<T>(value: FormDataEntryValue | null, schema: z.ZodSchema<T>) {
  if (typeof value !== "string" || value.trim() === "") {
    return schema.safeParse(undefined);
  }

  try {
    return schema.safeParse(JSON.parse(value));
  } catch {
    return schema.safeParse(undefined);
  }
}

export async function createInvoiceAction(
  _prevState: ActionResponse,
  formData: FormData
): Promise<ActionResponse> {
  const { shop } = await getWorkspaceData();
  if (!shop) return { status: "error", message: "No active shop found." };

  const payloadResult = parseJsonField(formData.get("invoice_payload"), CreateInvoicePayloadSchema);
  if (!payloadResult.success) {
    return {
      status: "error",
      message: payloadResult.error.issues[0]?.message ?? "Invalid invoice payload.",
      fieldErrors: {
        invoice_payload: payloadResult.error.issues[0]?.message ?? "Invalid invoice payload.",
      },
    };
  }

  const payload = payloadResult.data;
  const supabase = await createSupabaseServerClient();

  const { data: invoiceId, error } = await supabase.rpc("create_inventory_invoice", {
    p_shop_id: shop.id,
    p_customer: payload.customer,
    p_items: payload.items,
    p_payment_method: payload.payment_method,
    p_notes: payload.notes ?? null,
  });

  if (error || !invoiceId) {
    return { status: "error", message: error?.message || "Failed to create invoice." };
  }

  const { data: invoice } = await supabase
    .from("invoices")
    .select(`
      *,
      invoice_items (
        id,
        invoice_id,
        product_name_snapshot,
        brand_name_snapshot,
        category_name_snapshot,
        variant_name_snapshot,
        identifier_snapshot,
        quantity,
        unit_price,
        tax_rate,
        discount_amount,
        line_total
      )
    `)
    .eq("id", invoiceId)
    .eq("shop_id", shop.id)
    .single();

  revalidatePath("/billing");
  revalidatePath("/inventory");

  return {
    status: "success",
    message: "Invoice created successfully.",
    data: invoice,
  };
}
