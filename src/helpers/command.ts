import {
    ApplicationCommand,
    SlashCommandBuilder,
    SlashCommandSubcommandBuilder
} from 'discord.js';

import { deepNormalise, findDifferences } from './functions';
import { Command } from '../handlers/command';

// Define the structure of a mapping object for option types to their respective builder methods.
export interface OptionBuilderMapping {
    [optionType: string]: (builder: any, optionDetails: OptionObject) => void;
}

// Define the structure of an option object in a command.
export interface OptionObject {
    name: string;
    description: string;
    required?: boolean;
}


/**
 * Function to add an option to a subcommand builder.
 * @param method the method to add the option to
 * @param details the details of the option to add
 * @returns the subcommand builder with the added option
 */
function addOption(
    method: (callback: (option: any) => any) => SlashCommandSubcommandBuilder,
    details: OptionObject
): SlashCommandSubcommandBuilder {
    return method((option) =>
        option.setName(details.name)
            .setDescription(details.description)
            .setRequired(details.required || false)
    );
}

/**
 * Function to build an option for a subcommand.
 * As defined in the command object.
 * 
 * @param optionType the type of the option
 * @param optionDetails the details of the option
 * @param subCommandBuilder the subcommand builder to add the option to
 * @returns the subcommand builder with the added option
 */
function buildOption(optionType: string, optionDetails: any, subCommandBuilder: SlashCommandSubcommandBuilder) {
    const optionBuilderMapping: OptionBuilderMapping = {
        string: (builder, details) => addOption(builder.addStringOption.bind(builder), details),
        integer: (builder, details) => addOption(builder.addIntegerOption.bind(builder), details),
        boolean: (builder, details) => addOption(builder.addBooleanOption.bind(builder), details),
        user: (builder, details) => addOption(builder.addUserOption.bind(builder), details),
        channel: (builder, details) => addOption(builder.addChannelOption.bind(builder), details),
        role: (builder, details) => addOption(builder.addRoleOption.bind(builder), details),
        attachment: (builder, details) => addOption(builder.addAttachmentOption.bind(builder), details),
        number: (builder, details) => addOption(builder.addNumberOption.bind(builder), details),
        mentionable: (builder, details) => addOption(builder.addMentionableOption.bind(builder), details),
    };

    const builderFunction = optionBuilderMapping[optionType.toLowerCase()];
    if (!builderFunction) {
        console.warn(`[CommandLoader] Unknown option type "${optionType}". Skipping...`);
        return;
    }

    builderFunction(subCommandBuilder, optionDetails);
}

/**
 * Function to build a subcommand for a slash command.
 * @param commandDetails the details of the command
 * @returns the subcommand builder
 */
function buildSubcommand(commandDetails: Command): SlashCommandSubcommandBuilder {
    const subCommandBuilder = new SlashCommandSubcommandBuilder()
        .setName(commandDetails.name.toLowerCase())
        .setDescription(commandDetails.description);

    if (commandDetails.options && commandDetails.options.length > 0) {
        for (const commandOption of commandDetails.options) {
            if (typeof commandOption === 'object' && Object.keys(commandOption).length === 1) {
                const [optionType, optionDetails] = Object.entries(commandOption)[0];
                buildOption(optionType, optionDetails, subCommandBuilder);
            } else {
                console.warn(`[CommandLoader] Invalid command option structure: ${JSON.stringify(commandOption)}`);
            }
        }
    }

    return subCommandBuilder;
}

/**
 * Function to build a slash command for a category.
 * @param commands the commands in the category
 * @param categoryName the name of the category
 * @returns the slash command builder
 */
export function buildSlashCommand(commands: Command[], categoryName: string): SlashCommandBuilder {
    // Create the SlashCommandBuilder for the category
    const slashCommandBuilder = new SlashCommandBuilder()
        .setName(categoryName.toLowerCase())
        .setDescription(`${categoryName} commands`);

    // Iterate over the commands and add each as a subcommand
    for (const commandDetails of commands) {
        const subCommand = buildSubcommand(commandDetails);
        slashCommandBuilder.addSubcommand(subCommand);
    }

    return slashCommandBuilder;
}


/**
* Function to validate the structure of a command object.
* @param command the command to validate
* @returns whether the command structure is valid
*/
export function validateCommandStructure(command: Command): boolean {
    // Define validators for the command object's structure.
    const validators = [
        { condition: !command.name || typeof command.name !== 'string', message: 'Command is missing a valid name' },
        { condition: !command.description || typeof command.description !== 'string', message: 'Command is missing a valid description' },
        { condition: command.options && !Array.isArray(command.options), message: 'Command options must be an array' },
        { condition: typeof command.execute !== 'function', message: 'Command is missing a valid execute function' },
        { condition: command.textExtract && typeof command.textExtract !== 'function', message: 'Command textExtract must be a function' },
        { condition: command.slashExtract && typeof command.slashExtract !== 'function', message: 'Command slashExtract must be a function' },
        { condition: command.cooldown && (typeof command.cooldown !== 'number' || command.cooldown < 0), message: 'Command cooldown must be a positive number' },
        { condition: command.aliases && !Array.isArray(command.aliases), message: 'Command aliases must be an array' },
        { condition: command.aliases && command.aliases.some(alias => typeof alias !== 'string'), message: 'Command aliases must be strings' },
        { condition: command.botPermissions && !Array.isArray(command.botPermissions), message: 'BotPermissions must be an array' },
        { condition: command.memberPermissions && !Array.isArray(command.memberPermissions), message: 'MemberPermissions must be an array' },
        { condition: !command.category || typeof command.category !== 'string', message: 'Command is missing a valid category' },
    ];

    // Ensure all validators conditions are met. If not, log the error and return false.
    for (const { condition, message } of validators) {
        if (condition) {
            console.error(`[CommandLoader] ${message}: ${JSON.stringify(command)}`);
            return false;
        }
    }

    // Validate options if they exist, 
    // delve deeper into the options array to validate each option.
    if (command.options) {
        for (const optionStruct of command.options) {
            const option = optionStruct[Object.keys(optionStruct)[0]];
            if (!option.name || !option.description) {
                console.error(`[CommandLoader] Option is missing required fields: ${JSON.stringify(option)}`);
                return false;
            }
        }
    }

    return true;
}

/**
 * Function to check if a slash command has changed 
 * and find those changes if they exist.
 * 
 * @param newCommand the [potentially] new slash command
 * @param existingCommand the existing slash command
 * @returns what changed or null if no changes
 */
export function findSlashChanges(newCommand: SlashCommandBuilder, existingCommand: ApplicationCommand): object | null {
    const normalisedNew = deepNormalise(newCommand);
    // Normalise using newCommand keys to ensure all keys are present [and identical] in the existing command
    const normalisedExisting = deepNormalise(existingCommand, Object.keys(normalisedNew));
    const differences = findDifferences(normalisedNew, normalisedExisting);

    return differences;
}