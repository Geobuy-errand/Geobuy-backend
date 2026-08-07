const express = require('express');
const router = express.Router();
const { authMiddleware, requireRole } = require('../middleware/auth.middleware');
const ErrandController = require('../controllers/errand.controller');
const QRCodeController = require('../controllers/qrCode.controller');
const { upload } = require('../middleware/upload');


// Get all errands
router.get('/', authMiddleware, ErrandController.getErrands);
router.get('/available', authMiddleware, requireRole('provider'), ErrandController.getAvailableErrands);
router.get('/:id', authMiddleware, ErrandController.getErrandById);
router.post('/', authMiddleware, requireRole('customer'), ErrandController.createErrand);
router.put('/:id/accept', authMiddleware, requireRole('provider'), ErrandController.acceptErrand);
router.put('/:id/status', authMiddleware, ErrandController.updateErrandStatus);

router.get('/:id/qr-code', authMiddleware, QRCodeController.generateQRCode);
router.post('/:id/scan-qr', authMiddleware, QRCodeController.scanQRCode);
router.post('/:id/upload-document', authMiddleware, upload.single('document'), QRCodeController.uploadDocument);
router.get('/:id/documents', authMiddleware, QRCodeController.getDocuments);

module.exports = router;