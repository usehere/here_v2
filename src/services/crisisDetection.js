const Anthropic = require('@anthropic-ai/sdk');
const logger = require('../utils/logger');
const config = require('../config');
const redisService = require('./redis');
const { getCrisisAssessmentPrompt, getCrisisResponse, containsCrisisKeyword } = require('../prompts/crisisPrompt');
const { safeJsonParse, truncate } = require('../utils/helpers');

class CrisisDetectionService {
  constructor() {
    this.client = null;
    this.initializeClient();
  }

  initializeClient() {
    if (config.claudeApiKey) {
      this.client = new Anthropic({
        apiKey: config.claudeApiKey
      });
    }
  }

  /**
   * Two-layer crisis detection
   * Layer 1: Keyword matching (immediate)
   * Layer 2: LLM risk assessment (deeper analysis)
   */
  async detectCrisis(phoneNumber, message, conversationHistory = []) {
    const result = {
      isCrisis: false,
      riskLevel: 'low',
      keywordMatch: false,
      crisisResponse: null,
      shouldFollowUp: false,
      followUpHours: null
    };

    // Layer 1: Keyword Detection (immediate)
    if (containsCrisisKeyword(message)) {
      result.keywordMatch = true;
      result.isCrisis = true;
      result.riskLevel = 'high'; // Default to high for keyword match
      
      logger.logCrisis(phoneNumber, 'high', {
        layer: 'keyword',
        matched: true
      });
    }

    // Layer 2: LLM Risk Assessment
    try {
      const llmAssessment = await this.assessWithLLM(message, conversationHistory);
      
      if (llmAssessment) {
        // Use LLM assessment if it's higher risk than keyword detection
        const riskOrder = { low: 0, medium: 1, high: 2, critical: 3 };
        const currentRisk = riskOrder[result.riskLevel] || 0;
        const llmRisk = riskOrder[llmAssessment.level] || 0;
        
        if (llmRisk > currentRisk) {
          result.riskLevel = llmAssessment.level;
        }
        
        result.isCrisis = result.riskLevel !== 'low';
        result.shouldFollowUp = llmAssessment.follow_up_hours !== null;
        result.followUpHours = llmAssessment.follow_up_hours;
        
        if (result.isCrisis) {
          logger.logCrisis(phoneNumber, result.riskLevel, {
            layer: 'llm',
            reasoning: llmAssessment.reasoning
          });
        }
      }
    } catch (error) {
      // If LLM assessment fails, use keyword detection result
      logger.warn('LLM crisis assessment failed, using keyword result', {
        error: error.message
      });
    }

    // Generate crisis response if needed
    if (result.isCrisis) {
      result.crisisResponse = getCrisisResponse(result.riskLevel);
      
      // Log crisis event
      await this.logCrisisEvent(phoneNumber, message, result);
      
      // Schedule follow-up if recommended
      if (result.shouldFollowUp && result.followUpHours) {
        await this.scheduleFollowUp(phoneNumber, result.followUpHours, result.riskLevel);
      }
    }

    return result;
  }

  /**
   * LLM-based risk assessment
   */
  async assessWithLLM(message, conversationHistory) {
    if (!this.client) {
      return null;
    }

    try {
      // Build context from recent conversation
      const recentContext = conversationHistory
        .slice(-6)
        .map(msg => `${msg.role}: ${truncate(msg.content, 100)}`)
        .join('\n');

      const prompt = getCrisisAssessmentPrompt(message, recentContext);

      const response = await this.client.messages.create({
        model: config.claudeModel,
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }]
      });

      const responseText = response.content[0]?.text;
      
      // Parse JSON response
      const assessment = safeJsonParse(responseText);
      
      if (assessment && assessment.level) {
        return assessment;
      }

      return null;

    } catch (error) {
      logger.logError('CrisisDetection.assessWithLLM', error);
      return null;
    }
  }

  /**
   * Log crisis event to Redis
   */
  async logCrisisEvent(phoneNumber, message, result) {
    try {
      await redisService.logCrisis(phoneNumber, {
        message: truncate(message, 500),
        riskLevel: result.riskLevel,
        keywordMatch: result.keywordMatch,
        timestamp: Date.now()
      });
    } catch (error) {
      logger.warn('Failed to log crisis event', { error: error.message });
    }
  }

  /**
   * Schedule a follow-up check-in after crisis detection
   */
  async scheduleFollowUp(phoneNumber, hours, riskLevel) {
    try {
      const followUpTime = Date.now() + (hours * 60 * 60 * 1000);
      
      await redisService.addFollowUp(phoneNumber, {
        type: 'distress-follow-up',
        time: followUpTime,
        context: {
          riskLevel,
          scheduledAt: Date.now()
        }
      });

      logger.info('Crisis follow-up scheduled', {
        phoneNumber: phoneNumber.slice(-4),
        hours,
        riskLevel
      });
    } catch (error) {
      logger.warn('Failed to schedule crisis follow-up', { error: error.message });
    }
  }

  /**
   * Get crisis history for a user
   */
  async getCrisisHistory(phoneNumber, limit = 10) {
    return await redisService.getCrisisLogs(phoneNumber, limit);
  }

  /**
   * Check if user has recent crisis events
   */
  async hasRecentCrisis(phoneNumber, hoursBack = 24) {
    try {
      const logs = await redisService.getCrisisLogs(phoneNumber, 5);
      const cutoff = Date.now() - (hoursBack * 60 * 60 * 1000);
      
      return logs.some(log => log.timestamp > cutoff);
    } catch (error) {
      return false;
    }
  }
}

// Export singleton instance
module.exports = new CrisisDetectionService();

