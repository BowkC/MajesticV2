import {
    ApplicationCommand,
    Collection,
    CommandInteraction,
    Message,
    SlashCommandBuilder,
} from 'discord.js';

import { buildSlashCommand, findSlashChanges, validateCommandStructure } from '../helpers/command';
import { OptionBuilderMapping } from '../helpers/command';
import { promises as fsPromises } from 'fs';
import { CustomClient } from '../index';
import { getConfig } from '../config';
import path from 'path';

// Use the fsPromises object to access the async file system functions.
// More efficient than using the synchronous fs functions.
const { readdir, lstat } = fsPromises;

// The structure of a command object.
export interface Command {
    name: string;
    usage: string;
    description: string;
    cooldown?: number;
    aliases?: string[];
    options?: Array<{ [optionType: keyof OptionBuilderMapping]: { name: string; description: string; required?: boolean } }>;
    textExtract?: (messageInteraction: Message) => object;
    slashExtract?: (commandInteraction: CommandInteraction) => object;
    execute: (clientInstance: CustomClient, interactionObject: Message | CommandInteraction, commandPrefix: string, config?: object, optionData?: object) => void;
}

/**
 * Key logic to load all commands from the commands directory.
 * This function registers both text and slash commands.
 * @param clientInstance the client instance
 */
export default async function loadCommands(clientInstance: CustomClient) {
    try {
        const config = getConfig();
        const enableGlobalSlashCommands = config.slashGlobal || false;

        const commandsDirectoryPath = path.resolve(__dirname, '../commands');
        const slashCommandsMap: Map<string, SlashCommandBuilder> = new Map();

        clientInstance.commands = new Collection<string, Command>();
        clientInstance.aliases = new Collection<string, string>();

        const commandDirectories = await readdir(commandsDirectoryPath);

        const categoryProcessing = commandDirectories.map(async (commandDirectoryName) => {
            const commandDirectoryPath = `${commandsDirectoryPath}/${commandDirectoryName}`;

            if ((await lstat(commandDirectoryPath)).isDirectory()) {
                const categoryName = commandDirectoryName;
                const categoryCommands: Command[] = [];

                const commandFiles = (await readdir(commandDirectoryPath)).filter(
                    (fileName) => fileName.endsWith('.js') || fileName.endsWith('.ts')
                );

                const fileProcessing = commandFiles.map(async (commandFileName) => {
                    try {
                        const { default: commandDefinition } = await import(`${commandDirectoryPath}/${commandFileName}`);
                        if (!validateCommandStructure(commandDefinition)) {
                            console.warn(`[CommandLoader] Invalid command structure in file: ${commandFileName}`);
                            return;
                        }

                        clientInstance.commands.set(commandDefinition.name, commandDefinition);
                        if (commandDefinition.aliases) {
                            commandDefinition.aliases.forEach((aliasName: string) =>
                                clientInstance.aliases.set(aliasName.toLowerCase(), commandDefinition.name)
                            );
                        }

                        categoryCommands.push(commandDefinition);
                    } catch (error) {
                        console.error(`[CommandLoader] Error loading command from file "${commandFileName}": ${error}`);
                    }
                });

                await Promise.all(fileProcessing);

                if (categoryCommands.length > 0) {
                    for (const commandDefinition of categoryCommands) {
                        const slashCommand = buildSlashCommand(commandDefinition, categoryName);
                        slashCommandsMap.set(commandDefinition.name.toLowerCase(), slashCommand);
                    }
                }
            }
        });

        await Promise.all(categoryProcessing);

        // Register slash commands when client is ready [only if they need to be updated]
        // This boosts efficiency by only updating commands when necessary.
        clientInstance.on('ready', async () => {
            if (clientInstance.application) {
                try {
                    // Fetch current commands to compare with new commands
                    let currentCommands: Collection<string, ApplicationCommand> = new Collection();

                    // In the case of global, fetch from the application.
                    // In the case of server-specific, fetch from the support server (if available).
                    if (enableGlobalSlashCommands) {
                        currentCommands = await clientInstance.application.commands.fetch();
                    } else {
                        // Gracefully handle errors if the bot fails to fetch commands from a guild.
                        const guildPromises = clientInstance.guilds.cache.map(async (guildInstance) => {
                            return guildInstance.commands.fetch();
                        });
                        const guildCommands = await Promise.allSettled(guildPromises);
                        const fulfilledGuildCommands = guildCommands
                            .filter(result => result.status === 'fulfilled')
                            .map(result => (result as PromiseFulfilledResult<Collection<string, ApplicationCommand>>).value);

                        // Purely a synchronous operation, no need for async/await.
                        currentCommands = currentCommands.concat(...fulfilledGuildCommands);
                    }

                    // Determine which commands need to be updated
                    const commandsToUpdate: Array<[ApplicationCommand, SlashCommandBuilder, object]> = [];
                    const commandsToAdd: Array<SlashCommandBuilder> = [];

                    for (const [, slashCommand] of slashCommandsMap.entries()) {
                        const existingCommands = currentCommands.filter(command => command.name === slashCommand.name);

                        if (existingCommands.size === 0) {
                            commandsToAdd.push(slashCommand);
                        } else {
                            existingCommands.forEach(existingCommand => {
                                const differences = findSlashChanges(slashCommand, existingCommand);
                                if (differences !== null) {
                                    commandsToUpdate.push([existingCommand, slashCommand, differences]);
                                }
                            });
                        }
                    }

                    if (commandsToUpdate.length > 0) {
                        // Resolve the commands to update with the changes valid in the .edit({}) method
                        const resolvedCommandsToUpdate = commandsToUpdate.map(([existingCommand, newCommand, differences]) => {
                            const commandChanges: { [key: string]: any } = {};
                            const newCommandJSON = newCommand.toJSON();
                            Object.keys(differences).forEach((key) => {
                                commandChanges[key] = (newCommandJSON as any)[key];
                            });
                            return [existingCommand, commandChanges];
                        });

                        // Update the commands with the changes
                        // Global and local commands are already loaded in, edit operation is the same
                        const commandType = enableGlobalSlashCommands ? 'global' : 'server-specific';
                        const updatePromises = resolvedCommandsToUpdate.map(([existingCommand, commandChanges]) => {
                            existingCommand.edit(commandChanges).catch(
                                (error: unknown) => {
                                    console.error(`[CommandLoader] Failed to edit ${commandType} commands: ${error}`);
                                }
                            );
                        });
                        await Promise.all(updatePromises);
                        // Let the user know. 
                        console.log(`[CommandLoader] Updated ${commandsToUpdate.length} ${commandType} slash commands.`);
                    } else {
                        console.log('[CommandLoader] No changes detected in slash commands. No updates performed.');
                    }
                    if (commandsToAdd.length > 0) {
                        const slashCommandsArray = commandsToAdd.map((command) => command.toJSON());

                        if (enableGlobalSlashCommands) {

                            // Add the new slash commands to the application globally.
                            try {
                                await clientInstance.application.commands.set(slashCommandsArray);
                                console.log(`[CommandLoader] Added ${slashCommandsArray.length} global slash commands.`);
                            } catch (error) {
                                console.error(`[CommandLoader] Failed to set global commands: ${error}`);
                            }
                        } else {
                            await Promise.all(clientInstance.guilds.cache.map(guildInstance =>
                                guildInstance.commands.set(slashCommandsArray).catch(error => {
                                    console.error(`[CommandLoader] Failed to set commands for guild ${guildInstance.id}: ${error}`);
                                })
                            ));
                            console.log(`[CommandLoader] Added ${slashCommandsArray.length} server-specific slash commands.`);
                        }
                    } else {
                        console.log('[CommandLoader] No new slash commands detected.');
                    }
                } catch (error) {
                    console.error(`[CommandLoader] Error registering slash commands: ${error}`);
                }
            } else {
                console.error('[CommandLoader] Client application is unavailable.');
            }
        });

        // Register commands for newly joined guilds
        clientInstance.on('guildCreate', async (guildInstance) => {
            if (!enableGlobalSlashCommands) {
                try {
                    await guildInstance.commands.set(Array.from(slashCommandsMap.values()).map((command) => command.toJSON()));
                } catch (error) {
                    console.error(`[CommandLoader] Error setting commands for guild ${guildInstance.id}: ${error}`);
                }
            }
        });

        console.log(`[CommandLoader] Successfully loaded ${clientInstance.commands.size} text commands.`);
    } catch (error) {
        console.error(`[CommandLoader] Error loading commands: ${error}`);
    }
}