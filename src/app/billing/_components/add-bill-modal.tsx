"use client";

import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronLeft, ChevronRight, Gift, Lightbulb, Loader2, Package2, Pencil, Plus, ScanBarcode, Search, Smartphone, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { buildVariantLabel } from "@/lib/inventory-labels";
import type { Product } from "@/lib/types/inventory";
import { cn } from "@/lib/utils";
import { createInvoiceAction, updateInvoiceAction } from "../actions";
import type { BillingInvoiceSummary } from "../load-billing-data";
import { fetchProductDetails, productDetailsQueryKey, productDetailsQueryOptions, type ProductDetails } from "@/app/inventory/queries";
import type { ActionResponse } from "@/app/inventory/actions";
import { downloadInvoicePdf } from "./invoice-print";
import { BarcodeScanner } from "@/app/inventory/_components/barcode-scanner";

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

type PaymentMethodChoice = "CASH" | "CARD" | "UPI" | "BANK_TRANSFER" | "OTHER" | "LOAN";

type PaymentDraft = {
  methods: PaymentMethodChoice[];
  loan_provider: string;
  loan_number: string;
};

type BillingLineType = "inventory" | "quick";

type BillingLineDraft = {
  id: string;
  line_type: BillingLineType;
  is_free_gift: boolean;
  quick_item_name: string;
  product_id: string;
  variant_id: string;
  inventory_item_id: string;
  identifier_value: string;
  imei_1: string;
  imei_2: string;
  quantity: string;
  unit_price: string;
  discount_amount: string;
};

type InventoryRecord = NonNullable<ProductDetails["inventory_items"]>[number];

const PAYMENT_METHOD_OPTIONS: Array<{ id: PaymentMethodChoice; label: string }> = [
  { id: "CASH", label: "Cash" },
  { id: "UPI", label: "UPI" },
  { id: "CARD", label: "Card" },
  { id: "BANK_TRANSFER", label: "Bank Transfer" },
  { id: "LOAN", label: "Loan" },
  { id: "OTHER", label: "Other" },
];

const LOAN_PROVIDER_OPTIONS = [
  "Bajaj Finserv",
  "Home Credit",
  "HDB Financial Services",
  "IDFC First Bank",
  "TVS Credit",
  "Kissht",
  "ShopSe",
  "Snapmint",
  "ZestMoney",
  "Other",
];

const BILL_DRAFT_STORAGE_KEY = "dukaanhq:create-bill:draft:v1";

function createLine(): BillingLineDraft {
  return {
    id: crypto.randomUUID(),
    line_type: "inventory",
    is_free_gift: false,
    quick_item_name: "",
    product_id: "",
    variant_id: "",
    inventory_item_id: "",
    identifier_value: "",
    imei_1: "",
    imei_2: "",
    quantity: "1",
    unit_price: "0",
    discount_amount: "0",
  };
}

function createQuickLine(): BillingLineDraft {
  return {
    id: crypto.randomUUID(),
    line_type: "quick",
    is_free_gift: false,
    quick_item_name: "",
    product_id: "",
    variant_id: "",
    inventory_item_id: "",
    identifier_value: "",
    imei_1: "",
    imei_2: "",
    quantity: "1",
    unit_price: "0",
    discount_amount: "0",
  };
}

function isQuickLine(line: BillingLineDraft) {
  return line.line_type === "quick";
}

function isQuickGiftLine(line: BillingLineDraft | null) {
  return Boolean(line?.line_type === "quick" && line?.is_free_gift);
}

function normalizeDraftLine(line: Partial<BillingLineDraft> | null | undefined): BillingLineDraft {
  return {
    id: line?.id || crypto.randomUUID(),
    line_type: line?.line_type === "quick" ? "quick" : "inventory",
    is_free_gift:
      typeof line?.is_free_gift === "boolean"
        ? line.is_free_gift
        : line?.line_type === "quick" && Number(line?.unit_price || 0) === 0,
    quick_item_name: typeof line?.quick_item_name === "string" ? line.quick_item_name : "",
    product_id: typeof line?.product_id === "string" ? line.product_id : "",
    variant_id: typeof line?.variant_id === "string" ? line.variant_id : "",
    inventory_item_id: typeof line?.inventory_item_id === "string" ? line.inventory_item_id : "",
    identifier_value: typeof line?.identifier_value === "string" ? line.identifier_value : "",
    imei_1: typeof line?.imei_1 === "string" ? line.imei_1 : "",
    imei_2: typeof line?.imei_2 === "string" ? line.imei_2 : "",
    quantity: typeof line?.quantity === "string" ? line.quantity : "1",
    unit_price: typeof line?.unit_price === "string" ? line.unit_price : "0",
    discount_amount: typeof line?.discount_amount === "string" ? line.discount_amount : "0",
  };
}

type StoredBillDraft = {
  version: 1;
  currentStep: StepId;
  customer: CustomerDraft;
  paymentDraft: PaymentDraft;
  notes: string;
  lines: BillingLineDraft[];
};

function readStoredBillDraft() {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(BILL_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredBillDraft>;
    if (parsed.version !== 1) return null;
    if (!parsed.customer || !parsed.paymentDraft || !Array.isArray(parsed.lines)) return null;

    const currentStep =
      parsed.currentStep === "customer" || parsed.currentStep === "products" || parsed.currentStep === "preview"
        ? parsed.currentStep
        : "customer";

    return {
      version: 1 as const,
      currentStep,
      customer: {
        name: typeof parsed.customer.name === "string" ? parsed.customer.name : "",
        mobile: typeof parsed.customer.mobile === "string" ? parsed.customer.mobile : "",
        billing_address: typeof parsed.customer.billing_address === "string" ? parsed.customer.billing_address : "",
        gst_number: typeof parsed.customer.gst_number === "string" ? parsed.customer.gst_number : "",
      },
      paymentDraft: {
        methods: Array.isArray(parsed.paymentDraft.methods)
          ? parsed.paymentDraft.methods.filter((method): method is PaymentMethodChoice =>
              ["CASH", "CARD", "UPI", "BANK_TRANSFER", "OTHER", "LOAN"].includes(String(method))
            )
          : [],
        loan_provider: typeof parsed.paymentDraft.loan_provider === "string" ? parsed.paymentDraft.loan_provider : "",
        loan_number: typeof parsed.paymentDraft.loan_number === "string" ? parsed.paymentDraft.loan_number : "",
      },
      notes: typeof parsed.notes === "string" ? parsed.notes : "",
      lines: parsed.lines.map((line) => normalizeDraftLine(line)),
    };
  } catch {
    return null;
  }
}

function clearStoredBillDraft() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(BILL_DRAFT_STORAGE_KEY);
}

function money(value: number) {
  return `Rs ${Number(value || 0).toFixed(2)}`;
}

function getStepHint(currentStep: StepId, itemCount: number) {
  if (currentStep === "customer") return "Fill customer details to continue.";
  if (currentStep === "products") return itemCount > 0 ? `${itemCount} item${itemCount === 1 ? "" : "s"} ready. Review products and payment before preview.` : "Add products and payment details to continue.";
  return "Preview the bill carefully before saving and downloading.";
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
    <div className="flex items-start justify-between">
      {steps.map((step, index) => {
        const active = step === currentStep;
        const complete = index < steps.indexOf(currentStep);
        const isLast = index === steps.length - 1;
        return (
          <div key={step} className="flex flex-1 items-start">
            <button
              type="button"
              onClick={() => onStepChange(step)}
              className="flex min-w-0 flex-col items-center gap-1.5 text-center"
            >
              <div
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold transition",
                  active
                    ? "bg-emerald-600 text-white"
                    : complete
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-stone-100 text-stone-500"
                )}
              >
                {complete ? <Check className="h-4 w-4" /> : index + 1}
              </div>
              <span className={cn("text-[10px] font-medium capitalize", active || complete ? "text-emerald-700" : "text-stone-500")}>{step}</span>
            </button>
            {!isLast ? (
              <div className="mx-2 mt-4 h-px flex-1 bg-stone-200">
                <div className={cn("h-px transition-all", complete ? "w-full bg-emerald-300" : "w-0 bg-transparent")} />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function isLineComplete(line: BillingLineDraft, products: ProductSummary[]) {
  if (isQuickLine(line)) {
    return Boolean(line.quick_item_name.trim()) && (Number.parseInt(line.quantity || "0", 10) || 0) > 0;
  }

  const product = products.find((item) => item.id === line.product_id);
  if (!product) return false;
  if (getProductSaleBlockReason(product)) return false;
  if (!line.variant_id) return false;

  if (product.product_kind === "MOBILE") {
    return Boolean(line.imei_1.trim());
  }

  if (product.tracking_type === "SERIALIZED") {
    return Boolean(line.inventory_item_id);
  }

  return (Number.parseInt(line.quantity || "0", 10) || 0) > 0;
}

function buildMobileIdentifierSnapshot(line: Pick<BillingLineDraft, "imei_1" | "imei_2">) {
  const parts = [
    line.imei_1.trim() ? `IMEI 1: ${line.imei_1.trim()}` : null,
    line.imei_2.trim() ? `IMEI 2: ${line.imei_2.trim()}` : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" • ") : null;
}

function createEmptyPaymentDraft(): PaymentDraft {
  return {
    methods: [],
    loan_provider: "",
    loan_number: "",
  };
}

function deriveInvoicePaymentMethod(payment: PaymentDraft): "CASH" | "CARD" | "UPI" | "BANK_TRANSFER" | "OTHER" {
  if (payment.methods.length !== 1) return "OTHER";
  const [method] = payment.methods;
  if (method === "CASH" || method === "CARD" || method === "UPI" || method === "BANK_TRANSFER") {
    return method;
  }
  return "OTHER";
}

function buildPaymentSummary(payment: PaymentDraft) {
  const labels = payment.methods
    .map((method) => PAYMENT_METHOD_OPTIONS.find((option) => option.id === method)?.label ?? method)
    .join(", ");
  return labels || "No payment method added";
}

function buildPreviewIdentifierLines(identifierSnapshot: string | null) {
  if (!identifierSnapshot) return [];
  return identifierSnapshot
    .split(" • ")
    .map((part) => part.trim())
    .filter(Boolean);
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
      description:
        product.tracking_type === "SERIALIZED"
          ? "Choose the exact storage and color, then select the in-stock device by IMEI."
          : "Choose the storage/color variant and enter how many units are being sold.",
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
  onOpenQuickItem,
}: {
  products: ProductSummary[];
  selectedProductId: string;
  onSelect: (productId: string) => void;
  onOpenQuickItem: () => void;
}) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
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

  useEffect(() => {
    for (const product of filteredProducts.slice(0, 6)) {
      void queryClient.prefetchQuery(productDetailsQueryOptions(product.id));
    }
  }, [filteredProducts, queryClient]);

  return (
    <div className="relative">
      <div className="sticky top-0 z-10 pb-3">
        <button
          type="button"
          onClick={onOpenQuickItem}
          className="mb-3 text-sm font-semibold text-sky-700 underline decoration-sky-400 underline-offset-4 transition hover:text-sky-800"
        >
          Add Quick Item
        </button>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <Input
            value={query}
            placeholder="Search by product, brand, color, storage"
            className="h-12 rounded-2xl border-stone-200 bg-white pl-10 pr-4 shadow-sm"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>

      <div>
          {filteredProducts.length > 0 ? (
            filteredProducts.map((product, index) => {
              const blockReason = getProductSaleBlockReason(product);
              const active = product.id === selectedProductId;

              return (
                <div key={product.id}>
                  {index > 0 ? <div className="mx-3 h-px bg-stone-200/70" /> : null}
                  <button
                    type="button"
                    disabled={Boolean(blockReason)}
                    onClick={() => onSelect(product.id)}
                    onMouseEnter={() => void queryClient.prefetchQuery(productDetailsQueryOptions(product.id))}
                    onFocus={() => void queryClient.prefetchQuery(productDetailsQueryOptions(product.id))}
                    onTouchStart={() => void queryClient.prefetchQuery(productDetailsQueryOptions(product.id))}
                    className={cn(
                      "flex w-full items-start justify-between gap-3 rounded-xl px-3 py-3 text-left transition-colors duration-200",
                      active ? "bg-white text-stone-900 shadow-sm border border-stone-200" : "hover:bg-white/60",
                      blockReason && !active ? "cursor-not-allowed opacity-55" : ""
                    )}
                  >
                    <div className="min-w-0">
                      <p className={cn("truncate text-[13px] font-bold", active ? "text-stone-900" : "text-stone-800")}>{product.name}</p>
                      <p className="mt-1 text-[11px] font-semibold text-stone-500">
                        {buildProductSearchLabel(product)}
                      </p>
                      <p className="mt-1 text-[11px] font-semibold text-stone-400">
                        {blockReason ?? buildProductSupportMeta(product)}
                      </p>
                    </div>
                    {active ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-stone-900" /> : null}
                  </button>
                </div>
              );
            })
          ) : (
            <div className="px-3 py-6 text-center text-sm text-stone-500">No matching products found.</div>
          )}
      </div>
    </div>
  );
}

function LineEditor({
  line,
  products,
  onChange,
  onOpenQuickItem,
}: {
  line: BillingLineDraft;
  products: ProductSummary[];
  onChange: (next: Partial<BillingLineDraft>) => void;
  onOpenQuickItem: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: productDetails } = useQuery({
    queryKey: line.product_id ? productDetailsQueryKey(line.product_id) : ["inventory", "product-details", line.id],
    queryFn: line.product_id ? () => fetchProductDetails(line.product_id) : skipToken,
    enabled: Boolean(line.product_id),
    staleTime: 30 * 60 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    placeholderData: line.product_id
      ? () => queryClient.getQueryData<ProductDetails>(productDetailsQueryKey(line.product_id))
      : undefined,
  });

  const variants = useMemo(() => productDetails?.variants ?? [], [productDetails?.variants]);
  const selectedProduct = useMemo(
    () =>
      productDetails
        ? ({
            ...(products.find((product) => product.id === line.product_id) ?? {}),
            ...productDetails,
          } as ProductSummary)
        : products.find((product) => product.id === line.product_id) ?? null,
    [line.product_id, productDetails, products]
  );

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
    return variants.find((variant) => (variantStockMap.get(variant.id) ?? 0) > 0) ?? null;
  }, [variantStockMap, variants]);

  const selectedVariant = variants.find((variant) => variant.id === line.variant_id) ?? preferredVariant;
  const selectedProductBlockReason = getProductSaleBlockReason(selectedProduct);

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
  const productKindCopy = buildProductKindCopy(selectedProduct);
  const ProductKindIcon = productKindCopy?.icon ?? Package2;

  const [scanningField, setScanningField] = useState<"identifier" | "imei_1" | "imei_2" | null>(null);

  useEffect(() => {
    if (!selectedProduct || !productDetails) return;
    if (selectedProductBlockReason) return;

    const selectedVariantHasStock = line.variant_id
      ? (variantStockMap.get(line.variant_id) ?? 0) > 0
      : false;

    if (variants.length > 0 && (!line.variant_id || !variants.some((variant) => variant.id === line.variant_id) || !selectedVariantHasStock)) {
      const autoVariant = preferredVariant;
      const autoPrice = autoVariant
        ? (autoVariant.selling_price_override ?? selectedProduct.base_selling_price)
        : selectedProduct.base_selling_price;
      onChange({
        variant_id: autoVariant?.id ?? "",
        inventory_item_id: "",
        identifier_value: "",
        imei_1: "",
        imei_2: "",
        unit_price: String(autoPrice),
      });
    }
  }, [line.variant_id, onChange, preferredVariant, productDetails, selectedProduct, selectedProductBlockReason, variantStockMap, variants]);

  // Auto-fill price when it's still at the default "0" and we have product/variant info
  useEffect(() => {
    if (!selectedProduct) return;
    if (line.unit_price !== "0") return; // user already has a price set, don't override

    if (selectedVariant) {
      const price = selectedVariant.selling_price_override ?? selectedProduct.base_selling_price;
      onChange({ unit_price: String(price) });
    } else {
      onChange({ unit_price: String(selectedProduct.base_selling_price) });
    }
  }, [selectedProduct, selectedVariant, line.unit_price, onChange]);

  useEffect(() => {
    if (!selectedProduct) return;

    if ((selectedProduct.tracking_type === "SERIALIZED" || selectedProduct.product_kind === "MOBILE") && line.quantity !== "1") {
      onChange({ quantity: "1" });
    }

  }, [line.quantity, onChange, selectedProduct]);



  function adjustAccessoryQuantity(delta: 1 | -1) {
    if (!selectedProduct || selectedProduct.product_kind === "MOBILE") return;
    const currentQuantity = Number.parseInt(line.quantity || "1", 10) || 1;
    const nextQuantity = Math.max(1, Math.min(stockLeft || 1, currentQuantity + delta));
    onChange({ quantity: String(nextQuantity) });
  }

  return (
    <div className="space-y-4">
      {!selectedProduct ? (
        <div className="pt-2">
          <ProductPicker
            products={products}
            selectedProductId={line.product_id}
            onOpenQuickItem={onOpenQuickItem}
            onSelect={(productId) => {
              const nextProduct = products.find((product) => product.id === productId);
              onChange({
                line_type: "inventory",
                quick_item_name: "",
                product_id: productId,
                variant_id: "",
                inventory_item_id: "",
                identifier_value: "",
                imei_1: "",
                imei_2: "",
                quantity: "1",
                unit_price: nextProduct ? String(nextProduct.base_selling_price) : "0",
                discount_amount: "0",
              });
            }}
          />
        </div>
      ) : null}

      {selectedProduct ? (
        <div className="rounded-[1.3rem] border border-stone-200 bg-stone-50 overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-stone-200 bg-stone-100/50">
             <p className="text-xs font-bold uppercase tracking-[0.16em] text-stone-500">Selected Product</p>
             <button
               type="button"
               onClick={() => onChange({ line_type: "inventory", quick_item_name: "", product_id: "", variant_id: "", inventory_item_id: "", identifier_value: "", imei_1: "", imei_2: "", quantity: "1", unit_price: "0", discount_amount: "0" })}
               className="text-[11px] font-bold uppercase tracking-wider text-stone-500 transition-colors hover:text-stone-900 focus:outline-none"
             >
               Change
             </button>
          </div>
          <div className="px-4 py-4">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white border border-stone-200 text-stone-700 shadow-sm">
                <ProductKindIcon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-stone-900 leading-snug">{selectedProduct.name}</p>
                <div className="mt-1.5 flex items-center gap-2 text-xs font-semibold text-stone-500">
                  <span>{productKindCopy?.title}</span>
                  <span className="w-1 h-1 rounded-full bg-stone-300" />
                  <span className={`${selectedProduct.total_quantity > 0 ? "text-emerald-600" : "text-rose-500"}`}>{selectedProduct.total_quantity} in stock</span>
                </div>
              </div>
            </div>
            {selectedProductBlockReason ? (
              <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 shadow-sm">
                {selectedProductBlockReason}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {selectedProduct && productDetails && !selectedProductBlockReason ? (
        <>
          {variants.length > 0 ? (
            <div className="rounded-[1.3rem] border border-stone-200 bg-stone-50 overflow-hidden">
              <div className="px-4 py-3 border-b border-stone-200 bg-stone-100/50">
                 <p className="text-xs font-bold uppercase tracking-[0.16em] text-stone-500">Select Variant</p>
              </div>
              <div className="bg-white flex flex-col divide-y divide-stone-100">
                {variants.map((variant) => {
                  const stock = variantStockMap.get(variant.id) ?? 0;
                  const isActive = line.variant_id === variant.id;
                  const isDisabled = stock <= 0;
                  const priceOverride = variant.selling_price_override ?? selectedProduct.base_selling_price;
                  return (
                    <button
                      key={variant.id}
                      type="button"
                      disabled={isDisabled}
                      onClick={() => {
                        if (isDisabled) return;
                        onChange({ variant_id: variant.id, inventory_item_id: "", identifier_value: "", unit_price: String(priceOverride) });
                      }}
                      className={`flex w-full items-center justify-between px-4 py-3.5 text-left transition-colors duration-200 ${
                        isDisabled ? "cursor-not-allowed bg-stone-50/70 opacity-55" : "hover:bg-stone-50"
                      } ${isActive ? "bg-[#faf9f7]" : "bg-white"}`}
                    >
                      <div className="flex items-center gap-3 w-full">
                        <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${isActive ? "border-stone-900 bg-stone-900" : "border-stone-300"} ${isDisabled ? "border-stone-200 bg-stone-100" : ""}`}>
                          {isActive && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                        </div>
                        <span className={`text-[13px] font-bold leading-none ${isDisabled ? "text-stone-400" : isActive ? "text-stone-900" : "text-stone-700"}`}>
                          {[variant.color, variant.storage_label, variant.name].filter(Boolean).join(" - ") || "Default Option"}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                         <span className={`text-[13px] font-bold ${isDisabled ? "text-stone-400" : isActive ? "text-stone-900" : "text-stone-500"}`}>{money(Number(priceOverride))}</span>
                         <span className={`text-[11px] font-bold uppercase tracking-wider ${stock > 0 ? (isActive ? "text-emerald-600" : "text-emerald-600/70") : "text-rose-500"}`}>
                           {stock > 0 ? `(${stock})` : "(Out)"}
                         </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
          {variants.length > 0 && !preferredVariant ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 shadow-sm">
              All variants are out of stock for this product.
            </div>
          ) : null}

          <div className="rounded-[1.3rem] border border-stone-200 bg-stone-50 overflow-hidden">
             <div className="px-4 py-3 border-b border-stone-200 bg-stone-100/50">
               <p className="text-xs font-bold uppercase tracking-[0.16em] text-stone-500">Sale Details</p>
             </div>
             <div className="p-4 bg-white space-y-4">
                {selectedProduct.tracking_type === "SERIALIZED" ? (
                  <div className="space-y-4">
                    <Field label={selectedProduct.product_kind === "MOBILE" ? "Device IMEI" : "Device Serial"} required>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Input
                            value={line.identifier_value}
                            onChange={(e) => {
                              const val = e.target.value;
                              const matchedUnit = availableUnits.find(u => buildInventoryItemLabel(u) === val || u.identifiers?.some(id => id.identifier_value === val));
                              const nextVariantId = matchedUnit?.variant_id ?? line.variant_id;
                              const variantPrice = matchedUnit && nextVariantId 
                                ? (variants.find(v => v.id === nextVariantId)?.selling_price_override ?? selectedProduct.base_selling_price)
                                : Number(line.unit_price);

                              onChange({
                                identifier_value: val,
                                inventory_item_id: matchedUnit ? matchedUnit.id : "",
                                quantity: "1",
                                variant_id: nextVariantId,
                                unit_price: String(variantPrice)
                              });
                            }}
                            placeholder="Scan or enter exactly..."
                            className="rounded-xl border-stone-200 bg-stone-50"
                          />
                        </div>
                        <Button type="button" variant="outline" className="shrink-0 h-10 w-10 p-0 rounded-xl" onClick={() => setScanningField("identifier")}>
                          <ScanBarcode className="h-4 w-4" />
                        </Button>
                      </div>
                      {selectedUnit ? <p className="mt-2 text-xs font-semibold text-emerald-600">Matched in-stock device: {buildInventoryItemLabel(selectedUnit)}</p> : null}
                      {!selectedUnit && line.identifier_value ? <p className="mt-2 text-xs font-medium text-amber-600">Manual entry (Not mapped to inventory)</p> : null}
                    </Field>
                  </div>
                ) : (
                  <Field label="Quantity" required>
                    <QuantityStepper
                      value={selectedProduct.product_kind === "MOBILE" ? "1" : line.quantity}
                      disabled={selectedProduct.product_kind === "MOBILE"}
                      onDecrease={() => adjustAccessoryQuantity(-1)}
                      onIncrease={() => adjustAccessoryQuantity(1)}
                    />
                    <p className="mt-2 text-[11px] font-semibold text-stone-500">
                      {selectedProduct.product_kind === "MOBILE" ? "Mobile bills are added one device at a time." : `Available stock: ${stockLeft}`}
                    </p>
                  </Field>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <Field label="Unit Price">
                    <Input
                      type="number"
                      value={line.unit_price}
                      className="rounded-xl border-stone-100 bg-stone-100/50 text-stone-600 font-medium"
                      onChange={(e) => onChange({ unit_price: e.target.value })}
                    />
                  </Field>

                  <Field label="Discount">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.discount_amount}
                      className="rounded-xl border-stone-200 bg-stone-50"
                      onChange={(event) => onChange({ discount_amount: event.target.value })}
                    />
                  </Field>
                </div>
             </div>
          </div>

          {selectedProduct.product_kind === "MOBILE" ? (
            <div className="rounded-[1.3rem] border border-stone-200 bg-stone-50 overflow-hidden">
              <div className="px-4 py-3 border-b border-stone-200 bg-stone-100/50">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-stone-500">IMEI</p>
              </div>
              <div className="p-4 bg-white space-y-4">
                <Field label="IMEI 1" required>
                  <div className="flex gap-2">
                    <Input
                      value={line.imei_1}
                      inputMode="numeric"
                      placeholder="Enter or scan IMEI 1"
                      className="rounded-xl border-stone-200 bg-stone-50"
                      onChange={(event) => onChange({ imei_1: event.target.value.replace(/\D/g, "").slice(0, 15) })}
                    />
                    <button type="button" className="shrink-0 text-stone-900 transition hover:text-teal-700" onClick={() => setScanningField("imei_1")}>
                      <ScanBarcode className="h-6 w-6" />
                    </button>
                  </div>
                </Field>

                <Field label="IMEI 2">
                  <div className="flex gap-2">
                    <Input
                      value={line.imei_2}
                      inputMode="numeric"
                      placeholder="Enter or scan IMEI 2"
                      className="rounded-xl border-stone-200 bg-stone-50"
                      onChange={(event) => onChange({ imei_2: event.target.value.replace(/\D/g, "").slice(0, 15) })}
                    />
                    <button type="button" className="shrink-0 text-stone-900 transition hover:text-teal-700" onClick={() => setScanningField("imei_2")}>
                      <ScanBarcode className="h-6 w-6" />
                    </button>
                  </div>
                </Field>
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {selectedProduct && !productDetails && line.product_id ? (
        <div className="flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm text-stone-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading variants...
        </div>
      ) : null}

      {scanningField ? (
        <BarcodeScanner
          expectedType={scanningField === "identifier" ? "SERIAL" : "IMEI"}
          onClose={() => setScanningField(null)}
          onScan={(result) => {
            if (scanningField === "identifier") {
              const matchedUnit = availableUnits.find((u) => buildInventoryItemLabel(u) === result || u.identifiers?.some((id) => id.identifier_value === result));
              const nextVariantId = matchedUnit?.variant_id ?? line.variant_id;
              const variantPrice = matchedUnit && nextVariantId 
                ? (variants.find(v => v.id === nextVariantId)?.selling_price_override ?? selectedProduct?.base_selling_price ?? 0)
                : Number(line.unit_price);

              onChange({
                identifier_value: result,
                inventory_item_id: matchedUnit ? matchedUnit.id : "",
                quantity: "1",
                variant_id: nextVariantId,
                unit_price: String(variantPrice)
              });
            } else if (scanningField === "imei_1") {
              onChange({ imei_1: result });
            } else if (scanningField === "imei_2") {
              onChange({ imei_2: result });
            }
            setScanningField(null);
          }}
        />
      ) : null}
    </div>
  );
}

export function AddBillModal({
  open,
  onClose,
  products,
  shopLogoUrl,
  shopPostalCode,
  onInvoiceCreated,
  invoiceToEdit,
}: {
  open: boolean;
  onClose: () => void;
  products: ProductSummary[];
  shopLogoUrl?: string | null;
  shopPostalCode?: string | null;
  onInvoiceCreated?: (items: Array<{ product_id: string; variant_id: string | null; quantity: number }>) => void;
  invoiceToEdit?: BillingInvoiceSummary | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [currentStep, setCurrentStep] = useState<StepId>("customer");
  const [customer, setCustomer] = useState<CustomerDraft>({ name: "", mobile: "", billing_address: "", gst_number: "" });
  const [paymentDraft, setPaymentDraft] = useState<PaymentDraft>(createEmptyPaymentDraft());
  const [pendingPaymentDraft, setPendingPaymentDraft] = useState<PaymentDraft>(createEmptyPaymentDraft());
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<BillingLineDraft[]>([]);
  const [clientError, setClientError] = useState("");
  const [state, setState] = useState<ActionResponse>({ status: "success", message: "" });
  const [isProductDialogOpen, setIsProductDialogOpen] = useState(false);
  const [draftLine, setDraftLine] = useState<BillingLineDraft | null>(null);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [isQuickItemDialogOpen, setIsQuickItemDialogOpen] = useState(false);
  const [quickItemDraft, setQuickItemDraft] = useState<BillingLineDraft | null>(null);
  const [editingQuickLineId, setEditingQuickLineId] = useState<string | null>(null);
  const [closeProductDialogAfterQuickSave, setCloseProductDialogAfterQuickSave] = useState(false);
  const [draftSyncReady, setDraftSyncReady] = useState(false);
  const [showRestorePrompt, setShowRestorePrompt] = useState(false);
  const [savedDraft, setSavedDraft] = useState<StoredBillDraft | null>(null);
  const steps: StepId[] = ["customer", "products", "preview"];
  const stepIndex = steps.indexOf(currentStep);

  const queryClient = useQueryClient();

  // Prefetch product details for top products when modal opens (cached for 30 min)
  useEffect(() => {
    if (open && products.length > 0) {
      // Prefetch first 10 to avoid hammering server
      const toPrefetch = products.slice(0, 10);
      for (const product of toPrefetch) {
        queryClient.prefetchQuery({
          queryKey: productDetailsQueryKey(product.id),
          queryFn: () => fetchProductDetails(product.id),
          staleTime: 30 * 60 * 1000,
        });
      }
    }
  }, [open, products, queryClient]);

  useEffect(() => {
    if (!open) return;

    const timeoutId = window.setTimeout(() => {
      if (invoiceToEdit) {
        setDraftSyncReady(false);
        setShowRestorePrompt(false);
        setSavedDraft(null);
        setCustomer({
          name: invoiceToEdit.customer_name || "",
          mobile: invoiceToEdit.customer_mobile || "",
          billing_address: invoiceToEdit.billing_address || "",
          gst_number: invoiceToEdit.customer_gst_number || "",
        });
        setPaymentDraft({
          methods: (invoiceToEdit.payment_details?.methods as PaymentMethodChoice[]) || [invoiceToEdit.payment_method as PaymentMethodChoice],
          loan_provider: invoiceToEdit.payment_details?.loan_provider || "",
          loan_number: invoiceToEdit.payment_details?.loan_number || "",
        });
        setPendingPaymentDraft({
          methods: (invoiceToEdit.payment_details?.methods as PaymentMethodChoice[]) || [invoiceToEdit.payment_method as PaymentMethodChoice],
          loan_provider: invoiceToEdit.payment_details?.loan_provider || "",
          loan_number: invoiceToEdit.payment_details?.loan_number || "",
        });
        setNotes(invoiceToEdit.notes || "");
        setLines(
          (invoiceToEdit.invoice_items || []).map((item) => {
            const imeiParts = (item.identifier_snapshot || "").split(" • ").map(p => p.split(": ")[1] || p.trim());
            return {
              id: item.id,
              line_type: item.product_id ? "inventory" : "quick",
              is_free_gift: !item.product_id && Number(item.unit_price || 0) === 0,
              quick_item_name: item.product_id ? "" : item.product_name_snapshot,
              product_id: item.product_id || "",
              variant_id: item.variant_id || "",
              inventory_item_id: item.inventory_item_id || "",
              identifier_value: item.identifier_snapshot || "",
              imei_1: imeiParts[0] || "",
              imei_2: imeiParts[1] || "",
              quantity: String(item.quantity || "1"),
              unit_price: String(item.unit_price || "0"),
              discount_amount: String(item.discount_amount || "0"),
            };
          })
        );
        setCurrentStep("customer");
      } else {
        const existingDraft = readStoredBillDraft();
        setCustomer({ name: "", mobile: "", billing_address: "", gst_number: "" });
        setPaymentDraft(createEmptyPaymentDraft());
        setPendingPaymentDraft(createEmptyPaymentDraft());
        setNotes("");
        setLines([]);
        setCurrentStep("customer");
        setSavedDraft(existingDraft);
        setShowRestorePrompt(Boolean(existingDraft));
        setDraftSyncReady(!existingDraft);
      }
      setIsQuickItemDialogOpen(false);
      setQuickItemDraft(null);
      setEditingQuickLineId(null);
      setCloseProductDialogAfterQuickSave(false);
      setClientError("");
      setState({ status: "success", message: "" });
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [open, invoiceToEdit]);

  useEffect(() => {
    if (!open || invoiceToEdit || !draftSyncReady) return;

    const hasAnyContent =
      customer.name.trim() ||
      customer.mobile.trim() ||
      customer.billing_address.trim() ||
      customer.gst_number.trim() ||
      notes.trim() ||
      paymentDraft.methods.length > 0 ||
      lines.length > 0 ||
      currentStep !== "customer";

    if (!hasAnyContent) {
      clearStoredBillDraft();
      return;
    }

    const payload: StoredBillDraft = {
      version: 1,
      currentStep,
      customer,
      paymentDraft,
      notes,
      lines,
    };

    window.localStorage.setItem(BILL_DRAFT_STORAGE_KEY, JSON.stringify(payload));
  }, [currentStep, customer, draftSyncReady, invoiceToEdit, lines, notes, open, paymentDraft]);

  if (!open) return null;

  const preparedLines = lines
    .map((line) => {
      if (isQuickLine(line)) {
        const quantity = Number.parseInt(line.quantity || "1", 10) || 1;
        const unitPrice = Number.parseFloat(line.unit_price || "0") || 0;
        const discountAmount = Number.parseFloat(line.discount_amount || "0") || 0;
        const effectiveDiscountAmount = line.is_free_gift ? quantity * unitPrice : discountAmount;

        return {
          product_id: null,
          variant_id: null,
          inventory_item_id: null,
          product_name_snapshot: line.quick_item_name.trim(),
          brand_name_snapshot: null,
          category_name_snapshot: null,
          variant_name_snapshot: null,
          identifier_snapshot: null,
          quantity,
          unit_price: unitPrice,
          tax_rate: 0,
          discount_amount: effectiveDiscountAmount,
          line_total: computeLineTotal({
            quantity,
            unitPrice,
            discountAmount: effectiveDiscountAmount,
          }),
        };
      }

      const product = products.find((item) => item.id === line.product_id);
      if (!product) return null;
      const quantity = product.tracking_type === "SERIALIZED" || product.product_kind === "MOBILE" ? 1 : Number.parseInt(line.quantity || "1", 10) || 1;
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
        identifier_snapshot:
          product.product_kind === "MOBILE"
            ? buildMobileIdentifierSnapshot(line)
            : line.identifier_value || null,
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

  function openNewProductDialog() {
    setDraftLine(createLine());
    setEditingLineId(null);
    setClientError("");
    setIsProductDialogOpen(true);
  }

  function openQuickItemDialog(
    line: BillingLineDraft = createQuickLine(),
    options?: { editingLineId?: string | null; closeProductDialogOnSave?: boolean }
  ) {
    setQuickItemDraft(normalizeDraftLine({ ...line, line_type: "quick" }));
    setEditingQuickLineId(options?.editingLineId ?? null);
    setCloseProductDialogAfterQuickSave(Boolean(options?.closeProductDialogOnSave));
    setClientError("");
    setIsQuickItemDialogOpen(true);
  }

  function closeQuickItemDialog() {
    setQuickItemDraft(null);
    setEditingQuickLineId(null);
    setCloseProductDialogAfterQuickSave(false);
    setIsQuickItemDialogOpen(false);
    setClientError("");
  }

  function restoreSavedDraft() {
    if (!savedDraft) {
      setShowRestorePrompt(false);
      setDraftSyncReady(true);
      return;
    }

    setCustomer(savedDraft.customer);
    setPaymentDraft(savedDraft.paymentDraft);
    setPendingPaymentDraft(savedDraft.paymentDraft);
    setNotes(savedDraft.notes);
    setLines(savedDraft.lines.map((line) => normalizeDraftLine(line)));
    setCurrentStep(savedDraft.currentStep);
    setShowRestorePrompt(false);
    setDraftSyncReady(true);
    setSavedDraft(null);
  }

  function discardSavedDraft() {
    clearStoredBillDraft();
    setSavedDraft(null);
    setShowRestorePrompt(false);
    setDraftSyncReady(true);
  }

  function openEditProductDialog(lineId: string) {
    const existing = lines.find((line) => line.id === lineId);
    if (!existing) return;
    if (isQuickLine(existing)) {
      openQuickItemDialog(existing, { editingLineId: lineId });
      return;
    }
    setDraftLine({ ...existing });
    setEditingLineId(lineId);
    setClientError("");
    setIsProductDialogOpen(true);
  }

  function closeProductDialog() {
    setDraftLine(null);
    setEditingLineId(null);
    setIsProductDialogOpen(false);
  }

  function openPaymentModal() {
    setPendingPaymentDraft(paymentDraft);
    setClientError("");
    setIsPaymentModalOpen(true);
  }

  function togglePendingPaymentMethod(method: PaymentMethodChoice) {
    setPendingPaymentDraft((current) => {
      let methods: PaymentMethodChoice[];

      if (method === "LOAN") {
        methods = current.methods.includes("LOAN") ? [] : ["LOAN"];
      } else if (current.methods.includes("LOAN")) {
        methods = [method];
      } else if (current.methods.includes(method)) {
        methods = current.methods.filter((entry) => entry !== method);
      } else {
        methods = [...current.methods, method];
      }

      return {
        ...current,
        methods,
        loan_provider: methods.includes("LOAN") ? current.loan_provider : "",
        loan_number: methods.includes("LOAN") ? current.loan_number : "",
      };
    });
  }

  function savePaymentDraft() {
    if (pendingPaymentDraft.methods.length === 0) {
      setClientError("Add at least one payment method.");
      return;
    }

    if (pendingPaymentDraft.methods.includes("LOAN")) {
      if (!pendingPaymentDraft.loan_provider.trim()) {
        setClientError("Select a loan provider.");
        return;
      }
      if (!pendingPaymentDraft.loan_number.trim()) {
        setClientError("Enter the loan number.");
        return;
      }
    }

    setPaymentDraft(pendingPaymentDraft);
    setIsPaymentModalOpen(false);
    setClientError("");
  }

  function saveDraftLine() {
    if (!draftLine) return;
    const selectedProduct = products.find((item) => item.id === draftLine.product_id) ?? null;

    if (selectedProduct?.product_kind === "MOBILE" && !draftLine.imei_1.trim()) {
      setClientError("IMEI 1 is required for mobile products.");
      return;
    }

    if (!isLineComplete(draftLine, products)) {
      setClientError("Select the product and complete its sale details before adding it to the bill.");
      return;
    }

    setLines((current) => {
      if (editingLineId) {
        return current.map((line) => (line.id === editingLineId ? draftLine : line));
      }
      return [...current, draftLine];
    });

    setClientError("");
    closeProductDialog();
  }

  function saveQuickItemDraft() {
    if (!quickItemDraft) return;
    const shouldCloseProductDialog = closeProductDialogAfterQuickSave;

    if (!quickItemDraft.quick_item_name.trim()) {
      setClientError("Item name is required for a quick item.");
      return;
    }

    const quantity = Number.parseInt(quickItemDraft.quantity || "0", 10) || 0;
    if (quantity <= 0) {
      setClientError("Quantity must be at least 1.");
      return;
    }

    const unitPrice = Number.parseFloat(quickItemDraft.unit_price || "0");
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      setClientError("Enter a valid unit price.");
      return;
    }

    const discountAmount = Number.parseFloat(quickItemDraft.discount_amount || "0");
    if (!Number.isFinite(discountAmount) || discountAmount < 0) {
      setClientError("Enter a valid discount amount.");
      return;
    }

    const normalizedQuickItem = normalizeDraftLine({
      ...quickItemDraft,
      unit_price: quickItemDraft.unit_price,
      discount_amount: quickItemDraft.is_free_gift
        ? String((Number.parseInt(quickItemDraft.quantity || "1", 10) || 1) * (Number.parseFloat(quickItemDraft.unit_price || "0") || 0))
        : quickItemDraft.discount_amount,
    });

    setLines((current) => {
      if (editingQuickLineId) {
        return current.map((line) => (line.id === editingQuickLineId ? normalizedQuickItem : line));
      }
      return [...current, normalizedQuickItem];
    });

    setClientError("");
    closeQuickItemDialog();
    if (shouldCloseProductDialog) {
      closeProductDialog();
    }
  }

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
      if (!/^\d{10}$/.test(customer.mobile.trim())) {
        setClientError("Mobile number must be exactly 10 digits.");
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

      if (paymentDraft.methods.length === 0) {
        setClientError("Add the payment method before continuing.");
        return false;
      }

      const hasInvalidLine = lines.some((line) => !isLineComplete(line, products));

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
        payment_method: deriveInvoicePaymentMethod(paymentDraft),
        payment_details: {
          methods: paymentDraft.methods,
          loan_provider: paymentDraft.loan_provider || null,
          loan_number: paymentDraft.loan_number || null,
        },
        notes,
      })
    );
      if (invoiceToEdit) {
        formData.set(
          "invoice_payload",
          JSON.stringify({
            invoice_id: invoiceToEdit.id,
            customer,
            items: preparedLines,
            payment_method: deriveInvoicePaymentMethod(paymentDraft),
            payment_details: {
              methods: paymentDraft.methods,
              loan_provider: paymentDraft.loan_provider || null,
              loan_number: paymentDraft.loan_number || null,
            },
            notes,
          })
        );
      }

    startTransition(async () => {
      try {
        const result = invoiceToEdit 
          ? await updateInvoiceAction({ status: "success", message: "" }, formData)
          : await createInvoiceAction({ status: "success", message: "" }, formData);
        
        console.log("[Bill Submit] Server action result:", JSON.stringify(result, null, 2));
        setState(result);
        
        if (result.status === "success" && result.data) {
          setDraftSyncReady(false);
          clearStoredBillDraft();

          try {
            await downloadInvoicePdf({ 
              ...(result.data as Parameters<typeof downloadInvoicePdf>[0]), 
              shop_logo_url: shopLogoUrl ?? null,
              shop_postal_code: shopPostalCode ?? null,
            });
          } catch (pdfError) {
            console.error("[Bill Submit] PDF download failed:", pdfError);
            // PDF failed but invoice was created, still close
          }
          
          onInvoiceCreated?.(
            preparedLines.flatMap((line) =>
              line.product_id
                ? [{
                    product_id: line.product_id,
                    variant_id: line.variant_id,
                    quantity: line.quantity,
                  }]
                : []
            )
          );
          // Invalidate cached product details so stock numbers refresh
          for (const line of preparedLines) {
            if (!line.product_id) continue;
            queryClient.invalidateQueries({ queryKey: productDetailsQueryKey(line.product_id) });
          }
          onClose();
        } else if (result.status === "error") {
          console.error("[Bill Submit] Server returned error:", result.message);
        }
      } catch (err) {
        console.error("[Bill Submit] Uncaught error during submission:", err);
        setState({ 
          status: "error", 
          message: err instanceof Error ? err.message : "An unexpected error occurred. Check browser console for details." 
        });
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-stone-950/55 backdrop-blur-sm">
      <div className="fixed inset-x-0 bottom-0 top-0 mx-auto flex h-dvh max-w-[450px] flex-col overflow-hidden bg-[#fcfaf6] shadow-[0_30px_80px_rgba(15,23,42,0.18)]">
        <div className="grid grid-cols-[40px_1fr_40px] items-center border-b border-stone-200/80 bg-[#fffdf9] px-4 py-4 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            aria-label="Back"
            className="flex h-10 w-10 items-center justify-center text-stone-600 transition hover:text-stone-900"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h2 className="text-center text-lg font-semibold text-stone-950">Create Bill</h2>
          <div aria-hidden="true" className="h-10 w-10" />
        </div>

        <div className="sticky top-0 z-10 border-b border-stone-200/80 bg-[#fffdf9] px-4 py-3 sm:px-6">
          <Stepper steps={steps} currentStep={currentStep} onStepChange={handleStepChange} />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          {showRestorePrompt ? (
            <div className="mb-4 rounded-[1.3rem] border border-sky-200 bg-sky-50 px-4 py-4 shadow-sm">
              <p className="text-sm font-semibold text-sky-950">Restore saved bill draft?</p>
              <p className="mt-1 text-xs font-medium text-sky-800">
                We found an unfinished bill on this device. You can restore it or start fresh.
              </p>
              <div className="mt-4 flex items-center justify-end gap-2">
                <Button type="button" variant="ghost" onClick={discardSavedDraft} className="text-sky-800 hover:text-sky-950">
                  Start Fresh
                </Button>
                <Button type="button" onClick={restoreSavedDraft} className="bg-sky-700 text-white hover:bg-sky-800">
                  Restore Draft
                </Button>
              </div>
            </div>
          ) : null}

          {currentStep === "customer" ? (
            <section className="space-y-4 py-2">
              <StepTitle step={1} title="Customer Info" />
              <Field label="Customer Name" required>
                <Input value={customer.name} onChange={(event) => setCustomer((current) => ({ ...current, name: event.target.value }))} />
              </Field>
              <Field label="Mobile Number" required>
                <Input
                  value={customer.mobile}
                  inputMode="numeric"
                  maxLength={10}
                  onChange={(event) => {
                    const digitsOnly = event.target.value.replace(/\D/g, "").slice(0, 10);
                    setCustomer((current) => ({ ...current, mobile: digitsOnly }));
                  }}
                />
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
              <StepTitle step={2} title="Products" />

              {lines.length > 0 ? (
                <div className="space-y-3">
                  {lines.map((line, index) => {
                    const isQuickItem = isQuickLine(line);
                    const product = isQuickItem ? null : products.find((item) => item.id === line.product_id) ?? null;
                    const variant = product?.variants?.find((item) => item.id === line.variant_id) ?? null;
                    const quantity =
                      product?.tracking_type === "SERIALIZED" || product?.product_kind === "MOBILE"
                        ? 1
                        : Number.parseInt(line.quantity || "1", 10) || 1;
                    const unitPrice = Number.parseFloat(line.unit_price || "0") || 0;
                    const discountAmount = Number.parseFloat(line.discount_amount || "0") || 0;
                    const lineTotal = computeLineTotal({ quantity, unitPrice, discountAmount });

                    return (
                      <div key={line.id} className="rounded-[1.3rem] border border-stone-200 bg-stone-50 overflow-hidden shadow-sm transition-all duration-200 hover:shadow-md hover:border-stone-300">
                        <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-stone-200 bg-stone-100/50">
                          <div className="flex items-center gap-2">
                             <div className="flex h-5 w-5 items-center justify-center rounded-full bg-stone-900 text-[10px] font-bold text-white shadow-sm ring-2 ring-stone-900/10">
                               {index + 1}
                             </div>
                             <span className="text-[11px] font-bold uppercase tracking-widest text-stone-500">
                               {isQuickItem ? "Quick Item" : "Item Selected"}
                             </span>
                           </div>
                           <div className="flex items-center gap-1">
                             <button type="button" className="p-1 text-stone-900 transition hover:text-teal-700" onClick={() => openEditProductDialog(line.id)}>
                               <Pencil className="h-4 w-4" />
                             </button>
                             <button
                               type="button"
                               className="p-1 text-rose-700 transition hover:text-rose-800"
                               onClick={() => setLines((current) => current.filter((item) => item.id !== line.id))}
                             >
                               <Trash2 className="h-4 w-4" />
                             </button>
                           </div>
                        </div>

                        <div className="px-4 py-4 bg-white">
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-bold text-stone-900 leading-snug">
                                {isQuickItem ? line.quick_item_name || "Quick item" : product?.name ?? "Incomplete item"}
                              </p>
                              {variant ? <p className="mt-1 text-[13px] font-semibold text-stone-500">{buildVariantLabel(variant)}</p> : null}
                              {product?.product_kind === "MOBILE" ? (
                                <div className="mt-2 space-y-1 text-xs text-stone-500">
                                  {line.imei_1 ? <p>IMEI 1: {line.imei_1}</p> : null}
                                  {line.imei_2 ? <p>IMEI 2: {line.imei_2}</p> : null}
                                </div>
                              ) : line.identifier_value ? (
                                <p className="mt-1 text-[13px] font-semibold text-stone-500">{line.identifier_value}</p>
                              ) : null}
                              <div className="mt-3 flex flex-wrap gap-2">
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-stone-100 text-stone-700 tabular-nums">Qty {quantity}</span>
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-amber-50 text-amber-700 tabular-nums">Rate {money(unitPrice)}</span>
                                {discountAmount > 0 ? (
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-700 tabular-nums">
                                    Discount {money(discountAmount)}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                            <div className="shrink-0 flex flex-col items-end justify-center">
                              <span className="text-[10px] uppercase font-bold tracking-wider text-stone-400 mb-1">Total</span>
                              <span className="text-base font-black text-stone-900 tabular-nums">{money(lineTotal)}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-[1.3rem] border border-stone-200 bg-stone-50 overflow-hidden shadow-sm">
                  <div className="flex items-center justify-between gap-3 border-b border-stone-200 bg-stone-100/50 px-4 py-2.5">
                    <span className="text-[11px] font-bold uppercase tracking-widest text-stone-500">Items</span>
                  </div>
                  <div className="space-y-4 bg-white px-4 py-5">
                    <div className="text-center">
                      <p className="text-sm font-semibold text-stone-900">No products added yet.</p>
                      <p className="mt-1 text-xs font-medium text-stone-500">Tap Add Product to search and add items to the bill.</p>
                    </div>
                    <Button type="button" variant="secondary" onClick={openNewProductDialog} className="w-full rounded-2xl">
                      <Plus className="h-4 w-4" />
                      Add Product
                    </Button>
                  </div>
                </div>
              )}

              {lines.length > 0 ? (
                <Button type="button" variant="secondary" onClick={openNewProductDialog} className="w-full rounded-2xl">
                  <Plus className="h-4 w-4" />
                  Add Product
                </Button>
              ) : null}

              <div className="rounded-[1.3rem] border border-stone-200 bg-stone-50 overflow-hidden shadow-sm">
                <div className="flex items-center justify-between gap-3 border-b border-stone-200 bg-stone-100/50 px-4 py-2.5">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-stone-500">Payment Method</span>
                  {paymentDraft.methods.length > 0 ? (
                    <button
                      type="button"
                      onClick={openPaymentModal}
                      className="text-sm font-semibold text-teal-700 transition hover:text-teal-800"
                    >
                      Edit
                    </button>
                  ) : null}
                </div>
                <div className="bg-white px-4 py-4">
                  {paymentDraft.methods.length > 0 ? (
                    <div className="space-y-1.5">
                      <p className="text-sm font-semibold text-stone-900">{buildPaymentSummary(paymentDraft)}</p>
                      {paymentDraft.loan_provider ? <p className="text-xs font-medium text-stone-500">Provider: {paymentDraft.loan_provider}</p> : null}
                      {paymentDraft.loan_number ? <p className="text-xs font-medium text-stone-500">Loan No: {paymentDraft.loan_number}</p> : null}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <p className="text-sm font-semibold text-stone-900">No payment method added yet.</p>
                        <p className="mt-1 text-xs font-medium text-stone-500">Add how this bill is being paid before moving to preview.</p>
                      </div>
                      <Button type="button" variant="outline" onClick={openPaymentModal} className="w-full rounded-2xl">
                        Add Payment Method
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </section>
          ) : null}

          {currentStep === "preview" ? (
            <section className="space-y-4 py-2">
              <StepTitle step={3} title="Preview" />
              <PreviewCard title="Customer Details" actionLabel="Edit" onAction={() => setCurrentStep("customer")}>
                <div>
                  <PreviewField label="Customer" value={customer.name} />
                  <PreviewField label="Mobile" value={customer.mobile || "Not provided"} />
                  <PreviewField label="Address" value={customer.billing_address || "Not provided"} />
                  <PreviewField label="GST" value={customer.gst_number || "Not provided"} isLast />
                </div>
              </PreviewCard>

              <PreviewCard title="Payment Method" actionLabel="Edit" onAction={openPaymentModal}>
                <div className="space-y-1.5">
                  <p className="text-sm font-semibold text-stone-900">{buildPaymentSummary(paymentDraft)}</p>
                  {paymentDraft.loan_provider ? <p className="text-xs font-medium text-stone-500">Provider: {paymentDraft.loan_provider}</p> : null}
                  {paymentDraft.loan_number ? <p className="text-xs font-medium text-stone-500">Loan No: {paymentDraft.loan_number}</p> : null}
                </div>
              </PreviewCard>

              <PreviewCard title="Items" actionLabel="Edit" onAction={() => setCurrentStep("products")}>
                <div>
                  {preparedLines.map((line, index) => (
                    <div key={`${line.product_id}-${index}`}>
                      {index > 0 ? <div className="mx-1 h-px bg-stone-100" /> : null}
                      <div className="py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-stone-900 leading-snug">{line.product_name_snapshot}</p>
                            {line.variant_name_snapshot ? <p className="mt-1 text-[13px] font-semibold text-stone-500">{line.variant_name_snapshot}</p> : null}
                            {buildPreviewIdentifierLines(line.identifier_snapshot).length > 0 ? (
                              <div className="mt-1.5 space-y-0.5">
                                {buildPreviewIdentifierLines(line.identifier_snapshot).map((identifier) => (
                                  <p key={identifier} className="text-xs font-medium text-stone-500">{identifier}</p>
                                ))}
                              </div>
                            ) : null}
                            <div className="mt-2.5 flex flex-wrap gap-2">
                              <span className="inline-flex items-center rounded-md bg-stone-100 px-2.5 py-0.5 text-[11px] font-bold text-stone-700 tabular-nums">Qty {line.quantity}</span>
                              <span className="inline-flex items-center rounded-md bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-700 tabular-nums">Rate {money(line.unit_price)}</span>
                            </div>
                          </div>
                          <div className="flex shrink-0 flex-col items-end justify-center">
                            <span className="mb-1 text-[10px] font-bold uppercase tracking-wider text-stone-400">Total</span>
                            <span className="text-base font-black text-stone-900 tabular-nums">{money(line.line_total)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </PreviewCard>

              <PreviewCard title="Totals">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm text-stone-700"><span>Subtotal</span><span>{money(totals.subtotal)}</span></div>
                  <div className="flex items-center justify-between text-sm text-stone-700"><span>Discount</span><span>{money(totals.discount)}</span></div>
                  <div className="flex items-center justify-between pt-1 text-base font-semibold text-stone-950"><span>Total</span><span>{money(totals.total)}</span></div>
                </div>
              </PreviewCard>

              <PreviewCard title="Notes" compactContent>
                <Textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  className="min-h-[100px] rounded-none border-0 bg-transparent px-0 py-0 shadow-none focus-visible:ring-0 text-sm text-stone-800 placeholder:text-stone-400 resize-none"
                  placeholder="Add bill notes..."
                />
              </PreviewCard>
            </section>
          ) : null}

          {clientError ? <p className="mt-3 text-sm text-rose-600">{clientError}</p> : null}
          {state.status === "error" && state.message ? <p className="mt-3 text-sm text-rose-600">{state.message}</p> : null}
        </div>

        <div className="border-t border-stone-200/80 bg-[#fffdf9]">
          <div className="border-b border-emerald-200/80 bg-emerald-50 px-4 py-2 sm:px-6">
            <div className="flex items-start gap-2">
              <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-700" />
              <p className="text-[12px] font-medium leading-5 text-emerald-900">{getStepHint(currentStep, preparedLines.length)}</p>
            </div>
          </div>

          <div className="flex items-center justify-between px-4 py-4 sm:px-6">
            <Button type="button" variant="ghost" onClick={stepIndex <= 0 ? onClose : () => moveStep(-1)} disabled={isPending}>
              <ChevronLeft className="h-4 w-4" />
              {stepIndex <= 0 ? "Close" : "Back"}
            </Button>
            {currentStep === "preview" ? (
              <Button type="button" onClick={submitInvoice} disabled={isPending || preparedLines.length === 0}>
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save & Download PDF
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

      {isPaymentModalOpen ? (
        <div className="fixed inset-0 z-[60] bg-stone-950/50 px-4 py-6 backdrop-blur-sm">
          <div className="mx-auto flex h-auto max-h-[88vh] w-full max-w-[500px] flex-col overflow-hidden rounded-[2.2rem] bg-stone-100 shadow-[0_30px_80px_rgba(15,23,42,0.22)] border border-stone-200">
            <div className="flex items-center justify-between bg-stone-100/80 px-6 py-5 backdrop-blur-md z-10">
              <div>
                <h3 className="text-[17px] font-black tracking-tight text-stone-900">Payment Method</h3>
                <p className="mt-1 text-[13px] font-semibold text-stone-500">Choose how this bill is being paid.</p>
              </div>
              <button type="button" onClick={() => setIsPaymentModalOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-200/60 text-stone-500 transition-colors duration-200 hover:bg-stone-300 hover:text-stone-900">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-8 pt-2">
              <div className="space-y-4">
                <div className="rounded-[1.3rem] border border-stone-200 bg-stone-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-stone-200 bg-stone-100/50">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-stone-500">Select Method</p>
                  </div>
                  <div className="bg-white p-4">
                    <div className="flex flex-wrap gap-2">
                      {PAYMENT_METHOD_OPTIONS.map((option) => {
                        const active = pendingPaymentDraft.methods.includes(option.id);
                        return (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => togglePendingPaymentMethod(option.id)}
                            className={cn(
                              "rounded-full px-4 py-2.5 text-sm font-bold transition-all duration-200",
                              active ? "bg-stone-900 text-white shadow-sm" : "bg-stone-100 text-stone-600 hover:bg-stone-200 hover:text-stone-800"
                            )}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {pendingPaymentDraft.methods.includes("LOAN") ? (
                  <LoanProviderPicker
                    value={pendingPaymentDraft.loan_provider}
                    loanNumber={pendingPaymentDraft.loan_number}
                    onProviderChange={(value) => setPendingPaymentDraft((current) => ({ ...current, loan_provider: value }))}
                    onLoanNumberChange={(value) => setPendingPaymentDraft((current) => ({ ...current, loan_number: value }))}
                  />
                ) : null}
              </div>
            </div>

            {clientError ? <p className="mx-5 mb-2 text-sm font-medium text-rose-600">{clientError}</p> : null}

            <div className="flex items-center justify-between border-t border-stone-200/80 bg-white px-5 py-4 shrink-0">
              <Button type="button" variant="ghost" onClick={() => setIsPaymentModalOpen(false)} className="font-bold text-stone-500 hover:text-stone-800">
                Cancel
              </Button>
              <Button type="button" onClick={savePaymentDraft} className="px-6 rounded-xl font-bold bg-stone-900 hover:bg-stone-800 transition-all shadow-sm">
                Save
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {isProductDialogOpen && draftLine ? (
        <div className="fixed inset-0 z-[60] bg-stone-950/50 px-4 py-6 backdrop-blur-sm">
          <div className="mx-auto flex h-[92vh] max-h-[850px] w-full max-w-[500px] flex-col overflow-hidden rounded-[2.2rem] bg-stone-100 shadow-[0_30px_80px_rgba(15,23,42,0.22)] border border-stone-200">
            <div className="flex items-center justify-between bg-stone-100/80 px-6 py-5 backdrop-blur-md z-10">
              <div>
                <h3 className="text-[17px] font-black tracking-tight text-stone-900">{editingLineId ? "Edit Item Setup" : "Add Bill Item"}</h3>
                <p className="mt-1 text-[13px] font-semibold text-stone-500">Select specifications before adding to cart.</p>
              </div>
              <button type="button" onClick={closeProductDialog} className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-200/60 text-stone-500 transition-colors duration-200 hover:bg-stone-300 hover:text-stone-900">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-8 pt-2">
              <LineEditor
                key={draftLine.id}
                line={draftLine}
                products={products}
                onOpenQuickItem={() => openQuickItemDialog(createQuickLine(), { closeProductDialogOnSave: true })}
                onChange={(next) => setDraftLine((current) => (current ? { ...current, ...next } : current))}
              />
            </div>

            <div className="flex items-center justify-between border-t border-stone-200/80 bg-white px-5 py-4 shrink-0 transition-opacity">
              {clientError ? <p className="mr-3 flex-1 text-sm font-medium text-rose-600">{clientError}</p> : <div className="flex-1" />}
              <Button type="button" variant="ghost" onClick={closeProductDialog} className="font-bold text-stone-500 hover:text-stone-800">
                Cancel
              </Button>
              <Button type="button" onClick={saveDraftLine} className="px-6 rounded-xl font-bold bg-stone-900 hover:bg-stone-800 transition-all shadow-sm">
                {editingLineId ? "Update Requirements" : "Add to Cart"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {isQuickItemDialogOpen && quickItemDraft ? (
        <div className="fixed inset-0 z-[70] bg-stone-950/55 px-4 py-6 backdrop-blur-sm">
          <div className="mx-auto flex h-auto max-h-[88vh] w-full max-w-[460px] flex-col overflow-hidden rounded-[2.2rem] border border-stone-200 bg-stone-100 shadow-[0_30px_80px_rgba(15,23,42,0.22)]">
            <div className="flex items-center justify-between bg-stone-100/80 px-6 py-5">
              <div>
                <h3 className="text-[17px] font-black tracking-tight text-stone-900">
                  {editingQuickLineId ? "Edit Quick Item" : "Add Quick Item"}
                </h3>
                <p className="mt-1 text-[13px] font-semibold text-stone-500">
                  Add a bill-only item without creating inventory.
                </p>
              </div>
              <button
                type="button"
                onClick={closeQuickItemDialog}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-200/60 text-stone-500 transition-colors duration-200 hover:bg-stone-300 hover:text-stone-900"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 overflow-y-auto px-5 pb-6 pt-2">
              <button
                type="button"
                onClick={() =>
                  setQuickItemDraft((current) =>
                    current
                      ? {
                          ...current,
                          is_free_gift: !current.is_free_gift,
                          unit_price: current.unit_price,
                          discount_amount: current.is_free_gift
                            ? "0"
                            : String((Number.parseInt(current.quantity || "1", 10) || 1) * (Number.parseFloat(current.unit_price || "0") || 0)),
                        }
                      : current
                  )
                }
                className={cn(
                  "w-full overflow-hidden rounded-[1.35rem] border text-left transition-all duration-200",
                  isQuickGiftLine(quickItemDraft)
                    ? "border-amber-200 bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 shadow-[0_12px_30px_rgba(251,191,36,0.18)]"
                    : "border-stone-200 bg-white hover:border-amber-200 hover:bg-amber-50/40"
                )}
              >
                <div className="flex items-center gap-3 px-4 py-4">
                  <div
                    className={cn(
                      "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border",
                      isQuickGiftLine(quickItemDraft)
                        ? "border-amber-200 bg-white text-amber-600"
                        : "border-stone-200 bg-stone-50 text-stone-500"
                    )}
                  >
                    <Gift className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-stone-950">Free Gift</p>
                      {isQuickGiftLine(quickItemDraft) ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
                          Active
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs font-medium text-stone-600">
                      Perfect for a complimentary tempered glass, cover, or bonus accessory.
                    </p>
                  </div>
                  <div
                    className={cn(
                      "relative h-7 w-12 rounded-full transition",
                      isQuickGiftLine(quickItemDraft) ? "bg-emerald-500" : "bg-stone-300"
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-all",
                        isQuickGiftLine(quickItemDraft) ? "left-6" : "left-1"
                      )}
                    />
                  </div>
                </div>
              </button>

              <div className="rounded-[1.3rem] border border-stone-200 bg-white p-4">
                <Field label="Item Name" required>
                  <Input
                    value={quickItemDraft.quick_item_name}
                    onChange={(event) =>
                      setQuickItemDraft((current) => (current ? { ...current, quick_item_name: event.target.value } : current))
                    }
                    placeholder="Tempered glass, service charge, cover..."
                    className="rounded-xl border-stone-200 bg-stone-50"
                  />
                </Field>

                <div className="mt-4 grid grid-cols-2 gap-4">
                  <Field label="Quantity" required>
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      value={quickItemDraft.quantity}
                      onChange={(event) =>
                        setQuickItemDraft((current) => (current ? { ...current, quantity: event.target.value } : current))
                      }
                      className="rounded-xl border-stone-200 bg-stone-50"
                    />
                  </Field>
                  <Field label="Price" required>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={quickItemDraft.unit_price}
                      disabled={isQuickGiftLine(quickItemDraft)}
                      onChange={(event) =>
                        setQuickItemDraft((current) => (current ? { ...current, unit_price: event.target.value } : current))
                      }
                      className={cn(
                        "rounded-xl border-stone-200",
                        isQuickGiftLine(quickItemDraft)
                          ? "bg-emerald-50 font-semibold text-emerald-700"
                          : "bg-stone-50"
                      )}
                    />
                  </Field>
                </div>

                {isQuickGiftLine(quickItemDraft) ? (
                  <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
                      <Gift className="h-4 w-4" />
                      Happy customer moment
                    </div>
                    <p className="mt-1 text-xs font-medium text-emerald-700">
                      The selling price stays visible, and a full 100% discount is applied so the customer sees the gift value.
                    </p>
                  </div>
                ) : null}

                <div className="mt-4">
                  <Field label="Discount">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={quickItemDraft.discount_amount}
                      disabled={isQuickGiftLine(quickItemDraft)}
                      onChange={(event) =>
                        setQuickItemDraft((current) => (current ? { ...current, discount_amount: event.target.value } : current))
                      }
                      className={cn(
                        "rounded-xl border-stone-200",
                        isQuickGiftLine(quickItemDraft)
                          ? "bg-stone-100 text-stone-400"
                          : "bg-stone-50"
                      )}
                    />
                  </Field>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-stone-200/80 bg-white px-5 py-4 shrink-0">
              {clientError ? <p className="mr-3 flex-1 text-sm font-medium text-rose-600">{clientError}</p> : <div className="flex-1" />}
              <Button type="button" variant="ghost" onClick={closeQuickItemDialog} className="font-bold text-stone-500 hover:text-stone-800">
                Cancel
              </Button>
              <Button type="button" onClick={saveQuickItemDraft} className="px-6 rounded-xl font-bold bg-stone-900 hover:bg-stone-800 transition-all shadow-sm">
                {editingQuickLineId ? "Update Item" : "Add to Cart"}
              </Button>
            </div>
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

function PreviewCard({
  title,
  children,
  actionLabel,
  onAction,
  compactContent,
}: {
  title: string;
  children: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  compactContent?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-[1.3rem] border border-stone-200 bg-stone-50 shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-stone-200 bg-stone-100/50 px-4 py-2.5">
        <span className="text-[11px] font-bold uppercase tracking-widest text-stone-500">{title}</span>
        {actionLabel && onAction ? (
          <button type="button" onClick={onAction} className="text-sm font-semibold text-teal-700 transition hover:text-teal-800">
            {actionLabel}
          </button>
        ) : null}
      </div>
      <div className={cn("bg-white", compactContent ? "px-3 py-3" : "px-4 py-4")}>{children}</div>
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

function QuantityStepper({
  value,
  disabled,
  onDecrease,
  onIncrease,
}: {
  value: string;
  disabled?: boolean;
  onDecrease: () => void;
  onIncrease: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-stone-50 p-2">
      <button
        type="button"
        disabled={disabled}
        onClick={onDecrease}
        className={cn(
          "flex h-11 w-11 items-center justify-center rounded-xl transition",
          disabled ? "bg-stone-100 text-stone-300" : "bg-white text-stone-900 hover:bg-stone-100"
        )}
      >
        -
      </button>
      <div className="flex-1 text-center text-lg font-semibold text-stone-900">{value}</div>
      <button
        type="button"
        disabled={disabled}
        onClick={onIncrease}
        className={cn(
          "flex h-11 w-11 items-center justify-center rounded-xl transition",
          disabled ? "bg-stone-100 text-stone-300" : "bg-white text-stone-900 hover:bg-stone-100"
        )}
      >
        +
      </button>
    </div>
  );
}

function LoanProviderPicker({
  value,
  loanNumber,
  onProviderChange,
  onLoanNumberChange,
}: {
  value: string;
  loanNumber: string;
  onProviderChange: (value: string) => void;
  onLoanNumberChange: (value: string) => void;
}) {
  const [query, setQuery] = useState(value);
  const filteredProviders = useMemo(
    () =>
      LOAN_PROVIDER_OPTIONS.filter((provider) =>
        provider.toLowerCase().includes(query.trim().toLowerCase())
      ),
    [query]
  );

  useEffect(() => {
    setQuery(value);
  }, [value]);

  return (
    <div className="rounded-[1.3rem] border border-stone-200 bg-stone-50 overflow-hidden">
      <div className="px-4 py-3 border-b border-stone-200 bg-stone-100/50">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-stone-500">Loan Details</p>
      </div>
      <div className="bg-white">
        <div className="p-4 pb-3">
          <Label className="text-sm font-medium text-stone-700">Loan Provider</Label>
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search loan provider" className="mt-2 rounded-xl border-stone-200 bg-stone-50" />
        </div>

        <div className="max-h-52 overflow-y-auto">
          {filteredProviders.map((provider, index) => {
            const isSelected = value === provider;
            return (
              <div key={provider}>
                {index > 0 ? <div className="mx-4 h-px bg-stone-100" /> : null}
                <button
                  type="button"
                  onClick={() => {
                    setQuery(provider);
                    onProviderChange(provider);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between px-4 py-3 text-left text-[13px] font-semibold transition-colors duration-200",
                    isSelected ? "text-stone-900" : "text-stone-600 hover:bg-stone-50"
                  )}
                >
                  <span>{provider}</span>
                  {isSelected ? <Check className="h-4 w-4 shrink-0 text-stone-900" /> : null}
                </button>
              </div>
            );
          })}
          {filteredProviders.length === 0 ? (
            <div className="px-4 py-4 text-center text-sm text-stone-400">No providers found.</div>
          ) : null}
        </div>

        <div className="border-t border-stone-200 p-4">
          <Field label="Loan Number" required>
            <Input value={loanNumber} onChange={(event) => onLoanNumberChange(event.target.value)} placeholder="Enter loan number" className="rounded-xl border-stone-200 bg-stone-50" />
          </Field>
        </div>
      </div>
    </div>
  );
}

function PreviewField({ label, value, isLast }: { label: string; value: string; isLast?: boolean }) {
  return (
    <div className={isLast ? "" : "border-b border-stone-100"}>
      <div className="flex items-baseline justify-between gap-3 py-3">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-stone-400 shrink-0">{label}</p>
        <p className="text-sm font-semibold text-stone-900 text-right">{value}</p>
      </div>
    </div>
  );
}
