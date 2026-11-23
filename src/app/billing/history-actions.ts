"use server";

import { getWorkspaceData } from "@/lib/workspace/get-workspace-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { InvoiceHistoryRequestSchema, readInvoiceHistoryPage } from "@/lib/billing/invoice-history";

export async function loadMoreInvoicesAction(input: unknown) {
  const request = InvoiceHistoryRequestSchema.parse(input);
  const { shop } = await getWorkspaceData(request.isSecondHand ? { requireOwner: true } : undefined);
  if (!shop || shop.id !== request.shopId) throw new Error("Bill history is not available for this shop.");
  return readInvoiceHistoryPage(await createSupabaseServerClient(), request);
}
