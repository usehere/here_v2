require('dotenv').config();

const config = {
  // Server
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',

  // Redis
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',

  // Claude API
  claudeApiKey: process.env.CLAUDE_API_KEY,
  claudeModel: 'claude-sonnet-4-20250514',

  // LoopMessage
  loopMessageApiKey: process.env.LOOPMESSAGE_API_KEY,
  loopMessageWebhookSecret: process.env.LOOPMESSAGE_WEBHOOK_SECRET,
  loopMessageBaseUrl: 'https://server.loopmessage.com/api/v1',

  // Railway
  railwayPublicDomain: process.env.RAILWAY_PUBLIC_DOMAIN,
  railwayStaticUrl: process.env.RAILWAY_STATIC_URL,

  // App settings
  maxConversationHistory: 20,
  claudeMaxTokens: 1024,
  claudeTimeout: 30000,
  rateLimit: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 30
  },

  // Crisis resources by country
  crisisResources: {
    US: {
      suicide: '988 Suicide & Crisis Lifeline',
      crisis: 'Text HOME to 741741 (Crisis Text Line)',
      emergency: '911'
    },
    UK: {
      suicide: 'Samaritans: 116 123',
      crisis: 'Shout: Text SHOUT to 85258',
      emergency: '999'
    },
    CA: {
      suicide: 'Canada Suicide Prevention: 1-833-456-4566',
      crisis: 'Crisis Services Canada: 1-833-456-4566',
      emergency: '911'
    },
    AU: {
      suicide: 'Lifeline: 13 11 14',
      crisis: 'Beyond Blue: 1300 22 4636',
      emergency: '000'
    }
  },

  // Crisis keywords for immediate detection
  crisisKeywords: [
    'suicide',
    'kill myself',
    'end it all',
    'want to die',
    'hurt myself',
    'self harm',
    'self-harm',
    "can't go on",
    'end my life',
    'no reason to live',
    'better off dead',
    'kill me'
  ],

  // Onboarding stages
  onboardingStages: {
    INITIAL: 0,
    ASK_NAME: 1,
    ASK_REASON: 2,
    ASK_CHECKIN: 3,
    COMPLETE: 4
  },

  // Proactive messaging settings
  proactiveMessaging: {
    lockKey: 'proactive:leader:lock',
    lockTTL: 300, // 5 minutes
    checkInterval: '0 * * * *', // Every hour
    inactivityThresholds: {
      gentle: 2 * 24 * 60 * 60 * 1000, // 2 days
      reminder: 5 * 24 * 60 * 60 * 1000, // 5 days
      pause: 10 * 24 * 60 * 60 * 1000 // 10 days
    }
  },

  // Journaling settings
  journaling: {
    prefixes: ['journal:', 'j:'],
    defaultPromptTime: 20, // 8 PM in 24h format
    prompts: [
      "What's one thing you're grateful for today?",
      "How are you feeling right now, and why?",
      "What challenged you today, and how did you handle it?",
      "What's something you learned about yourself this week?",
      "What's one small win you had today?",
      "What's been on your mind lately?",
      "What made you smile today?",
      "What's something you're looking forward to?"
    ]
  }
};

// Validate required config
const requiredEnvVars = ['CLAUDE_API_KEY'];
const missingVars = requiredEnvVars.filter(v => !process.env[v]);

if (missingVars.length > 0 && config.nodeEnv === 'production') {
  console.error(`Missing required environment variables: ${missingVars.join(', ')}`);
  process.exit(1);
}

module.exports = config;

