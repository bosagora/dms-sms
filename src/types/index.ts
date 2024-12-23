export interface ISMSData {
    receiver: string;
    message: string;
    region: string;
    priority: number;
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

export interface IVerification {
    requestId: string;
    receiver: string;
    region: string;
    code1: string;
    code2: string;
    code3: string;
    status: string;
}
