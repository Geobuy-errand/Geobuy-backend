// ============================================================
// Identity checks for providers and errand runners.
//
// One vendor, Didit, for both countries:
//   Nigeria → NIN checked against the NIMC database (instant; Didit compares
//             the name and date of birth on the NIN record with the account).
//   UK      → hosted ID document + selfie check (the person is sent to
//             Didit, the result comes back by webhook or when they return).
//
// VERIFICATION_MOCK=true in .env passes every check without calling Didit,
// so the app can be tested before the keys are in. (In mock
// mode the NIN 00000000000 is "not found", to test the failure screens.)
//
// Admin → Settings → Verification decides whether it's required, who pays
// (Geobuy or the provider/runner), the fee, and whether a passed check
// approves the account straight away or goes to an admin first.
// ============================================================
const crypto = require('crypto');
const IdentityCheck = require('../models/IdentityCheck.model');
const User = require('../models/User.model');
const settingsService = require('./settingsService');
const createNotification = require('../utils/create-notification');
const { countryOfUser, getCountry } = require('../config/countries');
const didit = require('./verification/didit');

const isMock = () => ['1', 'true', 'yes', 'on'].includes(String(process.env.VERIFICATION_MOCK || '').toLowerCase());

const vendorFor = () => (isMock() ? 'mock' : 'didit');

const ROLES = ['provider', 'errand_runner'];

/** Is an identity check required for this user right now? */
async function isRequired(user) {
  if (!user || !ROLES.includes(user.role)) return false;
  const v = await settingsService.getVerification();
  return user.role === 'provider' ? v.requiredForProviders !== false : v.requiredForRunners !== false;
}

/**
 * Block an action until the user has passed their identity check.
 * Returns null when allowed, or a JSON body for a 403.
 */
async function verificationGate(user, role) {
  if (!user || (role && user.role !== role)) return null;
  if (!(await isRequired(user))) return null;
  const fresh = user.identityVerified !== undefined ? user : await User.findById(user._id).select('identityVerified role');
  if (fresh?.identityVerified) return null;
  const base = user.role === 'provider' ? '/provider' : '/errand-runner';
  return {
    code: 'IDENTITY_VERIFICATION_REQUIRED',
    message: user.role === 'provider'
      ? 'Please verify your identity before sending quotes or taking jobs.'
      : 'Please verify your identity before accepting errands.',
    verifyPath: `${base}/verification`,
  };
}

// ---------- name / date of birth matching (NIN) ----------
const tokens = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((t) => t.length > 1);

function nameMatch(accountName, record) {
  const mine = new Set(tokens(accountName));
  const first = tokens(record.firstName);
  const last = tokens(record.lastName);
  const middle = tokens(record.middleName);
  const firstOk = first.some((t) => mine.has(t));
  const lastOk = last.some((t) => mine.has(t));
  if (firstOk && lastOk) return 'full';
  const any = [...first, ...last, ...middle].some((t) => mine.has(t));
  return any ? 'partial' : 'none';
}

function toYmd(d) {
  if (!d) return '';
  if (d instanceof Date) return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
  const s = String(d).trim();
  // 1990-05-17, 17-05-1990, 17/05/1990
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

function dobMatch(accountDob, recordDob) {
  const a = toYmd(accountDob);
  const b = toYmd(recordDob);
  if (!a || !b) return 'unknown';
  return a === b ? 'match' : 'mismatch';
}

// ---------- state changes ----------
async function notifyAdmins(title, message, data) {
  const admins = await User.find({ role: 'admin', isActive: { $ne: false } }).select('_id');
  for (const a of admins) await createNotification(a._id, 'verification_request', title, message, data);
}

/** Apply a finished check to the user's account. */
async function applyOutcome(check, io) {
  const user = await User.findById(check.userId);
  if (!user) return;
  const v = await settingsService.getVerification();

  user.identityCheckStatus = check.status;
  if (check.status === 'approved') {
    user.identityVerified = true;
    user.identityVerifiedAt = new Date();
    user.verificationBadges = Array.from(new Set([...(user.verificationBadges || []), 'id_checked']));
    if (v.autoApprove) {
      user.verificationStatus = 'approved';
      user.verificationReviewedAt = new Date();
    } else if (user.verificationStatus !== 'approved') {
      user.verificationStatus = 'pending';
      user.verificationRequestedAt = new Date();
    }
  }
  await user.save();

  const base = user.role === 'provider' ? '/provider' : '/errand-runner';
  if (check.status === 'approved') {
    await createNotification(
      user._id,
      'verification_approved',
      '✅ Identity verified',
      v.autoApprove || user.verificationStatus === 'approved'
        ? 'Your identity has been verified. You can now take jobs on Geobuy.'
        : 'Your identity has been verified. An admin will approve your account shortly.',
      { path: `${base}/verification`, identityCheckId: check._id }
    );
    if (!v.autoApprove && user.verificationStatus !== 'approved') {
      await notifyAdmins('🪪 Identity verified — approve account', `${user.fullName} passed their ID check and is waiting for approval.`, { userId: user._id, identityCheckId: check._id });
    }
  } else if (check.status === 'in_review') {
    await createNotification(user._id, 'verification_request', '🕵️ Identity check under review', 'We need to take a closer look at your ID check. We will let you know soon.', { path: `${base}/verification` });
    await notifyAdmins('🕵️ Identity check needs review', `${user.fullName}'s ID check needs a manual review (${check.result?.reason || check.result?.vendorStatus || 'details differ'}).`, { userId: user._id, identityCheckId: check._id });
  } else if (check.status === 'declined') {
    await createNotification(user._id, 'verification_rejected', '❌ Identity check failed', check.result?.reason || 'We could not verify your identity. Please check your details and try again.', { path: `${base}/verification` });
  }

  if (io) io.to(`user_${user._id}`).emit('identity-check-updated', { status: check.status, identityVerified: !!user.identityVerified });
}

// ---------- running a check ----------
async function runNinCheck(check, user, nin) {
  check.ninLast4 = String(nin).slice(-4);
  check.ninHash = crypto.createHash('sha256').update(String(nin)).digest('hex');

  // One NIN, one account
  const reused = await IdentityCheck.findOne({ ninHash: check.ninHash, status: 'approved', userId: { $ne: user._id } }).select('_id');
  if (reused) {
    check.status = 'in_review';
    check.result = { nameMatch: 'n/a', dobMatch: 'n/a', reason: 'This NIN is already verified on another Geobuy account' };
    check.completedAt = new Date();
    return check;
  }

  // Name on the account, split for the NIMC lookup
  const parts = String(user.fullName || '').trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0] || '';
  const lastName = parts.length > 1 ? parts[parts.length - 1] : parts[0] || '';
  const dob = toYmd(user.dateOfBirth);

  if (check.vendor === 'mock') {
    if (String(nin) === '00000000000') {
      check.status = 'declined';
      check.result = { nameMatch: 'none', dobMatch: 'unknown', vendorStatus: 'Declined (mock)', reason: 'We could not find that NIN. Check the 11 digits and try again.' };
    } else {
      check.status = 'approved';
      check.result = { firstName, lastName, dateOfBirth: dob, nameMatch: 'full', dobMatch: dob ? 'match' : 'unknown', vendorStatus: 'Approved (mock)' };
    }
    check.completedAt = new Date();
    return check;
  }

  // Didit checks the NIN against NIMC and compares the name / date of birth
  const r = await didit.validateNin({ nin, firstName, lastName, dateOfBirth: dob || undefined, vendorData: check._id });
  const nameMatchValue = r.matchType === 'full_match' ? 'full' : r.matchType === 'partial_match' ? 'partial' : 'none';
  check.status = r.status;
  check.result = {
    firstName: r.recordFirstName,
    lastName: r.recordLastName,
    nameMatch: nameMatchValue,
    dobMatch: dob ? 'n/a' : 'unknown',
    vendorStatus: `${r.vendorStatus || ''}${r.matchType ? ` (${r.matchType}${r.nameScore != null ? `, name score ${r.nameScore}` : ''})` : ''}`.trim(),
    reason:
      r.status === 'approved'
        ? undefined
        : !r.ninMatched
        ? 'We could not find that NIN. Check the 11 digits and try again.'
        : r.status === 'declined'
        ? 'The name on this NIN does not match the name on your account.'
        : 'Only part of the name matches the NIN record',
  };
  check.completedAt = new Date();
  return check;
}

async function startDiditSession(check, user) {
  const base = user.role === 'provider' ? '/provider' : '/errand-runner';
  const { frontendUrl } = require('./payments');
  if (check.vendor === 'mock') {
    check.status = 'approved';
    check.result = { nameMatch: 'n/a', dobMatch: 'n/a', vendorStatus: 'Approved (mock)' };
    check.completedAt = new Date();
    return check;
  }
  const session = await didit.createSession({
    vendorData: String(check._id),
    callbackUrl: frontendUrl(`${base}/verification?identity=return&check=${check._id}`),
  });
  check.sessionId = session.sessionId;
  check.sessionUrl = session.url;
  check.status = 'pending';
  return check;
}

/** Run (or continue) a check that is ready to go. `nin` for Nigeria. */
async function runCheck(check, user, { nin, io } = {}) {
  try {
    if (check.country === 'NG') {
      if (!nin) {
        check.status = 'awaiting_start';
        await check.save();
        return check;
      }
      await runNinCheck(check, user, nin);
      // Keep the NIN that passed on the account
      if (check.status === 'approved' && user.nin !== String(nin)) {
        await User.updateOne({ _id: user._id }, { $set: { nin: String(nin) } });
      }
    } else {
      await startDiditSession(check, user);
    }
  } catch (error) {
    console.error('Identity check error:', error.message);
    check.status = 'error';
    check.result = { ...(check.result || {}), reason: error.code === 'VERIFICATION_NOT_CONFIGURED' ? 'ID checks are not set up yet. Please try again later.' : 'The ID check service is unavailable. Please try again shortly.' };
  }
  await check.save();
  if (['approved', 'declined', 'in_review'].includes(check.status)) await applyOutcome(check, io);
  return check;
}

/** Update a Didit check from a decision (webhook or polling). */
async function applyDiditDecision(check, decision, io) {
  const before = check.status;
  const status = didit.statusFor(decision.vendorStatus);
  check.result = {
    ...(check.result?.toObject?.() || check.result || {}),
    vendorStatus: decision.vendorStatus,
    firstName: decision.firstName || check.result?.firstName,
    lastName: decision.lastName || check.result?.lastName,
    dateOfBirth: toYmd(decision.dateOfBirth) || check.result?.dateOfBirth,
  };
  // Didit approved — still compare the name on the document with the account
  if (status === 'approved' && (decision.firstName || decision.lastName)) {
    const user = await User.findById(check.userId).select('fullName dateOfBirth');
    const nm = nameMatch(user?.fullName, decision);
    const dm = dobMatch(user?.dateOfBirth, decision.dateOfBirth);
    check.result.nameMatch = nm;
    check.result.dobMatch = dm;
    check.status = nm === 'full' && dm !== 'mismatch' ? 'approved' : 'in_review';
    if (check.status === 'in_review') check.result.reason = 'The name or date of birth on the ID differs from the account';
  } else {
    check.status = status;
  }
  if (['approved', 'declined', 'in_review', 'cancelled'].includes(check.status)) check.completedAt = new Date();
  await check.save();
  if (before !== check.status && ['approved', 'declined', 'in_review'].includes(check.status)) await applyOutcome(check, io);
  return check;
}

/** A worker-paid fee has been confirmed (browser return or gateway webhook). */
async function markPaidAndRun(check, amount, io) {
  if (check.paymentStatus === 'paid') return check;
  if (amount != null && Number(amount) + 0.001 < Number(check.fee)) return check;
  check.paymentStatus = 'paid';
  check.paidAt = new Date();
  check.status = 'awaiting_start';
  await check.save();
  const user = await User.findById(check.userId);
  if (user) await runCheck(check, user, { nin: user.nin, io });
  return check;
}

/** Status summary for the verification page. */
async function statusFor(user) {
  const v = await settingsService.getVerification();
  const country = countryOfUser(user);
  const c = getCountry(country);
  const latest = await IdentityCheck.findOne({ userId: user._id }).sort({ createdAt: -1 });
  const attempts = await IdentityCheck.countDocuments({ userId: user._id, status: { $in: ['approved', 'declined', 'in_review', 'pending'] } });
  return {
    required: await isRequired(user),
    verified: !!user.identityVerified,
    verifiedAt: user.identityVerifiedAt,
    accountStatus: user.verificationStatus,
    country,
    vendor: vendorFor(country),
    method: country === 'NG' ? 'nin' : 'document',
    mock: isMock(),
    paidBy: v.paidBy,
    fee: v.paidBy === 'worker' ? (country === 'NG' ? v.feeNG : v.feeGB) : 0,
    currency: c.currency,
    autoApprove: v.autoApprove,
    attempts,
    maxAttempts: v.maxAttempts,
    attemptsLeft: v.maxAttempts ? Math.max(0, v.maxAttempts - attempts) : null,
    ninOnFile: country === 'NG' && /^\d{11}$/.test(String(user.nin || '')) ? `•••••••${String(user.nin).slice(-4)}` : null,
    latest: latest ? publicCheck(latest) : null,
  };
}

function publicCheck(c) {
  return {
    _id: c._id,
    status: c.status,
    vendor: c.vendor,
    country: c.country,
    ninLast4: c.ninLast4,
    sessionUrl: c.status === 'pending' ? c.sessionUrl : undefined,
    reason: c.result?.reason,
    vendorStatus: c.result?.vendorStatus,
    paymentStatus: c.paymentStatus,
    fee: c.fee,
    currency: c.currency,
    createdAt: c.createdAt,
    completedAt: c.completedAt,
  };
}

module.exports = {
  isMock,
  vendorFor,
  isRequired,
  verificationGate,
  runCheck,
  applyDiditDecision,
  applyOutcome,
  markPaidAndRun,
  statusFor,
  publicCheck,
  nameMatch,
  dobMatch,
  toYmd,
};
