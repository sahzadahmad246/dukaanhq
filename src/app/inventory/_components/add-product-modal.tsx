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
import { buildVariantLabel, getStoragePresetOptions } from "@/lib/inventory-labels";
import { cn } from "@/lib/utils";
import { ActionResponse, createProductAction, updateProductAction } from "../actions";
import { BarcodeScanner } from "./barcode-scanner";
import { fetchProductDetails, productDetailsQueryKey } from "../queries";
import { matchesSearch } from "../inventory-utils";
import { StoragePresetPicker } from "./storage-preset-picker";

type StepId = "basics" | "options" | "stock" | "preview";
type SearchableOption = { value: string; label: string };
type InventoryProductSummary = {
  id: string;
  name: string;
  product_kind: ProductKind;
  description: string | null;
  base_purchase_price: number;
  base_selling_price: number;
  low_stock_threshold: number;
  category_id: string | null;
  brand_id: string | null;
  category?: { name?: string | null } | null;
  brand?: { name?: string | null } | null;
};

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
  color: string;
  storage: string;
  quantity: string;
  sellingPrice: string;
  identifiers: IdentifierField[];
};

type SelectedImage = {
  id: string;
  previewUrl: string;
  variantKey: string | null;
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
  { id: "MOBILE", title: "Mobile", subtitle: "Variant stock", icon: Smartphone },
  { id: "SERIALIZED", title: "Serialized", subtitle: "Laptop, watch, device", icon: Laptop },
  { id: "QUANTITY_BASED", title: "Accessory", subtitle: "Charger, cable, accessory", icon: PackageOpen },
];

const createProfileChoices = profiles.filter((profile) => profile.id !== "SERIALIZED");

function createIdentifierField(value = ""): IdentifierField {
  return { id: crypto.randomUUID(), value };
}

type ProductDraftPayload = {
  selectedProfile: ProductKind | null;
  currentStep: StepId;
  name: string;
  description: string;
  purchasePrice: string;
  sellingPrice: string;
  lowStockThreshold: string;
  categoryMode: "existing" | "new";
  brandMode: "existing" | "new";
  selectedCategoryId: string;
  selectedBrandId: string;
  newCategoryName: string;
  newBrandName: string;
  identifierType: IdentifierType;
  variants: VariantDraft[];
  selectedImages: DraftSelectedImage[];
};

const PRODUCT_DRAFT_STORAGE_KEY = "inventory-add-product-draft-v1";

type DraftSelectedImage =
  | {
      id: string;
      kind: "existing";
      previewUrl: string;
      variantKey: string | null;
      imageUrl: string;
      publicId: string;
    }
  | {
      id: string;
      kind: "new";
      previewUrl: string;
      variantKey: string | null;
      fileName: string;
      fileType: string;
      fileDataUrl: string;
    };

function createVariant(): VariantDraft {
  return {
    id: crypto.randomUUID(),
    color: "",
    storage: "",
    quantity: "0",
    sellingPrice: "",
    identifiers: [createIdentifierField()],
  };
}

function getInitialVariants(productKind: ProductKind | null) {
  return productKind === "MOBILE" ? [] : [createVariant()];
}

function revokeNewImagePreviews(images: SelectedImage[]) {
  for (const image of images) {
    if (image.kind === "new") {
      URL.revokeObjectURL(image.previewUrl);
    }
  }
}

async function cloneTemplateImage(url: string, name: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Could not load template image.");
  }

  const blob = await response.blob();
  const file = new File([blob], name, { type: blob.type || "image/jpeg" });

  return {
    id: crypto.randomUUID(),
    previewUrl: URL.createObjectURL(file),
    variantKey: null,
    kind: "new" as const,
    file,
  };
}

async function createDroppedImage(url: string, index: number) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Could not load dropped image.");
  }

  const blob = await response.blob();
  const extension = blob.type.split("/")[1] || "jpg";
  const file = new File([blob], `dropped-image-${index + 1}.${extension}`, { type: blob.type || "image/jpeg" });

  return {
    id: crypto.randomUUID(),
    previewUrl: URL.createObjectURL(file),
    variantKey: null,
    kind: "new" as const,
    file,
  };
}

function buildVariantName(variant: VariantDraft) {
  return buildVariantLabel({
    storage_label: variant.storage.trim(),
    color: variant.color.trim(),
    name: "Default",
  }) ?? "Default";
}

async function fileToDataUrl(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Could not read image file."));
    reader.readAsDataURL(file);
  });
}

function dataUrlToFile(dataUrl: string, fileName: string, fileType: string) {
  const parts = dataUrl.split(",");
  const base64 = parts[1] ?? "";
  const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
  return new File([bytes], fileName, { type: fileType || "image/jpeg" });
}

function getStepsForProfile(productKind: ProductKind | null): StepId[] {
  if (!productKind) return [];
  if (productKind === "MOBILE") return ["basics", "options", "preview"];
  if (productKind === "SERIALIZED") return ["basics", "options", "stock", "preview"];
  return ["basics", "stock", "preview"];
}

function getProfileCopy(productKind: ProductKind | null) {
  if (productKind === "MOBILE") {
    return {
      namePlaceholder: "iPhone 17",
      stockTitle: "Variant Stock",
      identifierLabel: "Quantity",
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
  value,
  onChange,
  options,
  placeholder,
  emptyLabel,
}: {
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
          <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-[70] rounded-2xl border border-stone-200 bg-white p-2 shadow-xl">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search options" className="pl-9" />
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
  onSaved,
  categories,
  brands,
  products,
}: {
  open: boolean;
  mode: "create" | "edit";
  productId: string | null;
  onClose: () => void;
  onSaved?: () => void | Promise<void>;
  categories: Category[];
  brands: Brand[];
  products: InventoryProductSummary[];
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
  const [purchasePrice, setPurchasePrice] = useState("0");
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
  const [draftRestoreCandidate, setDraftRestoreCandidate] = useState<ProductDraftPayload | null>(null);
  const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([]);
  const [imageTargetVariantKey, setImageTargetVariantKey] = useState<string | null>(null);
  const [fullscreenImageId, setFullscreenImageId] = useState<string | null>(null);
  const [scanningTarget, setScanningTarget] = useState<{ variantId: string; fieldId: string } | null>(null);
  const [selectedTemplateProductId, setSelectedTemplateProductId] = useState<string | null>(null);
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const [editingVariantId, setEditingVariantId] = useState<string | null>(null);
  const [variantModalErrors, setVariantModalErrors] = useState<Record<string, string>>({});
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasLoadedEditProductRef = useRef<string | null>(null);
  const hasLoadedDraftRef = useRef(false);
  const isEditMode = mode === "edit" && Boolean(productId);
  const { data: editingProduct, isLoading: isLoadingEditProduct } = useQuery({
    queryKey: productId ? productDetailsQueryKey(productId) : ["inventory", "product-details", "edit-idle"],
    queryFn: productId ? () => fetchProductDetails(productId) : skipToken,
    enabled: open && isEditMode && Boolean(productId),
    staleTime: 10 * 60 * 1000,
  });

  useEffect(() => {
    if (state.status === "success" && state.message) {
      if (!isEditMode) {
        window.localStorage.removeItem(PRODUCT_DRAFT_STORAGE_KEY);
      }
      toast.success(state.message);
      router.refresh();
      if (productId) {
        void queryClient.invalidateQueries({ queryKey: productDetailsQueryKey(productId) });
      }
      void onSaved?.();
      onClose();
    } else if (state.status === "error" && state.message) {
      toast.error(state.message);
    }
  }, [isEditMode, onClose, onSaved, productId, queryClient, router, state]);

  const steps = getStepsForProfile(selectedProfile);
  const stepIndex = steps.indexOf(currentStep);
  const profileCopy = getProfileCopy(selectedProfile);
  const trackingType = selectedProfile === "SERIALIZED" ? "SERIALIZED" : "QUANTITY_BASED";
  const resolvedIdentifierType = selectedProfile === "MOBILE" ? "IMEI" : identifierType;
  const selectedProfileMeta = profiles.find((profile) => profile.id === selectedProfile) ?? profiles[0];
  const categoryOptions = categories.map((category) => ({ value: category.id, label: category.name }));
  const brandOptions = brands.map((brand) => ({ value: brand.id, label: brand.name }));
  const selectedBrandName =
    brandMode === "existing"
      ? brands.find((brand) => brand.id === selectedBrandId)?.name ?? ""
      : newBrandName;
  const storagePresets = useMemo(
    () =>
      getStoragePresetOptions({
        productKind: selectedProfile,
        brandName: selectedBrandName,
      }),
    [selectedBrandName, selectedProfile]
  );
  const mobileTemplateOptions = useMemo(
    () =>
      products.filter(
        (product) =>
          product.product_kind === "MOBILE" &&
          product.id !== productId &&
          matchesSearch(
            [product.name, product.brand?.name ?? "", product.category?.name ?? ""].join(" "),
            name
          )
      ),
    [name, productId, products]
  );
  const shouldShowMobileSuggestions =
    selectedProfile === "MOBILE" && name.trim().length > 0 && mobileTemplateOptions.length > 0;

  const payload = useMemo(() => {
    const activeVariants = variants;
    return JSON.stringify({
      variants: activeVariants.map((variant) => ({
        temp_key: variant.id,
        name: buildVariantName(variant),
        color: variant.color.trim() || null,
        storage_label: variant.storage.trim() || null,
        quantity: selectedProfile === "SERIALIZED" ? 0 : Number.parseInt(variant.quantity || "0", 10) || 0,
        purchase_price_override: null,
        selling_price_override: variant.sellingPrice.trim() ? Number(variant.sellingPrice) : null,
      })),
      units:
        selectedProfile !== "SERIALIZED"
          ? []
          : activeVariants.flatMap((variant) =>
              variant.identifiers
                .map((field) => field.value.trim())
                .filter(Boolean)
                .map((value) => ({
                  variant_temp_key: variant.id,
                  identifier_type: resolvedIdentifierType,
                  serial_number: resolvedIdentifierType === "SERIAL_NUMBER" ? value : null,
                  unique_identifier: resolvedIdentifierType === "UNIQUE_ID" ? value : null,
                  identifier_value: value,
                }))
            ),
      highlights: [],
    });
  }, [resolvedIdentifierType, selectedProfile, variants]);

  const totalUnits = useMemo(() => {
    if (selectedProfile !== "SERIALIZED") {
      return variants.reduce((sum, variant) => sum + (Number.parseInt(variant.quantity || "0", 10) || 0), 0);
    }
    return variants.reduce(
      (sum, variant) => sum + variant.identifiers.filter((field) => field.value.trim().length > 0).length,
      0
    );
  }, [selectedProfile, variants]);

  const canSubmit =
    currentStep === "preview" &&
    name.trim().length > 0 &&
    (selectedProfile === "MOBILE" || sellingPrice.trim().length > 0) &&
    lowStockThreshold.trim().length > 0 &&
    ((brandMode === "existing" && selectedBrandId.length > 0) || (brandMode === "new" && newBrandName.trim().length > 0)) &&
    ((categoryMode === "existing" && selectedCategoryId.length > 0) || (categoryMode === "new" && newCategoryName.trim().length > 0)) &&
    totalUnits >= 0;

  useEffect(() => {
    if (!open || !isEditMode || !editingProduct || !productId) return;
    if (hasLoadedEditProductRef.current === productId) return;

    const frame = window.requestAnimationFrame(() => {
      hasLoadedEditProductRef.current = productId;
      setSelectedProfile(editingProduct.product_kind);
      setCurrentStep("basics");
      setName(editingProduct.name ?? "");
      setDescription(editingProduct.short_description ?? editingProduct.description ?? "");
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
      setSelectedTemplateProductId(null);

      const incomingImages: SelectedImage[] = [];
      const seenPublicIds = new Set<string>();
      if (editingProduct.image_url && editingProduct.image_public_id) {
        incomingImages.push({
          id: `existing-primary-${editingProduct.image_public_id}`,
          kind: "existing",
          previewUrl: editingProduct.image_url,
          variantKey: null,
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
          variantKey: image.variant_id ?? null,
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
          color: variant.color ?? "",
          storage: variant.storage_label ?? "",
          quantity: String(variant.quantity ?? 0),
          sellingPrice: String(variant.selling_price_override ?? ""),
          identifiers:
            editingProduct.product_kind === "QUANTITY_BASED"
              ? [createIdentifierField()]
              : (
                  editingProduct.inventory_items
                    ?.filter((item) => item.variant_id === variant.id)
                    .flatMap((item) =>
                      editingProduct.product_kind === "MOBILE"
                        ? [item.imei_1, item.imei_2]
                            .filter((value): value is string => Boolean(value?.trim()))
                            .map((value) => createIdentifierField(value))
                        : [createIdentifierField(item.serial_number)]
                    ) ?? []
                ).length > 0
                ? (
                    editingProduct.inventory_items
                      ?.filter((item) => item.variant_id === variant.id)
                      .flatMap((item) =>
                        editingProduct.product_kind === "MOBILE"
                          ? [item.imei_1, item.imei_2]
                              .filter((value): value is string => Boolean(value?.trim()))
                              .map((value) => createIdentifierField(value))
                          : [createIdentifierField(item.serial_number)]
                      ) ?? []
                  )
                : [createIdentifierField()],
        }))
      );
      setDraftRestoreCandidate(null);
      hasLoadedDraftRef.current = true;
    });

    return () => window.cancelAnimationFrame(frame);
  }, [categories, editingProduct, isEditMode, open, productId]);

  useEffect(() => {
    if (!open) {
      hasLoadedEditProductRef.current = null;
      hasLoadedDraftRef.current = false;
    }
  }, [open]);

  useEffect(() => {
    if (editingVariantId) {
      setVariantModalErrors({});
    }
  }, [editingVariantId]);

  useEffect(() => {
    if (!open || isEditMode || hasLoadedDraftRef.current) return;

    const rawDraft = window.localStorage.getItem(PRODUCT_DRAFT_STORAGE_KEY);
    if (!rawDraft) {
      hasLoadedDraftRef.current = true;
      return;
    }

    try {
      const restoreDraft = async () => {
        const draft = JSON.parse(rawDraft) as ProductDraftPayload;
        setDraftRestoreCandidate(draft);
        hasLoadedDraftRef.current = true;
      };

      void restoreDraft();
      return;
    } catch {
      window.localStorage.removeItem(PRODUCT_DRAFT_STORAGE_KEY);
      hasLoadedDraftRef.current = true;
    }
  }, [categories, isEditMode, open]);

  useEffect(() => {
    if (!open || isEditMode || !hasLoadedDraftRef.current || !selectedProfile) return;

    let cancelled = false;

    const persistDraft = async () => {
      const draftImages = await Promise.all(
        selectedImages.map(async (image) => {
          if (image.kind === "existing") {
            return {
              id: image.id,
              kind: "existing" as const,
              previewUrl: image.previewUrl,
              variantKey: image.variantKey,
              imageUrl: image.imageUrl,
              publicId: image.publicId,
            };
          }

          return {
            id: image.id,
            kind: "new" as const,
            previewUrl: image.previewUrl,
            variantKey: image.variantKey,
            fileName: image.file.name,
            fileType: image.file.type,
            fileDataUrl: await fileToDataUrl(image.file),
          };
        })
      );

      if (cancelled) return;

      const draftPayload: ProductDraftPayload = {
        selectedProfile,
        currentStep,
        name,
        description,
        purchasePrice,
        sellingPrice,
        lowStockThreshold,
        categoryMode,
        brandMode,
        selectedCategoryId,
        selectedBrandId,
        newCategoryName,
        newBrandName,
        identifierType,
        variants,
        selectedImages: draftImages,
      };

      try {
        window.localStorage.setItem(PRODUCT_DRAFT_STORAGE_KEY, JSON.stringify(draftPayload));
      } catch {
        toast.error("Draft is too large to save completely. Try using fewer images.");
      }
    };

    void persistDraft();

    return () => {
      cancelled = true;
    };
  }, [
    open,
    isEditMode,
    selectedProfile,
    currentStep,
    name,
    description,
    purchasePrice,
    sellingPrice,
    lowStockThreshold,
    categoryMode,
    brandMode,
    selectedCategoryId,
    selectedBrandId,
    newCategoryName,
    newBrandName,
    identifierType,
    variants,
    selectedImages,
  ]);

  if (!open) return null;

  function applySavedDraft(draft: ProductDraftPayload) {
    const draftProfile = draft.selectedProfile;
    const draftSteps = getStepsForProfile(draftProfile);
    setSelectedProfile(draftProfile);
    setCurrentStep(draftSteps.includes(draft.currentStep) ? draft.currentStep : "basics");
    setName(draft.name ?? "");
    setDescription(draft.description ?? "");
    setPurchasePrice(draft.purchasePrice ?? "");
    setSellingPrice(draft.sellingPrice ?? "");
    setLowStockThreshold(draft.lowStockThreshold ?? "5");
    setCategoryMode(draft.categoryMode ?? "existing");
    setBrandMode(draft.brandMode ?? "existing");
    setSelectedCategoryId(draft.selectedCategoryId ?? categories[0]?.id ?? "");
    setSelectedBrandId(draft.selectedBrandId ?? "");
    setNewCategoryName(draft.newCategoryName ?? "");
    setNewBrandName(draft.newBrandName ?? "");
    setIdentifierType(draft.identifierType ?? "SERIAL_NUMBER");
    setVariants(draft.variants?.length ? draft.variants : getInitialVariants(draftProfile));
    setSelectedImages(
      (draft.selectedImages ?? []).map((image) =>
        image.kind === "existing"
          ? {
              id: image.id,
              kind: "existing" as const,
              previewUrl: image.previewUrl,
              variantKey: image.variantKey,
              imageUrl: image.imageUrl,
              publicId: image.publicId,
            }
          : {
              id: image.id,
              kind: "new" as const,
              previewUrl: image.previewUrl,
              variantKey: image.variantKey,
              file: dataUrlToFile(image.fileDataUrl, image.fileName, image.fileType),
            }
      )
    );
    setDraftRestoreCandidate(null);
  }

  function dismissSavedDraft() {
    window.localStorage.removeItem(PRODUCT_DRAFT_STORAGE_KEY);
    setDraftRestoreCandidate(null);
  }

  function chooseProfile(profile: ProductKind) {
    setSelectedProfile(profile);
    setCurrentStep("basics");
    setIdentifierType(profile === "SERIALIZED" ? "SERIAL_NUMBER" : "IMEI");
    setVariants(getInitialVariants(profile));
    setDraftRestoreCandidate(null);
    setSelectedImages([]);
    setFullscreenImageId(null);
    setClientErrors({});
    setVariantModalErrors({});
    setState({ status: "success", message: "" });
    setSelectedTemplateProductId(null);
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

  function addImages(files: FileList | null, variantKey: string | null = null) {
    if (!files || files.length === 0) return;
    const next = Array.from(files).map((file) => ({
      id: crypto.randomUUID(),
      previewUrl: URL.createObjectURL(file),
      variantKey,
      kind: "new" as const,
      file,
    }));
    setSelectedImages((current) => [...current, ...next]);
    clearClientError(["images"]);
  }

  async function addDroppedImages(dataTransfer: DataTransfer, variantKey: string | null = null) {
    const fileEntries = Array.from(dataTransfer.files).filter((file) => file.type.startsWith("image/"));
    if (fileEntries.length > 0) {
      const next = fileEntries.map((file) => ({
        id: crypto.randomUUID(),
        previewUrl: URL.createObjectURL(file),
        variantKey,
        kind: "new" as const,
        file,
      }));
      setSelectedImages((current) => [...current, ...next]);
      clearClientError(["images"]);
      return;
    }

    const droppedUrl = dataTransfer.getData("text/uri-list") || dataTransfer.getData("text/plain");
    if (!droppedUrl) return;

    try {
      const image = await createDroppedImage(droppedUrl.trim(), selectedImages.length);
      setSelectedImages((current) => [...current, { ...image, variantKey }]);
      clearClientError(["images"]);
      toast.success("Dropped image added.");
    } catch {
      toast.error("Could not import that dragged image. Direct file drop works, but some websites block image download.");
    }
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

  function handleAddVariantClick() {
    const next = createVariant();
    setVariants((current) => [...current, next]);
    setVariantModalErrors({});
    setEditingVariantId(next.id);
  }

  function removeVariant(variantId: string) {
    setVariants((current) => current.filter((v) => v.id !== variantId));
    if (editingVariantId === variantId) {
      setEditingVariantId(null);
      setVariantModalErrors({});
    }
  }

  function setVariantField(variantId: string, key: "color" | "storage" | "quantity" | "sellingPrice", value: string) {
    setVariants((current) => current.map((variant) => (variant.id === variantId ? { ...variant, [key]: value } : variant)));
    if (key === "quantity") {
      clearClientError(["stock"]);
    }
    setVariantModalErrors((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
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
      if (selectedProfile !== "MOBILE") {
        if (!sellingPrice.trim()) {
          errors.base_selling_price = "Selling price is required.";
        } else if (Number.isNaN(Number(sellingPrice)) || Number(sellingPrice) < 0) {
          errors.base_selling_price = "Selling price must be 0 or more.";
        }
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

    if (step === "options" && selectedProfile !== "QUANTITY_BASED") {
      if (variants.length === 0) {
        errors.options = "Add at least one variant.";
      }
      const invalidVariant = variants.find(v => !v.color.trim() && !v.storage.trim());
      if (!errors.options && invalidVariant) {
        errors.options = "Add color, storage, or both for each variant.";
      }
      if (selectedProfile === "MOBILE") {
        const invalidPrice = variants.find(v => !v.sellingPrice.trim() || Number.isNaN(Number(v.sellingPrice)) || Number(v.sellingPrice) < 0);
        if (!errors.options && invalidPrice) errors.options = "Valid selling price is required for each variant.";
        const invalidStock = variants.find(v => !v.quantity.trim() || Number.isNaN(Number(v.quantity)) || Number(v.quantity) <= 0);
        if (!errors.options && invalidStock) errors.options = "Stock Quantity must be greater than 0 for each variant.";
      }
    }

    if (step === "stock") {
      if (selectedProfile !== "SERIALIZED") {
        const invalidQuantity = variants.find(v => !(v.quantity ?? "").trim() || Number.isNaN(Number(v.quantity)) || Number(v.quantity) < 0);
        if (invalidQuantity) {
          errors.stock = "Valid opening quantity is required for each variant.";
        }
      } else {
        const hasMissingIdentifiers = variants.some(variant => {
          const identifiers = (variant.identifiers ?? []).map((field) => field.value.trim()).filter(Boolean);
          return identifiers.length === 0;
        });
        if (hasMissingIdentifiers) {
          errors.stock = `Add at least one ${resolvedIdentifierType === "IMEI" ? "IMEI" : "identifier"} for each variant.`;
        }
        const allIdentifiers = variants.flatMap(v => (v.identifiers ?? []).map(f => f.value.trim().toLowerCase())).filter(Boolean);
        if (new Set(allIdentifiers).size !== allIdentifiers.length) {
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
            variant_id: image.variantKey && /^[0-9a-f-]{36}$/i.test(image.variantKey) ? image.variantKey : null,
            variant_temp_key: image.variantKey && !/^[0-9a-f-]{36}$/i.test(image.variantKey) ? image.variantKey : null,
          }))
      )
    );
    formData.set(
      "image_assignments",
      JSON.stringify(
        selectedImages.map((image, index) => ({
          id: image.id,
          kind: image.kind,
          sort_order: index,
          variant_id: image.variantKey && /^[0-9a-f-]{36}$/i.test(image.variantKey) ? image.variantKey : null,
          variant_temp_key: image.variantKey && !/^[0-9a-f-]{36}$/i.test(image.variantKey) ? image.variantKey : null,
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

  async function applyMobileTemplate(templateProductId: string) {
    setSelectedTemplateProductId(templateProductId);
    try {
      const template = await fetchProductDetails(templateProductId);
      const templateImages = [
        ...(template.image_url ? [template.image_url] : []),
        ...((template.product_images ?? []).map((image) => image.image_url)),
      ].filter((value, index, list) => list.indexOf(value) === index);
      const copiedImages = await Promise.all(
        templateImages.map((url, index) => cloneTemplateImage(url, `template-image-${index + 1}.jpg`))
      );

      setSelectedImages((current) => {
        revokeNewImagePreviews(current);
        return copiedImages;
      });
      setName(template.name ?? "");
      setDescription(template.short_description ?? template.description ?? "");
      setPurchasePrice(String(template.base_purchase_price ?? ""));
      setSellingPrice(String(template.base_selling_price ?? ""));
      setLowStockThreshold(String(template.low_stock_threshold ?? 0));
      setCategoryMode(template.category_id ? "existing" : "new");
      setBrandMode(template.brand_id ? "existing" : "new");
      setSelectedCategoryId(template.category_id ?? categories[0]?.id ?? "");
      setSelectedBrandId(template.brand_id ?? "");
      setNewCategoryName(template.category_id ? "" : template.category?.name ?? "");
      setNewBrandName(template.brand_id ? "" : template.brand?.name ?? "");
      const templateVariant = (template.variants ?? [
        { id: crypto.randomUUID(), name: "Default", color: null, storage_label: null, quantity: 0 },
      ])[0];
      setVariants([
        {
          id: crypto.randomUUID(),
          color: templateVariant.color ?? "",
          storage: templateVariant.storage_label ?? "",
          quantity: "0",
          sellingPrice: String(templateVariant.selling_price_override ?? template.base_selling_price ?? ""),
          identifiers: [createIdentifierField(), createIdentifierField()],
        },
      ]);
      setClientErrors({});
      setVariantModalErrors({});
      toast.success("Phone details and images filled from existing product. Set the stock count for this variant to continue.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load that phone template.");
    } finally {
      setSelectedTemplateProductId(null);
    }
  }

  function adjustVariantQuantity(variantId: string, delta: number) {
    setVariants((current) =>
      current.map((variant) => {
        if (variant.id !== variantId) return variant;
        const currentQuantity = Number.parseInt(variant.quantity || "0", 10) || 0;
        return {
          ...variant,
          quantity: String(Math.max(0, currentQuantity + delta)),
        };
      })
    );
    clearClientError(["stock"]);
  }

  function handleVariantQuantityTextInput(variantId: string, value: string) {
    if (value !== "" && !/^\d+$/.test(value)) {
      return;
    }
    setVariantField(variantId, "quantity", value);
  }

  function handleVariantModalDone(variant: VariantDraft) {
    const nextErrors: Record<string, string> = {};

    if (!variant.color.trim()) {
      nextErrors.color = "Color is required.";
    }

    if (!variant.storage.trim()) {
      nextErrors.storage = selectedProfile === "MOBILE" ? "Storage / RAM is required." : "Size / Storage is required.";
    }

    if (selectedProfile === "MOBILE") {
      if (!variant.sellingPrice.trim() || Number.isNaN(Number(variant.sellingPrice)) || Number(variant.sellingPrice) < 0) {
        nextErrors.sellingPrice = "Selling Price is required.";
      }
      const quantity = Number.parseInt(variant.quantity || "0", 10);
      if (!variant.quantity.trim() || Number.isNaN(quantity) || quantity <= 0) {
        nextErrors.quantity = "Stock Quantity* can't be 0.";
      }
    }

    if (Object.keys(nextErrors).length > 0) {
      setVariantModalErrors(nextErrors);
      return;
    }

    setVariantModalErrors({});
    setEditingVariantId(null);
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
              <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-teal-700">Add Product</p>
              <h3 className="mt-3 text-[1.85rem] font-black leading-tight tracking-[-0.04em] text-stone-950">
                What kind of product do you want to add?
              </h3>
            </div>

            <div className="mt-7 grid gap-4">
              {createProfileChoices.map((profile) => {
                const Icon = profile.icon;
                return (
                  <button
                    key={profile.id}
                    type="button"
                    onClick={() => chooseProfile(profile.id)}
                    className="group relative overflow-hidden rounded-[1.9rem] border border-stone-200 bg-white p-5 text-left shadow-[0_16px_40px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:border-teal-700 hover:shadow-[0_20px_50px_rgba(15,23,42,0.1)] focus:outline-none"
                  >
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(20,184,166,0.14),transparent_34%)] opacity-80" />
                    <div className="relative flex items-center gap-4">
                      <div className="flex h-15 w-15 shrink-0 items-center justify-center rounded-[1.35rem] border border-stone-200 bg-[#fffdf9] text-stone-700 transition group-hover:border-teal-700 group-hover:bg-teal-700 group-hover:text-white">
                        <Icon className="h-6 w-6" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-lg font-black tracking-[-0.02em] text-stone-950">{profile.title}</h4>
                        <p className="mt-1 text-sm font-medium text-stone-500">
                          {profile.id === "MOBILE" ? "Phones with variants" : "Chargers, cables, covers"}
                        </p>
                      </div>
                      <div className="text-stone-300 transition group-hover:text-teal-700">
                        <ChevronRight className="h-5 w-5" />
                      </div>
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
            className="flex min-h-0 flex-1 flex-col"
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
                <section className="space-y-5 py-2">
                  <StepTitle step={stepIndex + 1} title="Basics" />
                  <div className="rounded-[1.3rem] border border-stone-200 bg-stone-50 p-5 space-y-5">
                    <Field label="Product Name" required error={clientErrors.name || state.fieldErrors?.name}>
                      <div className="relative">
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
                        {shouldShowMobileSuggestions ? (
                          <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-[70] rounded-2xl border border-stone-200 bg-white p-2 shadow-xl">
                            <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-[0.14em] text-stone-400">
                              Matching phones
                            </p>
                            <div className="max-h-56 overflow-y-auto">
                              {mobileTemplateOptions.slice(0, 6).map((product) => (
                                <button
                                  key={product.id}
                                  type="button"
                                  onClick={() => applyMobileTemplate(product.id)}
                                  disabled={selectedTemplateProductId === product.id}
                                  className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-stone-100 disabled:opacity-60"
                                >
                                  <div>
                                    <div className="text-sm font-semibold text-stone-900">{product.name}</div>
                                    <div className="text-xs text-stone-500">
                                      {[product.brand?.name, product.category?.name].filter(Boolean).join(" • ") || "Mobile"}
                                    </div>
                                  </div>
                                  {selectedTemplateProductId === product.id ? (
                                    <LoaderCircle className="h-4 w-4 animate-spin text-stone-500" />
                                  ) : null}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </Field>

                    <div className="space-y-5">
                      <ChooserField
                        label="Brand"
                        mode={brandMode}
                        onToggle={() => setBrandMode((current) => (current === "existing" ? "new" : "existing"))}
                        error={clientErrors.brand}
                        existing={
                          <SearchableSelect
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

                      <ChooserField
                        label="Category"
                        mode={categoryMode}
                        onToggle={() => setCategoryMode((current) => (current === "existing" ? "new" : "existing"))}
                        error={clientErrors.category}
                        existing={
                          <SearchableSelect
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
                    </div>

                    <div className="space-y-5">
                      {selectedProfile === "MOBILE" ? (
                        <input type="hidden" name="base_selling_price" value="0" />
                      ) : (
                        <Field label="Selling Price" required error={clientErrors.base_selling_price || state.fieldErrors?.base_selling_price}>
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
                      )}

                      <Field label="Low Stock Alert" required error={clientErrors.low_stock_threshold || state.fieldErrors?.low_stock_threshold}>
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
                    </div>

                    <Field label="Description (Optional)" error={clientErrors.description || state.fieldErrors?.description}>
                      <Textarea
                        name="description"
                        value={description}
                        onChange={(event) => {
                          setDescription(event.target.value);
                          clearClientError(["description"]);
                        }}
                        placeholder="Optional notes customers or staff may need."
                        rows={3}
                        maxLength={280}
                      />
                      <p className="text-xs text-stone-500">{description.length}/280 characters</p>
                    </Field>
                  </div>

                  {selectedProfile === "QUANTITY_BASED" ? (
                  <Field label="Product Images" error={clientErrors.images}>
                    <div className="space-y-3">
                      <div
                        className="rounded-2xl border border-dashed border-stone-300 bg-white p-3"
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                          event.preventDefault();
                          void addDroppedImages(event.dataTransfer, null);
                        }}
                      >
                        <div className="scrollbar-hidden flex gap-3 overflow-x-auto pb-1">
                          <button
                            type="button"
                            onClick={() => {
                              setImageTargetVariantKey(null);
                              fileInputRef.current?.click();
                            }}
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
                        <p className="mt-3 text-xs text-stone-500">
                          Click to choose files, drag image files here, or try dropping an image from another website. Web-image drop works only when that source allows it.
                        </p>
                      </div>
                    </div>
                  </Field>
                  ) : null}

                </section>
              ) : null}

              {currentStep === "options" ? (
                <section className="space-y-4 py-2">
                  <StepTitle step={stepIndex + 1} title="Options" />
                  {clientErrors.options ? <p className="text-sm text-rose-600">{clientErrors.options}</p> : null}

                  <div className="rounded-[1.3rem] border border-stone-200 bg-stone-50 overflow-hidden">
                    {variants.length === 0 ? (
                      <div className="px-4 py-8 text-center">
                        <p className="text-sm font-semibold text-stone-900">No variant added</p>
                        <p className="mt-1 text-sm text-stone-500">Add a variant to configure storage, color, price, and stock.</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-stone-200/60 transition-all">
                        {variants.map((variant) => (
                          <div key={variant.id} className="px-4 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-white/40">
                            <div>
                              <p className="text-[13px] font-bold text-stone-900 tracking-tight">{buildVariantName(variant)}</p>
                              {selectedProfile === "MOBILE" && (
                                <div className="mt-1 flex items-center gap-1.5 text-[12px] font-semibold text-stone-500">
                                  <span className="w-1.5 h-1.5 rounded-full bg-stone-300" />
                                  {variant.quantity || "0"} initial stock
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-3">
                              {selectedProfile === "MOBILE" && (
                                <p className="text-[14px] font-black tracking-tight text-stone-800 lg:w-20 text-right">
                                  {variant.sellingPrice ? `₹${Number(variant.sellingPrice).toLocaleString("en-IN")}` : "-"}
                                </p>
                              )}
                              <button type="button" onClick={() => setEditingVariantId(variant.id)} className="text-[11px] font-bold uppercase tracking-wider text-teal-700 bg-teal-50 px-2 py-1 rounded transition hover:bg-teal-100">
                                Edit
                              </button>
                              {variants.length > 1 && (
                                <button type="button" onClick={() => removeVariant(variant.id)} className="text-[11px] font-bold uppercase tracking-wider text-rose-600 bg-rose-50 px-2 py-1 rounded transition hover:bg-rose-100">
                                  Remove
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {selectedProfile === "MOBILE" && (
                    <Button type="button" variant="outline" onClick={handleAddVariantClick} className="w-full rounded-[1.6rem] border-dashed border-2 py-6 text-sm font-bold tracking-tight text-stone-500 transition hover:text-stone-900 hover:border-stone-400 hover:bg-stone-50">
                      {variants.length === 0 ? "Add Variant" : "+ Add Another Variant"}
                    </Button>
                  )}
                </section>
              ) : null}

              {currentStep === "stock" ? (
                <section className="space-y-4 py-2">
                  <StepTitle step={stepIndex + 1} title={profileCopy.stockTitle} />
                  <div className="rounded-[1.6rem] border border-stone-200 bg-white p-4 shadow-sm">
                    <p className="text-base font-semibold text-stone-900">Step {stepIndex + 1} Opening Stock</p>
                    <p className="mt-1 text-sm leading-6 text-stone-600">
                      {selectedProfile === "QUANTITY_BASED"
                        ? "How many units do you want to add for this product?"
                        : "Add tracked identifiers for each unit."}
                    </p>
                  </div>
                  {selectedProfile === "SERIALIZED" ? <IdentifierTypePicker value={identifierType} onChange={setIdentifierType} /> : null}
                  {clientErrors.stock ? <p className="text-sm text-rose-600">{clientErrors.stock}</p> : null}
                  {state.fieldErrors?.product_payload ? <p className="text-sm text-rose-600">{state.fieldErrors.product_payload}</p> : null}

                  {variants.map((variant) => (
                    <div key={variant.id} className="space-y-3 border-b border-stone-200 pb-4 last:border-b-0">
                      <div>
                        <p className="text-sm font-semibold text-stone-900">{selectedProfile === "SERIALIZED" ? "Option" : "Opening Stock"}</p>
                        <p className="text-sm text-stone-500">{selectedProfile === "SERIALIZED" ? buildVariantName(variant) : name || "This product"}</p>
                      </div>

                      {selectedProfile !== "SERIALIZED" ? (
                        <Field label="Quantity">
                          <QuantityStepper
                            value={variant.quantity}
                            onChange={(nextValue) => handleVariantQuantityTextInput(variant.id, nextValue)}
                            onIncrement={() => adjustVariantQuantity(variant.id, 1)}
                            onDecrement={() => adjustVariantQuantity(variant.id, -1)}
                          />
                        </Field>
                      ) : (
                        <div className="space-y-3">
                          {variant.identifiers.map((field, fieldIndex) => (
                            <div key={field.id} className="flex items-center gap-2">
                              <Input
                                value={field.value}
                                onChange={(event) => setIdentifierValue(variant.id, field.id, event.target.value)}
                                placeholder={
                                  resolvedIdentifierType === "IMEI"
                                    ? `Enter IMEI ${fieldIndex + 1}`
                                    : "Enter identifier"
                                }
                              />
                              <Button type="button" variant="ghost" className="h-11 w-11 shrink-0 px-0 text-stone-900 hover:bg-stone-100" onClick={() => setScanningTarget({ variantId: variant.id, fieldId: field.id })}>
                                <ScanBarcode className="h-4 w-4" />
                              </Button>
                              {fieldIndex > 0 ? (
                                <Button type="button" variant="ghost" className="h-11 w-11 shrink-0 px-0 text-rose-600 hover:bg-rose-50" onClick={() => removeIdentifierField(variant.id, field.id)}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              ) : null}
                            </div>
                          ))}
                          <Button type="button" variant="secondary" onClick={() => addIdentifierField(variant.id)}>
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
                  <div className="rounded-[1.3rem] border border-stone-200 bg-stone-50 overflow-hidden">
                    <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-stone-200 bg-stone-100/50">
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-stone-500">Product Basics</p>
                      <button type="button" onClick={() => handleStepChange("basics")} className="text-xs font-semibold text-teal-700 transition hover:text-teal-800">
                        Edit Basics
                      </button>
                    </div>
                    <div className="p-4">
                      <h3 className="text-xl font-black tracking-[-0.03em] text-stone-950">
                        {name || "Untitled product"}
                      </h3>
                      <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[13px] font-medium text-stone-500">
                        <span className="text-stone-700">{(brandMode === "existing" ? brands.find((brand) => brand.id === selectedBrandId)?.name : newBrandName) || "No Brand"}</span>
                        <span className="text-stone-300">•</span>
                        <span className="text-stone-700">{(categoryMode === "existing" ? categories.find((category) => category.id === selectedCategoryId)?.name : newCategoryName) || "No Category"}</span>
                        <span className="text-stone-300">•</span>
                        <span className="text-stone-700">{variants.reduce((sum, v) => sum + (Number.parseInt(v.quantity || "0", 10) || 0), 0)} Initial Stock</span>
                        <span className="text-stone-300">•</span>
                        <span className="text-stone-700 text-rose-600/80">Alert at {lowStockThreshold || "0"}</span>
                        {selectedProfile !== "MOBILE" && sellingPrice ? (
                          <>
                            <span className="text-stone-300">•</span>
                            <span className="text-stone-700 font-bold">₹{sellingPrice}</span>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {selectedProfile !== "QUANTITY_BASED" ? (
                    <div className="rounded-[1.3rem] border border-stone-200 bg-stone-50 overflow-hidden">
                      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-stone-200 bg-stone-100/50">
                        <p className="text-xs font-bold uppercase tracking-[0.16em] text-stone-500">Configured Variants</p>
                        <button type="button" onClick={() => handleStepChange("options")} className="text-xs font-semibold text-teal-700 transition hover:text-teal-800">
                          Edit Options
                        </button>
                      </div>
                      <div className="divide-y divide-stone-200/60 transition-all">
                        {variants.map((variant) => (
                          <div key={variant.id} className="px-4 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-white/40">
                            <div>
                              <p className="text-[13px] font-bold text-stone-900 tracking-tight">{buildVariantName(variant)}</p>
                              {selectedProfile === "MOBILE" && (
                                <div className="mt-1 flex items-center gap-1.5 text-[12px] font-semibold text-stone-500">
                                  <span className="w-1.5 h-1.5 rounded-full bg-stone-300" />
                                  {variant.quantity || "0"} initial stock
                                </div>
                              )}
                            </div>
                            {selectedProfile === "MOBILE" && (
                              <p className="text-[14px] font-black tracking-tight text-stone-800">
                                {variant.sellingPrice ? `₹${Number(variant.sellingPrice).toLocaleString("en-IN")}` : "-"}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {selectedProfile !== "MOBILE" && (
                    <div className="rounded-[1.3rem] border border-stone-200 bg-stone-50 overflow-hidden">
                      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-stone-200 bg-stone-100/50">
                        <p className="text-xs font-bold uppercase tracking-[0.16em] text-stone-500">
                          {selectedProfile === "SERIALIZED" ? "Tracked Stock" : "Opening Stock"}
                        </p>
                        <button type="button" onClick={() => handleStepChange("stock")} className="text-xs font-semibold text-teal-700 transition hover:text-teal-800">
                          Edit Stock
                        </button>
                      </div>
                      <div className="p-4">
                        <p className="text-sm font-semibold text-stone-900">
                          {selectedProfile !== "SERIALIZED" ? `${variants[0]?.quantity || "0"} units` : `${totalUnits} identifiers`}
                        </p>
                      </div>
                    </div>
                  )}

                  {description ? (
                    <div className="rounded-[1.3rem] border border-stone-200 bg-stone-50 overflow-hidden">
                      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-stone-200 bg-stone-100/50">
                        <p className="text-xs font-bold uppercase tracking-[0.16em] text-stone-500">Description</p>
                        <button type="button" onClick={() => handleStepChange("basics")} className="text-xs font-semibold text-teal-700 transition hover:text-teal-800">
                          Edit Basics
                        </button>
                      </div>
                      <div className="p-4">
                        <p className="text-sm leading-6 text-stone-700 whitespace-pre-wrap">{description}</p>
                      </div>
                    </div>
                  ) : null}

                  {selectedImages.length > 0 ? (
                    <div className="rounded-[1.3rem] border border-stone-200 bg-stone-50 overflow-hidden">
                      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-stone-200 bg-stone-100/50">
                        <p className="text-xs font-bold uppercase tracking-[0.16em] text-stone-500">Images</p>
                        <button type="button" onClick={() => handleStepChange("basics")} className="text-xs font-semibold text-teal-700 transition hover:text-teal-800">
                          Edit Basics
                        </button>
                      </div>
                      <div className="p-4 flex gap-2 overflow-x-auto pb-1">
                        {selectedImages.map((image) => (
                          <button
                            key={image.id}
                            type="button"
                            onClick={() => setFullscreenImageId(image.id)}
                            className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl border border-stone-200 bg-white hover:opacity-80 transition"
                          >
                            <img src={image.previewUrl} alt="Selected product" className="h-full w-full object-cover" />
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </section>
              ) : null}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => {
                addImages(event.target.files, imageTargetVariantKey);
                event.currentTarget.value = "";
              }}
            />

            <input type="hidden" name="name" value={name} />
            <input type="hidden" name="description" value={description} />
            <input type="hidden" name="product_kind" value={selectedProfile ?? ""} />
            <input type="hidden" name="tracking_type" value={trackingType} />
            <input type="hidden" name="category_id" value={categoryMode === "existing" ? selectedCategoryId : ""} />
            <input type="hidden" name="category_name" value={categoryMode === "new" ? newCategoryName : ""} />
            <input type="hidden" name="brand_id" value={brandMode === "existing" ? selectedBrandId : ""} />
            <input type="hidden" name="brand_name" value={brandMode === "new" ? newBrandName : ""} />
            <input type="hidden" name="base_purchase_price" value={purchasePrice || "0"} />
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
                  <Button type="button" onClick={submitForm} disabled={isPending || !canSubmit}>
                    {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
                    {isEditMode ? "Update Product" : "Add Product"}
                  </Button>
                ) : (
                  <Button type="button" onClick={() => moveStep(1)}>
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </form>
        )}
      </div>

      {draftRestoreCandidate ? (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-stone-950/45 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-[1.75rem] bg-white p-6 shadow-[0_30px_80px_rgba(15,23,42,0.18)]">
            <h3 className="text-lg font-semibold text-stone-950">Restore Draft</h3>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              A saved product draft was found on this device. Do you want to restore it and continue where you left off?
            </p>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={dismissSavedDraft}
                className="rounded-xl bg-stone-100 px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-200"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={() => applySavedDraft(draftRestoreCandidate)}
                className="rounded-xl bg-stone-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-800"
              >
                Restore Draft
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editingVariantId ? (() => {
        const variant = variants.find(v => v.id === editingVariantId);
        if (!variant) return null;
        return (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-stone-950/60 p-4 backdrop-blur-sm sm:items-start sm:pt-[10vh]">
            <div className="w-full max-w-md rounded-[2rem] bg-[#FAFAF8] shadow-[0_30px_80px_rgba(15,23,42,0.18)] max-h-[85vh] flex flex-col overflow-hidden">
              <div className="flex items-center justify-between border-b border-stone-200/80 px-5 py-4 bg-white">
                <h3 className="text-base font-bold text-stone-900">Configure Option</h3>
                <button
                  type="button"
                  onClick={() => {
                    setVariantModalErrors({});
                    setEditingVariantId(null);
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-stone-100 hover:bg-stone-200 text-stone-600 transition"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-5 pb-8 space-y-6">
                <div className="space-y-5">
                  <Field label="Color" required error={variantModalErrors.color}>
                    <Input value={variant.color} onChange={(event) => setVariantField(variant.id, "color", event.target.value)} placeholder="Black" />
                  </Field>
                  <Field
                    label={selectedProfile === "MOBILE" ? "Storage / RAM" : "Size / Storage"}
                    required
                    error={variantModalErrors.storage}
                  >
                    <StoragePresetPicker
                      value={variant.storage}
                      onChange={(nextValue) => setVariantField(variant.id, "storage", nextValue)}
                      presets={storagePresets}
                      placeholder={selectedProfile === "MOBILE" ? "Select or type storage" : "Select or type size"}
                    />
                  </Field>
                </div>

                {selectedProfile === "MOBILE" ? (
                  <div className="space-y-5">
                    <Field label="Selling Price" required error={variantModalErrors.sellingPrice}>
                      <Input 
                        type="number" 
                        min="0" 
                        step="0.01"
                        value={variant.sellingPrice}
                        onChange={(event) => setVariantField(variant.id, "sellingPrice", event.target.value)}
                        placeholder="0.00" 
                      />
                    </Field>
                    <Field label="Stock Quantity" required error={variantModalErrors.quantity}>
                      <Input 
                        type="number" 
                        min="0"
                        value={variant.quantity}
                        onChange={(event) => setVariantField(variant.id, "quantity", event.target.value)}
                        placeholder="0" 
                      />
                    </Field>
                  </div>
                ) : null}

                <Field label="Option Images (Optional)">
                  <div
                    className="rounded-2xl border border-dashed border-stone-300 bg-white p-3"
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      void addDroppedImages(event.dataTransfer, variant.id);
                    }}
                  >
                    <div className="scrollbar-hidden flex gap-3 overflow-x-auto pb-1">
                      <button
                        type="button"
                        onClick={() => {
                          setImageTargetVariantKey(variant.id);
                          fileInputRef.current?.click();
                        }}
                        className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl border border-dashed border-stone-300 bg-stone-50 text-stone-400 transition hover:border-teal-700 hover:text-teal-700"
                      >
                        <ImagePlus className="h-6 w-6" />
                      </button>

                      {selectedImages
                        .filter((image) => image.variantKey === variant.id)
                        .map((image) => (
                          <div key={image.id} className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-stone-200 bg-white">
                            <button type="button" onClick={() => setFullscreenImageId(image.id)} className="h-full w-full">
                              <img src={image.previewUrl} alt="Selected variant" className="h-full w-full object-cover" />
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
                  </div>
                </Field>
              </div>
              <div className="border-t border-stone-200/80 p-4 bg-white">
                <Button type="button" className="w-full text-base py-5 rounded-[1rem]" onClick={() => handleVariantModalDone(variant)}>Done</Button>
              </div>
            </div>
          </div>
        );
      })() : null}

      {scanningTarget ? (
        <BarcodeScanner
          expectedType={resolvedIdentifierType === "IMEI" ? "IMEI" : "SERIAL"}
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

function QuantityStepper({
  value,
  onChange,
  onIncrement,
  onDecrement,
}: {
  value: string;
  onChange: (value: string) => void;
  onIncrement: () => void;
  onDecrement: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-stone-300 bg-white p-2">
      <button
        type="button"
        onClick={onDecrement}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-stone-100 text-stone-700 transition hover:bg-stone-200"
        aria-label="Decrease quantity"
      >
        <span className="text-xl leading-none">-</span>
      </button>
      <Input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="0"
        className="border-0 px-0 text-center text-lg font-semibold shadow-none focus:ring-0"
      />
      <button
        type="button"
        onClick={onIncrement}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-stone-900 text-white transition hover:bg-stone-800"
        aria-label="Increase quantity"
      >
        <span className="text-xl leading-none">+</span>
      </button>
    </div>
  );
}
