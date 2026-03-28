"use client";

import { skipToken, useQuery } from "@tanstack/react-query";
import { Loader2, X } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { buildVariantLabel } from "@/lib/inventory-labels";
import { fetchProductDetails, productDetailsQueryKey } from "../queries";
import { recordInventorySaleAction } from "../actions";

export function RecordSaleModal({
  open,
  productId,
  onClose,
  onRecorded,
}: {
  open: boolean;
  productId: string | null;
  onClose: () => void;
  onRecorded?: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [variantId, setVariantId] = useState("");
  const [inventoryItemId, setInventoryItemId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [reason, setReason] = useState("");
  const [clientError, setClientError] = useState("");

  const { data: product, isLoading } = useQuery({
    queryKey: productId ? productDetailsQueryKey(productId) : ["inventory", "product-details", "sale-idle"],
    queryFn: productId ? () => fetchProductDetails(productId) : skipToken,
    enabled: open && Boolean(productId),
    staleTime: 10 * 60 * 1000,
  });

  const activeVariantId = variantId || product?.variants?.[0]?.id || "";

  const availableUnits = useMemo(() => {
    return (product?.inventory_items ?? []).filter((item) => {
      if (item.status !== "IN_STOCK") return false;
      if (!activeVariantId) return true;
      return item.variant_id === activeVariantId;
    });
  }, [activeVariantId, product?.inventory_items]);

  if (!open) return null;

  function validate() {
    if (!product) {
      setClientError("Product details are still loading.");
      return false;
    }

    if (product.tracking_type === "SERIALIZED") {
      if (!inventoryItemId) {
        setClientError("Select the exact stock unit sold.");
        return false;
      }
    } else {
      if (!activeVariantId) {
        setClientError("Select the variant sold.");
        return false;
      }

      const parsedQuantity = Number.parseInt(quantity, 10);
      if (!Number.isInteger(parsedQuantity) || parsedQuantity <= 0) {
        setClientError("Quantity must be at least 1.");
        return false;
      }
    }

    setClientError("");
    return true;
  }

  function submit() {
    if (!product || !validate()) return;

    startTransition(async () => {
      const result = await recordInventorySaleAction({
        product_id: product.id,
        variant_id: product.tracking_type === "QUANTITY_BASED" ? activeVariantId : null,
        inventory_item_id: product.tracking_type === "SERIALIZED" ? inventoryItemId : null,
        quantity: product.tracking_type === "QUANTITY_BASED" ? Number.parseInt(quantity, 10) || 1 : 1,
        reason: reason.trim() || null,
      });

      if (result.status === "success") {
        toast.success(result.message);
        onRecorded?.();
        onClose();
        return;
      }

      toast.error(result.message);
      setClientError(result.message);
    });
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-stone-950/45 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[1.75rem] bg-white shadow-[0_30px_80px_rgba(15,23,42,0.18)]">
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
          <div>
            <h3 className="text-lg font-semibold text-stone-950">Record Sale</h3>
            <p className="mt-1 text-sm text-stone-500">Reduce stock without generating a bill.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-100 text-stone-500 transition hover:bg-stone-200 hover:text-stone-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          {isLoading || !product ? (
            <div className="flex h-32 items-center justify-center text-stone-500">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <>
              <div className="rounded-2xl bg-stone-50 px-4 py-3">
                <p className="text-sm font-semibold text-stone-900">{product.name}</p>
                <p className="mt-1 text-xs text-stone-500">
                  {[product.brand?.name, product.category?.name].filter(Boolean).join(" • ") || "Inventory item"}
                </p>
              </div>

              {product.variants && product.variants.length > 0 ? (
                <div className="space-y-2">
                  <Label>Variant</Label>
                  <Select
                    value={activeVariantId}
                    onValueChange={(val) => {
                      setVariantId(val);
                      setInventoryItemId("");
                      setClientError("");
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select variant" />
                    </SelectTrigger>
                    <SelectContent>
                      {product.variants.map((variant) => (
                        <SelectItem key={variant.id} value={variant.id}>
                          {buildVariantLabel(variant)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              {product.tracking_type === "SERIALIZED" ? (
                <div className="space-y-2">
                  <Label>{product.product_kind === "MOBILE" ? "Device / IMEI" : "Device / Serial"}</Label>
                  <Select
                    value={inventoryItemId}
                    onValueChange={(val) => {
                      setInventoryItemId(val);
                      setClientError("");
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select stock unit" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableUnits.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.identifiers && item.identifiers.length > 0
                            ? item.identifiers
                                .slice()
                                .sort((a, b) => a.sort_order - b.sort_order)
                                .map((identifier) => identifier.identifier_value)
                                .join(" / ")
                            : item.serial_number}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>Quantity Sold</Label>
                  <Input
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={(event) => {
                      setQuantity(event.target.value);
                      setClientError("");
                    }}
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label>Reason / Note</Label>
                <Textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Walk-in sale, no bill requested"
                  rows={3}
                />
              </div>

              {clientError ? <p className="text-sm text-rose-600">{clientError}</p> : null}
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-stone-200 px-5 py-4">
          <Button variant="ghost" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={isPending || isLoading || !product}>
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Record Sale
          </Button>
        </div>
      </div>
    </div>
  );
}
