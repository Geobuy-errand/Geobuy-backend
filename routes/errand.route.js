const express = require('express');
const router = express.Router();
const { authMiddleware, requireRole } = require('../middleware/auth.middleware');
const ErrandController = require('../controllers/errand.controller');

// Get all errands
router.get('/', authMiddleware, ErrandController.getErrands);

// Get available errands for providers
router.get('/available', authMiddleware, requireRole('provider'), ErrandController.getAvailableErrands);

// Get errand by ID
router.get('/:id', authMiddleware, ErrandController.getErrandById);

// Create errand
router.post('/', authMiddleware, requireRole('customer'), ErrandController.createErrand);

// Accept errand
router.put('/:id/accept', authMiddleware, requireRole('provider'), ErrandController.acceptErrand);

// Update errand status
router.put('/:id/status', authMiddleware, ErrandController.updateErrandStatus);

module.exports = router;