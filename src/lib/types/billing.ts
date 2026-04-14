import { z } from "zod";

export const PaymentMethodOptionSchema = z.enum([
  "CASH",
  "CARD",
  "UPI",
  "BANK_TRANSFER",
  "OTHER",
  "LOAN",
]);
export type PaymentMethodOption = z.infer<typeof PaymentMethodOptionSchema>;

export const PaymentDetailsSchema = z.object({
  methods: z.array(PaymentMethodOptionSchema).min(1, "Add at least one payment method."),
  loan_provider: z.string().optional().nullable(),
  loan_number: z.string().optional().nullable(),
});
export type PaymentDetails = z.infer<typeof PaymentDetailsSchema>;

export const CustomerDraftSchema = z.object({
  name: z.string().min(1, "Customer name is required"),
  mobile: z
    .string()
    .min(1, "Customer mobile is required")
    .regex(/^\d{10}$/, "Customer mobile must be exactly 10 digits"),
  billing_address: z.string().min(1, "Billing address is required"),
  gst_number: z.string().optional().nullable(),
});
export type CustomerDraft = z.infer<typeof CustomerDraftSchema>;

export const BillingLineDraftSchema = z.object({
  product_id: z.string().uuid(),
  variant_id: z.string().uuid().optional().nullable(),
  inventory_item_id: z.string().uuid().optional().nullable(),
  product_name_snapshot: z.string().min(1),
  brand_name_snapshot: z.string().optional().nullable(),
  category_name_snapshot: z.string().optional().nullable(),
  variant_name_snapshot: z.string().optional().nullable(),
  identifier_snapshot: z.string().optional().nullable(),
  quantity: z.coerce.number().int().min(1),
  unit_price: z.coerce.number().min(0),
  tax_rate: z.coerce.number().min(0).max(100).default(0),
  discount_amount: z.coerce.number().min(0).default(0),
  line_total: z.coerce.number().min(0),
});
export type BillingLineDraft = z.infer<typeof BillingLineDraftSchema>;

export const CreateInvoicePayloadSchema = z.object({
  customer: CustomerDraftSchema,
  items: z.array(BillingLineDraftSchema).min(1, "At least one product is required"),
  payment_method: z.enum(["CASH", "CARD", "UPI", "BANK_TRANSFER", "OTHER"]).default("CASH"),
  payment_details: PaymentDetailsSchema,
  notes: z.string().optional().nullable(),
});
export type CreateInvoicePayload = z.infer<typeof CreateInvoicePayloadSchema>;

export const UpdateInvoicePayloadSchema = CreateInvoicePayloadSchema.extend({
  invoice_id: z.string().uuid(),
});
export type UpdateInvoicePayload = z.infer<typeof UpdateInvoicePayloadSchema>;

export const InvoiceSchema = z.object({
  id: z.string().uuid(),
  invoice_number: z.string().min(1),
  invoice_date: z.string(),
  customer_name: z.string(),
  customer_mobile: z.string().nullable().optional(),
  billing_address: z.string().nullable().optional(),
  customer_gst_number: z.string().nullable().optional(),
  subtotal: z.coerce.number(),
  tax_total: z.coerce.number(),
  discount_total: z.coerce.number(),
  grand_total: z.coerce.number(),
  payment_method: z.string(),
  payment_details: PaymentDetailsSchema.nullable().optional(),
  payment_status: z.string(),
  invoice_footer_snapshot: z.string().nullable().optional(),
  shop_name_snapshot: z.string(),
  shop_address_snapshot: z.string().nullable().optional(),
  shop_phone_snapshot: z.string().nullable().optional(),
  shop_gst_snapshot: z.string().nullable().optional(),
});
export type Invoice = z.infer<typeof InvoiceSchema>;

export const InvoiceItemSchema = z.object({
  id: z.string().uuid(),
  invoice_id: z.string().uuid(),
  product_name_snapshot: z.string(),
  brand_name_snapshot: z.string().nullable().optional(),
  category_name_snapshot: z.string().nullable().optional(),
  variant_name_snapshot: z.string().nullable().optional(),
  identifier_snapshot: z.string().nullable().optional(),
  quantity: z.coerce.number().int(),
  unit_price: z.coerce.number(),
  tax_rate: z.coerce.number(),
  discount_amount: z.coerce.number(),
  line_total: z.coerce.number(),
});
export type InvoiceItem = z.infer<typeof InvoiceItemSchema>;
