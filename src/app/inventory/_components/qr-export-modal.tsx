"use client";

import { useMemo, useState, useTransition } from "react";
import { Loader2, QrCode, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { downloadQrSheetPdf } from "@/lib/qr-pdf";
import { getQrExportEntriesAction } from "../actions";

type ProductSummary = {
  id: string;
  name: string;
};

type OptionSummary = {
  id: string;
  name: string;
};

type Scope = "product" | "brand" | "category";

export function QrExportModal({
  open,
  onClose,
  products,
  brands,
  categories,
}: {
  open: boolean;
  onClose: () => void;
  products: ProductSummary[];
  brands: OptionSummary[];
  categories: OptionSummary[];
}) {
  const [scope, setScope] = useState<Scope>("product");
  const [value, setValue] = useState("");
  const [isPending, startTransition] = useTransition();

  const scopeOptions = useMemo(() => {
    if (scope === "product") return products;
    if (scope === "brand") return brands;
    return categories;
  }, [brands, categories, products, scope]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[74] flex items-center justify-center bg-stone-950/45 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[1.75rem] bg-white shadow-[0_30px_80px_rgba(15,23,42,0.18)]">
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
          <div>
            <h3 className="text-lg font-semibold text-stone-950">Bulk QR Export</h3>
            <p className="mt-1 text-sm text-stone-500">Generate a clean A4 QR sheet with 24 QR codes per page.</p>
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
          <div className="grid grid-cols-3 gap-2 rounded-2xl bg-stone-100 p-1">
            {(["product", "brand", "category"] as Scope[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => {
                  setScope(item);
                  setValue("");
                }}
                className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${scope === item ? "bg-white text-stone-950 shadow-sm" : "text-stone-500 hover:text-stone-900"}`}
              >
                {item === "product" ? "Product" : item === "brand" ? "Brand" : "Category"}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            <Label>{scope === "product" ? "Select Product" : scope === "brand" ? "Select Brand" : "Select Category"}</Label>
            <Select value={value} onValueChange={(val) => setValue(val)}>
              <SelectTrigger>
                <SelectValue placeholder={`Select ${scope}`} />
              </SelectTrigger>
              <SelectContent>
                {scopeOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-600">
            Each A4 page uses a fixed 4 x 6 grid. Single QR exports also start from the top-left cell for consistent printing.
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-stone-200 px-5 py-4">
          <Button variant="ghost" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            disabled={isPending || !value}
            onClick={() =>
              startTransition(async () => {
                const result = await getQrExportEntriesAction({ scope, value });
                if (result.status === "error" || !result.data) {
                  toast.error(result.message);
                  return;
                }

                await downloadQrSheetPdf(result.data.entries, result.data.fileName);
                toast.success("QR sheet downloaded.");
                onClose();
              })
            }
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
            Download PDF
          </Button>
        </div>
      </div>
    </div>
  );
}
