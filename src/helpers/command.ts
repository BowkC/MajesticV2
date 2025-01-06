import {
    ApplicationCommand,
    SlashCommandBuilder,
    SlashCommandOptionsOnlyBuilder
} from 'discord.js';

import { deepNormalise, findDifferences } from './functions';
import { Command } from '../handlers/command';

// Define the structure of a mapping object for option types to their respective builder methods.
export interface OptionBuilderMapping {
    [optionType: string]: (commandBuilder: SlashCommandOptionsOnlyBuilder, optionDetails: OptionObject) => SlashCommandOptionsOnlyBuilder;
}

// Define the structure of an option object in a command.
interface OptionObject {
    name: string;
    description: string;
    required?: boolean;
}
/**
 * Utility function streamlining logic for 
 * adding an option to a command.
 * @param method 
 * @param details 
 * @returns 
 */
function addOption(
    method: (callback: (option: any) => any) => SlashCommandOptionsOnlyBuilder,
    details: OptionObject
): SlashCommandOptionsOnlyBuilder {
    return method((option) =>
        option.setName(details.name)
            .setDescription(details.description)
            .setRequired(details.required || false)
    );
}

/**
 * Simple utility function to build a slash command from a command definition.
 * @param commandDetails the command definition
 * @param categoryName the category name
 * @returns the complete slash command builder
 */
export function buildSlashCommand(commandDetails: Command, categoryName: string): SlashCommandBuilder {
    // Mapping of option types to their respective builder methods.
    // This mapping is used to streamline the process of adding options to a command.
    const optionBuilderMapping: OptionBuilderMapping = {
        string: (builder, details) => addOption(builder.addStringOption, details),
        integer: (builder, details) => addOption(builder.addIntegerOption, details),
        boolean: (builder, details) => addOption(builder.addBooleanOption, details),
        user: (builder, details) => addOption(builder.addUserOption, details),
        channel: (builder, details) => addOption(builder.addChannelOption, details),
        role: (builder, details) => addOption(builder.addRoleOption, details),
        attachment: (builder, details) => addOption(builder.addAttachmentOption, details),
        number: (builder, details) => addOption(builder.addNumberOption, details),
        mentionable: (builder, details) => addOption(builder.addMentionableOption, details),
    };

    const slashCommandBuilder = new SlashCommandBuilder()
        .setName(categoryName.toLowerCase())
        .setDescription(`${categoryName} commands`);

    // Add the individual command as a subcommand to the category
    slashCommandBuilder.addSubcommand((subcommandBuilder) => {
        subcommandBuilder.setName(commandDetails.name.toLowerCase())
            .setDescription(commandDetails.description);

        if (commandDetails.options && commandDetails.options.length > 0) {
            for (const commandOption of commandDetails.options) {
                const [optionType, optionDetails] = Object.entries(commandOption)[0];
                const optionBuilder = optionBuilderMapping[optionType.toLowerCase()];
                if (optionBuilder) {
                    optionBuilder(subcommandBuilder as unknown as SlashCommandOptionsOnlyBuilder, optionDetails);
                } else {
                    console.warn(`[CommandLoader] Unknown option type "${optionType}" in command "${commandDetails.name}".`);
                }
            }
        }

        return subcommandBuilder;
    });

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
        for (const option of command.options) {
            if (!option.name || !option.description || !option.type) {
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