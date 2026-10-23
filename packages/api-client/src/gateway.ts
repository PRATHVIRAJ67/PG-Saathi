/**
 * Original design notes for online payments. The implementation now lives in
 * ./online-payments.ts (client), apps/resident-api/src/payments.ts (server)
 * and supabase/migrations/20261024000100_online_payments.sql: each owner
 * connects their own Razorpay account, the server creates orders from the
 * live bill balance, and a payment is recorded only after the server verifies
 * Razorpay's signature (checkout callback or webhook). These types are kept
 * for reference.
 */
export interface CreateGatewayOrderRequest {
  invoiceId: string;
  /** Optional partial amount; the server caps it at the live balance. */
  amountPaise?: number;
}

export interface GatewayOrder {
  paymentId: string;
  provider: 'razorpay';
  orderId: string;
  amountPaise: number;
  currency: 'INR';
  /** Public key id for Checkout. Never the key secret. */
  publicKeyId: string;
}

export interface PaymentGateway {
  readonly provider: 'razorpay';
  /** Calls the create-order edge function. */
  createOrder(request: CreateGatewayOrderRequest): Promise<GatewayOrder>;
}
