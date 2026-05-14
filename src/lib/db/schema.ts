import { sql } from 'drizzle-orm'
import { check, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

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
