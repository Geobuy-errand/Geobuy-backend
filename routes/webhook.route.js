const express = require('express');
const router = express.Router();
const WebhookController = require('../controllers/webhook.controller');

// Unified webhook endpoint for all Stripe events
router.post('/stripe', 
  express.raw({ type: 'application/json' }), 
  WebhookController.handleWebhook
);

module.exports = router;