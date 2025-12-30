/**
 * Standalone proactive messaging worker
 * Use this with Railway Scheduled Tasks as an alternative to in-process cron
 * 
 * In railway.json, add:
 * {
 *   "schedules": [
 *     {
 *       "name": "proactive-messages",
 *       "command": "node src/workers/proactive.js",
 *       "cron": "0 * * * *"
 *     }
 *   ]
 * }
 */

require('dotenv').config();
const redisService = require('../services/redis');
const conversationEngine = require('../services/conversationEngine');
const loopMessage = require('../services/loopMessage');
const journaling = require('../services/journaling');
const logger = require('../utils/logger');

async function processUserSchedule(phoneNumber, now) {
  const schedule = await redisService.getSchedule(phoneNumber);
  if (!schedule) return;

  let updated = false;

  // Morning check-in
  if (schedule.nextCheckIn && now >= schedule.nextCheckIn) {
    const message = await conversationEngine.generateProactiveMessage(phoneNumber, 'morning');
    if (message) {
      await loopMessage.sendMessage(phoneNumber, message);
      await redisService.addMessage(phoneNumber, {
        role: 'assistant',
        content: message,
        type: 'proactive'
      });
      logger.info('Morning check-in sent', { phoneNumber: phoneNumber.slice(-4) });
    }
    
    // Set next check-in for tomorrow 9 AM
    const next = new Date();
    next.setDate(next.getDate() + 1);
    next.setHours(9, 0, 0, 0);
    schedule.nextCheckIn = next.getTime();
    updated = true;
  }

  // Evening journal prompt
  if (schedule.nextJournalPrompt && now >= schedule.nextJournalPrompt) {
    const promptMessage = journaling.generateJournalPromptMessage();
    await loopMessage.sendMessage(phoneNumber, promptMessage);
    await redisService.addMessage(phoneNumber, {
      role: 'assistant',
      content: promptMessage,
      type: 'journal_prompt'
    });
    logger.info('Journal prompt sent', { phoneNumber: phoneNumber.slice(-4) });
    
    // Set next prompt for tomorrow 8 PM
    const next = new Date();
    next.setDate(next.getDate() + 1);
    next.setHours(20, 0, 0, 0);
    schedule.nextJournalPrompt = next.getTime();
    updated = true;
  }

  // Process follow-ups
  if (schedule.followUps && schedule.followUps.length > 0) {
    const processed = [];
    
    for (const followUp of schedule.followUps) {
      if (now >= followUp.time) {
        const message = await conversationEngine.generateProactiveMessage(
          phoneNumber, 
          followUp.type, 
          followUp.context
        );
        if (message) {
          await loopMessage.sendMessage(phoneNumber, message);
          await redisService.addMessage(phoneNumber, {
            role: 'assistant',
            content: message,
            type: 'proactive',
            triggerType: followUp.type
          });
        }
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

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('       Proactive Messaging Worker Started                   ');
  console.log('═══════════════════════════════════════════════════════════');
  
  try {
    // Connect to Redis
    await redisService.connect();
    logger.info('Connected to Redis');

    const now = Date.now();
    
    // Get all users with scheduled messages
    const scheduledUsers = await redisService.getAllScheduledUsers();
    logger.info(`Found ${scheduledUsers.length} users with schedules`);

    // Process each user
    for (const phoneNumber of scheduledUsers) {
      try {
        await processUserSchedule(phoneNumber, now);
      } catch (error) {
        logger.warn('Failed to process user', {
          phoneNumber: phoneNumber.slice(-4),
          error: error.message
        });
      }
    }

    logger.info('Proactive messaging worker completed');

  } catch (error) {
    logger.error('Worker failed', { error: error.message, stack: error.stack });
    process.exit(1);
  } finally {
    await redisService.disconnect();
  }

  console.log('═══════════════════════════════════════════════════════════');
  console.log('       Worker Completed Successfully                        ');
  console.log('═══════════════════════════════════════════════════════════');
  
  process.exit(0);
}

main();

