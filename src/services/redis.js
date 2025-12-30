const { createClient } = require('redis');
const logger = require('../utils/logger');

class RedisService {
  constructor() {
    this.client = null;
    this.isConnected = false;
  }

  async connect() {
    const redisUrl = process.env.REDIS_URL;
    
    if (!redisUrl) {
      throw new Error('REDIS_URL environment variable is required');
    }

    logger.info('Initializing Redis connection...', { url: redisUrl.replace(/\/\/.*@/, '//***@') });

    // Railway Redis uses rediss:// (TLS) protocol
    const config = {
      url: redisUrl
    };

    // Add TLS config if using secure connection
    if (redisUrl.startsWith('rediss://')) {
      config.socket = {
        tls: true,
        rejectUnauthorized: false // Railway's Redis certificate
      };
    }

    this.client = createClient(config);

    this.client.on('error', (err) => {
      logger.error('Redis Client Error', { error: err.message });
      this.isConnected = false;
    });

    this.client.on('connect', () => {
      logger.info('Redis connected successfully');
      this.isConnected = true;
    });

    this.client.on('reconnecting', () => {
      logger.info('Redis reconnecting...');
    });

    this.client.on('end', () => {
      logger.info('Redis connection closed');
      this.isConnected = false;
    });

    await this.client.connect();
    
    // Verify connection
    await this.client.ping();
    
    return this.client;
  }

  async disconnect() {
    if (this.client) {
      await this.client.quit();
      this.isConnected = false;
      logger.info('Redis disconnected');
    }
  }

  getClient() {
    if (!this.isConnected || !this.client) {
      throw new Error('Redis client not connected');
    }
    return this.client;
  }

  /**
   * Retry wrapper for all Redis operations
   */
  async withRetry(operation, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await operation();
      } catch (err) {
        logger.warn(`Redis operation failed (attempt ${i + 1}/${maxRetries})`, { error: err.message });
        if (i === maxRetries - 1) throw err;
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
      }
    }
  }

  // ==================== User Profile Operations ====================

  async getUser(phoneNumber) {
    return this.withRetry(async () => {
      const data = await this.client.get(`user:${phoneNumber}`);
      return data ? JSON.parse(data) : null;
    });
  }

  async setUser(phoneNumber, userData) {
    return this.withRetry(async () => {
      await this.client.set(`user:${phoneNumber}`, JSON.stringify(userData));
    });
  }

  async updateUser(phoneNumber, updates) {
    return this.withRetry(async () => {
      const existing = await this.getUser(phoneNumber);
      const updated = { ...existing, ...updates };
      await this.setUser(phoneNumber, updated);
      return updated;
    });
  }

  async createUser(phoneNumber) {
    const newUser = {
      phone: phoneNumber,
      name: null,
      onboardingStage: 0,
      preferences: {
        checkInTime: null,
        topics: [],
        frequency: 'daily'
      },
      emotionalState: {
        current: 'neutral',
        history: [],
        lastUpdated: Date.now()
      },
      stats: {
        joinedAt: Date.now(),
        lastActive: Date.now(),
        messageCount: 0,
        journalCount: 0,
        streakDays: 0
      }
    };
    
    await this.setUser(phoneNumber, newUser);
    return newUser;
  }

  async getOrCreateUser(phoneNumber) {
    let user = await this.getUser(phoneNumber);
    if (!user) {
      user = await this.createUser(phoneNumber);
    }
    return user;
  }

  // ==================== Conversation History Operations ====================

  async addMessage(phoneNumber, message) {
    return this.withRetry(async () => {
      const key = `conversations:${phoneNumber}`;
      const messageWithTimestamp = {
        ...message,
        timestamp: Date.now()
      };
      
      await this.client.rPush(key, JSON.stringify(messageWithTimestamp));
      
      // Keep only last N messages
      const maxMessages = 50;
      const length = await this.client.lLen(key);
      if (length > maxMessages) {
        await this.client.lTrim(key, length - maxMessages, -1);
      }
    });
  }

  async getConversationHistory(phoneNumber, limit = 20) {
    return this.withRetry(async () => {
      const key = `conversations:${phoneNumber}`;
      const messages = await this.client.lRange(key, -limit, -1);
      return messages.map(m => JSON.parse(m));
    });
  }

  async clearConversation(phoneNumber) {
    return this.withRetry(async () => {
      await this.client.del(`conversations:${phoneNumber}`);
    });
  }

  // ==================== Journal Operations ====================

  async addJournalEntry(phoneNumber, entry) {
    return this.withRetry(async () => {
      const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const key = `journal:${phoneNumber}:${date}`;
      
      const existing = await this.client.get(key);
      const journalData = existing ? JSON.parse(existing) : { entries: [], timestamp: Date.now() };
      
      journalData.entries.push({
        content: entry.content,
        prompted: entry.prompted || false,
        timestamp: Date.now()
      });
      
      await this.client.set(key, JSON.stringify(journalData));
      
      // Set expiry for 1 year
      await this.client.expire(key, 365 * 24 * 60 * 60);
    });
  }

  async getJournalEntries(phoneNumber, days = 7) {
    return this.withRetry(async () => {
      const entries = [];
      const now = new Date();
      
      for (let i = 0; i < days; i++) {
        const date = new Date(now - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const key = `journal:${phoneNumber}:${date}`;
        const data = await this.client.get(key);
        
        if (data) {
          const parsed = JSON.parse(data);
          entries.push({ date, ...parsed });
        }
      }
      
      return entries;
    });
  }

  // ==================== Scheduled Messages Operations ====================

  async getSchedule(phoneNumber) {
    return this.withRetry(async () => {
      const data = await this.client.get(`scheduled:${phoneNumber}`);
      return data ? JSON.parse(data) : null;
    });
  }

  async setSchedule(phoneNumber, scheduleData) {
    return this.withRetry(async () => {
      await this.client.set(`scheduled:${phoneNumber}`, JSON.stringify(scheduleData));
    });
  }

  async getAllScheduledUsers() {
    return this.withRetry(async () => {
      const keys = await this.client.keys('scheduled:*');
      return keys.map(key => key.replace('scheduled:', ''));
    });
  }

  async updateSchedule(phoneNumber, updates) {
    return this.withRetry(async () => {
      const existing = await this.getSchedule(phoneNumber) || {};
      const updated = { ...existing, ...updates };
      await this.setSchedule(phoneNumber, updated);
      return updated;
    });
  }

  async addFollowUp(phoneNumber, followUp) {
    return this.withRetry(async () => {
      const schedule = await this.getSchedule(phoneNumber) || { followUps: [] };
      if (!schedule.followUps) schedule.followUps = [];
      schedule.followUps.push(followUp);
      await this.setSchedule(phoneNumber, schedule);
    });
  }

  async removeProcessedFollowUps(phoneNumber) {
    return this.withRetry(async () => {
      const schedule = await this.getSchedule(phoneNumber);
      if (schedule && schedule.followUps) {
        const now = Date.now();
        schedule.followUps = schedule.followUps.filter(f => f.time > now);
        await this.setSchedule(phoneNumber, schedule);
      }
    });
  }

  // ==================== Crisis Log Operations ====================

  async logCrisis(phoneNumber, data) {
    return this.withRetry(async () => {
      const timestamp = Date.now();
      const key = `crisis:${phoneNumber}:${timestamp}`;
      
      await this.client.set(key, JSON.stringify({
        ...data,
        timestamp,
        handled: false
      }));
      
      // Expire after 90 days
      await this.client.expire(key, 90 * 24 * 60 * 60);
    });
  }

  async getCrisisLogs(phoneNumber, limit = 10) {
    return this.withRetry(async () => {
      const keys = await this.client.keys(`crisis:${phoneNumber}:*`);
      const sortedKeys = keys.sort().slice(-limit);
      
      const logs = [];
      for (const key of sortedKeys) {
        const data = await this.client.get(key);
        if (data) logs.push(JSON.parse(data));
      }
      
      return logs;
    });
  }

  // ==================== Leader Election Operations ====================

  async acquireLock(lockKey, lockValue, ttlSeconds) {
    return this.withRetry(async () => {
      const result = await this.client.set(lockKey, lockValue, {
        EX: ttlSeconds,
        NX: true
      });
      return result === 'OK';
    });
  }

  async releaseLock(lockKey, expectedValue) {
    return this.withRetry(async () => {
      const currentValue = await this.client.get(lockKey);
      if (currentValue === expectedValue) {
        await this.client.del(lockKey);
        return true;
      }
      return false;
    });
  }

  async extendLock(lockKey, ttlSeconds) {
    return this.withRetry(async () => {
      return await this.client.expire(lockKey, ttlSeconds);
    });
  }

  // ==================== Idempotency Operations ====================

  async checkIdempotency(messageId) {
    return this.withRetry(async () => {
      const key = `idempotency:${messageId}`;
      const exists = await this.client.get(key);
      return exists !== null;
    });
  }

  async setIdempotency(messageId, ttlSeconds = 300) {
    return this.withRetry(async () => {
      const key = `idempotency:${messageId}`;
      await this.client.set(key, '1', { EX: ttlSeconds });
    });
  }

  // ==================== Message Queue Operations ====================

  async enqueueMessage(phoneNumber, message) {
    return this.withRetry(async () => {
      const key = `queue:${phoneNumber}`;
      await this.client.rPush(key, JSON.stringify(message));
    });
  }

  async dequeueMessage(phoneNumber) {
    return this.withRetry(async () => {
      const key = `queue:${phoneNumber}`;
      const message = await this.client.lPop(key);
      return message ? JSON.parse(message) : null;
    });
  }

  async getQueueLength(phoneNumber) {
    return this.withRetry(async () => {
      const key = `queue:${phoneNumber}`;
      return await this.client.lLen(key);
    });
  }

  // ==================== Stats Operations ====================

  async incrementStat(key) {
    return this.withRetry(async () => {
      return await this.client.incr(`stats:${key}`);
    });
  }

  async getStat(key) {
    return this.withRetry(async () => {
      const value = await this.client.get(`stats:${key}`);
      return parseInt(value) || 0;
    });
  }

  // ==================== Data Deletion Operations ====================

  async deleteUserData(phoneNumber) {
    return this.withRetry(async () => {
      const patterns = [
        `user:${phoneNumber}`,
        `conversations:${phoneNumber}`,
        `scheduled:${phoneNumber}`,
        `queue:${phoneNumber}`
      ];
      
      for (const pattern of patterns) {
        await this.client.del(pattern);
      }
      
      // Delete journal entries
      const journalKeys = await this.client.keys(`journal:${phoneNumber}:*`);
      for (const key of journalKeys) {
        await this.client.del(key);
      }
      
      // Delete crisis logs
      const crisisKeys = await this.client.keys(`crisis:${phoneNumber}:*`);
      for (const key of crisisKeys) {
        await this.client.del(key);
      }
      
      logger.info('User data deleted', { phoneNumber: phoneNumber.slice(-4) });
    });
  }
}

// Export singleton instance
module.exports = new RedisService();

