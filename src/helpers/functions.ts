import { CustomClient } from '../index'
import { getConfig } from '../config';
import { EmbedBuilder } from 'discord.js';
/**
 * Synchronous function to handle errors
 * logging globally throughout the bot
 * 
 * @param client the client to log the error through
 * @param error the error to log
 */
export function logError(client: CustomClient, error: String | Error): void {
    const config = getConfig();

    // Make sure the error becomes a string.
    if (error instanceof Error) {
        error = error.stack || error.message;
    }
    try {
        // Employ a size restriction to prevent too large of messages
        const SIZE_RESTRICTION = 1990;
        const splitMessages = new Array(error.length / SIZE_RESTRICTION);
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

/**
 * A function to generate a default 
 * error embed for the bot
 * 
 * @param message the message to display
 * @param prefix the prefix of the bot
 * @returns an embed with the error message
 */
export function errorEmbed(message: string, prefix: string): EmbedBuilder {
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

/**
 * A function to apply the default embed structure to an embed
 * This includes the colour, footer, and timestamp
 * 
 * @param embed the embed to apply the structure to
 * @param prefix the prefix of the bot
 * @returns the embed with this structure applied
 */
export function applyEmbedStructure(embed: EmbedBuilder, prefix: string): EmbedBuilder {
    const config = getConfig();
    const options = config.embedStructure;

    // Apply the colour, footer, and timestamp to the embed
    const newEmbed = embed.setColor(options.colour)
        .setFooter({ text: `Prefix ${prefix}`, iconURL: options.footerIcon })
        .setTimestamp();
    return newEmbed
}

/**
 * Function to escape a string for use in a regex
 * @param text the text to escape
 * @returns the escaped text
 */
export function escapeString(text: string) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, `\\$&`);
}

/**
 * Function to normalise an object, removing empty arrays and circular references
 * It also allows for only certain keys to be kept and removes empty arrays
 * 
 * @param object the object to normalise
 * @param keysToKeep the keys to keep in the object [optional]
 * @param seen a set to keep track of seen objects [optional]
 * @returns the normalised object
 */
export function deepNormalise(object: any, keysToKeep?: string[], seen = new WeakSet()): any {
    if (object === null || object === undefined) return null;

    if (typeof object === "object") {
        // Handle circular references to avoid infinite loops
        if (seen.has(object)) return null;
        seen.add(object);

        if (Array.isArray(object)) {
            // Normalise array elements and remove empty arrays
            const normalisedArray = object.map(item => deepNormalise(item, keysToKeep, seen)).filter(Boolean);

            // Treat empty arrays as null/undefined
            return normalisedArray.length > 0 ? normalisedArray : null;
        }

        // For objects, normalise only relevant keys
        const plainObject = object.toJSON ? object.toJSON() : { ...object };
        return Object.entries(plainObject).reduce((acc, [key, value]) => {
            if (!keysToKeep || keysToKeep.includes(key)) {
                const normalisedValue = deepNormalise(value, keysToKeep, seen);
                if (normalisedValue !== null) {
                    acc[key] = normalisedValue;
                }
            }
            return acc;
        }, {} as any);
    }

    // Return primitives as-is
    return object;
}

/**
 * Function to find differences between two objects.
 * Returns a new object containing only the parts of `newObject` that are different from `existingObject`.
 *
 * @param newObject The new object to compare.
 * @param existingObject The existing object to compare.
 * @returns An object representing the differences, or null if no differences are found.
 */
export function findDifferences(newObject: any, existingObject: any): any {
    if (typeof newObject !== "object" || newObject === null) {
        // Primitive comparison
        return newObject !== existingObject ? newObject : null;
    }

    if (Array.isArray(newObject)) {
        if (!Array.isArray(existingObject) || newObject.length !== existingObject.length) {
            // If arrays are entirely different, return the new array
            return newObject;
        }
        // Compare array elements
        const differences = newObject.map((item, index) =>
            findDifferences(item, existingObject[index])
        );
        // Return only the changed parts of the array
        return differences.some(diff => diff !== null) ? differences : null;
    }

    // Object comparison
    const diffObject: Record<string, any> = {};
    for (const key of Object.keys(newObject)) {
        const diff = findDifferences(newObject[key], existingObject?.[key]);
        if (diff !== null) {
            diffObject[key] = diff;
        }
    }

    // If no differences found in the object, return null
    return Object.keys(diffObject).length > 0 ? diffObject : null;
}