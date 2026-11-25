// Identity checks for providers and errand runners — see services/verificationService.js
const IdentityCheck = require('../models/IdentityCheck.model');
const User = require('../models/User.model');
const settingsService = require('../services/settingsService');
const verification = require('../services/verificationService');
const gateways = require('../services/payments');
const didit = require('../services/verification/didit');
const { countryOfUser, getCountry } = require('../config/countries');

const basePath = (user) => (user.role === 'provider' ? '/provider' : '/errand-runner');
const io = (req) => req.app?.get?.('io');

// GET /verifications/identity/status
exports.getStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    res.json(await verification.statusFor(user));
  } catch (error) {
    console.error('Identity status error:', error);
    res.status(500).json({ message: error.message });
  }
};

// POST /verifications/identity/start  { nin }  (nin only for Nigeria)
exports.start = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!['provider', 'errand_runner'].includes(user.role)) {
      return res.status(403).json({ message: 'Only providers and errand runners verify their identity' });
    }
    if (user.identityVerified) return res.status(400).json({ message: 'Your identity is already verified' });

    const status = await verification.statusFor(user);
    if (status.attemptsLeft === 0) {
      return res.status(400).json({ message: 'You have used all your ID check attempts. Please contact support.' });
    }
    if (status.latest?.status === 'in_review') {
      return res.status(400).json({ message: 'Your last check is being reviewed. We will let you know soon.' });
    }

    const country = countryOfUser(user);
    let nin;
    if (country === 'NG') {
      nin = String(req.body?.nin || user.nin || '').replace(/\D/g, '');
      if (!/^\d{11}$/.test(nin)) return res.status(400).json({ message: 'Please enter your 11-digit NIN' });
      // A NIN typed now is only saved to the account once it passes (or, when
      // the person pays first, so the check can run after the payment).
      if (!user.nin) {
        user.nin = nin;
        await user.save();
      }
    }

    // A UK session that's still open — send them back to it
    const open = await IdentityCheck.findOne({ userId: user._id, status: 'pending', sessionUrl: { $exists: true } }).sort({ createdAt: -1 });
    if (open && Date.now() - open.createdAt.getTime() < 60 * 60 * 1000) {
      return res.json({ check: verification.publicCheck(open), redirectUrl: open.sessionUrl });
    }

    const v = await settingsService.getVerification();
    const fee = v.paidBy === 'worker' ? Number(country === 'NG' ? v.feeNG : v.feeGB) || 0 : 0;
    const c = getCountry(country);

    // Reuse a check that was paid for (or is free) but didn't run (e.g. vendor down)
    let check = await IdentityCheck.findOne({
      userId: user._id,
      status: { $in: ['awaiting_start', 'error'] },
      paymentStatus: { $in: ['paid', 'not_required'] },
    }).sort({ createdAt: -1 });

    if (!check && fee > 0) {
      // The provider / runner pays first; keep the NIN for after the payment
      if (nin && user.nin !== nin) {
        user.nin = nin;
        await user.save();
      }
      check = await IdentityCheck.create({
        userId: user._id,
        role: user.role,
        country,
        vendor: verification.vendorFor(country),
        status: 'awaiting_payment',
        paidBy: 'worker',
        fee,
        currency: c.currency,
        paymentStatus: 'pending',
        mock: verification.isMock(),
      });
      const returnPath = `${basePath(user)}/verification?identity_payment=1&check=${check._id}`;
      const checkout = await gateways.startCheckout({
        country,
        amount: fee,
        currency: c.currency,
        email: user.email,
        reference: `IDV-${check._id}`,
        returnPath,
        cancelPath: `${basePath(user)}/verification?identity_payment=cancelled`,
        metadata: { type: 'identity_check', identityCheckId: String(check._id), userId: String(user._id) },
        productName: 'Geobuy identity check',
        description: country === 'NG' ? 'NIN verification' : 'ID document and selfie check',
      });
      check.paymentReference = checkout.reference;
      check.paymentGateway = checkout.gateway;
      await check.save();
      return res.json({ paymentRequired: true, paymentUrl: checkout.url, fee, currency: c.currency, check: verification.publicCheck(check) });
    }

    if (!check) {
      check = await IdentityCheck.create({
        userId: user._id,
        role: user.role,
        country,
        vendor: verification.vendorFor(country),
        status: 'awaiting_start',
        paidBy: v.paidBy,
        fee: 0,
        currency: c.currency,
        paymentStatus: 'not_required',
        mock: verification.isMock(),
      });
    } else {
      check.vendor = verification.vendorFor(country);
      check.mock = verification.isMock();
    }

    await verification.runCheck(check, user, { nin, io: io(req) });
    res.json({
      check: verification.publicCheck(check),
      redirectUrl: check.status === 'pending' ? check.sessionUrl : undefined,
      verified: check.status === 'approved',
    });
  } catch (error) {
    console.error('Identity start error:', error);
    res.status(500).json({ message: error.message });
  }
};

// POST /verifications/identity/confirm-payment  { check, reference?, session_id? }
// Called when the provider/runner comes back from Stripe / Paystack.
exports.confirmPayment = async (req, res) => {
  try {
    const { check: checkId, reference, session_id: sessionId } = req.body || {};
    const check = await IdentityCheck.findOne({ _id: checkId, userId: req.user._id });
    if (!check) return res.status(404).json({ message: 'Identity check not found' });

    if (check.paymentStatus !== 'paid') {
      const ref = sessionId || reference || check.paymentReference;
      const gateway = gateways.gatewayForCountry(check.country);
      const result = await gateway.verify(ref);
      if (!result.paid || Number(result.amount) + 0.001 < Number(check.fee)) {
        return res.status(400).json({ message: 'We have not received the payment yet. If you paid, wait a moment and try again.' });
      }
      await verification.markPaidAndRun(check, result.amount, io(req));
    } else if (check.status === 'awaiting_start') {
      const user = await User.findById(req.user._id);
      await verification.runCheck(check, user, { nin: user.nin, io: io(req) });
    }

    res.json({
      check: verification.publicCheck(check),
      redirectUrl: check.status === 'pending' ? check.sessionUrl : undefined,
      verified: check.status === 'approved',
    });
  } catch (error) {
    console.error('Identity payment confirm error:', error);
    res.status(500).json({ message: error.message });
  }
};

// POST /verifications/identity/refresh — UK: ask Didit for the result (after returning from Didit)
exports.refresh = async (req, res) => {
  try {
    const check = await IdentityCheck.findOne({ userId: req.user._id, status: { $in: ['pending', 'in_review'] }, vendor: 'didit' }).sort({ createdAt: -1 });
    if (check?.sessionId) {
      try {
        const decision = await didit.getDecision(check.sessionId);
        await verification.applyDiditDecision(check, decision, io(req));
      } catch (error) {
        console.warn('Didit decision lookup failed:', error.message);
      }
    }
    const user = await User.findById(req.user._id);
    res.json(await verification.statusFor(user));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// POST /api/webhooks/didit — raw body, signed with DIDIT_WEBHOOK_SECRET
exports.diditWebhook = async (req, res) => {
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));
    const signature = req.headers['x-signature'] || req.headers['x-signature-v2'];
    if (!didit.verifyWebhookSignature(raw, signature)) {
      return res.status(401).json({ message: 'Invalid signature' });
    }
    const body = JSON.parse(raw.toString('utf8') || '{}');
    const decision = didit.normaliseDecision(body);
    const check = await IdentityCheck.findOne(
      decision.sessionId ? { sessionId: decision.sessionId } : { _id: decision.vendorData }
    );
    if (check) await verification.applyDiditDecision(check, decision, io(req));
    res.json({ received: true });
  } catch (error) {
    console.error('Didit webhook error:', error);
    res.status(200).json({ received: true }); // don't make Didit retry forever on our bugs
  }
};

// ---------------- Admin ----------------

// GET /verifications/identity/admin?status=&country=&role=
exports.adminList = async (req, res) => {
  try {
    const { status, country, role } = req.query;
    const q = {};
    if (status && status !== 'all') q.status = status;
    if (country) q.country = country;
    if (role) q.role = role;
    const checks = await IdentityCheck.find(q)
      .populate('userId', 'fullName email phoneNumber role country verificationStatus identityVerified dateOfBirth')
      .populate('reviewedBy', 'fullName')
      .sort({ createdAt: -1 })
      .limit(300);

    // People who still need to verify (e.g. seeded or older accounts)
    const unverifiedQuery = { role: { $in: ['provider', 'errand_runner'] }, identityVerified: { $ne: true } };
    const unverified = await User.countDocuments(unverifiedQuery);
    const unverifiedUsers = await User.find(unverifiedQuery)
      .select('fullName email role country verificationStatus identityCheckStatus createdAt')
      .sort({ createdAt: -1 })
      .limit(50);
    const v = await settingsService.getVerification();
    res.json({ checks, unverified, unverifiedUsers, mock: verification.isMock(), settings: v });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// PUT /verifications/identity/admin/:id  { decision: 'approve' | 'decline', note }
exports.adminReview = async (req, res) => {
  try {
    const { decision, note } = req.body || {};
    if (!['approve', 'decline'].includes(decision)) return res.status(400).json({ message: 'decision must be approve or decline' });
    const check = await IdentityCheck.findById(req.params.id);
    if (!check) return res.status(404).json({ message: 'Identity check not found' });

    check.status = decision === 'approve' ? 'approved' : 'declined';
    check.reviewedBy = req.user._id;
    check.reviewedAt = new Date();
    check.reviewNote = note;
    if (decision === 'decline') check.result = { ...(check.result?.toObject?.() || check.result || {}), reason: note || 'Declined after review' };
    check.completedAt = check.completedAt || new Date();
    await check.save();
    await verification.applyOutcome(check, io(req));

    // An admin approving the ID check also approves the account
    if (decision === 'approve') {
      await User.updateOne({ _id: check.userId }, { $set: { verificationStatus: 'approved', verificationReviewedAt: new Date() } });
    }
    res.json({ message: decision === 'approve' ? 'Identity approved' : 'Identity check declined', check });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// POST /verifications/identity/admin/user/:userId/mark-verified  { note }
// For people verified another way (e.g. in person).
exports.adminMarkVerified = async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user || !['provider', 'errand_runner'].includes(user.role)) return res.status(404).json({ message: 'Provider or runner not found' });
    const country = countryOfUser(user);
    const check = await IdentityCheck.create({
      userId: user._id,
      role: user.role,
      country,
      vendor: 'manual',
      status: 'approved',
      paidBy: 'platform',
      paymentStatus: 'not_required',
      currency: getCountry(country).currency,
      result: { nameMatch: 'n/a', dobMatch: 'n/a', reason: req.body?.note || 'Verified by an admin' },
      reviewedBy: req.user._id,
      reviewedAt: new Date(),
      reviewNote: req.body?.note,
      completedAt: new Date(),
    });
    await verification.applyOutcome(check, io(req));
    await User.updateOne({ _id: user._id }, { $set: { verificationStatus: 'approved', verificationReviewedAt: new Date() } });
    res.json({ message: 'Marked as verified', check });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
