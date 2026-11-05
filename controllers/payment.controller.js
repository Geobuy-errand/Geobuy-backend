// ============================================================
// Payment controller — UK (Stripe, GBP) and Nigeria (Paystack, NGN)
//
// All customer payments use HOSTED checkout pages:
//   POST /payments/errand/checkout  -> { url }  (redirect the browser)
//   GET  /payments/verify?reference= | ?session_id=  (on return)
// Webhooks (Stripe + Paystack) confirm the same payments server-side, so a
// customer who closes the tab after paying is still marked as paid.
// ============================================================

const Payment = require('../models/Payment.model');
const Booking = require('../models/Booking.model');
const Errand = require('../models/Errand.model');
const User = require('../models/User.model');
const Wallet = require('../models/Wallet.model');
const Transaction = require('../models/Transaction.model');
const Connection = require('../models/Connection.model');
const createNotification = require('../utils/create-notification');
const gateways = require('../services/payments');
const pricingService = require('../services/pricingService');
const { markPaymentSucceeded, releaseErrandFunds, refundErrandPayment } = require('../services/escrowService');
const { notifyNearbyRunners } = require('../services/runnerMatching');
const { countryOfUser, getCountry, normalizeCountry } = require('../config/countries');
const { formatMoney, round2 } = require('../utils/money');

const same = (a, b) => a && b && String(a?._id || a) === String(b?._id || b);

// ------------------------------------------------------------
// Errand checkout
// ------------------------------------------------------------

/** POST /payments/errand/checkout  { errandId } */
exports.createErrandCheckout = async (req, res) => {
  try {
    const { errandId } = req.body;
    const errand = await Errand.findById(errandId);
    if (!errand) return res.status(404).json({ message: 'Errand not found' });
    if (!same(errand.customerId, req.user._id)) return res.status(403).json({ message: 'Access denied' });
    if (errand.status === 'cancelled') return res.status(400).json({ message: 'This errand was cancelled' });
    if (['paid', 'released'].includes(errand.paymentStatus)) {
      return res.status(400).json({ message: 'This errand is already paid' });
    }
    if (!(errand.total > 0)) return res.status(400).json({ message: 'Errand has no price' });

    const country = normalizeCountry(errand.country || countryOfUser(req.user));
    const c = getCountry(country);
    const gateway = gateways.gatewayForCountry(country);

    // Reuse an unfinished checkout instead of creating duplicates.
    await Payment.updateMany(
      { errandId: errand._id, status: 'pending', type: 'errand' },
      { $set: { status: 'cancelled' } }
    );

    const reference = gateway.name === 'paystack' ? gateways.paystack.makeReference('ERR') : undefined;

    const payment = await Payment.create({
      type: 'errand',
      errandId: errand._id,
      customerId: req.user._id,
      providerId: errand.providerId || undefined,
      amount: errand.total,
      platformFee: errand.platformFee,
      providerAmount: errand.providerAmount,
      currency: c.currency,
      country,
      gateway: gateway.name,
      reference,
      status: 'pending',
      isEscrow: true,
      metadata: {
        errandCode: errand.errandId,
        pickup: errand.pickup?.address,
        dropoff: errand.dropoff?.address,
        distance: errand.distanceText,
      },
    });

    const returnPath = `/customer/booking/${errand._id}`;
    const checkout = await gateways.startCheckout({
      country,
      amount: errand.total,
      currency: c.currency,
      email: req.user.email,
      reference: reference || String(payment._id),
      returnPath,
      cancelPath: `${returnPath}?payment=cancelled`,
      metadata: {
        type: 'errand',
        paymentId: String(payment._id),
        errandId: String(errand._id),
        userId: String(req.user._id),
      },
      productName: `GEOBUY Errand #${errand.errandId}`,
      description: `${errand.pickup?.town || ''} → ${errand.dropoff?.town || ''}`.trim(),
    });

    payment.reference = checkout.reference;
    if (gateway.name === 'stripe') payment.stripeSessionId = checkout.reference;
    await payment.save();

    res.json({
      url: checkout.url,
      sessionUrl: checkout.url, // backwards compatible name
      reference: checkout.reference,
      gateway: gateway.name,
      paymentId: payment._id,
      amount: payment.amount,
      currency: payment.currency,
    });
  } catch (error) {
    console.error('Create errand checkout error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Old endpoint name used by the frontend — now returns a hosted checkout URL.
exports.createPaymentIntent = async (req, res) => {
  if (req.body.errandId) return exports.createErrandCheckout(req, res);
  return res.status(400).json({ message: 'errandId is required' });
};

/**
 * Apply a verified gateway result to our records. Used by verify + webhooks.
 * Returns { payment, alreadyProcessed }.
 */
async function applyVerifiedPayment(payment, verified, io) {
  if (!verified.paid) return { payment, alreadyProcessed: false, paid: false };

  if (payment.type === 'connection_fee') {
    const result = await markConnectionFeePaid(payment, verified);
    return { ...result, paid: true };
  }

  const result = await markPaymentSucceeded(payment, {
    amount: verified.amount,
    currency: verified.currency,
    gatewayReference: verified.reference,
    paymentIntentId: verified.paymentIntentId,
  });

  if (!result.alreadyProcessed && result.payment.type === 'errand' && result.payment.errandId) {
    const errand = await Errand.findById(result.payment.errandId);
    if (errand && !errand.providerId) await notifyNearbyRunners(errand, io);
    if (io) {
      io.to(`user_${result.payment.customerId}`).emit('payment-succeeded', {
        errandId: result.payment.errandId,
        paymentId: result.payment._id,
      });
    }
  }
  return { ...result, paid: true };
}
exports.applyVerifiedPayment = applyVerifiedPayment;

/** GET /payments/verify?reference=...  or  ?session_id=... */
exports.verifyPayment = async (req, res) => {
  try {
    const reference = req.query.reference || req.query.trxref || req.query.session_id;
    if (!reference) return res.status(400).json({ message: 'Payment reference is required' });

    const payment = await Payment.findOne({ $or: [{ reference }, { stripeSessionId: reference }] });
    if (!payment) return res.status(404).json({ message: 'Payment not found' });
    if (!same(payment.customerId, req.user._id) && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (['succeeded', 'completed', 'paid'].includes(payment.status)) {
      return res.json({ paid: true, alreadyProcessed: true, payment });
    }

    const gateway = gateways.gatewayByName(payment.gateway) || gateways.gatewayForCurrency(payment.currency);
    const verified = await gateway.verify(payment.reference || reference);

    if (!verified.paid) {
      // 'abandoned' just means the customer hasn't finished — they can still pay.
      if (['failed', 'reversed'].includes(verified.status)) {
        payment.status = 'failed';
        await payment.save();
      }
      return res.json({ paid: false, status: verified.status, payment });
    }

    const result = await applyVerifiedPayment(payment, verified, req.app.get('io'));
    res.json({ paid: true, alreadyProcessed: result.alreadyProcessed, payment: result.payment });
  } catch (error) {
    console.error('Verify payment error:', error);
    res.status(500).json({ message: error.message });
  }
};

// ------------------------------------------------------------
// Releasing funds / confirming / refunds
// ------------------------------------------------------------

/** Customer or admin releases escrow for a completed/delivered errand. */
exports.releaseFundsToProvider = async (req, res) => {
  try {
    const { paymentId, errandId } = req.body;
    const payment = paymentId ? await Payment.findById(paymentId) : await Payment.findOne({ errandId, type: 'errand' }).sort({ createdAt: -1 });
    if (!payment || !payment.errandId) return res.status(404).json({ message: 'Payment not found' });

    if (!same(payment.customerId, req.user._id) && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const errand = await Errand.findById(payment.errandId);
    if (!errand) return res.status(404).json({ message: 'Errand not found' });
    if (!['delivered', 'completed'].includes(errand.status) && req.user.role !== 'admin') {
      return res.status(400).json({ message: 'Funds can only be released after delivery' });
    }

    if (errand.status === 'delivered') {
      await Errand.updateOne(
        { _id: errand._id, status: 'delivered' },
        { $set: { status: 'completed', completedAt: new Date(), completedBy: req.user.role } }
      );
    }

    const result = await releaseErrandFunds(errand, { io: req.app.get('io'), releasedBy: req.user.role });
    if (!result.released && result.reason === 'already_released') {
      return res.status(400).json({ message: 'Funds already released' });
    }
    if (!result.released) return res.status(400).json({ message: 'No paid payment found for this errand' });

    res.json({ message: 'Funds released successfully', payment: result.payment, providerAmount: result.amount });
  } catch (error) {
    console.error('Release funds error:', error);
    res.status(500).json({ message: error.message });
  }
};
exports.releaseFunds = exports.releaseFundsToProvider;

/** Kept for compatibility — hosted checkout captures immediately, so this just verifies. */
exports.confirmPayment = async (req, res) => {
  try {
    const payment = await Payment.findById(req.body.paymentId);
    if (!payment) return res.status(404).json({ message: 'Payment not found' });
    if (!same(payment.customerId, req.user._id) && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }
    req.query.reference = payment.reference || payment.stripeSessionId;
    return exports.verifyPayment(req, res);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/** Admin refund (errands go through the gateway; wallet is adjusted if already released). */
exports.refundPayment = async (req, res) => {
  try {
    const { paymentId, reason, amount } = req.body;
    const payment = await Payment.findById(paymentId);
    if (!payment) return res.status(404).json({ message: 'Payment not found' });
    if (!['succeeded', 'completed', 'paid', 'refund_pending'].includes(payment.status)) {
      return res.status(400).json({ message: 'Payment cannot be refunded' });
    }

    if (payment.errandId) {
      const errand = await Errand.findById(payment.errandId);
      if (payment.disbursementStatus === 'completed' && payment.providerId) {
        // Claw back from the runner's wallet only if the money is still there.
        const claw = await Wallet.findOneAndUpdate(
          { userId: payment.providerId, balance: { $gte: payment.providerAmount } },
          { $inc: { balance: -payment.providerAmount, totalEarned: -payment.providerAmount } },
          { new: true }
        );
        if (!claw) {
          return res.status(400).json({ message: "Runner has already withdrawn these funds — refund manually and adjust the runner's wallet." });
        }
        await Payment.updateOne({ _id: payment._id }, { $set: { disbursementStatus: 'pending' } });
      }
      if (payment.status === 'refund_pending') {
        await Payment.updateOne({ _id: payment._id }, { $set: { status: 'succeeded' } });
      }
      const result = await refundErrandPayment(errand, { reason: reason || 'Refunded by admin', amount });
      if (!result.refunded) return res.status(500).json({ message: result.error || 'Refund failed', result });
      return res.json({ message: 'Payment refunded successfully', result });
    }

    // Non-errand payments
    const gateway = gateways.gatewayByName(payment.gateway) || gateways.gatewayForCurrency(payment.currency);
    if (gateway.name === 'paystack') await gateway.refund(payment.reference, amount || payment.amount, payment.currency);
    else await gateway.refund(payment.stripePaymentIntentId || payment.paymentIntentId, amount || payment.amount, payment.currency);

    payment.status = 'refunded';
    payment.refundedAt = new Date();
    payment.refundAmount = amount || payment.amount;
    payment.refundReason = reason;
    await payment.save();

    if (payment.bookingId) await Booking.updateOne({ _id: payment.bookingId }, { $set: { paymentStatus: 'refunded' } });

    res.json({ message: 'Payment refunded successfully', payment });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ------------------------------------------------------------
// Reads
// ------------------------------------------------------------

exports.getPaymentStatus = async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.paymentId)
      .populate('customerId', 'fullName email')
      .populate('providerId', 'fullName email phoneNumber');
    if (!payment) return res.status(404).json({ message: 'Payment not found' });

    if (!same(payment.customerId, req.user._id) && !same(payment.providerId, req.user._id) && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json({
      paymentId: payment._id,
      amount: payment.amount,
      currency: payment.currency,
      gateway: payment.gateway,
      platformFee: payment.platformFee,
      providerAmount: payment.providerAmount,
      status: payment.status,
      disbursementStatus: payment.disbursementStatus,
      disbursementDate: payment.disbursementDate,
      createdAt: payment.createdAt,
      releasedAt: payment.releasedAt,
      customer: payment.customerId && { id: payment.customerId._id, name: payment.customerId.fullName, email: payment.customerId.email },
      provider: payment.providerId && {
        id: payment.providerId._id,
        name: payment.providerId.fullName,
        email: payment.providerId.email,
        phone: payment.providerId.phoneNumber,
      },
      metadata: payment.metadata,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getPaymentByBooking = async (req, res) => {
  try {
    const payment = await Payment.findOne({ bookingId: req.params.bookingId });
    if (!payment) return res.status(404).json({ message: 'Payment not found' });
    const booking = await Booking.findById(req.params.bookingId);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    if (req.user.role !== 'admin' && !same(booking.customerId, req.user._id) && !same(booking.providerId, req.user._id)) {
      return res.status(403).json({ message: 'Access denied' });
    }
    res.json(payment);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getPaymentByErrand = async (req, res) => {
  try {
    const payment = await Payment.findOne({ errandId: req.params.errandId, status: { $ne: 'cancelled' } })
      .sort({ createdAt: -1 })
      .populate('customerId', 'fullName email')
      .populate('providerId', 'fullName email');
    if (!payment) return res.status(404).json({ message: 'Payment not found' });
    if (!same(payment.customerId, req.user._id) && !same(payment.providerId, req.user._id) && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }
    res.json(payment);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getMyPayments = async (req, res) => {
  try {
    const query = req.user.role === 'customer' ? { customerId: req.user._id } : { providerId: req.user._id };
    query.status = { $ne: 'cancelled' };
    const payments = await Payment.find(query)
      .populate('bookingId', 'bookingId date status')
      .populate('errandId', 'errandId status pickup.town dropoff.town')
      .sort({ createdAt: -1 });
    res.json(payments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getAllPayments = async (req, res) => {
  try {
    const { status, disbursementStatus, startDate, endDate, currency, country } = req.query;
    const query = { status: { $ne: 'cancelled' } };
    if (status) query.status = status;
    if (disbursementStatus) query.disbursementStatus = disbursementStatus;
    if (currency) query.currency = String(currency).toUpperCase();
    if (country) query.country = String(country).toUpperCase();
    if (startDate && endDate) query.createdAt = { $gte: new Date(startDate), $lte: new Date(endDate) };

    const payments = await Payment.find(query)
      .populate('customerId', 'fullName email')
      .populate('providerId', 'fullName email')
      .sort({ createdAt: -1 });
    res.json(payments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * Admin stats. Money in different currencies can't be added together, so
 * top-level totals are for ONE currency (?currency=GBP|NGN, default GBP) and
 * `byCurrency` has the full breakdown.
 */
exports.getPaymentStats = async (req, res) => {
  try {
    const currency = String(req.query.currency || 'GBP').toUpperCase();
    const ok = ['succeeded', 'completed', 'paid'];
    const startOfDay = new Date(new Date().setHours(0, 0, 0, 0));
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    const byCurrency = await Payment.aggregate([
      { $match: { status: { $ne: 'cancelled' } } },
      {
        $group: {
          _id: { $ifNull: ['$currency', 'GBP'] },
          totalRevenue: { $sum: { $cond: [{ $in: ['$status', ok] }, '$amount', 0] } },
          totalPlatformFee: { $sum: { $cond: [{ $in: ['$status', ok] }, '$platformFee', 0] } },
          totalProviderAmount: { $sum: { $cond: [{ $in: ['$status', ok] }, '$providerAmount', 0] } },
          todayRevenue: {
            $sum: { $cond: [{ $and: [{ $in: ['$status', ok] }, { $gte: ['$createdAt', startOfDay] }] }, '$amount', 0] },
          },
          thisMonthRevenue: {
            $sum: { $cond: [{ $and: [{ $in: ['$status', ok] }, { $gte: ['$createdAt', startOfMonth] }] }, '$amount', 0] },
          },
          pendingDisbursements: {
            $sum: {
              $cond: [
                { $and: [{ $in: ['$status', ok] }, { $in: ['$disbursementStatus', ['pending', 'processing']] }, { $eq: ['$type', 'errand'] }] },
                1,
                0,
              ],
            },
          },
          totalPayments: { $sum: 1 },
          successfulPayments: { $sum: { $cond: [{ $in: ['$status', ok] }, 1, 0] } },
          failedPayments: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
          refundedPayments: { $sum: { $cond: [{ $eq: ['$status', 'refunded'] }, 1, 0] } },
        },
      },
    ]);

    const pick = byCurrency.find((r) => r._id === currency) || {};
    res.json({
      currency,
      totalRevenue: round2(pick.totalRevenue || 0),
      totalPlatformFee: round2(pick.totalPlatformFee || 0),
      totalProviderAmount: round2(pick.totalProviderAmount || 0),
      pendingDisbursements: pick.pendingDisbursements || 0,
      todayRevenue: round2(pick.todayRevenue || 0),
      thisMonthRevenue: round2(pick.thisMonthRevenue || 0),
      totalPayments: pick.totalPayments || 0,
      successfulPayments: pick.successfulPayments || 0,
      failedPayments: pick.failedPayments || 0,
      refundedPayments: pick.refundedPayments || 0,
      byCurrency: byCurrency.map((r) => ({ ...r, currency: r._id })),
    });
  } catch (error) {
    console.error('Get payment stats error:', error);
    res.status(500).json({ message: error.message });
  }
};

// ------------------------------------------------------------
// Connection fee (Connect feature) — GBP via Stripe, NGN via Paystack
// ------------------------------------------------------------

async function markConnectionFeePaid(payment, verified = {}) {
  if (verified.amount !== undefined && round2(verified.amount) + 0.01 < round2(payment.amount)) {
    throw new Error('Paid amount is less than the connection fee');
  }
  const updated = await Payment.findOneAndUpdate(
    { _id: payment._id, status: { $in: ['pending', 'processing', 'failed', 'cancelled'] } },
    {
      $set: {
        status: 'succeeded',
        paymentDate: new Date(),
        ...(verified.paymentIntentId ? { stripePaymentIntentId: verified.paymentIntentId } : {}),
      },
    },
    { new: true }
  );
  if (!updated) return { payment: await Payment.findById(payment._id), alreadyProcessed: true };

  const user = await User.findById(updated.customerId);
  let connection = await Connection.findOne({ userId: updated.customerId, userHasPaidConnectionFee: true });
  if (!connection) {
    connection = await Connection.create({
      userId: updated.customerId,
      fullName: user?.fullName || 'User',
      email: user?.email || '',
      phoneNumber: user?.phoneNumber || '',
      location: { type: 'Point', coordinates: [0, 0], address: '', town: '', postcode: '' },
      purpose: 'payment_only',
      status: 'completed',
      // `state` is required by the schema — the old code omitted it, so the
      // payment-tracking record could never be saved.
      state: updated.country === 'NG' ? 'All Nigeria' : 'All UK',
      country: updated.country || 'GB',
      fee: { amount: updated.amount, currency: updated.currency, paid: true, paymentId: updated._id, paidAt: new Date() },
      userHasPaidConnectionFee: true,
      userPaymentId: updated._id,
      userPaymentDate: new Date(),
      isActive: false,
      expiresAt: new Date(),
    });
  }

  await User.findByIdAndUpdate(updated.customerId, {
    hasPaidConnectionFee: true,
    connectionFeePaidAt: new Date(),
    connectionFeePaymentId: updated._id,
  });

  const amount = formatMoney(updated.amount, updated.currency);
  await createNotification(
    updated.customerId,
    'connection_fee_paid',
    'Connection fee paid',
    `You have successfully paid the one-time connection fee of ${amount}. You can now create unlimited connections.`,
    { paymentId: updated._id, connectionId: connection._id, amount: updated.amount }
  );
  const admins = await User.find({ role: 'admin' }).select('_id');
  for (const admin of admins) {
    await createNotification(admin._id, 'connection_fee_paid', 'New connection fee payment', `${user?.fullName || 'A user'} paid the connection fee of ${amount}`, {
      userId: updated.customerId,
      paymentId: updated._id,
      amount: updated.amount,
    });
  }
  return { payment: updated, connection, alreadyProcessed: false };
}

exports.checkConnectionFeeStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const country = countryOfUser(user);
    const pricing = await pricingService.getPricing(country);

    if (user?.hasPaidConnectionFee === true) {
      return res.json({ hasPaid: true, message: 'User has already paid the connection fee', paidAt: user.connectionFeePaidAt });
    }

    const pendingPayment = await Payment.findOne({
      customerId: req.user._id,
      type: 'connection_fee',
      status: { $in: ['pending', 'processing'] },
    }).sort({ createdAt: -1 });

    res.json({
      hasPaid: false,
      hasPendingPayment: Boolean(pendingPayment),
      paymentId: pendingPayment?._id,
      fee: pricing.connectionFee,
      currency: pricing.currency,
      formattedFee: formatMoney(pricing.connectionFee, pricing.currency),
      message: pendingPayment ? 'Payment is pending. Please complete your payment.' : 'Please pay the connection fee.',
    });
  } catch (error) {
    console.error('Check connection fee status error:', error);
    res.status(500).json({ message: error.message });
  }
};

exports.createConnectionCheckoutSession = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (user?.hasPaidConnectionFee) {
      return res.status(400).json({ message: 'You have already paid the connection fee.', alreadyPaid: true });
    }

    const country = countryOfUser(user);
    const c = getCountry(country);
    const pricing = await pricingService.getPricing(country);
    const fee = pricing.connectionFee;
    const gateway = gateways.gatewayForCountry(country);
    const reference = gateway.name === 'paystack' ? gateways.paystack.makeReference('CON') : undefined;

    await Payment.updateMany(
      { customerId: req.user._id, type: 'connection_fee', status: 'pending' },
      { $set: { status: 'cancelled' } }
    );

    const payment = await Payment.create({
      type: 'connection_fee',
      customerId: req.user._id,
      amount: fee,
      platformFee: fee,
      providerAmount: 0,
      currency: c.currency,
      country,
      gateway: gateway.name,
      reference,
      status: 'pending',
      isEscrow: false,
      disbursementStatus: 'not_applicable',
      metadata: { purpose: 'connection_fee', userEmail: req.user.email, userName: req.user.fullName },
    });

    const checkout = await gateways.startCheckout({
      country,
      amount: fee,
      currency: c.currency,
      email: req.user.email,
      reference: reference || String(payment._id),
      // The Connect page verifies the payment on return (the dashboard didn't)
      returnPath: '/customer/connect?payment=success',
      cancelPath: '/customer/connect?payment=cancelled',
      metadata: { type: 'connection_fee', paymentId: String(payment._id), userId: String(req.user._id) },
      productName: 'GEOBUY Connection Fee',
      description: 'One-time fee to unlock unlimited connections on GEOBUY',
    });

    payment.reference = checkout.reference;
    if (gateway.name === 'stripe') payment.stripeSessionId = checkout.reference;
    await payment.save();

    res.json({
      sessionId: checkout.reference,
      sessionUrl: checkout.url,
      url: checkout.url,
      reference: checkout.reference,
      gateway: gateway.name,
      paymentId: payment._id,
      amount: fee,
      currency: c.currency,
    });
  } catch (error) {
    console.error('Create connection checkout session error:', error);
    res.status(500).json({ message: error.message });
  }
};

/** GET /connections/verify-payment?session_id=  (Stripe)  or  ?reference=  (Paystack) */
exports.verifyConnectionPayment = async (req, res) => {
  try {
    const reference = req.query.reference || req.query.trxref || req.query.session_id;
    if (!reference) return res.status(400).json({ message: 'Missing payment reference' });

    const payment = await Payment.findOne({
      type: 'connection_fee',
      $or: [{ reference }, { stripeSessionId: reference }, { 'metadata.sessionId': reference }],
    });
    if (!payment) return res.status(404).json({ message: 'Payment record not found' });
    if (!same(payment.customerId, req.user._id) && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (payment.status === 'succeeded') {
      return res.json({ message: 'Payment already confirmed', alreadyProcessed: true, data: { payment, canCreateConnections: true } });
    }

    const gateway = gateways.gatewayByName(payment.gateway) || gateways.stripe;
    const verified = await gateway.verify(payment.reference || reference);
    if (!verified.paid) return res.status(400).json({ message: 'Payment not completed', status: verified.status });

    const result = await markConnectionFeePaid(payment, verified);
    res.json({
      message: 'Payment verified successfully',
      data: { payment: result.payment, connection: result.connection, canCreateConnections: true },
    });
  } catch (error) {
    console.error('Verify connection payment error:', error);
    res.status(500).json({ message: error.message });
  }
};

exports.markConnectionFeePaid = markConnectionFeePaid;

// Legacy Stripe Elements endpoints (not used by the current frontend).
exports.createConnectionFeePaymentIntent = (req, res) => exports.createConnectionCheckoutSession(req, res);
exports.confirmConnectionFeePayment = (req, res) => {
  req.query.reference = req.body.reference || req.body.sessionId || req.body.paymentIntentId;
  return exports.verifyConnectionPayment(req, res);
};
