const Anthropic = require('@anthropic-ai/sdk');
const logger = require('../utils/logger');
const config = require('../config');
const redisService = require('./redis');
const { getSystemPrompt } = require('../prompts/systemPrompt');
const { getFallbackResponse } = require('../utils/errorHandler');
const { truncate } = require('../utils/helpers');

class ConversationEngine {
  constructor() {
    this.client = null;
    this.initializeClient();
  }

  initializeClient() {
    if (config.claudeApiKey) {
      this.client = new Anthropic({
        apiKey: config.claudeApiKey
      });
    } else {
      logger.warn('Claude API key not configured');
    }
  }

  /**
   * Generate a response to a user message
   */
  async generateResponse(phoneNumber, userMessage, options = {}) {
    if (!this.client) {
      logger.error('Claude client not initialized');
      return getFallbackResponse();
    }

    const startTime = Date.now();

    try {
      // Get user context
      const user = await redisService.getOrCreateUser(phoneNumber);
      const conversationHistory = await redisService.getConversationHistory(
        phoneNumber, 
        config.maxConversationHistory
      );

      // Build context for system prompt
      const promptContext = {
        name: user.name,
        emotionalState: user.emotionalState?.current,
        recentSummary: this.summarizeRecentConversation(conversationHistory),
        time: Date.now(),
        onboardingStage: user.onboardingStage
      };

      // Build messages array for Claude
      const messages = this.buildMessages(conversationHistory, userMessage);

      // Generate response
      const response = await this.client.messages.create({
        model: config.claudeModel,
        max_tokens: config.claudeMaxTokens,
        system: getSystemPrompt(promptContext),
        messages: messages
      });

      const assistantMessage = response.content[0]?.text || getFallbackResponse();

      // Log timing
      const duration = Date.now() - startTime;
      logger.info('Claude response generated', {
        phoneNumber: phoneNumber.slice(-4),
        durationMs: duration,
        inputTokens: response.usage?.input_tokens,
        outputTokens: response.usage?.output_tokens
      });

      // Store messages in history
      await redisService.addMessage(phoneNumber, {
        role: 'user',
        content: userMessage
      });
      await redisService.addMessage(phoneNumber, {
        role: 'assistant',
        content: assistantMessage
      });

      // Update user stats
      await this.updateUserStats(phoneNumber, userMessage);

      return assistantMessage;

    } catch (error) {
      logger.logError('ConversationEngine.generateResponse', error, {
        phoneNumber: phoneNumber.slice(-4)
      });

      // Handle specific error types
      if (error.status === 429) {
        return "I'm getting a lot of messages right now. Give me a moment and try again?";
      }
      if (error.status === 500 || error.status === 503) {
        return getFallbackResponse();
      }

      return getFallbackResponse();
    }
  }

  /**
   * Generate a proactive message (check-in, follow-up, etc.)
   */
  async generateProactiveMessage(phoneNumber, triggerType, context = {}) {
    if (!this.client) {
      return null;
    }

    try {
      const user = await redisService.getUser(phoneNumber);
      if (!user) return null;

      const conversationHistory = await redisService.getConversationHistory(phoneNumber, 10);
      const lastConversation = this.summarizeRecentConversation(conversationHistory);
      const daysSinceLastMessage = this.getDaysSinceLastMessage(user);

      const prompt = this.getProactivePrompt(triggerType, {
        name: user.name,
        lastConversation,
        daysSinceLastMessage,
        emotionalState: user.emotionalState?.current,
        ...context
      });

      const response = await this.client.messages.create({
        model: config.claudeModel,
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }]
      });

      return response.content[0]?.text;

    } catch (error) {
      logger.logError('ConversationEngine.generateProactiveMessage', error);
      return null;
    }
  }

  /**
   * Detect emotional state from a message
   */
  async detectEmotionalState(message) {
    if (!this.client) {
      return 'neutral';
    }

    try {
      const response = await this.client.messages.create({
        model: config.claudeModel,
        max_tokens: 50,
        messages: [{
          role: 'user',
          content: `Classify the emotional state of this message in one word (happy, sad, anxious, angry, neutral, hopeful, stressed, grateful, lonely, excited): "${truncate(message, 500)}"`
        }]
      });

      const emotion = response.content[0]?.text?.toLowerCase().trim() || 'neutral';
      // Validate it's a single word
      return emotion.split(/\s+/)[0] || 'neutral';

    } catch (error) {
      logger.logError('ConversationEngine.detectEmotionalState', error);
      return 'neutral';
    }
  }

  /**
   * Build messages array for Claude from conversation history
   */
  buildMessages(history, currentMessage) {
    const messages = [];

    // Add conversation history
    for (const msg of history) {
      messages.push({
        role: msg.role,
        content: msg.content
      });
    }

    // Add current message
    messages.push({
      role: 'user',
      content: currentMessage
    });

    // Ensure messages start with user role (Claude requirement)
    if (messages.length > 0 && messages[0].role !== 'user') {
      messages.shift();
    }

    // Ensure alternating roles (Claude requirement)
    const cleaned = [];
    let lastRole = null;
    for (const msg of messages) {
      if (msg.role !== lastRole) {
        cleaned.push(msg);
        lastRole = msg.role;
      }
    }

    return cleaned;
  }

  /**
   * Summarize recent conversation for context
   */
  summarizeRecentConversation(history) {
    if (!history || history.length === 0) {
      return null;
    }

    // Get last 3 exchanges for summary
    const recent = history.slice(-6);
    const summary = recent
      .map(msg => `${msg.role}: ${truncate(msg.content, 100)}`)
      .join('\n');

    return summary;
  }

  /**
   * Get prompt for proactive message generation
   */
  getProactivePrompt(triggerType, context) {
    const { name, lastConversation, daysSinceLastMessage, emotionalState } = context;
    
    let prompt = `Generate a brief, natural check-in message (2-3 sentences max) for a friend. Make it feel spontaneous, not automated.

Context:
- Their name: ${name || 'not known yet'}
- Days since last message: ${daysSinceLastMessage || 0}
- Their recent emotional state: ${emotionalState || 'unknown'}
- Reason for reaching out: ${triggerType}`;

    if (lastConversation) {
      prompt += `\n- Last conversation summary: ${lastConversation}`;
    }

    switch (triggerType) {
      case 'morning':
        prompt += '\n\nThis is a morning check-in. Be warm and encouraging for the day ahead.';
        break;
      case 'evening':
        prompt += '\n\nThis is an evening reflection. Ask about their day or encourage wind-down.';
        break;
      case 'inactivity':
        prompt += '\n\nThey haven\'t messaged in a while. Be gentle and non-demanding.';
        break;
      case 'follow-up':
        prompt += '\n\nFollowing up on something they shared. Show you remembered and care.';
        break;
      case 'distress-follow-up':
        prompt += '\n\nThey seemed distressed earlier. Check in warmly without being heavy.';
        break;
      default:
        prompt += '\n\nGeneral friendly check-in.';
    }

    prompt += '\n\nRespond with ONLY the message text, nothing else.';

    return prompt;
  }

  /**
   * Calculate days since last user message
   */
  getDaysSinceLastMessage(user) {
    if (!user?.stats?.lastActive) return 0;
    const diff = Date.now() - user.stats.lastActive;
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  }

  /**
   * Update user stats after receiving a message
   */
  async updateUserStats(phoneNumber, message) {
    try {
      const user = await redisService.getUser(phoneNumber);
      if (!user) return;

      // Detect emotional state (don't await - do in background)
      this.detectEmotionalState(message).then(async (emotion) => {
        const emotionalHistory = user.emotionalState?.history || [];
        emotionalHistory.push({
          emotion,
          timestamp: Date.now()
        });

        // Keep only last 20 emotional states
        if (emotionalHistory.length > 20) {
          emotionalHistory.shift();
        }

        await redisService.updateUser(phoneNumber, {
          emotionalState: {
            current: emotion,
            history: emotionalHistory,
            lastUpdated: Date.now()
          },
          stats: {
            ...user.stats,
            lastActive: Date.now(),
            messageCount: (user.stats.messageCount || 0) + 1
          }
        });
      }).catch(err => {
        logger.warn('Failed to update emotional state', { error: err.message });
      });

    } catch (error) {
      logger.warn('Failed to update user stats', { error: error.message });
    }
  }

  /**
   * Check if client is configured
   */
  isConfigured() {
    return Boolean(this.client);
  }
}

// Export singleton instance
module.exports = new ConversationEngine();

