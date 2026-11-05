// ============================================================
// Wallet & withdrawals — UK and Nigeria
//
// UK:      runner/provider requests -> admin pays by bank transfer -> marks completed
// Nigeria: runner/provider requests -> admin approves -> Paystack Transfer is sent
//          to the verified NUBAN account -> webhook marks it completed / failed
// ============================================================

const crypto = require('crypto');
const Wallet = require('../models/Wallet.model');
const Withdrawal = require('../models/Withdrawal.model');
const Payment = require('../models/Payment.model');
const Transaction = require('../models/Transaction.model');
const User = require('../models/User.model');
const Settings = require('../models/Setting.model');
const createNotification = require('../utils/create-notification');
const paystack = require('../services/payments/paystack');
const pricingService = require('../services/pricingService');
const { getOrCreateWallet } = require('../services/escrowService');
const { countryOfUser, getCountry } = require('../config/countries');
const { formatMoney, round2 } = require('../utils/money');

function withdrawalReference() {
  // Paystack: lowercase letters, digits, '-' or '_', 16–50 characters
  return `wd_${Date.now()}_${crypto.randomBytes(5).toString('hex')}`;
}

// GET /wallet
exports.getWallet = async (req, res) => {
  try {
    const country = countryOfUser(req.user);
    const wallet = await getOrCreateWallet(req.user._id, country);
    const pricing = await pricingService.getPricing(country);
    res.json({
      ...wallet.toObject(),
      currency: wallet.currency || getCountry(country).currency,
      country,
      minWithdrawal: pricing.minWithdrawal,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /wallet/transactions
exports.getTransactions = async (req, res) => {
  try {
    const earnings = await Payment.find({
      providerId: req.user._id,
      status: { $in: ['succeeded', 'completed'] },
      disbursementStatus: 'completed',
    })
      .populate('bookingId', 'bookingId serviceType date')
      .populate('errandId', 'errandId pickup.town dropoff.town')
      .sort({ releasedAt: -1 });

    const withdrawals = await Withdrawal.find({ userId: req.user._id }).sort({ createdAt: -1 });
    const transactions = await Transaction.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(200);

    res.json({ earnings, withdrawals, transactions });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ------------------------------------------------------------
// Bank accounts
// ------------------------------------------------------------

// GET /wallet/banks — Nigerian banks (from Paystack)
exports.getBanks = async (req, res) => {
  try {
    const country = String(req.query.country || (req.user ? countryOfUser(req.user) : 'GB')).toUpperCase();
    if (country !== 'NG') return res.json([]);
    const banks = await paystack.listBanks();
    res.json(banks);
  } catch (error) {
    res.status(502).json({ message: `Could not load banks: ${error.message}` });
  }
};

// POST /wallet/bank-account/resolve { accountNumber, bankCode } — Nigeria name check
exports.resolveBankAccount = async (req, res) => {
  try {
    const { accountNumber, bankCode } = req.body;
    if (!/^\d{10}$/.test(String(accountNumber || ''))) {
      return res.status(400).json({ message: 'Account number must be 10 digits' });
    }
    if (!bankCode) return res.status(400).json({ message: 'Please select your bank' });
    const result = await paystack.resolveAccount(accountNumber, bankCode);
    res.json(result);
  } catch (error) {
    res.status(400).json({ message: "We couldn't verify that account. Check the number and bank." });
  }
};

// PUT /wallet/bank-account — save payout details
exports.saveBankAccount = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const country = countryOfUser(user);
    const { bankName, bankCode, accountNumber, sortCode, accountName } = req.body;

    if (country === 'NG') {
      if (!/^\d{10}$/.test(String(accountNumber || ''))) {
        return res.status(400).json({ message: 'Account number must be 10 digits' });
      }
      if (!bankCode) return res.status(400).json({ message: 'Please select your bank' });

      let resolvedName = accountName;
      let recipientCode;
      if (paystack.isConfigured()) {
        const resolved = await paystack.resolveAccount(accountNumber, bankCode).catch(() => null);
        if (!resolved) return res.status(400).json({ message: "We couldn't verify that account. Check the number and bank." });
        resolvedName = resolved.accountName;
        const recipient = await paystack.createTransferRecipient({ name: resolvedName, accountNumber, bankCode });
        recipientCode = recipient.recipientCode;
      }

      user.bankDetails = {
        bankName,
        bankCode,
        accountNumber,
        accountName: resolvedName,
        isVerified: Boolean(recipientCode),
        paystackRecipientCode: recipientCode,
      };
    } else {
      const sc = String(sortCode || '').replace(/[\s-]/g, '');
      if (!/^\d{6}$/.test(sc)) return res.status(400).json({ message: 'Sort code must be 6 digits' });
      if (!/^\d{8}$/.test(String(accountNumber || ''))) return res.status(400).json({ message: 'Account number must be 8 digits' });
      user.bankDetails = { bankName, sortCode: sc, accountNumber, accountName, isVerified: false };
    }

    await user.save();
    res.json({ message: 'Bank details saved', bankDetails: user.toJSON().bankDetails });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ------------------------------------------------------------
// Withdrawals
// ------------------------------------------------------------

// POST /wallet/withdraw { amount }
exports.requestWithdrawal = async (req, res) => {
  try {
    // Amount arrives as a string from forms — parse it, or `pendingBalance += amount`
    // concatenates strings ("0" + "50" = "050") and corrupts the wallet.
    const amount = round2(parseFloat(req.body.amount));
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: 'Amount must be greater than 0' });
    }

    const user = await User.findById(req.user._id);
    const country = countryOfUser(user);
    const c = getCountry(country);
    const pricing = await pricingService.getPricing(country);

    if (amount < pricing.minWithdrawal) {
      return res.status(400).json({ message: `Minimum withdrawal amount is ${formatMoney(pricing.minWithdrawal, c.currency)}` });
    }

    const bank = user.bankDetails || {};
    if (country === 'NG') {
      if (!bank.accountNumber || !bank.bankCode) {
        return res.status(400).json({ message: 'Please add your bank account before withdrawing' });
      }
    } else if (!bank.accountNumber || !bank.sortCode) {
      return res.status(400).json({ message: 'Please add your bank details before withdrawing' });
    }

    await getOrCreateWallet(user._id, country);

    // Atomic: only succeeds if the balance is still high enough. Prevents two
    // quick requests from both withdrawing the same money.
    const wallet = await Wallet.findOneAndUpdate(
      { userId: user._id, balance: { $gte: amount } },
      { $inc: { balance: -amount, pendingBalance: amount } },
      { new: true }
    );
    if (!wallet) return res.status(400).json({ message: 'Insufficient balance' });

    let withdrawal;
    try {
      withdrawal = await Withdrawal.create({
        userId: user._id,
        amount,
        currency: c.currency,
        country,
        gateway: country === 'NG' ? 'paystack' : 'manual',
        bankDetails: {
          bankName: bank.bankName || 'Not provided',
          sortCode: bank.sortCode,
          accountNumber: bank.accountNumber,
          bankCode: bank.bankCode,
          accountName: bank.accountName,
        },
        status: 'pending',
        reference: withdrawalReference(),
      });
    } catch (e) {
      await Wallet.updateOne({ userId: user._id }, { $inc: { balance: amount, pendingBalance: -amount } });
      throw e;
    }

    const admins = await User.find({ role: 'admin', isActive: true }).select('_id').lean();
    for (const a of admins) {
      await createNotification(a._id, 'withdrawal_requested', 'Withdrawal request', `${user.fullName} requested ${formatMoney(amount, c.currency)}`, {
        withdrawalId: withdrawal._id,
      });
    }

    res.status(201).json({ message: 'Withdrawal request submitted', withdrawal, wallet });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /wallet/withdrawals
exports.getWithdrawals = async (req, res) => {
  try {
    const withdrawals = await Withdrawal.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.json(withdrawals);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

async function refundToWallet(withdrawal, reason) {
  const claimed = await Withdrawal.findOneAndUpdate(
    { _id: withdrawal._id, status: { $in: ['pending', 'processing'] } },
    { $set: { status: 'failed', failedAt: new Date(), failureReason: reason || 'Processing failed' } },
    { new: true }
  );
  if (!claimed) return null;
  await Wallet.updateOne({ userId: claimed.userId }, { $inc: { balance: claimed.amount, pendingBalance: -claimed.amount } });
  await createNotification(
    claimed.userId,
    'withdrawal_failed',
    'Withdrawal failed',
    `Your withdrawal of ${formatMoney(claimed.amount, claimed.currency)} could not be completed and has been returned to your wallet. ${reason || ''}`.trim(),
    { withdrawalId: claimed._id }
  );
  return claimed;
}

async function markCompleted(withdrawal, extra = {}) {
  const claimed = await Withdrawal.findOneAndUpdate(
    { _id: withdrawal._id, status: { $in: ['pending', 'processing'] } },
    { $set: { status: 'completed', processedAt: new Date(), ...extra } },
    { new: true }
  );
  if (!claimed) return null;
  await Wallet.updateOne(
    { userId: claimed.userId },
    { $inc: { pendingBalance: -claimed.amount, totalWithdrawn: claimed.amount }, $set: { lastPayoutDate: new Date() } }
  );
  await Transaction.create({
    userId: claimed.userId,
    type: 'payout',
    amount: -claimed.amount,
    currency: claimed.currency,
    status: 'completed',
    description: 'Withdrawal to bank account',
    reference: claimed.reference,
    completedAt: new Date(),
  });
  await createNotification(
    claimed.userId,
    'withdrawal_processed',
    'Withdrawal sent',
    `${formatMoney(claimed.amount, claimed.currency)} has been sent to your bank account.`,
    { withdrawalId: claimed._id }
  );
  return claimed;
}

// PUT /wallet/withdrawals/:id/process — admin
// body: { status: 'completed' | 'approved' | 'failed' | 'rejected', failureReason }
exports.processWithdrawal = async (req, res) => {
  try {
    const { status, failureReason } = req.body;
    const withdrawal = await Withdrawal.findById(req.params.id);
    if (!withdrawal) return res.status(404).json({ message: 'Withdrawal not found' });
    if (withdrawal.status !== 'pending') return res.status(400).json({ message: 'Withdrawal is not pending' });

    if (['failed', 'rejected'].includes(status)) {
      const updated = await refundToWallet(withdrawal, failureReason || 'Rejected by admin');
      return res.json({ message: 'Withdrawal rejected and funds returned', withdrawal: updated });
    }

    if (!['completed', 'approved'].includes(status)) {
      return res.status(400).json({ message: 'Status must be approved, completed, failed or rejected' });
    }

    const settings = await Settings.getSettings();
    const usePaystack =
      (withdrawal.country || 'GB') === 'NG' && settings.features?.paystackPayoutsEnabled !== false && paystack.isConfigured();

    if (!usePaystack) {
      // UK (or Paystack payouts switched off): admin has paid manually.
      const updated = await markCompleted(withdrawal, { processedBy: req.user._id, gateway: 'manual' });
      return res.json({ message: 'Withdrawal marked as paid', withdrawal: updated });
    }

    // Nigeria: send the money with Paystack
    const user = await User.findById(withdrawal.userId);
    let recipientCode = user?.bankDetails?.paystackRecipientCode;
    if (!recipientCode) {
      const { accountNumber, bankCode } = withdrawal.bankDetails || {};
      const resolved = await paystack.resolveAccount(accountNumber, bankCode);
      const recipient = await paystack.createTransferRecipient({ name: resolved.accountName, accountNumber, bankCode });
      recipientCode = recipient.recipientCode;
      if (user) {
        user.bankDetails.paystackRecipientCode = recipientCode;
        user.bankDetails.accountName = resolved.accountName;
        user.bankDetails.isVerified = true;
        await user.save();
      }
    }

    const claimed = await Withdrawal.findOneAndUpdate(
      { _id: withdrawal._id, status: 'pending' },
      { $set: { status: 'processing', processedBy: req.user._id, gateway: 'paystack' } },
      { new: true }
    );
    if (!claimed) return res.status(409).json({ message: 'Withdrawal is already being processed' });

    try {
      const transfer = await paystack.transfer({
        amount: claimed.amount,
        recipientCode,
        reference: claimed.reference,
        reason: `GEOBUY payout ${claimed.reference}`,
      });
      claimed.transferCode = transfer.transferCode;
      claimed.metadata = { ...(claimed.metadata || {}), paystackStatus: transfer.status };
      await claimed.save();

      if (transfer.status === 'success') {
        const done = await markCompleted(claimed);
        return res.json({ message: 'Payout sent', withdrawal: done });
      }
      if (transfer.status === 'otp') {
        return res.json({
          message:
            'Paystack requires OTP confirmation for transfers. Disable "Confirm transfers before sending" in your Paystack dashboard, or finalize this transfer there.',
          withdrawal: claimed,
        });
      }
      return res.json({ message: 'Payout initiated — it will complete shortly', withdrawal: claimed });
    } catch (err) {
      const failed = await refundToWallet(claimed, `Paystack: ${err.message}`);
      return res.status(502).json({ message: `Payout failed: ${err.message}`, withdrawal: failed });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Called by the Paystack webhook
exports.completeWithdrawalByReference = async (reference) => {
  const w = await Withdrawal.findOne({ reference });
  if (w) await markCompleted(w);
};
exports.failWithdrawalByReference = async (reference, reason) => {
  const w = await Withdrawal.findOne({ reference });
  if (w) await refundToWallet(w, reason);
};

// GET /wallet/admin/withdrawals — admin
exports.getAllWithdrawals = async (req, res) => {
  try {
    const { status, country } = req.query;
    const query = {};
    if (status) query.status = status;
    if (country) query.country = String(country).toUpperCase();

    const withdrawals = await Withdrawal.find(query).populate('userId', 'fullName email country').sort({ createdAt: -1 });
    res.json(withdrawals);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
