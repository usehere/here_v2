const logger = require('../utils/logger');
const redisService = require('../services/redis');
const conversationEngine = require('../services/conversationEngine');
const crisisDetection = require('../services/crisisDetection');
const onboarding = require('../services/onboarding');
const journaling = require('../services/journaling');
const loopMessage = require('../services/loopMessage');
const { normalizePhoneNumber } = require('../utils/helpers');
const { getWelcomeMessage } = require('../prompts/systemPrompt');

class MessageHandler {
  /**
   * Main message handling entry point
   */
  async handleMessage(webhookData) {
    const startTime = Date.now();
    const phoneNumber = normalizePhoneNumber(webhookData.phoneNumber);
    const message = webhookData.content;

    if (!phoneNumber || !message) {
      logger.warn('Invalid message data', { hasPhone: Boolean(phoneNumber), hasMessage: Boolean(message) });
      return;
    }

    logger.logMessage('inbound', phoneNumber, message);

    try {
      // Get or create user
      let user = await redisService.getOrCreateUser(phoneNumber);
      const isNewUser = user.stats.messageCount === 0;

      // Check for special commands first
      const commandResult = await this.handleCommands(phoneNumber, message, user);
      if (commandResult.handled) {
        await this.sendResponse(phoneNumber, commandResult.response);
        return;
      }

      // Check if this is a journal entry
      if (journaling.isJournalEntry(message)) {
        const result = await journaling.saveJournalEntry(phoneNumber, message);
        await this.sendResponse(phoneNumber, result.acknowledgment);
        return;
      }

      // Handle new user welcome
      if (isNewUser) {
        await this.sendResponse(phoneNumber, getWelcomeMessage());
        // Also generate a response to their first message
        const response = await this.generateAndSendResponse(phoneNumber, message, user);
        return;
      }

      // Crisis detection (runs in parallel with response generation for non-critical)
      const conversationHistory = await redisService.getConversationHistory(phoneNumber, 10);
      const crisisResult = await crisisDetection.detectCrisis(phoneNumber, message, conversationHistory);

      if (crisisResult.isCrisis && crisisResult.riskLevel === 'critical') {
        // For critical crisis, send crisis response immediately
        await this.sendResponse(phoneNumber, crisisResult.crisisResponse);
        return;
      }

      // Generate and send response
      let response = await conversationEngine.generateResponse(phoneNumber, message);

      // For high-risk crisis, prepend crisis resources
      if (crisisResult.isCrisis && crisisResult.crisisResponse) {
        response = crisisResult.crisisResponse + '\n\n' + response;
      }

      // Process onboarding progression
      user = await redisService.getUser(phoneNumber); // Refresh user data
      const onboardingResult = await onboarding.processOnboarding(phoneNumber, message, user);
      
      if (onboardingResult.response) {
        // Add onboarding prompt to response
        response = response + '\n\n' + onboardingResult.response;
      }

      await this.sendResponse(phoneNumber, response);

      const processingTime = Date.now() - startTime;
      logger.info('Message handled', {
        phoneNumber: phoneNumber.slice(-4),
        processingTimeMs: processingTime,
        isCrisis: crisisResult.isCrisis
      });

    } catch (error) {
      logger.logError('MessageHandler.handleMessage', error, {
        phoneNumber: phoneNumber.slice(-4)
      });

      // Send fallback response
      await this.sendResponse(phoneNumber, 
        "I'm having a moment - give me a sec and try again?"
      );
    }
  }

  /**
   * Generate response and send
   */
  async generateAndSendResponse(phoneNumber, message, user) {
    const response = await conversationEngine.generateResponse(phoneNumber, message);
    await this.sendResponse(phoneNumber, response);
    return response;
  }

  /**
   * Handle special commands
   */
  async handleCommands(phoneNumber, message, user) {
    const lowerMessage = message.toLowerCase().trim();

    // Forget me / delete data
    if (lowerMessage === 'forget me' || lowerMessage === 'delete my data') {
      await redisService.deleteUserData(phoneNumber);
      return {
        handled: true,
        response: "I've deleted all your data. If you ever want to chat again, just send a message and we'll start fresh. Take care 💙"
      };
    }

    // Stop check-ins
    if (lowerMessage === 'stop' || lowerMessage === 'stop check-ins' || lowerMessage === 'unsubscribe') {
      await redisService.setSchedule(phoneNumber, {
        nextCheckIn: null,
        nextJournalPrompt: null,
        followUps: []
      });
      return {
        handled: true,
        response: "Got it, I've stopped the check-ins. I'm still here whenever you want to talk though!"
      };
    }

    // Resume check-ins
    if (lowerMessage === 'resume' || lowerMessage === 'start check-ins') {
      await onboarding.setupCheckIns(phoneNumber);
      return {
        handled: true,
        response: "Welcome back! I'll start sending check-ins again. Talk soon 💫"
      };
    }

    // Help
    if (lowerMessage === 'help' || lowerMessage === '?') {
      return {
        handled: true,
        response: `Here's what you can do:
        
📝 Journal: Start a message with "j:" to save a journal entry
⏸ Stop check-ins: Say "stop" to pause proactive messages
▶️ Resume: Say "resume" to restart check-ins
🗑 Delete data: Say "forget me" to delete all your data
💬 Or just chat - I'm here to listen!`
      };
    }

    // Crisis resources
    if (lowerMessage === 'crisis' || lowerMessage === 'help me' || lowerMessage === 'resources') {
      const { getCrisisResourcesText } = require('../prompts/crisisPrompt');
      return {
        handled: true,
        response: getCrisisResourcesText()
      };
    }

    return { handled: false };
  }

  /**
   * Send response via LoopMessage
   */
  async sendResponse(phoneNumber, text) {
    if (!text) {
      logger.warn('Attempted to send empty response');
      return;
    }

    // Split long messages if needed (iMessage has limits)
    const maxLength = 1600;
    const messages = this.splitMessage(text, maxLength);

    for (const msg of messages) {
      const result = await loopMessage.sendMessage(phoneNumber, msg);
      
      if (!result.success) {
        logger.warn('Failed to send message', {
          phoneNumber: phoneNumber.slice(-4),
          reason: result.reason
        });
      }

      // Small delay between multi-part messages
      if (messages.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    logger.logMessage('outbound', phoneNumber, text);
  }

  /**
   * Split long message into parts
   */
  splitMessage(text, maxLength) {
    if (text.length <= maxLength) {
      return [text];
    }

    const messages = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= maxLength) {
        messages.push(remaining);
        break;
      }

      // Find a good break point
      let breakPoint = remaining.lastIndexOf('\n\n', maxLength);
      if (breakPoint === -1 || breakPoint < maxLength / 2) {
        breakPoint = remaining.lastIndexOf('\n', maxLength);
      }
      if (breakPoint === -1 || breakPoint < maxLength / 2) {
        breakPoint = remaining.lastIndexOf('. ', maxLength);
      }
      if (breakPoint === -1 || breakPoint < maxLength / 2) {
        breakPoint = remaining.lastIndexOf(' ', maxLength);
      }
      if (breakPoint === -1) {
        breakPoint = maxLength;
      }

      messages.push(remaining.substring(0, breakPoint + 1).trim());
      remaining = remaining.substring(breakPoint + 1).trim();
    }

    return messages;
  }
}

// Export singleton instance
module.exports = new MessageHandler();

