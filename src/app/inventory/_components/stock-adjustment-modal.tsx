"use client";

import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Info, Loader2, X, MinusCircle, PlusCircle } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { buildVariantLabel } from "@/lib/inventory-labels";
import { fetchProductDetails, productDetailsQueryKey } from "../queries";
import { adjustInventoryStockAction, createProductVariantAction } from "../actions";

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
      .map((i) => i.identifier_value)
      .join(" / ");
  }
  if (item.imei_1 || item.imei_2) {
    return [item.imei_1, item.imei_2].filter(Boolean).join(" / ");
  }
  return item.unique_identifier || item.serial_number;
}

const ADJUSTMENT_OPTIONS: { value: AdjustmentType; label: string; description: string; serialized?: boolean }[] = [
  {
    value: "ADJUSTMENT_ADD",
    label: "Add Stock",
    description: "Increase qty after manual correction or unbilled inward stock.",
  },
  {
    value: "ADJUSTMENT_REMOVE",
    label: "Remove Stock",
    description: "Decrease qty when count is higher than actual physical stock.",
    serialized: true,
  },
];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-stone-400 mb-2">
      {children}
    </p>
  );
}

function FieldGroup({ label, children, action }: { label: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-[11px] font-semibold uppercase tracking-[0.1em] text-stone-500">{label}</Label>
        {action}
      </div>
      {children}
    </div>
  );
}

export function StockAdjustmentModal({
  open,
  productId,
  initialAdjustmentType = "ADJUSTMENT_ADD",
  onClose,
  onAdjusted,
}: {
  open: boolean;
  productId: string | null;
  initialAdjustmentType?: AdjustmentType;
  onClose: () => void;
  onAdjusted?: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const queryClient = useQueryClient();
  const [adjustmentType, setAdjustmentType] = useState<AdjustmentType>(initialAdjustmentType);
  const [variantId, setVariantId] = useState("");
  const [inventoryItemId, setInventoryItemId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [reason, setReason] = useState("");
  const [clientError, setClientError] = useState("");
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [isAddingNewVariant, setIsAddingNewVariant] = useState(false);
  const [newColor, setNewColor] = useState("");
  const [newStorage, setNewStorage] = useState("");
  const [newPrice, setNewPrice] = useState("");

  const { data: product, isLoading } = useQuery({
    queryKey: productId ? productDetailsQueryKey(productId) : ["inventory", "product-details", "adjust-idle"],
    queryFn: productId ? () => fetchProductDetails(productId) : skipToken,
    enabled: open && Boolean(productId),
    staleTime: 10 * 60 * 1000,
  });

  const activeVariantId = variantId || product?.variants?.[0]?.id || "";
  const isSerialized = product?.tracking_type === "SERIALIZED";

  const availableAdjustmentOptions = isSerialized
    ? ADJUSTMENT_OPTIONS.filter((o) => o.serialized)
    : ADJUSTMENT_OPTIONS.filter((o) => !o.serialized || o.value === "ADJUSTMENT_ADD" || o.value === "ADJUSTMENT_REMOVE");

  const availableUnits = useMemo(() => {
    return (product?.inventory_items ?? []).filter((item) => {
      if (adjustmentType === "ADJUSTMENT_REMOVE") {
        return item.status === "IN_STOCK" && (!activeVariantId || item.variant_id === activeVariantId);
      }
      return false;
    });
  }, [activeVariantId, adjustmentType, product?.inventory_items]);


  if (!open) return null;

  function validate() {
    if (!product) { setClientError("Product details are still loading."); return false; }
    if (product.tracking_type === "QUANTITY_BASED") {
      if (!activeVariantId) { setClientError("Select the option to adjust."); return false; }
      const parsed = Number.parseInt(quantity, 10);
      if (!Number.isInteger(parsed) || parsed <= 0) { setClientError("Quantity must be at least 1."); return false; }
    } else if (!inventoryItemId) {
      setClientError("Select the exact device to adjust."); return false;
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

  function handleCreateMissingVariant() {
    if (!newColor.trim() && !newStorage.trim()) { setClientError("Enter color or storage."); return; }
    if (!newPrice.trim() || Number(newPrice) < 0) { setClientError("Valid price is required."); return; }
    if (!product?.id) return;
    setClientError("");
    startTransition(async () => {
      const res = await createProductVariantAction({
        product_id: product.id,
        color: newColor,
        storage_label: newStorage,
        selling_price_override: Number(newPrice),
      });
      if (res.status === "success" && res.data) {
        setVariantId(res.data.id);
        setIsAddingNewVariant(false);
        setNewColor(""); setNewStorage(""); setNewPrice("");
        toast.success("New option added!");
        void queryClient.invalidateQueries({ queryKey: productDetailsQueryKey(product.id) });
      } else {
        setClientError(res.message);
        toast.error(res.message);
      }
    });
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[70] bg-stone-900/30 backdrop-blur-[2px] transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Sheet */}
      <div 
        className="fixed bottom-0 left-0 right-0 z-[72] flex max-h-[92vh] flex-col rounded-t-3xl bg-[#FAFAF8] shadow-2xl transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] sm:left-auto sm:right-4 sm:top-20 sm:h-[calc(100vh-6rem)] sm:w-[460px] sm:rounded-2xl"
        style={{ marginRight: 'var(--removed-body-scroll-bar-size, 0px)' }}
      >

        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="h-1 w-10 rounded-full bg-stone-300" />
        </div>

        {/* Header */}
        <div className="flex shrink-0 items-start justify-between px-5 py-4 sm:px-6 sm:py-5">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-stone-400">Inventory</span>
            <h3 className="mt-0.5 text-[19px] font-bold tracking-tight text-stone-900" style={{ fontFamily: "'Georgia', serif" }}>
              Adjust Stock
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-stone-200/70 text-stone-500 transition hover:bg-stone-200 hover:text-stone-800 mt-1"
          >
            <X className="h-3.5 w-3.5 stroke-[2.5]" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 pb-4 space-y-5">
          {isLoading || !product ? (
            <div className="flex h-40 flex-col items-center justify-center gap-3 text-stone-400">
              <Loader2 className="h-5 w-5 animate-spin" />
              <p className="text-xs font-medium">Fetching details…</p>
            </div>
          ) : (
            <>
              {/* Product title */}
              <div className="mb-2">
                <h3 className="text-xl font-black tracking-[-0.03em] text-stone-950">
                  {product.name}
                </h3>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] font-medium text-stone-500">
                  <span className="text-stone-700">{product.brand?.name || "No Brand"}</span>
                  <span className="text-stone-300">•</span>
                  <span className="text-stone-700">{product.category?.name || "No Category"}</span>
                </div>
              </div>

              {/* Action selector */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <SectionLabel>Action</SectionLabel>
                  <button
                    type="button"
                    onClick={() => setShowInfoModal(true)}
                    className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-stone-400 transition hover:text-stone-600"
                  >
                    <Info className="h-3 w-3" /> Info
                  </button>
                </div>

                {/* Card-style action picker */}
                <div className="grid grid-cols-2 gap-2">
                  {availableAdjustmentOptions.map((opt) => {
                    const isSelected = adjustmentType === opt.value;
                    const isAdd = opt.value === "ADJUSTMENT_ADD";
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          setAdjustmentType(opt.value);
                          setInventoryItemId("");
                          setClientError("");
                        }}
                        className={`flex flex-col items-start gap-2 rounded-2xl border p-3.5 text-left transition-all ${isSelected
                            ? isAdd
                              ? "border-emerald-300 bg-emerald-50 ring-1 ring-emerald-300"
                              : "border-red-200 bg-red-50 ring-1 ring-red-200"
                            : "border-stone-200 bg-white hover:border-stone-300"
                          }`}
                      >
                        <span className={`flex h-7 w-7 items-center justify-center rounded-full ${isSelected ? (isAdd ? "bg-emerald-100" : "bg-red-100") : "bg-stone-100"}`}>
                          {isAdd
                            ? <PlusCircle className={`h-4 w-4 ${isSelected ? "text-emerald-600" : "text-stone-400"}`} />
                            : <MinusCircle className={`h-4 w-4 ${isSelected ? "text-red-500" : "text-stone-400"}`} />
                          }
                        </span>
                        <span className={`text-[12px] font-bold ${isSelected ? (isAdd ? "text-emerald-800" : "text-red-700") : "text-stone-700"}`}>
                          {opt.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Variant selector */}
              {product.variants && product.variants.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <SectionLabel>{product.tracking_type === "QUANTITY_BASED" ? "Option / Variant" : "Filter by Variant"}</SectionLabel>
                    {!isAddingNewVariant && (
                      <button
                        type="button"
                        onClick={() => { setIsAddingNewVariant(true); setClientError(""); }}
                        className="text-[10px] font-bold uppercase tracking-[0.1em] text-stone-500 transition hover:text-stone-800"
                      >
                        + Add New
                      </button>
                    )}
                  </div>

                  {isAddingNewVariant ? (
                    <div className="flex items-center gap-2 rounded-xl bg-stone-50 px-4 py-3">
                      <Loader2 className="h-4 w-4 animate-spin text-stone-400" />
                      <p className="text-[13px] font-medium text-stone-600">Waiting for variant details...</p>
                    </div>
                  ) : (
                    <Select
                      value={activeVariantId}
                      onValueChange={(val) => {
                        setVariantId(val);
                        setInventoryItemId("");
                        setClientError("");
                      }}
                    >
                      <SelectTrigger className="h-11 rounded-xl border-stone-200 bg-white text-[13px] font-medium text-stone-800">
                        <SelectValue placeholder="Select variant" />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        {product.variants.map((variant) => (
                          <SelectItem key={variant.id} value={variant.id} className="text-[13px]">
                            {buildVariantLabel(variant) ?? product.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}

              {/* Quantity or device picker */}
              {product.tracking_type === "QUANTITY_BASED" ? (
                <div>
                  <SectionLabel>Quantity</SectionLabel>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => String(Math.max(1, Number(q) - 1)))}
                      className="flex h-11 w-11 items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-600 transition hover:bg-stone-50"
                    >
                      <MinusCircle className="h-4 w-4" />
                    </button>
                    <Input
                      type="number"
                      min="1"
                      value={quantity}
                      onChange={(e) => { setQuantity(e.target.value); setClientError(""); }}
                      className="h-11 flex-1 rounded-xl border-stone-200 bg-white text-center text-[15px] font-bold text-stone-900 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
                    />
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => String(Number(q) + 1))}
                      className="flex h-11 w-11 items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-600 transition hover:bg-stone-50"
                    >
                      <PlusCircle className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <SectionLabel>{product.product_kind === "MOBILE" ? "Device / IMEI" : "Device / Serial"}</SectionLabel>
                  <Select
                    value={inventoryItemId}
                    onValueChange={(val) => { setInventoryItemId(val); setClientError(""); }}
                    disabled={availableUnits.length === 0}
                  >
                    <SelectTrigger className="h-11 rounded-xl border-stone-200 bg-white text-[13px] font-medium text-stone-800">
                      <SelectValue placeholder="Select a unit" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      {availableUnits.map((item) => (
                        <SelectItem key={item.id} value={item.id} className="font-mono text-[12px]">
                          {buildInventoryItemLabel(item)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {availableUnits.length === 0 && (
                    <div className="mt-2.5 flex items-start gap-2.5 rounded-2xl border border-amber-100 bg-amber-50 px-3.5 py-3">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                      <p className="text-[12px] font-medium text-amber-800">No in-stock devices available to remove.</p>
                    </div>
                  )}
                </div>
              )}

              {/* Reason */}
              <div>
                <SectionLabel>Reason / Note <span className="normal-case tracking-normal text-stone-300 font-normal">— optional</span></SectionLabel>
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={
                    adjustmentType === "ADJUSTMENT_REMOVE"
                      ? "e.g. Manual stock correction, device removed…"
                      : "e.g. Unbilled inward stock, inventory correction…"
                  }
                  rows={3}
                  className="resize-none rounded-xl border-stone-200 bg-white text-[13px] leading-relaxed text-stone-800 placeholder:text-stone-400"
                />
              </div>

              {/* Error */}
              {clientError && (
                <div className="flex items-center gap-2.5 rounded-xl border border-red-100 bg-red-50 px-3.5 py-3">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
                  <p className="text-[12px] font-semibold text-red-600">{clientError}</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 gap-2.5 border-t border-stone-100 px-5 py-4 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="flex-1 rounded-xl border border-stone-200 bg-white py-2.5 text-[13px] font-semibold text-stone-700 transition hover:bg-stone-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={isPending || isLoading || !product}
            className="flex-1 rounded-xl bg-stone-900 py-2.5 text-[13px] font-semibold text-white transition hover:bg-stone-800 disabled:opacity-40"
          >
            {isPending ? <Loader2 className="inline h-4 w-4 animate-spin mr-1.5" /> : null}
            Save Adjustment
          </button>
        </div>
      </div>

      {/* Info modal */}
      {showInfoModal && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-stone-900/30 px-4 pb-6 backdrop-blur-[2px] sm:items-center sm:pb-0">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-stone-100">
                <Info className="h-5 w-5 text-stone-500" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-stone-400">About this action</p>
                <h4 className="mt-1 text-[16px] font-bold text-stone-900" style={{ fontFamily: "'Georgia', serif" }}>
                  {ADJUSTMENT_OPTIONS.find((c) => c.value === adjustmentType)?.label}
                </h4>
                <p className="mt-2 text-[13px] leading-relaxed text-stone-500">
                  {ADJUSTMENT_OPTIONS.find((c) => c.value === adjustmentType)?.description}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowInfoModal(false)}
              className="mt-6 w-full rounded-xl bg-stone-900 py-2.5 text-[13px] font-semibold text-white transition hover:bg-stone-800"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* Add New Variant Modal */}
      {isAddingNewVariant && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-stone-900/40 px-4 backdrop-blur-sm sm:items-start sm:pt-[15vh] transition-opacity animate-in fade-in duration-200">
          <div className="w-full max-w-[360px] rounded-3xl bg-white p-5 shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="text-base font-bold text-stone-900 mt-1">Add New Variant</h3>
            <p className="mt-1 text-[13px] text-stone-500 mb-5 leading-relaxed">
              Create a missing variant configuration to select it for this adjustment entry.
            </p>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <FieldGroup label="Color">
                  <Input value={newColor} onChange={(e) => setNewColor(e.target.value)} placeholder="e.g. Black" className="h-11 rounded-xl bg-stone-50 text-[13px]" />
                </FieldGroup>
                <FieldGroup label="Storage">
                  <Input value={newStorage} onChange={(e) => setNewStorage(e.target.value)} placeholder="e.g. 128GB" className="h-11 rounded-xl bg-stone-50 text-[13px]" />
                </FieldGroup>
              </div>
              <FieldGroup label="Selling Price">
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[14px] font-semibold text-stone-400">₹</span>
                  <Input type="number" min="0" step="0.01" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} placeholder="0.00" className="h-11 rounded-xl bg-stone-50 pl-8 text-[14px] font-medium [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]" />
                </div>
              </FieldGroup>
            </div>
            
            <div className="flex gap-2 pt-6 mt-2 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setIsAddingNewVariant(false)}
                disabled={isPending}
                className="flex-1 rounded-xl border border-stone-200 py-3 text-[13px] font-semibold text-stone-600 transition hover:bg-stone-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateMissingVariant}
                disabled={isPending}
                className="flex-1 rounded-xl bg-stone-900 py-3 text-[13px] font-semibold text-white transition hover:bg-stone-800 disabled:opacity-50"
              >
                {isPending ? <Loader2 className="inline h-4 w-4 animate-spin mr-1.5" /> : null}
                Save Variant
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
