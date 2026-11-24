"use client";
import { useEffect, useRef, useState } from "react";
import { Pencil, Upload, X } from "lucide-react";
import { superadminUpdateShopInfoAction } from "@/app/admin/saas/actions";
import { InvoiceFooterLinesEditor } from "@/components/invoice-footer-lines-editor";
import { adminButton, adminInput, adminSecondary } from "../../../_components/admin-ui";
import { SubscriptionActionButton } from "../../../subscriptions/_components/subscription-action-button";

type ShopRow = { id: string; name: string; phone: string; email: string; address_line_1: string; address_line_2: string | null; city: string; state: string; postal_code: string; logo_url: string | null };
type ShopSettingsRow = { invoice_prefix: string; invoice_footer: string | null };
export function ShopHeaderMore({ shop, shopSettings }: { shop: ShopRow; shopSettings: ShopSettingsRow | null }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [logo, setLogo] = useState(shop.logo_url ?? "");
  const [footer, setFooter] = useState(shopSettings?.invoice_footer ?? "");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    dialog.current?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open]);
  async function upload(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) { setError("Choose an image smaller than 5 MB."); return; }
    setUploading(true); setError("");
    try {
      const body = new FormData(); body.set("file", file);
      const response = await fetch("/api/onboarding-draft/logo", { method: "POST", body });
      const result = await response.json();
      if (!response.ok || !result.secureUrl) throw new Error(result.message || "Upload failed");
      setLogo(result.secureUrl);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Upload failed"); }
    finally { setUploading(false); }
  }
  const fields = [
    { key: "name", label: "Shop name", value: shop.name, type: "text", required: true },
    { key: "phone", label: "Phone", value: shop.phone, type: "tel", required: true },
    { key: "email", label: "Email", value: shop.email, type: "email", required: true },
    { key: "address_line_1", label: "Address", value: shop.address_line_1, type: "text", required: true },
    { key: "address_line_2", label: "Address line 2", value: shop.address_line_2 ?? "", type: "text", required: false },
    { key: "city", label: "City", value: shop.city, type: "text", required: true },
    { key: "state", label: "State", value: shop.state, type: "text", required: true },
    { key: "postal_code", label: "Postal code", value: shop.postal_code, type: "text", required: true },
    { key: "invoice_prefix", label: "Invoice prefix", value: shopSettings?.invoice_prefix ?? "", type: "text", required: true },
  ];
  return <><button type="button" className={adminSecondary} onClick={() => { setLogo(shop.logo_url ?? ""); setFooter(shopSettings?.invoice_footer ?? ""); setOpen(true); }}><Pencil className="h-4 w-4" />Edit shop</button>
    {open ? <dialog ref={dialog} aria-labelledby="edit-shop-title" onClose={() => setOpen(false)} className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-2xl border border-stone-200 bg-white p-0 text-stone-900 shadow-xl backdrop:bg-stone-950/50">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-stone-100 bg-white px-5 py-4"><h2 id="edit-shop-title" className="font-semibold">Edit shop details</h2><button type="button" aria-label="Close editor" onClick={() => dialog.current?.close()} className="flex h-11 w-11 items-center justify-center rounded-xl hover:bg-stone-100"><X className="h-5 w-5" /></button></div>
      <form action={superadminUpdateShopInfoAction} className="space-y-5 p-5"><input type="hidden" name="shop_id" value={shop.id} /><div className="grid gap-4 sm:grid-cols-2">{fields.map(field => <label key={field.key} className="block text-xs font-medium text-stone-500">{field.label}<input name={field.key} type={field.type} required={field.required} defaultValue={field.value} className={`${adminInput} mt-2`} /></label>)}</div><div><label className="text-xs font-medium text-stone-500">Logo URL<input name="logo_url" type="url" value={logo} onChange={event => setLogo(event.target.value)} className={`${adminInput} mt-2`} placeholder="https://…" /></label><label className={`${adminSecondary} mt-2 cursor-pointer`}><Upload className="h-4 w-4" />{uploading ? "Uploading…" : "Upload logo"}<input type="file" accept="image/*" disabled={uploading} className="sr-only" onChange={event => void upload(event.target.files?.[0])} /></label>{error ? <p role="alert" className="mt-2 text-xs text-rose-600">{error}</p> : null}</div><InvoiceFooterLinesEditor name="invoice_footer" value={footer} onChange={setFooter} /><div className="flex flex-wrap justify-end gap-2 border-t border-stone-100 pt-4"><button type="button" onClick={() => dialog.current?.close()} className={adminSecondary}>Cancel</button><fieldset disabled={uploading}><SubscriptionActionButton className={adminButton}>Save changes</SubscriptionActionButton></fieldset></div></form>
    </dialog> : null}</>;
}
