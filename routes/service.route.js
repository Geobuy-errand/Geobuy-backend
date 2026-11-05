const express = require('express');
const router = express.Router();
const { authMiddleware, requireRole, optionalAuth } = require('../middleware/auth.middleware');
const ServiceController = require('../controllers/service.controller');

// IMPORTANT: specific paths must come BEFORE '/:id'. Previously '/:id' was
// declared first, so '/my-requests' and '/provider-requests' were treated as
// service IDs and always failed.

// ---------------- Public ----------------
router.get('/', ServiceController.getServices);
router.get('/popular', ServiceController.getPopularServices);
router.get('/categories', ServiceController.getServiceCategories);
router.get('/providers', optionalAuth, ServiceController.getServiceProviders);
router.get('/category/:category', ServiceController.getServicesByCategory);

// ---------------- Customer ----------------
router.post('/request', authMiddleware, requireRole('customer'), ServiceController.createServiceRequest);
router.get('/my-requests', authMiddleware, requireRole('customer'), ServiceController.getMyServiceRequests);
router.get('/request/:id', authMiddleware, ServiceController.getServiceRequestById);
router.get('/request/:requestId/matches', authMiddleware, ServiceController.getMatchedProviders);
router.post('/request/:requestId/invite', authMiddleware, requireRole('customer'), ServiceController.inviteProviders);
router.put('/request/:id/cancel', authMiddleware, requireRole('customer', 'admin'), ServiceController.cancelServiceRequest);
router.put('/request/:id/complete', authMiddleware, requireRole('customer'), ServiceController.completeServiceRequest);

// ---------------- Categories (admin managed) ----------------
router.post('/categories', authMiddleware, requireRole('admin'), ServiceController.createServiceCategory);
router.put('/categories/:id', authMiddleware, requireRole('admin'), ServiceController.updateServiceCategory);
router.delete('/categories/:id', authMiddleware, requireRole('admin'), ServiceController.deleteServiceCategory);

// ---------------- Quotes ----------------
router.post('/quote', authMiddleware, requireRole('provider'), ServiceController.submitQuote);
router.post('/quote/negotiate', authMiddleware, requireRole('customer', 'provider'), ServiceController.negotiateQuote);
router.post('/quote/accept', authMiddleware, requireRole('customer'), ServiceController.acceptQuote);
router.post('/quote/reject', authMiddleware, requireRole('customer', 'provider'), ServiceController.rejectQuote);
router.get('/request/:requestId/quotes', authMiddleware, ServiceController.getQuotesForRequest);

// ---------------- Provider ----------------
router.get('/provider-requests', authMiddleware, requireRole('provider'), ServiceController.getProviderServiceRequests);
router.put('/request/:id/start', authMiddleware, requireRole('provider'), ServiceController.startServiceRequest);

// ---------------- Admin service CRUD ----------------
router.post('/', authMiddleware, requireRole('admin'), ServiceController.createService);
router.put('/:id', authMiddleware, requireRole('admin'), ServiceController.updateService);
router.delete('/:id', authMiddleware, requireRole('admin'), ServiceController.deleteService);

// Keep last: matches any single segment
router.get('/:id', ServiceController.getServiceById);

module.exports = router;
