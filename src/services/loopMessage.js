const axios = require('axios');
const crypto = require('crypto');
const logger = require('../utils/logger');
const config = require('../config');
const { withRetry } = require('../utils/helpers');

class LoopMessageService {
  constructor() {
    this.baseUrl = config.loopMessageBaseUrl;
    this.apiKey = config.loopMessageApiKey;
    this.webhookSecret = config.loopMessageWebhookSecret;
    
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': this.apiKey
      }
    });
  }

  /**
   * Send a text message to a phone number
   */
  async sendMessage(phoneNumber, text) {
    if (!this.apiKey) {
      logger.warn('LoopMessage API key not configured, skipping send');
      return { success: false, reason: 'no_api_key' };
    }

    return withRetry(async () => {
      try {
        const response = await this.client.post('/message/send', {
          recipient: phoneNumber,
          text: text
        });

        logger.logMessage('outbound', phoneNumber, text, {
          messageId: response.data?.id,
          status: 'sent'
        });

        return {
          success: true,
          messageId: response.data?.id,
          data: response.data
        };
      } catch (error) {
        const statusCode = error.response?.status;
        const errorMessage = error.response?.data?.message || error.message;

        logger.logError('LoopMessage.sendMessage', error, {
          phoneNumber: phoneNumber.slice(-4),
          statusCode
        });

        // Handle specific error codes
        if (statusCode === 429) {
          throw new Error('Rate limit exceeded');
        }
        if (statusCode === 400) {
          return { success: false, reason: 'invalid_request', error: errorMessage };
        }
        if (statusCode === 401 || statusCode === 403) {
          return { success: false, reason: 'auth_error', error: errorMessage };
        }

        throw error;
      }
    }, 3);
  }

  /**
   * Send a reaction to a message
   */
  async sendReaction(messageId, reaction) {
    if (!this.apiKey) {
      logger.warn('LoopMessage API key not configured, skipping reaction');
      return { success: false, reason: 'no_api_key' };
    }

    try {
      const response = await this.client.post('/message/react', {
        message_id: messageId,
        reaction: reaction
      });

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      logger.logError('LoopMessage.sendReaction', error, { messageId });
      return { success: false, error: error.message };
    }
  }

  /**
   * Get message delivery status
   */
  async getMessageStatus(messageId) {
    if (!this.apiKey) {
      return { success: false, reason: 'no_api_key' };
    }

    try {
      const response = await this.client.get(`/message/status/${messageId}`);
      return {
        success: true,
        status: response.data?.status,
        data: response.data
      };
    } catch (error) {
      logger.logError('LoopMessage.getMessageStatus', error, { messageId });
      return { success: false, error: error.message };
    }
  }

  /**
   * Validate webhook signature
   */
  validateWebhookSignature(payload, signature) {
    if (!this.webhookSecret) {
      // If no secret configured, skip validation (development mode)
      return true;
    }

    if (!signature) {
      return false;
    }

    const expectedSignature = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(typeof payload === 'string' ? payload : JSON.stringify(payload))
      .digest('hex');

    try {
      return crypto.timingSafeEquals(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch {
      return false;
    }
  }

  /**
   * Parse incoming webhook data
   */
  parseWebhookData(body) {
    // Normalize the webhook payload structure
    // LoopMessage sends different formats for different events
    
    // Extract phone number from various possible fields
    const phoneNumber = body.sender || 
                        body.from || 
                        body.phone || 
                        body.recipient || 
                        body.from_number ||
                        body.contact ||
                        body.number ||
                        (body.message && body.message.from) ||
                        (body.message && body.message.sender);
    
    // Extract message content from various possible fields
    const content = body.text || 
                    body.message || 
                    body.content || 
                    body.body ||
                    (body.message && body.message.text) ||
                    (body.message && body.message.content);
    
    const normalized = {
      type: 'unknown',
      messageId: body.id || body.message_id || body.messageId || (body.message && body.message.id),
      phoneNumber: phoneNumber,
      content: content,
      timestamp: body.timestamp || body.createdAt || Date.now(),
      raw: body
    };

    // Determine message type
    if (body.reaction || (body.message && body.message.reaction)) {
      normalized.type = 'reaction';
      normalized.reaction = body.reaction || body.message.reaction;
      normalized.targetMessageId = body.target_message_id || body.message_id;
    } else if (body.attachment_url || body.attachments?.length > 0 || (body.message && body.message.attachments)) {
      normalized.type = 'voice';
      normalized.attachmentUrl = body.attachment_url || body.attachments?.[0]?.url || body.message?.attachments?.[0]?.url;
      normalized.attachmentType = body.attachment_type || body.attachments?.[0]?.type || body.message?.attachments?.[0]?.type;
    } else if (body.status || body.event === 'status') {
      normalized.type = 'status';
      normalized.status = body.status || body.delivery_status;
    } else if (content) {
      normalized.type = 'text';
    }

    return normalized;
  }

  /**
   * Send a typing indicator (if supported)
   */
  async sendTypingIndicator(phoneNumber) {
    // LoopMessage may or may not support this
    // Implement if available in their API
    return { success: true };
  }

  /**
   * Format phone number for LoopMessage API
   */
  formatPhoneNumber(phone) {
    // Remove all non-digit characters
    let cleaned = phone.replace(/\D/g, '');
    
    // Add country code if missing (assume US)
    if (cleaned.length === 10) {
      cleaned = '1' + cleaned;
    }
    
    return '+' + cleaned;
  }

  /**
   * Check if API is configured and ready
   */
  isConfigured() {
    return Boolean(this.apiKey);
  }
}

// Export singleton instance
module.exports = new LoopMessageService();

