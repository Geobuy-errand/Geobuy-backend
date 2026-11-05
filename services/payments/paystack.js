// ============================================================
// Paystack gateway (Nigeria, NGN)
// Docs: https://paystack.com/docs/api/
// ============================================================

const axios = require('axios');
const crypto = require('crypto');
const { toMinorUnits, fromMinorUnits } = require('../../utils/money');

const BASE_URL = 'https://api.paystack.co';

function secretKey() {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error('PAYSTACK_SECRET_KEY is not configured');
  return key;
}

function client() {
  return axios.create({
    baseURL: BASE_URL,
    timeout: 20000,
    headers: { Authorization: `Bearer ${secretKey()}`, 'Content-Type': 'application/json' },
  });
}

async function call(method, url, data, params) {
  try {
    const res = await client().request({ method, url, data, params });
    if (res.data?.status === false) throw new Error(res.data?.message || 'Paystack request failed');
    return res.data?.data;
  } catch (err) {
    const message = err.response?.data?.message || err.message;
    const e = new Error(`Paystack: ${message}`);
    e.status = err.response?.status;
    e.paystack = err.response?.data;
    throw e;
  }
}

/** Paystack references: letters, numbers, '-', '_' and '.' only. */
function makeReference(prefix = 'GEO') {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
}

/**
 * Start a payment. Returns the hosted checkout URL.
 * Pass `plan` (a Paystack plan code) to start a subscription instead.
 */
async function createCheckout({ amount, currency = 'NGN', email, reference, callbackUrl, metadata = {}, plan }) {
  const payload = {
    email,
    amount: toMinorUnits(amount, currency),
    currency,
    reference,
    callback_url: callbackUrl,
    metadata,
    channels: ['card', 'bank', 'ussd', 'bank_transfer', 'mobile_money'],
  };
  if (plan) payload.plan = plan;
  const data = await call('post', '/transaction/initialize', payload);
  return { url: data.authorization_url, reference: data.reference, accessCode: data.access_code, gateway: 'paystack' };
}

/** Verify a payment by reference. */
async function verify(reference) {
  const data = await call('get', `/transaction/verify/${encodeURIComponent(reference)}`);
  return {
    paid: data.status === 'success',
    status: data.status,
    amount: fromMinorUnits(data.amount, data.currency),
    currency: data.currency,
    reference: data.reference,
    metadata: typeof data.metadata === 'string' ? safeJson(data.metadata) : data.metadata || {},
    customerEmail: data.customer?.email,
    customerCode: data.customer?.customer_code,
    planCode: data.plan_object?.plan_code || (typeof data.plan === 'string' ? data.plan : data.plan?.plan_code),
    paidAt: data.paid_at ? new Date(data.paid_at) : new Date(),
    raw: data,
  };
}

async function refund(reference, amount, currency = 'NGN') {
  const payload = { transaction: reference };
  if (amount) payload.amount = toMinorUnits(amount, currency);
  const data = await call('post', '/refund', payload);
  return { id: data?.id, status: data?.status, raw: data };
}

// ---------------- Banks & payouts ----------------

let bankCache = { at: 0, banks: [] };
async function listBanks() {
  if (bankCache.banks.length && Date.now() - bankCache.at < 24 * 60 * 60 * 1000) return bankCache.banks;
  const data = await call('get', '/bank', undefined, { country: 'nigeria', currency: 'NGN', perPage: 200 });
  const banks = (data || [])
    .filter((b) => b.active !== false && !b.is_deleted)
    .map((b) => ({ name: b.name, code: b.code, slug: b.slug, type: b.type }))
    .sort((a, b) => a.name.localeCompare(b.name));
  bankCache = { at: Date.now(), banks };
  return banks;
}

/** Confirm a NUBAN account and get the account holder's name. */
async function resolveAccount(accountNumber, bankCode) {
  const data = await call('get', '/bank/resolve', undefined, { account_number: accountNumber, bank_code: bankCode });
  return { accountName: data.account_name, accountNumber: data.account_number, bankId: data.bank_id };
}

async function createTransferRecipient({ name, accountNumber, bankCode }) {
  const data = await call('post', '/transferrecipient', {
    type: 'nuban',
    name,
    account_number: accountNumber,
    bank_code: bankCode,
    currency: 'NGN',
  });
  return { recipientCode: data.recipient_code, details: data.details };
}

/** Send money from the Paystack balance to a recipient. */
async function transfer({ amount, recipientCode, reference, reason }) {
  const data = await call('post', '/transfer', {
    source: 'balance',
    amount: toMinorUnits(amount, 'NGN'),
    recipient: recipientCode,
    reference,
    reason: reason || 'GEOBUY payout',
  });
  return { status: data.status, transferCode: data.transfer_code, reference: data.reference, raw: data };
}

// ---------------- Subscriptions ----------------

const INTERVALS = { month: 'monthly', year: 'annually' };

async function createPlan({ name, amount, interval = 'month', description }) {
  const data = await call('post', '/plan', {
    name,
    amount: toMinorUnits(amount, 'NGN'),
    interval: INTERVALS[interval] || 'monthly',
    currency: 'NGN',
    description,
  });
  return { planCode: data.plan_code };
}

async function updatePlan(planCode, { name, amount, interval, description }) {
  const payload = {};
  if (name) payload.name = name;
  if (amount !== undefined) payload.amount = toMinorUnits(amount, 'NGN');
  if (interval) payload.interval = INTERVALS[interval] || 'monthly';
  if (description !== undefined) payload.description = description;
  // Paystack keeps existing subscribers on their old amount unless told otherwise.
  payload.update_existing_subscriptions = false;
  await call('put', `/plan/${encodeURIComponent(planCode)}`, payload);
  return { planCode };
}

async function fetchSubscription(code) {
  return call('get', `/subscription/${encodeURIComponent(code)}`);
}

async function disableSubscription(code, token) {
  return call('post', '/subscription/disable', { code, token });
}

async function enableSubscription(code, token) {
  return call('post', '/subscription/enable', { code, token });
}

/** Verify the x-paystack-signature header against the raw request body. */
function verifyWebhookSignature(rawBody, signature) {
  if (!signature || !rawBody) return false;
  const hash = crypto.createHmac('sha512', secretKey()).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(String(signature)));
  } catch (e) {
    return false;
  }
}

function safeJson(s) {
  try {
    return JSON.parse(s);
  } catch (e) {
    return {};
  }
}

module.exports = {
  name: 'paystack',
  isConfigured: () => Boolean(process.env.PAYSTACK_SECRET_KEY),
  makeReference,
  createCheckout,
  verify,
  refund,
  listBanks,
  resolveAccount,
  createTransferRecipient,
  transfer,
  createPlan,
  updatePlan,
  fetchSubscription,
  disableSubscription,
  enableSubscription,
  verifyWebhookSignature,
};
