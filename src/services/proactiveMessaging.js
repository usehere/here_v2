const cron = require('node-cron');
const logger = require('../utils/logger');
const config = require('../config');
const redisService = require('./redis');
const conversationEngine = require('./conversationEngine');
const loopMessage = require('./loopMessage');
const journaling = require('./journaling');

class ProactiveMessaging {
  constructor() {
    this.lockKey = config.proactiveMessaging.lockKey;
    this.lockTTL = config.proactiveMessaging.lockTTL;
    this.isLeader = false;
    this.processId = String(process.pid);
    this.cronJob = null;
  }

  /**
   * Try to acquire leader lock
   */
  async acquireLeaderLock() {
    try {
      const lockAcquired = await redisService.acquireLock(
        this.lockKey, 
        this.processId, 
        this.lockTTL
      );
      
      this.isLeader = lockAcquired;
      
      if (this.isLeader) {
        logger.info(`Process ${this.processId} acquired proactive messaging leadership`);
      }
      
      return this.isLeader;
    } catch (err) {
      logger.warn('Failed to acquire leader lock', { error: err.message });
      return false;
    }
  }

  /**
   * Release leader lock
   */
  async releaseLeaderLock() {
    try {
      if (this.isLeader) {
        const released = await redisService.releaseLock(this.lockKey, this.processId);
        if (released) {
          logger.info(`Process ${this.processId} released proactive messaging leadership`);
        }
        this.isLeader = false;
      }
    } catch (err) {
      logger.warn('Failed to release leader lock', { error: err.message });
    }
  }

  /**
   * Check and send proactive messages
   */
  async checkAndSendProactiveMessages() {
    if (!this.isLeader) {
      logger.debug('Not leader, skipping proactive message check');
      return;
    }

    logger.info('Running proactive message check as leader');
    
    try {
      const now = Date.now();
      
      // Get all users with scheduled messages
      const scheduledUsers = await redisService.getAllScheduledUsers();
      
      for (const phoneNumber of scheduledUsers) {
        try {
          await this.processUserSchedule(phoneNumber, now);
        } catch (error) {
          logger.warn('Failed to process user schedule', {
            phoneNumber: phoneNumber.slice(-4),
            error: error.message
          });
        }
      }

      // Check for inactive users
      await this.checkInactiveUsers(now);
      
      // Extend leadership lock since we completed successfully
      await redisService.extendLock(this.lockKey, this.lockTTL);
      
    } catch (err) {
      logger.logError('ProactiveMessaging.checkAndSendProactiveMessages', err);
    }
  }

  /**
   * Process scheduled messages for a single user
   */
  async processUserSchedule(phoneNumber, now) {
    const schedule = await redisService.getSchedule(phoneNumber);
    if (!schedule) return;

    let updated = false;

    // Morning check-in
    if (schedule.nextCheckIn && now >= schedule.nextCheckIn) {
      await this.sendProactiveMessage(phoneNumber, 'morning');
      schedule.nextCheckIn = this.getNextCheckInTime();
      updated = true;
    }

    // Evening journal prompt
    if (schedule.nextJournalPrompt && now >= schedule.nextJournalPrompt) {
      await this.sendJournalPrompt(phoneNumber);
      schedule.nextJournalPrompt = this.getNextJournalPromptTime();
      updated = true;
    }

    // Process follow-ups
    if (schedule.followUps && schedule.followUps.length > 0) {
      const processed = [];
      
      for (const followUp of schedule.followUps) {
        if (now >= followUp.time) {
          await this.sendProactiveMessage(phoneNumber, followUp.type, followUp.context);
          processed.push(followUp);
        }
      }
      
      if (processed.length > 0) {
        schedule.followUps = schedule.followUps.filter(f => !processed.includes(f));
        updated = true;
      }
    }

    if (updated) {
      await redisService.setSchedule(phoneNumber, schedule);
    }
  }

  /**
   * Check for inactive users and send re-engagement messages
   */
  async checkInactiveUsers(now) {
    try {
      // This would need to scan all users - in production, use a separate index
      // For now, we'll rely on scheduled messages for individual users
      // A more scalable approach would use a sorted set with lastActive timestamps
      
    } catch (error) {
      logger.warn('Failed to check inactive users', { error: error.message });
    }
  }

  /**
   * Send a proactive message
   */
  async sendProactiveMessage(phoneNumber, triggerType, context = {}) {
    try {
      // Generate personalized message
      const message = await conversationEngine.generateProactiveMessage(
        phoneNumber, 
        triggerType, 
        context
      );

      if (!message) {
        logger.warn('Failed to generate proactive message', { 
          phoneNumber: phoneNumber.slice(-4), 
          triggerType 
        });
        return;
      }

      // Send via LoopMessage
      const result = await loopMessage.sendMessage(phoneNumber, message);
      
      if (result.success) {
        // Log as conversation
        await redisService.addMessage(phoneNumber, {
          role: 'assistant',
          content: message,
          type: 'proactive',
          triggerType
        });

        logger.info('Proactive message sent', {
          phoneNumber: phoneNumber.slice(-4),
          triggerType
        });
      }

    } catch (error) {
      logger.logError('ProactiveMessaging.sendProactiveMessage', error, {
        phoneNumber: phoneNumber.slice(-4),
        triggerType
      });
    }
  }

  /**
   * Send a journal prompt
   */
  async sendJournalPrompt(phoneNumber) {
    try {
      const promptMessage = journaling.generateJournalPromptMessage();
      
      const result = await loopMessage.sendMessage(phoneNumber, promptMessage);
      
      if (result.success) {
        await redisService.addMessage(phoneNumber, {
          role: 'assistant',
          content: promptMessage,
          type: 'journal_prompt'
        });

        logger.info('Journal prompt sent', {
          phoneNumber: phoneNumber.slice(-4)
        });
      }

    } catch (error) {
      logger.logError('ProactiveMessaging.sendJournalPrompt', error);
    }
  }

  /**
   * Get next morning check-in time (9 AM next day)
   */
  getNextCheckInTime() {
    const now = new Date();
    const next = new Date(now);
    next.setDate(next.getDate() + 1);
    next.setHours(9, 0, 0, 0);
    return next.getTime();
  }

  /**
   * Get next journal prompt time (8 PM next day)
   */
  getNextJournalPromptTime() {
    const now = new Date();
    const next = new Date(now);
    next.setDate(next.getDate() + 1);
    next.setHours(20, 0, 0, 0);
    return next.getTime();
  }

  /**
   * Schedule a follow-up for a specific user
   */
  async scheduleFollowUp(phoneNumber, hours, type, context = {}) {
    try {
      const followUpTime = Date.now() + (hours * 60 * 60 * 1000);
      
      await redisService.addFollowUp(phoneNumber, {
        type,
        time: followUpTime,
        context
      });

      logger.info('Follow-up scheduled', {
        phoneNumber: phoneNumber.slice(-4),
        hours,
        type
      });

    } catch (error) {
      logger.warn('Failed to schedule follow-up', { error: error.message });
    }
  }

  /**
   * Start the proactive messaging scheduler
   */
  startScheduler() {
    // Run every hour
    this.cronJob = cron.schedule(config.proactiveMessaging.checkInterval, async () => {
      logger.info('Proactive messaging cron triggered');
      
      // Try to become leader
      await this.acquireLeaderLock();
      
      // Run checks (only executes if leader)
      await this.checkAndSendProactiveMessages();
    });

    // Also run once on startup (after a delay to ensure Redis is ready)
    setTimeout(async () => {
      try {
        await this.acquireLeaderLock();
        await this.checkAndSendProactiveMessages();
      } catch (error) {
        logger.warn('Startup proactive check failed', { error: error.message });
      }
    }, 10000); // 10 second delay

    logger.info('Proactive messaging scheduler started');
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    if (this.cronJob) {
      this.cronJob.stop();
      logger.info('Proactive messaging cron stopped');
    }
    await this.releaseLeaderLock();
  }
}

// Export singleton instance
module.exports = new ProactiveMessaging();

