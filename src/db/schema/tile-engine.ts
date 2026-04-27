import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  numeric,
  boolean,
} from "drizzle-orm/pg-core";

export const gkAgencies = pgTable("gk_agencies", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  displayName: text("display_name"),
  logoUrl: text("logo_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const gkPms = pgTable("gk_pms", {
  id: uuid("id").defaultRandom().primaryKey(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email"),
  agencyId: uuid("agency_id")
    .references(() => gkAgencies.id)
    .notNull(),
  headshotUrl: text("headshot_url"),
  optedOut: boolean("opted_out").notNull().default(false),
  optedOutAt: timestamp("opted_out_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const gkTileRuns = pgTable("gk_tile_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  period: text("period").notNull(),
  status: text("status").notNull().default("processing"),
  totalPms: integer("total_pms").notNull().default(0),
  tilesGenerated: integer("tiles_generated").notNull().default(0),
  missingAssets: integer("missing_assets").notNull().default(0),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const gkTileRecords = pgTable("gk_tile_records", {
  id: uuid("id").defaultRandom().primaryKey(),
  runId: uuid("run_id")
    .references(() => gkTileRuns.id)
    .notNull(),
  pmId: uuid("pm_id")
    .references(() => gkPms.id)
    .notNull(),
  agencyName: text("agency_name").notNull(),
  responseTimeMins: numeric("response_time_mins").notNull(),
  tileUrlSquare: text("tile_url_square"),
  tileUrlSquareNamed: text("tile_url_square_named"),
  tileUrlIg: text("tile_url_ig"),
  tileUrlIgNamed: text("tile_url_ig_named"),
  status: text("status").notNull().default("pending"),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
