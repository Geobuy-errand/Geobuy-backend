const Service = require('../models/Service.model');
const ServiceRequest = require('../models/ServiceRequest.model');
const Quote = require('../models/Quote.model');
const User = require('../models/User.model');
const ProviderProfile = require('../models/ProviderProfile.model');
const Notification = require('../models/Notification.model');
const OSRMService = require('../services/osrmService');
const NominatimService = require('../services/nominatimService');
const ServiceCategoryModel = require('../models/ServiceCategory.model');
const createNotification = require('../utils/create-notification')

// ============================================================
// SERVICE CRUD FUNCTIONS
// ============================================================

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
// ============================================================
// SERVICE REQUEST FUNCTIONS
// ============================================================

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
      invitedProviders,
    } = req.body;

    // Get settings for service fee
    const settings = await Settings.getSettings();
    const SERVICE_FEE = settings.pricing?.baseFee || 3.99;
    const PLATFORM_FEE_PERCENTAGE = settings.pricing?.platformFeePercentage || 20;

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
      platformFeePercentage: PLATFORM_FEE_PERCENTAGE,
      status: 'pending',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      isPublic: true,
    });

    await serviceRequest.save();

    // Invite selected providers
    let invitedCount = 0;
    if (invitedProviders && invitedProviders.length > 0) {
      for (const providerId of invitedProviders) {
        // Check if provider exists and is valid
        const provider = await User.findById(providerId);
        if (!provider || provider.role !== 'provider') continue;

        // Add to invited providers
        if (!serviceRequest.invitedProviders) {
          serviceRequest.invitedProviders = [];
        }
        
        serviceRequest.invitedProviders.push({
          providerId: providerId,
          status: 'invited',
          invitedAt: new Date(),
        });
        invitedCount++;

        // Send notification to provider using helper
        await createNotification(
          providerId,
          'new_service_request',
          '📋 New Service Request',
          `You've been invited to quote for a ${category} service by ${req.user.fullName}`,
          { 
            serviceRequestId: serviceRequest._id,
            customerId: req.user._id,
            customerName: req.user.fullName,
            category: category,
            serviceType: serviceType,
          }
        );

        // Emit socket event
        const io = req.app.get('io');
        if (io) {
          io.to(`user_${providerId}`).emit('new-service-invite', {
            serviceRequestId: serviceRequest._id,
            category: category,
            serviceType: serviceType,
            customerName: req.user.fullName,
          });
        }
      }
      
      await serviceRequest.save();
    }

    // Send notification to customer using helper
    await createNotification(
      req.user._id,
      'service_request_created',
      '✅ Service Request Created',
      `Your service request for ${serviceType} has been created and sent to ${invitedCount} provider(s).`,
      { 
        serviceRequestId: serviceRequest._id,
        category: category,
        serviceType: serviceType,
        invitedCount: invitedCount,
        totalInvited: invitedProviders?.length || 0,
      }
    );

    res.status(201).json({
      message: 'Service request created successfully',
      serviceRequest,
      invitedCount,
      totalInvited: invitedProviders?.length || 0,
    });

  } catch (error) {
    console.error('❌ Create service request error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Invite providers to a service request
exports.inviteProviders = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { providerIds } = req.body;

    const serviceRequest = await ServiceRequest.findById(requestId);
    if (!serviceRequest) {
      return res.status(404).json({ message: 'Service request not found' });
    }

    // Check if customer owns this request
    if (serviceRequest.customerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Add invited providers
    let invitedCount = 0;
    for (const providerId of providerIds) {
      const existing = serviceRequest.invitedProviders?.find(
        p => p.providerId.toString() === providerId
      );
      
      if (!existing) {
        if (!serviceRequest.invitedProviders) {
          serviceRequest.invitedProviders = [];
        }
        
        serviceRequest.invitedProviders.push({
          providerId: providerId,
          status: 'invited',
          invitedAt: new Date(),
        });
        invitedCount++;

        // Notify provider
        const notification = new Notification({
          userId: providerId,
          type: 'new_service_request',
          title: '📋 Service Request Invitation',
          message: `You've been invited to quote for a ${serviceRequest.category} service`,
          data: { serviceRequestId: serviceRequest._id },
        });
        await notification.save();

        // Emit socket event
        const io = req.app.get('io');
        if (io) {
          io.to(`user_${providerId}`).emit('new-service-invite', {
            serviceRequestId: serviceRequest._id,
            category: serviceRequest.category,
            serviceType: serviceRequest.serviceType,
          });
        }
      }
    }

    await serviceRequest.save();

    res.json({
      message: 'Providers invited successfully',
      invitedCount,
      serviceRequest,
    });
  } catch (error) {
    console.error('Invite providers error:', error);
    res.status(500).json({ message: error.message });
  }
};

// ============================================================
// QUOTE FUNCTIONS
// ============================================================

// Submit quote
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

    // Check if provider was invited
    const isInvited = serviceRequest.invitedProviders?.some(
      p => p.providerId.toString() === req.user._id.toString()
    );

    if (!isInvited && req.user.role !== 'admin') {
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

    // Update invited provider status
    const inviteIndex = serviceRequest.invitedProviders?.findIndex(
      p => p.providerId.toString() === req.user._id.toString()
    );
    if (inviteIndex !== -1 && inviteIndex !== undefined) {
      serviceRequest.invitedProviders[inviteIndex].quote = {
        amount: amount,
        message: message,
        estimatedDuration: estimatedDuration,
        submittedAt: new Date(),
      };
      serviceRequest.invitedProviders[inviteIndex].status = 'quoted';
    }
    await serviceRequest.save();

    // Notify customer using helper
    await createNotification(
      serviceRequest.customerId,
      'quote_received',
      '💰 New Quote Received',
      `${req.user.fullName} has submitted a quote of £${amount} for your service request`,
      { 
        serviceRequestId: serviceRequest._id, 
        quoteId: quote._id,
        providerId: req.user._id,
        providerName: req.user.fullName,
        amount: amount,
      }
    );

    // Update request status if first quote
    if (serviceRequest.status === 'pending' || serviceRequest.status === 'open') {
      serviceRequest.status = 'quotes_received';
      await serviceRequest.save();
    }

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${serviceRequest.customerId}`).emit('new-quote', {
        serviceRequestId: serviceRequest._id,
        providerId: req.user._id,
        amount: amount,
      });
    }

    res.status(201).json({
      message: 'Quote submitted successfully',
      quote,
    });
  } catch (error) {
    console.error('❌ Submit quote error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get quotes for service request
exports.getQuotesForRequest = async (req, res) => {
  try {
    const { requestId } = req.params;

    const serviceRequest = await ServiceRequest.findById(requestId);
    if (!serviceRequest) {
      return res.status(404).json({ message: 'Service request not found' });
    }

    // Check authorization
    if (serviceRequest.customerId.toString() !== req.user._id.toString() && 
        req.user.role !== 'admin') {
      // Check if user is an invited provider
      const isInvited = serviceRequest.invitedProviders?.some(
        p => p.providerId.toString() === req.user._id.toString()
      );
      if (!isInvited) {
        return res.status(403).json({ message: 'Access denied' });
      }
    }

    const quotes = await Quote.find({ serviceRequestId: requestId })
      .populate('providerId', 'fullName email phoneNumber averageRating totalReviews verificationBadges')
      .sort({ amount: 1 });

    res.json(quotes);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ============================================================
// NEGOTIATION FUNCTIONS
// ============================================================

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
    if (!serviceRequest.negotiationHistory) {
      serviceRequest.negotiationHistory = [];
    }
    serviceRequest.negotiationHistory.push({
      from,
      userId: req.user._id,
      message: message || `${from} offered £${counterAmount}`,
      offerAmount: counterAmount,
      status: 'countered',
    });
    serviceRequest.status = 'negotiating';
    await serviceRequest.save();

    // Notify the other party using helper
    const recipientId = isCustomer ? quote.providerId : serviceRequest.customerId;
    const senderName = isCustomer ? req.user.fullName : 'Provider';
    
    await createNotification(
      recipientId,
      'quote_countered',
      '🔄 Counter-Offer Received',
      `${senderName} has made a counter-offer of £${counterAmount}`,
      { 
        serviceRequestId: serviceRequest._id, 
        quoteId: quote._id,
        amount: counterAmount,
        from: from,
        message: message || '',
      }
    );

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.to(`booking_${serviceRequest._id}`).emit('negotiation-update', {
        serviceRequestId: serviceRequest._id,
        quoteId: quote._id,
        amount: counterAmount,
        from,
        message,
      });
    }

    res.json({
      message: 'Counter-offer sent',
      quote,
      negotiationHistory: serviceRequest.negotiationHistory,
    });
  } catch (error) {
    console.error('❌ Negotiate quote error:', error);
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

    // Notify provider using helper
    await createNotification(
      quote.providerId,
      'quote_accepted',
      '🎉 Quote Accepted!',
      `Your quote of £${finalPrice || quote.amount} has been accepted for ${serviceRequest.serviceType}`,
      { 
        serviceRequestId: serviceRequest._id,
        customerId: req.user._id,
        customerName: req.user.fullName,
        finalPrice: finalPrice || quote.amount,
      }
    );

    // Notify customer using helper
    await createNotification(
      req.user._id,
      'service_request_accepted',
      '✅ Service Request Accepted',
      `Your service request has been accepted by ${quote.providerId.fullName || 'the provider'}`,
      { 
        serviceRequestId: serviceRequest._id,
        providerId: quote.providerId,
        finalPrice: finalPrice || quote.amount,
      }
    );

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.to(`booking_${serviceRequest._id}`).emit('quote-accepted', {
        serviceRequestId: serviceRequest._id,
        providerId: quote.providerId,
        amount: finalPrice || quote.amount,
      });
    }

    res.json({
      message: 'Quote accepted successfully',
      serviceRequest,
    });
  } catch (error) {
    console.error('❌ Accept quote error:', error);
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
    if (!serviceRequest.negotiationHistory) {
      serviceRequest.negotiationHistory = [];
    }
    serviceRequest.negotiationHistory.push({
      from: isCustomer ? 'customer' : 'provider',
      userId: req.user._id,
      message: reason || 'Quote rejected',
      status: 'rejected',
    });
    await serviceRequest.save();

    // Notify the other party using helper
    const recipientId = isCustomer ? quote.providerId : serviceRequest.customerId;
    const senderName = isCustomer ? 'Customer' : 'Provider';
    
    await createNotification(
      recipientId,
      'quote_rejected',
      '❌ Quote Rejected',
      `Your quote has been rejected${reason ? `: ${reason}` : ''}`,
      { 
        serviceRequestId: serviceRequest._id,
        quoteId: quote._id,
        reason: reason || 'No reason provided',
        rejectedBy: senderName,
      }
    );

    res.json({
      message: 'Quote rejected',
      quote,
    });
  } catch (error) {
    console.error('❌ Reject quote error:', error);
    res.status(500).json({ message: error.message });
  }
};

// ============================================================
// SERVICE REQUEST RETRIEVAL FUNCTIONS
// ============================================================

// Get service request by ID
exports.getServiceRequestById = async (req, res) => {
  try {
    const serviceRequest = await ServiceRequest.findById(req.params.id)
      .populate('customerId', 'fullName email phoneNumber address')
      .populate('selectedProviderId', 'fullName email phoneNumber address averageRating totalReviews verificationBadges')
      .populate('invitedProviders.providerId', 'fullName email phoneNumber address averageRating totalReviews verificationBadges')
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
      // Check if user is an invited provider
      const isInvited = serviceRequest.invitedProviders?.some(
        p => p.providerId._id.toString() === req.user._id.toString()
      );
      if (!isInvited) {
        return res.status(403).json({ message: 'Access denied' });
      }
    }

    res.json(serviceRequest);
  } catch (error) {
    console.error('Get service request by ID error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get all service requests for a customer
exports.getMyServiceRequests = async (req, res) => {
  try {
    const query = { customerId: req.user._id };
    const serviceRequests = await ServiceRequest.find(query)
      .populate('selectedProviderId', 'fullName email phoneNumber')
      .populate('invitedProviders.providerId', 'fullName email')
      .sort({ createdAt: -1 });

    res.json(serviceRequests);
  } catch (error) {
    console.error('Get my service requests error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get service requests for a provider (matched or invited)
exports.getProviderServiceRequests = async (req, res) => {
  try {
    // Find requests where provider is invited or matched
    const serviceRequests = await ServiceRequest.find({
      $or: [
        { 'matchedProviders.providerId': req.user._id },
        { 'invitedProviders.providerId': req.user._id },
      ],
      status: { 
        $in: ['pending', 'quotes_received', 'negotiating', 'provider_selected', 'in_progress'] 
      },
    })
      .populate('customerId', 'fullName email phoneNumber')
      .populate('selectedProviderId', 'fullName email phoneNumber')
      .sort({ createdAt: -1 });

    res.json(serviceRequests);
  } catch (error) {
    console.error('Get provider service requests error:', error);
    res.status(500).json({ message: error.message });
  }
};

// ============================================================
// SERVICE REQUEST ACTION FUNCTIONS
// ============================================================

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
    console.error('Cancel service request error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Complete service request
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
    console.error('Complete service request error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Start service request (provider)
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
    console.error('Start service request error:', error);
    res.status(500).json({ message: error.message });
  }
};

exports.getServiceCategories = async (req, res) => {
  try {
    const { type } = req.query; // Optional filter by type
    
    let query = { isActive: true };
    if (type) {
      query.type = type;
    }
    
    const categories = await ServiceCategoryModel.find(query)
      .sort({ displayOrder: 1, name: 1 });
    
    res.json(categories);
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Create a new category (admin only)
exports.createServiceCategory = async (req, res) => {
  try {
    const { name, label, icon, description, subCategories, displayOrder } = req.body;
    
    const existingCategory = await ServiceCategoryModel.findOne({ name });
    if (existingCategory) {
      return res.status(400).json({ message: 'Category with this name already exists' });
    }
    
    const category = new ServiceCategoryModel({
      name,
      label,
      icon,
      description,
      subCategories: subCategories || [],
      displayOrder: displayOrder || 0,
    });
    
    await category.save();
    
    res.status(201).json({
      message: 'Category created successfully',
      category,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update a category (admin only)
exports.updateServiceCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, label, icon, description, subCategories, isActive, displayOrder } = req.body;
    
    const category = await ServiceCategoryModel.findById(id);
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }
    
    // Check if name conflicts with another category
    if (name && name !== category.name) {
      const existing = await ServiceCategoryModel.findOne({ name });
      if (existing) {
        return res.status(400).json({ message: 'Category with this name already exists' });
      }
    }
    
    if (name) category.name = name;
    if (label) category.label = label;
    if (icon) category.icon = icon;
    if (description !== undefined) category.description = description;
    if (subCategories) category.subCategories = subCategories;
    if (isActive !== undefined) category.isActive = isActive;
    if (displayOrder !== undefined) category.displayOrder = displayOrder;
    
    await category.save();
    
    res.json({
      message: 'Category updated successfully',
      category,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete a category (admin only)
exports.deleteServiceCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const category = await ServiceCategoryModel.findById(id);
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }
    
    await category.deleteOne();
    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ============================================================
// SERVICE PROVIDERS (UPDATED TO USE DYNAMIC CATEGORIES)
// ============================================================

// Get service providers with filters
exports.getServiceProviders = async (req, res) => {
  try {
    const { 
      category, 
      dbsChecked, 
      insured, 
      rated, 
      lat, 
      lng, 
      radius, 
      limit = 20 
    } = req.query;
    
    
    let query = {
      role: 'provider',
      isActive: true,
      verificationStatus: 'approved',
    };

    // CATEGORY MATCHING - FIXED
    if (category) {
      
      // Try to find the category in the database
      const categoryDoc = await ServiceCategoryModel.findOne({ 
        name: category.toLowerCase(),
        isActive: true 
      });
      
      
      if (categoryDoc && categoryDoc.subCategories && categoryDoc.subCategories.length > 0) {
        // Use the subcategories from the database
        query.serviceCategories = { $in: categoryDoc.subCategories };
      } else if (categoryDoc) {
        // If no subcategories, use the category name itself
        query.serviceCategories = category;
      } else {
        // If category not found in ServiceCategory collection, 
        // check if any provider has this as a direct category
        query.serviceCategories = category;
      }
    }

    // ============================================================
    // FILTERS
    // ============================================================
    if (dbsChecked === 'true') {
      query['verificationBadges'] = 'dbs_checked';
    }

    if (insured === 'true') {
      query['verificationBadges'] = 'insured';
    }

    // ============================================================
    // LOCATION - FIXED to handle null/undefined
    // ============================================================
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    
    if (!isNaN(latNum) && !isNaN(lngNum)) {
      query['location'] = {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [lngNum, latNum],
          },
          $maxDistance: (parseFloat(radius) || 10) * 1000, // Convert km to meters
        },
      };
    } else {
    }


    // ============================================================
    // EXECUTE QUERY
    // ============================================================
    let providers = await User.find(query)
      .select('fullName email phoneNumber address averageRating totalReviews verificationBadges serviceCategories serviceRates about location')
      .limit(parseInt(limit));


    // ============================================================
    // ADD DISTANCE AND MATCH SCORE (if location provided)
    // ============================================================
    if (!isNaN(latNum) && !isNaN(lngNum)) {
      providers = providers.map(provider => {
        const providerLocation = provider.location?.coordinates || [0, 0];
        const distance = calculateDistance(
          latNum,
          lngNum,
          providerLocation[1],
          providerLocation[0]
        );
        return {
          ...provider.toObject(),
          distance: distance,
          matchScore: calculateMatchScore(provider, distance),
        };
      });

      providers.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
    }

    res.json(providers);
  } catch (error) {
    console.error('❌ getServiceProviders error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Helper: Find nearby providers (UPDATED to use dynamic categories)
async function findNearbyProviders(request, limit = 5) {
  const { category, location, requiresDBS, requiresCertification } = request;
  
  let query = {
    role: 'provider',
    isActive: true,
    verificationStatus: 'approved',
  };

  // Get subcategories from database
  if (category) {
    const categoryDoc = await ServiceCategoryModel.findOne({ 
      name: category,
      isActive: true 
    });
    
    if (categoryDoc && categoryDoc.subCategories && categoryDoc.subCategories.length > 0) {
      query.serviceCategories = { $in: categoryDoc.subCategories };
    } else if (categoryDoc) {
      query.serviceCategories = category;
    } else {
      query.serviceCategories = category;
    }
  }

  if (requiresDBS) {
    query['verificationBadges'] = 'dbs_checked';
  }

  if (requiresCertification) {
    query['verificationBadges'] = 'certified';
  }

  if (location?.coordinates?.lat && location?.coordinates?.lng) {
    query['location'] = {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [location.coordinates.lng, location.coordinates.lat],
        },
        $maxDistance: 20000,
      },
    };
  }

  let providers = await User.find(query)
    .select('fullName email phoneNumber address averageRating totalReviews verificationBadges serviceCategories serviceRates about location')
    .limit(limit * 2);

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

  matched.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
  return matched.slice(0, limit);
}

// ============================================================
// GET MATCHED PROVIDERS (UPDATED to use dynamic categories)
// ============================================================

exports.getMatchedProviders = async (req, res) => {
  try {
    const { requestId } = req.params;
    
    const serviceRequest = await ServiceRequest.findById(requestId);
    if (!serviceRequest) {
      return res.status(404).json({ message: 'Service request not found' });
    }

    // Check authorization
    if (serviceRequest.customerId.toString() !== req.user._id.toString() && 
        req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Get subcategories from database
    const category = serviceRequest.category;
    let subCategories = [category];
    
    if (category) {
      const categoryDoc = await ServiceCategoryModel.findOne({ 
        name: category,
        isActive: true 
      });
      
      if (categoryDoc && categoryDoc.subCategories && categoryDoc.subCategories.length > 0) {
        subCategories = categoryDoc.subCategories;
      }
    }

    // Find providers that match this request
    const requiresDBS = serviceRequest.requiresDBS;
    const requiresCertification = serviceRequest.requiresCertification;
    
    const providerProfiles = await ProviderProfile.find({
      serviceCategories: { $in: subCategories },
      isVerified: true,
    });

    const providerIds = providerProfiles.map(p => p.userId);
    
    let matchedProviders = [];
    
    if (providerIds.length > 0) {
      const users = await User.find({
        _id: { $in: providerIds },
        isActive: true,
        isAvailable: true,
        verificationStatus: 'approved',
      });

      matchedProviders = await Promise.all(users.map(async (user) => {
        const profile = providerProfiles.find(p => p.userId.toString() === user._id.toString());
        
        let matchScore = 50;
        
        if (profile?.serviceCategories?.some(cat => subCategories.includes(cat))) {
          matchScore += 20;
        }
        
        if (requiresDBS && profile?.dbsChecked) {
          matchScore += 15;
        } else if (requiresDBS) {
          matchScore -= 10;
        }
        
        if (requiresCertification && profile?.certifications?.length > 0) {
          matchScore += 15;
        } else if (requiresCertification) {
          matchScore -= 10;
        }
        
        if (serviceRequest.isUrgent) {
          matchScore += 5;
        }
        
        if (user.averageRating) {
          matchScore += user.averageRating * 2;
        }
        
        let distance = null;
        if (serviceRequest.location?.coordinates?.lat && serviceRequest.location?.coordinates?.lng) {
          try {
            const distanceResult = await OSRMService.getDistance(
              serviceRequest.location.coordinates.lat,
              serviceRequest.location.coordinates.lng,
              user.location?.coordinates?.[1] || 51.5074,
              user.location?.coordinates?.[0] || -0.1276
            );
            distance = distanceResult.distance.value;
            
            if (distance < 5) matchScore += 20;
            else if (distance < 10) matchScore += 10;
            else if (distance < 20) matchScore += 5;
            else matchScore -= 5;
          } catch (error) {
            console.warn('Distance calculation failed:', error.message);
          }
        }
        
        return {
          providerId: user._id,
          fullName: user.fullName,
          email: user.email,
          phoneNumber: user.phoneNumber,
          averageRating: user.averageRating,
          totalReviews: user.totalReviews,
          matchScore: Math.max(0, Math.min(100, matchScore)),
          distance: distance,
          profile: profile,
          about: profile?.about || '',
          verificationBadges: user.verificationBadges || [],
        };
      }));

      matchedProviders.sort((a, b) => b.matchScore - a.matchScore);
    }

    res.json({
      matchedProviders,
      total: matchedProviders.length,
    });
  } catch (error) {
    console.error('Get matched providers error:', error);
    res.status(500).json({ message: error.message });
  }
};




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
  return R * c;
}

// Helper: Calculate match score
function calculateMatchScore(provider, distance) {
  let score = 100;
  
  if (distance) {
    score -= Math.min(distance * 2, 30);
  }
  
  if (provider.averageRating) {
    score += provider.averageRating * 5;
  }
  
  if (provider.verificationBadges?.includes('dbs_checked')) score += 10;
  if (provider.verificationBadges?.includes('insured')) score += 10;
  if (provider.verificationBadges?.includes('certified')) score += 10;
  if (provider.verificationBadges?.includes('id_checked')) score += 5;
  
  return Math.max(0, Math.min(100, score));
}