# Inventory And Billing Roadmap

This file tracks the remaining work for the retail inventory and billing system.

## Agreed Scope

- Retail shop focused
- No wholesale or minimum-quantity pricing
- One shared product catalog
- Variant-level stock for color and storage
- Serialized stock for mobiles and other unique-ID products
- Quantity stock for accessories and other non-serialized products

## Current Foundation Done

- Product kinds:
  - `MOBILE`
  - `SERIALIZED`
  - `QUANTITY_BASED`
- Product highlights/spec key-value data
- Variant/color image support
- Manual sale without bill
- Add stock/refill flow
- Variant-aware billing UI
- IMEI/serial barcode scanning

## Priority 1

### 1. Invoice Numbering Safety

Problem:
- invoice number uses `count(*) + 1`
- this can break with deletes or concurrent billing

Needed:
- add a per-shop invoice counter or sequence-based numbering
- make invoice creation atomic and collision-safe

### 2. Variant-Level Pricing

Problem:
- variant pricing fields exist
- billing still mostly starts from product base price

Needed:
- auto-fill bill price from selected variant when available
- use variant selling price in product details and billing
- keep product base price as fallback only

### 3. Inventory Adjustment Center

Needed:
- manual stock increase
- manual stock decrease
- mark damaged
- return to stock
- customer return flow
- exchange flow
- correction reason history

## Priority 2

### 4. Better Refill UX

Needed:
- faster product search
- variant cards instead of only dropdown
- clearer create-new-variant flow
- optional variant price edit during refill

### 5. Barcode Ecosystem

Planned:
- product barcode field while adding product
- paste/manual barcode entry
- later billing scan should auto-select product and option
- own printable barcode labels

Note:
- this is planned for later, not current immediate work

### 6. Billing Speed Improvements

Needed:
- searchable product picker
- faster repeated line entry
- prevent duplicate serialized unit in same bill
- remember last payment method
- clearer stock display before saving

## Priority 3

### 7. Ecommerce Readiness

Needed:
- publish/unpublish flag
- online visibility flag
- SEO title/meta description
- warranty fields
- return policy
- badges/tags
- grouped technical specs

### 8. Reporting And Insights

Needed:
- low stock alerts
- fast-moving products
- dead stock/no-movement products
- sales by storage/color
- serialized stock ageing

## UX Cleanups To Keep Doing

- avoid showing fake `Default` option text to users
- only show variant labels when there is real variant info
- keep billing, product details, and print layouts consistent
- prefer card-based selection for storage/color where possible

## Suggested Execution Order

1. Invoice numbering safety
2. Variant-level pricing
3. Inventory adjustment/return/damage flows
4. Refill UX improvements
5. Billing speed improvements
6. Barcode ecosystem
7. Ecommerce fields
8. Reporting and insights
