import * as dotenv from "dotenv";
dotenv.config({ path: "env/.env" });

import { HTTPClient } from "../../src/utils/HTTPClient";

import { AxiosResponse } from "axios";

import moment from "moment-timezone";
import URI from "urijs";

async function main() {
    const startDate = moment().add(-2, "day").tz("Asia/Seoul").format("YYYY-MM-DD");
    const endDate = moment().add(1, "day").tz("Asia/Seoul").format("YYYY-MM-DD");
    console.log(startDate);
    console.log(endDate);
    const url = URI("https://api.semaphore.co")
        .directory(`/api/v4/messages`)
        .addQuery("apikey", process.env.PH_SMS_APIKEY || "")
        .addQuery("page", 1)
        .addQuery("startDate", startDate)
        .addQuery("endDate", endDate)
        .toString();
    const client = new HTTPClient();
    client
        .get(url)
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
