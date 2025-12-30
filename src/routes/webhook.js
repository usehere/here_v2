const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const loopMessage = require('../services/loopMessage');
const { asyncHandler } = require('../utils/errorHandler');
const redisService = require('../services/redis');

// Middleware to validate webhook signature
const validateSignature = (req, res, next) => {
  const signature = req.headers['x-loopmessage-signature'] || 
                    req.headers['x-signature'] ||
                    req.headers['x-webhook-signature'];
  
  // Get raw body for signature validation
  const payload = req.rawBody || JSON.stringify(req.body);
  
  if (!loopMessage.validateWebhookSignature(payload, signature)) {
    logger.warn('Invalid webhook signature', { 
      hasSignature: Boolean(signature),
      path: req.path 
    });
    // In production with secret configured, reject invalid signatures
    if (process.env.NODE_ENV === 'production' && process.env.LOOPMESSAGE_WEBHOOK_SECRET) {
      return res.status(401).json({ error: 'Invalid signature' });
    }
  }
  
  next();
};

// Middleware to capture raw body for signature validation
router.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));

/**
 * Main message webhook endpoint
 * Receives incoming messages from LoopMessage
 */
router.post('/message', validateSignature, asyncHandler(async (req, res) => {
  const startTime = Date.now();
  
  // Parse the webhook data
  const webhookData = loopMessage.parseWebhookData(req.body);
  
  logger.info('Webhook received', {
    type: webhookData.type,
    messageId: webhookData.messageId,
    hasContent: Boolean(webhookData.content)
  });

  // Check for duplicate (idempotency)
  if (webhookData.messageId) {
    const isDuplicate = await redisService.checkIdempotency(webhookData.messageId);
    if (isDuplicate) {
      logger.info('Duplicate webhook ignored', { messageId: webhookData.messageId });
      return res.status(200).json({ status: 'duplicate' });
    }
    await redisService.setIdempotency(webhookData.messageId);
  }

  // Respond quickly to webhook (async processing)
  res.status(200).json({ status: 'received' });

  // Process the message asynchronously
  try {
    // Import handlers dynamically to avoid circular dependencies
    const messageHandler = require('../handlers/messageHandler');
    const reactionHandler = require('../handlers/reactionHandler');
    const voiceHandler = require('../handlers/voiceHandler');

    switch (webhookData.type) {
      case 'text':
        await messageHandler.handleMessage(webhookData);
        break;
      case 'reaction':
        await reactionHandler.handleReaction(webhookData);
        break;
      case 'voice':
        await voiceHandler.handleVoiceMessage(webhookData);
        break;
      case 'status':
        // Log status updates
        logger.info('Message status update', {
          messageId: webhookData.messageId,
          status: webhookData.status
        });
        break;
      default:
        logger.warn('Unknown webhook type', { type: webhookData.type });
    }

    const processingTime = Date.now() - startTime;
    logger.info('Webhook processed', {
      type: webhookData.type,
      processingTimeMs: processingTime
    });
  } catch (error) {
    logger.logError('Webhook processing', error, {
      type: webhookData.type,
      messageId: webhookData.messageId
    });
    // Don't throw - we already sent 200 response
  }
}));

/**
 * Status webhook endpoint
 * Receives message delivery status updates
 */
router.post('/status', validateSignature, asyncHandler(async (req, res) => {
  const { message_id, status, error } = req.body;
  
  logger.info('Status webhook received', {
    messageId: message_id,
    status,
    hasError: Boolean(error)
  });

  if (error) {
    logger.warn('Message delivery failed', {
      messageId: message_id,
      error
    });
  }

  res.status(200).json({ status: 'received' });
}));

/**
 * Reaction webhook endpoint
 * Receives message reaction events
 */
router.post('/reaction', validateSignature, asyncHandler(async (req, res) => {
  const webhookData = loopMessage.parseWebhookData(req.body);
  
  logger.info('Reaction webhook received', {
    reaction: webhookData.reaction,
    targetMessageId: webhookData.targetMessageId
  });

  res.status(200).json({ status: 'received' });

  try {
    const reactionHandler = require('../handlers/reactionHandler');
    await reactionHandler.handleReaction(webhookData);
  } catch (error) {
    logger.logError('Reaction processing', error);
  }
}));

module.exports = router;

