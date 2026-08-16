const express = require('express');
const router = express.Router();
const { authMiddleware, requireRole } = require('../middleware/auth.middleware');
const ErrandController = require('../controllers/errand.controller');
const QRCodeController = require('../controllers/qrCode.controller');
const { upload } = require('../middleware/upload');

// ============================================================
// ERRAND ROUTES (Replaces Booking)
// ============================================================

// Get all errands (was: get all bookings)
router.get('/', authMiddleware, ErrandController.getErrands);

// Get available errands for providers (was: get available bookings)
router.get('/available', authMiddleware, requireRole('errand_runner'), ErrandController.getAvailableErrands);

// Get errands by status (was: get bookings by status)
router.get('/status/:status', authMiddleware, ErrandController.getErrandsByStatus);

// Get errand stats for dashboard
router.get('/stats', authMiddleware, ErrandController.getErrandStats);

// Get errand by ID (was: get booking by ID)
router.get('/:id', authMiddleware, ErrandController.getErrandById);

// Create errand (was: create booking)
router.post('/', authMiddleware, requireRole('customer'), ErrandController.createErrand);

// Accept errand (was: accept booking)
router.put('/:id/accept', authMiddleware, requireRole('errand_runner'), ErrandController.acceptErrand);

// Update errand status (was: update booking status)
router.put('/:id/status', authMiddleware, ErrandController.updateErrandStatus);

// ============================================================
// QR CODE ROUTES
// ============================================================

// Generate QR code
router.get('/:id/qr-code', authMiddleware, QRCodeController.generateQRCode);

// Scan QR code
router.post('/:id/scan-qr', authMiddleware, QRCodeController.scanQRCode);

// ============================================================
// DOCUMENT ROUTES
// ============================================================

// Upload document
router.post('/:id/upload-document', authMiddleware, upload.single('document'), QRCodeController.uploadDocument);

// Get documents
router.get('/:id/documents', authMiddleware, QRCodeController.getDocuments);

module.exports = router;