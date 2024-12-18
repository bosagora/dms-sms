import dotenv from "dotenv";
dotenv.config({ path: "env/.env" });

import { Config } from "../src/common/Config";
import { TestClient, TestServer } from "./helper/Utility";

import { expect } from "chai";

import * as path from "path";
import { URL } from "url";
import { SMSStorage } from "../src/storage/SMSStorage";

// tslint:disable-next-line:no-var-requires
const URI = require("urijs");

describe("Test of Server", () => {
    let client: TestClient;
    let server: TestServer;
    let serverURL: URL;
    let config: Config;
    let storage: SMSStorage;

    before("Create Config", async () => {
        config = new Config();
        config.readFromFile(path.resolve(process.cwd(), "tests", "config.test.yaml"));
        client = new TestClient({
            headers: {
                Authorization: config.setting.accessKey,
            },
        });
    });

    before("Create TestServer", async () => {
        storage = await SMSStorage.make(config.database);
        serverURL = new URL(`http://127.0.0.1:${config.server.port}`);
        server = new TestServer(config, storage);
    });

    before("Start TestServer", async () => {
        await server.start();
    });

    after("Stop TestServer", async () => {
        await server.stop();
    });

    it("Send loyalty type", async () => {
        const contents: string[] = [];
        contents.push(`#1 Code: 00`);
        const uri = URI(serverURL).filename("send");
        const url = uri.toString();
        const response = await client.post(url, {
            msg: contents.join("\n"),
            sender: process.env.SMS_SENDER,
            receiver: process.env.SMS_RECEIVER,
        });
        console.log(response.data);

        expect(response.data.code).to.equal(200);
        expect(response.data.data.code).to.equal("1");
        expect(response.data.data.message).to.equal("saved");
    });
});
