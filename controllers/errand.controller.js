const Errand = require('../models/Errand.model');
const User = require('../models/User.model');
const Notification = require('../models/Notification.model');

// Get all errands for user
exports.getErrands = async (req, res) => {
  try {
    let query = {};
    if (req.user.role === 'customer') {
      query.customerId = req.user._id;
    } else if (req.user.role === 'provider') {
      query.providerId = req.user._id;
    }
    
    const errands = await Errand.find(query)
      .populate('customerId', 'fullName email phoneNumber')
      .populate('providerId', 'fullName email phoneNumber')
      .sort({ createdAt: -1 });
    
    res.json(errands);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get available errands for providers
exports.getAvailableErrands = async (req, res) => {
  try {
    const errands = await Errand.find({
      status: 'pending',
      providerId: null,
    })
      .populate('customerId', 'fullName phoneNumber address')
      .sort({ createdAt: -1 });
    
    res.json(errands);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Create errand
exports.createErrand = async (req, res) => {
  try {
    const {
      serviceType,
      pickup,
      dropoff,
      taskDetails,
      preferredDate,
      preferredTime,
      estimatedPrice,
      priceBreakdown,
      requiresLiveTracking,
    } = req.body;

    const errand = new Errand({
      customerId: req.user._id,
      serviceType,
      pickup,
      dropoff,
      taskDetails,
      preferredDate,
      preferredTime,
      estimatedPrice,
      priceBreakdown,
      requiresLiveTracking: requiresLiveTracking || false,
      status: 'pending',
    });

    await errand.save();

    // Notify nearby providers (simplified - would use geolocation)
    const providers = await User.find({
      role: 'provider',
      isActive: true,
      isAvailable: true,
      verificationStatus: 'approved',
    }).limit(10);

    // Create notifications for providers
    for (const provider of providers) {
      const notification = new Notification({
        userId: provider._id,
        type: 'booking_created',
        title: 'New Errand Available',
        message: `New ${serviceType} errand available in your area`,
        data: { errandId: errand._id },
      });
      await notification.save();
    }

    res.status(201).json({
      message: 'Errand created successfully',
      errand,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Accept errand
exports.acceptErrand = async (req, res) => {
  try {
    const errand = await Errand.findById(req.params.id);
    if (!errand) {
      return res.status(404).json({ message: 'Errand not found' });
    }

    if (errand.status !== 'pending') {
      return res.status(400).json({ message: 'Errand is not available' });
    }

    errand.providerId = req.user._id;
    errand.status = 'accepted';
    errand.acceptedAt = new Date();

    await errand.save();

    // Notify customer
    const notification = new Notification({
      userId: errand.customerId,
      type: 'booking_accepted',
      title: 'Errand Accepted',
      message: `${req.user.fullName} has accepted your errand`,
      data: { errandId: errand._id },
    });
    await notification.save();

    res.json({
      message: 'Errand accepted successfully',
      errand,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update errand status
exports.updateErrandStatus = async (req, res) => {
  try {
    const { status, location } = req.body;
    const errand = await Errand.findById(req.params.id);

    if (!errand) {
      return res.status(404).json({ message: 'Errand not found' });
    }

    // Check authorization
    const isCustomer = errand.customerId.toString() === req.user._id.toString();
    const isProvider = errand.providerId && errand.providerId.toString() === req.user._id.toString();

    if (!isCustomer && !isProvider && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const validTransitions = {
      pending: ['accepted', 'cancelled'],
      accepted: ['en_route', 'cancelled'],
      en_route: ['collected', 'cancelled'],
      collected: ['delivered', 'cancelled'],
      delivered: [],
      cancelled: [],
    };

    if (!validTransitions[errand.status]?.includes(status)) {
      return res.status(400).json({ message: 'Invalid status transition' });
    }

    errand.status = status;
    
    // Update timestamps
    const statusMap = {
      accepted: 'acceptedAt',
      en_route: 'enRouteAt',
      collected: 'collectedAt',
      delivered: 'deliveredAt',
      cancelled: 'cancelledAt',
    };
    
    if (statusMap[status]) {
      errand[statusMap[status]] = new Date();
    }

    // Add location update
    if (location) {
      errand.locationUpdates.push({
        lat: location.lat,
        lng: location.lng,
        timestamp: new Date(),
        status: status,
      });
    }

    await errand.save();

    // Notify other party
    const recipientId = isCustomer ? errand.providerId : errand.customerId;
    if (recipientId) {
      const notification = new Notification({
        userId: recipientId,
        type: `booking_${status}`,
        title: `Errand ${status}`,
        message: `Errand #${errand.errandId} is now ${status}`,
        data: { errandId: errand._id },
      });
      await notification.save();
    }

    res.json({
      message: 'Errand status updated',
      errand,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get errand by ID
exports.getErrandById = async (req, res) => {
  try {
    const errand = await Errand.findById(req.params.id)
      .populate('customerId', 'fullName email phoneNumber address')
      .populate('providerId', 'fullName email phoneNumber address');

    if (!errand) {
      return res.status(404).json({ message: 'Errand not found' });
    }

    res.json(errand);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};