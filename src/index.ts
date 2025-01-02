import { Client, GatewayIntentBits, Partials, Collection } from 'discord.js';
import { Command } from './handlers/command'
import { Db as DbConnection } from 'mongodb';
import { clearCache } from './handlers/botCache';
import { logError } from './handlers/helperFunctions';
import { Config, initialiseConfig, getConfig } from './config.js';
import cron from 'node-cron';
import { promises as fs } from 'fs';
import { exec } from 'child_process';

// Extend Discord.js Client with Custom Properties
export class CustomClient extends Client {
  commands: Collection<string, Command>;
  aliases: Collection<string, string>;
  categories: string[];
  cooldowns: Collection<string, number>;

  constructor() {
    super({
      intents: [
        GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildEmojisAndStickers,
        GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.GuildMessageTyping,
        GatewayIntentBits.GuildInvites, GatewayIntentBits.GuildWebhooks,
        GatewayIntentBits.GuildIntegrations, GatewayIntentBits.GuildModeration,
        GatewayIntentBits.DirectMessages, GatewayIntentBits.DirectMessageReactions,
        GatewayIntentBits.DirectMessageTyping, GatewayIntentBits.MessageContent,
      ],
      allowedMentions: { parse: ['users', 'roles'] },
      partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.GuildMember],
    });

    this.commands = new Collection();
    this.aliases = new Collection();
    this.categories = [];
    this.cooldowns = new Collection();
  }
}

// Main Function
async function main() {
  await initialiseConfig();
  const config: Config = getConfig();

  const cNames = config.collectionNames;
  const db = config.db;

  const client = new CustomClient();

  // Load Handlers
  ["events", "command", "antiCrash"].forEach(async (handler) => {
    const module = await import(`./handlers/${handler}`);
    module.default(client);
  });

  // Schedule cron job
  // Handles DB backups and sends them to a key channel
  cron.schedule('59 23 * * *', async () => {
    clearCache();

    await backupCollections([cNames.BOT_GUILDS, cNames.BOT_USERS, cNames.BLACKLIST], db);

    exec("tar -czvf files.tar.gz ../src", async (error, stdout) => {
      if (error) {
        return logError(client, 'Error creating backup: \n' + error);
      }

      const channel = client.channels.cache.get(config.backupChannel);
      if (channel && channel.isTextBased() && channel.isSendable() && client.user) {
        await channel.send({
          content: `${client.user.tag} - Backup`,
          files: ["./files.tar.gz"],
        });
      }

      await removeFiles(['files.tar.gz', `${cNames.BOT_GUILDS}.json`, `${cNames.BOT_USERS}.json`, `${cNames.BLACKLIST}.json`]);
    });
  });

  // Post data to topGG [if applicable]
  if (config.topGG && client.user) {
    const topGGPost = await fetch(`https://top.gg/api/bots/${client.user.id}/stats`, {
      method: 'POST',
      body: JSON.stringify({
        server_count: client.guilds.cache.size
      })
    })

    if (topGGPost.status !== 200) {
      logError(client, 'Error posting to topGG: \n' + await topGGPost.json());
    }
  }

  // Log in
  await client.login(config.token);
}

// Backup collections
async function backupCollections(collectionNames: string[], db: DbConnection) {
  for (const name of collectionNames) {
    const data = JSON.stringify(await db.collection(name).find({}).toArray());
    await fs.writeFile(`${name}.json`, data);
  }
}

// Remove files
async function removeFiles(fileNames: string[]) {
  for (const fileName of fileNames) {
    await fs.unlink(fileName);
  }
}

// Run main
main().catch(console.error);