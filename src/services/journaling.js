const logger = require('../utils/logger');
const redisService = require('./redis');
const { 
  isJournalEntry, 
  extractJournalContent, 
  getJournalAcknowledgment,
  getJournalPrompt,
  getJournalPromptIntro,
  getWeeklyReflectionPrompt
} = require('../prompts/journalPrompts');

class JournalingService {
  /**
   * Check if message is a journal entry
   */
  isJournalEntry(message) {
    return isJournalEntry(message);
  }

  /**
   * Process and save a journal entry
   */
  async saveJournalEntry(phoneNumber, message, prompted = false) {
    try {
      const content = extractJournalContent(message);
      
      await redisService.addJournalEntry(phoneNumber, {
        content,
        prompted
      });

      // Update user's journal count
      const user = await redisService.getUser(phoneNumber);
      if (user) {
        await redisService.updateUser(phoneNumber, {
          stats: {
            ...user.stats,
            journalCount: (user.stats.journalCount || 0) + 1
          }
        });
      }

      logger.info('Journal entry saved', {
        phoneNumber: phoneNumber.slice(-4),
        prompted,
        contentLength: content.length
      });

      return {
        success: true,
        acknowledgment: getJournalAcknowledgment()
      };

    } catch (error) {
      logger.logError('JournalingService.saveJournalEntry', error);
      return {
        success: false,
        acknowledgment: "I had trouble saving that, but I heard you. Want to try again?"
      };
    }
  }

  /**
   * Get a journal prompt for the user
   */
  getJournalPrompt(dayOfWeek = null) {
    // Sunday = special weekly reflection
    if (dayOfWeek === 0) {
      return getWeeklyReflectionPrompt();
    }
    return getJournalPrompt(dayOfWeek);
  }

  /**
   * Generate a journal prompt message
   */
  generateJournalPromptMessage() {
    const intro = getJournalPromptIntro();
    const prompt = this.getJournalPrompt(new Date().getDay());
    return `${intro}\n\n${prompt}`;
  }

  /**
   * Get user's journal entries for a period
   */
  async getJournalHistory(phoneNumber, days = 7) {
    try {
      return await redisService.getJournalEntries(phoneNumber, days);
    } catch (error) {
      logger.logError('JournalingService.getJournalHistory', error);
      return [];
    }
  }

  /**
   * Calculate journal streak
   */
  async calculateStreak(phoneNumber) {
    try {
      const entries = await this.getJournalHistory(phoneNumber, 30);
      
      if (entries.length === 0) return 0;

      let streak = 0;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      for (let i = 0; i < 30; i++) {
        const checkDate = new Date(today);
        checkDate.setDate(checkDate.getDate() - i);
        const dateStr = checkDate.toISOString().split('T')[0];

        const hasEntry = entries.some(e => e.date === dateStr);
        
        if (hasEntry) {
          streak++;
        } else if (i > 0) {
          // Allow missing today, but break on any other gap
          break;
        }
      }

      return streak;

    } catch (error) {
      logger.logError('JournalingService.calculateStreak', error);
      return 0;
    }
  }

  /**
   * Get journal insights for user
   */
  async getJournalInsights(phoneNumber) {
    try {
      const entries = await this.getJournalHistory(phoneNumber, 30);
      const streak = await this.calculateStreak(phoneNumber);
      
      return {
        totalEntries: entries.reduce((sum, e) => sum + e.entries.length, 0),
        daysWithEntries: entries.length,
        currentStreak: streak,
        lastEntry: entries[0]?.date || null
      };

    } catch (error) {
      logger.logError('JournalingService.getJournalInsights', error);
      return null;
    }
  }

  /**
   * Generate a response that encourages journaling
   */
  getJournalingEncouragement(streak) {
    if (streak === 0) {
      return "By the way, you can journal anytime by starting your message with 'j:' - I'll save it for you 📝";
    }
    if (streak >= 7) {
      return `Amazing - you've journaled for ${streak} days in a row! That's building a real habit 🌟`;
    }
    if (streak >= 3) {
      return `${streak} day journaling streak! You're building something good here 📝`;
    }
    return null;
  }
}

// Export singleton instance
module.exports = new JournalingService();

