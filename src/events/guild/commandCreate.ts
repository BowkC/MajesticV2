import { CommandInteraction, CommandInteractionOptionResolver, Message } from "discord.js";
import { CustomClient } from "../../index";
import { errorEmbed } from "../../handlers/helperFunctions";

module.exports = async (client: CustomClient, interaction: Message | CommandInteraction) => {
    const prefix = interaction instanceof CommandInteraction ? "/" : "<"; // Bot's prefix

    const args = interaction instanceof CommandInteraction ? [] : interaction.content.split(" ");
    // Determine if it's a command or interaction
    const command = client.commands.get(
        interaction instanceof CommandInteraction ? (interaction.options as CommandInteractionOptionResolver).getSubcommand() : args[0].slice(prefix.length)
    );

    if (!command || (interaction instanceof Message && args[0].charAt(0) !== prefix)) return;

    // Execute the command, use data extracting helpers to get the data 
    // from the interaction as a commonly shared object
    try {
        let optionData;
        if (interaction instanceof CommandInteraction && command.hasOwnProperty("slashExtract")) {
            optionData = command.slashExtract(interaction);
        } else if (command.hasOwnProperty("textExtract")) {
            optionData = command.textExtract(interaction);
        }
        command.execute(client, interaction, prefix, optionData);
    } catch (e) {
        console.log(e)
        interaction.reply({
            allowedMentions: { repliedUser: false },
            embeds: [errorEmbed("Unexpected Error", prefix)]
        });
    }
};
