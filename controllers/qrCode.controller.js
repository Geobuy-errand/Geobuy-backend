const Errand = require('../models/Errand.model');
const QRCode = require('qrcode');
const crypto = require('crypto');
const Notification = require('../models/Notification.model');
const { uploadFile } = require('../middleware/upload');

// Generate QR code for an errand
exports.generateQRCode = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const errand = await Errand.findById(id);
    if (!errand) {
      return res.status(404).json({ message: 'Errand not found' });
    }

    // Check authorization (customer or admin)
    if (errand.customerId.toString() !== userId.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Generate a unique verification token
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(16).toString('hex');
    const verificationToken = `${errand.errandId}-${timestamp}-${random}`;

    // Create QR code data payload
    const qrData = {
      errandId: errand._id.toString(),
      errandCode: errand.errandId,
      verificationToken: verificationToken,
      timestamp: new Date().toISOString(),
      type: 'errand_verification',
    };

    // Convert to JSON string
    const qrString = JSON.stringify(qrData);

    // Generate QR code as base64
    const qrCodeBuffer = await QRCode.toBuffer(qrString, {
      type: 'png',
      width: 300,
      margin: 2,
      color: {
        dark: '#1B6E43',
        light: '#FFFFFF',
      },
      errorCorrectionLevel: 'H',
    });

    // Convert to base64
    const base64QR = qrCodeBuffer.toString('base64');
    const dataUrl = `data:image/png;base64,${base64QR}`;

    // Store QR code data in errand
    errand.qrCode = {
      verificationToken: verificationToken,
      qrDataUrl: dataUrl,
      generatedAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      scanCount: errand.qrCode?.scanCount || 0,
      isVerified: errand.qrCode?.isVerified || false,
    };
    await errand.save();

    res.json({
      message: 'QR code generated successfully',
      qrCode: {
        dataUrl: dataUrl,
        verificationToken: verificationToken,
        expiresAt: errand.qrCode.expiresAt,
        errandId: errand.errandId,
        scanCount: errand.qrCode.scanCount,
      },
    });

  } catch (error) {
    console.error('Generate QR code error:', error);
    res.status(500).json({ 
      message: 'Failed to generate QR code',
      error: error.message 
    });
  }
};

// Scan QR code (Provider)
exports.scanQRCode = async (req, res) => {
  try {
    const { id } = req.params;
    const { qrData } = req.body;
    const providerId = req.user._id;

    const errand = await Errand.findById(id);
    if (!errand) {
      return res.status(404).json({ message: 'Errand not found' });
    }

    // Check if provider is assigned to this errand
    if (errand.providerId?.toString() !== providerId.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'You are not assigned to this errand' });
    }

    // Parse QR data
    let parsedData;
    try {
      parsedData = typeof qrData === 'string' ? JSON.parse(qrData) : qrData;
    } catch (error) {
      return res.status(400).json({ message: 'Invalid QR code format' });
    }

    // Verify QR code
    if (parsedData.type !== 'errand_verification') {
      return res.status(400).json({ message: 'Invalid QR code type' });
    }

    if (parsedData.errandId !== id) {
      return res.status(400).json({ message: 'QR code does not match this errand' });
    }

    // Check if QR has expired (24 hours)
    const tokenAge = Date.now() - new Date(parsedData.timestamp).getTime();
    if (tokenAge > 24 * 60 * 60 * 1000) {
      return res.status(400).json({ message: 'QR code has expired' });
    }

    // Initialize qrCode if not exists
    if (!errand.qrCode) {
      errand.qrCode = {
        scanCount: 0,
        isVerified: false,
      };
    }

    // Update scan count
    errand.qrCode.scanCount = (errand.qrCode.scanCount || 0) + 1;
    errand.qrCode.scannedAt = new Date();
    errand.qrCode.scannedBy = providerId;

    // First scan = pickup verification
    if (errand.qrCode.scanCount === 1) {
      errand.pickupVerification = {
        isVerified: true,
        verifiedAt: new Date(),
        verifiedBy: providerId,
        verificationMethod: 'qr_code',
        notes: 'Pickup verified via QR code scan',
      };
      
      if (errand.status === 'en_route') {
        errand.status = 'collected';
        errand.collectedAt = new Date();
      }

      // Notify customer
      await createNotification(
        errand.customerId,
        'pickup_verified',
        'Pickup Verified ✅',
        `${req.user.fullName} has picked up your errand`,
        { errandId: errand._id }
      );
    }

    // Second scan = delivery verification
    if (errand.qrCode.scanCount >= 2 && errand.status === 'collected') {
      errand.status = 'delivered';
      errand.deliveredAt = new Date();
      errand.completionVerification = {
        isVerified: true,
        verifiedAt: new Date(),
        verifiedBy: providerId,
        verificationMethod: 'qr_code',
        notes: 'Delivery verified via QR code scan',
      };

      // Notify customer
      await createNotification(
        errand.customerId,
        'delivery_verified',
        'Delivery Verified ✅',
        `${req.user.fullName} has delivered your errand`,
        { errandId: errand._id }
      );
    }

    // Mark QR as fully verified if both pickup and delivery are done
    if (errand.pickupVerification?.isVerified && errand.completionVerification?.isVerified) {
      errand.qrCode.isVerified = true;
    }

    await errand.save();

    // Emit socket events
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${errand.customerId}`).emit('qr-code-scanned', {
        errandId: errand._id,
        scanCount: errand.qrCode.scanCount,
        status: errand.status,
        scannedBy: req.user.fullName,
        timestamp: new Date(),
      });
      io.to('admin_room').emit('qr-code-scanned', {
        errandId: errand._id,
        errandCode: errand.errandId,
        customerId: errand.customerId,
        providerId: providerId,
        scanCount: errand.qrCode.scanCount,
      });
    }

    res.json({
      message: `QR code scanned successfully (Scan ${errand.qrCode.scanCount})`,
      scanCount: errand.qrCode.scanCount,
      status: errand.status,
      pickupVerified: errand.pickupVerification?.isVerified || false,
      deliveryVerified: errand.completionVerification?.isVerified || false,
    });

  } catch (error) {
    console.error('Scan QR code error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Upload document for errand (Cloudinary)
exports.uploadDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const { documentType, description, isRequired } = req.body;
    const userId = req.user._id;

    const errand = await Errand.findById(id);
    if (!errand) {
      return res.status(404).json({ message: 'Errand not found' });
    }

    // Check authorization
    const isCustomer = errand.customerId.toString() === userId.toString();
    const isProvider = errand.providerId && errand.providerId.toString() === userId.toString();

    if (!isCustomer && !isProvider && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // Upload file to Cloudinary
    let fileUrl;
    try {
      fileUrl = await uploadFile(req.file, 'geobuy/errands');
    } catch (uploadError) {
      console.error('Cloudinary upload error:', uploadError);
      return res.status(500).json({ 
        message: 'Failed to upload file to Cloudinary',
        error: uploadError.message 
      });
    }

    // Initialize documents array if not exists
    if (!errand.documents) {
      errand.documents = [];
    }

    // Add document
    const newDocument = {
      type: documentType || 'image',
      url: fileUrl,
      filename: req.file.originalname || 'document',
      description: description || '',
      uploadedAt: new Date(),
      uploadedBy: userId,
      isRequired: isRequired || false,
    };

    errand.documents.push(newDocument);
    await errand.save();

    // Notify other party
    const recipientId = isCustomer ? errand.providerId : errand.customerId;
    if (recipientId) {
      await createNotification(
        recipientId,
        'document_uploaded',
        'Document Uploaded 📄',
        `${req.user.fullName} uploaded a document for errand ${errand.errandId}`,
        { errandId: errand._id, documentType }
      );
    }

    res.status(201).json({
      message: 'Document uploaded successfully',
      document: newDocument,
      cloudinaryUrl: fileUrl,
    });

  } catch (error) {
    console.error('Upload document error:', error);
    res.status(500).json({ 
      message: 'Failed to upload document',
      error: error.message 
    });
  }
};

// Get all documents for an errand
exports.getDocuments = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const errand = await Errand.findById(id);
    if (!errand) {
      return res.status(404).json({ message: 'Errand not found' });
    }

    // Check authorization
    const isCustomer = errand.customerId.toString() === userId.toString();
    const isProvider = errand.providerId && errand.providerId.toString() === userId.toString();

    if (!isCustomer && !isProvider && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json({
      documents: errand.documents || [],
      pickupVerification: errand.pickupVerification || { isVerified: false },
      completionVerification: errand.completionVerification || { isVerified: false, proofImages: [] },
      qrCode: errand.qrCode ? {
        generatedAt: errand.qrCode.generatedAt,
        expiresAt: errand.qrCode.expiresAt,
        isVerified: errand.qrCode.isVerified,
        scanCount: errand.qrCode.scanCount,
      } : null,
    });

  } catch (error) {
    console.error('Get documents error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Helper function
const createNotification = async (userId, type, title, message, data) => {
  try {
    const Notification = require('../models/Notification.model');
    const notification = new Notification({
      userId,
      type,
      title,
      message,
      data,
    });
    await notification.save();
    return notification;
  } catch (error) {
    console.error('Create notification error:', error);
  }
};