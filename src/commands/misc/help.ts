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
    errorEmbed,
    findCategory,
    findCommand
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
    textExtract: (messageInteraction: Message, client: CustomClient) => {
        const data = messageInteraction.content.split(" ").slice(1)[0];
        return {
            selectedCommand: findCommand(data, client),
            selectedCategory: findCategory(data),
        }
    },
    slashExtract: (commandInteraction: ChatInputCommandInteraction, client: CustomClient) => {
        const commandName = findCommand(commandInteraction.options.getString('command'), client);
        const categoryName = findCategory(commandInteraction.options.getString('category'));
        return {
            selectedCommand: commandName,
            selectedCategory: categoryName,
        }
    },
    execute: async (client: CustomClient, interaction: Message | ChatInputCommandInteraction, prefix: string, config: Config,
        optionData: {
            selectedCommand: any | null,
            selectedCategory: any | null
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
        const selectedCategory = optionData.selectedCategory;
        const selectedCommand = optionData.selectedCommand;

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
                    embeds: [errorEmbed(`The category "${selectedCategory.name}" does not exist or is hidden.`, prefix)],
                    ephemeral: true
                });
            }
        } else if (selectedCategory && selectedCategory.hidden) {
            await interaction.reply({
                embeds: [errorEmbed(`The category "${selectedCategory.name}" does not exist or is hidden.`, prefix)],
                ephemeral: true
            });
        } else if (selectedCommand) {
            // Display detailed help for the specific command
            const aliases = selectedCommand.aliases?.map((alias: any) => `\`${prefix}${alias}\``).join(", ") || "None";
            const cooldown = `${selectedCommand.cooldown ? `${selectedCommand.cooldown} second${selectedCommand.cooldown > 1 ? "s" : ""}` : "1 second"}`;

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
                        value: aliases,
                        inline: true
                    },
                    {
                        name: "Cooldown",
                        value: cooldown,
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