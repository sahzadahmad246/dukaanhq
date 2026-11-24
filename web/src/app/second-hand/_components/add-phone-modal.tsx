"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Loader2, ScanBarcode, X } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/searchable-select";
import { StoragePresetPicker } from "@/app/inventory/_components/storage-preset-picker";
import { BarcodeScanner } from "@/app/inventory/_components/barcode-scanner";
import { getStoragePresetOptions } from "@/lib/inventory-labels";
import { mergePresetOptions, PRESET_BRAND_NAMES } from "@/lib/inventory-presets";
import { COUNTRY_CODES, sanitizeDigits } from "@/lib/phone";
import { SecondHandPhoneSchema } from "@/lib/types/second-hand";
import { addSecondHandPhoneAction } from "../actions";

const PURCHASE_SOURCES = ["Walk-in customer", "Another shop", "Wholesaler", "Online marketplace", "Trade-in / exchange"];
type ImeiField = "imei_1" | "imei_2";

function PresetChoiceField({ name, label, value, onChange, options, maxLength }: {
  name: string; label: string; value: string; onChange: (value: string) => void;
  options: string[]; maxLength: number;
}) {
  const [manual, setManual] = useState(false);
  const inputId = `used-phone-${name}`;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={inputId} className="text-sm font-medium">{label}</label>
        <button type="button" onClick={() => { setManual(!manual); onChange(""); }} className="text-sm font-medium text-teal-700 underline underline-offset-4">
          {manual ? "Choose from list" : "Add manually"}
        </button>
      </div>
      {manual ? (
        <Input id={inputId} required maxLength={maxLength} value={value} onChange={(event) => onChange(event.target.value)} placeholder={`Enter ${label.toLowerCase()}`} />
      ) : (
        <SearchableSelect inputId={inputId} value={value} onChange={onChange}
          options={options.map((option) => ({ value: option, label: option }))}
          placeholder={`Select ${label.toLowerCase()}`} emptyLabel="No match found. Use Add manually." />
      )}
      <input type="hidden" name={name} value={value} />
    </div>
  );
}

export function AddPhoneModal({ open, brands, purchaseSources = [], onClose, onSaved }: {
  open: boolean; brands: string[]; purchaseSources?: string[]; onClose: () => void; onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [sellerPhone, setSellerPhone] = useState("");
  const [source, setSource] = useState("");
  const [brand, setBrand] = useState("");
  const [storage, setStorage] = useState("");
  const [imeis, setImeis] = useState({ imei_1: "", imei_2: "" });
  const [scanningField, setScanningField] = useState<ImeiField | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const scannerRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const brandOptions = useMemo(() => mergePresetOptions(PRESET_BRAND_NAMES, brands), [brands]);
  const sourceOptions = useMemo(() => mergePresetOptions(PURCHASE_SOURCES, purchaseSources), [purchaseSources]);
  const storagePresets = getStoragePresetOptions({ productKind: "MOBILE", brandName: brand });
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (scanningField) scannerRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    else closeRef.current?.focus();
    function handleKey(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      if (event.key === "Escape" && !pending) {
        if (scanningField) { event.preventDefault(); setScanningField(null); }
        else onClose();
      }
      if (event.key !== "Tab") return;
      const root = scanningField ? scannerRef.current : formRef.current;
      const controls = Array.from(root?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled):not([type=hidden]), select:not(:disabled)") ?? [])
        .filter((element) => element.getClientRects().length > 0);
      if (!controls.length) return;
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", handleKey);
    return () => { document.body.style.overflow = overflow; document.removeEventListener("keydown", handleKey); previous?.focus(); };
  }, [open, pending, scanningField, onClose]);

  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-[70] flex items-end justify-center bg-stone-950/40 sm:items-center sm:p-4">
        <form ref={formRef} role="dialog" aria-modal="true" aria-labelledby="add-used-phone-title" inert={Boolean(scanningField)}
          className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white shadow-xl sm:rounded-3xl"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const parsed = SecondHandPhoneSchema.safeParse(Object.fromEntries(data.entries()));
            if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Complete the phone details."); return; }
            setError("");
            startTransition(async () => {
              try {
                const result = await addSecondHandPhoneAction(data);
                if (result.status !== "success") { setError(result.message); return; }
                toast.success(result.message);
                onSaved();
                onClose();
              } catch { setError("Could not save the phone. Please try again."); }
            });
          }}>
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-stone-100 bg-white px-5 py-4">
            <h2 id="add-used-phone-title" className="text-lg font-semibold">Add second-hand phone</h2>
            <button ref={closeRef} type="button" onClick={onClose} disabled={pending} aria-label="Close add phone form" className="rounded-full p-2 hover:bg-stone-100"><X className="h-5 w-5" /></button>
          </div>
          <fieldset disabled={pending} className="space-y-6 p-5">
            <section className="space-y-3" aria-labelledby="used-seller-label">
              <h3 id="used-seller-label" className="font-semibold text-stone-950">Purchased from</h3>
              <label className="block space-y-1.5 text-sm font-medium">Seller name<Input name="seller_name" required maxLength={120} autoComplete="off" placeholder="Seller’s full name" /></label>
              <div className="space-y-1.5">
                <label htmlFor="used-seller-phone" className="text-sm font-medium">Seller phone</label>
                <div className="flex gap-2">
                  <select name="seller_country_code" defaultValue="+91" required aria-label="Seller country code"
                    className="min-w-0 shrink-0 rounded-xl border border-stone-200 bg-stone-50 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-300">
                    {COUNTRY_CODES.map((country) => <option key={country.code} value={country.code}>{country.label}</option>)}
                  </select>
                  <Input id="used-seller-phone" name="seller_phone" type="tel" inputMode="numeric" autoComplete="off"
                    required minLength={10} maxLength={10} pattern="[0-9]{10}" title="Enter exactly 10 digits" value={sellerPhone}
                    onChange={(event) => setSellerPhone(sanitizeDigits(event.target.value, 10))}
                    className="min-w-0 flex-1" placeholder="10-digit number" aria-describedby="used-seller-phone-hint" />
                </div>
                <p id="used-seller-phone-hint" className="text-xs text-stone-500">10 digits, without the country code.</p>
              </div>
              <PresetChoiceField name="purchase_source" label="Purchase source" value={source} onChange={setSource} options={sourceOptions} maxLength={200} />
              <label className="block space-y-1.5 text-sm font-medium">Purchase date<Input name="purchase_date" type="date" required defaultValue={today} max={today} /></label>
              <label className="block space-y-1.5 text-sm font-medium">Original invoice <span className="font-normal text-stone-500">(optional)</span>
                <Input name="original_invoice" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" />
                <span className="block text-xs font-normal text-stone-500">PDF, JPG, PNG or WebP · up to 5 MB</span>
              </label>
            </section>
            <section className="space-y-3" aria-labelledby="used-phone-label">
              <h3 id="used-phone-label" className="font-semibold text-stone-950">Phone details</h3>
              <PresetChoiceField name="brand" label="Brand" value={brand} onChange={setBrand} options={brandOptions} maxLength={120} />
              <label className="block space-y-1.5 text-sm font-medium">Model<Input name="model" required maxLength={120} placeholder="iPhone 15" /></label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label htmlFor="used-phone-storage" className="text-sm font-medium">RAM / storage</label>
                  <StoragePresetPicker inputId="used-phone-storage" name="storage" required maxLength={80} value={storage}
                    onChange={setStorage} presets={storagePresets} placeholder="Select or type storage" />
                </div>
                <label className="space-y-1.5 text-sm font-medium">Colour<Input name="color" required maxLength={80} placeholder="Black" /></label>
              </div>
              {(["imei_1", "imei_2"] as const).map((field, index) => (
                <div key={field} className="space-y-1.5">
                  <label htmlFor={`used-phone-${field}`} className="text-sm font-medium">IMEI {index + 1}{index === 1 && <span className="font-normal text-stone-500"> (if applicable)</span>}</label>
                  <div className="flex gap-2">
                    <Input id={`used-phone-${field}`} name={field} inputMode="numeric" required={index === 0}
                      pattern="[0-9]{15}" minLength={15} maxLength={15} title="IMEI must contain exactly 15 digits"
                      value={imeis[field]} onChange={(event) => setImeis((current) => ({ ...current, [field]: sanitizeDigits(event.target.value, 15) }))}
                      className="min-w-0 flex-1" placeholder="15-digit IMEI" />
                    <Button type="button" variant="outline" className="h-11 w-11 shrink-0 p-0" onClick={() => setScanningField(field)} aria-label={`Scan IMEI ${index + 1}`}>
                      <ScanBarcode className="h-5 w-5" />
                    </Button>
                  </div>
                </div>
              ))}
            </section>
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1.5 text-sm font-medium">Purchase price (₹)<Input name="purchase_price" type="number" required min="0" max="9999999999.99" step="0.01" placeholder="0.00" /></label>
              <label className="space-y-1.5 text-sm font-medium">Selling price (₹)<Input name="selling_price" type="number" required min="0" max="9999999999.99" step="0.01" placeholder="0.00" /></label>
            </div>
            {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            <Button type="submit" className="w-full" disabled={pending}>{pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{pending ? "Adding phone…" : "Add to stock"}</Button>
          </fieldset>
        </form>
      </div>
      {scanningField && <div ref={scannerRef}>
        <BarcodeScanner expectedType="IMEI" zIndex={80} onClose={() => setScanningField(null)} onScan={(result) => {
          if (!/^\d{15}$/.test(result)) { toast.error("IMEI must contain exactly 15 digits."); return; }
          const otherField = scanningField === "imei_1" ? "imei_2" : "imei_1";
          if (imeis[otherField] === result) { toast.error("IMEI 1 and IMEI 2 must be different."); return; }
          setImeis((current) => ({ ...current, [scanningField]: result }));
          setScanningField(null);
        }} />
      </div>}
    </>
  );
}
