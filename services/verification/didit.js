// Didit — the one vendor for both countries.  https://docs.didit.me
//
// NIGERIA — NIN check against NIMC (no document upload, instant):
//   POST https://verification.didit.me/v3/database-validation/   header x-api-key, multipart form
//     issuing_state=NGA, services=nga_national_id, first_name, last_name, national_id, date_of_birth?, vendor_data?
//   -> { status: Approved | In Review | Declined, match_type: full_match | partial_match | no_match, validations: [...] }
//
// UK — ID document + selfie (hosted session):
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

/**
 * Nigeria: check a NIN against the NIMC database. Didit compares the name
 * (and date of birth, when given) itself. Only needs DIDIT_API_KEY.
 * Returns { status: 'approved' | 'in_review' | 'declined', vendorStatus, matchType, nameScore, recordName }.
 */
async function validateNin({ nin, firstName, lastName, dateOfBirth, vendorData }) {
  const apiKey = process.env.DIDIT_API_KEY;
  if (!apiKey) {
    const err = new Error('Didit is not configured (DIDIT_API_KEY)');
    err.code = 'VERIFICATION_NOT_CONFIGURED';
    throw err;
  }
  const form = new FormData();
  form.append('issuing_state', 'NGA');
  form.append('services', 'nga_national_id');
  form.append('first_name', firstName);
  form.append('last_name', lastName);
  form.append('national_id', String(nin));
  if (dateOfBirth) form.append('date_of_birth', dateOfBirth);
  if (vendorData) form.append('vendor_data', String(vendorData));

  let data;
  try {
    ({ data } = await axios.post(`${BASE()}/v3/database-validation/`, form, {
      headers: { 'x-api-key': apiKey },
      timeout: 20000,
    }));
  } catch (error) {
    const err = new Error(error.response?.data?.detail || error.response?.data?.message || error.message || 'Didit request failed');
    err.code = 'VERIFICATION_VENDOR_ERROR';
    throw err;
  }

  const v = (data?.validations || []).find((x) => x.service_id === 'nga_national_id') || data?.validations?.[0] || {};
  const matchType = String(data?.match_type || '').toLowerCase();
  const outcome = String(v.outcome_code || '').toUpperCase();
  const vendorStatus = data?.status || '';
  const s = vendorStatus.toLowerCase();

  let status;
  if (s === 'approved' || (matchType === 'full_match' && outcome === 'MATCH')) status = 'approved';
  else if (s === 'declined' || matchType === 'no_match' || outcome === 'NO_MATCH') status = 'declined';
  else status = 'in_review'; // partial match / In Review

  const src = v.source_data || {};
  const real = (x) => (x && x !== 'NO_MATCH' ? x : '');
  return {
    status,
    vendorStatus,
    matchType,
    nameScore: src.name_match_score,
    recordFirstName: real(src.first_name),
    recordLastName: real(src.last_name),
    recordFullName: real(src.full_name),
    ninMatched: v.validation?.identification_number ? v.validation.identification_number !== 'no_match' : outcome !== 'NO_MATCH',
  };
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

module.exports = { validateNin, createSession, getDecision, normaliseDecision, statusFor, verifyWebhookSignature, name: 'didit' };
