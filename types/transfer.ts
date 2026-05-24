export type SenderState =
  | "idle"
  | "connecting"
  | "registered"
  | "session-created"
  | "waiting-receiver"
  | "peer-connecting"
  | "connected"
  | "completed"
  | "failed";

export type ReceiverState =
  | "idle"
  | "connecting"
  | "registered"
  | "joining"
  | "peer-connecting"
  | "connected"
  | "completed"
  | "failed";

export interface IceCandidatePayload {
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
}

export interface FileMetadata {
  fileName: string;
  fileSize: number;
  mimeType: string;
  totalChunks: number;
  chunkSize: number;
  sha256: string;
}

export interface MultiFileMetadata {
  files: FileMetadata[];
  totalFiles: number;
  totalTransferSize: number;
}

export type DataChannelControlMessage =
  | {
      type: "files-meta";
      payload: MultiFileMetadata;
    }
  | {
      type: "transfer-complete";
    };
