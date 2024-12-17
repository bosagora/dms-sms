import * as dotenv from "dotenv";
dotenv.config({ path: "env/.env" });

import { HTTPClient } from "../../src/utils/HTTPClient";

import { AxiosResponse } from "axios";
import URI from "urijs";

async function main() {
    const url = URI("https://api.semaphore.co/api/v4/messages")
        .filename("237590749")
        .addQuery("apikey", process.env.PH_SMS_APIKEY || "");

    console.log(url.toString());
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
