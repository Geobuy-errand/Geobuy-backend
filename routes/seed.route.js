const express = require('express');
const router = express.Router();
const { authMiddleware, requireRole } = require('../middleware/auth.middleware');
const seedController = require('../controllers/seed.controller');

// ============================================================
// SEED ROUTES - For Production Deployment
// ============================================================

// Run all seeders (Admin only)
router.get('/run-all', seedController.runAllSeeders);

// Run specific seeders
router.get('/run/:seeder', seedController.runSpecificSeeder);

// Check seed status
router.get('/status', seedController.getSeedStatus);

// Reset and reseed everything (Admin only - DANGEROUS)
router.get('/reset-all', seedController.resetAndReseed);

module.exports = router;