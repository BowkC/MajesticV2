import { CustomClient } from '../index'
import { getConfig } from '../config';
import { EmbedBuilder, resolveColor } from 'discord.js';

/**
 * Synchronous function to handle errors
 * logging globally throughout the bot
 * 
 * @param client the client to log the error through
 * @param error the error to log
 */
export function logError(client: CustomClient, error: String) {
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

export function errorEmbed(message: string, prefix: string) {
  const config = getConfig();
  const options = config.embedStructure;

  const errorEmbed = new EmbedBuilder()
    .setColor(options.errorColour)
    .setTitle('Uh oh! :x:')
    .setDescription(message)
    .setFooter({ text: `Prefix ${prefix}`, iconURL: options.footerIcon })
    .setTimestamp();
  return errorEmbed;
}

export function applyEmbedStructure(embed: EmbedBuilder, prefix: string) {
  const config = getConfig();
  const options = config.embedStructure;

  // Apply the colour, footer, and timestamp to the embed
  const newEmbed = embed.setColor(options.colour)
    .setFooter({ text: `Prefix ${prefix}`, iconURL: options.footerIcon })
    .setTimestamp();
  return newEmbed
}