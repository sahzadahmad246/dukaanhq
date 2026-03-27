"use client";

import { skipToken, useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowDown, ArrowUp, Loader2, RotateCcw, ShieldAlert, X } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { buildVariantLabel } from "@/lib/inventory-labels";
import { fetchProductDetails, productDetailsQueryKey } from "../queries";
import { adjustInventoryStockAction } from "../actions";

type AdjustmentType =
  | "ADJUSTMENT_ADD"
  | "ADJUSTMENT_REMOVE"
  | "RETURN"
  | "DAMAGE"
  | "RESTORE_RETURNED"
  | "RESTORE_DAMAGED";

function buildInventoryItemLabel(item: {
  serial_number: string;
  imei_1?: string | null;
  imei_2?: string | null;
  unique_identifier?: string | null;
  identifiers?: Array<{ identifier_value: string; sort_order: number }> | null;
}) {
  if (item.identifiers && item.identifiers.length > 0) {
    return item.identifiers
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((identifier) => identifier.identifier_value)
      .join(" / ");
  }

  if (item.imei_1 || item.imei_2) {
    return [item.imei_1, item.imei_2].filter(Boolean).join(" / ");
  }

  return item.unique_identifier || item.serial_number;
}

function AdjustmentCard({
  active,
  title,
  description,
  icon,
  tone,
  onClick,
}: {
  active: boolean;
  title: string;
  description: string;
  icon: React.ReactNode;
  tone: "emerald" | "amber" | "blue" | "rose";
  onClick: () => void;
}) {
  const toneClass =
    tone === "emerald"
      ? active
        ? "border-emerald-600 bg-emerald-50"
        : "border-emerald-100 bg-white hover:border-emerald-300"
      : tone === "amber"
        ? active
          ? "border-amber-600 bg-amber-50"
          : "border-amber-100 bg-white hover:border-amber-300"
        : tone === "blue"
          ? active
            ? "border-blue-600 bg-blue-50"
            : "border-blue-100 bg-white hover:border-blue-300"
          : active
            ? "border-rose-600 bg-rose-50"
            : "border-rose-100 bg-white hover:border-rose-300";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border p-4 text-left transition ${toneClass}`}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 text-stone-800">{icon}</div>
        <div>
          <p className="text-sm font-semibold text-stone-900">{title}</p>
          <p className="mt-1 text-xs leading-5 text-stone-500">{description}</p>
        </div>
      </div>
    </button>
  );
}

export function StockAdjustmentModal({
  open,
  productId,
  onClose,
  onAdjusted,
}: {
  open: boolean;
  productId: string | null;
  onClose: () => void;
  onAdjusted?: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [adjustmentType, setAdjustmentType] = useState<AdjustmentType>("ADJUSTMENT_ADD");
  const [variantId, setVariantId] = useState("");
  const [inventoryItemId, setInventoryItemId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [reason, setReason] = useState("");
  const [clientError, setClientError] = useState("");

  const { data: product, isLoading } = useQuery({
    queryKey: productId ? productDetailsQueryKey(productId) : ["inventory", "product-details", "adjust-idle"],
    queryFn: productId ? () => fetchProductDetails(productId) : skipToken,
    enabled: open && Boolean(productId),
    staleTime: 10 * 60 * 1000,
  });

  const activeVariantId = variantId || product?.variants?.[0]?.id || "";
  const isSerialized = product?.tracking_type === "SERIALIZED";

  const availableUnits = useMemo(() => {
    return (product?.inventory_items ?? []).filter((item) => {
      if (adjustmentType === "DAMAGE") {
        return item.status === "IN_STOCK" && (!activeVariantId || item.variant_id === activeVariantId);
      }

      if (adjustmentType === "RETURN") {
        return item.status === "SOLD" && (!activeVariantId || item.variant_id === activeVariantId);
      }

      if (adjustmentType === "RESTORE_DAMAGED") {
        return item.status === "DAMAGED" && (!activeVariantId || item.variant_id === activeVariantId);
      }

      if (adjustmentType === "RESTORE_RETURNED") {
        return item.status === "RETURNED" && (!activeVariantId || item.variant_id === activeVariantId);
      }

      return false;
    });
  }, [activeVariantId, adjustmentType, product?.inventory_items]);

  if (!open) return null;

  const quantityCards: Array<{ type: AdjustmentType; title: string; description: string; icon: React.ReactNode; tone: "emerald" | "amber" | "blue" | "rose" }> = [
    {
      type: "ADJUSTMENT_ADD",
      title: "Add Stock",
      description: "Increase quantity after manual correction or unbilled inward stock.",
      icon: <ArrowUp className="h-4 w-4" />,
      tone: "emerald",
    },
    {
      type: "ADJUSTMENT_REMOVE",
      title: "Remove Stock",
      description: "Decrease quantity when stock count is higher than actual physical stock.",
      icon: <ArrowDown className="h-4 w-4" />,
      tone: "amber",
    },
    {
      type: "RETURN",
      title: "Mark Returned",
      description: "Move quantity out of saleable stock after customer return or supplier send-back.",
      icon: <RotateCcw className="h-4 w-4" />,
      tone: "blue",
    },
    {
      type: "RESTORE_RETURNED",
      title: "Reverse Returned",
      description: "Add returned quantity back to saleable stock when it is approved again.",
      icon: <RotateCcw className="h-4 w-4" />,
      tone: "emerald",
    },
    {
      type: "DAMAGE",
      title: "Mark Damaged",
      description: "Reduce sellable stock for broken or unusable items.",
      icon: <ShieldAlert className="h-4 w-4" />,
      tone: "rose",
    },
    {
      type: "RESTORE_DAMAGED",
      title: "Reverse Damaged",
      description: "Restore stock after a damaged quantity was checked and approved again.",
      icon: <ArrowUp className="h-4 w-4" />,
      tone: "emerald",
    },
  ];

  const serializedCards: typeof quantityCards = [
    {
      type: "RETURN",
      title: "Mark Returned",
      description: "Move a sold serialized unit into returned status so it stays unavailable for sale.",
      icon: <RotateCcw className="h-4 w-4" />,
      tone: "blue",
    },
    {
      type: "DAMAGE",
      title: "Mark Damaged",
      description: "Remove an in-stock device from saleable inventory.",
      icon: <ShieldAlert className="h-4 w-4" />,
      tone: "rose",
    },
    {
      type: "RESTORE_RETURNED",
      title: "Reverse Returned",
      description: "Move a returned serialized unit back to in-stock status.",
      icon: <RotateCcw className="h-4 w-4" />,
      tone: "emerald",
    },
    {
      type: "RESTORE_DAMAGED",
      title: "Reverse Damaged",
      description: "Restore a damaged serialized unit back to in-stock status.",
      icon: <ArrowUp className="h-4 w-4" />,
      tone: "emerald",
    },
  ];

  const adjustmentCards = isSerialized ? serializedCards : quantityCards;

  function validate() {
    if (!product) {
      setClientError("Product details are still loading.");
      return false;
    }

    if (product.tracking_type === "QUANTITY_BASED") {
      if (!activeVariantId) {
        setClientError("Select the option to adjust.");
        return false;
      }

      const parsedQuantity = Number.parseInt(quantity, 10);
      if (!Number.isInteger(parsedQuantity) || parsedQuantity <= 0) {
        setClientError("Quantity must be at least 1.");
        return false;
      }
    } else if (!inventoryItemId) {
      setClientError("Select the exact device to adjust.");
      return false;
    }

    setClientError("");
    return true;
  }

  function submit() {
    if (!product || !validate()) return;

    startTransition(async () => {
      const result = await adjustInventoryStockAction({
        product_id: product.id,
        adjustment_type: adjustmentType,
        variant_id: product.tracking_type === "QUANTITY_BASED" ? activeVariantId : activeVariantId || null,
        inventory_item_id: product.tracking_type === "SERIALIZED" ? inventoryItemId : null,
        quantity: product.tracking_type === "QUANTITY_BASED" ? Number.parseInt(quantity, 10) || 1 : 1,
        reason: reason.trim() || null,
      });

      if (result.status === "success") {
        toast.success(result.message);
        onAdjusted?.();
        onClose();
        return;
      }

      toast.error(result.message);
      setClientError(result.message);
    });
  }

  return (
    <div className="fixed inset-0 z-[72] flex items-center justify-center bg-stone-950/45 px-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-[1.9rem] bg-[#fffdf8] shadow-[0_30px_80px_rgba(15,23,42,0.18)]">
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
          <div>
            <h3 className="text-lg font-semibold text-stone-950">Adjust Stock</h3>
            <p className="mt-1 text-sm text-stone-500">Correct stock, handle damage, or return sold items back to inventory.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-100 text-stone-500 transition hover:bg-stone-200 hover:text-stone-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 px-5 py-5">
          {isLoading || !product ? (
            <div className="flex h-32 items-center justify-center text-stone-500">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <>
              <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3">
                <p className="text-sm font-semibold text-stone-900">{product.name}</p>
                <p className="mt-1 text-xs text-stone-500">
                  {[product.brand?.name, product.category?.name].filter(Boolean).join(" • ") || "Inventory item"}
                </p>
              </div>

              <div className="space-y-2">
                <Label>Action</Label>
                <div className="grid gap-3 sm:grid-cols-2">
                  {adjustmentCards.map((card) => (
                    <AdjustmentCard
                      key={card.type}
                      active={adjustmentType === card.type}
                      title={card.title}
                      description={card.description}
                      icon={card.icon}
                      tone={card.tone}
                      onClick={() => {
                        setAdjustmentType(card.type);
                        setInventoryItemId("");
                        setClientError("");
                      }}
                    />
                  ))}
                </div>
              </div>

              {product.variants && product.variants.length > 0 ? (
                <div className="space-y-2">
                  <Label>{product.tracking_type === "QUANTITY_BASED" ? "Option" : "Filter By Variant"}</Label>
                  <Select
                    value={activeVariantId}
                    onChange={(event) => {
                      setVariantId(event.target.value);
                      setInventoryItemId("");
                      setClientError("");
                    }}
                  >
                    <option value="">Select variant</option>
                    {product.variants.map((variant) => (
                      <option key={variant.id} value={variant.id}>
                        {buildVariantLabel(variant) ?? product.name}
                      </option>
                    ))}
                  </Select>
                </div>
              ) : null}

              {product.tracking_type === "QUANTITY_BASED" ? (
                <div className="space-y-2">
                  <Label>Quantity</Label>
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
              ) : (
                <div className="space-y-2">
                  <Label>{product.product_kind === "MOBILE" ? "Device / IMEI" : "Device / Serial"}</Label>
                  <Select
                    value={inventoryItemId}
                    onChange={(event) => {
                      setInventoryItemId(event.target.value);
                      setClientError("");
                    }}
                  >
                    <option value="">Select stock unit</option>
                    {availableUnits.map((item) => (
                      <option key={item.id} value={item.id}>
                        {buildInventoryItemLabel(item)}
                      </option>
                    ))}
                  </Select>
                  {availableUnits.length === 0 ? (
                    <div className="flex items-start gap-2 rounded-2xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>
                        {adjustmentType === "RETURN"
                          ? "No sold units are available to mark returned right now."
                          : adjustmentType === "DAMAGE"
                            ? "No in-stock devices are available to mark as damaged."
                            : adjustmentType === "RESTORE_RETURNED"
                              ? "No returned units are available to restore."
                              : "No damaged units are available to restore."}
                      </span>
                    </div>
                  ) : null}
                </div>
              )}

              <div className="space-y-2">
                <Label>Reason / Note</Label>
                <Textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder={
                    adjustmentType === "DAMAGE"
                      ? "Screen cracked during handling"
                      : adjustmentType === "RETURN"
                        ? "Customer returned sealed item"
                        : adjustmentType === "RESTORE_RETURNED"
                          ? "Return check completed, move back to saleable stock"
                          : adjustmentType === "RESTORE_DAMAGED"
                            ? "Damage was corrected after inspection"
                        : "Manual stock correction after physical count"
                  }
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
            Save Adjustment
          </Button>
        </div>
      </div>
    </div>
  );
}
