// backend/controllers/negotiation.controller.js

const Errand = require('../models/Errand.model');
const User = require('../models/User.model');
const Notification = require('../models/Notification.model');

// Submit an offer for an errand (Provider)
exports.submitOffer = async (req, res) => {
  try {
    const { errandId, amount, message, expiresInHours = 24 } = req.body;
    const providerId = req.user._id;

    const errand = await Errand.findById(errandId);
    if (!errand) {
      return res.status(404).json({ message: 'Errand not found' });
    }

    // Check if errand is open for offers
    if (errand.status !== 'pending' || errand.negotiationStatus === 'accepted') {
      return res.status(400).json({ message: 'Errand is no longer accepting offers' });
    }

    // Check if provider is the same as customer
    if (errand.customerId.toString() === providerId.toString()) {
      return res.status(400).json({ message: 'You cannot offer on your own errand' });
    }

    // Check if provider already submitted an offer
    const existingOffer = errand.offers.find(
      o => o.providerId.toString() === providerId.toString() && o.status === 'pending'
    );

    if (existingOffer) {
      return res.status(400).json({ message: 'You already have a pending offer on this errand' });
    }

    // Validate amount
    if (amount <= 0) {
      return res.status(400).json({ message: 'Offer amount must be greater than 0' });
    }

    // Add offer
    errand.offers.push({
      providerId,
      amount: Math.round(amount * 100) / 100,
      message: message || '',
      status: 'pending',
      offeredAt: new Date(),
      expiresAt: new Date(Date.now() + expiresInHours * 60 * 60 * 1000),
    });

    errand.negotiationStatus = 'negotiating';
    await errand.save();

    // Notify customer
    const provider = await User.findById(providerId);
    await createNotification(
      errand.customerId,
      'new_offer',
      'New Offer Received',
      `${provider.fullName} has offered £${amount.toFixed(2)} for your errand`,
      { errandId: errand._id, amount, providerId }
    );

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${errand.customerId}`).emit('new-offer', {
        errandId: errand._id,
        providerId,
        providerName: provider.fullName,
        amount: Math.round(amount * 100) / 100,
        message: message || '',
      });
    }

    res.status(201).json({
      message: 'Offer submitted successfully',
      offer: errand.offers[errand.offers.length - 1],
    });

  } catch (error) {
    console.error('Submit offer error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Accept an offer (Customer)
exports.acceptOffer = async (req, res) => {
  try {
    const { errandId, offerIndex } = req.body;
    const customerId = req.user._id;

    const errand = await Errand.findById(errandId);
    if (!errand) {
      return res.status(404).json({ message: 'Errand not found' });
    }

    // Verify customer owns this errand
    if (errand.customerId.toString() !== customerId.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Get the offer
    const offer = errand.offers[offerIndex];
    if (!offer) {
      return res.status(404).json({ message: 'Offer not found' });
    }

    if (offer.status !== 'pending') {
      return res.status(400).json({ message: 'Offer is no longer available' });
    }

    // Check if offer has expired
    if (offer.expiresAt && new Date(offer.expiresAt) < new Date()) {
      offer.status = 'expired';
      await errand.save();
      return res.status(400).json({ message: 'Offer has expired' });
    }

    // Accept the offer
    offer.status = 'accepted';
    errand.acceptedOffer = {
      providerId: offer.providerId,
      amount: offer.amount,
      acceptedAt: new Date(),
    };
    errand.providerId = offer.providerId;
    errand.status = 'accepted';
    errand.negotiationStatus = 'accepted';
    errand.total = offer.amount;

    // Calculate revenue split
    errand.platformFee = Math.round((offer.amount * 0.20) * 100) / 100; // 20%
    errand.providerAmount = Math.round((offer.amount * 0.80) * 100) / 100; // 80%

    await errand.save();

    // Notify provider
    await createNotification(
      offer.providerId,
      'offer_accepted',
      'Offer Accepted! 🎉',
      `Your offer of £${offer.amount.toFixed(2)} has been accepted for errand ${errand.errandId}`,
      { errandId: errand._id, amount: offer.amount }
    );

    // Emit socket events
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${offer.providerId}`).emit('offer-accepted', {
        errandId: errand._id,
        amount: offer.amount,
        customerId: errand.customerId,
      });
      io.to(`user_${customerId}`).emit('offer-accepted', {
        errandId: errand._id,
        amount: offer.amount,
        providerId: offer.providerId,
      });
      io.to('admin_room').emit('errand-accepted', {
        errandId: errand._id,
        errandId: errand.errandId,
        customerId: errand.customerId,
        providerId: offer.providerId,
        amount: offer.amount,
        platformFee: errand.platformFee,
        providerAmount: errand.providerAmount,
      });
    }

    res.json({
      message: 'Offer accepted successfully',
      errand,
      platformFee: errand.platformFee,
      providerAmount: errand.providerAmount,
    });

  } catch (error) {
    console.error('Accept offer error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Reject an offer (Customer)
exports.rejectOffer = async (req, res) => {
  try {
    const { errandId, offerIndex, reason } = req.body;
    const customerId = req.user._id;

    const errand = await Errand.findById(errandId);
    if (!errand) {
      return res.status(404).json({ message: 'Errand not found' });
    }

    if (errand.customerId.toString() !== customerId.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const offer = errand.offers[offerIndex];
    if (!offer) {
      return res.status(404).json({ message: 'Offer not found' });
    }

    offer.status = 'rejected';
    await errand.save();

    // Notify provider
    await createNotification(
      offer.providerId,
      'offer_rejected',
      'Offer Rejected',
      reason || `Your offer for errand ${errand.errandId} was rejected`,
      { errandId: errand._id }
    );

    res.json({
      message: 'Offer rejected',
    });

  } catch (error) {
    console.error('Reject offer error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Counter offer (Customer or Provider)
exports.counterOffer = async (req, res) => {
  try {
    const { errandId, offerIndex, amount, message } = req.body;
    const userId = req.user._id;

    const errand = await Errand.findById(errandId);
    if (!errand) {
      return res.status(404).json({ message: 'Errand not found' });
    }

    const offer = errand.offers[offerIndex];
    if (!offer) {
      return res.status(404).json({ message: 'Offer not found' });
    }

    // Check authorization
    const isCustomer = errand.customerId.toString() === userId.toString();
    const isProvider = offer.providerId.toString() === userId.toString();

    if (!isCustomer && !isProvider) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Add counter offer
    offer.counterOffers.push({
      amount: Math.round(amount * 100) / 100,
      message: message || '',
      offeredAt: new Date(),
    });
    offer.status = 'countered';

    await errand.save();

    // Determine who to notify
    const recipientId = isCustomer ? offer.providerId : errand.customerId;
    const senderName = isCustomer ? 'Customer' : 'Provider';

    await createNotification(
      recipientId,
      'counter_offer',
      'Counter Offer Received',
      `${senderName} has made a counter offer of £${amount.toFixed(2)}`,
      { errandId: errand._id, amount }
    );

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${recipientId}`).emit('counter-offer', {
        errandId: errand._id,
        amount: Math.round(amount * 100) / 100,
        from: isCustomer ? 'customer' : 'provider',
        message: message || '',
      });
    }

    res.json({
      message: 'Counter offer sent',
      offer,
    });

  } catch (error) {
    console.error('Counter offer error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get all offers for an errand
exports.getOffers = async (req, res) => {
  try {
    const { errandId } = req.params;
    const userId = req.user._id;

    const errand = await Errand.findById(errandId)
      .populate('offers.providerId', 'fullName email phoneNumber averageRating totalReviews')
      .populate('offers.counterOffers')
      .populate('acceptedOffer.providerId', 'fullName email');

    if (!errand) {
      return res.status(404).json({ message: 'Errand not found' });
    }

    // Check authorization
    const isCustomer = errand.customerId.toString() === userId.toString();
    const isProvider = errand.offers.some(o => o.providerId._id.toString() === userId.toString());

    if (!isCustomer && !isProvider && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json({
      errandId: errand._id,
      errandId: errand.errandId,
      status: errand.status,
      negotiationStatus: errand.negotiationStatus,
      offers: errand.offers,
      acceptedOffer: errand.acceptedOffer,
      totalOffers: errand.offers.length,
    });

  } catch (error) {
    console.error('Get offers error:', error);
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