"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkPlanEntitlement, checkPlanLimit } from "@/lib/subscription/plan-limits";
import { CreateInvoicePayloadSchema } from "@/lib/types/billing";
import { getWorkspaceData } from "@/lib/workspace/get-workspace-data";
import type { ActionResponse } from "@/app/inventory/actions";
import { UpdateInvoicePayloadSchema } from "@/lib/types/billing";

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

const ERROR_MAP: Array<[RegExp | string, string]> = [
  ["record \"v_inventory_item\" is not assigned yet", "Could not process item — please select a valid stock unit for serialized products."],
  [/not assigned yet/i, "Something went wrong processing your items. Please try again."],
  [/Selected inventory unit is not available/i, "The selected stock unit is no longer available. It may have been sold already."],
  [/Insufficient stock/i, "Not enough stock to complete this sale. Please check quantities."],
  [/Quantity-based products require a variant/i, "Please select a variant for quantity-based products."],
  [/Serialized products must have quantity 1/i, "Serialized products can only be sold one at a time."],
  [/Serialized products require an inventory unit/i, "Please select a specific stock unit (IMEI/Serial) for this product."],
  [/Product not found/i, "One of the selected products was not found. It may have been removed."],
  [/Customer name is required/i, "Please enter the customer name."],
  [/Customer mobile is required/i, "Please enter the customer mobile number."],
  [/Customer mobile must be exactly 10 digits/i, "Please enter a valid 10-digit mobile number."],
  [/Billing address is required/i, "Please enter the billing address."],
  [/At least one invoice item/i, "Please add at least one product to the bill."],
];

function mapInvoiceError(raw: string): string {
  for (const [pattern, friendly] of ERROR_MAP) {
    if (typeof pattern === "string" ? raw.includes(pattern) : pattern.test(raw)) {
      return `${friendly} [${raw}]`;
    }
  }
  return `Something went wrong while creating the bill. Please try again. [${raw}]`;
}

const FUTURE_DATE_GRACE_MS = 2 * 60 * 1000;

function resolveInvoiceDate(value: string | null | undefined) {
  if (!value) {
    return { ok: true as const, iso: new Date().toISOString() };
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return { ok: false as const, message: "Choose a valid bill date and time." };
  }

  if (parsed.getTime() > Date.now() + FUTURE_DATE_GRACE_MS) {
    return { ok: false as const, message: "Bill date cannot be in the future." };
  }

  return { ok: true as const, iso: parsed.toISOString() };
}

async function applyInvoiceDate(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  shopId: string,
  invoiceId: string,
  invoiceDateIso: string
) {
  const { error } = await supabase
    .from("invoices")
    .update({ invoice_date: invoiceDateIso })
    .eq("id", invoiceId)
    .eq("shop_id", shopId);

  return error;
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
  const invoiceDate = resolveInvoiceDate(payload.invoice_date);
  if (!invoiceDate.ok) {
    return { status: "error", message: invoiceDate.message };
  }

  const supabase = await createSupabaseServerClient();
  const invoiceLimit = await checkPlanLimit(supabase, shop.id, "invoices_per_month");
  if (!invoiceLimit.ok) {
    return { status: "error", message: invoiceLimit.message };
  }

  const signatureAccess = await checkPlanEntitlement(supabase, shop.id, "customer_signature", "Customer signature on invoices");
  const stampAccess = await checkPlanEntitlement(supabase, shop.id, "shop_stamp", "Shop stamp on invoices");
  const allowDigitalInvoiceAssets = signatureAccess.ok && stampAccess.ok;

  const { data: invoiceId, error } = await supabase.rpc("create_inventory_invoice", {
    p_shop_id: shop.id,
    p_customer: payload.customer,
    p_items: payload.items,
    p_payment_method: payload.payment_method,
    p_payment_details: payload.payment_details,
    p_customer_signature_url: allowDigitalInvoiceAssets ? payload.customer_signature_url ?? null : null,
    p_invoice_pdf_url: allowDigitalInvoiceAssets ? payload.send_ready_pdf_url ?? null : null,
    p_notes: payload.notes ?? null,
  });

  if (error || !invoiceId) {
    const raw = error?.message || "Failed to create invoice.";
    const friendly = mapInvoiceError(raw);
    return { status: "error", message: friendly };
  }

  await applyInvoiceDate(supabase, shop.id, invoiceId, invoiceDate.iso);

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
    data: invoice ? {
      ...invoice,
      send_ready_pdf_url: invoice.invoice_pdf_url ?? null,
      shop_postal_code: shop.postal_code ?? null,
    } : null,
  };
}

export async function deleteInvoiceAction(invoiceId: string, restockItems: boolean = true): Promise<ActionResponse> {
  const { shop } = await getWorkspaceData();
  if (!shop) return { status: "error", message: "No active shop found." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("delete_inventory_invoice", { 
    p_invoice_id: invoiceId, 
    p_restock_items: restockItems 
  });

  if (error) {
    return { status: "error", message: error.message || "Failed to delete bill." };
  }

  revalidatePath("/billing");
  revalidatePath("/dashboard");
  revalidatePath("/inventory");

  return { status: "success", message: "Bill deleted successfully." };
}

export async function updateInvoiceAction(
  _prevState: ActionResponse,
  formData: FormData
): Promise<ActionResponse> {
  const { shop } = await getWorkspaceData();
  if (!shop) return { status: "error", message: "No active shop found." };

  const payloadResult = parseJsonField(formData.get("invoice_payload"), UpdateInvoicePayloadSchema);
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
  const invoiceDate = resolveInvoiceDate(payload.invoice_date);
  if (!invoiceDate.ok) {
    return { status: "error", message: invoiceDate.message };
  }

  const supabase = await createSupabaseServerClient();
  const signatureAccess = await checkPlanEntitlement(supabase, shop.id, "customer_signature", "Customer signature on invoices");
  const stampAccess = await checkPlanEntitlement(supabase, shop.id, "shop_stamp", "Shop stamp on invoices");
  const allowDigitalInvoiceAssets = signatureAccess.ok && stampAccess.ok;

  const { data: updatedId, error } = await supabase.rpc("update_invoice_details", {
    p_invoice_id: payload.invoice_id,
    p_customer: payload.customer,
    p_items: payload.items,
    p_payment_method: payload.payment_method,
    p_payment_details: payload.payment_details,
    p_customer_signature_url: allowDigitalInvoiceAssets ? payload.customer_signature_url ?? null : null,
    p_invoice_pdf_url: allowDigitalInvoiceAssets ? payload.send_ready_pdf_url ?? null : null,
    p_notes: payload.notes ?? null,
  });

  if (error || !updatedId) {
    return { status: "error", message: mapInvoiceError(error?.message || "Failed to edit invoice.") };
  }

  const dateError = await applyInvoiceDate(supabase, shop.id, updatedId, invoiceDate.iso);
  if (dateError) {
    return { status: "error", message: dateError.message || "Invoice updated, but the bill date could not be saved." };
  }

  const { data: invoice } = await supabase
    .from("invoices")
    .select(`
      *,
      invoice_items (
        id, invoice_id, product_name_snapshot, brand_name_snapshot,
        category_name_snapshot, variant_name_snapshot, identifier_snapshot,
        quantity, unit_price, tax_rate, discount_amount, line_total
      )
    `)
    .eq("id", updatedId)
    .eq("shop_id", shop.id)
    .single();

  revalidatePath("/billing");
  revalidatePath("/dashboard");
  revalidatePath("/inventory");

  return {
    status: "success",
    message: "Invoice updated successfully.",
    data: invoice
      ? {
          ...invoice,
          send_ready_pdf_url: invoice.invoice_pdf_url ?? null,
        }
      : null,
  };
}
