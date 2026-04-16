# Growth Kit

Internal marketing/growth tools platform for Ailo.

## Stack
- Next.js (App Router), TypeScript, Tailwind, shadcn/ui
- Drizzle ORM + Supabase (tables prefixed gk_)
- Vercel deployment

## Conventions
- All new tools are routes under src/app/(tools)/
- Supabase tables prefixed gk_
- Ailo brand: Red #EE0B4F, Charcoal #292B32, Space Black #1C1E26, Pink #FEF7F9, Cloud #F7F7F7
- Font: Helvetica Neue / Helvetica / Arial / sans-serif
- Australian spelling, no em dashes
- All server-side Supabase queries MUST include explicit user filters (lesson from ASET cross-user contamination bug)

## Adding a New Tool
1. Create route directory: src/app/(tools)/[tool-name]/
2. Add nav entry in src/components/sidebar.tsx
3. Create Drizzle schema in src/db/schema/[tool-name].ts
4. Run drizzle-kit push to apply schema
