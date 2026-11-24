import { z } from "zod";
import { COUNTRY_CODES } from "@/lib/phone";

const requiredText = (label: string, max = 120) => z.string().trim().min(1, `${label} is required.`).max(max);
const price = z.coerce.number().finite().min(0, "Price cannot be negative.").max(9999999999.99);

export const SecondHandPhoneSchema = z.object({
  seller_name: requiredText("Seller name"),
  seller_country_code: z.enum(COUNTRY_CODES.map((country) => country.code), "Choose a valid country code."),
  seller_phone: z.string().trim().regex(/^\d{10}$/, "Seller phone must contain exactly 10 digits."),
  purchase_source: requiredText("Purchase source", 200),
  purchase_date: z.iso.date().refine((value) => value <= new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }), "Purchase date cannot be in the future."),
  brand: requiredText("Brand"),
  model: requiredText("Model"),
  storage: requiredText("RAM / storage", 80),
  color: requiredText("Colour", 80),
  imei_1: z.string().trim().regex(/^\d{15}$/, "IMEI 1 must contain 15 digits."),
  imei_2: z.string().trim().regex(/^(\d{15})?$/, "IMEI 2 must contain 15 digits.").default(""),
  purchase_price: price,
  selling_price: price,
}).refine((value) => !value.imei_2 || value.imei_1 !== value.imei_2, {
  message: "IMEI 1 and IMEI 2 must be different.", path: ["imei_2"],
});

export type SecondHandPhoneInput = z.infer<typeof SecondHandPhoneSchema>;

export type SecondHandPurchase = {
  id: string;
  product_id: string;
  seller_name: string;
  seller_phone: string;
  purchase_source: string;
  purchase_date: string;
  original_invoice_path: string | null;
};

export type SecondHandUnit = {
  id: string;
  product_id: string;
  variant_id: string | null;
  imei_1: string | null;
  imei_2: string | null;
  status: string;
  sold_at: string | null;
};
