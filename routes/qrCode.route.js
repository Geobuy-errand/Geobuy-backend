const express = require('express');
const router = express.Router();
const { authMiddleware, requireRole } = require('../middleware/auth.middleware');
const QRCodeController = require('../controllers/qrCode.controller');
const { upload } = require('../middleware/upload');

// Generate QR code for errand
router.get('/generate/:errandId', authMiddleware, QRCodeController.generateQRCode);
router.post('/scan/:errandId', authMiddleware, requireRole('provider'), QRCodeController.scanQRCode);
router.post('/upload/:errandId', authMiddleware, upload.single('document'), QRCodeController.uploadDocument);
router.get('/documents/:errandId', authMiddleware, QRCodeController.getDocuments);

// router.get('/:id/qr-code', authMiddleware, QRCodeController.generateQRCode);
// router.post('/:id/scan-qr', authMiddleware, QRCodeController.scanQRCode);
// router.post('/:id/upload-document', authMiddleware, QRCodeController.uploadDocument);
// router.get('/:id/documents', authMiddleware, QRCodeController.getDocuments);

module.exports = router;