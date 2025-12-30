const logger = require('../utils/logger');
const config = require('../config');
const redisService = require('./redis');
const { getWelcomeMessage, getOnboardingPrompt, getNameAcknowledgment } = require('../prompts/systemPrompt');

class OnboardingService {
  constructor() {
    this.stages = config.onboardingStages;
  }

  /**
   * Check if user is new (needs welcome message)
   */
  async isNewUser(phoneNumber) {
    const user = await redisService.getUser(phoneNumber);
    return !user;
  }

  /**
   * Get welcome message for new user
   */
  getWelcomeMessage() {
    return getWelcomeMessage();
  }

  /**
   * Process onboarding stage progression
   */
  async processOnboarding(phoneNumber, message, user) {
    const stage = user.onboardingStage || 0;
    let response = null;
    let stageAdvanced = false;

    switch (stage) {
      case this.stages.INITIAL:
        // User just started, after 2-3 messages ask for name
        if (user.stats.messageCount >= 2 && !user.name) {
          response = getOnboardingPrompt(1);
          await this.advanceStage(phoneNumber, this.stages.ASK_NAME);
          stageAdvanced = true;
        }
        break;

      case this.stages.ASK_NAME:
        // Try to extract name from message
        const extractedName = this.extractName(message);
        if (extractedName) {
          await redisService.updateUser(phoneNumber, { name: extractedName });
          response = getNameAcknowledgment(extractedName);
          await this.advanceStage(phoneNumber, this.stages.ASK_REASON);
          stageAdvanced = true;
        }
        break;

      case this.stages.ASK_REASON:
        // After 5-7 messages, ask what brings them here
        if (user.stats.messageCount >= 5) {
          response = getOnboardingPrompt(2);
          await this.advanceStage(phoneNumber, this.stages.ASK_CHECKIN);
          stageAdvanced = true;
        }
        break;

      case this.stages.ASK_CHECKIN:
        // After 10+ messages, ask about check-in preference
        if (user.stats.messageCount >= 10) {
          response = getOnboardingPrompt(3);
          await this.advanceStage(phoneNumber, this.stages.COMPLETE);
          stageAdvanced = true;
        }
        break;

      case this.stages.COMPLETE:
        // Onboarding complete
        break;
    }

    // Handle check-in preference response
    if (stage === this.stages.ASK_CHECKIN && this.isCheckInResponse(message)) {
      const wantsCheckIn = this.parseCheckInPreference(message);
      if (wantsCheckIn) {
        await this.setupCheckIns(phoneNumber);
        response = "Great! I'll send you a gentle check-in from time to time. You can always tell me to stop if it gets annoying 😊";
      } else {
        response = "No problem! I'll be here whenever you need me.";
      }
      await this.advanceStage(phoneNumber, this.stages.COMPLETE);
      stageAdvanced = true;
    }

    return {
      response,
      stageAdvanced,
      currentStage: stageAdvanced ? await this.getCurrentStage(phoneNumber) : stage
    };
  }

  /**
   * Extract name from message
   */
  extractName(message) {
    if (!message) return null;
    
    const trimmed = message.trim();
    
    // Direct name patterns
    const patterns = [
      /^(?:i'?m|my name is|call me|it'?s)\s+(\w+)/i,
      /^(\w+)(?:\s*!|\s*\.|\s*$)/i
    ];

    for (const pattern of patterns) {
      const match = trimmed.match(pattern);
      if (match && match[1]) {
        const name = match[1];
        // Validate it's a reasonable name (not too short, not a common word)
        if (name.length >= 2 && !this.isCommonWord(name)) {
          return this.capitalizeName(name);
        }
      }
    }

    // If message is short (1-2 words) and looks like a name
    const words = trimmed.split(/\s+/);
    if (words.length <= 2 && words[0].length >= 2) {
      const potentialName = words[0].replace(/[^\w]/g, '');
      if (!this.isCommonWord(potentialName)) {
        return this.capitalizeName(potentialName);
      }
    }

    return null;
  }

  /**
   * Check if word is a common non-name word
   */
  isCommonWord(word) {
    const commonWords = [
      'yes', 'no', 'hi', 'hey', 'hello', 'thanks', 'thank', 'ok', 'okay',
      'sure', 'yeah', 'yep', 'nope', 'the', 'and', 'but', 'what', 'why'
    ];
    return commonWords.includes(word.toLowerCase());
  }

  /**
   * Capitalize name properly
   */
  capitalizeName(name) {
    return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
  }

  /**
   * Check if message is responding to check-in question
   */
  isCheckInResponse(message) {
    if (!message) return false;
    const lower = message.toLowerCase();
    return lower.includes('yes') || lower.includes('no') || 
           lower.includes('sure') || lower.includes('okay') ||
           lower.includes("don't") || lower.includes('please');
  }

  /**
   * Parse check-in preference from response
   */
  parseCheckInPreference(message) {
    if (!message) return false;
    const lower = message.toLowerCase();
    
    const positiveWords = ['yes', 'sure', 'okay', 'ok', 'yeah', 'yep', 'please', 'would love', 'sounds good'];
    const negativeWords = ['no', 'nope', "don't", 'not really', 'pass'];
    
    for (const word of positiveWords) {
      if (lower.includes(word)) return true;
    }
    for (const word of negativeWords) {
      if (lower.includes(word)) return false;
    }
    
    return true; // Default to yes if unclear
  }

  /**
   * Setup check-in schedule for user
   */
  async setupCheckIns(phoneNumber) {
    try {
      const now = Date.now();
      const tomorrow9am = this.getNext9AM();
      
      await redisService.setSchedule(phoneNumber, {
        nextCheckIn: tomorrow9am,
        nextJournalPrompt: this.getNext8PM(),
        followUps: []
      });

      logger.info('Check-ins setup', { phoneNumber: phoneNumber.slice(-4) });
    } catch (error) {
      logger.warn('Failed to setup check-ins', { error: error.message });
    }
  }

  /**
   * Get timestamp for next 9 AM
   */
  getNext9AM() {
    const now = new Date();
    const next = new Date(now);
    next.setHours(9, 0, 0, 0);
    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }
    return next.getTime();
  }

  /**
   * Get timestamp for next 8 PM
   */
  getNext8PM() {
    const now = new Date();
    const next = new Date(now);
    next.setHours(20, 0, 0, 0);
    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }
    return next.getTime();
  }

  /**
   * Advance user to next onboarding stage
   */
  async advanceStage(phoneNumber, newStage) {
    await redisService.updateUser(phoneNumber, { onboardingStage: newStage });
    logger.info('Onboarding stage advanced', {
      phoneNumber: phoneNumber.slice(-4),
      newStage
    });
  }

  /**
   * Get current onboarding stage
   */
  async getCurrentStage(phoneNumber) {
    const user = await redisService.getUser(phoneNumber);
    return user?.onboardingStage || 0;
  }

  /**
   * Check if onboarding is complete
   */
  async isOnboardingComplete(phoneNumber) {
    const stage = await this.getCurrentStage(phoneNumber);
    return stage >= this.stages.COMPLETE;
  }
}

// Export singleton instance
module.exports = new OnboardingService();

