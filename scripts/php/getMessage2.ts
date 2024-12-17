import * as dotenv from "dotenv";
dotenv.config({ path: "env/.env" });

import { HTTPClient } from "../../src/utils/HTTPClient";

async function main() {
    const client = new HTTPClient();
    const res = await client.get(
        "https://api.semaphore.co/api/v4/messages?apikey=API_KEY&page=1&startDate=2024-08-23&endDate=2024-09-10"
    );

    for (const item of res.data) {
        console.log(`${item.recipient}, ${item.created_at}`);
    }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
