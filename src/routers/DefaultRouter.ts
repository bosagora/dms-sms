import { Config, ISMSItemConfig } from "../common/Config";
import { logger } from "../common/Logger";
import { Metrics } from "../metrics/Metrics";
import { WebService } from "../service/WebService";

import { body, validationResult } from "express-validator";
import { PhoneNumberFormat, PhoneNumberUtil } from "google-libphonenumber";

import express from "express";

import { SMSStorage } from "../storage/SMSStorage";

export class DefaultRouter {
    private _web_service: WebService;
    private readonly _config: Config;
    private readonly _metrics: Metrics;
    private readonly _storage: SMSStorage;

    constructor(service: WebService, config: Config, metrics: Metrics, storage: SMSStorage) {
        this._web_service = service;
        this._config = config;
        this._metrics = metrics;
        this._storage = storage;
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
        this.app.post("/send", [body("msg").exists(), body("receiver").exists()], this.send.bind(this));
        this.app.post(
            "/verification",
            [
                body("requestId")
                    .exists()
                    .trim()
                    .matches(/^(0x)[0-9a-f]{64}$/i),
                body("validatorIndex").exists().isNumeric(),
                body("code").exists().isNumeric(),
                body("receiver").exists(),
            ],
            this.verification.bind(this)
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
                const receiverPhone = phoneUtil.format(number, PhoneNumberFormat.NATIONAL).replace(/\-| /g, "");
                logger.http(`receiver: ${receiver} -> ${receiverPhone}`);
                if (region === "KR") {
                    await this._storage.sendSMS(receiverPhone, msg, region);
                    this._metrics.add("success", 1);
                    return res.status(200).json(this.makeResponseData(200, { code: "1", message: "saved" }, null));
                } else if (region === "PH") {
                    await this._storage.sendSMS(receiverPhone, msg, region);
                    this._metrics.add("success", 1);
                    return res.status(200).json(this.makeResponseData(200, { code: "1", message: "saved" }, null));
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

    /**
     * GET /metrics
     * @private
     */
    private async getMetrics(req: express.Request, res: express.Response) {
        res.set("Content-Type", this._metrics.contentType());
        this._metrics.add("status", 1);
        res.end(await this._metrics.metrics());
    }

    private async verification(req: express.Request, res: express.Response) {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json(
                this.makeResponseData(400, undefined, {
                    message: "Invalid parameters",
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

                const receiverPhone = phoneUtil.format(number, PhoneNumberFormat.NATIONAL).replace(/\-| /g, "");
                logger.http(`receiver: ${receiver} -> ${receiverPhone}`);
                const { requestId, validatorIndex, code } = req.body;
                if (validatorIndex === 1) {
                    await this._storage.postVerificationCode1(requestId, code, receiverPhone, region);
                } else if (validatorIndex === 2) {
                    await this._storage.postVerificationCode2(requestId, code, receiverPhone, region);
                } else if (validatorIndex === 3) {
                    await this._storage.postVerificationCode3(requestId, code, receiverPhone, region);
                }
                return res.status(200).json(this.makeResponseData(200, { requestId, validatorIndex }, null));
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
            logger.error(`POST /verification : ${error.message}`);
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
}
