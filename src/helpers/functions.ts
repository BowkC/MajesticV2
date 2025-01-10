import { CustomClient } from '../index'
import { getConfig } from '../config';
import {
    CommandInteraction,
    EmbedBuilder,
    Message,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    InteractionReplyOptions
} from 'discord.js';

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
        const arrayLength = Math.ceil(error.length / SIZE_RESTRICTION);

        const splitMessages = new Array(arrayLength);
        for (let i = 0; i < arrayLength; i++) {
            splitMessages[i] = error.substring(i * SIZE_RESTRICTION, (i + 1) * SIZE_RESTRICTION);
        }

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
export function applyEmbedStructure(embed: EmbedBuilder, prefix: string, setFooter: boolean = true): EmbedBuilder {
    const config = getConfig();
    const options = config.embedStructure;

    // Apply the colour, footer, and timestamp to the embed
    const newEmbed = embed.setColor(options.colour).setTimestamp();

    // Optionally set the footer
    if (setFooter) newEmbed.setFooter({ text: `Prefix ${prefix}`, iconURL: options.footerIcon });
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
export function deepNormalise(object: any, keysToKeep?: string[], seen = new WeakSet(), isTopLevel = true): any {
    if (object === null || object === undefined) return null;

    if (typeof object === "object") {
        // Handle circular references to avoid infinite loops
        if (seen.has(object)) return null;
        seen.add(object);

        if (Array.isArray(object)) {
            // Normalise array elements and remove empty arrays
            const normalisedArrayUnfiltered = object.map(item => deepNormalise(item, keysToKeep, seen, false));
            const normalisedArray = normalisedArrayUnfiltered.filter(value => value !== null && value !== undefined);

            // Treat empty arrays as null/undefined
            return normalisedArray.length > 0 ? normalisedArray : null;
        }

        // For objects, normalise keys
        const plainObject = object.toJSON ? object.toJSON() : { ...object };
        return Object.entries(plainObject).reduce((acc, [key, value]) => {
            // Apply keysToKeep filter only at the top level
            if (isTopLevel && keysToKeep && !keysToKeep.includes(key)) {
                return acc;
            }

            const normalisedValue = deepNormalise(value, keysToKeep, seen, false);
            // Explicitly check for null rather than falsy values
            if (normalisedValue !== null) {
                acc[key] = normalisedValue;
            }

            return acc;
        }, {} as any);
    }

    // Return primitives as-is, including booleans
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

/**
 * A asynchronous function to find a users profile, at all costs
 * Tries near-all existing pathways to get its hands on a 'User' profile. 
 * 
 * @param interaction the slash or message requesting the user
 * @param client the bot client
 * @param findString the string searching for the user
 * @param defaultToSender whether to default to the interaction initiator 
 * @returns the user if found, or undefined otherwise
 */
export async function findUser(
    interaction: Message | CommandInteraction,
    client: CustomClient,
    findString: string = '',
    defaultToSender: boolean = false): Promise<any> {
    findString = findString.toLowerCase();

    // Regular expressions for user identification
    const mentionRegex = /<[@|!]*([0-9]+)>/gm;
    const idRegex = /[0-9]+/;
    const capturedId = mentionRegex.exec(findString)?.[1];
    const givenId = idRegex.exec(findString)?.[0];

    // Helper function to search user in cache
    const findInCache = (predicate: (user: any) => boolean) =>
        client.users.cache.find(predicate) ||
        interaction.guild?.members.cache.find(member => predicate(member.user))?.user;

    // Attempt to fetch the user
    const user = (capturedId && await client.users.fetch(capturedId).catch(() => undefined))
        || findInCache(user => user.username.toLowerCase() === findString)
        || findInCache(user => user.tag.toLowerCase() === findString)
        || (givenId && findInCache(user => user.id === givenId))
        || (defaultToSender ? interactionUser(interaction) : undefined);

    return user;
}

/**
 * Simple function to get the user from an interaction
 * @param interaction the interaction to get the user from
 * @returns the user from the interaction
 */
export function interactionUser(interaction: Message | CommandInteraction): any {
    return interaction instanceof Message ? interaction.author : interaction.user;
}

/**
 * Function to generate a bot invite link
 * @param interaction the interaction to generate the invite for
 * @returns the invite link
 */
export function generateBotInvite(interaction: Message | CommandInteraction): string {
    // Define structural data required to build the invite link
    const permissionID = getConfig().invitePermissionsID;
    const botID = interactionUser(interaction).id;
    const start = "https://discord.com/oauth2/authorize?client_id=";
    const end = "&scope=bot%20applications.commands"
    const middle = "&permissions=";

    // Return the invite link
    return `${start}${botID}${middle}${permissionID}${end}`;
}

/**
 * Handles pagination for both CommandInteraction and Message interactions.
 * 
 * @param interaction - The interaction (CommandInteraction or Message).
 * @param userId - The ID of the user allowed to interact with the buttons.
 * @param embeds - An array of embeds for pagination.
 * @param emojis - Optional custom emojis for navigation buttons.
 */
export async function handlePagination(
    interaction: CommandInteraction | Message,
    userId: string,
    embeds: EmbedBuilder[],
    emojis?: [string, string, string, string]
): Promise<void> {
    if (!interaction || !userId || !embeds || embeds.length === 0) {
        console.error("Invalid arguments for handlePagination");
        return;
    }

    const defaultEmojis = ['⏮️', '⬅️', '➡️', '⏭️'];
    const [skipBack, back, next, skipNext] = emojis || defaultEmojis;

    const buttonsActive = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('backskip').setStyle(ButtonStyle.Primary).setEmoji(skipBack),
        new ButtonBuilder().setCustomId('back').setStyle(ButtonStyle.Primary).setEmoji(back),
        new ButtonBuilder().setCustomId('next').setStyle(ButtonStyle.Primary).setEmoji(next),
        new ButtonBuilder().setCustomId('nextskip').setStyle(ButtonStyle.Primary).setEmoji(skipNext),
    );

    const buttonsDisabled = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('backskip').setStyle(ButtonStyle.Secondary).setEmoji(skipBack).setDisabled(true),
        new ButtonBuilder().setCustomId('back').setStyle(ButtonStyle.Secondary).setEmoji(back).setDisabled(true),
        new ButtonBuilder().setCustomId('next').setStyle(ButtonStyle.Secondary).setEmoji(next).setDisabled(true),
        new ButtonBuilder().setCustomId('nextskip').setStyle(ButtonStyle.Secondary).setEmoji(skipNext).setDisabled(true),
    );

    let currentPage = 0;

    const updateEmbed = (page: number) => {
        embeds[page].setFooter({ text: `Page ${page + 1} of ${embeds.length}` });
        return embeds[page];
    };

    const sendOptions = {
        embeds: [updateEmbed(currentPage)],
        components: [buttonsActive],
    };

    const message = await interaction.reply({ ...sendOptions, allowedMentions: { repliedUser: false } });

    const collector = message.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 120000,
        filter: (i) => i.user.id === userId,
    });

    collector.on('collect', async (btnInteraction) => {
        await btnInteraction.deferUpdate();

        switch (btnInteraction.customId) {
            case 'back':
                currentPage = (currentPage > 0) ? currentPage - 1 : embeds.length - 1;
                break;
            case 'next':
                currentPage = (currentPage < embeds.length - 1) ? currentPage + 1 : 0;
                break;
            case 'backskip':
                currentPage = 0;
                break;
            case 'nextskip':
                currentPage = embeds.length - 1;
                break;
        }

        await message.edit({
            embeds: [updateEmbed(currentPage)],
            components: [buttonsActive],
        });
    });

    collector.on('end', () => {
        message.edit({
            embeds: [updateEmbed(currentPage)],
            components: [buttonsDisabled],
        }).catch(console.error);
    });
}

export function findCategory(category: string | null): any {
    if (category === null) return null;
    const config = getConfig();
    const categoryName = category.toLowerCase();

    // Attempt to find the category by name or alias
    const selectedCategory = config.categoryDefinitions.find(category =>
        category.name.toLowerCase() === categoryName ||
        (category.aliases && category.aliases.some(alias => alias.toLowerCase() === categoryName))
    );
    return selectedCategory;
}

export function findCommand(command: string | null, client: CustomClient): any {
    if (command === null) return null;
    const commandName = command.toLowerCase();

    // Attempt to find the command by name or alias
    const selectedCommand = client.commands.find(cmd =>
        cmd.name.toLowerCase() === commandName ||
        (cmd.aliases && cmd.aliases.some(alias => alias.toLowerCase() === commandName))
    );
    return selectedCommand;
}