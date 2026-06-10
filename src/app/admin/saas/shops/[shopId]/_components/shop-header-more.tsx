"use client";

import { useState } from "react";
import { MoreVertical, Pencil, X } from "lucide-react";

import { setShopStatusAction, superadminUpdateShopInfoAction } from "@/app/admin/saas/actions";
import { InvoiceFooterLinesEditor } from "@/components/invoice-footer-lines-editor";

type ShopRow = any; // simplified for the component
type ShopSettingsRow = any;

export function ShopHeaderMore({ shop, shopSettings }: { shop: ShopRow; shopSettings: ShopSettingsRow | null }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [showEditList, setShowEditList] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  // Logo specific for edit
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [logoUploadError, setLogoUploadError] = useState("");

  const fields = [
    { key: "name", label: "Shop name", value: shop.name, type: "text" as const },
    { key: "logo_url", label: "Logo URL", value: shop.logo_url || "", type: "text" as const },
    { key: "phone", label: "Phone", value: shop.phone, type: "tel" as const },
    { key: "email", label: "Email", value: shop.email, type: "email" as const },
    { key: "address_line_1", label: "Address line 1", value: shop.address_line_1, type: "text" as const },
    { key: "address_line_2", label: "Address line 2", value: shop.address_line_2 || "", type: "text" as const },
    { key: "city", label: "City", value: shop.city, type: "text" as const },
    { key: "state", label: "State", value: shop.state, type: "text" as const },
    { key: "postal_code", label: "Postal code", value: shop.postal_code, type: "text" as const },
    { key: "invoice_prefix", label: "Invoice prefix", value: shopSettings?.invoice_prefix || "", type: "text" as const },
    { key: "invoice_footer", label: "Invoice footer", value: shopSettings?.invoice_footer || "", type: "textarea" as const },
  ];

  const currentField = fields.find((f) => f.key === editingField);

  function openFieldEdit(key: string) {
    const f = fields.find((ff) => ff.key === key);
    if (f) {
      setEditingField(key);
      setDraft(f.value);
      setShowEditList(false);
      setLogoPreviewUrl(key === 'logo_url' ? f.value : null);
      setIsUploadingLogo(false);
      setLogoUploadError('');
    }
  }

  async function handleLogoFileSelect(file: File | null) {
    if (!file) {
      setLogoPreviewUrl(null);
      setDraft('');
      return;
    }
    if (!file.type.startsWith('image/')) {
      setLogoUploadError('Only image files are allowed.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setLogoUploadError('Logo must be 5MB or smaller.');
      return;
    }
    setLogoUploadError('');
    setIsUploadingLogo(true);
    const objectUrl = URL.createObjectURL(file);
    setLogoPreviewUrl(objectUrl);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/onboarding-draft/logo', {
        method: 'POST',
        body: formData,
      });
      const result = await res.json();
      if (!res.ok || !result.secureUrl) {
        throw new Error(result.message || 'Upload failed');
      }
      setDraft(result.secureUrl);
    } catch (err: any) {
      setLogoUploadError(err.message || 'Could not upload logo.');
      setLogoPreviewUrl(null);
    } finally {
      setIsUploadingLogo(false);
    }
  }

  return (
    <>
      <div className="relative">
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-stone-100 text-stone-600"
          aria-label="More actions"
        >
          <MoreVertical className="h-4 w-4" />
        </button>

        {menuOpen && (
          <>
            <div className="absolute right-0 mt-2 w-44 rounded-xl border border-stone-200 bg-white shadow-lg py-1 z-50 text-sm">
              <form action={setShopStatusAction} className="contents">
                <input type="hidden" name="shop_id" value={shop.id} />
                <input type="hidden" name="status" value={shop.status === "suspended" ? "active" : "suspended"} />
                <button
                  type="submit"
                  onClick={() => setMenuOpen(false)}
                  className="w-full text-left px-4 py-2 hover:bg-stone-50"
                >
                  {shop.status === "suspended" ? "Unsuspend shop" : "Suspend shop"}
                </button>
              </form>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  setShowEditList(true);
                }}
                className="w-full text-left px-4 py-2 hover:bg-stone-50"
              >
                Edit shop
              </button>
            </div>
            <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
          </>
        )}
      </div>

      {/* Edit shop info modal: 
          - Mobile: full screen 
          - Desktop: half-width side panel (right aligned), full height */}
      {showEditList && (
        <div className="fixed inset-0 z-[80] bg-stone-950/40" onClick={() => setShowEditList(false)}>
          <div 
            className="bg-white w-full h-screen flex flex-col md:w-1/2 md:ml-auto shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b bg-white sticky top-0 z-10">
              <h3 className="text-lg font-semibold">Edit shop info</h3>
              <button onClick={() => setShowEditList(false)} className="p-2">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div 
              className="flex-1 overflow-auto p-5 space-y-1 scrollbar-thin scrollbar-thumb-stone-300 scrollbar-track-stone-100 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full"
              style={{
                scrollbarWidth: 'thin',
                scrollbarColor: '#d1d5db #f3f4f6'
              }}
            >
              {fields.map((f) => (
                <div key={f.key} className="flex items-center justify-between py-3 border-b border-stone-100 last:border-b-0">
                  <div className="min-w-0 pr-4">
                    <div className="text-xs font-medium uppercase tracking-[0.18em] text-stone-500">{f.label}</div>
                    {f.key === 'logo_url' ? (
                      f.value ? (
                        <img 
                          src={f.value} 
                          alt="Shop logo" 
                          className="mt-1 h-12 w-12 rounded-lg object-cover border border-stone-200" 
                        />
                      ) : (
                        <div className="mt-0.5 text-sm text-stone-500">No logo</div>
                      )
                    ) : (
                      <div className="mt-0.5 text-base font-semibold text-stone-950 truncate">{f.value || "—"}</div>
                    )}
                  </div>
                  <button
                    onClick={() => openFieldEdit(f.key)}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-600"
                    aria-label={`Edit ${f.label}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>

            <div className="p-4 border-t flex justify-end bg-white sticky bottom-0">
              <button onClick={() => setShowEditList(false)} className="px-4 py-2 text-sm font-medium text-stone-600 hover:text-stone-900">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Small modal for single field */}
      {editingField && currentField && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-stone-950/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h4 className="font-semibold text-lg">Edit {currentField.label}</h4>
              <button 
                onClick={() => { 
                  setEditingField(null); 
                  setDraft(""); 
                  setLogoPreviewUrl(null);
                  setIsUploadingLogo(false);
                  setLogoUploadError('');
                }} 
                className="p-1"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form
              action={superadminUpdateShopInfoAction}
              onSubmit={() => {
                setEditingField(null);
                setDraft("");
                setLogoPreviewUrl(null);
                setIsUploadingLogo(false);
                setLogoUploadError('');
              }}
            >
              <input type="hidden" name="shop_id" value={shop.id} />

              {/* Hidden current values for other fields */}
              {fields.map((f) => {
                if (f.key === editingField) return null;
                let fieldName = f.key;
                if (f.key === "logo_url") fieldName = "logo_url";
                if (f.key === "invoice_prefix") fieldName = "invoice_prefix";
                if (f.key === "invoice_footer") fieldName = "invoice_footer";
                if (["address_line_1", "address_line_2", "city", "state", "postal_code", "name", "phone", "email"].includes(f.key)) {
                  // already match
                }
                return <input key={f.key} type="hidden" name={fieldName} value={f.value} />;
              })}

              {editingField === "logo_url" ? (
                <div className="space-y-3">
                  {(logoPreviewUrl || currentField?.value) && (
                    <img 
                      src={logoPreviewUrl || currentField.value} 
                      alt="Logo preview" 
                      className="h-20 w-20 rounded-xl object-cover border border-stone-200" 
                    />
                  )}
                  <label className="flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-stone-300 p-6 text-center text-sm hover:bg-stone-50">
                    {isUploadingLogo ? 'Uploading...' : 'Select new logo file (max 5MB)'}
                    <input 
                      type="file" 
                      accept="image/*" 
                      className="hidden" 
                      onChange={(e) => handleLogoFileSelect(e.target.files?.[0] ?? null)}
                      disabled={isUploadingLogo}
                    />
                  </label>
                  {logoUploadError && <p className="text-xs text-red-600">{logoUploadError}</p>}
                  <input type="hidden" name="logo_url" value={draft} />
                </div>
              ) : editingField === "invoice_footer" ? (
                <InvoiceFooterLinesEditor
                  name="invoice_footer"
                  value={draft}
                  onChange={setDraft}
                />
              ) : (
                <input
                  type={currentField.type}
                  name={
                    editingField === "logo_url" ? "logo_url" :
                    editingField === "invoice_prefix" ? "invoice_prefix" :
                    editingField
                  }
                  value={draft}
                  onChange={(e) => setDraft(editingField === "email" ? e.target.value : e.target.value)}
                  className="w-full rounded-xl border border-stone-200 p-3 text-sm"
                  required={["name", "phone", "email", "address_line_1", "city", "state", "postal_code"].includes(editingField)}
                />
              )}

              <div className="mt-5 flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => { 
                    setEditingField(null); 
                    setDraft(""); 
                    setLogoPreviewUrl(null);
                    setIsUploadingLogo(false);
                    setLogoUploadError('');
                  }}
                  className="rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-full bg-stone-950 px-4 py-2 text-sm font-semibold text-white"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
