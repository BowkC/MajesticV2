import { CommandInteraction, CommandInteractionOptionResolver, Message } from "discord.js";
import { errorEmbed, logError, escapeString } from "../../helpers/functions";
import { CustomClient } from "../../index";
import { getConfig } from "../../config";
import { getCache } from "../../handlers/botCache";
import { Command } from "../../handlers/command";

module.exports = async (client: CustomClient, interaction: Message | CommandInteraction) => {
    // If the interaction is not in a guild, return
    if (!interaction.guild || client.user === null) return;

    const config = getConfig();
    const guildData = await getCache(interaction.guild.id, config.db)

    let prefix: string;
    let commandName: string;
    let givenPrefix: string = "";

    if (interaction instanceof CommandInteraction) {
        // Slash command prefix
        prefix = "/";
        commandName = (interaction.options as CommandInteractionOptionResolver).getSubcommand();
    } else {
        // Bot's prefix [default or guild specific]
        prefix = guildData?.prefix || config.defaultPrefix;

        // Extract some key message data
        const content = interaction.content.split(" ")[0]
        commandName = content.slice(prefix.length);
        givenPrefix = content.slice(0, prefix.length).toLowerCase();
    }
    prefix = prefix.toLowerCase();
    commandName = commandName.toLowerCase();

    // Fetch the command and alias
    let command: Command | undefined = client.commands.get(commandName)
    const alias = client.aliases.get(commandName);

    // Check for aliases if not found
    if (alias && !command) command = client.commands.get(alias);

    // Return if command cannot be found or if the message does not start with the prefix
    const prefixRegex = new RegExp(`^(<@!?${client.user.id}>|${escapeString(prefix)})`);
    if (!command || !prefixRegex.test(prefix)) return;

    // Execute the command, use data extracting helpers to get the data 
    // from the interaction as a commonly shared object
    try {
        let optionData: object = {};

        // Below helpers allow unique data extraction slash and text command specific
        if (interaction instanceof CommandInteraction && command.hasOwnProperty("slashExtract")) {
            if (typeof command.slashExtract === "function") {
                optionData = command.slashExtract(interaction);
            }
        } else if (command.hasOwnProperty("textExtract")) {
            if (typeof command.textExtract === "function") {
                optionData = command.textExtract(interaction as Message);
            }
        }

        command.execute(client, interaction, prefix, config, optionData);
    } catch (e) {
        logError(client, e as Error);
        interaction.reply({
            allowedMentions: { repliedUser: false },
            embeds: [errorEmbed("Unexpected Error", prefix)]
        });
    }
};