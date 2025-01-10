import {
    ChatInputCommandInteraction,
    EmbedBuilder,
    Message
} from 'discord.js';

import {
    applyEmbedStructure,
    handlePagination,
    generateBotInvite,
    interactionUser,
    errorEmbed
} from '../../helpers/functions';
import { CustomClient } from '../../index';
import { Config } from '../../config';

module.exports = {
    name: "help",
    aliases: ["h", "halp"],
    cooldown: 2,
    usage: "help [category|command]",
    description: "Help for all commands, or for one specific command",
    options: [
        {
            string: {
                name: "category",
                description: "The category to view commands for",
                required: false
            }
        },
        {
            string: {
                name: "command",
                description: "The command to view help for",
                required: false
            }
        }
    ],
    textExtract: (messageInteraction: Message) => {
        const data = messageInteraction.content.split(" ").slice(1)[0];
        return {
            commandName: data || null,
            categoryName: data || null,
        }
    },
    slashExtract: (commandInteraction: ChatInputCommandInteraction) => {
        return {
            commandName: commandInteraction.options.getString('command'),
            categoryName: commandInteraction.options.getString('category'),
        }
    },
    execute: async (client: CustomClient, interaction: Message | ChatInputCommandInteraction, prefix: string, config: Config,
        optionData: {
            commandName: string | null,
            categoryName: string | null
        }) => {

        const ourUser = interactionUser(interaction);
        const commands = (category: String) => {
            return client.commands.filter((command) => command.category === category).map((command) => `${prefix}${command.name}`);
        }

        // Define the fields present on all embeds.
        const moreHelpField = {
            name: 'Need more help?',
            value: `\`${prefix}help <command>\`\nFor detailed information and help on specific commands`
        }
        const linkField = {
            name: 'Links',
            value: `[Invite\](${generateBotInvite(interaction)}) | [Support\](${config.supportInvite}) | [Vote\](${config.topGGVote})
            [Donate\](${config.donation}) | [ToS\](${config.ToS}) | [Privacy\](${config.privacyPolicy})`,
            inline: true
        }

        // Initialise first embed and an array to store them all
        const embedDefinitions: { category: any, embed: EmbedBuilder }[] = [];

        // Dynamically generate the description for the help embed
        const categoryDescriptions = config.categoryDefinitions
            .filter(category => !category.hidden)
            .map(category => `\`${prefix}help ${category.name.toLowerCase()}\` - **${category.name}** commands`)
            .join('\n');

        const helpEmbed = new EmbedBuilder()
            .setAuthor({ name: 'Help - Module', iconURL: config.helpIcon })
            .setDescription(categoryDescriptions)
            .setThumbnail(config.helpIcon)
            .addFields(moreHelpField, linkField);

        applyEmbedStructure(helpEmbed, prefix, false);


        // Generate an embed for each category [As defined in config.ts]
        config.categoryDefinitions.forEach((category) => {
            if (!category.hidden) {
                const embed = new EmbedBuilder()
                    .setAuthor({ name: `Help - ${category.name} [${commands(category.name).length}]`, iconURL: config.helpIcon })
                    .setDescription(`\`\`\`python\n  \u0022${commands(category.name).join(", ")}\u0022\`\`\``)
                    .setThumbnail(category.icon)
                    .addFields(moreHelpField, linkField);

                applyEmbedStructure(embed, prefix, false);
                embedDefinitions.push({ category: category, embed: embed });
            }
        });

        // Check if a category or command is specified
        let selectedCategory = null;
        let selectedCommand = null;

        if (optionData.categoryName) {
            const categoryName = optionData.categoryName.toLowerCase();

            // Attempt to find the category by name or alias
            selectedCategory = config.categoryDefinitions.find(category =>
                category.name.toLowerCase() === categoryName ||
                (category.aliases && category.aliases.some(alias => alias.toLowerCase() === categoryName))
            );
        }
        if (optionData.commandName) {
            const commandName = optionData.commandName.toLowerCase();

            // Attempt to find the command by name or alias
            selectedCommand = client.commands.find(cmd =>
                cmd.name.toLowerCase() === commandName ||
                (cmd.aliases && cmd.aliases.some(alias => alias.toLowerCase() === commandName))
            );
        }

        if (selectedCategory && !selectedCategory.hidden) {
            // Filter the embeds to start with the selected category
            let targetEmbedIndex: number = embedDefinitions.findIndex(def => def.category === selectedCategory);
            if (targetEmbedIndex !== -1) {
                // Add in the help embed at the start of the array
                embedDefinitions.unshift({ category: null, embed: helpEmbed });
                targetEmbedIndex++;

                const pages = [
                    embedDefinitions[targetEmbedIndex].embed,
                    ...embedDefinitions.slice(targetEmbedIndex + 1).map(def => def.embed),
                    ...embedDefinitions.slice(0, targetEmbedIndex).map(def => def.embed)
                ];
                await handlePagination(interaction, ourUser.id, pages);
            } else {
                await interaction.reply({
                    embeds: [errorEmbed(`The category "${optionData.categoryName}" does not exist or is hidden.`, prefix)],
                    ephemeral: true
                });
            }
        } else if (selectedCommand) {
            // Display detailed help for the specific command
            const commandHelpEmbed = new EmbedBuilder()
                .setAuthor({
                    name: `Command Help - ${selectedCommand.name.charAt(0).toUpperCase() + selectedCommand.name.slice(1)}`,
                    iconURL: config.helpIcon
                })
                .addFields(
                    { name: "Category", value: `\`${selectedCommand.category || "Miscellaneous"}\``, inline: true },
                    { name: "Usage", value: `\`${prefix}${selectedCommand.usage || selectedCommand.name}\``, inline: true },
                    { name: "Description", value: selectedCommand.description || "No description provided.", inline: false },
                    {
                        name: "Aliases",
                        value: selectedCommand.aliases?.map(alias => `\`${prefix}${alias}\``).join(", ") || "None",
                        inline: true
                    },
                    {
                        name: "Cooldown",
                        value: `${selectedCommand.cooldown ? `${selectedCommand.cooldown} second${selectedCommand.cooldown > 1 ? "s" : ""}` : "1 second"}`,
                        inline: true
                    },
                    {
                        name: "Required Permissions",
                        value: `Bot: ${(selectedCommand.botPermissions || []).join(", ") || "None"}
                        Member: ${(selectedCommand.memberPermissions || []).join(", ") || "None"}`,
                        inline: false
                    },
                    linkField
                )
                .setThumbnail(config.helpIcon)
                .setFooter({
                    text: "Syntax: <> = required, [] = optional, | = OR",
                    iconURL: config.embedStructure.footerIcon
                })

            applyEmbedStructure(commandHelpEmbed, prefix, false);
            await interaction.reply({ embeds: [commandHelpEmbed] });
        } else {
            // Fallback to the main help embed if no valid category or command is provided
            const ourEmbeds = embedDefinitions.map(object => object.embed);
            ourEmbeds.unshift(helpEmbed);
            await handlePagination(interaction, ourUser.id, ourEmbeds);
        }
    }
}