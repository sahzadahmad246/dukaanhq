import { z } from "zod";

export const QrPayloadSchema = z.discriminatedUnion("kind", [
  z.object({
    v: z.literal(1),
    kind: z.literal("UNIT"),
    shop_id: z.string().uuid(),
    product_id: z.string().uuid(),
    variant_id: z.string().uuid().nullable(),
    inventory_item_id: z.string().uuid(),
    label_code: z.string().min(1),
  }),
  z.object({
    v: z.literal(1),
    kind: z.literal("QTY"),
    shop_id: z.string().uuid(),
    product_id: z.string().uuid(),
    variant_id: z.string().uuid(),
    label_code: z.string().min(1),
  }),
]);

export type QrPayload = z.infer<typeof QrPayloadSchema>;

export function formatQrLabelCode(prefix: string, value: number) {
  return `${prefix}-${String(value).padStart(6, "0")}`;
}

export function stringifyQrPayload(payload: QrPayload) {
  return JSON.stringify(payload);
}

export function parseQrPayload(raw: string) {
  try {
    return QrPayloadSchema.safeParse(JSON.parse(raw));
  } catch {
    return QrPayloadSchema.safeParse(raw);
  }
}

export type PrintableQrEntry = {
  labelCode: string;
  payload: string;
};
