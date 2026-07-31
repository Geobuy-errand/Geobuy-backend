const Verification = require('../models/Verification.model');
const User = require('../models/User.model');

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

    res.json({
      message: 'Verification reviewed',
      verification,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};