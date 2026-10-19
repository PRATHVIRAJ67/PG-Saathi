# Security model

## Tenant isolation

- **Membership is the only source of access.** Helpers such as
  `private.member_tenant_ids()` read `tenant_memberships` for `auth.uid()`.
  A tenant id sent by a client is accepted only after `private.require_role`
  or `private.require_write` confirms an active membership. Non-members get
  "not found", which does not reveal that the tenant exists.
- **RLS is enabled on every table.** Policies use set-returning helper
  functions evaluated once per query.
- **No client table writes.** `anon` has no table privileges, and
  `authenticated` has `SELECT` only. Every write is an audited function.
- **Composite foreign keys** (`tenant_id, …`) make cross-tenant references
  impossible even for a privileged writer. Examples: a stay pointing at
  another tenant's bed, or an invoice pointing at another tenant's property.
  A trigger also forbids changing `tenant_id` after insert.
- **Residents** see only their own resident row, stays, invoices, payments and
  deposits, via `resident_user_links`.
- **Platform admins** (`platform_admins`, insertable only with SQL) use
  separate `admin_*` functions that return aggregates and business metadata.
  They have no membership, so RLS hides resident and financial records from
  them. Every admin change requires a reason and is audited.

## Roles

| Capability | Owner | Manager | Accountant | Staff |
| --- | :-: | :-: | :-: | :-: |
| Settings, team, plan | ✓ | | | |
| Properties, rooms, residents, stays | ✓ | ✓ | | |
| Bills, payments, deposits, expenses | ✓ | ✓ | ✓ | |
| Void payments or bills, delete expenses | ✓ | ✓ | | |
| View properties, rooms, residents | ✓ | ✓ | ✓ | ✓ |

The same matrix exists in `@pg/shared` (`can()`), but only to decide what the
UI shows. The database enforces it.

## Provisioning

`provision_workspace` requires a confirmed email or phone and runs under a
per-user advisory lock. It is idempotent on a client request id that the
client persists across retries. It also resumes an unfinished workspace
instead of creating a duplicate, and caps each account at 5 workspaces. Roles
are assigned server-side: the creator always becomes `owner`, and nothing a
client sends can grant super-admin.

## Invitations

Invitation tokens are 64 hex characters. Only their SHA-256 hash is stored.
They expire after 7 days and can be used once. They are bound to the invited
email, which must be verified. Revoking or re-inviting invalidates earlier
tokens. Each workspace is limited to 30 invitations per hour.

## Secrets

- Clients receive only the publishable (anon) key. `createSupabaseBackend`
  refuses JWTs with `role: service_role` and `sb_secret_` keys.
- Future payment secrets belong in Supabase function secrets (see
  `supabase/functions/README.md`).
- `.env*` files are git-ignored, apart from the examples.

## Storage

The `tenant-assets` and `tenant-documents` buckets are private, with size and
MIME limits. Paths must start with the tenant id. Policies check membership
(and finance roles for documents), and clients read files through
short-lived signed URLs.

## Rate limiting

- Supabase Auth applies its own rate limits to sign-up, OTP and password reset.
- The database limits invitation creation (30 per hour per workspace) and
  workspace creation (5 per account).
- Payment recording is protected by idempotency keys and a duplicate guard.

There is no general-purpose API rate limiter yet; add one at the edge (for
example Cloudflare or Supabase network restrictions) before a public launch.

## How it is tested

`supabase/tests` runs the real migrations in PGlite (Postgres 17) and
switches between separate authenticated identities exactly as PostgREST does.
It covers:

- cross-tenant reads and writes, including raw SQL against RLS;
- composite foreign keys;
- staff, accountant and resident limits;
- self-granting super-admin;
- idempotent provisioning, server-side plan limits and double bed allocation;
- the financial rules.

These tests have not yet been run against a hosted Supabase project; do that
before launch (see `docs/OPERATIONS.md`).

## Known advisories

`npm audit` reports issues in build-time tooling only:

- `braces`/`micromatch` and `node-forge` via Expo/Metro;
- `uuid` via Expo;
- `@vitest/mocker` (a dev-only test runner).

None of these ship in the web bundles. The suggested `--force` fixes would
downgrade Expo to SDK 44, so they were not applied. Re-check when Expo and
Vitest publish patched releases.
