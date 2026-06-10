import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  unique,
  uuid
} from 'drizzle-orm/pg-core'

export const siteSettings = pgTable('site_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text('updated_by')
})

export type SiteSetting = typeof siteSettings.$inferSelect
export type NewSiteSetting = typeof siteSettings.$inferInsert

export const eventLogos = pgTable(
  'event_logos',
  {
    hashtag: text('hashtag').primaryKey(), // e.g. "anime-expo" (no leading #)
    imageUrl: text('image_url').notNull(),
    // TS-side enum is a type hint only; Drizzle does NOT emit CHECK from it.
    // We add an explicit check() below to match spec §11 SQL.
    source: text('source', { enum: ['scraped', 'manual_upload', 'manual_override'] }).notNull(),
    sourceEventUrl: text('source_event_url'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    updatedBy: text('updated_by')
  },
  (table) => ({
    sourceValid: check(
      'event_logos_source_valid',
      sql`${table.source} IN ('scraped', 'manual_upload', 'manual_override')`
    )
  })
)

export type EventLogo = typeof eventLogos.$inferSelect
export type NewEventLogo = typeof eventLogos.$inferInsert

export const smsRecipients = pgTable('sms_recipients', {
  id: serial('id').primaryKey(),
  phone: text('phone').notNull().unique(), // E.164 format
  label: text('label'), // "Owner", "Manager", etc.
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
})

export type SmsRecipient = typeof smsRecipients.$inferSelect
export type NewSmsRecipient = typeof smsRecipients.$inferInsert

export const wishlists = pgTable(
  'wishlists',
  {
    userId: text('user_id').notNull(), // Logto user ID
    productId: text('product_id').notNull(), // Square catalog item ID
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.productId] })
  })
)

export type WishlistEntry = typeof wishlists.$inferSelect
export type NewWishlistEntry = typeof wishlists.$inferInsert

export const reviews = pgTable(
  'reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: text('product_id').notNull(), // Square catalog item ID
    userId: text('user_id'), // Logto user ID; nullable for legacy/imported reviews
    orderId: text('order_id'), // Square order ID; used to verify purchase
    rating: integer('rating').notNull(),
    title: text('title'),
    body: text('body').notNull(),
    authorName: text('author_name'), // denormalized reviewer display name captured at submit
    photoUrls: text('photo_urls').array().notNull().default(sql`'{}'::text[]`),
    isPublished: boolean('is_published').notNull().default(false),
    isVerifiedPurchase: boolean('is_verified_purchase').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    ratingRange: check('reviews_rating_range', sql`${table.rating} BETWEEN 1 AND 5`),
    uniqueUserProduct: unique('reviews_user_product_unique').on(table.userId, table.productId)
  })
)

export type Review = typeof reviews.$inferSelect
export type NewReview = typeof reviews.$inferInsert

export const abandonedCarts = pgTable(
  'abandoned_carts',
  {
    cartId: text('cart_id').primaryKey(), // UUID we generate at /api/checkout
    squareOrderId: text('square_order_id'), // populated once Square assigns an order ID
    buyerEmail: text('buyer_email'), // nullable; only known if buyer typed it
    // Phase 11 attribution bridge: the webhook is server-to-server (no Logto
    // session), so it reads the buyer's identity from this row to attribute orders.
    buyerUserId: text('buyer_user_id'), // Logto sub of the buyer; null for guests
    squareCustomerId: text('square_customer_id'), // Square customer attributed at checkout
    cartSnapshot: jsonb('cart_snapshot').notNull(), // line items for the reminder email
    // TS enum is a type hint only; Drizzle does not emit CHECK from it.
    status: text('status', {
      enum: ['pending', 'in_checkout', 'completed', 'abandoned']
    })
      .notNull()
      .default('pending'),
    reminderSentAt: timestamp('reminder_sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    statusValid: check(
      'abandoned_carts_status_valid',
      sql`${table.status} IN ('pending', 'in_checkout', 'completed', 'abandoned')`
    )
  })
)

export type AbandonedCart = typeof abandonedCarts.$inferSelect
export type NewAbandonedCart = typeof abandonedCarts.$inferInsert

// Phase 11: re-keyed from `email` PK to the Logto `sub`. The previous shape was
// empty + unreferenced, so the migration drops/recreates the PK safely.
export const customerLink = pgTable('customer_link', {
  userId: text('user_id').primaryKey(), // Logto sub
  email: text('email'), // normalized lowercase
  squareCustomerId: text('square_customer_id').notNull(),
  name: text('name'),
  cachedAt: timestamp('cached_at', { withTimezone: true }).notNull().defaultNow()
})

export type CustomerLink = typeof customerLink.$inferSelect
export type NewCustomerLink = typeof customerLink.$inferInsert

// Phase 11: durable read model of completed orders. Square stays the system of
// record for money; this table powers the customer-facing /account order history.
export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    squareOrderId: text('square_order_id').notNull().unique(), // idempotency key for upsert
    squarePaymentId: text('square_payment_id'),
    userId: text('user_id'), // Logto sub; null for guest orders
    buyerEmail: text('buyer_email'), // display/fallback
    squareCustomerId: text('square_customer_id'), // mirror of the Square order customer
    // TS enum is a type hint only; explicit CHECK below enforces at DB level.
    status: text('status', { enum: ['completed', 'refunded', 'partially_refunded'] })
      .notNull()
      .default('completed'),
    totalCents: integer('total_cents').notNull(),
    currency: text('currency').notNull().default('USD'),
    lineItems: jsonb('line_items').notNull(), // [{ name, quantity, unitPriceCents, totalCents, catalogObjectId?, variationName? }]
    placedAt: timestamp('placed_at', { withTimezone: true }),
    raw: jsonb('raw'), // full Square order snapshot (audit/debug)
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    statusValid: check(
      'orders_status_valid',
      sql`${table.status} IN ('completed', 'refunded', 'partially_refunded')`
    ),
    userIdIdx: index('orders_user_id_idx').on(table.userId)
  })
)

export type Order = typeof orders.$inferSelect
export type NewOrder = typeof orders.$inferInsert

export const productCache = pgTable('product_cache', {
  catalogItemId: text('catalog_item_id').primaryKey(), // Square catalog item ID
  data: jsonb('data').notNull(), // denormalized: name, price, image URLs, custom attrs
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
})

export type ProductCacheEntry = typeof productCache.$inferSelect
export type NewProductCacheEntry = typeof productCache.$inferInsert

export const orderLog = pgTable(
  'order_log',
  {
    id: serial('id').primaryKey(),
    squareOrderId: text('square_order_id').notNull(),
    eventType: text('event_type').notNull(), // e.g. "order.created", "payment.created"
    /** Square event_id from the webhook payload. Used for idempotency
     *  in the webhook handler — duplicate events get logged but skip
     *  notification fanout. Nullable so backfilled rows (none yet) and
     *  any future non-webhook log writes don't violate. */
    eventId: text('event_id'),
    payload: jsonb('payload').notNull(), // raw webhook body
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    eventIdIdx: index('order_log_event_id_idx').on(table.eventId)
  })
)

export type OrderLogEntry = typeof orderLog.$inferSelect
export type NewOrderLogEntry = typeof orderLog.$inferInsert

export const artists = pgTable(
  'artists',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull().unique(),
    displayName: text('display_name').notNull(),
    squareCategoryId: text('square_category_id').notNull(),
    // TS-side enum is a type hint only; Drizzle does NOT emit CHECK from it.
    // Explicit check below enforces at DB level (matches Phase 2 convention).
    status: text('status', { enum: ['active', 'inactive'] })
      .notNull()
      .default('active'),
    avatarUrl: text('avatar_url'),
    bio: text('bio'),
    instagram: text('instagram'),
    twitter: text('twitter'),
    facebook: text('facebook'),
    youtube: text('youtube'),
    tiktok: text('tiktok'),
    website: text('website'),
    commissionRate: numeric('commission_rate', { precision: 5, scale: 4 })
      .notNull()
      .default('0.2000'),
    paymentMethod: text('payment_method'),
    paymentEmail: text('payment_email'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    statusValid: check('artists_status_valid', sql`${table.status} IN ('active', 'inactive')`)
  })
)

export type Artist = typeof artists.$inferSelect
export type NewArtist = typeof artists.$inferInsert

export const ipNicknames = pgTable('ip_nicknames', {
  id: uuid('id').primaryKey().defaultRandom(),
  squareCategoryId: text('square_category_id').notNull().unique(),
  slug: text('slug').notNull().unique(),
  nickname: text('nickname').notNull(),
  description: text('description'),
  // Nullable in Phase 5; no UI populates this column. Future phases add upload UI.
  coverImageUrl: text('cover_image_url'),
  isPublic: boolean('is_public').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
})

export type IpNickname = typeof ipNicknames.$inferSelect
export type NewIpNickname = typeof ipNicknames.$inferInsert
