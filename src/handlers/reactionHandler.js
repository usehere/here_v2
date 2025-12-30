const logger = require('../utils/logger');
const redisService = require('../services/redis');
const loopMessage = require('../services/loopMessage');
const { normalizePhoneNumber } = require('../utils/helpers');

class ReactionHandler {
  /**
   * Handle incoming message reactions
   */
  async handleReaction(webhookData) {
    const phoneNumber = normalizePhoneNumber(webhookData.phoneNumber);
    const reaction = webhookData.reaction;
    const targetMessageId = webhookData.targetMessageId;

    if (!phoneNumber || !reaction) {
      logger.warn('Invalid reaction data');
      return;
    }

    logger.info('Reaction received', {
      phoneNumber: phoneNumber.slice(-4),
      reaction,
      targetMessageId
    });

    try {
      // Store reaction for context
      await this.storeReaction(phoneNumber, reaction, targetMessageId);

      // Generate contextual response based on reaction type
      const response = await this.getReactionResponse(phoneNumber, reaction);

      if (response) {
        await loopMessage.sendMessage(phoneNumber, response);
        logger.logMessage('outbound', phoneNumber, response);
      }

    } catch (error) {
      logger.logError('ReactionHandler.handleReaction', error);
    }
  }

  /**
   * Store reaction for emotional context
   */
  async storeReaction(phoneNumber, reaction, targetMessageId) {
    try {
      // Add reaction to conversation history as a special message
      await redisService.addMessage(phoneNumber, {
        role: 'user',
        content: `[Reacted with ${reaction}]`,
        type: 'reaction',
        reaction: reaction,
        targetMessageId: targetMessageId
      });

      // Update emotional state based on reaction
      await this.updateEmotionalStateFromReaction(phoneNumber, reaction);

    } catch (error) {
      logger.warn('Failed to store reaction', { error: error.message });
    }
  }

  /**
   * Update user's emotional state based on reaction
   */
  async updateEmotionalStateFromReaction(phoneNumber, reaction) {
    const emotionMap = {
      '❤️': 'positive',
      '👍': 'positive',
      '😊': 'happy',
      '😂': 'amused',
      '🥲': 'touched',
      '😢': 'sad',
      '😞': 'sad',
      '😠': 'frustrated',
      '👎': 'negative',
      '😮': 'surprised',
      '🙏': 'grateful',
      '💪': 'motivated'
    };

    const emotionalSignal = emotionMap[reaction] || null;

    if (emotionalSignal) {
      try {
        const user = await redisService.getUser(phoneNumber);
        if (user) {
          const history = user.emotionalState?.history || [];
          history.push({
            emotion: emotionalSignal,
            source: 'reaction',
            timestamp: Date.now()
          });

          // Keep only last 20
          if (history.length > 20) history.shift();

          await redisService.updateUser(phoneNumber, {
            emotionalState: {
              ...user.emotionalState,
              history,
              lastUpdated: Date.now()
            }
          });
        }
      } catch (error) {
        // Non-critical, ignore
      }
    }
  }

  /**
   * Generate response based on reaction type
   */
  async getReactionResponse(phoneNumber, reaction) {
    // Positive reactions on our messages
    const positiveReactions = ['❤️', '👍', '😊', '🙏', '💪'];
    const sadReactions = ['😢', '😞'];
    const negativeReactions = ['👎', '😠'];
    const amusedReactions = ['😂', '🤣'];

    // Don't respond to every reaction - only sometimes
    const shouldRespond = Math.random() < 0.5;

    if (!shouldRespond) {
      return null;
    }

    if (positiveReactions.includes(reaction)) {
      const responses = [
        "Glad that resonated! 💙",
        "🙂",
        "Happy that helped!",
        null, // Sometimes no response
        null
      ];
      return responses[Math.floor(Math.random() * responses.length)];
    }

    if (sadReactions.includes(reaction)) {
      const responses = [
        "Want to talk more about this?",
        "I'm here if you need to unpack that more.",
        "Sending you a virtual hug 💙"
      ];
      return responses[Math.floor(Math.random() * responses.length)];
    }

    if (negativeReactions.includes(reaction)) {
      return "I hear you - did I miss the mark? Tell me more about what you're feeling.";
    }

    if (amusedReactions.includes(reaction)) {
      const responses = [
        "😊",
        null,
        null
      ];
      return responses[Math.floor(Math.random() * responses.length)];
    }

    return null;
  }

  /**
   * Check if a reaction indicates follow-up needed
   */
  needsFollowUp(reaction) {
    const followUpReactions = ['😢', '😞', '👎', '😠'];
    return followUpReactions.includes(reaction);
  }
}

// Export singleton instance
module.exports = new ReactionHandler();

