const express = require('express');
const router = express.Router();
const seedController = require('../controllers/seed.controller');
const { requireSeedAccess } = require('../middleware/seedGuard');

// ============================================================
// SEED ROUTES — admin (or x-seed-secret) only. These used to be public,
// which let anyone on the internet wipe the database via /reset-all.
// ============================================================

router.get('/status', requireSeedAccess(), seedController.getSeedStatus);
router.get('/run-all', requireSeedAccess(), seedController.runAllSeeders);
router.get('/run/:seeder', requireSeedAccess(), seedController.runSpecificSeeder);

// Deletes settings and categories before reseeding — also needs ALLOW_DB_RESET=true
router.get('/reset-all', requireSeedAccess({ destructive: true }), seedController.resetAndReseed);

module.exports = router;
