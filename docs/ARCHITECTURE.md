# Architecture

## One application, many businesses

Every PG business is a row in `tenants`. People belong to a business through
`tenant_memberships` (owner, manager, accountant, staff). Residents who
accept an app invitation are linked through `resident_user_links`. A user can
belong to several workspaces. Nothing in the code references a specific
business: names, rooms, rents, plans and settings are all rows.

```text
auth.users ─┬─ profiles
            ├─ tenant_memberships ── tenants ─┬─ tenant_settings, subscriptions → plans
            └─ resident_user_links           ├─ properties ─ rooms ─ beds
                                             ├─ residents ─ stays ─ rent_agreements
                                             ├─ invoices ─ invoice_items
                                             ├─ payments ─ payment_allocations ─ invoices
                                             ├─ deposit_transactions, expenses, charge_templates
                                             └─ invitations, maintenance_tickets, audit_logs
```

## Database-centred API

The clients never write tables. All data access goes through Postgres
functions called over the Supabase Data API (`supabase.rpc`).

- **Writes** (`save_property`, `assign_bed`, `record_payment`, …) are
  `SECURITY DEFINER` with an empty `search_path`. Each one derives the tenant
  from the referenced row, checks the caller's role (`private.require_write`),
  validates input, and writes `audit_logs`.
- **Reads** (`list_residents`, `dashboard_summary`, …) are `SECURITY INVOKER`.
  RLS applies to every table they touch, and they also check membership up
  front, so an unauthorised call fails loudly instead of returning empty data.
- **RLS** exists on every table as the backstop. Direct `SELECT` through
  PostgREST is filtered, and `INSERT/UPDATE/DELETE` are not granted at all.

Keeping the business rules in one place, Postgres, has three benefits:

1. Web and mobile share the exact same behaviour.
2. The same functions run unchanged in PGlite, so demo mode and tests exercise
   real production logic.
3. Integrity holds even if a client is buggy or malicious.

### Money

- All amounts are `bigint` paise. Clients parse rupee input with string
  arithmetic (`rupeesToPaise`), and ESLint forbids `parseFloat`.
- `invoices.paid_paise` is derived from live allocations by trigger and
  `CHECK (paid_paise <= total_paise)`.
- Allocations reference payment and invoice through `(tenant_id, resident_id, …)`
  composite keys, so a payment can only settle its own resident's bills.
  A trigger rejects allocating more than the payment amount.
- Payments carry a per-tenant `idempotency_key`. Retries return the original
  row, and near-identical entries within 10 minutes need explicit confirmation.
- Rent agreements are append-only. Changing rent closes the current agreement
  and opens a new one, and existing invoices are never rewritten.
- Voids keep the row and record who, when and why; allocations are voided,
  not deleted.
- Overdue is derived at query time from `due_date` and IST "today". There is
  no scheduler.

### Rent without cron

`generate_rent_invoices(month)` is an explicit owner action. It is idempotent
because of a partial unique index on `(stay_id, period_start)`. First months
are prorated to whole rupees, and automatic monthly charges are added. Any
advance credit is applied immediately.

## Clients

- `@pg/api-client` exposes `createDataService(transport)`. A transport is
  Supabase RPC (production), PGlite (web demo and tests) or a recorded snapshot
  (read-only mobile demo).
- TanStack Query keys always start with `['tenant', tenantId]`. Switching
  workspace removes the old tenant's cache, and signing out (or a different
  user signing in) clears everything.
- The active workspace is a stored preference that is re-validated against
  `my_context()` on every load; it never grants access by itself.
- Zustand holds only UI state: the selected tenant and property, the sidebar,
  and which dialog is open.

## Demo mode

| Where | How | Writes |
| --- | --- | --- |
| Web apps | Real migrations in PGlite (IndexedDB) and a seed built through the public API | Real; persisted in the browser only |
| Mobile | Snapshot recorded from the same seeded database (`npm run demo:snapshot`) | Refused with an explicit read-only message |

Demo mode is chosen only when Supabase variables are absent, and a banner is
always visible.
