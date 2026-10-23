# Status

Legend: **Done** means implemented and covered by tests or by an end-to-end
run. **Partial** means it works but has a stated gap. **Not started** means
it is designed or prepared but not built.

## Platform and data

| Area | State | Notes |
| --- | --- | --- |
| Multi-tenant schema, composite tenant foreign keys, RLS | Done | `supabase/migrations`, `supabase/tests/tenant-isolation.test.ts` |
| Audited write API, invoker read API | Done | |
| Self-service provisioning (idempotent, verified-only) | Done | |
| Roles: owner, manager, accountant, staff, resident | Done | Property-scoped staff access is not modelled yet |
| Plans, limits enforced server-side | Done | Plans are DB rows editable in super-admin |
| Invitations (staff and resident) | Partial | Owners copy and share the link; emails are not sent automatically |
| Audit log | Done | |
| Storage buckets and policies | Partial | Policies written; tested only in Supabase, not in PGlite. Used for logos and expense receipts. Resident document upload UI is not built yet |
| Maintenance tickets | Not started | Table and RLS exist; no API or UI yet |
| Online payments (Razorpay) | Partial | Each owner connects their own Razorpay keys (Settings → Online payments); residents pay from the app and payments are recorded after server-side verification. UPI QR stays as the manual option. Needs the migration applied and the Worker redeployed; not yet tried against real Razorpay test keys |
| Subscription billing | Not started | Plans are assigned manually by platform admins |
| Notifications and reminders | Not started | Out of scope (no schedulers); preferences column reserved |

## Owner web dashboard

| Feature | State |
| --- | --- |
| Sign up, verify email, sign in, email-code sign-in, password reset | Done |
| Onboarding wizard (business → property → rooms/beds → rent → residents → finish), resumable | Done |
| Overview: KPIs, 6-month chart, payments, dues, check-ins, occupancy, quick actions, checklist | Done |
| Properties: list, detail, create, edit, archive | Done |
| Rooms and beds: grid and table, filters, add single or range, edit room or bed, unavailable, delete | Done |
| Residents: directory, search, filters, profile, ledger, stays, deposits, assign, transfer, move-out, change rent, invite | Done |
| Rent: generate month, manual bills, filters, printable bill, void | Done |
| Payments: record (allocation preview, idempotent, duplicate guard), list, printable receipt, void | Done |
| Deposits, expenses (receipt upload with Supabase) | Done |
| Reports: collection, outstanding, occupancy, expenses, property income; CSV export and print | Done |
| Settings: business, billing, charges, lists, team, plan and usage, activity, profile | Done |
| Resident portal (read-only, for invited residents) | Done |
| Dark mode | Not started (light mode first, per brief) |

## Mobile app (Expo, Android first)

| Feature | State |
| --- | --- |
| Sign in, sign up, compact onboarding (business, property, room range) | Done |
| Home, Properties (with bed tiles), Residents, Payments, More tabs | Done |
| Resident detail, record payment, add resident, assign bed, move out, add expense, rent generation, expenses | Done |
| Demo mode | Partial: read-only snapshot (PGlite does not run on Hermes) |
| Native device testing | Not done: verified by Android bundle export and react-native-web at phone size only |
| Date pickers | Partial: ISO text fields; a native date picker would be friendlier |

## Super-admin

Overview, tenants (search, filter, detail, suspend or reactivate with a
reason, manual plan change), plans editor, audit log and platform settings:
**Done**.

## Verification on the last run

- `npm run typecheck`: 0 errors across 10 workspaces.
- `npm run lint`: 0 problems.
- `npm test`: 49 tests (unit, plus database isolation, roles, provisioning and finance).
- `npm run build`: both web apps and the Android JS bundle succeed.
- `npm run test:e2e`: 6 Playwright scenarios (owner onboarding with a second
  isolated owner, payments updating totals, demo pages and phone-width
  layout, super-admin, mobile).

## Next steps

1. Apply the migrations to a real Supabase project and repeat the isolation
   checks over HTTP (see `docs/OPERATIONS.md`).
2. Device QA on Android: keyboard handling, safe areas and back navigation.
3. Automated invitation emails (explicitly triggered, through an Edge Function).
4. Resident document uploads, and maintenance tickets UI.
5. Property-scoped manager or staff access.
6. Razorpay phase, following `supabase/functions/README.md`.
7. Route-level code splitting for the owner dashboard (main chunk is about 950 kB).
