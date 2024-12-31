import fs from 'fs';
import colors from 'colors';
import path from 'path';

const allEvents: string[] = [];

const loadDir = (dir: string, client: any): void => {

    const dirPath = path.resolve(__dirname, `../events/${dir}`);;

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
            } else if (
                eventLower !== 'apirequest' &&
                eventLower !== 'apiresponse' &&
                eventLower !== 'invalidrequestwarning' &&
                eventLower !== 'ratelimit'
            ) {
                client.on(eventName, event.bind(null, client));
            } else {
                client.rest.on(eventName, event.bind(null, client));
            }
        } catch (error) {
            console.error(colors.red(`Events File Error First Try:: ${error}`));
        }
    }
};

export default async (client: any): Promise<void> => {
    try {
        let eventCount = 0;

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
