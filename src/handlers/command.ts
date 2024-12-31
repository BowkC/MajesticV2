import { Collection, CommandInteraction, Message, SlashCommandBuilder, SlashCommandOptionsOnlyBuilder } from 'discord.js';
import path from 'path';
import { readdirSync, lstatSync } from 'fs';
import { CustomClient } from '../index';
import { getConfig } from '../config';

interface Command {
    name: string;
    usage: string;
    description: string;
    cooldown?: number;
    aliases?: string[];
    options?: Array<{ [key: string]: { name: string; description: string; required?: boolean } }>;
    execute: (client: CustomClient, args: string[], interaction: Message | CommandInteraction) => void;
}

export default async function loadCommands(client: CustomClient) {
    try {
        const loadSlashGlobal = getConfig().slashGlobal || false;
        
        const commandsPath = path.resolve(__dirname, '../commands');
        const slashCommands: SlashCommandBuilder[] = [];

        client.commands = new Collection<string, Command>();
        client.aliases = new Collection<string, string>();

        const commandDirs = readdirSync(commandsPath);

        for (const dir of commandDirs) {
            const commandPath = `${commandsPath}/${dir}`;

            if (lstatSync(commandPath).isDirectory()) {
                const commandFiles = readdirSync(commandPath).filter((file) => file.endsWith('.js') || file.endsWith('.ts'));

                for (const file of commandFiles) {
                    try {
                        const { default: command } = await import(`${commandPath}/${file}`);
                        if (!validateCommand(command)) {
                            console.warn(`Invalid command structure in file: ${file}`);
                            continue;
                        }

                        client.commands.set(command.name, command);
                        if (command.aliases) {
                            command.aliases.forEach((alias: string) => client.aliases.set(alias, command.name));
                        }

                        const slashCommand = buildSlashCommand(command);
                        slashCommands.push(slashCommand);
                    } catch (error) {
                        console.error(`Error loading command from file "${file}": ${error}`);
                    }
                }
            }
        }

        client.on('ready', async () => {
            try {
                if (loadSlashGlobal && client.application?.commands) {
                    await client.application.commands.set(slashCommands.map((cmd) => cmd.toJSON()));
                    console.log(`Registered ${slashCommands.length} global slash commands.`);
                }
            } catch (error) {
                console.error(`Error registering global slash commands: ${error}`);
            }
        });

        client.on('guildCreate', async (guild) => {
            if (!loadSlashGlobal) {
                try {
                    await guild.commands.set(slashCommands.map((cmd) => cmd.toJSON()));
                } catch (error) {
                    console.error(`Error setting commands for guild ${guild.id}: ${error}`);
                }
            }
        });

        console.log(`Successfully loaded ${client.commands.size} text commands.`);
    } catch (error) {
        console.error(`Error loading commands: ${error}`);
    }
}

function validateCommand(command: Command): boolean {
    return typeof command.name === 'string' && typeof command.description === 'string' && (!command.options || Array.isArray(command.options));
}

function buildSlashCommand(command: Command): SlashCommandBuilder {
    const slashCommand = new SlashCommandBuilder().setName(command.name).setDescription(command.description);
    if (command.options) {
        for (const option of command.options) {
            const [type, optionObject] = Object.entries(option)[0];
            const optionBuilder = optionBuilderMapping[type.toLowerCase()];
            if (optionBuilder) {
                optionBuilder(slashCommand, optionObject);
            } else {
                console.warn(`Unknown option type "${type}" in command "${command.name}".`);
            }
        }
    }
    return slashCommand;
}

interface OptionObject {
    name: string;
    description: string;
    required?: boolean;
}

interface OptionBuilderMapping {
    [key: string]: (cmd: SlashCommandOptionsOnlyBuilder, opt: OptionObject) => SlashCommandOptionsOnlyBuilder;
}

const optionBuilderMapping: OptionBuilderMapping = {
    string: (cmd, opt) => cmd.addStringOption((o) => o.setName(opt.name).setDescription(opt.description).setRequired(opt.required || false)),
    integer: (cmd, opt) => cmd.addIntegerOption((o) => o.setName(opt.name).setDescription(opt.description).setRequired(opt.required || false)),
    boolean: (cmd, opt) => cmd.addBooleanOption((o) => o.setName(opt.name).setDescription(opt.description).setRequired(opt.required || false)),
    user: (cmd, opt) => cmd.addUserOption((o) => o.setName(opt.name).setDescription(opt.description).setRequired(opt.required || false)),
    channel: (cmd, opt) => cmd.addChannelOption((o) => o.setName(opt.name).setDescription(opt.description).setRequired(opt.required || false)),
    role: (cmd, opt) => cmd.addRoleOption((o) => o.setName(opt.name).setDescription(opt.description).setRequired(opt.required || false)),
    attachment: (cmd, opt) => cmd.addAttachmentOption((o) => o.setName(opt.name).setDescription(opt.description).setRequired(opt.required || false)),
};