import { Client } from 'discord.js';
import { getConfig } from '../config';

/**
 * Synchronous function to handle errors
 * logging globally throughout the bot
 * 
 * @param client the client to log the error through
 * @param error the error to log
 */
export function logError(client: Client, error: String) {
  const config = getConfig();

  try {
    // Employ a size restriction to prevent too large of messages
    const SIZE_RESTRICTION = 1990;
    let splitMessages = new Array(error.length / SIZE_RESTRICTION);
    splitMessages.forEach((message, index) => {
      splitMessages[index] = error.substring(index * SIZE_RESTRICTION, (index + 1) * SIZE_RESTRICTION);
    });

    // Log each part of the error message
    const channel = client.channels.cache.get(config.botErrorLogs);
    if (channel && channel.isSendable()) {
      splitMessages.forEach((message) => {
        channel.send(`\`\`\`\n${message}\n\`\`\``);
      })
    } else {
      throw new Error('Channel not found or not sendable');
    }
  } catch (e) {
    // Worst case scenario, log the error to the console
    console.error("Error logging error: ", e);
    console.error("Error being logged: ", error)
  }
}