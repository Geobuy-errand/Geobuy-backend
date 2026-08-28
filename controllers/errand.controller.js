const Errand = require('../models/Errand.model');
const User = require('../models/User.model');
const Notification = require('../models/Notification.model');
const OSRMService = require('../services/osrmService');
const NominatimService = require('../services/nominatimService');
const createNotification = require('../utils/create-notification');
const ChatModel = require('../models/Chat.model');
const Settings = require('../models/Setting.model');
const { sendTemplateEmail, errandTemplates } = require('../utils/email-templates');
const { getPricingSettings } = require('./booking.controller');



// Create errand with UK address validation and free distance calculation
exports.createErrand = async (req, res) => {
  try {
    const {
      serviceType,
      pickup,
      dropoff,
      taskDetails,
      preferredDate,
      preferredTime,
      requiresLiveTracking,
      photos,
      // Pricing fields from frontend
      isHeavyItem,
      isPeakUrgent,
      extraStopsCount,
      waitTimeMinutes,
      distance,
      distanceText,
      duration,
      isSubscribed,
      // Price breakdown from frontend
      priceBreakdown,
    } = req.body;

    // ============================================================
    // STEP 1: Get coordinates from address (with fallback)
    // ============================================================
    
    if (!pickup || !pickup.address) {
      return res.status(400).json({
        message: 'Pickup address is required',
      });
    }

    // Get coordinates - use provided coordinates or geocode
    let pickupCoords = pickup.coordinates || null;
    let dropoffCoords = dropoff?.coordinates || null;

    // If no coordinates provided, try to geocode
    if (!pickupCoords || !pickupCoords.lat || !pickupCoords.lng) {
      try {
        const geocodeResult = await geocodeAddress(pickup.address);
        if (geocodeResult) {
          pickupCoords = geocodeResult;
        }
      } catch (e) {
        console.warn('Pickup geocoding failed, using fallback:', e.message);
        // Use fallback coordinates (London)
        pickupCoords = { lat: 51.5074, lng: -0.1278 };
      }
    }

    if (!dropoff || !dropoff.address) {
      return res.status(400).json({
        message: 'Dropoff address is required for distance calculation.',
      });
    }

    if (!dropoffCoords || !dropoffCoords.lat || !dropoffCoords.lng) {
      try {
        const geocodeResult = await geocodeAddress(dropoff.address);
        if (geocodeResult) {
          dropoffCoords = geocodeResult;
        }
      } catch (e) {
        console.warn('Dropoff geocoding failed, using fallback:', e.message);
        dropoffCoords = { lat: 51.5074, lng: -0.1278 };
      }
    }

    // Calculate distance using OSRM or fallback
    let distanceInMiles = distance || 0;
    let travelDurationMinutes = 0;
    let travelDurationText = duration || '15 min';

    if (pickupCoords && dropoffCoords) {
      try {
        const distanceResult = await OSRMService.getDistance(
          pickupCoords.lat,
          pickupCoords.lng,
          dropoffCoords.lat,
          dropoffCoords.lng
        );
        distanceInMiles = distanceResult.distance.value || distance || 5;
        travelDurationMinutes = distanceResult.duration.value || 15;
        travelDurationText = distanceResult.duration.text || '15 min';
      } catch (e) {
        console.warn('OSRM distance calculation failed, using provided distance:', e.message);
        distanceInMiles = distance || 5;
        travelDurationMinutes = Math.round(distanceInMiles * 3);
        travelDurationText = `${travelDurationMinutes} min`;
      }
    } else {
      distanceInMiles = distance || 5;
      travelDurationMinutes = Math.round(distanceInMiles * 3);
      travelDurationText = `${travelDurationMinutes} min`;
    }

    // ============================================================
    // STEP 2: Get User's Subscription Status
    // ============================================================
    
    const user = await User.findById(req.user._id);
    const isUserSubscribed = isSubscribed || user?.subscription?.isSubscribed || false;

    // ============================================================
    // STEP 3: Calculate Pricing (if not provided from frontend)
    // ============================================================
    
    const BASE_FEE = 3.99;
    const SUBSCRIPTION_DISCOUNT = 20;
    const HEAVY_ITEM_FEE = 2.99;
    const WAIT_TIME_FEE_PER_MIN = 0.30;
    const WAIT_TIME_FREE_MIN = 5;
    const PEAK_URGENT_FEE = 1.99;
    const EXTRA_STOP_FEE = 1.50;

    // Get distance rate
    const getDistanceRate = (miles) => {
      if (miles <= 3) return 0.80;
      if (miles <= 10) return 0.70;
      if (miles <= 20) return 0.60;
      return 0.50;
    };

    const ratePerMile = getDistanceRate(distanceInMiles);
    const distanceFee = Math.round(distanceInMiles * ratePerMile * 100) / 100;

    let subtotal = BASE_FEE + distanceFee;

    let heavyItemFee = 0;
    if (isHeavyItem) {
      heavyItemFee = HEAVY_ITEM_FEE;
      subtotal += heavyItemFee;
    }

    let waitTimeFee = 0;
    if (waitTimeMinutes > WAIT_TIME_FREE_MIN) {
      const extraMinutes = waitTimeMinutes - WAIT_TIME_FREE_MIN;
      waitTimeFee = Math.round(extraMinutes * WAIT_TIME_FEE_PER_MIN * 100) / 100;
      subtotal += waitTimeFee;
    }

    let peakUrgentFee = 0;
    if (isPeakUrgent) {
      peakUrgentFee = PEAK_URGENT_FEE;
      subtotal += peakUrgentFee;
    }

    let extraStopsFee = 0;
    if (extraStopsCount > 0) {
      extraStopsFee = Math.round(extraStopsCount * EXTRA_STOP_FEE * 100) / 100;
      subtotal += extraStopsFee;
    }

    subtotal = Math.round(subtotal * 100) / 100;

    let discountPercentage = 0;
    let discountAmount = 0;
    let total = subtotal;

    if (isUserSubscribed) {
      discountPercentage = SUBSCRIPTION_DISCOUNT;
      discountAmount = Math.round((subtotal * SUBSCRIPTION_DISCOUNT / 100) * 100) / 100;
      total = Math.round((subtotal - discountAmount) * 100) / 100;
    }

    const platformFee = Math.round(total * 0.20 * 100) / 100;
    const providerAmount = Math.round(total * 0.80 * 100) / 100;

    // ============================================================
    // STEP 4: Create Errand
    // ============================================================
    
    const errand = new Errand({
      customerId: req.user._id,
      serviceType,
      pickup: {
        ...pickup,
        formattedAddress: pickup.address,
        coordinates: pickupCoords,
      },
      dropoff: {
        ...dropoff,
        formattedAddress: dropoff.address,
        coordinates: dropoffCoords,
      },
      taskDetails: taskDetails || '',
      preferredDate,
      preferredTime,
      photos: photos || [],
      requiresLiveTracking: requiresLiveTracking || false,
      status: 'pending',
      distance: Math.round(distanceInMiles * 100) / 100,
      distanceText: distanceText || `${Math.round(distanceInMiles * 10) / 10} miles`,
      duration: Math.round(travelDurationMinutes * 100) / 100,
      durationText: travelDurationText,
      // Pricing fields
      isHeavyItem: isHeavyItem || false,
      isPeakUrgent: isPeakUrgent || false,
      extraStopsCount: extraStopsCount || 0,
      waitTimeMinutes: waitTimeMinutes || 0,
      isSubscribed: isUserSubscribed,
      // Pricing breakdown
      baseFee: BASE_FEE,
      distanceFee: distanceFee,
      distanceRate: ratePerMile,
      heavyItemFee: heavyItemFee,
      waitTimeFee: waitTimeFee,
      peakUrgentFee: peakUrgentFee,
      extraStopsFee: extraStopsFee,
      subtotal: subtotal,
      discountPercentage: discountPercentage,
      discountAmount: discountAmount,
      total: total,
      platformFee: platformFee,
      providerAmount: providerAmount,
    });

    await errand.save();

    // ============================================================
    // STEP 5: Find and Notify Nearby Providers
    // ============================================================
    
    const providers = await User.find({
      role: 'provider',
      isActive: true,
      isAvailable: true,
      verificationStatus: 'approved',
    }).limit(20);

    let nearestProviders = [];

    if (providers.length > 0 && pickupCoords) {
      const providerCoords = providers.map(p => ({
        lat: p.location?.coordinates?.[1] || 51.5074,
        lon: p.location?.coordinates?.[0] || -0.1276,
      }));

      try {
        const distances = await OSRMService.getBatchDistances(
          pickupCoords.lat,
          pickupCoords.lon,
          providerCoords
        );

        const sortedProviders = providers.map((provider, index) => ({
          ...provider.toObject(),
          distance: distances[index]?.distance || 999,
          distanceText: distances[index]?.distance 
            ? `${distances[index].distance.toFixed(1)} miles` 
            : 'Unknown',
          duration: distances[index]?.duration || 999,
          durationText: distances[index]?.duration
            ? `${Math.round(distances[index].duration)} min`
            : 'Unknown',
        })).sort((a, b) => a.distance - b.distance);

        nearestProviders = sortedProviders.slice(0, 5);

        // Send notifications to nearest providers
        for (const provider of nearestProviders) {
          const notification = new Notification({
            userId: provider._id,
            type: 'booking_created',
            title: 'New Errand Available',
            message: `New ${serviceType} errand available ${provider.distanceText} from you`,
            data: { 
              errandId: errand._id, 
              distance: provider.distanceText,
              duration: provider.durationText,
              serviceType,
              estimatedPrice: total,
            },
          });
          await notification.save();

          // Emit socket event
          try {
            const io = req.app.get('io');
            if (io) {
              io.to(`user_${provider._id}`).emit('new-errand-available', {
                errandId: errand._id,
                serviceType,
                distance: provider.distanceText,
                duration: provider.durationText,
                pickup: pickup.address,
                estimatedPrice: total,
              });
            }
          } catch (socketError) {
            console.warn('Socket emit error:', socketError.message);
          }
        }

        errand.matchedProviders = nearestProviders.map(p => ({
          providerId: p._id,
          distance: p.distance,
          distanceText: p.distanceText,
          duration: p.durationText,
        }));
        await errand.save();
      } catch (e) {
        console.warn('Provider distance calculation failed:', e.message);
      }
    }

    // ============================================================
    // STEP 6: Response
    // ============================================================
    
    res.status(201).json({
      message: 'Errand created successfully',
      errand,
      priceBreakdown: {
        distance: {
          miles: Math.round(distanceInMiles * 100) / 100,
          text: distanceText || `${Math.round(distanceInMiles * 10) / 10} miles`,
          ratePerMile: ratePerMile,
        },
        duration: {
          minutes: Math.round(travelDurationMinutes * 100) / 100,
          text: travelDurationText,
        },
        baseFee: BASE_FEE,
        distanceFee: distanceFee,
        additionalCharges: {
          heavyItem: isHeavyItem ? HEAVY_ITEM_FEE : null,
          waitTime: waitTimeMinutes > 5 ? waitTimeFee : null,
          peakUrgent: isPeakUrgent ? PEAK_URGENT_FEE : null,
          extraStops: extraStopsCount > 0 ? extraStopsFee : null,
        },
        subtotal: subtotal,
        subscription: {
          isSubscribed: isUserSubscribed,
          discountPercentage: discountPercentage,
          discountAmount: discountAmount,
        },
        total: total,
        revenueSplit: {
          geobuyFee: platformFee,
          providerAmount: providerAmount,
        },
      },
      nearestProviders: nearestProviders.map(p => ({
        id: p._id,
        name: p.fullName,
        distance: p.distanceText,
        duration: p.durationText,
        rating: p.averageRating,
      })),
    });

  } catch (error) {
    console.error('Create errand error:', error);
    res.status(500).json({ 
      message: 'Failed to create errand',
      error: error.message,
    });
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

    // Emit socket event
    const io = req.app.get('io');
    io.to(`errand_${errand._id}`).emit('errand-accepted', {
      errandId: errand._id,
      providerId: req.user._id,
      providerName: req.user.fullName,
    });

    // Notify customer
    await sendTemplateEmail(
      customerEmail,
      errandTemplates.errandAccepted(
        customerName,
        errand.errandId,
        req.user.fullName,
        errand.preferredDate || 'To be scheduled'
      ).subject,
      errandTemplates.errandAccepted(
        customerName,
        errand.errandId,
        req.user.fullName,
        errand.preferredDate || 'To be scheduled'
      ).title,
      errandTemplates.errandAccepted(
        customerName,
        errand.errandId,
        req.user.fullName,
        errand.preferredDate || 'To be scheduled'
      ).content,
      errandTemplates.errandAccepted(
        customerName,
        errand.errandId,
        req.user.fullName,
        errand.preferredDate || 'To be scheduled'
      ).button
    );
    
    // Notify provider (the one who accepted)
    await sendTemplateEmail(
      req.user.email,
      errandTemplates.youAcceptedErrand(
        req.user.fullName,
        errand.errandId,
        errand.serviceType,
        errand.pickup?.address || 'Pickup location'
      ).subject,
      errandTemplates.youAcceptedErrand(
        req.user.fullName,
        errand.errandId,
        errand.serviceType,
        errand.pickup?.address || 'Pickup location'
      ).title,
      errandTemplates.youAcceptedErrand(
        req.user.fullName,
        errand.errandId,
        errand.serviceType,
        errand.pickup?.address || 'Pickup location'
      ).content,
      errandTemplates.youAcceptedErrand(
        req.user.fullName,
        errand.errandId,
        errand.serviceType,
        errand.pickup?.address || 'Pickup location'
      ).button
    );

    res.json({
      message: 'Errand accepted successfully',
      errand,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update errand status
// Update errand status with socket emission
exports.updateErrandStatus = async (req, res) => {
  try {
    const { status, location } = req.body;
    const errand = await Errand.findById(req.params.id)
      .populate('customerId', 'fullName email')
      .populate('providerId', 'fullName email phoneNumber');

    if (!errand) {
      return res.status(404).json({ message: 'Errand not found' });
    }

    // Check authorization
    const isCustomer = errand.customerId._id.toString() === req.user._id.toString();
    const isProvider = errand.providerId && errand.providerId._id.toString() === req.user._id.toString();


    if (!isCustomer && !isProvider && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const validTransitions = {
      pending: ['accepted', 'cancelled'],
      accepted: ['en_route', 'cancelled'],
      en_route: ['collected', 'cancelled'],
      collected: ['delivered', 'cancelled'],
      delivered: ['completed'],
      completed: [],
      cancelled: [],
    };

    if (!validTransitions[errand.status]?.includes(status)) {
      return res.status(400).json({ message: 'Invalid status transition' });
    }

    errand.status = status;
    
    const statusMap = {
      accepted: 'acceptedAt',
      en_route: 'enRouteAt',
      collected: 'collectedAt',
      delivered: 'deliveredAt',
      completed: 'completedAt',
      cancelled: 'cancelledAt',
    };
    
    if (statusMap[status]) {
      errand[statusMap[status]] = new Date();
    }

    if (location) {
      errand.locationUpdates.push({
        lat: location.lat,
        lng: location.lng,
        timestamp: new Date(),
        status: status,
      });
    }

    await errand.save();

    // Get payment info if completed
    let paymentInfo = null;
    if (status === 'completed') {
      paymentInfo = await Payment.findOne({ errandId: errand._id });
    }

    // Create notification
    const recipientId = isCustomer ? errand.providerId?._id : errand.customerId._id;
    if (recipientId) {
      await createNotification(
        recipientId,
        `errand_${status}`,
        `Errand ${status}`,
        `Errand #${errand.errandId} is now ${status}`,
        { errandId: errand._id, status }
      );
    }

    // Emit socket events to all relevant parties
    const io = req.app.get('io');
    if (io) {
      // Customer
      io.to(`user_${errand.customerId._id}`).emit('errand-status-updated', {
        errandId: errand._id,
        status: status,
        location: location,
        timestamp: new Date(),
        errand: errand,
      });

      // Provider
      if (errand.providerId) {
        io.to(`user_${errand.providerId._id}`).emit('errand-status-updated', {
          errandId: errand._id,
          status: status,
          location: location,
          timestamp: new Date(),
          errand: errand,
        });
      }

      // Admin
      io.to('admin_room').emit('errand-status-updated', {
        errandId: errand._id,
        status: status,
        customerId: errand.customerId._id,
        providerId: errand.providerId?._id,
        timestamp: new Date(),
        errand: {
          errandId: errand.errandId,
          serviceType: errand.serviceType,
          pickup: errand.pickup,
          dropoff: errand.dropoff,
          total: errand.total,
        },
      });

      // Errand room
      io.to(`errand_${errand._id}`).emit('errand-status-updated', {
        errandId: errand._id,
        status: status,
        location: location,
        timestamp: new Date(),
      });

      // If completed, emit completion event
      if (status === 'completed') {
        io.to('admin_room').emit('errand-completed', {
          errandId: errand._id,
          errandId: errand.errandId,
          customerId: errand.customerId._id,
          providerId: errand.providerId?._id,
          total: errand.total,
          paymentId: paymentInfo?._id,
          timestamp: new Date(),
        });

        // Send provider rating notification
        io.to(`user_${errand.customerId._id}`).emit('rate-provider', {
          errandId: errand._id,
          providerId: errand.providerId?._id,
          providerName: errand.providerId?.fullName,
        });
      }
    }


    // In updateErrandStatus - when status is 'completed'
if (status === 'completed') {
  // Notify customer
  await sendTemplateEmail(
    errand.customerId.email,
    errandTemplates.errandCompleted(
      errand.customerId.fullName,
      errand.errandId,
      errand.providerId?.fullName || 'Provider'
    ).subject,
    errandTemplates.errandCompleted(
      errand.customerId.fullName,
      errand.errandId,
      errand.providerId?.fullName || 'Provider'
    ).title,
    errandTemplates.errandCompleted(
      errand.customerId.fullName,
      errand.errandId,
      errand.providerId?.fullName || 'Provider'
    ).content,
    errandTemplates.errandCompleted(
      errand.customerId.fullName,
      errand.errandId,
      errand.providerId?.fullName || 'Provider'
    ).button
  );

  // Notify provider
  if (errand.providerId?.email) {
    await sendTemplateEmail(
      errand.providerId.email,
      errandTemplates.errandCompletedProvider(
        errand.providerId.fullName,
        errand.errandId,
        errand.customerId.fullName
      ).subject,
      errandTemplates.errandCompletedProvider(
        errand.providerId.fullName,
        errand.errandId,
        errand.customerId.fullName
      ).title,
      errandTemplates.errandCompletedProvider(
        errand.providerId.fullName,
        errand.errandId,
        errand.customerId.fullName
      ).content,
      errandTemplates.errandCompletedProvider(
        errand.providerId.fullName,
        errand.errandId,
        errand.customerId.fullName
      ).button
    );
  }
}

// In updateErrandStatus - when status is 'cancelled'
if (status === 'cancelled') {
  const recipientId = isCustomer ? errand.providerId?._id : errand.customerId._id;
  if (recipientId) {
    const recipient = await User.findById(recipientId);
    await sendTemplateEmail(
      recipient.email,
      errandTemplates.errandCancelled(
        recipient.fullName,
        errand.errandId,
        req.body.reason || 'No reason provided'
      ).subject,
      errandTemplates.errandCancelled(
        recipient.fullName,
        errand.errandId,
        req.body.reason || 'No reason provided'
      ).title,
      errandTemplates.errandCancelled(
        recipient.fullName,
        errand.errandId,
        req.body.reason || 'No reason provided'
      ).content,
      errandTemplates.errandCancelled(
        recipient.fullName,
        errand.errandId,
        req.body.reason || 'No reason provided'
      ).button
    );
  }
}

    res.json({
      message: `Errand ${status} successfully`,
      errand,
    });

  } catch (error) {
    console.error('Update errand status error:', error);
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

exports.getErrandsByStatus = async (req, res) => {
  try {
    const { status } = req.params;
    let query = { status };

    if (req.user.role === 'customer') {
      query.customerId = req.user._id;
    } else if (req.user.role === 'errand_runner') {
      query.providerId = req.user._id;
    } else if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Validate status
    const validStatuses = ['pending', 'accepted', 'en_route', 'collected', 'delivered', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const errands = await Errand.find(query)
      .populate('customerId', 'fullName email phoneNumber')
      .populate('providerId', 'fullName email phoneNumber')
      .sort({ createdAt: -1 });

    res.json(errands);
  } catch (error) {
    console.error('Get errands by status error:', error);
    res.status(500).json({ message: error.message });
  }
};

exports.getErrandStats = async (req, res) => {
  try {
    const userId = req.user._id;
    const userRole = req.user.role;

    let query = {};
    if (userRole === 'customer') {
      query.customerId = userId;
    } else if (userRole === 'errand_runner') {
      query.providerId = userId;
    }

    const stats = {
      total: await Errand.countDocuments(query),
      pending: await Errand.countDocuments({ ...query, status: 'pending' }),
      accepted: await Errand.countDocuments({ ...query, status: 'accepted' }),
      enRoute: await Errand.countDocuments({ ...query, status: 'en_route' }),
      collected: await Errand.countDocuments({ ...query, status: 'collected' }),
      delivered: await Errand.countDocuments({ ...query, status: 'delivered' }),
      completed: await Errand.countDocuments({ ...query, status: 'completed' }),
      cancelled: await Errand.countDocuments({ ...query, status: 'cancelled' }),
    };

    // Get total earnings for errand runner
    if (userRole === 'errand_runner') {
      const earnings = await Errand.aggregate([
        { $match: { providerId: userId, status: { $in: ['delivered', 'completed'] } } },
        { $group: { _id: null, total: { $sum: '$providerAmount' } } },
      ]);
      stats.totalEarnings = earnings[0]?.total || 0;
    }

    res.json(stats);
  } catch (error) {
    console.error('Get errand stats error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Helper function to geocode address (fallback)
async function geocodeAddress(address) {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?` +
      `q=${encodeURIComponent(address)}&` +
      `format=json&` +
      `limit=1&` +
      `countrycodes=gb&` +
      `accept-language=en`
    );
    
    if (response.ok) {
      const data = await response.json();
      if (data && data.length > 0) {
        return {
          lat: parseFloat(data[0].lat),
          lng: parseFloat(data[0].lon),
        };
      }
    }
  } catch (e) {
    console.warn('Geocoding failed:', e.message);
  }
  return null;
}