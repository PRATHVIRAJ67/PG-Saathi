import { AppError } from './errors';

/**
 * Online rent payments through each owner's own Razorpay account. Calls the
 * payments service (apps/resident-api), which holds no keys in the apps: it
 * reads the owner's keys from the database, talks to Razorpay, and records a
 * payment only after verifying it.
 */
export interface OnlinePaymentsService {
  readonly available: boolean;
  /** Owner: check the keys with Razorpay and save them. */
  connect(input: { tenantId: string; keyId: string; keySecret: string; webhookSecret?: string | null }): Promise<{ mode: 'test' | 'live' }>;
  /** Resident: start paying a bill. Returns the hosted checkout page to open. */
  startCheckout(invoiceId: string, returnUrl?: string): Promise<{ orderId: string; amountPaise: number; checkoutUrl: string }>;
  /** The URL owners paste into Razorpay → Webhooks. */
  webhookUrl(tenantId: string): string;
}

const NOT_CONFIGURED = 'Online payments are not set up for this app. Set the payments service URL (see README).';

export const unavailableOnlinePayments: OnlinePaymentsService = {
  available: false,
  async connect() {
    throw new AppError('not_supported', NOT_CONFIGURED);
  },
  async startCheckout() {
    throw new AppError('not_supported', NOT_CONFIGURED);
  },
  webhookUrl: () => '',
};

export function createOnlinePaymentsClient(baseUrl: string, getAccessToken: () => Promise<string | null>): OnlinePaymentsService {
  const base = baseUrl.replace(/\/$/, '');
  async function post<T>(path: string, body: object): Promise<T> {
    const token = await getAccessToken();
    if (!token) throw new AppError('not_authenticated', 'Your session has expired. Please sign in again.');
    let res: Response;
    try {
      res = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (error) {
      throw new AppError('network', 'Could not reach the payments service. Check your connection and try again.', { cause: error });
    }
    const json = (await res.json().catch(() => ({}))) as { error?: { code: string; message: string } } & T;
    if (!res.ok || json.error) throw new AppError(json.error?.code ?? 'unknown', json.error?.message ?? 'Something went wrong. Please try again.');
    return json;
  }
  return {
    available: true,
    connect: ({ tenantId, keyId, keySecret, webhookSecret }) =>
      post<{ mode: 'test' | 'live' }>('/payments/connect', { tenant_id: tenantId, key_id: keyId, key_secret: keySecret, webhook_secret: webhookSecret ?? null }),
    async startCheckout(invoiceId, returnUrl) {
      const r = await post<{ order_id: string; amount_paise: number; checkout_url: string }>('/payments/order', { invoice_id: invoiceId, return_url: returnUrl ?? null });
      return { orderId: r.order_id, amountPaise: r.amount_paise, checkoutUrl: r.checkout_url };
    },
    webhookUrl: (tenantId) => `${base}/razorpay/webhook/${tenantId}`,
  };
}
