import * as dotenv from "dotenv";
dotenv.config({ path: "env/.env" });

import { HTTPClient } from "../../src/utils/HTTPClient";

import { AxiosResponse } from "axios";

async function main() {
    const api_key = process.env.PH_SMS_APIKEY;
    const sendData = { apikey: api_key, number: "639998887777", message: "These messages", sendername: "ACCsoft" };
    const client = new HTTPClient();
    client
        .post("https://api.semaphore.co/api/v4/messages", sendData)
        .then((r: AxiosResponse) => {
            console.log(r.data);
        })
        .catch((e: any) => {
            console.error(e);
        });
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
