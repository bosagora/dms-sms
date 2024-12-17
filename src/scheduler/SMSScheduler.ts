import { Config, ISMSItemConfig } from "../common/Config";
import { logger } from "../common/Logger";
import { Metrics } from "../metrics/Metrics";
import { SMSStorage } from "../storage/SMSStorage";
import { IMessageStatus, IProcessedSMSPHData, ISMSData, MessageRegion, MessageStatus } from "../types";
import { Utils } from "../utils/Utils";
import { Scheduler } from "./Scheduler";

import { HTTPClient } from "../utils/HTTPClient";

import moment from "moment-timezone";
import URI from "urijs";

// tslint:disable-next-line:no-var-requires
const aligoapi = require("aligoapi");

export class SMSScheduler extends Scheduler {
    private _config: Config | undefined;
    private _storage: SMSStorage | undefined;
    private _metrics: Metrics | undefined;

    constructor(expression: string) {
        super(expression);
    }

    private get config(): Config {
        if (this._config !== undefined) return this._config;
        else {
            logger.error("Config is not ready yet.");
            process.exit(1);
        }
    }

    private get metrics(): Metrics {
        if (this._metrics !== undefined) return this._metrics;
        else {
            logger.error("Metrics is not ready yet.");
            process.exit(1);
        }
    }

    private get storage(): SMSStorage {
        if (this._storage !== undefined) return this._storage;
        else {
            logger.error("Storage is not ready yet.");
            process.exit(1);
        }
    }

    private get smsConfigPH(): ISMSItemConfig {
        const rpcInfo = this.config.sms.items.get("PH");
        if (rpcInfo !== undefined) return rpcInfo;
        else {
            logger.error("SMS Config is not ready yet.");
            process.exit(1);
        }
    }

    private get smsConfigKR(): ISMSItemConfig {
        const rpcInfo = this.config.sms.items.get("KR");
        if (rpcInfo !== undefined) return rpcInfo;
        else {
            logger.error("SMS Config is not ready yet.");
            process.exit(1);
        }
    }

    public setOption(options: any) {
        if (options) {
            if (options.config && options.config instanceof Config) this._config = options.config;
            if (options.storage && options.storage instanceof SMSStorage) this._storage = options.storage;
            if (options.metrics && options.metrics instanceof Metrics) this._metrics = options.metrics;
        }
    }

    public async onStart() {
        //
    }

    protected async work() {
        try {
            await this.onSendMessages();
            await this.onWatchSMS();
        } catch (error) {
            logger.error(`Failed to execute the SMSScheduler: ${error}`);
        }
    }

    private async onSendMessages() {
        const list = await this.storage.getSMSOnStarted(2);
        for (const item of list) {
            if (item.region === MessageRegion.Philippines) {
                const response = await this.sendSMSPH(item);
                if (response !== undefined) {
                    item.status = response.status;
                    item.messageId = response.messageId;
                    await this.storage.updateSMS(item);

                    logger.info(
                        `SMSPHScheduler.onSendMessages - ${item.receiver}, ${item.message}, ${item.messageId}, ${item.status}`
                    );
                }
            } else if (item.region === MessageRegion.Korean) {
                const response = await this.sendSMSKR(item);
                if (response !== undefined) {
                    item.status = response.status;
                    item.messageId = response.messageId;
                    await this.storage.updateSMS(item);

                    logger.info(
                        `SMSPHScheduler.onSendMessages - ${item.receiver}, ${item.message}, ${item.messageId}, ${item.status}`
                    );
                }
            }
        }
    }

    private async onWatchSMS() {
        const list = await this.storage.getSMSOnPending(2);
        if (list.length < 10) {
            for (const item of list) {
                const messageStatus = await this.checkMessageStatus(item);
                if (messageStatus.status === MessageStatus.Failed || messageStatus.status === MessageStatus.Refunded) {
                    try {
                        this.metrics.add("failure", 1);
                        logger.info(
                            `Fail - ${item.receiver}, ${item.message}, ${messageStatus.messageId}, ${messageStatus.status}`
                        );
                        item.status = MessageStatus.Retry;
                        await this.storage.updateSMS(item);

                        const smsData: ISMSData = {
                            receiver: item.receiver,
                            message: item.message,
                            region: item.region,
                            status: MessageStatus.Started,
                            messageId: "0",
                        };
                        await this.storage.postSMS(smsData);
                    } catch (e) {
                        //
                    }
                } else if (messageStatus.status === MessageStatus.Queued) {
                    item.status = messageStatus.status;
                    await this.storage.updateSMS(item);
                } else if (messageStatus.status === MessageStatus.Pending) {
                    item.status = messageStatus.status;
                    await this.storage.updateSMS(item);
                } else if (messageStatus.status === MessageStatus.Sent) {
                    this.metrics.add("success", 1);
                    logger.info(
                        `Success - ${item.receiver}, ${item.message}, ${messageStatus.messageId}, ${messageStatus.status}`
                    );
                    item.status = messageStatus.status;
                    await this.storage.updateSMS(item);
                }
            }
        } else {
            const statuses = await this.getMessageStatusOnToday();
            for (const item of list) {
                const messageStatus = statuses.find((m) => m.messageId === item.messageId);
                if (messageStatus === undefined) continue;
                if (messageStatus.status === MessageStatus.Failed || messageStatus.status === MessageStatus.Refunded) {
                    try {
                        item.status = MessageStatus.Retry;
                        await this.storage.updateSMS(item);

                        const smsData: ISMSData = {
                            receiver: item.receiver,
                            message: item.message,
                            region: item.region,
                            status: MessageStatus.Started,
                            messageId: "0",
                        };
                        await this.storage.postSMS(smsData);
                    } catch (e) {
                        //
                    }
                } else if (messageStatus.status === MessageStatus.Queued) {
                    item.status = messageStatus.status;
                    await this.storage.updateSMS(item);
                } else if (messageStatus.status === MessageStatus.Pending) {
                    item.status = messageStatus.status;
                    await this.storage.updateSMS(item);
                } else if (messageStatus.status === MessageStatus.Sent) {
                    item.status = messageStatus.status;
                    await this.storage.updateSMS(item);
                }
            }
        }
    }

    private async checkMessageStatus(message: IProcessedSMSPHData): Promise<IMessageStatus> {
        try {
            const url = URI(this.smsConfigPH.endpoint)
                .filename(message.messageId)
                .addQuery("apikey", this.smsConfigPH.apikey)
                .toString();
            const client = new HTTPClient();
            const res = await client.get(url);
            if (Array.isArray(res.data) && res.data.length > 0) {
                return {
                    messageId: message.messageId,
                    status: String(res.data[0].status).trim().toLowerCase(),
                };
            } else {
                return {
                    messageId: message.messageId,
                    status: MessageStatus.Failed,
                };
            }
        } catch (e) {
            return {
                messageId: message.messageId,
                status: MessageStatus.Pending,
            };
        }
    }

    private async getMessageStatusOnToday(): Promise<IMessageStatus[]> {
        const startDate = moment().tz("Asia/Manila").format("YYYY-MM-DD");
        const endDate = moment().add(1, "day").tz("Asia/Manila").format("YYYY-MM-DD");
        const statuses: IMessageStatus[] = [];
        let pageIndex: number = 1;
        const client = new HTTPClient();
        while (true) {
            try {
                const url = URI(this.smsConfigPH.endpoint)
                    .addQuery("apikey", this.smsConfigPH.apikey)
                    .addQuery("page", pageIndex)
                    .addQuery("limit", 1000)
                    .addQuery("startDate", startDate)
                    .addQuery("endDate", endDate)
                    .toString();

                const res = await client.get(url);
                if (Array.isArray(res.data) && res.data.length > 0) {
                    statuses.push(
                        ...res.data.map((m) => {
                            return {
                                messageId: String(res.data[0].message_id).trim(),
                                status: String(res.data[0].status).trim().toLowerCase(),
                            };
                        })
                    );
                } else {
                    break;
                }
            } catch (e) {
                break;
            }
            pageIndex++;
            await Utils.delay(1000);
        }
        return statuses;
    }

    private async sendSMSPH(message: IProcessedSMSPHData): Promise<ISMSData | undefined> {
        const sendData = {
            apikey: this.smsConfigPH.apikey,
            number: message.receiver,
            message: message.message,
            sendername: this.smsConfigPH.sender,
        };
        try {
            const client = new HTTPClient();
            const res = await client.post(this.smsConfigPH.endpoint, sendData);
            if (Array.isArray(res.data) && res.data.length > 0) {
                return {
                    receiver: message.receiver,
                    message: message.message,
                    region: message.region,
                    status: String(res.data[0].status).trim().toLowerCase(),
                    messageId: String(res.data[0].message_id).trim(),
                };
            } else {
                return undefined;
            }
        } catch (e) {
            return undefined;
        }
    }

    private async sendSMSKR(message: IProcessedSMSPHData): Promise<ISMSData | undefined> {
        try {
            const AuthData = {
                key: this.smsConfigKR.apikey,
                user_id: this.smsConfigKR.userid,
            };
            const req = {
                headers: { "content-type": "application/json" },
                body: {
                    msg: message.message,
                    sender: this.smsConfigKR.sender,
                    receiver: message.receiver,
                    testmode_yn: "N",
                },
            };
            const res = await aligoapi.send(req, AuthData);
            return {
                receiver: message.receiver,
                message: message.message,
                region: message.region,
                status: MessageStatus.Sent,
                messageId: String(res.msg_id).trim(),
            };
        } catch (e) {
            return undefined;
        }
    }
}
