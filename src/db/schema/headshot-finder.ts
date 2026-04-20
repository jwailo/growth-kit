import {
  pgTable,
  uuid,
  text,
  timestamp,
  numeric,
  integer,
  jsonb,
} from "drizzle-orm/pg-core";
import { gkAgencies, gkPms } from "./tile-engine";

export const gkAgencyWebsites = pgTable("gk_agency_websites", {
  id: uuid("id").defaultRandom().primaryKey(),
  agencyId: uuid("agency_id")
    .references(() => gkAgencies.id)
    .notNull(),
  websiteUrl: text("website_url").notNull(),
  teamPageUrl: text("team_page_url"),
  scrapeStatus: text("scrape_status").notNull().default("pending"),
  lastScrapedAt: timestamp("last_scraped_at"),
  extractedCount: integer("extracted_count").notNull().default(0),
  matchedCount: integer("matched_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const gkExtractionMisses = pgTable("gk_extraction_misses", {
  id: uuid("id").defaultRandom().primaryKey(),
  agencyWebsiteId: uuid("agency_website_id")
    .references(() => gkAgencyWebsites.id)
    .notNull(),
  scrapedName: text("scraped_name").notNull(),
  pmCandidates: jsonb("pm_candidates").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const gkHeadshotMatches = pgTable("gk_headshot_matches", {
  id: uuid("id").defaultRandom().primaryKey(),
  pmId: uuid("pm_id")
    .references(() => gkPms.id)
    .notNull(),
  agencyWebsiteId: uuid("agency_website_id")
    .references(() => gkAgencyWebsites.id)
    .notNull(),
  scrapedName: text("scraped_name").notNull(),
  scrapedImageUrl: text("scraped_image_url").notNull(),
  storedImageUrl: text("stored_image_url"),
  confidence: text("confidence").notNull(),
  matchScore: numeric("match_score").notNull(),
  status: text("status").notNull().default("pending_review"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
