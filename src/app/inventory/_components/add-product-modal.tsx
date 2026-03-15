"use client";

import { useActionState, useEffect, useState } from "react";
import { X, Loader2 } from "lucide-react";
import { createProductAction } from "@/app/inventory/actions";
import { toast } from "sonner";

export function AddProductModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [state, formAction, isPending] = useActionState(createProductAction, {
    status: "success",
    message: "",
  });

  const [trackingType, setTrackingType] = useState<"SERIALIZED" | "QUANTITY_BASED">("QUANTITY_BASED");

  useEffect(() => {
    if (state.status === "success" && state.message) {
      toast.success(state.message);
      onClose();
    } else if (state.status === "error" && state.message) {
      toast.error(state.message);
    }
  }, [state, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 px-4">
      <div className="w-full max-w-lg overflow-hidden rounded-[1.5rem] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-semibold text-stone-900">Add Product</h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-stone-100 text-stone-500 hover:text-stone-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-6 py-4">
          <form action={formAction} id="add-product-form" className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-stone-700">Product Name *</label>
              <input
                name="name"
                required
                className="w-full rounded-xl border px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                placeholder="e.g. iPhone 15 Pro"
              />
              {state.fieldErrors?.name && <p className="mt-1 text-xs text-red-500">{state.fieldErrors.name}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-stone-700">Purchase Price</label>
                <input
                  name="base_purchase_price"
                  type="number"
                  defaultValue={0}
                  className="w-full rounded-xl border px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-stone-700">Selling Price</label>
                <input
                  name="base_selling_price"
                  type="number"
                  defaultValue={0}
                  className="w-full rounded-xl border px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-stone-700">Tracking Type *</label>
              <select
                name="tracking_type"
                value={trackingType}
                onChange={(e) => setTrackingType(e.target.value as "SERIALIZED" | "QUANTITY_BASED")}
                className="w-full rounded-xl border px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value="QUANTITY_BASED">Quantity Based (Chargers, Cables)</option>
                <option value="SERIALIZED">Serialized (Mobiles, Laptops)</option>
              </select>
            </div>

            {trackingType === "QUANTITY_BASED" && (
              <div>
                <label className="mb-1 block text-sm font-medium text-stone-700">Initial Stock Quantity</label>
                <input
                  name="initial_stock"
                  type="number"
                  defaultValue={0}
                  className="w-full rounded-xl border px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>
            )}

            {trackingType === "SERIALIZED" && (
              <div>
                <label className="mb-1 block text-sm font-medium text-stone-700">Serial Numbers / IMEIs (comma separated)</label>
                <textarea
                  name="serial_numbers"
                  rows={3}
                  className="w-full rounded-xl border px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  placeholder="351..., 352..."
                />
              </div>
            )}

            <div>
              <label className="mb-1 block text-sm font-medium text-stone-700">Low Stock Alert Threshold</label>
              <input
                name="low_stock_threshold"
                type="number"
                defaultValue={5}
                className="w-full rounded-xl border px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            
            <input type="hidden" name="is_active" value="true" />
            <input type="hidden" name="tax_rate" value="0" />
          </form>
        </div>

        <div className="flex items-center justify-end gap-3 border-t bg-stone-50 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded-xl px-5 py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-200"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="add-product-form"
            disabled={isPending}
            className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Product
          </button>
        </div>
      </div>
    </div>
  );
}
