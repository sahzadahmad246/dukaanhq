"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, LoaderCircle, Pencil, X } from "lucide-react";
import { toast } from "sonner";

import { LocationPicker } from "@/app/onboarding/_components/location-picker";
import { InvoiceFooterLinesEditor } from "@/components/invoice-footer-lines-editor";

type EditableField =
  | "shopName"
  | "slug"
  | "category"
  | "addressLine1"
  | "addressLine2"
  | "city"
  | "state"
  | "postalCode"
  | "invoicePrefix"
  | "currency"
  | "taxMode"
  | "openingTime"
  | "closingTime"
  | "workingDays"
  | "invoiceFooter"
  | "location";

const workingDayOptions = [
  { value: "monday", label: "Mon" },
  { value: "tuesday", label: "Tue" },
  { value: "wednesday", label: "Wed" },
  { value: "thursday", label: "Thu" },
  { value: "friday", label: "Fri" },
  { value: "saturday", label: "Sat" },
  { value: "sunday", label: "Sun" },
] as const;

type Row = {
  label: string;
  value: string;
  field?: EditableField;
  control?: "edit" | "none";
};

type SettingsState = {
  shopName: string;
  ownerName: string;
  slug: string;
  status: string;
  category: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  invoicePrefix: string;
  currency: string;
  taxMode: string;
  onboarding: string;
  openingTime: string;
  closingTime: string;
  workingDays: string;
  invoiceFooter: string;
  ownerEmail: string;
  latitude: number | null;
  longitude: number | null;
};

function titleCase(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDisplayValue(field: Row["field"], value: string) {
  if (!value.trim()) {
    return "-";
  }

  if (field === "category" || field === "taxMode") {
    return titleCase(value.replaceAll("_", " "));
  }

  if (field === "workingDays") {
    return value
      .split(",")
      .map((day) => titleCase(day.trim()))
      .filter(Boolean)
      .join(", ");
  }

  return value;
}

function DetailSection({
  title,
  statusBadge,
  rows,
  onEdit,
}: {
  title: string;
  statusBadge?: { label: string; tone: "active" | "inactive" };
  rows: Row[];
  onEdit: (field: EditableField) => void;
}) {
  return (
    <section className="grid gap-3">
      <div className="flex items-center justify-between gap-3 px-1">
        <h2 className="text-sm font-semibold text-stone-700">{title}</h2>
        {statusBadge ? (
          <span
            className={[
              "rounded-full px-3 py-1 text-xs font-semibold",
              statusBadge.tone === "active"
                ? "bg-emerald-100 text-emerald-700"
                : "bg-rose-100 text-rose-700",
            ].join(" ")}
          >
            {statusBadge.label}
          </span>
        ) : null}
      </div>
      <div className="overflow-hidden rounded-[1.7rem] bg-white shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
        {rows.map((row, index) => (
          <div
            key={`${title}-${row.label}-${index}`}
            className={[
              "flex items-start justify-between gap-4 px-5 py-4",
              index !== rows.length - 1 ? "border-b border-stone-100" : "",
            ].join(" ")}
          >
            <div className="flex-1">
              <div className="text-xs font-medium uppercase tracking-[0.18em] text-stone-500">{row.label}</div>
              <div className="mt-1 whitespace-pre-line text-base font-semibold text-stone-950">{formatDisplayValue(row.field, row.value)}</div>
            </div>
            {row.control === "none" || !row.field ? null : (
              <button
                type="button"
                onClick={() => onEdit(row.field!)}
                className="mt-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-600"
                aria-label={`Edit ${row.label}`}
              >
                <Pencil className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function formatFieldLabel(field: EditableField) {
  const map: Record<EditableField, string> = {
    shopName: "Shop name",
    slug: "Slug",
    category: "Category",
    addressLine1: "Address line 1",
    addressLine2: "Address line 2",
    city: "City",
    state: "State",
    postalCode: "Postal code",
    invoicePrefix: "Invoice prefix",
    currency: "Currency",
    taxMode: "Tax mode",
    openingTime: "Opening time",
    closingTime: "Closing time",
    workingDays: "Working days",
    invoiceFooter: "Invoice footer",
    location: "Shop location",
  };

  return map[field];
}

function closeEditor(
  setEditingField: (value: EditableField | null) => void,
  setDraftValue: (value: string) => void,
  setSlugState: (value: "idle" | "checking" | "available" | "taken" | "error") => void,
  setSlugMessage: (value: string) => void,
  setWorkingDaysDraft: (value: string[]) => void,
  setLocationDraft: (value: { lat: number; lng: number } | null) => void,
) {
  setEditingField(null);
  setDraftValue("");
  setSlugState("idle");
  setSlugMessage("");
  setWorkingDaysDraft([]);
  setLocationDraft(null);
}

export function SettingsEditor({
  initialState,
}: {
  initialState: SettingsState;
}) {
  const [state, setState] = useState(initialState);
  const [editingField, setEditingField] = useState<EditableField | null>(null);
  const [draftValue, setDraftValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [slugState, setSlugState] = useState<"idle" | "checking" | "available" | "taken" | "error">("idle");
  const [slugMessage, setSlugMessage] = useState("");
  const [workingDaysDraft, setWorkingDaysDraft] = useState<string[]>([]);
  const [locationDraft, setLocationDraft] = useState<{ lat: number; lng: number } | null>(null);
  const isEditingLocation = editingField === "location";

  const rows = useMemo(
    () => ({
      shopDetails: [
        { label: "Shop name", value: state.shopName, field: "shopName" as const },
        { label: "Owner", value: state.ownerName, control: "none" as const },
        { label: "Slug", value: state.slug, field: "slug" as const },
        { label: "Category", value: state.category, field: "category" as const },
      ],
      address: [
        { label: "Address line 1", value: state.addressLine1, field: "addressLine1" as const },
        { label: "Address line 2", value: state.addressLine2, field: "addressLine2" as const },
        { label: "City", value: state.city, field: "city" as const },
        { label: "State", value: state.state, field: "state" as const },
        { label: "Postal code", value: state.postalCode, field: "postalCode" as const },
      ],
      billing: [
        { label: "Invoice prefix", value: state.invoicePrefix, field: "invoicePrefix" as const },
        { label: "Currency", value: state.currency, field: "currency" as const },
        { label: "Tax mode", value: state.taxMode, field: "taxMode" as const },
        { label: "Onboarding", value: state.onboarding, control: "none" as const },
      ],
      hours: [
        { label: "Opening time", value: state.openingTime, field: "openingTime" as const },
        { label: "Closing time", value: state.closingTime, field: "closingTime" as const },
        { label: "Working days", value: state.workingDays, field: "workingDays" as const },
      ],
      other: [
        { label: "Invoice footer", value: state.invoiceFooter, field: "invoiceFooter" as const },
        { label: "Owner email", value: state.ownerEmail, control: "none" as const },
      ],
    }),
    [state],
  );

  function openEdit(field: EditableField) {
    setEditingField(field);
    if (field !== "location") {
      const val = state[field as Exclude<EditableField, "location">];
      setDraftValue(typeof val === "string" ? val : "");
    } else {
      setDraftValue("");
    }
    setWorkingDaysDraft(
      field === "workingDays"
        ? state.workingDays.split(",").map((day) => day.trim().toLowerCase()).filter(Boolean)
        : [],
    );
    setLocationDraft(
      field === "location" && state.latitude !== null && state.longitude !== null
        ? { lat: state.latitude, lng: state.longitude }
        : state.latitude !== null && state.longitude !== null
          ? { lat: state.latitude, lng: state.longitude }
          : null,
    );
    setSlugState("idle");
    setSlugMessage("");
  }

  useEffect(() => {
    if (editingField !== "slug") {
      return;
    }

    const normalizedSlug = draftValue.trim().toLowerCase();
    const currentSlug = state.slug.trim().toLowerCase();

    if (!normalizedSlug) {
      setSlugState("idle");
      setSlugMessage("");
      return;
    }

    if (!/^[a-z0-9-]+$/.test(normalizedSlug) || normalizedSlug.length < 3) {
      setSlugState("taken");
      setSlugMessage("Use at least 3 characters with lowercase letters, numbers, or hyphens.");
      return;
    }

    if (normalizedSlug === currentSlug) {
      setSlugState("available");
      setSlugMessage("");
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setSlugState("checking");
      setSlugMessage("");

      try {
        const response = await fetch(`/api/slug-check?slug=${encodeURIComponent(normalizedSlug)}`, {
          signal: controller.signal,
        });
        const result = (await response.json()) as { available?: boolean; message?: string };

        if (!response.ok) {
          setSlugState("error");
          setSlugMessage(result.message ?? "Could not verify slug right now.");
          return;
        }

        if (result.available) {
          setSlugState("available");
          setSlugMessage("");
          return;
        }

        setSlugState("taken");
        setSlugMessage(result.message ?? "This slug is not available.");
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          return;
        }

        setSlugState("error");
        setSlugMessage("Could not verify slug right now.");
      }
    }, 350);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [draftValue, editingField, state.slug]);

  async function saveField() {
    if (!editingField) return;

    if (editingField === "slug" && slugState === "taken") {
      toast.error(slugMessage || "This slug is not available.");
      return;
    }

    if (editingField === "location" && !locationDraft) {
      toast.error("Pick a location on the map first.");
      return;
    }

    setIsSaving(true);

    const payloadValue =
      editingField === "workingDays"
        ? workingDaysDraft
        : editingField === "location"
          ? { latitude: locationDraft!.lat, longitude: locationDraft!.lng }
        : editingField === "slug"
          ? draftValue.trim().toLowerCase()
          : draftValue.trim();

    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field: editingField, value: payloadValue }),
      });

      const result = (await response.json()) as {
        message?: string;
        value?: string | string[] | { latitude: number; longitude: number };
      };

      if (!response.ok) {
        toast.error(result.message ?? "Could not update this field.");
        return;
      }

      const nextValue =
        editingField === "workingDays"
          ? Array.isArray(result.value)
            ? result.value.join(", ")
            : workingDaysDraft.join(", ")
          : editingField === "location"
            ? ""
          : typeof result.value === "string"
            ? result.value
            : draftValue;

      setState((current) => ({
        ...current,
        ...(editingField === "shopName" ? { shopName: nextValue } : {}),
        ...(editingField === "slug" ? { slug: nextValue } : {}),
        ...(editingField === "category" ? { category: nextValue } : {}),
        ...(editingField === "addressLine1" ? { addressLine1: nextValue } : {}),
        ...(editingField === "addressLine2" ? { addressLine2: nextValue } : {}),
        ...(editingField === "city" ? { city: nextValue } : {}),
        ...(editingField === "state" ? { state: nextValue } : {}),
        ...(editingField === "postalCode" ? { postalCode: nextValue } : {}),
        ...(editingField === "invoicePrefix" ? { invoicePrefix: nextValue } : {}),
        ...(editingField === "currency" ? { currency: nextValue } : {}),
        ...(editingField === "taxMode" ? { taxMode: nextValue } : {}),
        ...(editingField === "openingTime" ? { openingTime: nextValue } : {}),
        ...(editingField === "closingTime" ? { closingTime: nextValue } : {}),
        ...(editingField === "workingDays" ? { workingDays: nextValue } : {}),
        ...(editingField === "invoiceFooter" ? { invoiceFooter: nextValue } : {}),
        ...(editingField === "location" && locationDraft
          ? { latitude: locationDraft.lat, longitude: locationDraft.lng }
          : {}),
      }));

      toast.success(`${formatFieldLabel(editingField)} updated.`);
      closeEditor(
        setEditingField,
        setDraftValue,
        setSlugState,
        setSlugMessage,
        setWorkingDaysDraft,
        setLocationDraft,
      );
    } catch {
      toast.error("Could not update this field.");
    } finally {
      setIsSaving(false);
    }
  }

  function toggleWorkingDay(day: string) {
    setWorkingDaysDraft((current) =>
      current.includes(day) ? current.filter((item) => item !== day) : [...current, day],
    );
  }

  return (
    <>
      <section className="grid gap-5">
        <DetailSection
          title="Shop details"
          statusBadge={{
            label: state.status,
            tone: state.status.toLowerCase() === "active" ? "active" : "inactive",
          }}
          rows={rows.shopDetails}
          onEdit={openEdit}
        />

        <DetailSection title="Business address" rows={rows.address} onEdit={openEdit} />
        <section className="grid gap-3">
          <div className="flex items-center justify-between gap-3 px-1">
            <h2 className="text-sm font-semibold text-stone-700">Current location</h2>
          </div>
          <div className="overflow-hidden rounded-[1.7rem] bg-white shadow-[0_10px_30px_rgba(15,23,42,0.06)] h-96 flex flex-col">
            {state.latitude !== null && state.longitude !== null ? (
              <>
                {!isEditingLocation ? (
                  <LocationPicker
                    key="settings-location-preview"
                    value={{ lat: state.latitude, lng: state.longitude }}
                    onChange={() => {}}
                    interactive={false}
                    className="flex-1"
                  />
                ) : (
                  <div className="flex-1 w-full rounded-[1.75rem] bg-stone-100" />
                )}
                <div className="flex items-center justify-between gap-4 px-5 py-4 border-t border-stone-100">
                  <div className="text-sm font-medium text-stone-600">
                    {state.latitude.toFixed(6)}, {state.longitude.toFixed(6)}
                  </div>
                  <button
                    type="button"
                    onClick={() => openEdit("location")}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-600"
                    aria-label="Edit shop location"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-between gap-4 px-5 py-4">
                <div className="text-sm font-medium text-stone-500">No map location saved yet.</div>
                <button
                  type="button"
                  onClick={() => openEdit("location")}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-600"
                  aria-label="Add shop location"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </section>
        <DetailSection title="Billing settings" rows={rows.billing} onEdit={openEdit} />
        <DetailSection title="Operating hours" rows={rows.hours} onEdit={openEdit} />
        <DetailSection title="Other info" rows={rows.other} onEdit={openEdit} />
      </section>

      {editingField ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 p-4">
          <div className="w-full max-w-sm rounded-[1.75rem] bg-white p-5 shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-stone-950">{formatFieldLabel(editingField)}</h3>
              <button
                type="button"
                onClick={() => setEditingField(null)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-100 text-stone-700"
                aria-label="Close edit modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4">
              {editingField === "location" ? (
                <div className="grid gap-4">
                  <LocationPicker key="settings-location-modal" value={locationDraft} onChange={setLocationDraft} />
                  <p className="text-sm font-medium text-stone-500">
                    Click the map to place the marker, then drag it to update the shop location.
                  </p>
                  {locationDraft ? (
                    <div className="text-sm font-semibold text-stone-700">
                      {locationDraft.lat.toFixed(6)}, {locationDraft.lng.toFixed(6)}
                    </div>
                  ) : null}
                </div>
              ) : editingField === "workingDays" ? (
                <div className="flex flex-wrap gap-2">
                  {workingDayOptions.map((day) => {
                    const active = workingDaysDraft.includes(day.value);
                    return (
                      <button
                        key={day.value}
                        type="button"
                        onClick={() => toggleWorkingDay(day.value)}
                        className={[
                          "rounded-full px-4 py-2 text-sm font-semibold transition",
                          active ? "bg-stone-950 text-white" : "bg-stone-100 text-stone-600",
                        ].join(" ")}
                      >
                        {day.label}
                      </button>
                    );
                  })}
                </div>
              ) : editingField === "taxMode" ? (
                <select
                  value={draftValue}
                  onChange={(event) => setDraftValue(event.target.value)}
                  className="h-12 w-full rounded-2xl bg-stone-100 px-4 outline-none"
                >
                  <option value="exclusive">exclusive</option>
                  <option value="inclusive">inclusive</option>
                  <option value="no_tax">no_tax</option>
                </select>
              ) : editingField === "currency" ? (
                <input
                  type="text"
                  value={draftValue}
                  onChange={(event) => setDraftValue(event.target.value.toUpperCase())}
                  className="h-12 w-full rounded-2xl bg-stone-100 px-4 outline-none"
                  maxLength={5}
                />
              ) : editingField === "invoicePrefix" ? (
                <input
                  type="text"
                  value={draftValue}
                  onChange={(event) => setDraftValue(event.target.value.toUpperCase())}
                  className="h-12 w-full rounded-2xl bg-stone-100 px-4 outline-none"
                  maxLength={10}
                />
              ) : editingField === "invoiceFooter" ? (
                <InvoiceFooterLinesEditor
                  variant="inline"
                  value={draftValue}
                  onChange={setDraftValue}
                />
              ) : (
                <div className="relative">
                  <input
                    type={editingField === "openingTime" || editingField === "closingTime" ? "time" : "text"}
                    value={draftValue}
                    onChange={(event) =>
                      setDraftValue(
                        editingField === "slug" ? event.target.value.toLowerCase() : event.target.value,
                      )
                    }
                    className={[
                      "h-12 w-full rounded-2xl bg-stone-100 px-4 outline-none",
                      editingField === "slug" ? "pr-12" : "",
                    ].join(" ")}
                  />
                  {editingField === "slug" ? (
                    <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center">
                      {slugState === "checking" ? <LoaderCircle className="h-5 w-5 animate-spin text-stone-400" /> : null}
                      {slugState === "available" ? <Check className="h-5 w-5 text-emerald-600" /> : null}
                      {slugState === "taken" ? <X className="h-5 w-5 text-rose-600" /> : null}
                    </span>
                  ) : null}
                </div>
              )}
            </div>

            {editingField === "slug" && slugState === "checking" ? (
              <p className="mt-2 text-sm font-medium text-stone-500">Checking slug...</p>
            ) : null}
            {editingField === "slug" && slugState === "taken" ? (
              <p className="mt-2 text-sm font-medium text-rose-600">{slugMessage}</p>
            ) : null}

            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  closeEditor(
                    setEditingField,
                    setDraftValue,
                    setSlugState,
                    setSlugMessage,
                    setWorkingDaysDraft,
                    setLocationDraft,
                  );
                }}
                className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-900"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSaving || (editingField === "slug" && slugState === "taken")}
                onClick={saveField}
                className="rounded-full bg-stone-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {isSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
