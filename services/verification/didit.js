// Didit — UK ID document + selfie (hosted session).  https://docs.didit.me
//   POST https://verification.didit.me/v3/session/   header x-api-key
//     body { workflow_id, vendor_data, callback } -> { session_id, url, session_token }
//   GET  https://verification.didit.me/v3/session/{id}/decision/   -> { status, id_verification, ... }
//   Webhook: header X-Signature = HMAC-SHA256(raw body, DIDIT_WEBHOOK_SECRET), hex
const axios = require('axios');
const crypto = require('crypto');

const BASE = () => (process.env.DIDIT_BASE_URL || 'https://verification.didit.me').replace(/\/$/, '');

function config() {
  const apiKey = process.env.DIDIT_API_KEY;
  const workflowId = process.env.DIDIT_WORKFLOW_ID;
  if (!apiKey || !workflowId) {
    const err = new Error('Didit is not configured (DIDIT_API_KEY / DIDIT_WORKFLOW_ID)');
    err.code = 'VERIFICATION_NOT_CONFIGURED';
    throw err;
  }
  return { apiKey, workflowId };
}

async function createSession({ vendorData, callbackUrl }) {
  const { apiKey, workflowId } = config();
  try {
    const { data } = await axios.post(
      `${BASE()}/v3/session/`,
      { workflow_id: workflowId, vendor_data: vendorData, callback: callbackUrl },
      { headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' }, timeout: 20000 }
    );
    return { sessionId: data.session_id, url: data.url || data.verification_url };
  } catch (error) {
    const err = new Error(error.response?.data?.detail || error.response?.data?.message || error.message || 'Didit request failed');
    err.code = 'VERIFICATION_VENDOR_ERROR';
    throw err;
  }
}

async function getDecision(sessionId) {
  const { apiKey } = config();
  const { data } = await axios.get(`${BASE()}/v3/session/${encodeURIComponent(sessionId)}/decision/`, {
    headers: { 'x-api-key': apiKey },
    timeout: 20000,
  });
  return normaliseDecision(data);
}

/** Map a Didit decision / webhook body to our fields. */
function normaliseDecision(data = {}) {
  const idv = data.id_verification || data.decision?.id_verification || {};
  return {
    sessionId: data.session_id || data.decision?.session_id,
    vendorStatus: data.status || data.decision?.status || '',
    vendorData: data.vendor_data || data.decision?.vendor_data,
    firstName: idv.first_name || '',
    lastName: idv.last_name || '',
    dateOfBirth: idv.date_of_birth || '',
  };
}

/** Our status for a Didit status. */
function statusFor(vendorStatus = '') {
  const s = String(vendorStatus).toLowerCase();
  if (s === 'approved') return 'approved';
  if (s === 'declined') return 'declined';
  if (s === 'in review' || s === 'in_review') return 'in_review';
  if (s === 'abandoned' || s === 'expired' || s === 'kyc expired') return 'cancelled';
  return 'pending'; // Not Started, In Progress, …
}

function verifyWebhookSignature(rawBody, signature) {
  const secret = process.env.DIDIT_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { createSession, getDecision, normaliseDecision, statusFor, verifyWebhookSignature, name: 'didit' };
