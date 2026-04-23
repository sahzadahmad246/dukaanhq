-- Drop all known overloaded versions of create_inventory_invoice to resolve ambiguity
DROP FUNCTION IF EXISTS public.create_inventory_invoice(uuid, jsonb, jsonb, text, jsonb, text);
DROP FUNCTION IF EXISTS public.create_inventory_invoice(uuid, jsonb, jsonb, text, jsonb, text, text, text);
DROP FUNCTION IF EXISTS public.create_inventory_invoice(uuid, jsonb, jsonb, text, text);

-- Drop all known overloaded versions of update_invoice_details to resolve ambiguity
DROP FUNCTION IF EXISTS public.update_invoice_details(uuid, jsonb, jsonb, text, text, jsonb);
DROP FUNCTION IF EXISTS public.update_invoice_details(uuid, jsonb, jsonb, text, text, jsonb, text, text);
DROP FUNCTION IF EXISTS public.update_invoice_details(uuid, jsonb, jsonb, text, text);

-- Single definitive version of create_inventory_invoice
CREATE OR REPLACE FUNCTION public.create_inventory_invoice(
  p_shop_id uuid,
  p_customer jsonb,
  p_items jsonb,
  p_payment_method text DEFAULT 'CASH',
  p_payment_details jsonb DEFAULT null,
  p_customer_signature_url text DEFAULT null,
  p_invoice_pdf_url text DEFAULT null,
  p_notes text DEFAULT null
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_invoice_id uuid;
  v_customer_id uuid;
  v_customer_name text := trim(coalesce(p_customer ->> 'name', ''));
  v_customer_mobile text := nullif(trim(coalesce(p_customer ->> 'mobile', '')), '');
  v_billing_address text := nullif(trim(coalesce(p_customer ->> 'billing_address', '')), '');
  v_customer_gst text := nullif(trim(coalesce(p_customer ->> 'gst_number', '')), '');
  v_item jsonb;
  v_invoice_number text;
  v_next_invoice_number integer;
  v_product record;
  v_variant record;
  v_inventory_item record;
  v_inv_item_id uuid;
  v_shop record;
  v_quantity integer;
  v_unit_price numeric(12,2);
  v_tax_rate numeric(5,2);
  v_discount numeric(12,2);
  v_line_total numeric(12,2);
  v_subtotal numeric(12,2) := 0;
  v_tax_total numeric(12,2) := 0;
  v_discount_total numeric(12,2) := 0;
  v_grand_total numeric(12,2) := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.shop_members
    WHERE shop_members.shop_id = p_shop_id
      AND shop_members.user_id = v_user_id
      AND shop_members.role IN ('owner', 'staff')
  ) THEN
    RAISE EXCEPTION 'Not allowed to create invoices';
  END IF;

  IF v_customer_name = '' THEN
    RAISE EXCEPTION 'Customer name is required';
  END IF;

  IF v_customer_mobile IS NULL THEN
    RAISE EXCEPTION 'Customer mobile is required';
  END IF;

  IF v_billing_address IS NULL THEN
    RAISE EXCEPTION 'Billing address is required';
  END IF;

  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'At least one invoice item is required';
  END IF;

  SELECT
    shops.name,
    concat_ws(', ', 
      nullif(trim(shops.address_line_1), ''), 
      nullif(trim(shops.city), ''), 
      nullif(trim(shops.state), '')
    ) || CASE 
      WHEN nullif(trim(shops.postal_code), '') IS NOT NULL THEN ' - ' || trim(shops.postal_code) 
      ELSE '' 
    END AS full_address,
    shops.phone,
    shops.gst_number,
    shop_settings.invoice_prefix,
    shop_settings.invoice_footer
  INTO v_shop
  FROM public.shops
  LEFT JOIN public.shop_settings ON shop_settings.shop_id = shops.id
  WHERE shops.id = p_shop_id;

  IF v_shop.name IS NULL THEN
    RAISE EXCEPTION 'Shop not found';
  END IF;

  INSERT INTO public.shop_invoice_counters (shop_id, next_invoice_number)
  VALUES (p_shop_id, 1)
  ON CONFLICT (shop_id) DO NOTHING;

  SELECT next_invoice_number
  INTO v_next_invoice_number
  FROM public.shop_invoice_counters
  WHERE shop_id = p_shop_id
  FOR UPDATE;

  UPDATE public.shop_invoice_counters
  SET next_invoice_number = v_next_invoice_number + 1
  WHERE shop_id = p_shop_id;

  SELECT customers.id
  INTO v_customer_id
  FROM public.customers
  WHERE customers.shop_id = p_shop_id
    AND customers.mobile = v_customer_mobile
  ORDER BY customers.created_at ASC
  LIMIT 1
  FOR UPDATE;

  IF v_customer_id IS NOT NULL THEN
    UPDATE public.customers
    SET name = v_customer_name,
        billing_address = v_billing_address,
        gst_number = v_customer_gst
    WHERE id = v_customer_id;
  ELSE
    INSERT INTO public.customers (
      shop_id,
      name,
      mobile,
      billing_address,
      gst_number
    )
    VALUES (
      p_shop_id,
      v_customer_name,
      v_customer_mobile,
      v_billing_address,
      v_customer_gst
    )
    RETURNING id INTO v_customer_id;
  END IF;

  v_invoice_number := coalesce(v_shop.invoice_prefix, 'INV') || '-' || lpad(v_next_invoice_number::text, 6, '0');

  INSERT INTO public.invoices (
    shop_id,
    customer_id,
    invoice_number,
    customer_name,
    customer_mobile,
    billing_address,
    customer_gst_number,
    payment_method,
    payment_details,
    payment_status,
    notes,
    shop_name_snapshot,
    shop_address_snapshot,
    shop_phone_snapshot,
    shop_gst_snapshot,
    invoice_footer_snapshot,
    customer_signature_url,
    invoice_pdf_url,
    created_by
  )
  VALUES (
    p_shop_id,
    v_customer_id,
    v_invoice_number,
    v_customer_name,
    v_customer_mobile,
    v_billing_address,
    v_customer_gst,
    coalesce(nullif(trim(p_payment_method), ''), 'CASH'),
    CASE
      WHEN p_payment_details IS NOT NULL AND jsonb_typeof(p_payment_details) = 'object' THEN p_payment_details
      ELSE null
    END,
    'PAID',
    nullif(trim(p_notes), ''),
    v_shop.name,
    v_shop.full_address,
    v_shop.phone,
    v_shop.gst_number,
    v_shop.invoice_footer,
    nullif(trim(p_customer_signature_url), ''),
    nullif(trim(p_invoice_pdf_url), ''),
    v_user_id
  )
  RETURNING id INTO v_invoice_id;

  FOR v_item IN
    SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_quantity := greatest(coalesce((v_item ->> 'quantity')::integer, 1), 1);
    v_unit_price := coalesce((v_item ->> 'unit_price')::numeric, 0);
    v_tax_rate := coalesce((v_item ->> 'tax_rate')::numeric, 0);
    v_discount := coalesce((v_item ->> 'discount_amount')::numeric, 0);
    v_line_total := coalesce((v_item ->> 'line_total')::numeric, greatest((v_unit_price * v_quantity) - v_discount, 0));

    IF nullif(v_item ->> 'product_id', '') IS NULL THEN
      -- Handle non-inventory (Quick) items
      INSERT INTO public.invoice_items (
        shop_id,
        invoice_id,
        product_id,
        variant_id,
        inventory_item_id,
        product_name_snapshot,
        brand_name_snapshot,
        category_name_snapshot,
        variant_name_snapshot,
        identifier_snapshot,
        quantity,
        unit_price,
        tax_rate,
        discount_amount,
        line_total
      )
      VALUES (
        p_shop_id,
        v_invoice_id,
        null,
        null,
        null,
        trim(coalesce(v_item ->> 'product_name_snapshot', '')),
        nullif(v_item ->> 'brand_name_snapshot', ''),
        nullif(v_item ->> 'category_name_snapshot', ''),
        nullif(v_item ->> 'variant_name_snapshot', ''),
        nullif(v_item ->> 'identifier_snapshot', ''),
        v_quantity,
        v_unit_price,
        v_tax_rate,
        v_discount,
        v_line_total
      );
    ELSE
      -- Handle inventory products
      SELECT
        products.id,
        products.name,
        products.category_id,
        products.brand_id,
        products.tracking_type,
        products.product_kind,
        products.base_selling_price,
        products.tax_rate,
        brands.name as brand_name,
        categories.name as category_name
      INTO v_product
      FROM public.products
      LEFT JOIN public.brands ON brands.id = products.brand_id
      LEFT JOIN public.categories ON categories.id = products.category_id
      WHERE products.id = (v_item ->> 'product_id')::uuid
        AND products.shop_id = p_shop_id;

      IF v_product.id IS NULL THEN
        RAISE EXCEPTION 'Product not found for invoice item';
      END IF;

      IF (v_item ->> 'variant_id') IS NOT NULL AND (v_item ->> 'variant_id') <> '' THEN
        SELECT *
        INTO v_variant
        FROM public.product_variants
        WHERE product_variants.id = (v_item ->> 'variant_id')::uuid
          AND product_variants.product_id = v_product.id
          AND product_variants.shop_id = p_shop_id;
      ELSE
        v_variant := null;
      END IF;

      IF v_product.tracking_type = 'SERIALIZED' THEN
        IF v_quantity <> 1 THEN
          RAISE EXCEPTION 'Serialized products must have quantity 1';
        END IF;

        IF (v_item ->> 'inventory_item_id') IS NULL OR (v_item ->> 'inventory_item_id') = '' THEN
          RAISE EXCEPTION 'Serialized products require an inventory unit';
        END IF;

        v_inv_item_id := (v_item ->> 'inventory_item_id')::uuid;

        SELECT *
        INTO v_inventory_item
        FROM public.inventory_items
        WHERE inventory_items.id = v_inv_item_id
          AND inventory_items.product_id = v_product.id
          AND inventory_items.shop_id = p_shop_id
          AND inventory_items.status = 'IN_STOCK'
        FOR UPDATE;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'Selected inventory unit is not available';
        END IF;

        UPDATE public.inventory_items
        SET status = 'SOLD',
            sold_at = now()
        WHERE id = v_inv_item_id;

        INSERT INTO public.stock_movements (
          shop_id,
          product_id,
          variant_id,
          inventory_item_id,
          type,
          quantity_change,
          reason,
          performed_by
        )
        VALUES (
          p_shop_id,
          v_product.id,
          v_inventory_item.variant_id,
          v_inv_item_id,
          'SALE',
          -1,
          'Sold through invoice ' || v_invoice_number,
          v_user_id
        );
      ELSE
        v_inv_item_id := null;

        IF v_variant.id IS NULL THEN
          RAISE EXCEPTION 'Quantity-based products require a variant';
        END IF;

        UPDATE public.product_variants
        SET quantity = quantity - v_quantity
        WHERE id = v_variant.id
          AND quantity >= v_quantity;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'Insufficient stock for %', v_product.name;
        END IF;

        INSERT INTO public.stock_movements (
          shop_id,
          product_id,
          variant_id,
          type,
          quantity_change,
          reason,
          performed_by
        )
        VALUES (
          p_shop_id,
          v_product.id,
          v_variant.id,
          'SALE',
          -1 * v_quantity,
          'Sold through invoice ' || v_invoice_number,
          v_user_id
        );
      END IF;

      INSERT INTO public.invoice_items (
        shop_id,
        invoice_id,
        product_id,
        variant_id,
        inventory_item_id,
        product_name_snapshot,
        brand_name_snapshot,
        category_name_snapshot,
        variant_name_snapshot,
        identifier_snapshot,
        quantity,
        unit_price,
        tax_rate,
        discount_amount,
        line_total
      )
      VALUES (
        p_shop_id,
        v_invoice_id,
        v_product.id,
        v_variant.id,
        v_inv_item_id,
        v_product.name,
        v_product.brand_name,
        v_product.category_name,
        coalesce(v_item ->> 'variant_name_snapshot', v_variant.name),
        nullif(v_item ->> 'identifier_snapshot', ''),
        v_quantity,
        v_unit_price,
        v_tax_rate,
        v_discount,
        v_line_total
      );
    END IF;

    v_subtotal := v_subtotal + (v_unit_price * v_quantity);
    v_discount_total := v_discount_total + v_discount;
    v_tax_total := v_tax_total + ((greatest((v_unit_price * v_quantity) - v_discount, 0)) * (v_tax_rate / 100));
    v_grand_total := v_grand_total + v_line_total;
  END LOOP;

  UPDATE public.invoices
  SET subtotal = round(v_subtotal, 2),
      tax_total = round(v_tax_total, 2),
      discount_total = round(v_discount_total, 2),
      grand_total = round(v_grand_total, 2)
  WHERE id = v_invoice_id;

  RETURN v_invoice_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_inventory_invoice(uuid, jsonb, jsonb, text, jsonb, text, text, text) TO authenticated;


-- Single definitive version of update_invoice_details
CREATE OR REPLACE FUNCTION public.update_invoice_details(
  p_invoice_id uuid,
  p_customer jsonb,
  p_items jsonb,
  p_payment_method text,
  p_payment_details jsonb DEFAULT null,
  p_customer_signature_url text DEFAULT null,
  p_invoice_pdf_url text DEFAULT null,
  p_notes text DEFAULT null
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_invoice record;
  v_customer_id uuid;
  v_customer_name text := trim(coalesce(p_customer ->> 'name', ''));
  v_customer_mobile text := nullif(trim(coalesce(p_customer ->> 'mobile', '')), '');
  v_billing_address text := nullif(trim(coalesce(p_customer ->> 'billing_address', '')), '');
  v_customer_gst text := nullif(trim(coalesce(p_customer ->> 'gst_number', '')), '');
  v_item jsonb;
  v_quantity integer;
  v_unit_price numeric(12,2);
  v_tax_rate numeric(5,2);
  v_discount numeric(12,2);
  v_line_total numeric(12,2);
  v_subtotal numeric(12,2) := 0;
  v_tax_total numeric(12,2) := 0;
  v_discount_total numeric(12,2) := 0;
  v_grand_total numeric(12,2) := 0;
  v_product record;
  v_variant record;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_invoice FROM public.invoices WHERE id = p_invoice_id;
  IF v_invoice.id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.shop_members
    WHERE shop_members.shop_id = v_invoice.shop_id
      AND shop_members.user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Not allowed to edit invoices';
  END IF;

  IF v_customer_name = '' THEN
    RAISE EXCEPTION 'Customer name is required';
  END IF;

  IF v_customer_mobile IS NULL THEN
    RAISE EXCEPTION 'Customer mobile is required';
  END IF;

  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'At least one invoice item is required';
  END IF;

  SELECT customers.id
  INTO v_customer_id
  FROM public.customers
  WHERE customers.shop_id = v_invoice.shop_id
    AND customers.mobile = v_customer_mobile
  ORDER BY customers.created_at ASC
  LIMIT 1
  FOR UPDATE;

  IF v_customer_id IS NOT NULL THEN
    UPDATE public.customers
    SET name = v_customer_name,
        billing_address = coalesce(v_billing_address, billing_address),
        gst_number = coalesce(v_customer_gst, gst_number)
    WHERE id = v_customer_id;
  ELSE
    INSERT INTO public.customers (
      shop_id, name, mobile, billing_address, gst_number
    ) VALUES (
      v_invoice.shop_id, v_customer_name, v_customer_mobile, v_billing_address, v_customer_gst
    ) RETURNING id INTO v_customer_id;
  END IF;

  UPDATE public.invoices
  SET customer_id = v_customer_id,
      customer_name = v_customer_name,
      customer_mobile = v_customer_mobile,
      billing_address = v_billing_address,
      customer_gst_number = v_customer_gst,
      payment_method = coalesce(nullif(trim(p_payment_method), ''), 'CASH'),
      payment_details = coalesce(p_payment_details, '{"methods":["CASH"]}'::jsonb),
      notes = nullif(trim(p_notes), ''),
      customer_signature_url = nullif(trim(p_customer_signature_url), ''),
      invoice_pdf_url = nullif(trim(p_invoice_pdf_url), '')
  WHERE id = p_invoice_id;

  -- NOTE: This quick-rebuild doesn't handle stock re-adjustment for inventory items.
  -- It's primarily for quick-edit fixes. For full inventory re-calculation, a more complex logic is needed.
  DELETE FROM public.invoice_items WHERE invoice_id = p_invoice_id;

  FOR v_item IN
    SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_quantity := greatest(coalesce((v_item ->> 'quantity')::integer, 1), 1);
    v_unit_price := coalesce((v_item ->> 'unit_price')::numeric, 0);
    v_tax_rate := coalesce((v_item ->> 'tax_rate')::numeric, 0);
    v_discount := coalesce((v_item ->> 'discount_amount')::numeric, 0);
    v_line_total := coalesce((v_item ->> 'line_total')::numeric, greatest((v_unit_price * v_quantity) - v_discount, 0));

    IF nullif(v_item ->> 'product_id', '') IS NULL THEN
      INSERT INTO public.invoice_items (
        shop_id, invoice_id, product_id, variant_id, inventory_item_id,
        product_name_snapshot, brand_name_snapshot, category_name_snapshot, variant_name_snapshot,
        identifier_snapshot, quantity, unit_price, tax_rate, discount_amount, line_total
      ) VALUES (
        v_invoice.shop_id, p_invoice_id, null, null, null,
        trim(coalesce(v_item ->> 'product_name_snapshot', '')),
        nullif(v_item ->> 'brand_name_snapshot', ''),
        nullif(v_item ->> 'category_name_snapshot', ''),
        nullif(v_item ->> 'variant_name_snapshot', ''),
        nullif(v_item ->> 'identifier_snapshot', ''),
        v_quantity, v_unit_price, v_tax_rate, v_discount, v_line_total
      );
    ELSE
      SELECT id, name, category_id, brand_id, tracking_type, product_kind, base_selling_price, tax_rate
      INTO v_product
      FROM public.products
      WHERE products.id = (v_item ->> 'product_id')::uuid
        AND products.shop_id = v_invoice.shop_id;

      IF v_product.id IS NULL THEN
        RAISE EXCEPTION 'Product not found for invoice item';
      END IF;

      IF (v_item ->> 'variant_id') IS NOT NULL AND (v_item ->> 'variant_id') <> '' THEN
        SELECT id, name INTO v_variant
        FROM public.product_variants
        WHERE product_variants.id = (v_item ->> 'variant_id')::uuid;
      ELSE
        v_variant := null;
      END IF;

      INSERT INTO public.invoice_items (
        shop_id, invoice_id, product_id, variant_id, inventory_item_id,
        product_name_snapshot, brand_name_snapshot, category_name_snapshot, variant_name_snapshot,
        identifier_snapshot, quantity, unit_price, tax_rate, discount_amount, line_total
      ) VALUES (
        v_invoice.shop_id, p_invoice_id, v_product.id, v_variant.id, nullif((v_item ->> 'inventory_item_id'), '')::uuid,
        v_product.name,
        (SELECT name FROM public.brands WHERE id = v_product.brand_id),
        (SELECT name FROM public.categories WHERE id = v_product.category_id),
        coalesce(v_item ->> 'variant_name_snapshot', v_variant.name),
        nullif(v_item ->> 'identifier_snapshot', ''),
        v_quantity, v_unit_price, v_tax_rate, v_discount, v_line_total
      );
    END IF;

    v_subtotal := v_subtotal + (v_unit_price * v_quantity);
    v_discount_total := v_discount_total + v_discount;
    v_tax_total := v_tax_total + ((greatest((v_unit_price * v_quantity) - v_discount, 0)) * (v_tax_rate / 100));
    v_grand_total := v_grand_total + v_line_total;
  END LOOP;

  UPDATE public.invoices
  SET subtotal = round(v_subtotal, 2),
      tax_total = round(v_tax_total, 2),
      discount_total = round(v_discount_total, 2),
      grand_total = round(v_grand_total, 2)
  WHERE id = p_invoice_id;

  RETURN p_invoice_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_invoice_details(uuid, jsonb, jsonb, text, jsonb, text, text, text) TO authenticated;
