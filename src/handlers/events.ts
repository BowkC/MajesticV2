import fs from 'fs';
import colors from 'colors';
import path from 'path';
import { CustomClient } from '../index';
import { Events, RESTEvents } from 'discord.js';

const allEvents: string[] = [];

/**
 * Load a single directory of events (of which there are two)
 * @param dir the directory to load events from
 * @param client the client to bind the events to
 * @returns void
 */
const loadDir = (dir: string, client: CustomClient): void => {
    const dirPath = path.resolve(__dirname, `../events/${dir}`);

    if (!fs.existsSync(dirPath)) {
        console.warn(colors.yellow(`Directory not found: ${dirPath}`));
        return;
    }

    const eventFolders = fs.readdirSync(dirPath).filter((file) => file.endsWith(".js"));

    for (const file of eventFolders) {
        try {
            const event = require(`${dirPath}/${file}`);
            const eventName = file.split('.')[0];
            const eventLower = eventName.toLowerCase();
            allEvents.push(eventName);

            if (eventLower === 'commandcreate') {
                client.on('messageCreate', event.bind(null, client));
                client.on('interactionCreate', event.bind(null, client));
            } else if (Object.keys(RESTEvents).map((key) => key.toLowerCase()).includes(eventLower)) {
                client.rest.on(eventName, event.bind(null, client));
            } else if (Object.keys(Events).map((key) => key.toLowerCase()).includes(eventLower)) {
                client.on(eventName, event.bind(null, client));
            } else {
                console.warn(colors.yellow(`Unknown event: ${eventName}`));
            }
        } catch (error) {
            console.error(colors.red(`Events File Error First Try:: ${error}`));
        }
    }
};

/**
 * Load all events from the events directory
 */
export default async (client: CustomClient): Promise<void> => {
    try {
        let eventCount: number = 0;

        for (const dir of ['client', 'guild']) {
            const dirPath = path.resolve(__dirname, `../events/${dir}`);
            if (!fs.existsSync(dirPath)) {
                console.warn(colors.yellow(`Skipping missing directory: ${dirPath}`));
                continue;
            }

            loadDir(dir, client);
            eventCount += fs.readdirSync(dirPath).filter((file) => file.endsWith('.js')).length;
        }

        console.log(colors.green(`Successfully loaded ${eventCount} events`));
    } catch (error) {
        console.error(`Events File Error Final Try:: ${colors.bgRed(String(error))}`);
    }
};
