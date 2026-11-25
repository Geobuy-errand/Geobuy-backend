// Dojah — Nigerian NIN lookup.  https://docs.dojah.io
//   GET {base}/api/v1/kyc/nin?nin=XXXXXXXXXXX
//   Headers: AppId: <app id>, Authorization: <secret key>   (no "Bearer")
// Sandbox: https://sandbox.dojah.io (test NIN 70123456789)   Live: https://api.dojah.io
const axios = require('axios');

function config() {
  const appId = process.env.DOJAH_APP_ID;
  const secret = process.env.DOJAH_SECRET_KEY;
  const base = (process.env.DOJAH_BASE_URL || 'https://sandbox.dojah.io').replace(/\/$/, '');
  if (!appId || !secret) {
    const err = new Error('Dojah is not configured (DOJAH_APP_ID / DOJAH_SECRET_KEY)');
    err.code = 'VERIFICATION_NOT_CONFIGURED';
    throw err;
  }
  return { appId, secret, base };
}

/** Look up a NIN. Returns the person on record, or null if the NIN wasn't found. */
async function lookupNin(nin) {
  const { appId, secret, base } = config();
  try {
    const { data } = await axios.get(`${base}/api/v1/kyc/nin`, {
      params: { nin },
      headers: { AppId: appId, Authorization: secret, Accept: 'application/json' },
      timeout: 20000,
    });
    const e = data?.entity;
    if (!e) return null;
    return {
      firstName: e.first_name || e.firstname || '',
      lastName: e.last_name || e.surname || e.lastname || '',
      middleName: e.middle_name || e.middlename || '',
      dateOfBirth: e.date_of_birth || e.birthdate || '',
      gender: e.gender || '',
    };
  } catch (error) {
    const status = error.response?.status;
    // Dojah answers 400/404 for an unknown NIN
    if (status === 400 || status === 404) return null;
    const err = new Error(error.response?.data?.error || error.message || 'Dojah request failed');
    err.code = 'VERIFICATION_VENDOR_ERROR';
    throw err;
  }
}

module.exports = { lookupNin, name: 'dojah' };
