import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const workingDayValues = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

const fieldSchemas = {
  shopName: z.string().min(2).max(100),
  slug: z.string().min(3).max(80).regex(/^[a-z0-9-]+$/),
  category: z.string().min(2).max(100),
  addressLine1: z.string().min(4).max(200),
  addressLine2: z.string().max(200),
  city: z.string().min(2).max(100),
  state: z.string().min(2).max(100),
  invoicePrefix: z.string().min(2).max(10).regex(/^[A-Z0-9-]+$/),
  currency: z.string().min(3).max(5),
  taxMode: z.enum(["exclusive", "inclusive", "no_tax"]),
  openingTime: z.string().regex(/^\d{2}:\d{2}$/),
  closingTime: z.string().regex(/^\d{2}:\d{2}$/),
  workingDays: z.array(z.enum(workingDayValues)).min(1),
  invoiceFooter: z.string().max(1000),
  location: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }),
} as const;

const updateSchema = z.object({
  field: z.enum([
    "shopName",
    "slug",
    "category",
    "addressLine1",
    "addressLine2",
    "city",
    "state",
    "invoicePrefix",
    "currency",
    "taxMode",
    "openingTime",
    "closingTime",
    "workingDays",
    "invoiceFooter",
    "location",
  ]),
  value: z.unknown(),
});

const fieldConfig = {
  shopName: { table: "shops", column: "name", parser: fieldSchemas.shopName },
  slug: { table: "shops", column: "slug", parser: fieldSchemas.slug },
  category: { table: "shops", column: "category", parser: fieldSchemas.category },
  addressLine1: { table: "shops", column: "address_line_1", parser: fieldSchemas.addressLine1 },
  addressLine2: { table: "shops", column: "address_line_2", parser: fieldSchemas.addressLine2 },
  city: { table: "shops", column: "city", parser: fieldSchemas.city },
  state: { table: "shops", column: "state", parser: fieldSchemas.state },
  invoicePrefix: { table: "shop_settings", column: "invoice_prefix", parser: fieldSchemas.invoicePrefix },
  currency: { table: "shop_settings", column: "currency", parser: fieldSchemas.currency },
  taxMode: { table: "shop_settings", column: "tax_mode", parser: fieldSchemas.taxMode },
  openingTime: { table: "shop_settings", column: "opening_time", parser: fieldSchemas.openingTime },
  closingTime: { table: "shop_settings", column: "closing_time", parser: fieldSchemas.closingTime },
  workingDays: { table: "shop_settings", column: "working_days", parser: fieldSchemas.workingDays },
  invoiceFooter: { table: "shop_settings", column: "invoice_footer", parser: fieldSchemas.invoiceFooter },
  location: { table: "shops", column: ["latitude", "longitude"], parser: fieldSchemas.location },
} as const;

export async function PATCH(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ message: "Invalid request." }, { status: 400 });
  }

  const { data: membership } = await supabase
    .from("shop_members")
    .select("shop_id, role")
    .eq("user_id", user.id)
    .in("role", ["owner", "admin"])
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ message: "No editable shop found." }, { status: 403 });
  }

  const config = fieldConfig[parsed.data.field];
  const normalizedValue =
    parsed.data.field === "invoicePrefix"
      ? typeof parsed.data.value === "string"
        ? parsed.data.value.toUpperCase()
        : parsed.data.value
      : parsed.data.field === "currency"
        ? typeof parsed.data.value === "string"
          ? parsed.data.value.toUpperCase()
          : parsed.data.value
        : parsed.data.value;

  const valueResult = config.parser.safeParse(normalizedValue);

  if (!valueResult.success) {
    return NextResponse.json(
      { message: valueResult.error.issues[0]?.message ?? "Invalid value." },
      { status: 400 },
    );
  }

  if (parsed.data.field === "slug") {
    const adminSupabase = createSupabaseAdminClient();
    const { data: existingSlug } = await (adminSupabase ?? supabase)
      .from("shops")
      .select("id")
      .eq("slug", valueResult.data)
      .neq("id", membership.shop_id)
      .maybeSingle();

    if (existingSlug) {
      return NextResponse.json({ message: "Slug is already taken." }, { status: 400 });
    }
  }

  const payload =
    parsed.data.field === "location"
      ? {
          latitude: (valueResult.data as { latitude: number; longitude: number }).latitude,
          longitude: (valueResult.data as { latitude: number; longitude: number }).longitude,
        }
      : { [(config.column as string)]: valueResult.data };
  const query = supabase.from(config.table).update(payload);

  const { error } =
    config.table === "shops"
      ? await query.eq("id", membership.shop_id)
      : await query.eq("shop_id", membership.shop_id);

  if (error) {
    if (error.code === "23505" && parsed.data.field === "slug") {
      return NextResponse.json({ message: "Slug is already taken." }, { status: 400 });
    }

    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, field: parsed.data.field, value: valueResult.data });
}
