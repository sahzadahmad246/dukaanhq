"use client";

import { skipToken, useQuery } from "@tanstack/react-query";
import { Check, ChevronLeft, ChevronRight, Loader2, Plus, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Product } from "@/lib/types/inventory";
import { cn } from "@/lib/utils";
import { createInvoiceAction } from "../actions";
import { fetchProductDetails, productDetailsQueryKey } from "@/app/inventory/queries";
import type { ActionResponse } from "@/app/inventory/actions";
import { printInvoice } from "./invoice-print";

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
  return [variant.name, variant.color, variant.storage_label].filter(Boolean).join(" / ") || "Default";
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

function LineEditor({
  line,
  products,
  onChange,
  onRemove,
}: {
  line: BillingLineDraft;
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

  const variants = productDetails?.variants ?? [];
  const selectedVariant = variants.find((variant) => variant.id === line.variant_id) ?? null;
  const availableUnits = (productDetails?.inventory_items ?? []).filter((item) => {
    if (item.status !== "IN_STOCK") return false;
    if (!line.variant_id) return true;
    return item.variant_id === line.variant_id;
  });

  useEffect(() => {
    if (selectedProduct && line.unit_price === "0") {
      onChange({
        unit_price: String(selectedProduct.base_selling_price),
      });
    }
  }, [line.unit_price, onChange, selectedProduct]);

  return (
    <div className="space-y-3 rounded-2xl border border-stone-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-stone-900">Product Line</p>
        <Button type="button" variant="ghost" className="h-8 px-2 text-rose-600 hover:bg-rose-50" onClick={onRemove}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <Field label="Product" required>
        <Select
          value={line.product_id}
          onChange={(event) => {
            const nextProduct = products.find((product) => product.id === event.target.value);
            onChange({
              product_id: event.target.value,
              variant_id: "",
              inventory_item_id: "",
              identifier_value: "",
              quantity: "1",
              unit_price: nextProduct ? String(nextProduct.base_selling_price) : "0",
            });
          }}
        >
          <option value="">Select product</option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {[product.brand?.name, product.name].filter(Boolean).join(" ")}
            </option>
          ))}
        </Select>
      </Field>

      {selectedProduct && variants.length > 0 ? (
        <Field label="Variant">
          <Select value={line.variant_id} onChange={(event) => onChange({ variant_id: event.target.value, inventory_item_id: "" })}>
            <option value="">Select variant</option>
            {variants.map((variant) => (
              <option key={variant.id} value={variant.id}>
                {buildVariantLabel(variant)}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      {selectedProduct?.tracking_type === "SERIALIZED" ? (
        <Field label={selectedProduct.product_kind === "MOBILE" ? "IMEI / Device" : "Serial / Device"} required>
          <Select
            value={line.inventory_item_id}
            onChange={(event) => {
              const unit = availableUnits.find((item) => item.id === event.target.value);
              onChange({
                inventory_item_id: event.target.value,
                identifier_value: unit?.serial_number ?? "",
                quantity: "1",
              });
            }}
          >
            <option value="">Select stock unit</option>
            {availableUnits.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.serial_number}
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        <Field label="Quantity" required>
          <Input type="number" min="1" value={line.quantity} onChange={(event) => onChange({ quantity: event.target.value })} />
        </Field>
      )}

      <Field label="Unit Price" required>
        <Input type="number" min="0" step="0.01" value={line.unit_price} onChange={(event) => onChange({ unit_price: event.target.value })} />
      </Field>

      <Field label="Discount">
        <Input type="number" min="0" step="0.01" value={line.discount_amount} onChange={(event) => onChange({ discount_amount: event.target.value })} />
      </Field>

      {selectedVariant ? (
        <p className="text-xs text-stone-500">
          Selected: {buildVariantLabel(selectedVariant)}
        </p>
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
  onInvoiceCreated?: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [currentStep, setCurrentStep] = useState<StepId>("customer");
  const [customer, setCustomer] = useState<CustomerDraft>({ name: "", mobile: "", billing_address: "", gst_number: "" });
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "CARD" | "UPI" | "BANK_TRANSFER" | "OTHER">("CASH");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<BillingLineDraft[]>([createLine()]);
  const [clientError, setClientError] = useState("");
  const [state, setState] = useState<ActionResponse>({ status: "success", message: "" });
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
      if (!line) return acc;
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
      if (product.tracking_type === "SERIALIZED") {
          return !line.inventory_item_id;
      }
        return !line.variant_id || !line.quantity;
      });
      if (hasInvalidLine) {
        setClientError("Complete all selected product lines before continuing.");
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
        onInvoiceCreated?.();
        onClose();
      }
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
                <StepTitle step={2} title="Product Info" />
                <Button type="button" variant="secondary" onClick={() => setLines((current) => [...current, createLine()])}>
                  <Plus className="h-4 w-4" />
                  Add Product
                </Button>
              </div>

              <Field label="Payment Method">
                <Select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as typeof paymentMethod)}>
                  <option value="CASH">Cash</option>
                  <option value="UPI">UPI</option>
                  <option value="CARD">Card</option>
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                  <option value="OTHER">Other</option>
                </Select>
              </Field>

              {lines.map((line) => (
                <LineEditor
                  key={line.id}
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
              <PreviewField label="Customer" value={customer.name} />
              <PreviewField label="Mobile" value={customer.mobile || "Not provided"} />
              <PreviewField label="Address" value={customer.billing_address || "Not provided"} />
              <PreviewField label="GST" value={customer.gst_number || "Not provided"} />
              <PreviewField label="Payment Method" value={paymentMethod.replace("_", " ")} />
              <div className="rounded-2xl bg-white p-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-stone-400">Products</p>
                <div className="mt-3 space-y-3">
                  {preparedLines.map((line, index) => (
                    <div key={`${line.product_id}-${index}`} className="border-b border-stone-100 pb-3 last:border-b-0 last:pb-0">
                      <div className="text-sm font-semibold text-stone-900">{line.product_name_snapshot}</div>
                      <div className="mt-1 text-xs text-stone-500">
                        {[line.brand_name_snapshot, line.variant_name_snapshot, line.identifier_snapshot].filter(Boolean).join(" • ") || "Standard item"}
                      </div>
                      <div className="mt-1 text-xs text-stone-500">
                        Qty {line.quantity} • Rate ₹{line.unit_price} • Total ₹{line.line_total}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl bg-white p-4">
                <div className="flex items-center justify-between text-sm text-stone-700"><span>Subtotal</span><span>₹{totals.subtotal.toFixed(2)}</span></div>
                <div className="mt-2 flex items-center justify-between text-sm text-stone-700"><span>Discount</span><span>₹{totals.discount.toFixed(2)}</span></div>
                <div className="mt-3 flex items-center justify-between text-base font-semibold text-stone-950"><span>Total</span><span>₹{totals.total.toFixed(2)}</span></div>
              </div>
            </section>
          ) : null}

          {clientError ? <p className="mt-3 text-sm text-rose-600">{clientError}</p> : null}
          {state.status === "error" && state.message ? <p className="mt-3 text-sm text-rose-600">{state.message}</p> : null}
        </div>

        <div className="flex items-center justify-end border-t border-stone-200/80 bg-[#fffdf9] px-4 py-4 sm:px-6">
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
      <Label>
        {label}
        {required ? <span className="ml-1 text-rose-600">*</span> : null}
      </Label>
      {children}
    </div>
  );
}

function PreviewField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white p-4">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-stone-400">{label}</p>
      <div className="mt-2 break-words text-sm font-medium text-stone-900">{value || "-"}</div>
    </div>
  );
}
