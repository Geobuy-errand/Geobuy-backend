// ============================================================
// Stripe gateway (United Kingdom, GBP) — hosted Checkout
// ============================================================

const Stripe = require('stripe');
const { toMinorUnits, fromMinorUnits } = require('../../utils/money');

let instance = null;
function stripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY is not configured');
  if (!instance) instance = Stripe(process.env.STRIPE_SECRET_KEY);
  return instance;
}

/**
 * One-off payment via Stripe Checkout.
 * `successUrl` may contain {CHECKOUT_SESSION_ID}; it is added automatically if missing.
 */
async function createCheckout({
  amount,
  currency = 'GBP',
  email,
  reference,
  successUrl,
  cancelUrl,
  metadata = {},
  productName = 'GEOBUY Errand',
  description,
}) {
  const withSession = successUrl.includes('{CHECKOUT_SESSION_ID}')
    ? successUrl
    : `${successUrl}${successUrl.includes('?') ? '&' : '?'}session_id={CHECKOUT_SESSION_ID}`;

  const session = await stripe().checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    customer_email: email,
    client_reference_id: reference,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: currency.toLowerCase(),
          unit_amount: toMinorUnits(amount, currency),
          product_data: { name: productName, ...(description ? { description } : {}) },
        },
      },
    ],
    success_url: withSession,
    cancel_url: cancelUrl,
    metadata: { ...metadata, reference },
    payment_intent_data: { metadata: { ...metadata, reference } },
  });

  return { url: session.url, reference: session.id, sessionId: session.id, gateway: 'stripe' };
}

/** Verify a Checkout Session. */
async function verify(sessionId) {
  const session = await stripe().checkout.sessions.retrieve(sessionId);
  return {
    paid: session.payment_status === 'paid',
    status: session.payment_status,
    amount: fromMinorUnits(session.amount_total, session.currency),
    currency: String(session.currency || 'gbp').toUpperCase(),
    reference: session.id,
    paymentIntentId: session.payment_intent,
    metadata: session.metadata || {},
    customerEmail: session.customer_details?.email || session.customer_email,
    paidAt: new Date(),
    raw: session,
  };
}

async function refund(paymentIntentId, amount, currency = 'GBP') {
  const payload = { payment_intent: paymentIntentId };
  if (amount) payload.amount = toMinorUnits(amount, currency);
  const r = await stripe().refunds.create(payload);
  return { id: r.id, status: r.status, raw: r };
}

module.exports = {
  name: 'stripe',
  isConfigured: () => Boolean(process.env.STRIPE_SECRET_KEY),
  client: stripe,
  createCheckout,
  verify,
  refund,
};
