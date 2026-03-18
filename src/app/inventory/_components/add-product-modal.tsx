"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  LoaderCircle,
  ImagePlus,
  Laptop,
  PackageOpen,
  Pencil,
  Plus,
  ScanBarcode,
  Search,
  Smartphone,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import type { Brand, Category, IdentifierType, ProductKind } from "@/lib/types/inventory";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ActionResponse, createProductAction, updateProductAction } from "../actions";
import { BarcodeScanner } from "./barcode-scanner";
import { fetchProductDetails, productDetailsQueryKey } from "../queries";

type StepId = "basics" | "variants" | "stock" | "preview";
type SearchableOption = { value: string; label: string };

type ProductProfile = {
  id: ProductKind;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
};

type IdentifierField = {
  id: string;
  value: string;
};

type VariantDraft = {
  id: string;
  label: string;
  color: string;
  storage: string;
  quantity: string;
  identifiers: IdentifierField[];
};

type SelectedImage = {
  id: string;
  previewUrl: string;
} & (
  | {
      kind: "new";
      file: File;
    }
  | {
      kind: "existing";
      imageUrl: string;
      publicId: string;
    }
);

const profiles: ProductProfile[] = [
  { id: "MOBILE", title: "Mobile", subtitle: "IMEI tracked", icon: Smartphone },
  { id: "SERIALIZED", title: "Serialized", subtitle: "Laptop, watch, device", icon: Laptop },
  { id: "QUANTITY_BASED", title: "Quantity", subtitle: "Charger, cable, accessory", icon: PackageOpen },
];

function createIdentifierField(value = ""): IdentifierField {
  return { id: crypto.randomUUID(), value };
}

function createVariant(productKind: ProductKind): VariantDraft {
  return {
    id: crypto.randomUUID(),
    label: productKind === "QUANTITY_BASED" ? "Default" : "",
    color: "",
    storage: "",
    quantity: "0",
    identifiers: [createIdentifierField()],
  };
}

function buildVariantName(variant: VariantDraft) {
  const parts = [variant.label.trim(), variant.storage.trim(), variant.color.trim()].filter(Boolean);
  return parts.length > 0 ? parts.join(" / ") : "Default";
}

function getStepsForProfile(productKind: ProductKind | null): StepId[] {
  if (!productKind) return [];
  return productKind === "QUANTITY_BASED" ? ["basics", "stock", "preview"] : ["basics", "variants", "stock", "preview"];
}

function getProfileCopy(productKind: ProductKind | null) {
  if (productKind === "MOBILE") {
    return {
      namePlaceholder: "iPhone 16",
      stockTitle: "IMEI Stock",
      identifierLabel: "IMEI",
    };
  }
  if (productKind === "SERIALIZED") {
    return {
      namePlaceholder: "Apple Watch Ultra",
      stockTitle: "Serialized Stock",
      identifierLabel: "Identifier",
    };
  }
  return {
    namePlaceholder: "20W Charger",
    stockTitle: "Opening Stock",
    identifierLabel: "Quantity",
  };
}

function ProductStepIndicator({
  steps,
  currentStep,
  onStepChange,
  profile,
}: {
  steps: StepId[];
  currentStep: StepId;
  onStepChange: (step: StepId) => void;
  profile: ProductProfile;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stepRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const ProfileIcon = profile.icon;

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
    const activeIndex = steps.indexOf(currentStep);
    stepRefs.current[activeIndex]?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [currentStep, steps]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="inline-flex items-center gap-2">
          <ProfileIcon className="h-4 w-4 text-teal-700" />
          <span className="text-sm font-semibold text-stone-950">{profile.title}</span>
        </div>
        <div className="flex items-center gap-2">
          {canScrollLeft ? (
            <button
              type="button"
              onClick={() => scrollRef.current?.scrollBy({ left: -160, behavior: "smooth" })}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-700 transition hover:bg-stone-50"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          ) : null}
          {canScrollRight ? (
            <button
              type="button"
              onClick={() => scrollRef.current?.scrollBy({ left: 160, behavior: "smooth" })}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-700 transition hover:bg-stone-50"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>

      <div ref={scrollRef} className="scrollbar-hidden overflow-x-auto">
        <div className="flex min-w-max items-start pr-4">
          {steps.map((step, index) => {
            const active = step === currentStep;
            const complete = index < steps.indexOf(currentStep);
            const isLast = index === steps.length - 1;
            return (
              <div key={step} className="flex items-start">
                <button
                  ref={(element) => {
                    stepRefs.current[index] = element;
                  }}
                  type="button"
                  onClick={() => onStepChange(step)}
                  className="flex min-w-20 flex-col items-center gap-2 text-center"
                >
                  <div
                    className={cn(
                      "flex h-11 w-11 items-center justify-center rounded-full text-sm font-semibold transition",
                      active
                        ? "bg-teal-700 text-white"
                        : complete
                          ? "bg-orange-200 text-stone-950"
                          : "bg-stone-100 text-stone-500"
                    )}
                  >
                    {complete ? <Check className="h-4 w-4" /> : index + 1}
                  </div>
                  <p className="text-xs font-medium capitalize text-stone-900">{step}</p>
                </button>
                {!isLast ? (
                  <div className="mt-5 h-px w-12 bg-stone-200">
                    <div className={cn("h-px transition", complete ? "w-full bg-orange-300" : "w-0 bg-transparent")} />
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

function SearchableSelect({
  label,
  value,
  onChange,
  options,
  placeholder,
  emptyLabel,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SearchableOption[];
  placeholder: string;
  emptyLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  const filtered = options.filter((option) => option.label.toLowerCase().includes(query.trim().toLowerCase()));
  const selected = options.find((option) => option.value === value);

  return (
    <div className="space-y-2" ref={wrapperRef}>
      <Label>{label}</Label>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="flex h-11 w-full items-center justify-between rounded-xl border border-stone-300 bg-white px-3 text-sm text-stone-900 transition hover:bg-stone-50"
        >
          <span className={cn(!selected && "text-stone-400")}>{selected?.label || placeholder}</span>
          <ChevronsUpDown className="h-4 w-4 text-stone-400" />
        </button>

        {open ? (
          <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-30 rounded-2xl border border-stone-200 bg-white p-2 shadow-xl">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${label.toLowerCase()}`} className="pl-9" />
            </div>
            <div className="mt-2 max-h-52 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="px-3 py-2 text-sm text-stone-400">{emptyLabel}</p>
              ) : (
                filtered.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                      setQuery("");
                    }}
                    className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-stone-900 transition hover:bg-stone-100"
                  >
                    <span>{option.label}</span>
                    {option.value === value ? <Check className="h-4 w-4 text-teal-700" /> : null}
                  </button>
                ))
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function IdentifierTypePicker({
  value,
  onChange,
}: {
  value: IdentifierType;
  onChange: (value: IdentifierType) => void;
}) {
  const options: IdentifierType[] = ["SERIAL_NUMBER", "UNIQUE_ID", "IMEI"];
  return (
    <div className="space-y-2">
      <Label>Identifier Type</Label>
      <div className="grid grid-cols-3 gap-2">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={cn(
              "rounded-xl border px-3 py-2 text-xs font-semibold tracking-[0.12em] uppercase transition",
              value === option
                ? "border-teal-700 bg-teal-700 text-white"
                : "border-stone-200 bg-white text-stone-600 hover:bg-stone-50"
            )}
          >
            {option === "SERIAL_NUMBER" ? "Serial" : option === "UNIQUE_ID" ? "Unique ID" : "IMEI"}
          </button>
        ))}
      </div>
    </div>
  );
}

export function AddProductModal({
  open,
  mode,
  productId,
  onClose,
  categories,
  brands,
}: {
  open: boolean;
  mode: "create" | "edit";
  productId: string | null;
  onClose: () => void;
  categories: Category[];
  brands: Brand[];
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [state, setState] = useState<ActionResponse>({
    status: "success",
    message: "",
  });
  const [isPending, startTransition] = useTransition();
  const [selectedProfile, setSelectedProfile] = useState<ProductKind | null>(null);
  const [currentStep, setCurrentStep] = useState<StepId>("basics");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [lowStockThreshold, setLowStockThreshold] = useState("5");
  const [categoryMode, setCategoryMode] = useState<"existing" | "new">("existing");
  const [brandMode, setBrandMode] = useState<"existing" | "new">("existing");
  const [selectedCategoryId, setSelectedCategoryId] = useState(categories[0]?.id ?? "");
  const [selectedBrandId, setSelectedBrandId] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newBrandName, setNewBrandName] = useState("");
  const [identifierType, setIdentifierType] = useState<IdentifierType>("SERIAL_NUMBER");
  const [variants, setVariants] = useState<VariantDraft[]>([]);
  const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([]);
  const [fullscreenImageId, setFullscreenImageId] = useState<string | null>(null);
  const [scanningTarget, setScanningTarget] = useState<{ variantId: string; fieldId: string } | null>(null);
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasLoadedEditProductRef = useRef<string | null>(null);
  const isEditMode = mode === "edit" && Boolean(productId);
  const { data: editingProduct, isLoading: isLoadingEditProduct } = useQuery({
    queryKey: productId ? productDetailsQueryKey(productId) : ["inventory", "product-details", "edit-idle"],
    queryFn: productId ? () => fetchProductDetails(productId) : skipToken,
    enabled: open && isEditMode && Boolean(productId),
    staleTime: 10 * 60 * 1000,
  });

  useEffect(() => {
    if (state.status === "success" && state.message) {
      toast.success(state.message);
      router.refresh();
      if (productId) {
        void queryClient.invalidateQueries({ queryKey: productDetailsQueryKey(productId) });
      }
      onClose();
    } else if (state.status === "error" && state.message) {
      toast.error(state.message);
    }
  }, [state, onClose, productId, queryClient, router]);

  const steps = getStepsForProfile(selectedProfile);
  const stepIndex = steps.indexOf(currentStep);
  const profileCopy = getProfileCopy(selectedProfile);
  const trackingType = selectedProfile === "QUANTITY_BASED" ? "QUANTITY_BASED" : "SERIALIZED";
  const resolvedIdentifierType = selectedProfile === "MOBILE" ? "IMEI" : identifierType;
  const selectedProfileMeta = profiles.find((profile) => profile.id === selectedProfile) ?? profiles[0];
  const categoryOptions = categories.map((category) => ({ value: category.id, label: category.name }));
  const brandOptions = brands.map((brand) => ({ value: brand.id, label: brand.name }));

  const payload = useMemo(() => {
    const activeVariants = selectedProfile === "QUANTITY_BASED" ? variants.slice(0, 1) : variants;
    return JSON.stringify({
      variants: activeVariants.map((variant) => ({
        temp_key: variant.id,
        name: buildVariantName(variant),
        color: variant.color.trim() || null,
        storage_label: variant.storage.trim() || null,
        quantity: selectedProfile === "QUANTITY_BASED" ? Number.parseInt(variant.quantity || "0", 10) || 0 : 0,
        purchase_price_override: null,
        selling_price_override: null,
      })),
      units:
        selectedProfile === "QUANTITY_BASED"
          ? []
          : activeVariants.flatMap((variant) =>
              variant.identifiers
                .map((field) => field.value.trim())
                .filter(Boolean)
                .map((value) => ({
                  variant_temp_key: variant.id,
                  identifier_type: resolvedIdentifierType,
                  identifier_value: value,
                }))
            ),
    });
  }, [resolvedIdentifierType, selectedProfile, variants]);

  const totalUnits = useMemo(() => {
    if (selectedProfile === "QUANTITY_BASED") {
      return Number.parseInt(variants[0]?.quantity || "0", 10) || 0;
    }
    return variants.reduce(
      (sum, variant) => sum + variant.identifiers.filter((field) => field.value.trim().length > 0).length,
      0
    );
  }, [selectedProfile, variants]);

  const canSubmit =
    currentStep === "preview" &&
    name.trim().length > 0 &&
    description.trim().length > 0 &&
    purchasePrice.trim().length > 0 &&
    sellingPrice.trim().length > 0 &&
    lowStockThreshold.trim().length > 0 &&
    ((brandMode === "existing" && selectedBrandId.length > 0) || (brandMode === "new" && newBrandName.trim().length > 0)) &&
    ((categoryMode === "existing" && selectedCategoryId.length > 0) || (categoryMode === "new" && newCategoryName.trim().length > 0)) &&
    selectedImages.length > 0 &&
    (selectedProfile === "QUANTITY_BASED" ? totalUnits >= 0 : totalUnits > 0);

  useEffect(() => {
    if (!open || !isEditMode || !editingProduct || !productId) return;
    if (hasLoadedEditProductRef.current === productId) return;

    const frame = window.requestAnimationFrame(() => {
      hasLoadedEditProductRef.current = productId;
      setSelectedProfile(editingProduct.product_kind);
      setCurrentStep("basics");
      setName(editingProduct.name ?? "");
      setDescription(editingProduct.description ?? "");
      setPurchasePrice(String(editingProduct.base_purchase_price ?? ""));
      setSellingPrice(String(editingProduct.base_selling_price ?? ""));
      setLowStockThreshold(String(editingProduct.low_stock_threshold ?? 0));
      setCategoryMode(editingProduct.category_id ? "existing" : "new");
      setBrandMode(editingProduct.brand_id ? "existing" : "new");
      setSelectedCategoryId(editingProduct.category_id ?? categories[0]?.id ?? "");
      setSelectedBrandId(editingProduct.brand_id ?? "");
      setNewCategoryName(editingProduct.category_id ? "" : editingProduct.category?.name ?? "");
      setNewBrandName(editingProduct.brand_id ? "" : editingProduct.brand?.name ?? "");
      setIdentifierType(
        editingProduct.product_kind === "MOBILE"
          ? "IMEI"
          : (editingProduct.inventory_items?.[0]?.identifier_type as IdentifierType | undefined) ?? "SERIAL_NUMBER"
      );
      setClientErrors({});
      setState({ status: "success", message: "" });

      const incomingImages: SelectedImage[] = [];
      const seenPublicIds = new Set<string>();
      if (editingProduct.image_url && editingProduct.image_public_id) {
        incomingImages.push({
          id: `existing-primary-${editingProduct.image_public_id}`,
          kind: "existing",
          previewUrl: editingProduct.image_url,
          imageUrl: editingProduct.image_url,
          publicId: editingProduct.image_public_id,
        });
        seenPublicIds.add(editingProduct.image_public_id);
      }
      for (const image of editingProduct.product_images ?? []) {
        if (seenPublicIds.has(image.image_public_id)) continue;
        incomingImages.push({
          id: image.id,
          kind: "existing",
          previewUrl: image.image_url,
          imageUrl: image.image_url,
          publicId: image.image_public_id,
        });
        seenPublicIds.add(image.image_public_id);
      }
      setSelectedImages(incomingImages);

      const variantSource =
        editingProduct.variants && editingProduct.variants.length > 0
          ? editingProduct.variants
          : [{ id: crypto.randomUUID(), name: "Default", color: null, storage_label: null, quantity: 0 }];

      setVariants(
        variantSource.map((variant) => ({
          id: variant.id,
          label: variant.color || variant.storage_label ? "" : variant.name,
          color: variant.color ?? "",
          storage: variant.storage_label ?? "",
          quantity: String(variant.quantity ?? 0),
          identifiers:
            editingProduct.product_kind === "QUANTITY_BASED"
              ? [createIdentifierField()]
              : (
                  editingProduct.inventory_items
                    ?.filter((item) => item.variant_id === variant.id)
                    .map((item) => createIdentifierField(item.serial_number)) ?? []
                ).length > 0
                ? (
                    editingProduct.inventory_items
                      ?.filter((item) => item.variant_id === variant.id)
                      .map((item) => createIdentifierField(item.serial_number)) ?? []
                  )
                : [createIdentifierField()],
        }))
      );
    });

    return () => window.cancelAnimationFrame(frame);
  }, [categories, editingProduct, isEditMode, open, productId]);

  useEffect(() => {
    if (!open) {
      hasLoadedEditProductRef.current = null;
    }
  }, [open]);

  if (!open) return null;

  function chooseProfile(profile: ProductKind) {
    setSelectedProfile(profile);
    setCurrentStep("basics");
    setIdentifierType(profile === "SERIALIZED" ? "SERIAL_NUMBER" : "IMEI");
    setVariants([createVariant(profile)]);
    setSelectedImages([]);
    setFullscreenImageId(null);
    setClientErrors({});
    setState({ status: "success", message: "" });
  }

  function clearClientError(keys: string[]) {
    setClientErrors((current) => {
      const next = { ...current };
      let changed = false;
      for (const key of keys) {
        if (key in next) {
          delete next[key];
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }

  function addImages(files: FileList | null) {
    if (!files || files.length === 0) return;
    const next = Array.from(files).map((file) => ({
      id: crypto.randomUUID(),
      previewUrl: URL.createObjectURL(file),
      kind: "new" as const,
      file,
    }));
    setSelectedImages((current) => [...current, ...next]);
    clearClientError(["images"]);
  }

  function removeImage(imageId: string) {
    setSelectedImages((current) => {
      const target = current.find((image) => image.id === imageId);
      if (target?.kind === "new") URL.revokeObjectURL(target.previewUrl);
      return current.filter((image) => image.id !== imageId);
    });
    if (fullscreenImageId === imageId) setFullscreenImageId(null);
    if (selectedImages.length === 1) {
      clearClientError(["images"]);
    }
  }

  function setVariantField(variantId: string, key: "label" | "color" | "storage" | "quantity", value: string) {
    setVariants((current) =>
      current.map((variant) => (variant.id === variantId ? { ...variant, [key]: value } : variant))
    );
    if (key === "quantity") {
      clearClientError(["stock"]);
    }
  }

  function setIdentifierValue(variantId: string, fieldId: string, value: string) {
    setVariants((current) =>
      current.map((variant) =>
        variant.id === variantId
          ? {
              ...variant,
              identifiers: variant.identifiers.map((field) =>
                field.id === fieldId ? { ...field, value } : field
              ),
            }
          : variant
      )
    );
    clearClientError(["stock"]);
  }

  function addIdentifierField(variantId: string) {
    setVariants((current) =>
      current.map((variant) =>
        variant.id === variantId
          ? { ...variant, identifiers: [...variant.identifiers, createIdentifierField()] }
          : variant
      )
    );
    clearClientError(["stock"]);
  }

  function removeIdentifierField(variantId: string, fieldId: string) {
    setVariants((current) =>
      current.map((variant) =>
        variant.id === variantId
          ? {
              ...variant,
              identifiers:
                variant.identifiers.length > 1
                  ? variant.identifiers.filter((field) => field.id !== fieldId)
                  : variant.identifiers,
            }
          : variant
      )
    );
    clearClientError(["stock"]);
  }

  function validateStep(step: StepId) {
    const errors: Record<string, string> = {};

    if (step === "basics") {
      if (!name.trim()) errors.name = "Product name is required.";
      if (!description.trim()) errors.description = "Description is required.";
      if (selectedImages.length === 0) errors.images = "Add at least one product image.";
      if (!purchasePrice.trim()) {
        errors.base_purchase_price = "Purchase price is required.";
      } else if (Number.isNaN(Number(purchasePrice)) || Number(purchasePrice) < 0) {
        errors.base_purchase_price = "Purchase price must be 0 or more.";
      }
      if (!sellingPrice.trim()) {
        errors.base_selling_price = "Selling price is required.";
      } else if (Number.isNaN(Number(sellingPrice)) || Number(sellingPrice) < 0) {
        errors.base_selling_price = "Selling price must be 0 or more.";
      }
      if (!lowStockThreshold.trim()) {
        errors.low_stock_threshold = "Low stock threshold is required.";
      } else if (!Number.isInteger(Number(lowStockThreshold)) || Number(lowStockThreshold) < 0) {
        errors.low_stock_threshold = "Low stock threshold must be 0 or more.";
      }
      if (categoryMode === "existing" && !selectedCategoryId) errors.category = "Select a category.";
      if (categoryMode === "new" && !newCategoryName.trim()) errors.category = "Category name is required.";
      if (brandMode === "existing" && !selectedBrandId) errors.brand = "Select a brand.";
      if (brandMode === "new" && !newBrandName.trim()) errors.brand = "Brand name is required.";
    }

    if (step === "variants" && selectedProfile !== "QUANTITY_BASED") {
      const invalidVariant = variants.find(
        (variant) =>
          !variant.label.trim() &&
          !variant.color.trim() &&
          !variant.storage.trim()
      );

      if (invalidVariant) {
        errors.variants = "Each variant needs at least a label, color, or storage value.";
      }
    }

    if (step === "stock") {
      if (selectedProfile === "QUANTITY_BASED") {
        if (!(variants[0]?.quantity ?? "").trim()) {
          errors.stock = "Opening quantity is required.";
        } else if (Number.isNaN(Number(variants[0]?.quantity ?? "")) || Number(variants[0]?.quantity ?? "0") < 0) {
          errors.stock = "Opening quantity must be 0 or more.";
        }
      } else {
        const identifiers = variants.flatMap((variant) =>
          variant.identifiers.map((field) => field.value.trim()).filter(Boolean)
        );
        if (identifiers.length === 0) {
          errors.stock = `Add at least one ${resolvedIdentifierType === "IMEI" ? "IMEI" : "identifier"}.`;
        }
        const normalized = identifiers.map((value) => value.toLowerCase());
        if (new Set(normalized).size !== normalized.length) {
          errors.stock = "Duplicate identifier values found.";
        }
      }
    }

    setClientErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function handleStepChange(nextStep: StepId) {
    if (!selectedProfile || nextStep === currentStep) return;
    const nextIndex = steps.indexOf(nextStep);
    if (nextIndex === -1) return;

    if (nextIndex > stepIndex && !validateStep(currentStep)) {
      return;
    }

    setCurrentStep(nextStep);
  }

  function moveStep(direction: 1 | -1) {
    if (!selectedProfile) return;
    if (direction > 0 && !validateStep(currentStep)) return;
    const nextIndex = stepIndex + direction;
    if (nextIndex < 0 || nextIndex >= steps.length) return;
    setCurrentStep(steps[nextIndex]);
  }

  function submitForm() {
    if (!formRef.current) return;
    if (!validateStep("preview")) return;

    const formData = new FormData(formRef.current);
    formData.delete("images");
    for (const image of selectedImages) {
      if (image.kind === "new") {
        formData.append("images", image.file, image.file.name);
      }
    }
    formData.set(
      "existing_images",
      JSON.stringify(
        selectedImages
          .filter((image): image is Extract<SelectedImage, { kind: "existing" }> => image.kind === "existing")
          .map((image, index) => ({
            id: image.id,
            image_url: image.imageUrl,
            image_public_id: image.publicId,
            sort_order: index,
          }))
      )
    );
    if (productId) {
      formData.set("product_id", productId);
    }

    startTransition(async () => {
      const action = isEditMode ? updateProductAction : createProductAction;
      const result = await action({ status: "success", message: "" }, formData);
      setState(result);
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-stone-950/55 backdrop-blur-sm">
      <div
        className={cn(
          "fixed inset-x-0 mx-auto flex max-w-[450px] flex-col overflow-hidden bg-[#fcfaf6] shadow-[0_30px_80px_rgba(15,23,42,0.18)]",
          selectedProfile
            ? "bottom-0 top-8 rounded-t-[2rem] sm:bottom-6 sm:top-6 sm:rounded-[2rem]"
            : "top-1/2 max-h-[calc(100vh-3rem)] -translate-y-1/2 rounded-[2rem]"
        )}
      >
        <div className="flex items-center justify-between border-b border-stone-200/80 bg-[#fffdf9] px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            {selectedProfile ? <selectedProfileMeta.icon className="h-4 w-4 text-teal-700" /> : null}
            <h2 className="text-lg font-semibold text-stone-950">{isEditMode ? "Edit Product" : "Add Product"}</h2>
          </div>
          <button
            onClick={selectedProfile && !isEditMode ? () => setSelectedProfile(null) : onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-100 text-stone-500 transition hover:bg-stone-200 hover:text-stone-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {!selectedProfile && !isEditMode ? (
          <div className="px-6 py-8 sm:px-8">
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-700">Select Product Type</p>
            </div>

            <div className="mt-8 grid grid-cols-3 gap-4">
              {profiles.map((profile) => {
                const Icon = profile.icon;
                return (
                  <button
                    key={profile.id}
                    type="button"
                    onClick={() => chooseProfile(profile.id)}
                    className="group flex flex-col items-center text-center focus:outline-none"
                  >
                    <div className="flex h-24 w-24 items-center justify-center rounded-full border border-stone-200 bg-[#fffdf9] text-stone-500 shadow-sm transition group-hover:border-teal-700 group-hover:bg-teal-700 group-hover:text-white">
                      <Icon className="h-7 w-7" />
                    </div>
                    <div className="mt-4">
                      <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-stone-900">{profile.title}</h3>
                      <p className="mt-1 text-xs text-stone-400">{profile.subtitle}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : isLoadingEditProduct ? (
          <div className="flex min-h-[320px] items-center justify-center">
            <LoaderCircle className="h-6 w-6 animate-spin text-stone-500" />
          </div>
        ) : (
          <form
            ref={formRef}
            id="add-product-form"
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              submitForm();
            }}
          >
            <div className="sticky top-0 z-10 border-b border-stone-200/80 bg-[#fffdf9] px-4 py-3 sm:px-6">
              <ProductStepIndicator
                steps={steps}
                currentStep={currentStep}
                onStepChange={handleStepChange}
                profile={selectedProfileMeta}
              />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
              {currentStep === "basics" ? (
                <section className="space-y-4 py-2">
                  <StepTitle step={stepIndex + 1} title="Basics" />
                  <Field label="Product Name" required error={clientErrors.name || state.fieldErrors?.name}>
                    <Input
                      name="name"
                      value={name}
                      onChange={(event) => {
                        setName(event.target.value);
                        clearClientError(["name"]);
                      }}
                      placeholder={profileCopy.namePlaceholder}
                      required
                    />
                  </Field>

                  <Field label="Product Images" required error={clientErrors.images}>
                    <div className="space-y-3">
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
                            <button type="button" onClick={() => setFullscreenImageId(image.id)} className="h-full w-full">
                              <img src={image.previewUrl} alt="Selected product" className="h-full w-full object-cover" />
                            </button>
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

                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(event) => addImages(event.target.files)}
                      />
                    </div>
                  </Field>

                  <Field label="Description" required error={clientErrors.description || state.fieldErrors?.description}>
                    <Textarea
                      name="description"
                      value={description}
                      onChange={(event) => {
                        setDescription(event.target.value);
                        clearClientError(["description"]);
                      }}
                      placeholder="Describe the product, condition, specs, and what the customer should know."
                    />
                  </Field>

                  <ChooserField
                    label="Category"
                    mode={categoryMode}
                    onToggle={() => setCategoryMode((current) => (current === "existing" ? "new" : "existing"))}
                    error={clientErrors.category}
                    existing={
                      <SearchableSelect
                        label="Category"
                        value={selectedCategoryId}
                        onChange={(value) => {
                          setSelectedCategoryId(value);
                          clearClientError(["category"]);
                        }}
                        options={categoryOptions}
                        placeholder="Select category"
                        emptyLabel="No category found."
                      />
                    }
                    created={
                      <Field label="New Category" required error={clientErrors.category}>
                        <Input
                          value={newCategoryName}
                          onChange={(event) => {
                            setNewCategoryName(event.target.value);
                            clearClientError(["category"]);
                          }}
                          placeholder="Create a new category"
                        />
                      </Field>
                    }
                  />

                  <ChooserField
                    label="Brand"
                    mode={brandMode}
                    onToggle={() => setBrandMode((current) => (current === "existing" ? "new" : "existing"))}
                    error={clientErrors.brand}
                    existing={
                      <SearchableSelect
                        label="Brand"
                        value={selectedBrandId}
                        onChange={(value) => {
                          setSelectedBrandId(value);
                          clearClientError(["brand"]);
                        }}
                        options={brandOptions}
                        placeholder="Select brand"
                        emptyLabel="No brand found."
                      />
                    }
                    created={
                      <Field label="New Brand" required error={clientErrors.brand}>
                        <Input
                          value={newBrandName}
                          onChange={(event) => {
                            setNewBrandName(event.target.value);
                            clearClientError(["brand"]);
                          }}
                          placeholder="Create a new brand"
                        />
                      </Field>
                    }
                  />

                  <Field label="Base Purchase Price" required error={clientErrors.base_purchase_price || state.fieldErrors?.base_purchase_price}>
                    <Input
                      name="base_purchase_price"
                      type="number"
                      min="0"
                      step="0.01"
                      value={purchasePrice}
                      onChange={(event) => {
                        setPurchasePrice(event.target.value);
                        clearClientError(["base_purchase_price"]);
                      }}
                      placeholder="0.00"
                      required
                    />
                  </Field>

                  <Field label="Base Selling Price" required error={clientErrors.base_selling_price || state.fieldErrors?.base_selling_price}>
                    <Input
                      name="base_selling_price"
                      type="number"
                      min="0"
                      step="0.01"
                      value={sellingPrice}
                      onChange={(event) => {
                        setSellingPrice(event.target.value);
                        clearClientError(["base_selling_price"]);
                      }}
                      placeholder="0.00"
                      required
                    />
                  </Field>

                  <Field label="Low Stock Threshold" required error={clientErrors.low_stock_threshold || state.fieldErrors?.low_stock_threshold}>
                    <Input
                      name="low_stock_threshold"
                      type="number"
                      min="0"
                      value={lowStockThreshold}
                      onChange={(event) => {
                        setLowStockThreshold(event.target.value);
                        clearClientError(["low_stock_threshold"]);
                      }}
                    />
                  </Field>
                </section>
              ) : null}

              {currentStep === "variants" ? (
                <section className="space-y-4 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <StepTitle step={stepIndex + 1} title="Variants" />
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setVariants((current) => [...current, createVariant(selectedProfile ?? "SERIALIZED")]);
                        clearClientError(["variants"]);
                      }}
                    >
                      <Plus className="h-4 w-4" />
                      Add Variant
                    </Button>
                  </div>
                  {clientErrors.variants ? <p className="text-sm text-rose-600">{clientErrors.variants}</p> : null}

                  {variants.map((variant, index) => (
                    <div key={variant.id} className="space-y-3 border-b border-stone-200 pb-4 last:border-b-0">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-stone-900">Variant {index + 1}</p>
                        {variants.length > 1 ? (
                          <Button
                            variant="ghost"
                            className="h-8 px-2 text-rose-600 hover:bg-rose-50"
                            onClick={() => setVariants((current) => current.filter((item) => item.id !== variant.id))}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        ) : null}
                      </div>

                      <Field label="Label">
                        <Input value={variant.label} onChange={(event) => setVariantField(variant.id, "label", event.target.value)} placeholder="Standard" />
                      </Field>
                      <Field label="Color">
                        <Input value={variant.color} onChange={(event) => setVariantField(variant.id, "color", event.target.value)} placeholder="Black" />
                      </Field>
                      <Field label={selectedProfile === "MOBILE" ? "Storage" : "Size / Storage"}>
                        <Input value={variant.storage} onChange={(event) => setVariantField(variant.id, "storage", event.target.value)} placeholder={selectedProfile === "MOBILE" ? "128GB" : "Optional"} />
                      </Field>
                    </div>
                  ))}
                </section>
              ) : null}

              {currentStep === "stock" ? (
                <section className="space-y-4 py-2">
                  <StepTitle step={stepIndex + 1} title={profileCopy.stockTitle} />
                  {selectedProfile === "SERIALIZED" ? <IdentifierTypePicker value={identifierType} onChange={setIdentifierType} /> : null}
                  {clientErrors.stock ? <p className="text-sm text-rose-600">{clientErrors.stock}</p> : null}
                  {state.fieldErrors?.product_payload ? <p className="text-sm text-rose-600">{state.fieldErrors.product_payload}</p> : null}

                  {(selectedProfile === "QUANTITY_BASED" ? variants.slice(0, 1) : variants).map((variant, index) => (
                    <div key={variant.id} className="space-y-3 border-b border-stone-200 pb-4 last:border-b-0">
                      <div>
                        <p className="text-sm font-semibold text-stone-900">{selectedProfile === "QUANTITY_BASED" ? "Stock" : `Variant ${index + 1}`}</p>
                        <p className="text-sm text-stone-500">{selectedProfile === "QUANTITY_BASED" ? "Opening quantity for this product" : buildVariantName(variant)}</p>
                      </div>

                      {selectedProfile === "QUANTITY_BASED" ? (
                        <Field label="Opening Quantity">
                          <Input type="number" min="0" value={variant.quantity} onChange={(event) => setVariantField(variant.id, "quantity", event.target.value)} placeholder="0" />
                        </Field>
                      ) : (
                        <div className="space-y-3">
                          {variant.identifiers.map((field, fieldIndex) => (
                            <div key={field.id} className="flex items-center gap-2">
                              <Input
                                value={field.value}
                                onChange={(event) => setIdentifierValue(variant.id, field.id, event.target.value)}
                                placeholder={resolvedIdentifierType === "IMEI" ? "Enter IMEI" : "Enter identifier"}
                              />
                              <Button variant="ghost" className="h-11 w-11 shrink-0 px-0 text-stone-900 hover:bg-stone-100" onClick={() => setScanningTarget({ variantId: variant.id, fieldId: field.id })}>
                                <ScanBarcode className="h-4 w-4" />
                              </Button>
                              {fieldIndex > 0 ? (
                                <Button variant="ghost" className="h-11 w-11 shrink-0 px-0 text-rose-600 hover:bg-rose-50" onClick={() => removeIdentifierField(variant.id, field.id)}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              ) : null}
                            </div>
                          ))}
                          <Button variant="secondary" onClick={() => addIdentifierField(variant.id)}>
                            <Plus className="h-4 w-4" />
                            Add More
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </section>
              ) : null}

              {currentStep === "preview" ? (
                <section className="space-y-4 py-2">
                  <StepTitle step={stepIndex + 1} title="Preview" />
                  <PreviewField
                    label="Profile"
                    value={selectedProfileMeta.title}
                    step="basics"
                    onEdit={handleStepChange}
                  />
                  <PreviewField
                    label="Name"
                    value={name || "Not entered yet"}
                    step="basics"
                    onEdit={handleStepChange}
                  />
                  <PreviewField
                    label="Description"
                    value={description || "Not entered yet"}
                    step="basics"
                    onEdit={handleStepChange}
                  />
                  <PreviewField
                    label="Category"
                    value={
                      categoryMode === "existing"
                        ? categories.find((category) => category.id === selectedCategoryId)?.name || "Not selected"
                        : newCategoryName || "Not entered yet"
                    }
                    step="basics"
                    onEdit={handleStepChange}
                  />
                  <PreviewField
                    label="Brand"
                    value={
                      brandMode === "existing"
                        ? brands.find((brand) => brand.id === selectedBrandId)?.name || "Not selected"
                        : newBrandName || "Not entered yet"
                    }
                    step="basics"
                    onEdit={handleStepChange}
                  />
                  <PreviewField
                    label="Purchase Price"
                    value={purchasePrice ? `₹${purchasePrice}` : "Not entered yet"}
                    step="basics"
                    onEdit={handleStepChange}
                  />
                  <PreviewField
                    label="Selling Price"
                    value={sellingPrice ? `₹${sellingPrice}` : "Not entered yet"}
                    step="basics"
                    onEdit={handleStepChange}
                  />
                  <PreviewField
                    label="Low Stock Threshold"
                    value={lowStockThreshold || "Not entered yet"}
                    step="basics"
                    onEdit={handleStepChange}
                  />
                  <PreviewField
                    label="Images"
                    value={
                      selectedImages.length > 0 ? (
                        <div className="flex gap-2 overflow-x-auto pb-1">
                          {selectedImages.map((image) => (
                            <button
                              key={image.id}
                              type="button"
                              onClick={() => setFullscreenImageId(image.id)}
                              className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl border border-stone-200 bg-white"
                            >
                              <img src={image.previewUrl} alt="Selected product" className="h-full w-full object-cover" />
                            </button>
                          ))}
                        </div>
                      ) : (
                        "No images selected"
                      )
                    }
                    step="basics"
                    onEdit={handleStepChange}
                  />
                  {selectedProfile !== "QUANTITY_BASED" ? (
                    <PreviewField
                      label="Variants"
                      value={
                        <div className="space-y-2">
                          {variants.map((variant, index) => (
                            <div key={variant.id} className="text-sm text-stone-900">
                              {index + 1}. {buildVariantName(variant)}
                            </div>
                          ))}
                        </div>
                      }
                      step="variants"
                      onEdit={handleStepChange}
                    />
                  ) : null}
                  <PreviewField
                    label={selectedProfile === "QUANTITY_BASED" ? "Opening Stock" : "Tracked Stock"}
                    value={
                      selectedProfile === "QUANTITY_BASED" ? (
                        variants[0]?.quantity || "0"
                      ) : (
                        <div className="space-y-3">
                          {variants.map((variant) => {
                            const values = variant.identifiers
                              .map((field) => field.value.trim())
                              .filter(Boolean);
                            return (
                              <div key={variant.id}>
                                <div className="font-medium text-stone-900">{buildVariantName(variant)}</div>
                                <div className="mt-1 flex flex-wrap gap-2">
                                  {values.length > 0 ? (
                                    values.map((value) => (
                                      <span
                                        key={`${variant.id}-${value}`}
                                        className="rounded-lg bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-700"
                                      >
                                        {value}
                                      </span>
                                    ))
                                  ) : (
                                    <span className="text-sm text-stone-500">No identifiers added</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )
                    }
                    step={selectedProfile === "QUANTITY_BASED" ? "stock" : "stock"}
                    onEdit={handleStepChange}
                  />
                </section>
              ) : null}
            </div>

            <input type="hidden" name="name" value={name} />
            <input type="hidden" name="description" value={description} />
            <input type="hidden" name="product_kind" value={selectedProfile ?? ""} />
            <input type="hidden" name="tracking_type" value={trackingType} />
            <input type="hidden" name="category_id" value={categoryMode === "existing" ? selectedCategoryId : ""} />
            <input type="hidden" name="category_name" value={categoryMode === "new" ? newCategoryName : ""} />
            <input type="hidden" name="brand_id" value={brandMode === "existing" ? selectedBrandId : ""} />
            <input type="hidden" name="brand_name" value={brandMode === "new" ? newBrandName : ""} />
            <input type="hidden" name="base_purchase_price" value={purchasePrice} />
            <input type="hidden" name="base_selling_price" value={sellingPrice} />
            <input type="hidden" name="low_stock_threshold" value={lowStockThreshold} />
            <input type="hidden" name="tax_rate" value="0" />
            <input type="hidden" name="is_active" value="true" />
            <input type="hidden" name="product_payload" value={payload} />

            <div className="flex items-center justify-end border-t border-stone-200/80 bg-[#fffdf9] px-4 py-4 sm:px-6">
              <div className="flex items-center gap-3">
                <Button variant="ghost" onClick={stepIndex <= 0 ? () => setSelectedProfile(null) : () => moveStep(-1)} disabled={isPending}>
                  <ChevronLeft className="h-4 w-4" />
                  {stepIndex <= 0 ? "Profiles" : "Back"}
                </Button>
                {currentStep === "preview" ? (
                  <Button type="submit" form="add-product-form" disabled={isPending || !canSubmit}>
                    {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
                    {isEditMode ? "Update Product" : "Save Product"}
                  </Button>
                ) : (
                  <Button onClick={() => moveStep(1)}>
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </form>
        )}
      </div>

      {scanningTarget ? (
        <BarcodeScanner
          onScan={(result) => {
            setIdentifierValue(scanningTarget.variantId, scanningTarget.fieldId, result);
            setScanningTarget(null);
            toast.success(`${resolvedIdentifierType === "IMEI" ? "IMEI" : "Identifier"} scanned successfully.`);
          }}
          onClose={() => setScanningTarget(null)}
        />
      ) : null}

      {fullscreenImageId ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-stone-950/80 px-4">
          <div className="relative max-h-[90vh] max-w-[90vw] overflow-hidden rounded-[1.5rem] bg-white">
            <button
              type="button"
              onClick={() => setFullscreenImageId(null)}
              className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-stone-950/80 text-white"
            >
              <X className="h-4 w-4" />
            </button>
            <img
              src={selectedImages.find((image) => image.id === fullscreenImageId)?.previewUrl}
              alt="Preview"
              className="max-h-[90vh] max-w-[90vw] object-contain"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StepTitle({ step, title }: { step: number; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">Step {step}</span>
      <span className="text-sm font-semibold text-stone-900">{title}</span>
    </div>
  );
}

function ChooserField({
  label,
  mode,
  onToggle,
  existing,
  created,
  error,
}: {
  label: string;
  mode: "existing" | "new";
  onToggle: () => void;
  existing: React.ReactNode;
  created: React.ReactNode;
  error?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <button type="button" onClick={onToggle} className="text-xs font-medium text-stone-700">
          {mode === "existing" ? "Add new" : "Choose existing"}
        </button>
      </div>
      {mode === "existing" ? existing : created}
      {error ? <p className="text-xs text-rose-600">{error}</p> : null}
    </div>
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
  step: StepId;
  onEdit: (step: StepId) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl bg-white p-4">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-stone-400">{label}</p>
        <div className="mt-2 break-words text-sm font-medium text-stone-900">{value || "-"}</div>
      </div>
      <button
        type="button"
        onClick={() => onEdit(step)}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-700 transition hover:bg-stone-200"
        aria-label={`Edit ${label}`}
      >
        <Pencil className="h-4 w-4" />
      </button>
    </div>
  );
}

function Field({
  label,
  children,
  error,
  required,
}: {
  label: string;
  children: React.ReactNode;
  error?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label>
        {label}
        {required ? <span className="ml-1 text-rose-600">*</span> : null}
      </Label>
      {children}
      {error ? <p className="text-xs text-rose-600">{error}</p> : null}
    </div>
  );
}
