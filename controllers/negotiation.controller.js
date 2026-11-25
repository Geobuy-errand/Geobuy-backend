// backend/controllers/negotiation.controller.js

const Errand = require('../models/Errand.model');
const User = require('../models/User.model');
const Notification = require('../models/Notification.model');
const createNotification = require('../utils/create-notification');
const pricingService = require('../services/pricingService');
const settingsService = require('../services/settingsService');
const { formatMoney } = require('../utils/money');

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/**
 * Negotiation rules for an errand, all from Admin → Settings:
 * on/off switch, the allowed price band (% of the quoted price), how long
 * offers stay open and the platform fee used to split an agreed price.
 */
async function negotiationRules(errand) {
  const country = errand.country || 'GB';
  const [pricing, ops, features] = await Promise.all([
    pricingService.getPricing(country),
    settingsService.getOperations(),
    settingsService.getFeatures(),
  ]);
  const quoted = Number(errand.total || errand.estimatedPrice?.total || 0);
  return {
    enabled: features.negotiationEnabled !== false,
    min: quoted ? round2((quoted * pricing.negotiationMinPercent) / 100) : 0,
    max: quoted ? round2((quoted * pricing.negotiationMaxPercent) / 100) : Infinity,
    offerHours: ops.negotiationOfferExpiryHours,
    platformFeePercentage: pricing.platformFeePercentage,
    currency: pricing.currency,
  };
}

/** Error message if an amount is outside the allowed band, else null. */
function outsideBand(amount, rules) {
  if (amount < rules.min || amount > rules.max) {
    return `Offers must be between ${formatMoney(rules.min, rules.currency)} and ${formatMoney(rules.max, rules.currency)} for this errand.`;
  }
  return null;
}

// Submit an offer for an errand (Provider)
exports.submitOffer = async (req, res) => {
  try {
    const { errandId, amount, message, expiresInHours } = req.body;
    const providerId = req.user._id;

    const errand = await Errand.findById(errandId);
    if (!errand) {
      return res.status(404).json({ message: 'Errand not found' });
    }

    const rules = await negotiationRules(errand);
    if (!rules.enabled) {
      return res.status(403).json({ message: 'Price negotiation is currently turned off' });
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
    const bandError = outsideBand(Number(amount), rules);
    if (bandError) return res.status(400).json({ message: bandError, min: rules.min, max: rules.max });

    // Offers stay open for the admin-set time (a shorter time may be requested)
    const hours = Math.min(Number(expiresInHours) || rules.offerHours, rules.offerHours);

    // Add offer
    errand.offers.push({
      providerId,
      amount: Math.round(amount * 100) / 100,
      message: message || '',
      status: 'pending',
      offeredAt: new Date(),
      expiresAt: settingsService.hoursFromNow(hours),
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

    // Revenue split at the platform fee set in admin (was hard-coded 20/80)
    const { platformFeePercentage } = await negotiationRules(errand);
    errand.platformFee = round2((offer.amount * platformFeePercentage) / 100);
    errand.providerAmount = round2(offer.amount - errand.platformFee);

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

    const rules = await negotiationRules(errand);
    if (!rules.enabled) {
      return res.status(403).json({ message: 'Price negotiation is currently turned off' });
    }
    const bandError = outsideBand(Number(amount), rules);
    if (bandError) return res.status(400).json({ message: bandError, min: rules.min, max: rules.max });

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
