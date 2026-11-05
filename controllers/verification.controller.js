const Verification = require('../models/Verification.model');
const User = require('../models/User.model');
const { sendTemplateEmail, providerTemplates } = require('../utils/email-templates');
const createNotification = require('../utils/create-notification');
const { uploadFile } = require('../middleware/upload');
const { countryOfUser } = require('../config/countries');

// Documents each country needs before an account can be reviewed.
// UK: ID, proof of address, right to work (+ DBS for care work)
// Nigeria: NIN slip / National ID, utility bill (proof of address)
const REQUIRED_DOCUMENTS = {
  GB: [['passport'], ['proofOfAddress'], ['rightToWork']],
  NG: [['ninSlip', 'passport'], ['utilityBill', 'proofOfAddress']],
};

const ALLOWED_DOCUMENTS = [
  'passport',
  'proofOfAddress',
  'rightToWork',
  'drivingLicence',
  'vehicleRegistration',
  'vehicleInsurance',
  'ninSlip',
  'utilityBill',
  'certification',
  'insurance',
  'dbs',
];

function requiredDocsFor(user) {
  const country = countryOfUser(user);
  const groups = [...REQUIRED_DOCUMENTS[country]];
  if (country === 'GB' && user.renderCareServices) groups.push(['dbs']);
  return groups;
}

function hasDoc(user, key) {
  if (key === 'dbs') return Boolean(user.dbsDocument);
  return Boolean(user.documents?.[key]);
}

// POST /verifications/upload  (multipart: document, documentType)
exports.uploadVerificationDocument = async (req, res) => {
  try {
    const { documentType } = req.body;
    if (!ALLOWED_DOCUMENTS.includes(documentType)) {
      return res.status(400).json({ message: 'Unknown document type' });
    }
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    const fileUrl = await uploadFile(req.file, 'geobuy/verification');
    const user = await User.findById(req.user._id);
    if (documentType === 'dbs') {
      user.dbsDocument = fileUrl;
      user.dbsStatus = 'pending';
    } else {
      user.documents = { ...(user.documents?.toObject?.() || user.documents || {}), [documentType]: fileUrl };
    }
    // A rejected user who uploads new documents can request review again
    if (user.verificationStatus === 'rejected') user.verificationStatus = 'not_submitted';
    await user.save();

    res.json({ message: 'Document uploaded', fileUrl, documentType });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /verifications/requirements — which documents this user must upload
exports.getRequirements = async (req, res) => {
  const user = await User.findById(req.user._id);
  const groups = requiredDocsFor(user);
  res.json({
    country: countryOfUser(user),
    required: groups.map((options) => ({ options, uploaded: options.some((k) => hasDoc(user, k)) })),
    complete: groups.every((options) => options.some((k) => hasDoc(user, k))),
  });
};

// Submit verification document
exports.submitVerification = async (req, res) => {
  try {
    const { type, documentUrl, documentNumber, expiryDate } = req.body;

    // Check if verification already exists
    const existing = await Verification.findOne({
      userId: req.user._id,
      type,
    });

    if (existing) {
      return res.status(400).json({ message: 'Verification already submitted' });
    }

    const verification = new Verification({
      userId: req.user._id,
      type,
      documentUrl,
      documentNumber,
      expiryDate,
      status: 'pending',
    });

    await verification.save();

    res.status(201).json({
      message: 'Verification document submitted',
      verification,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
// Request verification review
exports.requestVerificationReview = async (req, res) => {
  try {
    const userId = req.user._id;

    // Check if user already has a pending verification
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (user.verificationStatus === 'approved') {
      return res.status(400).json({ success: false, message: 'Already verified' });
    }

    // Check if all required documents are uploaded (country-specific)
    const missing = requiredDocsFor(user).filter((options) => !options.some((k) => hasDoc(user, k)));
    if (missing.length) {
      return res.status(400).json({
        success: false,
        message: 'Please upload all required documents before requesting verification',
        missing: missing.map((o) => o[0]),
      });
    }

    if (user.verificationStatus === 'pending' && user.verificationRequestedAt) {
      return res.status(400).json({ success: false, message: 'Verification already pending' });
    }

    // Update user status to pending
    user.verificationStatus = 'pending';
    user.verificationRequestedAt = new Date();
    await user.save();

    // Notify admins
    const admins = await User.find({ role: 'admin', isActive: true });
    for (const admin of admins) {
      await createNotification(
        admin._id,
        'verification_request',
        '📋 New Verification Request',
        `${user.fullName} has submitted documents for verification`,
        { userId: user._id }
      );
    }

    res.json({
      success: true,
      message: 'Verification request submitted successfully',
    });
  } catch (error) {
    console.error('Request verification error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get user's verifications
exports.getMyVerifications = async (req, res) => {
  try {
    const verifications = await Verification.find({ userId: req.user._id })
      .sort({ createdAt: -1 });
    res.json(verifications);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Admin: Get pending verifications
exports.getPendingVerifications = async (req, res) => {
  try {
    const verifications = await Verification.find({ status: 'pending' })
      .populate('userId', 'fullName email')
      .sort({ createdAt: 1 });
    res.json(verifications);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Admin: Review verification
exports.reviewVerification = async (req, res) => {
  try {
    const { status, rejectionReason, notes } = req.body;
    const verification = await Verification.findById(req.params.id);
    const user = req.user

    if (!verification) {
      return res.status(404).json({ message: 'Verification not found' });
    }

    verification.status = status;
    verification.reviewedAt = new Date();
    verification.reviewedBy = req.user._id;
    verification.rejectionReason = rejectionReason;
    verification.notes = notes;

    await verification.save();

    // Update user's badges if approved
    if (status === 'approved') {
      const user = await User.findById(verification.userId);
      if (user) {
        const badgeMap = {
          'identity': 'id_checked',
          'dbs': 'dbs_checked',
          'certification': 'certified',
          'insurance': 'insured',
        };
        
        if (badgeMap[verification.type]) {
          if (!user.verificationBadges) {
            user.verificationBadges = [];
          }
          if (!user.verificationBadges.includes(badgeMap[verification.type])) {
            user.verificationBadges.push(badgeMap[verification.type]);
          }
          await user.save();
        }
      }
    }

    // In reviewVerification - when status is 'approved'
if (status === 'approved') {
  await sendTemplateEmail(
    user.email,
    providerTemplates.verificationApproved(
      user.fullName
    ).subject,
    providerTemplates.verificationApproved(
      user.fullName
    ).title,
    providerTemplates.verificationApproved(
      user.fullName
    ).content,
    providerTemplates.verificationApproved(
      user.fullName
    ).button
  );
}

// In reviewVerification - when status is 'rejected'
if (status === 'rejected') {
  await sendTemplateEmail(
    user.email,
    providerTemplates.verificationRejected(
      user.fullName,
      rejectionReason || 'Document verification failed'
    ).subject,
    providerTemplates.verificationRejected(
      user.fullName,
      rejectionReason || 'Document verification failed'
    ).title,
    providerTemplates.verificationRejected(
      user.fullName,
      rejectionReason || 'Document verification failed'
    ).content,
    providerTemplates.verificationRejected(
      user.fullName,
      rejectionReason || 'Document verification failed'
    ).button
  );
}

    res.json({
      message: 'Verification reviewed',
      verification,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};