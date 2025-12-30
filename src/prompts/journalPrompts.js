const config = require('../config');

/**
 * Get a rotating journal prompt
 */
const getJournalPrompt = (dayOfWeek = null) => {
  const prompts = config.journaling.prompts;
  
  // Use day of week if provided, otherwise random
  const index = dayOfWeek !== null 
    ? dayOfWeek % prompts.length 
    : Math.floor(Math.random() * prompts.length);
  
  return prompts[index];
};

/**
 * Get a themed prompt based on context
 */
const getThemedJournalPrompt = (theme) => {
  const themedPrompts = {
    gratitude: [
      "What's one thing you're grateful for today?",
      "Who made you smile recently, and why?",
      "What's a small comfort you enjoyed today?"
    ],
    reflection: [
      "What's something you learned about yourself this week?",
      "What would you tell yourself from a week ago?",
      "What's a pattern you've noticed in your thoughts lately?"
    ],
    growth: [
      "What challenged you today, and how did you handle it?",
      "What's one thing you did today that took courage?",
      "What's something you're proud of, even if it's small?"
    ],
    feelings: [
      "How are you feeling right now, and why?",
      "What emotion has been most present for you today?",
      "What's been weighing on your mind lately?"
    ],
    future: [
      "What's something you're looking forward to?",
      "What's one small step you can take toward something you want?",
      "How do you want to feel tomorrow?"
    ]
  };
  
  const prompts = themedPrompts[theme] || themedPrompts.reflection;
  return prompts[Math.floor(Math.random() * prompts.length)];
};

/**
 * Get journal entry acknowledgment
 */
const getJournalAcknowledgment = () => {
  const acknowledgments = [
    "Thanks for sharing that with me 📝 I've saved it for you.",
    "Got it, I've noted that down. It's good to reflect like this.",
    "Journaling saved 💫 These moments of reflection really add up.",
    "I've saved your journal entry. Thanks for taking a moment to reflect.",
    "Nice, got it noted! Coming back to these later can be really valuable."
  ];
  return acknowledgments[Math.floor(Math.random() * acknowledgments.length)];
};

/**
 * Get journal prompt introduction
 */
const getJournalPromptIntro = () => {
  const intros = [
    "Quick reflection time! 📝",
    "Journal prompt for you:",
    "A moment to reflect:",
    "Something to think about:",
    "Time for a quick check-in:"
  ];
  return intros[Math.floor(Math.random() * intros.length)];
};

/**
 * Check if message is a journal entry
 */
const isJournalEntry = (message) => {
  if (!message) return false;
  const lowerMessage = message.toLowerCase().trim();
  return config.journaling.prefixes.some(prefix => lowerMessage.startsWith(prefix));
};

/**
 * Extract journal content from message
 */
const extractJournalContent = (message) => {
  if (!message) return message;
  let content = message.trim();
  
  for (const prefix of config.journaling.prefixes) {
    if (content.toLowerCase().startsWith(prefix)) {
      content = content.substring(prefix.length).trim();
      break;
    }
  }
  
  return content;
};

/**
 * Get weekly reflection prompt (for Sunday)
 */
const getWeeklyReflectionPrompt = () => {
  const prompts = [
    "It's Sunday - a good time to look back. What was the highlight of your week?",
    "Weekly check-in time! What's one thing you learned about yourself this week?",
    "End of the week reflection: What are you carrying into next week, and what can you let go?",
    "Sunday thoughts: What made this week different from the last?"
  ];
  return prompts[Math.floor(Math.random() * prompts.length)];
};

module.exports = {
  getJournalPrompt,
  getThemedJournalPrompt,
  getJournalAcknowledgment,
  getJournalPromptIntro,
  isJournalEntry,
  extractJournalContent,
  getWeeklyReflectionPrompt
};

