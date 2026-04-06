"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { QrPayloadSchema } from "@/lib/qr";
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
    p_payment_details: payload.payment_details,
    p_notes: payload.notes ?? null,
  });

  if (error || !invoiceId) {
    const raw = error?.message || "Failed to create invoice.";
    const friendly = mapInvoiceError(raw);
    return { status: "error", message: friendly };
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

export async function resolveBillingQrAction(rawValue: string): Promise<
  ActionResponse<{
    kind: "UNIT" | "QTY";
    product_id: string;
    variant_id: string;
    inventory_item_id: string | null;
    identifier_value: string | null;
    unit_price: number;
  }>
> {
  const { shop } = await getWorkspaceData();
  if (!shop) return { status: "error", message: "No active shop found." };

  const parsed = (() => {
    try {
      return QrPayloadSchema.safeParse(JSON.parse(rawValue));
    } catch {
      return QrPayloadSchema.safeParse(rawValue);
    }
  })();

  if (!parsed.success) {
    return { status: "error", message: "This QR is not a valid DukaanHQ billing QR." };
  }

  const payload = parsed.data;

  if (payload.shop_id !== shop.id) {
    return { status: "error", message: "This QR belongs to a different shop." };
  }

  const supabase = await createSupabaseServerClient();

  if (payload.kind === "UNIT") {
    const { data: inventoryItem, error } = await supabase
      .from("inventory_items")
      .select(`
        id,
        product_id,
        variant_id,
        serial_number,
        imei_1,
        imei_2,
        unique_identifier,
        status,
        label_code,
        product:products!inner ( id, shop_id, base_selling_price ),
        variant:product_variants!inner ( id, selling_price_override ),
        identifiers:inventory_item_identifiers ( identifier_value, sort_order )
      `)
      .eq("id", payload.inventory_item_id)
      .eq("label_code", payload.label_code)
      .eq("product.shop_id", shop.id)
      .single();

    if (error || !inventoryItem) {
      return { status: "error", message: "This QR unit could not be found." };
    }

    if (inventoryItem.status !== "IN_STOCK") {
      return { status: "error", message: "This device is no longer available for sale." };
    }

    const productRow = Array.isArray(inventoryItem.product) ? inventoryItem.product[0] : inventoryItem.product;
    const variantRow = Array.isArray(inventoryItem.variant) ? inventoryItem.variant[0] : inventoryItem.variant;

    const identifierValue =
      inventoryItem.identifiers && inventoryItem.identifiers.length > 0
        ? inventoryItem.identifiers
            .slice()
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((item) => item.identifier_value)
            .join(" / ")
        : [inventoryItem.imei_1, inventoryItem.imei_2].filter(Boolean).join(" / ") ||
          inventoryItem.unique_identifier ||
          inventoryItem.serial_number;

    return {
      status: "success",
      message: "QR resolved.",
      data: {
        kind: "UNIT",
        product_id: inventoryItem.product_id,
        variant_id: inventoryItem.variant_id,
        inventory_item_id: inventoryItem.id,
        identifier_value: identifierValue || null,
        unit_price: Number(variantRow?.selling_price_override ?? productRow?.base_selling_price ?? 0),
      },
    };
  }

  const { data: variant, error } = await supabase
    .from("product_variants")
    .select(`
      id,
      product_id,
      quantity,
      label_code,
      product:products!inner ( id, shop_id, base_selling_price )
    `)
    .eq("id", payload.variant_id)
    .eq("label_code", payload.label_code)
    .eq("product.shop_id", shop.id)
    .single();

  if (error || !variant) {
    return { status: "error", message: "This QR product could not be found." };
  }

  if ((variant.quantity ?? 0) <= 0) {
    return { status: "error", message: "This product is out of stock." };
  }

  const productRow = Array.isArray(variant.product) ? variant.product[0] : variant.product;

  const { data: fullVariant } = await supabase
    .from("product_variants")
    .select("selling_price_override")
    .eq("id", variant.id)
    .eq("product_id", variant.product_id)
    .single();

  return {
    status: "success",
    message: "QR resolved.",
    data: {
      kind: "QTY",
      product_id: variant.product_id,
      variant_id: variant.id,
      inventory_item_id: null,
      identifier_value: null,
      unit_price: Number(fullVariant?.selling_price_override ?? productRow?.base_selling_price ?? 0),
    },
  };
}
