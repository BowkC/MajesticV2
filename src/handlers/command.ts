import { Collection, CommandInteraction, Message, SlashCommandBuilder, SlashCommandOptionsOnlyBuilder } from 'discord.js';
import path from 'path';
import { promises as fsPromises } from 'fs';
import { CustomClient } from '../index';
import { getConfig } from '../config';
const { readdir, lstat } = fsPromises;

interface Command {
    name: string;
    usage: string;
    description: string;
    cooldown?: number;
    aliases?: string[];
    options?: Array<{ [optionType: keyof OptionBuilderMapping]: { name: string; description: string; required?: boolean } }>;
    textExtract?: (messageInteraction: Message) => object;
    slashExtract?: (commandInteraction: CommandInteraction) => object;
    execute: (clientInstance: CustomClient, interactionObject: Message | CommandInteraction, commandPrefix: string, optionData?: object) => void;
}

function buildSlashCommand(commandDetails: Command, categoryName: string): SlashCommandBuilder {
    const slashCommandBuilder = new SlashCommandBuilder()
        .setName(categoryName.toLowerCase())
        .setDescription(`${categoryName} commands`);

    // Add the individual command as a subcommand to the category
    slashCommandBuilder.addSubcommand((subcommandBuilder) => {
        subcommandBuilder.setName(commandDetails.name.toLowerCase())
            .setDescription(commandDetails.description);

        if (commandDetails.options) {
            for (const commandOption of commandDetails.options) {
                const [optionType, optionDetails] = Object.entries(commandOption)[0];
                const optionBuilder = optionBuilderMapping[optionType.toLowerCase()];
                if (optionBuilder) {
                    optionBuilder(subcommandBuilder as unknown as SlashCommandOptionsOnlyBuilder, optionDetails);
                } else {
                    console.warn(`Unknown option type "${optionType}" in command "${commandDetails.name}".`);
                }
            }
        }

        return subcommandBuilder;
    });

    return slashCommandBuilder;
}

export default async function loadCommands(customClientInstance: CustomClient) {
    try {
        const enableGlobalSlashCommands = getConfig().slashGlobal || false;

        const commandsDirectoryPath = path.resolve(__dirname, '../commands');
        const slashCommandsMap: Map<string, SlashCommandBuilder> = new Map();

        customClientInstance.commands = new Collection<string, Command>();
        customClientInstance.aliases = new Collection<string, string>();

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
                            console.warn(`Invalid command structure in file: ${commandFileName}`);
                            return;
                        }

                        customClientInstance.commands.set(commandDefinition.name, commandDefinition);
                        if (commandDefinition.aliases) {
                            commandDefinition.aliases.forEach((aliasName: string) =>
                                customClientInstance.aliases.set(aliasName, commandDefinition.name)
                            );
                        }

                        categoryCommands.push(commandDefinition);
                    } catch (error) {
                        console.error(`Error loading command from file "${commandFileName}": ${error}`);
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

        // Register slash commands when client is ready
        customClientInstance.on('ready', async () => {
            try {
                const slashCommandsArray = Array.from(slashCommandsMap.values()).map((cmd) => cmd.toJSON());
                if (enableGlobalSlashCommands && customClientInstance.application?.commands) {
                    await customClientInstance.application.commands.set(slashCommandsArray);
                    console.log(`Registered ${slashCommandsArray.length} global slash commands.`);
                } else {
                    customClientInstance.guilds.cache.forEach(async (guildInstance) => {
                        try {
                            await guildInstance.commands.set(slashCommandsArray);
                        } catch (error) {
                            console.error(`Error setting commands for guild ${guildInstance.id}: ${error}`);
                        }
                    });
                }
            } catch (error) {
                console.error(`Error registering global slash commands: ${error}`);
            }
        });

        // Register commands for newly joined guilds
        customClientInstance.on('guildCreate', async (guildInstance) => {
            if (!enableGlobalSlashCommands) {
                try {
                    await guildInstance.commands.set(Array.from(slashCommandsMap.values()).map((cmd) => cmd.toJSON()));
                } catch (error) {
                    console.error(`Error setting commands for guild ${guildInstance.id}: ${error}`);
                }
            }
        });

        console.log(`Successfully loaded ${customClientInstance.commands.size} text commands.`);
    } catch (error) {
        console.error(`Error loading commands: ${error}`);
    }
}

function validateCommandStructure(command: Command): boolean {
    return (
        typeof command.name === 'string' &&
        typeof command.description === 'string' &&
        (!command.options || Array.isArray(command.options)) &&
        typeof command.execute === 'function' &&
        (!command.textExtract || typeof command.textExtract === 'function') &&
        (!command.slashExtract || typeof command.slashExtract === 'function')
    );
}


interface OptionObject {
    name: string;
    description: string;
    required?: boolean;
}

interface OptionBuilderMapping {
    [optionType: string]: (commandBuilder: SlashCommandOptionsOnlyBuilder, optionDetails: OptionObject) => SlashCommandOptionsOnlyBuilder;
}

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

// Utility function streamlining logic for adding an option.
function addOption(
    method: (callback: (option: any) => any) => SlashCommandOptionsOnlyBuilder,
    details: OptionObject
): SlashCommandOptionsOnlyBuilder {
    return method((option) =>
        option
            .setName(details.name)
            .setDescription(details.description)
            .setRequired(details.required || false)
    );
}