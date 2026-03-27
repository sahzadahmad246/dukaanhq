"use client";

import { skipToken, useQuery } from "@tanstack/react-query";
import { Check, ChevronLeft, ChevronRight, Loader2, Package2, Plus, ScanBarcode, Search, Smartphone, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Product } from "@/lib/types/inventory";
import { cn } from "@/lib/utils";
import { createInvoiceAction, resolveBillingQrAction } from "../actions";
import { fetchProductDetails, productDetailsQueryKey, type ProductDetails } from "@/app/inventory/queries";
import type { ActionResponse } from "@/app/inventory/actions";
import { printInvoice } from "./invoice-print";
import { QrScanner } from "./qr-scanner";

type StepId = "customer" | "products" | "preview";

type ProductSummary = Product & {
  total_quantity: number;
  brand?: { name?: string | null } | null;
  category?: { name?: string | null } | null;
  variants?: Array<{
    id: string;
    quantity: number | null;
    name: string | null;
    color: string | null;
    storage_label: string | null;
  }> | null;
  has_damaged_activity?: boolean;
  has_return_activity?: boolean;
};

type CustomerDraft = {
  name: string;
  mobile: string;
  billing_address: string;
  gst_number: string;
};

type BillingLineDraft = {
  id: string;
  product_id: string;
  variant_id: string;
  inventory_item_id: string;
  identifier_value: string;
  quantity: string;
  unit_price: string;
  discount_amount: string;
};

type InventoryRecord = NonNullable<ProductDetails["inventory_items"]>[number];

function createLine(): BillingLineDraft {
  return {
    id: crypto.randomUUID(),
    product_id: "",
    variant_id: "",
    inventory_item_id: "",
    identifier_value: "",
    quantity: "1",
    unit_price: "0",
    discount_amount: "0",
  };
}

function money(value: number) {
  return `Rs ${Number(value || 0).toFixed(2)}`;
}

function Stepper({
  steps,
  currentStep,
  onStepChange,
}: {
  steps: StepId[];
  currentStep: StepId;
  onStepChange: (step: StepId) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      {steps.map((step, index) => {
        const active = step === currentStep;
        const complete = index < steps.indexOf(currentStep);
        return (
          <button
            key={step}
            type="button"
            onClick={() => onStepChange(step)}
            className="flex flex-1 flex-col items-center gap-2"
          >
            <div
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold transition",
                active ? "bg-stone-950 text-white" : complete ? "bg-stone-200 text-stone-950" : "bg-stone-100 text-stone-500"
              )}
            >
              {complete ? <Check className="h-4 w-4" /> : index + 1}
            </div>
            <span className="text-[11px] font-medium capitalize text-stone-700">{step}</span>
          </button>
        );
      })}
    </div>
  );
}

function buildVariantLabel(variant: { name?: string | null; color?: string | null; storage_label?: string | null }) {
  const parts = [variant.storage_label, variant.color].filter(Boolean);
  const normalizedName = (variant.name ?? "").trim();

  if (normalizedName && normalizedName.toLowerCase() !== "default") {
    parts.push(normalizedName);
  }

  return parts.length > 0 ? parts.join(" / ") : null;
}

function buildLineMeta(parts: Array<string | null | undefined>) {
  const filtered = parts.filter(Boolean);
  return filtered.length > 0 ? filtered.join(" • ") : null;
}

function getProductSaleBlockReason(product: ProductSummary | null) {
  if (!product) return null;
  if (product.total_quantity > 0) return null;
  if (product.has_damaged_activity && product.has_return_activity) {
    return "Unavailable: damaged / returned stock";
  }
  if (product.has_damaged_activity) {
    return "Unavailable: damaged stock";
  }
  if (product.has_return_activity) {
    return "Unavailable: returned stock";
  }
  return "Unavailable: out of stock";
}

function getVariantSellingPrice(
  product: Pick<ProductSummary, "base_selling_price"> | null,
  variant?: { selling_price_override?: number | null } | null
) {
  return Number(variant?.selling_price_override ?? product?.base_selling_price ?? 0);
}

function buildInventoryItemLabel(item: InventoryRecord) {
  if (item.identifiers && item.identifiers.length > 0) {
    return item.identifiers
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((identifier) => identifier.identifier_value)
      .join(" / ");
  }

  if (item.imei_1 || item.imei_2) {
    return [item.imei_1, item.imei_2].filter(Boolean).join(" / ");
  }

  return item.unique_identifier || item.serial_number;
}

function computeLineTotal({
  quantity,
  unitPrice,
  discountAmount,
}: {
  quantity: number;
  unitPrice: number;
  discountAmount: number;
}) {
  const subtotal = quantity * unitPrice;
  return Number(Math.max(subtotal - discountAmount, 0).toFixed(2));
}

function buildProductKindCopy(product: ProductSummary | null) {
  if (!product) return null;

  if (product.product_kind === "MOBILE") {
    return {
      title: "Mobile Device",
      description: "Choose the exact storage and color, then select the in-stock device by IMEI.",
      icon: Smartphone,
    };
  }

  if (product.tracking_type === "SERIALIZED") {
    return {
      title: "Serialized Product",
      description: "Choose the option first, then select the exact in-stock serial/device unit.",
      icon: Package2,
    };
  }

  return {
    title: "Quantity Product",
    description: "Choose the matching option and enter how many units are being sold.",
    icon: Package2,
  };
}

function buildProductSearchLabel(product: ProductSummary) {
  return [product.brand?.name, product.name].filter(Boolean).join(" • ");
}

function buildProductSupportMeta(product: ProductSummary) {
  const parts = [
    product.product_kind === "MOBILE"
      ? "Mobile"
      : product.tracking_type === "SERIALIZED"
        ? "Serialized"
        : "Quantity",
    product.total_quantity > 0 ? `${product.total_quantity} in stock` : null,
  ];

  return parts.filter(Boolean).join(" • ");
}

function ProductPicker({
  products,
  selectedProductId,
  onSelect,
}: {
  products: ProductSummary[];
  selectedProductId: string;
  onSelect: (productId: string) => void;
}) {
  const selectedProduct = products.find((product) => product.id === selectedProductId) ?? null;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputValue = open ? query : selectedProduct ? buildProductSearchLabel(selectedProduct) : query;

  useEffect(() => {
    function handlePointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointer);
    return () => document.removeEventListener("mousedown", handlePointer);
  }, []);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredProducts = useMemo(() => {
    const ranked = products
      .map((product) => {
        const haystack = [
          product.name,
          product.brand?.name,
          product.category?.name,
          ...(product.variants ?? []).flatMap((variant) => [variant.storage_label, variant.color, variant.name]),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        const score =
          normalizedQuery.length === 0
            ? product.total_quantity > 0
              ? 2
              : 1
            : haystack.includes(normalizedQuery)
              ? buildProductSearchLabel(product).toLowerCase().startsWith(normalizedQuery)
                ? 4
                : 3
              : 0;

        return { product, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score;
        if ((right.product.total_quantity ?? 0) !== (left.product.total_quantity ?? 0)) {
          return (right.product.total_quantity ?? 0) - (left.product.total_quantity ?? 0);
        }
        return left.product.name.localeCompare(right.product.name);
      });

    return ranked.slice(0, 8).map((entry) => entry.product);
  }, [normalizedQuery, products]);

  return (
    <div ref={rootRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
        <Input
          value={inputValue}
          placeholder="Search by product, brand, color, storage"
          className="h-12 rounded-2xl border-stone-200 bg-white pl-10 pr-10"
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
        />
        {selectedProduct && query && !open ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              onSelect("");
              setOpen(true);
            }}
            className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-stone-100 text-stone-500 transition hover:bg-stone-200 hover:text-stone-900"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-30 overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.14)]">
          <div className="max-h-80 overflow-y-auto p-2">
            {filteredProducts.length > 0 ? (
              filteredProducts.map((product) => {
                const blockReason = getProductSaleBlockReason(product);
                const active = product.id === selectedProductId;

                return (
                  <button
                    key={product.id}
                    type="button"
                    disabled={Boolean(blockReason)}
                    onClick={() => {
                      onSelect(product.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-start justify-between gap-3 rounded-2xl px-3 py-3 text-left transition",
                      active ? "bg-stone-950 text-white" : "hover:bg-stone-50",
                      blockReason && !active ? "cursor-not-allowed opacity-55" : ""
                    )}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{product.name}</p>
                      <p className={cn("mt-1 text-xs", active ? "text-white/70" : "text-stone-500")}>
                        {buildProductSearchLabel(product)}
                      </p>
                      <p className={cn("mt-1 text-xs", active ? "text-white/70" : "text-stone-400")}>
                        {blockReason ?? buildProductSupportMeta(product)}
                      </p>
                    </div>
                    {active ? <Check className="mt-0.5 h-4 w-4 shrink-0" /> : null}
                  </button>
                );
              })
            ) : (
              <div className="px-3 py-6 text-center text-sm text-stone-500">No matching products found.</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function OptionChip({
  label,
  stock,
  active,
  onClick,
}: {
  label: string;
  stock: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-2xl border px-4 py-3 text-left transition",
        active
          ? "border-stone-950 bg-stone-950 text-white shadow-sm"
          : "border-stone-200 bg-[#fffdf9] text-stone-900 hover:border-stone-300 hover:bg-white"
      )}
    >
      <div className="text-sm font-semibold">{label}</div>
      <div className={cn("mt-1 text-xs", active ? "text-white/75" : "text-stone-500")}>{stock} in stock</div>
    </button>
  );
}

function LineEditor({
  line,
  index,
  products,
  onChange,
  onRemove,
}: {
  line: BillingLineDraft;
  index: number;
  products: ProductSummary[];
  onChange: (next: Partial<BillingLineDraft>) => void;
  onRemove: () => void;
}) {
  const selectedProduct = products.find((product) => product.id === line.product_id) ?? null;
  const { data: productDetails } = useQuery({
    queryKey: line.product_id ? productDetailsQueryKey(line.product_id) : ["inventory", "product-details", line.id],
    queryFn: line.product_id ? () => fetchProductDetails(line.product_id) : skipToken,
    enabled: Boolean(line.product_id),
    staleTime: 10 * 60 * 1000,
  });

  const variants = useMemo(() => productDetails?.variants ?? [], [productDetails?.variants]);

  const variantStockMap = useMemo(() => {
    const map = new Map<string, number>();

    if (!productDetails) return map;

    if (productDetails.tracking_type === "QUANTITY_BASED") {
      for (const variant of variants) {
        map.set(variant.id, variant.quantity ?? 0);
      }
      return map;
    }

    for (const item of productDetails.inventory_items ?? []) {
      if (item.status !== "IN_STOCK" || !item.variant_id) continue;
      map.set(item.variant_id, (map.get(item.variant_id) ?? 0) + 1);
    }

    return map;
  }, [productDetails, variants]);

  const preferredVariant = useMemo(() => {
    return variants.find((variant) => (variantStockMap.get(variant.id) ?? 0) > 0) ?? variants[0] ?? null;
  }, [variantStockMap, variants]);

  const selectedVariant = variants.find((variant) => variant.id === line.variant_id) ?? preferredVariant;
  const activeStorage = selectedVariant?.storage_label ?? "";
  const selectedProductBlockReason = getProductSaleBlockReason(selectedProduct);

  const storageOptions = useMemo(() => {
    return Array.from(
      new Map(
        variants
          .filter((variant) => variant.storage_label)
          .map((variant) => [
            variant.storage_label as string,
            {
              label: variant.storage_label as string,
              stock: variants
                .filter((candidate) => candidate.storage_label === variant.storage_label)
                .reduce((sum, candidate) => sum + (variantStockMap.get(candidate.id) ?? 0), 0),
            },
          ])
      ).values()
    );
  }, [variantStockMap, variants]);

  const storageScopedVariants = activeStorage
    ? variants.filter((variant) => variant.storage_label === activeStorage)
    : variants;

  const colorOptions = useMemo(() => {
    return Array.from(
      new Map(
        storageScopedVariants
          .filter((variant) => variant.color)
          .map((variant) => [
            variant.color as string,
            {
              label: variant.color as string,
              stock: storageScopedVariants
                .filter((candidate) => candidate.color === variant.color)
                .reduce((sum, candidate) => sum + (variantStockMap.get(candidate.id) ?? 0), 0),
            },
          ])
      ).values()
    );
  }, [storageScopedVariants, variantStockMap]);

  const availableUnits = useMemo(() => {
    const activeVariantId = selectedVariant?.id ?? "";
    return (productDetails?.inventory_items ?? [])
      .filter((item) => {
        if (item.status !== "IN_STOCK") return false;
        if (!activeVariantId) return true;
        return item.variant_id === activeVariantId;
      })
      .sort((a, b) => new Date(a.added_at).getTime() - new Date(b.added_at).getTime());
  }, [productDetails?.inventory_items, selectedVariant]);

  const selectedUnit = availableUnits.find((item) => item.id === line.inventory_item_id) ?? null;
  const stockLeft = selectedVariant ? variantStockMap.get(selectedVariant.id) ?? 0 : selectedProduct?.total_quantity ?? 0;
  const selectedVariantPrice = getVariantSellingPrice(selectedProduct, selectedVariant);
  const productKindCopy = buildProductKindCopy(selectedProduct);
  const ProductKindIcon = productKindCopy?.icon ?? Package2;

  useEffect(() => {
    if (!selectedProduct || !productDetails) return;
    if (selectedProductBlockReason) return;

    if (variants.length > 0 && (!line.variant_id || !variants.some((variant) => variant.id === line.variant_id))) {
      onChange({
        variant_id: preferredVariant?.id ?? "",
        inventory_item_id: "",
        identifier_value: "",
      });
    }
  }, [line.variant_id, onChange, preferredVariant?.id, productDetails, selectedProduct, selectedProductBlockReason, variants]);

  useEffect(() => {
    if (!selectedProduct) return;

    if (selectedProduct.tracking_type === "SERIALIZED" && line.quantity !== "1") {
      onChange({ quantity: "1" });
    }

    if (selectedProduct.tracking_type === "SERIALIZED" && line.inventory_item_id && !availableUnits.some((item) => item.id === line.inventory_item_id)) {
      onChange({ inventory_item_id: "", identifier_value: "" });
    }
  }, [availableUnits, line.inventory_item_id, line.quantity, onChange, selectedProduct]);

  useEffect(() => {
    if (!selectedProduct) return;
    if (!selectedVariant) {
      if (line.unit_price === "0") {
        onChange({ unit_price: String(selectedProduct.base_selling_price) });
      }
      return;
    }

    if ((Number.parseFloat(line.unit_price || "0") || 0) === selectedVariantPrice) {
      return;
    }

    onChange({ unit_price: String(selectedVariantPrice) });
  }, [line.unit_price, onChange, selectedProduct, selectedVariant, selectedVariantPrice]);

  function selectStorage(storageValue: string) {
    const nextVariant =
      variants.find(
        (variant) =>
          variant.storage_label === storageValue &&
          (selectedVariant?.color ? variant.color === selectedVariant.color : true) &&
          (variantStockMap.get(variant.id) ?? 0) > 0
      ) ??
      variants.find((variant) => variant.storage_label === storageValue && (variantStockMap.get(variant.id) ?? 0) > 0) ??
      variants.find((variant) => variant.storage_label === storageValue) ??
      null;

    if (!nextVariant) return;

    onChange({
      variant_id: nextVariant.id,
      inventory_item_id: "",
      identifier_value: "",
    });
  }

  function selectColor(colorValue: string) {
    const nextVariant =
      variants.find(
        (variant) =>
          variant.color === colorValue &&
          (activeStorage ? variant.storage_label === activeStorage : true) &&
          (variantStockMap.get(variant.id) ?? 0) > 0
      ) ??
      variants.find(
        (variant) => variant.color === colorValue && (activeStorage ? variant.storage_label === activeStorage : true)
      ) ??
      variants.find((variant) => variant.color === colorValue) ??
      null;

    if (!nextVariant) return;

    onChange({
      variant_id: nextVariant.id,
      inventory_item_id: "",
      identifier_value: "",
    });
  }

  return (
    <div className="space-y-4 rounded-[1.75rem] border border-stone-200/80 bg-gradient-to-b from-white to-[#f9f5ee] p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <Button type="button" variant="ghost" className="h-8 px-2 text-rose-600 hover:bg-rose-50" onClick={onRemove}>
          <Trash2 className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-stone-900 px-2 text-xs font-semibold text-white">
              {index + 1}
            </span>
            <p className="text-sm font-semibold text-stone-900">Bill Item</p>
          </div>
          <p className="mt-1 text-xs text-stone-500">Find a product fast, then choose the exact sale option.</p>
        </div>
      </div>

      <Field label="Product" required>
        <ProductPicker
          products={products}
          selectedProductId={line.product_id}
          onSelect={(productId) => {
            const nextProduct = products.find((product) => product.id === productId);
            onChange({
              product_id: productId,
              variant_id: "",
              inventory_item_id: "",
              identifier_value: "",
              quantity: "1",
              unit_price: nextProduct ? String(nextProduct.base_selling_price) : "0",
              discount_amount: "0",
            });
          }}
        />
      </Field>

      {selectedProduct ? (
        <div className="rounded-3xl border border-stone-200 bg-[#fffdfa] px-4 py-3">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-stone-100 text-stone-700">
              <ProductKindIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-stone-900">{selectedProduct.name}</p>
              <p className="mt-1 text-xs text-stone-500">
                {buildLineMeta([selectedProduct.brand?.name, productKindCopy?.title, `${selectedProduct.total_quantity} in stock`])}
              </p>
              <p className="mt-2 text-sm leading-6 text-stone-600">{productKindCopy?.description}</p>
            </div>
          </div>
          {selectedProductBlockReason ? (
            <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
              {selectedProductBlockReason}
            </div>
          ) : null}
        </div>
      ) : null}

      {selectedProduct && productDetails && !selectedProductBlockReason ? (
        <>
          {storageOptions.length > 0 ? (
            <Field label="Storage / Variant">
              <div className="flex flex-wrap gap-3">
                {storageOptions.map((option) => (
                  <OptionChip
                    key={option.label}
                    label={option.label}
                    stock={option.stock}
                    active={(selectedVariant?.storage_label ?? "") === option.label}
                    onClick={() => selectStorage(option.label)}
                  />
                ))}
              </div>
            </Field>
          ) : null}

          {colorOptions.length > 0 ? (
            <Field label="Color">
              <div className="flex flex-wrap gap-3">
                {colorOptions.map((option) => (
                  <OptionChip
                    key={option.label}
                    label={option.label}
                    stock={option.stock}
                    active={(selectedVariant?.color ?? "") === option.label}
                    onClick={() => selectColor(option.label)}
                  />
                ))}
              </div>
            </Field>
          ) : null}

          {selectedVariant ? (
            <div className="flex flex-wrap items-center gap-2 rounded-3xl border border-stone-200 bg-white px-4 py-3">
              {buildVariantLabel(selectedVariant) ? (
                <span className="rounded-full bg-stone-100 px-3 py-1 text-sm font-semibold text-stone-900">
                  {buildVariantLabel(selectedVariant)}
                </span>
              ) : null}
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">{stockLeft} in stock</span>
              <span className="rounded-full bg-amber-50 px-3 py-1 text-sm font-medium text-amber-700">
                Rate {money(Number.parseFloat(line.unit_price || "0") || selectedVariantPrice)}
              </span>
              {selectedProduct.tracking_type === "SERIALIZED" ? (
                <span className="rounded-full bg-sky-50 px-3 py-1 text-sm font-medium text-sky-700">Exact unit required</span>
              ) : null}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-3">
            {selectedProduct.tracking_type === "SERIALIZED" ? (
              <div>
                <Field label={selectedProduct.product_kind === "MOBILE" ? "Device / IMEI" : "Device / Serial"} required>
                  <Select
                    value={line.inventory_item_id}
                    onChange={(event) => {
                      const unit = availableUnits.find((item) => item.id === event.target.value);
                      onChange({
                        inventory_item_id: event.target.value,
                        identifier_value: unit ? buildInventoryItemLabel(unit) : "",
                        quantity: "1",
                        variant_id: unit?.variant_id ?? line.variant_id,
                      });
                    }}
                    className="rounded-2xl border-stone-200 bg-white"
                  >
                    <option value="">Select stock unit</option>
                    {availableUnits.map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {buildInventoryItemLabel(unit)}
                      </option>
                    ))}
                  </Select>
                  {selectedUnit ? <p className="mt-2 text-xs text-stone-500">Selected device: {buildInventoryItemLabel(selectedUnit)}</p> : null}
                </Field>
              </div>
            ) : (
              <Field label="Quantity" required>
                <Input
                  type="number"
                  min="1"
                  max={Math.max(stockLeft, 1)}
                  value={line.quantity}
                  className="rounded-2xl border-stone-200 bg-white"
                  onChange={(event) => onChange({ quantity: event.target.value })}
                />
                <p className="mt-2 text-xs text-stone-500">Available stock: {stockLeft}</p>
              </Field>
            )}

            <Field label="Unit Price" required>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={line.unit_price}
                className="rounded-2xl border-stone-200 bg-white"
                onChange={(event) => onChange({ unit_price: event.target.value })}
              />
            </Field>

            <Field label="Discount">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={line.discount_amount}
                className="rounded-2xl border-stone-200 bg-white"
                onChange={(event) => onChange({ discount_amount: event.target.value })}
              />
            </Field>
          </div>
        </>
      ) : null}

      {selectedProduct && !productDetails && line.product_id ? (
        <div className="flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm text-stone-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading product options...
        </div>
      ) : null}
    </div>
  );
}

export function AddBillModal({
  open,
  onClose,
  products,
  shopLogoUrl,
  onInvoiceCreated,
}: {
  open: boolean;
  onClose: () => void;
  products: ProductSummary[];
  shopLogoUrl?: string | null;
  onInvoiceCreated?: (items: Array<{ product_id: string; variant_id: string | null; quantity: number }>) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [currentStep, setCurrentStep] = useState<StepId>("customer");
  const [customer, setCustomer] = useState<CustomerDraft>({ name: "", mobile: "", billing_address: "", gst_number: "" });
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "CARD" | "UPI" | "BANK_TRANSFER" | "OTHER">("CASH");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<BillingLineDraft[]>([createLine()]);
  const [clientError, setClientError] = useState("");
  const [state, setState] = useState<ActionResponse>({ status: "success", message: "" });
  const [isQrScannerOpen, setIsQrScannerOpen] = useState(false);
  const steps: StepId[] = ["customer", "products", "preview"];
  const stepIndex = steps.indexOf(currentStep);
  const productsRef = useRef(products);

  useEffect(() => {
    productsRef.current = products;
  }, [products]);

  if (!open) return null;

  const preparedLines = lines
    .map((line) => {
      const product = products.find((item) => item.id === line.product_id);
      if (!product) return null;
      const quantity = product.tracking_type === "SERIALIZED" ? 1 : Number.parseInt(line.quantity || "1", 10) || 1;
      const unitPrice = Number.parseFloat(line.unit_price || "0") || 0;
      const discountAmount = Number.parseFloat(line.discount_amount || "0") || 0;
      const variant = product.variants?.find((item) => item.id === line.variant_id);

      return {
        product_id: product.id,
        variant_id: line.variant_id || null,
        inventory_item_id: line.inventory_item_id || null,
        product_name_snapshot: product.name,
        brand_name_snapshot: product.brand?.name ?? null,
        category_name_snapshot: product.category?.name ?? null,
        variant_name_snapshot: variant ? buildVariantLabel(variant) : null,
        identifier_snapshot: line.identifier_value || null,
        quantity,
        unit_price: unitPrice,
        tax_rate: 0,
        discount_amount: discountAmount,
        line_total: computeLineTotal({ quantity, unitPrice, discountAmount }),
      };
    })
    .filter((line): line is NonNullable<typeof line> => Boolean(line));

  const totals = preparedLines.reduce(
    (acc, line) => {
      const subtotal = line.quantity * line.unit_price;
      acc.subtotal += subtotal;
      acc.discount += line.discount_amount;
      acc.total += line.line_total;
      return acc;
    },
    { subtotal: 0, discount: 0, tax: 0, total: 0 }
  );

  function validateStep(step: StepId) {
    if (step === "customer") {
      if (!customer.name.trim()) {
        setClientError("Customer name is required.");
        return false;
      }
      if (!customer.mobile.trim()) {
        setClientError("Mobile number is required.");
        return false;
      }
      if (!customer.billing_address.trim()) {
        setClientError("Billing address is required.");
        return false;
      }
    }

    if (step === "products") {
      if (preparedLines.length === 0) {
        setClientError("Add at least one product line.");
        return false;
      }

      const hasInvalidLine = lines.some((line) => {
        const product = products.find((item) => item.id === line.product_id);
        if (!product) return true;
        if (getProductSaleBlockReason(product)) return true;
        if (!line.variant_id) return true;
        if (product.tracking_type === "SERIALIZED") {
          return !line.inventory_item_id;
        }
        return !line.quantity || (Number.parseInt(line.quantity || "0", 10) || 0) <= 0;
      });

      if (hasInvalidLine) {
        setClientError("Complete each product line by selecting the option and stock details.");
        return false;
      }
    }

    setClientError("");
    return true;
  }

  function moveStep(direction: 1 | -1) {
    if (direction > 0 && !validateStep(currentStep)) return;
    const nextIndex = stepIndex + direction;
    if (nextIndex < 0 || nextIndex >= steps.length) return;
    setCurrentStep(steps[nextIndex]);
  }

  function handleStepChange(step: StepId) {
    const targetIndex = steps.indexOf(step);
    if (targetIndex <= stepIndex) {
      setCurrentStep(step);
      return;
    }

    let indexToValidate = stepIndex;
    while (indexToValidate < targetIndex) {
      if (!validateStep(steps[indexToValidate])) return;
      indexToValidate += 1;
    }

    setCurrentStep(step);
  }

  function submitInvoice() {
    if (!validateStep("preview")) return;
    const formData = new FormData();
    formData.set(
      "invoice_payload",
      JSON.stringify({
        customer,
        items: preparedLines,
        payment_method: paymentMethod,
        notes,
      })
    );

    startTransition(async () => {
      const result = await createInvoiceAction({ status: "success", message: "" }, formData);
      setState(result);
      if (result.status === "success" && result.data) {
        printInvoice({ ...(result.data as Parameters<typeof printInvoice>[0]), shop_logo_url: shopLogoUrl ?? null });
        onInvoiceCreated?.(
          preparedLines.map((line) => ({
            product_id: line.product_id,
            variant_id: line.variant_id,
            quantity: line.quantity,
          }))
        );
        onClose();
      }
    });
  }

  function applyResolvedQrLine(resolved: {
    kind: "UNIT" | "QTY";
    product_id: string;
    variant_id: string;
    inventory_item_id: string | null;
    identifier_value: string | null;
    unit_price: number;
  }) {
    setLines((current) => {
      if (resolved.kind === "QTY") {
        const existingIndex = current.findIndex(
          (line) =>
            line.product_id === resolved.product_id &&
            line.variant_id === resolved.variant_id &&
            !line.inventory_item_id
        );

        if (existingIndex >= 0) {
          return current.map((line, index) =>
            index === existingIndex
              ? {
                  ...line,
                  quantity: String((Number.parseInt(line.quantity || "1", 10) || 1) + 1),
                  unit_price: String(resolved.unit_price),
                }
              : line
          );
        }
      }

      const emptyIndex = current.findIndex((line) => !line.product_id);
      const nextLine: BillingLineDraft = {
        id: emptyIndex >= 0 ? current[emptyIndex].id : crypto.randomUUID(),
        product_id: resolved.product_id,
        variant_id: resolved.variant_id,
        inventory_item_id: resolved.inventory_item_id ?? "",
        identifier_value: resolved.identifier_value ?? "",
        quantity: "1",
        unit_price: String(resolved.unit_price),
        discount_amount: "0",
      };

      if (emptyIndex >= 0) {
        return current.map((line, index) => (index === emptyIndex ? nextLine : line));
      }

      return [...current, nextLine];
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-stone-950/55 backdrop-blur-sm">
      <div className="fixed inset-x-0 bottom-0 top-8 mx-auto flex max-w-[450px] flex-col overflow-hidden rounded-t-[2rem] bg-[#fcfaf6] shadow-[0_30px_80px_rgba(15,23,42,0.18)] sm:bottom-6 sm:top-6 sm:rounded-[2rem]">
        <div className="flex items-center justify-between border-b border-stone-200/80 bg-[#fffdf9] px-5 py-4 sm:px-6">
          <h2 className="text-lg font-semibold text-stone-950">Create Bill</h2>
          <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-100 text-stone-500 transition hover:bg-stone-200 hover:text-stone-900">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="sticky top-0 z-10 border-b border-stone-200/80 bg-[#fffdf9] px-4 py-3 sm:px-6">
          <Stepper steps={steps} currentStep={currentStep} onStepChange={handleStepChange} />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          {currentStep === "customer" ? (
            <section className="space-y-4 py-2">
              <StepTitle step={1} title="Customer Info" />
              <Field label="Customer Name" required>
                <Input value={customer.name} onChange={(event) => setCustomer((current) => ({ ...current, name: event.target.value }))} />
              </Field>
              <Field label="Mobile Number" required>
                <Input value={customer.mobile} onChange={(event) => setCustomer((current) => ({ ...current, mobile: event.target.value }))} />
              </Field>
              <Field label="Bill To Address" required>
                <Textarea value={customer.billing_address} onChange={(event) => setCustomer((current) => ({ ...current, billing_address: event.target.value }))} />
              </Field>
              <Field label="GST Number">
                <Input value={customer.gst_number} onChange={(event) => setCustomer((current) => ({ ...current, gst_number: event.target.value }))} />
              </Field>
            </section>
          ) : null}

          {currentStep === "products" ? (
            <section className="space-y-4 py-2">
              <div className="flex items-center justify-between gap-3">
                <StepTitle step={2} title="Products" />
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsQrScannerOpen(true)}>
                    <ScanBarcode className="h-4 w-4" />
                    Scan QR
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => setLines((current) => [...current, createLine()])}>
                    <Plus className="h-4 w-4" />
                    Add Product
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 rounded-[1.75rem] border border-stone-200/80 bg-white/70 p-4">
                <Field label="Payment Method">
                  <Select
                    value={paymentMethod}
                    className="rounded-2xl border-stone-200 bg-white"
                    onChange={(event) => setPaymentMethod(event.target.value as typeof paymentMethod)}
                  >
                    <option value="CASH">Cash</option>
                    <option value="UPI">UPI</option>
                    <option value="CARD">Card</option>
                    <option value="BANK_TRANSFER">Bank Transfer</option>
                    <option value="OTHER">Other</option>
                  </Select>
                </Field>

                <div className="rounded-2xl bg-[#f6f1e8] px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">Quick Summary</p>
                  <div className="mt-2 flex items-center justify-between text-sm text-stone-600">
                    <span>{preparedLines.length} items</span>
                    <span>{money(totals.total)}</span>
                  </div>
                </div>
              </div>

              {lines.map((line) => (
                <LineEditor
                  key={line.id}
                  index={lines.findIndex((item) => item.id === line.id)}
                  line={line}
                  products={products}
                  onChange={(next) =>
                    setLines((current) => current.map((item) => (item.id === line.id ? { ...item, ...next } : item)))
                  }
                  onRemove={() => setLines((current) => (current.length > 1 ? current.filter((item) => item.id !== line.id) : current))}
                />
              ))}

              <Field label="Notes">
                <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
              </Field>
            </section>
          ) : null}

          {currentStep === "preview" ? (
            <section className="space-y-4 py-2">
              <StepTitle step={3} title="Preview" />
              <div className="rounded-[1.75rem] border border-stone-200/80 bg-white p-4">
                <div className="grid grid-cols-1 gap-4">
                  <PreviewField label="Customer" value={customer.name} />
                  <PreviewField label="Mobile" value={customer.mobile || "Not provided"} />
                  <PreviewField label="Address" value={customer.billing_address || "Not provided"} />
                  <PreviewField label="GST" value={customer.gst_number || "Not provided"} />
                  <PreviewField label="Payment Method" value={paymentMethod.replace("_", " ")} />
                </div>
              </div>
              <div className="rounded-[1.75rem] border border-stone-200/80 bg-white p-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-stone-400">Products</p>
                <div className="mt-3 space-y-3">
                  {preparedLines.map((line, index) => (
                    <div key={`${line.product_id}-${index}`} className="flex items-start justify-between gap-4 border-b border-stone-100 pb-3 last:border-b-0 last:pb-0">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-stone-900">{line.product_name_snapshot}</div>
                        {buildLineMeta([line.brand_name_snapshot, line.variant_name_snapshot, line.identifier_snapshot]) ? (
                          <div className="mt-1 text-xs text-stone-500">
                            {buildLineMeta([line.brand_name_snapshot, line.variant_name_snapshot, line.identifier_snapshot])}
                          </div>
                        ) : null}
                        <div className="mt-1 text-xs text-stone-500">Qty {line.quantity} • Rate {money(line.unit_price)}</div>
                      </div>
                      <div className="text-sm font-semibold text-stone-900">{money(line.line_total)}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-[1.75rem] border border-stone-200/80 bg-white p-4">
                <div className="flex items-center justify-between text-sm text-stone-700"><span>Subtotal</span><span>{money(totals.subtotal)}</span></div>
                <div className="mt-2 flex items-center justify-between text-sm text-stone-700"><span>Discount</span><span>{money(totals.discount)}</span></div>
                <div className="mt-3 flex items-center justify-between text-base font-semibold text-stone-950"><span>Total</span><span>{money(totals.total)}</span></div>
              </div>
            </section>
          ) : null}

          {clientError ? <p className="mt-3 text-sm text-rose-600">{clientError}</p> : null}
          {state.status === "error" && state.message ? <p className="mt-3 text-sm text-rose-600">{state.message}</p> : null}
        </div>

        <div className="flex items-center justify-between border-t border-stone-200/80 bg-[#fffdf9] px-4 py-4 sm:px-6">
          <div className="text-sm text-stone-500">
            {currentStep !== "customer" ? <span>{preparedLines.length} items ready</span> : <span>Fill customer details to continue</span>}
          </div>
          <div className="flex items-center gap-3">
            <Button type="button" variant="ghost" onClick={stepIndex <= 0 ? onClose : () => moveStep(-1)} disabled={isPending}>
              <ChevronLeft className="h-4 w-4" />
              {stepIndex <= 0 ? "Close" : "Back"}
            </Button>
            {currentStep === "preview" ? (
              <Button type="button" onClick={submitInvoice} disabled={isPending || preparedLines.length === 0}>
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save & Print
              </Button>
            ) : (
              <Button type="button" onClick={() => moveStep(1)}>
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {isQrScannerOpen ? (
        <QrScanner
          onClose={() => setIsQrScannerOpen(false)}
          onScan={(result) => {
            setIsQrScannerOpen(false);
            startTransition(async () => {
              const resolved = await resolveBillingQrAction(result);

              if (resolved.status === "error" || !resolved.data) {
                setClientError(resolved.message);
                return;
              }

              if (
                resolved.data.kind === "UNIT" &&
                lines.some((line) => line.inventory_item_id && line.inventory_item_id === resolved.data?.inventory_item_id)
              ) {
                setClientError("This device is already added to the bill.");
                return;
              }

              setClientError("");
              applyResolvedQrLine(resolved.data);
              setCurrentStep("products");
            });
          }}
        />
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

function Field({
  label,
  children,
  required,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium text-stone-700">
        {label} {required ? <span className="text-rose-500">*</span> : null}
      </Label>
      {children}
    </div>
  );
}

function PreviewField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-[#f8f4ec] p-4">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-stone-400">{label}</p>
      <p className="mt-2 text-sm font-medium text-stone-900">{value}</p>
    </div>
  );
}
