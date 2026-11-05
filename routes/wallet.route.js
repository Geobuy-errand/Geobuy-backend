const express = require('express');
const router = express.Router();
const { authMiddleware, requireRole } = require('../middleware/auth.middleware');
const WalletController = require('../controllers/wallet.controller');

// Provider / runner wallet
router.get('/', authMiddleware, WalletController.getWallet);
router.get('/transactions', authMiddleware, WalletController.getTransactions);
router.post('/withdraw', authMiddleware, requireRole('provider', 'errand_runner'), WalletController.requestWithdrawal);
router.get('/withdrawals', authMiddleware, requireRole('provider', 'errand_runner'), WalletController.getWithdrawals);

// Bank accounts (Nigeria: verified with Paystack)
// Public: bank list is needed on the sign-up form (no sensitive data)
router.get('/banks', WalletController.getBanks);
router.post('/bank-account/resolve', authMiddleware, WalletController.resolveBankAccount);
router.put('/bank-account', authMiddleware, requireRole('provider', 'errand_runner'), WalletController.saveBankAccount);

// Admin
router.put('/withdrawals/:id/process', authMiddleware, requireRole('admin'), WalletController.processWithdrawal);
router.get('/admin/withdrawals', authMiddleware, requireRole('admin'), WalletController.getAllWithdrawals);

module.exports = router;
