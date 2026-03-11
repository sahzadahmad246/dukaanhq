# DukaanHQ Project Plan

## Product Name
- product name: `DukaanHQ`
- primary brand/domain: `DukaanHQ.com`
- app type: multi-tenant SaaS for retail shops
- initial target market: electronics and mobile shops

## Project Goal
Build `DukaanHQ`, a multi-tenant SaaS web application for electronics/mobile shops that helps the shop owner:
- manage inventory
- generate bills and invoices
- track customers
- manage stock movement
- later launch an e-commerce storefront so customers can order online

The correct implementation order is:
1. Inventory management
2. Billing and invoice generation
3. Customer management and reports
4. Online catalog and ordering
5. Full e-commerce features like payments, delivery, offers, and notifications

This order is important because billing and stock control must be stable before online ordering is introduced.

## Recommended Product Scope
The system should be treated as two connected products:

### 1. Admin App
Used by the shop owner and staff for:
- product management
- stock entry and adjustments
- billing/POS
- invoice generation
- customer records
- reports
- supplier tracking

### 2. Customer Storefront
Used by customers for:
- browsing products
- searching and filtering items
- adding products to cart
- placing online orders
- tracking order status

## Recommendation Summary
Recommended approach:
- Build this as a multi-tenant SaaS from day one
- Start with project initialization, authentication, and shop onboarding
- Start with inventory and billing only
- Support both mobile phones and accessories from day one
- Design inventory carefully because phones often require IMEI/serial tracking
- Keep offline and online stock in the same inventory system
- Use role-based access from the start
- Build fast billing workflows before focusing on storefront UI

## Recommended Tech Stack

### Core Stack
- Next.js
- TypeScript
- Supabase Postgres
- Supabase Auth
- Tailwind CSS
- Zod
- React Hook Form
- TanStack Table
- Resend for transactional emails
- Leaflet + OpenStreetMap for shop location selection

### Image and File Handling
- Use Cloudinary from day one for:
- product images
- shop logos
- invoice assets if needed
- Do not use Supabase Storage in the initial version

### Authentication
- Use Google login only in the initial version
- Shop owners sign in with Google and create their shop during onboarding
- Staff users can also sign in with Google after invitation and role assignment
- Customer auth can be added later when the storefront is built
- Do not add email OTP initially

### Future Additions
- Razorpay or Cashfree for online payments
- WhatsApp/SMS notifications
- barcode scanner support
- custom domains per shop

## Why This Stack Makes Sense
- Next.js is good for building both dashboard and storefront in one codebase
- Supabase provides database, auth, and security policies in one place
- TypeScript makes billing and inventory logic safer
- Zod and React Hook Form are useful for validating large product and invoice forms
- TanStack Table is very useful for inventory, billing history, and reports
- Cloudinary handles media well on a free plan for an early-stage product
- Resend is a practical choice for low-volume invitation and notification emails

## SaaS Platform Direction
This should be designed as a multi-tenant SaaS, not as a one-shop-only app.

### Tenant Model
- one platform
- many shops
- each shop has isolated data
- each shop can have its own staff, products, billing, and storefront
- later, each shop can have its own custom domain

### Roles
Use these four roles:
- admin: platform owner, manages all tenants and platform settings
- owner: shop owner, manages one shop
- staff: works inside one shop with limited permissions
- customer: storefront user for online ordering later

### Multi-Tenant Rule
Every business table should include `shop_id`.
The platform-level `admin` role is the only exception for cross-tenant administration.

## Phase-Based Development Plan

## Phase 1: MVP
Focus on project initialization, authentication, onboarding, and tenant foundation.

### Features
- Google login
- platform landing page
- register and onboard shop
- create shop profile
- role system: admin, owner, staff, customer
- staff invitation flow through Resend
- shop switch protection and tenant isolation
- admin shell/layout
- owner dashboard shell
- Cloudinary integration for logo and image uploads
- map-based shop location picker
- database schema for multi-tenant app

### Outcome
At the end of this phase, a shop owner can sign in, create a shop, upload branding, set location and business details, and enter the system securely.

## Phase 2: Stronger Inventory Control
Build inventory and billing after auth and onboarding are stable.

### Features
- product management
- category and brand management
- stock entry
- current stock view
- low-stock alerts
- billing/POS screen
- invoice number generation
- print/download invoice
- customer details during sale
- sales history
- basic dashboard
- supplier management
- purchase entry
- stock adjustment with reason
- serialized inventory for mobiles
- IMEI/serial tracking
- return and replacement handling
- audit logs
- export reports

### Outcome
At the end of this phase, the shop should be able to stop using the old bill book and manage stock reliably.

## Phase 3: Customer-Facing Storefront

### Features
- public product catalog
- product detail pages
- search and filters
- cart
- checkout
- online order placement
- customer login
- order status tracking
- tenant storefront domain or subdomain routing

### Outcome
Customers can place orders online using the same inventory system.

## Phase 4: Full E-Commerce

### Features
- payment gateway
- shipping management
- offers/coupons
- notifications
- loyalty/referrals
- advanced analytics

## Most Important Features for This Business
Because this is an electronics/mobile shop, these features matter a lot:
- IMEI/serial number tracking for mobiles
- quantity-based stock for accessories
- warranty information
- discount tracking
- return/replacement history
- invoice reprint
- tax/GST-ready invoice fields
- low-stock alerts
- staff roles and permissions
- audit log for stock changes and invoice cancellation

## Inventory Model Recommendation
Support two inventory modes:

### 1. Serialized Inventory
Used for mobiles and other products with unique identifiers.
Examples:
- mobile phones
- tablets
- smart watches with serial numbers

Each physical unit should have:
- product reference
- IMEI or serial number
- purchase price
- selling price
- status: in stock, sold, returned, damaged

### 2. Quantity-Based Inventory
Used for accessories and non-serialized products.
Examples:
- chargers
- earphones
- covers
- cables
- screen guards

Track these using:
- total quantity
- stock movement records
- low-stock threshold

## Recommended Modules

### Product Management
- add/edit/delete product
- category
- brand
- model
- SKU/internal code
- variant attributes like color/storage
- purchase price
- selling price
- tax percentage
- stock status
- product image
- active/inactive status

### Stock Management
- stock in from supplier purchases
- stock out through sales
- stock adjustment
- damaged/lost item entry
- low-stock alert
- stock movement history

### Billing / POS
- quick product search
- add item to bill
- optional customer selection
- quantity, discount, tax, total
- payment method: cash, UPI, card, mixed
- auto invoice number
- print bill
- download PDF invoice
- reprint invoice
- cancel invoice with permission

### Customer Management
- customer name
- mobile number
- address optional
- purchase history
- warranty-linked products
- total spending

### Supplier Management
- supplier details
- purchase history
- pending payments later if needed

### Reports
- daily sales
- monthly sales
- stock summary
- low-stock products
- best-selling products
- sales by staff member
- profit estimate

## User Roles
Keep roles simple in the beginning:

### Admin
- platform owner role
- can manage all shops
- can review onboarding
- can suspend shops if needed
- can manage platform settings and domain mappings

### Owner
- full access
- manage staff
- manage pricing
- manage inventory
- view reports
- cancel invoices

### Staff
- create bills
- view products
- add customers
- limited access to edit records

### Customer
For later storefront phase.

## Shop Onboarding Requirements
The onboarding flow should collect the minimum business information required to run billing correctly and prepare for storefront use later.

### Required Shop Details
- shop name
- legal business name if different
- logo
- contact phone number
- contact email
- GST number if applicable
- address line 1
- address line 2 optional
- city
- state
- postal code
- country
- Google Maps coordinates or map-selected latitude/longitude
- opening hours
- closing hours
- weekly closed day or working day selection
- invoice prefix or billing prefix
- currency
- tax mode

### Good Optional Fields
- support WhatsApp number
- website slug
- return policy text
- warranty policy text
- invoice footer note
- social links

### Onboarding UX Recommendation
Use a step-based flow:
1. account sign-in with Google
2. business identity
3. address and location on map
4. tax and billing info
5. business timings
6. finish and open dashboard

## Staff Invitation Flow
Recommended staff flow:
1. owner enters staff email
2. system sends invitation through Resend
3. invited user signs in with Google using the same email
4. system links user to shop
5. owner assigns or updates role

Keep invitation records in a separate table so invites can expire or be revoked.

## Billing Workflow Recommendation
Recommended billing flow:
1. search product
2. add product to bill
3. if product is serialized, select exact unit/IMEI
4. add customer details if needed
5. apply discount if allowed
6. choose payment method
7. generate invoice number
8. save sale
9. reduce stock
10. print or download invoice

This flow should be handled safely so invoice creation and stock deduction stay in sync.

## Invoice Recommendations
Your invoice should include:
- shop name and logo
- shop address and contact details
- invoice number
- invoice date and time
- customer name and mobile number
- product line items
- serial number/IMEI where applicable
- subtotal
- discount
- tax
- total amount
- payment method
- warranty note
- return policy note

For GST or tax compliance, exact business/legal fields should be verified with the shop's accountant before production use.

## Suggested Database Tables
Recommended main tables:
- profiles
- shops
- shop_domains
- shop_settings
- staff_members
- staff_invitations
- customers
- suppliers
- categories
- brands
- products
- product_variants
- inventory_items
- stock_movements
- purchases
- purchase_items
- sales
- sale_items
- payments
- invoices
- returns
- audit_logs

## Table Intent

### products
Base product definitions.
Examples:
- iPhone 15
- Samsung charger
- OnePlus earbuds

### product_variants
Variant details like:
- color
- storage
- RAM
- version

### inventory_items
Used for serialized units.
Each row represents one physical unit.

### stock_movements
Every stock change should create a record here.
Examples:
- purchase
- sale
- adjustment
- return
- damaged item

### sales and sale_items
Used for billing records.

### invoices
Used for printable and downloadable invoice records.

### audit_logs
Stores who changed what and when.

### shop_domains
Stores shop domain or subdomain mappings for storefront access later.

### staff_invitations
Stores email invitations, invitation status, inviter, target shop, and role.

## Security Recommendations
This is very important.

- Use Row Level Security in Supabase
- Every business record should belong to a shop using `shop_id`
- Staff should only access data for their own shop
- Only owner/admin should be allowed to cancel invoices, update pricing, or make major stock changes
- Keep audit logs for stock, invoice, and pricing changes

## Recommended Technical Architecture

### Frontend
- Next.js App Router
- admin dashboard routes under `/admin`
- public landing page on `/`
- onboarding flow under `/onboarding`
- storefront routes under tenant subdomain, custom domain, or `/shop/[slug]` during early development

### Backend
- Supabase Postgres as primary database
- Supabase Auth for authentication
- Next.js Server Actions or Route Handlers for secure mutations
- Supabase Edge Functions only when needed for background or integration tasks

### Storage
- Cloudinary for all media in the initial version
- invoice PDFs can be generated on demand and stored later only if needed

### Email
- Resend for staff invitations and basic transactional email

### Maps
- Leaflet with OpenStreetMap for free location selection during onboarding
- do not depend on Google Maps initially if the goal is to avoid early cost

## Custom Domains
Yes, custom domains per shop are possible in a Next.js app.

Recommended rollout:
1. start with a platform subdomain model like `shopslug.yourdomain.com`
2. later add custom domain mapping like `store.shopname.com` or `shopname.com`
3. store domain mapping in `shop_domains`
4. resolve tenant from request host at middleware level

Custom domains are easier if the app is deployed on a platform with domain management support. Start with subdomains first, then add custom domains after the storefront is stable.

## UI Recommendations
For the admin panel, speed matters more than visual complexity.

### Admin UI Priorities
- large search bar on billing page
- keyboard-friendly billing flow
- fewer clicks
- clear stock numbers
- quick invoice printing
- clean product and sales tables
- usable on desktop and tablet

### Important Screens
- dashboard
- product list
- add/edit product
- stock entry page
- billing screen
- invoice history
- customer list
- reports page

## Suggested Milestones

### Milestone 1: Foundation
- create Next.js project
- configure Supabase
- set up auth
- set up role system
- create database schema
- build admin shell/layout
- build landing page
- build onboarding flow
- integrate Cloudinary
- integrate Resend
- add tenant-aware routing support

### Milestone 2: Inventory
- product CRUD
- categories and brands
- stock entry
- stock movement tracking
- low-stock display

### Milestone 3: Billing
- POS screen
- customer selection
- invoice creation
- stock deduction
- print/PDF invoice

### Milestone 4: Customers and Reports
- customer pages
- purchase history
- daily/monthly reports
- stock reports

### Milestone 5: Storefront
- public catalog
- cart
- checkout
- order management

## Direct Recommendations
1. Build this as a SaaS multi-tenant app from the start.
2. Start with project initialization, Google auth, and shop onboarding.
3. Do not start with full e-commerce.
4. Build inventory and billing after tenant foundations are stable.
5. Support serialized and quantity-based inventory from day one.
6. Use one shared stock system for both offline and online sales.
7. Keep billing logic on the server side, not only in the client.
8. Use audit logs for stock and invoice actions.
9. Keep tax/GST fields configurable.
10. Optimize the billing screen for fast counter usage.
11. Start with subdomains before custom domains.

## Best Stack Decision
Recommended implementation stack:
- Next.js
- TypeScript
- Supabase Postgres
- Supabase Auth
- Tailwind CSS
- Zod
- React Hook Form
- TanStack Table
- Cloudinary from day one
- Resend for email invites and basic notifications
- Leaflet + OpenStreetMap for free map selection
- Razorpay or Cashfree later for payments

## Final Recommendation
If you want the highest chance of success, build this in the following order:
1. Project initialization and multi-tenant database design
2. Google authentication and role system
3. Shop onboarding flow
4. Inventory management
5. Billing and invoices
6. Customer and reporting tools
7. Online product catalog
8. Order placement and e-commerce features

That path will let you build the SaaS foundation correctly, onboard shops cleanly, and then add operational features without rewriting tenant logic later.
