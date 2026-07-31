const Service = require('../models/Service.model');
const User = require('../models/User.model');
const ServiceRequest = require('../models/ServiceRequest.model');
const Quote = require('../models/Quote.model');
const Notification = require('../models/Notification.model');

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
    console.log(error);
    res.status(500).json({ message: error.message });
  }
};

// Get service providers with filters
exports.getServiceProviders = async (req, res) => {
  try {
    const { category, dbsChecked, insured, rated, lat, lng, radius } = req.query;
    
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

    // Add location-based filtering
    if (lat && lng) {
      query['location'] = {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(lng), parseFloat(lat)],
          },
          $maxDistance: (radius || 10) * 1000, // Convert km to meters
        },
      };
    }

    const providers = await User.find(query)
      .select('fullName email phoneNumber address averageRating totalReviews verificationBadges serviceCategories serviceRates about')
      .limit(50);

    res.json(providers);
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: error.message });
  }
};

// Create service request
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
    } = req.body;

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
      status: 'pending',
    });

    await serviceRequest.save();

    res.status(201).json({
      message: 'Service request created successfully',
      serviceRequest,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Submit quote for service request
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

    // Check if provider already submitted a quote
    const existingQuote = await Quote.findOne({
      serviceRequestId,
      providerId: req.user._id,
    });

    if (existingQuote) {
      return res.status(400).json({ message: 'You have already submitted a quote for this request' });
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
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    });

    await quote.save();

    // Notify customer
    const notification = new Notification({
      userId: serviceRequest.customerId,
      type: 'new_message',
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
      return res.status(403).json({ message: 'Access denied' });
    }

    const quotes = await Quote.find({ serviceRequestId: req.params.id })
      .populate('providerId', 'fullName email phoneNumber averageRating totalReviews verificationBadges')
      .sort({ amount: 1 });

    res.json(quotes);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Select a quote
exports.selectQuote = async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id);
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
    quote.isSelected = true;
    quote.status = 'accepted';
    await quote.save();

    // Update service request
    serviceRequest.selectedProviderId = quote.providerId;
    serviceRequest.selectedQuoteId = quote._id;
    serviceRequest.status = 'provider_selected';
    await serviceRequest.save();

    // Notify provider
    const notification = new Notification({
      userId: quote.providerId,
      type: 'booking_accepted',
      title: 'Quote Accepted',
      message: `Your quote has been accepted for ${serviceRequest.serviceType}`,
      data: { serviceRequestId: serviceRequest._id },
    });
    await notification.save();

    res.json({
      message: 'Provider selected successfully',
      serviceRequest,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get service request by ID
exports.getServiceRequestById = async (req, res) => {
  try {
    const serviceRequest = await ServiceRequest.findById(req.params.id)
      .populate('customerId', 'fullName email phoneNumber')
      .populate('selectedProviderId', 'fullName email phoneNumber address averageRating totalReviews verificationBadges');

    if (!serviceRequest) {
      return res.status(404).json({ message: 'Service request not found' });
    }

    // Check authorization
    if (serviceRequest.customerId._id.toString() !== req.user._id.toString() && 
        req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json(serviceRequest);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get user's service requests
exports.getMyServiceRequests = async (req, res) => {
  try {
    const query = { customerId: req.user._id };
    const serviceRequests = await ServiceRequest.find(query)
      .populate('selectedProviderId', 'fullName email phoneNumber')
      .sort({ createdAt: -1 });

    res.json(serviceRequests);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get service requests for provider (quotes they've submitted)
exports.getProviderServiceRequests = async (req, res) => {
  try {
    // Find all quotes by this provider
    const quotes = await Quote.find({ providerId: req.user._id })
      .select('serviceRequestId');
    
    const requestIds = quotes.map(q => q.serviceRequestId);
    
    const serviceRequests = await ServiceRequest.find({
      _id: { $in: requestIds },
    })
      .populate('customerId', 'fullName email phoneNumber')
      .populate('selectedProviderId', 'fullName email phoneNumber')
      .sort({ createdAt: -1 });

    res.json(serviceRequests);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Cancel service request
exports.cancelServiceRequest = async (req, res) => {
  try {
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
    await serviceRequest.save();

    res.json({
      message: 'Service request cancelled',
      serviceRequest,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};