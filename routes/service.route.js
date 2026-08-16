const express = require('express');
const router = express.Router();
const { authMiddleware, requireRole } = require('../middleware/auth.middleware');
const ServiceController = require('../controllers/service.controller');

// PUBLIC ROUTES
router.get('/', ServiceController.getServices);
router.get('/popular', ServiceController.getPopularServices);
router.get('/categories', ServiceController.getServiceCategories);
router.get('/providers', ServiceController.getServiceProviders);
router.get('/category/:category', ServiceController.getServicesByCategory);
router.get('/:id', ServiceController.getServiceById);

// CUSTOMER ROUTES
router.post('/request', authMiddleware, requireRole('customer'), ServiceController.createServiceRequest);
router.get('/my-requests', authMiddleware, requireRole('customer'), ServiceController.getMyServiceRequests);
router.get('/request/:id', authMiddleware, ServiceController.getServiceRequestById);
router.get('/request/:requestId/matches', authMiddleware, ServiceController.getMatchedProviders); // ✅ Added
router.post('/request/:requestId/invite', authMiddleware, requireRole('customer'), ServiceController.inviteProviders);
router.put('/request/:id/cancel', authMiddleware, requireRole('customer'), ServiceController.cancelServiceRequest);
router.put('/request/:id/complete', authMiddleware, requireRole('customer'), ServiceController.completeServiceRequest);


// ============================================================
// SERVICE CATEGORIES (DYNAMIC - Admin Managed)
// ============================================================
router.get('/categories', ServiceController.getServiceCategories);
router.post('/categories', authMiddleware, requireRole('admin'), ServiceController.createServiceCategory);
router.put('/categories/:id', authMiddleware, requireRole('admin'), ServiceController.updateServiceCategory);
router.delete('/categories/:id', authMiddleware, requireRole('admin'), ServiceController.deleteServiceCategory);


// QUOTE ROUTES
router.post('/quote', authMiddleware, requireRole('provider'), ServiceController.submitQuote);
router.post('/quote/negotiate', authMiddleware, ServiceController.negotiateQuote);
router.post('/quote/accept', authMiddleware, requireRole('customer'), ServiceController.acceptQuote);
router.post('/quote/reject', authMiddleware, ServiceController.rejectQuote);
router.get('/request/:requestId/quotes', authMiddleware, ServiceController.getQuotesForRequest);

// PROVIDER ROUTES
router.get('/provider-requests', authMiddleware, requireRole('provider'), ServiceController.getProviderServiceRequests);
router.put('/request/:id/start', authMiddleware, requireRole('provider'), ServiceController.startServiceRequest);

// ADMIN ROUTES
router.post('/', authMiddleware, requireRole('admin'), ServiceController.createService);
router.put('/:id', authMiddleware, requireRole('admin'), ServiceController.updateService);
router.delete('/:id', authMiddleware, requireRole('admin'), ServiceController.deleteService);

module.exports = router;