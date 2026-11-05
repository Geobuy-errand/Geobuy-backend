// ============================================================
// EscrowService — money movement for errands
//
// Flow:
//   1. Customer pays upfront (Stripe Checkout / Paystack) -> markPaymentSucceeded()
//      Errand becomes visible to runners in the same country.
//   2. Runner accepts, runs the errand, marks it delivered.
//   3. Customer confirms (or admin, or auto-complete after N hours)
//      -> releaseErrandFunds() credits the runner's wallet.
//   4. Runner withdraws from wallet (Paystack transfer in Nigeria,
//      admin-processed bank transfer in the UK).
//
// Every function here is idempotent: calling it twice never pays twice.
// ============================================================

const Payment = require('../models/Payment.model');
const Errand = require('../models/Errand.model');
const Wallet = require('../models/Wallet.model');
const Transaction = require('../models/Transaction.model');
const User = require('../models/User.model');
const createNotification = require('../utils/create-notification');
const { formatMoney, round2 } = require('../utils/money');
const { getCountry, normalizeCountry } = require('../config/countries');
const gateways = require('./payments');

async function getOrCreateWallet(userId, country) {
  const currency = getCountry(country).currency;
  return Wallet.findOneAndUpdate(
    { userId },
    { $setOnInsert: { userId, currency, balance: 0, pendingBalance: 0, totalEarned: 0, totalWithdrawn: 0 } },
    { upsert: true, new: true }
  );
}

/**
 * Record a successful gateway payment (called by verify endpoints AND webhooks).
 * Returns { payment, alreadyProcessed }.
 */
async function markPaymentSucceeded(payment, { amount, currency, gatewayReference, paymentIntentId } = {}) {
  // Guard against amount tampering: the gateway must report what we asked for.
  if (amount !== undefined && round2(amount) + 0.01 < round2(payment.amount)) {
    throw new Error(`Paid amount ${amount} is less than expected ${payment.amount}`);
  }
  if (currency && String(currency).toUpperCase() !== String(payment.currency).toUpperCase()) {
    throw new Error(`Paid currency ${currency} does not match ${payment.currency}`);
  }

  // 'failed' / 'cancelled' are included: the gateway is the source of truth,
  // and a customer may finish paying on an older checkout page.
  const updated = await Payment.findOneAndUpdate(
    { _id: payment._id, status: { $in: ['pending', 'processing', 'failed', 'cancelled'] } },
    {
      $set: {
        status: 'succeeded',
        paymentDate: new Date(),
        ...(paymentIntentId ? { stripePaymentIntentId: paymentIntentId, paymentIntentId } : {}),
        ...(gatewayReference ? { 'metadata.gatewayReference': gatewayReference } : {}),
      },
    },
    { new: true }
  );

  if (!updated) {
    return { payment: await Payment.findById(payment._id), alreadyProcessed: true };
  }

  if (updated.type === 'errand' && updated.errandId) {
    // Only the first successful payment counts. A second one (e.g. paid in
    // two browser tabs) is flagged for refund instead of double-charging.
    const errand = await Errand.findOneAndUpdate(
      { _id: updated.errandId, paymentStatus: { $in: ['pending', null] } },
      { $set: { paymentStatus: 'paid', paymentId: updated._id, paidAt: new Date() } },
      { new: true }
    );
    if (!errand) {
      updated.status = 'refund_pending';
      updated.refundReason = 'Duplicate payment for an errand that was already paid';
      updated.disbursementStatus = 'not_applicable';
      await updated.save();
      const admins = await User.find({ role: 'admin', isActive: true }).select('_id').lean();
      for (const a of admins) {
        await createNotification(a._id, 'refund_required', 'Duplicate payment', 'A customer paid twice for the same errand. Please refund one payment.', {
          errandId: updated.errandId,
          paymentId: updated._id,
        });
      }
      return { payment: updated, alreadyProcessed: false, duplicate: true };
    }

    await Transaction.create({
      userId: updated.customerId,
      type: 'payment',
      amount: -updated.amount,
      currency: updated.currency,
      status: 'completed',
      description: `Payment for errand #${errand?.errandId || ''}`,
      reference: updated.reference,
      completedAt: new Date(),
      metadata: { paymentId: updated._id, errandId: updated.errandId },
    });

    await createNotification(
      updated.customerId,
      'payment_received',
      'Payment received',
      `Your payment of ${formatMoney(updated.amount, updated.currency)} for errand #${errand?.errandId || ''} was successful. We're finding a runner near you.`,
      { errandId: updated.errandId, paymentId: updated._id }
    );
  }

  return { payment: updated, alreadyProcessed: false };
}

/**
 * Credit the runner's wallet for a completed errand.
 * Safe to call repeatedly.
 */
async function releaseErrandFunds(errandOrId, { io, releasedBy = 'system' } = {}) {
  const errand = errandOrId?._id ? errandOrId : await Errand.findById(errandOrId);
  if (!errand) throw new Error('Errand not found');
  if (!errand.providerId) throw new Error('Errand has no runner assigned');

  const providerId = errand.providerId?._id || errand.providerId;
  const customerId = errand.customerId?._id || errand.customerId;

  // Atomically claim the payment for disbursement so two calls can't both pay.
  const payment = await Payment.findOneAndUpdate(
    {
      errandId: errand._id,
      status: { $in: ['succeeded', 'completed', 'paid'] },
      disbursementStatus: { $in: ['pending', 'failed'] },
    },
    { $set: { disbursementStatus: 'processing' } },
    { new: true }
  );

  if (!payment) {
    const existing = await Payment.findOne({ errandId: errand._id }).sort({ createdAt: -1 });
    if (existing?.disbursementStatus === 'completed') return { released: false, reason: 'already_released', payment: existing };
    return { released: false, reason: 'no_paid_payment', payment: existing };
  }

  try {
    const amount = round2(payment.providerAmount || errand.providerAmount || 0);
    const country = normalizeCountry(errand.country || payment.country);
    await getOrCreateWallet(providerId, country);
    await Wallet.updateOne({ userId: providerId }, { $inc: { balance: amount, totalEarned: amount } });

    const reference = `release-${payment._id}`;
    payment.providerId = providerId;
    payment.disbursementStatus = 'completed';
    payment.disbursementDate = new Date();
    payment.disbursementReference = reference;
    payment.releasedAt = new Date();
    await payment.save();

    await Errand.updateOne({ _id: errand._id }, { $set: { paymentStatus: 'released' } });

    await Transaction.create({
      userId: providerId,
      type: 'payout',
      amount,
      currency: payment.currency,
      status: 'completed',
      description: `Earnings for errand #${errand.errandId}`,
      reference,
      completedAt: new Date(),
      metadata: { errandId: errand._id, paymentId: payment._id, releasedBy },
    });

    const formatted = formatMoney(amount, payment.currency);
    await createNotification(
      providerId,
      'payment_released',
      'Funds released',
      `${formatted} has been added to your wallet for errand #${errand.errandId}`,
      { errandId: errand._id, amount, paymentId: payment._id }
    );
    await createNotification(
      customerId,
      'payment_released',
      'Errand completed',
      `Payment for errand #${errand.errandId} has been released to your runner. Thank you!`,
      { errandId: errand._id, paymentId: payment._id }
    );

    if (io) {
      io.to(`user_${providerId}`).emit('funds-released', { errandId: errand._id, amount, currency: payment.currency });
      io.to('admin_room').emit('funds-released', { errandId: errand._id, providerId, amount, currency: payment.currency });
    }

    return { released: true, amount, payment };
  } catch (err) {
    await Payment.updateOne({ _id: payment._id }, { $set: { disbursementStatus: 'failed' } });
    throw err;
  }
}

/**
 * Refund a paid errand that will not be fulfilled (cancelled before collection).
 * Tries the gateway refund; if it fails the payment is flagged for an admin.
 */
async function refundErrandPayment(errand, { reason = 'Errand cancelled', amount } = {}) {
  const payment = await Payment.findOne({
    errandId: errand._id,
    status: { $in: ['succeeded', 'completed', 'paid'] },
    disbursementStatus: { $ne: 'completed' },
  });
  if (!payment) return { refunded: false, reason: 'no_refundable_payment' };

  const refundAmount = round2(amount || payment.amount);
  try {
    const gateway = gateways.gatewayByName(payment.gateway) || gateways.gatewayForCurrency(payment.currency);
    if (gateway.name === 'paystack') {
      await gateway.refund(payment.reference, refundAmount, payment.currency);
    } else {
      let intentId = payment.stripePaymentIntentId || payment.paymentIntentId;
      if (!intentId && payment.reference) {
        const v = await gateway.verify(payment.reference);
        intentId = v.paymentIntentId;
      }
      if (!intentId) throw new Error('No Stripe payment intent on record');
      await gateway.refund(intentId, refundAmount, payment.currency);
    }

    payment.status = 'refunded';
    payment.disbursementStatus = 'not_applicable';
    payment.refundedAt = new Date();
    payment.refundAmount = refundAmount;
    payment.refundReason = reason;
    await payment.save();
    await Errand.updateOne({ _id: errand._id }, { $set: { paymentStatus: 'refunded' } });

    await Transaction.create({
      userId: payment.customerId,
      type: 'refund',
      amount: refundAmount,
      currency: payment.currency,
      status: 'completed',
      description: `Refund for errand #${errand.errandId}`,
      reference: `refund-${payment._id}`,
      completedAt: new Date(),
    });

    await createNotification(
      payment.customerId,
      'payment_refunded',
      'Refund issued',
      `${formatMoney(refundAmount, payment.currency)} is being refunded for errand #${errand.errandId}. It can take a few working days to reach your account.`,
      { errandId: errand._id, paymentId: payment._id }
    );
    return { refunded: true, amount: refundAmount };
  } catch (err) {
    console.error('Refund failed, flagged for admin:', err.message);
    payment.status = 'refund_pending';
    payment.refundReason = `${reason} (automatic refund failed: ${err.message})`;
    await payment.save();
    await Errand.updateOne({ _id: errand._id }, { $set: { paymentStatus: 'refund_pending' } });
    const admins = await User.find({ role: 'admin', isActive: true }).select('_id').lean();
    for (const a of admins) {
      await createNotification(a._id, 'refund_required', 'Manual refund needed', `Automatic refund failed for errand #${errand.errandId}.`, {
        errandId: errand._id,
        paymentId: payment._id,
      });
    }
    return { refunded: false, reason: 'refund_failed', error: err.message };
  }
}

module.exports = { getOrCreateWallet, markPaymentSucceeded, releaseErrandFunds, refundErrandPayment };
