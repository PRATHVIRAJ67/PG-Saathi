# Operations

## Grant platform-admin access

Run this in the Supabase SQL editor (it runs as `postgres`):

```sql
insert into public.platform_admins (user_id, note)
select id, 'Founder' from auth.users where email = 'you@example.com';
```

Revoke access with `delete from public.platform_admins where user_id = …;`.
There is no API path that can grant this, by design.

## Migrations

- Files in `supabase/migrations` are applied in filename order and are
  forward-only. Add new files; never edit applied ones.
- Run `npm run test:db` before pushing. It applies every migration to a
  fresh PGlite database and runs the isolation and finance suites.
- New tables need four things: `tenant_id`, a `unique (tenant_id, id)` for
  child foreign keys, RLS enabled with a select policy, and the
  `prevent_tenant_change` trigger. Writes go through a
  `SECURITY DEFINER` function that calls `private.require_write`.
- New functions in `public` are executable by `authenticated` only (see
  the final grants in `20261019000800_platform_admin.sql`). Re-run that grant
  block, or include equivalent grants, in later migrations.

## Pre-launch checklist

1. Apply the migrations and `seed.sql` to a staging project, then run the
   e2e flows against staging with real email confirmation.
2. Check RLS with two real accounts: sign up owner A and owner B, and confirm
   B cannot read A through the REST endpoints
   (`/rest/v1/residents`, `/rest/v1/rpc/get_resident`).
3. Run the Supabase Security and Performance Advisors and fix any findings.
4. Set the Auth Site URL and redirect URLs for production domains.
5. Configure custom SMTP for auth emails. The built-in sender has very low
   limits.
6. Enable Point-in-Time Recovery (see below).

## Backups and recovery

- Hosted Supabase takes daily backups on paid plans. Enable **Point-in-Time
  Recovery** for production; financial data needs minute-level recovery.
- For an independent logical backup, run `supabase db dump --data-only > backup.sql`
  (or `pg_dump` with the connection string) on a schedule from your own
  infrastructure, and store the dumps encrypted outside Supabase.
- Restore drill, at least quarterly: restore into a new project, run
  `npm run test:db` against the schema, and spot-check one tenant's ledger
  totals (`dashboard_summary`) against the source.
- Tenants are never hard-deleted. `ON DELETE RESTRICT` on financial rows
  prevents it. Offboarding sets `tenants.status = 'cancelled'` through the
  super-admin app.

## Logging

- Business events are written to `audit_logs`: provisioning, settings, money
  movements, voids with reasons, deposit changes, membership changes and
  admin actions.
- Audit details record amounts and identifiers, not resident personal data.
  Deleted expenses keep a snapshot so the deletion stays traceable.
- Clients show user-facing messages only. Raw database errors are mapped by
  `toAppError` and never shown verbatim.
