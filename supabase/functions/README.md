# Edge Functions

No Supabase Edge Functions are deployed. Everything runs as Postgres
functions called through the Data API (see `../migrations`), plus one small
Cloudflare Worker, `apps/resident-api`, for the things that need a server
secret. No cron jobs, queues or schedulers exist; this is intentional.

## Online payments (Razorpay, owner's own account)

Implemented in `apps/resident-api/src/payments.ts` and
`../migrations/20261024000100_online_payments.sql`.

| Route | Purpose |
| --- | --- |
| `POST /payments/connect` | Owner pastes their Razorpay Key ID and Secret (and optionally a webhook secret). The Worker checks them with Razorpay, then stores them through `gateway_save_credentials` (service_role only). |
| `POST /payments/order` | Resident starts paying a bill. `gateway_prepare_order` re-reads the live balance, the Worker creates the Razorpay order with the owner's keys and records it with `gateway_register_order`. Returns a hosted checkout URL. |
| `GET /pay/:orderId` | Hosted Razorpay Checkout page. Only the key id reaches the page, never the secret. |
| `POST /payments/confirm` | Checkout callback. Verifies `HMAC_SHA256(order_id|payment_id, key_secret)`, re-fetches the payment from Razorpay (capturing it if only authorised) and records it with `gateway_complete_order`. |
| `POST /razorpay/webhook/:tenantId` | Razorpay webhook, set up by the owner in their Razorpay dashboard (events `payment.captured`, `order.paid`). Verifies `X-Razorpay-Signature` with the owner's webhook secret. |

Rules enforced by the schema:

- keys live in `private.payment_gateways`, which no client role can read;
- a payments row is created only by `gateway_complete_order`, as
  `source = 'gateway'`, `status = 'succeeded'` with `gateway_verified_at`;
- `(gateway_provider, gateway_payment_id)` is unique and the order row is
  locked, so the checkout callback and the webhook arriving together record
  one payment;
- the frontend never marks anything as paid; it only refreshes data.

The Worker's only secret is `SUPABASE_SECRET_KEY` (`npx wrangler secret put SUPABASE_SECRET_KEY`).
Owners' Razorpay keys are data in the database, not Worker secrets.
