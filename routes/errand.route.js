const express = require('express');
const router = express.Router();
const { authMiddleware, requireRole } = require('../middleware/auth.middleware');
const ErrandController = require('../controllers/errand.controller');
const QRCodeController = require('../controllers/qrCode.controller');
const { upload } = require('../middleware/upload');


// Price preview — calculated on the server so the price shown is the price paid
router.post('/quote', authMiddleware, requireRole('customer'), ErrandController.quoteErrand);

router.get('/', authMiddleware, ErrandController.getErrands);
router.get('/available', authMiddleware, requireRole('errand_runner'), ErrandController.getAvailableErrands);
router.get('/stats', authMiddleware, ErrandController.getErrandStats);
router.get('/status/:status', authMiddleware, ErrandController.getErrandsByStatus);
router.get('/:id', authMiddleware, ErrandController.getErrandById);
router.post('/', authMiddleware, requireRole('customer'), ErrandController.createErrand);
router.put('/:id/accept', authMiddleware, requireRole('errand_runner'), ErrandController.acceptErrand);
// Customers confirm completion / cancel; runners move it along; admins override.
// Per-role rules are enforced in the controller.
router.put('/:id/status', authMiddleware, requireRole('customer', 'errand_runner', 'admin'), ErrandController.updateErrandStatus);

router.get('/:id/qr-code', authMiddleware, QRCodeController.generateQRCode);
router.post('/:id/scan-qr', authMiddleware, QRCodeController.scanQRCode);
router.post('/:id/upload-document', authMiddleware, upload.single('document'), QRCodeController.uploadDocument);
router.get('/:id/documents', authMiddleware, QRCodeController.getDocuments);

module.exports = router;