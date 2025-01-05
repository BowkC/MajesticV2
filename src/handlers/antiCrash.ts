export default function antiCrash(client: any): void {
    process.on('unhandledRejection', async (error) => {
        console.error(`Unhandled promise rejection: ${error}`);
    });

    process.on('uncaughtException', async (error) => {
        console.error(`Uncaught exception: ${error.stack}`);
    });

    process.on('warning', async (warning) => {
        console.warn(`Warning: ${warning}`);
    });
}