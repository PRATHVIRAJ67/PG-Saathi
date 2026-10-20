# PG Sathi: multi-tenant PG management SaaS

One application, many independent PG businesses. Owners sign up, create
their own workspace, configure properties, rooms and beds, add residents, bill
rent and record payments, without anyone at the platform creating anything for
them. Every business's data is isolated in Supabase Postgres by Row Level
Security and by composite foreign keys.

| App | Path | Stack |
| --- | --- | --- |
| Owner web dashboard | `apps/owner-dashboard` | React 19, Vite 7, Tailwind 4, Radix, TanStack Query/Table, Recharts |
| Owner mobile app | `apps/mobile` | Expo SDK 58, React Native 0.88, Expo Router, Reanimated |
| Platform super-admin | `apps/super-admin` | React 19, Vite 7, Tailwind 4 |

| Package | Purpose |
| --- | --- |
| `supabase/` | SQL migrations (schema, RLS, API functions), production seed, database tests |
| `packages/shared` | Domain types, money (integer paise) and date utilities, permissions |
| `packages/validation` | Zod form schemas shared by web and mobile |
| `packages/api-client` | Typed data service over RPC, Supabase backend, React Query hooks |
| `packages/demo-db` | Runs the real migrations in PGlite (Postgres in WASM) for demo mode and tests |
| `packages/design-tokens` | Colours, spacing, typography (Tailwind theme and RN tokens) |
| `packages/ui-web` | Shared web UI primitives |

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/SECURITY.md](docs/SECURITY.md),
[docs/OPERATIONS.md](docs/OPERATIONS.md) and [docs/STATUS.md](docs/STATUS.md).

## Quick start (demo mode, no accounts needed)

Requires Node 20.19+ (tested on Node 22) and npm 10.

```bash
npm install
npm run dev:owner     # http://localhost:5173
npm run dev:admin     # http://localhost:5174
npm run dev:mobile    # Expo dev server (press a for Android, or scan with Expo Go)
```

Without Supabase variables the apps start in **demo mode**:

- **Web apps:** the real database schema runs in your browser via PGlite,
  seeded with a fictional sample business. You can open the sample workspace,
  or sign up as a brand-new owner and go through onboarding. Data stays in
  the browser (IndexedDB). A banner shows this, and "Reset" wipes it.
  - Sample owner: `owner@demo.pgsaas.local` / `demo-owner-2026`
  - Demo platform admin (super-admin app): `admin@demo.pgsaas.local` / `demo-admin-2026`
- **Mobile:** PGlite cannot run on Hermes, so the mobile demo is a
  **read-only** snapshot of the same sample data. Any write shows an explicit
  "read-only demo" message; nothing fakes success. Regenerate the snapshot
  with `npm run demo:snapshot`.

Production builds refuse to start without Supabase configuration unless
`VITE_ENABLE_DEMO=true`. The apps never silently fall back from Supabase to
demo data.

## Connect Supabase

1. **Create a Supabase project** (Postgres 15 or newer).
2. **Apply the migrations** in `supabase/migrations`, in filename order, then
   run `supabase/seed.sql`. It creates only subscription plans; it never
   creates businesses, residents or money records.
   - With the Supabase CLI: `supabase link --project-ref <ref>`, then
     `supabase db push`, then run `seed.sql` in the SQL editor.
   - Without the CLI: paste each migration into the SQL editor in order,
     then `seed.sql`.
3. **Auth settings** (Dashboard → Authentication):
   - Enable the Email provider with **Confirm email** turned on.
     Workspaces can only be created by verified accounts.
   - Site URL: your owner-dashboard URL. Redirect URLs: `<owner-url>/auth/callback`
     and `<owner-url>/reset-password`. For local work use `http://localhost:5173/...`.
4. **Data API** (Dashboard → Settings → API): keep the exposed schemas to
   `public` (and `graphql_public`). Do **not** expose `private`.
5. **Environment variables.** Copy `.env.example` into each app:

   ```bash
   # apps/owner-dashboard/.env and apps/super-admin/.env
   VITE_SUPABASE_URL=https://<ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<publishable/anon key>
   # apps/mobile/.env
   EXPO_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=<publishable/anon key>
   ```

   Only the publishable (anon) key goes in clients. The apps refuse to start
   if given a service-role or secret key.
6. **Make yourself a platform admin.** This happens only through SQL, never
   through the app. See [docs/OPERATIONS.md](docs/OPERATIONS.md).

## Commands

| Command | What it does |
| --- | --- |
| `npm run typecheck` | Strict TypeScript across every workspace |
| `npm run lint` | ESLint (flat config) over the monorepo |
| `npm test` | Unit tests plus database tests (real migrations in PGlite, multiple authenticated identities) |
| `npm run test:db` | Database tests only |
| `npm run test:e2e` | Playwright: owner onboarding, two-owner isolation, payments, super-admin, mobile (via react-native-web), phone-width layout |
| `npm run build` | Production builds of both web apps and the Android JS bundle |
| `npm run demo:snapshot` | Re-record the mobile demo snapshot |
| `npm run check` | typecheck + lint + test + build |

Run `npx playwright install chromium` once before the end-to-end tests.

## Project layout

```text
apps/
  owner-dashboard/   web dashboard (src/features/* per area)
  super-admin/       platform admin
  mobile/            Expo app (app/ = routes, src/ = ui kit, session, backend)
packages/            shared, validation, api-client, demo-db, design-tokens, ui-web
supabase/
  migrations/        schema → security → API (write) → API (read) → admin → storage
  seed.sql           subscription plans only
  tests/             tenant isolation, roles, provisioning, finance
  functions/         planned Razorpay functions (design only)
e2e/                 Playwright specs
scripts/             demo snapshot builder, static server for e2e
docs/                architecture, security, operations, status
```
