import { IDatabaseConfig } from "../common/Config";
import { IProcessedSMSPHData, ISMSData, MessageStatus } from "../types";
import { Utils } from "../utils/Utils";
import { Storage } from "./Storage";

import MybatisMapper from "mybatis-mapper";

import path from "path";
import { logger } from "../common/Logger";

export class SMSStorage extends Storage {
    constructor(databaseConfig: IDatabaseConfig) {
        super(databaseConfig);
    }

    public async initialize() {
        await super.initialize();
        MybatisMapper.createMapper([path.resolve(Utils.getInitCWD(), "src/storage/mapper/table.xml")]);
        MybatisMapper.createMapper([path.resolve(Utils.getInitCWD(), "src/storage/mapper/sms.xml")]);
        await this.createTables();
    }

    public static async make(config: IDatabaseConfig): Promise<SMSStorage> {
        const storage = new SMSStorage(config);
        await storage.initialize();
        return storage;
    }

    public createTables(): Promise<any> {
        return this.queryForMapper("table", "create_table", {});
    }

    public async dropTestDB(): Promise<any> {
        await this.queryForMapper("table", "drop_table", {});
    }

    public async sendSMS(receiver: string, message: string, region: string) {
        try {
            const smsData: ISMSData = {
                receiver,
                message,
                region,
                status: MessageStatus.Started,
                messageId: "0",
            };
            await this.postSMS(smsData);
        } catch (error) {
            logger.error(`Failed to save: ${error}`);
        }
    }

    public postSMS(data: ISMSData): Promise<void> {
        return new Promise<void>(async (resolve, reject) => {
            this.queryForMapper("sms", "postSMS", {
                receiver: data.receiver,
                message: data.message,
                region: data.region,
                status: data.status,
                messageId: data.messageId,
            })
                .then(() => {
                    return resolve();
                })
                .catch((reason) => {
                    if (reason instanceof Error) return reject(reason);
                    return reject(new Error(reason));
                });
        });
    }

    public getSMSOnPending(limit: number): Promise<IProcessedSMSPHData[]> {
        return new Promise<IProcessedSMSPHData[]>(async (resolve, reject) => {
            this.queryForMapper("sms", "getSMSOnPending", { limit })
                .then((result) => {
                    return resolve(
                        result.rows.map((m) => {
                            return {
                                sequence: m.sequence.toString(),
                                receiver: m.receiver,
                                message: m.message,
                                region: m.region,
                                messageId: m.messageId,
                                status: m.status,
                            };
                        })
                    );
                })
                .catch((reason) => {
                    if (reason instanceof Error) return reject(reason);
                    return reject(new Error(reason));
                });
        });
    }

    public getSMSOnStarted(limit: number): Promise<IProcessedSMSPHData[]> {
        return new Promise<IProcessedSMSPHData[]>(async (resolve, reject) => {
            this.queryForMapper("sms", "getSMSOnStarted", { limit })
                .then((result) => {
                    return resolve(
                        result.rows.map((m) => {
                            return {
                                sequence: m.sequence.toString(),
                                receiver: m.receiver,
                                message: m.message,
                                region: m.region,
                                messageId: m.messageId,
                                status: m.status,
                            };
                        })
                    );
                })
                .catch((reason) => {
                    if (reason instanceof Error) return reject(reason);
                    return reject(new Error(reason));
                });
        });
    }

    public updateSMS(data: IProcessedSMSPHData): Promise<void> {
        return new Promise<void>(async (resolve, reject) => {
            this.queryForMapper("sms", "updateSMS", {
                sequence: data.sequence,
                status: data.status,
                messageId: data.messageId,
            })
                .then(() => {
                    return resolve();
                })
                .catch((reason) => {
                    if (reason instanceof Error) return reject(reason);
                    return reject(new Error(reason));
                });
        });
    }
}
