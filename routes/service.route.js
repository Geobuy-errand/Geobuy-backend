const express = require('express');
const router = express.Router();
const { authMiddleware, requireRole } = require('../middleware/auth.middleware');
const ServiceController = require('../controllers/service.controller');

// Public routes
router.get('/', ServiceController.getServices);
router.get('/popular', ServiceController.getPopularServices);
router.get('/categories', ServiceController.getServiceCategories);
router.get('/providers', ServiceController.getServiceProviders);
router.get('/category/:category', ServiceController.getServicesByCategory);
router.get('/:id', ServiceController.getServiceById);

// Customer routes (protected)
router.post('/request', authMiddleware, requireRole('customer'), ServiceController.createServiceRequest);
router.get('/my-requests', authMiddleware, requireRole('customer'), ServiceController.getMyServiceRequests);
router.get('/request/:id', authMiddleware, ServiceController.getServiceRequestById);
router.put('/request/:id/cancel', authMiddleware, requireRole('customer'), ServiceController.cancelServiceRequest);

// Quote routes
router.post('/quote', authMiddleware, requireRole('provider'), ServiceController.submitQuote);
router.get('/request/:id/quotes', authMiddleware, ServiceController.getQuotesForRequest);
router.put('/quote/:id/select', authMiddleware, requireRole('customer'), ServiceController.selectQuote);

// Provider routes
router.get('/provider-requests', authMiddleware, requireRole('provider'), ServiceController.getProviderServiceRequests);

// Admin routes
router.post('/', authMiddleware, requireRole('admin'), ServiceController.createService);
router.put('/:id', authMiddleware, requireRole('admin'), ServiceController.updateService);
router.delete('/:id', authMiddleware, requireRole('admin'), ServiceController.deleteService);

module.exports = router;