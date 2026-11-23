import type { createSupabaseServerClient } from "@/lib/supabase/server";
import type { CreateInvoicePayload } from "@/lib/types/billing";

// Validate the selected catalogue server-side, including restored browser drafts.
export async function validateInvoiceInventoryScope(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  shopId: string,
  payload: CreateInvoicePayload,
) {
  const ids = [...new Set(payload.items.flatMap((item) => item.product_id ? [item.product_id] : []))];
  if (!ids.length) return payload.is_second_hand ? "Add a second-hand phone to this bill." : null;
  const { data, error } = await supabase.from("products").select("id, is_second_hand")
    .eq("shop_id", shopId).in("id", ids);
  if (error || data?.length !== ids.length) return "One of the selected products could not be found.";
  if (data.some((product) => product.is_second_hand !== payload.is_second_hand)) {
    return "Select stock from the matching inventory tab. New and second-hand phones need separate bills.";
  }
  return null;
}
