import { ChatInputCommandInteraction, EmbedBuilder, Message } from 'discord.js';
import { applyEmbedStructure, findUser } from '../../helpers/functions';
import { CustomClient } from '../../index';
import { Config } from '../../config';

module.exports = {
    name: "info",
    usage: "info",
    description: "Returns bot information and statistics",
    cooldown: 2,
    aliases: ["botstats", "botinfo"],
    execute: async (client: CustomClient, interaction: Message | ChatInputCommandInteraction, prefix: string, config: Config) => {
        // Define the variables to be used in the embed
        const guildCount = client.guilds.cache.size;
        const apiPing = Math.round(client.ws.ping);
        const latency = Math.abs(Math.round(Date.now() - interaction.createdTimestamp));
        const memoryUsage = (process.memoryUsage().rss / 1024 / 1024).toFixed(2);
        const userCount = client.guilds.cache.map((g: { memberCount: number; }) => g.memberCount || 0).reduce((x: number, y: number) => x + y, 0);
        const clientOwner = (await findUser(interaction, client, config.ownerId)).tag

        /**
         * A function to create an embed with the bot's statistics that can be modified in future. 
         * @param cpuUsage the CPU usage of the bot
         * @returns an embed with the bot's statistics
         */
        async function infoEmbed(cpuUsage: string) {
            const embed = new EmbedBuilder()
                .setAuthor({ name: `Bot Statistics`, iconURL: client.user?.avatarURL() || '' })
                .addFields({ name: 'Prefix', value: `\`${prefix}\`` },
                    { name: 'Client Owner', value: `\`${clientOwner}\``, inline: true },
                    { name: 'Guild Count', value: `\`${guildCount}\``, inline: true },
                    { name: 'User Count', value: `\`${userCount}\``, inline: true },
                    { name: 'API Ping', value: `\`${apiPing}ms\``, inline: true },
                    { name: 'Client Latency', value: `\`${latency}ms\``, inline: true },
                    { name: 'Memory Usage', value: `\`${memoryUsage}MB\``, inline: true },
                    { name: 'CPU Usage', value: `\`${cpuUsage || "Calculating.."}\``, inline: true })
            return applyEmbedStructure(embed, prefix);
        }

        // Send the initial message with the CPU usage as "Calculating.."
        const message = await interaction.reply({ allowedMentions: { repliedUser: false }, embeds: [await infoEmbed("")] })

        // Continue to calculate the CPU usage
        const previousDate = Date.now()
        const previousUsage = process.cpuUsage()

        // Then update the message with the CPU usage after a delay
        setTimeout(async () => {
            const usage = process.cpuUsage(previousUsage)
            const result = 100 * (usage.user + usage.system) / ((Date.now() - previousDate) * 1000)
            message.edit({
                allowedMentions: { repliedUser: false },
                embeds: [await infoEmbed(`${result.toFixed(5)}%`)]
            })
        }, 5000)
    }
}