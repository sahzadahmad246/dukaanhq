"use client";

import dynamic from "next/dynamic";
import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  LoaderCircle,
  MapPin,
  Pencil,
  Upload,
  X,
} from "lucide-react";

import { createShopAction } from "@/app/onboarding/actions";
import {
  initialOnboardingState,
  type OnboardingActionState,
} from "@/app/onboarding/state";

const DynamicLocationPicker = dynamic(
  () => import("@/app/onboarding/_components/location-picker").then((mod) => mod.LocationPicker),
  {
    ssr: false,
    loading: () => <div className="h-72 rounded-[1.75rem] bg-stone-100" />,
  },
);

const steps = [
  { id: 1, key: "basic", title: "Basic" },
  { id: 2, key: "contact", title: "Contact" },
  { id: 3, key: "address", title: "Address" },
  { id: 4, key: "billing", title: "Billing" },
  { id: 5, key: "hours", title: "Hours" },
  { id: 6, key: "preview", title: "Preview" },
] as const;

const workingDays = [
  { value: "monday", label: "Mon" },
  { value: "tuesday", label: "Tue" },
  { value: "wednesday", label: "Wed" },
  { value: "thursday", label: "Thu" },
  { value: "friday", label: "Fri" },
  { value: "saturday", label: "Sat" },
  { value: "sunday", label: "Sun" },
] as const;

const ONBOARDING_DRAFT_STORAGE_KEY = "dukaanhq:onboarding:draft";

type OnboardingFormProps = {
  defaultBusinessEmail: string;
};

type SlugState = "idle" | "checking" | "available" | "taken" | "error";
type FieldErrors = Record<string, string>;
type LatLng = { lat: number; lng: number };
type OnboardingDraft = {
  currentStep: number;
  slugManuallyEdited: boolean;
  invoicePrefixEdited: boolean;
  shopName: string;
  legalName: string;
  slugInput: string;
  phone: string;
  email: string;
  whatsapp: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  stateValue: string;
  postalCode: string;
  country: string;
  latitude: string;
  longitude: string;
  location: LatLng | null;
  gstNumber: string;
  invoicePrefix: string;
  currency: string;
  taxMode: string;
  invoiceFooter: string;
  openingTime: string;
  closingTime: string;
  selectedDays: string[];
  logoUrl: string;
  logoFileName: string;
  logoPublicId: string;
};

function isBlobUrl(value: string | null): value is string {
  return Boolean(value?.startsWith("blob:"));
}

function StepIndicator({
  currentStep,
  onStepChange,
}: {
  currentStep: number;
  onStepChange: (step: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stepRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    const update = () => {
      setCanScrollLeft(element.scrollLeft > 4);
      setCanScrollRight(element.scrollLeft + element.clientWidth < element.scrollWidth - 4);
    };

    update();
    element.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      element.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  useEffect(() => {
    const activeButton = stepRefs.current[currentStep - 1];
    activeButton?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [currentStep]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-2">
        {canScrollLeft ? (
          <button
            type="button"
            onClick={() => scrollRef.current?.scrollBy({ left: -180, behavior: "smooth" })}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-700 transition hover:bg-stone-50"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        ) : null}
        {canScrollRight ? (
          <button
            type="button"
            onClick={() => scrollRef.current?.scrollBy({ left: 180, behavior: "smooth" })}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-700 transition hover:bg-stone-50"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div ref={scrollRef} className="scrollbar-hidden overflow-x-auto">
        <div className="flex min-w-max items-start pr-4">
          {steps.map((step, index) => {
            const active = step.id === currentStep;
            const complete = step.id < currentStep;
            const isLast = index === steps.length - 1;
            return (
              <div key={step.id} className="flex items-start">
                <button
                  ref={(element) => {
                    stepRefs.current[index] = element;
                  }}
                  type="button"
                  onClick={() => onStepChange(step.id)}
                  className="flex min-w-20 flex-col items-center gap-2 text-center"
                >
                  <div className={[
                    "flex h-11 w-11 items-center justify-center rounded-full text-sm font-semibold transition",
                    active ? "bg-stone-950 text-white" : complete ? "bg-emerald-500 text-white" : "bg-stone-100 text-stone-500",
                  ].join(" ")}>
                    {complete ? <Check className="h-4 w-4" /> : step.id}
                  </div>
                  <p className="text-xs font-medium text-stone-900">{step.title}</p>
                </button>
                {!isLast ? (
                  <div className="mt-5 h-px w-12 bg-stone-200 sm:w-16">
                    <div className={[
                      "h-px transition",
                      complete ? "w-full bg-emerald-500" : "w-0 bg-transparent",
                    ].join(" ")} />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function FieldShell({ label, name, required, error, children }: { label: string; name?: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <label htmlFor={name} className="grid gap-2 text-sm text-stone-700">
      <span className="font-medium text-stone-900">{label}{required ? <span className="ml-1 text-red-500">*</span> : null}</span>
      {children}
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </label>
  );
}

function TextInput({ id, name, value, onChange, placeholder, type = "text", inputMode, maxLength, rightAdornment }: { id: string; name: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string; inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"]; maxLength?: number; rightAdornment?: React.ReactNode }) {
  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        maxLength={maxLength}
        className="h-12 w-full rounded-2xl bg-stone-100 px-4 pr-12 outline-none transition focus:bg-stone-50"
      />
      {rightAdornment ? <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">{rightAdornment}</div> : null}
    </div>
  );
}

function SelectField({ id, name, value, onChange, options }: { id: string; name: string; value: string; onChange: (value: string) => void; options: Array<{ label: string; value: string }> }) {
  return (
    <select id={id} name={name} value={value} onChange={(event) => onChange(event.target.value)} className="h-12 w-full rounded-2xl bg-stone-100 px-4 outline-none transition focus:bg-stone-50">
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  );
}

function LogoPicker({
  previewUrl,
  fileName,
  showPreview,
  isUploading,
  uploadProgress,
  onOpenPreview,
  onClosePreview,
  onFileChange,
  onRemove,
}: {
  previewUrl: string | null;
  fileName: string;
  showPreview: boolean;
  isUploading: boolean;
  uploadProgress: number;
  onOpenPreview: () => void;
  onClosePreview: () => void;
  onFileChange: (file: File | null) => void;
  onRemove: () => void;
}) {
  return (
    <>
      <div className="grid gap-3">
        <div className="text-sm font-medium text-stone-900">Shop logo</div>
        <label className="flex w-full min-w-0 items-center gap-3 overflow-hidden rounded-[1.75rem] border border-dashed border-stone-300 bg-stone-50 p-4 transition hover:border-stone-400 hover:bg-white">
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-white">
            {isUploading ? (
              <div
                className="pointer-events-none absolute inset-0 rounded-2xl p-[2px]"
                style={{
                  background: `conic-gradient(from -90deg, #22c55e 0deg ${Math.max(3, uploadProgress * 3.6)}deg, rgba(34,197,94,0.12) ${Math.max(3, uploadProgress * 3.6)}deg 360deg)`,
                }}
              >
                <div className="h-full w-full rounded-[14px] bg-white" />
              </div>
            ) : null}
            {previewUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewUrl} alt="Logo preview" className="relative z-[1] h-full w-full object-cover" onClick={(e)=>{e.preventDefault(); onOpenPreview();}} />
                {isUploading ? (
                  <div className="absolute inset-0 z-[2] flex items-center justify-center bg-white/78 backdrop-blur-[1px]">
                    <div className="flex min-w-10 items-center justify-center rounded-full bg-stone-950 px-2 py-1 text-[11px] font-semibold text-white">
                      {uploadProgress}%
                    </div>
                  </div>
                ) : null}
                <button type="button" onClick={(e)=>{e.preventDefault(); onRemove();}} className="absolute right-1 top-1 z-[3] flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-stone-700">
                  <X className="h-3.5 w-3.5" />
                </button>
              </>
            ) : (
              <div className="relative z-[1] flex h-full w-full items-center justify-center text-stone-400">
                {isUploading ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-stone-900">
              {isUploading ? `Uploading logo... ${uploadProgress}%` : fileName || "Select shop logo"}
            </p>
            <p className="text-xs text-stone-500">
              {isUploading ? "Please wait while we upload the file" : "PNG, JPG, or WebP"}
            </p>
          </div>
          <div className="shrink-0 rounded-full bg-white px-3 py-2 text-xs font-medium text-stone-700">
            {isUploading ? `${uploadProgress}%` : fileName ? "Change" : "Upload"}
          </div>
          <input type="file" name="logoFile" accept="image/*" className="hidden" onChange={(event) => onFileChange(event.target.files?.[0] ?? null)} />
        </label>
      </div>
      {showPreview && previewUrl ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/70 p-4">
          <div className="w-full max-w-md rounded-[2rem] bg-white p-4 shadow-[0_24px_80px_rgba(15,23,42,0.22)]">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium text-stone-900">Logo preview</p>
              <button type="button" onClick={onClosePreview} className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-100 text-stone-700"><X className="h-4 w-4" /></button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="Selected logo preview" className="h-80 w-full rounded-[1.5rem] object-cover" />
          </div>
        </div>
      ) : null}
    </>
  );
}

function PreviewField({
  label,
  value,
  step,
  onEdit,
}: {
  label: string;
  value: React.ReactNode;
  step: number;
  onEdit: (step: number) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl bg-stone-50 px-4 py-3">
      <div className="min-w-0">
        <div className="text-xs font-medium uppercase tracking-[0.16em] text-stone-500">{label}</div>
        <div className="mt-1 break-words text-sm text-stone-900">{value || "-"}</div>
      </div>
      <button
        type="button"
        onClick={() => onEdit(step)}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-stone-700 transition hover:bg-stone-100"
        aria-label={`Edit ${label}`}
      >
        <Pencil className="h-4 w-4" />
      </button>
    </div>
  );
}

function getInitialStep() {
  if (typeof window === "undefined") return 1;
  return Math.max(1, steps.find((step) => step.key === new URLSearchParams(window.location.search).get("step"))?.id ?? 1);
}

function buildSlugSuggestion(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

function buildInvoicePrefixSuggestion(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

export function OnboardingForm({ defaultBusinessEmail }: OnboardingFormProps) {
  const [currentStep, setCurrentStep] = useState(getInitialStep);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [invoicePrefixEdited, setInvoicePrefixEdited] = useState(false);
  const [shopName, setShopName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [slugInput, setSlugInput] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState(defaultBusinessEmail);
  const [whatsapp, setWhatsapp] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [stateValue, setStateValue] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState("India");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [location, setLocation] = useState<LatLng | null>(null);
  const [isResolvingLocation, setIsResolvingLocation] = useState(false);
  const [gstNumber, setGstNumber] = useState("");
  const [invoicePrefix, setInvoicePrefix] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [taxMode, setTaxMode] = useState("exclusive");
  const [invoiceFooter, setInvoiceFooter] = useState("");
  const [openingTime, setOpeningTime] = useState("10:00");
  const [closingTime, setClosingTime] = useState("20:00");
  const [selectedDays, setSelectedDays] = useState<string[]>(workingDays.slice(0, 6).map((day) => day.value));
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [logoFileName, setLogoFileName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [logoPublicId, setLogoPublicId] = useState("");
  const [showLogoPreview, setShowLogoPreview] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [logoUploadProgress, setLogoUploadProgress] = useState(0);
  const [logoUploadError, setLogoUploadError] = useState("");
  const [slugState, setSlugState] = useState<SlugState>("idle");
  const [slugMessage, setSlugMessage] = useState("");
  const [clientErrors, setClientErrors] = useState<FieldErrors>({});
  const [state, formAction, isPending] = useActionState<OnboardingActionState, FormData>(createShopAction, initialOnboardingState);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [serverDraftChecked, setServerDraftChecked] = useState(false);

  const slugSuggestion = useMemo(() => buildSlugSuggestion(shopName), [shopName]);
  const invoicePrefixSuggestion = useMemo(() => buildInvoicePrefixSuggestion(shopName), [shopName]);
  const slugValue = slugManuallyEdited ? slugInput : slugSuggestion;
  const invoicePrefixValue = invoicePrefixEdited ? invoicePrefix : invoicePrefixSuggestion;

  useEffect(() => {
    if (!slugValue) {
      setSlugState("idle");
      setSlugMessage("");
    }
  }, [slugValue]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const rawDraft = window.localStorage.getItem(ONBOARDING_DRAFT_STORAGE_KEY);
      if (!rawDraft) {
        setDraftHydrated(true);
        return;
      }

      const draft = JSON.parse(rawDraft) as Partial<OnboardingDraft>;

      if (typeof draft.currentStep === "number") {
        setCurrentStep(Math.max(1, Math.min(steps.length, draft.currentStep)));
      }
      const draftShopName = typeof draft.shopName === "string" ? draft.shopName : "";
      const draftSlugInput = typeof draft.slugInput === "string" ? draft.slugInput : "";
      const draftInvoicePrefix = typeof draft.invoicePrefix === "string" ? draft.invoicePrefix : "";
      const inferredSlugManual = typeof draft.slugManuallyEdited === "boolean"
        ? draft.slugManuallyEdited && draftSlugInput !== buildSlugSuggestion(draftShopName)
        : draftSlugInput !== "" && draftSlugInput !== buildSlugSuggestion(draftShopName);
      const inferredInvoicePrefixManual = typeof draft.invoicePrefixEdited === "boolean"
        ? draft.invoicePrefixEdited && draftInvoicePrefix !== buildInvoicePrefixSuggestion(draftShopName)
        : draftInvoicePrefix !== "" && draftInvoicePrefix !== buildInvoicePrefixSuggestion(draftShopName);

      setSlugManuallyEdited(inferredSlugManual);
      setInvoicePrefixEdited(inferredInvoicePrefixManual);
      if (typeof draft.shopName === "string") setShopName(draft.shopName);
      if (typeof draft.legalName === "string") setLegalName(draft.legalName);
      if (typeof draft.slugInput === "string") setSlugInput(draft.slugInput);
      if (typeof draft.phone === "string") setPhone(draft.phone);
      if (typeof draft.email === "string") setEmail(draft.email);
      if (typeof draft.whatsapp === "string") setWhatsapp(draft.whatsapp);
      if (typeof draft.addressLine1 === "string") setAddressLine1(draft.addressLine1);
      if (typeof draft.addressLine2 === "string") setAddressLine2(draft.addressLine2);
      if (typeof draft.city === "string") setCity(draft.city);
      if (typeof draft.stateValue === "string") setStateValue(draft.stateValue);
      if (typeof draft.postalCode === "string") setPostalCode(draft.postalCode);
      if (typeof draft.country === "string") setCountry(draft.country);
      if (typeof draft.latitude === "string") setLatitude(draft.latitude);
      if (typeof draft.longitude === "string") setLongitude(draft.longitude);
      if (draft.location && typeof draft.location.lat === "number" && typeof draft.location.lng === "number") {
        setLocation(draft.location);
      }
      if (typeof draft.gstNumber === "string") setGstNumber(draft.gstNumber);
      if (typeof draft.invoicePrefix === "string") setInvoicePrefix(draft.invoicePrefix);
      if (typeof draft.currency === "string") setCurrency(draft.currency);
      if (typeof draft.taxMode === "string") setTaxMode(draft.taxMode);
      if (typeof draft.invoiceFooter === "string") setInvoiceFooter(draft.invoiceFooter);
      if (typeof draft.openingTime === "string") setOpeningTime(draft.openingTime);
      if (typeof draft.closingTime === "string") setClosingTime(draft.closingTime);
      if (Array.isArray(draft.selectedDays)) setSelectedDays(draft.selectedDays);
      if (typeof draft.logoUrl === "string") {
        setLogoUrl(draft.logoUrl);
        setLogoPreviewUrl(draft.logoUrl || null);
      }
      if (typeof draft.logoFileName === "string") setLogoFileName(draft.logoFileName);
      if (typeof draft.logoPublicId === "string") setLogoPublicId(draft.logoPublicId);
    } catch {
      window.localStorage.removeItem(ONBOARDING_DRAFT_STORAGE_KEY);
    } finally {
      setDraftHydrated(true);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadRemoteDraft() {
      try {
        const response = await fetch("/api/onboarding-draft", { cache: "no-store" });
        if (!response.ok) {
          return;
        }

        const result = (await response.json()) as { draft?: Partial<OnboardingDraft> | null };
        const draft = result.draft;
        if (!draft || cancelled) {
          return;
        }

        if (typeof draft.currentStep === "number") {
          setCurrentStep(Math.max(1, Math.min(steps.length, draft.currentStep)));
        }
        const draftShopName = typeof draft.shopName === "string" ? draft.shopName : "";
        const draftSlugInput = typeof draft.slugInput === "string" ? draft.slugInput : "";
        const draftInvoicePrefix = typeof draft.invoicePrefix === "string" ? draft.invoicePrefix : "";
        const inferredSlugManual = typeof draft.slugManuallyEdited === "boolean"
          ? draft.slugManuallyEdited && draftSlugInput !== buildSlugSuggestion(draftShopName)
          : draftSlugInput !== "" && draftSlugInput !== buildSlugSuggestion(draftShopName);
        const inferredInvoicePrefixManual = typeof draft.invoicePrefixEdited === "boolean"
          ? draft.invoicePrefixEdited && draftInvoicePrefix !== buildInvoicePrefixSuggestion(draftShopName)
          : draftInvoicePrefix !== "" && draftInvoicePrefix !== buildInvoicePrefixSuggestion(draftShopName);

        setSlugManuallyEdited(inferredSlugManual);
        setInvoicePrefixEdited(inferredInvoicePrefixManual);
        if (typeof draft.shopName === "string") setShopName(draft.shopName);
        if (typeof draft.legalName === "string") setLegalName(draft.legalName);
        if (typeof draft.slugInput === "string") setSlugInput(draft.slugInput);
        if (typeof draft.phone === "string") setPhone(draft.phone);
        if (typeof draft.email === "string") setEmail(draft.email);
        if (typeof draft.whatsapp === "string") setWhatsapp(draft.whatsapp);
        if (typeof draft.addressLine1 === "string") setAddressLine1(draft.addressLine1);
        if (typeof draft.addressLine2 === "string") setAddressLine2(draft.addressLine2);
        if (typeof draft.city === "string") setCity(draft.city);
        if (typeof draft.stateValue === "string") setStateValue(draft.stateValue);
        if (typeof draft.postalCode === "string") setPostalCode(draft.postalCode);
        if (typeof draft.country === "string") setCountry(draft.country);
        if (typeof draft.latitude === "string") setLatitude(draft.latitude);
        if (typeof draft.longitude === "string") setLongitude(draft.longitude);
        if (draft.location && typeof draft.location.lat === "number" && typeof draft.location.lng === "number") {
          setLocation(draft.location);
        }
        if (typeof draft.gstNumber === "string") setGstNumber(draft.gstNumber);
        if (typeof draft.invoicePrefix === "string") setInvoicePrefix(draft.invoicePrefix);
        if (typeof draft.currency === "string") setCurrency(draft.currency);
        if (typeof draft.taxMode === "string") setTaxMode(draft.taxMode);
        if (typeof draft.invoiceFooter === "string") setInvoiceFooter(draft.invoiceFooter);
        if (typeof draft.openingTime === "string") setOpeningTime(draft.openingTime);
        if (typeof draft.closingTime === "string") setClosingTime(draft.closingTime);
        if (Array.isArray(draft.selectedDays)) setSelectedDays(draft.selectedDays);
        if (typeof draft.logoUrl === "string") {
          setLogoUrl(draft.logoUrl);
          setLogoPreviewUrl(draft.logoUrl || null);
        }
        if (typeof draft.logoFileName === "string") setLogoFileName(draft.logoFileName);
        if (typeof draft.logoPublicId === "string") setLogoPublicId(draft.logoPublicId);
      } catch {
        return;
      } finally {
        if (!cancelled) {
          setServerDraftChecked(true);
        }
      }
    }

    loadRemoteDraft();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set("step", steps[currentStep - 1].key);
    window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
  }, [currentStep]);

  useEffect(() => {
    const onPopState = () => setCurrentStep(getInitialStep());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (!slugValue) return;
    const controller = new AbortController();
    const timeoutId = setTimeout(async () => {
      setSlugState("checking");
      setSlugMessage("");
      try {
        const response = await fetch(`/api/slug-check?slug=${encodeURIComponent(slugValue)}`, { signal: controller.signal });
        const result = (await response.json()) as { available: boolean; message?: string };
        if (!response.ok) {
          setSlugState("error");
          setSlugMessage(result.message ?? "Could not verify slug right now.");
          return;
        }
        if (result.available) {
          setSlugState("available");
          setSlugMessage("");
        } else {
          setSlugState("taken");
          setSlugMessage(result.message ?? "Slug is already taken");
        }
      } catch {
        if (!controller.signal.aborted) {
          setSlugState("error");
          setSlugMessage("Could not verify slug right now.");
        }
      }
    }, 250);
    return () => {
      controller.abort();
      clearTimeout(timeoutId);
    };
  }, [slugValue]);

  useEffect(() => {
    if (typeof navigator === "undefined" || location || !draftHydrated) return;
    navigator.geolocation.getCurrentPosition((position) => {
      setLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
      setLatitude(position.coords.latitude.toFixed(6));
      setLongitude(position.coords.longitude.toFixed(6));
    });
  }, [draftHydrated, location]);

  useEffect(() => {
    if (typeof window === "undefined" || !draftHydrated) {
      return;
    }

    const draft: OnboardingDraft = {
      currentStep,
      slugManuallyEdited,
      invoicePrefixEdited,
      shopName,
      legalName,
      slugInput,
      phone,
      email,
      whatsapp,
      addressLine1,
      addressLine2,
      city,
      stateValue,
      postalCode,
      country,
      latitude,
      longitude,
      location,
      gstNumber,
      invoicePrefix,
      currency,
      taxMode,
      invoiceFooter,
      openingTime,
      closingTime,
      selectedDays,
      logoUrl,
      logoFileName,
      logoPublicId,
    };

    window.localStorage.setItem(ONBOARDING_DRAFT_STORAGE_KEY, JSON.stringify(draft));

    if (!serverDraftChecked) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      fetch("/api/onboarding-draft", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft }),
      }).catch(() => undefined);
    }, 500);

    return () => window.clearTimeout(timeoutId);
  }, [
    currentStep,
    slugManuallyEdited,
    invoicePrefixEdited,
    shopName,
    legalName,
    slugInput,
    phone,
    email,
    whatsapp,
    addressLine1,
    addressLine2,
    city,
    stateValue,
    postalCode,
    country,
    latitude,
    longitude,
    location,
    gstNumber,
    invoicePrefix,
    currency,
    taxMode,
    invoiceFooter,
    openingTime,
    closingTime,
    selectedDays,
    logoUrl,
    logoFileName,
    logoPublicId,
    draftHydrated,
    serverDraftChecked,
  ]);

  async function clearDraft() {
    if (isBlobUrl(logoPreviewUrl)) {
      URL.revokeObjectURL(logoPreviewUrl);
    }
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(ONBOARDING_DRAFT_STORAGE_KEY);
    }
    if (logoPublicId) {
      fetch("/api/onboarding-draft/logo", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicId: logoPublicId }),
      }).catch(() => undefined);
    }
    fetch("/api/onboarding-draft", { method: "DELETE" }).catch(() => undefined);
    setCurrentStep(getInitialStep());
    setSlugManuallyEdited(false);
    setInvoicePrefixEdited(false);
    setShopName("");
    setLegalName("");
    setSlugInput("");
    setPhone("");
    setEmail(defaultBusinessEmail);
    setWhatsapp("");
    setAddressLine1("");
    setAddressLine2("");
    setCity("");
    setStateValue("");
    setPostalCode("");
    setCountry("India");
    setLatitude("");
    setLongitude("");
    setLocation(null);
    setIsResolvingLocation(false);
    setGstNumber("");
    setInvoicePrefix("");
    setCurrency("INR");
    setTaxMode("exclusive");
    setInvoiceFooter("");
    setOpeningTime("10:00");
    setClosingTime("20:00");
    setSelectedDays(workingDays.slice(0, 6).map((day) => day.value));
    setLogoPreviewUrl(null);
    setLogoFileName("");
    setLogoUrl("");
    setLogoPublicId("");
    setShowLogoPreview(false);
    setIsUploadingLogo(false);
    setLogoUploadProgress(0);
    setLogoUploadError("");
    setClientErrors({});
  }

  useEffect(() => {
    if (!location) return;
    const controller = new AbortController();
    fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${location.lat}&lon=${location.lng}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    })
      .then((response) => response.json())
      .then((result) => {
        const address = result.address ?? {};
        const locality = address.city ?? address.town ?? address.village ?? address.suburb ?? "";
        const region = address.state ?? address.county ?? "";
        if (locality) setCity(locality);
        if (region) setStateValue(region);
        if (address.country) setCountry(address.country);
      })
      .catch(() => undefined)
      .finally(() => setIsResolvingLocation(false));
    return () => controller.abort();
  }, [location]);

  const handleLocationChange = useCallback((coords: LatLng) => {
    setIsResolvingLocation(true);
    setLocation(coords);
    setLatitude(coords.lat.toFixed(6));
    setLongitude(coords.lng.toFixed(6));
    setClientErrors((prev) => ({ ...prev, location: "" }));
  }, []);

  function getError(name: string) {
    return clientErrors[name] ?? state.fieldErrors?.[name] ?? "";
  }

  function setError(name: string, value: string) {
    setClientErrors((prev) => ({ ...prev, [name]: value }));
  }

  function validateStep(step: number) {
    const nextErrors: FieldErrors = {};
    if (step === 1) {
      if (!shopName.trim()) nextErrors.shopName = "Shop name is required.";
      if (!slugValue.trim()) nextErrors.slug = "Shop slug is required.";
      if (slugState === "taken") nextErrors.slug = "Slug is already taken.";
    }
    if (step === 2) {
      if (!/^\d{10}$/.test(phone)) nextErrors.phone = "Enter a valid 10-digit mobile number.";
      if (!/^\S+@\S+\.\S+$/.test(email)) nextErrors.email = "Enter a valid business email.";
      if (whatsapp && !/^\d{10}$/.test(whatsapp)) nextErrors.whatsapp = "Enter a valid 10-digit WhatsApp number.";
    }
    if (step === 3) {
      if (!location) nextErrors.location = "Please pick a location from the map.";
      if (!addressLine1.trim()) nextErrors.addressLine1 = "Address line 1 is required.";
      if (!city.trim()) nextErrors.city = "City is required.";
      if (!stateValue.trim()) nextErrors.state = "State is required.";
      if (!postalCode.trim()) nextErrors.postalCode = "Postal code is required.";
      if (!country.trim()) nextErrors.country = "Country is required.";
    }
    if (step === 4) {
      if (!invoicePrefixValue.trim()) nextErrors.invoicePrefix = "Invoice prefix is required.";
      if (!currency.trim()) nextErrors.currency = "Currency is required.";
    }
    if (step === 5) {
      if (!openingTime.trim()) nextErrors.openingTime = "Opening time is required.";
      if (!closingTime.trim()) nextErrors.closingTime = "Closing time is required.";
      if (selectedDays.length === 0) nextErrors.workingDays = "Select at least one working day.";
    }
    setClientErrors((prev) => ({ ...prev, ...nextErrors }));
    return Object.keys(nextErrors).length === 0;
  }

  function goToStep(step: number) {
    if (step > currentStep && !validateStep(currentStep)) return;
    setCurrentStep(Math.max(1, Math.min(steps.length, step)));
  }

  const previewSections = [
    {
      title: "Basic info",
      items: [
        { label: "Shop name", value: shopName, step: 1 },
        { label: "Legal name", value: legalName, step: 1 },
        { label: "Slug", value: slugValue, step: 1 },
        {
          label: "Logo",
          value: logoPreviewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoPreviewUrl} alt="Shop logo" className="h-14 w-14 rounded-2xl object-cover" />
          ) : "No logo selected",
          step: 1,
        },
      ],
    },
    {
      title: "Contact",
      items: [
        { label: "Phone", value: phone, step: 2 },
        { label: "WhatsApp", value: whatsapp, step: 2 },
        { label: "Email", value: email, step: 2 },
      ],
    },
    {
      title: "Address",
      items: [
        { label: "Address line 1", value: addressLine1, step: 3 },
        { label: "Address line 2", value: addressLine2, step: 3 },
        { label: "City", value: city, step: 3 },
        { label: "State", value: stateValue, step: 3 },
        { label: "Postal code", value: postalCode, step: 3 },
        { label: "Country", value: country, step: 3 },
        { label: "Latitude", value: latitude, step: 3 },
        { label: "Longitude", value: longitude, step: 3 },
      ],
    },
    {
      title: "Billing",
      items: [
        { label: "GST number", value: gstNumber, step: 4 },
        { label: "Invoice prefix", value: invoicePrefixValue, step: 4 },
        { label: "Currency", value: currency, step: 4 },
        { label: "Tax mode", value: taxMode, step: 4 },
        { label: "Invoice footer", value: invoiceFooter, step: 4 },
      ],
    },
    {
      title: "Business timings",
      items: [
        { label: "Opening time", value: openingTime, step: 5 },
        { label: "Closing time", value: closingTime, step: 5 },
        { label: "Working days", value: selectedDays.map((day) => workingDays.find((item) => item.value === day)?.label ?? day).join(", "), step: 5 },
      ],
    },
  ];

  async function handleLogoChange(file: File | null) {
    if (!file) {
      if (isBlobUrl(logoPreviewUrl)) {
        URL.revokeObjectURL(logoPreviewUrl);
      }
      if (logoPublicId) {
        fetch("/api/onboarding-draft/logo", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ publicId: logoPublicId }),
        }).catch(() => undefined);
      }
      setLogoPreviewUrl(null);
      setLogoFileName("");
      setLogoUrl("");
      setLogoPublicId("");
      setLogoUploadProgress(0);
      setLogoUploadError("");
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    if (isBlobUrl(logoPreviewUrl)) {
      URL.revokeObjectURL(logoPreviewUrl);
    }
    setLogoPreviewUrl(objectUrl);
    setLogoFileName(file.name);
    setLogoUploadError("");
    setIsUploadingLogo(true);
    setLogoUploadProgress(0);

    try {
      const uploadFormData = new FormData();
      uploadFormData.append("file", file);
      const result = await new Promise<{
        secureUrl?: string;
        publicId?: string;
        originalFilename?: string;
        message?: string;
        status: number;
      }>((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open("POST", "/api/onboarding-draft/logo");
        request.responseType = "json";

        request.upload.onprogress = (event) => {
          if (!event.lengthComputable) {
            return;
          }

          setLogoUploadProgress(Math.min(99, Math.max(1, Math.round((event.loaded / event.total) * 100))));
        };

        request.onload = () => {
          resolve({
            ...(request.response ?? {}),
            status: request.status,
          });
        };

        request.onerror = () => reject(new Error("Upload failed"));
        request.send(uploadFormData);
      });

      if (result.status < 200 || result.status >= 300 || !result.secureUrl || !result.publicId) {
        setLogoUploadError(result.message ?? "Could not upload logo right now.");
        return;
      }

      if (logoPublicId && logoPublicId !== result.publicId) {
        fetch("/api/onboarding-draft/logo", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ publicId: logoPublicId }),
        }).catch(() => undefined);
      }

      setLogoUrl(result.secureUrl);
      setLogoPublicId(result.publicId);
      setLogoFileName(result.originalFilename ?? file.name);
      setLogoUploadProgress(100);
    } catch {
      setLogoUploadError("Could not upload logo right now.");
    } finally {
      setIsUploadingLogo(false);
    }
  }

  return (
    <form action={formAction} className="space-y-5">
      <div className="sticky top-[-1rem] z-[1100] -mx-4 -mt-5 bg-white px-4 py-3 md:-mx-6 md:px-6">
        <StepIndicator currentStep={currentStep} onStepChange={goToStep} />
      </div>
      {state.message ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{state.message}</div> : null}
      <div className="flex items-center justify-between gap-3 text-xs text-stone-500">
        <span>Draft is saved locally in this browser while you fill the form.</span>
        <button type="button" onClick={clearDraft} className="font-medium text-stone-700 transition hover:text-stone-950">
          Clear draft
        </button>
      </div>

      <div className="space-y-5 py-2">
        {currentStep === 1 ? (
          <div className="grid gap-4">
            <h2 className="text-2xl font-semibold tracking-tight">Basic shop info</h2>
            <FieldShell label="Shop name" name="shopName" required error={getError("shopName")}>
              <TextInput id="shopName" name="shopName" value={shopName} onChange={(value) => { setShopName(value); setError("shopName", value.trim() ? "" : "Shop name is required."); }} placeholder="Soni Mobile World" />
            </FieldShell>
            <FieldShell label="Legal business name" name="legalName" error={getError("legalName")}>
              <TextInput id="legalName" name="legalName" value={legalName} onChange={setLegalName} placeholder="Soni Electronics Pvt Ltd" />
            </FieldShell>
            <FieldShell label="Shop slug" name="slug" required error={getError("slug")}>
              <TextInput id="slug" name="slug" value={slugValue} onChange={(value) => { const next = value.toLowerCase().replace(/\s+/g, "-"); setSlugManuallyEdited(true); setSlugInput(next); setError("slug", next.trim() ? "" : "Shop slug is required."); }} placeholder="soni-mobile-world" rightAdornment={slugState === "checking" ? <LoaderCircle className="h-4 w-4 animate-spin text-stone-400" /> : slugState === "available" ? <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"><Check className="h-3.5 w-3.5" /></span> : slugState === "taken" || slugState === "error" ? <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-100 text-red-600"><X className="h-3.5 w-3.5" /></span> : null} />
            </FieldShell>
            {slugState === "checking" ? <p className="text-xs text-stone-500">Checking slug...</p> : null}
            {slugState === "taken" ? <p className="text-xs font-medium text-red-600">{slugMessage || "Slug is already taken."}</p> : null}
            {slugState === "error" && slugMessage ? <p className="text-xs text-amber-700">Slug check could not be verified right now. You can still continue, and final submit will validate it. {slugMessage}</p> : null}
          <LogoPicker previewUrl={logoPreviewUrl} fileName={logoFileName} showPreview={showLogoPreview} isUploading={isUploadingLogo} uploadProgress={logoUploadProgress} onOpenPreview={() => setShowLogoPreview(true)} onClosePreview={() => setShowLogoPreview(false)} onFileChange={handleLogoChange} onRemove={() => { void handleLogoChange(null); setShowLogoPreview(false); }} />
            {isUploadingLogo ? <p className="text-xs text-stone-500">Uploading logo...</p> : null}
            {logoUploadError ? <p className="text-xs text-red-600">{logoUploadError}</p> : null}
          </div>
        ) : null}

        {currentStep === 2 ? (
          <div className="grid gap-4">
            <h2 className="text-2xl font-semibold tracking-tight">Contact</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <FieldShell label="Business phone" name="phone" required error={getError("phone")}>
                <TextInput id="phone" name="phone" value={phone} onChange={(value) => { const digits = value.replace(/\D/g, "").slice(0, 10); setPhone(digits); setError("phone", /^\d{10}$/.test(digits) ? "" : "Enter a valid 10-digit mobile number."); }} placeholder="9876543210" inputMode="numeric" maxLength={10} />
              </FieldShell>
              <FieldShell label="WhatsApp number" name="whatsapp" error={getError("whatsapp")}>
                <TextInput id="whatsapp" name="whatsapp" value={whatsapp} onChange={(value) => { const digits = value.replace(/\D/g, "").slice(0, 10); setWhatsapp(digits); setError("whatsapp", !digits || /^\d{10}$/.test(digits) ? "" : "Enter a valid 10-digit WhatsApp number."); }} placeholder="9876543210" inputMode="numeric" maxLength={10} />
              </FieldShell>
            </div>
            <FieldShell label="Business email" name="email" required error={getError("email")}>
              <TextInput id="email" name="email" value={email} onChange={(value) => { setEmail(value); setError("email", /^\S+@\S+\.\S+$/.test(value) ? "" : "Enter a valid business email."); }} placeholder="shop@example.com" type="email" />
            </FieldShell>
          </div>
        ) : null}

        {currentStep === 3 ? (
          <div className="grid gap-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-2xl font-semibold tracking-tight">Address + location</h2>
              {isResolvingLocation ? <span className="text-xs text-stone-500">Updating address...</span> : null}
            </div>
            <div className="grid gap-3">
              <div className="flex items-center gap-2 text-sm font-medium text-stone-900"><MapPin className="h-4 w-4" />Pick shop location<span className="text-red-500">*</span></div>
              <DynamicLocationPicker value={location} onChange={handleLocationChange} />
              <p className="text-xs text-stone-500">Click the map to place the marker, then drag it to fine-tune the shop location.</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-500">
                <span>Lat: {latitude || "-"}</span>
                <span>Lng: {longitude || "-"}</span>
              </div>
              {getError("location") ? <span className="text-xs text-red-600">{getError("location")}</span> : null}
            </div>
            <FieldShell label="Address line 1" name="addressLine1" required error={getError("addressLine1")}>
              <TextInput id="addressLine1" name="addressLine1" value={addressLine1} onChange={(value) => { setAddressLine1(value); setError("addressLine1", value.trim() ? "" : "Address line 1 is required."); }} placeholder="Main market road" />
            </FieldShell>
            <FieldShell label="Address line 2" name="addressLine2" error={getError("addressLine2")}>
              <TextInput id="addressLine2" name="addressLine2" value={addressLine2} onChange={setAddressLine2} placeholder="Near bus stand" />
            </FieldShell>
            <div className="grid gap-4 sm:grid-cols-2">
              <FieldShell label="City" name="city" required error={getError("city")}>
                <TextInput id="city" name="city" value={city} onChange={(value) => { setCity(value); setError("city", value.trim() ? "" : "City is required."); }} placeholder="Mumbai" />
              </FieldShell>
              <FieldShell label="State" name="state" required error={getError("state")}>
                <TextInput id="state" name="state" value={stateValue} onChange={(value) => { setStateValue(value); setError("state", value.trim() ? "" : "State is required."); }} placeholder="Maharashtra" />
              </FieldShell>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FieldShell label="Postal code" name="postalCode" required error={getError("postalCode")}>
                <TextInput id="postalCode" name="postalCode" value={postalCode} onChange={(value) => { setPostalCode(value); setError("postalCode", value.trim() ? "" : "Postal code is required."); }} placeholder="400001" />
              </FieldShell>
              <FieldShell label="Country" name="country" required error={getError("country")}>
                <TextInput id="country" name="country" value={country} onChange={(value) => { setCountry(value); setError("country", value.trim() ? "" : "Country is required."); }} placeholder="India" />
              </FieldShell>
            </div>
            <input type="hidden" name="latitude" value={latitude} />
            <input type="hidden" name="longitude" value={longitude} />
          </div>
        ) : null}

        {currentStep === 4 ? (
          <div className="grid gap-4">
            <h2 className="text-2xl font-semibold tracking-tight">Billing setup</h2>
            <FieldShell label="GST number" name="gstNumber" error={getError("gstNumber")}>
              <TextInput id="gstNumber" name="gstNumber" value={gstNumber} onChange={setGstNumber} placeholder="22AAAAA0000A1Z5" />
            </FieldShell>
            <div className="grid gap-4 sm:grid-cols-2">
              <FieldShell label="Invoice prefix" name="invoicePrefix" required error={getError("invoicePrefix")}>
                <TextInput id="invoicePrefix" name="invoicePrefix" value={invoicePrefixValue} onChange={(value) => { setInvoicePrefixEdited(true); const clean = value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 10); setInvoicePrefix(clean); setError("invoicePrefix", clean ? "" : "Invoice prefix is required."); }} placeholder="SONI" />
              </FieldShell>
              <FieldShell label="Currency" name="currency" required error={getError("currency")}>
                <TextInput id="currency" name="currency" value={currency} onChange={(value) => { const next = value.toUpperCase().slice(0, 5); setCurrency(next); setError("currency", next ? "" : "Currency is required."); }} placeholder="INR" />
              </FieldShell>
            </div>
            <FieldShell label="Tax mode" name="taxMode" required error={getError("taxMode")}>
              <SelectField id="taxMode" name="taxMode" value={taxMode} onChange={setTaxMode} options={[{ label: "Tax exclusive", value: "exclusive" }, { label: "Tax inclusive", value: "inclusive" }, { label: "No tax", value: "no_tax" }]} />
            </FieldShell>
            <FieldShell label="Invoice footer" name="invoiceFooter" error={getError("invoiceFooter")}>
              <div className="grid gap-2">
                <textarea id="invoiceFooter" name="invoiceFooter" rows={5} value={invoiceFooter} onChange={(event) => setInvoiceFooter(event.target.value)} placeholder={"Thank you for shopping with us.\n1. Goods once sold are not returnable\n2. Please keep this invoice safe"} className="rounded-2xl bg-stone-100 px-4 py-3 outline-none transition focus:bg-stone-50" />
                <span className="text-xs text-stone-500">Press Enter for a new line. Use numbers for clean policy points.</span>
              </div>
            </FieldShell>
          </div>
        ) : null}

        {currentStep === 5 ? (
          <div className="grid gap-4">
            <h2 className="text-2xl font-semibold tracking-tight">Business timings</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <FieldShell label="Opening time" name="openingTime" required error={getError("openingTime")}>
                <TextInput id="openingTime" name="openingTime" type="time" value={openingTime} onChange={setOpeningTime} />
              </FieldShell>
              <FieldShell label="Closing time" name="closingTime" required error={getError("closingTime")}>
                <TextInput id="closingTime" name="closingTime" type="time" value={closingTime} onChange={setClosingTime} />
              </FieldShell>
            </div>
            <div className="grid gap-3">
              <div className="text-sm font-medium text-stone-900">Working days<span className="ml-1 text-red-500">*</span></div>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                {workingDays.map((day) => {
                  const selected = selectedDays.includes(day.value);
                  return (
                    <label key={day.value} className={["flex cursor-pointer items-center justify-center rounded-2xl px-2 py-3 text-xs font-medium transition", selected ? "bg-stone-950 text-white" : "bg-stone-100 text-stone-700"].join(" ")}>
                      <input type="checkbox" value={day.value} checked={selected} onChange={(event) => { setSelectedDays((current) => event.target.checked ? [...current, day.value] : current.filter((value) => value !== day.value)); setError("workingDays", ""); }} className="sr-only" />
                      {day.label}
                    </label>
                  );
                })}
              </div>
              {getError("workingDays") ? <span className="text-xs text-red-600">{getError("workingDays")}</span> : null}
            </div>
          </div>
        ) : null}

        {currentStep === 6 ? (
          <div className="grid gap-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">Review and confirm</h2>
                <p className="mt-1 text-sm text-stone-500">Check all details before creating the shop. Use the edit icon next to any field to jump back and change it.</p>
              </div>
            </div>
            {previewSections.map((section) => (
              <div key={section.title} className="grid gap-3">
                <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-stone-500">{section.title}</h3>
                <div className="grid gap-3">
                  {section.items.map((item) => (
                    <PreviewField
                      key={`${section.title}-${item.label}`}
                      label={item.label}
                      value={item.value}
                      step={item.step}
                      onEdit={setCurrentStep}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <input type="hidden" name="shopName" value={shopName} />
      <input type="hidden" name="legalName" value={legalName} />
      <input type="hidden" name="slug" value={slugValue} />
      <input type="hidden" name="phone" value={phone} />
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="whatsapp" value={whatsapp} />
      <input type="hidden" name="logoUrl" value={logoUrl} />
      <input type="hidden" name="addressLine1" value={addressLine1} />
      <input type="hidden" name="addressLine2" value={addressLine2} />
      <input type="hidden" name="city" value={city} />
      <input type="hidden" name="state" value={stateValue} />
      <input type="hidden" name="postalCode" value={postalCode} />
      <input type="hidden" name="country" value={country} />
      <input type="hidden" name="latitude" value={latitude} />
      <input type="hidden" name="longitude" value={longitude} />
      <input type="hidden" name="gstNumber" value={gstNumber} />
      <input type="hidden" name="invoicePrefix" value={invoicePrefixValue} />
      <input type="hidden" name="currency" value={currency} />
      <input type="hidden" name="taxMode" value={taxMode} />
      <input type="hidden" name="invoiceFooter" value={invoiceFooter} />
      <input type="hidden" name="openingTime" value={openingTime} />
      <input type="hidden" name="closingTime" value={closingTime} />
      {selectedDays.map((day) => (
        <input key={day} type="hidden" name="workingDays" value={day} />
      ))}

      <div className="flex items-center justify-between gap-3 pt-2">
        <button type="button" onClick={() => goToStep(currentStep - 1)} disabled={currentStep === 1 || isPending} className="flex h-12 items-center justify-center gap-2 rounded-full border border-stone-300 bg-white px-5 text-sm font-semibold text-stone-900 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft className="h-4 w-4" /><span>Back</span></button>
        {currentStep < steps.length ? (
          <button type="button" onClick={() => goToStep(currentStep + 1)} className="flex h-12 items-center justify-center gap-2 rounded-full bg-stone-950 px-5 text-sm font-semibold text-white transition hover:bg-stone-800"><span>Next</span><ChevronRight className="h-4 w-4" /></button>
        ) : (
          <button type="submit" disabled={isPending || isUploadingLogo || slugState === "taken"} className="flex h-12 items-center justify-center gap-2 rounded-full bg-stone-950 px-5 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-60">{isPending ? <Upload className="h-4 w-4 animate-pulse" /> : null}<span>{isPending ? "Creating Shop..." : isUploadingLogo ? "Uploading Logo..." : "Create Shop"}</span><ChevronRight className="h-4 w-4" /></button>
        )}
      </div>
    </form>
  );
}
