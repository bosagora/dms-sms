import { Config, ISMSItemConfig } from "../common/Config";
import { logger } from "../common/Logger";
import { Metrics } from "../metrics/Metrics";
import { WebService } from "../service/WebService";

import { body, validationResult } from "express-validator";
import { PhoneNumberFormat, PhoneNumberUtil } from "google-libphonenumber";

import express from "express";
import { HTTPClient } from "../utils/HTTPClient";

import { AxiosResponse } from "axios";

// tslint:disable-next-line:no-var-requires
const aligoapi = require("aligoapi");

interface ISMSResponse {
    code: string;
    message: string;
}

export class DefaultRouter {
    private _web_service: WebService;
    private readonly _config: Config;
    private readonly _metrics: Metrics;

    constructor(service: WebService, config: Config, metrics: Metrics) {
        this._web_service = service;
        this._config = config;
        this._metrics = metrics;
    }

    private get app(): express.Application {
        return this._web_service.app;
    }

    private makeResponseData(code: number, data: any, error?: any): any {
        return {
            code,
            data,
            error,
        };
    }

    public registerRoutes() {
        this.app.get("/", [], this.getHealthStatus.bind(this));
        this.app.post(
            "/send",
            [body("msg").exists(), body("receiver").exists()],
            this.send.bind(this)
        );
        this.app.get("/metrics", [], this.getMetrics.bind(this));
    }

    private async getHealthStatus(req: express.Request, res: express.Response) {
        return res.status(200).json("OK");
    }

    private async send(req: express.Request, res: express.Response) {
        logger.http(`POST /send ${req.ip}:${JSON.stringify(req.body)}`);

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(200).json(
                this.makeResponseData(501, undefined, {
                    message: "Failed to check the validity of parameters.",
                    validation: errors.array(),
                })
            );
        }
        try {
            const accessKey = req.get("Authorization");
            if (accessKey !== this._config.setting.accessKey) {
                return res.json(
                    this.makeResponseData(400, undefined, {
                        message: "The access key entered is not valid.",
                    })
                );
            }

            const msg: string = String(req.body.msg).trim();
            const receiver: string = String(req.body.receiver).trim();
            const phoneUtil = PhoneNumberUtil.getInstance();
            const number = phoneUtil.parseAndKeepRawInput(receiver, "ZZ");
            if (phoneUtil.isValidNumber(number)) {
                const region = phoneUtil.getRegionCodeForNumber(number);
                if (region === undefined) {
                    logger.error(`This is an unsupported country: ${receiver}`);
                    this._metrics.add("failure", 1);
                    return res.status(200).json(
                        this.makeResponseData(500, undefined, {
                            message: "This is an unsupported country",
                        })
                    );
                }
                const rpcInfo = this._config.sms.items.get(region);
                if (rpcInfo === undefined) {
                    logger.error(`This is an unsupported country: ${receiver}`);
                    this._metrics.add("failure", 1);
                    return res.status(200).json(
                        this.makeResponseData(500, undefined, {
                            message: "This is an unsupported country",
                        })
                    );
                }

                let smsResponse;
                const receiverPhone = phoneUtil.format(number, PhoneNumberFormat.NATIONAL).replace(/\-| /g, "");
                logger.http(`receiver: ${receiver} -> ${receiverPhone}`);
                if (region === "KR") {
                    smsResponse = await this.sendSMSKR(msg, receiverPhone, rpcInfo);
                    this._metrics.add("success", 1);
                    return res.status(200).json(this.makeResponseData(200, smsResponse, null));
                } else if (region === "PH") {
                    smsResponse = await this.sendSMSPH(msg, receiverPhone, rpcInfo);
                    this._metrics.add("success", 1);
                    return res.status(200).json(this.makeResponseData(200, smsResponse, null));
                } else {
                    logger.error(`This is an unsupported country: ${receiver} -> ${receiverPhone}`);
                    this._metrics.add("failure", 1);
                    return res.status(200).json(
                        this.makeResponseData(500, undefined, {
                            message: "This is an unsupported country",
                        })
                    );
                }
            } else {
                logger.error(`Invalid phone number format: ${receiver}`);
                this._metrics.add("failure", 1);
                return res.status(200).json(
                    this.makeResponseData(500, undefined, {
                        message: "Invalid phone number format",
                    })
                );
            }
        } catch (error: any) {
            logger.error(`POST /send : ${error.message}`);
            this._metrics.add("failure", 1);
            return res.status(200).json(
                this.makeResponseData(500, undefined, {
                    message: error.message,
                })
            );
        } finally {
            ///
        }
    }

    private sendSMSKR(msg: string, receiver: string, config: ISMSItemConfig): Promise<ISMSResponse> {
        logger.http(`sendSMSKR`);
        const AuthData = {
            key: config.apikey,
            user_id: config.userid,
        };
        const req = {
            headers: { "content-type": "application/json" },
            body: {
                msg,
                sender: config.sender,
                receiver,
                testmode_yn: "N",
            },
        };
        return new Promise<ISMSResponse>((resolve, reject) => {
            aligoapi
                .send(req, AuthData)
                .then((r: any) => {
                    resolve({ code: r.result_code, message: r.message });
                })
                .catch((e: any) => {
                    reject(e);
                });
        });
    }

    private sendSMSPH(msg: string, receiver: string, config: ISMSItemConfig): Promise<ISMSResponse> {
        logger.http(`sendSMSPH`);
        return new Promise<ISMSResponse>((resolve, reject) => {
            const sendData = {apikey: config.apikey, number: receiver, message: msg, sendername: config.sender};
            logger.info("sent data: ", sendData);
            const client = new HTTPClient();
            client.post(config.endpoint, sendData)
                .then((r: AxiosResponse) => {
                    if (Array.isArray(r.data) && r.data.length > 0) {
                        if (r.data[0].status !== "Failed") {
                            resolve({ code: "1", message: "success" });
                        } else {
                            resolve({ code: "-1", message: "failed" });
                        }
                    } else {
                        resolve({ code: "-1", message: "failed" });
                    }
                })
                .catch((e: any) => {
                    reject(e);
                });
        });
    }

    /**
     * GET /metrics
     * @private
     */
    private async getMetrics(req: express.Request, res: express.Response) {
        res.set("Content-Type", this._metrics.contentType());
        this._metrics.add("status", 1);
        res.end(await this._metrics.metrics());
    }
}
