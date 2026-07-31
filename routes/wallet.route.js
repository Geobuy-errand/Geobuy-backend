const express = require('express');
const router = express.Router();
const { authMiddleware, requireRole } = require('../middleware/auth.middleware');
const WalletController = require('../controllers/wallet.controller');

// Provider wallet routes
router.get('/', authMiddleware, WalletController.getWallet);
router.get('/transactions', authMiddleware, WalletController.getTransactions);
router.post('/withdraw', authMiddleware, requireRole('provider'), WalletController.requestWithdrawal);
router.get('/withdrawals', authMiddleware, WalletController.getWithdrawals);

// Admin wallet routes
router.put('/withdrawals/:id/process', authMiddleware, requireRole('admin'), WalletController.processWithdrawal);
router.get('/admin/withdrawals', authMiddleware, requireRole('admin'), WalletController.getAllWithdrawals);

module.exports = router;