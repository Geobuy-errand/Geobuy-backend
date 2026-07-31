const express = require('express');
const router = express.Router();
const { upload } = require('../middleware/upload');
const { authMiddleware } = require('../middleware/auth.middleware');
const UploadController = require('../controllers/upload.controller');

// Upload single file
router.post('/single', authMiddleware, upload.single('file'), UploadController.uploadSingle);

// Upload multiple files
router.post('/multiple', authMiddleware, upload.array('files', 5), UploadController.uploadMultiple);

// Upload provider documents
router.post('/provider-documents', authMiddleware, upload.array('documents', 10), UploadController.uploadProviderDocuments);

module.exports = router;