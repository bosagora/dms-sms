import dotenv from "dotenv";
import { Config } from "./common/Config";
import { logger, Logger } from "./common/Logger";
import { DefaultServer } from "./DefaultServer";
import { Scheduler } from "./scheduler/Scheduler";
import { SMSScheduler } from "./scheduler/SMSScheduler";
import { SMSStorage } from "./storage/SMSStorage";
import { Utils } from "./utils/Utils";

dotenv.config({ path: "env/.env" });

let server: DefaultServer;

async function main() {
    const config = Config.createWithArgument();

    logger.transports.forEach((tp) => {
        tp.level = config.logging.level;
    });

    logger.info(`address: ${config.server.address}`);
    if (config.server.http.enable) {
        logger.info(`HTTP server: enabled on port ${config.server.http.port}`);
        if (config.server.https.enable) {
            logger.info(`  (for internal use)`);
        }
    }
    if (config.server.https.enable) {
        logger.info(`HTTPS server: enabled on port ${config.server.https.port}`);
    }

    await Utils.delay(1000);
    const storage = await SMSStorage.make(config.database);

    const schedulers: Scheduler[] = [];
    if (config.scheduler.enable) {
        const scheduler = config.scheduler.getScheduler("sms");
        if (scheduler && scheduler.enable) {
            schedulers.push(new SMSScheduler(scheduler.expression));
        }
    }

    server = new DefaultServer(config, storage, schedulers);
    return server.start().catch((error: any) => {
        switch (error.code) {
            case "EACCES":
                logger.error(`Port requires elevated privileges`);
                break;
            case "EADDRINUSE":
                logger.error(`Port is already in use`);
                break;
            default:
                logger.error(`An error occurred while starting the server: ${error.stack}`);
        }
        process.exit(1);
    });
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

process.on("SIGINT", () => {
    server.stop().then(() => {
        process.exit(0);
    });
});
