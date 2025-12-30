const logger = require('../utils/logger');
const redisService = require('../services/redis');
const loopMessage = require('../services/loopMessage');
const { normalizePhoneNumber } = require('../utils/helpers');

class VoiceHandler {
  /**
   * Handle incoming voice messages
   */
  async handleVoiceMessage(webhookData) {
    const phoneNumber = normalizePhoneNumber(webhookData.phoneNumber);
    const attachmentUrl = webhookData.attachmentUrl;
    const attachmentType = webhookData.attachmentType;

    if (!phoneNumber) {
      logger.warn('Invalid voice message data');
      return;
    }

    logger.info('Voice message received', {
      phoneNumber: phoneNumber.slice(-4),
      attachmentType,
      hasUrl: Boolean(attachmentUrl)
    });

    try {
      // Store voice message reference
      await this.storeVoiceMessage(phoneNumber, attachmentUrl, attachmentType);

      // Send acknowledgment (placeholder for future transcription)
      const response = this.getVoiceMessageResponse();
      await loopMessage.sendMessage(phoneNumber, response);
      logger.logMessage('outbound', phoneNumber, response);

      // Update user activity
      await this.updateUserActivity(phoneNumber);

    } catch (error) {
      logger.logError('VoiceHandler.handleVoiceMessage', error);
      
      // Send fallback response
      try {
        await loopMessage.sendMessage(phoneNumber, 
          "I got your voice message! I can't listen to it yet, but I'm here whenever you want to type it out."
        );
      } catch (e) {
        // Ignore
      }
    }
  }

  /**
   * Store voice message reference for future processing
   */
  async storeVoiceMessage(phoneNumber, url, type) {
    try {
      await redisService.addMessage(phoneNumber, {
        role: 'user',
        content: '[Voice message received]',
        type: 'voice',
        attachmentUrl: url,
        attachmentType: type,
        transcribed: false
      });
    } catch (error) {
      logger.warn('Failed to store voice message', { error: error.message });
    }
  }

  /**
   * Get response for voice message
   */
  getVoiceMessageResponse() {
    const responses = [
      "I received your voice message! 🎤 I can't listen yet, but you can type it out if you'd like, or I'm here to listen when you're ready to share.",
      "Got your voice note! I'm not able to hear it yet, but feel free to text me what's on your mind.",
      "Voice message received! 🎙️ I can't process audio yet, but I'm all ears (metaphorically) if you want to type it out."
    ];
    return responses[Math.floor(Math.random() * responses.length)];
  }

  /**
   * Update user activity after voice message
   */
  async updateUserActivity(phoneNumber) {
    try {
      const user = await redisService.getUser(phoneNumber);
      if (user) {
        await redisService.updateUser(phoneNumber, {
          stats: {
            ...user.stats,
            lastActive: Date.now(),
            messageCount: (user.stats.messageCount || 0) + 1
          }
        });
      }
    } catch (error) {
      // Non-critical
    }
  }

  /**
   * Future: Transcribe voice message using Whisper/AssemblyAI
   * This is a placeholder for when transcription is implemented
   */
  async transcribeVoiceMessage(audioUrl) {
    // TODO: Implement with Whisper API or AssemblyAI
    // 1. Download audio from URL
    // 2. Send to transcription service
    // 3. Return text
    
    logger.info('Voice transcription not yet implemented', { audioUrl });
    return null;
  }

  /**
   * Future: Generate voice response using ElevenLabs
   * This is a placeholder for when voice generation is implemented
   */
  async generateVoiceResponse(text) {
    // TODO: Implement with ElevenLabs
    // 1. Send text to ElevenLabs API
    // 2. Get audio URL/file
    // 3. Send via LoopMessage
    
    logger.info('Voice generation not yet implemented');
    return null;
  }

  /**
   * Check if voice features are enabled
   */
  isVoiceEnabled() {
    return {
      transcription: false, // Set to true when implemented
      generation: false     // Set to true when ElevenLabs is integrated
    };
  }
}

// Export singleton instance
module.exports = new VoiceHandler();

