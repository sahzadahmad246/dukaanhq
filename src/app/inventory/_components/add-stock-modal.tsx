"use client";

import { useRef, useState, useTransition } from "react";
import { skipToken, useQuery } from "@tanstack/react-query";
import { ImagePlus, LoaderCircle, Plus, ScanBarcode, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addInventoryStockAction } from "../actions";
import { fetchProductDetails, productDetailsQueryKey } from "../queries";
import { BarcodeScanner } from "./barcode-scanner";

type MobileUnitDraft = {
  id: string;
  imei_1: string;
  imei_2: string;
};

type SerialUnitDraft = {
  id: string;
  value: string;
};

type StockImageDraft = {
  id: string;
  file: File;
  previewUrl: string;
};

function createMobileUnit(): MobileUnitDraft {
  return { id: crypto.randomUUID(), imei_1: "", imei_2: "" };
}

function createSerialUnit(): SerialUnitDraft {
  return { id: crypto.randomUUID(), value: "" };
}

function buildVariantLabel(variant: { name?: string | null; color?: string | null; storage_label?: string | null }) {
  return [variant.storage_label, variant.color, variant.name].filter(Boolean).join(" / ") || "Default";
}

export function AddStockModal({
  open,
  productId,
  onClose,
  onSaved,
}: {
  open: boolean;
  productId: string | null;
  onClose: () => void;
  onSaved?: () => void | Promise<void>;
}) {
  const [isPending, startTransition] = useTransition();
  const [createNewOption, setCreateNewOption] = useState(false);
  const [selectedVariantId, setSelectedVariantId] = useState<string>("");
  const [color, setColor] = useState("");
  const [storageLabel, setStorageLabel] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [mobileUnits, setMobileUnits] = useState<MobileUnitDraft[]>([createMobileUnit()]);
  const [serialUnits, setSerialUnits] = useState<SerialUnitDraft[]>([createSerialUnit()]);
  const [selectedImages, setSelectedImages] = useState<StockImageDraft[]>([]);
  const [scanningTarget, setScanningTarget] = useState<{ type: "imei_1" | "imei_2" | "serial"; unitId: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: product, isLoading } = useQuery({
    queryKey: productId ? productDetailsQueryKey(productId) : ["inventory", "product-details", "stock-idle"],
    queryFn: productId ? () => fetchProductDetails(productId) : skipToken,
    enabled: open && Boolean(productId),
    staleTime: 5 * 60 * 1000,
  });

  if (!open) return null;

  const isQuantityBased = product?.tracking_type === "QUANTITY_BASED";
  const isMobile = product?.product_kind === "MOBILE";
  const resolvedVariantId = selectedVariantId || product?.variants?.[0]?.id || "";

  function submit() {
    if (!productId || !product) return;

    startTransition(async () => {
      const formData = new FormData();
      formData.set("product_id", productId);
      formData.set("variant_id", createNewOption ? "" : resolvedVariantId || "");
      formData.set("color", createNewOption ? color : "");
      formData.set("storage_label", createNewOption ? storageLabel : "");
      formData.set("quantity", isQuantityBased ? quantity : "");
      formData.set("identifier_type", isMobile ? "IMEI" : "SERIAL_NUMBER");
      formData.set(
        "units",
        JSON.stringify(
          isQuantityBased
            ? []
            : isMobile
              ? mobileUnits
                  .filter((unit) => unit.imei_1.trim())
                  .map((unit) => ({
                    imei_1: unit.imei_1.trim(),
                    imei_2: unit.imei_2.trim() || null,
                  }))
              : serialUnits
                  .filter((unit) => unit.value.trim())
                  .map((unit) => ({
                    serial_number: unit.value.trim(),
                  }))
        )
      );
      for (const image of selectedImages) {
        formData.append("images", image.file, image.file.name);
      }

      const result = await addInventoryStockAction(formData);

      if (result.status === "success") {
        toast.success(result.message);
        await onSaved?.();
        onClose();
      } else {
        toast.error(result.message);
      }
    });
  }

  function addImages(files: FileList | null) {
    if (!files || files.length === 0) return;
    const next = Array.from(files).map((file) => ({
      id: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    setSelectedImages((current) => [...current, ...next]);
  }

  function removeImage(imageId: string) {
    setSelectedImages((current) => {
      const image = current.find((item) => item.id === imageId);
      if (image) {
        URL.revokeObjectURL(image.previewUrl);
      }
      return current.filter((item) => item.id !== imageId);
    });
  }

  return (
    <div className="fixed inset-0 z-[72] flex items-center justify-center bg-stone-950/45 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[1.75rem] bg-white p-5 shadow-[0_30px_80px_rgba(15,23,42,0.18)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-stone-950">Add Stock</h3>
            <p className="text-sm text-stone-500">{product?.name ?? "Loading..."}</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-100 text-stone-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        {isLoading || !product ? (
          <div className="flex min-h-[240px] items-center justify-center">
            <LoaderCircle className="h-6 w-6 animate-spin text-stone-500" />
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            {product.tracking_type === "SERIALIZED" ? (
              <div className="space-y-3 rounded-2xl border border-stone-200 bg-stone-50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <Label className="text-sm font-medium text-stone-900">Option</Label>
                  <button
                    type="button"
                    onClick={() => setCreateNewOption((current) => !current)}
                    className="text-xs font-semibold text-teal-700"
                  >
                    {createNewOption ? "Use Existing" : "Create New"}
                  </button>
                </div>

                {createNewOption ? (
                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs uppercase tracking-[0.12em] text-stone-500">Color</Label>
                      <Input value={color} onChange={(event) => setColor(event.target.value)} className="mt-2" placeholder="Black" />
                    </div>
                    <div>
                      <Label className="text-xs uppercase tracking-[0.12em] text-stone-500">Storage / RAM</Label>
                      <Input value={storageLabel} onChange={(event) => setStorageLabel(event.target.value)} className="mt-2" placeholder="8GB / 128GB" />
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-stone-200 bg-white">
                    <select
                      value={selectedVariantId}
                      onChange={(event) => setSelectedVariantId(event.target.value)}
                      className="h-11 w-full rounded-xl bg-white px-3 text-sm text-stone-900 outline-none"
                    >
                      {(product.variants ?? []).map((variant) => (
                        <option key={variant.id} value={variant.id}>
                          {buildVariantLabel(variant)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            ) : null}

            {isQuantityBased ? (
              <div>
                <Label className="text-sm font-medium text-stone-900">Quantity to Add</Label>
                <Input value={quantity} onChange={(event) => setQuantity(event.target.value)} type="number" min="1" className="mt-2" />
              </div>
            ) : isMobile ? (
              <div className="space-y-3">
                {mobileUnits.map((unit, index) => (
                  <div key={unit.id} className="rounded-2xl border border-stone-200 p-3">
                    <p className="mb-3 text-sm font-medium text-stone-900">Device {index + 1}</p>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Input value={unit.imei_1} onChange={(event) => setMobileUnits((current) => current.map((item) => item.id === unit.id ? { ...item, imei_1: event.target.value } : item))} placeholder="IMEI 1" />
                        <Button type="button" variant="ghost" className="h-11 w-11 px-0" onClick={() => setScanningTarget({ type: "imei_1", unitId: unit.id })}>
                          <ScanBarcode className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input value={unit.imei_2} onChange={(event) => setMobileUnits((current) => current.map((item) => item.id === unit.id ? { ...item, imei_2: event.target.value } : item))} placeholder="IMEI 2" />
                        <Button type="button" variant="ghost" className="h-11 w-11 px-0" onClick={() => setScanningTarget({ type: "imei_2", unitId: unit.id })}>
                          <ScanBarcode className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
                <Button type="button" variant="secondary" onClick={() => setMobileUnits((current) => [...current, createMobileUnit()])}>
                  <Plus className="h-4 w-4" />
                  Add Another Device
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {serialUnits.map((unit, index) => (
                  <div key={unit.id} className="flex items-center gap-2">
                    <Input value={unit.value} onChange={(event) => setSerialUnits((current) => current.map((item) => item.id === unit.id ? { ...item, value: event.target.value } : item))} placeholder={`Serial ${index + 1}`} />
                    <Button type="button" variant="ghost" className="h-11 w-11 px-0" onClick={() => setScanningTarget({ type: "serial", unitId: unit.id })}>
                      <ScanBarcode className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="secondary" onClick={() => setSerialUnits((current) => [...current, createSerialUnit()])}>
                  <Plus className="h-4 w-4" />
                  Add Another Serial
                </Button>
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-sm font-medium text-stone-900">Option Images (Optional)</Label>
              <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-3">
                <div className="scrollbar-hidden flex gap-3 overflow-x-auto pb-1">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl border border-dashed border-stone-300 bg-white text-stone-400 transition hover:border-teal-700 hover:text-teal-700"
                  >
                    <ImagePlus className="h-6 w-6" />
                  </button>
                  {selectedImages.map((image) => (
                    <div key={image.id} className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-stone-200 bg-white">
                      <img src={image.previewUrl} alt="Selected stock" className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeImage(image.id)}
                        className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-stone-950/80 text-white"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs text-stone-500">
                  These images will be added to the selected option during refill.
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(event) => {
                  addImages(event.target.files);
                  event.currentTarget.value = "";
                }}
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" onClick={onClose} disabled={isPending}>Cancel</Button>
              <Button onClick={submit} disabled={isPending}>
                {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
                Save Stock
              </Button>
            </div>
          </div>
        )}
      </div>

      {scanningTarget ? (
        <BarcodeScanner
          expectedType={scanningTarget.type === "serial" ? "SERIAL" : "IMEI"}
          onScan={(result) => {
            if (scanningTarget.type === "serial") {
              setSerialUnits((current) => current.map((unit) => unit.id === scanningTarget.unitId ? { ...unit, value: result } : unit));
            } else {
              setMobileUnits((current) =>
                current.map((unit) =>
                  unit.id === scanningTarget.unitId ? { ...unit, [scanningTarget.type]: result } : unit
                )
              );
            }
            setScanningTarget(null);
          }}
          onClose={() => setScanningTarget(null)}
        />
      ) : null}
    </div>
  );
}
