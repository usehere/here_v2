const config = require('../config');

/**
 * Get crisis assessment prompt for LLM
 */
const getCrisisAssessmentPrompt = (message, recentContext = '') => {
  return `You are evaluating a message for crisis risk level. Assess carefully and respond in JSON.

User message: "${message}"

${recentContext ? `Recent conversation context: ${recentContext}` : ''}

Evaluate the crisis risk level:
- "low": Normal conversation, no concerning content
- "medium": Some distress or concerning language, but not immediate crisis
- "high": Significant distress, mentions of self-harm, hopelessness, or crisis-adjacent content
- "critical": Explicit mention of suicide, immediate self-harm intent, or acute crisis

Respond ONLY with valid JSON in this exact format:
{
  "level": "low|medium|high|critical",
  "reasoning": "brief explanation",
  "recommend_resources": true|false,
  "follow_up_hours": null|number
}`;
};

/**
 * Get crisis response to include with regular message
 */
const getCrisisResponse = (riskLevel, countryCode = 'US') => {
  const resources = config.crisisResources[countryCode] || config.crisisResources.US;
  
  if (riskLevel === 'critical') {
    return `I hear you, and I'm really glad you're talking to me right now. What you're feeling matters, and so do you.

I want to make sure you have support beyond just me. Please reach out to someone who can help:

📞 ${resources.suicide}
💬 ${resources.crisis}

These are real people who care and can help right now. Are you safe at this moment?`;
  }
  
  if (riskLevel === 'high') {
    return `Thank you for trusting me with this. I'm here for you, and I want you to know that what you're going through is real and valid.

I also want to share some resources in case you need them:
📞 ${resources.suicide}
💬 ${resources.crisis}

You don't have to go through this alone. How are you feeling right now?`;
  }
  
  if (riskLevel === 'medium') {
    return `I hear that you're going through a really tough time. That takes a lot to share, and I'm glad you did.

If things ever feel too overwhelming, remember you can also reach out to ${resources.crisis} - they're there 24/7.

I'm here too. Tell me more about what's going on.`;
  }
  
  return null; // No crisis response needed for 'low'
};

/**
 * Crisis resource information by country
 */
const getCrisisResourcesText = (countryCode = 'US') => {
  const resources = config.crisisResources[countryCode] || config.crisisResources.US;
  
  return `If you're in crisis, please reach out to these resources:
📞 ${resources.suicide}
💬 ${resources.crisis}
🚨 Emergency: ${resources.emergency}

You matter, and help is available.`;
};

/**
 * Keywords that trigger immediate crisis detection
 */
const getCrisisKeywords = () => config.crisisKeywords;

/**
 * Check if message contains crisis keywords
 */
const containsCrisisKeyword = (message) => {
  if (!message) return false;
  const lowerMessage = message.toLowerCase();
  return config.crisisKeywords.some(keyword => lowerMessage.includes(keyword.toLowerCase()));
};

module.exports = {
  getCrisisAssessmentPrompt,
  getCrisisResponse,
  getCrisisResourcesText,
  getCrisisKeywords,
  containsCrisisKeyword
};

