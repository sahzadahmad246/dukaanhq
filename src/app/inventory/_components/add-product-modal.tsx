"use client";

import { useState, useRef, useEffect, useActionState } from "react";
import { PackageOpen, X, ScanBarcode, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ActionResponse, createProductAction } from "../actions";
import { BarcodeScanner } from "./barcode-scanner";

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

  // Serial Number List State
  const [serialItems, setSerialItems] = useState<{ id: string; type: string; value: string }[]>([
    { id: "init-1", type: "IMEI", value: "" },
  ]);
  const [scanningId, setScanningId] = useState<string | null>(null);

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
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="mb-1 block text-sm font-medium text-stone-700">Product Name *</label>
                <input
                  name="name"
                  required
                  className="w-full rounded-xl border px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  placeholder="e.g. iPhone 15 Pro"
                />
                {state.fieldErrors?.name && <p className="mt-1 text-xs text-red-500">{state.fieldErrors.name}</p>}
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-sm font-medium text-stone-700">Category</label>
                <input
                  name="category_name"
                  className="w-full rounded-xl border px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  placeholder="e.g. Mobiles, Cables, Chargers"
                />
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-1">
                <label className="mb-1 block text-sm font-medium text-stone-700">Product Image</label>
                <input
                  name="image"
                  type="file"
                  accept="image/*"
                  className="w-full rounded-xl border bg-stone-50 px-3 py-1.5 text-sm file:mr-4 file:rounded-xl file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100"
                />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-sm font-medium text-stone-700">Tracking Model</label>
                <select
                  name="tracking_type"
                  className="w-full rounded-xl border bg-stone-50 px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  value={trackingType}
                  onChange={(e) => setTrackingType(e.target.value as "QUANTITY_BASED" | "SERIALIZED")}
                >
                  <option value="QUANTITY_BASED">Quantity Based (e.g. Cables)</option>
                  <option value="SERIALIZED">Serialized (e.g. Mobiles, Laptops)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-stone-700">Purchase Price</label>
                <input
                  name="base_purchase_price"
                  type="number"
                  min="0"
                  required
                  className="w-full rounded-xl border px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-stone-700">Selling Price</label>
                <input
                  name="base_selling_price"
                  type="number"
                  min="0"
                  required
                  className="w-full rounded-xl border px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  placeholder="0.00"
                />
              </div>
            </div>

            {trackingType === "QUANTITY_BASED" ? (
              <div>
                <label className="mb-1 block text-sm font-medium text-stone-700">Initial Stock</label>
                <input
                  name="initial_stock"
                  type="number"
                  min="0"
                  className="w-full rounded-xl border px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  placeholder="Total units available right now"
                />
              </div>
            ) : (
              <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <label className="text-sm font-medium text-stone-700">Serial Numbers</label>
                  <button
                    type="button"
                    onClick={() =>
                      setSerialItems((prev) => [
                        ...prev,
                        { id: Math.random().toString(36).substr(2, 9), type: "IMEI", value: "" },
                      ])
                    }
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-blue-700 transition hover:bg-blue-100"
                  >
                    <Plus className="h-3 w-3" /> Add Item
                  </button>
                </div>
                
                <input 
                  type="hidden" 
                  name="serial_numbers" 
                  value={serialItems
                    .filter(i => i.value.trim().length > 0)
                    .map(i => i.type + ":" + i.value.trim())
                    .join(",")} 
                />

                <div className="grid gap-3">
                  {serialItems.map((item, index) => (
                    <div key={item.id} className="flex items-center gap-2">
                      <select
                        value={item.type}
                        onChange={(e) => {
                          const newItems = [...serialItems];
                          newItems[index].type = e.target.value;
                          setSerialItems(newItems);
                        }}
                        className="w-28 shrink-0 rounded-xl border bg-white px-3 py-2 text-xs font-medium outline-none focus:border-blue-500"
                      >
                        <option value="IMEI">IMEI</option>
                        <option value="SerialNo">Serial No.</option>
                        <option value="UniqueId">Unique ID</option>
                      </select>
                      <div className="relative flex-1">
                        <input
                          type="text"
                          value={item.value}
                          onChange={(e) => {
                            const newItems = [...serialItems];
                            newItems[index].value = e.target.value;
                            setSerialItems(newItems);
                          }}
                          className="w-full rounded-xl border px-4 py-2 pr-10 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                          placeholder="Scan or type..."
                        />
                        <button
                          type="button"
                          onClick={() => setScanningId(item.id)}
                          className="absolute bottom-0 right-0 top-0 flex w-10 items-center justify-center text-stone-400 transition hover:text-blue-600"
                        >
                          <ScanBarcode className="h-4 w-4" />
                        </button>
                      </div>
                      {serialItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            setSerialItems((prev) => prev.filter((i) => i.id !== item.id));
                          }}
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-stone-400 hover:bg-rose-100 hover:text-rose-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
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
            {isPending && <PackageOpen className="h-4 w-4 animate-spin" />}
            Save Product
          </button>
        </div>
      </div>

      {scanningId && (
        <BarcodeScanner
          onScan={(result) => {
            const newItems = [...serialItems];
            const itemIndex = newItems.findIndex((i) => i.id === scanningId);
            if (itemIndex > -1) {
              newItems[itemIndex].value = result;
              setSerialItems(newItems);
            }
            setScanningId(null);
            toast.success("Barcode scanned successfully!");
          }}
          onClose={() => setScanningId(null)}
        />
      )}
    </div>
  );
}
