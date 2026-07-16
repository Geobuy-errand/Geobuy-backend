const express = require('express');
const router = express.Router();
const Wallet = require('../models/Wallet.model');
const Withdrawal = require('../models/Withdrawal.model');
const Payment = require('../models/Payment.model');
const { authMiddleware, requireRole } = require('../middleware/auth.middleware');

// Get wallet balance
router.get('/', authMiddleware, async (req, res) => {
  try {
    let wallet = await Wallet.findOne({ userId: req.user._id });

    if (!wallet) {
      wallet = new Wallet({ userId: req.user._id });
      await wallet.save();
    }

    res.json(wallet);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get wallet transactions
router.get('/transactions', authMiddleware, async (req, res) => {
  try {
    // Get payments where user is provider (earnings)
    const earnings = await Payment.find({
      providerId: req.user._id,
      status: 'succeeded',
    })
      .populate('bookingId', 'bookingId serviceType date')
      .sort({ releasedAt: -1 });

    // Get withdrawals
    const withdrawals = await Withdrawal.find({
      userId: req.user._id,
    }).sort({ createdAt: -1 });

    res.json({
      earnings,
      withdrawals,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Request withdrawal
router.post('/withdraw', authMiddleware, requireRole('provider'), async (req, res) => {
  try {
    const { amount } = req.body;

    if (amount <= 0) {
      return res.status(400).json({ message: 'Amount must be greater than 0' });
    }

    const wallet = await Wallet.findOne({ userId: req.user._id });
    if (!wallet) {
      return res.status(404).json({ message: 'Wallet not found' });
    }

    if (wallet.balance < amount) {
      return res.status(400).json({ message: 'Insufficient balance' });
    }

    // Check minimum withdrawal
    if (amount < 10) {
      return res.status(400).json({ message: 'Minimum withdrawal amount is £10' });
    }

    // Create withdrawal request
    const withdrawal = new Withdrawal({
      userId: req.user._id,
      amount,
      bankDetails: {
        bankName: req.user.bankDetails?.bankName || 'Not provided',
        sortCode: req.user.bankDetails?.sortCode || 'Not provided',
        accountNumber: req.user.bankDetails?.accountNumber || 'Not provided',
      },
      status: 'pending',
      reference: `WD-${Date.now()}`,
    });

    await withdrawal.save();

    // Deduct from balance
    wallet.balance -= amount;
    wallet.pendingBalance += amount;
    await wallet.save();

    res.status(201).json({
      message: 'Withdrawal request submitted',
      withdrawal,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get withdrawal history
router.get('/withdrawals', authMiddleware, async (req, res) => {
  try {
    const withdrawals = await Withdrawal.find({
      userId: req.user._id,
    }).sort({ createdAt: -1 });

    res.json(withdrawals);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Admin: Process withdrawal
router.put('/withdrawals/:id/process', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { status, failureReason } = req.body;

    const withdrawal = await Withdrawal.findById(req.params.id);
    if (!withdrawal) {
      return res.status(404).json({ message: 'Withdrawal not found' });
    }

    if (withdrawal.status !== 'pending') {
      return res.status(400).json({ message: 'Withdrawal is not pending' });
    }

    withdrawal.status = status;
    withdrawal.processedAt = new Date();

    if (status === 'failed') {
      withdrawal.failureReason = failureReason || 'Processing failed';
      
      // Refund the amount
      const wallet = await Wallet.findOne({ userId: withdrawal.userId });
      if (wallet) {
        wallet.balance += withdrawal.amount;
        wallet.pendingBalance -= withdrawal.amount;
        await wallet.save();
      }
    } else if (status === 'completed') {
      // Actual payout integration would go here
      const wallet = await Wallet.findOne({ userId: withdrawal.userId });
      if (wallet) {
        wallet.pendingBalance -= withdrawal.amount;
        wallet.totalWithdrawn += withdrawal.amount;
        await wallet.save();
      }
    }

    await withdrawal.save();

    res.json({
      message: 'Withdrawal processed',
      withdrawal,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Admin: Get all withdrawals
router.get('/admin/withdrawals', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { status } = req.query;
    const query = status ? { status } : {};

    const withdrawals = await Withdrawal.find(query)
      .populate('userId', 'fullName email')
      .sort({ createdAt: -1 });

    res.json(withdrawals);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;