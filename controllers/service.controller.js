const Service = require('../models/Service.model');
const ServiceRequest = require('../models/ServiceRequest.model');
const Quote = require('../models/Quote.model');
const User = require('../models/User.model');
const Notification = require('../models/Notification.model');

// ============= SERVICE CRUD FUNCTIONS =============

// Get all services
exports.getServices = async (req, res) => {
  try {
    const services = await Service.find({ isActive: true })
      .select('name category description basePrice pricePerKm estimatedTime icon isPopular')
      .sort({ isPopular: -1, name: 1 });

    res.json(services);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get service by ID
exports.getServiceById = async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service) {
      return res.status(404).json({ message: 'Service not found' });
    }
    res.json(service);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Create service (admin only)
exports.createService = async (req, res) => {
  try {
    const {
      name,
      category,
      description,
      basePrice,
      pricePerKm,
      minPrice,
      maxPrice,
      estimatedTime,
      icon,
      isActive,
      isPopular,
      requiresSpecialSkills,
      requiresDBS,
      serviceAreas,
      restrictions,
    } = req.body;

    const service = new Service({
      name,
      category,
      description,
      basePrice,
      pricePerKm: pricePerKm || 0,
      minPrice,
      maxPrice,
      estimatedTime,
      icon,
      isActive: isActive !== undefined ? isActive : true,
      isPopular: isPopular || false,
      requiresSpecialSkills: requiresSpecialSkills || false,
      requiresDBS: requiresDBS || false,
      serviceAreas: serviceAreas || [],
      restrictions: restrictions || [],
    });

    await service.save();

    res.status(201).json({
      message: 'Service created successfully',
      service,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update service (admin only)
exports.updateService = async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service) {
      return res.status(404).json({ message: 'Service not found' });
    }

    Object.assign(service, req.body);
    await service.save();

    res.json({
      message: 'Service updated successfully',
      service,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete service (admin only)
exports.deleteService = async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service) {
      return res.status(404).json({ message: 'Service not found' });
    }

    await service.deleteOne();
    res.json({ message: 'Service deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get services by category
exports.getServicesByCategory = async (req, res) => {
  try {
    const services = await Service.find({
      category: req.params.category,
      isActive: true,
    });

    res.json(services);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get popular services
exports.getPopularServices = async (req, res) => {
  try {
    const services = await Service.find({
      isActive: true,
      isPopular: true,
    }).limit(8);

    res.json(services);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ============= SERVICE CATEGORIES =============

// Get service categories
exports.getServiceCategories = async (req, res) => {
  try {
    const categories = [
      { id: 'care', label: 'Care Services', icon: '❤️', description: 'Elderly care, childcare, personal care' },
      { id: 'trades', label: 'Trades', icon: '🔧', description: 'Plumbing, electrical, carpentry, painting' },
      { id: 'professional', label: 'Professional Services', icon: '💼', description: 'Legal, accounting, consulting' },
      { id: 'personal', label: 'Personal Services', icon: '👤', description: 'Tutoring, fitness, beauty' },
      { id: 'other', label: 'Other Services', icon: '📋', description: 'Custom services' },
    ];
    res.json(categories);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


exports.getServiceProviders = async (req, res) => {
  try {
    const { category, dbsChecked, insured, rated, lat, lng, radius, limit = 20 } = req.query;
    
    let query = {
      role: 'provider',
      isActive: true,
      verificationStatus: 'approved',
    };

    if (category) {
      query.serviceCategories = category;
    }

    if (dbsChecked === 'true') {
      query['verificationBadges'] = 'dbs_checked';
    }

    if (insured === 'true') {
      query['verificationBadges'] = 'insured';
    }

    let providers = [];

    // If location is provided, use geospatial query
    if (lat && lng) {
      query['location'] = {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(lng), parseFloat(lat)],
          },
          $maxDistance: (radius || 10) * 1000,
        },
      };
    }
    console.log("service providers", query, {lng, lat, radius, category})


    providers = await User.find(query)
      .select('fullName email phoneNumber address averageRating totalReviews verificationBadges serviceCategories serviceRates about location')
      .limit(parseInt(limit));
      

    // Calculate distance for each provider if location provided
    if (lat && lng) {
      providers = providers.map(provider => {
        const providerLocation = provider.location?.coordinates || [0, 0];
        const distance = calculateDistance(
          parseFloat(lat),
          parseFloat(lng),
          providerLocation[1],
          providerLocation[0]
        );
        return {
          ...provider.toObject(),
          distance: distance,
          matchScore: calculateMatchScore(provider, distance),
        };
      });

      // Sort by match score (higher is better)
      providers.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
    }

    res.json(providers);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ============= HELPER FUNCTIONS =============

// Helper: Calculate distance between two points (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c; // Distance in km
}

// Helper: Calculate match score
function calculateMatchScore(provider, distance) {
  let score = 100;
  
  // Distance factor (closer = better)
  if (distance) {
    score -= Math.min(distance * 2, 30); // Up to 30 points for distance
  }
  
  // Rating factor
  if (provider.averageRating) {
    score += provider.averageRating * 5;
  }
  
  // Badge bonuses
  if (provider.verificationBadges?.includes('dbs_checked')) score += 10;
  if (provider.verificationBadges?.includes('insured')) score += 10;
  if (provider.verificationBadges?.includes('certified')) score += 10;
  if (provider.verificationBadges?.includes('id_checked')) score += 5;
  
  return Math.max(0, Math.min(100, score));
}

// Helper: Find nearby providers
async function findNearbyProviders(request, limit = 5) {
  const { category, location, requiresDBS, requiresCertification } = request;
  
  let query = {
    role: 'provider',
    isActive: true,
    verificationStatus: 'approved',
    serviceCategories: category,
  };

  if (requiresDBS) {
    query['verificationBadges'] = 'dbs_checked';
  }

  if (requiresCertification) {
    query['verificationBadges'] = 'certified';
  }

  // Location-based query
  if (location?.coordinates?.lat && location?.coordinates?.lng) {
    query['location'] = {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [location.coordinates.lng, location.coordinates.lat],
        },
        $maxDistance: 20000, // 20km radius
      },
    };
  }

  let providers = await User.find(query)
    .select('fullName email phoneNumber address averageRating totalReviews verificationBadges serviceCategories serviceRates about location')
    .limit(limit * 2); // Get extra to filter

  // Calculate match scores and filter
  const matched = providers.map(provider => {
    const providerLocation = provider.location?.coordinates || [0, 0];
    const distance = location?.coordinates?.lat && location?.coordinates?.lng
      ? calculateDistance(
          location.coordinates.lat,
          location.coordinates.lng,
          providerLocation[1],
          providerLocation[0]
        )
      : null;

    return {
      ...provider.toObject(),
      distance: distance,
      matchScore: calculateMatchScore(provider, distance),
    };
  });

  // Sort by match score and return top matches
  matched.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
  return matched.slice(0, limit);
}

// ============= SERVICE REQUEST FUNCTIONS =============

// Create service request with provider matching
exports.createServiceRequest = async (req, res) => {
  try {
    const {
      category,
      serviceType,
      description,
      location,
      preferredDate,
      preferredTime,
      budget,
      isUrgent,
      requiresDBS,
      requiresCertification,
      maxProvidersToMatch = 5,
    } = req.body;

    const SERVICE_FEE = 1.99;

    // Create service request
    const serviceRequest = new ServiceRequest({
      customerId: req.user._id,
      category,
      serviceType,
      description,
      location,
      preferredDate,
      preferredTime,
      budget,
      isUrgent: isUrgent || false,
      requiresDBS: requiresDBS || false,
      requiresCertification: requiresCertification || false,
      serviceFee: SERVICE_FEE,
      status: 'pending',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    await serviceRequest.save();

    // Find and match nearby providers
    const matchedProviders = await findNearbyProviders(serviceRequest, maxProvidersToMatch);
    
    // Update request with matched providers
    serviceRequest.matchedProviders = matchedProviders.map(p => ({
      providerId: p._id,
      matchScore: p.matchScore,
      distance: p.distance,
      status: 'pending',
    }));
    await serviceRequest.save();

    // Notify matched providers
    for (const match of matchedProviders) {
      const notification = new Notification({
        userId: match._id,
        type: 'new_service_request',
        title: 'New Service Request Match',
        message: `A new ${category} service request matches your profile`,
        data: { serviceRequestId: serviceRequest._id },
      });
      await notification.save();

      // Emit socket event for real-time notification
      const io = req.app.get('io');
      io.to(`user_${match._id}`).emit('new-service-match', {
        serviceRequestId: serviceRequest._id,
        matchScore: match.matchScore,
        distance: match.distance,
      });
    }

    res.status(201).json({
      message: 'Service request created successfully',
      serviceRequest,
      matchedProviders: matchedProviders.map(p => ({
        id: p._id,
        name: p.fullName,
        distance: p.distance,
        matchScore: p.matchScore,
        rating: p.averageRating,
      })),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ============= QUOTE FUNCTIONS =============

// Submit quote with negotiation
exports.submitQuote = async (req, res) => {
  try {
    const {
      serviceRequestId,
      amount,
      message,
      estimatedDuration,
      availabilityStart,
      availabilityEnd,
    } = req.body;

    const serviceRequest = await ServiceRequest.findById(serviceRequestId);
    if (!serviceRequest) {
      return res.status(404).json({ message: 'Service request not found' });
    }

    // Check if provider was matched
    const isMatched = serviceRequest.matchedProviders?.some(
      p => p.providerId.toString() === req.user._id.toString()
    );

    if (!isMatched && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'You are not authorized to quote for this request' });
    }

    // Check if provider already submitted a quote
    const existingQuote = await Quote.findOne({
      serviceRequestId,
      providerId: req.user._id,
    });

    if (existingQuote) {
      return res.status(400).json({ message: 'You have already submitted a quote' });
    }

    const quote = new Quote({
      serviceRequestId,
      providerId: req.user._id,
      amount,
      message,
      estimatedDuration,
      availability: {
        startDate: availabilityStart,
        endDate: availabilityEnd,
      },
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      status: 'pending',
    });

    await quote.save();

    // Update matched provider status
    const matchIndex = serviceRequest.matchedProviders.findIndex(
      p => p.providerId.toString() === req.user._id.toString()
    );
    if (matchIndex !== -1) {
      serviceRequest.matchedProviders[matchIndex].status = 'responded';
      serviceRequest.matchedProviders[matchIndex].respondedAt = new Date();
    }
    await serviceRequest.save();

    // Notify customer
    const notification = new Notification({
      userId: serviceRequest.customerId,
      type: 'new_quote',
      title: 'New Quote Received',
      message: `${req.user.fullName} has submitted a quote for your service request`,
      data: { serviceRequestId, quoteId: quote._id },
    });
    await notification.save();

    // Update request status if first quote
    if (serviceRequest.status === 'pending') {
      serviceRequest.status = 'quotes_received';
      await serviceRequest.save();
    }

    res.status(201).json({
      message: 'Quote submitted successfully',
      quote,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Negotiate quote (counter-offer)
exports.negotiateQuote = async (req, res) => {
  try {
    const { quoteId, counterAmount, message } = req.body;
    const quote = await Quote.findById(quoteId);
    if (!quote) {
      return res.status(404).json({ message: 'Quote not found' });
    }

    const serviceRequest = await ServiceRequest.findById(quote.serviceRequestId);
    if (!serviceRequest) {
      return res.status(404).json({ message: 'Service request not found' });
    }

    // Check authorization
    const isCustomer = serviceRequest.customerId.toString() === req.user._id.toString();
    const isProvider = quote.providerId.toString() === req.user._id.toString();

    if (!isCustomer && !isProvider) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Determine who is sending the counter-offer
    const from = isCustomer ? 'customer' : 'provider';

    // Update quote
    quote.amount = counterAmount;
    quote.status = 'pending';
    quote.message = message || quote.message;
    await quote.save();

    // Add to negotiation history
    serviceRequest.negotiationHistory.push({
      from,
      userId: req.user._id,
      message: message || `${from} offered £${counterAmount}`,
      offerAmount: counterAmount,
      status: 'countered',
    });
    serviceRequest.status = 'negotiating';
    await serviceRequest.save();

    // Notify the other party
    const recipientId = isCustomer ? quote.providerId : serviceRequest.customerId;
    const notification = new Notification({
      userId: recipientId,
      type: 'quote_countered',
      title: 'Counter-Offer Received',
      message: `${req.user.fullName} has made a counter-offer of £${counterAmount}`,
      data: { serviceRequestId: serviceRequest._id, quoteId: quote._id },
    });
    await notification.save();

    // Emit socket event for real-time negotiation
    const io = req.app.get('io');
    io.to(`booking_${serviceRequest._id}`).emit('negotiation-update', {
      serviceRequestId: serviceRequest._id,
      quoteId: quote._id,
      amount: counterAmount,
      from,
      message,
    });

    res.json({
      message: 'Counter-offer sent',
      quote,
      negotiationHistory: serviceRequest.negotiationHistory,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get quotes for service request
exports.getQuotesForRequest = async (req, res) => {
  try {
    const serviceRequest = await ServiceRequest.findById(req.params.id);
    if (!serviceRequest) {
      return res.status(404).json({ message: 'Service request not found' });
    }

    // Check authorization
    if (serviceRequest.customerId.toString() !== req.user._id.toString() && 
        req.user.role !== 'admin') {
      // Check if user is a matched provider
      const isMatched = serviceRequest.matchedProviders?.some(
        p => p.providerId.toString() === req.user._id.toString()
      );
      if (!isMatched) {
        return res.status(403).json({ message: 'Access denied' });
      }
    }

    const quotes = await Quote.find({ serviceRequestId: req.params.id })
      .populate('providerId', 'fullName email phoneNumber averageRating totalReviews verificationBadges')
      .sort({ amount: 1 });

    res.json(quotes);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Accept quote
exports.acceptQuote = async (req, res) => {
  try {
    const { quoteId, finalPrice } = req.body;
    const quote = await Quote.findById(quoteId);
    if (!quote) {
      return res.status(404).json({ message: 'Quote not found' });
    }

    const serviceRequest = await ServiceRequest.findById(quote.serviceRequestId);
    if (!serviceRequest) {
      return res.status(404).json({ message: 'Service request not found' });
    }

    if (serviceRequest.customerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Update quote
    quote.status = 'accepted';
    quote.isSelected = true;
    await quote.save();

    // Update service request
    serviceRequest.selectedProviderId = quote.providerId;
    serviceRequest.selectedQuoteId = quote._id;
    serviceRequest.finalPrice = finalPrice || quote.amount;
    serviceRequest.status = 'provider_selected';
    await serviceRequest.save();

    // Notify provider
    const notification = new Notification({
      userId: quote.providerId,
      type: 'quote_accepted',
      title: 'Quote Accepted! 🎉',
      message: `Your quote has been accepted for ${serviceRequest.serviceType}`,
      data: { serviceRequestId: serviceRequest._id },
    });
    await notification.save();

    // Emit socket event
    const io = req.app.get('io');
    io.to(`booking_${serviceRequest._id}`).emit('quote-accepted', {
      serviceRequestId: serviceRequest._id,
      providerId: quote.providerId,
      amount: finalPrice || quote.amount,
    });

    res.json({
      message: 'Quote accepted successfully',
      serviceRequest,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Reject quote
exports.rejectQuote = async (req, res) => {
  try {
    const { quoteId, reason } = req.body;
    const quote = await Quote.findById(quoteId);
    if (!quote) {
      return res.status(404).json({ message: 'Quote not found' });
    }

    const serviceRequest = await ServiceRequest.findById(quote.serviceRequestId);
    if (!serviceRequest) {
      return res.status(404).json({ message: 'Service request not found' });
    }

    // Check authorization (customer or provider can reject)
    const isCustomer = serviceRequest.customerId.toString() === req.user._id.toString();
    const isProvider = quote.providerId.toString() === req.user._id.toString();

    if (!isCustomer && !isProvider) {
      return res.status(403).json({ message: 'Access denied' });
    }

    quote.status = 'rejected';
    await quote.save();

    // Add to negotiation history
    serviceRequest.negotiationHistory.push({
      from: isCustomer ? 'customer' : 'provider',
      userId: req.user._id,
      message: reason || 'Quote rejected',
      status: 'rejected',
    });
    await serviceRequest.save();

    res.json({
      message: 'Quote rejected',
      quote,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ============= SERVICE REQUEST RETRIEVAL FUNCTIONS =============

// Get service request by ID with full details
exports.getServiceRequestById = async (req, res) => {
  try {
    const serviceRequest = await ServiceRequest.findById(req.params.id)
      .populate('customerId', 'fullName email phoneNumber address')
      .populate('selectedProviderId', 'fullName email phoneNumber address averageRating totalReviews verificationBadges')
      .populate('matchedProviders.providerId', 'fullName email phoneNumber address averageRating totalReviews verificationBadges')
      .populate({
        path: 'negotiationHistory.userId',
        select: 'fullName email',
      });

    if (!serviceRequest) {
      return res.status(404).json({ message: 'Service request not found' });
    }

    // Check authorization
    if (serviceRequest.customerId._id.toString() !== req.user._id.toString() && 
        req.user.role !== 'admin') {
      // Check if user is a matched provider
      const isMatched = serviceRequest.matchedProviders?.some(
        p => p.providerId._id.toString() === req.user._id.toString()
      );
      if (!isMatched) {
        return res.status(403).json({ message: 'Access denied' });
      }
    }

    res.json(serviceRequest);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get all service requests for a customer
exports.getMyServiceRequests = async (req, res) => {
  try {
    const query = { customerId: req.user._id };
    const serviceRequests = await ServiceRequest.find(query)
      .populate('selectedProviderId', 'fullName email phoneNumber')
      .populate('matchedProviders.providerId', 'fullName email')
      .sort({ createdAt: -1 });

    res.json(serviceRequests);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get all service requests for a provider (matched)
exports.getProviderServiceRequests = async (req, res) => {
  try {
    // Find requests where provider is matched
    const serviceRequests = await ServiceRequest.find({
      'matchedProviders.providerId': req.user._id,
      status: { $in: ['pending', 'quotes_received', 'negotiating', 'provider_selected', 'in_progress'] },
    })
      .populate('customerId', 'fullName email phoneNumber')
      .populate('selectedProviderId', 'fullName email phoneNumber')
      .sort({ createdAt: -1 });

    res.json(serviceRequests);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ============= SERVICE REQUEST ACTION FUNCTIONS =============

// Cancel service request
exports.cancelServiceRequest = async (req, res) => {
  try {
    const { reason } = req.body;
    const serviceRequest = await ServiceRequest.findById(req.params.id);
    if (!serviceRequest) {
      return res.status(404).json({ message: 'Service request not found' });
    }

    // Check authorization
    if (serviceRequest.customerId.toString() !== req.user._id.toString() && 
        req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (serviceRequest.status === 'completed') {
      return res.status(400).json({ message: 'Cannot cancel a completed request' });
    }

    serviceRequest.status = 'cancelled';
    serviceRequest.cancelledAt = new Date();
    serviceRequest.cancellationReason = reason || 'Cancelled by user';
    await serviceRequest.save();

    // Notify selected provider if any
    if (serviceRequest.selectedProviderId) {
      const notification = new Notification({
        userId: serviceRequest.selectedProviderId,
        type: 'request_cancelled',
        title: 'Service Request Cancelled',
        message: `Service request #${serviceRequest.requestId} has been cancelled`,
        data: { serviceRequestId: serviceRequest._id },
      });
      await notification.save();
    }

    res.json({
      message: 'Service request cancelled',
      serviceRequest,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Mark service request as completed (customer)
exports.completeServiceRequest = async (req, res) => {
  try {
    const serviceRequest = await ServiceRequest.findById(req.params.id);
    if (!serviceRequest) {
      return res.status(404).json({ message: 'Service request not found' });
    }

    if (serviceRequest.customerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (serviceRequest.status !== 'provider_selected' && serviceRequest.status !== 'in_progress') {
      return res.status(400).json({ message: 'Request is not in a completable state' });
    }

    serviceRequest.status = 'completed';
    serviceRequest.completedAt = new Date();
    await serviceRequest.save();

    // Notify provider
    if (serviceRequest.selectedProviderId) {
      const notification = new Notification({
        userId: serviceRequest.selectedProviderId,
        type: 'request_completed',
        title: 'Service Request Completed',
        message: `Service request #${serviceRequest.requestId} has been marked as completed`,
        data: { serviceRequestId: serviceRequest._id },
      });
      await notification.save();
    }

    res.json({
      message: 'Service request completed',
      serviceRequest,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Mark service request as in progress (provider)
exports.startServiceRequest = async (req, res) => {
  try {
    const serviceRequest = await ServiceRequest.findById(req.params.id);
    if (!serviceRequest) {
      return res.status(404).json({ message: 'Service request not found' });
    }

    // Check if user is the selected provider
    if (serviceRequest.selectedProviderId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (serviceRequest.status !== 'provider_selected') {
      return res.status(400).json({ message: 'Request is not ready to start' });
    }

    serviceRequest.status = 'in_progress';
    await serviceRequest.save();

    // Notify customer
    const notification = new Notification({
      userId: serviceRequest.customerId,
      type: 'request_started',
      title: 'Service Started',
      message: `${req.user.fullName} has started working on your service request`,
      data: { serviceRequestId: serviceRequest._id },
    });
    await notification.save();

    res.json({
      message: 'Service started',
      serviceRequest,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};