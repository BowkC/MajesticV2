import { CommandInteraction, Message } from "discord.js";
import { CustomClient } from "../../index";

module.exports = async (client: CustomClient, interaction: Message | CommandInteraction) => {
    const prefix = interaction instanceof CommandInteraction ? "/" : ">"; // Bot's prefix
  
    const args = interaction instanceof CommandInteraction ? [] : interaction.content.split(" ");
    // Determine if it's a command or interaction
    const command = client.commands.get(
        interaction instanceof CommandInteraction ? interaction.commandName : args[0].slice(prefix.length)
    );
  
    if (!command) return;

    // Execute the command
    command.execute(client, args, interaction, prefix);
  };
  