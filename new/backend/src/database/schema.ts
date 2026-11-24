import {
  boolean,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

// Read mappings only, deliberately covering the foundation's required columns.
// web/db/*.sql is the source of truth for constraints, triggers, policies and RPCs.
// Never run Drizzle push/generate from this partial mapping.
const dates = () => ({
  createdAt: timestamp('created_at', {
    withTimezone: true,
    mode: 'string',
  }).notNull(),
  updatedAt: timestamp('updated_at', {
    withTimezone: true,
    mode: 'string',
  }).notNull(),
});

export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey(),
  email: text('email'),
  fullName: text('full_name'),
  avatarUrl: text('avatar_url'),
  role: text('role').notNull(),
  onboardingIntent: text('onboarding_intent'),
  ...dates(),
});
export const shops = pgTable('shops', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  status: text('status').notNull(),
  createdBy: uuid('created_by').notNull(),
  ...dates(),
});
export const shopMembers = pgTable('shop_members', {
  id: uuid('id').primaryKey(),
  shopId: uuid('shop_id').notNull(),
  userId: uuid('user_id').notNull(),
  role: text('role').notNull(),
  status: text('status').notNull(),
});
export const products = pgTable('products', {
  id: uuid('id').primaryKey(),
  shopId: uuid('shop_id').notNull(),
  name: text('name').notNull(),
  isSecondHand: boolean('is_second_hand').notNull(),
  basePurchasePrice: numeric('base_purchase_price', {
    precision: 12,
    scale: 2,
  }).notNull(),
  baseSellingPrice: numeric('base_selling_price', {
    precision: 12,
    scale: 2,
  }).notNull(),
  ...dates(),
});
