import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const client = postgres(process.env.DATABASE_URL!, {
  // Required for Supabase Transaction Pooler (port 6543): pgBouncer in
  // transaction mode doesn't support prepared statements.
  prepare: false,
  max: 1,
  idle_timeout: 20,
});

export const db = drizzle(client);
