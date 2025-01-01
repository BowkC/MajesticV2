import { CommandInteraction, EmbedBuilder, Message } from 'discord.js';
import { applyEmbedStructure } from '../../handlers/helperFunctions';
import { getConfig } from '../../config';
import { CustomClient } from '../../index';

module.exports = {
    name: "info",
    usage: "info",
    description: "Displays bot information and statistics",
    cooldown: 2,
    aliases: ["botstats", "botinfo"],
    execute: async (client: CustomClient, interaction: Message | CommandInteraction, prefix: string) => {
        const latency = Math.round(Date.now() - interaction.createdTimestamp);
        const config = getConfig();
        async function infoEmbed(cpuUsage: string) {
            const embed = new EmbedBuilder()
                .setAuthor({ name: `Bot Statistics`, iconURL: client.user?.avatarURL() || '' })
                .addFields({ name: 'Prefix', value: `\`${prefix}\`` },
                    // { name: 'Client Owner', value: `\`${(await findUser(message, client, config.ownerId)).tag}\``, inline: true },
                    { name: 'Guild Count', value: `\`${client.guilds.cache.size}\``, inline: true },
                    { name: 'User Count', value: `\`${client.guilds.cache.map((g: { memberCount: number; }) => g.memberCount || 0).reduce((x: number, y: number) => x + y, 0)}\``, inline: true },
                    { name: 'API Ping', value: `\`${Math.round(client.ws.ping)}ms\``, inline: true }, 
                    { name: 'Client Latency', value: `\`${latency}ms\``, inline: true },
                    { name: 'Memory Usage', value: `\`${(process.memoryUsage().rss / 1024 / 1024).toFixed(2)}MB\``, inline: true },
                    { name: 'CPU Usage', value: `\`${cpuUsage || "Calculating.."}\``, inline: true })
            return applyEmbedStructure(embed, prefix);
        }

        const message = await interaction.reply({ allowedMentions: { repliedUser: false }, embeds: [await infoEmbed("")] })
        const previousDate = Date.now()
        const previousUsage = process.cpuUsage()
        setTimeout(async () => {
            const usage = process.cpuUsage(previousUsage)
            const resul = 100 * (usage.user + usage.system) / ((Date.now() - previousDate) * 1000)
            message.edit({
                allowedMentions: { repliedUser: false },
                embeds: [await infoEmbed(`${resul.toFixed(5)}%`)]
            })
        }, 5000)
    }
}