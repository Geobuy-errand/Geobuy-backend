// ============================================================
// Payment gateway selector
//   GB / GBP -> Stripe
//   NG / NGN -> Paystack
// ============================================================

const stripeGateway = require('./stripe');
const paystackGateway = require('./paystack');
const { getCountry, getCountryByCurrency } = require('../../config/countries');

const GATEWAYS = { stripe: stripeGateway, paystack: paystackGateway };

function gatewayForCountry(country) {
  return GATEWAYS[getCountry(country).paymentGateway];
}

function gatewayForCurrency(currency) {
  return GATEWAYS[getCountryByCurrency(currency).paymentGateway];
}

function gatewayByName(name) {
  return GATEWAYS[String(name || '').toLowerCase()] || null;
}

function frontendUrl(path = '') {
  const base = (process.env.FRONTEND_URL || 'http://localhost:5173').split(',')[0].trim().replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * Start a hosted checkout for any one-off payment.
 * @returns {{url, reference, gateway}}
 */
async function startCheckout({ country, amount, currency, email, reference, returnPath, cancelPath, metadata, productName, description }) {
  const c = getCountry(country);
  const gateway = gatewayForCountry(c.code);
  const sep = returnPath.includes('?') ? '&' : '?';

  if (gateway.name === 'paystack') {
    return gateway.createCheckout({
      amount,
      currency: currency || c.currency,
      email,
      reference,
      callbackUrl: frontendUrl(`${returnPath}${sep}gateway=paystack`),
      metadata,
    });
  }

  return gateway.createCheckout({
    amount,
    currency: currency || c.currency,
    email,
    reference,
    successUrl: frontendUrl(`${returnPath}${sep}gateway=stripe&session_id={CHECKOUT_SESSION_ID}`),
    cancelUrl: frontendUrl(cancelPath || returnPath),
    metadata,
    productName,
    description,
  });
}

module.exports = {
  stripe: stripeGateway,
  paystack: paystackGateway,
  gatewayForCountry,
  gatewayForCurrency,
  gatewayByName,
  startCheckout,
  frontendUrl,
};
