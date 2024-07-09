import { ArgumentParser } from "argparse";
import extend from "extend";
import fs from "fs";
import ip from "ip";
import path from "path";
import { readYamlEnvSync } from "yaml-env-defaults";
import { Utils } from "../utils/Utils";

/**
 * Main config
 */
export class Config implements IConfig {
    public server: ServerConfig;
    public logging: LoggingConfig;
    public setting: Setting;
    public sms: SMSConfig;

    constructor() {
        this.server = new ServerConfig();
        this.logging = new LoggingConfig();
        this.setting = new Setting();
        this.sms = new SMSConfig();
    }

    public static createWithArgument(): Config {
        // Parse the arguments
        const parser = new ArgumentParser();
        parser.add_argument("-c", "--config", {
            default: "config.yaml",
            help: "Path to the config file to use",
        });
        const args = parser.parse_args();

        let configPath = path.resolve(Utils.getInitCWD(), args.config);
        if (!fs.existsSync(configPath)) configPath = path.resolve(Utils.getInitCWD(), "config", "config.yaml");
        if (!fs.existsSync(configPath)) {
            console.error(`Config file '${configPath}' does not exists`);
            process.exit(1);
        }

        const cfg = new Config();
        try {
            cfg.readFromFile(configPath);
        } catch (error: any) {
            console.error(error.message);
            process.exit(1);
        }
        return cfg;
    }

    public readFromFile(config_file: string) {
        const cfg = readYamlEnvSync([path.resolve(Utils.getInitCWD(), config_file)], (key) => {
            return (process.env || {})[key];
        });
        this.server.readFromObject(cfg.server);
        this.logging.readFromObject(cfg.logging);
        this.setting.readFromObject(cfg.setting);
        this.sms.readFromObject(cfg.sms);
    }
}

export class ServerConfig implements IServerConfig {
    public address: string;
    public port: number;

    constructor(address?: string, port?: number) {
        const conf = extend(true, {}, ServerConfig.defaultValue());
        extend(true, conf, { address, port });

        if (!ip.isV4Format(conf.address) && !ip.isV6Format(conf.address)) {
            console.error(`${conf.address}' is not appropriate to use as an IP address.`);
            process.exit(1);
        }

        this.address = conf.address;
        this.port = conf.port;
    }

    public static defaultValue(): IServerConfig {
        return {
            address: "127.0.0.1",
            port: 3300,
        };
    }

    public readFromObject(config: IServerConfig) {
        const conf = extend(true, {}, ServerConfig.defaultValue());
        extend(true, conf, config);

        if (!ip.isV4Format(conf.address) && !ip.isV6Format(conf.address)) {
            console.error(`${conf.address}' is not appropriate to use as an IP address.`);
            process.exit(1);
        }
        this.address = conf.address;
        this.port = conf.port;
    }
}

export class LoggingConfig implements ILoggingConfig {
    public level: string;

    constructor() {
        const defaults = LoggingConfig.defaultValue();
        this.level = defaults.level;
    }

    public static defaultValue(): ILoggingConfig {
        return {
            level: "info",
        };
    }

    public readFromObject(config: ILoggingConfig) {
        if (config.level) this.level = config.level;
    }
}

export interface ISetting {
    accessKey: string;
}

export class Setting implements ISetting {
    public accessKey: string;

    constructor() {
        const defaults = Setting.defaultValue();
        this.accessKey = defaults.accessKey;
    }

    public readFromObject(config: ISetting) {
        if (config.accessKey !== undefined) this.accessKey = config.accessKey;
    }

    public static defaultValue(): ISetting {
        return {
            accessKey: "",
        } as unknown as ISetting;
    }
}

export class SMSConfig implements ISMSConfig {
    public items: Map<string, ISMSItemConfig>;

    constructor() {
        this.items = new Map<string, ISMSItemConfig>();
    }

    public readFromObject(config: IRAWSMSConfig) {
        this.items.clear();
        if (config === undefined) return;
        if (config.items !== undefined) {
            for (const elem of config.items) {
                if (elem.code !== undefined && elem.endpoint !== undefined &&elem.apikey !== undefined &&elem.userid !== undefined) {
                    const item: ISMSItemConfig = {
                        code: elem.code,
                        endpoint: elem.endpoint,
                        apikey: elem.apikey,
                        userid: elem.userid,
                    };
                    this.items.set(item.code, item);
                }
            }
        }
    }
}

export interface IConfig {
    server: IServerConfig;
    logging: ILoggingConfig;
    setting: ISetting;
    sms: ISMSConfig;
}

export interface IServerConfig {
    address: string;
    port: number;
}

export interface ILoggingConfig {
    level: string;
}

export interface ISMSConfig {
    items: Map<string, ISMSItemConfig>;
}

export interface IRAWSMSConfig {
    items: ISMSItemConfig[];
}

export interface ISMSItemConfig {
    code: string;
    endpoint: string;
    apikey: string;
    userid: string;
}
