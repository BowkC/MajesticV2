import { Db as DbConnection, ObjectId } from 'mongodb';

let guildCache = new Map();

// Resets the cache entirely
export function clearCache() {
    guildCache = new Map();
}

/**
 * Removes a specific guild from the cache
 * @param guild the guild to remove from the cache
 */
export function removeCache(guild: string) {
    guildCache.delete(guild)
}

/**
 * @param guild fetches the cache for a specific guild
 * @param db the database connection
 * @returns the cache for the guild
 */
export async function getCache(guild: string, db: DbConnection) {
    if (guildCache.has(guild)) {
        return guildCache.get(guild)
    } else {
        let data = await db.collection('botGuilds').findOne({ _id: new ObjectId(guild) });
        if (data !== null) data = data.data
        guildCache.set(guild, data);
        return data
    }
}

/**
 * @param guild the guild to refresh the cache for
 * @param db the database connection
 */
export async function updateCache(guild: string, db: DbConnection) {
    const collection = await db.collection('botGuilds');
    if (collection !== null) {
        const collectionData = await collection.findOne({ _id: new ObjectId(guild) });
        if (collectionData != null) {
            guildCache.set(guild, collectionData.data);
        }
    }
}