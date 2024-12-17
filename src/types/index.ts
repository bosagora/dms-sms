export interface ISMSData {
    receiver: string;
    message: string;
    region: string;
    status: string;
    messageId: string;
}

export interface IProcessedSMSPHData extends ISMSData {
    sequence: string;
}

export enum MessageStatus {
    Started = "started",
    Queued = "queued",
    Pending = "pending",
    Sent = "sent",
    Failed = "failed",
    Refunded = "refunded",
    Retry = "retry",
}

export interface IMessageStatus {
    messageId: string;
    status: string;
}

export enum MessageRegion {
    Korean = "KR",
    Philippines = "PH",
}
